/**
 * F3 — Storage durability bundle (FR-DUR-1/-2/-3).
 *
 * Browser-only persistence is fragile: Safari evicts script-writable storage
 * after ~7 days idle, and every project lives only in IndexedDB. This
 * composable:
 *
 *  - FR-DUR-1: calls `navigator.storage.persist()` once at boot (and once on
 *    first project creation, wired in `useProjectCollection`), recording the
 *    resulting `persisted()` state.
 *  - FR-DUR-2: exposes `showBackupBanner` — true while persistence is denied
 *    or unavailable and the user hasn't dismissed it — so the UI can nudge an
 *    export.
 *  - FR-DUR-3: exposes `usage`, `quota`, and a derived `lowSpace` flag (true
 *    while usage ≥ 80% of quota) so a warning shows BEFORE a write fails.
 *
 * The state is module-level (one durability picture per process). The factory
 * `createStorageDurability(storage)` takes the `StorageManager` as an explicit
 * dependency so tests can inject a stub without a Nuxt runtime or a real
 * browser; `useStorageDurability()` is the production singleton bound to
 * `navigator.storage`.
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import {
  getLocalStorageJson,
  setLocalStorageJson,
  STORAGE_KEYS,
} from '~/utils/localStorage';

/**
 * The slice of `StorageManager` we use. Narrowed to an interface so a stub
 * only needs these three methods.
 */
export interface StorageLike {
  persist(): Promise<boolean>;
  persisted(): Promise<boolean>;
  estimate(): Promise<{ usage?: number; quota?: number }>;
}

/** usage ≥ this fraction of quota triggers the proactive low-space warning. */
export const LOW_SPACE_THRESHOLD = 0.8;

export interface StorageDurability {
  /** `persisted()` result — null until init/refresh has resolved. */
  persisted: Ref<boolean | null>;
  /** Bytes used, or null if the estimate hasn't resolved / is unavailable. */
  usage: Ref<number | null>;
  /** Quota in bytes, or null. */
  quota: Ref<number | null>;
  /** True while usage ≥ 80% of a known, positive quota. */
  lowSpace: ComputedRef<boolean>;
  /** True while persistence is denied/unavailable and not dismissed. */
  showBackupBanner: ComputedRef<boolean>;
  /** FR-DUR-1: request persistence (once) + refresh the estimate. */
  init(): Promise<void>;
  /** FR-DUR-1: re-request persistence (used on first project creation). */
  requestPersist(): Promise<void>;
  /** FR-DUR-3: refresh usage/quota from the Storage API. */
  refreshEstimate(): Promise<void>;
  /** FR-DUR-2: permanently dismiss the backup banner. */
  dismissBanner(): void;
}

export function createStorageDurability(
  storage: StorageLike | undefined,
): StorageDurability {
  const persisted = ref<boolean | null>(null);
  const usage = ref<number | null>(null);
  const quota = ref<number | null>(null);
  const dismissed = ref<boolean>(
    getLocalStorageJson<boolean>(
      STORAGE_KEYS.ui.storageBackupBannerDismissed,
    ) === true,
  );

  // Guards the one-time persist request so init() is idempotent.
  let persistRequested = false;

  const lowSpace = computed(() => {
    const u = usage.value;
    const q = quota.value;
    if (u == null || q == null || q <= 0) return false;
    return u / q >= LOW_SPACE_THRESHOLD;
  });

  const showBackupBanner = computed(() => {
    if (dismissed.value) return false;
    // Show until we've affirmatively confirmed persistence. `null` (not yet
    // resolved) doesn't trip it; only an explicit `false` (denied/unavailable).
    return persisted.value === false;
  });

  async function requestPersist(): Promise<void> {
    if (persistRequested) {
      // Already asked once this session; just refresh the recorded state.
      await refreshPersisted();
      return;
    }
    persistRequested = true;
    if (!storage) {
      persisted.value = false;
      return;
    }
    try {
      const granted = await storage.persist();
      persisted.value = granted;
    } catch {
      persisted.value = false;
    }
  }

  async function refreshPersisted(): Promise<void> {
    if (!storage) {
      persisted.value = false;
      return;
    }
    try {
      persisted.value = await storage.persisted();
    } catch {
      persisted.value = false;
    }
  }

  async function refreshEstimate(): Promise<void> {
    if (!storage) {
      usage.value = null;
      quota.value = null;
      return;
    }
    try {
      const est = await storage.estimate();
      usage.value = est.usage ?? 0;
      quota.value = est.quota ?? 0;
    } catch {
      usage.value = null;
      quota.value = null;
    }
  }

  async function init(): Promise<void> {
    await requestPersist();
    await refreshEstimate();
  }

  function dismissBanner(): void {
    dismissed.value = true;
    setLocalStorageJson(STORAGE_KEYS.ui.storageBackupBannerDismissed, true);
  }

  return {
    persisted,
    usage,
    quota,
    lowSpace,
    showBackupBanner,
    init,
    requestPersist,
    refreshEstimate,
    dismissBanner,
  };
}

// ─── Production singleton ─────────────────────────────────────────────────────

let singleton: StorageDurability | null = null;

function resolveBrowserStorage(): StorageLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const s = navigator.storage as StorageManager | undefined;
  // Some browsers (older Safari) expose `storage` without `persist`.
  if (!s || typeof s.persist !== 'function') return undefined;
  return s as unknown as StorageLike;
}

export default function useStorageDurability(): StorageDurability {
  if (!singleton) {
    singleton = createStorageDurability(resolveBrowserStorage());
  }
  return singleton;
}

/** Test-only: drop the production singleton between tests. */
export function __resetStorageDurabilityForTests(): void {
  singleton = null;
}
