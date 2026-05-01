// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import ModelEmptyState from '../ModelEmptyState.vue';

describe('ModelEmptyState', () => {
  it.each([
    ['no-models', 'Import a model'],
    ['manual-only', 'Parts were added manually'],
    ['no-source', 'Re-import your model'],
  ] as const)(
    'Should render the %s message when type=%s',
    async (type, expected) => {
      const wrapper = await mountSuspended(ModelEmptyState, {
        props: { type },
      });
      expect(wrapper.text()).toContain(expected);
    },
  );
});
