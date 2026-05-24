/**
 * F20 Part B — pure decision for HOW a placed part's measurement renders, given
 * the selected `MeasurementMode`. Keeps the mode → primitive-kind mapping out
 * of the pdf-lib draw code so it's deterministic and testable (mirrors F14's
 * pure-emit split).
 *
 * The four modes map to distinct render strategies:
 *   - `edge`    → engineering dimension lines on the piece edges (F14).
 *   - `outside` → per-board overall dims in the margin OUTSIDE the stock.
 *   - `inside`  → size value text inside the piece (occupancy-avoided).
 *   - `text`    → plain `W × H` text centered in the piece (pre-F14 behaviour).
 *
 * This module only classifies; the actual geometry lives in the renderer.
 */

import type { MeasurementMode } from 'cutlist';

/** What the renderer should produce for a single placed part. */
export type PartMeasurementPlan =
  | { kind: 'edge' } // F14 drawPartDimensions on the piece
  | { kind: 'interior' } // value text inside the piece (text / inside modes)
  | { kind: 'none' }; // per-board outside dims handle it elsewhere

/**
 * Classify the per-part measurement render for `mode` when measurements are
 * enabled. `outside` is drawn once per board (not per part), so per-part it is
 * `'none'`.
 */
export function planPartMeasurement(
  mode: MeasurementMode,
  enabled: boolean,
): PartMeasurementPlan {
  if (!enabled) return { kind: 'none' };
  switch (mode) {
    case 'edge':
      return { kind: 'edge' };
    case 'text':
    case 'inside':
      return { kind: 'interior' };
    case 'outside':
      return { kind: 'none' };
  }
}

/** Whether `mode` draws per-board overall dimensions outside the stock edge. */
export function isOutsideBoardMode(
  mode: MeasurementMode,
  enabled: boolean,
): boolean {
  return enabled && mode === 'outside';
}
