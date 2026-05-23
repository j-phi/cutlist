// @vitest-environment nuxt
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  DEFAULT_INCH_PRECISION,
  DEFAULT_MM_PRECISION,
  mmToUm,
  type Algorithm,
  type Micrometres,
} from 'cutlist';
import { computed, defineComponent, h, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import PreviewToolbar from '../PreviewToolbar.vue';

// ── useProjectSettings mock ──────────────────────────────────────────────────
const bladeWidth = ref<Micrometres | undefined>(mmToUm(3));
const distanceUnit = ref<'mm' | 'in' | undefined>('mm');
const margin = ref<Micrometres | undefined>(mmToUm(0));
const defaultAlgorithm = ref<Algorithm | undefined>('auto');
const showPartNumbers = ref<boolean | undefined>(true);
const showBomName = ref<boolean | undefined>(true);
const isLoading = ref(false);
const stocks = ref<Array<{ kind: 'sheet' | 'linear' }>>([{ kind: 'sheet' }]);
const layoutAlignH = ref<'left' | 'right' | undefined>('left');
const layoutAlignV = ref<'top' | 'bottom' | undefined>('bottom');
const precision = computed(() =>
  distanceUnit.value === 'in' ? DEFAULT_INCH_PRECISION : DEFAULT_MM_PRECISION,
);

mockNuxtImport('useProjectSettings', () => () => ({
  bladeWidth,
  distanceUnit,
  margin,
  defaultAlgorithm,
  showPartNumbers,
  showBomName,
  isLoading,
  precision,
  stocks,
  layoutAlignH,
  layoutAlignV,
}));

// ── useBoardLayoutsQuery mock ────────────────────────────────────────────────
const isComputing = ref(false);
const captureAndRecompute = vi.fn();

mockNuxtImport('useBoardLayoutsQuery', () => () => ({
  isComputing,
  captureAndRecompute,
  data: ref(undefined),
  error: ref(null),
  partCountWarning: ref(null),
}));

// ── useManualLayout mock ─────────────────────────────────────────────────────
const manualMode = ref(false);
const snapping = ref(true);
const pushOptimizeEntry = vi.fn();

mockNuxtImport('useManualLayout', () => () => ({
  manualMode,
  snapping,
  isDragging: ref(false),
  overrides: ref([]),
  movePart: vi.fn(),
  pushOptimizeEntry,
  resetOverrides: vi.fn(),
  applyOverrides: vi.fn(),
}));

// ── Stubs ────────────────────────────────────────────────────────────────────
const UInputStub = defineComponent({
  name: 'UInputStub',
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue', 'blur'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        type: 'text',
        ...attrs,
        value: props.modelValue ?? '',
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
        onBlur: (event: FocusEvent) => emit('blur', event),
      });
  },
});

const USelectStub = defineComponent({
  name: 'USelectStub',
  props: {
    modelValue: { type: [String, Number], default: '' },
    items: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h(
        'select',
        {
          ...attrs,
          value: String(props.modelValue),
          onChange: (event: Event) =>
            emit(
              'update:modelValue',
              (event.target as HTMLSelectElement).value,
            ),
        },
        (props.items as Array<string | { label: string; value: string }>).map(
          (it) => {
            const value = typeof it === 'string' ? it : it.value;
            const label = typeof it === 'string' ? it : it.label;
            return h('option', { value }, label);
          },
        ),
      );
  },
});

const USwitchStub = defineComponent({
  name: 'USwitchStub',
  props: {
    modelValue: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        type: 'checkbox',
        role: 'switch',
        ...attrs,
        checked: props.modelValue,
        disabled: props.disabled || undefined,
        onChange: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).checked),
      });
  },
});

const UButtonStub = defineComponent({
  name: 'UButtonStub',
  props: {
    loading: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  emits: ['click'],
  setup(props, { attrs, slots, emit }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          ...attrs,
          disabled: props.disabled || props.loading || undefined,
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default?.(),
      );
  },
});

describe('PreviewToolbar', () => {
  beforeEach(() => {
    bladeWidth.value = mmToUm(3);
    distanceUnit.value = 'mm';
    margin.value = mmToUm(0);
    defaultAlgorithm.value = 'auto';
    showPartNumbers.value = true;
    showBomName.value = true;
    isLoading.value = false;
    isComputing.value = false;
    manualMode.value = false;
    snapping.value = true;
    stocks.value = [{ kind: 'sheet' }];
    layoutAlignH.value = 'left';
    layoutAlignV.value = 'bottom';
    captureAndRecompute.mockClear();
    pushOptimizeEntry.mockClear();
  });

  function getComponent() {
    return shallowMount(PreviewToolbar, {
      global: {
        stubs: {
          UInput: UInputStub,
          USelect: USelectStub,
          USwitch: USwitchStub,
          UButton: UButtonStub,
          OptimizationSettingsPopover: true,
        },
      },
    });
  }

  describe('Rendering', () => {
    it('renders nothing while settings are loading', () => {
      isLoading.value = true;
      const wrapper = getComponent();

      expect(wrapper.find('[data-testid="btn-optimize"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="toggle-part-numbers"]').exists()).toBe(
        false,
      );
    });

    it('renders the Optimize button', () => {
      const wrapper = getComponent();
      expect(wrapper.find('[data-testid="btn-optimize"]').exists()).toBe(true);
    });

    it('renders the gear settings button', () => {
      const wrapper = getComponent();
      expect(wrapper.find('[data-testid="btn-settings-gear"]').exists()).toBe(
        true,
      );
    });

    it('renders the Part #s toggle', () => {
      const wrapper = getComponent();
      expect(wrapper.find('[data-testid="toggle-part-numbers"]').exists()).toBe(
        true,
      );
    });

    it('renders the Part names toggle', () => {
      const wrapper = getComponent();
      expect(wrapper.find('[data-testid="toggle-part-names"]').exists()).toBe(
        true,
      );
    });

    it('renders the Manual placement toggle', () => {
      const wrapper = getComponent();
      expect(
        wrapper.find('[data-testid="toggle-manual-placement"]').exists(),
      ).toBe(true);
    });

    it('renders the Snapping toggle', () => {
      const wrapper = getComponent();
      expect(wrapper.find('[data-testid="toggle-snapping"]').exists()).toBe(
        true,
      );
    });

    it('renders two text inputs (blade + margin)', () => {
      const wrapper = getComponent();
      expect(wrapper.findAll('input[type="text"]')).toHaveLength(2);
    });
  });

  describe('Snapping toggle disabled state', () => {
    it('disables the Snapping toggle when manualMode is false', async () => {
      manualMode.value = false;
      const wrapper = getComponent();
      const toggle = wrapper.find('[data-testid="toggle-snapping"]');
      expect(toggle.attributes('disabled')).toBeDefined();
    });

    it('enables the Snapping toggle when manualMode is true', async () => {
      manualMode.value = true;
      const wrapper = getComponent();
      const toggle = wrapper.find('[data-testid="toggle-snapping"]');
      expect(toggle.attributes('disabled')).toBeUndefined();
    });
  });

  describe('Optimize button', () => {
    it('calls captureAndRecompute with pushOptimizeEntry when clicked', async () => {
      const wrapper = getComponent();
      await wrapper.find('[data-testid="btn-optimize"]').trigger('click');
      expect(captureAndRecompute).toHaveBeenCalledTimes(1);
      expect(captureAndRecompute).toHaveBeenCalledWith(pushOptimizeEntry);
    });

    it('passes loading state to the optimize button when isComputing', () => {
      isComputing.value = true;
      const wrapper = getComponent();
      const btn = wrapper.find('[data-testid="btn-optimize"]');
      // UButtonStub disables when loading
      expect(btn.attributes('disabled')).toBeDefined();
    });
  });

  describe('Gear button — settings popover', () => {
    it('does not mount OptimizationSettingsPopover initially', () => {
      const wrapper = getComponent();
      // The stub renders as <optimizationsettingspopover-stub> or similar
      expect(
        wrapper.findComponent({ name: 'OptimizationSettingsPopover' }).exists(),
      ).toBe(false);
    });

    it('mounts OptimizationSettingsPopover after gear button click', async () => {
      const wrapper = getComponent();
      await wrapper.find('[data-testid="btn-settings-gear"]').trigger('click');
      expect(
        wrapper.findComponent({ name: 'OptimizationSettingsPopover' }).exists(),
      ).toBe(true);
    });

    it('closes OptimizationSettingsPopover on close event', async () => {
      const wrapper = getComponent();
      await wrapper.find('[data-testid="btn-settings-gear"]').trigger('click');
      // The stub is mounted; emit close
      const popover = wrapper.findComponent({
        name: 'OptimizationSettingsPopover',
      });
      expect(popover.exists()).toBe(true);
      await popover.vm.$emit('close');
      await wrapper.vm.$nextTick();
      expect(
        wrapper.findComponent({ name: 'OptimizationSettingsPopover' }).exists(),
      ).toBe(false);
    });
  });

  describe('Alignment controls', () => {
    it('hides both alignment controls when the only stock is linear (FR-ALN-7)', () => {
      stocks.value = [{ kind: 'linear' }];
      const wrapper = getComponent();
      expect(wrapper.find('[data-testid="align-controls"]').exists()).toBe(
        false,
      );
    });

    it('shows alignment controls when at least one stock is a sheet', () => {
      stocks.value = [{ kind: 'linear' }, { kind: 'sheet' }];
      const wrapper = getComponent();
      expect(wrapper.find('[data-testid="align-controls"]').exists()).toBe(
        true,
      );
    });

    it('drives layoutAlignH to "right" when the right control is clicked', async () => {
      layoutAlignH.value = 'left';
      const wrapper = getComponent();
      await wrapper.find('[data-testid="align-right"]').trigger('click');
      expect(layoutAlignH.value).toBe('right');
    });

    it('drives layoutAlignV to "top" when the top control is clicked', async () => {
      layoutAlignV.value = 'bottom';
      const wrapper = getComponent();
      await wrapper.find('[data-testid="align-top"]').trigger('click');
      expect(layoutAlignV.value).toBe('top');
    });
  });

  describe('v-model bindings', () => {
    it('writes bladeWidth back in µm when typed in mm mode', async () => {
      bladeWidth.value = mmToUm(3);
      distanceUnit.value = 'mm';
      const wrapper = getComponent();
      const inputs = wrapper.findAll('input[type="text"]');

      await inputs[0].setValue('5');

      expect(bladeWidth.value).toBe(mmToUm(5));
    });

    it('writes margin back in µm when typed in mm mode', async () => {
      margin.value = mmToUm(0);
      distanceUnit.value = 'mm';
      const wrapper = getComponent();
      const inputs = wrapper.findAll('input[type="text"]');

      await inputs[1].setValue('2');

      expect(margin.value).toBe(mmToUm(2));
    });

    it('writes back to showPartNumbers when the Part #s toggle changes', async () => {
      showPartNumbers.value = true;
      const wrapper = getComponent();
      const toggle = wrapper.find('[data-testid="toggle-part-numbers"]');

      await toggle.setValue(false);

      expect(showPartNumbers.value).toBe(false);
    });
  });
});
