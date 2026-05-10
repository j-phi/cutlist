<script lang="ts" setup>
import {
  convertUnits,
  formatValue,
  parseDimension,
  reduceStockMatrix,
} from 'cutlist';
import type { StockMatrix } from 'cutlist';
import { parseStock } from '~/utils/parseStock';
import { FALLBACK_PALETTE } from '~/composables/useMaterialColors';
import YAML from 'js-yaml';

const value = defineModel<string>({ required: true });

const { distanceUnit, precision } = useProjectSettings();
const unit = computed<'mm' | 'in'>(() => distanceUnit.value ?? 'mm');

const matrix = ref<StockMatrix[]>([]);
const err = ref<unknown>();

let lastSerialized = value.value;
let updating = false;

/** Storage is mm; the UI displays in `unit.value` and parses back to mm. */
const toDisplay = (mm: number) => convertUnits(mm, 'mm', unit.value);
const fromDisplay = (display: number) =>
  convertUnits(display, unit.value, 'mm');

function parseAndSet(yaml: string) {
  updating = true;
  try {
    matrix.value = parseStock(yaml);
    err.value = undefined;
  } catch (e) {
    err.value = e;
  } finally {
    updating = false;
  }
}

parseAndSet(value.value);

function serialize() {
  const yaml = YAML.dump(JSON.parse(JSON.stringify(matrix.value)), {
    indent: 2,
    flowLevel: 3,
  });
  lastSerialized = yaml;
  value.value = yaml;
}

watch(
  value,
  (next) => {
    if (next === lastSerialized) return;
    parseAndSet(next);
  },
  { flush: 'sync' },
);

watch(
  matrix,
  () => {
    if (updating) return;
    serialize();
  },
  { deep: true, flush: 'sync' },
);

function commit() {
  try {
    reduceStockMatrix(JSON.parse(JSON.stringify(matrix.value)));
    serialize();
    err.value = undefined;
    return true;
  } catch (e) {
    err.value = e;
    return false;
  }
}

defineExpose({ commit, addMaterial, scrollToBottom });

// Thickness add inputs: keyed by "matIndex-sizeIndex"
const newThickness = ref<Record<string, string>>({});

function tKey(matIndex: number, sizeIndex: number) {
  return `${matIndex}-${sizeIndex}`;
}

function addThickness(matIndex: number, sizeIndex: number) {
  const key = tKey(matIndex, sizeIndex);
  const display = parseDimension(newThickness.value[key], unit.value);
  if (display == null || display <= 0) return;
  matrix.value[matIndex].sizes[sizeIndex].thickness.push(fromDisplay(display));
  newThickness.value[key] = '';
}

function removeThickness(
  matIndex: number,
  sizeIndex: number,
  dimIndex: number,
) {
  matrix.value[matIndex].sizes[sizeIndex].thickness.splice(dimIndex, 1);
}

// Size add inputs: keyed by matIndex
const newSizeWidth = ref<Record<number, string>>({});
const newSizeLength = ref<Record<number, string>>({});

/** Re-render any in-progress add-row string in the new unit on a flip. */
function retranslate(
  bag: Record<string | number, string>,
  prev: 'mm' | 'in',
  next: 'mm' | 'in',
) {
  for (const k in bag) {
    const v = parseDimension(bag[k], prev);
    if (v != null)
      bag[k] = formatValue(convertUnits(v, prev, next), next, precision.value);
  }
}

watch(unit, (next, prev) => {
  retranslate(newThickness.value, prev, next);
  retranslate(newSizeWidth.value, prev, next);
  retranslate(newSizeLength.value, prev, next);
});

function addSize(matIndex: number) {
  const w = parseDimension(newSizeWidth.value[matIndex], unit.value);
  const l = parseDimension(newSizeLength.value[matIndex], unit.value);
  if (w == null || w <= 0 || l == null || l <= 0) return;
  matrix.value[matIndex].sizes.push({
    width: fromDisplay(w),
    length: fromDisplay(l),
    thickness: [],
  });
  newSizeWidth.value[matIndex] = '';
  newSizeLength.value[matIndex] = '';
}

function removeSize(matIndex: number, sizeIndex: number) {
  matrix.value[matIndex].sizes.splice(sizeIndex, 1);
}

function addMaterial() {
  matrix.value.push({
    material: 'New Material',
    sizes: [],
    color: FALLBACK_PALETTE[matrix.value.length % FALLBACK_PALETTE.length],
  });
}

function removeMaterial(index: number) {
  matrix.value.splice(index, 1);
}

function displayDim(mm: number): string {
  return formatValue(toDisplay(mm), unit.value, precision.value);
}

const scrollContainer = ref<HTMLElement>();

function scrollToBottom() {
  nextTick(() => {
    scrollContainer.value?.scrollTo({
      top: scrollContainer.value.scrollHeight,
      behavior: 'smooth',
    });
  });
}
</script>

<template>
  <div
    ref="scrollContainer"
    class="flex-1 overflow-y-auto flex flex-col gap-3 min-h-0"
  >
    <div
      v-for="(mat, matIndex) in matrix"
      :key="matIndex"
      class="rounded-lg border border-default bg-surface p-4 flex flex-col gap-3"
    >
      <!-- Header: color + name + delete -->
      <div class="flex items-center gap-2">
        <MaterialColorPicker v-model="mat.color" />
        <UInput
          v-model="mat.material"
          class="flex-1"
          placeholder="Material name"
        />
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-trash-2"
          size="sm"
          @click="removeMaterial(matIndex)"
        />
      </div>

      <!-- Board sizes -->
      <div class="flex flex-col gap-2">
        <label class="text-xs font-medium text-muted uppercase tracking-wider">
          Board sizes ({{ unit }})
        </label>

        <!-- Existing sizes -->
        <div
          v-for="(size, sizeIndex) in mat.sizes"
          :key="sizeIndex"
          class="rounded border border-subtle bg-elevated px-3 py-2 flex flex-col gap-1.5"
        >
          <!-- Size dimensions + delete -->
          <div class="flex items-center justify-between">
            <span class="text-[13px] text-teal-300 font-mono">
              {{ displayDim(size.width) }}{{ unit }}
              <span class="text-dim">&times;</span>
              {{ displayDim(size.length) }}{{ unit }}
            </span>
            <button
              class="text-dim hover:text-body leading-none transition-colors"
              @click="removeSize(matIndex, sizeIndex)"
            >
              &times;
            </button>
          </div>

          <!-- Thicknesses for this size -->
          <div class="flex flex-wrap items-center gap-1.5">
            <span
              v-for="(dim, i) in size.thickness"
              :key="i"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-subtle bg-default text-[12px] text-teal-300/80 font-mono"
            >
              {{ displayDim(dim) }}{{ unit }}
              <button
                class="text-dim hover:text-body leading-none ml-0.5 transition-colors"
                @click="removeThickness(matIndex, sizeIndex, i)"
              >
                &times;
              </button>
            </span>
            <input
              v-model="newThickness[tKey(matIndex, sizeIndex)]"
              type="text"
              class="bg-default rounded px-2 py-0.5 text-[12px] text-teal-300/70 font-mono w-16 outline-none border border-subtle focus:border-teal-600 placeholder:text-dim transition-colors"
              placeholder="+ thick"
              @keydown.enter.prevent="addThickness(matIndex, sizeIndex)"
              @blur="addThickness(matIndex, sizeIndex)"
            />
          </div>
        </div>

        <!-- Add size row -->
        <div class="flex items-center gap-1.5">
          <input
            v-model="newSizeWidth[matIndex]"
            type="text"
            class="bg-elevated rounded px-2 py-1 text-[13px] text-teal-300/70 font-mono w-20 outline-none border border-subtle focus:border-teal-600 placeholder:text-dim transition-colors"
            placeholder="width"
            @keydown.enter.prevent="addSize(matIndex)"
          />
          <span class="text-dim text-sm">&times;</span>
          <input
            v-model="newSizeLength[matIndex]"
            type="text"
            class="bg-elevated rounded px-2 py-1 text-[13px] text-teal-300/70 font-mono w-20 outline-none border border-subtle focus:border-teal-600 placeholder:text-dim transition-colors"
            placeholder="length"
            @keydown.enter.prevent="addSize(matIndex)"
          />
          <button
            class="text-dim hover:text-teal-400 transition-colors text-sm px-1"
            @click="addSize(matIndex)"
          >
            + add size
          </button>
        </div>
      </div>
    </div>
  </div>

  <div
    v-if="err"
    class="shrink-0 bg-red-900 p-4 rounded-lg border border-red-700"
  >
    <p class="text-white whitespace-pre-wrap text-sm">{{ err }}</p>
  </div>
</template>
