/**
 * Outcome-based tests for useStockCsvImport — the paste / .csv-drop composable
 * powering bulk STOCK imports on the Stock tab. Mirrors useBomCsvImport.test.ts:
 *
 *   - **Real parser**: no mock of `parseStockTable` — real TSV in, mapped
 *     SheetStockMatrix rows out.
 *   - **Plain-array recorder** for `addStock` (no `vi.fn()`), so assertions are
 *     over recorded inputs, not mock metadata.
 *   - **Real toast plumbing** mocked to push into a plain array.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import { MM_PER_IN, type StockMatrix } from 'cutlist';

import { FALLBACK_PALETTE } from '../../utils/materialColors';

const hoisted = vi.hoisted(() => ({
  toasts: [] as Array<{ title?: string; description?: string; color?: string }>,
}));

vi.mock('@nuxt/ui/composables/useToast', () => ({
  useToast: () => ({
    add: (t: { title?: string; description?: string; color?: string }) =>
      hoisted.toasts.push(t),
  }),
}));

import { useStockCsvImport } from '../useStockCsvImport';

// ─── Recorder ────────────────────────────────────────────────────────────────

function makeRecorder() {
  const calls: StockMatrix[][] = [];
  return {
    calls,
    addStock: (matrices: StockMatrix[]) => {
      calls.push(matrices);
    },
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_TSV = [
  'Name\tWidth\tHeight\tThickness',
  'Birch Ply\t1220mm\t2440mm\t18mm',
  'Pine\t140mm\t3000mm\t19mm',
].join('\n');

const MIXED_TSV = [
  'Name\tWidth\tHeight\tThickness',
  'Good Sheet\t1220mm\t2440mm\t18mm',
  '\t1220mm\t2440mm\t18mm', // missing name → skipped
  'Bad Width\tx\t2440mm\t18mm', // bad width → skipped
].join('\n');

// All-invalid: missing required column (no Thickness) → header error.
const BAD_HEADER_TSV = ['Name\tWidth\tHeight', 'A\t100mm\t200mm'].join('\n');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useStockCsvImport', () => {
  let scope: EffectScope;

  beforeEach(() => {
    hoisted.toasts.length = 0;
    scope = effectScope();
  });

  afterEach(() => {
    scope.stop();
  });

  function build(
    rec: ReturnType<typeof makeRecorder>,
    {
      id = 'p1' as string | null,
      unit = 'mm' as 'mm' | 'in',
      seed = [] as StockMatrix[],
    } = {},
  ) {
    const activeId = ref<string | null>(id);
    const distanceUnit = ref<'mm' | 'in'>(unit);
    const stocks = ref<StockMatrix[]>(seed);
    return {
      stocks,
      api: scope.run(() =>
        useStockCsvImport({
          activeId,
          distanceUnit,
          stocks,
          addStock: rec.addStock,
        }),
      )!,
    };
  }

  it('imports valid TSV rows into addStock as SheetStockMatrix entries', async () => {
    const rec = makeRecorder();
    const { api } = build(rec);

    await api.importText(VALID_TSV);

    expect(rec.calls).toHaveLength(1);
    const matrices = rec.calls[0]!;
    expect(matrices).toHaveLength(2);
    expect(matrices[0]).toMatchObject({
      kind: 'sheet',
      material: 'Birch Ply',
      sizes: [{ width: 1220, length: 2440, thickness: [18] }],
    });
    expect(matrices[1]).toMatchObject({
      kind: 'sheet',
      material: 'Pine',
      sizes: [{ width: 140, length: 3000, thickness: [19] }],
    });
    // Color comes from the palette.
    expect(matrices[0]!.color).toBe(FALLBACK_PALETTE[0]);
    expect(matrices[1]!.color).toBe(FALLBACK_PALETTE[1]);

    expect(api.result.value).toEqual({ imported: 2, errors: [] });
  });

  it('offsets palette colors by the existing stock count', async () => {
    const rec = makeRecorder();
    const seed: StockMatrix[] = [
      { kind: 'sheet', material: 'A', sizes: [] },
      { kind: 'sheet', material: 'B', sizes: [] },
    ];
    const { api } = build(rec, { seed });

    await api.importText(VALID_TSV);

    const matrices = rec.calls[0]!;
    expect(matrices[0]!.color).toBe(FALLBACK_PALETTE[2]);
    expect(matrices[1]!.color).toBe(FALLBACK_PALETTE[3]);
  });

  it('passes only valid rows and records skipped rows for mixed input', async () => {
    const rec = makeRecorder();
    const { api } = build(rec);

    await api.importText(MIXED_TSV);

    expect(rec.calls).toHaveLength(1);
    const matrices = rec.calls[0]!;
    expect(matrices).toHaveLength(1);
    expect(matrices[0]!.material).toBe('Good Sheet');

    expect(api.result.value!.imported).toBe(1);
    expect(api.result.value!.errors).toHaveLength(2);
  });

  it('does not call addStock when no valid rows parse', async () => {
    const rec = makeRecorder();
    const { api } = build(rec);

    await api.importText(BAD_HEADER_TSV);

    expect(rec.calls).toEqual([]);
    expect(api.result.value!.imported).toBe(0);
    expect(api.result.value!.errors.length).toBeGreaterThan(0);
    expect(hoisted.toasts.some((t) => t.color === 'error')).toBe(true);
  });

  it('is a no-op when there is no active project', async () => {
    const rec = makeRecorder();
    const { api } = build(rec, { id: null });

    await api.importText(VALID_TSV);

    expect(rec.calls).toEqual([]);
    expect(api.result.value).toBe(null);
    expect(hoisted.toasts).toEqual([]);
  });

  it('imports a .csv File and ignores non-.csv files', async () => {
    const rec = makeRecorder();
    const { api } = build(rec);

    const csv = new File([VALID_TSV], 'stock.csv');
    const txt = new File([VALID_TSV], 'notes.txt');
    await api.importFiles([txt, csv]);

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]!).toHaveLength(2);
    expect(api.isImporting.value).toBe(false);
  });

  it('surfaces an error toast when a .csv file cannot be read', async () => {
    const rec = makeRecorder();
    const { api } = build(rec);

    const broken = new File([], 'broken.csv');
    vi.spyOn(broken, 'text').mockRejectedValue(new Error('disk gone'));
    await api.importFiles([broken]);

    expect(rec.calls).toEqual([]);
    expect(api.isImporting.value).toBe(false);
    expect(
      hoisted.toasts.some(
        (t) => t.color === 'error' && /broken\.csv/.test(t.description ?? ''),
      ),
    ).toBe(true);
  });

  it('interprets bare-number dims in the injected distanceUnit', async () => {
    const rec = makeRecorder();
    const { api } = build(rec, { unit: 'in' });

    const tsv = ['Name\tWidth\tHeight\tThickness', 'Board\t48\t96\t0.75'].join(
      '\n',
    );
    await api.importText(tsv);

    const size = (rec.calls[0]![0] as { sizes: { width: number }[] }).sizes[0]!;
    // 48in → 1219.2 mm
    expect(size.width).toBeCloseTo(MM_PER_IN * 48, 3);
  });

  it('clearResult resets the summary', async () => {
    const rec = makeRecorder();
    const { api } = build(rec);

    await api.importText(VALID_TSV);
    expect(api.result.value).not.toBe(null);
    api.clearResult();
    expect(api.result.value).toBe(null);
  });
});
