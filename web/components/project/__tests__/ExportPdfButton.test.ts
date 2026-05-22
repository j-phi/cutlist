// @vitest-environment nuxt
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import ExportPdfButton from '../ExportPdfButton.vue';
import {
  UButtonStub,
  UFormFieldStub,
  UModalStub,
  USelectStub,
} from '~/test-utils/stubs';

const download = vi.fn().mockResolvedValue(undefined);
const isExporting = ref(false);
const error = ref<string | undefined>(undefined);
const canExport = ref(true);
const isComputing = ref(false);

mockNuxtImport('useExportPdf', () => () => ({
  download,
  isExporting,
  error,
  canExport,
}));
mockNuxtImport('useBoardLayoutsQuery', () => () => ({ isComputing }));

describe('ExportPdfButton', () => {
  beforeEach(() => {
    download.mockClear();
    isExporting.value = false;
    error.value = undefined;
    canExport.value = true;
    isComputing.value = false;
  });

  function getComponent() {
    return shallowMount(ExportPdfButton, {
      global: {
        stubs: {
          UButton: UButtonStub,
          UModal: UModalStub,
          UFormField: UFormFieldStub,
          USelect: USelectStub,
        },
      },
    });
  }

  function getTriggerButton(component: ReturnType<typeof getComponent>) {
    return component.get('button[aria-label="Print"]');
  }

  function getModal(component: ReturnType<typeof getComponent>) {
    return component.get('[data-testid="modal"]');
  }

  function getButton(component: ReturnType<typeof getComponent>, text: string) {
    const button = component
      .findAll('button')
      .find((candidate) => candidate.text() === text);
    if (!button) throw new Error(`Missing button: ${text}`);
    return button;
  }

  describe('Rendering', () => {
    it('Should disable the trigger when canExport is false', () => {
      canExport.value = false;
      const component = getComponent();

      expect(getTriggerButton(component).attributes('disabled')).toBeDefined();
    });

    it('Should disable the trigger when layouts are computing', () => {
      isComputing.value = true;
      const component = getComponent();

      expect(getTriggerButton(component).attributes('disabled')).toBeDefined();
    });

    it('Should enable the trigger when ready', () => {
      const component = getComponent();

      expect(
        getTriggerButton(component).attributes('disabled'),
      ).toBeUndefined();
    });
  });

  describe('On Download', () => {
    it('Should call download with the selected scale', async () => {
      const component = getComponent();
      await getTriggerButton(component).trigger('click');

      await component.get('select').setValue('20');
      await getButton(component, 'Download').trigger('click');

      expect(download).toHaveBeenCalledWith(20, false);
    });

    it('Should close the modal on success', async () => {
      const component = getComponent();
      await getTriggerButton(component).trigger('click');
      expect(getModal(component).attributes('data-open')).toBe('true');

      await getButton(component, 'Download').trigger('click');
      // wait for the download promise + reactive update
      await component.vm.$nextTick();
      await component.vm.$nextTick();

      expect(getModal(component).attributes('data-open')).toBe('false');
    });

    it('Should keep the modal open when an error is set after download', async () => {
      download.mockImplementationOnce(async () => {
        error.value = 'Boom';
      });
      const component = getComponent();
      await getTriggerButton(component).trigger('click');

      await getButton(component, 'Download').trigger('click');
      await component.vm.$nextTick();
      await component.vm.$nextTick();

      expect(getModal(component).attributes('data-open')).toBe('true');
      expect(component.text()).toContain('Boom');
    });
  });
});
