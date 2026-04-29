// @vitest-environment nuxt
/**
 * CalloutLabel — inline-edit surface. The component talks to useAnnotations
 * directly (it's the only thing it needs), so we mock that module-level
 * composable and verify the draft commit/cancel surface.
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

function callout(text = ''): IdbCallout {
  const now = '2026-04-29T00:00:00.000Z';
  return {
    id: 'a-1',
    sceneId: 's',
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

describe('CalloutLabel — non-draft', () => {
  it('Should render the annotation text', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout('Top edge'), draft: false },
    });
    expect(wrapper.text()).toBe('Top edge');
    expect(wrapper.find('textarea').exists()).toBe(false);
  });

  it('Should fall back to "Untitled" for an empty label', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: false },
    });
    expect(wrapper.text()).toBe('Untitled');
  });

  it('Should preserve newlines in the static display', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout('line one\nline two'), draft: false },
    });
    expect(wrapper.text()).toContain('line one');
    expect(wrapper.text()).toContain('line two');
  });
});

describe('CalloutLabel — draft', () => {
  beforeEach(() => {
    update.mockClear();
    remove.mockClear();
  });

  it('Should render the editable textarea', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: true },
    });
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('Should commit on blur with trimmed text', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: true },
    });
    const ta = wrapper.find('textarea');
    await ta.setValue('  Top edge  ');
    await ta.trigger('blur');
    expect(update).toHaveBeenCalledWith('a-1', { text: 'Top edge' });
  });

  it('Should commit on Cmd+Enter', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: true },
    });
    const ta = wrapper.find('textarea');
    await ta.setValue('Hello');
    await ta.trigger('keydown', { key: 'Enter', metaKey: true });
    expect(update).toHaveBeenCalledWith('a-1', { text: 'Hello' });
  });

  it('Should commit on Ctrl+Enter', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: true },
    });
    const ta = wrapper.find('textarea');
    await ta.setValue('Hello');
    await ta.trigger('keydown', { key: 'Enter', ctrlKey: true });
    expect(update).toHaveBeenCalledWith('a-1', { text: 'Hello' });
  });

  it('Should leave plain Enter alone (textarea inserts a newline)', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: true },
    });
    const ta = wrapper.find('textarea');
    await ta.setValue('Hello');
    await ta.trigger('keydown', { key: 'Enter' });
    // No commit — plain Enter is the textarea's default newline behavior.
    expect(update).not.toHaveBeenCalled();
  });

  it('Should remove the annotation on Esc', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: true },
    });
    const ta = wrapper.find('textarea');
    await ta.trigger('keydown', { key: 'Escape' });
    expect(remove).toHaveBeenCalledWith('a-1');
    expect(update).not.toHaveBeenCalled();
  });

  it('Should not double-commit when Cmd+Enter is followed by a later blur', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: true },
    });
    const ta = wrapper.find('textarea');
    await ta.setValue('Hello');
    await ta.trigger('keydown', { key: 'Enter', metaKey: true });
    await ta.trigger('blur');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('Should not commit after Esc removed the draft', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: true },
    });
    const ta = wrapper.find('textarea');
    await ta.trigger('keydown', { key: 'Escape' });
    await ta.trigger('blur');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('Should commit text containing newlines verbatim', async () => {
    const wrapper = await mountSuspended(CalloutLabel, {
      props: { annotation: callout(''), draft: true },
    });
    const ta = wrapper.find('textarea');
    await ta.setValue('first\nsecond');
    await ta.trigger('keydown', { key: 'Enter', metaKey: true });
    expect(update).toHaveBeenCalledWith('a-1', { text: 'first\nsecond' });
  });
});
