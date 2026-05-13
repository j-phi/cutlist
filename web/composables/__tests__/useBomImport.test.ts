/**
 * Outcome-based tests for useBomImport — the file-picker / drag-drop composable
 * powering the BOM tab's model imports.
 *
 * Strategy
 * --------
 * The composable's job is simple: take a File, pick a parser by extension,
 * dispatch a Model to the supplied callback, and surface a toast. We exercise
 * it end-to-end:
 *
 *   - **Real parsers**: minimal inline GLTF / COLLADA fixtures (cube). The
 *     parsers exist in isolation tests; here we just need the parse to
 *     succeed so we can observe the Model that pops out.
 *   - **Real toast plumbing**: `@nuxt/ui/composables/useToast` is the
 *     resolved auto-import target that `useBomImport` calls. We `vi.mock`
 *     it once with a stand-in that pushes into a plain `toasts` array.
 *     This avoids the Nuxt test environment entirely — happy-dom is enough,
 *     and crucially it lets GLTFLoader's `data:` URL fetch work the same
 *     way it does in `utils/__tests__/parser-matrix-parity.test.ts`.
 *   - **Plain-array recorders** instead of `vi.fn()` for the
 *     `onModelParsed` callback so assertions are over recorded arguments
 *     rather than mock metadata.
 *
 * The composable does not touch IndexedDB — it only fans the parsed Model
 * out to its caller — so there is no IDB layer to assert on here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';

import type { Model } from '../useProjects';

/**
 * Hoisted toast recorder. `vi.mock` factories run before module imports, so
 * we share state between the mock factory and the test body via
 * `vi.hoisted`.
 */
const hoisted = vi.hoisted(() => ({
  toasts: [] as Array<{
    title?: string;
    description?: string;
    color?: string;
  }>,
}));

// Nuxt auto-imports rewrite `useToast()` to this resolved sub-path; mocking
// it directly avoids the Nuxt test environment and the wrapped fetch it
// installs (which breaks GLTFLoader's data: URL buffer reads).
vi.mock('@nuxt/ui/composables/useToast', () => ({
  useToast: () => ({
    add: (t: { title?: string; description?: string; color?: string }) =>
      hoisted.toasts.push(t),
  }),
}));

import { useBomImport } from '../useBomImport';

// ─── Fixtures ──────────────────────────────────────────────────────────────

/**
 * Minimal GLTF fixture: a single cube with an embedded base64 buffer. The
 * parser only needs valid JSON + accessors with min/max — geometry contents
 * are irrelevant to the composable's behavior.
 */
function gltfFixtureText(): string {
  const positions = new Float32Array([
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5,
    -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2,
    6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ]);
  const posBytes = new Uint8Array(positions.buffer);
  const idxBytes = new Uint8Array(indices.buffer);
  const total = posBytes.byteLength + idxBytes.byteLength;
  const merged = new Uint8Array(total);
  merged.set(posBytes, 0);
  merged.set(idxBytes, posBytes.byteLength);
  let bin = '';
  for (let i = 0; i < merged.byteLength; i += 1) {
    bin += String.fromCharCode(merged[i]!);
  }
  const base64 = btoa(bin);

  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Cube', mesh: 0 }],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    materials: [
      {
        name: 'Wood',
        pbrMetallicRoughness: { baseColorFactor: [0.8, 0.7, 0.5, 1] },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: 'VEC3',
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: 36,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.byteLength },
      {
        buffer: 0,
        byteOffset: posBytes.byteLength,
        byteLength: idxBytes.byteLength,
      },
    ],
    buffers: [
      {
        byteLength: total,
        uri: `data:application/octet-stream;base64,${base64}`,
      },
    ],
  };
  return JSON.stringify(gltf);
}

/**
 * Minimal COLLADA 1.4.1 fixture: a single cube under a node carrying an
 * identity matrix. Same shape as the parser-matrix-parity fixture but
 * trimmed for the smallest valid input.
 */
function colladaFixtureText(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>
  <library_effects>
    <effect id="WoodFx"><profile_COMMON><technique sid="common">
      <lambert><diffuse><color>0.8 0.7 0.5 1</color></diffuse></lambert>
    </technique></profile_COMMON></effect>
  </library_effects>
  <library_materials>
    <material id="WoodMat" name="Wood"><instance_effect url="#WoodFx"/></material>
  </library_materials>
  <library_geometries>
    <geometry id="cube-geo" name="cube-geo"><mesh>
      <source id="cube-pos">
        <float_array id="cube-pos-array" count="24">
          -0.5 -0.5 -0.5  0.5 -0.5 -0.5  0.5 0.5 -0.5  -0.5 0.5 -0.5
          -0.5 -0.5 0.5   0.5 -0.5 0.5   0.5 0.5 0.5   -0.5 0.5 0.5
        </float_array>
        <technique_common>
          <accessor source="#cube-pos-array" count="8" stride="3">
            <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
          </accessor>
        </technique_common>
      </source>
      <vertices id="cube-verts"><input semantic="POSITION" source="#cube-pos"/></vertices>
      <triangles count="12" material="WoodMatSym">
        <input semantic="VERTEX" source="#cube-verts" offset="0"/>
        <p>0 1 2 0 2 3 4 6 5 4 7 6 0 4 5 0 5 1 1 5 6 1 6 2 2 6 7 2 7 3 3 7 4 3 4 0</p>
      </triangles>
    </mesh></geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
      <node id="Cube" name="Cube" type="NODE">
        <matrix sid="transform">1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</matrix>
        <instance_geometry url="#cube-geo">
          <bind_material><technique_common>
            <instance_material symbol="WoodMatSym" target="#WoodMat"/>
          </technique_common></bind_material>
        </instance_geometry>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>`;
}

function makeFile(name: string, contents = 'noop'): File {
  return new File([contents], name, { type: 'application/octet-stream' });
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

/**
 * Plain-array recorder for onModelParsed. Avoids vi.fn() so assertions are
 * over the captured Model values rather than mock metadata.
 */
function makeRecorder() {
  const models: Model[] = [];
  return {
    models,
    onModelParsed: (m: Model) => void models.push(m),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('useBomImport', () => {
  let scope: EffectScope;

  beforeEach(() => {
    hoisted.toasts.length = 0;
    scope = effectScope();
  });

  afterEach(() => {
    scope.stop();
  });

  describe('On drop', () => {
    it('Should parse a .gltf file and dispatch a Model with source=gltf', async () => {
      const rec = makeRecorder();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() =>
        useBomImport({ activeId, onModelParsed: rec.onModelParsed }),
      )!;

      const file = makeFile('cabinet.gltf', gltfFixtureText());
      await api.bind.dropZone.onDrop(makeDragEvent('drop', [file]));

      expect(rec.models).toHaveLength(1);
      const model = rec.models[0]!;
      expect(model.source).toBe('gltf');
      expect(model.filename).toBe('cabinet.gltf');
      expect(model.enabled).toBe(true);
      expect(model.parts.length).toBeGreaterThan(0);
      expect(model.colors.length).toBeGreaterThan(0);
      // rawSource for GLTF is the parsed JSON object.
      expect(typeof model.rawSource).toBe('object');
    });

    it('Should toggle isImporting around an in-flight parse and expose the active filename', async () => {
      const rec = makeRecorder();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() =>
        useBomImport({ activeId, onModelParsed: rec.onModelParsed }),
      )!;

      expect(api.isImporting.value).toBe(false);
      expect(api.importingFile.value).toBe(null);

      const file = makeFile('cabinet.gltf', gltfFixtureText());
      // Don't await — peek at the in-flight state.
      const inflight = api.bind.dropZone.onDrop(makeDragEvent('drop', [file]));

      // Synchronously after the call begins, the flags should be set so the
      // overlay shows up. (parseGltf is async; the loop yields immediately.)
      expect(api.isImporting.value).toBe(true);
      expect(api.importingFile.value).toBe('cabinet.gltf');

      await inflight;

      // And cleared once the parse settles.
      expect(api.isImporting.value).toBe(false);
      expect(api.importingFile.value).toBe(null);
    });

    it('Should parse a .dae file and dispatch a Model with source=assimp', async () => {
      const rec = makeRecorder();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() =>
        useBomImport({ activeId, onModelParsed: rec.onModelParsed }),
      )!;

      const file = makeFile('cabinet.dae', colladaFixtureText());
      await api.bind.dropZone.onDrop(makeDragEvent('drop', [file]));

      expect(rec.models).toHaveLength(1);
      const model = rec.models[0]!;
      expect(model.source).toBe('assimp');
      expect(model.filename).toBe('cabinet.dae');
      // DAE is converted to glTF JSON via Assimp at import time; we persist
      // the converted object so re-derive runs the fast glTF path.
      expect(typeof model.rawSource).toBe('object');
    });

    it('Should ignore files that are not .gltf or .dae', async () => {
      const rec = makeRecorder();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() =>
        useBomImport({ activeId, onModelParsed: rec.onModelParsed }),
      )!;

      await api.bind.dropZone.onDrop(
        makeDragEvent('drop', [makeFile('readme.txt'), makeFile('photo.png')]),
      );

      expect(rec.models).toEqual([]);
      expect(hoisted.toasts).toEqual([]);
    });

    it('Should show an error toast when the parser rejects malformed input', async () => {
      const rec = makeRecorder();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() =>
        useBomImport({ activeId, onModelParsed: rec.onModelParsed }),
      )!;

      // Real parser failure: the .gltf extension routes to parseGltf, which
      // throws "Could not parse ... as JSON GLTF" on non-JSON input.
      const file = makeFile('broken.gltf', 'not json');
      await api.bind.dropZone.onDrop(makeDragEvent('drop', [file]));

      expect(rec.models).toEqual([]);
      const errToast = hoisted.toasts.find((t) => t.color === 'error');
      expect(errToast).toBeTruthy();
      expect(errToast!.title).toBe('Import failed');
      expect(errToast!.description).toBeTruthy();
    });

    it('Should reset isDragging on drop', async () => {
      const rec = makeRecorder();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() =>
        useBomImport({ activeId, onModelParsed: rec.onModelParsed }),
      )!;

      api.isDragging.value = true;
      await api.bind.dropZone.onDrop(makeDragEvent('drop', []));
      expect(api.isDragging.value).toBe(false);
    });

    it('Should not import when activeId is null', async () => {
      const rec = makeRecorder();
      const activeId = ref<string | null>(null);
      const api = scope.run(() =>
        useBomImport({ activeId, onModelParsed: rec.onModelParsed }),
      )!;

      const file = makeFile('a.gltf', gltfFixtureText());
      await api.bind.dropZone.onDrop(makeDragEvent('drop', [file]));

      expect(rec.models).toEqual([]);
      // No success toast either — we never reached the parser.
      expect(hoisted.toasts).toEqual([]);
    });

    it('Should add a success toast that names the file and reports counts', async () => {
      const rec = makeRecorder();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() =>
        useBomImport({ activeId, onModelParsed: rec.onModelParsed }),
      )!;

      const file = makeFile('cabinet.gltf', gltfFixtureText());
      await api.bind.dropZone.onDrop(makeDragEvent('drop', [file]));

      const success = hoisted.toasts.find((t) => t.color !== 'error');
      expect(success).toBeTruthy();
      expect(success!.title).toBe('Imported');
      expect(success!.description).toContain('cabinet.gltf');
      // Model contains the same counts the toast describes.
      const m = rec.models[0]!;
      expect(success!.description).toContain(`${m.parts.length} parts`);
    });
  });

  describe('On file input change', () => {
    it('Should parse the picked file and clear the input value', async () => {
      const rec = makeRecorder();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() =>
        useBomImport({ activeId, onModelParsed: rec.onModelParsed }),
      )!;

      // happy-dom forbids setting non-empty `value` on a real <input
      // type="file">, so we hand-roll a minimal stand-in with the same
      // surface (files + value) for the composable's onChange handler.
      const dt = new DataTransfer();
      dt.items.add(makeFile('part.gltf', gltfFixtureText()));
      const input = { files: dt.files, value: 'part.gltf' };

      const event = new Event('change');
      Object.defineProperty(event, 'target', { value: input });

      await api.bind.fileInput.onChange(event);

      expect(rec.models).toHaveLength(1);
      expect(rec.models[0]!.filename).toBe('part.gltf');
      // Clearing the input is what allows re-importing the same file twice.
      expect(input.value).toBe('');
    });
  });

  describe('On dragover / dragleave', () => {
    it('Should toggle isDragging when files are over the drop zone', () => {
      const rec = makeRecorder();
      const activeId = ref<string | null>('p1');
      const api = scope.run(() =>
        useBomImport({ activeId, onModelParsed: rec.onModelParsed }),
      )!;

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
      const rec = makeRecorder();
      const activeId = ref<string | null>(null);
      const api = scope.run(() =>
        useBomImport({ activeId, onModelParsed: rec.onModelParsed }),
      )!;

      const overEvent = makeDragEvent('dragover', [makeFile('a.gltf')]);
      api.bind.dropZone.onDragover(overEvent);
      expect(api.isDragging.value).toBe(false);
    });
  });
});
