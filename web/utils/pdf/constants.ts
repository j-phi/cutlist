/**
 * Conversion factor: 1 mm = 72/25.4 PDF points (ISO 32000-1, 1 pt = 1/72 in).
 */
export const MM = 2.83464566929;

/** US Letter width in mm (8.5 in). */
export const LETTER_W_MM = 215.9;
/** US Letter height in mm (11 in). */
export const LETTER_H_MM = 279.4;

/** Vertical space reserved for the page header (title + date + rule). */
export const HEADER_BAND_MM = 12;
/** Vertical space reserved below the content area (currently unused). */
export const FOOTER_BAND_MM = 0;
/** Vertical space for the per-board stock name + material/size subtitle lines. */
export const BOARD_TITLE_BAND_MM = 16;
/** Horizontal space reserved for a side legend column (currently unused). */
export const LEGEND_BAND_MM = 0;
