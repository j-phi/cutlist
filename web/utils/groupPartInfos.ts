import type {
  Part,
  ColorInfo,
  NodePartMapping,
  DeriveResult,
} from './modelTypes';
import type { Micrometres } from '~/lib/utils/units';

export interface PartInfo {
  name: string;
  colorKey: string;
  colorHex: string;
  rgb: [number, number, number];
  size: { thickness: Micrometres; width: Micrometres; length: Micrometres };
  nodeIndex: number;
}

/**
 * Cluster tolerance for raw mesh-extent dims. Wide enough to absorb the
 * sub-mm vertex noise some exporters introduce between meshes that
 * represent the same physical part; tight enough to keep real cuts apart.
 */
const GROUP_TOLERANCE_UM = 1000;

/** Map each value to its cluster's leader: sort unique values, start a new
 *  cluster whenever the gap from the previous value exceeds tolerance. */
function clusterByGap(
  values: Iterable<Micrometres>,
): Map<Micrometres, Micrometres> {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  const out = new Map<Micrometres, Micrometres>();
  if (unique.length === 0) return out;
  let leader = unique[0]!;
  out.set(leader, leader);
  for (let i = 1; i < unique.length; i += 1) {
    const v = unique[i]!;
    if (v - unique[i - 1]! > GROUP_TOLERANCE_UM) leader = v;
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
    Math.min(info.size.width, info.size.length) as Micrometres;
  const lengthOf = (info: PartInfo) =>
    Math.max(info.size.width, info.size.length) as Micrometres;

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
      groups.set(key, {
        ...info,
        size: { thickness: t, width: w, length: l },
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
