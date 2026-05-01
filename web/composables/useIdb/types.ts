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
import type { CameraMode, CameraPose, ObjectOffset } from '~/utils/types';

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

/**
 * A captured viewer state. Per-Object offsets and visibility are keyed by
 * `groupId` (the source-file node identity), never `batchId`.
 *
 * Scenes are scoped to the **model** they were captured against — each model
 * in a project has its own independent scene timeline. Switching models in
 * the UI swaps which timeline is shown.
 *
 * `visibleObjects === undefined` means "all visible" — distinct from `[]`
 * which means "all hidden".
 */
export interface IdbScene {
  id: string;
  /** The model this scene belongs to. Scenes are model-scoped, not project-scoped. */
  modelId: string;
  name: string;
  /** Contiguous 0..N-1 within a model. */
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
