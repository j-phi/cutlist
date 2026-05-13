/**
 * Type definitions for the IndexedDB persistence layer.
 *
 * Record shapes consumed by every domain module. Kept separate so types can
 * be imported without pulling in the Dexie runtime.
 *
 * The Dexie `CutlistDB` class itself lives in `./db`; schema indexes are
 * declared there via `this.version(N).stores({...})`.
 */

import type { JSONContent } from '@tiptap/core';
import type { Algorithm, Micrometres, Precision } from 'cutlist';
import type { ColorInfo, NodePartMapping, Part } from '~/utils/modelTypes';
import type { CameraMode, CameraPose, ObjectOffset } from '~/utils/types';

export interface IdbProject {
  id: string;
  name: string;
  colorMap: Record<string, string>;
  /** Color keys excluded from BOM (unchecked in mapping panel). */
  excludedColors: string[];
  /**
   * Per-project stock definition (YAML string). All numeric dimensions are
   * millimetres; rows do not carry a unit field.
   */
  stock: string;
  /** Display preference for distances. Storage is always integer µm. */
  distanceUnit: 'in' | 'mm';
  /**
   * Display precision — fractional or decimal granularity for the BOM,
   * layout, PDF, and edit fields. Resets to the unit's default whenever
   * `distanceUnit` changes.
   */
  precision: Precision;
  /** Saw blade width, integer micrometres. */
  bladeWidth: Micrometres;
  /** Packing margin, integer micrometres. */
  margin: Micrometres;
  /**
   * Default packing algorithm. Used for materials in `stock` that don't
   * carry their own `algorithm` override.
   */
  defaultAlgorithm: Algorithm;
  /** Whether to render part numbers in visualizations. */
  showPartNumbers: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PartOverride {
  grainLock?: 'length' | 'width';
  name?: string;
}

export interface IdbModel {
  id: string;
  projectId: string;
  filename: string;
  source: 'gltf' | 'assimp' | 'manual';
  parts: Part[];
  colors: ColorInfo[];
  /** Maps 3D scene node indices to part numbers. Empty for manual models. */
  nodePartMap: NodePartMapping[];
  enabled: boolean;
  /**
   * Raw GLTF JSON for imported models. Null for manual models. Pre-Assimp
   * imports may hold a raw DAE/XML string; `resolveModelScene` re-runs
   * Assimp on those at load time.
   */
  rawSource: object | string | null;
  /** Per-part user overrides, keyed by partNumber. Extensible for future fields. */
  partOverrides: Record<number, PartOverride>;
  createdAt: string;
}

/** Model record without rawSource — what we keep in the reactive store. */
export type IdbModelMeta = Omit<IdbModel, 'rawSource'>;

// ─── Build doc ──────────────────────────────────────────────────────────────

/**
 * The build "page" for a project — a single rich-text document edited
 * inline, Notion-style. Stored as Tiptap's native JSON tree. Embedded
 * image and scene nodes carry their referenced ids in node `attrs`, so
 * referenced ids survive round-tripping without HTML parsing.
 *
 * Exactly one record per project, keyed by `projectId`.
 */
export interface IdbBuildDoc {
  projectId: string;
  /**
   * The doc's title. Always a string. New records are seeded with the
   * project's name on creation; subsequent project renames do not
   * propagate. An empty string is allowed and renders as such.
   */
  title: string;
  doc: JSONContent;
  updatedAt: string;
}

// ─── Assets ─────────────────────────────────────────────────────────────────

/**
 * A binary asset (currently always an image) referenced from a build doc
 * by `<image-block data-asset-id="…">`. Stored in its own table so doc
 * records stay small and so the same asset can be referenced by multiple
 * blocks without duplicating bytes.
 */
export interface IdbAsset {
  id: string;
  projectId: string;
  /** MIME type — used at render time to set the object-URL blob's content-type. */
  mimeType: string;
  /** The image bytes. Dexie persists `Blob` directly. */
  blob: Blob;
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
