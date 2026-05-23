// @vitest-environment nuxt
/**
 * Outcome-based tests for BomTab. Two thin slices:
 *   1. Drag-and-drop import — observe `addModel` calls and toast records.
 *      Parse functions are replaced with stand-ins that resolve a fixture
 *      (or reject) so we can verify the BomTab → useBomImport → addModel
 *      wiring without booting Three.js.
 *   2. Inline rename — observe `updatePartNameOverride` calls and toast
 *      records.
 *
 * Composables that BomTab pulls in are stand-ins, not vi.fn mocks: each
 * captures call args into a plain array. Same coverage, no
 * `mock.calls[0][0]` introspection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { StockMatrix } from 'cutlist';

import BomTab from '../BomTab.vue';
import {
  UButtonStub,
  UInputStub,
  UModalStub,
  UTextareaStub,
} from '~/test-utils/stubs';
import type { ManualPartInput } from '~/composables/useProjects';

// ── Recording stand-ins for parsers ──────────────────────────────────────────
//
// Module-level mocks have to be vi.mock factories (hoisted), but the *bodies*
// can still defer to plain recording state we control per-test.

let parseGltfImpl: (file: File) => Promise<unknown> = async () => {
  throw new Error('parseGltf not configured');
};
let parseAssimpImpl: (file: File) => Promise<unknown> = async () => {
  throw new Error('parseAssimp not configured');
};
const parseGltfCalls: File[] = [];
const parseAssimpCalls: File[] = [];

vi.mock('~/utils/parseGltf', () => ({
  parseGltf: (file: File) => {
    parseGltfCalls.push(file);
    return parseGltfImpl(file);
  },
}));
vi.mock('~/utils/parseAssimp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/parseAssimp')>();
  return {
    ...actual,
    parseAssimp: (file: File) => {
      parseAssimpCalls.push(file);
      return parseAssimpImpl(file);
    },
  };
});

// ── Recording stand-ins for composables ──────────────────────────────────────

const activeId = ref<string | null>('project-1');
const projectModels = ref<unknown[]>([]);
const activeProject = computed(() => ({
  id: activeId.value,
  models: projectModels.value,
  colorMap: {},
  excludedColors: [],
}));
const enabledModels = ref<unknown[]>([]);
const manualModel = ref<unknown>(null);

interface AddModelCall {
  projectId: string;
  model: { source: string; rawSource: unknown; filename: string };
}
const addModelCalls: AddModelCall[] = [];
const renameCalls: Array<{
  projectId: string;
  partNumber: number;
  name: string;
}> = [];
const addManualPartsCalls: Array<{
  projectId: string;
  inputs: ManualPartInput[];
}> = [];
const remapCalls: Array<{ projectId: string; from: string; to: string }> = [];

mockNuxtImport('useProjects', () => () => ({
  activeProject,
  activeId,
  enabledModels,
  manualModel,
  addModel: (projectId: string, model: AddModelCall['model']) => {
    addModelCalls.push({ projectId, model });
  },
  removeModel: () => {},
  toggleModel: () => {},
  addManualPart: async () => {},
  addManualParts: async (projectId: string, inputs: ManualPartInput[]) => {
    addManualPartsCalls.push({ projectId, inputs });
  },
  updateManualPart: async () => {},
  removeManualPart: async () => {},
  updatePartNameOverride: async (
    projectId: string,
    partNumber: number,
    name: string,
  ) => {
    renameCalls.push({ projectId, partNumber, name });
  },
  updatePartGrainLock: async () => {},
  remapMaterial: async (projectId: string, from: string, to: string) => {
    remapCalls.push({ projectId, from, to });
  },
}));

mockNuxtImport('useGrainLockConfirm', () => () => ({
  requestGrainLockChange: () => {},
}));

const distanceUnit = ref<'mm' | 'in'>('mm');
const stocks = ref<StockMatrix[]>([]);
const linearMaterials = computed(() => new Set<string>());
mockNuxtImport('useProjectSettings', () => () => ({
  distanceUnit,
  stocks,
  linearMaterials,
}));

mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) =>
    m == null ? '' : `${Math.round(m * 1000)}mm`,
);

interface ToastInput {
  title?: string;
  description?: string;
  color?: string;
}
const toastCalls: ToastInput[] = [];
mockNuxtImport('useToast', () => () => ({
  add: (t: ToastInput) => {
    toastCalls.push(t);
  },
}));

const hoveredGroupIds = ref<Set<number>>(new Set());
const selectedGroupIds = ref<Set<number>>(new Set());
const partIndex = ref<Map<number, number[]>>(new Map());
const partNumberOfGroupId = ref<Map<number, number>>(new Map());
mockNuxtImport('useModelViewerStore', () => () => ({
  hoveredGroupIds,
  selectedGroupIds,
  partIndex,
  partNumberOfGroupId,
  setPartIndex: () => {},
  selectGroupIds: () => {},
  toggleGroupSelection: () => {},
  clearGroupSelection: () => {},
  setHoveredGroupIds: () => {},
  selectPart: () => {},
  hoverPart: () => {},
}));

const allRows = ref<unknown[]>([]);
const filteredGroups = ref<unknown[]>([]);

mockNuxtImport('useBomRows', () => () => ({
  allRows,
  isComputing: ref(false),
  totalParts: computed(() => allRows.value.length),
  materialNames: ref([]),
  warningCount: ref(0),
  showModelColumn: ref(false),
  manualPartNumbers: ref(new Set()),
}));

mockNuxtImport('useBomFilter', () => () => ({
  search: ref(''),
  sortKey: ref('number'),
  sortDir: ref('asc'),
  toggleSort: () => {},
  filteredGroups,
}));

mockNuxtImport('useMediaQuery', () => () => ref(false));
mockNuxtImport('usePersistedSplitPanel', () => () => ({
  panelSize: ref(400),
  isResizing: ref(false),
  startResize: () => {},
}));

// ── Stubs ────────────────────────────────────────────────────────────────────

const stubs = {
  UButton: UButtonStub,
  UInput: UInputStub,
  UTextarea: UTextareaStub,
  UIcon: true,
  UCheckbox: true,
  UModal: UModalStub,
  Transition: false,
  ManualPartRow: true,
  ColorMappingPanel: true,
  ModelTab: true,
  ExportPdfButton: true,
};

// ── Test helpers ─────────────────────────────────────────────────────────────

function getComponent() {
  return shallowMount(BomTab, { global: { stubs } });
}

function makeFile(name: string, type = 'application/octet-stream') {
  return new File(['contents'], name, { type });
}

function fireDrop(component: ReturnType<typeof getComponent>, files: File[]) {
  const root = component.element as HTMLElement;
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  const event = new DragEvent('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dt });
  root.dispatchEvent(event);
}

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
  objects: [],
  objectIndex: new Map(),
  partIndex: new Map(),
  colorMap: { red: { key: 'red', rgb: [1, 0, 0], count: 1 } },
  nodePartMap: [],
};

/** Wait for the drop-induced async parse + onModelParsed to settle. */
async function flushImport(component: ReturnType<typeof getComponent>) {
  await new Promise((r) => setTimeout(r, 0));
  await component.vm.$nextTick();
}

beforeEach(() => {
  parseGltfImpl = async () => {
    throw new Error('parseGltf not configured');
  };
  parseAssimpImpl = async () => {
    throw new Error('parseAssimp not configured');
  };
  parseGltfCalls.length = 0;
  parseAssimpCalls.length = 0;
  addModelCalls.length = 0;
  renameCalls.length = 0;
  addManualPartsCalls.length = 0;
  remapCalls.length = 0;
  toastCalls.length = 0;
  activeId.value = 'project-1';
  projectModels.value = [];
  allRows.value = [];
  filteredGroups.value = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BomTab — drag-and-drop import', () => {
  it('Should parse a .gltf file and forward the parsed model to addModel', async () => {
    parseGltfImpl = async () => ({ ...baseParseResult, rawSource: { v: 1 } });
    const component = getComponent();

    fireDrop(component, [makeFile('cabinet.gltf')]);
    await flushImport(component);

    expect(parseGltfCalls.map((f) => f.name)).toEqual(['cabinet.gltf']);
    expect(parseAssimpCalls).toEqual([]);
    expect(addModelCalls).toHaveLength(1);
    expect(addModelCalls[0].projectId).toBe('project-1');
    expect(addModelCalls[0].model.source).toBe('gltf');
    expect(addModelCalls[0].model.rawSource).toEqual({ v: 1 });
    expect(addModelCalls[0].model.filename).toBe('cabinet.gltf');
  });

  it('Should parse a .dae file and forward it to addModel as an assimp source', async () => {
    parseAssimpImpl = async () => ({ ...baseParseResult, rawSource: '<x/>' });
    const component = getComponent();

    fireDrop(component, [makeFile('cabinet.dae')]);
    await flushImport(component);

    expect(parseAssimpCalls.map((f) => f.name)).toEqual(['cabinet.dae']);
    expect(parseGltfCalls).toEqual([]);
    expect(addModelCalls).toHaveLength(1);
    expect(addModelCalls[0].model.source).toBe('assimp');
    expect(addModelCalls[0].model.rawSource).toBe('<x/>');
  });

  it('Should surface an error toast (and skip addModel) when parsing fails', async () => {
    parseGltfImpl = async () => {
      throw new Error('bad gltf');
    };
    const component = getComponent();

    fireDrop(component, [makeFile('broken.gltf')]);
    await flushImport(component);

    expect(addModelCalls).toEqual([]);
    const errToast = toastCalls.find((t) => t.color === 'error');
    expect(errToast).toBeDefined();
    expect(errToast!.description).toContain('bad gltf');
  });

  it('Should route a mixed .csv + model drop to both importers without clobbering', async () => {
    parseGltfImpl = async () => ({ ...baseParseResult, rawSource: { v: 1 } });
    const component = getComponent();

    const csv = new File(
      [
        [
          'Name\tQuantity\tLength\tWidth\tMaterial',
          'Side\t2\t750mm\t300mm\tPlywood',
        ].join('\n'),
      ],
      'parts.csv',
    );
    fireDrop(component, [csv, makeFile('cabinet.gltf')]);
    await flushImport(component);

    // Parts path
    expect(addManualPartsCalls).toHaveLength(1);
    expect(addManualPartsCalls[0].inputs[0].name).toBe('Side');
    // Model path — still runs in the same drop
    expect(parseGltfCalls.map((f) => f.name)).toEqual(['cabinet.gltf']);
    expect(addModelCalls).toHaveLength(1);
    expect(addModelCalls[0].model.source).toBe('gltf');
  });
});

describe('BomTab — inline rename', () => {
  /** Seed a single non-manual row so the rename pencil renders. */
  function seedRow(opts: { number: number; name: string }) {
    const row = {
      number: opts.number,
      name: opts.name,
      modelId: 'm1',
      modelName: 'Model',
      qty: 1,
      material: 'Plywood',
      thicknessUm: 0.018,
      widthUm: 0.3,
      lengthUm: 0.6,
      leftoverCount: 0,
      isManual: false,
    };
    projectModels.value = [
      {
        id: 'm1',
        source: 'gltf',
        enabled: true,
        filename: 'm.gltf',
        parts: [],
      },
    ];
    allRows.value = [row];
    filteredGroups.value = [
      { material: 'Plywood', totalParts: 1, rows: [row] },
    ];
  }

  it('Should save a trimmed new name via updatePartNameOverride', async () => {
    seedRow({ number: 1, name: 'Original' });
    const component = getComponent();

    const pencil = component
      .findAll('button')
      .find((b) => b.attributes('title') === 'Rename part');
    expect(pencil).toBeDefined();
    await pencil!.trigger('click');

    const renameInput = component.get('input.bg-transparent');
    await renameInput.setValue('  New Name  ');
    await renameInput.trigger('keydown.enter');
    await component.vm.$nextTick();

    expect(renameCalls).toEqual([
      { projectId: 'project-1', partNumber: 1, name: 'New Name' },
    ]);
  });

  it('Should reject an empty name with an error toast and not call updatePartNameOverride', async () => {
    seedRow({ number: 2, name: 'Keep' });
    const component = getComponent();

    const pencil = component
      .findAll('button')
      .find((b) => b.attributes('title') === 'Rename part');
    await pencil!.trigger('click');

    const renameInput = component.get('input.bg-transparent');
    await renameInput.setValue('   ');
    await renameInput.trigger('keydown.enter');
    await component.vm.$nextTick();

    expect(renameCalls).toEqual([]);
    expect(toastCalls.some((t) => t.color === 'error')).toBe(true);
  });
});

describe('BomTab — paste bulk import', () => {
  /** Open the Add Part modal so the paste section renders. */
  async function openModal(component: ReturnType<typeof getComponent>) {
    (component.vm as unknown as { showAddForm: boolean }).showAddForm = true;
    await component.vm.$nextTick();
  }

  it('Should parse pasted TSV and forward valid rows to addManualParts', async () => {
    const component = getComponent();
    await openModal(component);

    const textarea = component.get('textarea');
    await textarea.setValue(
      [
        'Name\tQuantity\tLength\tWidth\tMaterial',
        'Side\t2\t750mm\t300mm\tPlywood',
      ].join('\n'),
    );

    const importBtn = component
      .findAll('button')
      .find((b) => b.text().includes('Import rows'));
    expect(importBtn).toBeDefined();
    await importBtn!.trigger('click');
    await flushImport(component);

    expect(addManualPartsCalls).toHaveLength(1);
    expect(addManualPartsCalls[0].projectId).toBe('project-1');
    const inputs = addManualPartsCalls[0].inputs;
    expect(inputs).toHaveLength(1);
    expect(inputs[0].name).toBe('Side');
    expect(inputs[0].qty).toBe(2);
    expect(inputs[0].material).toBe('Plywood');
  });

  it('Should render a skipped-row summary for invalid rows', async () => {
    const component = getComponent();
    await openModal(component);

    const textarea = component.get('textarea');
    await textarea.setValue(
      [
        'Name\tQuantity\tLength\tWidth\tMaterial',
        'Good\t1\t500mm\t200mm\tOak',
        '\t2\t500mm\t200mm\tOak', // missing name → skipped
      ].join('\n'),
    );

    const importBtn = component
      .findAll('button')
      .find((b) => b.text().includes('Import rows'));
    await importBtn!.trigger('click');
    await flushImport(component);

    expect(addManualPartsCalls[0].inputs).toHaveLength(1);
    // The summary surfaces the skipped row to the user.
    expect(component.text()).toContain('Skipped 1 row');
  });

  it('Should retain the pasted text when no rows import, so the user can fix and retry', async () => {
    const component = getComponent();
    await openModal(component);

    const textarea = component.get('textarea');
    // Header missing the required Width column → 0 rows imported.
    await textarea.setValue(
      ['Name\tQuantity\tLength\tMaterial', 'A\t1\t500mm\tOak'].join('\n'),
    );

    const importBtn = component
      .findAll('button')
      .find((b) => b.text().includes('Import rows'));
    await importBtn!.trigger('click');
    await flushImport(component);

    expect(addManualPartsCalls).toEqual([]);
    expect((textarea.element as HTMLTextAreaElement).value).not.toBe('');
  });
});

describe('BomTab — material-match recovery (F4)', () => {
  /** Seed one unplaced row carrying a near-miss material suggestion. */
  function seedSuggestionRow() {
    const row = {
      number: 1,
      name: 'Side Panel',
      modelId: 'm1',
      modelName: 'Model',
      qty: 2,
      material: 'Walnut ',
      thicknessUm: 0.018,
      widthUm: 0.3,
      lengthUm: 0.6,
      leftoverCount: 2,
      isManual: false,
      materialSuggestion: 'Walnut',
    };
    projectModels.value = [
      {
        id: 'm1',
        source: 'gltf',
        enabled: true,
        filename: 'm.gltf',
        parts: [],
      },
    ];
    allRows.value = [row];
    filteredGroups.value = [
      { material: 'Walnut ', totalParts: 2, rows: [row] },
    ];
  }

  it('renders the suggestion prompt with both names and an accept control', () => {
    seedSuggestionRow();
    const component = getComponent();

    // The unmatched material is shown verbatim, alongside the suggestion.
    expect(component.text()).toContain('No stock named "Walnut "');
    expect(component.text()).toContain('Did you mean');

    const accept = component
      .findAll('button')
      .find((b) => b.attributes('title') === "Reassign to 'Walnut'");
    expect(accept).toBeDefined();
  });

  it('remaps the part material to the suggested stock name when accepted', async () => {
    seedSuggestionRow();
    const component = getComponent();

    const accept = component
      .findAll('button')
      .find((b) => b.attributes('title') === "Reassign to 'Walnut'");
    await accept!.trigger('click');

    expect(remapCalls).toEqual([
      { projectId: 'project-1', from: 'Walnut ', to: 'Walnut' },
    ]);
  });
});

// TODO(test): models panel toggle, model removal pending state — UI bookkeeping.
// TODO(test): manual part inline edit/remove flow — duplicates ManualPartRow tests.
// TODO(test): row hover/click syncs to modelViewer store — store wiring.
// TODO(test): split panel resize, mobile narrow layout, openModelTab — UI plumbing.
// TODO(test): empty-state hero, drag overlay transition, summary bar — presentational.
// TODO(test): fileInput pickFile + onFileChange — duplicates drop-import behavior.
// TODO(test): grain-lock click → requestGrainLockChange — single delegation call.
