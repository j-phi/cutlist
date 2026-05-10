// @vitest-environment nuxt
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { DEFAULT_MM_PRECISION } from 'cutlist';

import SettingsTab from '../SettingsTab.vue';
import {
  UButtonStub,
  UFormFieldStub,
  UInputStub,
  USelectStub,
} from '~/test-utils/stubs';

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

  it('Should populate the project name input from the active project and update on watcher fire', async () => {
    const component = getComponent();
    expect((component.get('input').element as HTMLInputElement).value).toBe(
      'Original',
    );

    activeProject.value = { name: 'Renamed Externally' };
    await component.vm.$nextTick();

    expect((component.get('input').element as HTMLInputElement).value).toBe(
      'Renamed Externally',
    );
  });

  describe('On rename blur', () => {
    it.each([
      {
        scenario: 'trims and renames when value differs',
        input: '  Updated Name  ',
        expected: ['p1', 'Updated Name'] as const,
      },
      {
        scenario: 'skips when trimmed value matches the original',
        input: 'Original',
        expected: null,
      },
      {
        scenario: 'skips when trimmed value is empty',
        input: '   ',
        expected: null,
      },
    ])('$scenario', async ({ input, expected }) => {
      const component = getComponent();
      const inputEl = component.get('input');

      await inputEl.setValue(input);
      await inputEl.trigger('blur');

      if (expected) {
        expect(renameProject).toHaveBeenCalledWith(...expected);
      } else {
        expect(renameProject).not.toHaveBeenCalled();
      }
    });

    it('Should blur the input on Enter (commits via the blur listener)', async () => {
      const component = getComponent();
      const inputEl = component.get('input');
      const blurSpy = vi.spyOn(inputEl.element as HTMLInputElement, 'blur');

      await inputEl.trigger('keydown.enter');
      expect(blurSpy).toHaveBeenCalled();
    });
  });

  describe('On delete', () => {
    it('Should reveal the confirm row, hide it on cancel, and call closeProject on confirm', async () => {
      const component = getComponent();

      // Reveal.
      await getButton(component, 'Delete').trigger('click');
      expect(getButton(component, 'Cancel')).toBeDefined();
      expect(getButton(component, 'Confirm Delete')).toBeDefined();

      // Cancel hides without firing.
      await getButton(component, 'Cancel').trigger('click');
      expect(
        component.findAll('button').find((b) => b.text() === 'Confirm Delete'),
      ).toBeUndefined();
      expect(closeProject).not.toHaveBeenCalled();

      // Re-open and confirm.
      await getButton(component, 'Delete').trigger('click');
      await getButton(component, 'Confirm Delete').trigger('click');
      expect(closeProject).toHaveBeenCalledWith('p1');
    });
  });
});
