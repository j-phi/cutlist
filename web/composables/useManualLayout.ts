import { computed, effectScope, watch } from 'vue';
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

// Undo/redo history stacks. Each entry is a full snapshot of overrides.
const past = ref<PartOverride[][]>([]);
const future = ref<PartOverride[][]>([]);

// overrides is derived from the tip of the past stack
const overrides = computed(() => past.value.at(-1) ?? []);

const canUndo = computed(() => past.value.length > 0);
const canRedo = computed(() => future.value.length > 0);

// Install the isDragging → userSelect watch once at module level
let watchInstalled = false;
function ensureUserSelectWatch() {
  if (watchInstalled) return;
  watchInstalled = true;
  effectScope(true).run(() => {
    watch(isDragging, (val) => {
      document.body.style.userSelect = val ? 'none' : '';
    });
  });
}

// Module-level undo/redo so the keyboard listener can call them
function undo() {
  if (past.value.length === 0) return;
  const tip = past.value[past.value.length - 1];
  past.value = past.value.slice(0, -1);
  future.value = [tip, ...future.value];
}

function redo() {
  if (future.value.length === 0) return;
  const [head, ...rest] = future.value;
  future.value = rest;
  past.value = [...past.value, head];
}

// Install CMD/Ctrl+Z keyboard shortcut once at module level
let listenerInstalled = false;
function ensureKeyListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  document.addEventListener('keydown', (e) => {
    if (!manualMode.value) return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      return;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      undo();
    }
    if (
      (e.metaKey || e.ctrlKey) &&
      ((e.shiftKey && e.key === 'z') || e.key === 'y')
    ) {
      e.preventDefault();
      redo();
    }
  });
}

export function useManualLayout() {
  ensureUserSelectWatch();
  ensureKeyListener();

  function resetOverrides() {
    past.value = [];
    future.value = [];
  }

  function movePart(
    partNumber: number,
    instanceNumber: number,
    boardIndex: number,
    leftUm: number,
    bottomUm: number,
  ) {
    // Snapshot the current state, remove any existing override for this part,
    // then push the new one as a new history entry.
    const current = overrides.value.filter(
      (o) =>
        !(o.partNumber === partNumber && o.instanceNumber === instanceNumber),
    );
    const next: PartOverride[] = [
      ...current,
      {
        partNumber,
        instanceNumber,
        boardIndex,
        leftUm: leftUm as Micrometres,
        bottomUm: bottomUm as Micrometres,
      },
    ];
    past.value = [...past.value, next];
    // New action clears the redo stack
    future.value = [];
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
