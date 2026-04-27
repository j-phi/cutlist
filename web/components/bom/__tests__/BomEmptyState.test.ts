// @vitest-environment nuxt
/**
 * Tests for BomEmptyState — the workflow tutorial card shown when the
 * active project has no models yet. We verify the only thing that
 * matters externally: which user actions emit which events.
 */
import { describe, expect, it } from 'vitest';
import { shallowMount } from '@vue/test-utils';

import BomEmptyState from '../BomEmptyState.vue';

const stubs = {
  UButton: {
    inheritAttrs: false,
    props: ['label'],
    // No explicit @click re-emit: native bubbling already triggers any
    // listener bound on the parent template. Re-emitting fires twice.
    template: '<button type="button" v-bind="$attrs">{{ label }}</button>',
  },
  UIcon: true,
};

function getComponent() {
  return shallowMount(BomEmptyState, { global: { stubs } });
}

describe('BomEmptyState', () => {
  describe('On user actions', () => {
    it('Should emit pickFile when the import drop zone is clicked', async () => {
      const component = getComponent();

      await component.get('[aria-label="Import model"]').trigger('click');

      expect(component.emitted('pickFile')).toHaveLength(1);
      expect(component.emitted('addManualPart')).toBeUndefined();
    });

    it('Should emit pickFile when the Import Model button is clicked', async () => {
      const component = getComponent();

      const importButton = component
        .findAll('button')
        .find((b) => b.text() === 'Import Model');
      expect(importButton).toBeTruthy();
      await importButton!.trigger('click');

      expect(component.emitted('pickFile')).toHaveLength(1);
    });

    it('Should emit addManualPart when the Add Part Manually button is clicked', async () => {
      const component = getComponent();

      const addButton = component
        .findAll('button')
        .find((b) => b.text() === 'Add Part Manually');
      expect(addButton).toBeTruthy();
      await addButton!.trigger('click');

      expect(component.emitted('addManualPart')).toHaveLength(1);
      expect(component.emitted('pickFile')).toBeUndefined();
    });
  });
});
