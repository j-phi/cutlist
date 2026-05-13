import type { BoardLayout, Micrometres } from 'cutlist';

export interface SnapEdge {
  axis: 'x' | 'y';
  positionUm: Micrometres;
  boardIndex: number;
}

export interface RulerMeasurement {
  id: string;
  boardIndex: number;
  axis: 'x' | 'y';
  anchorAUm: Micrometres;
  anchorBUm: Micrometres;
  offsetUm: Micrometres;
}

interface PendingMeasurement {
  edge: SnapEdge;
  boardIndex: number;
}

export default createGlobalState(() => {
  const isRulerActive = ref(false);
  const measurements = ref<RulerMeasurement[]>([]);
  const pendingClick = ref<PendingMeasurement | null>(null);

  function toggleRuler() {
    isRulerActive.value = !isRulerActive.value;
    if (!isRulerActive.value) pendingClick.value = null;
  }

  function startMeasurement(edge: SnapEdge) {
    pendingClick.value = { edge, boardIndex: edge.boardIndex };
  }

  function completeMeasurement(
    secondEdge: SnapEdge,
    defaultOffsetUm: Micrometres,
  ) {
    if (!pendingClick.value) return;
    const first = pendingClick.value.edge;

    if (
      first.boardIndex !== secondEdge.boardIndex ||
      first.axis !== secondEdge.axis ||
      first.positionUm === secondEdge.positionUm
    ) {
      pendingClick.value = null;
      return;
    }

    measurements.value.push({
      id: crypto.randomUUID(),
      boardIndex: first.boardIndex,
      axis: first.axis,
      anchorAUm: first.positionUm,
      anchorBUm: secondEdge.positionUm,
      offsetUm: defaultOffsetUm,
    });
    pendingClick.value = null;
  }

  function removeMeasurement(id: string) {
    measurements.value = measurements.value.filter((m) => m.id !== id);
  }

  function updateMeasurementOffset(id: string, newOffsetUm: Micrometres) {
    const m = measurements.value.find((m) => m.id === id);
    if (m) m.offsetUm = newOffsetUm;
  }

  function getMeasurementsForBoard(boardIndex: number) {
    return computed(() =>
      measurements.value.filter((m) => m.boardIndex === boardIndex),
    );
  }

  useEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !isRulerActive.value) return;
    if (pendingClick.value) pendingClick.value = null;
    else isRulerActive.value = false;
  });

  return {
    isRulerActive,
    measurements,
    pendingClick,
    toggleRuler,
    startMeasurement,
    completeMeasurement,
    removeMeasurement,
    updateMeasurementOffset,
    getMeasurementsForBoard,
  };
});
