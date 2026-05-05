# Build doc — test coverage map

Where the assertions live, layer by layer. The numbers tell you which
file holds the relevant case so you know what's already defended before
adding more.

## Data layer

### `web/composables/__tests__/useIdb.test.ts`

- **Project CRUD** (existing): create, archive, unarchive, delete with
  cascade.
- **Build doc**: undefined when project has no doc; persists and reads
  back JSON tree with embed nodes intact; `putBuildDoc` replaces records
  on the same projectId; `deleteBuildDoc` removes; partial records
  hydrate with `title: ''` and an empty doc via `applyBuildDocDefaults`.
- **Assets**: persists asset record fields and returns the blob handle
  (the actual blob bytes aren't asserted here — see notes below);
  `deleteProject` cascades into the assets table; `getAssetsForProject`
  filters correctly.

**fake-indexeddb caveat.** happy-dom + fake-indexeddb don't preserve
`Blob` cleanly through structuredClone. The asset tests assert metadata
only, not blob byte-equality. Real blob round-trip is verified
separately at the `blobBase64` layer.

## Doc body layer

### `web/utils/__tests__/blobBase64.test.ts`

- Round-trips a small text blob byte-for-byte.
- Round-trips a binary blob spanning the chunk boundary (0x8000+).
- Survives an empty blob (returns `''`, then a 0-byte blob).

These cover the actual encoding/decoding correctness — the fake-IDB
tests above just verify the IDB plumbing accepts a blob.

### `web/utils/__tests__/buildDocRemap.test.ts`

- Rewrites image-block `attrs.assetId` in place; preserves caption and
  surrounding paragraphs.
- Rewrites scene-block model + scene ids.
- Blanks orphan ids (no map entry) rather than dropping nodes.
- Walks nested content (lists, etc.).
- Returns an empty doc unchanged structurally.
- `collectAssetIds` returns the set of asset ids referenced by image
  blocks (and walks nested content).

## Composable layer

### `web/composables/__tests__/useExportProject.test.ts`

- Returns null for a missing project.
- Builds a payload with `SCHEMA_VERSION` and project fields.
- Rehydrates `rawSource` onto exported models.
- Includes the build doc with its title and JSON body intact.
- Round-trips through `parseProjectExport` end-to-end (schema-valid).
- Exports image-block references and asset records together (asserts
  metadata only, per the fake-IDB caveat).

### `web/composables/__tests__/useImportProject.test.ts`

- `importFromFile` delegates to `importProjectFromFile` and wires the
  new project id through `appendProject` and `setActiveProject`.
  (The `useBuildDoc` watcher picks up the new active project on its
  own — no explicit reload is needed.)
- Propagates errors from `importProjectFromFile` to the caller.
- `pickAndImport` reports an error toast when the underlying import
  fails.
- `pickAndImport` is a no-op when the user cancels the file picker.

## Import / migration layer

### `web/utils/projectImport/__tests__/projectImport.test.ts`

- Parse validation: rejects non-object input, missing project field,
  empty project name, missing version (legacy), bad enums, non-finite
  numbers, and a `buildDoc` record with structurally bad fields.
- File import: gzip + plain-JSON fallback; rejects non-JSON content;
  rejects unversioned content as legacy with a readable error;
  current-version payload missing required fields fails with a Zod
  message.
- Round-trip: payload through `parseProjectExport` preserves project
  name, models, parts, build doc html.
- `importProjectData` remaps project / model ids and writes the build
  doc with the new project id and html.

### `web/utils/projectImport/__tests__/projectImport.edge.test.ts`

- Edge: rejects an unversioned array as legacy, payload-with-no-buildDoc
  field, empty models array, future schema version, negative partNumber,
  NaN size, silently strips a legacy `settings` field.
- Remapping: preserves excludedColors; unique model ids per model;
  imports the build doc with the new project id.
- Import-from-file: rejects unversioned gzipped JSON as legacy; accepts
  valid gzipped export.
- Round-trip fidelity: part overrides, stock + distanceUnit, packing
  settings, defaults for legacy exports, colors / nodePartMap.

### `web/utils/projectImport/__tests__/migrations.test.ts`

- `migrateRecord` returns unchanged when no migrations apply.
- Migration registry invariants: versions ≤ SCHEMA_VERSION,
  non-decreasing, valid store names, callable migrate functions.
- Version constants are positive integers.
- `migrateExport`: rejects future versions, returns current-version
  exports by reference, rejects legacy versions below
  `MIN_SUPPORTED_EXPORT_VERSION`, treats missing version as legacy,
  preserves unknown top-level fields on a current-version export.
- `FutureSchemaError` and `LegacyExportError` both name the version
  numbers in their messages.
- `applyProjectDefaults`, `applyModelDefaults`: fill missing fields,
  preserve existing values.

### `web/utils/projectImport/__tests__/round-trip.test.ts`

End-to-end export → import fidelity for scenes + annotations + the
default-scene id contract.

## Component layer

### `web/components/project/tabs/__tests__/InstructionsTab.test.ts`

The editor itself is heavy, so it's stubbed; the test asserts
plumbing, not editor mechanics.

- Empty-project state when `activeProject` is null.
- Mounts the editor with the doc body (JSONContent).
- Title input shows the title verbatim and keeps the project name as
  placeholder.
- Forwards title input to `setTitle`; forwards editor updates to
  `setDoc`; flushes pending writes when the editor blurs.

### Embed node views

Not currently covered by component tests. Manual UI verification has
covered the upload flow, scene activation, drag handles, and the
selected ring. Worth adding component tests if any of those regress;
the existing `InstructionsTab.test.ts` stub pattern is a good template
(stub `ModelTab` to avoid booting Three.js).

## What's intentionally not tested

- **Tiptap mechanics**: extension wiring, contenteditable behaviour,
  drag-and-drop reordering. These are exercised in real browsers; the
  jsdom / happy-dom contenteditable surface is too thin to assert
  against meaningfully.
- **Three.js viewer mounting** inside scene blocks. The viewer has its
  own integration tests in `lib/viewer`; we trust ModelTab's
  `read-only` mode.
- **Blob bytes through fake-IDB**, as noted above. Asserted at the
  helper layer (`blobBase64.test.ts`) instead.
