// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import type { IdbBuildStep } from '~/composables/useIdb';
import InstructionsTab from '../InstructionsTab.vue';

interface ActiveProject {
  id: string;
  name: string;
}

const activeProject = ref<ActiveProject | null>(null);

const buildSteps = ref<IdbBuildStep[]>([]);
const addStep = vi.fn(async () => undefined as string | undefined);
const updateStep = vi.fn(
  async (_id: string, _patch: Partial<IdbBuildStep>) => {},
);
const removeStep = vi.fn(async (_id: string) => {});
const moveStep = vi.fn(async (_id: string, _dir: 'up' | 'down') => {});

mockNuxtImport('useProjects', () => () => ({
  activeProject,
}));

mockNuxtImport('useBuildSteps', () => () => ({
  buildSteps,
  addStep,
  updateStep,
  removeStep,
  moveStep,
}));

const UButtonStub = defineComponent({
  inheritAttrs: false,
  props: {
    label: { type: String, default: '' },
    icon: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
  },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          'data-icon': props.icon,
          disabled: props.disabled || undefined,
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default ? slots.default() : props.label || undefined,
      );
  },
});

const UInputStub = defineComponent({
  props: {
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});

const RichTextEditorStub = defineComponent({
  props: {
    modelValue: { type: String, default: '' },
    placeholder: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('textarea', {
        'data-testid': 'rich-editor',
        value: props.modelValue,
        placeholder: props.placeholder,
        onInput: (event: Event) =>
          emit(
            'update:modelValue',
            (event.target as HTMLTextAreaElement).value,
          ),
      });
  },
});

function makeStep(overrides: Partial<IdbBuildStep> = {}): IdbBuildStep {
  return {
    id: 'step-1',
    projectId: 'project-1',
    stepNumber: 1,
    title: '',
    description: '',
    createdAt: new Date('2026-01-01').toISOString(),
    ...overrides,
  };
}

function getComponent() {
  return shallowMount(InstructionsTab, {
    global: {
      stubs: {
        UButton: UButtonStub,
        UIcon: true,
        UInput: UInputStub,
        RichTextEditor: RichTextEditorStub,
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

describe('InstructionsTab', () => {
  afterEach(() => {
    activeProject.value = null;
    buildSteps.value = [];
    addStep.mockReset();
    updateStep.mockReset();
    removeStep.mockReset();
    moveStep.mockReset();
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('Should show the empty-project state when activeProject is null', () => {
      activeProject.value = null;
      buildSteps.value = [];

      const component = getComponent();

      expect(component.text()).toContain('Create a project to get started.');
      expect(
        component.findAll('button').find((b) => b.text() === 'Add Step'),
      ).toBeUndefined();
    });

    it('Should show the empty-steps state when there are no build steps', () => {
      activeProject.value = { id: 'p1', name: 'P1' };
      buildSteps.value = [];

      const component = getComponent();

      expect(component.text()).toContain('No steps yet');
      expect(getButton(component, 'Add First Step')).toBeDefined();
    });

    it('Should zero-pad step number labels', () => {
      activeProject.value = { id: 'p1', name: 'P1' };
      buildSteps.value = [
        makeStep({ id: 's1', stepNumber: 1, title: 'First' }),
        makeStep({ id: 's2', stepNumber: 2, title: 'Second' }),
      ];

      const component = getComponent();
      const text = component.text();

      expect(text).toContain('01');
      expect(text).toContain('02');
    });
  });

  describe('On Add Step click', () => {
    it('Should call addStep when the header Add Step button is clicked', async () => {
      activeProject.value = { id: 'p1', name: 'P1' };
      buildSteps.value = [makeStep({ id: 's1', stepNumber: 1, title: 'A' })];

      const component = getComponent();

      await getButton(component, 'Add Step').trigger('click');

      expect(addStep).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edit mode', () => {
    it('Should enter edit mode when the pencil action is clicked, rendering Save and Cancel', async () => {
      activeProject.value = { id: 'p1', name: 'P1' };
      buildSteps.value = [
        makeStep({ id: 's1', stepNumber: 1, title: 'Existing' }),
      ];

      const component = getComponent();
      const pencil = component
        .findAll('button')
        .find((b) => b.attributes('data-icon') === 'i-lucide-pencil');
      expect(pencil).toBeDefined();

      await pencil!.trigger('click');

      expect(getButton(component, 'Save')).toBeDefined();
      expect(getButton(component, 'Cancel')).toBeDefined();
    });

    it('Should call updateStep with the edited title and description when Save is clicked', async () => {
      activeProject.value = { id: 'p1', name: 'P1' };
      buildSteps.value = [
        makeStep({
          id: 's1',
          stepNumber: 1,
          title: 'Original',
          description: '<p>Old</p>',
        }),
      ];

      const component = getComponent();
      const pencil = component
        .findAll('button')
        .find((b) => b.attributes('data-icon') === 'i-lucide-pencil');
      await pencil!.trigger('click');

      const titleInput = component.get('input');
      await titleInput.setValue('New Title');

      const editor = component.get('[data-testid="rich-editor"]');
      await editor.setValue('<p>New body</p>');

      await getButton(component, 'Save').trigger('click');

      expect(updateStep).toHaveBeenCalledTimes(1);
      expect(updateStep).toHaveBeenCalledWith('s1', {
        title: 'New Title',
        description: '<p>New body</p>',
      });
    });

    it('Should leave the step unchanged when Cancel is clicked', async () => {
      activeProject.value = { id: 'p1', name: 'P1' };
      buildSteps.value = [
        makeStep({
          id: 's1',
          stepNumber: 1,
          title: 'Keep me',
          description: '<p>keep</p>',
        }),
      ];

      const component = getComponent();
      const pencil = component
        .findAll('button')
        .find((b) => b.attributes('data-icon') === 'i-lucide-pencil');
      await pencil!.trigger('click');

      await component.get('input').setValue('discarded');
      await getButton(component, 'Cancel').trigger('click');

      expect(updateStep).not.toHaveBeenCalled();
      // Edit UI is gone; original title is rendered again
      expect(
        component.findAll('button').find((b) => b.text() === 'Save'),
      ).toBeUndefined();
      expect(component.text()).toContain('Keep me');
    });
  });

  describe('Move chevrons', () => {
    it('Should disable the up chevron on step 1 and the down chevron on the last step', () => {
      activeProject.value = { id: 'p1', name: 'P1' };
      buildSteps.value = [
        makeStep({ id: 's1', stepNumber: 1, title: 'First' }),
        makeStep({ id: 's2', stepNumber: 2, title: 'Middle' }),
        makeStep({ id: 's3', stepNumber: 3, title: 'Last' }),
      ];

      const component = getComponent();

      const ups = component
        .findAll('button')
        .filter((b) => b.attributes('data-icon') === 'i-lucide-chevron-up');
      const downs = component
        .findAll('button')
        .filter((b) => b.attributes('data-icon') === 'i-lucide-chevron-down');

      expect(ups).toHaveLength(3);
      expect(downs).toHaveLength(3);

      // First step: up disabled, down enabled
      expect(ups[0].attributes('disabled')).toBeDefined();
      expect(downs[0].attributes('disabled')).toBeUndefined();

      // Middle step: both enabled
      expect(ups[1].attributes('disabled')).toBeUndefined();
      expect(downs[1].attributes('disabled')).toBeUndefined();

      // Last step: up enabled, down disabled
      expect(ups[2].attributes('disabled')).toBeUndefined();
      expect(downs[2].attributes('disabled')).toBeDefined();
    });
  });
});
