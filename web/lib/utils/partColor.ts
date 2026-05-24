/**
 * F6 / FR-VIZ-3 — stable per-part color shared across the on-screen layout
 * diagram and the PDF board renderer.
 *
 * `partHue` is the single source of truth (golden-angle hue). `partColorCss`
 * (screen path) and `partColorRgb` (PDF path) both derive from it via OKLCH so
 * the two color paths cannot drift: same `partNumber` → same hue → same color.
 *
 * OKLCH is perceptually uniform, so equal hue steps produce genuinely equal
 * perceived differences — unlike HSL where blue-indigo-purple and yellow-green
 * compress into narrow perceptual bands at constant S/L.
 */

/** Golden-angle step keeps successive part numbers visually far apart. */
const GOLDEN_ANGLE = 137.508;

/**
 * Deterministic hue in [0, 360) for a part number. Pure: same input → same
 * output. Negative / non-integer inputs are floored to a non-negative integer
 * index first so the function is total.
 */
export function partHue(partNumber: number): number {
  const idx = Math.abs(Math.floor(partNumber));
  return (idx * GOLDEN_ANGLE) % 360;
}

/** OKLCH lightness and chroma for the per-part palette (screen + PDF). */
export const PART_OKLCH_L = 0.7;
export const PART_OKLCH_C = 0.13;

export interface Rgb01 {
  r: number;
  g: number;
  b: number;
}

function srgbGamma(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** OKLCH → linear sRGB → gamma sRGB. Out-of-gamut values are clamped to [0, 1]. */
export function oklchToRgb01(l: number, c: number, h: number): Rgb01 {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  // OKLab → LMS (cube-root compressed)
  const lc = l + 0.3963377774 * a + 0.2158037573 * b;
  const mc = l - 0.1055613458 * a - 0.0638541728 * b;
  const sc = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = lc * lc * lc;
  const m3 = mc * mc * mc;
  const s3 = sc * sc * sc;
  return {
    r: srgbGamma(+4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    g: srgbGamma(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    b: srgbGamma(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  };
}

/** CSS `oklch(...)` color for a part — used by the screen layout diagram. */
export function partColorCss(
  partNumber: number,
  l: number = PART_OKLCH_L,
  c: number = PART_OKLCH_C,
): string {
  return `oklch(${l} ${c} ${partHue(partNumber).toFixed(1)})`;
}

/** Per-part color as RGB channels in [0, 1] — used by the PDF board renderer
 * (pdf-lib's `rgb()` takes 0..1). Derives from {@link partHue}, the SAME key
 * the screen path uses, so part #5 matches across screen and PDF. */
export function partColorRgb(
  partNumber: number,
  l: number = PART_OKLCH_L,
  c: number = PART_OKLCH_C,
): Rgb01 {
  return oklchToRgb01(l, c, partHue(partNumber));
}

// ---------------------------------------------------------------------------
// Board-local proximity-aware color assignment (screen layout diagram only)
// ---------------------------------------------------------------------------

/**
 * Returns the hue (0–360°) at the centre of the largest arc-gap in a circular
 * arrangement of taken hues. Used by the greedy board-colour assignment to
 * pick the hue that maximises minimum distance from all neighbours.
 */
export function maxGapHue(takenHues: number[]): number {
  const sorted = [...takenHues].sort((a, b) => a - b);
  let maxGap = 0;
  let bestMid = 0;
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    const end = i < sorted.length - 1 ? sorted[i + 1] : sorted[0] + 360;
    const gap = end - start;
    if (gap > maxGap) {
      maxGap = gap;
      bestMid = (start + gap / 2) % 360;
    }
  }
  return bestMid;
}

type Rect = {
  partNumber: number;
  leftUm: number;
  rightUm: number;
  topUm: number;
  bottomUm: number;
};

/**
 * Per-board greedy hue assignment that maximises contrast between spatially
 * adjacent parts. Returns a `Map<partNumber, hue>`. Parts with no adjacency
 * constraints fall back to their global golden-angle hue so unchanged boards
 * look identical to the single-hue scheme.
 *
 * Complexity: O(n²) on placements, fine for the typical <200 parts per board.
 */
export function assignBoardColors(
  placements: ReadonlyArray<Rect>,
): Map<number, number> {
  // 1 µm tolerance — the packing engine uses exact integer arithmetic so
  // shared boundaries are exact; this just absorbs any rounding at the call site.
  const TOL = 1;

  // Build part-number–level adjacency (skip duplicate pn pairs).
  const adjParts = new Map<number, Set<number>>();
  for (const p of placements) {
    if (!adjParts.has(p.partNumber)) adjParts.set(p.partNumber, new Set());
  }
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      if (a.partNumber === b.partNumber) continue;

      const hShare =
        Math.abs(a.rightUm - b.leftUm) <= TOL ||
        Math.abs(b.rightUm - a.leftUm) <= TOL;
      const hOverlap = a.topUm > b.bottomUm + TOL && b.topUm > a.bottomUm + TOL;

      const vShare =
        Math.abs(a.topUm - b.bottomUm) <= TOL ||
        Math.abs(b.topUm - a.bottomUm) <= TOL;
      const vOverlap = a.rightUm > b.leftUm + TOL && b.rightUm > a.leftUm + TOL;

      if ((hShare && hOverlap) || (vShare && vOverlap)) {
        adjParts.get(a.partNumber)!.add(b.partNumber);
        adjParts.get(b.partNumber)!.add(a.partNumber);
      }
    }
  }

  // Greedy: most-constrained part number first.
  const order = [...adjParts.keys()].sort(
    (a, b) => (adjParts.get(b)?.size ?? 0) - (adjParts.get(a)?.size ?? 0),
  );

  const hues = new Map<number, number>();
  for (const pn of order) {
    const takenHues = [...(adjParts.get(pn) ?? [])]
      .filter((adj) => hues.has(adj))
      .map((adj) => hues.get(adj)!);
    hues.set(pn, takenHues.length > 0 ? maxGapHue(takenHues) : partHue(pn));
  }
  return hues;
}
