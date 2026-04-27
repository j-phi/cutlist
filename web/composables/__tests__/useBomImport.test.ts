// @vitest-environment nuxt
/**
 * Tests for useBomImport — the file-picker / drag-drop composable powering
 * the BOM tab's model imports. We exercise it inside an effectScope, mock
 * parseGltf / parseCollada / useToast at the Nuxt auto-import boundary,
 * and assert that successful parses fan out to the onModelParsed callback
 * while failures surface as error toasts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import type { Model } from '../useProjects';

const parseGltfMock = vi.fn();
const parseColladaMock = vi.fn();
const toastAdd = vi.fn();

vi.mock('~/utils/parseGltf', () => ({
  parseGltf: (file: File) => parseGltfMock(file),
}));
vi.mock('~/utils/parseCollada', () => ({
  parseCollada: (file: File) => parseColladaMock(file),
}));

mockNuxtImport('useToast', () => () => ({ add: toastAdd }));

import { useBomImport } from '../useBomImport';

const baseParseResult = {
  parts: [
    {
      partNumber: 1,
      instanceNumber: 1,
      name: 'A',
      size: { width: 0.1, length: 0.1, thickness: 0.018 },
      colorKey: 'red',
    },
  ],
  colors: [{ key: 'red', label: 'Red' }],
  nodePartMap: [],
};

function makeFile(name: string) {
  return new File(['contents'], name, { type: 'application/octet-stream' });
}

function makeDragEvent(
  type: 'dragover' | 'dragleave' | 'drop',
  files: File[] = [],
): DragEvent {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: dt });
  return event;
}

describe('useBomImport', () => {
  let scope: EffectScope;

  beforeEach(() => {
    parseGltfMock.mockReset();
    parseColladaMock.mockReset();
    toastAdd.mockClear();
    scope = effectScope();
  });

  afterEach(() => {
    scope.stop();
    vi.restoreAllMocks();
  });

  describe('On drop', () => {
    it('Should call parseGltf and onModelParsed for a .gltf file', async () => {
      parseGltfMock.mockResolvedValueOnce({
        ...baseParseResult,
        gltfJson: { v: 1 },
      });
      const onModelParsed = vi.fn();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() => useBomImport({ activeId, onModelParsed }))!;

      const event = makeDragEvent('drop', [makeFile('cabinet.gltf')]);
      await api.bind.dropZone.onDrop(event);

      expect(parseGltfMock).toHaveBeenCalledTimes(1);
      expect(parseColladaMock).not.toHaveBeenCalled();
      expect(onModelParsed).toHaveBeenCalledTimes(1);
      const arg = onModelParsed.mock.calls[0][0] as Model;
      expect(arg.source).toBe('gltf');
      expect(arg.filename).toBe('cabinet.gltf');
      expect(arg.rawSource).toEqual({ v: 1 });
      expect(arg.parts).toEqual(baseParseResult.parts);
    });

    it('Should call parseCollada for a .dae file', async () => {
      parseColladaMock.mockResolvedValueOnce({
        ...baseParseResult,
        colladaXml: '<x/>',
      });
      const onModelParsed = vi.fn();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() => useBomImport({ activeId, onModelParsed }))!;

      await api.bind.dropZone.onDrop(
        makeDragEvent('drop', [makeFile('m.dae')]),
      );

      expect(parseColladaMock).toHaveBeenCalledTimes(1);
      expect(parseGltfMock).not.toHaveBeenCalled();
      const arg = onModelParsed.mock.calls[0][0] as Model;
      expect(arg.source).toBe('collada');
      expect(arg.rawSource).toBe('<x/>');
    });

    it('Should ignore files that are not .gltf or .dae', async () => {
      const onModelParsed = vi.fn();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() => useBomImport({ activeId, onModelParsed }))!;

      await api.bind.dropZone.onDrop(
        makeDragEvent('drop', [makeFile('readme.txt'), makeFile('photo.png')]),
      );

      expect(parseGltfMock).not.toHaveBeenCalled();
      expect(parseColladaMock).not.toHaveBeenCalled();
      expect(onModelParsed).not.toHaveBeenCalled();
      expect(toastAdd).not.toHaveBeenCalled();
    });

    it('Should show an error toast when the parser throws', async () => {
      parseGltfMock.mockRejectedValueOnce(new Error('bad gltf'));
      const onModelParsed = vi.fn();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() => useBomImport({ activeId, onModelParsed }))!;

      await api.bind.dropZone.onDrop(
        makeDragEvent('drop', [makeFile('broken.gltf')]),
      );

      expect(onModelParsed).not.toHaveBeenCalled();
      const errCall = toastAdd.mock.calls.find(
        (c) => (c[0] as { color?: string }).color === 'error',
      );
      expect(errCall).toBeTruthy();
      expect((errCall![0] as { description: string }).description).toContain(
        'bad gltf',
      );
    });

    it('Should reset isDragging on drop', async () => {
      const onModelParsed = vi.fn();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() => useBomImport({ activeId, onModelParsed }))!;

      api.isDragging.value = true;
      await api.bind.dropZone.onDrop(makeDragEvent('drop', []));
      expect(api.isDragging.value).toBe(false);
    });

    it('Should not import when activeId is null', async () => {
      parseGltfMock.mockResolvedValueOnce({
        ...baseParseResult,
        gltfJson: {},
      });
      const onModelParsed = vi.fn();
      const activeId = ref<string | null>(null);
      const api = scope.run(() => useBomImport({ activeId, onModelParsed }))!;

      await api.bind.dropZone.onDrop(
        makeDragEvent('drop', [makeFile('a.gltf')]),
      );

      expect(parseGltfMock).not.toHaveBeenCalled();
      expect(onModelParsed).not.toHaveBeenCalled();
    });
  });

  describe('On file input change', () => {
    it('Should parse the picked file and clear the input value', async () => {
      parseGltfMock.mockResolvedValueOnce({
        ...baseParseResult,
        gltfJson: { v: 2 },
      });
      const onModelParsed = vi.fn();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() => useBomImport({ activeId, onModelParsed }))!;

      // happy-dom forbids setting non-empty `value` on a real type=file
      // input, so we hand-roll a minimal stand-in with the same surface.
      const dt = new DataTransfer();
      dt.items.add(makeFile('part.gltf'));
      const input = { files: dt.files, value: 'cabinet.gltf' };

      const event = new Event('change');
      Object.defineProperty(event, 'target', { value: input });

      await api.bind.fileInput.onChange(event);

      expect(parseGltfMock).toHaveBeenCalledTimes(1);
      expect(onModelParsed).toHaveBeenCalledTimes(1);
      // Clearing the input is what allows re-importing the same file twice.
      expect(input.value).toBe('');
    });
  });

  describe('On dragover / dragleave', () => {
    it('Should toggle isDragging when files are over the drop zone', () => {
      const onModelParsed = vi.fn();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() => useBomImport({ activeId, onModelParsed }))!;

      const target = document.createElement('div');
      const overEvent = makeDragEvent('dragover', [makeFile('a.gltf')]);
      Object.defineProperty(overEvent, 'currentTarget', { value: target });
      api.bind.dropZone.onDragover(overEvent);
      expect(api.isDragging.value).toBe(true);

      // Leaving to an unrelated element clears the flag.
      const leaveEvent = makeDragEvent('dragleave');
      Object.defineProperty(leaveEvent, 'currentTarget', { value: target });
      Object.defineProperty(leaveEvent, 'relatedTarget', { value: null });
      api.bind.dropZone.onDragleave(leaveEvent);
      expect(api.isDragging.value).toBe(false);
    });

    it('Should not flag isDragging when activeId is null', () => {
      const onModelParsed = vi.fn();
      const activeId = ref<string | null>(null);
      const api = scope.run(() => useBomImport({ activeId, onModelParsed }))!;

      const overEvent = makeDragEvent('dragover', [makeFile('a.gltf')]);
      api.bind.dropZone.onDragover(overEvent);
      expect(api.isDragging.value).toBe(false);
    });
  });
});
