// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import NewProjectDialog from '../NewProjectDialog.vue';

const addProject = vi.fn().mockResolvedValue(undefined);
const toastAdd = vi.fn();

mockNuxtImport('useProjects', () => () => ({
  addProject,
}));
mockNuxtImport('useToast', () => () => ({ add: toastAdd }));

const UButtonStub = {
  inheritAttrs: false,
  template: '<button type="button" v-bind="$attrs"><slot /></button>',
};

const UModalStub = {
  props: {
    open: { type: Boolean, required: true },
  },
  emits: ['update:open'],
  template: `
    <section :data-open="String(open)">
      <slot name="content" />
    </section>
  `,
};

const UInputStub = defineComponent({
  props: {
    modelValue: { type: [String, Number], default: '' },
  },
  emits: ['update:modelValue', 'keydown'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue ?? '',
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
        onKeydown: (event: KeyboardEvent) => emit('keydown', event),
      });
  },
});

describe('NewProjectDialog', () => {
  function getComponent(props: { open?: boolean } = {}) {
    addProject.mockClear();
    addProject.mockResolvedValue(undefined);
    toastAdd.mockClear();
    return shallowMount(NewProjectDialog, {
      props: {
        open: true,
        ...props,
      },
      global: {
        stubs: {
          UButton: UButtonStub,
          UModal: UModalStub,
          UInput: UInputStub,
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
    it('Should disable Create until a non-empty trimmed name is entered', async () => {
      const component = getComponent();
      const create = getButton(component, 'Create');

      expect(create.attributes('disabled')).toBeDefined();

      await component.get('input').setValue('   ');
      expect(
        getButton(component, 'Create').attributes('disabled'),
      ).toBeDefined();

      await component.get('input').setValue('  Hello  ');
      expect(
        getButton(component, 'Create').attributes('disabled'),
      ).toBeUndefined();
    });
  });

  describe('On Enter', () => {
    it('Should create the project with the trimmed name', async () => {
      const component = getComponent();

      await component.get('input').setValue('  My Project  ');
      await component.get('input').trigger('keydown.enter');

      expect(addProject).toHaveBeenCalledWith('My Project');
    });

    it('Should not create when the name is whitespace', async () => {
      const component = getComponent();

      await component.get('input').setValue('   ');
      await component.get('input').trigger('keydown.enter');

      expect(addProject).not.toHaveBeenCalled();
    });
  });

  describe('On createProject', () => {
    it('Should close the modal when addProject resolves', async () => {
      const component = getComponent();

      await component.get('input').setValue('My Project');
      await getButton(component, 'Create').trigger('click');
      await nextTick();
      await nextTick();

      expect(addProject).toHaveBeenCalledWith('My Project');
      const events = component.emitted('update:open') ?? [];
      expect(events.at(-1)).toEqual([false]);
      expect(toastAdd).not.toHaveBeenCalled();
    });

    it('Should keep the modal open and toast an error when addProject rejects', async () => {
      addProject.mockRejectedValueOnce(new Error('quota exceeded'));
      const component = getComponent();

      await component.get('input').setValue('My Project');
      await getButton(component, 'Create').trigger('click');
      await nextTick();
      await nextTick();

      expect(addProject).toHaveBeenCalledWith('My Project');
      // Modal should NOT have been closed.
      const events = component.emitted('update:open') ?? [];
      expect(events).not.toContainEqual([false]);
      expect(toastAdd).toHaveBeenCalledTimes(1);
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Failed to create project',
          description: 'quota exceeded',
          color: 'error',
        }),
      );
    });
  });

  describe('On dismiss', () => {
    it('Should close via update:open when Cancel is clicked', async () => {
      const component = getComponent();

      await getButton(component, 'Cancel').trigger('click');

      expect(component.emitted('update:open')).toEqual([[false]]);
    });

    it('Should close via update:open when the icon X button is clicked', async () => {
      const component = getComponent();
      // The X button has no text content
      const buttons = component.findAll('button');
      const xButton = buttons.find(
        (b) => b.text() === '' && b.attributes('icon') === undefined,
      );
      // Fall back to the first empty-text button
      const target = xButton ?? buttons.find((b) => b.text() === '');
      expect(target).toBeDefined();

      await target!.trigger('click');

      expect(component.emitted('update:open')).toEqual([[false]]);
    });
  });

  describe('On open', () => {
    it('Should reset the project name input when re-opened', async () => {
      const component = getComponent({ open: false });

      // Open the dialog -> watcher resets name
      await component.setProps({ open: true });
      await nextTick();

      const input = component.get('input').element as HTMLInputElement;
      expect(input.value).toBe('');

      await component.get('input').setValue('Stale Name');
      // Close, reopen
      await component.setProps({ open: false });
      await component.setProps({ open: true });
      await nextTick();

      expect((component.get('input').element as HTMLInputElement).value).toBe(
        '',
      );
    });
  });
});
