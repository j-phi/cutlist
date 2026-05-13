/**
 * Smart stock suggester. Clusters BOM parts by cross-section, then matches
 * each cluster against the linear presets the woodworker could buy and
 * plane down to the finished cluster.
 */

import {
  presetToMmStock,
  STOCK_PRESETS,
  type CutlistSettings,
} from './settings';
import { parseStock } from './parseStock';
import type { LinearStockMatrix } from 'cutlist';

const LINEAR_ASPECT_RATIO_MIN = 3;
const LINEAR_MAX_WIDTH_MM = 250;
const CLUSTER_TOL_MM = 2;
const MAX_PLANE_DOWN_MM = 6;

// 20 mm in metric / exactly 1″ in imperial — picked so the value displays
// as a clean round number in either unit's editor.
const DEFAULT_LENGTH_ALLOWANCE_MM: Record<'mm' | 'in', number> = {
  mm: 20,
  in: 25.4,
};

export interface SuggesterPart {
  /** Meters; matches the engine convention. */
  size: { thickness: number; width: number; length: number };
}

export interface Suggestion {
  /** Ready to splice into the user's stock YAML — lengths trimmed, allowance set. */
  matrix: LinearStockMatrix;
  partsCovered: number;
}

interface Cluster {
  widthMm: number;
  thicknessMm: number;
  partsCount: number;
  longestPartMm: number;
}

export function clusterParts(parts: SuggesterPart[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const part of parts) {
    const mmT = part.size.thickness * 1000;
    const mmW = Math.min(part.size.width, part.size.length) * 1000;
    const mmL = Math.max(part.size.width, part.size.length) * 1000;
    const minor = Math.min(mmT, mmW);
    const major = Math.max(mmT, mmW);
    // Wide major axis = panel, not a stick.
    if (major > LINEAR_MAX_WIDTH_MM) continue;
    if (mmL / Math.max(major, 1) < LINEAR_ASPECT_RATIO_MIN) continue;
    const existing = clusters.find(
      (c) =>
        Math.abs(c.widthMm - major) <= CLUSTER_TOL_MM &&
        Math.abs(c.thicknessMm - minor) <= CLUSTER_TOL_MM,
    );
    if (existing) {
      existing.partsCount += 1;
      if (mmL > existing.longestPartMm) existing.longestPartMm = mmL;
    } else {
      clusters.push({
        widthMm: major,
        thicknessMm: minor,
        partsCount: 1,
        longestPartMm: mmL,
      });
    }
  }
  return clusters;
}

interface Scored {
  preset: (typeof STOCK_PRESETS)[number];
  matrix: LinearStockMatrix;
  totalGapMm: number;
  crossSectionGapMm: number;
}

function score(
  cluster: Cluster,
  preset: (typeof STOCK_PRESETS)[number],
  lengthAllowanceMm: number,
): Scored | null {
  if (preset.stock.kind !== 'linear') return null;
  const matrix = presetToMmStock(preset) as LinearStockMatrix;
  // Cluster axes are pre-sorted (widthMm ≥ thicknessMm), so we sort the
  // preset axes too and compare like-for-like — no need to try both
  // orientations.
  const pMajor = Math.max(
    matrix.size.crossSectionWidth,
    matrix.size.crossSectionThickness,
  );
  const pMinor = Math.min(
    matrix.size.crossSectionWidth,
    matrix.size.crossSectionThickness,
  );
  const gapMajor = pMajor - cluster.widthMm;
  const gapMinor = pMinor - cluster.thicknessMm;
  if (gapMajor < -CLUSTER_TOL_MM || gapMinor < -CLUSTER_TOL_MM) return null;
  if (gapMajor > MAX_PLANE_DOWN_MM || gapMinor > MAX_PLANE_DOWN_MM) return null;
  const lengthFits = matrix.size.lengths.some(
    (l) => l >= cluster.longestPartMm + lengthAllowanceMm,
  );
  if (!lengthFits) return null;
  // Round the plane-down gap to 0.1 mm so suggestions don't recommend
  // sub-mm machining that isn't a real woodworking operation.
  const crossSectionGapMm = Math.max(
    0,
    Math.round(Math.max(gapMajor, gapMinor) * 10) / 10,
  );
  return {
    preset,
    matrix,
    totalGapMm: gapMajor + gapMinor,
    crossSectionGapMm,
  };
}

function pickLength(
  cluster: Cluster,
  matrix: LinearStockMatrix,
  allowanceMm: number,
): number {
  const target = cluster.longestPartMm + allowanceMm;
  const sorted = [...matrix.size.lengths].sort((a, b) => a - b);
  return sorted.find((l) => l >= target) ?? sorted[sorted.length - 1];
}

export function suggestStock(
  parts: SuggesterPart[],
  unit: CutlistSettings['distanceUnit'],
  existingMaterials: ReadonlySet<string>,
): Suggestion[] {
  const clusters = clusterParts(parts);
  const presets = STOCK_PRESETS.filter((p) => p.unit === unit);
  const lengthAllowanceMm = DEFAULT_LENGTH_ALLOWANCE_MM[unit];
  const out: Suggestion[] = [];
  for (const cluster of clusters) {
    let best: Scored | null = null;
    for (const preset of presets) {
      const s = score(cluster, preset, lengthAllowanceMm);
      if (!s) continue;
      if (existingMaterials.has(s.matrix.material)) continue;
      if (
        !best ||
        s.totalGapMm < best.totalGapMm ||
        // Tie-break: prefer presets flagged as defaults for the unit.
        (s.totalGapMm === best.totalGapMm &&
          s.preset.default &&
          !best.preset.default)
      ) {
        best = s;
      }
    }
    if (!best) continue;
    out.push({
      partsCovered: cluster.partsCount,
      matrix: {
        ...best.matrix,
        size: {
          ...best.matrix.size,
          lengths: [pickLength(cluster, best.matrix, lengthAllowanceMm)],
        },
        oversize: {
          length: lengthAllowanceMm,
          crossSection: best.crossSectionGapMm,
        },
      },
    });
  }
  return out.sort((a, b) => b.partsCovered - a.partsCovered);
}

export function suggestStockForProject(
  parts: SuggesterPart[],
  unit: CutlistSettings['distanceUnit'],
  stockYaml: string,
): Suggestion[] {
  let existing: Set<string>;
  try {
    existing = new Set(parseStock(stockYaml).map((s) => s.material));
  } catch {
    existing = new Set();
  }
  return suggestStock(parts, unit, existing);
}
