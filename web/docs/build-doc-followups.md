# Build doc — known gaps & follow-ups

Real work the current build leaves on the table. Each item is
independently shippable; none of them block the current UX.

## P1 — known correctness gaps

### Orphan asset cleanup

When the user deletes an image block from the editor, the doc no longer
references its asset, but the `IdbAsset` row + `Blob` stays in the
table. Over time this leaks storage.

`web/utils/buildDocRemap.ts` exposes `collectAssetIds(doc)` for ref
discovery — the GC pass walks the saved JSON tree, diffs against
`getAssetsForProject(projectId)`, and deletes the rows that aren't
referenced.

Where: probably inside `useBuildDoc`'s flush path, or as a separate
cleanup helper called after `putBuildDoc`. Run on a longer debounce
than the doc save itself — say 5–10s — to avoid GC'ing an asset while
the user is undoing.

Tests: round-trip an image upload + delete; assert
`getAssetsForProject` returns `[]` after GC fires.

### Image-block dragging on Safari

Not verified. The drag-handle pattern works on Chromium/Firefox during
manual testing, but Safari's contenteditable + draggable combination
has historically been quirky. Worth a manual pass.

### Editor focus on first paint

When the page mounts, the title input has focus by default (it's the
first focusable element). For a brand-new project where the title is
already seeded with the project name, focusing the editor body might be
friendlier — the user typically wants to start writing the body, not
retitling. Decide and wire via `autofocus` or a
`defineExpose({ focus })` on `BuildDocEditor`.

## P2 — schema cleanups

### `IdbModel.rawSource: object | string | null`

Today this typed-as-union field is discriminated at every read site by
`typeof` and the `source` enum. Cleaner shape:

```ts
rawSource: { format: 'gltf'; data: object } | { format: 'collada'; data: string } | null
```

Risk: ripples through `useModels`, the export schema, and any GLTF /
COLLADA loader entry point. Worth doing as a focused PR, not bundled
with feature work.

### `Record<number, T>` lies

`IdbModel.partOverrides: Record<number, PartOverride>` and
`IdbScene.objectOffsets: Record<number, ObjectOffset>` are typed with
`number` keys but JSON-serialised (and Dexie-stored) with string keys.
The Zod import schema already reflects this with
`z.record(z.string(), …)`. Tightening the TypeScript types to
`Record<string, T>` removes a footgun where a numeric lookup like
`overrides[1]` succeeds at runtime by coincidence rather than type
safety.

Risk: small. Mostly mechanical; touch every caller and let TS guide
the renames.

## P2 — UX polish (no-one's blocked, but they'd be wins)

### Slash menu for inserting blocks

The toolbar has Image / 3D-scene buttons; a `/` slash menu (Notion-style
suggester) would let touch-typists keep their hands on the keyboard.
Tiptap has a community `Suggestion` plugin that handles the menu
mechanics; the menu items would mirror the toolbar inserters.

### Floating bubble menu for inline formatting

The current toolbar is at the top of the page. For long docs this means
a long mouse trip when formatting mid-paragraph. A bubble menu (Tiptap's
`@tiptap/extension-bubble-menu`) that floats above the selection would
make B/I/link reachable from anywhere.

Tradeoff: two formatting affordances (top toolbar + bubble) might feel
busy. Could replace the top toolbar's B/I/list/link with the bubble and
keep only insert affordances at the top.

### Drag-from-toolbar block insertion

Currently insert always lands at the cursor. Dragging the Image / 3D
button into the doc would let users drop blocks at a precise position.
Probably wait until you have real signal it's needed.

### Multi-image gallery block

Today an image block holds one image. A gallery block (n images,
horizontal scroll or grid) would be a natural extension — adds another
node extension + node-view component on the same template.

### Keyboard shortcut for "View in 3D"

Scene blocks activate via mouse click only. `Enter` on a selected scene
block could toggle the live viewer.

### Editor-view styling escape for the bleed

The bleed media query (`@media min-width: 64rem`) jumps abruptly. A
clamped width with `clamp()` would give a smoother interpolation as
the viewport narrows.

## P3 — speculative

### Public sharing surface (out of scope)

Earlier brainstorm: a `/explore/:slug` page that takes a `.cutlist.gz`
hosted somewhere and renders it read-only. Block model already supports
it: `BuildDocEditor` can be put in a read-only mode (drop the toolbar
and gate `editable` via Tiptap), and `remapBuildDoc` already handles
id rewriting. `editor.getHTML()` is one call away if a server-side
renderer needs HTML rather than JSON.

### Undo across debounce window

Tiptap manages its own undo stack. The IDB write is debounced, so a
quick undo before the flush would only revert the editor; the IDB
already-flushed write before that wouldn't unwind. Not visibly broken
today, but worth documenting if it ever surfaces.
