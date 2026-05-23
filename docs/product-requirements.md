# Cutlist — Product Requirements (EARS)

> **Status:** Draft v1 for review · **Owner:** Product (supervisor synthesis) · **Date:** 2026-05-23
> **Method:** Six-reviewer parallel review (2 product leads, 1 competitive researcher, 2 UX/UI, 1 durability lead) → supervisor critique + codebase verification → prioritized EARS requirements with acceptance tests.

EARS keywords used: **Ubiquitous** (`The system shall…`), **Event** (`When … the system shall…`), **State** (`While … the system shall…`), **Unwanted** (`If … then the system shall…`), **Optional** (`Where … the system shall…`).

---

## 1. Review method & the team

| Reviewer  | Lens                                | Headline thesis                                                                                              |
| --------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| PL-Growth | Activation / onboarding             | Collapse time-to-first-cut-plan; manual & template paths are underinvested.                                  |
| PL-Pro    | Power-user / shop economics         | Optimizer is the moat; monetize via cost/yield, labels, cut sequence.                                        |
| CR-Market | Competitive benchmark               | Labels + edge-banding are missing table-stakes; 3D-import→scene→build-doc is the only defensible wedge.      |
| UX-IA     | Information architecture / a11y     | Scattered settings + exact-string matching + broken ARIA cause silent failures; help panels paper over them. |
| UX-Viz    | Visualization / direct manipulation | Output is a "rectangle dump," not a cut plan; no cut lines, kerf, or sequence.                               |
| TR-Trust  | Durability / reliability            | IndexedDB-only with no persist/backup = guaranteed data loss; substrate before features.                     |

## 2. Supervisor critique (pushback applied before requirements were written)

Claims were verified against the codebase. Three were corrected, which changed the backlog:

1. **"New projects have empty stock" (PL-Growth) — REJECTED.** `addProject` already seeds `getDefaultStocks(unit)` (`web/composables/useProjects/useProjectCollection.ts:72`). The empty-stock dead-end does not exist. Requirement dropped.
2. **"Cut sequence already exists in the placement tree, just surface it" (PL-Pro, UX-Viz) — REJECTED AS STATED.** `SheetBoardLayout.placements[]` stores only final rectangle coordinates (`leftUm/rightUm/topUm/bottomUm`, `web/lib/types.ts:306`). No cut tree, no ordering. Surfacing a sequence requires the **guillotine packers to emit an ordered cut tree during packing**, and is **undefined for non-guillotine (CNC/Compact-tight) placements**. Re-scoped to guillotine modes with an explicit fallback (FR-CUT-\* below). Effort raised S→L.
3. **"Cost data is the top monetization lever" (PL-Pro) vs "cost/quoting is entrenched-competitor turf" (CR-Market) — SPLIT THE DECISION.** Yield **reporting** (used ÷ purchased area) is cheap, schema-free, and universally expected → P0. Adding a `cost` field + currency + totals → P0 (small). **Cost-_driven optimization_** (changing which stock the engine buys) is a large optimizer change with a fuzzy "correct" answer → deferred to P2/backlog, not in the "first-time-correct" tier.
4. **Durability claims — CONFIRMED.** No `navigator.storage.persist()` / `estimate()` anywhere; import is non-atomic; export is active-project-only. These stand as P0.
5. **Doc-drift flagged (non-blocking):** `SCHEMA_VERSION = 8` (`web/utils/versions.ts:19`) but `CLAUDE.md` says "Current schema: v5." Update the doc.
6. **Convergence is the strongest signal.** Labels (3 reviewers), cut-sequence (2), yield/cost (2), offcut inventory (2), edge-banding (2). These dominate the priority order over any single reviewer's pet feature.

## 3. Prioritized feature list

| ID  | Feature                                                                                  | Drivers            | Effort | Tier   |
| --- | ---------------------------------------------------------------------------------------- | ------------------ | ------ | ------ |
| F1  | Part-label / cut-sticker PDF export                                                      | PL-Pro, CR, UX-Viz | M      | **P0** |
| F2  | Material yield + cost reporting                                                          | PL-Pro, CR         | S/M    | **P0** |
| F3  | Storage durability bundle (persist, meter, atomic import, export-all)                    | TR                 | M      | **P0** |
| F4  | Material-match recovery (fuzzy suggest + alias)                                          | UX-IA              | S/M    | **P0** |
| F5  | Cut-sequence cut-line rendering (guillotine modes)                                       | UX-Viz, PL-Pro     | L      | **P1** |
| F6  | Board-diagram legibility: kerf + offcut/waste distinction                                | UX-Viz             | M      | **P1** |
| F7  | Edge-banding model                                                                       | PL-Pro, CR         | S/M    | **P1** |
| F8  | Persistent cross-project offcut inventory                                                | PL-Pro, CR         | M      | **P1** |
| F9  | Accessibility & IA hygiene (ARIA tablist, labeled controls, contrast, unit-flip warning) | UX-IA              | S      | **P2** |
| F10 | Onboarding (manual-first landing entry, paste thickness column, seed Plans library)      | PL-Growth          | S/M    | **P2** |

Deferred (explicitly out of "first-time-correct" scope): cost-driven multi-stock selection; cloud sync (reconcile with no-account privacy wedge via share-by-link first); DXF/SVG CNC export; STEP/SKP importers.

---

## 4. Detailed requirements (EARS) with acceptance tests

Test layers follow repo convention (`web/lib/__tests__`, `web/utils/__tests__`, `web/composables/__tests__`, `web/components/**/__tests__`). All tests must be **outcome-based** (assert produced artifacts/state), not mock-shape introspection, per `CLAUDE.md`.

---

### F1 — Part-label / cut-sticker PDF export · P0 · M

**Why:** The bridge from plan → physical cut. CutList Optimizer, OpenCutList, MaxCut, CutList Plus fx all ship it; Cutlist's PDF currently has none. Daily-driver workflow for the retained user.

**FR-LBL-1 (Event).** When the user activates "Export labels" on the Layout tab, the system shall generate a PDF whose pages are a fixed grid of label cells.

**FR-LBL-2 (Ubiquitous).** The system shall emit **one label cell per physical part instance**, i.e. a BOM line of quantity _q_ produces _q_ identical-content label cells (each carrying its own board assignment).

**FR-LBL-3 (Ubiquitous).** Each label cell shall contain: part name, part number, finished dimensions (length × width × thickness in the project's display unit + precision), material name, and the board identifier it is cut from.

**FR-LBL-4 (State).** While a part has grain locked or a known grain orientation, the label cell shall render a grain-direction arrow aligned to the part's long axis.

**FR-LBL-5 (Optional).** Where the user selects a label-stock preset (e.g. Avery 5160 / 30-up, Avery 5163 / 10-up), the system shall lay out cells to that preset's cell dimensions and page margins.

**FR-LBL-6 (Unwanted).** If no board layouts have been generated yet, then the system shall disable the "Export labels" action and show the reason ("Generate a layout first").

**FR-LBL-7 (Ubiquitous).** Label text shall use the same `formatDistance(um, unit, precision)` pipeline as the rest of the app so units/precision are consistent across BOM, layout, and labels.

**Acceptance tests**

- `web/utils/pdf/__tests__/labels.test.ts`
  - _Instance count:_ Given a BOM with parts {A ×3, B ×1}, when labels are generated, then the produced cell array has length 4. (Covers FR-LBL-2 — guards against the "1 label per BOM line" bug.)
  - _Content completeness:_ Given part A (name "Side", #2, 600×300×18 mm, material "Plywood", board "Sheet 1"), when its cell is built, then the cell's text content includes all six fields. (FR-LBL-3)
  - _Unit consistency:_ Given project unit = inch, precision = 1/16", when a 304.8 mm dimension is rendered, then the cell shows `12"` (not mm). (FR-LBL-7)
  - _Grain arrow:_ Given a part with `grainLock = true`, when the cell is built, then a grain-arrow glyph/path is present; given an unconstrained part, then it is absent. (FR-LBL-4)
  - _Avery layout:_ Given preset Avery-5160, when paginating 35 labels, then page 1 holds 30 cells and page 2 holds 5, at the preset's cell pitch. (FR-LBL-5)
- `web/components/layout/__tests__/…` (component): Given zero layouts, when the toolbar renders, then the "Export labels" control is `disabled` and exposes the disabled reason. (FR-LBL-6)

---

### F2 — Material yield + cost reporting · P0 · S/M

**Why:** Converts "cut planner" into "job estimator." Yield % is derivable from data the scorer already computes; a `cost` field is a small schema add. Reaches table-stakes parity (MaxCut, CutList Plus fx, OpenCutList) without entering cost-driven-optimization territory.

**FR-YLD-1 (Ubiquitous).** For each (material, thickness) group, the system shall compute and display **yield %** = total placed part area ÷ total purchased board area, where purchased area counts whole boards consumed (not partial).

**FR-YLD-2 (Ubiquitous).** The system shall display, per material group, the count of boards consumed split by tier (offcut vs general/"buy") using the existing `SheetBoardLayoutStock.role` / `LinearBoardLayoutStock.role` field (`web/lib/types.ts:268,281`).

**FR-COST-1 (Optional).** Where a stock size has a `cost` value (new optional `cost?: number` on the stock-size schema, currency-agnostic numeric), the system shall display per-material material cost = Σ(boards bought of that size × cost) and a project total.

**FR-COST-2 (State).** While no stock size in a material group has a `cost`, the system shall omit the cost column for that group (yield still shown) rather than rendering `$0` or `NaN`.

**FR-COST-3 (Ubiquitous).** Yield % and cost totals shall appear both in the on-screen shopping list (`web/components/plans/SheetShoppingList.vue`) and in the exported PDF shopping/summary section (`web/utils/pdf/sheets.ts`).

**FR-COST-4 (Unwanted).** If a `cost` value is negative or non-finite, then the system shall reject the input at the Stock-tab entry boundary and retain the prior value.

**Acceptance tests**

- `web/lib/__tests__/yield.test.ts` (pure, engine output):
  - _Yield math:_ Given one 1220×2440 mm sheet with placements summing 1.4886 m², when yield is computed, then result = 50% (±0.5pp). (FR-YLD-1)
  - _Whole-board denominator:_ Given parts that fill 10% of a 2nd sheet, when yield is computed, then the denominator counts 2 full sheets (not 1.1). (FR-YLD-1 — guards the partial-sheet mistake.)
  - _Tier split:_ Given a layout consuming 1 offcut + 2 general boards, when tallied, then `{offcut:1, buy:2}`. (FR-YLD-2)
- `web/composables/__tests__/…` or pure cost util:
  - _Cost total:_ Given Plywood 18 mm @ cost 60 and 3 boards bought, when summed, then material cost = 180 and contributes 180 to project total. (FR-COST-1)
  - _No-cost group:_ Given a group with no `cost`, when the report builds, then its cost field is `undefined` and excluded from the total. (FR-COST-2)
- `web/components/project/stock/__tests__/…`: Given a cost input of `-5` or `abc`, when committed, then the stored cost is unchanged and a validation message shows. (FR-COST-4)
- Migration test (`web/utils/projectImport/migrations/__tests__/v9.test.ts`): given a v8 stock record without `cost`, when migrated, then `cost` is absent/undefined and the record is otherwise unchanged. (Schema add — bump `SCHEMA_VERSION` per the CLAUDE.md migration checklist.)

---

### F3 — Storage durability bundle · P0 · M

**Why:** Highest-ROI risk reduction. Without `persist()`, Safari evicts script-writable storage after ~7 days idle; every project lives only in IndexedDB; import is non-atomic; export is one-project-at-a-time. New features only grow the footprint and the cost of loss.

**FR-DUR-1 (Event).** When the app boots and on first project creation, the system shall call `navigator.storage.persist()` (where the API exists) and record the resulting `persisted()` state.

**FR-DUR-2 (State).** While persistent storage has been denied or is unavailable, the system shall surface a one-time, dismissible banner explaining that work is stored only in this browser and should be exported to back up.

**FR-DUR-3 (Ubiquitous).** The system shall display current storage usage and quota (from `navigator.storage.estimate()`), and **While** usage ≥ 80% of quota the system shall show a proactive low-space warning **before** a write fails.

**FR-DUR-4 (Event).** When a `.cutlist.gz` import runs, the system shall perform all record writes (project, models, assets, scenes, annotations, build doc) inside a single Dexie `rw` transaction.

**FR-DUR-5 (Unwanted).** If any write during import fails (e.g. quota), then the system shall roll back the entire import leaving **zero** orphaned records, and surface the failure.

**FR-DUR-6 (Event).** When the user activates "Export all", the system shall produce a single archive containing every project, importable back to an equivalent set of projects.

**Acceptance tests**

- `web/composables/__tests__/storageDurability.test.ts` (fake-indexeddb + stubbed `navigator.storage`):
  - _Persist requested:_ Given a stubbed `storage.persist` recording calls into a typed array, when the app initializes, then the array has exactly one entry. (FR-DUR-1 — typed-array recorder, not `vi.fn` introspection.)
  - _Threshold warning state:_ Given `estimate()` returns usage/quota = 0.85, when the meter composable evaluates, then its `lowSpace` state is `true`; at 0.5 it is `false`. (FR-DUR-3)
- `web/utils/projectImport/__tests__/atomicImport.test.ts`:
  - _Rollback:_ Given an import where the 2nd model write throws, when import runs, then `projects`, `models`, and `assets` tables contain zero rows attributable to that import. (FR-DUR-5 — the core durability guarantee.)
  - _Happy path unchanged:_ Given a valid 2-project export and "Export all" → re-import into an empty DB, then both projects and their models round-trip with equal counts. (FR-DUR-6)

---

### F4 — Material-match recovery · P0 · S/M

**Why:** Exact-string part↔stock matching (`web/lib/utils/stock-utils.ts`) is the #1 silent-failure path. "Walnut" vs "walnut" vs "Walnut " produces an unexplained amber triangle and an empty layout. Today the only remedy is reading a help panel.

**FR-MAT-1 (Unwanted).** If a part's material has no exact stock match, then the system shall show the unmatched material string verbatim and, where a close stock name exists (case-insensitive equality or trimmed/whitespace match, then nearest by edit distance), suggest it: "No stock named 'Walnut'. Did you mean 'walnut'?".

**FR-MAT-2 (Event).** When the user accepts a suggestion, the system shall either (a) create a stock alias mapping the part material → existing stock name, or (b) rename, without requiring manual retyping, and the affected parts shall re-match and pack.

**FR-MAT-3 (Ubiquitous).** Matching shall continue to treat names as significant (no silent global case-folding of stored data); recovery is an explicit user action, preserving deterministic packing.

**Acceptance tests**

- `web/lib/utils/__tests__/stock-utils.test.ts`:
  - _Near-miss detection:_ Given part material "Walnut " (trailing space) and stock "Walnut", when computing match candidates, then "Walnut" is returned as the top suggestion. (FR-MAT-1)
  - _No false suggestion:_ Given material "Oak" with only "Plywood"/"MDF" stock, when computing candidates, then no suggestion is offered above the distance threshold. (FR-MAT-1 — guards noisy suggestions.)
- `web/composables/__tests__/…`: Given an alias "Walnut"→"walnut" is accepted, when layouts recompute, then previously-unplaced "Walnut" parts are placed. (FR-MAT-2)
- `web/components/bom/__tests__/…`: Given an unmatched material, when the BOM warning renders, then it emits/contains the suggestion text and an accept control. (FR-MAT-1)

---

### F5 — Cut-sequence cut-line rendering (guillotine modes) · P1 · L

**Why:** The product's reason to exist on the shop floor; without it the cut-complexity scoring is invisible. **Re-scoped after verification:** the layout output does **not** carry a cut tree, so this requires an engine change, and is only well-defined for guillotine layouts.

**FR-CUT-1 (Ubiquitous).** For guillotine packers (Tidy / guillotine-Compact), the engine shall emit an **ordered cut list** per board: a sequence of cuts, each tagged `rip` | `crosscut`, with its offset (µm) along the relevant axis and the sub-region it subdivides.

**FR-CUT-2 (Event).** When a board produced by a guillotine packer is displayed (on-screen and PDF), the system shall overlay numbered cut lines (Cut 1, 2, 3 …) matching the emitted order, visually distinguishing rip from crosscut.

**FR-CUT-3 (Unwanted / scope guard).** If a board's placements were produced by a non-guillotine packer (TightPacker / CNC), then the system shall NOT fabricate a guillotine sequence; it shall instead show "Free placement — no guillotine cut order" and render placement outlines only.

**FR-CUT-4 (Ubiquitous).** Emitted cut offsets shall account for blade kerf so that summing piece widths + kerfs along an axis reproduces the board dimension (no drift), using the existing integer-µm arithmetic.

**Acceptance tests**

- `web/lib/packers/__tests__/guillotineCutTree.test.ts`:
  - _Reconstructs board:_ Given a guillotine board of 2 columns × 2 parts, when the cut list is emitted, then replaying the cuts (with kerf) partitions the board into exactly the placed rectangles with zero leftover-dimension error. (FR-CUT-1, FR-CUT-4)
  - _Order validity:_ Given the emitted list, when applied in order, then every cut acts on a region that exists at that step (no cut references an already-subdivided edge out of order). (FR-CUT-1)
  - _Kerf accounting:_ Given kerf = 3 mm and two 300 mm parts ripped from a board, then the 2nd cut offset = 300 mm + 3 mm = 303 mm. (FR-CUT-4)
- `web/lib/packers/__tests__/tightNoSequence.test.ts`: Given a TightPacker board, when sequence is requested, then the result is the explicit "no guillotine order" sentinel (not an array). (FR-CUT-3 — guards against fabricated sequences.)
- `web/utils/pdf/__tests__/board.test.ts`: Given a board with a 3-cut list, when the PDF page is drawn, then 3 numbered cut-line primitives are emitted with rip/crosscut styling. (FR-CUT-2)

---

### F6 — Board-diagram legibility (kerf + offcut/waste) · P1 · M

**Why:** Gaps between parts currently read as ambiguous waste; the kerf the engine consumed is invisible, and leftover regions are unlabeled. Cheap, high shop-floor value, complements F5.

**FR-VIZ-1 (Ubiquitous).** On board diagrams (screen + PDF) the system shall render the blade-kerf gap between adjacent parts as a visually distinct strip, separable from leftover/offcut regions.

**FR-VIZ-2 (Ubiquitous).** The system shall label each leftover region with its dimensions (using `formatDistance`), so usable offcuts are identifiable at a glance.

**FR-VIZ-3 (Optional).** Where the user enables per-part coloring, a part shall keep a stable hue across the 3D viewer, the layout diagram, and the PDF (today PDF is grayscale-only).

**Acceptance tests**

- `web/utils/pdf/__tests__/board.test.ts`:
  - _Kerf distinct from waste:_ Given a board with kerf gaps and a leftover region, when drawn, then kerf strips and leftover regions use distinct styles (assert the two style tokens differ on the emitted primitives). (FR-VIZ-1)
  - _Leftover labeled:_ Given a 600×400 mm leftover, when drawn, then a dimension label "600 × 400 mm" primitive is emitted within that region. (FR-VIZ-2)
- `web/lib/__tests__/partColor.test.ts`: Given part #5, when its color is resolved for viewer and for PDF, then both return the same hue. (FR-VIZ-3 — guards drift between the two color paths.)

---

### F7 — Edge-banding model · P1 · S/M

**Why:** Cabinet doors/shelves need banded edges; banding is a real BOM line, cost, and a dimension adjustment. Universal in CutList Optimizer, OpenCutList, MaxCut, CutList Plus fx.

**FR-BND-1 (Optional).** Where edge banding is enabled for a part, the user shall be able to mark any subset of its 4 edges as banded (new optional `bandedEdges` on `PartOverride`, keyed by partNumber — no migration of existing rows required).

**FR-BND-2 (Ubiquitous).** The system shall report total banding length per project = Σ over parts (Σ banded-edge lengths × quantity), shown in the BOM/shopping list and PDF.

**FR-BND-3 (Optional).** Where banding has a cost-per-length, the system shall include banding cost in the project material total (depends on F2's currency handling).

**FR-BND-4 (State — explicit decision needed, flag for review).** Banding-vs-net-dimension behavior: by default the system shall treat marked edges as a **finish overlay** (net part size unchanged). _Open question for the team:_ whether to optionally subtract banding thickness from the cut size — defer until a woodworker validates the expected convention.

**Acceptance tests**

- `web/lib/__tests__/edgeBanding.test.ts`:
  - _Length sum:_ Given part 600×300, edges {one 600 long, one 300 long} banded, qty 2, then banding length = (600+300)×2 = 1800 mm. (FR-BND-2)
  - _Cost:_ Given banding length 1800 mm @ 0.01/mm, then banding cost = 18, added to project total. (FR-BND-3)
- `web/composables/__tests__/…`: Given `bandedEdges` set on a partOverride, when read back, then the selection persists; given an old record without it, when hydrated, then it defaults to no banded edges (read-path safety net). (FR-BND-1)

---

### F8 — Persistent cross-project offcut inventory · P1 · M

**Why:** Shops reuse big remnants across jobs. Cutlist already imports offcuts per-project and packs them before general stock (`StockRole`), but there is no inventory that survives across projects. Compounding material savings = recurring-value story.

**FR-OFC-1 (Event).** When a layout produces a leftover at or above a user-set minimum size, the system shall offer "Save to offcut inventory," writing a finite-quantity offcut stock entry to a project-independent store.

**FR-OFC-2 (Event).** When a new project's stock is assembled, the system shall make inventory offcuts available for selection, and the engine shall consume them before general stock (reusing existing offcut-tier behavior).

**FR-OFC-3 (Ubiquitous).** Consuming an inventory offcut in a committed layout shall decrement its quantity; quantity reaching 0 removes it from the available pool.

**FR-OFC-4 (Unwanted).** If two projects open concurrently both consume the same offcut, then the system shall prevent the quantity from going negative (last-writer reconciles against stored quantity).

**Acceptance tests**

- `web/composables/__tests__/offcutInventory.test.ts` (fake-indexeddb):
  - _Save & list:_ Given a 600×400 leftover saved with qty 2, when a new project lists offcut stock, then the entry appears with qty 2. (FR-OFC-1, FR-OFC-2)
  - _Decrement:_ Given qty 2 and one consumed, when committed, then stored qty = 1; consuming the last sets qty 0 and removes it from the available pool. (FR-OFC-3)
  - _No negative:_ Given qty 1 and two concurrent consume attempts, when both reconcile, then stored qty ≥ 0. (FR-OFC-4)
- `web/lib/__tests__/…`: Given an inventory offcut + general stock for the same material, when packing, then the offcut is filled before a general board is bought. (FR-OFC-2 — reuses existing tier ordering.)

---

### F9 — Accessibility & IA hygiene · P2 · S

**Why:** Concrete, cheap correctness fixes that block real users. Verified issues: ARIA tablist is incomplete; the optimization popover uses raw unlabeled checkboxes; `text-dim` contrast is borderline; unit-flip silently resets precision.

**FR-A11Y-1 (Ubiquitous).** The project workspace tabs (`web/components/project/workspace/ProjectWorkspaceNav.vue`) shall either implement a complete ARIA tablist (`aria-selected` on the active tab, `aria-controls` → `role="tabpanel"`, arrow-key navigation) **or** drop the `tab`/`tablist` roles and present as a plain navigation landmark. No partial tablist.

**FR-A11Y-2 (Ubiquitous).** Form controls in `OptimizationSettingsPopover.vue` shall use labeled, theme-consistent controls (associated `<label for>`/Nuxt UI `UCheckbox`), not bare `<input type="checkbox">` with an unassociated `<span>`.

**FR-A11Y-3 (Ubiquitous).** Body and label text colors shall meet WCAG AA (≥ 4.5:1) against their background; `text-dim` (mist-500) shall be reserved for non-essential decoration unless it passes AA on `bg-base`/`bg-surface`.

**FR-A11Y-4 (Event).** When the user changes `distanceUnit`, the system shall display an inline notice that display precision resets to the new unit's default (the reset already happens in `useProjectSettings.ts`; today it is silent).

**Acceptance tests**

- `web/components/project/workspace/__tests__/ProjectWorkspaceNav.test.ts`: Given the nav renders with tab 2 active, when inspected, then the active element has `aria-selected="true"` and the others `="false"` (or no `tab` role is present). (FR-A11Y-1)
- `web/components/layout/__tests__/OptimizationSettingsPopover.test.ts`: Given the popover renders, when querying checkboxes, then each has an associated accessible label. (FR-A11Y-2)
- Contrast: a unit test over the mist palette asserting computed contrast ratio of body/label tokens vs `bg-base` ≥ 4.5. (FR-A11Y-3)
- `web/components/project/tabs/__tests__/SettingsTab.test.ts`: Given unit changes mm→in, when the change commits, then the precision-reset notice is rendered. (FR-A11Y-4)

---

### F10 — Onboarding · P2 · S/M

**Why:** Median user has a tape measure, not a CAD export. Manual/template paths are positioned as consolation. **Note:** the "seed default stock" idea was dropped — it already happens. These three are the verified-real gaps.

**FR-ONB-1 (Event).** When a user lands on `web/pages/index.vue`, the system shall offer a "Start with a parts list" entry that creates a project and lands directly on an open, editable Add-Part row (≤ 2 clicks from landing to an editable row).

**FR-ONB-2 (Ubiquitous).** The paste-from-spreadsheet feature and its documented column template shall include **Thickness** (currently the help text lists Name, Quantity, Length, Width, Material — omitting the thickness that packing requires), and a pasted row with thickness shall round-trip into a placeable part.

**FR-ONB-3 (Ubiquitous).** The Plans library (`web/public/plans`, currently a single `workbench` plan) shall ship ≥ 6 starter plans surfaced as cards on the landing page; opening one yields an editable, layout-ready project.

**Acceptance tests**

- `web/components/…/__tests__/…` (landing): Given the landing page, when "Start with a parts list" is activated, then a project is created and the route lands on the BOM tab with an editable add-part row present. (FR-ONB-1)
- `web/components/project/bom/__tests__/…`: Given a pasted block `Side\t2\t600\t300\t18\tPlywood`, when parsed, then a part with thickness 18 mm is produced and matches default Plywood stock (no amber warning). (FR-ONB-2 — guards the silent-thickness-loss bug.)
- `web/utils/plans/__tests__/…`: Given the built plans index, when listed, then ≥ 6 plans are returned and each `loadPlan(slug)` resolves to a manifest with parts. (FR-ONB-3)

---

## 5. Cross-cutting requirements

**XR-1 (Ubiquitous).** Every requirement above that adds a persisted field (F2 `cost`, F7 `bandedEdges`, F8 offcut store) shall follow the `CLAUDE.md` schema-version procedure: bump `SCHEMA_VERSION`, add a Dexie `version(N).upgrade`, add a `migrations/v<N>.ts` defensive (never-throw) transform, update `applyDefaults`, and add per-version migration tests.

**XR-2 (Ubiquitous).** All new user-facing dimension display shall route through `useFormatDistance()` / `formatDistance`, and all editable dimension inputs through `useDimensionInput`, never ad-hoc formatting.

**XR-3 (Ubiquitous).** Help-panel content (`BomHelpContent`, `StockHelpContent`, `LayoutHelpContent`) shall be updated in the same change as any feature it documents (per `CLAUDE.md` "Documentation & Help Panels"). Net-new tabs and net-new help panels are disallowed without IA review (UX-IA ruling).

**XR-4 (Ubiquitous).** Every behavioral change ships with tests that pass the `CLAUDE.md` tautology check — outcome-based assertions, no mock-shape introspection, no Vue template-forwarding assertions.

## 6. Open questions for the next review round

1. **F7 banding convention** — overlay vs net-size subtraction; needs a woodworker's confirmation before locking FR-BND-4.
2. **Cost-driven optimization** (deferred) — is reaching parity with MaxCut/CutList Plus fx worth competing on their turf, or stay a free planner and double down on the 3D-import → scene → build-doc wedge (CR-Market)?
3. **Durability end-state** — share-by-link (no account) as the cross-device story vs full optional cloud sync; reconcile with the no-account privacy differentiator before scoping F3's successor.
4. **F5 ordering ambiguity** — a guillotine layout admits multiple valid cut orders; confirm the preferred convention (all rips first, then crosscuts? depth-first per column?) before implementation.
