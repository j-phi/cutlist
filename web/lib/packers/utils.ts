import type { Point, Rectangle } from '../geometry';
import type { Micrometres } from '../utils/units';

export function getAllPossiblePlacements<T>(
  bin: Rectangle<unknown>,
  placements: Rectangle<T>[],
  gap: Micrometres,
): Point[] {
  const zero = 0 as Micrometres;
  return [
    bin.bottomLeft,
    ...placements.map((rect) => rect.topLeft.add(zero, gap)),
    ...placements.map((rect) => rect.bottomRight.add(gap, zero)),
  ];
}

export function isValidPlacement<T>(
  bin: Rectangle<unknown>,
  placements: Rectangle<T>[],
  rect: Rectangle<T>,
  gap: Micrometres = 0 as Micrometres,
): boolean {
  return (
    rect.isInside(bin) &&
    placements.every((p) => {
      const padded =
        gap > 0 ? p.pad({ left: gap, right: gap, top: gap, bottom: gap }) : p;
      return !rect.isIntersecting(padded);
    })
  );
}
