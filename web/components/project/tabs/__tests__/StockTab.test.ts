// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import YAML from 'js-yaml';
import { mount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import { STOCK_PRESETS } from '~/utils/settings';
import StockTab from '../StockTab.vue';

const stock = ref<string | undefined>(undefined);

mockNuxtImport('useProjectSettings', () => () => ({
  stock,
}));

const addMaterialSpy = vi.fn();
const scrollToBottomSpy = vi.fn();
const commitSpy = vi.fn(() => true);

const StockMatrixInputStub = defineComponent({
  props: {
    modelValue: { type: String, required: true },
  },
  emits: ['update:modelValue'],
  setup(_props, { expose }) {
    expose({
      addMaterial: addMaterialSpy,
      scrollToBottom: scrollToBottomSpy,
      commit: commitSpy,
    });
    return () => h('div', { 'data-testid': 'stock-matrix-input' });
  },
});

const UButtonStub = defineComponent({
  inheritAttrs: false,
  emits: ['click'],
  setup(_props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default ? slots.default() : undefined,
      );
  },
});

interface DropdownItem {
  label: string;
  onSelect: () => void;
}

const UDropdownMenuStub = defineComponent({
  props: {
    items: { type: Array as () => DropdownItem[], default: () => [] },
  },
  setup(props, { slots }) {
    return () =>
      h('div', [
        slots.default ? slots.default() : undefined,
        h(
          'ul',
          { 'data-testid': 'preset-items' },
          props.items.map((item) =>
            h(
              'li',
              {},
              h(
                'button',
                {
                  type: 'button',
                  'data-preset-label': item.label,
                  onClick: () => item.onSelect(),
                },
                item.label,
              ),
            ),
          ),
        ),
      ]);
  },
});

function getComponent() {
  return mount(StockTab, {
    global: {
      stubs: {
        UButton: UButtonStub,
        UIcon: true,
        UDropdownMenu: UDropdownMenuStub,
        StockMatrixInput: StockMatrixInputStub,
      },
    },
  });
}

function getButton(component: ReturnType<typeof getComponent>, text: string) {
  const button = component.findAll('button').find((b) => b.text() === text);
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}

describe('StockTab', () => {
  afterEach(() => {
    stock.value = undefined;
    addMaterialSpy.mockReset();
    scrollToBottomSpy.mockReset();
    commitSpy.mockReset();
    vi.restoreAllMocks();
  });

  describe('Add custom', () => {
    it('Should call addMaterial and scrollToBottom on the StockMatrixInput', async () => {
      stock.value = YAML.dump([STOCK_PRESETS[0].stock]);

      const component = getComponent();

      await getButton(component, 'Add custom').trigger('click');

      expect(addMaterialSpy).toHaveBeenCalledTimes(1);
      expect(scrollToBottomSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Add preset dropdown', () => {
    it('Should append the chosen preset to the YAML stock and call scrollToBottom', async () => {
      const initialStock = [STOCK_PRESETS[0].stock];
      stock.value = YAML.dump(initialStock);

      const component = getComponent();
      const presetButton = component
        .findAll('button')
        .find(
          (b) => b.attributes('data-preset-label') === STOCK_PRESETS[1].label,
        );
      expect(presetButton).toBeDefined();

      await presetButton!.trigger('click');

      expect(stock.value).toBeTypeOf('string');
      const parsed = YAML.load(stock.value!) as Array<{ material: string }>;
      expect(parsed).toHaveLength(2);
      expect(parsed[0].material).toBe(STOCK_PRESETS[0].stock.material);
      expect(parsed[1].material).toBe(STOCK_PRESETS[1].stock.material);
      expect(scrollToBottomSpy).toHaveBeenCalledTimes(1);
    });

    it('Should replace invalid YAML stock with a single-preset list (catch path)', async () => {
      stock.value = 'this: is: not: valid: yaml: [';

      const component = getComponent();
      const presetButton = component
        .findAll('button')
        .find(
          (b) => b.attributes('data-preset-label') === STOCK_PRESETS[0].label,
        );
      expect(presetButton).toBeDefined();

      await presetButton!.trigger('click');

      expect(stock.value).toBeTypeOf('string');
      const parsed = YAML.load(stock.value!) as Array<{ material: string }>;
      expect(parsed).toHaveLength(1);
      expect(parsed[0].material).toBe(STOCK_PRESETS[0].stock.material);
      expect(scrollToBottomSpy).toHaveBeenCalledTimes(1);
    });
  });
});
