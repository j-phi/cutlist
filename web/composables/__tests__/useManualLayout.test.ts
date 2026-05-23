import { beforeEach, describe, expect, it } from 'vitest';
import { effectScope, nextTick } from 'vue';
import type {
  Micrometres,
  SheetBoardLayout,
  SheetBoardLayoutPlacement,
} from 'cutlist';
import { useManualLayout, computeAlignmentSnap } from '../useManualLayout';

function um(n: number): Micrometres {
  return n as Micrometres;
}

function makePlacement(
  partNumber: number,
  instanceNumber: number,
  leftUm: number,
  bottomUm: number,
  rightUm: number,
  topUm: number,
  overrides: Partial<SheetBoardLayoutPlacement> = {},
): SheetBoardLayoutPlacement {
  return {
    partNumber,
    instanceNumber,
    name: `Part ${partNumber}`,
    material: 'Plywood',
    widthUm: um(rightUm - leftUm),
    lengthUm: um(topUm - bottomUm),
    thicknessUm: um(18000),
    leftUm: um(leftUm),
    rightUm: um(rightUm),
    bottomUm: um(bottomUm),
    topUm: um(topUm),
    allowanceWidthUm: um(0),
    allowanceLengthUm: um(0),
    grainLock: undefined,
    ...overrides,
  };
}

function makeLayout(
  placements: SheetBoardLayoutPlacement[],
  widthUm = 1200000,
  lengthUm = 2400000,
): SheetBoardLayout {
  return {
    kind: 'sheet',
    stock: {
      name: 'Plywood 18mm',
      material: 'Plywood',
      widthUm: um(widthUm),
      lengthUm: um(lengthUm),
      thicknessUm: um(18000),
      color: '#d2b996',
      role: 'general',
    },
    placements,
    marginUm: um(0),
    algorithm: 'compact',
  };
}

describe('useManualLayout', () => {
  let api: ReturnType<typeof useManualLayout>;

  beforeEach(() => {
    api = useManualLayout();
    api.resetOverrides();
    api.manualMode.value = false;
    api.isDragging.value = false;
    api.snapping.value = true;
    // Also reset document.body.style.userSelect between tests
    document.body.style.userSelect = '';
  });

  describe('applyOverrides', () => {
    it('returns layouts unchanged when there are no overrides', () => {
      const layouts = [makeLayout([makePlacement(1, 1, 0, 0, 300000, 600000)])];
      expect(api.applyOverrides(layouts)).toEqual(layouts);
    });

    it('moves a part from one board to another at the given position', () => {
      const part = makePlacement(1, 1, 0, 0, 300000, 600000);
      const board0 = makeLayout([part]);
      const board1 = makeLayout([]);
      const layouts = [board0, board1];

      api.movePart(1, 1, 1, 100000, 200000);

      const result = api.applyOverrides(layouts);

      // Removed from source board
      expect(result[0].placements).toHaveLength(0);

      // Added to target board at the specified position
      expect(result[1].placements).toHaveLength(1);
      const placed = result[1].placements[0];
      expect(placed.leftUm).toBe(100000);
      expect(placed.bottomUm).toBe(200000);
      // Dimensions preserved
      expect(placed.rightUm - placed.leftUm).toBe(300000);
      expect(placed.topUm - placed.bottomUm).toBe(600000);
    });

    it('clamps position so the part stays within the target board', () => {
      const part = makePlacement(1, 1, 0, 0, 300000, 600000);
      const board0 = makeLayout([part]);
      // Narrow board: 500000 wide, 700000 long
      const board1 = makeLayout([], 500000, 700000);
      const layouts = [board0, board1];

      // Position would place part outside: left=300000 means right=600000 > 500000
      api.movePart(1, 1, 1, 300000, 200000);

      const result = api.applyOverrides(layouts);
      const placed = result[1].placements[0];
      // Clamped: maxLeft = 500000 - 300000 = 200000
      expect(placed.leftUm).toBe(200000);
      expect(placed.rightUm).toBe(500000);
    });

    it('overwrites a previous override for the same part', () => {
      const part = makePlacement(1, 1, 0, 0, 300000, 600000);
      const board0 = makeLayout([part]);
      const board1 = makeLayout([]);
      const layouts = [board0, board1];

      api.movePart(1, 1, 0, 50000, 50000);
      api.movePart(1, 1, 1, 100000, 100000); // overwrite

      const result = api.applyOverrides(layouts);
      expect(result[0].placements).toHaveLength(0);
      expect(result[1].placements).toHaveLength(1);
      expect(result[1].placements[0].leftUm).toBe(100000);
    });

    it('does not mutate the original layouts array', () => {
      const part = makePlacement(1, 1, 0, 0, 300000, 600000);
      const board0 = makeLayout([part]);
      const board1 = makeLayout([]);
      const original = [board0, board1];
      const originalPlacements0 = [...board0.placements];

      api.movePart(1, 1, 1, 0, 0);
      api.applyOverrides(original);

      expect(original[0].placements).toEqual(originalPlacements0);
    });

    it('ignores overrides for parts not found in any board', () => {
      const board0 = makeLayout([makePlacement(1, 1, 0, 0, 300000, 600000)]);
      const layouts = [board0];

      api.movePart(99, 1, 0, 0, 0); // partNumber 99 doesn't exist

      const result = api.applyOverrides(layouts);
      expect(result[0].placements).toHaveLength(1);
    });
  });

  describe('computeAlignmentSnap', () => {
    const blade = 3175; // µm, ~1/8" kerf

    it('snaps to margin edge when within 5 mm', () => {
      const board = { ...makeLayout([]), marginUm: um(5000) };
      // raw=3000 → |3000-5000|=2000 < 5000 → snaps to 5000
      const r = computeAlignmentSnap(3000, 3000, 300000, 600000, board, blade);
      expect(r.leftUm).toBe(5000);
      expect(r.bottomUm).toBe(5000);
    });

    it('does not snap when farther than 5 mm from any candidate', () => {
      const board = { ...makeLayout([]), marginUm: um(5000) };
      // raw=50000 → far from margin 5000 and far from right margin 900000
      const r = computeAlignmentSnap(
        50000,
        50000,
        300000,
        600000,
        board,
        blade,
      );
      expect(r.leftUm).toBe(50000);
      expect(r.bottomUm).toBe(50000);
    });

    it('snaps to right edge of an existing tile + blade width', () => {
      const existing = makePlacement(2, 1, 0, 0, 200000, 300000);
      const board = makeLayout([existing]);
      // candidate = 200000 + 3175 = 203175; raw=205000 → dist=1825 < 5000
      const r = computeAlignmentSnap(205000, 0, 100000, 100000, board, blade);
      expect(r.leftUm).toBe(203175);
    });

    it('snaps to bottom of an existing tile minus blade width (tile above)', () => {
      const existing = makePlacement(2, 1, 0, 500000, 200000, 800000);
      const board = makeLayout([existing]);
      // candidate = existing.bottomUm - partH - blade = 500000 - 100000 - 3175 = 396825
      // raw=398000 → dist=1175 < 5000
      const r = computeAlignmentSnap(0, 398000, 100000, 100000, board, blade);
      expect(r.bottomUm).toBe(396825);
    });

    it('snaps to right board margin', () => {
      const board = makeLayout([], 1200000, 2400000); // marginUm = 0
      // right margin candidate = 1200000 - 0 - 300000 = 900000
      // raw=897000 → dist=3000 < 5000
      const r = computeAlignmentSnap(897000, 0, 300000, 600000, board, blade);
      expect(r.leftUm).toBe(900000);
    });

    it('excludes the dragged part so it does not snap to itself', () => {
      const dragged = makePlacement(1, 1, 100000, 0, 200000, 300000);
      const board = makeLayout([dragged]);
      // Without exclusion, right edge candidate = 200000 + 3175 = 203175
      // raw=203000 would snap to 203175 (dist=175 < 5000)
      // With exclusion, no tile candidates → only margin 0 and 900000 (far) → stays at 203000
      const r = computeAlignmentSnap(
        203000,
        0,
        100000,
        100000,
        board,
        blade,
        1,
        1,
      );
      expect(r.leftUm).toBe(203000);
    });
  });

  describe('resetOverrides', () => {
    it('clears all overrides and both history stacks', () => {
      api.movePart(1, 1, 0, 0, 0);
      api.movePart(2, 1, 1, 0, 0);
      api.resetOverrides();
      expect(api.overrides.value).toHaveLength(0);
      expect(api.canUndo.value).toBe(false);
      expect(api.canRedo.value).toBe(false);
    });
  });

  describe('undo / redo stack', () => {
    it('undo removes the most recent movePart, redo restores it', () => {
      api.snapping.value = false; // use exact positions for predictability
      api.movePart(1, 1, 0, 10000, 20000);
      api.movePart(2, 1, 0, 30000, 40000);
      api.movePart(3, 1, 0, 50000, 60000);

      expect(api.overrides.value).toHaveLength(3);
      expect(api.canUndo.value).toBe(true);
      expect(api.canRedo.value).toBe(false);

      api.undo();
      expect(api.overrides.value).toHaveLength(2);
      expect(api.canUndo.value).toBe(true);
      expect(api.canRedo.value).toBe(true);

      api.undo();
      expect(api.overrides.value).toHaveLength(1);

      api.undo();
      expect(api.overrides.value).toHaveLength(0);
      expect(api.canUndo.value).toBe(false);
      expect(api.canRedo.value).toBe(true);

      // Extra undo is a no-op
      api.undo();
      expect(api.overrides.value).toHaveLength(0);

      // Redo brings back 1 entry
      api.redo();
      expect(api.overrides.value).toHaveLength(1);
      expect(api.canUndo.value).toBe(true);
      expect(api.canRedo.value).toBe(true);
    });

    it('movePart after undo clears the redo stack', () => {
      api.snapping.value = false;
      api.movePart(1, 1, 0, 10000, 20000);
      api.movePart(2, 1, 0, 30000, 40000);

      api.undo();
      expect(api.canRedo.value).toBe(true);

      // New movePart should wipe redo
      api.movePart(3, 1, 0, 50000, 60000);
      expect(api.canRedo.value).toBe(false);
    });

    it('resetOverrides clears both undo and redo stacks', () => {
      api.snapping.value = false;
      api.movePart(1, 1, 0, 10000, 20000);
      api.undo();
      // now canRedo is true
      api.resetOverrides();
      expect(api.canUndo.value).toBe(false);
      expect(api.canRedo.value).toBe(false);
    });

    it('redo when future is empty is a no-op', () => {
      api.snapping.value = false;
      api.movePart(1, 1, 0, 10000, 20000);
      expect(api.canRedo.value).toBe(false);
      api.redo(); // no-op
      expect(api.overrides.value).toHaveLength(1);
    });

    it('canUndo and canRedo reflect correct state throughout', () => {
      expect(api.canUndo.value).toBe(false);
      expect(api.canRedo.value).toBe(false);

      api.snapping.value = false;
      api.movePart(1, 1, 0, 0, 0);
      expect(api.canUndo.value).toBe(true);
      expect(api.canRedo.value).toBe(false);

      api.undo();
      expect(api.canUndo.value).toBe(false);
      expect(api.canRedo.value).toBe(true);

      api.redo();
      expect(api.canUndo.value).toBe(true);
      expect(api.canRedo.value).toBe(false);
    });

    it('movePart stores snapshots independently — mutating overrides does not corrupt history', () => {
      api.movePart(1, 1, 0, 0, 0);
      const tip = api.overrides.value; // reference to current override array

      api.movePart(2, 1, 0, 0, 0); // push second move
      // tip should still reflect only the first move's state
      expect(tip).toHaveLength(1);
      expect(tip[0].partNumber).toBe(1);

      // Undo should restore to first move (1 entry)
      api.undo();
      expect(api.overrides.value).toHaveLength(1);
      expect(api.overrides.value[0].partNumber).toBe(1);
    });
  });

  describe('pushOptimizeEntry (Optimize undo/redo)', () => {
    it('makes the Optimize action undoable and redoable via callbacks', () => {
      const undoCalls: string[] = [];
      const redoCalls: string[] = [];

      api.snapping.value = false;
      api.movePart(1, 1, 0, 10000, 20000);
      api.pushOptimizeEntry(
        () => undoCalls.push('undo'),
        () => redoCalls.push('redo'),
      );
      api.movePart(2, 1, 0, 30000, 40000);

      expect(api.canUndo.value).toBe(true);
      expect(api.overrides.value).toHaveLength(2);

      api.undo(); // undo movePart(2)
      expect(undoCalls).toHaveLength(0);
      expect(api.overrides.value).toHaveLength(1);

      api.undo(); // undo optimize — fires onUndo
      expect(undoCalls).toEqual(['undo']);
      expect(api.overrides.value).toHaveLength(1); // optimize didn't change overrides

      api.undo(); // undo movePart(1)
      expect(api.overrides.value).toHaveLength(0);

      api.redo(); // redo movePart(1)
      expect(redoCalls).toHaveLength(0);
      expect(api.overrides.value).toHaveLength(1);

      api.redo(); // redo optimize — fires onRedo
      expect(redoCalls).toEqual(['redo']);

      api.redo(); // redo movePart(2)
      expect(api.overrides.value).toHaveLength(2);
    });

    it('clears the redo stack', () => {
      api.snapping.value = false;
      api.movePart(1, 1, 0, 10000, 20000);
      api.undo();
      expect(api.canRedo.value).toBe(true);

      api.pushOptimizeEntry(
        () => {},
        () => {},
      );
      expect(api.canRedo.value).toBe(false);
    });
  });

  describe('text selection disabled during drag', () => {
    it('sets userSelect to none when isDragging becomes true', async () => {
      api.isDragging.value = true;
      await nextTick();
      expect(document.body.style.userSelect).toBe('none');
    });

    it('restores userSelect when isDragging becomes false', async () => {
      api.isDragging.value = true;
      await nextTick();
      api.isDragging.value = false;
      await nextTick();
      expect(document.body.style.userSelect).toBe('');
    });

    it('isDragging watcher survives component scope disposal (effectScope(true))', async () => {
      // Simulate a component scope being created and destroyed
      const componentScope = effectScope();
      componentScope.run(() => {
        useManualLayout(); // re-call — should not install a second watcher, but verify the existing one survives
      });
      componentScope.stop(); // simulate component unmount

      // The module-level watcher should still be active
      api.isDragging.value = true;
      await nextTick();
      expect(document.body.style.userSelect).toBe('none');
    });
  });
});
