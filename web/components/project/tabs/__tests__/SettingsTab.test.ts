// @vitest-environment nuxt
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { DEFAULT_MM_PRECISION } from 'cutlist';

import SettingsTab from '../SettingsTab.vue';

const activeId = ref<string | null>('p1');
const activeProject = ref<{ name: string } | null>({ name: 'Original' });
const distanceUnit = ref<'mm' | 'in' | undefined>('mm');
const precision = ref(DEFAULT_MM_PRECISION);
const renameProject = vi.fn();
const closeProject = vi.fn();

mockNuxtImport('useProjects', () => () => ({
  activeProject,
  activeId,
  renameProject,
  closeProject,
}));
mockNuxtImport('useProjectSettings', () => () => ({
  distanceUnit,
  precision,
}));

const UFormFieldStub = {
  template: '<div><slot /></div>',
};

const UInputStub = defineComponent({
  props: {
    modelValue: { type: [String, Number], default: '' },
  },
  emits: ['update:modelValue', 'blur', 'keydown'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue ?? '',
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
        onBlur: (event: FocusEvent) => emit('blur', event),
        onKeydown: (event: KeyboardEvent) => emit('keydown', event),
      });
  },
});

const USelectStub = defineComponent({
  props: {
    modelValue: { type: String, default: '' },
    items: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h(
        'select',
        {
          ...attrs,
          value: props.modelValue,
          onChange: (event: Event) =>
            emit(
              'update:modelValue',
              (event.target as HTMLSelectElement).value,
            ),
        },
        (props.items as Array<{ value: string; label: string }>).map((it) =>
          h('option', { value: it.value }, it.label),
        ),
      );
  },
});

const UButtonStub = {
  inheritAttrs: false,
  template: '<button type="button" v-bind="$attrs"><slot /></button>',
};

describe('SettingsTab', () => {
  beforeEach(() => {
    activeId.value = 'p1';
    activeProject.value = { name: 'Original' };
    distanceUnit.value = 'mm';
    renameProject.mockClear();
    closeProject.mockClear();
  });

  function getComponent() {
    return shallowMount(SettingsTab, {
      global: {
        stubs: {
          UInput: UInputStub,
          USelect: USelectStub,
          UFormField: UFormFieldStub,
          UButton: UButtonStub,
        },
      },
    });
  }

  function getButton(component: ReturnType<typeof getComponent>, text: string) {
    const button = component
      .findAll('button')
      .find((candidate) => candidate.text() === text);
    if (!button) throw new Error(`Missing button: ${text}`);
    return button;
  }

  describe('Rendering', () => {
    it('Should populate the project name input from the active project', () => {
      const component = getComponent();
      const input = component.get('input').element as HTMLInputElement;

      expect(input.value).toBe('Original');
    });
  });

  describe('Watchers', () => {
    it('Should update the input when the active project name changes', async () => {
      const component = getComponent();

      activeProject.value = { name: 'Renamed Externally' };
      await component.vm.$nextTick();

      expect((component.get('input').element as HTMLInputElement).value).toBe(
        'Renamed Externally',
      );
    });
  });

  describe('On rename blur', () => {
    it('Should call renameProject with the trimmed value', async () => {
      const component = getComponent();
      const input = component.get('input');

      await input.setValue('  Updated Name  ');
      await input.trigger('blur');

      expect(renameProject).toHaveBeenCalledWith('p1', 'Updated Name');
    });

    it('Should not call renameProject when the trimmed value is unchanged', async () => {
      const component = getComponent();
      const input = component.get('input');

      await input.setValue('Original');
      await input.trigger('blur');

      expect(renameProject).not.toHaveBeenCalled();
    });

    it('Should not call renameProject when the trimmed value is empty', async () => {
      const component = getComponent();
      const input = component.get('input');

      await input.setValue('   ');
      await input.trigger('blur');

      expect(renameProject).not.toHaveBeenCalled();
    });
  });

  describe('On rename Enter', () => {
    it('Should blur the input', async () => {
      const component = getComponent();
      const input = component.get('input');
      const blurSpy = vi.spyOn(input.element as HTMLInputElement, 'blur');

      await input.trigger('keydown.enter');

      expect(blurSpy).toHaveBeenCalled();
    });
  });

  describe('On delete', () => {
    it('Should reveal a confirm row', async () => {
      const component = getComponent();

      await getButton(component, 'Delete').trigger('click');

      expect(getButton(component, 'Cancel')).toBeDefined();
      expect(getButton(component, 'Confirm Delete')).toBeDefined();
    });

    it('Should hide the confirm row when Cancel is clicked', async () => {
      const component = getComponent();

      await getButton(component, 'Delete').trigger('click');
      await getButton(component, 'Cancel').trigger('click');

      expect(
        component.findAll('button').find((b) => b.text() === 'Confirm Delete'),
      ).toBeUndefined();
      expect(
        component.findAll('button').find((b) => b.text() === 'Delete'),
      ).toBeDefined();
    });

    it('Should call closeProject when Confirm Delete is clicked', async () => {
      const component = getComponent();

      await getButton(component, 'Delete').trigger('click');
      await getButton(component, 'Confirm Delete').trigger('click');

      expect(closeProject).toHaveBeenCalledWith('p1');
    });
  });
});
