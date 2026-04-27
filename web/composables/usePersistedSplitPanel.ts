import {
  getLocalStorageNumber,
  setLocalStorageNumber,
} from '~/utils/localStorage';

type Direction = 'horizontal' | 'vertical';

interface PersistedSplitPanelOptions {
  storageKey: string | Ref<string> | (() => string);
  direction?: Direction | Ref<Direction>;
  minPanelWidthPx?: number;
  minMainWidthPx?: number;
  minPanelHeightPx?: number;
  minMainHeightPx?: number;
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

  const direction = computed<Direction>(() => {
    if (!options.direction) return 'horizontal';
    return typeof options.direction === 'string'
      ? options.direction
      : options.direction.value;
  });

  const minPanelSize = computed(() =>
    direction.value === 'horizontal'
      ? (options.minPanelWidthPx ?? 280)
      : (options.minPanelHeightPx ?? 120),
  );

  const minMainSize = computed(() =>
    direction.value === 'horizontal'
      ? (options.minMainWidthPx ?? 420)
      : (options.minMainHeightPx ?? 200),
  );

  function resolveStorageKey() {
    if (typeof options.storageKey === 'function') return options.storageKey();
    if (typeof options.storageKey === 'string') return options.storageKey;
    return options.storageKey.value;
  }

  const activeStorageKey = computed(() => resolveStorageKey());

  function getContainerSize() {
    if (!container.value) return 0;
    return direction.value === 'horizontal'
      ? container.value.clientWidth
      : container.value.clientHeight;
  }

  function getMaxPanelSize() {
    const maxBySpace = getContainerSize() - minMainSize.value;
    return Math.max(minPanelSize.value, maxBySpace);
  }

  function clampPanelSize(next: number) {
    const max = getMaxPanelSize();
    return Math.min(Math.max(next, minPanelSize.value), max);
  }

  function readStoredPanelSize(): number | null {
    const stored = getLocalStorageNumber(activeStorageKey.value);
    return stored != null && stored > 0 ? stored : null;
  }

  function writeStoredPanelSize(size: number) {
    setLocalStorageNumber(activeStorageKey.value, size);
  }

  function defaultPanelSize() {
    return clampPanelSize(getContainerSize() * defaultPanelRatio);
  }

  function initializePanelSize() {
    const stored = readStoredPanelSize();
    panelSize.value = clampPanelSize(stored ?? defaultPanelSize());
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
    if (persist) writeStoredPanelSize(panelSize.value);
  }

  function startResize(event: PointerEvent) {
    if (event.button !== 0 || resizeAbort) return;
    event.preventDefault();
    panelSize.value = clampPanelSize(panelSize.value);
    isResizing.value = true;

    const cursor =
      direction.value === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';

    resizeAbort = new AbortController();
    const { signal } = resizeAbort;

    // Capture direction at drag start so mid-drag breakpoint changes don't break.
    const dir = direction.value;

    window.addEventListener(
      'pointermove',
      (e) => {
        const bounds = container.value?.getBoundingClientRect();
        if (!bounds) return;
        if (dir === 'horizontal') {
          panelSize.value = clampPanelSize(bounds.right - e.clientX);
        } else {
          panelSize.value = clampPanelSize(e.clientY - bounds.top);
        }
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

  return {
    panelSize,
    isResizing,
    startResize,
  };
}
