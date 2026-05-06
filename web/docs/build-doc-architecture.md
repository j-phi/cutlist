# Build doc — architecture brief

The Build tab hosts a single Notion-style rich-text page per project.
The user types prose, drops in image and 3D-scene blocks, and the page
auto-saves to IndexedDB.

This is a present-tense map of the system as it is. It does not narrate
how we got here — `git log` covers that.

## Surface area

```
web/composables/useIdb/buildDocs.ts   IDB CRUD: getBuildDoc, putBuildDoc, deleteBuildDoc
web/composables/useIdb/assets.ts      IDB CRUD: createAsset, putAsset, getAsset, getAssetsForProject, deleteAssets
web/composables/useBuildDoc.ts        Reactive doc + debounced writer (module-scoped)
web/composables/useDocAssets.ts       Asset upload + reactive object-URL helper

web/lib/editor/imageBlock.ts          Tiptap node extension — `imageBlock`, attrs: { assetId, caption }
web/lib/editor/sceneBlock.ts          Tiptap node extension — `sceneBlock`, attrs: { modelId, sceneId, caption }

web/components/editor/BuildDocEditor.vue   Editor + sticky toolbar (the only formatting UI)
web/components/editor/ImageBlockView.vue   Vue node view for `imageBlock`
web/components/editor/SceneBlockView.vue   Vue node view for `sceneBlock`
web/components/editor/SceneViewer.vue      Inline 3D viewer used by the scene embed
web/components/editor/BlockDragHandle.vue  Hover-revealed drag handle shared by both embeds
web/components/editor/EmbedCaption.vue     Caption input shared by both embeds

web/components/project/tabs/InstructionsTab.vue   Page host: title input + BuildDocEditor

web/utils/buildDocRemap.ts            Walk doc JSON and remap asset / model / scene ids on import; collect referenced asset ids
web/utils/blobBase64.ts               Round-trip a Blob through a base64 string
```

## Storage

One Dexie table, primary-keyed by `projectId`:

```ts
interface IdbBuildDoc {
  projectId: string;
  title: string; // always-string; seeded from the project name
  doc: JSONContent; // Tiptap's native JSON tree
  updatedAt: string;
}
```

The body is stored as Tiptap's `JSONContent` rather than rendered HTML.
JSON is the editor's native shape, walks naturally for the import-time
id remap and for asset-GC ref discovery, and survives extension changes
better than HTML strings. Rendering for export to a public surface is
one `editor.getHTML()` call away — but storage is JSON.

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

Orphan assets (uploaded then deleted from the doc, or stranded by a
mid-upload project switch — see `BuildDocEditor.vue`'s upload guard)
are cleaned up on next project load. The `useBuildDoc` activeId
watcher fires a fire-and-forget sweep after the doc settles:
`getAssetsForProject(id)` minus `collectAssetIds(doc)` →
`deleteAssets(orphans)`. Failures are swallowed — the orphans just
stick around for a future load. The same `collectAssetIds` helper is
used at export time to filter out unreferenced assets from the
`.cutlist.gz` payload without mutating IDB.

## Editor

`BuildDocEditor.vue` mounts a Tiptap v3 editor with:

- **StarterKit** (headings 1–3 only; codeBlock / blockquote /
  horizontalRule disabled; Link configured via StarterKit's `link`
  option — do not add `@tiptap/extension-link` separately, it logs a
  duplicate-name warning).
- **Placeholder**.
- **`ImageBlock`** and **`SceneBlock`** — atom, draggable nodes whose
  attributes serialise to `data-*` for HTML round-tripping (Tiptap uses
  these for clipboard / paste flow), but whose stored shape is just the
  JSON node `attrs`.

The editor exposes a single sticky toolbar (heading dropdown, B / I /
list / ordered-list / link, divider, image / scene insert buttons).
There are intentionally no per-block formatting toolbars and no edit /
read mode toggle — the page is always inline-editable.

The editor's external interface is `v-model:modelValue` over a
`JSONContent` ref plus a `blur` event. External writes (project switch)
flow through the prop and are pushed into the editor with
`emitUpdate: false`. The editor tracks the last `JSONContent` reference
it emitted so prop changes that originated inside the editor (host
echoed them back) don't trigger a redundant `setContent`.

## Embed nodes

Both embeds share the same shape:

- `atom: true`, `draggable: true`, `selectable: true`.
- Attributes are serialised on the JSON node's `attrs` object; HTML
  serialisation is preserved for paste-from-HTML use cases only.
- The Vue node view wraps in `<NodeViewWrapper class="doc-embed
group/embed block …">`.
- `BlockDragHandle.vue` is a child with `data-drag-handle` —
  **required**: without it, the inner `contenteditable="false"` content
  swallows drags and drops never land on a valid block position.
- The selected state reads `NodeViewProps.selected` — Tiptap manages it
  via NodeSelection; the wrapper paints a teal ring when true.

`SceneBlockView` keeps a static thumbnail by default and only mounts
`SceneViewer` (a thin viewer + read-only annotation overlay) when the
user clicks "View in 3D". This keeps Three.js inert until the reader
actually wants to interact with the scene.

`SceneViewer` is intentionally separate from `ModelTab`: the tab is the
full editing surface (objects panel, scene timeline, gizmo, view cube,
mouse legend, …); the embed is just the canvas + annotations. Keeping
them separate stops the embed from picking up tab chrome by accident.

## Auto-save model

`useBuildDoc()` is a module-level reactive composable. The `activeId`
watcher is installed exactly once (gated by `watcherInstalled`) so
multiple component callers don't multiply watchers or race the
flush+reload on project switch. It exposes:

```ts
{
  doc: Ref<JSONContent>;
  title: Ref<string>;
  setDoc(next: JSONContent): void;     // debounced write to IDB
  setTitle(next: string): void;        // debounced write to IDB
  flush(): Promise<void>;              // force-commit any pending write
}
```

Both setters update the in-memory ref synchronously and mark the doc
dirty; a single 400ms trailing-debounce timer collapses bursts into one
IDB write. Each flush writes the full record (`title`, `doc`,
`updatedAt`) — there's no patch API, because the composable already
holds the full reactive state.

When the active project switches and no doc record exists yet, the
title is seeded from the project name. The first edit then writes the
record with that seeded title intact. Project rename does not propagate
after that point — the doc owns its title.

Callers must call `flush()`:

- on the editor's `blur` (already wired in InstructionsTab).
- in `onBeforeUnmount` (already wired).

The flush also runs implicitly when the project switches — the watcher
calls it before swapping refs.

## Export / import

`useExportProject.ts` adds two things to the `.cutlist.gz` payload:

- `buildDoc?: IdbBuildDoc` (the whole record, JSON doc included).
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
4. Build doc — `remapBuildDoc(doc, { assetIdMap, modelIdMap, sceneIdMap })`
   walks the JSON tree and rewrites `attrs.assetId` /
   `attrs.modelId` / `attrs.sceneId`. Orphan ids (no map entry) are
   blanked rather than dropped, so the embed renders its empty state.
5. Annotations (orphan `sceneId` entries skipped silently).

## Versioning

`SCHEMA_VERSION = 1` (in `web/utils/versions.ts`). Imports older than
`MIN_SUPPORTED_EXPORT_VERSION` (also 1) raise `LegacyExportError` —
distinct from `FutureSchemaError` so the UI can render different
messages.

The Dexie schema is on a single `version(1)` declaration — it matches
the schema version constant. When a future migration is needed, append
a new `version(N).stores({...}).upgrade(...)` call, bump
`SCHEMA_VERSION`, and add a matching pure entry to `migrations[]` in
`projectImport/migrations.ts`. Do not edit `version(1)`.

## Things to know about Tiptap v3 here

- StarterKit ships Link in v3. Do not import `@tiptap/extension-link`.
- `NodeViewWrapper` renders a `<div>` in the live DOM, not the
  `<image-block>` / `<scene-block>` element. Those tags only exist in
  HTML serialisation (paste flow). CSS that needs to apply both to
  live node views and to rehydrated content unions both selectors:
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
