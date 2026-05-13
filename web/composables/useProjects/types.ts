import type { Algorithm, Micrometres, Precision, StockMatrix } from 'cutlist';
import type { ColorInfo, NodePartMapping, Part } from '~/utils/modelTypes';

export interface Model {
  id: string;
  filename: string;
  source: 'gltf' | 'assimp' | 'manual';
  parts: Part[];
  colors: ColorInfo[];
  enabled: boolean;
  rawSource?: object | string;
  nodePartMap?: NodePartMapping[];
}

export interface ManualPartInput {
  name: string;
  widthUm: Micrometres;
  lengthUm: Micrometres;
  thicknessUm: Micrometres;
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
  /** Per-project stock definition. All numeric dimensions are millimetres. */
  stocks: StockMatrix[];
  /** Display preference for distances; storage is always µm. */
  distanceUnit: 'in' | 'mm';
  /** Display precision — resets to the unit's default on unit flip. */
  precision: Precision;
  /** Saw blade width, integer micrometres. */
  bladeWidth: Micrometres;
  /** Packing margin, integer micrometres. */
  margin: Micrometres;
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
