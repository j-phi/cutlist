/**
 * `LineSegments2` linewidth is in screen pixels — leaving it constant makes
 * edges look proportionally thick when the model is small on screen and
 * proportionally thin when it fills the viewport. Going the other way with
 * `worldUnits: true` over-corrects: lines turn into slabs at close zoom.
 *
 * The compromise here: linewidth tracks the model's current on-screen size,
 * but with a low ceiling so close-up lines never dominate the geometry.
 */

type PerspectiveCamera = import('three').PerspectiveCamera;
type OrthographicCamera = import('three').OrthographicCamera;
type Box3 = import('three').Box3;

const MIN_LINEWIDTH = 0.4;
const MAX_LINEWIDTH = 2.5;
// At fit (~290px on-screen for a 600px-tall canvas) this divisor lands the
// linewidth around 1.5px, matching the previous fixed-2px feel without the
// "too heavy when small" effect.
const PIXELS_PER_LINEWIDTH_UNIT = 200;

export function computeProportionalLinewidth(
  camera: PerspectiveCamera | OrthographicCamera,
  bounds: Box3,
  canvasHeightPx: number,
): number {
  if (canvasHeightPx <= 0) return MIN_LINEWIDTH;
  const sx = bounds.max.x - bounds.min.x;
  const sy = bounds.max.y - bounds.min.y;
  const sz = bounds.max.z - bounds.min.z;
  if (sx <= 0 && sy <= 0 && sz <= 0) return MIN_LINEWIDTH;
  const sphereRadius = Math.sqrt(sx * sx + sy * sy + sz * sz) * 0.5;

  let visibleHeight: number;
  const persp = camera as PerspectiveCamera;
  if (persp.isPerspectiveCamera) {
    const cx = (bounds.min.x + bounds.max.x) * 0.5;
    const cy = (bounds.min.y + bounds.max.y) * 0.5;
    const cz = (bounds.min.z + bounds.max.z) * 0.5;
    const dx = camera.position.x - cx;
    const dy = camera.position.y - cy;
    const dz = camera.position.z - cz;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const fovRad = (persp.fov * Math.PI) / 180;
    visibleHeight = 2 * distance * Math.tan(fovRad / 2);
  } else {
    const ortho = camera as OrthographicCamera;
    visibleHeight = (ortho.top - ortho.bottom) / ortho.zoom;
  }

  if (!(visibleHeight > 0)) return MIN_LINEWIDTH;

  const onScreenDiameter =
    ((2 * sphereRadius) / visibleHeight) * canvasHeightPx;
  const lw = onScreenDiameter / PIXELS_PER_LINEWIDTH_UNIT;
  return Math.max(MIN_LINEWIDTH, Math.min(MAX_LINEWIDTH, lw));
}
