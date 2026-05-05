# Build doc — architecture brief

The Build tab hosts a single Notion-style rich-text page per project.
The user types prose, drops in image and 3D-scene blocks, and the page
auto-saves to IndexedDB.

This is a present-tense map of the system as it is. It does not narrate
how we got here — `git log` covers that.

## Surface area

```
web/composables/useIdb/buildDocs.ts   IDB CRUD: getBuildDoc, putBuildDoc, updateBuildDoc, deleteBuildDoc
web/composables/useIdb/assets.ts      IDB CRUD: createAsset, putAsset, getAsset, getAssetsForProject
web/composables/useBuildDoc.ts        Reactive doc + debounced writer
web/composables/useDocAssets.ts       Asset upload + reactive object-URL helper

web/lib/editor/imageBlock.ts          Tiptap node extension — `<image-block data-asset-id …>`
web/lib/editor/sceneBlock.ts          Tiptap node extension — `<scene-block data-model-id … data-scene-id …>`

web/components/editor/BuildDocEditor.vue   Editor + sticky toolbar (the only formatting UI)
web/components/editor/ImageBlockView.vue   Vue node view for `<image-block>`
web/components/editor/SceneBlockView.vue   Vue node view for `<scene-block>` (mounts read-only ModelTab on demand)
web/components/editor/BlockDragHandle.vue  Hover-revealed drag handle shared by both embeds
web/components/editor/EmbedCaption.vue     Caption input shared by both embeds

web/components/project/tabs/InstructionsTab.vue   Page host: title input + BuildDocEditor

web/utils/buildDocRemap.ts            Walk doc HTML and remap asset / model / scene ids on import
web/utils/blobBase64.ts               Round-trip a Blob through a base64 string
```

## Storage

One Dexie table, primary-keyed by `projectId`:

```ts
interface IdbBuildDoc {
  projectId: string;
  title?: string; // optional — UI falls back to project name when absent
  html: string; // Tiptap-rendered HTML, including embed nodes
  updatedAt: string;
}
```

Image bytes live in a sibling table, keyed by `id` and indexed by
`projectId`:

```ts
interface IdbAsset {
  id: string;
  projectId: string;
  mimeType: string; // 'image/png' | 'image/jpeg' | 'image/webp'
  blob: Blob;
  createdAt: string;
}
```

`projects.deleteProject` cascades both tables in a single Dexie
transaction. The cascade is inline in `projects.ts` (not via an
asset-module helper) because it has to share the transaction.

## Editor

`BuildDocEditor.vue` mounts a Tiptap v3 editor with:

- **StarterKit** (headings 1–3 only; codeBlock / blockquote /
  horizontalRule disabled; Link configured via StarterKit's `link`
  option — do not add `@tiptap/extension-link` separately, it logs a
  duplicate-name warning).
- **Placeholder**.
- **`ImageBlock`** and **`SceneBlock`** — atom, draggable nodes whose
  attributes serialise to `data-*` and whose `addNodeView()` returns a
  Vue node-view renderer.

The editor exposes a single sticky toolbar (heading dropdown, B / I /
list / ordered-list / link, divider, image / scene insert buttons).
There are intentionally no per-block formatting toolbars and no edit /
read mode toggle — the page is always inline-editable.

The editor's external interface is a `v-model:modelValue` HTML string
plus a `blur` event. External writes (project switch, undo) flow through
the prop and are pushed into the editor with `emitUpdate: false` so the
host doesn't see its own writes echoed back.

## Embed nodes

Both embeds share the same shape:

- `atom: true`, `draggable: true`, `selectable: true`.
- Attributes serialise to `data-*` HTML attributes for storage; an empty
  caption is omitted entirely (so `data-caption=""` doesn't get written).
- The Vue node view wraps in `<NodeViewWrapper class="doc-embed
group/embed block …">`.
- `BlockDragHandle.vue` is a child with `data-drag-handle` —
  **required**: without it, the inner `contenteditable="false"` content
  swallows drags and drops never land on a valid block position.
- The selected state reads `NodeViewProps.selected` — Tiptap manages it
  via NodeSelection; the wrapper paints a teal ring when true.

`SceneBlockView` keeps a static thumbnail by default and only mounts a
read-only `<ModelTab>` (with `target-model-id` and `target-scene-id`
props) when the user clicks "View in 3D". This keeps Three.js inert
until the reader actually wants to interact with the scene.

## Auto-save model

`useBuildDoc()` is a module-level reactive composable shared across
every caller, mirroring `useScenes()` etc. It exposes:

```ts
{
  html: Ref<string>;
  title: Ref<string | undefined>;
  setHtml(html: string): void;        // debounced write to IDB
  setTitle(title: string): void;      // debounced write to IDB
  flush(): Promise<void>;             // force-commit any pending write
  reload(projectId: string): Promise<void>;  // re-read after import
}
```

A single 400ms trailing-debounce timer covers both fields. Both setters
update the in-memory ref synchronously and merge into one pending patch,
so a flurry of edits across both fields collapses into one IDB write.

Callers must call `flush()`:

- on the editor's `blur` (already wired in InstructionsTab).
- in `onBeforeUnmount` (already wired).
- before swapping projects (the watch on `activeId` does this internally).

The flush also runs implicitly when the project switches — see the
watcher in `useBuildDoc.ts`.

## Export / import

`useExportProject.ts` adds two things to the `.cutlist.gz` payload:

- `buildDoc?: IdbBuildDoc` (the whole record).
- `assets?: ExportedAsset[]` — each asset's `Blob` is base64-encoded
  with `blobToBase64`. The whole payload is gzipped, so base64
  inflation is paid only briefly on the wire.

`projectImport/index.ts` writes the import in this order so id maps are
ready when the doc is rewritten:

1. Project, models (each gets a fresh id; old → new in `modelIdMap`).
2. Assets (fresh ids; old → new in `assetIdMap`; `Blob` rebuilt via
   `base64ToBlob`).
3. Scenes (fresh ids; old → new in `sceneIdMap`; orphan scenes — those
   pointing at a model not in the payload — are skipped).
4. Build doc — `remapBuildDocHtml(html, { assetIdMap, modelIdMap,
sceneIdMap })` walks the HTML with `DOMParser` and rewrites
   `data-asset-id` / `data-model-id` / `data-scene-id` attributes.
   Orphan ids (no map entry) are blanked rather than dropped, so the
   embed renders its empty state.
5. Annotations (orphan `sceneId` entries skipped silently).

## Versioning

`SCHEMA_VERSION = 2` (in `web/utils/versions.ts`). Imports older than
`MIN_SUPPORTED_EXPORT_VERSION` (also 2) raise `LegacyExportError` —
distinct from `FutureSchemaError` so the UI can render different
messages.

The Dexie schema is on a single `version(1)` declaration. We have not
yet shipped a Dexie migration — when one is needed, append a new
`version(N).stores({...}).upgrade(...)` call; do not edit `version(1)`.

## Things to know about Tiptap v3 here

- StarterKit ships Link in v3. Do not import `@tiptap/extension-link`.
- `NodeViewWrapper` renders a `<div>` in the live DOM, not the
  `<image-block>` / `<scene-block>` element. The `<*-block>` tags only
  exist in serialised HTML. CSS that needs to apply both live and to
  rehydrated content unions both selectors:
  `.tiptap-doc :is(.doc-embed, image-block, scene-block)`.
- `NodeViewProps.selected` is the source of truth for the selection
  ring; don't hand-roll selection state.
- `editor.commands.setContent(value, { emitUpdate: false })` is the
  right way to push external writes without re-emitting `onUpdate`.

## Typography

Two font tokens, defined in `web/assets/css/main.css` `@theme`:

- `--font-mono`: JetBrains Mono — the app's UI font (loaded body-wide
  in `layouts/default.vue`). Used for headings, embed chrome, and all
  other UI.
- `--font-serif`: Source Serif 4 (loaded via `nuxt.config.ts` head
  link). Used only for paragraph / list body in the build doc — gives
  the page an editorial feel without leaking serif into the rest of
  the UI.

Embed blocks (`.doc-embed`) explicitly reset to `--font-mono` so
captions, picker dropdowns, and helper text don't pick up the serif
from the surrounding doc.
