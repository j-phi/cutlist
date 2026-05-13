import {
  reduceStockMatrix,
  isLinearStock,
  type Micrometres,
  type SheetStock,
} from 'cutlist';
import type { GrainLock } from '~/utils/grain';
import { cycleGrainLock } from '~/utils/grain';
import { canFitOnAnyBoard } from '~/utils/canFitOnAnyBoard';

/**
 * Shared composable that provides grain lock toggling with a confirmation
 * warning when the new orientation would make the part too large for any
 * available board. Shared so LayoutList and LayoutListItem use the same
 * modal state.
 */
export const useGrainLockConfirm = createSharedComposable(() => {
  const { activeId, updatePartGrainLock } = useProjects();
  const { stocks, margin } = useProjectSettings();

  // Linear stock has no per-part grain lock concept (cross-section is fixed),
  // so the fit check only considers sheet boards.
  const sheetBoards = computed<SheetStock[]>(() =>
    reduceStockMatrix(stocks.value).filter(
      (s): s is SheetStock => !isLinearStock(s),
    ),
  );

  const marginUm = computed(() => margin.value ?? (0 as Micrometres));

  const showConfirm = ref(false);
  const pendingPartNumber = ref<number | null>(null);
  const pendingGrainLock = ref<GrainLock>(undefined);

  function requestGrainLockChange(
    partNumber: number,
    currentGrainLock: GrainLock,
    part: {
      material: string;
      thicknessUm: Micrometres;
      widthUm: Micrometres;
      lengthUm: Micrometres;
    },
  ) {
    if (!activeId.value) return;

    const next = cycleGrainLock(currentGrainLock);
    const fits = canFitOnAnyBoard(
      part,
      next,
      sheetBoards.value,
      marginUm.value,
    );

    if (fits) {
      updatePartGrainLock(activeId.value, partNumber, next);
    } else {
      pendingPartNumber.value = partNumber;
      pendingGrainLock.value = next;
      showConfirm.value = true;
    }
  }

  function confirmChange() {
    if (activeId.value && pendingPartNumber.value != null) {
      updatePartGrainLock(
        activeId.value,
        pendingPartNumber.value,
        pendingGrainLock.value,
      );
    }
    cancelChange();
  }

  function cancelChange() {
    showConfirm.value = false;
    pendingPartNumber.value = null;
    pendingGrainLock.value = undefined;
  }

  return {
    showConfirm,
    pendingGrainLock,
    requestGrainLockChange,
    confirmChange,
    cancelChange,
  };
});
