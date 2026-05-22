import { ref, type Ref } from 'vue';
import { mmToUm, MM_PER_IN } from 'cutlist';
import { parseBomTable, type BomRowError } from '~/utils/bomCsv';
import type { ManualPartInput } from '~/composables/useProjects';

/** Default part thickness when a sheet omits the column: 3/4" = 19050 µm. */
const DEFAULT_THICKNESS_UM = mmToUm(MM_PER_IN * 0.75);

export interface BomCsvImportResult {
  /** Number of input rows imported (NOT qty-expanded). */
  imported: number;
  errors: BomRowError[];
}

export interface UseBomCsvImportOptions {
  activeId: Ref<string | null | undefined>;
  distanceUnit: Ref<'mm' | 'in'>;
  addManualParts: (
    projectId: string,
    inputs: ManualPartInput[],
  ) => Promise<void>;
}

/**
 * Bulk BOM import for manual parts: parse pasted spreadsheet text or dropped
 * `.csv` files into ManualPartInput rows and batch-create them. Separate from
 * `useBomImport`, which parses 3D model files.
 *
 * Dependency-injected (no Nuxt auto-imports beyond `useToast`) so it is
 * unit-testable without the Nuxt environment.
 */
export function useBomCsvImport(opts: UseBomCsvImportOptions) {
  const { activeId, distanceUnit, addManualParts } = opts;
  const toast = useToast();

  const result = ref<BomCsvImportResult | null>(null);
  const isImporting = ref(false);

  async function importText(text: string) {
    const projectId = activeId.value;
    if (!projectId) return;

    const { rows, errors } = parseBomTable(text, {
      defaultUnit: distanceUnit.value,
      defaultThicknessUm: DEFAULT_THICKNESS_UM,
    });

    if (rows.length > 0) {
      await addManualParts(projectId, rows);
    }

    result.value = { imported: rows.length, errors };

    const skipped = errors.length;
    if (rows.length === 0) {
      toast.add({
        title: 'Import failed',
        description:
          skipped > 0
            ? `No parts imported. ${skipped} row${skipped === 1 ? '' : 's'} skipped.`
            : 'No parts found in the pasted data.',
        color: 'error',
      });
    } else {
      toast.add({
        title: 'Imported',
        description:
          skipped > 0
            ? `${rows.length} part row${rows.length === 1 ? '' : 's'} added, ${skipped} skipped.`
            : `${rows.length} part row${rows.length === 1 ? '' : 's'} added.`,
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
