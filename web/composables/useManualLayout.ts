import type {
  Micrometres,
  SheetBoardLayout,
  SheetBoardLayoutPlacement,
} from 'cutlist';

interface PartOverride {
  partNumber: number;
  instanceNumber: number;
  boardIndex: number;
  leftUm: Micrometres;
  bottomUm: Micrometres;
}

// Module-level singleton — shared across all callers
const manualMode = ref(false);
const isDragging = ref(false);
const snapping = ref(true);
const overrides = ref<PartOverride[]>([]);
const undoStack = ref<PartOverride[][]>([]);
const redoStack = ref<PartOverride[][]>([]);

// Disable text selection while dragging
watch(isDragging, (dragging: boolean) => {
  document.body.style.userSelect = dragging ? 'none' : '';
});

const canUndo = computed(() => undoStack.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);

export function useManualLayout() {
  const SNAP_UM = 1000; // 1 mm

  function resetOverrides() {
    overrides.value = [];
    undoStack.value = [];
    redoStack.value = [];
  }

  function movePart(
    partNumber: number,
    instanceNumber: number,
    boardIndex: number,
    leftUm: number,
    bottomUm: number,
  ) {
    const snappedLeft = snapping.value
      ? Math.round(leftUm / SNAP_UM) * SNAP_UM
      : leftUm;
    const snappedBottom = snapping.value
      ? Math.round(bottomUm / SNAP_UM) * SNAP_UM
      : bottomUm;

    // Save current state for undo; clear redo branch
    undoStack.value = [...undoStack.value, [...overrides.value]];
    redoStack.value = [];

    overrides.value = overrides.value.filter(
      (o: PartOverride) =>
        !(o.partNumber === partNumber && o.instanceNumber === instanceNumber),
    );
    overrides.value.push({
      partNumber,
      instanceNumber,
      boardIndex,
      leftUm: snappedLeft as Micrometres,
      bottomUm: snappedBottom as Micrometres,
    });
  }

  function undo() {
    if (undoStack.value.length === 0) return;
    const prev = undoStack.value[undoStack.value.length - 1];
    redoStack.value = [...redoStack.value, [...overrides.value]];
    undoStack.value = undoStack.value.slice(0, -1);
    overrides.value = prev;
  }

  function redo() {
    if (redoStack.value.length === 0) return;
    const next = redoStack.value[redoStack.value.length - 1];
    undoStack.value = [...undoStack.value, [...overrides.value]];
    redoStack.value = redoStack.value.slice(0, -1);
    overrides.value = next;
  }

  function applyOverrides(layouts: SheetBoardLayout[]): SheetBoardLayout[] {
    if (overrides.value.length === 0) return layouts;

    // Build an index from (partNumber, instanceNumber) → original board + placement
    const index = new Map<
      string,
      { placement: SheetBoardLayoutPlacement; boardIndex: number }
    >();
    for (let bi = 0; bi < layouts.length; bi++) {
      for (const p of layouts[bi].placements) {
        index.set(`${p.partNumber}-${p.instanceNumber}`, {
          placement: p,
          boardIndex: bi,
        });
      }
    }

    // Build mutable shallow copies
    const result: SheetBoardLayout[] = layouts.map((l) => ({
      ...l,
      placements: [...l.placements],
    }));

    for (const ov of overrides.value) {
      const key = `${ov.partNumber}-${ov.instanceNumber}`;
      const entry = index.get(key);
      if (!entry) continue;

      // Remove from the original board
      const src = result[entry.boardIndex];
      if (src) {
        src.placements = src.placements.filter(
          (p) =>
            !(
              p.partNumber === ov.partNumber &&
              p.instanceNumber === ov.instanceNumber
            ),
        );
      }

      // Add to the target board at the new position, clamped to board bounds
      const target = result[ov.boardIndex];
      if (!target) continue;
      const orig = entry.placement;
      const w = (orig.rightUm - orig.leftUm) as Micrometres;
      const h = (orig.topUm - orig.bottomUm) as Micrometres;
      const maxLeft = Math.max(0, target.stock.widthUm - w);
      const maxBottom = Math.max(0, target.stock.lengthUm - h);
      const left = Math.max(0, Math.min(ov.leftUm, maxLeft)) as Micrometres;
      const bottom = Math.max(
        0,
        Math.min(ov.bottomUm, maxBottom),
      ) as Micrometres;

      target.placements.push({
        ...orig,
        leftUm: left,
        rightUm: (left + w) as Micrometres,
        bottomUm: bottom,
        topUm: (bottom + h) as Micrometres,
      });
    }

    return result;
  }

  return {
    manualMode,
    isDragging,
    snapping,
    overrides,
    canUndo,
    canRedo,
    movePart,
    undo,
    redo,
    resetOverrides,
    applyOverrides,
  };
}
