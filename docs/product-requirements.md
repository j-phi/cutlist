# Cutlist — Product Requirements (EARS)

> **Status:** Draft v2 for review · **Owner:** Product · **Date:** 2026-05-23

EARS keywords used: **Ubiquitous** (`The system shall…`), **Event** (`When … the system shall…`), **State** (`While … the system shall…`), **Unwanted** (`If … then the system shall…`), **Optional** (`Where … the system shall…`). Every claim about current behavior is grounded in `file:line`. All acceptance tests are outcome-based (assert produced artifacts/state), per `CLAUDE.md`.

---

## 1. Scope notes

Decisions that bound scope (recorded so they are not relitigated):

- **F5 cut-sequence is guillotine-only.** The layout output stores only final rectangle coordinates (`web/lib/types.ts:306`), not a cut tree; an ordered sequence requires the guillotine packers to emit one during packing and is undefined for non-guillotine (CNC / tight) placements. F5 is scoped to guillotine modes with an explicit fallback (FR-CUT-3).
- **"Seed default stock" is not a feature.** `addProject` already seeds `getDefaultStocks(unit)` (`web/composables/useProjects/useProjectCollection.ts:72`), so F10 onboarding excludes it.
- **Yield reporting and cost optimization are separate tiers.** Yield % + a `cost` field (F2) are cheap and table-stakes (P0); cost-_driven_ stock selection (F11) is a larger optimizer change (P1, L).
- **Doc-drift to fix:** `SCHEMA_VERSION = 8` (`web/utils/versions.ts:19`) but `CLAUDE.md` says "Current schema: v5" — correct the doc on the next schema bump.

## 2. Prioritized feature list

| ID  | Feature                                                                                    | Effort | Tier   |
| --- | ------------------------------------------------------------------------------------------ | ------ | ------ |
| F1  | Part-label / cut-sticker PDF export                                                        | M      | **P0** |
| F2  | Material yield + cost reporting                                                            | S/M    | **P0** |
| F3  | Storage durability bundle (persist, meter, atomic import, export-all)                      | M      | **P0** |
| F4  | Material-match recovery (fuzzy suggest + alias)                                            | S/M    | **P0** |
| F5  | Cut-sequence cut-line rendering (guillotine modes)                                         | L      | **P1** |
| F6  | Board-diagram legibility: kerf + offcut/waste distinction                                  | M      | **P1** |
| F7  | Edge-banding model                                                                         | S/M    | **P1** |
| F8  | Persistent cross-project offcut inventory                                                  | M      | **P1** |
| F9  | Accessibility & IA hygiene (ARIA tablist, labeled controls, contrast, unit-flip warning)   | S      | **P2** |
| F10 | Onboarding (manual-first landing entry, paste thickness column, seed Plans library)        | S/M    | **P2** |
| F11 | Cost-driven optimization (objective enum + bounded stock-combination search)               | L      | **P1** |
| F12 | No-account project sharing (file share + fragment link + lean plan-only share)             | M      | **P1** |
| F13 | Layout alignment toolbar (left/right + top/bottom, rigid post-process)                     | S/M    | **P1** |
| F14 | Engineering dimension lines on PDF cut-outs (broken dim-line, centered text, anti-overlap) | M      | **P1** |
| F15 | Cost-vs-waste comparison strip (surfaces F11/F2 tradeoff for everyone)                     | S      | **P2** |
| F16 | Unsafe-sliver / minimum-usable-size guard                                                  | S      | **P2** |
| F17 | Layout freeze/commit snapshot with re-pack drift warning                                   | M      | **P2** |
| F18 | Theme cycler (light / dark / lark) + theme-aware design tokens                             | M      | **P2** |
| F19 | Mobile responsiveness gaps (help-panel drawer, layout overlays, touch targets)             | S/M    | **P2** |
| F20 | Layout/PDF label-text policy (horizontal-first + wrap, rotate last; placement config)      | S/M    | **P1** |

Deferred / Backlog (out of current scope): cloud sync (the no-account share story F12 is the cross-device answer instead); DXF/SVG CNC export; STEP/SKP importers; "snap-to-fence" direct-manipulation alignment (revisit only if F13 usage shows frequent alignment changes).

---

## 3. Detailed requirements (EARS) with acceptance tests

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

**FR-CUT-5 (Optional — cut-order convention).** A guillotine board admits multiple valid cut orders. The user shall be able to choose the ordering strategy via a per-project setting; the system shall **default to all rips first, then crosscuts** (group every full-length rip across the board before any crosscut subdivides a strip), matching the table/track-saw workflow of breaking a sheet into strips and then crossing each strip. The emitted `rip`/`crosscut` tags (FR-CUT-1) and ordering (FR-CUT-2) follow the chosen strategy.

**FR-CUT-6 (Event — numbered cut callouts).** When a guillotine board is displayed (screen + PDF), the system shall draw a small ordinal badge (①②③…) on each cut line matching the emitted order, plus an ordered "Cut sequence" legend listing each cut's type (rip/crosscut) and offset-from-datum via `formatDistance`. For non-guillotine boards this is suppressed (per FR-CUT-3).

**Acceptance tests**

- `web/lib/packers/__tests__/guillotineCutTree.test.ts`:
  - _Reconstructs board:_ Given a guillotine board of 2 columns × 2 parts, when the cut list is emitted, then replaying the cuts (with kerf) partitions the board into exactly the placed rectangles with zero leftover-dimension error. (FR-CUT-1, FR-CUT-4)
  - _Order validity:_ Given the emitted list, when applied in order, then every cut acts on a region that exists at that step (no cut references an already-subdivided edge out of order). (FR-CUT-1)
  - _Kerf accounting:_ Given kerf = 3 mm and two 300 mm parts ripped from a board, then the 2nd cut offset = 300 mm + 3 mm = 303 mm. (FR-CUT-4)
- `web/lib/packers/__tests__/tightNoSequence.test.ts`: Given a TightPacker board, when sequence is requested, then the result is the explicit "no guillotine order" sentinel (not an array). (FR-CUT-3 — guards against fabricated sequences.)
- `web/utils/pdf/__tests__/board.test.ts`: Given a board with a 3-cut list, when the PDF page is drawn, then 3 numbered cut-line primitives are emitted with rip/crosscut styling. (FR-CUT-2)
- `web/lib/packers/__tests__/guillotineCutTree.test.ts`: Given a board with 2 rips and 4 crosscuts and the default `rips-first` strategy, when the cut list is emitted, then all `rip` cuts have lower ordinals than every `crosscut`; given the alternate strategy, then ordering differs accordingly. (FR-CUT-5 — assert on emitted ordinal/tag sequence, not a mock.)
- `web/utils/pdf/__tests__/board.test.ts`: Given a guillotine board with a 3-cut list, when drawn, then 3 ordinal-badge primitives are emitted matching the order and a 3-row legend is produced; given a TightPacker board, then zero badges and no legend. (FR-CUT-6)

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

**FR-BND-4 (Optional — overlay default).** Where the project-level "subtract banding thickness" toggle is OFF (default), the system shall treat banded edges as a **finish overlay** and feed the part's nominal finished size to the packer unchanged.

**FR-BND-5 (State — cut-size subtraction).** While the "subtract banding thickness" toggle is ON, the system shall compute each banded part's **cut size** by subtracting the resolved banding thickness once per banded edge from the dimension that edge runs across — banded **length-edges reduce `width`**, banded **width-edges reduce `length`**, `thickness` unchanged — and feed the **cut size** to the packer. Mapping: `cutWidth = finishedWidth − (bandedLengthEdgeCount × t)`, `cutLength = finishedLength − (bandedWidthEdgeCount × t)`, with each count in `{0,1,2}`.

**FR-BND-6 (Ubiquitous — thickness resolution).** The system shall resolve banding thickness as the per-part override (`bandingThicknessUm` on `PartOverride`) when set, else the project default (`bandingThicknessUm` on `IdbProject`), else zero, using integer-micrometre arithmetic so the cut dimension is exact and deterministic across recomputes, and so a banding change participates in the layout-cache fingerprint.

**FR-BND-7 (Unwanted — zero-clamp).** If subtracting banding would drive a cut dimension to ≤ 0 µm, then the system shall reject the banding configuration at the input boundary, retain the prior value, and surface the reason.

**FR-BND-8 (Optional — dual display).** Where the toggle is ON, the BOM, labels, and PDF shall be able to display both the **finished** size (nominal) and the **cut** size (post-subtraction), distinctly labelled, routed through `formatDistance`.

**Acceptance tests**

- `web/lib/__tests__/edgeBanding.test.ts`:
  - _Length sum:_ Given part 600×300, edges {one 600 long, one 300 long} banded, qty 2, then banding length = (600+300)×2 = 1800 mm. (FR-BND-2)
  - _Cost:_ Given banding length 1800 mm @ 0.01/mm, then banding cost = 18, added to project total. (FR-BND-3)
  - _Both length-edges, toggle ON:_ Given a 600(len)×300(width) part, banding 1 mm, both 600-edges banded, toggle ON, then the resolved `PartToCut.size.width === mmToUm(298)`, `size.length === mmToUm(600)`, `size.thickness` unchanged. (FR-BND-5 — assert the dimension actually constructed at the Part→PartToCut boundary in `useBoardLayoutsQuery.ts`.)
  - _One width-edge, toggle ON:_ Given the same part, one 300-edge banded, 1 mm, then `size.length === mmToUm(599)`, `size.width === mmToUm(300)`. (FR-BND-5)
  - _Toggle OFF:_ Given any banded edges, toggle OFF, then `size` deep-equals nominal `part.size`. (FR-BND-4 — guards the default.)
  - _Per-part override beats project default:_ Given project default 1 mm and part override 2 mm, both length-edges banded, ON, then `size.width === finished − mmToUm(4)`. (FR-BND-6)
  - _Determinism / cache:_ Given a banded config, the fingerprint of `{parts, stock, config}` differs from the unbanded fingerprint, and two consecutive resolutions produce `===`-equal cut sizes. (FR-BND-6)
- `web/composables/__tests__/…`: Given `bandedEdges` set on a partOverride, when read back, then the selection persists; given an old record without it, when hydrated, then it defaults to no banded edges (read-path safety net). (FR-BND-1)
- `web/components/project/stock/__tests__/…` (or BOM input boundary): Given width 300, banding 200, both length-edges banded, when the config is committed, then the stored banding is unchanged and a validation message shows. (FR-BND-7 — assert stored value + emitted error, not a mock.)

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

### F11 — Cost-driven optimization · P1 · L

**Why:** With a `cost` field (F2), the engine can buy the cheapest set of stock that still cuts all parts — e.g. two cheaper small sheets instead of one expensive large one. **Grounding:** the scorer `compareLayoutScores` (`web/lib/packers/layout-score.ts:29`) is a strict lexicographic chain (boardsUsed → wasteArea → wasteConcentration → cutComplexity) with **no cost term**; `placeAllParts` (`web/lib/index.ts:404`) opens boards largest-first and `minimizeLayoutStock` (`:626`) only shrinks each board individually — there is no global "is two small sheets cheaper than one big sheet" decision today. Cost is a **selectable objective**, not a weighted blend (unexplainable, untestable) and not a low tie-break tier (cost only matters when it can outrank board count).

**FR-COPT-1 (Optional).** Where a stock size carries a finite, positive `cost`, the system shall compute per layout `materialCost` = Σ over `role === 'general'` boards used of that board's stock-size `cost` (offcuts are already-owned and contribute 0), and expose it on the layout score.

**FR-COPT-2 (Optional).** Where the project's optimization objective is `cost` **and** every usable stock size in a (material, thickness) group has a `cost`, the system shall rank that group's candidate layouts by `materialCost` first, breaking ties by the existing chain.

**FR-COPT-3 (Unwanted).** If the objective is `cost` but at least one usable stock size in a group lacks a finite, positive `cost`, then the system shall fall back to the default `boards`-first ranking **for that group only** and shall not treat a missing cost as 0.

**FR-COPT-4 (State — bounded search).** While the objective is `cost`, the engine shall evaluate a **bounded** set of stock-size combinations per group (≤ K candidate single-size and two-size combinations, K a documented constant) beyond the largest-first board-count-optimal candidate, so a cheaper multi-small-sheet solution is reachable without unbounded runtime.

**FR-COPT-5 (Ubiquitous — determinism).** The system shall produce identical layouts for identical `{parts, stock, config}` regardless of stock input order: equal-cost candidates and cost ties shall be broken by a total order (stock size desc, then stock `name`).

**FR-COPT-6 (Ubiquitous — setting).** The optimization objective shall be a persisted per-project setting (`optimizationObjective: 'boards' | 'waste' | 'cost'`, default `'boards'`) on `Config` and `IdbProject`, surfaced in the Layout-tab optimization popover, and shall participate in the layout-cache fingerprint.

**FR-COPT-7 (State).** While no stock in the project has any `cost` data, the system shall disable (or hide) the `cost` objective option and present the reason.

**Acceptance tests**

- `web/lib/packers/__tests__/layout-score.test.ts`: Given two layouts on stock priced 60 and 25, `materialCost === 85`; given a layout whose sizes have no cost, `materialCost === undefined` (not 0). (FR-COPT-1)
- `web/lib/__tests__/costOptimization.test.ts`:
  - _Cheaper multi-small wins:_ Given a 1220×2440 sheet @ 100 and 1220×1220 @ 30, parts that fit on two small sheets, objective `cost`, then the produced `BoardLayout[]` uses two small sheets (cost 60), not one large (100). (FR-COPT-2)
  - _Missing-cost fallback:_ Given the large sheet priced and the small sheet's cost `undefined`, objective `cost`, then the result equals the `boards` result (one large sheet) — the small sheet was not treated as free. (FR-COPT-3)
  - _Bounded exploration:_ Given parts that fill 1.4 small sheets, objective `cost`, then ≥2 small sheets appear in candidates and the chosen board sizes are the small size (proves exploration beyond largest-first). (FR-COPT-4)
  - _Order-independence:_ Given identical parts + stock fed in two different orders, the two `BoardLayout[]` results are deep-equal. (FR-COPT-5)
- `web/utils/projectImport/migrations/__tests__/v<N>.test.ts`: a project record without `optimizationObjective` migrates to `'boards'`, no other field changes. Plus a fingerprint test: two configs differing only in `optimizationObjective` produce different fingerprints. (FR-COPT-6)
- `web/components/layout/__tests__/OptimizationSettingsPopover.test.ts`: with no `cost` data the `cost` option is `disabled` with a reason; with ≥1 cost value it is enabled. (FR-COPT-7)

**Dependencies & phasing:** blocks on **F2's `cost` field** + validation. The objective enum + plumbing + popover control (FR-COPT-6/7) and the `materialCost` scorer term (FR-COPT-1/2) can be built in parallel with F2 against synthetic stock. The **bounded stock-combination search (FR-COPT-4)** is the L-effort core and is sequenced after the scorer term — implement as an outer wrapper around the multi-pass search that runs only when objective is `cost`. Carry `cost` through `reduceStockMatrix` (`web/lib/index.ts:224`) so it survives the mm→µm reduction.

---

### F12 — No-account project sharing · P1 · M

**Why:** The cross-device / hand-off story, privacy-first and account-free. **Grounding:** `useExportProject.exportProject()` already builds a version-stamped `ProjectExport`, gzips it, and downloads a `.cutlist` file (`web/composables/useExportProject.ts:153-172`); import reverses via `gzipDecompress` → `parseProjectExport` (migrate + strict Zod) → `importProjectData` with fresh ids (`web/utils/projectImport/index.ts:425-449`). The 3D `rawSource` glTF and base64 image assets are embedded whole (`useExportProject.ts:82-115`) — the heavy payloads. Object-store/server upload is **rejected**: it would move data off-device, contradicting the no-account privacy decision.

**FR-SHARE-1 (Event — file share).** When the user activates "Share project," the system shall produce the same gzipped `.cutlist` artifact as `exportProject`, offered via `navigator.share({files})` where available and falling back to a download otherwise.

**FR-SHARE-2 (Ubiquitous — round-trip fidelity).** A project exported and re-imported shall reconstruct an equivalent project: equal name, stocks, settings (`bladeWidth`, `margin`, `precision`, `distanceUnit`, `defaultAlgorithm`), `colorMap`, model parts/`rawSource`, scenes, annotations, build-doc content, and assets — modulo freshly-assigned ids.

**FR-SHARE-3 (Optional — fragment link).** Where the compressed payload is ≤ `MAX_FRAGMENT_BYTES` (default 16 KB), the system shall offer "Copy share link," encoding the gzip blob as base64url in the URL **fragment** (`#p=…`).

**FR-SHARE-4 (Unwanted — privacy guarantee).** If a share link is generated, then no project data shall be transmitted to any server: the payload shall reside solely in the URL fragment and shall never be placed in a query string, request body, or analytics event.

**FR-SHARE-5 (Unwanted — size fallback).** If the compressed payload exceeds `MAX_FRAGMENT_BYTES`, then the system shall NOT generate a link and shall direct the user to file-export instead, naming the reason ("too large to link — projects with 3D models or images must be shared as a file").

**FR-SHARE-6 (Event — fragment decode).** When the app loads a URL containing a `#p=` fragment, the system shall decode it, run it through the existing `parseProjectExport` (migrate + Zod) path, and strip the fragment from the URL.

**FR-SHARE-7 (Unwanted — hostile/legacy/future fragment).** If a `#p=` fragment fails base64url decode, gzip decompression, Zod validation, or version gating, then the system shall reject it with the same user-readable error surface as file import (`FutureSchemaError` / `LegacyExportError` / Zod summary) and import nothing.

**FR-SHARE-8 (Ubiquitous — atomicity).** Both file and fragment import shall write through the single-transaction import path mandated by FR-DUR-4/-5; a failed share-import shall leave zero orphaned records.

**FR-SHARE-9 (Optional — lean plan-only share).** Where the user selects "Share cut list only," the system shall export a stripped payload omitting `rawSource` glTF and image assets (parts + stock + settings + layout only), clearly labelled "cut list only," so model-derived projects fit under the fragment threshold.

**FR-SHARE-10 (Unwanted — confirm before import).** If a project arrives via a `#p=` fragment, then the system shall NOT write it to IndexedDB on load; it shall present a preview (project name + summary) and import only on explicit user confirmation, so a link never silently mutates the user's data.

**Acceptance tests**

- `web/utils/projectImport/__tests__/round-trip.test.ts`: Given a payload with a model, 1 scene, 1 annotation, a build doc referencing 1 asset, when serialized → `parseProjectExport` → `importProjectData` against `makeIdbMock`, then imported records deep-equal the source on the listed fields and the build-doc asset reference resolves to the remapped asset id. (FR-SHARE-2)
- `web/utils/shareLink/__tests__/fragment.test.ts`: `encodeFragment(payload)` → `decodeFragment` deep-equals input and length ≤ ceiling (FR-SHARE-3); oversized payload → `{ tooLarge: true }`, no string (FR-SHARE-5); `"#p=not-valid!!"` → user-readable error, no project (FR-SHARE-7).
- `web/middleware/__tests__/shareFragment.test.ts`: when `encodeFragment` runs, the payload appears only after `#` and the analytics recorder array / `location.search` stay empty of payload bytes (FR-SHARE-4); processing a `#p=` URL leaves `location.hash` empty after handling (FR-SHARE-6); a fragment-arrived project is NOT written until a confirm action fires, and a preview object is exposed first (FR-SHARE-10).
- `web/utils/projectImport/__tests__/atomicImport.test.ts` (shared with F3): a share-import whose 2nd model write throws leaves zero rows from that import. (FR-SHARE-8)
- `web/components/project/__tests__/ProjectTopBar.test.ts`: with `navigator.share` stubbed (typed-array recorder) and present, "Share" records one entry carrying a `.cutlist` file; absent, a download anchor is created. (FR-SHARE-1)

**Dependencies & phasing:** **F3 atomic import (FR-DUR-4/-5) blocks FR-SHARE-8 and gates a clean FR-SHARE-2.** Sequence **F3 → FR-SHARE-1/2 (file share, Phase 1) → FR-SHARE-3..10 (fragment + lean + confirm, Phase 2)**. Both paths reuse the existing migration registry (`web/utils/projectImport/migrations/index.ts`), so version gating is inherited.

---

### F13 — Layout alignment toolbar · P1 · S/M

**Why:** Word-processor-style controls letting users push packed parts to a chosen corner of each board (left/right + top/bottom). **Grounding:** placements live in a board-local frame, origin bottom-left, as `leftUm/rightUm/topUm/bottomUm` (`web/lib/types.ts:306-315`); the usable area is inset by `marginUm` on all edges (`web/lib/index.ts:513-520`) and inter-part kerf gaps are baked into the coordinates (`web/lib/index.ts:716`). Alignment is implemented as a **rigid post-process translation** of the whole placed cluster to the chosen corner — NOT a packing change — so guillotine cut validity, kerf, and yield are all preserved. It is purely presentational (it does not improve packing); this must be stated in `LayoutHelpContent.vue`.

**FR-ALN-1 (Ubiquitous).** The system shall provide, in the Layout toolbar, a horizontal-alignment control (left / right) and a vertical-justification control (top / bottom) for sheet board layouts.

**FR-ALN-2 (Event).** When the user selects an alignment, the system shall translate every placement on each sheet board as a single rigid block to the chosen corner of that board's usable area (edges inset by `marginUm`), preserving all inter-part offsets and kerf gaps, without re-running the packer.

**FR-ALN-3 (Ubiquitous — default & persistence).** The system shall default both controls to **bottom-left** for new projects, store the selection per-project (`layoutAlignH`, `layoutAlignV` on `IdbProject`), and apply it on project load.

**FR-ALN-4 (State).** While bottom is selected, the lowest placement's `bottomUm` shall equal the board's usable bottom edge (`marginUm`); while top, the highest placement's `topUm` shall equal `lengthUm − marginUm` (symmetric for left/right on X).

**FR-ALN-5 (Ubiquitous — invariance).** For any alignment, each placement's footprint, rotation, board assignment, board count, and yield shall be unchanged.

**FR-ALN-6 (Unwanted).** If a board's placements already span the full usable dimension on an axis, then the system shall apply zero translation on that axis (no overflow past the usable edge).

**FR-ALN-7 (Optional).** Where linear (1D) stock is the only stock in the project, the system shall hide the alignment controls.

**FR-ALN-8 (Ubiquitous — render parity).** The on-screen diagram and exported PDF shall apply the same alignment transform.

**Acceptance tests**

- `web/lib/utils/__tests__/alignPlacements.test.ts` (pure):
  - Bottom-align: given parts clustered top-left, `marginUm=0`, then `min(bottomUm) === 0` and slack is at the top. (FR-ALN-4)
  - Right-align: then `max(rightUm) === widthUm − marginUm`. (FR-ALN-4)
  - Margin respected: `marginUm=50`, bottom-left → `min(bottomUm) === 50`, `min(leftUm) === 50`. (FR-ALN-2)
  - Footprint & relative offsets invariant under any alignment; bottom-to-bottom delta between two parts unchanged. (FR-ALN-5)
  - No-slack no-op: placements spanning full usable width, right-aligned → every `leftUm` unchanged. (FR-ALN-6)
- `web/composables/__tests__/useProjectSettings.test.ts`: `layoutAlignH='right'` round-trips; fresh project defaults to `bottom`/`left`. (FR-ALN-3)
- `web/utils/projectImport/migrations/__tests__/v<N>.test.ts`: pre-N project gets `layoutAlignH='left'`, `layoutAlignV='bottom'`, otherwise unchanged. (FR-ALN-3)
- `web/components/layout/__tests__/PreviewToolbar.test.ts`: linear-only project → controls absent (FR-ALN-7); clicking "right" drives `layoutAlignH` to `'right'`.

**Dependencies & phasing:** independent of F5 (alignment is a uniform translation — cut validity preserved; F5 reads placements **after** alignment). Soft-coupled to F6 (leftover regions move under alignment — F6 must compute regions from post-alignment placements). Ship the pure `alignPlacements` helper first, then build F6/F20 on top. Apply the transform at the query/render boundary (`useBoardLayoutsQuery.ts`), never inside the worker, so toggling is instant and the layout cache is untouched.

---

### F14 — Engineering dimension lines on PDF cut-outs · P1 · M

**Why:** Replace the single centered "W × H" string (`web/utils/pdf/board.ts:309-311`) with true engineering dimensions: a broken dimension line per axis with centered text, extension lines, and arrowheads. **Grounding:** PDF is **pdf-lib** (`web/utils/exportPdf.ts:1`); the working broken-dimension renderer `drawMeasurement` (`web/utils/pdf/measurements.ts:9`) and the `drawArrowH/V` / `drawClippedLine` helpers (`web/utils/pdf/geometry.ts:59,88,10`) already exist and are reused. `font.widthOfTextAtSize` (`web/utils/pdf/board.ts:288`) is the deterministic width oracle; cap-height ≈ font size. Numeric text routes through `ctx.opts.formatSize` = `useFormatDistance()` (`web/utils/exportPdf.ts:41`).

**FR-DIM-1 (Ubiquitous).** For every placed part on a sheet board PDF, when `showDimensions` is true, the system shall emit exactly two dimension groups (width-X and height-Y), each with two extension lines, a dimension line, two outward arrowheads, and one value-text via `formatSize`.

**FR-DIM-2 (Ubiquitous).** The dimension value text shall be horizontally centered within the dimension line's break gap (text center = midpoint of the two extension lines, ±0.5 pt).

**FR-DIM-3 (Event).** When the rendered text width plus the two arrowheads fits within the available edge length, the system shall break the dimension line into two collinear segments leaving a gap of `textW + 2·padding` with no stroke under the text.

**FR-DIM-4 (Unwanted/State).** While a part's edge is too short for the value text at minimum legible font size, the system shall not draw text inside the part; it shall emit a leader-line primitive from the dimension-line midpoint to an external text anchor.

**FR-DIM-5 (Unwanted).** The system shall never emit value-text whose bounding box intersects another part's rectangle or another already-placed label's bounding box on the same page; if no non-overlapping anchor is found within the deterministic search, text shall be suppressed (geometry retained).

**FR-DIM-6 (Ubiquitous).** All dimension value text shall be produced by `ctx.opts.formatSize` applied to the part's `Micrometres` extents (`rightUm−leftUm`, `topUm−bottomUm`); the renderer shall not format numbers itself.

**FR-DIM-7 (State).** While per-part coloring (FR-VIZ-3) is enabled, dimension-line and arrowhead strokes shall remain the fixed dimension color and shall not adopt the part hue.

**FR-DIM-8 (Optional).** Where a part is rendered portrait, the Y-axis dimension text shall be rotated 90° and remain centered on its break gap.

**Acceptance tests** — `web/utils/pdf/__tests__/dimensions.test.ts`. Refactor per-part dimensioning into a pure `drawPartDimensions(emit, part, geom)` where `emit` records typed primitives into arrays (typed-array pattern, not `vi.fn`).

- 600×400 part at 1:10 → `emit.text` called twice, `emit.arrow` four times. (FR-DIM-1)
- X-dimension text center == part X-center ±0.5 pt. (FR-DIM-2)
- Comfortable edge → two collinear segments with inner endpoints `textW+2·padding` apart, symmetric about midpoint. (FR-DIM-3)
- 30×400 part → one `'leader'` line for X and no X value-text inside the part box. (FR-DIM-4)
- Two adjacent narrow parts forcing leaders → no two recorded text AABBs intersect. (FR-DIM-5)
- `formatSize` stub returning `"WIDTH_TOKEN"` for the width µm → recorded width text == `"WIDTH_TOKEN"`. (FR-DIM-6)
- `partColor` red → every recorded line/arrow color == the fixed dimension color. (FR-DIM-7)
- 400×600 portrait part → height-text record has `rotate === 90`, centered on Y ±0.5 pt. (FR-DIM-8)

**Dependencies & phasing:** independent of F6 and can ship first (only rewrites `drawPartLabels` → `drawPartDimensions`, reusing existing helpers). Introduce the shared per-page **occupancy set** in `Ctx` now and reuse it for F6 leftover labels and F20 labels so leaders, dimensions, and labels don't collide. FR-DIM-7 is a no-op until F6's per-part coloring lands.

---

### F15 — Cost-vs-waste comparison strip · P2 · S

**Why:** Makes the cost tradeoff legible **for everyone**, not just users who open the objective dropdown. When cost data exists, run the tournament for all three objectives and show a compact strip: "Cheapest: $85 (2 sheets) · Fewest boards: 1 sheet, $100 · Least waste: 88% yield, $130," with one-click adopt.

**FR-CMP-1 (Optional).** Where the project has `cost` data on its stock, the system shall compute the best layout under each objective (`boards`, `waste`, `cost`) and present a comparison strip showing each option's board count, yield %, and material cost.

**FR-CMP-2 (Event).** When the user adopts an option from the strip, the system shall set `optimizationObjective` to that objective and display its layout.

**FR-CMP-3 (State).** While the project has no `cost` data, the strip shall be hidden (cost cannot be compared).

**FR-CMP-4 (Ubiquitous — performance).** The alternative-objective layouts shall be computed lazily (on strip expand), reusing the per-fingerprint layout cache, so a comparison never forces eager recompute on every input change.

**Acceptance tests**

- `web/composables/__tests__/comparisonStrip.test.ts`: Given stock with cost where two small sheets are cheaper than one large, when the strip builds, then the `cost` row shows 2 sheets / lower $ and the `boards` row shows 1 sheet / higher $ (assert the produced strip rows, derived from real engine runs). (FR-CMP-1)
- Adopting the `cost` row sets `optimizationObjective='cost'` (assert resulting setting state). (FR-CMP-2)
- No-cost project → strip data is empty/absent. (FR-CMP-3)
- The alternative runs are not invoked until expand is triggered (assert via a recording engine wrapper counting invocations, typed-array). (FR-CMP-4)

**Dependencies & phasing:** depends on **F11** (objective enum + cost scorer) and **F2** (cost field). Pure presentation + extra engine runs; no schema change. Phase after F11.

---

### F16 — Unsafe-sliver / minimum-usable-size guard · P2 · S

**Why:** The engine can emit hairline strips (a 2 mm rip you can't safely cut) as placements or "leftovers"; on the shop floor those are kickback hazards and false offcuts. A threshold makes F6's offcut/waste distinction and F8's inventory honest about what "usable" means.

**FR-SLV-1 (Optional).** Where the user sets a minimum rip width and/or minimum crosscut length (`minRipWidthUm`, `minCrosscutLenUm` on `IdbProject`), the system shall classify any leftover region or inter-part gap narrower than the threshold as an **unsafe sliver**, distinct from a usable offcut.

**FR-SLV-2 (Ubiquitous).** On board diagrams (screen + PDF) the system shall mark unsafe slivers with a style distinct from usable leftovers (complements FR-VIZ-1/2).

**FR-SLV-3 (Unwanted).** If a leftover is an unsafe sliver, then the system shall NOT offer it for "Save to offcut inventory" (F8 FR-OFC-1).

**Acceptance tests**

- `web/lib/__tests__/sliverGuard.test.ts` (pure): Given `minRipWidthUm = mmToUm(20)` and a 12 mm-wide leftover, when classified, then it is `'sliver'`; a 200 mm leftover is `'offcut'`. (FR-SLV-1)
- `web/utils/pdf/__tests__/board.test.ts`: a board with a sliver and an offcut emits distinct style tokens for each. (FR-SLV-2)
- `web/composables/__tests__/offcutInventory.test.ts`: a sliver is not offered to the inventory save action (assert the candidate list excludes it). (FR-SLV-3)

**Dependencies & phasing:** pure post-process over existing placement coordinates + one threshold setting; pairs with F6 (legibility) and F8 (inventory). Independent of the packing engine.

---

### F17 — Layout freeze/commit snapshot · P2 · M

**Why:** Layouts live only in a non-persisted module cache (`web/composables/useBoardLayoutsQuery.ts`) and recompute on any input change. A shop that has **already cut Sheet 1** to a plan, then tweaks one part, silently gets a re-optimized layout that no longer matches the boards on the bench — a real material-loss event.

**FR-FRZ-1 (Event).** When the user freezes a layout, the system shall persist the current `BoardLayout[]` plus the input fingerprint to IndexedDB as a named snapshot.

**FR-FRZ-2 (State).** While a frozen snapshot exists and the current `{parts, stock, config}` fingerprint differs from it, the system shall show a non-destructive "your saved cut plan no longer matches current parts/stock — re-optimize?" banner and continue to display the frozen layout until the user chooses to re-optimize.

**FR-FRZ-3 (Event).** When the user re-optimizes, the system shall replace the frozen snapshot only on explicit confirmation.

**Acceptance tests**

- `web/composables/__tests__/layoutSnapshot.test.ts` (fake-indexeddb): freezing writes a snapshot with layouts + fingerprint; reading back returns equal layouts. (FR-FRZ-1)
- Given a frozen snapshot and a changed part, the drift flag is `true` and the displayed layout equals the frozen one (not a recompute). (FR-FRZ-2)
- Re-optimize replaces the snapshot only after confirmation; without confirmation the stored snapshot is unchanged. (FR-FRZ-3)

**Dependencies & phasing:** depends on **F3** (durable storage must be trustworthy — freezing a plan into IndexedDB that Safari then evicts is worse than not freezing). Reuses the existing fingerprint (`web/utils/fingerprint.ts`). Phase after F3.

---

### F18 — Theme cycler (light / dark / lark) · P2 · M

**Why:** The app is hard-locked to dark (`colorMode: { preference: 'dark' }` in `web/nuxt.config.ts`; `neutral: 'mist'` in `web/app.config.ts`). A cycler rotates light → dark → lark. **The effort driver is not the control — it's that the custom design-token utilities hardcode mist hex values** (`bg-base`, `bg-surface`, `bg-overlay`, `text-hi`, `text-body`, `text-dim`, `border-subtle`, `border-default` in `web/assets/css/typography.css`), used across ~62 files / ~422 occurrences, plus ~15 hardcoded `mist-*`/`text-white` slot classes in `app.config.ts`. These must become theme-aware (resolve via CSS variables that flip per `.light`/`.dark`/`.lark` class). Nuxt UI's own semantic classes already flip; the gap is the custom utilities. **"lark"** does not exist in the repo — define it as a warm low-glare light theme (a "fawn" ramp rotated toward amber; teal stays the accent).

**FR-THM-1 (Ubiquitous).** The system shall expose exactly three named themes — `light`, `dark`, `lark` — as `useColorMode()` values, with `dark` the default for first-time visitors.

**FR-THM-2 (Ubiquitous).** Every custom design-token utility (`bg-base`, `bg-surface`, `bg-overlay`, `text-hi`, `text-body`, `text-dim`, `border-subtle`, `border-default`) shall render via CSS custom properties declared per active theme class on the document root — no literal mist/white hex values may remain in those utility bodies.

**FR-THM-3 (Event).** When the user activates the theme cycler, the system shall advance to the next theme in the fixed order light → dark → lark → light, set that value as the document-root class, and persist it as the color-mode preference.

**FR-THM-4 (Ubiquitous).** The cycler shall be a single labeled button in `ProjectTopBar.vue` whose `aria-label` names the current theme and the next action, with an icon indicating the active theme.

**FR-THM-5 (Ubiquitous — contrast, extends FR-A11Y-3).** In each of the three themes, the `text-body` and form-label tokens shall meet WCAG AA (≥ 4.5:1) against that theme's `bg-base` and `bg-surface`.

**FR-THM-6 (State).** While any theme is active, the Nuxt UI component-slot overrides in `app.config.ts` shall resolve surface/text/ring colors through theme-aware tokens, not fixed `mist-*`/`text-white` literals.

**FR-THM-7 (Unwanted).** If the persisted color-mode value is unrecognized (not light/dark/lark), then the system shall fall back to `dark` and overwrite the stored value.

**Acceptance tests**

- `web/components/project/__tests__/ThemeCycler.test.ts`: from `dark`, a click yields document-root class `lark` and `useColorMode().preference === 'lark'`; a second click yields `light`. (FR-THM-1/3) Persisted value reads back `lark`. (FR-THM-3) The button's `aria-label` changes with the active theme across two states. (FR-THM-4)
- `web/__tests__/theme-tokens.test.ts`: each of the 8 utility bodies references a `var(--…)` and contains no literal hex/`rgb(` color (regex over the declarations). (FR-THM-2) localStorage seeded with `"neon"` → applied class is `dark`, stored value rewritten to `dark`. (FR-THM-7)
- `web/__tests__/theme-contrast.test.ts`: `it.each` over `['light','dark','lark'] × [base, surface]` asserts `text-body`/label contrast ≥ 4.5:1 (relative-luminance formula). (FR-THM-5)
- `web/__tests__/app-config-tokens.test.ts`: no surface/text slot in `app.config.ts` contains a raw `mist-`/`text-white` literal. (FR-THM-6)

**Dependencies & phasing:** **Phase A — variable-ize the token layer** (convert the 8 utilities + the slot classes; the ~422 _usages_ don't change, only the definitions). Must land with the contrast + slot tests or light/lark ship with white-on-white regressions. **Phase B — add the lark ramp + register the third mode + the cycler button.** No persisted IDB field (theme is a color-mode localStorage preference), so XR-1 does not apply. Update CLAUDE.md's "always dark" Theming section in the same change (it becomes stale on Phase A merge). FR-THM-5 supersedes F9's single-theme contrast test.

---

### F19 — Mobile responsiveness gaps · P2 · S/M

**Why:** The app is **already substantially responsive** — the topbar ships a mobile drawer (`web/components/project/ProjectTopBar.vue:144-184`), the tablist scrolls horizontally (`ProjectWorkspaceNav.vue:65`), the 3D viewer has full touch (one-finger orbit / two-finger pan-pinch, `web/lib/viewer/modules/CameraRig.ts:75-78`; pointer-event branching in `InputRouter.ts:179`; a mobile Objects `UDrawer` in `ModelTab.vue:447-487`), the layout canvas pans/zooms/drags on touch via `panzoom` + pointer events (`usePanZoom.ts:54`, `CutlistPreview.vue:259-376`), and BOM/Stock tables already hide columns and scroll at `md` (`BomTab.vue:691,938,650`). **Only three genuine gaps remain** — scope is limited to these.

**FR-MOB-1 (Unwanted — help-panel drawer).** If the viewport is below the `sm` breakpoint (640px), then the system shall not render the `ViewerSidePanel` help panel inline in the BOM, Stock, and Layout tabs (its `w-72` container and vertical rail consume scarce width — `web/components/viewer/ViewerSidePanel.vue:39,23-35`), and shall instead expose the help content via an on-demand drawer/modal, so the primary content track occupies full width. (Lift the proven `ModelTab` `hidden sm:flex` + `UDrawer` pattern into `ViewerSidePanel`.)

**FR-MOB-2 (Ubiquitous — no content drift).** The system shall present help content identically in the mobile drawer and the desktop inline panel by reusing the existing `*HelpContent` component.

**FR-MOB-3 (State — layout overlay stacking).** While the viewport is below `sm`, the system shall arrange the Layout-tab floating overlays (toolbar, stock filter, shopping-list summary, zoom/ruler/buy-list cluster — `CutlistPreview.vue:660,787,809`) so no two overlap and all stay within the viewport (e.g. shopping-list summary collapsed by default below `sm`).

**FR-MOB-4 (Optional — touch targets).** Where the device reports a coarse pointer, interactive icon-only controls (project-row duplicate/delete, BOM inline-edit affordances) shall have a hit area of at least 44×44px.

**Acceptance tests**

- `web/components/project/tabs/__tests__/StockTab.responsive.test.ts` (+ BOM, Layout siblings): with `matchMedia` stubbed `< 640px`, the inline `ViewerSidePanel` is absent and a help-trigger control is present; at `≥ 640px` the inline panel renders. (FR-MOB-1)
- `web/components/viewer/__tests__/ViewerSidePanel.responsive.test.ts`: opening the mobile drawer renders the same `*HelpContent` component instance as the inline panel. (FR-MOB-2)
- `web/components/project/tabs/__tests__/CutlistPreview.responsive.test.ts`: at a 375px container the shopping-list summary defaults collapsed/absent so it doesn't sit atop the control cluster. (FR-MOB-3) **Honest caveat:** true non-overlap geometry is not unit-testable under happy-dom (0×0 rects) — verify manually / via Playwright at 375px.
- FR-MOB-4 is borderline tautology-prone; prefer a manual a11y pass over a class-presence assertion, or assert the coarse-pointer conditional branch exists.

**Dependencies & phasing:** the worried-about 3D-viewer touch work **does not exist as work — already shipped; removed from scope.** FR-MOB-1/2 are the priority and stand alone (one shared `ViewerSidePanel` change + three tab wrappers). FR-MOB-3 is independent, lower value, mostly manual to verify. FR-MOB-4 is independent and lowest priority.

---

### F20 — Layout/PDF label-text policy · P1 · S/M

**Why:** People read top-to-bottom, so labels should run **horizontally**, wrapping onto lines, and rotate **only as a last resort** when horizontal even wrapped won't fit. **Grounding & the bug:** the PDF rotates the label 90° for **every** portrait part unconditionally (`web/utils/pdf/board.ts:386,444`), never wrapping; the screen path (`web/components/layout/PartListItem.vue:106-113`) never rotates and CSS-wraps — the two paths disagree. The fix is a shared pure decision function `decideLabelLayout()` (new `web/utils/pdf/labelText.ts`) that both render paths call, plus a per-project placement config (default centered/top).

**FR-LBLT-1 (Ubiquitous — order of attempts).** The system shall attempt label rendering in strict order: single-line horizontal → wrapped horizontal (≤ `MAX_LINES = 3`, space-break then character hard-break) → 90° rotated, choosing the first that fits the part's visible rectangle at ≥ 90% fill on both axes.

**FR-LBLT-2 (Unwanted — no premature rotation).** If a label fits horizontally as a single line or wrapped to ≤ 3 lines, then the system shall NOT rotate it.

**FR-LBLT-3 (Event — rotate last).** When the wrapped label still exceeds the part width and the height cannot hold ≤ 3 lines, the system shall rotate 90° and re-run the same wrap/fit decision with axes swapped.

**FR-LBLT-4 (State — placement).** While `labelPlacement = 'top'` the system shall anchor the label block to the part's top band; while `'center'` it shall center the block on the part centroid. Default is `'center'`.

**FR-LBLT-5 (Unwanted — yield to dimensions).** If `labelPlacement = 'top'` and dimension lines (F14) are enabled for that part, then the system shall render that part's label as `'center'` to avoid the top-edge dimension run, without moving the dimension lines.

**FR-LBLT-6 (Ubiquitous — clamp).** The label block (any rotation/line count) shall be clamped to the part's own visible rectangle; trailing lines that would exceed it are dropped rather than overflowing into adjacent parts.

**FR-LBLT-7 (Ubiquitous — screen/PDF parity).** Screen and PDF shall derive rotation, line breaks, and placement from one shared pure function `decideLabelLayout`; given equal inputs they produce equal `{ rotate, lines, placement }`.

**FR-LBLT-8 (Optional — config).** Where the user changes label placement in the Layout toolbar, the setting shall persist on `IdbProject.labelPlacement` and both screen and the next PDF export shall reflect it.

**Acceptance tests** — `web/utils/pdf/__tests__/labelText.test.ts` (pure; `measure = (t, pt) => t.length * pt * 0.5`):

- Wide short part, short label → `rotate === 0`, one line. (FR-LBLT-1/2)
- Part where single line overflows but 3 lines fit → `rotate === 0`, 2–3 lines, each ≤ width budget. (FR-LBLT-1)
- Narrow tall part where 3 horizontal lines exceed width → `rotate === 90`, rotated lines fit height budget. (FR-LBLT-3)
- Single word longer than the budget → split mid-word, each line ≤ budget. (FR-LBLT-1 hard-break)
- `placement='top'` → block top y within `[partTop − fontPt, partTop]`; `placement='center'` → block midpoint == centroid ± one line-height. (FR-LBLT-4)
- `placement='top'`, `showDimensions=true` → effective placement `'center'`; with dimensions off → stays `'top'`. (FR-LBLT-5)
- Part so short only 1 of 3 lines fits → `lines.length === 1`, no line outside the rect. (FR-LBLT-6)
- Identical inputs called twice (PDF + screen oracle of equal proportionality) → deeply-equal `{rotate, lines, placement}`. (FR-LBLT-7)
- `web/composables/__tests__/useProjectSettings.labelPlacement.test.ts`: `labelPlacement='top'` round-trips via the real active-project patch. (FR-LBLT-8)
- Migration test: a record lacking `labelPlacement` migrates to `'center'`, other fields unchanged.

**Dependencies & phasing:** the core (`decideLabelLayout` + PDF rewrite of `drawPartLabels` + screen `PartListItem` rework + the config) is independently shippable. FR-LBLT-5 reconciles with **F14** (label yields to dimensions; dimensions never move) — a no-op guard if F14 hasn't landed. The placement control is a natural sibling to **F13**'s alignment controls — group it in the same toolbar/popover; the setting lives on `IdbProject` so the surface can move without a data change. Note the two render engines stay separate (pdf-lib point math vs CSS flow) — only the _decision_ is shared, so tests assert the shared function plus each path's coordinate mapping separately.

---

## 4. Cross-cutting requirements

**XR-1 (Ubiquitous).** Every requirement that adds a persisted field (F2 `cost`; F7 `bandedEdges` + project `bandingThicknessUm`/`subtractBandingThickness`; F8 offcut store; F11 `optimizationObjective`; F13 `layoutAlignH`/`layoutAlignV`; F16 `minRipWidthUm`/`minCrosscutLenUm`; F17 frozen-layout store; F20 `labelPlacement`) shall follow the `CLAUDE.md` schema-version procedure: bump `SCHEMA_VERSION`, add a Dexie `version(N).upgrade`, add a `migrations/v<N>.ts` defensive (never-throw) transform, update `applyDefaults`, set the field in `createX`, and add per-version migration tests. Fields added to `PartOverride` (keyed by partNumber) are migration-free via the read-path safety net. **Batch fields landing in the same phase into one version bump** rather than one bump per feature.

**XR-2 (Ubiquitous).** All new user-facing dimension display shall route through `useFormatDistance()` / `formatDistance`, and all editable dimension inputs through `useDimensionInput`, never ad-hoc formatting.

**XR-3 (Ubiquitous).** Help-panel content (`BomHelpContent`, `StockHelpContent`, `LayoutHelpContent`) shall be updated in the same change as any feature it documents (per `CLAUDE.md` "Documentation & Help Panels"). Net-new tabs and net-new help panels are disallowed without IA review.

**XR-4 (Ubiquitous).** Every behavioral change ships with tests that pass the `CLAUDE.md` tautology check — outcome-based assertions, no mock-shape introspection, no Vue template-forwarding assertions.

**XR-5 (Ubiquitous).** Any change that alters or removes a fact stated in `CLAUDE.md` (e.g. F18 invalidating the "always dark" Theming section, the `SCHEMA_VERSION` drift) shall update `CLAUDE.md` in the same change.

## 5. Development phases

Phases divide work so that blocking dependencies are resolved before the work they gate. Within a phase, items are parallelizable.

**Phase 0 — Substrate (unblocks sharing, freezing, cost).**

- **F3** storage durability + atomic single-transaction import (`FR-DUR-4/-5`). Blocks F12 (FR-SHARE-8) and F17.
- **F2** yield reporting + `cost` field on the stock-size schema. Blocks F11 and F15, and FR-BND-3.

**Phase 1 — Independent surfaces (parallel; no cross-dependencies).**

- **F13** alignment — ship the pure `alignPlacements` helper first (F6/F20 build on post-alignment placements).
- **F14** dimension lines — introduce the shared per-page occupancy set in `Ctx` (reused by F6 and F20).
- **F20** label-text policy — `decideLabelLayout` shared function; FR-LBLT-5 is a no-op guard until F14 lands.
- **F4** material-match recovery; **F1** label PDF export; **F6** board legibility (consume post-alignment placements from F13); **F7** edge-banding model incl. the banding-thickness toggle (FR-BND-5..8 follow FR-BND-1's edge marking).
- **F11** cost-optimization plumbing: objective enum + `materialCost` scorer term + popover control, built against synthetic stock in parallel with F2.

**Phase 2 — Dependent / heavier.**

- **F11** bounded stock-combination search (the L core), after F2 + the scorer term.
- **F12** sharing: Phase-1-of-feature file share (FR-SHARE-1/2) after F3, then fragment link + lean + confirm-before-import (FR-SHARE-3..10).
- **F5** cut-sequence emission + numbered callouts (reads post-alignment placements); **F8** offcut inventory; **F15** comparison strip (after F11); **F16** sliver guard (pairs with F6/F8); **F17** freeze snapshot (after F3).

**Phase 3 — Polish / cross-app.**

- **F18** theme cycler: Phase A token variable-ization (with contrast + slot tests) before Phase B lark palette + cycler.
- **F9** accessibility & IA hygiene (F18's FR-THM-5 supersedes its single-theme contrast test); **F10** onboarding; **F19** mobile responsiveness gaps.
