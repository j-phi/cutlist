import { ref, type Ref } from 'vue';
import { parseGltf } from '~/utils/parseGltf';
import {
  parseAssimp,
  ASSIMP_EXTENSIONS,
  getFileExtension,
  isAssimpExtension,
} from '~/utils/parseAssimp';
import type { Model } from '~/composables/useProjects';

export interface UseBomImportOptions {
  activeId: Ref<string | null | undefined>;
  onModelParsed: (model: Model) => void;
}

const SUPPORTED_EXTENSIONS = ['gltf', ...ASSIMP_EXTENSIONS] as const;

/**
 * File picker + drag/drop wiring for the BOM tab. Returns `bind.dropZone`
 * and `bind.fileInput` so callers don't have to know which DOM events
 * we listen to.
 */
export function useBomImport({ activeId, onModelParsed }: UseBomImportOptions) {
  const toast = useToast();
  const fileInput = ref<HTMLInputElement | null>(null);
  const isDragging = ref(false);
  // Drives a blocking overlay through the 1–5 s WASM download + Assimp
  // conversion on first non-glTF import.
  const isImporting = ref(false);
  const importingFile = ref<string | null>(null);

  function pickFile() {
    fileInput.value?.click();
  }

  async function importFiles(files: File[]) {
    if (!files.length || !activeId.value) return;
    isImporting.value = true;
    try {
      for (const file of files) {
        importingFile.value = file.name;
        try {
          const ext = getFileExtension(file.name);
          let result;
          let source: 'gltf' | 'collada';
          if (ext === 'gltf') {
            result = await parseGltf(file);
            source = 'gltf';
          } else if (isAssimpExtension(ext)) {
            result = await parseAssimp(file);
            // The IDB `source` enum uses `'collada'` for any Assimp-routed
            // import; the real format lives in `filename`.
            source = 'collada';
          } else {
            throw new Error(`Unsupported file type: .${ext || '(none)'}`);
          }
          const colorList = Object.values(result.colorMap);
          onModelParsed({
            id: crypto.randomUUID(),
            filename: file.name,
            source,
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
    } finally {
      isImporting.value = false;
      importingFile.value = null;
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
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) =>
      (SUPPORTED_EXTENSIONS as readonly string[]).includes(
        getFileExtension(f.name),
      ),
    );
    await importFiles(files);
  }

  return {
    isDragging,
    isImporting,
    importingFile,
    fileInput,
    pickFile,
    bind: {
      dropZone: { onDragover: onDragOver, onDragleave: onDragLeave, onDrop },
      fileInput: { onChange },
    },
  };
}
