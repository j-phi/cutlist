import * as Sentry from '@sentry/nuxt';
import type { MeasurementMode } from 'cutlist';
import { exportCutlistPdf, type PdfScale } from '~/utils/exportPdf';
import { exportLabelsPdf } from '~/utils/exportLabelsPdf';
import type { LabelPresetId } from '~/utils/pdf/labels';
import type { BomRow as PdfBomRow } from '~/utils/pdf/bom';
import { trackEvent } from '~/utils/analytics';

export default function () {
  const { data: layouts } = useBoardLayoutsQuery();
  const { activeProject } = useProjects();
  const { allRows } = useBomRows();
  const formatDistance = useFormatDistance();
  const { showPartNumbers, showBomName, bladeWidth, labelPlacement } =
    useProjectSettings();
  const { measurements } = useRulerStore();
  const { totalLengthUm: bandingLengthUm, cost: bandingCost } =
    useBandingSummary();

  const isExporting = ref(false);
  const error = ref<string | undefined>();

  const bomRows = computed<PdfBomRow[]>(() =>
    allRows.value.map((r) => ({
      partNumber: r.number,
      name: r.name,
      qty: r.qty,
      material: r.material,
      size: `${formatDistance(r.lengthUm) ?? ''} × ${formatDistance(r.widthUm) ?? ''} × ${formatDistance(r.thicknessUm) ?? ''}`,
    })),
  );

  async function download(
    scale: PdfScale,
    showDimensions = false,
    colorParts = false,
    measurementMode: MeasurementMode = 'edge',
    showOffcutDimensions = true,
  ) {
    if (!bomRows.value.length) return;
    isExporting.value = true;
    error.value = undefined;
    try {
      const name = activeProject.value?.name ?? 'Cutlist';
      const bytes = await exportCutlistPdf({
        documentName: name,
        generatedAt: new Date(),
        scale,
        bomRows: bomRows.value,
        layouts: layouts.value?.layouts ?? [],
        linearLayouts: layouts.value?.linearLayouts ?? [],
        leftovers: layouts.value?.leftovers ?? [],
        formatSize: formatDistance,
        showPartNumbers: !!showPartNumbers.value,
        showBomName: !!showBomName.value,
        showDimensions,
        colorParts,
        measurementMode,
        labelPlacement: labelPlacement.value ?? 'center',
        bladeWidthUm: bladeWidth.value,
        measurements: measurements.value,
        showOffcutDimensions,
        bandingLengthUm: bandingLengthUm.value,
        bandingCost: bandingCost.value,
      });
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const safeName = (name || 'cutlist')
        .replace(/[^a-z0-9-_]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}-cutlist.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      trackEvent('pdf-exported', { scale, rows: bomRows.value.length });
    } catch (err) {
      console.error('[exportPdf] PDF generation failed:', err);
      Sentry.captureException(err, { tags: { area: 'pdf-export' } });
      error.value = err instanceof Error ? err.message : 'Failed to export PDF';
    } finally {
      isExporting.value = false;
    }
  }

  const canExport = computed(() => bomRows.value.length > 0);

  /**
   * F1 / FR-LBL-6 — labels need a generated layout to assign each instance to a
   * board. Enabled only when at least one sheet or linear layout exists.
   */
  const hasLayouts = computed(
    () =>
      (layouts.value?.layouts.length ?? 0) > 0 ||
      (layouts.value?.linearLayouts.length ?? 0) > 0,
  );
  const canExportLabels = hasLayouts;
  const labelsDisabledReason = computed(() =>
    hasLayouts.value ? undefined : 'Generate a layout first',
  );

  const isExportingLabels = ref(false);

  /** F1 — download the separate part-label / cut-sticker PDF. */
  async function downloadLabels(preset: LabelPresetId = 'avery-5160') {
    if (!hasLayouts.value) return;
    isExportingLabels.value = true;
    error.value = undefined;
    try {
      const name = activeProject.value?.name ?? 'Cutlist';
      const bytes = await exportLabelsPdf({
        layouts: [
          ...(layouts.value?.layouts ?? []),
          ...(layouts.value?.linearLayouts ?? []),
        ],
        leftovers: layouts.value?.leftovers ?? [],
        formatSize: formatDistance,
        preset,
      });
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const safeName = (name || 'cutlist')
        .replace(/[^a-z0-9-_]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}-labels.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      trackEvent('labels-exported', { preset });
    } catch (err) {
      console.error('[exportLabelsPdf] label PDF generation failed:', err);
      Sentry.captureException(err, { tags: { area: 'pdf-export' } });
      error.value =
        err instanceof Error ? err.message : 'Failed to export labels';
    } finally {
      isExportingLabels.value = false;
    }
  }

  return {
    download,
    isExporting,
    error,
    canExport,
    downloadLabels,
    isExportingLabels,
    canExportLabels,
    labelsDisabledReason,
  };
}
