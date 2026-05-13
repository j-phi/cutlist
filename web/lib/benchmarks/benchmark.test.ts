/**
 * Layout-engine benchmark. Runs the optimizer over realistic fixtures and
 * logs metrics (board count, waste %, sparsest-board utilization, runtime)
 * for each. Not a regression test — purely an observability harness so we
 * can compare before/after on the same machine when iterating on the
 * packing engine.
 *
 * Run from repo root with:  bun run bench
 */
import { describe, it } from 'vitest';
import {
  generateBoardLayouts,
  isLinearBoardLayout,
  mmToUm,
  type BoardLayout,
  type ConfigInput,
  type PartToCut,
  type SheetBoardLayout,
  type StockMatrix,
} from '..';

const onlySheet = (layouts: BoardLayout[]): SheetBoardLayout[] =>
  layouts.filter((l): l is SheetBoardLayout => !isLinearBoardLayout(l));

interface Fixture {
  name: string;
  parts: PartToCut[];
  stock: StockMatrix[];
  config?: Partial<ConfigInput>;
}

// ─── Fixture builders ───────────────────────────────────────────────────────

let nextPartNumber = 1;
function part(
  material: string,
  widthMm: number,
  lengthMm: number,
  thicknessMm: number,
  grainLock?: 'length' | 'width',
): PartToCut {
  return {
    partNumber: nextPartNumber++,
    instanceNumber: 1,
    name: `Part ${nextPartNumber}`,
    material,
    grainLock,
    size: {
      thickness: mmToUm(thicknessMm),
      width: mmToUm(widthMm),
      length: mmToUm(lengthMm),
    },
  };
}

function repeat<T>(n: number, fn: (i: number) => T): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(fn(i));
  return out;
}

const PLY_18MM_FULL: StockMatrix = {
  kind: 'sheet',
  material: 'Plywood',
  sizes: [{ width: 1220, length: 2440, thickness: [18] }],
};

const PLY_18MM_MULTI: StockMatrix = {
  kind: 'sheet',
  material: 'Plywood',
  sizes: [
    { width: 1220, length: 2440, thickness: [18] },
    { width: 600, length: 2400, thickness: [18] },
    { width: 600, length: 1200, thickness: [18] },
  ],
};

const FIXTURES: Fixture[] = [
  // Mirrors the screenshot: a mix of long narrow strips, a few large panels,
  // and 4–5 small parts that should consolidate onto earlier-board gaps.
  {
    name: 'cabinet-mixed',
    parts: [
      // Tall vertical sides + shelves (grain locked)
      ...repeat(2, () => part('Plywood', 580, 2100, 18, 'length')),
      ...repeat(2, () => part('Plywood', 580, 1800, 18, 'length')),
      ...repeat(4, () => part('Plywood', 560, 600, 18)),
      ...repeat(6, () => part('Plywood', 100, 600, 18)),
      // A few large panels — mid-board
      ...repeat(2, () => part('Plywood', 1200, 1200, 18)),
      ...repeat(2, () => part('Plywood', 600, 1200, 18)),
      // Long thin rails
      ...repeat(8, () => part('Plywood', 80, 1800, 18, 'length')),
      ...repeat(6, () => part('Plywood', 80, 1200, 18, 'length')),
      // Small parts likely to strand on the last board
      ...repeat(5, () => part('Plywood', 200, 250, 18)),
      ...repeat(3, () => part('Plywood', 150, 200, 18)),
    ],
    stock: [PLY_18MM_FULL],
  },
  // Wardrobe-scale: long sides, many shelves, drawer fronts.
  {
    name: 'wardrobe',
    parts: [
      ...repeat(2, () => part('Plywood', 600, 2200, 18, 'length')),
      ...repeat(2, () => part('Plywood', 600, 2000, 18, 'length')),
      ...repeat(8, () => part('Plywood', 600, 580, 18)),
      ...repeat(4, () => part('Plywood', 1180, 580, 18)),
      ...repeat(6, () => part('Plywood', 200, 600, 18)),
      ...repeat(8, () => part('Plywood', 100, 580, 18)),
      ...repeat(12, () => part('Plywood', 80, 2000, 18, 'length')),
      ...repeat(6, () => part('Plywood', 380, 480, 18)),
    ],
    stock: [PLY_18MM_FULL],
  },
  // Many small parts of similar size — strip packers should dominate.
  {
    name: 'shelves-bulk',
    parts: [
      ...repeat(40, () => part('Plywood', 250, 800, 18)),
      ...repeat(20, () => part('Plywood', 250, 400, 18)),
    ],
    stock: [PLY_18MM_FULL],
  },
  // Heavy mix with an irregular long-tail of small parts. Designed to
  // produce a sparse last board under the current algorithm.
  {
    name: 'sparse-tail',
    parts: [
      ...repeat(4, () => part('Plywood', 1180, 600, 18)),
      ...repeat(4, () => part('Plywood', 580, 1200, 18)),
      ...repeat(2, () => part('Plywood', 1180, 1200, 18)),
      ...repeat(8, () => part('Plywood', 280, 580, 18)),
      ...repeat(6, () => part('Plywood', 180, 380, 18)),
      // The "tail" — parts often left for a sparse last board
      part('Plywood', 120, 240, 18),
      part('Plywood', 100, 200, 18),
      part('Plywood', 80, 180, 18),
      part('Plywood', 150, 150, 18),
    ],
    stock: [PLY_18MM_MULTI],
  },
  // CNC-style: irregular parts where "free" packing wins.
  {
    name: 'cnc-irregular',
    parts: [
      ...repeat(6, () => part('Plywood', 320, 470, 18)),
      ...repeat(6, () => part('Plywood', 180, 290, 18)),
      ...repeat(4, () => part('Plywood', 540, 670, 18)),
      ...repeat(8, () => part('Plywood', 90, 180, 18)),
    ],
    stock: [PLY_18MM_FULL],
    config: { defaultAlgorithm: 'cnc' },
  },
];

// ─── Metrics ────────────────────────────────────────────────────────────────

interface Metrics {
  boardCount: number;
  totalAreaM2: number;
  usedAreaM2: number;
  wasteRatio: number;
  worstBoardUtilization: number;
  meanBoardUtilization: number;
  leftovers: number;
  runtimeMs: number;
}

function measure(
  layouts: SheetBoardLayout[],
  runtimeMs: number,
  leftovers: number,
): Metrics {
  if (layouts.length === 0) {
    return {
      boardCount: 0,
      totalAreaM2: 0,
      usedAreaM2: 0,
      wasteRatio: 0,
      worstBoardUtilization: 0,
      meanBoardUtilization: 0,
      leftovers,
      runtimeMs,
    };
  }
  let totalArea = 0;
  let usedArea = 0;
  let worst = Infinity;
  const utilizations: number[] = [];
  for (const layout of layouts) {
    const board = layout.stock.widthUm * layout.stock.lengthUm;
    let used = 0;
    for (const p of layout.placements) used += p.widthUm * p.lengthUm;
    totalArea += board;
    usedArea += used;
    const u = board === 0 ? 0 : used / board;
    if (u < worst) worst = u;
    utilizations.push(u);
  }
  return {
    boardCount: layouts.length,
    totalAreaM2: totalArea,
    usedAreaM2: usedArea,
    wasteRatio: totalArea === 0 ? 0 : 1 - usedArea / totalArea,
    worstBoardUtilization: worst === Infinity ? 0 : worst,
    meanBoardUtilization:
      utilizations.reduce((s, u) => s + u, 0) / utilizations.length,
    leftovers,
    runtimeMs,
  };
}

function fmt(m: Metrics): string {
  return [
    `boards=${m.boardCount}`,
    `waste=${(m.wasteRatio * 100).toFixed(1)}%`,
    `worstFill=${(m.worstBoardUtilization * 100).toFixed(1)}%`,
    `meanFill=${(m.meanBoardUtilization * 100).toFixed(1)}%`,
    `leftover=${m.leftovers}`,
    `time=${m.runtimeMs.toFixed(0)}ms`,
  ].join('  ');
}

function runOnce(fixture: Fixture): Metrics {
  const config: ConfigInput = {
    bladeWidth: mmToUm(3.175),
    margin: 0,
    defaultAlgorithm: 'auto',
    ...fixture.config,
  };
  const t0 = performance.now();
  const result = generateBoardLayouts(fixture.parts, fixture.stock, config);
  const dt = performance.now() - t0;
  return measure(onlySheet(result.layouts), dt, result.leftovers.length);
}

/** Run a fixture under a forced pass set so we can isolate per-packer behaviour. */
function runWithPasses(
  fixture: Fixture,
  passes: ConfigInput['searchPasses'],
): Metrics {
  const config: ConfigInput = {
    bladeWidth: mmToUm(3.175),
    margin: 0,
    defaultAlgorithm: 'auto',
    ...fixture.config,
    searchPasses: passes,
  };
  const t0 = performance.now();
  const result = generateBoardLayouts(fixture.parts, fixture.stock, config);
  const dt = performance.now() - t0;
  return measure(onlySheet(result.layouts), dt, result.leftovers.length);
}

const VARIANTS: Array<{
  label: string;
  run: (f: Fixture) => Metrics;
}> = [
  { label: 'default   ', run: runOnce },
  {
    label: 'tidy-only ',
    run: (f) =>
      runWithPasses(f, [
        'tidy-rip-long-side',
        'tidy-rip-area',
        'tidy-crosscut-long-side',
      ]),
  },
  {
    label: 'compact   ',
    run: (f) =>
      runWithPasses(f, ['compact-bssf-long-side', 'compact-bssf-area']),
  },
  {
    label: 'tight     ',
    run: (f) => runWithPasses(f, ['cnc-area', 'cnc-perimeter', 'cnc-random']),
  },
];

describe('layout engine benchmark', () => {
  it('logs per-fixture metrics', () => {
    const lines: string[] = [];
    lines.push('');
    lines.push('  ─── Layout engine benchmark ──────────────────────────────');
    for (const fixture of FIXTURES) {
      lines.push(`  ${fixture.name}`);
      for (const variant of VARIANTS) {
        // Warm + median of 3 to dampen jitter.
        variant.run(fixture);
        const samples = [
          variant.run(fixture),
          variant.run(fixture),
          variant.run(fixture),
        ];
        samples.sort((a, b) => a.runtimeMs - b.runtimeMs);
        lines.push(`    ${variant.label}  ${fmt(samples[1])}`);
      }
    }
    lines.push('  ──────────────────────────────────────────────────────────');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  });
});
