import { describe, expect, it } from 'vitest';
import {
  CLICK_PIXEL_THRESHOLD,
  CLICK_TIME_THRESHOLD_MS,
  isClick,
} from '../InputRouter';

describe('isClick', () => {
  it('Should treat a perfectly stationary brief press as a click', () => {
    expect(isClick(100, 100, 0, 100, 100, 50)).toBe(true);
  });

  it('Should accept drift exactly at the pixel threshold', () => {
    expect(isClick(0, 0, 0, CLICK_PIXEL_THRESHOLD, 0, 0)).toBe(true);
  });

  it('Should reject drift one pixel past the threshold', () => {
    expect(isClick(0, 0, 0, CLICK_PIXEL_THRESHOLD + 0.01, 0, 0)).toBe(false);
  });

  it('Should accept a press exactly at the time threshold', () => {
    expect(isClick(0, 0, 0, 0, 0, CLICK_TIME_THRESHOLD_MS)).toBe(true);
  });

  it('Should reject a press one millisecond past the time threshold', () => {
    expect(isClick(0, 0, 0, 0, 0, CLICK_TIME_THRESHOLD_MS + 1)).toBe(false);
  });

  it('Should compute Euclidean distance, not Manhattan', () => {
    // 3-4-5: distance = 5 — exactly at threshold.
    expect(isClick(0, 0, 0, 3, 4, 0)).toBe(true);
    // Both axes at threshold individually = sqrt(50) > 5.
    expect(isClick(0, 0, 0, 5, 5, 0)).toBe(false);
  });
});
