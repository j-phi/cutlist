/**
 * Edge-banding model (F7). Pure, unit-testable helpers that resolve banding
 * thickness, route a part's nominal/cut size through the Part→PartToCut
 * boundary, and tally banding length + cost for reporting.
 *
 * All geometry is integer micrometres. The brand erases at runtime, so these
 * functions are safe to call from the worker, the query layer, and the PDF.
 *
 * Edge → dimension mapping (the load-bearing convention, mirroring
 * `BandedEdges` in `useIdb/types.ts`):
 *   - LENGTH-edges run ALONG the part's length (the long sides). Banding one
 *     adds thickness across the WIDTH, so it REDUCES `width`.
 *   - WIDTH-edges run ALONG the part's width (the short sides). Banding one
 *     adds thickness across the LENGTH, so it REDUCES `length`.
 *   - `thickness` is never affected.
 */

import { um, type Micrometres } from './units';

/** Which of a part's four edges are banded (mirrors `BandedEdges` in IDB). */
export interface BandedEdges {
  /** Edges running along the part's length (long sides) — reduce `width`. */
  length1: boolean;
  length2: boolean;
  /** Edges running along the part's width (short sides) — reduce `length`. */
  width1: boolean;
  width2: boolean;
}

/** A part's rectangular extents in integer µm. */
export interface PartSize {
  width: Micrometres;
  length: Micrometres;
  thickness: Micrometres;
}

/** No edges banded — the neutral default. */
export const NO_BANDED_EDGES: BandedEdges = Object.freeze({
  length1: false,
  length2: false,
  width1: false,
  width2: false,
});

/** How many length-edges are banded (0..2) — each reduces `width`. */
export function bandedLengthEdgeCount(edges: BandedEdges): number {
  return (edges.length1 ? 1 : 0) + (edges.length2 ? 1 : 0);
}

/** How many width-edges are banded (0..2) — each reduces `length`. */
export function bandedWidthEdgeCount(edges: BandedEdges): number {
  return (edges.width1 ? 1 : 0) + (edges.width2 ? 1 : 0);
}

/** True when at least one of the four edges is banded. */
export function hasBandedEdge(edges: BandedEdges): boolean {
  return edges.length1 || edges.length2 || edges.width1 || edges.width2;
}

/**
 * Resolve the banding thickness for a part (FR-BND-6): the per-part override
 * when set, else the project default, else zero. Integer µm, deterministic.
 *
 * `0` (a valid stored value meaning "no banding") is honoured — only
 * `undefined`/`null` falls through to the project default.
 */
export function resolveBandingThicknessUm(
  overrideUm: Micrometres | undefined | null,
  projectDefaultUm: Micrometres | undefined | null,
): Micrometres {
  if (overrideUm != null) return overrideUm;
  if (projectDefaultUm != null) return projectDefaultUm;
  return um(0);
}

/**
 * Apply cut-size subtraction (FR-BND-5) with zero-clamp validation
 * (FR-BND-7). Banded length-edges reduce `width`; banded width-edges reduce
 * `length`; `thickness` is unchanged.
 *
 * Returns `{ valid: false, size: <nominal> }` when subtracting would drive a
 * cut dimension to ≤ 0 µm, so callers can reject the configuration and surface
 * the reason rather than feeding a non-positive dimension to the packer.
 */
export function applyBandingToSize(
  size: PartSize,
  edges: BandedEdges,
  thicknessUm: Micrometres,
): { size: PartSize; valid: boolean } {
  const t = thicknessUm;
  if (t <= 0) return { size, valid: true };

  const widthReduction = bandedLengthEdgeCount(edges) * t;
  const lengthReduction = bandedWidthEdgeCount(edges) * t;

  const cutWidth = um(size.width - widthReduction);
  const cutLength = um(size.length - lengthReduction);

  if (cutWidth <= 0 || cutLength <= 0) {
    return { size, valid: false };
  }

  return {
    size: { width: cutWidth, length: cutLength, thickness: size.thickness },
    valid: true,
  };
}

/**
 * Route a part's size through the Part→PartToCut boundary (FR-BND-4/-5).
 *
 * - `subtract === false` (default overlay): return the nominal size unchanged.
 * - `subtract === true`: return the cut size (banding subtracted). If
 *   subtraction would zero-clamp a dimension, fall back to nominal so the
 *   packer never sees a non-positive dimension (the UI rejects the bad config
 *   separately at the input boundary, FR-BND-7).
 *
 * Deterministic: identical inputs always produce an identical cut size.
 */
export function resolvePartCutSize(
  part: {
    size: PartSize;
    bandedEdges?: BandedEdges;
    bandingThicknessUm?: Micrometres;
  },
  subtract: boolean,
  projectDefaultUm: Micrometres | undefined | null,
): PartSize {
  if (!subtract) return part.size;
  const edges = part.bandedEdges ?? NO_BANDED_EDGES;
  if (!hasBandedEdge(edges)) return part.size;
  const t = resolveBandingThicknessUm(
    part.bandingThicknessUm,
    projectDefaultUm,
  );
  return applyBandingToSize(part.size, edges, t).size;
}

/**
 * Banding length for a single part instance (FR-BND-2): a banded length-edge
 * contributes the part's LENGTH (it runs along the length); a banded
 * width-edge contributes the part's WIDTH.
 */
export function bandedEdgeLengthUm(
  size: Pick<PartSize, 'width' | 'length'>,
  edges: BandedEdges,
): Micrometres {
  const fromLengthEdges = bandedLengthEdgeCount(edges) * size.length;
  const fromWidthEdges = bandedWidthEdgeCount(edges) * size.width;
  return um(fromLengthEdges + fromWidthEdges);
}

/** A part as seen by the project banding tally. */
export interface BandingPart {
  size: Pick<PartSize, 'width' | 'length'>;
  bandedEdges?: BandedEdges;
  /** Instances of this part (length is per-instance × qty). */
  quantity: number;
}

/**
 * Total banding length across a project (FR-BND-2):
 *   Σ over parts (Σ banded-edge lengths × quantity).
 */
export function projectBandingLengthUm(parts: BandingPart[]): Micrometres {
  let total = 0;
  for (const part of parts) {
    const edges = part.bandedEdges ?? NO_BANDED_EDGES;
    total += bandedEdgeLengthUm(part.size, edges) * part.quantity;
  }
  return um(total);
}

/**
 * Banding cost = length × rate (FR-BND-3). `ratePerUm` is the user's
 * cost-per-length expressed per micrometre. Returns `undefined` when no rate
 * is set, so callers omit the cost rather than showing `0`.
 */
export function bandingCost(
  lengthUm: Micrometres,
  ratePerUm: number | undefined | null,
): number | undefined {
  if (ratePerUm == null || !Number.isFinite(ratePerUm) || ratePerUm <= 0) {
    return undefined;
  }
  return lengthUm * ratePerUm;
}
