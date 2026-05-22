/**
 * Outcome-based tests for useBomCsvImport — the paste / .csv-drop composable
 * powering bulk BOM (manual-part) imports on the BOM tab.
 *
 * Strategy
 * --------
 * The composable parses delimited text via the already-tested `parseBomTable`,
 * then fans the valid rows out to an injected `addManualParts` and records a
 * summary. We exercise it end-to-end with:
 *
 *   - **Real parser**: no mock of `parseBomTable` — we feed it real TSV/CSV and
 *     assert on the µm-converted rows that pop out.
 *   - **Plain-array recorder** for `addManualParts` (no `vi.fn()`), so
 *     assertions are over the recorded inputs, not mock metadata.
 *   - **Real toast plumbing** mocked the same way as useBomImport's test: a
 *     stand-in that pushes into a plain array, avoiding the Nuxt environment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import { mmToUm, MM_PER_IN } from 'cutlist';

import type { ManualPartInput } from '../useProjects';

const hoisted = vi.hoisted(() => ({
  toasts: [] as Array<{ title?: string; description?: string; color?: string }>,
}));

vi.mock('@nuxt/ui/composables/useToast', () => ({
  useToast: () => ({
    add: (t: { title?: string; description?: string; color?: string }) =>
      hoisted.toasts.push(t),
  }),
}));

import { useBomCsvImport } from '../useBomCsvImport';

// ─── Recorder ────────────────────────────────────────────────────────────────

interface AddCall {
  projectId: string;
  inputs: ManualPartInput[];
}

function makeRecorder() {
  const calls: AddCall[] = [];
  return {
    calls,
    addManualParts: async (projectId: string, inputs: ManualPartInput[]) => {
      calls.push({ projectId, inputs });
    },
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_TSV = [
  'Name\tQuantity\tLength\tWidth\tMaterial',
  'Side Panel\t2\t750mm\t300mm\tPlywood',
  'Shelf\t3\t600mm\t280mm\tPine',
].join('\n');

const MIXED_TSV = [
  'Name\tQuantity\tLength\tWidth\tMaterial',
  'Good Part\t1\t500mm\t200mm\tOak',
  '\t2\t500mm\t200mm\tOak', // missing name → skipped
  'Bad Qty\tx\t500mm\t200mm\tOak', // bad qty → skipped
].join('\n');

// All-invalid: missing required column (no Width) → 0 rows, header error.
const BAD_HEADER_TSV = [
  'Name\tQuantity\tLength\tMaterial',
  'A\t1\t500mm\tOak',
].join('\n');

const um = (mm: number) => mmToUm(mm);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useBomCsvImport', () => {
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
    id: string | null = 'p1',
  ) {
    const activeId = ref<string | null>(id);
    const distanceUnit = ref<'mm' | 'in'>('mm');
    return {
      distanceUnit,
      api: scope.run(() =>
        useBomCsvImport({
          activeId,
          distanceUnit,
          addManualParts: rec.addManualParts,
        }),
      )!,
    };
  }

  it('imports valid TSV rows into addManualParts with µm dims', async () => {
    const rec = makeRecorder();
    const { api } = build(rec);

    await api.importText(VALID_TSV);

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]!.projectId).toBe('p1');
    const inputs = rec.calls[0]!.inputs;
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({
      name: 'Side Panel',
      qty: 2,
      material: 'Plywood',
      lengthUm: um(750),
      widthUm: um(300),
    });
    expect(inputs[1]).toMatchObject({
      name: 'Shelf',
      qty: 3,
      material: 'Pine',
      lengthUm: um(600),
      widthUm: um(280),
    });

    expect(api.result.value).toEqual({ imported: 2, errors: [] });
  });

  it('passes only valid rows and records skipped rows for mixed input', async () => {
    const rec = makeRecorder();
    const { api } = build(rec);

    await api.importText(MIXED_TSV);

    expect(rec.calls).toHaveLength(1);
    const inputs = rec.calls[0]!.inputs;
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.name).toBe('Good Part');

    expect(api.result.value!.imported).toBe(1);
    expect(api.result.value!.errors).toHaveLength(2);
    // Skipped rows surface their reasons for inline display.
    const messages = api.result.value!.errors.map((e) => e.message);
    expect(messages.some((m) => /name/i.test(m))).toBe(true);
    expect(messages.some((m) => /qty/i.test(m))).toBe(true);
  });

  it('does not call addManualParts when no valid rows parse', async () => {
    const rec = makeRecorder();
    const { api } = build(rec);

    await api.importText(BAD_HEADER_TSV);

    expect(rec.calls).toEqual([]);
    expect(api.result.value!.imported).toBe(0);
    expect(api.result.value!.errors.length).toBeGreaterThan(0);
    // 0 rows + errors → an error-colored toast.
    expect(hoisted.toasts.some((t) => t.color === 'error')).toBe(true);
  });

  it('is a no-op when there is no active project', async () => {
    const rec = makeRecorder();
    const { api } = build(rec, null);

    await api.importText(VALID_TSV);

    expect(rec.calls).toEqual([]);
    expect(api.result.value).toBe(null);
    expect(hoisted.toasts).toEqual([]);
  });

  it('imports a .csv File and ignores non-.csv files', async () => {
    const rec = makeRecorder();
    const { api } = build(rec);

    const csv = new File([VALID_TSV], 'parts.csv');
    const txt = new File([VALID_TSV], 'notes.txt');
    await api.importFiles([txt, csv]);

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]!.inputs).toHaveLength(2);
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
    const activeId = ref<string | null>('p1');
    const distanceUnit = ref<'mm' | 'in'>('in');
    const api = scope.run(() =>
      useBomCsvImport({
        activeId,
        distanceUnit,
        addManualParts: rec.addManualParts,
      }),
    )!;

    const tsv = [
      'Name\tQuantity\tLength\tWidth\tMaterial',
      'Board\t1\t12\t6\tOak',
    ].join('\n');
    await api.importText(tsv);

    const input = rec.calls[0]!.inputs[0]!;
    // 12in → 12 * 25.4 mm → µm
    expect(input.lengthUm).toBe(mmToUm(MM_PER_IN * 12));
    expect(input.widthUm).toBe(mmToUm(MM_PER_IN * 6));
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
