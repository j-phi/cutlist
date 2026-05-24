import { STORAGE_KEYS } from '~/utils/localStorage';

// Module-level singleton so the setting is shared across all callers without
// a Pinia store. Reads from localStorage once on first client access.
const _enabled = shallowRef(true);
let _initialized = false;

function init() {
  if (_initialized || !import.meta.client) return;
  _initialized = true;
  const stored = window.localStorage.getItem(
    STORAGE_KEYS.ui.costTrackingEnabled,
  );
  _enabled.value = stored !== 'false';
}

export function useCostTracking() {
  init();

  const enabled = computed({
    get: () => _enabled.value,
    set: (v: boolean) => {
      _enabled.value = v;
      if (import.meta.client) {
        window.localStorage.setItem(
          STORAGE_KEYS.ui.costTrackingEnabled,
          String(v),
        );
      }
    },
  });

  return { enabled };
}
