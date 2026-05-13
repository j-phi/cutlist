import type { Micrometres } from '../utils/units';

export class Point {
  constructor(
    readonly x: Micrometres,
    readonly y: Micrometres,
  ) {}

  clone(changes?: { x?: Micrometres; y?: Micrometres }): Point {
    return new Point(changes?.x ?? this.x, changes?.y ?? this.y);
  }

  add(x: Micrometres, y: Micrometres): Point {
    return new Point((this.x + x) as Micrometres, (this.y + y) as Micrometres);
  }

  sub(x: Micrometres, y: Micrometres): Point {
    return new Point((this.x - x) as Micrometres, (this.y - y) as Micrometres);
  }
}
