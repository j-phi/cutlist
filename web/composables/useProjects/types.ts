import type { Algorithm, Precision } from 'cutlist';
import type { ColorInfo, NodePartMapping, Part } from '~/utils/modelTypes';

export interface Model {
  id: string;
  filename: string;
  source: 'gltf' | 'collada' | 'manual';
  parts: Part[];
  colors: ColorInfo[];
  enabled: boolean;
  rawSource?: object | string;
  nodePartMap?: NodePartMapping[];
}

export interface ManualPartInput {
  name: string;
  widthMm: number;
  lengthMm: number;
  thicknessMm: number;
  qty: number;
  material: string;
  grainLock?: 'length' | 'width';
}

export interface Project {
  id: string;
  name: string;
  models: Model[];
  colorMap: Record<string, string>;
  /** Color keys excluded from BOM (unchecked in mapping panel). */
  excludedColors: string[];
  /** Per-project stock definition (YAML string, mm dimensions). */
  stock: string;
  /** Display preference for distances; storage is always mm. */
  distanceUnit: 'in' | 'mm';
  /** Display precision — resets to the unit's default on unit flip. */
  precision: Precision;
  /** Saw blade width in mm. */
  bladeWidth: number;
  /** Packing margin in mm. */
  margin: number;
  /** Per-project default packing algorithm (used when a material has none). */
  defaultAlgorithm: Algorithm;
  /** Whether to render part numbers in visualizations. */
  showPartNumbers: boolean;
}

export interface ProjectListItem {
  id: string;
  name: string;
  updatedAt: string;
}

export interface ArchivedProjectItem {
  id: string;
  name: string;
  archivedAt: string;
}
