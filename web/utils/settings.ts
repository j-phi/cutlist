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
 * material. Converted to mm by `presetToMmStock` before being added to a
 * project. `oversize` is omitted from the literal shape — the suggester
 * writes a per-cluster allowance onto the added matrix.
 */
type LinearStockMatrixAuthor = Omit<LinearStockMatrix, 'oversize'>;
type SheetStockMatrixAuthor = Omit<SheetStockMatrix, 'oversize'>;

interface StockPreset {
  label: string;
  /** Auto-added to new projects matching `unit`. */
  default: boolean;
  unit: 'mm' | 'in';
  stock: SheetStockMatrixAuthor | LinearStockMatrixAuthor;
}

/**
 * Dimensions reflect what's actually stocked at big-box / lumber yards in
 * each market. Sources cross-checked against Home Depot stocking lists,
 * UK CLS (kiln-dried planed studwork) standards, and BS EN 336 for
 * regularised carcassing. Hardwood is deliberately absent — it's sold
 * random-width / random-length, so a preset is misleading; users add
 * their own per project.
 */
export const STOCK_PRESETS: StockPreset[] = [
  // ── Metric sheet goods (mm) ────────────────────────────
  {
    label: 'Plywood (mm)',
    default: true,
    unit: 'mm',
    stock: {
      kind: 'sheet',
      material: 'Plywood',
      color: '#d2b996',
      sizes: [
        { width: 1220, length: 2440, thickness: [4, 6, 9, 12, 15, 18, 25] },
      ],
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
      sizes: [{ width: 1220, length: 2440, thickness: [6, 9, 12, 18, 25] }],
    },
  },
  {
    // Baltic birch is sold at 1525×1525mm (5×5ft) specifically — it's why
    // woodworkers buy it. The 2440×1220 cut is also available but the
    // square sheet is the differentiator.
    label: 'Baltic Birch (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'sheet',
      material: 'Baltic Birch',
      color: '#f0e0b0',
      sizes: [{ width: 1525, length: 1525, thickness: [6, 12, 18] }],
    },
  },
  {
    // Melamine-faced chipboard — the standard cabinet-carcass material.
    label: 'MFC (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'sheet',
      material: 'MFC',
      color: '#ebe6de',
      sizes: [{ width: 1220, length: 2440, thickness: [15, 18, 25] }],
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
      // 22mm is "floor chipboard"; 18mm is the carcass/shelf default.
      sizes: [{ width: 1220, length: 2440, thickness: [12, 18, 22] }],
    },
  },
  {
    // Sold under metric labels but the thicknesses are 7/16, 1/2, 5/8,
    // 3/4" inch sheathing converted.
    label: 'OSB (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'sheet',
      material: 'OSB',
      color: '#c3a050',
      sizes: [{ width: 1220, length: 2440, thickness: [9, 11, 15, 18] }],
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
      sizes: [{ width: 1220, length: 2440, thickness: [3, 6] }],
    },
  },
  // ── Metric timber (mm) ─────────────────────────────────
  // UK CLS (Canadian Lumber Standard) — kiln-dried planed studwork, always
  // 38mm thick. Three widths cover stud, plate, and wide stud uses.
  {
    label: 'CLS 38×63 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'CLS 38×63',
      color: '#d2b996',
      size: {
        crossSectionWidth: 63,
        crossSectionThickness: 38,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  {
    label: 'CLS 38×89 (mm)',
    default: true,
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
    label: 'CLS 38×140 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'CLS 38×140',
      color: '#d2b996',
      size: {
        crossSectionWidth: 140,
        crossSectionThickness: 38,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  // UK C24 regularised carcassing — structural softwood for joists,
  // rafters, plates. Always 47mm thick; widths step up from stud to joist.
  {
    label: 'C24 47×100 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'C24 47×100',
      color: '#d2b996',
      size: {
        crossSectionWidth: 100,
        crossSectionThickness: 47,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  {
    label: 'C24 47×150 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'C24 47×150',
      color: '#d2b996',
      size: {
        crossSectionWidth: 150,
        crossSectionThickness: 47,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  {
    label: 'C24 47×200 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'C24 47×200',
      color: '#d2b996',
      size: {
        crossSectionWidth: 200,
        crossSectionThickness: 47,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  // Australian structural pine (Bunnings stocking) — different cross-section
  // convention to UK CLS / C24; users in AU recognise these labels.
  {
    label: 'AU Pine 70×45 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'AU Pine 70×45',
      color: '#d2b996',
      size: {
        crossSectionWidth: 70,
        crossSectionThickness: 45,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  {
    label: 'AU Pine 90×45 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'AU Pine 90×45',
      color: '#d2b996',
      size: {
        crossSectionWidth: 90,
        crossSectionThickness: 45,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  {
    label: 'AU Pine 140×45 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'AU Pine 140×45',
      color: '#d2b996',
      size: {
        crossSectionWidth: 140,
        crossSectionThickness: 45,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  // Smaller AU DAR sizes — common for frames, trim, and small drawer parts.
  {
    label: 'AU Pine 70×35 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'AU Pine 70×35',
      color: '#d2b996',
      size: {
        crossSectionWidth: 70,
        crossSectionThickness: 35,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  {
    label: 'AU Pine 90×35 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'AU Pine 90×35',
      color: '#d2b996',
      size: {
        crossSectionWidth: 90,
        crossSectionThickness: 35,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  {
    label: 'AU Pine 42×19 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'AU Pine 42×19',
      color: '#d2b996',
      size: {
        crossSectionWidth: 42,
        crossSectionThickness: 19,
        lengths: [2400, 3000, 3600],
      },
    },
  },
  {
    label: 'AU Pine 35×35 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'AU Pine 35×35',
      color: '#d2b996',
      size: {
        crossSectionWidth: 35,
        crossSectionThickness: 35,
        lengths: [2400, 3000, 3600],
      },
    },
  },
  // AU pine posts — 90×90 nominal sold dressed to ~86×86, but Bunnings
  // commonly stocks both. Match the nominal label users recognise.
  {
    label: 'AU Pine 90×90 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'AU Pine 90×90',
      color: '#d2b996',
      size: {
        crossSectionWidth: 90,
        crossSectionThickness: 90,
        lengths: [2400, 3000, 3600, 4800, 5400],
      },
    },
  },
  // EU C24 mid widths — 75/125/175 fill the stud→joist gap left by the
  // existing 100/150/200 set.
  {
    label: 'C24 47×75 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'C24 47×75',
      color: '#d2b996',
      size: {
        crossSectionWidth: 75,
        crossSectionThickness: 47,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  {
    label: 'C24 47×125 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'C24 47×125',
      color: '#d2b996',
      size: {
        crossSectionWidth: 125,
        crossSectionThickness: 47,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  {
    label: 'C24 47×175 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'C24 47×175',
      color: '#d2b996',
      size: {
        crossSectionWidth: 175,
        crossSectionThickness: 47,
        lengths: [2400, 3000, 3600, 4800],
      },
    },
  },
  // Pine glue panel — solid laminated pine sold in fixed widths; great for
  // tabletops, shelves, drawer fronts. The 30mm panel is the dimensional
  // sweet spot in the user's Workbench model.
  {
    label: 'Pine glue panel 30×400 (mm)',
    default: false,
    unit: 'mm',
    stock: {
      kind: 'linear',
      material: 'Pine glue panel 30×400',
      color: '#e6cda1',
      size: {
        crossSectionWidth: 400,
        crossSectionThickness: 30,
        lengths: [1200, 1800, 2400, 3000],
      },
    },
  },
  // ── Imperial sheet goods (in) ──────────────────────────
  {
    label: 'Plywood (in)',
    default: true,
    unit: 'in',
    stock: {
      kind: 'sheet',
      material: 'Plywood',
      color: '#d2b996',
      sizes: [{ width: 48, length: 96, thickness: [0.25, 0.5, 0.75] }],
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
      sizes: [{ width: 48, length: 96, thickness: [0.25, 0.5, 0.75] }],
    },
  },
  {
    label: 'Baltic Birch (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'sheet',
      material: 'Baltic Birch',
      color: '#f0e0b0',
      sizes: [{ width: 60, length: 60, thickness: [0.25, 0.5, 0.75] }],
    },
  },
  {
    label: 'OSB (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'sheet',
      material: 'OSB',
      color: '#c3a050',
      // 7/16" sheathing, 1/2" general, 23/32" subfloor.
      sizes: [{ width: 48, length: 96, thickness: [0.4375, 0.5, 0.71875] }],
    },
  },
  {
    label: 'Hardboard (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'sheet',
      material: 'Hardboard',
      color: '#694123',
      sizes: [{ width: 48, length: 96, thickness: [0.125] }],
    },
  },
  // ── Imperial timber (in) ───────────────────────────────
  // Nominal → actual S4S softwood (Pine/Fir/SPF). Width = wider face.
  // 1× boards (0.75" thick):
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
    label: 'Pine 1×6 (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'linear',
      material: 'Pine 1×6',
      color: '#d2b996',
      size: {
        crossSectionWidth: 5.5,
        crossSectionThickness: 0.75,
        lengths: [96, 120, 144, 192],
      },
    },
  },
  {
    label: 'Pine 1×8 (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'linear',
      material: 'Pine 1×8',
      color: '#d2b996',
      size: {
        crossSectionWidth: 7.25,
        crossSectionThickness: 0.75,
        lengths: [96, 120, 144, 192],
      },
    },
  },
  {
    label: 'Pine 1×10 (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'linear',
      material: 'Pine 1×10',
      color: '#d2b996',
      size: {
        crossSectionWidth: 9.25,
        crossSectionThickness: 0.75,
        lengths: [96, 120, 144, 192],
      },
    },
  },
  {
    label: 'Pine 1×12 (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'linear',
      material: 'Pine 1×12',
      color: '#d2b996',
      size: {
        crossSectionWidth: 11.25,
        crossSectionThickness: 0.75,
        lengths: [96, 120, 144, 192],
      },
    },
  },
  // 2× lumber (1.5" thick):
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
    label: 'Pine 2×8 (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'linear',
      material: 'Pine 2×8',
      color: '#d2b996',
      size: {
        crossSectionWidth: 7.25,
        crossSectionThickness: 1.5,
        lengths: [96, 120, 144, 192],
      },
    },
  },
  {
    label: 'Pine 2×10 (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'linear',
      material: 'Pine 2×10',
      color: '#d2b996',
      size: {
        crossSectionWidth: 9.25,
        crossSectionThickness: 1.5,
        lengths: [96, 120, 144, 192],
      },
    },
  },
  {
    label: 'Pine 2×12 (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'linear',
      material: 'Pine 2×12',
      color: '#d2b996',
      size: {
        crossSectionWidth: 11.25,
        crossSectionThickness: 1.5,
        lengths: [96, 120, 144, 192],
      },
    },
  },
  // Posts:
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
  {
    label: 'Pine 6×6 (in)',
    default: false,
    unit: 'in',
    stock: {
      kind: 'linear',
      material: 'Pine 6×6',
      color: '#d2b996',
      size: {
        crossSectionWidth: 5.5,
        crossSectionThickness: 5.5,
        lengths: [96, 120, 144, 192],
      },
    },
  },
];

/**
 * Convert a preset's authored dimensions to the canonical mm form used at
 * rest. Inch values are rounded to 0.01 mm after conversion so raw FP slop
 * (3.5″ → 88.89999999999999 mm) doesn't leak into the suggester gap math,
 * the nonnegative oversize schema, or the UI.
 */
const roundMm = (mm: number) => Math.round(mm * 100) / 100;

export function presetToMmStock(preset: StockPreset): StockMatrix {
  const scale = (n: number) =>
    roundMm(preset.unit === 'mm' ? n : convertUnits(n, 'in', 'mm'));
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
