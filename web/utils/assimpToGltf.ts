/**
 * Convert any Assimp-supported 3D file (DAE, FBX, …) to a self-contained
 * glTF 2.0 JSON object with its binary buffer embedded as a base64 data URI.
 *
 * Assimp is the same C++ library Blender / Godot / many CAD tools use. The
 * WASM (~4 MB) is lazy-loaded on first call.
 */

import wasmUrl from 'assimpjs/dist/assimpjs.wasm?url';

interface AssimpFileList {
  AddFile(name: string, content: Uint8Array): void;
}
interface AssimpResultFile {
  GetContent(): Uint8Array;
}
interface AssimpResult {
  IsSuccess(): boolean;
  GetErrorCode(): string;
  FileCount(): number;
  GetFile(index: number): AssimpResultFile;
}
interface AssimpModule {
  FileList: new () => AssimpFileList;
  ConvertFileList(fileList: AssimpFileList, format: string): AssimpResult;
}

type AssimpFactory = (options?: {
  wasmBinary?: Uint8Array;
}) => Promise<AssimpModule>;

let cached: Promise<AssimpModule> | null = null;

async function loadAssimp(): Promise<AssimpModule> {
  if (!cached) {
    cached = (async () => {
      const [mod, wasmBinary] = await Promise.all([
        import('assimpjs'),
        fetchWasmBinary(),
      ]);
      const factory = (mod.default ?? mod) as unknown as AssimpFactory;
      // Pre-load the bytes ourselves so emscripten's environment detection
      // (fetch in the browser, fs in Node) doesn't have to be right — we've
      // seen it pick the wrong path in happy-dom tests.
      return factory({ wasmBinary });
    })();
  }
  return cached;
}

async function fetchWasmBinary(): Promise<Uint8Array> {
  if (typeof process !== 'undefined' && process.versions?.node) {
    // The Vite `?url` import resolves to a dev-server URL that doesn't exist
    // on disk, so in Node we have to find the WASM ourselves.
    const [{ readFile }, { fileURLToPath }] = await Promise.all([
      import('node:fs/promises'),
      import('node:url'),
    ]);
    const pkgUrl = await import.meta.resolve!('assimpjs/package.json');
    const wasmPath = fileURLToPath(pkgUrl).replace(
      /package\.json$/,
      'dist/assimpjs.wasm',
    );
    return new Uint8Array(await readFile(wasmPath));
  }
  const resp = await fetch(wasmUrl);
  if (!resp.ok) {
    throw new Error(`Failed to load Assimp WASM (${resp.status}).`);
  }
  return new Uint8Array(await resp.arrayBuffer());
}

/**
 * Convert raw file bytes to a self-contained glTF 2.0 JSON object. `filename`
 * is what Assimp uses for format detection — pass a real extension.
 */
export async function fileBytesToGltfJson(
  bytes: Uint8Array,
  filename: string,
): Promise<object> {
  const ajs = await loadAssimp();
  const fileList = new ajs.FileList();
  fileList.AddFile(filename, bytes);

  const result = ajs.ConvertFileList(fileList, 'glb2');
  if (!result.IsSuccess() || result.FileCount() === 0) {
    throw new Error(
      `Assimp failed to import "${filename}": ${result.GetErrorCode() || 'unknown error'}`,
    );
  }
  return glbToInlinedGltf(result.GetFile(0).GetContent());
}

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

/**
 * Parse a binary glTF (.glb) and return the JSON document with its BIN
 * chunk inlined as a base64 data URI. glTF JSON refs `buffers[0].uri`;
 * inlining there makes the document self-contained so we can hand it
 * straight to GLTFLoader.
 */
function glbToInlinedGltf(glb: Uint8Array): object {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('Assimp did not produce a valid GLB.');
  }

  let offset = 12;
  let jsonText: string | null = null;
  let binChunk: Uint8Array | null = null;
  while (offset < glb.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === CHUNK_JSON) {
      jsonText = new TextDecoder().decode(glb.subarray(start, start + length));
    } else if (type === CHUNK_BIN) {
      binChunk = glb.subarray(start, start + length);
    }
    offset = start + length;
  }

  if (!jsonText) throw new Error('GLB has no JSON chunk.');
  const json = JSON.parse(jsonText) as {
    buffers?: { uri?: string; byteLength: number }[];
  };
  if (binChunk && json.buffers?.[0]) {
    json.buffers[0].uri = `data:application/octet-stream;base64,${bytesToBase64(binChunk)}`;
  }
  return json;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunk to keep String.fromCharCode's varargs spread off the stack ceiling.
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.byteLength)),
    );
  }
  return btoa(binary);
}
