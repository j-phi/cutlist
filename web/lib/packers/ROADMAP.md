# Packing Roadmap

Future improvements to the bin-packing tournament, roughly ordered by ROI.

## Current state (2026-05)

- **Tournament**: per-(material, thickness) group, dispatched per-material via the
  `algorithm` field on `Stock` (or `defaultAlgorithm` on `Config`). Scored by board
  count → waste → waste concentration → stage-aware cut complexity. See
  `web/lib/index.ts`.
- **`tidy`** (`TidyPacker`): two-stage guillotine. Stage 1 partitions the bin into
  rip-axis strips of varying widths; stage 2 stacks parts within each strip. Produces
  visibly cleaner column-aligned layouts at slight yield cost. Variants: rip-first
  (default), crosscut-first.
- **`compact`** (`CompactPacker`): n-stage free-rectangle guillotine, BSSF/BAF/BLSF
  fit heuristics, SAS split, rectangle merge. Tighter yield, more zigzag cut sequence.
- **`cnc`** (`TightPacker`): greedy bottom-left, non-guillotine. CNC-only.
- **`auto`**: runs all guillotine voices (tidy + compact) and lets the scorer pick.

Benchmarks in the literature put BSSF+SAS+RM heuristics at roughly 1–3% over
theoretical optimum on typical loads. We're probably close to that today.

## Recently shipped (2026-05)

- **TidyPacker** — two-stage guillotine packer, joins the tournament as the
  cleaner-cut counterpart to Compact.
- **Stage-aware cut complexity** — `cutComplexity` weights rip-axis edges 10×
  cross-axis edges. The rip axis is detected per-board as the one with fewer
  unique edges, so compact layouts that happen to be column-shaped still score
  fairly.
- **Per-(material, thickness) algorithm choice** —
  `StockMatrix.thicknessAlgorithms[key]` pins a per-thickness override that
  beats `Config.defaultAlgorithm`. The Layout tab UI writes to that map.

## Tier 1 — Queued, high ROI, low risk

### 1. Consolidation pass

After the tournament picks a winner, attempt to redistribute the parts from the least-filled board into free rectangles on earlier boards. Often eliminates a board outright when the heuristics produced a mostly-empty final sheet.

- **Where**: new step in `runSearchPass` / `runMultiPassSearch` after `minimizeLayoutStock`.
- **Approach**: identify the layout with the lowest fill ratio; re-run the packer on its parts against the free-space maps of all earlier boards; if all parts fit, drop the board and merge.
- **Risk**: low — it's a pure improvement; layouts only change if they strictly beat the original by board count.

### 2. Multi-stock-size loop

When a material has multiple available stock sizes (e.g., 4×8 + 5×5 plywood), run the tournament against each combination and pick the lowest _cost_ — not just lowest board count.

- **Where**: wrap `runMultiPassSearch` in an outer loop over stock combinations.
- **Needs**: a cost field on `Stock` (currently absent) — or default to cost ≈ area.
- **Risk**: adds combinatorial blowup; cap at N best stock sizes per material.

### 3. Largest-offcut term

Currently `compareLayoutScores` goes board count → waste area → waste concentration
→ cut complexity. Concentration already favours layouts with more uniform per-board
fill, so the simplest version of this — penalising variance — landed in 2026-05.
Still missing: a "largest offcut" term that rewards keeping one big reusable remnant
over many small unusable scraps. Two layouts with the same total waste but one
producing a single 600×400 leftover vs. ten scattered 100×200 strips score the same
today even though only the first is shop-floor reusable.

- **Where**: `web/lib/packers/layout-score.ts`.
- **Ideas**: maximum-area inscribed rectangle on the remaining free space, summed
  across boards; or simply the largest rectangle in the union of free rects exposed
  by the packer's terminal state.
- **Risk**: medium — requires calibrating weights against real-world layouts and
  may interact with the new rip-axis weighting.

## Tier 2 — Algorithmic additions

### 4. MaxRects-BSSF for `cnc` mode

Replace `TightPacker` with a proper MaxRects implementation. The [`maxrects-packer`](https://github.com/soimy/maxrects-packer) npm package (MIT, TS-native) is a drop-in.

- **Where**: new `MaxRectsPacker.ts` adapter wrapping the library.
- **Gain**: likely 3–8% better yield in CNC mode.
- **Caveat**: doesn't help tablesaw/track saw users (guillotine is the binding constraint for them).

### 5. Additional tournament variants

Low-effort passes to add: sort-by-perimeter, sort-by-side-ratio, sort-by-difference-of-sides. The Jylänki "A Thousand Ways to Pack the Bin" paper shows these occasionally win on irregular part mixes.

- **Risk**: adds pass time linearly. Already have 8 passes (3 tidy + 2 compact + 3 cnc); keep an eye on total wall-clock for large inputs, since every default pass runs to completion.

### 6. Skyline-BL for `cnc` mode

As a second CNC voice alongside MaxRects. Faster per-pass, sometimes produces complementary layouts. Worth it only if #4 lands first and there's demand for more CNC quality.

## Tier 3 — Provably optimal (speculative)

### 7. OR-Tools CP-SAT via Python sidecar

[Google OR-Tools CP-SAT](https://developers.google.com/optimization) can solve 2D guillotine cutting to **provable optimality** for ≤30 parts in under a second, and near-optimal for ≤100 parts in seconds.

- **Architecture**: Python service (Flask/FastAPI) called from the Nuxt server (`web/server/api/...`), invoked behind a "Deep Optimize" button. Not the default path — too slow for interactive tweaking.
- **Deployment cost**: Python runtime hosted somewhere (Fly/Railway/Lambda), cold starts, ongoing maintenance.
- **When worth it**: only if cabinet shops or production users are asking for the last 1–3% yield on expensive material. Don't build speculatively.

### 8. WASM-compiled packer

Compile [`juj/RectangleBinPack`](https://github.com/juj/RectangleBinPack) (C++) to WASM as an alternative to #7 — keeps everything client-side and avoids infrastructure, at the cost of a build pipeline. ~3–10× faster than the TS packers, but for typical part counts we're not CPU-bound, so this is mostly about opening up more expensive heuristics (e.g., genetic / simulated annealing) that would be too slow in pure TS.

## What we're explicitly _not_ building

- **Irregular-shape nesting (SVGnest/Deepnest, NFP-based)** — overkill for rectangles, and parts are always axis-aligned rectangles in this tool.
- **Machine-learning packers** — research shows marginal wins vs. classical heuristics for 2D rectangles, with much higher complexity.
- **Column generation / Gilmore-Gomory LP** — strong for _one_-dimensional cutting stock; for 2D guillotine the heuristics already get within 1–3% of optimum, and LP-based approaches are significantly slower and harder to integrate.

## References

- J. Jylänki, ["A Thousand Ways to Pack the Bin"](https://github.com/juj/RectangleBinPack) — the canonical survey
- [`secnot/rectpack`](https://github.com/secnot/rectpack) — the Python library we ported the guillotine heuristics from
- [`soimy/maxrects-packer`](https://github.com/soimy/maxrects-packer) — candidate for #4
