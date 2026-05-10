// @vitest-environment nuxt
import { computed, defineComponent, h, ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import YAML from 'js-yaml';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { DEFAULT_INCH_PRECISION, DEFAULT_MM_PRECISION } from 'cutlist';

import StockMatrixInput from '../StockMatrixInput.vue';

const distanceUnit = ref<'mm' | 'in' | undefined>('mm');
const precision = computed(() =>
  distanceUnit.value === 'in' ? DEFAULT_INCH_PRECISION : DEFAULT_MM_PRECISION,
);
mockNuxtImport('useProjectSettings', () => () => ({
  distanceUnit,
  precision,
}));

beforeEach(() => {
  distanceUnit.value = 'mm';
});

// Spy hook for the #commit throw test: when this is set, reduceStockMatrix
// re-routes through the spy. Tests that don't set it use the real reducer.
const reduceStockMatrixSpy = vi.fn<(m: unknown) => unknown>();

vi.mock('cutlist', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    reduceStockMatrix: (m: unknown) => {
      if (reduceStockMatrixSpy.getMockImplementation()) {
        return reduceStockMatrixSpy(m);
      }
      return (actual.reduceStockMatrix as (m: unknown) => unknown)(m);
    },
  };
});

const UButtonStub = {
  inheritAttrs: false,
  template:
    '<button type="button" v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
};

const UInputStub = defineComponent({
  props: {
    modelValue: { type: [String, Number], default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue ?? '',
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});

const USelectStub = defineComponent({
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
        (props.items as Array<{ label: string; value: string }>).map((it) =>
          h('option', { value: it.value }, it.label),
        ),
      );
  },
});

const MaterialColorPickerStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  template: '<div class="color-picker" :data-color="modelValue" />',
});

const VALID_YAML = `- material: Plywood
  color: '#aabbcc'
  sizes:
    - width: 1220
      length: 2440
      thickness:
        - 18
`;

function makeWrapper(initial: string = VALID_YAML) {
  // Use a host so v-model works synchronously.
  const Host = defineComponent({
    components: { StockMatrixInput },
    setup() {
      const value = ref(initial);
      return { value };
    },
    template: '<StockMatrixInput v-model="value" />',
  });

  return mount(Host, {
    global: {
      stubs: {
        UButton: UButtonStub,
        UInput: UInputStub,
        USelect: USelectStub,
        UIcon: true,
        MaterialColorPicker: MaterialColorPickerStub,
      },
    },
  });
}

function getInner(host: ReturnType<typeof makeWrapper>) {
  // The first (and only) StockMatrixInput child component.
  return host.findComponent(StockMatrixInput);
}

describe('StockMatrixInput', () => {
  describe('Initialization', () => {
    it('Should parse the incoming YAML on mount and render a row per material', () => {
      const host = makeWrapper();

      expect(host.findAll('.color-picker')).toHaveLength(1);
      // Material name input has the "Plywood" value
      const inputs = host.findAll('input');
      const named = inputs.find(
        (i) => (i.element as HTMLInputElement).value === 'Plywood',
      );
      expect(named).toBeTruthy();
    });

    it('Should display an error message for invalid YAML', () => {
      // Top-level not an array -> Zod array parse fails.
      const host = makeWrapper('foo: not-a-list');
      expect(host.text()).toMatch(/error|Error|expected|invalid/i);
    });
  });

  describe('Watchers', () => {
    it('Should re-serialize through update:modelValue when addMaterial mutates the matrix', async () => {
      const host = makeWrapper();
      const inner = getInner(host);

      (inner.vm as unknown as { addMaterial: () => void }).addMaterial();
      await nextTick();

      const value = (host.vm as unknown as { value: string }).value;
      const parsed = YAML.load(value) as Array<{ material: string }>;
      expect(parsed).toHaveLength(2);
      expect(parsed[1].material).toBe('New Material');
    });
  });

  describe('#addThickness', () => {
    function call(
      inner: ReturnType<typeof getInner>,
      mat: number,
      size: number,
      raw: string | undefined,
    ) {
      const vm = inner.vm as unknown as {
        newThickness: Record<string, string>;
        addThickness: (m: number, s: number) => void;
        matrix: Array<{ sizes: Array<{ thickness: number[] }> }>;
      };
      const key = `${mat}-${size}`;
      if (raw !== undefined) vm.newThickness[key] = raw;
      vm.addThickness(mat, size);
      return vm.matrix[mat].sizes[size].thickness;
    }

    it('Should reject non-positive or non-finite values', () => {
      const host = makeWrapper();
      const inner = getInner(host);

      expect(call(inner, 0, 0, '0')).toEqual([18]);
      expect(call(inner, 0, 0, '-1')).toEqual([18]);
      expect(call(inner, 0, 0, 'abc')).toEqual([18]);
      expect(call(inner, 0, 0, '')).toEqual([18]);
    });

    it('Should append a positive number and clear the input', async () => {
      const host = makeWrapper();
      const inner = getInner(host);
      const vm = inner.vm as unknown as {
        newThickness: Record<string, string>;
      };

      expect(call(inner, 0, 0, '12')).toEqual([18, 12]);
      expect(vm.newThickness['0-0']).toBe('');
    });
  });

  describe('#addSize', () => {
    function call(
      inner: ReturnType<typeof getInner>,
      matIndex: number,
      width: string,
      length: string,
    ) {
      const vm = inner.vm as unknown as {
        newSizeWidth: Record<number, string>;
        newSizeLength: Record<number, string>;
        addSize: (i: number) => void;
        matrix: Array<{ sizes: unknown[] }>;
      };
      vm.newSizeWidth[matIndex] = width;
      vm.newSizeLength[matIndex] = length;
      vm.addSize(matIndex);
      return vm.matrix[matIndex].sizes;
    }

    it('Should require both width and length to be > 0', () => {
      const host = makeWrapper();
      const inner = getInner(host);

      const before = call(inner, 0, '', '');
      const beforeLen = before.length;

      expect(call(inner, 0, '0', '100').length).toBe(beforeLen);
      expect(call(inner, 0, '100', '0').length).toBe(beforeLen);
      expect(call(inner, 0, '-5', '100').length).toBe(beforeLen);
      expect(call(inner, 0, 'NaN', '100').length).toBe(beforeLen);
    });

    it('Should append a size when both inputs are positive numbers', () => {
      const host = makeWrapper();
      const inner = getInner(host);

      const sizes = call(inner, 0, '600', '900');
      expect(sizes).toHaveLength(2);
      expect(sizes[1]).toMatchObject({
        width: 600,
        length: 900,
        thickness: [],
      });
    });
  });

  describe('#removeMaterial', () => {
    it('Should splice the matrix at the given index', () => {
      const host = makeWrapper();
      const inner = getInner(host);
      const vm = inner.vm as unknown as {
        addMaterial: () => void;
        removeMaterial: (i: number) => void;
        matrix: Array<unknown>;
      };

      vm.addMaterial();
      expect(vm.matrix).toHaveLength(2);
      vm.removeMaterial(0);
      expect(vm.matrix).toHaveLength(1);
    });
  });

  describe('Project unit', () => {
    it('Should not render the per-row unit selector', () => {
      const host = makeWrapper();
      expect(host.findAll('select')).toHaveLength(0);
    });

    it('Should add new materials without a unit field (storage is mm)', () => {
      distanceUnit.value = 'in';
      const host = makeWrapper('[]');
      const inner = getInner(host);
      (inner.vm as unknown as { addMaterial: () => void }).addMaterial();
      const value = (host.vm as unknown as { value: string }).value;
      const parsed = YAML.load(value) as Array<Record<string, unknown>>;
      expect('unit' in parsed[0]).toBe(false);
    });
  });

  describe('Imperial input (storage is mm)', () => {
    it('Should accept fractions for thickness and store mm', () => {
      distanceUnit.value = 'in';
      const host = makeWrapper();
      const inner = getInner(host);
      const vm = inner.vm as unknown as {
        newThickness: Record<string, string>;
        addThickness: (m: number, s: number) => void;
        matrix: Array<{ sizes: Array<{ thickness: number[] }> }>;
      };
      vm.newThickness['0-0'] = '1/2';
      vm.addThickness(0, 0);
      const t = vm.matrix[0].sizes[0].thickness;
      // 1/2 in = 12.7 mm
      expect(t[t.length - 1]).toBeCloseTo(12.7, 5);
    });

    it('Should accept mixed-number sizes and convert to mm', () => {
      distanceUnit.value = 'in';
      const host = makeWrapper();
      const inner = getInner(host);
      const vm = inner.vm as unknown as {
        newSizeWidth: Record<number, string>;
        newSizeLength: Record<number, string>;
        addSize: (i: number) => void;
        matrix: Array<{
          sizes: Array<{ width: number; length: number; thickness: number[] }>;
        }>;
      };
      vm.newSizeWidth[0] = '1 1/2';
      vm.newSizeLength[0] = '4ft';
      vm.addSize(0);
      const last = vm.matrix[0].sizes[vm.matrix[0].sizes.length - 1];
      expect(last.width).toBeCloseTo(38.1, 5); // 1.5 in
      expect(last.length).toBeCloseTo(1219.2, 5); // 48 in
    });
  });

  describe('#commit', () => {
    it('Should return true and clear errors for a valid matrix', () => {
      const host = makeWrapper();
      const inner = getInner(host);
      const vm = inner.vm as unknown as {
        commit: () => boolean;
        err: { value?: unknown };
      };

      expect(vm.commit()).toBe(true);
    });

    it('Should return false when reduceStockMatrix throws', () => {
      const host = makeWrapper();
      const inner = getInner(host);
      const vm = inner.vm as unknown as { commit: () => boolean };

      reduceStockMatrixSpy.mockImplementationOnce(() => {
        throw new Error('matrix invalid');
      });

      expect(vm.commit()).toBe(false);

      reduceStockMatrixSpy.mockReset();
    });
  });
});

// TODO(test): scrollToBottom — exercises raw DOM scrollTo, not behavioral.
// TODO(test): incoming v-model change while typing — covered indirectly by mount-time parse.
// TODO(test): UI keydown.enter on size/thickness inputs — wiring is one-line @keydown.enter.
