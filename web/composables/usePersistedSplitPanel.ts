import {
  getLocalStorageNumber,
  setLocalStorageNumber,
} from '~/utils/localStorage';

type Direction = 'horizontal' | 'vertical';

interface SplitConstraints {
  minPanelPx?: number;
  minMainPx?: number;
}

interface PersistedSplitPanelOptions {
  storageKey: string | Ref<string> | (() => string);
  direction?: Direction | Ref<Direction> | (() => Direction);
  horizontal?: SplitConstraints;
  vertical?: SplitConstraints;
  defaultPanelRatio?: number;
}

export default function usePersistedSplitPanel(
  container: Ref<HTMLElement | null | undefined>,
  enabled: Ref<boolean>,
  options: PersistedSplitPanelOptions,
) {
  const panelSize = ref(0);
  const isResizing = ref(false);
  const defaultPanelRatio = options.defaultPanelRatio ?? 1 / 3;

  const direction = computed<Direction>(
    () => toValue(options.direction) ?? 'horizontal',
  );
  const activeStorageKey = computed(() => toValue(options.storageKey));

  const constraints = computed(() => {
    const c =
      direction.value === 'horizontal' ? options.horizontal : options.vertical;
    const fallbackMin = direction.value === 'horizontal' ? 280 : 120;
    const fallbackMain = direction.value === 'horizontal' ? 420 : 200;
    return {
      minPanel: c?.minPanelPx ?? fallbackMin,
      minMain: c?.minMainPx ?? fallbackMain,
    };
  });

  function getContainerSize() {
    if (!container.value) return 0;
    return direction.value === 'horizontal'
      ? container.value.clientWidth
      : container.value.clientHeight;
  }

  function clampPanelSize(next: number) {
    const { minPanel, minMain } = constraints.value;
    const max = Math.max(minPanel, getContainerSize() - minMain);
    return Math.min(Math.max(next, minPanel), max);
  }

  function initializePanelSize() {
    const stored = getLocalStorageNumber(activeStorageKey.value);
    const base =
      stored != null && stored > 0
        ? stored
        : getContainerSize() * defaultPanelRatio;
    panelSize.value = clampPanelSize(base);
  }

  // AbortController for clean listener teardown — no stale closures.
  let resizeAbort: AbortController | null = null;

  function stopResize(persist: boolean) {
    if (!resizeAbort) return;
    resizeAbort.abort();
    resizeAbort = null;
    isResizing.value = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (persist) setLocalStorageNumber(activeStorageKey.value, panelSize.value);
  }

  function startResize(event: PointerEvent) {
    if (event.button !== 0 || resizeAbort) return;
    event.preventDefault();
    panelSize.value = clampPanelSize(panelSize.value);
    isResizing.value = true;

    // Capture direction at drag start so mid-drag breakpoint changes don't break.
    const isHorizontal = direction.value === 'horizontal';
    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    resizeAbort = new AbortController();
    const { signal } = resizeAbort;

    window.addEventListener(
      'pointermove',
      (e) => {
        const bounds = container.value?.getBoundingClientRect();
        if (!bounds) return;
        panelSize.value = clampPanelSize(
          isHorizontal ? bounds.right - e.clientX : e.clientY - bounds.top,
        );
      },
      { signal },
    );
    window.addEventListener('pointerup', () => stopResize(true), { signal });
  }

  function onWindowResize() {
    if (!enabled.value || panelSize.value <= 0) return;
    panelSize.value = clampPanelSize(panelSize.value);
  }

  watch(activeStorageKey, () => {
    stopResize(false);
    initializePanelSize();
  });

  watch(
    [container, enabled],
    async ([el, isEnabled]) => {
      if (!el || !isEnabled) {
        stopResize(false);
        return;
      }
      await nextTick();
      if (panelSize.value <= 0) initializePanelSize();
      else panelSize.value = clampPanelSize(panelSize.value);
    },
    { immediate: true },
  );

  onMounted(() => {
    window.addEventListener('resize', onWindowResize, { passive: true });
  });

  onUnmounted(() => {
    stopResize(false);
    window.removeEventListener('resize', onWindowResize);
  });

  return { panelSize, isResizing, startResize };
}
