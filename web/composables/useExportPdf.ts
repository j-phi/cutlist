import * as Sentry from '@sentry/nuxt';
import { exportCutlistPdf, type PdfScale } from '~/utils/exportPdf';
import type { BomRow as PdfBomRow } from '~/utils/pdf/bom';
import { trackEvent } from '~/utils/analytics';

export default function () {
  const { data: layouts } = useBoardLayoutsQuery();
  const { activeProject } = useProjects();
  const { allRows } = useBomRows();
  const formatDistance = useFormatDistance();
  const { showPartNumbers, showBomName, bladeWidth } = useProjectSettings();
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
        bladeWidthUm: bladeWidth.value,
        measurements: measurements.value,
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

  return {
    download,
    isExporting,
    error,
    canExport,
  };
}
