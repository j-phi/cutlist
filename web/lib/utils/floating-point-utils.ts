/**
 * Relative-magnitude equality. Effective absolute window is roughly
 * `epsilon * (|a| + |b|)`. Correct for values bounded away from zero
 * (board coordinates, area sums). NOT for identity checks on near-zero
 * physical quantities (sheet thickness etc.) — use an absolute domain
 * tolerance there. See CLAUDE.md "Tolerances".
 *
 * Foot-gun: the `a === 0` branch collapses the window to ~5e-329, so
 * `isNearlyEqual(0, 1e-12, 1e-5)` is `false`.
 *
 * Adapted from <https://floating-point-gui.de/errors/comparison/>.
 */
export function isNearlyEqual(a: number, b: number, epsilon: number): boolean {
  if (a === b) return true;

  const absA = Math.abs(a);
  const absB = Math.abs(b);
  const diff = Math.abs(a - b);

  if (a === 0 || b === 0 || absA + absB < Number.MIN_VALUE) {
    return diff < epsilon * Number.MIN_VALUE;
  }
  return diff / Math.min(absA + absB, Number.MAX_VALUE) < epsilon;
}

/** `a > b - epsilon` — absolute slop, safe near zero. */
export function isNearlyGreaterThan(
  a: number,
  b: number,
  epsilon: number,
): boolean {
  return a + epsilon > b;
}

/** `a < b + epsilon` — absolute slop, safe near zero. */
export function isNearlyLessThan(
  a: number,
  b: number,
  epsilon: number,
): boolean {
  return a - epsilon < b;
}

export function isNearlyGreaterThanOrEqual(
  a: number,
  b: number,
  epsilon: number,
): boolean {
  return isNearlyEqual(a, b, epsilon) || isNearlyGreaterThan(a, b, epsilon);
}

export function isNearlyLessThanOrEqual(
  a: number,
  b: number,
  epsilon: number,
): boolean {
  return isNearlyEqual(a, b, epsilon) || isNearlyLessThan(a, b, epsilon);
}
