import {
  type Algorithm,
  type PartToCut,
  type Stock,
  type StockMatrix,
  Config,
  type ConfigInput,
  type BoardLayout,
  type BoardLayoutLeftover,
  type BoardLayoutPlacement,
  type PotentialBoardLayout,
  type SearchPass,
} from './types';

import { Rectangle } from './geometry';
import { isNearlyEqual } from './utils/floating-point-utils';
import { isValidStock } from './utils/stock-utils';
import { mmToM } from './utils/units';
import {
  compareLayoutScores,
  createCompactPacker,
  createTidyPacker,
  createTightPacker,
  scoreLayouts,
  type CompactFitMode,
  type LayoutScore,
  type PackOptions,
  type Packer,
  type TidyAxis,
} from './packers';

export * from './types';
export * from './utils/units';

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
  /** Set when `packerKind === 'tidy'` to pick the rip axis. */
  tidyAxis?: TidyAxis;
  /** Set when `packerKind === 'compact'` to pick the fit heuristic. */
  compactFitMode?: CompactFitMode;
  /** Optional seed for randomised sort variants. */
  randomSeed?: number;
}

interface SearchPassResult {
  layouts: PotentialBoardLayout[];
  leftovers: PartToCut[];
  score: LayoutScore;
}

const SEARCH_PASS_DEFINITIONS: Record<SearchPass, SearchPassDefinition> = {
  // Tidy passes — two-stage guillotine. Strips are columns of similar
  // widths; cleanest cut sequence on a table saw / track saw.
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
  // Compact passes — free-rect n-stage guillotine. Tighter yield, zigzag
  // cut sequence. BAF/BLSF were dropped after benchmark runs showed no
  // fixture where they beat BSSF.
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
  // CNC / tight passes — no cutting constraints
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
    (a, b) => b.width * b.length - a.width * a.length,
  );
  if (boards.length === 0) throw Error('You must include at least 1 stock.');

  const searchResult = runMultiPassSearch(normalizedConfig, parts, boards);

  const marginM = mmToM(normalizedConfig.margin);
  return {
    layouts: searchResult.layouts.map((l) =>
      serializeBoardLayoutRectangles(l, marginM),
    ),
    leftovers: searchResult.leftovers.map(serializePartToCut),
  };
}

/**
 * Expand a stock matrix into individual boards. Per-(material, thickness)
 * `algorithm` overrides (`thicknessAlgorithms[key]`) flow through to each
 * board's `Stock.algorithm`; the engine falls back to
 * `Config.defaultAlgorithm` when unset.
 *
 * Inputs are millimetres; outputs are meters (the engine's internal unit).
 */
export function reduceStockMatrix(matrix: StockMatrix[]): Stock[] {
  return matrix.flatMap((item) =>
    item.sizes.flatMap((size) =>
      size.thickness.map((thickness) => ({
        material: item.material,
        thickness: mmToM(thickness),
        width: mmToM(size.width),
        length: mmToM(size.length),
        color: item.color,
        algorithm: item.thicknessAlgorithms?.[String(thickness)],
      })),
    ),
  );
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
  // Tests / programmatic callers can pin an exact pass list. Otherwise
  // each group's `Algorithm` picks its tournament.
  const passOverride = config.searchPasses?.length ? config.searchPasses : null;

  // Per-group tournament — changing one group's constraints (e.g. grain
  // lock) can't bleed into unrelated groups' winning passes.
  const groups = groupPartsByStock(parts, stock, config.precision);
  const allLayouts: PotentialBoardLayout[] = [];
  const allLeftovers: PartToCut[] = [];

  for (const group of groups) {
    // First defined algorithm wins, regardless of area-sort position. Picking
    // `group.stock[0]` directly would let an undefined entry override a
    // defined one when two `StockMatrix` rows share material+thickness.
    const algorithm =
      group.stock.find((s) => s.algorithm != null)?.algorithm ??
      config.defaultAlgorithm;
    const passOrder = passOverride ?? getPassesForAlgorithm(algorithm);
    let best: SearchPassResult | undefined;

    const passLimit =
      config.maxSearchPasses != null
        ? Math.min(passOrder.length, config.maxSearchPasses)
        : passOrder.length;
    for (let i = 0; i < passLimit; i++) {
      const pass = SEARCH_PASS_DEFINITIONS[passOrder[i]];
      const candidate = runSearchPass(config, group.parts, group.stock, pass);

      if (
        best == null ||
        isBetterSearchResult(candidate, best, config.precision)
      ) {
        best = candidate;
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
    score: scoreLayouts(allLayouts, config.precision),
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

  const { layouts, leftovers } = placeAllParts(
    config,
    parts,
    stock,
    packer,
    algorithm,
    {
      partSortMode: pass.partSortMode,
      randomSeed: pass.randomSeed,
      packerOptions,
    },
  );
  const minimizedLayouts = layouts.map((layout) =>
    minimizeLayoutStock(config, layout, stock, packer, packerOptions),
  );

  return {
    layouts: minimizedLayouts,
    leftovers,
    score: scoreLayouts(minimizedLayouts, config.precision),
  };
}

function isBetterSearchResult(
  candidate: SearchPassResult,
  best: SearchPassResult,
  precision: number,
): boolean {
  if (candidate.leftovers.length !== best.leftovers.length) {
    return candidate.leftovers.length < best.leftovers.length;
  }

  return compareLayoutScores(candidate.score, best.score, precision) < 0;
}

type PlaceOptions = {
  partSortMode: PartSortMode;
  randomSeed?: number;
  packerOptions: PackOptions<PartToCut>;
};

function placeAllParts(
  config: Config,
  parts: PartToCut[],
  stock: Stock[],
  packer: Packer<PartToCut>,
  algorithm: Exclude<Algorithm, 'auto'>,
  options: PlaceOptions,
): { layouts: PotentialBoardLayout[]; leftovers: PartToCut[] } {
  // Multi-board lookback eliminates "sparse last board" — small parts that
  // were sorted to the end could have fit in earlier-opened gaps. Required
  // for every active packer; the hooks are optional on the `Packer`
  // interface so a future hookless packer can still type-check, but it
  // would error here at runtime rather than silently fall through.
  if (
    typeof packer.createBinState !== 'function' ||
    typeof packer.tryPlaceInBinState !== 'function'
  ) {
    throw Error(
      'Packer must expose createBinState/tryPlaceInBinState for lookback',
    );
  }
  return placeAllPartsWithLookback(
    config,
    parts,
    stock,
    packer,
    algorithm,
    options,
  );
}

interface OpenBoard {
  stock: Stock;
  binState: unknown;
  placements: Rectangle<PartToCut>[];
}

function placeAllPartsWithLookback(
  config: Config,
  parts: PartToCut[],
  stock: Stock[],
  packer: Packer<PartToCut>,
  algorithm: Exclude<Algorithm, 'auto'>,
  options: PlaceOptions,
): { layouts: PotentialBoardLayout[]; leftovers: PartToCut[] } {
  const margin = mmToM(config.margin);
  const { packerOptions } = options;
  const sortedParts = sortPartsForPlacement(
    parts,
    config.precision,
    options.partSortMode,
    options.randomSeed,
  );
  const leftovers: PartToCut[] = [];
  const openBoards: OpenBoard[] = [];

  // Hook presence is what dispatched here; non-null assertion is safe.
  const createBinState = packer.createBinState!;
  const tryPlaceInBinState = packer.tryPlaceInBinState!;

  for (const part of sortedParts) {
    const partRect = makePartRect(part);

    // Try every already-opened board first.
    let placed = false;
    for (const board of openBoards) {
      if (!isValidStock(board.stock, part, config.precision)) continue;
      const placement = tryPlaceInBinState(
        board.binState,
        partRect,
        packerOptions,
      );
      if (placement) {
        board.placements.push(placement);
        placed = true;
        break;
      }
    }
    if (placed) continue;

    const board = stock.find((s) => isValidStock(s, part, config.precision));
    if (!board) {
      leftovers.push(part);
      continue;
    }
    const binState = createBinState(makeBoardRect(board, margin));
    const placement = tryPlaceInBinState(binState, partRect, packerOptions);
    if (!placement) {
      // isValidStock claims it fits; if the packer rejects on a fresh
      // board the part is genuinely unplaceable.
      leftovers.push(part);
      continue;
    }
    openBoards.push({ stock: board, binState, placements: [placement] });
  }

  return {
    layouts: openBoards.map((b) => ({
      stock: b.stock,
      placements: b.placements,
      algorithm,
    })),
    leftovers,
  };
}

function makeBoardRect(board: Stock, margin: number): Rectangle<Stock> {
  return new Rectangle(
    board,
    margin,
    margin,
    board.width - 2 * margin,
    board.length - 2 * margin,
  );
}

function makePartRect(part: PartToCut): Rectangle<PartToCut> {
  // grainLock='width': pre-rotate so part.width is on Y-axis (with grain).
  if (part.grainLock === 'width') {
    return new Rectangle(part, 0, 0, part.size.length, part.size.width);
  }
  return new Rectangle(part, 0, 0, part.size.width, part.size.length);
}

function sortPartsForPlacement(
  parts: PartToCut[],
  precision: number,
  mode: PartSortMode,
  seed: number | undefined,
): PartToCut[] {
  return [...parts].sort((a, b) => {
    // Keep material/thickness grouped so those parts stay together on the same stock.
    const materialCompare = a.material.localeCompare(b.material);
    if (materialCompare !== 0) return materialCompare;

    const thicknessCompare = b.size.thickness - a.size.thickness;
    if (Math.abs(thicknessCompare) > precision) return thicknessCompare;

    const metricCompare =
      getSortMetric(b, mode, seed) - getSortMetric(a, mode, seed);
    if (Math.abs(metricCompare) > precision) return metricCompare;

    if (mode === 'area-random') {
      const randomizedCompare =
        getStableRandomValue(seed ?? 0, b) - getStableRandomValue(seed ?? 0, a);
      if (randomizedCompare !== 0) return randomizedCompare;
    }

    const areaCompare =
      b.size.width * b.size.length - a.size.width * a.size.length;
    if (Math.abs(areaCompare) > precision) return areaCompare;

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

/**
 * Given a layout, return a new layout on a smaller peice of stock, if
 * possible. If a smaller stock cannot be found, return the same layout.
 */
function minimizeLayoutStock(
  config: Config,
  originalLayout: PotentialBoardLayout,
  stock: Stock[],
  packer: Packer<PartToCut>,
  packerOptions: PackOptions<PartToCut>,
): PotentialBoardLayout {
  const margin = mmToM(config.margin);

  // Get alternative stock, smaller areas first.
  const altStock = stock
    .filter((stock) =>
      isValidStock(originalLayout.stock, stock, config.precision),
    )
    .toSorted((a, b) => a.width * a.length - b.width * b.length);

  for (const smallerStock of altStock) {
    const bin = makeBoardRect(smallerStock, margin);
    const res = packer.pack(bin, [...originalLayout.placements], packerOptions);

    if (res.leftovers.length === 0)
      return {
        stock: smallerStock,
        placements: res.placements,
        algorithm: originalLayout.algorithm,
      };
  }

  return originalLayout;
}

interface StockGroup {
  parts: PartToCut[];
  stock: Stock[];
}

/**
 * Group parts by the stock type they match (material + thickness), using the
 * same isValidStock logic that placeAllParts uses to assign parts to boards.
 */
function groupPartsByStock(
  parts: PartToCut[],
  stock: Stock[],
  precision: number,
): StockGroup[] {
  // Collect unique stock types (same material + ~equal thickness)
  const stockTypes: Stock[][] = [];
  for (const s of stock) {
    const match = stockTypes.find(
      (t) =>
        t[0].material === s.material &&
        isNearlyEqual(t[0].thickness, s.thickness, precision),
    );
    if (match) match.push(s);
    else stockTypes.push([s]);
  }

  // Assign each part to its matching stock type in a single pass
  const grouped = new Map<Stock[], PartToCut[]>();
  const unmatched: PartToCut[] = [];

  for (const part of parts) {
    const type = stockTypes.find((t) =>
      t.some((s) => isValidStock(s, part, precision)),
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

  // Unmatched parts still run so they surface as leftovers
  if (unmatched.length > 0) {
    result.push({ parts: unmatched, stock });
  }

  return result;
}

function getPackerOptions(config: Config): PackOptions<PartToCut> {
  return {
    allowRotations: true,
    gap: mmToM(config.bladeWidth),
    precision: config.precision,
    canRotateRect: (data: PartToCut) => !data.grainLock,
  };
}

function serializeBoardLayoutRectangles(
  layout: PotentialBoardLayout,
  marginM: number,
): BoardLayout {
  return {
    placements: layout.placements.map(serializePartToCutPlacement),
    stock: {
      material: layout.stock.material,
      thicknessM: layout.stock.thickness,
      widthM: layout.stock.width,
      lengthM: layout.stock.length,
      color: layout.stock.color,
    },
    marginM,
    algorithm: layout.algorithm,
  };
}

function serializePartToCutPlacement(
  placement: Rectangle<PartToCut>,
): BoardLayoutPlacement {
  return {
    instanceNumber: placement.data.instanceNumber,
    partNumber: placement.data.partNumber,
    name: placement.data.name,
    material: placement.data.material,
    grainLock: placement.data.grainLock,
    leftM: placement.left,
    rightM: placement.right,
    topM: placement.top,
    bottomM: placement.bottom,
    lengthM: placement.height,
    thicknessM: placement.data.size.thickness,
    widthM: placement.width,
  };
}

function serializePartToCut(part: PartToCut): BoardLayoutLeftover {
  return {
    instanceNumber: part.instanceNumber,
    partNumber: part.partNumber,
    name: part.name,
    material: part.material,
    grainLock: part.grainLock,
    lengthM: part.size.length,
    widthM: part.size.width,
    thicknessM: part.size.thickness,
  };
}
