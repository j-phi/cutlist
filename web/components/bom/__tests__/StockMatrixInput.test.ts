// @vitest-environment nuxt
import { computed, defineComponent, ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import YAML from 'js-yaml';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { DEFAULT_INCH_PRECISION, DEFAULT_MM_PRECISION } from 'cutlist';

import StockMatrixInput from '../StockMatrixInput.vue';
import { UButtonStub, UInputStub, USelectStub } from '~/test-utils/stubs';

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
  return host.findComponent(StockMatrixInput);
}

type InnerVm = {
  newThickness: Record<string, string>;
  newSizeWidth: Record<number, string>;
  newSizeLength: Record<number, string>;
  addThickness: (m: number, s: number) => void;
  addSize: (i: number) => void;
  addMaterial: () => void;
  removeMaterial: (i: number) => void;
  commit: () => boolean;
  matrix: Array<{
    sizes: Array<{ width: number; length: number; thickness: number[] }>;
  }>;
};

function vmOf(host: ReturnType<typeof makeWrapper>): InnerVm {
  return getInner(host).vm as unknown as InnerVm;
}

describe('StockMatrixInput', () => {
  describe('Initialization', () => {
    it('Should parse the incoming YAML on mount and render a row per material', () => {
      const host = makeWrapper();

      expect(host.findAll('.color-picker')).toHaveLength(1);
      const named = host
        .findAll('input')
        .find((i) => (i.element as HTMLInputElement).value === 'Plywood');
      expect(named).toBeTruthy();
    });

    it('Should display an error message for invalid YAML', () => {
      const host = makeWrapper('foo: not-a-list');
      expect(host.text()).toMatch(/error|Error|expected|invalid/i);
    });
  });

  it('Should re-serialize through update:modelValue when addMaterial mutates the matrix', async () => {
    const host = makeWrapper();
    vmOf(host).addMaterial();
    await nextTick();

    const value = (host.vm as unknown as { value: string }).value;
    const parsed = YAML.load(value) as Array<{ material: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed[1].material).toBe('New Material');
  });

  describe('#addThickness', () => {
    it.each([
      { input: '0', label: 'zero' },
      { input: '-1', label: 'negative' },
      { input: 'abc', label: 'non-numeric' },
      { input: '', label: 'empty' },
    ])('Should reject $label values', ({ input }) => {
      const host = makeWrapper();
      const vm = vmOf(host);
      vm.newThickness['0-0'] = input;
      vm.addThickness(0, 0);
      expect(vm.matrix[0].sizes[0].thickness).toEqual([18]);
    });

    it('Should append a positive number and clear the input', () => {
      const host = makeWrapper();
      const vm = vmOf(host);
      vm.newThickness['0-0'] = '12';
      vm.addThickness(0, 0);

      expect(vm.matrix[0].sizes[0].thickness).toEqual([18, 12]);
      expect(vm.newThickness['0-0']).toBe('');
    });
  });

  describe('#addSize', () => {
    it.each([
      { width: '0', length: '100' },
      { width: '100', length: '0' },
      { width: '-5', length: '100' },
      { width: 'NaN', length: '100' },
    ])(
      'Should reject ($width, $length) — both must be > 0',
      ({ width, length }) => {
        const host = makeWrapper();
        const vm = vmOf(host);
        const before = vm.matrix[0].sizes.length;

        vm.newSizeWidth[0] = width;
        vm.newSizeLength[0] = length;
        vm.addSize(0);

        expect(vm.matrix[0].sizes.length).toBe(before);
      },
    );

    it('Should append a size when both inputs are positive numbers', () => {
      const host = makeWrapper();
      const vm = vmOf(host);
      vm.newSizeWidth[0] = '600';
      vm.newSizeLength[0] = '900';
      vm.addSize(0);

      expect(vm.matrix[0].sizes).toHaveLength(2);
      expect(vm.matrix[0].sizes[1]).toMatchObject({
        width: 600,
        length: 900,
        thickness: [],
      });
    });
  });

  it('Should splice the matrix at the given index on removeMaterial', () => {
    const host = makeWrapper();
    const vm = vmOf(host);
    vm.addMaterial();
    expect(vm.matrix).toHaveLength(2);
    vm.removeMaterial(0);
    expect(vm.matrix).toHaveLength(1);
  });

  describe('Project unit', () => {
    it('Should not render per-row unit selectors and should add new materials without a unit field (storage is mm)', () => {
      distanceUnit.value = 'in';
      const host = makeWrapper('[]');
      expect(host.findAll('select')).toHaveLength(0);

      vmOf(host).addMaterial();
      const value = (host.vm as unknown as { value: string }).value;
      const parsed = YAML.load(value) as Array<Record<string, unknown>>;
      expect('unit' in parsed[0]).toBe(false);
    });
  });

  describe('Imperial input (storage is mm)', () => {
    it('Should accept fractions for thickness and mixed-number sizes, all converted to mm at storage', () => {
      distanceUnit.value = 'in';
      const host = makeWrapper();
      const vm = vmOf(host);

      // 1/2" thickness → 12.7 mm.
      vm.newThickness['0-0'] = '1/2';
      vm.addThickness(0, 0);
      const t = vm.matrix[0].sizes[0].thickness;
      expect(t[t.length - 1]).toBeCloseTo(12.7, 5);

      // 1 1/2" wide × 4ft long → 38.1 mm × 1219.2 mm.
      vm.newSizeWidth[0] = '1 1/2';
      vm.newSizeLength[0] = '4ft';
      vm.addSize(0);
      const last = vm.matrix[0].sizes[vm.matrix[0].sizes.length - 1];
      expect(last.width).toBeCloseTo(38.1, 5);
      expect(last.length).toBeCloseTo(1219.2, 5);
    });
  });

  describe('#commit', () => {
    it('Should return true for a valid matrix and false when the reducer throws', () => {
      const host = makeWrapper();
      const vm = vmOf(host);
      expect(vm.commit()).toBe(true);

      reduceStockMatrixSpy.mockImplementationOnce(() => {
        throw new Error('matrix invalid');
      });
      expect(vm.commit()).toBe(false);
      reduceStockMatrixSpy.mockReset();
    });
  });
});
