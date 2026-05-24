// @vitest-environment nuxt
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import OptimizationSettingsPopover from '../OptimizationSettingsPopover.vue';

// ── useProjectSettings mock (for defaultAlgorithm) ───────────────────────────
const defaultAlgorithm = ref<string | undefined>('auto');
const optimizationObjective = ref<string | undefined>('boards');
const stocks = ref<unknown[]>([]);

mockNuxtImport('useProjectSettings', () => () => ({
  defaultAlgorithm,
  optimizationObjective,
  stocks,
  bladeWidth: ref(undefined),
  distanceUnit: ref('mm'),
  margin: ref(undefined),
  showPartNumbers: ref(true),
  showBomName: ref(true),
  isLoading: ref(false),
  precision: ref({ kind: 'decimal', step: 0.1 }),
}));

// ── useOptimizationSettings mock ─────────────────────────────────────────────
// We import the real composable via mock to control its state
const DEFAULT_PASS_ORDER = [
  'tidy-rip-long-side',
  'tidy-rip-area',
  'tidy-crosscut-long-side',
  'compact-bssf-long-side',
  'compact-bssf-area',
  'cnc-area',
  'cnc-perimeter',
  'cnc-random',
];

const passOrder = ref([...DEFAULT_PASS_ORDER]);
const enabledPasses = ref(new Set(DEFAULT_PASS_ORDER));
const panelOrder = ref<'board' | 'fullest'>('board');
const resetToDefaults = vi.fn(() => {
  passOrder.value = [...DEFAULT_PASS_ORDER];
  enabledPasses.value = new Set(DEFAULT_PASS_ORDER);
});
const togglePass = vi.fn((passId: string) => {
  const next = new Set(enabledPasses.value);
  if (next.has(passId)) {
    if (next.size <= 1) return;
    next.delete(passId);
  } else {
    next.add(passId);
  }
  enabledPasses.value = next;
});
const reorderPass = vi.fn();

mockNuxtImport('useOptimizationSettings', () => () => ({
  passOrder,
  enabledPasses,
  panelOrder,
  resetToDefaults,
  togglePass,
  reorderPass,
  PASS_LABELS: {},
  DEFAULT_PASS_ORDER,
}));

describe('OptimizationSettingsPopover', () => {
  beforeEach(() => {
    passOrder.value = [...DEFAULT_PASS_ORDER];
    enabledPasses.value = new Set(DEFAULT_PASS_ORDER);
    resetToDefaults.mockClear();
    togglePass.mockClear();
    reorderPass.mockClear();
    defaultAlgorithm.value = 'auto';
    panelOrder.value = 'board';
    optimizationObjective.value = 'boards';
    stocks.value = [];
  });

  function getComponent() {
    return shallowMount(OptimizationSettingsPopover, {
      global: {
        stubs: {
          UButton: {
            name: 'UButton',
            props: ['disabled', 'loading', 'icon', 'color', 'variant', 'size'],
            emits: ['click'],
            template:
              '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
          },
          USelect: {
            name: 'USelect',
            props: ['modelValue', 'items'],
            emits: ['update:modelValue'],
            template:
              '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="typeof item === \'string\' ? item : item.value" :value="typeof item === \'string\' ? item : item.value">{{ typeof item === \'string\' ? item : item.label }}</option></select>',
          },
          URadioGroup: {
            name: 'URadioGroup',
            props: ['modelValue', 'items'],
            emits: ['update:modelValue'],
            template:
              '<div role="radiogroup"><label v-for="item in items" :key="item.value" :data-testid="`objective-${item.value}`"><input type="radio" :value="item.value" :checked="modelValue === item.value" :disabled="item.disabled" @change="$emit(\'update:modelValue\', item.value)" />{{ item.label }}</label></div>',
          },
        },
      },
    });
  }

  it('renders all pass rows', () => {
    const wrapper = getComponent();
    const rows = wrapper.findAll('[data-testid^="pass-row-"]');
    expect(rows).toHaveLength(DEFAULT_PASS_ORDER.length);
  });

  it('emits close when the X button is clicked', async () => {
    const wrapper = getComponent();
    await wrapper.find('[data-testid="btn-close"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('disabling a pass removes it from enabledPasses', async () => {
    const wrapper = getComponent();
    // Toggle off the first pass
    const firstToggle = wrapper.find(
      `[data-testid="pass-toggle-${DEFAULT_PASS_ORDER[0]}"]`,
    );
    await firstToggle.trigger('change');
    expect(enabledPasses.value.has(DEFAULT_PASS_ORDER[0])).toBe(false);
  });

  it('disables the last remaining toggle so the set cannot be emptied', async () => {
    // Enable only one pass
    enabledPasses.value = new Set(['tidy-rip-long-side']);
    const wrapper = getComponent();
    const lastToggle = wrapper.find(
      '[data-testid="pass-toggle-tidy-rip-long-side"]',
    );
    expect(lastToggle.attributes('disabled')).toBeDefined();
  });

  it('reorders passes via drag-and-drop: calls reorderPass with correct from/to indices', async () => {
    const wrapper = getComponent();
    const rows = wrapper.findAll('[data-testid^="pass-row-"]');

    // Drag row 0 to row 2
    await rows[0].trigger('dragstart', { dataTransfer: { setData: () => {} } });
    await rows[2].trigger('dragover', { preventDefault: () => {} });

    // reorderPass should have been called with (0, 2)
    expect(reorderPass).toHaveBeenCalledWith(0, 2);
  });

  it('updates panelOrder when the Panel order select changes', async () => {
    const wrapper = getComponent();
    // Two USelects render: [0] default algorithm, [1] panel order.
    const selects = wrapper.findAll('select');
    expect(selects).toHaveLength(2);
    await selects[1].setValue('fullest');
    expect(panelOrder.value).toBe('fullest');
  });

  it('calls resetToDefaults when the Reset button is clicked', async () => {
    const wrapper = getComponent();
    await wrapper.find('[data-testid="btn-reset"]').trigger('click');
    expect(resetToDefaults).toHaveBeenCalledTimes(1);
  });

  it('re-enables all passes after reset', async () => {
    // Disable a few passes first
    enabledPasses.value = new Set(['tidy-rip-long-side', 'cnc-area']);
    const wrapper = getComponent();
    await wrapper.find('[data-testid="btn-reset"]').trigger('click');
    // resetToDefaults mock restores enabledPasses
    expect(enabledPasses.value.size).toBe(DEFAULT_PASS_ORDER.length);
  });

  describe('Optimize for (F11)', () => {
    it('disables the cost option with a visible reason when no stock is priced', () => {
      stocks.value = [
        { kind: 'sheet', material: 'MDF', sizes: [{ width: 1, length: 1 }] },
      ];
      const wrapper = getComponent();
      const costRadio = wrapper.find('[data-testid="objective-cost"] input');
      expect(costRadio.attributes('disabled')).toBeDefined();
      expect(
        wrapper.find('[data-testid="cost-disabled-reason"]').exists(),
      ).toBe(true);
    });

    it('enables the cost option once a stock size carries a positive price', () => {
      stocks.value = [
        {
          kind: 'sheet',
          material: 'MDF',
          sizes: [{ width: 1, length: 1, cost: 42 }],
        },
      ];
      const wrapper = getComponent();
      const costRadio = wrapper.find('[data-testid="objective-cost"] input');
      expect(costRadio.attributes('disabled')).toBeUndefined();
      expect(
        wrapper.find('[data-testid="cost-disabled-reason"]').exists(),
      ).toBe(false);
    });

    it('writes the chosen objective back to settings', async () => {
      stocks.value = [
        {
          kind: 'linear',
          material: 'Pine',
          size: {
            crossSectionWidth: 1,
            crossSectionThickness: 1,
            lengths: [1],
            cost: 5,
          },
        },
      ];
      const wrapper = getComponent();
      await wrapper
        .find('[data-testid="objective-cost"] input')
        .trigger('change');
      expect(optimizationObjective.value).toBe('cost');
    });
  });
});
