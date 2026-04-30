// @vitest-environment nuxt
/**
 * Regression: a brand-new callout's text was disappearing after the user
 * switched scenes and came back. Repro from the user:
 *
 *   1. Create scene S1, then create a callout in S1. The author flow sets
 *      `draftId` to the new annotation's id.
 *   2. CalloutLabel mounts as a draft; user types text and commits.
 *   3. The author flow only clears `draftId` on `cancel()` — `exit()` (the
 *      "successful pick" path) leaves it set. So even after a successful
 *      commit the chip continues to render with `draft={true}`, i.e. as a
 *      textarea.
 *   4. Switching to S2 unmounts the chip (filtered by sceneId).
 *   5. Switching back remounts the chip with `draft` still `true`. The user
 *      reported the textarea showed up empty even though IDB held the text
 *      (a fresh page reload "fixed" it because module-level `draftId` was
 *      reset to null on reload, so the chip remounted as a read-only span).
 *
 * The fix is to bubble a `committed` event from the draft chip when its
 * inline-edit settles, and clear `draftId` in the parent. The chip then
 * remounts as a read-only span that reads `annotation.text` directly — no
 * textarea, no stale local state.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { ref } from 'vue';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { IdbCallout } from '~/composables/useIdb';

const update = vi.fn().mockResolvedValue(undefined);
const remove = vi.fn().mockResolvedValue(undefined);

mockNuxtImport('useAnnotations', () => () => ({
  annotations: ref([]),
  visibleForScene: () => ref([]),
  add: vi.fn(),
  update,
  remove,
  purgeForScene: vi.fn(),
  reload: vi.fn(),
}));

import CalloutLabel from '../CalloutLabel.vue';

function callout(text: string): IdbCallout {
  const now = '2026-04-29T00:00:00.000Z';
  return {
    id: 'a-1',
    sceneId: 's1',
    kind: 'callout',
    groupId: 1,
    anchorLocal: [0, 0, 0],
    anchorNormalLocal: [0, 1, 0],
    labelOffsetLocal: [0, 0.06, 0],
    text,
    createdAt: now,
    updatedAt: now,
  };
}

describe('CalloutLabel — draft commit lifecycle', () => {
  beforeEach(() => {
    update.mockClear();
    remove.mockClear();
  });

  it('Should emit `committed` after a successful blur commit on a draft so the parent can drop draftId', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: true },
    });
    const ta = wrapper.find('textarea');
    await ta.setValue('Foo');
    await ta.trigger('blur');
    expect(update).toHaveBeenCalledWith('a-1', { text: 'Foo' });
    expect(wrapper.emitted('committed')).toBeTruthy();
    expect(wrapper.emitted('committed')!).toHaveLength(1);
  });

  it('Should emit `committed` after Cmd+Enter on a draft', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: true },
    });
    const ta = wrapper.find('textarea');
    await ta.setValue('Foo');
    await ta.trigger('keydown', { key: 'Enter', metaKey: true });
    expect(wrapper.emitted('committed')).toBeTruthy();
  });

  it('Should NOT emit `committed` on Esc (cancel)', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: true },
    });
    const ta = wrapper.find('textarea');
    await ta.trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('committed')).toBeFalsy();
  });

  it('Should NOT emit `committed` when an existing (non-draft) label is edited and committed', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout('Top'), draft: false },
    });
    await wrapper.find('.callout-label').trigger('click');
    const ta = wrapper.find('textarea');
    await ta.setValue('Bottom');
    await ta.trigger('blur');
    expect(update).toHaveBeenCalledWith('a-1', { text: 'Bottom' });
    // Non-draft commit must not fire `committed` — the parent only uses it
    // to wipe a pending draftId, which by definition isn't this annotation.
    expect(wrapper.emitted('committed')).toBeFalsy();
  });

  it('Should render the persisted text as a read-only span when remounted with draft=false (post-fix shape)', async () => {
    // After a draft commits, the parent receives `committed` and clears its
    // draftId. The chip is then re-rendered with `draft=false`. On a scene
    // round-trip the chip unmounts and remounts; with draft now false, it
    // shows the persisted text in the read-only span — no stale textarea,
    // no risk of the textarea showing an empty value.
    const draft = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: true },
    });
    await draft.find('textarea').setValue('Foo');
    await draft.find('textarea').trigger('blur');
    expect(draft.emitted('committed')).toBeTruthy();
    draft.unmount();

    // Parent has cleared draftId; remount with draft=false and the persisted
    // annotation text from in-memory state.
    const remounted = await mountSuspended(CalloutLabel, {
      props: { annotation: callout('Foo'), draft: false },
    });
    expect(remounted.find('textarea').exists()).toBe(false);
    expect(remounted.text()).toContain('Foo');
  });
});
