// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { describe, expect, it, beforeEach } from 'vitest';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { DEFAULT_INCH_PRECISION, DEFAULT_MM_PRECISION } from 'cutlist';
import { computed } from 'vue';

import ManualPartRow from '../ManualPartRow.vue';

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

const UButtonStub = {
  template: '<button type="button" v-bind="$attrs"><slot /></button>',
};

const UInputStub = defineComponent({
  props: {
    modelValue: {
      type: [String, Number],
      default: '',
    },
    modelModifiers: {
      type: Object,
      default: () => ({}),
    },
  },
  emits: ['update:modelValue', 'keydown'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue ?? '',
        onInput: (event: Event) => {
          const raw = (event.target as HTMLInputElement).value;
          const value = props.modelModifiers.number ? Number(raw) : raw;
          emit('update:modelValue', value);
        },
        onKeydown: (event: KeyboardEvent) => emit('keydown', event),
      });
  },
});

describe('ManualPartRow', () => {
  function getComponent(
    props: Partial<InstanceType<typeof ManualPartRow>['$props']> = {},
  ) {
    return shallowMount(ManualPartRow, {
      props: {
        materials: ['Plywood', 'MDF'],
        ...props,
      },
      global: {
        stubs: {
          UButton: UButtonStub,
          UIcon: true,
          UInput: UInputStub,
        },
      },
    });
  }

  async function fillValidPart(component: ReturnType<typeof getComponent>) {
    await component.get('input[placeholder="Part name"]').setValue(' Shelf ');
    await component.get('#manual-part-width').setValue('100');
    await component.get('#manual-part-length').setValue('250');
    await component.get('#manual-part-thickness').setValue('18');
    await component.get('#manual-part-qty').setValue('2');
    await component.get('select[aria-label="Material"]').setValue('MDF');
  }

  function getButton(component: ReturnType<typeof getComponent>, text: string) {
    const button = component
      .findAll('button')
      .find((candidate) => candidate.text() === text);
    if (!button) throw new Error(`Missing button: ${text}`);
    return button;
  }

  describe('Rendering', () => {
    it('Should label add and edit modes', () => {
      expect(getComponent().get('[role="form"]').attributes('aria-label')).toBe(
        'Add part',
      );

      expect(
        getComponent({
          initial: {
            partNumber: 1,
            name: 'Shelf',
            widthMm: 100,
            lengthMm: 250,
            thicknessMm: 18,
            qty: 2,
            material: 'Plywood',
          },
        })
          .get('[role="form"]')
          .attributes('aria-label'),
      ).toBe('Edit part');
    });
  });

  describe('On save', () => {
    it('Should not emit save while required fields are invalid', async () => {
      const component = getComponent();

      await getButton(component, 'Add').trigger('click');

      expect(getButton(component, 'Add').attributes('disabled')).toBeDefined();
      expect(component.emitted('save')).toBeUndefined();
    });

    it('Should emit trimmed part data and reset add-mode fields', async () => {
      const component = getComponent();

      await fillValidPart(component);
      await getButton(component, 'Free').trigger('click');
      await getButton(component, 'Add').trigger('click');

      expect(component.emitted('save')).toEqual([
        [
          {
            name: 'Shelf',
            widthMm: 100,
            lengthMm: 250,
            thicknessMm: 18,
            qty: 2,
            material: 'MDF',
            grainLock: 'length',
          },
        ],
      ]);
      expect(
        (
          component.get('input[placeholder="Part name"]')
            .element as HTMLInputElement
        ).value,
      ).toBe('');
      expect(
        (component.get('#manual-part-qty').element as HTMLInputElement).value,
      ).toBe('1');
    });
  });

  describe('Imperial mode', () => {
    it('Should label inputs with the project distance unit', () => {
      distanceUnit.value = 'in';
      const component = getComponent();
      const labels = component
        .findAll('label')
        .map((l) => l.text())
        .filter((t) => /^[WLT] \(/.test(t));
      expect(labels).toEqual(['W (in)', 'L (in)', 'T (in)']);
    });

    it('Should parse fractions and emit mm equivalents', async () => {
      distanceUnit.value = 'in';
      const component = getComponent();

      await component.get('input[placeholder="Part name"]').setValue('Shelf');
      await component.get('#manual-part-width').setValue('3/4');
      await component.get('#manual-part-length').setValue('1 1/2');
      await component.get('#manual-part-thickness').setValue('1/4');
      await component.get('#manual-part-qty').setValue('1');
      await component.get('select[aria-label="Material"]').setValue('Plywood');
      await getButton(component, 'Add').trigger('click');

      const emitted = component.emitted('save');
      expect(emitted).toHaveLength(1);
      const data = emitted![0][0] as {
        widthMm: number;
        lengthMm: number;
        thicknessMm: number;
      };
      expect(data.widthMm).toBeCloseTo(0.75 * 25.4, 5);
      expect(data.lengthMm).toBeCloseTo(1.5 * 25.4, 5);
      expect(data.thicknessMm).toBeCloseTo(0.25 * 25.4, 5);
    });

    it('Should pre-fill edit values converted to inches', () => {
      distanceUnit.value = 'in';
      const component = getComponent({
        initial: {
          partNumber: 1,
          name: 'Shelf',
          widthMm: 25.4 * 0.75,
          lengthMm: 25.4 * 1.5,
          thicknessMm: 25.4 * 0.25,
          qty: 1,
          material: 'Plywood',
        },
      });
      expect(
        (component.get('#manual-part-width').element as HTMLInputElement).value,
      ).toBe('3/4');
      expect(
        (component.get('#manual-part-length').element as HTMLInputElement)
          .value,
      ).toBe('1 1/2');
      expect(
        (component.get('#manual-part-thickness').element as HTMLInputElement)
          .value,
      ).toBe('1/4');
    });

    it('Should reject invalid imperial input', async () => {
      distanceUnit.value = 'in';
      const component = getComponent();

      await component.get('input[placeholder="Part name"]').setValue('Shelf');
      await component.get('#manual-part-width').setValue('not-a-number');
      await component.get('#manual-part-length').setValue('1 1/2');
      await component.get('#manual-part-thickness').setValue('3/4');
      await component.get('select[aria-label="Material"]').setValue('Plywood');

      expect(getButton(component, 'Add').attributes('disabled')).toBeDefined();
    });
  });

  describe('On cancel', () => {
    it('Should emit cancel on escape or cancel click', async () => {
      const component = getComponent({
        initial: {
          partNumber: 1,
          name: 'Shelf',
          widthMm: 100,
          lengthMm: 250,
          thicknessMm: 18,
          qty: 2,
          material: 'Plywood',
        },
      });

      await component
        .get('input[placeholder="Part name"]')
        .trigger('keydown', { key: 'Escape' });
      await getButton(component, 'Cancel').trigger('click');

      expect(component.emitted('cancel')).toHaveLength(2);
    });
  });
});
