import YAML from 'js-yaml';
import {
  convertUnits,
  DEFAULT_INCH_PRECISION,
  DEFAULT_MM_PRECISION,
  type Algorithm,
  type LinearStockMatrix,
  type Precision,
  type SheetStockMatrix,
  type StockMatrix,
} from 'cutlist';

export interface CutlistSettings {
  /** All distance fields are millimetres. `distanceUnit` is display-only. */
  bladeWidth: number;
  distanceUnit: 'in' | 'mm';
  precision: Precision;
  margin: number;
  defaultAlgorithm: Algorithm;
  showPartNumbers: boolean;
  stock: string;
}

/** Default display precision for the given unit. */
export function defaultPrecisionForUnit(unit: 'mm' | 'in'): Precision {
  return unit === 'in' ? DEFAULT_INCH_PRECISION : DEFAULT_MM_PRECISION;
}

/**
 * A stock preset, authored in whichever unit reads naturally for that
 * material (sheet goods in mm, North-American lumber in inches). Converted
 * to mm before being added to a project — the catalog is human-facing, the
 * stored matrix is canonical mm.
 */
interface StockPreset {
  label: string;
  /** If true, this preset is auto-added to new projects matching `unit`. */
  default: boolean;
  unit: 'mm' | 'in';
  stock: SheetStockMatrix | LinearStockMatrix;
}

export const STOCK_PRESETS: StockPreset[] = [
  // ── Metric (mm) ────────────────────────────────────────
  {
    label: 'Plywood (mm)',
    default: true,
    unit: 'mm',
    stock: {
      kind: 'sheet',
      material: 'Plywood',
      color: '#d2b996',
      sizes: [{ width: 1220, length: 2440, thickness: [18, 12, 9, 6] }],
    },
  },
  {
    label: 'MDF (mm)',
    default: true,
    unit: 'mm',
    stock: {
      kind: 'sheet',
      material: 'MDF',
      color: '#b09078',
      sizes: [{ width: 1220, length: 2440, thickness: [18, 12, 9, 6, 3] }],
    },
  },
  {
    label: 'Particle Board (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'sheet',
      material: 'Particle Board',
      color: '#c8b48c',
      sizes: [{ width: 1220, length: 2440, thickness: [18, 16, 12] }],
    },
  },
  {
    label: 'Melamine (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'sheet',
      material: 'Melamine',
      color: '#ebe6de',
      sizes: [{ width: 1220, length: 2440, thickness: [18, 16] }],
    },
  },
  {
    label: 'OSB (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'sheet',
      material: 'OSB',
      color: '#c3a050',
      sizes: [{ width: 1220, length: 2440, thickness: [18, 12, 9] }],
    },
  },
  {
    label: 'Hardboard (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'sheet',
      material: 'Hardboard',
      color: '#694123',
      sizes: [{ width: 1220, length: 2440, thickness: [6, 3] }],
    },
  },
  {
    label: 'CLS 38×89 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'CLS 38×89',
      color: '#d2b996',
      size: {
        crossSectionWidth: 89,
        crossSectionThickness: 38,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  {
    label: 'CLS 47×100 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'CLS 47×100',
      color: '#d2b996',
      size: {
        crossSectionWidth: 100,
        crossSectionThickness: 47,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  {
    label: 'CLS 89×89 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'CLS 89×89',
      color: '#d2b996',
      size: {
        crossSectionWidth: 89,
        crossSectionThickness: 89,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  // ── Imperial (in) ──────────────────────────────────────
  {
    label: 'Plywood (in)',
    default: true,
    unit: 'in',
    stock: {
      kind: 'sheet',
      material: 'Plywood',
      color: '#d2b996',
      sizes: [{ width: 48, length: 96, thickness: [0.75, 0.5, 0.25] }],
    },
  },
  {
    label: 'MDF (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'sheet',
      material: 'MDF',
      color: '#b09078',
      sizes: [{ width: 48, length: 96, thickness: [0.75, 0.5, 0.25] }],
    },
  },
  {
    // Real hardwood is sold in random widths and lengths, so a fixed-size
    // preset is misleading as an auto-default. Kept in the dropdown for
    // users who do buy standardized board widths (1×6, 1×8, 1×12 S4S).
    label: 'Hardwood Lumber (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'sheet',
      material: 'Hardwood',
      color: '#a5784a',
      sizes: [
        { width: 6, length: 96, thickness: [0.75, 1, 1.5] },
        { width: 8, length: 96, thickness: [0.75, 1, 1.5] },
        { width: 12, length: 96, thickness: [0.75, 1, 1.5] },
      ],
    },
  },
  {
    label: 'Softwood Lumber (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'sheet',
      material: 'Softwood',
      color: '#dcc391',
      sizes: [
        { width: 3.5, length: 96, thickness: [0.75, 1.5] },
        { width: 5.5, length: 96, thickness: [0.75, 1.5] },
        { width: 7.25, length: 96, thickness: [0.75, 1.5] },
        { width: 11.25, length: 96, thickness: [0.75, 1.5] },
      ],
    },
  },
  {
    label: 'Pine 2×4 (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'linear',
      material: 'Pine 2×4',
      color: '#d2b996',
      size: {
        crossSectionWidth: 3.5,
        crossSectionThickness: 1.5,
        lengths: [96, 120, 144, 192],
      },
    },
  },
  {
    label: 'Pine 2×6 (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'linear',
      material: 'Pine 2×6',
      color: '#d2b996',
      size: {
        crossSectionWidth: 5.5,
        crossSectionThickness: 1.5,
        lengths: [96, 120, 144, 192],
      },
    },
  },
  {
    label: 'Pine 1×4 (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'linear',
      material: 'Pine 1×4',
      color: '#d2b996',
      size: {
        crossSectionWidth: 3.5,
        crossSectionThickness: 0.75,
        lengths: [96, 120, 144, 192],
      },
    },
  },
  {
    label: 'Pine 4×4 (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'linear',
      material: 'Pine 4×4',
      color: '#d2b996',
      size: {
        crossSectionWidth: 3.5,
        crossSectionThickness: 3.5,
        lengths: [96, 120, 144, 192],
      },
    },
  },
];

/**
 * Convert a preset's authored dimensions to the canonical mm form used at
 * rest. Always returns a fresh deep object so callers can mutate the
 * result without touching the shared module-scope preset.
 */
export function presetToMmStock(preset: StockPreset): StockMatrix {
  const scale = (n: number) =>
    preset.unit === 'mm' ? n : convertUnits(n, 'in', 'mm');
  if (preset.stock.kind === 'linear') {
    return {
      ...preset.stock,
      size: {
        crossSectionWidth: scale(preset.stock.size.crossSectionWidth),
        crossSectionThickness: scale(preset.stock.size.crossSectionThickness),
        lengths: preset.stock.size.lengths.map(scale),
      },
    };
  }
  return {
    ...preset.stock,
    sizes: preset.stock.sizes.map((s) => ({
      width: scale(s.width),
      length: scale(s.length),
      thickness: s.thickness.map(scale),
    })),
  };
}

/**
 * Default stock YAML seeded into a new project. The user's display unit
 * picks which presets are *default-selected*; storage is always mm.
 */
export function getDefaultStockYaml(unit: 'mm' | 'in'): string {
  const presets = STOCK_PRESETS.filter((p) => p.default && p.unit === unit).map(
    presetToMmStock,
  );
  return presets.length > 0
    ? YAML.dump(presets, { indent: 2, flowLevel: 2 })
    : '';
}

/** Default blade width: 3.175 mm (≈1/8"), regardless of project unit. */
export const DEFAULT_BLADE_WIDTH_MM = 3.175;

export const DEFAULT_SETTINGS: CutlistSettings = {
  bladeWidth: DEFAULT_BLADE_WIDTH_MM,
  distanceUnit: 'mm',
  precision: DEFAULT_MM_PRECISION,
  margin: 0,
  defaultAlgorithm: 'auto',
  showPartNumbers: true,
  stock: '',
};
