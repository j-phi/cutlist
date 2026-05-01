# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from repo root. The web app source lives in `web/`.

```bash
bun dev              # Start dev server
bun build            # Production build
bun run test         # Run all tests (Vitest)
bun run test:watch   # Watch mode
bun run check        # Vue + TypeScript type check (vue-tsc --noEmit)
```

Run a single test file:

```bash
cd web && vitest run lib/__tests__/generateBoardLayouts.edge.test.ts
```

Formatting runs automatically via lint-staged on commit (Prettier).

## Architecture

**Cutlist** is a browser-only SPA (Nuxt 3, SSR disabled) for generating optimized wood cutting plans. Users import GLTF assemblies or enter parts manually, assign stock materials, and the app produces board layouts with a PDF export.

### Core Data Flow

```
GLTF / COLLADA file import
  → parseGltf / parseCollada (web/utils/)
  → stores parts, colors, nodePartMap + rawSource (GLTF JSON or COLLADA XML)
    in IndexedDB

Manual parts
  → user enters via BOM tab
  → stores Part[] in IndexedDB

On project load (useProjects → hydrateModel)
  → reads stored parts/colors directly from IDB
  → applies partOverrides (user edits like grainLock)
  → user assigns colorMap (material per color)
  → useBoardLayoutsQuery resolves Part → PartToCut (adds material)
  → fingerprint(parts + stock + config) — match against in-memory layout cache
  → on cache hit: skip worker; on miss: generateBoardLayouts in worker
  → BomTab / board preview display
  → exportPdf (web/utils/exportPdf.ts) or useExportProject (.cutlist.gz)

On Model tab open (single model rendered at a time)
  → useModels.getModelGraph(modelId) — derives ObjectGraph from rawSource via
    resolveModelScene; caches the graph in memory (cleared on project switch,
    purged on model deletion)
  → useThreeViewer.loadModel(graph) → ViewerCore.loadModel(graph)
  → useScenes(modelId) loads the model's scene timeline from IDB
  → useAnnotations() filters annotations by sceneId for the active scene
```

### Packing Engine (`web/lib/`)

The heart of the app. `generateBoardLayouts` runs multiple **search passes** — each pass tries a different algorithm and configuration — then scores and ranks results.

Three packers:

- **ShelfPacker** — fast, shelf-based baseline
- **GuillotinePacker** — guillotine-constrained cuts (target user workflow)
- **TightPacker** — iterative/exact placement for small boards

Search passes include shelf variants, guillotine variants (with/without rotation, CNC vs manual cuts), and randomized permutations. The packer returning the fewest boards / least waste wins.

Types: `Part` (web/utils/parseGltf.ts) is the storage/UI type (no material). `PartToCut` (web/lib/types.ts) is the packing engine input (has material). `PartOverride` (web/composables/useIdb/types.ts) holds per-part user edits (grainLock, extensible). Other packing types: `Stock`, `BoardLayout`, `SearchPass` in `web/lib/types.ts`.

### 3D Viewer Architecture (`web/lib/viewer/`)

The Model tab is built on a strict two-layer split: `ViewerCore` (plain TypeScript) owns every Three.js object; `useThreeViewer` (Vue adapter) is a thin reactive shell. **Three.js types never cross the boundary** — the day we move to a worker or swap engines, only `useThreeViewer.ts` and `ViewerCore.ts` change.

- **`web/lib/viewer/ViewerCore.ts`** — orchestrator. Owns the renderer + scene graph + camera + selection + gizmo + annotation projection. Public API only deals in domain types (`Vec3`, `GroupId`, `CameraPose`, `ObjectGraph`, etc.).
- **`web/lib/viewer/modules/`** — composable building blocks: `Renderer`, `SceneGraph`, `CameraRig`, `InputRouter`, `Highlighter`, `GizmoController`, `BatchLoader`, `Floor`, `SnapDetector`, `SnapVisuals`, `MarqueeSelector`, `LeaderManager`, `AnnotationProjector`, `ObjectRegistry`, `EventBus`. Each is single-responsibility and unit-testable.
- **`web/lib/viewer/annotations/`** — per-kind logic (`callout.ts`, `dimension.ts`) split into a `KindHooks` (drives the projector) plus a `PickKindHandler` (drives the authoring FSM). `shared.ts` holds vector math used by both.
- **`web/lib/viewer/types.ts`** — viewer-internal types (`ObjectRecord`, `PickResult`, `SnapTarget`, `MarqueeRect`, `ViewerEvent`).
- **`web/utils/types.ts`** — domain types shared with the rest of the app (`ObjectGraph`, `GroupId`, `PartNumber`, `MeshSlice`, `ObjectNode`, plus `CameraMode`, `CameraPose`, `ObjectOffset` + identity helpers). The `useIdb` barrel re-exports a few of these for compat, but new code should import from `~/utils/types`.
- **`web/docs/viewer-design.md`** — index of design specs (camera rig, marquee, gizmo, scenes, annotations) with codebase landing paths.

### Scenes & Annotations (`web/lib/scene/`, IDB)

Scenes are scoped **per model**: each `IdbModel` has its own scene timeline. Annotations chain via `sceneId`, so they cascade when scenes are deleted, and so on through the model.

- **`web/lib/scene/`** — pure capture/apply/interpolate helpers (no Three.js boot needed):
  - `captureSceneState` — viewer state → `SceneState` (sparse: identity offsets dropped, `visibleObjects: Set<GroupId> | null`)
  - `interpolateSceneState` — produces dense per-tick `{cameraPose, objectOffsets}` for the tween loop
  - `idbAdapter` — translates `SceneState` ↔ `IdbScene` at the persistence boundary
  - `easing` — single ease curve used by `useSceneAuthor.tweenToScene`
- **Authoring** lives in `useSceneAuthor` (visibility, dirty tracking, capture, jump, tween) and `useAnnotationAuthor` (FSM coordinating select ↔ pick mode, dispatching to per-kind handlers).
- **Per-model active-scene memory** lives in `useModelViewerStore.activeSceneByModel` (`Map<modelId, sceneId>`); switching models in the dropdown restores the model's last-viewed scene.

### Composables (`web/composables/`)

State is composable-based (no Pinia). Key composables:

- `useProjects` — project CRUD + active project state
- `useIdb` — IndexedDB persistence (projects, models, scenes, annotations, build steps)
- `useModels` — module-level `ObjectGraph` cache, keyed by modelId. Avoids re-running GLTFLoader/ColladaLoader on dropdown switches
- `useProjectSettings` — per-project settings (blade width, optimization mode)
- `useProjectTabMap` — tab state per project
- `useBoardLayoutsQuery` — runs packing engine reactively
- `useBuildSteps` — assembly instruction generation
- `useThreeViewer(container)` — thin Vue adapter over `ViewerCore`. Owns lifecycle (mount, dispose, canvas remount) and bridges the bus to `useModelViewerStore`
- `useModelViewerStore` — global selection / hover state for the Model tab; also holds the per-model active-scene map
- `useScenes(modelIdRef)` — reactive scene list for a model + CRUD
- `useAnnotations()` — reactive annotation list for the active project + CRUD
- `useSceneAuthor(viewer, modelIdRef)` — visibility set, active scene id, dirty flag, capture, jump, tween, viewer-setter wrappers (`setCameraMode`, `setFloorVisible`) that auto-mark dirty
- `useAnnotationAuthor(viewer, annotationsApi, activeSceneId)` — FSM coordinating select ↔ pick mode; per-kind handler registry
- `useAnnotationProjector(viewer, annotations, activeSceneId, annotationsApi, author)` — projector lifecycle + kind/handler registration; constructs lazily on viewer ready, disposes on scope dispose
- `useObjectsPanel` — Objects-panel filtering + visibility actions
- `useFocusedModelLoader` — watches focused model + viewer ready and (re)loads + replays the remembered active scene
- `useSceneAuthoringActions` — `onAddScene` / `onSelectScene` / `onUpdateActiveScene` / `onRemoveScene` + `canUpdateScene`
- `useUrlSync` — bidirectional sync between app state (activeId, tab) and URL route
- `useExportProject` / `useImportProject` — `.cutlist.gz` file I/O

### Routing (`web/pages/`)

File-based routing with dynamic segments:

- `/` — landing page (`index.vue`), shown when no project is active
- `/:projectId` — project view (`[projectId]/[[tab]].vue`), default tab is BOM
- `/:projectId/:tab` — project view on a specific tab
- `/about`, `/terms` — static pages

`useUrlSync` (called once in `app.vue`) keeps the URL and app state in sync bidirectionally. Existing code (`setActive`, `tab.value =`) doesn't need to know about routing — the watcher handles navigation automatically.

### UI (`web/components/`)

Project sidebar and tabbed main area. Tabs: Model (3D viewer), Stock, BOM, Instructions, Warnings, Settings.

Styling: Tailwind CSS v4 + Nuxt UI, dark mode by default, custom "mist" color palette (`tailwind.config.ts`), teal accent (`app.config.ts`).

### Theming

The app is always dark. The **mist palette** (cool blue-gray ramp) is the single color source, set as `neutral: 'mist'` in `app.config.ts` so Nuxt UI generates all its semantic colors from it automatically. Dark mode is forced via `colorMode: { preference: 'dark' }` in `nuxt.config.ts`.

**How it works**: Nuxt UI maps the neutral palette to CSS variables (`--ui-bg`, `--ui-bg-elevated`, `--ui-text-muted`, etc.) which power its built-in semantic classes (`bg-default`, `bg-elevated`, `text-muted`, `text-dimmed`, etc.). Setting `neutral: 'mist'` means all those resolve to mist values. Custom utilities in `typography.css` fill gaps Nuxt UI doesn't cover.

**Surface hierarchy** (elevation levels):

| Class         | Source         | Mist value         | Use for                                          |
| ------------- | -------------- | ------------------ | ------------------------------------------------ |
| `bg-base`     | custom utility | mist-950 `#090b0c` | Page background, base layer                      |
| `bg-default`  | Nuxt UI        | mist-900 `#161b1d` | Default component backgrounds                    |
| `bg-surface`  | custom utility | mist-900 `#161b1d` | Inputs, cards, subtle elevation                  |
| `bg-elevated` | Nuxt UI        | mist-800 `#22292b` | Dropdowns, popovers, tooltips, modal content     |
| `bg-overlay`  | custom utility | `black/80%`        | Modal backdrops only (intentionally transparent) |

**Text hierarchy**:

| Class        | Source         | Mist value         | Use for                    |
| ------------ | -------------- | ------------------ | -------------------------- |
| `text-hi`    | custom utility | white              | Headings, primary labels   |
| `text-body`  | custom utility | mist-200 `#e3e7e8` | Body copy, names           |
| `text-muted` | Nuxt UI        | mist-400 `#9ca8ab` | Secondary labels, metadata |
| `text-dim`   | custom utility | mist-500 `#67787c` | Hints, placeholders        |

**Borders**: `border-subtle` (custom, mist-800) for dividers, `border-default` (custom, mist-700 with `!important`) for outlines/rings.

**Rules**:

- Floating/overlapping elements **must** use `bg-elevated` so content underneath doesn't bleed through.
- Don't redefine `bg-elevated`, `text-muted`, or other Nuxt UI semantic classes as custom `@utility` — the names collide and cause specificity issues.
- Teal accent colors (`teal-400/30`, etc.) and `bg-overlay` are the only places transparency is correct. Don't introduce new `white/XX` patterns.
- Nuxt UI component defaults are in `app.config.ts` — update there, not per-component.

## Testing

**Every feature or behavioral change must ship with tests.** This includes new composable methods, new component interactions (emits, confirm flows), new IDB operations, and new utility functions. When modifying existing behavior, update the corresponding tests to match. Run `bun run test` before considering any task complete.

When a feature touches multiple layers (e.g. a new IDB operation wired through a composable to a component), test each layer:

- **IDB/data layer** — verify the operation works against a real (fake) IndexedDB
- **Composable layer** — if it has non-trivial logic beyond delegation, test it
- **Component layer** — verify emits, confirm flows, and conditional rendering

Tests use [Vitest](https://vitest.dev) with `@nuxt/test-utils` for component tests. Test files live alongside source in `__tests__/` subdirectories:

- `web/lib/__tests__/` — packing algorithm tests
- `web/lib/packers/__tests__/` — individual packer unit tests
- `web/lib/utils/__tests__/` — utility tests
- `web/lib/scene/__tests__/` — scene capture/interpolate math
- `web/lib/viewer/__tests__/` — viewer-shared utilities (edges, transforms)
- `web/lib/viewer/modules/__tests__/` — viewer module unit tests
- `web/lib/viewer/annotations/__tests__/` — annotation kind tests
- `web/utils/__tests__/` — web utility tests (incl. parser-matrix-parity)
- `web/composables/__tests__/` — composable + IDB tests
- `web/components/*/__tests__/` — component interaction tests
- `web/middleware/__tests__/` — route middleware tests

**Outcome-based assertions, not mock metadata.** Viewer module tests use real `THREE.*` math, real `EventBus`, real `ObjectRegistry`, and stub only what genuinely needs DOM/WebGL (e.g. `TransformControls`, `BatchedMesh`'s GPU-instanced raycast). For Vue components, prefer `wrapper.emitted()` over mocked event handlers. For composables that record calls, prefer plain functions pushing into typed arrays over `vi.fn()` + `toHaveBeenCalled` introspection. See `web/lib/viewer/modules/__tests__/GizmoController.test.ts` and `MarqueeSelector.test.ts` as canonical examples.

Config lives in [web/vitest.config.ts](web/vitest.config.ts). The default environment is `happy-dom` (fast, no Nuxt boot). [web/test-setup.ts](web/test-setup.ts) is loaded as a `setupFiles` entry: it installs `fake-indexeddb` and runs a global `beforeEach` that calls `__resetDbForTests()` (dynamic import so Dexie does not load before `fake-indexeddb/auto`) then `indexedDB.deleteDatabase('cutlist-db')`. **Every test starts with an empty IndexedDB** — do not rely on data from other tests or on test order.

For component tests that need Nuxt auto-imports / `mountSuspended`, opt-in to the Nuxt environment per file with `// @vitest-environment nuxt` at the top.

When adding a test for a component that already has a test file with stubs/mocks, update those stubs to include any new emits, props, or mock functions so the existing tests don't drift out of sync with the real component API.

## Data Model (`web/composables/useIdb/`)

All data lives in IndexedDB. The app is still in development — breaking schema changes are acceptable (users can reset their database).

### Tables

- **`projects`** — `id, updatedAt`. The top-level entity.
- **`models`** — `id, projectId`. Each project can hold multiple models; the Model tab renders one at a time via a dropdown when there's more than one.
- **`buildSteps`** — `id, projectId`. Assembly instructions (rich-text).
- **`scenes`** — `id, modelId, order`. Per-model scene timeline. `IdbScene` carries camera mode + pose, per-Object rigid offsets, visibility set, floor visibility, and a thumbnail data URL.
- **`annotations`** — `id, sceneId`. Discriminated union of `IdbCallout` and `IdbDimension`. Anchored in Object-local space so they ride explode tweens and gizmo drags.

Cascade: deleting a project deletes its models, build steps, scenes, and annotations in one Dexie transaction. Deleting a model cascades to its scenes and (via sceneId) annotations.

### IdbModel — what's stored

Both GLTF and manual models store their `parts`, `colors`, and `nodePartMap` directly in IndexedDB. GLTF models also keep `rawSource` (the GLTF JSON object) and COLLADA models keep `rawSource` (the XML string) for the 3D viewer. The viewer derives an `ObjectGraph` from `rawSource` on first open via `resolveModelScene`; `useModels` caches the derived graph in memory so subsequent opens of the same model are instant.

`IdbModelMeta = Omit<IdbModel, 'rawSource'>` — what the reactive `useProjects().enabledModels` exposes, so the heavy raw payload doesn't leak into reactive state. Use `useIdb().getModelRawSource(id)` (or, preferably, `useModels().getModelGraph(id)`) to fetch on demand.

Both model types use `partOverrides: Record<number, PartOverride>` for user edits (keyed by partNumber). To add a new per-part override, just add an optional field to `PartOverride` — no migration needed.

### Layout cache

Board layouts are cached per tab in a module-level `Map` inside [web/composables/useBoardLayoutsQuery.ts](web/composables/useBoardLayoutsQuery.ts), keyed by `projectId`. Each entry stores layouts plus a fingerprint over `{parts, stock, config}` (FNV-1a via [web/utils/fingerprint.ts](web/utils/fingerprint.ts)). Exact fingerprint match skips the worker; mismatch recomputes (stale result shown SWR-style when available). The cache is not persisted — a full page reload always recomputes.

### Versioning policy

| Version constant | File                                           | Bump when                           |
| ---------------- | ---------------------------------------------- | ----------------------------------- |
| `SCHEMA_VERSION` | [web/utils/versions.ts](web/utils/versions.ts) | Any IDB record type's fields change |

`FutureSchemaError` also lives in `versions.ts` — it's the shared error raised when the stored DB or imported export file was written by a newer Cutlist than the one running.

### Migrations

**IDB schema** is owned by the `CutlistDB` class in [web/composables/useIdb/db.ts](web/composables/useIdb/db.ts), which uses [Dexie](https://dexie.org). Each schema version is declared with a chained `this.version(N).stores({...}).upgrade(tx => ...)` call. Dexie opens the DB and runs any pending `.upgrade()` callbacks atomically; a mid-upgrade failure rolls the whole transaction back.

**Export-file compatibility** is a separate concern, handled by [web/utils/projectImport/migrations.ts](web/utils/projectImport/migrations.ts). A `.cutlist.gz` emitted at schema v(N-1) still needs its record shapes brought up to vN when imported by a newer client — Dexie can't help with that since the file isn't in IDB yet. That module keeps:

- **`migrations[]`** — pure, append-only entries applied to raw export records. Mirrors any Dexie `.upgrade()` record transformation.
- **`migrateExport()`** — runs the above over an imported payload.

**Read-path safety net**: `applyDefaults` helpers in [web/composables/useIdb/defaults.ts](web/composables/useIdb/defaults.ts) fill missing fields on every record read, so partial records from older writes still hydrate cleanly.

### When adding a new field to a record type

1. Update the TypeScript interface in `useIdb/types.ts`.
2. Add a new Dexie version block in `db.ts`:
   ```ts
   this.version(N)
     .stores({
       /* only stores whose indexes changed */
     })
     .upgrade(async (tx) => {
       await tx
         .table('projects')
         .toCollection()
         .modify((p) => {
           p.newField = defaultValue;
         });
     });
   ```
3. Bump `SCHEMA_VERSION` in `versions.ts` and add the matching pure-function entry to `migrations[]` in `projectImport/migrations.ts` for the import path.
4. Update the relevant `applyDefaults` helper.
5. Update `createX` to set the field for new records.
6. Add a test in `utils/projectImport/__tests__/migrations.test.ts`.

### IDB error handling

- **QuotaExceededError**: all mutations (create/update/delete) go through `safeWrite()` which catches quota errors and sets `useIdbErrors().error` so the UI can show a toast.
- **Import validation**: all `.cutlist.gz` imports are validated against strict Zod schemas in `projectImport/index.ts` before touching IDB.

## Key Config Files

- `web/nuxt.config.ts` — Nuxt config (SSR off, modules)
- `web/tailwind.config.ts` — custom color palette
- `web/app.config.ts` — Nuxt UI theme
- `cutlist.config.yaml` — user-facing defaults (stock materials, blade width, optimization modes)
