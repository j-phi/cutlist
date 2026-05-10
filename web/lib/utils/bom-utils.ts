import type { BoardLayoutLeftover } from '../types';

/**
 * Groups placements and leftovers by part number, sorted ascending.
 * Each group contains all instances of a given part.
 *
 * Sheet placements, linear placements, and leftovers all share the
 * `BoardLayoutLeftover` field set used here (partNumber, dimensions,
 * material), so the param is typed at that shared shape.
 */
export function groupPartsByNumber(
  placements: BoardLayoutLeftover[],
  leftovers: BoardLayoutLeftover[],
): BoardLayoutLeftover[][] {
  const map = new Map<number, BoardLayoutLeftover[]>();
  for (const part of [...placements, ...leftovers]) {
    const list = map.get(part.partNumber) ?? [];
    list.push(part);
    map.set(part.partNumber, list);
  }
  return [...map.values()].toSorted(
    (a, b) => a[0].partNumber - b[0].partNumber,
  );
}
