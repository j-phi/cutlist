// @vitest-environment nuxt
/**
 * Tests for BomModelsList — the collapsible models panel above the BOM
 * table. Verifies the toggle a11y state, that each imported model
 * renders one row, that toggle/remove actions emit the right ids,
 * and that the remove confirmation flow goes through a pending state.
 */
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { shallowMount } from '@vue/test-utils';

import type { Model } from '../../../composables/useProjects';
import BomModelsList from '../BomModelsList.vue';

// UCheckbox stub: renders a real checkbox so we can drive `change`. Uses
// `:value` for two-way wiring rather than v-model semantics.
const UCheckboxStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        type: 'checkbox',
        checked: props.modelValue,
        onChange: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).checked),
      });
  },
});

const stubs = {
  UButton: {
    inheritAttrs: false,
    props: ['label'],
    template: '<button type="button" v-bind="$attrs">{{ label }}</button>',
  },
  UIcon: true,
  UCheckbox: UCheckboxStub,
  ColorMappingPanel: true,
};

function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'm1',
    filename: 'cabinet.gltf',
    source: 'gltf',
    parts: [],
    colors: [],
    enabled: true,
    ...overrides,
  };
}

function getComponent(props: {
  importedModels: Model[];
  totalModelParts: number;
}) {
  return shallowMount(BomModelsList, {
    props,
    global: { stubs },
  });
}

describe('BomModelsList', () => {
  describe('Rendering', () => {
    it('Should render one row per imported model', () => {
      const component = getComponent({
        importedModels: [
          makeModel({ id: 'a', filename: 'a.gltf', parts: [{} as never] }),
          makeModel({
            id: 'b',
            filename: 'b.dae',
            source: 'collada',
            parts: [{} as never, {} as never],
          }),
        ],
        totalModelParts: 3,
      });

      const checkboxes = component.findAll('input[type="checkbox"]');
      expect(checkboxes).toHaveLength(2);
      expect(component.text()).toContain('a.gltf');
      expect(component.text()).toContain('b.dae');
      // Header summary uses singular/plural correctly.
      expect(component.text()).toContain('2 models');
      expect(component.text()).toContain('3 parts');
    });

    it('Should expose the toggle aria-expanded state', async () => {
      const component = getComponent({
        importedModels: [makeModel()],
        totalModelParts: 0,
      });

      const toggle = component.get('button[aria-label="Toggle models panel"]');
      expect(toggle.attributes('aria-expanded')).toBe('true');

      await toggle.trigger('click');
      expect(toggle.attributes('aria-expanded')).toBe('false');
    });
  });

  describe('On model actions', () => {
    it('Should emit toggleModel with the model id when the checkbox changes', async () => {
      const component = getComponent({
        importedModels: [makeModel({ id: 'abc' })],
        totalModelParts: 0,
      });

      const checkbox = component.get('input[type="checkbox"]');
      await checkbox.setValue(false);

      expect(component.emitted('toggleModel')).toEqual([['abc']]);
    });

    it('Should reveal a confirm row when the remove button is clicked, and emit removeModel only on Remove', async () => {
      const component = getComponent({
        importedModels: [makeModel({ id: 'xyz', filename: 'gone.gltf' })],
        totalModelParts: 0,
      });

      // First click: shows the confirm row, no emit yet.
      const removeButton = component.get(
        'button[aria-label="Remove gone.gltf"]',
      );
      await removeButton.trigger('click');
      expect(component.emitted('removeModel')).toBeUndefined();

      const confirmButton = component
        .findAll('button')
        .find((b) => b.text() === 'Remove');
      expect(confirmButton).toBeTruthy();
      await confirmButton!.trigger('click');

      expect(component.emitted('removeModel')).toEqual([['xyz']]);
    });

    it('Should hide the confirm row when Cancel is clicked', async () => {
      const component = getComponent({
        importedModels: [makeModel({ id: 'xyz', filename: 'gone.gltf' })],
        totalModelParts: 0,
      });

      await component
        .get('button[aria-label="Remove gone.gltf"]')
        .trigger('click');

      const cancelButton = component
        .findAll('button')
        .find((b) => b.text() === 'Cancel');
      await cancelButton!.trigger('click');

      // The confirm row is gone; the original Remove button is back.
      expect(component.emitted('removeModel')).toBeUndefined();
      expect(
        component.find('button[aria-label="Remove gone.gltf"]').exists(),
      ).toBe(true);
    });

    it('Should emit pickFile when the Import Model button is clicked', async () => {
      const component = getComponent({
        importedModels: [makeModel()],
        totalModelParts: 0,
      });

      const importButton = component
        .findAll('button')
        .find((b) => b.text() === 'Import Model');
      expect(importButton).toBeTruthy();
      await importButton!.trigger('click');

      expect(component.emitted('pickFile')).toHaveLength(1);
    });
  });
});
