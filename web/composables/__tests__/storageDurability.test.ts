/**
 * F3 — FR-DUR-1/-3: storage persistence request + low-space meter.
 *
 * `navigator.storage` is stubbed with a typed-array recorder (not vi.fn
 * introspection) so the persist-request assertion is outcome-based: we count
 * what the code actually recorded into the array. The meter assertions check
 * the derived reactive state, never how the stub was wired.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  createStorageDurability,
  type StorageLike,
} from '../useStorageDurability';

function makeStorage(opts: {
  persisted?: boolean;
  usage?: number;
  quota?: number;
}) {
  const persistCalls: boolean[] = [];
  const storage: StorageLike = {
    async persist() {
      const granted = opts.persisted ?? false;
      persistCalls.push(granted);
      return granted;
    },
    async persisted() {
      return opts.persisted ?? false;
    },
    async estimate() {
      return { usage: opts.usage ?? 0, quota: opts.quota ?? 0 };
    },
  };
  return { storage, persistCalls };
}

import { __resetStorageDurabilityForTests } from '../useStorageDurability';

afterEach(() => {
  // The composable holds module-scoped reactive state; reset between tests.
  __resetStorageDurabilityForTests();
  // Banner dismissal persists to localStorage — clear it so the dismiss test
  // doesn't leak into later cases.
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
});

describe('FR-DUR-1 — persist requested on init', () => {
  it('requests persistence exactly once on init', async () => {
    const { storage, persistCalls } = makeStorage({ persisted: true });
    const dur = createStorageDurability(storage);

    await dur.init();

    expect(persistCalls).toHaveLength(1);
    expect(dur.persisted.value).toBe(true);
  });

  it('is idempotent — a second init does not re-request', async () => {
    const { storage, persistCalls } = makeStorage({ persisted: true });
    const dur = createStorageDurability(storage);

    await dur.init();
    await dur.init();

    expect(persistCalls).toHaveLength(1);
  });

  it('records denied persistence so the banner can surface', async () => {
    const { storage } = makeStorage({ persisted: false });
    const dur = createStorageDurability(storage);

    await dur.init();

    expect(dur.persisted.value).toBe(false);
    expect(dur.showBackupBanner.value).toBe(true);
  });
});

describe('FR-DUR-3 — low-space meter', () => {
  it('flags lowSpace when usage >= 80% of quota', async () => {
    const { storage } = makeStorage({ usage: 85, quota: 100 });
    const dur = createStorageDurability(storage);

    await dur.refreshEstimate();

    expect(dur.usage.value).toBe(85);
    expect(dur.quota.value).toBe(100);
    expect(dur.lowSpace.value).toBe(true);
  });

  it('does not flag lowSpace at 50% usage', async () => {
    const { storage } = makeStorage({ usage: 50, quota: 100 });
    const dur = createStorageDurability(storage);

    await dur.refreshEstimate();

    expect(dur.lowSpace.value).toBe(false);
  });

  it('treats a zero/unknown quota as not low (avoids divide-by-zero false alarm)', async () => {
    const { storage } = makeStorage({ usage: 0, quota: 0 });
    const dur = createStorageDurability(storage);

    await dur.refreshEstimate();

    expect(dur.lowSpace.value).toBe(false);
  });
});

describe('FR-DUR-2 — banner is one-time dismissible', () => {
  it('hides the banner once dismissed even while persistence stays denied', async () => {
    const { storage } = makeStorage({ persisted: false });
    const dur = createStorageDurability(storage);

    await dur.init();
    expect(dur.showBackupBanner.value).toBe(true);

    dur.dismissBanner();
    expect(dur.showBackupBanner.value).toBe(false);
  });
});

describe('graceful degradation', () => {
  it('does not throw when the Storage API is absent', async () => {
    const dur = createStorageDurability(undefined);
    await dur.init();
    await dur.refreshEstimate();
    // With no API we cannot prove persistence, so the backup banner shows.
    expect(dur.persisted.value).toBe(false);
    expect(dur.showBackupBanner.value).toBe(true);
  });
});
