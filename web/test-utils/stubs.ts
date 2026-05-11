/**
 * Shared component stubs for Nuxt UI primitives.
 *
 * Use these when a component test needs to interact with the underlying form
 * element (typing, clicking, selecting), not just verify presence. They render
 * real `<button>` / `<input>` / `<select>` so wrapper queries via role / text /
 * `setValue` / `trigger('click')` work the same as against the real component.
 *
 * Pick the right level of stubbing:
 *   - `stubs: { UButton: true }` — when the test only cares "is a button rendered
 *     somewhere?" and never clicks it. Cheapest, no drift surface.
 *   - These named stubs — when the test types into an input, clicks a button,
 *     selects an option, or asserts `wrapper.emitted('update:modelValue')`.
 *   - The real component (no stub) — when the test depends on Nuxt UI's own
 *     event modifiers, slots beyond `default`/`content`, or anchored popups.
 *     Slowest; usually overkill for behaviour tests.
 *
 * Each stub mirrors only the surface we actually exercise across the suite.
 * Add a prop / emit only when a real test needs it — anticipating Nuxt UI
 * surface here is what got us into the drift mess in the first place.
 */

import { defineComponent, h } from 'vue';

/**
 * UButton — renders a `<button>` so DOM clicks fire the parent's listener
 * exactly once via inherited attrs. Slot text is preserved so trigger-label
 * assertions (`text() === 'Save'`) work.
 */
export const UButtonStub = defineComponent({
  name: 'UButtonStub',
  inheritAttrs: false,
  props: {
    label: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
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
          'data-loading': props.loading ? 'true' : undefined,
          onClick: (event: MouseEvent) => emit('click', event),
        },
        [slots.default?.(), props.label].filter(Boolean),
      );
  },
});

/**
 * UInput — renders a real `<input>` bound to v-model. Emits `update:modelValue`
 * on input and `blur` / `keydown` so dimension/rename inputs still work.
 */
export const UInputStub = defineComponent({
  name: 'UInputStub',
  props: {
    modelValue: { type: [String, Number], default: '' },
    placeholder: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'blur', 'keydown'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        type: 'text',
        ...attrs,
        placeholder: props.placeholder,
        disabled: props.disabled || undefined,
        value: props.modelValue ?? '',
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
        onBlur: (event: FocusEvent) => emit('blur', event),
        onKeydown: (event: KeyboardEvent) => emit('keydown', event),
      });
  },
});

/**
 * UModal — renders the `content` slot inside a `<section data-testid="modal">`
 * when open. Mirrors the v-model:open contract so tests can drive the close
 * button via `update:open`.
 */
export const UModalStub = defineComponent({
  name: 'UModalStub',
  props: {
    open: { type: Boolean, default: false },
  },
  emits: ['update:open', 'close'],
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        {
          'data-testid': 'modal',
          'data-open': String(props.open),
          'data-modal-open': props.open ? 'true' : 'false',
        },
        slots.content?.() ?? slots.default?.(),
      );
  },
});

/**
 * USelect — renders a real `<select>` bound to v-model. Items can be string /
 * number primitives or `{ label, value }` records (with optional valueKey /
 * labelKey, matching Nuxt UI's resolution). The change event emits the
 * resolved item value, not the raw string.
 */
export const USelectStub = defineComponent({
  name: 'USelectStub',
  props: {
    modelValue: { type: [String, Number], default: '' },
    items: { type: Array, default: () => [] },
    valueKey: { type: String, default: 'value' },
    labelKey: { type: String, default: 'label' },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => {
      const items = props.items as Array<unknown>;
      const isRecord = items.length > 0 && typeof items[0] === 'object';
      return h(
        'select',
        {
          ...attrs,
          value: String(props.modelValue ?? ''),
          onChange: (event: Event) => {
            const raw = (event.target as HTMLSelectElement).value;
            if (!isRecord) {
              emit('update:modelValue', raw);
              return;
            }
            const record = (items as Array<Record<string, unknown>>).find(
              (it) => String(it[props.valueKey]) === raw,
            );
            emit('update:modelValue', record ? record[props.valueKey] : raw);
          },
        },
        items.map((it) => {
          if (isRecord) {
            const r = it as Record<string, unknown>;
            return h(
              'option',
              { value: String(r[props.valueKey]) },
              String(r[props.labelKey]),
            );
          }
          return h('option', { value: String(it) }, String(it));
        }),
      );
    };
  },
});

/**
 * UFormField — pass-through wrapper. Nuxt UI uses it for label / error / hint
 * scaffolding; behaviour tests don't need any of that, just the slot.
 */
export const UFormFieldStub = defineComponent({
  name: 'UFormFieldStub',
  props: {
    label: { type: String, default: undefined },
    error: { type: String, default: undefined },
  },
  setup(_props, { slots }) {
    return () => h('div', slots.default?.());
  },
});
