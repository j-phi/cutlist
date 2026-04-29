import { ref, type Ref } from 'vue';
import { parseGltf } from '~/utils/parseGltf';
import { parseCollada } from '~/utils/parseCollada';
import type { Model } from '~/composables/useProjects';

export interface UseBomImportOptions {
  /** Currently active project id. Imports are skipped when null. */
  activeId: Ref<string | null | undefined>;
  /** Called once per successfully parsed file with a fully constructed Model. */
  onModelParsed: (model: Model) => void;
}

/**
 * File picker + drag/drop wiring for the BOM tab. Owns its own
 * `isDragging` flag, the hidden `<input type="file">` ref, and the toast
 * feedback for successful and failed imports.
 *
 * The returned `bind` object is meant to be spread on the drop target
 * (`<div v-bind="bind.dropZone">`) and the file input
 * (`<input v-bind="bind.fileInput">`). Keeping the binding shape opaque
 * means callers don't have to know which DOM events the composable
 * listens to.
 */
export function useBomImport({ activeId, onModelParsed }: UseBomImportOptions) {
  const toast = useToast();
  const fileInput = ref<HTMLInputElement | null>(null);
  const isDragging = ref(false);

  function pickFile() {
    fileInput.value?.click();
  }

  async function importFiles(files: File[]) {
    if (!files.length || !activeId.value) return;
    for (const file of files) {
      try {
        const isDae = file.name.toLowerCase().endsWith('.dae');
        const result = isDae ? await parseCollada(file) : await parseGltf(file);
        const colorList = Object.values(result.colorMap);
        onModelParsed({
          id: crypto.randomUUID(),
          filename: file.name,
          source: isDae ? 'collada' : 'gltf',
          parts: result.parts,
          colors: colorList,
          enabled: true,
          rawSource: result.rawSource,
          nodePartMap: result.nodePartMap,
        });
        toast.add({
          title: 'Imported',
          description: `${file.name}: ${result.parts.length} parts, ${colorList.length} color${colorList.length === 1 ? '' : 's'}.`,
        });
      } catch (err) {
        toast.add({
          title: 'Import failed',
          description: err instanceof Error ? err.message : String(err),
          color: 'error',
        });
      }
    }
  }

  async function onChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    await importFiles(files);
  }

  function onDragOver(e: DragEvent) {
    if (!activeId.value) return;
    if (e.dataTransfer?.items.length) {
      e.preventDefault();
      isDragging.value = true;
    }
  }

  function onDragLeave(e: DragEvent) {
    const related = e.relatedTarget as Element | null;
    const current = e.currentTarget as Element;
    if (!related || !current.contains(related)) {
      isDragging.value = false;
    }
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragging.value = false;
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => {
      const name = f.name.toLowerCase();
      return name.endsWith('.gltf') || name.endsWith('.dae');
    });
    await importFiles(files);
  }

  return {
    isDragging,
    fileInput,
    pickFile,
    bind: {
      dropZone: { onDragover: onDragOver, onDragleave: onDragLeave, onDrop },
      fileInput: { onChange },
    },
  };
}
