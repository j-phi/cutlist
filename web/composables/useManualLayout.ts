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

interface HistoryEntry {
  overrides: PartOverride[];
  onUndo?: () => void;
  onRedo?: () => void;
}

// Module-level singleton — shared across all callers
const manualMode = ref(false);
const isDragging = ref(false);
const snapping = ref(true);

// Undo/redo history stacks. Each entry is a full snapshot of overrides plus
// optional callbacks for actions that go beyond override changes (e.g. Optimize).
const past = ref<HistoryEntry[]>([]);
const future = ref<HistoryEntry[]>([]);

// overrides is derived from the tip of the past stack
const overrides = computed(() => past.value.at(-1)?.overrides ?? []);

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
  tip.onUndo?.();
  future.value = [tip, ...future.value];
}

function redo() {
  if (future.value.length === 0) return;
  const [head, ...rest] = future.value;
  future.value = rest;
  head.onRedo?.();
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

export const SNAP_THRESHOLD_UM = 5000; // 5 mm attraction radius

/**
 * Snaps (rawLeft, rawBottom) to the nearest alignment position on a board:
 * margin insets and tile-edge + blade-width offsets. Returns the raw values
 * unchanged when no candidate falls within SNAP_THRESHOLD_UM.
 *
 * Pass excludePartNumber/excludeInstanceNumber to skip the tile being dragged
 * so it doesn't attract to its own edges.
 */
export function computeAlignmentSnap(
  rawLeft: number,
  rawBottom: number,
  partW: number,
  partH: number,
  board: SheetBoardLayout,
  bladeWidthUm: number,
  excludePartNumber?: number,
  excludeInstanceNumber?: number,
): { leftUm: number; bottomUm: number } {
  const mg = board.marginUm;
  const boardW = board.stock.widthUm;
  const boardL = board.stock.lengthUm;

  const others = board.placements.filter(
    (p) =>
      !(
        p.partNumber === excludePartNumber &&
        p.instanceNumber === excludeInstanceNumber
      ),
  );

  const xCandidates: number[] = [
    mg,
    boardW - mg - partW,
    ...others.flatMap((p) => [
      p.rightUm + bladeWidthUm,
      p.leftUm - partW - bladeWidthUm,
    ]),
  ];

  const yCandidates: number[] = [
    mg,
    boardL - mg - partH,
    ...others.flatMap((p) => [
      p.topUm + bladeWidthUm,
      p.bottomUm - partH - bladeWidthUm,
    ]),
  ];

  function snapNearest(
    raw: number,
    candidates: number[],
    maxPos: number,
  ): number {
    let best = raw;
    let bestDist = SNAP_THRESHOLD_UM;
    for (const c of candidates) {
      const clamped = Math.max(0, Math.min(c, maxPos));
      const dist = Math.abs(raw - clamped);
      if (dist < bestDist) {
        bestDist = dist;
        best = clamped;
      }
    }
    return best;
  }

  return {
    leftUm: snapNearest(rawLeft, xCandidates, boardW - partW),
    bottomUm: snapNearest(rawBottom, yCandidates, boardL - partH),
  };
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
    past.value = [...past.value, { overrides: next }];
    // New action clears the redo stack
    future.value = [];
  }

  function pushOptimizeEntry(onUndo: () => void, onRedo: () => void) {
    past.value = [
      ...past.value,
      { overrides: overrides.value, onUndo, onRedo },
    ];
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
    pushOptimizeEntry,
    undo,
    redo,
    resetOverrides,
    applyOverrides,
  };
}
