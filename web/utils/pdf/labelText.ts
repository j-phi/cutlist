/**
 * F20 — shared, PURE label-layout decision for placed-part name labels.
 *
 * People read top-to-bottom, so a part's name should run HORIZONTALLY,
 * wrapping onto a few lines, and rotate 90° only as a last resort when even a
 * wrapped horizontal block won't fit the piece. Both render engines call this
 * one function so the screen (CSS flow) and the PDF (pdf-lib point math) agree
 * on rotation, line breaks, and placement — only the coordinate mapping after
 * the decision differs (FR-LBLT-7).
 *
 * This module NEVER touches pdf-lib or the DOM. Text width is supplied by a
 * `measure(text, fontPt) => width` oracle so the decision is deterministic and
 * unit-testable. Tests pass `measure = (t, pt) => t.length * pt * 0.5`.
 */

/** Maximum wrapped horizontal lines before we consider rotating (FR-LBLT-1). */
export const MAX_LINES = 3;

/**
 * Both axes must fill to at least this fraction of the part's visible rect for
 * a candidate to count as "fits" (FR-LBLT-1: ≥ 90% fill on both axes). This is
 * an upper bound: the text block must not exceed the rect (clamp), AND it must
 * fill enough of it to be the chosen attempt. We use it only as the overflow
 * ceiling — a block whose along-axis extent exceeds the rect fails.
 */
const FILL_CEILING = 0.9;

export type LabelRotate = 0 | 90;
export type LabelPlacement = 'top' | 'center';

export interface LabelLayout {
  rotate: LabelRotate;
  lines: string[];
  placement: LabelPlacement;
}

export interface LabelInput {
  /** The label text (part name). */
  text: string;
  /** Part visible-rectangle width, in the caller's unit (px or pt). */
  width: number;
  /** Part visible-rectangle height, same unit. */
  height: number;
  /** Font size, same unit as width/height (text-coordinate units). */
  fontPt: number;
  /** Line height (baseline-to-baseline), same unit. Defaults to `fontPt`. */
  lineHeight?: number;
  /** Requested placement (default `'center'`). */
  placement?: LabelPlacement;
  /**
   * Whether dimension lines are enabled/edge-mode for this part (F14). When
   * true and the requested placement is `'top'`, the label yields to the
   * top-edge dimension run and renders `'center'` instead (FR-LBLT-5).
   */
  dimensionsEnabled?: boolean;
  /** Deterministic text-width oracle. */
  measure: (text: string, fontPt: number) => number;
}

/**
 * Wrap `text` to fit `budgetW` (per-line width), breaking on spaces first then
 * hard-breaking a single too-long word mid-word (FR-LBLT-1). Produces at most
 * `maxLines` lines; if the text needs more, returns more lines (the caller
 * clamps). Never returns an empty array for non-empty input.
 */
export function wrapLabel(
  text: string,
  budgetW: number,
  fontPt: number,
  measure: (text: string, fontPt: number) => number,
  maxLines: number = MAX_LINES,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (budgetW <= 0) return [trimmed];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  const pushHardBroken = (word: string) => {
    // Hard-break a single word that exceeds the budget, mid-word.
    let chunk = '';
    for (const ch of word) {
      const next = chunk + ch;
      if (chunk && measure(next, fontPt) > budgetW) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = next;
      }
    }
    if (chunk) current = chunk;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, fontPt) <= budgetW) {
      current = candidate;
      continue;
    }
    // Candidate overflows. Flush the current line first (if any).
    if (current) {
      lines.push(current);
      current = '';
    }
    if (measure(word, fontPt) <= budgetW) {
      current = word;
    } else {
      pushHardBroken(word);
    }
  }
  if (current) lines.push(current);

  // Cap to maxLines — trailing overflow is dropped by the caller's clamp, but
  // we keep the cap here so the fit test sees the real line count for the
  // first maxLines lines. We return ALL produced lines so the caller can tell
  // "needs more than maxLines" (rotation trigger) vs "fits".
  return lines;
}

/**
 * Try a horizontal (rotate 0) fit into a `w × h` rectangle. Returns the wrapped
 * lines if the block fits within the rect at the fill ceiling, else `null`.
 *
 * Fit test:
 *  - widest line ≤ w · FILL_CEILING (every line within the width budget), and
 *  - lines.length ≤ maxLines, and
 *  - total block height (lines · lineHeight) ≤ h · FILL_CEILING.
 */
function tryFit(
  text: string,
  w: number,
  h: number,
  fontPt: number,
  lineHeight: number,
  measure: (text: string, fontPt: number) => number,
): string[] | null {
  const budgetW = w * FILL_CEILING;
  const lines = wrapLabel(text, budgetW, fontPt, measure, MAX_LINES);
  if (lines.length === 0) return null;
  if (lines.length > MAX_LINES) return null;
  const widest = Math.max(...lines.map((l) => measure(l, fontPt)));
  if (widest > budgetW) return null;
  const blockH = lines.length * lineHeight;
  if (blockH > h * FILL_CEILING) return null;
  return lines;
}

/**
 * Clamp a fitted line list to the rect's height (FR-LBLT-6): drop trailing
 * lines that would overflow the visible rectangle rather than spilling into a
 * neighbour. `h` and `lineHeight` are in the rotated frame's height axis (the
 * axis the lines stack along).
 */
function clampLines(lines: string[], h: number, lineHeight: number): string[] {
  if (lineHeight <= 0) return lines.slice(0, 1);
  const maxFit = Math.max(1, Math.floor(h / lineHeight));
  return lines.slice(0, Math.min(lines.length, maxFit));
}

/**
 * Decide how to render a part's name label (FR-LBLT-1..6). Pure + deterministic
 * given the `measure` oracle, so screen and PDF derive identical decisions
 * (FR-LBLT-7).
 *
 * Order of attempts (strict):
 *   1. single-line / wrapped horizontal (≤ MAX_LINES) into w × h → rotate 0
 *   2. otherwise rotate 90° and re-run the same wrap/fit with axes swapped
 *      (lines now stack along the part WIDTH, run along the part HEIGHT).
 * The first attempt that fits at ≥ FILL_CEILING on both axes wins; if neither
 * fits, we still produce the rotation that holds the most lines and clamp
 * (FR-LBLT-6) so something legible renders without overflowing.
 */
export function decideLabelLayout(input: LabelInput): LabelLayout {
  const {
    text,
    width,
    height,
    fontPt,
    measure,
    dimensionsEnabled = false,
  } = input;
  const lineHeight = input.lineHeight ?? fontPt;

  // FR-LBLT-5: 'top' yields to the top-edge dimension run when dimensions are
  // on for this part — render 'center' instead, without moving the dimensions.
  const requested: LabelPlacement = input.placement ?? 'center';
  const placement: LabelPlacement =
    requested === 'top' && dimensionsEnabled ? 'center' : requested;

  const empty = !text.trim();
  if (empty) {
    return { rotate: 0, lines: [], placement };
  }

  // Attempt 1 — horizontal. Lines run along width, stack along height.
  const horiz = tryFit(text, width, height, fontPt, lineHeight, measure);
  if (horiz) {
    return { rotate: 0, lines: horiz, placement };
  }

  // FR-LBLT-3 — rotate 90° and re-run with axes swapped: lines run along the
  // part HEIGHT (the along-line budget) and stack along the part WIDTH.
  const rot = tryFit(text, height, width, fontPt, lineHeight, measure);
  if (rot) {
    return { rotate: 90, lines: rot, placement };
  }

  // Neither orientation cleanly fits. Pick the orientation whose along-line
  // axis is longer (fewer wrapped lines), wrap to that, and clamp the stack
  // (FR-LBLT-6) so trailing lines drop instead of overflowing.
  if (width >= height) {
    const lines = wrapLabel(text, width * FILL_CEILING, fontPt, measure);
    return {
      rotate: 0,
      lines: clampLines(lines, height, lineHeight),
      placement,
    };
  }
  const lines = wrapLabel(text, height * FILL_CEILING, fontPt, measure);
  return {
    rotate: 90,
    lines: clampLines(lines, width, lineHeight),
    placement,
  };
}
