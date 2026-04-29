/**
 * Quadratic easeInOut curve. Shared by the camera-pose tween in CameraRig
 * and the scene tween in useSceneAuthor so both feel identical at the same
 * `t`.
 */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
