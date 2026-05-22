// @vitest-environment nuxt
import { describe, expect, it, beforeEach } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { DEFAULT_MM_PRECISION } from 'cutlist';

import BulkEditBar from '../BulkEditBar.vue';
import { UButtonStub, UInputStub, USelectStub } from '~/test-utils/stubs';

const distanceUnit = ref<'mm' | 'in'>('mm');
const precision = ref(DEFAULT_MM_PRECISION);

mockNuxtImport('useProjectSettings', () => () => ({
  distanceUnit,
  precision,
}));

beforeEach(() => {
  distanceUnit.value = 'mm';
  precision.value = DEFAULT_MM_PRECISION;
});

const stubs = {
  UButton: UButtonStub,
  UInput: UInputStub,
  USelect: USelectStub,
};

function getComponent(
  props: Partial<InstanceType<typeof BulkEditBar>['$props']> = {},
) {
  return shallowMount(BulkEditBar, {
    props: {
      selectedCount: 3,
      editableCount: 3,
      materials: ['Oak', 'Plywood'],
      ...props,
    },
    global: { stubs },
  });
}

function getButton(component: ReturnType<typeof getComponent>, label: string) {
  const btn = component.findAll('button').find((b) => b.text().includes(label));
  if (!btn) throw new Error(`Button "${label}" not found`);
  return btn;
}

describe('BulkEditBar', () => {
  describe('Apply button enabled state', () => {
    it('Should be disabled when no fields are filled', () => {
      const component = getComponent({ materials: ['Oak'] });
      expect(
        getButton(component, 'Apply').attributes('disabled'),
      ).toBeDefined();
    });

    it('Should be enabled when at least one dimension field is filled', async () => {
      const component = getComponent();
      const lengthInput = component.findAll('input')[0];
      await lengthInput.setValue('100');
      await lengthInput.trigger('blur');
      expect(
        getButton(component, 'Apply').attributes('disabled'),
      ).toBeUndefined();
    });
  });

  describe('On Apply', () => {
    it('Should emit patch with only the filled dimension and omit empty fields', async () => {
      const component = getComponent();
      const lengthInput = component.findAll('input')[0];
      await lengthInput.setValue('100');
      await lengthInput.trigger('blur');

      await getButton(component, 'Apply').trigger('click');

      const emitted = component.emitted('apply');
      expect(emitted).toHaveLength(1);
      const patch = (emitted![0] as [Record<string, unknown>])[0];
      expect(patch.lengthUm).toBe(100_000);
      expect('widthUm' in patch).toBe(false);
      expect('thicknessUm' in patch).toBe(false);
      expect('material' in patch).toBe(false);
    });

    it('Should emit patch with material only when just a material is selected', async () => {
      const component = getComponent({ materials: ['Oak', 'Plywood'] });
      const select = component.find('select');
      // The first option is "— no change —" (value ""), second is "Oak"
      await select.setValue('Oak');

      await getButton(component, 'Apply').trigger('click');

      const emitted = component.emitted('apply');
      expect(emitted).toHaveLength(1);
      const patch = (emitted![0] as [Record<string, unknown>])[0];
      expect(patch.material).toBe('Oak');
      expect('lengthUm' in patch).toBe(false);
      expect('widthUm' in patch).toBe(false);
      expect('thicknessUm' in patch).toBe(false);
    });
  });

  describe('On Clear', () => {
    it('Should emit clear when the Clear button is clicked', async () => {
      const component = getComponent();
      // Fill a field so we can confirm the bar is in a non-empty state
      const lengthInput = component.findAll('input')[0];
      await lengthInput.setValue('100');
      await lengthInput.trigger('blur');

      await getButton(component, 'Clear').trigger('click');

      expect(component.emitted('clear')).toHaveLength(1);
    });
  });
});
