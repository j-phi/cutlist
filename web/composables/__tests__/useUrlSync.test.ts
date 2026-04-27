// @vitest-environment nuxt
/**
 * Tests for useUrlSync — the bidirectional bridge between the project
 * route (`/:projectId/:tab`) and the in-memory `activeId` + `tab` state.
 *
 * We mock `useRoute`, `navigateTo`, `useProjects`, and `useProjectTab` at the
 * Nuxt auto-import boundary so the composable's two watchers can run inside
 * a plain `effectScope` without booting Nuxt's router.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive, ref, type EffectScope } from 'vue';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import { DEFAULT_PROJECT_TAB, type ProjectTabId } from '~/utils/projectTabs';

const navigateTo = vi.fn();
// Backing reactive holders so the watcher inside useUrlSync re-runs whenever
// we mutate them. `params` is recreated on each change so the
// `() => route.params` source produces a fresh reference, mirroring how
// vue-router rebuilds the params object on every navigation.
const projectIdParam = ref<string | undefined>(undefined);
const tabParam = ref<string | undefined>(undefined);
const route = reactive({
  get path() {
    const pid = projectIdParam.value;
    const t = tabParam.value;
    if (!pid) return '/';
    return t ? `/${pid}/${t}` : `/${pid}`;
  },
  get params() {
    const out: { projectId?: string; tab?: string } = {};
    if (projectIdParam.value !== undefined)
      out.projectId = projectIdParam.value;
    if (tabParam.value !== undefined) out.tab = tabParam.value;
    return out;
  },
});

const activeId = ref<string | null>(null);
const tab = ref<ProjectTabId>(DEFAULT_PROJECT_TAB);

mockNuxtImport('useRoute', () => () => route);
mockNuxtImport(
  'navigateTo',
  () =>
    (...args: unknown[]) =>
      navigateTo(...args),
);
mockNuxtImport('useProjects', () => () => ({ activeId }));
mockNuxtImport('useProjectTab', () => () => tab);

import useUrlSync from '../useUrlSync';

let scope: EffectScope;

beforeEach(() => {
  navigateTo.mockReset();
  projectIdParam.value = undefined;
  tabParam.value = undefined;
  activeId.value = null;
  tab.value = DEFAULT_PROJECT_TAB;
  scope = effectScope();
});

afterEach(() => {
  scope.stop();
});

// ─── URL → state ─────────────────────────────────────────────────────────────

describe('URL → state', () => {
  it('initial mount populates activeId and default tab from a /:projectId URL', async () => {
    projectIdParam.value = 'p1';

    scope.run(() => useUrlSync());
    await nextTick();

    expect(activeId.value).toBe('p1');
    expect(tab.value).toBe(DEFAULT_PROJECT_TAB);
  });

  it('initial mount populates activeId and tab from /:projectId/:tab', async () => {
    projectIdParam.value = 'p1';
    tabParam.value = 'layout';

    scope.run(() => useUrlSync());
    await nextTick();

    expect(activeId.value).toBe('p1');
    expect(tab.value).toBe('layout');
  });

  it('falls back to default tab for an unknown segment', async () => {
    projectIdParam.value = 'p1';
    tabParam.value = 'definitely-not-a-tab';

    scope.run(() => useUrlSync());
    await nextTick();

    expect(activeId.value).toBe('p1');
    expect(tab.value).toBe(DEFAULT_PROJECT_TAB);
  });

  it('clears activeId when the URL has no projectId', async () => {
    activeId.value = 'p1';

    scope.run(() => useUrlSync());
    await nextTick();

    expect(activeId.value).toBeNull();
  });

  it('reacts to a URL change (navigation)', async () => {
    scope.run(() => useUrlSync());
    await nextTick();
    navigateTo.mockClear();

    projectIdParam.value = 'p2';
    tabParam.value = 'instructions';
    await nextTick();

    expect(activeId.value).toBe('p2');
    expect(tab.value).toBe('instructions');
  });
});

// ─── state → URL ─────────────────────────────────────────────────────────────

describe('state → URL', () => {
  it('navigates to the canonical path when activeId is set', async () => {
    scope.run(() => useUrlSync());
    await nextTick();
    navigateTo.mockClear();

    activeId.value = 'p1';
    await nextTick();

    expect(navigateTo).toHaveBeenCalledWith('/p1', { replace: true });
  });

  it('navigates with the tab segment when a non-default tab is active', async () => {
    scope.run(() => useUrlSync());
    await nextTick();
    navigateTo.mockClear();

    activeId.value = 'p1';
    tab.value = 'layout';
    await nextTick();

    expect(navigateTo).toHaveBeenCalled();
    const lastCall = navigateTo.mock.calls.at(-1)!;
    expect(lastCall[0]).toBe('/p1/layout');
    expect(lastCall[1]).toEqual({ replace: true });
  });

  it('drops the tab segment when switching back to the default tab', async () => {
    projectIdParam.value = 'p1';
    tabParam.value = 'layout';

    scope.run(() => useUrlSync());
    await nextTick();
    navigateTo.mockClear();

    tab.value = DEFAULT_PROJECT_TAB;
    // Simulate the route reflecting the navigation that's about to happen so
    // the URL→state watcher doesn't fight us. We're only asserting the
    // navigateTo target.
    await nextTick();

    expect(navigateTo).toHaveBeenCalledWith('/p1', { replace: true });
  });

  it('navigates to / when activeId is cleared', async () => {
    projectIdParam.value = 'p1';

    scope.run(() => useUrlSync());
    await nextTick();
    navigateTo.mockClear();

    activeId.value = null;
    await nextTick();

    expect(navigateTo).toHaveBeenCalledWith('/', { replace: true });
  });

  it('does not navigate when state already matches the route', async () => {
    projectIdParam.value = 'p1';

    scope.run(() => useUrlSync());
    await nextTick();
    navigateTo.mockClear();

    // Re-apply the same state — should be a no-op since route.path matches.
    activeId.value = 'p1';
    tab.value = DEFAULT_PROJECT_TAB;
    await nextTick();

    expect(navigateTo).not.toHaveBeenCalled();
  });
});
