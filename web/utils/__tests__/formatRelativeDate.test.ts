import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeDate } from '../formatRelativeDate';

describe('formatRelativeDate', () => {
  const NOW = new Date('2026-04-27T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Should return "just now" for timestamps less than a minute old', () => {
    const iso = new Date(NOW - 30_000).toISOString();
    expect(formatRelativeDate(iso)).toBe('just now');
  });

  it('Should return Nm ago for timestamps under an hour old', () => {
    const iso = new Date(NOW - 5 * 60_000).toISOString();
    expect(formatRelativeDate(iso)).toBe('5m ago');
  });

  it('Should return Nh ago for timestamps under a day old', () => {
    const iso = new Date(NOW - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeDate(iso)).toBe('3h ago');
  });

  it('Should return Nd ago for timestamps under a week old', () => {
    const iso = new Date(NOW - 4 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeDate(iso)).toBe('4d ago');
  });

  it('Should return a localized month-day for older timestamps', () => {
    const old = new Date(NOW - 30 * 24 * 60 * 60_000);
    const expected = old.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    expect(formatRelativeDate(old.toISOString())).toBe(expected);
  });
});
