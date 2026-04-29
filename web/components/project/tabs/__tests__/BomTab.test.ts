// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import BomTab from '../BomTab.vue';

// ── Hoisted state for vi.mock factories ──────────────────────────────────────

const parseGltfMock = vi.fn();
const parseColladaMock = vi.fn();

vi.mock('~/utils/parseGltf', () => ({
  parseGltf: (file: File) => parseGltfMock(file),
}));
vi.mock('~/utils/parseCollada', () => ({
  parseCollada: (file: File) => parseColladaMock(file),
}));

// ── Composable mocks ─────────────────────────────────────────────────────────

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

const addModel = vi.fn();
const removeModel = vi.fn();
const toggleModel = vi.fn();
const addManualPart = vi.fn();
const updateManualPart = vi.fn();
const removeManualPart = vi.fn();
const updatePartNameOverride = vi.fn().mockResolvedValue(undefined);

mockNuxtImport('useProjects', () => () => ({
  activeProject,
  activeId,
  enabledModels,
  manualModel,
  addModel,
  removeModel,
  toggleModel,
  addManualPart,
  updateManualPart,
  removeManualPart,
  updatePartNameOverride,
}));

const requestGrainLockChange = vi.fn();
mockNuxtImport('useGrainLockConfirm', () => () => ({
  requestGrainLockChange,
}));

const distanceUnit = ref<'mm' | 'in'>('mm');
const stock = ref<string | null>(null);
mockNuxtImport('useProjectSettings', () => () => ({
  distanceUnit,
  stock,
}));

mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) =>
    m == null ? '' : `${Math.round(m * 1000)}mm`,
);

const toastAdd = vi.fn();
mockNuxtImport('useToast', () => () => ({ add: toastAdd }));

const tab = ref<string>('bom');
mockNuxtImport('useProjectTab', () => () => tab);

const hoveredGroupIds = ref<Set<number>>(new Set());
const selectedGroupIds = ref<Set<number>>(new Set());
const partIndex = ref<Map<number, number[]>>(new Map());
const partNumberOfGroupId = ref<Map<number, number>>(new Map());
mockNuxtImport('useModelViewerStore', () => () => ({
  hoveredGroupIds,
  selectedGroupIds,
  partIndex,
  partNumberOfGroupId,
  setPartIndex: vi.fn(),
  selectGroupIds: vi.fn(),
  toggleGroupSelection: vi.fn(),
  clearGroupSelection: vi.fn(),
  setHoveredGroupIds: vi.fn(),
  selectPart: vi.fn(),
  hoverPart: vi.fn(),
}));

// BOM rows / filter — return a row so the table renders the rename pencil.
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
  toggleSort: vi.fn(),
  filteredGroups,
}));

mockNuxtImport('useMediaQuery', () => () => ref(false));
mockNuxtImport('usePersistedSplitPanel', () => () => ({
  panelSize: ref(400),
  isResizing: ref(false),
  startResize: vi.fn(),
}));

// ── Stubs ────────────────────────────────────────────────────────────────────

const UButtonStub = {
  inheritAttrs: false,
  template:
    '<button type="button" v-bind="$attrs" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>',
  props: ['label'],
};
const UInputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue ?? '',
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});

const stubs = {
  UButton: UButtonStub,
  UInput: UInputStub,
  UIcon: true,
  UCheckbox: true,
  UModal: { template: '<section><slot name="content" /></section>' },
  Transition: false,
  ManualPartRow: true,
  ColorMappingPanel: true,
  ModelTab: true,
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
  const event = new DragEvent('drop', {
    bubbles: true,
    cancelable: true,
  });
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

beforeEach(() => {
  parseGltfMock.mockReset();
  parseColladaMock.mockReset();
  addModel.mockClear();
  toastAdd.mockClear();
  updatePartNameOverride.mockClear();
  activeId.value = 'project-1';
  projectModels.value = [];
  allRows.value = [];
  filteredGroups.value = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BomTab', () => {
  describe('On drag-and-drop import', () => {
    it('Should call parseGltf and addModel for a .gltf file', async () => {
      parseGltfMock.mockResolvedValueOnce({
        ...baseParseResult,
        rawSource: { v: 1 },
      });
      const component = getComponent();

      fireDrop(component, [makeFile('cabinet.gltf')]);
      await new Promise((r) => setTimeout(r, 0));
      await component.vm.$nextTick();

      expect(parseGltfMock).toHaveBeenCalledTimes(1);
      expect(parseColladaMock).not.toHaveBeenCalled();
      expect(addModel).toHaveBeenCalledTimes(1);
      const arg = addModel.mock.calls[0][1] as {
        source: string;
        rawSource: unknown;
      };
      expect(arg.source).toBe('gltf');
      expect(arg.rawSource).toEqual({ v: 1 });
    });

    it('Should call parseCollada for a .dae file', async () => {
      parseColladaMock.mockResolvedValueOnce({
        ...baseParseResult,
        rawSource: '<x/>',
      });
      const component = getComponent();

      fireDrop(component, [makeFile('cabinet.dae')]);
      await new Promise((r) => setTimeout(r, 0));
      await component.vm.$nextTick();

      expect(parseColladaMock).toHaveBeenCalledTimes(1);
      expect(parseGltfMock).not.toHaveBeenCalled();
      const arg = addModel.mock.calls[0][1] as {
        source: string;
        rawSource: unknown;
      };
      expect(arg.source).toBe('collada');
      expect(arg.rawSource).toBe('<x/>');
    });

    it('Should show an error toast when import fails', async () => {
      parseGltfMock.mockRejectedValueOnce(new Error('bad gltf'));
      const component = getComponent();

      fireDrop(component, [makeFile('broken.gltf')]);
      await new Promise((r) => setTimeout(r, 0));
      await component.vm.$nextTick();

      expect(toastAdd).toHaveBeenCalled();
      const call = toastAdd.mock.calls.find(
        (c) => (c[0] as { color?: string }).color === 'error',
      );
      expect(call).toBeTruthy();
      expect((call![0] as { description: string }).description).toContain(
        'bad gltf',
      );
    });
  });

  describe('On rename part', () => {
    function setRow(opts: {
      number: number;
      name: string;
      isManual?: boolean;
    }) {
      const row = {
        number: opts.number,
        name: opts.name,
        modelId: 'm1',
        modelName: 'Model',
        qty: 1,
        material: 'Plywood',
        thicknessM: 0.018,
        widthM: 0.3,
        lengthM: 0.6,
        leftoverCount: 0,
        isManual: opts.isManual ?? false,
      };
      // Set models so the table branch (not empty-state) renders.
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

    it('Should save the trimmed new name via updatePartNameOverride', async () => {
      setRow({ number: 1, name: 'Original' });
      const component = getComponent();

      // Click the rename pencil. It has title="Rename part".
      const pencil = component
        .findAll('button')
        .find((b) => b.attributes('title') === 'Rename part');
      expect(pencil).toBeTruthy();
      await pencil!.trigger('click');

      const renameInput = component.get('input.bg-transparent');
      await renameInput.setValue('  New Name  ');
      await renameInput.trigger('keydown.enter');
      await component.vm.$nextTick();

      expect(updatePartNameOverride).toHaveBeenCalledWith(
        'project-1',
        1,
        'New Name',
      );
    });

    it('Should not call updatePartNameOverride when the name is empty', async () => {
      setRow({ number: 2, name: 'Keep' });
      const component = getComponent();

      const pencil = component
        .findAll('button')
        .find((b) => b.attributes('title') === 'Rename part');
      await pencil!.trigger('click');

      const renameInput = component.get('input.bg-transparent');
      await renameInput.setValue('   ');
      await renameInput.trigger('keydown.enter');
      await component.vm.$nextTick();

      expect(updatePartNameOverride).not.toHaveBeenCalled();
      // And an error toast is raised.
      const errToast = toastAdd.mock.calls.find(
        (c) => (c[0] as { color?: string }).color === 'error',
      );
      expect(errToast).toBeTruthy();
    });
  });
});

// TODO(test): models panel toggle, model removal pending state — UI bookkeeping.
// TODO(test): manual part inline edit/remove flow — duplicates ManualPartRow tests.
// TODO(test): row hover/click syncs to modelViewer store — store wiring.
// TODO(test): split panel resize, mobile narrow layout, openModelTab — UI plumbing.
// TODO(test): empty-state hero, drag overlay transition, summary bar — presentational.
// TODO(test): fileInput pickFile + onFileChange — duplicates drop-import behavior.
// TODO(test): grain-lock click → requestGrainLockChange — single delegation call.
