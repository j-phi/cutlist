import { ref } from 'vue';

/**
 * F6 / FR-VIZ-3 — module-scoped, NON-persisted toggle for per-part colouring of
 * the on-screen layout diagram. When on, each part fills with its stable
 * per-part hue ({@link partColorHsl}) — the same hue the PDF uses — so a part
 * reads identically across screen and PDF.
 *
 * Deliberately not in `useProjectSettings` / IDB: this is a presentational view
 * preference, and we just batched the v10 schema. A persisted toggle is a
 * follow-up if users want it to stick across reloads.
 */
const colorParts = ref(false);

export function usePartColoring() {
  return { colorParts };
}
