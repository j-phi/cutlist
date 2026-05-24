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
export PATH="$HOME/.bun/bin:$PATH" && cd web && bunx vitest run lib/__tests__/generateBoardLayouts.edge.test.ts
```

Use `bunx vitest` (not bare `vitest`) — vitest is not globally installed, only bun has it.

Formatting runs automatically via lint-staged on commit (Prettier).

**Git commits — always prepend bun to PATH.** The pre-commit hook requires `bun`. Every `git commit` command must be prefixed with `export PATH="$HOME/.bun/bin:$PATH" &&`:

```bash
export PATH="$HOME/.bun/bin:$PATH" && git commit -m "..."
```

## Code Change Workflow

**Every code change must follow this checklist before reporting done:**

1. **Tests first (RGR)** — Write or update tests that validate the change _before_ or _alongside_ the implementation. Run `bun run test` and confirm all tests pass. Do not report a task complete if tests are failing.

2. **Test coverage** — Any new behavior, composable method, utility, or component interaction must ship with tests. Updating existing behavior means updating the tests to match. See the Testing section for what layers to cover and what to avoid.

3. **Help panel review** — Check whether any of the three help panels (BOM, Stock, Layout) describe something you changed. If so, update the content component. See the Documentation & Help Panels section for locations.

4. **CLAUDE.md review** — If the change affects commands, architecture, data model, units, theming rules, or any other section here, update this file before closing the task.

## Architecture

**Cutlist** is a browser-only SPA (Nuxt 3, SSR disabled) for generating optimized wood cutting plans. Users import 3D model assemblies (`.gltf`, `.glb`, `.dae`, `.fbx`) or enter parts manually, assign stock materials, and the app produces board layouts with a PDF export.

### Core Data Flow

```
GLTF / DAE / FBX / GLB file import
  → parseGltf for `.gltf` (native fast path); parseAssimp for everything
    else (Assimp WASM converts to glTF JSON in-browser, then runs
    buildGltfObjectGraph on the result)
  → stores parts, colors, nodePartMap + rawSource (always glTF JSON for
    new imports, regardless of source format) in IndexedDB

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

Two packers:

- **GuillotinePacker** — recursive guillotine cuts (every cut edge-to-edge); target user workflow for table/track saws. Multi-board lookback consolidates small parts onto earlier boards.
- **TightPacker** — non-guillotine placement for CNC / jigsaw workflows. Also uses multi-board lookback.

The pass tournament runs each enabled pass per (material, thickness) stock group; the best score (fewest boards → least waste → tightest concentration) wins per group.

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
- `useIdb` — IndexedDB persistence (projects, models, scenes, annotations, build docs, assets)
- `useModels` — module-level `ObjectGraph` cache, keyed by modelId. Avoids re-running GLTFLoader on dropdown switches
- `useProjectSettings` — per-project settings (blade width, optimization mode)
- `useProjectTabMap` — tab state per project
- `useBoardLayoutsQuery` — runs packing engine reactively
- `useBandingSummary` — edge-banding totals (F7): total banded length (Σ banded-edge lengths × qty over enabled parts) + cost from a localStorage-backed cost-per-length rate. Feeds the shopping-list/PDF banding line
- `useBuildDoc` — single Tiptap-based "Build" page per project (title + JSON doc). Holds module-scoped reactive state, debounces IDB writes, flushes on project switch / blur / unmount
- `useDocAssets` — image upload + reactive blob-URL resolution for image blocks in the build doc
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

**Convention — project-scoped watchers must be detached.** Composables that install a `watch(activeId, …)` (or `watch(activeModelId, …)`) to load IDB data on project/model switch must wrap the call in `effectScope(true).run(() => watch(...))`. A bare `watch()` inside the composable binds to the _first caller's_ component scope; when that component unmounts (e.g. switching tabs) Vue silently disposes the watcher, and a `let watcherInstalled = false` gate then prevents reinstall, so subsequent project switches go unobserved (stale data, blank UIs). See `useScenes`, `useAnnotations`, `useBuildDoc`. `useActiveProject` is the exception — its watcher is installed via `startActiveProjectWatcher()` from `app.vue`'s `startProjects()`, which gives the same lifetime guarantee.

### Routing (`web/pages/`)

File-based routing with dynamic segments:

- `/` — landing page (`index.vue`), shown when no project is active
- `/:projectId` — project view (`[projectId]/[[tab]].vue`), default tab is BOM
- `/:projectId/:tab` — project view on a specific tab
- `/about`, `/terms` — static pages

`useUrlSync` (called once in `app.vue`) keeps the URL and app state in sync bidirectionally. Existing code (`setActive`, `tab.value =`) doesn't need to know about routing — the watcher handles navigation automatically.

### UI (`web/components/`)

Project sidebar and tabbed main area. Tabs (in order): BOM, Stock, Layout, Model (3D viewer), Build (rich-text instructions, Tiptap), Settings. Tab metadata is owned by `web/utils/projectTabs.ts` (id, label, icon, URL segment) — update there when adding/renaming tabs.

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

**Every feature or behavioral change must ship with tests.** New composable methods, component interactions (emits, confirm flows), IDB operations, utility functions. When modifying existing behavior, update the tests to match. Run `bun run test` before considering any task complete.

When a feature touches multiple layers, test each layer that has non-trivial logic — but only those layers. A composable that's pure delegation doesn't need its own test if the layers it delegates to are covered.

- **IDB/data layer** — verify against fake-indexeddb
- **Composable layer** — if it has non-trivial logic beyond delegation
- **Component layer** — emits, confirm flows, conditional rendering

### The tautology check (MUST apply before writing or keeping a test)

Before adding an assertion, ask: **"what real, user-visible bug class would slip through if this assertion vanished?"** If you can't name one, don't write the test — or delete it.

Common tautologies (do NOT write these):

- **Mock-shape introspection** — `expect(myMock).toHaveBeenCalledWith(...)` where the mock was set up to return data the test then asserts on. You're testing the mock, not the code.
- **Vue template forwarding** — asserting that a parent passes a prop or emits an event that the template literally writes (`<Child :foo="foo" @bar="onBar" />`). Vue guarantees this; testing it just makes prop renames painful.
- **Type-checker duplicates** — asserting that a default-fill function fills the field it's typed to fill, or that a function returns the type it's typed to return.
- **Object-spread tautologies** — "preserves existing values" cases on `applyDefaults`-style helpers. They just verify `{...x, defaults}` works.
- **Copy-edit smoke** — asserting that a help popover contains the strings `'Right-drag'`, `'Mid-drag'`, etc. Rewards itself for typo-catching but rots on every copy edit.
- **Lifecycle no-ops** — "should not throw when disposed before init", "renders default slot content". These are framework guarantees.

Test files live alongside source in `__tests__/` subdirectories:

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

### Outcome-based assertions, not mock metadata

Viewer module tests use real `THREE.*` math, real `EventBus`, real `ObjectRegistry`, and stub only what genuinely needs DOM/WebGL (e.g. `TransformControls`, `BatchedMesh`'s GPU-instanced raycast). Canonical examples: `web/lib/viewer/modules/__tests__/GizmoController.test.ts`, `MarqueeSelector.test.ts`.

For Vue components, prefer `wrapper.emitted()` over mocked event handlers.

For composables that need to record calls into a fake dependency, prefer **plain functions pushing into typed arrays** over `vi.fn()` + `toHaveBeenCalled` introspection. The typed-array pattern asserts on what was recorded (an outcome) rather than how the mock was wired (an implementation detail). Example: `useSceneAuthoringActions.test.ts` uses `captured: number[]` and `adds: AddCall[]` to verify capture-then-add ordering.

### Shared test utilities

- **Component stubs** — `web/test-utils/stubs.ts` exports stable stubs for Nuxt UI primitives (`UButtonStub`, `UInputStub`, `UModalStub`, etc.). Import these instead of inlining stub definitions in each test file. The inline-stub pattern is drift-prone: when the real component gains a prop, the per-file stubs silently lose coverage.
- **Migration / import fixtures** — `web/utils/projectImport/__tests__/_helpers.ts` exports `makePayload(overrides?)` and `makeIdbMock({ newProjectId? })`. Use these for any test exercising the import pipeline; do not duplicate the payload shape.

### Test config

[web/vitest.config.ts](web/vitest.config.ts) — default environment `happy-dom` (fast, no Nuxt boot). [web/test-setup.ts](web/test-setup.ts) installs `fake-indexeddb` and runs a global `beforeEach` that calls `__resetDbForTests()` (dynamic import so Dexie does not load before `fake-indexeddb/auto`) then `indexedDB.deleteDatabase('cutlist-db')`. **Every test starts with an empty IndexedDB** — do not rely on data from other tests or on test order.

For component tests that need Nuxt auto-imports / `mountSuspended`, opt-in to the Nuxt environment per file with `// @vitest-environment nuxt` at the top.

### Benchmarks

`web/lib/benchmarks/benchmark.test.ts` is an observability harness, not a regression test. It's excluded from `bun run test`. Run it deliberately with `bun run bench` (uses [web/vitest.bench.config.ts](web/vitest.bench.config.ts)) when comparing before/after on packing-engine changes.

### When you find a bloated test file

Trim it. Apply the tautology check to every `it()`. If the file has 5 near-duplicate render-state cases, collapse them into one `it.each` or one well-chosen case. If a 600-LOC test file exists for a 200-LOC composable, the test is probably over-fitted to implementation. Bias toward fewer sharper tests over many shallow ones.

## Data Model (`web/composables/useIdb/`)

All data lives in IndexedDB. The app is still in development — breaking schema changes are acceptable (users can reset their database).

### Tables

- **`projects`** — `id, updatedAt`. The top-level entity.
- **`models`** — `id, projectId`. Each project can hold multiple models; the Model tab renders one at a time via a dropdown when there's more than one.
- **`buildDocs`** — keyed by `projectId` (one record per project). Tiptap JSON `doc` plus `title`. Embedded image and scene blocks reference `assets` and `scenes` by id in node `attrs`, so referenced ids survive HTML round-tripping.
- **`scenes`** — `id, modelId, order`. Per-model scene timeline. `IdbScene` carries camera mode + pose, per-Object rigid offsets, visibility set, floor visibility, and a thumbnail data URL.
- **`annotations`** — `id, sceneId`. Discriminated union of `IdbCallout` and `IdbDimension`. Anchored in Object-local space so they ride explode tweens and gizmo drags.
- **`assets`** — `id, projectId`. Image blobs uploaded into the build doc. Resolved to object URLs on demand via `useDocAssets.useAssetUrl(assetId)`.

Cascade: deleting a project deletes its models, build doc, scenes, annotations, and assets in one Dexie transaction. Deleting a model cascades to its scenes and (via sceneId) annotations.

### IdbModel — what's stored

All non-manual models store `parts`, `colors`, `nodePartMap`, and `rawSource` (a glTF JSON object) directly in IndexedDB. The `source` field labels the import path (`'gltf'` for native glTF, `'assimp'` for anything Assimp-routed) but the stored payload is always glTF JSON since DAE/FBX/GLB are converted at import time. The viewer derives an `ObjectGraph` from `rawSource` on first open via `resolveModelScene`; `useModels` caches the derived graph in memory so subsequent opens of the same model are instant.

Pre-Assimp IDB records may still hold a raw XML string in `rawSource`. `resolveModelScene` detects this (`typeof rawSource === 'string'`) and re-runs Assimp on the XML — a one-time cost per legacy model; the converted glTF is not written back, so the conversion repeats on each open. Acceptable since "the app is still in development" per the existing schema versioning policy.

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

Two paths convert old data to the current schema; both run the same per-version transform.

- **Local IDB upgrades**: `CutlistDB` in [web/composables/useIdb/db.ts](web/composables/useIdb/db.ts) declares one `this.version(N).stores({...}).upgrade(tx => ...)` block per schema version. Dexie runs any pending `.upgrade()` callbacks atomically when `db.open()` is called.
- **Imported `.cutlist.gz` files**: a parallel registry in [web/utils/projectImport/migrations/](web/utils/projectImport/migrations/) applies the same transforms to records that arrive from outside IDB. `migrations/index.ts` is the version-agnostic registry; each `migrations/v<N>.ts` exports a `vNMigration: RecordMigration` plus the pure transform function. `migrateExport()` walks the registry to bring an import up to `SCHEMA_VERSION`.

The per-version transform must not throw — a thrown error inside Dexie's `.upgrade()` rolls back the transaction and locks the user out of the DB. Drop unparseable rows; preserve repairable ones (see `migrations/v3.ts` for the canonical defensive shape).

`FutureSchemaError` (in `versions.ts`) is raised when the stored DB or imported file was written by a newer Cutlist than the one running. `LegacyExportError` covers `.cutlist.gz` files older than `MIN_SUPPORTED_EXPORT_VERSION`.

**Read-path safety net**: `applyDefaults` helpers in [web/composables/useIdb/defaults.ts](web/composables/useIdb/defaults.ts) fill missing fields on every record read, so partial records from older writes still hydrate cleanly.

Current schema: **v11**. v2 normalised `optimize` → `defaultAlgorithm`; v3 canonicalised distance storage to millimetres; v4 dropped `archivedAt`; v5 switched internal dimensions from float meters/mm to integer micrometres — project `bladeWidth`/`margin` and every `Part.size.*` are now branded `Micrometres` (see `migrations/v5.ts`); v6 moved stock from a YAML string to a structured `stocks: StockMatrix[]`; v7 added stock `role` tiers + offcut `quantity`; v8 split stock `name` from `material` (category); v9 added an optional, currency-agnostic `cost?: number` on each stock size for material-yield + cost reporting (purely additive — the v9 transform is a no-op); v10 batched the Phase-1 persisted `IdbProject` fields (XR-1: one bump for same-phase fields) — `layoutAlignH`/`layoutAlignV` (F13), `labelPlacement` (F20), `bandingThicknessUm`/`subtractBandingThickness` (F7), `optimizationObjective` (F11). v10 also added migration-free `PartOverride.bandedEdges`/`bandingThicknessUm` (read-path safety net, no Dexie transform). Of these, only `optimizationObjective` + the banding fields enter the layout-cache fingerprint; alignment + label placement are presentational and never bust the cache. v11 added `measurementMode: 'edge' | 'outside' | 'inside' | 'text'` on `IdbProject` (F20 Part B — how placed-part measurements render on the board diagram; default `'edge'`), also presentational and excluded from the fingerprint. The four modes: `edge` = engineering dimension lines on each piece's own edges (`pdf/dimensions.ts`); `inside` = per-piece W + H dimension lines drawn _inside_ the piece, width along the bottom band, height up the left (`pdf/insideDimensions.ts`); `outside` = waterfall/stacked dimensioning — every distinct piece width is dimensioned below the board and every distinct height to its left, deduped by extent and stacked smallest-innermost so dimension lines never cross, following drafting best practices for gaps/overshoot/spacing (`pdf/outsideDimensions.ts`); `text` = plain centered `W × H` text (+ BOM name), no lines. `outside` sizes its reserved annotation margin from the waterfall depth (`waterfallStripPt`), so `computeBoardScale` takes separate left/bottom annotation reservations.

### When adding a new schema version

1. Update the TypeScript interface in `useIdb/types.ts`.
2. Create `web/utils/projectImport/migrations/v<N>.ts`:

   ```ts
   import type { IdbRecord, RecordMigration } from './types';

   export function migrateProjectToVN(record: IdbRecord): IdbRecord {
     /* defensive transform — never throw */
   }

   export const vNMigration: RecordMigration = {
     version: N,
     store: 'projects',
     migrate: migrateProjectToVN,
   };
   ```

3. Register the entry in `migrations/index.ts` by appending `vNMigration` to `migrations[]`.
4. Add a matching Dexie block in `db.ts`. Do NOT edit older version blocks.

   ```ts
   this.version(N)
     .stores({
       /* only stores whose indexes changed */
     })
     .upgrade(async (tx) => {
       await tx
         .table('projects')
         .toCollection()
         .modify((p: Record<string, unknown>) => {
           Object.assign(p, migrateProjectToVN(p));
         });
     });
   ```

5. Bump `SCHEMA_VERSION` in `versions.ts`.
6. Update the relevant `applyDefaults` helper.
7. Update `createX` to set the field for new records.
8. Add tests in `web/utils/projectImport/migrations/__tests__/v<N>.test.ts` (per-version, sibling to the source). Registry-level invariants live in `web/utils/projectImport/__tests__/migrations.test.ts`.

### IDB error handling

- **QuotaExceededError**: all mutations (create/update/delete) go through `safeWrite()` which catches quota errors and sets `useIdbErrors().error` so the UI can show a toast.
- **Import validation**: all `.cutlist.gz` imports are validated against strict Zod schemas in `projectImport/index.ts` before touching IDB.

## Dimensions and units

Internal storage and the engine work in **integer micrometres** — the same substrate used by Clipper / DeepNest / SVGnest for axis-aligned rectangle packing. Identity is `===`, placement geometry is exact integer arithmetic, and the only fuzzy comparison left is the mesh-vertex cluster at the glTF parse boundary.

| Layer       | Unit                                         | Where                                                                     |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| **Storage** | Integer micrometres (branded `Micrometres`)  | `IdbProject.{bladeWidth, margin}`, `Part.size.*`, every `BoardLayout.*Um` |
| **Engine**  | Integer micrometres                          | `web/lib/index.ts`, packers, `Rectangle`                                  |
| **YAML**    | Millimetres (human-edited)                   | Stock matrix YAML; converted via `mmToUm` in `reduceStockMatrix`          |
| **Display** | User's `distanceUnit` rounded to `precision` | BOM, layout, PDF, viewer labels, edit-prefill                             |

Brand erases at runtime — structured-clone across the worker is a no-op — but the compile-time check makes "raw meters into the engine" a type error at the source. Max panel 3000 mm = 3 × 10⁶ µm: fits comfortably inside JS's safe-integer range without `BigInt`. Score functions (`wasteArea`, `wasteConcentration` = µm⁴) compute in float to avoid overflow on multi-board sums.

### The units module — `web/lib/utils/units.ts`

Single source of truth, exported through the `cutlist` library entry:

- **Brand**: `Micrometres = number & { __um: unique symbol }`. Constructed via `um(n)` (rounds to integer).
- **Conversion**: `mmToUm`, `mToUm`, `umToMm`, `umToM`. Arithmetic helpers `umAdd`, `umSub`, `umMul` re-attach the brand; division is intentionally not provided (forces callers into `number` for sub-µm).
- **YAML / inch input boundary**: `toCanonicalMm(value, from)` snaps user-typed and YAML mm-or-inch input to the 1-µm grid in mm representation. Used by `presetToMmStock`, `useDimensionDrafts`, and the v3 migration; production callers that want µm go through `mmToUm`.
- **Precision type**: `Precision = { kind: 'fraction', denominator: 8|16|32|64 } | { kind: 'decimal', step: number }`. Defaults: `DEFAULT_INCH_PRECISION = 1/32"`, `DEFAULT_MM_PRECISION = 0.1mm`.
- **Parsing**: `parseDimension(string, unit)` accepts decimals, fractions (`"3/4"`), mixed numbers (`"1 1/2"`, `"1-1/2"`), feet+inches (`"1' 6\""`, `"1ft 6in"`), and unit glyphs. Returns null on empty or unparseable input.
- **Formatting**:
  - `formatValue(value, unit, precision)` — bare number/fraction string, no suffix. Used by edit-prefill.
  - `formatDistance(um, unit, precision)` — takes `Micrometres`, returns the value plus unit suffix. Used by every display site.
  - `toFraction(value, denominator)` — internal building block; rounds to nearest `1/denominator` and reduces.

### Tolerance

Two fuzzy comparisons, with clearly-bounded reasons:

| Constant                                          | Value | Regime                                                                             |
| ------------------------------------------------- | ----- | ---------------------------------------------------------------------------------- |
| `GROUP_TOLERANCE_UM` (`utils/groupPartInfos.ts`)  | 1000  | Cluster raw mesh extents that should represent the same physical part.             |
| `STOCK_MATCH_TOLERANCE_UM` (`lib/utils/units.ts`) | 500   | Part↔stock identity (`stock-utils.ts`, `canFitOnAnyBoard.ts`). OBB drift absorber. |

`STOCK_MATCH_TOLERANCE_UM` applies **only** to part↔stock matching. Stock↔stock comparison (`areStocksEquivalent`, `isCompatibleLinearStock`) is exact integer equality because both sides come from YAML mm × 1000. Placement geometry (rectangle overlap, free-rect math) is also exact — packers work end-to-end in integer µm.

Why: glTF/OBB extraction drifts a few µm between instances of the same physical part. The cluster step (1 mm window) groups them, but the cluster leader is the smallest value in the group, so it lands a few µm below the nominal YAML stock value. Without `STOCK_MATCH_TOLERANCE_UM`, every part of a clustered thickness becomes a leftover.

`Config.placementEpsilon`, `isNearlyEqual`, the relative-magnitude `floating-point-utils.ts` are all gone. The two tolerances above are the only fuzzy comparisons left, both with names that describe what they do.

### The settings layer — `web/composables/useProjectSettings.ts`

`distanceUnit` and `precision` are reactive writable computeds. `precision` is `Ref<Precision>` (never undefined — falls back to the unit's default when no project is loaded). Flipping `distanceUnit` resets `precision` to that unit's default in the same write — fractional precision in mm and decimal-mm steps in inches are nonsense, so we don't try to carry one across. `bladeWidth` and `margin` are `Ref<Micrometres | undefined>`.

### The display layer — `web/composables/useFormatDistance.ts`

`useFormatDistance()` returns a function: pass `Micrometres`, get the formatted string at the user's unit + precision. Every display site goes through this.

### The input layer — `web/composables/useDimensionInput.ts`

`useDimensionInput(um, unit, precision)` returns `{ input: Ref<string>, commit: () => void }`. Wire `<UInput v-model="input" @blur="commit" />`. Storage is never mutated by formatting; the user types freely and storage updates as they type, but the input string itself isn't reformatted while focused. `commit()` (on blur) reformats from storage to canonical at the active precision — matching SketchUp / Fusion behaviour.

### Adding a new dimension input

1. Hold the value as `Ref<Micrometres | null>`.
2. Wire `useDimensionInput(um, unit, precision)`.
3. Bind the returned `input` to a `<UInput type="text">` and `commit` to its `@blur`.
4. Read `um.value` for engine / storage purposes.

Never call `formatDistance` for an editable field — the input layer owns the round-trip.

## Telemetry & Analytics

All third-party data collection is currently **disabled**. There are three independent sources, each with its own off switch:

| Source              | What it did                        | Disabled via                                                                                                      | Re-enable                                                      |
| ------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Nuxt telemetry**  | Anonymous framework usage stats    | `telemetry: false` in `web/nuxt.config.ts`                                                                        | Remove the line (or set `true`)                                |
| **SimpleAnalytics** | Page-view script (production only) | Removed the `<script>` entry from `app.head` in `web/nuxt.config.ts`                                              | Re-add the `simpleanalyticscdn.com/latest.js` script tag       |
| **Sentry**          | Error reporting + feedback widget  | `SENTRY_ENABLED = false` guard in `web/sentry.client.config.ts`; `feedbackEnabled = false` in `ProjectTopBar.vue` | Flip both flags to `true` and provide `NUXT_PUBLIC_SENTRY_DSN` |

Sentry is **hard-disabled, not removed**: the SDK module, the scattered `Sentry.captureException/captureMessage/logger` calls, and the feedback handlers all remain in place. When the SDK is never initialized those calls are harmless no-ops, and the "Report an issue" buttons are hidden behind `feedbackEnabled`. The `about`/`terms` pages still describe Sentry as the error-reporting backend — update that copy if the disable becomes permanent.

## Documentation & Help Panels

Each major tab has a collapsible "how it works" side panel backed by a dedicated content component:

| Tab    | Side panel title    | Content component                                   |
| ------ | ------------------- | --------------------------------------------------- |
| BOM    | "How the BOM works" | `web/components/project/bom/BomHelpContent.vue`     |
| Stock  | "How stock works"   | `web/components/project/stock/StockHelpContent.vue` |
| Layout | "How layouts work"  | `web/components/layout/LayoutHelpContent.vue`       |

**When to update help content:** Any time you add, remove, or rename a feature that is described in one of these panels, update the corresponding content component. Treat the help panels as user-facing documentation — they must stay accurate.

**Key facts that are easy to get wrong:**

- **Blade kerf** is configured in the Layout tab toolbar (labeled "Blade"), not in Settings.
- **Material allowance** (length and cross-section) is for **timber (linear stock) only**. It is per-part and configured in the Stock tab per linear stock entry.
- **Margin** is for **sheets only**. It is a global edge inset on each board (not per-part) and is configured in the Layout tab toolbar.
- Cut mode (Auto/Tidy/Compact/CNC) is a Layout tab setting.
- **Edge banding** (F7) is marked per-part from the BOM tab (the dashed-edge popover on each row). The project-level "subtract banding thickness" toggle, default thickness, and cost-per-length live in the Layout tab's Optimization settings popover. Banding length + cost appear in the sheet shopping list and PDF. The math is a pure helper (`web/lib/utils/edgeBanding.ts`); cut-size subtraction is applied at the Part→PartToCut boundary in `useBoardLayoutsQuery.ts`. The cost-per-length rate is a display-only localStorage UI setting (`STORAGE_KEYS.ui.projectBandingCostPerLength`), not an IDB field — it doesn't affect packing, so no schema bump.

**Side panel pattern:** Each tab's panel uses `ViewerSidePanel` with a `helpCollapsed` ref backed by `localStorage` (keyed per-project). See `web/components/project/tabs/StockTab.vue` for the canonical implementation. The collapse state is persisted via `STORAGE_KEYS.ui` in `web/utils/localStorage.ts`.

## Key Config Files

- `web/nuxt.config.ts` — Nuxt config (SSR off, modules)
- `web/tailwind.config.ts` — custom color palette
- `web/app.config.ts` — Nuxt UI theme
- `cutlist.config.yaml` — user-facing defaults (stock materials, blade width, optimization modes)
- `web/docs/viewer-design.md` — index of viewer / scenes / annotations design specs
