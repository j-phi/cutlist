import { ref, type Ref } from 'vue';
import type { StockMatrix, SheetStockMatrix } from 'cutlist';
import { parseStockTable } from '~/utils/stockCsv';
import type { TableRowError } from '~/utils/delimitedTable';
import { FALLBACK_PALETTE } from '~/utils/materialColors';

export interface StockCsvImportResult {
  /** Number of input rows imported (one SheetStockMatrix per row). */
  imported: number;
  errors: TableRowError[];
}

export interface UseStockCsvImportOptions {
  activeId: Ref<string | null | undefined>;
  distanceUnit: Ref<'mm' | 'in'>;
  /** Current stock list — used for palette-color offset + count. */
  stocks: Ref<StockMatrix[]>;
  /** = useStockMutations().add — batch-appends the matrices as-is. */
  addStock: (matrices: StockMatrix[]) => void;
}

/**
 * Bulk OFFCUT import: parse pasted spreadsheet text or dropped `.csv` files
 * into SheetStockMatrix rows and batch-insert them as offcuts (finite leftover
 * sheets the user already owns). Mirrors `useBomCsvImport` (which produces
 * parts); this one produces offcut sheet stock — every imported entry is
 * stamped `role: 'offcut'` with a per-size `quantity`.
 *
 * Dependency-injected (no Nuxt auto-imports beyond `useToast`) so it is
 * unit-testable without the Nuxt environment.
 */
export function useStockCsvImport(opts: UseStockCsvImportOptions) {
  const { activeId, distanceUnit, stocks, addStock } = opts;
  const toast = useToast();

  const result = ref<StockCsvImportResult | null>(null);
  const isImporting = ref(false);

  async function importText(text: string) {
    if (!activeId.value) return;

    const { rows, errors } = parseStockTable(text, {
      defaultUnit: distanceUnit.value,
    });

    if (rows.length > 0) {
      const baseCount = stocks.value.length;
      const matrices: SheetStockMatrix[] = rows.map((row, i) => ({
        kind: 'sheet',
        // The imported label is the per-item name (Layout page); the user
        // assigns a material category later. Offcuts start uncategorized.
        name: row.name,
        material: 'Uncategorized',
        role: 'offcut',
        color: FALLBACK_PALETTE[(baseCount + i) % FALLBACK_PALETTE.length],
        sizes: [
          {
            width: row.widthMm,
            length: row.lengthMm,
            thickness: [row.thicknessMm],
            quantity: row.quantity,
          },
        ],
      }));
      addStock(matrices);
    }

    result.value = { imported: rows.length, errors };

    const skipped = errors.length;
    if (rows.length === 0) {
      toast.add({
        title: 'Import failed',
        description:
          skipped > 0
            ? `No offcuts imported. ${skipped} row${skipped === 1 ? '' : 's'} skipped.`
            : 'No offcuts found in the pasted data.',
        color: 'error',
      });
    } else {
      toast.add({
        title: 'Imported',
        description:
          skipped > 0
            ? `${rows.length} offcut row${rows.length === 1 ? '' : 's'} added, ${skipped} skipped.`
            : `${rows.length} offcut row${rows.length === 1 ? '' : 's'} added.`,
      });
    }
  }

  async function importFiles(files: File[]) {
    const csvFiles = files.filter((f) => f.name.toLowerCase().endsWith('.csv'));
    if (!csvFiles.length) return;
    isImporting.value = true;
    try {
      for (const file of csvFiles) {
        let text: string;
        try {
          text = await file.text();
        } catch (err) {
          toast.add({
            title: 'Import failed',
            description: `Could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
            color: 'error',
          });
          continue;
        }
        await importText(text);
      }
    } finally {
      isImporting.value = false;
    }
  }

  function clearResult() {
    result.value = null;
  }

  return { result, isImporting, importText, importFiles, clearResult };
}
