import type { Micrometres } from 'cutlist';
import { Rectangle } from '~/lib/geometry/Rectangle';

/** Brand a plain number as Micrometres for test fixtures. */
export const um = (n: number) => n as Micrometres;

/** Build a Rectangle from plain-number coordinates. */
export function rect<T>(
  data: T,
  x: number,
  y: number,
  w: number,
  h: number,
): Rectangle<T> {
  return new Rectangle<T>(data, um(x), um(y), um(w), um(h));
}
