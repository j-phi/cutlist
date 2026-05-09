# Units system — investigation & hardening spec

## Goal

The Cutlist app should treat distances as a **first-class, type-safe domain
concept** instead of a loose convention of "this number is in mm, that one
is in meters, this string is whatever-unit-it-says." The current state is
mostly correct in practice but fragile to refactoring and ambiguous to a
new contributor.

This document briefs a follow-up agent on what's already been done, what
remains, and what an accurate, reliable units system looks like for this
codebase.

## What's already shipped

Branch `claude/audit-imperial-dimensions-7i2y2` (commits `1ace428`,
`01867f1`, plus the formatter/helper fixes described below):

- **`parseDimension(input, unit)`** in
  [`web/lib/utils/units.ts`](../lib/utils/units.ts) — accepts decimals,
  fractions (`3/4`), mixed numbers (`1 1/2`, `1-1/2`), feet+inches (`4ft`,
  `1' 6"`), and unit glyphs. Returns `null` on bad input. mm-mode is plain
  decimals.
- **`formatDimensionForInput(value, unit)`** — pretty-print for
  prefilling editable inputs. Inches as fractions, mm as trimmed
  decimals.
- **`convertUnits(value, from, to)`** — single source of truth for the
  `25.4` constant.
- **`ManualPartRow.vue`** and **`StockMatrixInput.vue`** now follow the
  project's `distanceUnit` for labels, input parsing, display formatting,
  and on-load normalization. The per-row unit toggle on stock has been
  removed.
- **`formatLength`** (model-viewer dimension labels) now matches
  `useFormatDistance` — same fractional inches and 2-decimal mm
  everywhere. So a part shows the same string in BOM, layout, PDF, and
  on the model.

## Remaining issues — investigate + design before coding

Each issue below is a real fragility. Read the linked code first; the
fixes likely interact, so design the system before patching individual
sites.

### 1. `Distance`'s permissive fallback constructor

[`web/lib/utils/units.ts`](../lib/utils/units.ts) — the `else` branch of
`new Distance(string)` does `Number(v.replace('m', ''))`, so a bare
string like `"5"` parses to `5 meters`. Stock YAML's schema accepts
`z.union([z.number(), z.string()])` so a hand-written `width: "5"` would
silently mean 5 meters.

**Investigate:**

- Who actually constructs `Distance` from strings? Grep for
  `new Distance(`. Catalogue every call site and the source of the
  string.
- For each site, can we tighten the contract? E.g. does the site really
  need to accept bare numbers as meters, or is that a leftover?
- If yes, can we replace the fallback with a thrown error and
  unit-tag every call site explicitly?

**Likely outcome:** Either (a) make `Distance` strict — a string must
end in `mm`/`in`/`ft`/`m`, anything else throws; or (b) keep the
permissiveness but make the assumption visible at the call site by
introducing `Distance.fromMm(n)`, `Distance.fromIn(n)`,
`Distance.fromMeters(n)` factory methods and deprecating the
string+number constructor.

### 2. `useUnitConverter` is incomplete

[`web/composables/useUnitConverter.ts`](../composables/useUnitConverter.ts).
When `distanceUnit` flips, only `bladeWidth` and `margin` get converted.
The stock YAML stays in the old unit until the user next opens the Stock
tab (where `StockMatrixInput`'s on-load normalization fires). During
that window:

- `bladeWidth` is in inches but stock rows are tagged `unit: 'mm'`
- the cutlist library still works correctly because each `StockMatrix`
  row carries its own `unit` field
- but the data is semantically inconsistent at rest

**Investigate:**

- Does anything else key off `distanceUnit` that's stored in IDB?
  (Annotations? Build doc embeds? PDF caches?) Search for fields that
  could "remember" the old unit.
- Should the conversion happen eagerly in `useUnitConverter` (one place,
  comprehensive) or lazily wherever a setting is read (decentralized,
  resilient)? Pick one and apply consistently.

**Likely outcome:** `useUnitConverter` becomes the single migration
point — when `distanceUnit` changes it converts bladeWidth, margin,
and the stock YAML in one transaction, with `StockMatrixInput`'s
normalization removed (or kept as a safety net).

### 3. Document parser unit contracts; verify COLLADA scale handling

[`web/utils/parseGltf.ts`](../utils/parseGltf.ts) and
[`web/utils/parseCollada.ts`](../utils/parseCollada.ts).

**glTF**: the [glTF 2.0 spec](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#coordinate-system-and-units)
mandates meters. A spec-compliant `.gltf`/`.glb` file is meters by
definition — our parser's assumption is correct, not silent. The
remaining work is just to **document the contract** with a comment
citing the spec, so a future contributor doesn't second-guess it.

**COLLADA**: the spec carries a `<unit meter="..."/>` element giving
the scale factor (e.g. `meter="0.0254"` for a file authored in
inches). Three.js's `ColladaLoader` does honor this and bakes the
scale into the loaded scene's transform — verify in the Three.js
source, then document. If it _doesn't_ apply the scale (or only does
so under specific conditions), we apply it ourselves at parse time
using the document's `<unit>` element.

**Non-conforming files** (the SketchUp-exports-in-mm scenario) are a
defensive concern, not a correctness one. Optionally add a
bounding-box sanity check (warn if the largest part is < 5 mm or > 10
m — almost certainly a tool that ignored the spec) and a one-click
"rescale ×25.4 / ÷25.4" affordance in the import flow. Treat as
polish, not P0.

**Investigate:**

- Read Three.js's `ColladaLoader` source for `<unit>` handling.
  Confirm the loaded scene is already in meters before our parser
  sees it. Add a test with a known inch-scaled COLLADA file.
- Decide whether the bounding-box sanity check is worth the
  surface area. If yes, where does the warning surface — toast,
  inline banner on the BOM tab, modal at import time?

**Likely outcome:** A short JSDoc comment in each parser citing the
relevant spec section. Possibly a cheap sanity warning. No
scale-correction UI unless real users hit the SketchUp case.

### 4. PDF measurements have a hardcoded-mm fallback

[`web/utils/pdf/measurements.ts:24`](../utils/pdf/measurements.ts) —
`formatSize(distanceM) ?? \`${Math.round(distanceM \* 1000)}mm\``.
`formatSize`is always provided by`useExportPdf`, so the `??` branch is
dead. It's also wrong (always mm regardless of project unit). Either
delete the fallback or make it correct.

**Investigate:** Audit every `formatSize ?? ...` site (`bom.ts`,
`board.ts`, `measurements.ts`). Confirm `formatSize` is always set; if
so, drop the optionality from the type signature too.

### 5. String dimensions in `StockMatrix` schema

[`web/lib/types.ts:62-65`](../lib/types.ts) —
`StockSize.{width,length}: z.union([z.number(), z.string()])`. The UI
only ever produces numbers, but the schema admits strings like
`"18mm"`. The display does `{{ size.width }}{{ unit }}`, which renders
`"18mmmm"` for a string input. Pre-existing latent bug.

**Investigate:**

- Why do we accept strings? Is anything still emitting them — maybe an
  old preset or migration?
- If nothing emits them, drop the union, normalize on import via
  `parseDimension`, and simplify `convertDim` and `displayDim` (they
  currently have string-passthrough branches that exist only because of
  this).

**Likely outcome:** Tighten the schema to `z.number()`, run all stored
YAML through a one-shot migration, delete the string-passthrough code.

### 6. Stored fields don't carry their unit in the type system

[`web/composables/useIdb/types.ts`](../composables/useIdb/types.ts) —
`bladeWidth: number`, `margin: number`. A comment says "in the project's
distanceUnit." Future contributors won't necessarily read the comment.
Compare to the cutlist library where `Stock.width: number` has a
JSDoc-only "In meters" claim.

**Investigate:**

- Does TypeScript branded types help here? E.g.
  `type Mm = number & { __brand: 'mm' }` and
  `type ProjectUnits = number & { __brand: 'projectUnits' }`. Does it
  catch enough mistakes to be worth the ergonomic cost?
- Or: convert all stored numbers to a canonical unit (meters or mm) and
  treat `distanceUnit` as a pure display preference. Then there's no
  ambiguity — every `number` in IDB is the same unit. This is a
  bigger lift but eliminates the whole class of bug.

**Likely outcome:** Storing in mm canonically is the most defensible
end-state. It requires a migration of `bladeWidth` / `margin` / stock
YAML and a follow-up audit of every read site. Decide whether the
payoff justifies the migration.

## Constraints

- **Behavior preservation.** Every existing user-visible output (BOM
  rows, PDF strings, dimension labels) must format identically before
  and after, when project unit and stored values are unchanged.
- **Schema versioning.** Any IDB record-shape change needs a Dexie
  `.version(N).upgrade()` block in
  [`web/composables/useIdb/db.ts`](../composables/useIdb/db.ts), a
  `migrations[]` entry in
  [`web/utils/projectImport/migrations.ts`](../utils/projectImport/migrations.ts),
  and a `SCHEMA_VERSION` bump in
  [`web/utils/versions.ts`](../utils/versions.ts). See
  [CLAUDE.md](../../CLAUDE.md) "When adding a new field" for the full
  checklist.
- **Test coverage.** Each layer touched needs a test. Conversion
  functions (`convertUnits`, `parseDimension`, `formatLength`,
  `useFormatDistance`) get pure unit tests; composables get
  IDB-backed tests; components get
  emit/render tests. See [CLAUDE.md](../../CLAUDE.md) "Testing".
- **Don't bikeshed names.** `Distance`, `convertUnits`,
  `parseDimension`, `formatDimensionForInput`, `formatLength`,
  `useFormatDistance`, `useUnitConverter` — these names are settled.
  Renames cascade through hundreds of imports.

## Definition of done

A future contributor reading the codebase cold can answer all of these
without reading comments:

1. _What unit is this `number` in?_ — Answered by the field's TypeScript
   type or by a clearly-named factory (`Distance.fromMm`,
   `convertUnits`).
2. _What happens if I flip the project's distance unit?_ — One place
   (`useUnitConverter`) owns the conversion and lists every affected
   field.
3. _What unit does this loader produce?_ — Meters, per spec, documented
   inline with a citation.
4. _Where is `25.4` defined?_ — Exactly once, in
   `web/lib/utils/units.ts`.
5. _Will this stored value still mean the right thing in five years?_ —
   Yes, because either (a) the value is stored in a canonical unit
   (mm/m), or (b) the value's unit is stored alongside it and the two
   travel together through every read.

## Suggested sequencing

The issues interact. A reasonable order:

1. **#5 (string dimensions)** first — smallest blast radius, lets you
   delete branches in `convertDim` / `displayDim` / `parseStock`,
   making subsequent refactors cleaner.
2. **#1 (`Distance` fallback)** — once string dimensions are gone,
   the only remaining string callers are `bladeWidth`/`margin`. Either
   tighten the constructor or replace it with factories.
3. **#6 (typed/canonical storage)** is the big one. Decide between
   branded types vs. canonical-unit storage. Canonical-unit storage
   subsumes #2 (no conversion needed when unit flips) and #4 (PDF
   fallback becomes correct because there's only one unit at rest).
4. **#2 (`useUnitConverter` completeness)** — falls out of #6, or done
   directly if #6 is deferred.
5. **#3 (parser docs + COLLADA scale verify)** is independent and
   small — JSDoc citing the spec, plus one Three.js source-read.
6. **#4 (PDF fallback)** is a one-line cleanup after #6 or independent.

Each step is shippable on its own. Aim for small commits with tests.
