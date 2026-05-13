import type { Micrometres } from '../utils/units';

export class Point {
  constructor(
    readonly x: Micrometres,
    readonly y: Micrometres,
  ) {}

  add(x: Micrometres, y: Micrometres): Point {
    return new Point((this.x + x) as Micrometres, (this.y + y) as Micrometres);
  }
}
