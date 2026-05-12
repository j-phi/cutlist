/**
 * Shared grouping logic for parsed model parts (GLTF and COLLADA).
 *
 * Both parsers extract a flat list of PartInfo entries from their
 * respective scene graphs, then run the same grouping step to
 * deduplicate identical parts and produce the DeriveResult consumed
 * by the rest of the app.
 */

import type {
  Part,
  ColorInfo,
  NodePartMapping,
  DeriveResult,
} from './modelTypes';
import { toCanonicalM } from '~/lib/utils/units';

export interface PartInfo {
  name: string;
  colorKey: string;
  colorHex: string;
  rgb: [number, number, number];
  size: { thickness: number; width: number; length: number };
  nodeIndex: number;
}

/** Tolerance for treating two dim values as "the same cut". Coarse enough to
 *  absorb sub-mm vertex noise some exporters (e.g. FBX) introduce between
 *  meshes that represent the same physical part. */
const GROUP_TOLERANCE_M = 1e-3;

/**
 * Walk sorted unique values; merge each into the previous if their gap is
 * ≤ tolerance. Returns a map from input value to its cluster's leader.
 * Unlike grid-snap rounding this has no FP boundary problems — leader
 * selection is order-stable for identical input sets.
 */
function clusterByGap(values: Iterable<number>): Map<number, number> {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  const out = new Map<number, number>();
  if (unique.length === 0) return out;
  let leader = unique[0]!;
  out.set(leader, leader);
  for (let i = 1; i < unique.length; i += 1) {
    const v = unique[i]!;
    if (v - unique[i - 1]! > GROUP_TOLERANCE_M) leader = v;
    out.set(v, leader);
  }
  return out;
}

/**
 * Group raw part infos by stock identity + canonical dimensions.
 * Produces deduplicated Part[], NodePartMapping[], and ColorInfo[].
 */
export function groupPartInfos(partInfos: PartInfo[]): DeriveResult {
  const widthOf = (info: PartInfo) =>
    Math.min(info.size.width, info.size.length);
  const lengthOf = (info: PartInfo) =>
    Math.max(info.size.width, info.size.length);

  const tMap = clusterByGap(partInfos.map((p) => p.size.thickness));
  const wMap = clusterByGap(partInfos.map(widthOf));
  const lMap = clusterByGap(partInfos.map(lengthOf));

  const groups = new Map<
    string,
    PartInfo & { quantity: number; nodeIndices: number[] }
  >();

  for (const info of partInfos) {
    const t = tMap.get(info.size.thickness)!;
    const w = wMap.get(widthOf(info))!;
    const l = lMap.get(lengthOf(info))!;
    const key = [info.colorKey, t, w, l].join('|');
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.nodeIndices.push(info.nodeIndex);
    } else {
      // Snap stored dims to the 1 µm grid so mesh-extent FP noise can't
      // desync part dims from canonical-mm stock dims at exact-equality
      // fit checks. We store the cluster leader (a real input value), not
      // the per-info raw value, so all members share the same stored dims.
      groups.set(key, {
        ...info,
        size: {
          thickness: toCanonicalM(t),
          width: toCanonicalM(w),
          length: toCanonicalM(l),
        },
        quantity: 1,
        nodeIndices: [info.nodeIndex],
      });
    }
  }

  const parts: Part[] = [];
  const nodePartMap: NodePartMapping[] = [];
  let partNumber = 0;

  for (const group of groups.values()) {
    partNumber += 1;
    for (let i = 0; i < group.quantity; i += 1) {
      parts.push({
        partNumber,
        instanceNumber: i + 1,
        name: group.name,
        colorKey: group.colorKey,
        size: group.size,
      });
    }
    for (const nodeIndex of group.nodeIndices) {
      nodePartMap.push({ nodeIndex, partNumber, colorHex: group.colorHex });
    }
  }

  // Tally colors across all parts.
  const colorMap = new Map<
    string,
    { rgb: [number, number, number]; count: number }
  >();
  for (const group of groups.values()) {
    const existing = colorMap.get(group.colorKey);
    if (existing) {
      existing.count += group.quantity;
    } else {
      colorMap.set(group.colorKey, { rgb: group.rgb, count: group.quantity });
    }
  }
  const colors: ColorInfo[] = Array.from(colorMap.entries()).map(
    ([key, { rgb, count }]) => ({ key, rgb, count }),
  );

  return { parts, colors, nodePartMap };
}

export function rgbToHex(rgb: [number, number, number]): string {
  const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const r = clamp(rgb[0]);
  const g = clamp(rgb[1]);
  const b = clamp(rgb[2]);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
