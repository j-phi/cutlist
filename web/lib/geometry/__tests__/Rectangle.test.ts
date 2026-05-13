import { describe, it, expect } from 'vitest';
import { Rectangle } from '../Rectangle';
import { um } from '~/test-utils/units';

function rect(x: number, y: number, w: number, h: number) {
  return new Rectangle<null>(null, um(x), um(y), um(w), um(h));
}

describe('Rectangle', () => {
  it('constructor exposes derived right/top corners', () => {
    expect(rect(4, 6, 2, 3)).toEqual(
      expect.objectContaining({
        left: 4,
        bottom: 6,
        right: 6,
        top: 9,
        width: 2,
        height: 3,
      }),
    );
  });

  it('pad', () => {
    const original = rect(1, 1, 1, 1);
    const expected = rect(0, -2, 4, 8);
    const actual = original.pad({
      left: um(1),
      right: um(2),
      bottom: um(3),
      top: um(4),
    });

    expect(actual).toEqual(expected);
  });

  describe('flipOrientation', () => {
    it('should flip the width and height', () => {
      const r = rect(1, 1, 1, 2);
      const expected = rect(1, 1, 2, 1);

      const actual = r.flipOrientation();

      expect(actual).toEqual(expected);
    });
  });

  describe('isInside', () => {
    it('should return true when fully inside', () => {
      const rect1 = rect(1, 1, 2, 2);
      const rect2 = rect(0, 0, 5, 5);
      expect(rect1.isInside(rect2)).toBe(true);
    });

    it('should return true when edges coincide exactly', () => {
      const rect1 = rect(0, 0, 5, 5);
      const rect2 = rect(0, 0, 5, 5);
      expect(rect1.isInside(rect2)).toBe(true);
    });

    it('should return false when partially outside', () => {
      const rect1 = rect(4, 4, 2, 2);
      const rect2 = rect(0, 0, 5, 5);
      expect(rect1.isInside(rect2)).toBe(false);
    });

    it('should return false when completely outside', () => {
      const rect1 = rect(6, 6, 2, 2);
      const rect2 = rect(0, 0, 5, 5);
      expect(rect1.isInside(rect2)).toBe(false);
    });
  });

  describe('isIntersecting', () => {
    it('should return true when rectangles overlap along an edge range', () => {
      const rect1 = rect(4, 0, 1, 5);
      const rect2 = rect(0, 0, 5, 5);
      expect(rect1.isIntersecting(rect2)).toBe(true);
    });

    it('should return true when partially intersecting', () => {
      const rect1 = rect(3, 3, 3, 3);
      const rect2 = rect(0, 0, 5, 5);
      expect(rect1.isIntersecting(rect2)).toBe(true);
    });

    it('should return false when corners only touch', () => {
      const rect1 = rect(5, 5, 1, 1);
      const rect2 = rect(0, 0, 5, 5);
      expect(rect1.isIntersecting(rect2)).toBe(false);
    });

    it('should return false when completely separate', () => {
      const rect1 = rect(6, 6, 2, 2);
      const rect2 = rect(0, 0, 5, 5);
      expect(rect1.isIntersecting(rect2)).toBe(false);
    });
  });
});
