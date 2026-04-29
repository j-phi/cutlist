/**
 * Pure scene-ordering helpers used by `useScenes`.
 * Mirrors the buildStep ordering pattern but keyed on `order` (zero-based)
 * instead of a one-based step number.
 */

interface Ordered {
  order: number;
}

/** Re-number a list of scenes 0..n-1 based on current array order. */
export function renumberScenes<T extends Ordered>(scenes: T[]): T[] {
  return scenes.map((s, i) => ({ ...s, order: i }));
}

/** Remove a scene by id and re-number the survivors. */
export function removeScene<T extends { id: string } & Ordered>(
  scenes: T[],
  id: string,
): T[] {
  return renumberScenes(scenes.filter((s) => s.id !== id));
}

/** Move a scene to a new array index, then re-number. */
export function moveSceneToIndex<T extends { id: string } & Ordered>(
  scenes: T[],
  id: string,
  toIndex: number,
): T[] {
  const fromIndex = scenes.findIndex((s) => s.id === id);
  if (fromIndex === -1) return scenes;
  const clamped = Math.max(0, Math.min(scenes.length - 1, toIndex));
  if (clamped === fromIndex) return scenes;
  const next = [...scenes];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clamped, 0, moved);
  return renumberScenes(next);
}

/** Return the next `order` to assign (max existing + 1, or 0 if empty). */
export function nextSceneOrder(scenes: Ordered[]): number {
  if (scenes.length === 0) return 0;
  return scenes.reduce((m, s) => Math.max(m, s.order), -1) + 1;
}
