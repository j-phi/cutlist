// @vitest-environment nuxt
/**
 * Trimmed: useUrlSync is two `watch()`s. We don't need to re-test that Vue's
 * watch fires when refs change. The two bugs that would actually break users:
 *  1) Setting activeId out of band must navigate to the canonical path —
 *     otherwise deep-links after project switch are stale.
 *  2) The default tab must round-trip cleanly: a /:projectId URL produces
 *     the default tab in state, and switching back to default drops the
 *     tab segment from the URL (no /p1/bom littering history).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive, ref, type EffectScope } from 'vue';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import { DEFAULT_PROJECT_TAB, type ProjectTabId } from '~/utils/projectTabs';

const navigateTo = vi.fn();
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

it('state→URL: setting activeId navigates to /:projectId when route is mismatched', async () => {
  // Initialize with a different project in the URL than in state.
  projectIdParam.value = 'p1';
  scope.run(() => useUrlSync());
  await nextTick();
  navigateTo.mockClear();

  activeId.value = 'p2';
  await nextTick();

  expect(navigateTo).toHaveBeenCalledWith('/p2', { replace: true });
});

it('URL→state: bare /:projectId URL hydrates default tab in state', async () => {
  projectIdParam.value = 'p1';

  scope.run(() => useUrlSync());
  await nextTick();

  expect(activeId.value).toBe('p1');
  expect(tab.value).toBe(DEFAULT_PROJECT_TAB);
});

it('state→URL: switching back to the default tab drops the tab segment from the URL', async () => {
  projectIdParam.value = 'p1';
  tabParam.value = 'layout';

  scope.run(() => useUrlSync());
  await nextTick();
  navigateTo.mockClear();

  tab.value = DEFAULT_PROJECT_TAB;
  await nextTick();

  expect(navigateTo).toHaveBeenCalledWith('/p1', { replace: true });
});
