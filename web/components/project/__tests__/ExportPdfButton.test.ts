// @vitest-environment nuxt
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import ExportPdfButton from '../ExportPdfButton.vue';

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
    <section :data-open="String(open)" :data-testid="'modal'">
      <slot name="content" />
    </section>
  `,
};

const UFormFieldStub = {
  template: '<div><slot /></div>',
};

const USelectStub = defineComponent({
  props: {
    modelValue: { type: [String, Number], default: '' },
    items: { type: Array, default: () => [] },
    valueKey: { type: String, default: undefined },
    labelKey: { type: String, default: undefined },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h(
        'select',
        {
          ...attrs,
          value: String(props.modelValue),
          onChange: (event: Event) => {
            const raw = (event.target as HTMLSelectElement).value;
            const item = (props.items as Array<Record<string, unknown>>).find(
              (it) => String(it[props.valueKey ?? 'value']) === raw,
            );
            const value = item ? item[props.valueKey ?? 'value'] : raw;
            emit('update:modelValue', value);
          },
        },
        (props.items as Array<Record<string, unknown>>).map((it) =>
          h(
            'option',
            { value: String(it[props.valueKey ?? 'value']) },
            String(it[props.labelKey ?? 'label']),
          ),
        ),
      );
  },
});

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

  describe('On trigger click', () => {
    it('Should open the modal', async () => {
      const component = getComponent();

      expect(getModal(component).attributes('data-open')).toBe('false');

      await getTriggerButton(component).trigger('click');

      expect(getModal(component).attributes('data-open')).toBe('true');
    });
  });

  describe('On Download', () => {
    it('Should call download with the selected scale', async () => {
      const component = getComponent();
      await getTriggerButton(component).trigger('click');

      await component.get('select').setValue('20');
      await getButton(component, 'Download').trigger('click');

      expect(download).toHaveBeenCalledWith(20);
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
