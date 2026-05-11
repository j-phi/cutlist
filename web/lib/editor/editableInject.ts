import type { InjectionKey, Ref } from 'vue';

/**
 * Provided by `BuildDocEditor`, consumed by every embed NodeView and
 * shared chrome component (drag handle, caption). Lets read-only render
 * hide authoring affordances without each block knowing about the
 * editor instance.
 */
export const EDITOR_EDITABLE: InjectionKey<Ref<boolean>> =
  Symbol('editorEditable');
