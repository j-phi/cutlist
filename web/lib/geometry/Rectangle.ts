import { Point } from './Point';
import type { Micrometres } from '../utils/units';

/**
 * Axis-aligned rectangle whose coordinates are integer micrometres.
 * Origin is bottom-left in normal Cartesian space. All arithmetic on the
 * rectangle is exact integer arithmetic — no tolerance, no FP slop.
 */
export class Rectangle<T> {
  readonly left: Micrometres;
  readonly bottom: Micrometres;
  readonly width: Micrometres;
  readonly height: Micrometres;

  constructor(
    readonly data: T,
    x: Micrometres,
    y: Micrometres,
    width: Micrometres,
    height: Micrometres,
  ) {
    this.left = x;
    this.bottom = y;
    this.width = width;
    this.height = height;
  }

  get right(): Micrometres {
    return (this.left + this.width) as Micrometres;
  }

  get top(): Micrometres {
    return (this.bottom + this.height) as Micrometres;
  }

  get bottomLeft(): Point {
    return new Point(this.left, this.bottom);
  }

  get topLeft(): Point {
    return new Point(this.left, this.top);
  }

  get bottomRight(): Point {
    return new Point(this.right, this.bottom);
  }

  clone(changes?: {
    left?: Micrometres;
    bottom?: Micrometres;
    width?: Micrometres;
    height?: Micrometres;
  }): Rectangle<T> {
    return new Rectangle(
      this.data,
      changes?.left ?? this.left,
      changes?.bottom ?? this.bottom,
      changes?.width ?? this.width,
      changes?.height ?? this.height,
    );
  }

  moveTo(point: Point): Rectangle<T> {
    return this.clone({
      left: point.x,
      bottom: point.y,
    });
  }

  /** Expanded rectangle; negative values shrink. */
  pad(p: {
    left?: Micrometres;
    right?: Micrometres;
    top?: Micrometres;
    bottom?: Micrometres;
  }): Rectangle<T> {
    const dl = (p.left ?? 0) as Micrometres;
    const dr = (p.right ?? 0) as Micrometres;
    const dt = (p.top ?? 0) as Micrometres;
    const db = (p.bottom ?? 0) as Micrometres;
    return this.clone({
      left: (this.left - dl) as Micrometres,
      bottom: (this.bottom - db) as Micrometres,
      width: (this.width + dl + dr) as Micrometres,
      height: (this.height + db + dt) as Micrometres,
    });
  }

  flipOrientation(): Rectangle<T> {
    return this.clone({
      width: this.height,
      height: this.width,
    });
  }

  /** `other` is fully inside `this` (edge-coincident counts as inside). */
  isInside(other: Rectangle<unknown>): boolean {
    return (
      this.left >= other.left &&
      this.right <= other.right &&
      this.top <= other.top &&
      this.bottom >= other.bottom
    );
  }

  /** Strict overlap — touching edges do not count as intersecting. */
  isIntersecting(other: Rectangle<unknown>): boolean {
    return !(
      this.right <= other.left ||
      this.left >= other.right ||
      this.top <= other.bottom ||
      this.bottom >= other.top
    );
  }
}
