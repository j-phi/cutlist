import {
  type Algorithm,
  type BoardLayout,
  type BoardLayoutLeftover,
  Config,
  type ConfigInput,
  effectiveOversize,
  type LinearBoardLayout,
  type LinearBoardLayoutPlacement,
  type LinearStock,
  type Oversize,
  type PartToCut,
  type PotentialBoardLayout,
  type PotentialLinearBoardLayout,
  type PotentialSheetBoardLayout,
  type SearchPass,
  type SheetBoardLayout,
  type SheetBoardLayoutPlacement,
  type SheetStock,
  type Stock,
  type StockMatrix,
  isLinearStock,
} from './types';

import { Rectangle } from './geometry';
import { areStocksEquivalent, canPartFitStock } from './utils/stock-utils';
import { type Micrometres, mmToUm, um } from './utils/units';
import {
  compareLayoutScores,
  createCompactPacker,
  createLinearPacker,
  createTidyPacker,
  createTightPacker,
  scoreLayouts,
  type CompactFitMode,
  type LayoutScore,
  type PackOptions,
  type Packer,
  type TidyAxis,
} from './packers';

const LINEAR_PART_SORT_MODE: PartSortMode = 'long-side-desc';

export * from './types';
export * from './utils/units';
export * from './utils/shoppingList';

type PackerKind = 'tidy' | 'compact' | 'tight';
type PartSortMode =
  | 'area-desc'
  | 'long-side-desc'
  | 'short-side-desc'
  | 'perimeter-desc'
  | 'area-random';

interface SearchPassDefinition {
  id: SearchPass;
  packerKind: PackerKind;
  partSortMode: PartSortMode;
  tidyAxis?: TidyAxis;
  compactFitMode?: CompactFitMode;
  randomSeed?: number;
}

interface SearchPassResult {
  layouts: PotentialBoardLayout[];
  leftovers: PartToCut[];
  score: LayoutScore;
}

const SEARCH_PASS_DEFINITIONS: Record<SearchPass, SearchPassDefinition> = {
  'tidy-rip-long-side': {
    id: 'tidy-rip-long-side',
    packerKind: 'tidy',
    partSortMode: 'long-side-desc',
    tidyAxis: 'rip-first',
  },
  'tidy-rip-area': {
    id: 'tidy-rip-area',
    packerKind: 'tidy',
    partSortMode: 'area-desc',
    tidyAxis: 'rip-first',
  },
  'tidy-crosscut-long-side': {
    id: 'tidy-crosscut-long-side',
    packerKind: 'tidy',
    partSortMode: 'long-side-desc',
    tidyAxis: 'crosscut-first',
  },
  'compact-bssf-area': {
    id: 'compact-bssf-area',
    packerKind: 'compact',
    partSortMode: 'area-desc',
    compactFitMode: 'bssf',
  },
  'compact-bssf-long-side': {
    id: 'compact-bssf-long-side',
    packerKind: 'compact',
    partSortMode: 'long-side-desc',
    compactFitMode: 'bssf',
  },
  'cnc-area': {
    id: 'cnc-area',
    packerKind: 'tight',
    partSortMode: 'area-desc',
  },
  'cnc-perimeter': {
    id: 'cnc-perimeter',
    packerKind: 'tight',
    partSortMode: 'perimeter-desc',
  },
  'cnc-random': {
    id: 'cnc-random',
    packerKind: 'tight',
    partSortMode: 'area-random',
    randomSeed: 17,
  },
};

const TIDY_SEARCH_PASSES: SearchPass[] = [
  'tidy-rip-long-side',
  'tidy-rip-area',
  'tidy-crosscut-long-side',
];

const COMPACT_SEARCH_PASSES: SearchPass[] = [
  'compact-bssf-long-side',
  'compact-bssf-area',
];

const CNC_SEARCH_PASSES: SearchPass[] = [
  'cnc-area',
  'cnc-perimeter',
  'cnc-random',
];

/** Auto runs all guillotine voices; the score picks per material. */
const AUTO_SEARCH_PASSES: SearchPass[] = [
  ...TIDY_SEARCH_PASSES,
  ...COMPACT_SEARCH_PASSES,
];

const PACKER_KIND_TO_ALGORITHM: Record<
  PackerKind,
  Exclude<Algorithm, 'auto'>
> = {
  tidy: 'tidy',
  compact: 'compact',
  tight: 'cnc',
};

/**
 * Pack `parts` onto `stock`. Parts are grouped by (material, thickness),
 * each group runs the tournament for its `Algorithm` (per-stock override
 * → per-material default → `config.defaultAlgorithm`), and the best layout
 * wins by board count → waste → waste concentration → cut complexity.
 */
export function generateBoardLayouts(
  parts: PartToCut[],
  stock: StockMatrix[],
  config: ConfigInput,
): {
  layouts: BoardLayout[];
  leftovers: BoardLayoutLeftover[];
} {
  const normalizedConfig = Config.parse(config);

  const boards = reduceStockMatrix(stock).toSorted(
    (a, b) => stockSortMetric(b) - stockSortMetric(a),
  );
  if (boards.length === 0) throw Error('You must include at least 1 stock.');

  const searchResult = runMultiPassSearch(normalizedConfig, parts, boards);

  const marginUm = normalizedConfig.margin as Micrometres;
  const kerfUm = normalizedConfig.bladeWidth as Micrometres;
  return {
    layouts: searchResult.layouts.map((l) =>
      serializeBoardLayoutRectangles(l, marginUm, kerfUm),
    ),
    leftovers: searchResult.leftovers.map(serializePartToCut),
  };
}

function stockSortMetric(stock: Stock): number {
  if (isLinearStock(stock)) return stock.length;
  return stock.width * stock.length;
}

/**
 * Expand a stock matrix into individual boards or sticks. Per-(material,
 * thickness) `algorithm` overrides (`thicknessAlgorithms[key]`) flow through
 * to each board's `Stock.algorithm`; the engine falls back to
 * `Config.defaultAlgorithm` when unset.
 *
 * Inputs are millimetres (YAML / user input); outputs are integer
 * micrometres (the engine's internal unit).
 */
export function reduceStockMatrix(matrix: StockMatrix[]): Stock[] {
  return matrix.flatMap<Stock>((item) => {
    const oversize: Oversize | undefined = item.oversize
      ? {
          length: mmToUm(item.oversize.length ?? 0),
          crossSection: mmToUm(item.oversize.crossSection ?? 0),
        }
      : undefined;
    if (item.kind === 'linear') {
      return item.size.lengths.map<LinearStock>((lenMm) => ({
        kind: 'linear',
        material: item.material,
        crossSectionWidth: mmToUm(item.size.crossSectionWidth),
        crossSectionThickness: mmToUm(item.size.crossSectionThickness),
        length: mmToUm(lenMm),
        color: item.color,
        oversize,
      }));
    }
    return item.sizes.flatMap<Stock>((size) =>
      size.thickness.map<SheetStock>((thickness) => ({
        kind: 'sheet',
        material: item.material,
        thickness: mmToUm(thickness),
        width: mmToUm(size.width),
        length: mmToUm(size.length),
        color: item.color,
        algorithm: item.thicknessAlgorithms?.[String(thickness)],
        oversize,
      })),
    );
  });
}

export const PACKERS: Record<
  PackerKind,
  (pass?: SearchPassDefinition) => Packer<PartToCut>
> = {
  tidy: (pass?: SearchPassDefinition) =>
    createTidyPacker<PartToCut>({
      axis: pass?.tidyAxis ?? 'rip-first',
    }),
  compact: (pass?: SearchPassDefinition) =>
    createCompactPacker<PartToCut>({
      fitMode: pass?.compactFitMode ?? 'bssf',
      splitMode: 'sas',
      rectMerge: true,
    }),
  tight: () => createTightPacker<PartToCut>(),
};

export function getPassesForAlgorithm(alg: Algorithm): SearchPass[] {
  if (alg === 'tidy') return TIDY_SEARCH_PASSES;
  if (alg === 'compact') return COMPACT_SEARCH_PASSES;
  if (alg === 'cnc') return CNC_SEARCH_PASSES;
  return AUTO_SEARCH_PASSES;
}

function runMultiPassSearch(
  config: Config,
  parts: PartToCut[],
  stock: Stock[],
): SearchPassResult {
  const passOverride = config.searchPasses?.length ? config.searchPasses : null;

  const groups = groupPartsByStock(parts, stock);
  const allLayouts: PotentialBoardLayout[] = [];
  const allLeftovers: PartToCut[] = [];

  for (const group of groups) {
    const isLinearGroup =
      group.stock.length > 0 && isLinearStock(group.stock[0]);

    let best: SearchPassResult | undefined;
    if (isLinearGroup) {
      best = runLinearPass(config, group.parts, group.stock);
    } else {
      const algorithm: Algorithm =
        group.stock.find(
          (s): s is SheetStock => !isLinearStock(s) && s.algorithm != null,
        )?.algorithm ?? config.defaultAlgorithm;
      const passOrder = passOverride ?? getPassesForAlgorithm(algorithm);

      const passLimit =
        config.maxSearchPasses != null
          ? Math.min(passOrder.length, config.maxSearchPasses)
          : passOrder.length;
      for (let i = 0; i < passLimit; i++) {
        const pass = SEARCH_PASS_DEFINITIONS[passOrder[i]];
        const candidate = runSearchPass(config, group.parts, group.stock, pass);

        if (best == null || isBetterSearchResult(candidate, best)) {
          best = candidate;
        }
      }
    }

    if (best != null) {
      allLayouts.push(...best.layouts);
      allLeftovers.push(...best.leftovers);
    }
  }

  return {
    layouts: allLayouts,
    leftovers: allLeftovers,
    score: scoreLayouts(allLayouts),
  };
}

function runSearchPass(
  config: Config,
  parts: PartToCut[],
  stock: Stock[],
  pass: SearchPassDefinition,
): SearchPassResult {
  const packer = PACKERS[pass.packerKind](pass);
  const packerOptions = getPackerOptions(config);
  const algorithm = PACKER_KIND_TO_ALGORITHM[pass.packerKind];

  const { layouts, leftovers } = placeAllParts(config, parts, stock, packer, {
    partSortMode: pass.partSortMode,
    randomSeed: pass.randomSeed,
    packerOptions,
  });
  const sheetLayouts: PotentialSheetBoardLayout[] = layouts.map((l) => ({
    kind: 'sheet',
    stock: l.stock as SheetStock,
    placements: l.placements,
    algorithm,
  }));
  const minimizedLayouts = sheetLayouts.map((layout) =>
    minimizeLayoutStock(config, layout, stock, packer, packerOptions),
  );

  return {
    layouts: minimizedLayouts,
    leftovers,
    score: scoreLayouts(minimizedLayouts),
  };
}

function runLinearPass(
  config: Config,
  parts: PartToCut[],
  stock: Stock[],
): SearchPassResult {
  const packer = createLinearPacker<PartToCut>();
  const packerOptions = getPackerOptions(config);

  const { layouts, leftovers } = placeAllParts(config, parts, stock, packer, {
    partSortMode: LINEAR_PART_SORT_MODE,
    packerOptions,
  });
  const linearLayouts: PotentialLinearBoardLayout[] = layouts.map((l) => ({
    kind: 'linear',
    stock: l.stock as LinearStock,
    placements: l.placements,
  }));
  const minimizedLayouts = linearLayouts.map((layout) =>
    minimizeLayoutStock(config, layout, stock, packer, packerOptions),
  );

  return {
    layouts: minimizedLayouts,
    leftovers,
    score: scoreLayouts(minimizedLayouts),
  };
}

function isBetterSearchResult(
  candidate: SearchPassResult,
  best: SearchPassResult,
): boolean {
  if (candidate.leftovers.length !== best.leftovers.length) {
    return candidate.leftovers.length < best.leftovers.length;
  }
  return compareLayoutScores(candidate.score, best.score) < 0;
}

type PlaceOptions = {
  partSortMode: PartSortMode;
  randomSeed?: number;
  packerOptions: PackOptions<PartToCut>;
};

type RawLayout = { stock: Stock; placements: Rectangle<PartToCut>[] };

interface OpenBoard {
  stock: Stock;
  binState: unknown;
  placements: Rectangle<PartToCut>[];
}

function placeAllParts(
  config: Config,
  parts: PartToCut[],
  stock: Stock[],
  packer: Packer<PartToCut>,
  options: PlaceOptions,
): { layouts: RawLayout[]; leftovers: PartToCut[] } {
  const margin = config.margin as Micrometres;
  const { packerOptions } = options;
  const sortedParts = sortPartsForPlacement(
    parts,
    options.partSortMode,
    options.randomSeed,
  );
  const leftovers: PartToCut[] = [];
  const openBoards: OpenBoard[] = [];

  for (const part of sortedParts) {
    let placed = false;
    for (const board of openBoards) {
      if (!canPartFitStock(board.stock, part)) continue;
      const placement = packer.tryPlaceInBinState(
        board.binState,
        makePartRect(part, board.stock),
        packerOptions,
      );
      if (placement) {
        board.placements.push(placement);
        placed = true;
        break;
      }
    }
    if (placed) continue;

    const board = stock.find((s) => canPartFitStock(s, part));
    if (!board) {
      leftovers.push(part);
      continue;
    }
    const binState = packer.createBinState(makeBoardRect(board, margin));
    const placement = packer.tryPlaceInBinState(
      binState,
      makePartRect(part, board),
      packerOptions,
    );
    if (!placement) {
      leftovers.push(part);
      continue;
    }
    openBoards.push({ stock: board, binState, placements: [placement] });
  }

  return {
    layouts: openBoards.map((b) => ({
      stock: b.stock,
      placements: b.placements,
    })),
    leftovers,
  };
}

function makeBoardRect(board: Stock, margin: Micrometres): Rectangle<Stock> {
  if (isLinearStock(board)) {
    return new Rectangle(
      board,
      um(0),
      um(0),
      board.crossSectionWidth,
      board.length,
    );
  }
  return new Rectangle(
    board,
    margin,
    margin,
    (board.width - 2 * margin) as Micrometres,
    (board.length - 2 * margin) as Micrometres,
  );
}

function makePartRect(part: PartToCut, stock: Stock): Rectangle<PartToCut> {
  const o = effectiveOversize(stock);
  if (isLinearStock(stock)) {
    return new Rectangle(
      part,
      um(0),
      um(0),
      stock.crossSectionWidth,
      (part.size.length + o.length) as Micrometres,
    );
  }
  const effW = (part.size.width + o.crossSection) as Micrometres;
  const effL = (part.size.length + o.length) as Micrometres;
  if (part.grainLock === 'width') {
    return new Rectangle(part, um(0), um(0), effL, effW);
  }
  return new Rectangle(part, um(0), um(0), effW, effL);
}

function sortPartsForPlacement(
  parts: PartToCut[],
  mode: PartSortMode,
  seed: number | undefined,
): PartToCut[] {
  return [...parts].sort((a, b) => {
    const materialCompare = a.material.localeCompare(b.material);
    if (materialCompare !== 0) return materialCompare;

    const thicknessCompare = b.size.thickness - a.size.thickness;
    if (thicknessCompare !== 0) return thicknessCompare;

    const metricCompare =
      getSortMetric(b, mode, seed) - getSortMetric(a, mode, seed);
    if (metricCompare !== 0) return metricCompare;

    if (mode === 'area-random') {
      const randomizedCompare =
        getStableRandomValue(seed ?? 0, b) - getStableRandomValue(seed ?? 0, a);
      if (randomizedCompare !== 0) return randomizedCompare;
    }

    const areaCompare =
      b.size.width * b.size.length - a.size.width * a.size.length;
    if (areaCompare !== 0) return areaCompare;

    return comparePartIdentity(a, b);
  });
}

function getSortMetric(
  part: PartToCut,
  mode: PartSortMode,
  _seed: number | undefined,
): number {
  const longSide = Math.max(part.size.width, part.size.length);
  const shortSide = Math.min(part.size.width, part.size.length);

  if (mode === 'long-side-desc') return longSide;
  if (mode === 'short-side-desc') return shortSide;
  if (mode === 'perimeter-desc')
    return (part.size.width + part.size.length) * 2;
  return part.size.width * part.size.length;
}

function comparePartIdentity(a: PartToCut, b: PartToCut): number {
  const partNumberCompare = a.partNumber - b.partNumber;
  if (partNumberCompare !== 0) return partNumberCompare;

  const instanceCompare = a.instanceNumber - b.instanceNumber;
  if (instanceCompare !== 0) return instanceCompare;

  const sourcePartCompare = (a.sourcePartId ?? '').localeCompare(
    b.sourcePartId ?? '',
  );
  if (sourcePartCompare !== 0) return sourcePartCompare;

  const sourceElementCompare = (a.sourceElementId ?? '').localeCompare(
    b.sourceElementId ?? '',
  );
  if (sourceElementCompare !== 0) return sourceElementCompare;

  return a.name.localeCompare(b.name);
}

function getStableRandomValue(seed: number, part: PartToCut): number {
  const key = [
    seed,
    part.material,
    part.partNumber,
    part.instanceNumber,
    part.name,
    part.sourcePartId ?? '',
    part.sourceElementId ?? '',
  ].join('|');

  let hash = 2166136261 ^ seed;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function minimizeLayoutStock<L extends PotentialBoardLayout>(
  config: Config,
  originalLayout: L,
  stock: Stock[],
  packer: Packer<PartToCut>,
  packerOptions: PackOptions<PartToCut>,
): L {
  const margin = config.margin as Micrometres;

  const altStock = stock
    .filter((s) => areStocksEquivalent(originalLayout.stock, s))
    .toSorted((a, b) => stockSortMetric(a) - stockSortMetric(b));

  for (const smallerStock of altStock) {
    const bin = makeBoardRect(smallerStock, margin);
    const res = packer.pack(bin, [...originalLayout.placements], packerOptions);

    if (res.leftovers.length === 0) {
      return {
        ...originalLayout,
        stock: smallerStock,
        placements: res.placements,
      } as L;
    }
  }

  return originalLayout;
}

interface StockGroup {
  parts: PartToCut[];
  stock: Stock[];
}

/**
 * Group parts by the stock type they match. Sheet groups key on
 * (material, thickness); linear groups key on (material, cross-section).
 * A part can match at most one group — material+kind exclusivity is the
 * design contract (a material is sheet-only or linear-only per project).
 */
function groupPartsByStock(parts: PartToCut[], stock: Stock[]): StockGroup[] {
  const stockTypes: Stock[][] = [];
  for (const s of stock) {
    const match = stockTypes.find((t) => areStocksEquivalent(t[0], s));
    if (match) match.push(s);
    else stockTypes.push([s]);
  }

  const grouped = new Map<Stock[], PartToCut[]>();
  const unmatched: PartToCut[] = [];

  for (const part of parts) {
    const type = stockTypes.find((t) =>
      t.some((s) => canPartFitStock(s, part)),
    );
    if (type) {
      let group = grouped.get(type);
      if (!group) {
        group = [];
        grouped.set(type, group);
      }
      group.push(part);
    } else {
      unmatched.push(part);
    }
  }

  const result: StockGroup[] = [...grouped.entries()].map(
    ([groupStock, groupParts]) => ({ parts: groupParts, stock: groupStock }),
  );

  if (unmatched.length > 0) {
    result.push({ parts: unmatched, stock });
  }

  return result;
}

function getPackerOptions(config: Config): PackOptions<PartToCut> {
  return {
    allowRotations: true,
    gap: config.bladeWidth as Micrometres,
    canRotateRect: (data: PartToCut) => !data.grainLock,
  };
}

function serializeBoardLayoutRectangles(
  layout: PotentialBoardLayout,
  marginUm: Micrometres,
  kerfUm: Micrometres,
): BoardLayout {
  if (layout.kind === 'linear') return serializeLinearLayout(layout, kerfUm);
  return serializeSheetLayout(layout, marginUm);
}

function serializeSheetLayout(
  layout: PotentialSheetBoardLayout,
  marginUm: Micrometres,
): SheetBoardLayout {
  const { stock } = layout;
  const oversize = effectiveOversize(stock);
  return {
    kind: 'sheet',
    placements: layout.placements.map((p) =>
      serializePartToCutPlacement(p, oversize),
    ),
    stock: {
      material: stock.material,
      thicknessUm: stock.thickness,
      widthUm: stock.width,
      lengthUm: stock.length,
      color: stock.color,
    },
    marginUm,
    algorithm: layout.algorithm,
  };
}

function serializeLinearLayout(
  layout: PotentialLinearBoardLayout,
  kerfUm: Micrometres,
): LinearBoardLayout {
  const { stock } = layout;
  const oversize = effectiveOversize(stock);
  const sorted = [...layout.placements].sort((a, b) => a.bottom - b.bottom);
  const placements: LinearBoardLayoutPlacement[] = sorted.map((p) => ({
    partNumber: p.data.partNumber,
    instanceNumber: p.data.instanceNumber,
    name: p.data.name,
    material: p.data.material,
    widthUm: p.data.size.width,
    thicknessUm: p.data.size.thickness,
    lengthUm: p.height,
    offsetUm: p.bottom,
    allowanceLengthUm: oversize.length,
  }));
  // The cut that frees the trailing offcut consumes one kerf; with no
  // placements no cut is needed and the whole stick is the offcut.
  const trailing =
    sorted.length === 0
      ? stock.length
      : ((stock.length -
          sorted[sorted.length - 1].top -
          kerfUm) as Micrometres);
  return {
    kind: 'linear',
    stock: {
      material: stock.material,
      crossSectionWidthUm: stock.crossSectionWidth,
      crossSectionThicknessUm: stock.crossSectionThickness,
      lengthUm: stock.length,
      color: stock.color,
    },
    placements,
    wasteEndUm: Math.max(0, trailing) as Micrometres,
  };
}

function serializePartToCutPlacement(
  placement: Rectangle<PartToCut>,
  oversize: Oversize,
): SheetBoardLayoutPlacement {
  // The packer may rotate sheet parts; pick the allowance axis that matches
  // the rect's width axis after rotation.
  const effW = placement.data.size.width + oversize.crossSection;
  const effL = placement.data.size.length + oversize.length;
  const rotated =
    Math.abs(placement.width - effW) > Math.abs(placement.width - effL);
  return {
    instanceNumber: placement.data.instanceNumber,
    partNumber: placement.data.partNumber,
    name: placement.data.name,
    material: placement.data.material,
    grainLock: placement.data.grainLock,
    leftUm: placement.left,
    rightUm: placement.right,
    topUm: placement.top,
    bottomUm: placement.bottom,
    widthUm: placement.data.size.width,
    lengthUm: placement.data.size.length,
    thicknessUm: placement.data.size.thickness,
    allowanceWidthUm: rotated ? oversize.length : oversize.crossSection,
    allowanceLengthUm: rotated ? oversize.crossSection : oversize.length,
  };
}

function serializePartToCut(part: PartToCut): BoardLayoutLeftover {
  return {
    instanceNumber: part.instanceNumber,
    partNumber: part.partNumber,
    name: part.name,
    material: part.material,
    grainLock: part.grainLock,
    lengthUm: part.size.length,
    widthUm: part.size.width,
    thicknessUm: part.size.thickness,
  };
}
