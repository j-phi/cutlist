/**
 * Type definitions for the IndexedDB persistence layer.
 *
 * Record shapes consumed by every domain module. Kept separate so types can
 * be imported without pulling in the Dexie runtime.
 *
 * The Dexie `CutlistDB` class itself lives in `./db`; schema indexes are
 * declared there via `this.version(N).stores({...})`.
 */

import type { ColorInfo, NodePartMapping, Part } from '~/utils/modelTypes';

export interface IdbProject {
  id: string;
  name: string;
  colorMap: Record<string, string>;
  /** Color keys excluded from BOM (unchecked in mapping panel). */
  excludedColors: string[];
  /** Per-project stock definition (YAML string). */
  stock: string;
  /** Per-project distance unit. */
  distanceUnit: 'in' | 'mm';
  /** Per-project saw blade width, in the project's distanceUnit. */
  bladeWidth: number;
  /** Per-project margin/offset for the packing algorithm. */
  margin: number;
  /** Per-project packing strategy hint. */
  optimize: 'Auto' | 'CNC';
  /** Whether to render part numbers in visualizations. */
  showPartNumbers: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface PartOverride {
  grainLock?: 'length' | 'width';
  name?: string;
}

export interface IdbModel {
  id: string;
  projectId: string;
  filename: string;
  source: 'gltf' | 'collada' | 'manual';
  parts: Part[];
  colors: ColorInfo[];
  /** Maps 3D scene node indices to part numbers. Empty for manual models. */
  nodePartMap: NodePartMapping[];
  enabled: boolean;
  /** Raw GLTF JSON or COLLADA XML string. Null for manual models. Kept for the 3D viewer. */
  rawSource: object | string | null;
  /** Per-part user overrides, keyed by partNumber. Extensible for future fields. */
  partOverrides: Record<number, PartOverride>;
  createdAt: string;
}

/** Model record without rawSource — what we keep in the reactive store. */
export type IdbModelMeta = Omit<IdbModel, 'rawSource'>;

export interface IdbBuildStep {
  id: string;
  projectId: string;
  stepNumber: number;
  title: string;
  /** HTML string — supports rich text with hyperlinks. */
  description: string;
  createdAt: string;
}

// ─── Scenes ─────────────────────────────────────────────────────────────────

export type CameraMode = 'perspective' | 'orthographic';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  /** THREE camera.zoom factor. Defaults to 1 when absent. */
  zoom?: number;
  /** Camera up vector. Defaults to [0, 1, 0] when absent. */
  up?: [number, number, number];
}

/**
 * A rigid (translation + rotation) offset applied to an Object after its
 * load-time `originalMatrix`. Stored as a 3-tuple position and a 4-tuple
 * quaternion (THREE.Quaternion order: x, y, z, w).
 *
 * Identity = `{ position: [0,0,0], quaternion: [0,0,0,1] }`.
 *
 * The rotation pivot is the world origin: applying a non-identity quaternion
 * rotates the Object around `(0,0,0)` after its originalMatrix has placed it.
 * Gizmo callers that want "rotate around the Object's centroid" must
 * conjugate (`T(c) · R · T(-c)`) before persisting.
 */
export interface ObjectOffset {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export const IDENTITY_OBJECT_OFFSET: ObjectOffset = {
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
};

export function isIdentityObjectOffset(o: ObjectOffset): boolean {
  return (
    o.position[0] === 0 &&
    o.position[1] === 0 &&
    o.position[2] === 0 &&
    o.quaternion[0] === 0 &&
    o.quaternion[1] === 0 &&
    o.quaternion[2] === 0 &&
    o.quaternion[3] === 1
  );
}

/**
 * A captured viewer state. Per-Object offsets and visibility are keyed by
 * `groupId` (the source-file node identity), never `batchId`.
 *
 * `visibleObjects === undefined` means "all visible" — distinct from `[]`
 * which means "all hidden".
 */
export interface IdbScene {
  id: string;
  projectId: string;
  name: string;
  /** Contiguous 0..N-1 within a project. */
  order: number;
  cameraMode: CameraMode;
  cameraPose: CameraPose;
  /** Per-Object rigid offsets, keyed by groupId. */
  objectOffsets: Record<number, ObjectOffset>;
  /** groupId[] of currently visible Objects. `undefined` ≡ all visible. */
  visibleObjects?: number[];
  floorVisible: boolean;
  /** Data URL for a thumbnail rendered at capture time. */
  thumbnailDataUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Annotations ────────────────────────────────────────────────────────────

export type AnnotationKind = 'callout' | 'dimension';

interface IdbAnnotationBase {
  id: string;
  sceneId: string;
  kind: AnnotationKind;
  /** Anchor Object — the groupId this annotation follows. */
  groupId: number;
  createdAt: string;
  updatedAt: string;
}

export interface IdbCallout extends IdbAnnotationBase {
  kind: 'callout';
  anchorLocal: [number, number, number];
  anchorNormalLocal: [number, number, number];
  labelOffsetLocal: [number, number, number];
  text: string;
}

/**
 * One end of a dimension. The `groupId` lets each anchor live on its own
 * Object so the user can dimension *between* parts (e.g. drawer-side to
 * drawer-front gap). `local` is the point in that Object's local frame.
 */
export interface DimensionAnchor {
  groupId: number;
  local: [number, number, number];
}

export interface IdbDimension extends IdbAnnotationBase {
  kind: 'dimension';
  /**
   * The base `groupId` (inherited from `IdbAnnotationBase`) owns the offset
   * frame: `offsetLocal` is expressed in that Object's local space.
   * Typically equal to `anchor1.groupId`.
   */
  anchor1: DimensionAnchor;
  anchor2: DimensionAnchor;
  /** Perpendicular to the dimension line, world-axis snapped at capture time. */
  offsetLocal: [number, number, number];
  /** Optional label override; falls back to the auto-formatted distance. */
  text?: string;
}

export type IdbAnnotation = IdbCallout | IdbDimension;
