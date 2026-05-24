// @vitest-environment nuxt
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref, computed } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import ExportLabelsButton from '../ExportLabelsButton.vue';
import {
  UButtonStub,
  UFormFieldStub,
  UModalStub,
  USelectStub,
} from '~/test-utils/stubs';

const downloadLabels = vi.fn().mockResolvedValue(undefined);
const isExportingLabels = ref(false);
const error = ref<string | undefined>(undefined);
const hasLayouts = ref(true);

mockNuxtImport('useExportPdf', () => () => ({
  downloadLabels,
  isExportingLabels,
  error,
  canExportLabels: computed(() => hasLayouts.value),
  labelsDisabledReason: computed(() =>
    hasLayouts.value ? undefined : 'Generate a layout first',
  ),
}));

describe('ExportLabelsButton', () => {
  beforeEach(() => {
    downloadLabels.mockClear();
    isExportingLabels.value = false;
    error.value = undefined;
    hasLayouts.value = true;
  });

  function getComponent() {
    return shallowMount(ExportLabelsButton, {
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

  function trigger(component: ReturnType<typeof getComponent>) {
    return component.get('button[aria-label="Export labels"]');
  }

  // FR-LBL-6: no layouts ⇒ disabled control + the reason is shown.
  it('disables the control and shows the reason when there are no layouts', () => {
    hasLayouts.value = false;
    const component = getComponent();

    expect(trigger(component).attributes('disabled')).toBeDefined();
    const reason = component.get('[data-testid="labels-disabled-reason"]');
    expect(reason.text()).toBe('Generate a layout first');
  });

  it('enables the control and hides the reason once a layout exists', () => {
    hasLayouts.value = true;
    const component = getComponent();

    expect(trigger(component).attributes('disabled')).toBeUndefined();
    expect(
      component.find('[data-testid="labels-disabled-reason"]').exists(),
    ).toBe(false);
  });

  it('downloads with the selected preset', async () => {
    const component = getComponent();
    await trigger(component).trigger('click');

    const download = component
      .findAll('button')
      .find((b) => b.text() === 'Download');
    if (!download) throw new Error('Missing Download button');
    await download.trigger('click');

    expect(downloadLabels).toHaveBeenCalledWith('avery-5160');
  });
});
