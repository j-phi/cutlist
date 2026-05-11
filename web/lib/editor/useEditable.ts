import { computed, type ComputedRef, type InjectionKey, type Ref } from 'vue';

/** Editor editability shared with embed NodeViews so they can hide
 *  authoring chrome (drag handle, picker, caption input) in view mode. */
const EDITABLE: InjectionKey<Ref<boolean>> = Symbol('editorEditable');

const READ_ONLY: ComputedRef<boolean> = computed(() => false);

export const provideEditable = (editable: Ref<boolean>) =>
  provide(EDITABLE, editable);

export const useEditable = (): Ref<boolean> => inject(EDITABLE, READ_ONLY);
