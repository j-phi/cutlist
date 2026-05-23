<script lang="ts" setup>
import { convertUnits, type Precision, type SheetStockMatrix } from 'cutlist';
import { useDimensionDrafts } from '~/composables/useDimensionDrafts';

const props = defineProps<{
  modelValue: SheetStockMatrix;
  distanceUnit: 'in' | 'mm';
  precision: Precision;
  /**
   * Offcut mode: changes the section header to "Board Offcut List" and adds
   * an editable name field to each board row.
   */
  isOffcut?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [next: SheetStockMatrix];
}>();

const unit = computed(() => props.distanceUnit);
const precisionRef = computed(() => props.precision);
const drafts = useDimensionDrafts(unit, precisionRef);

const sizeKey = (idx: number, field: 'width' | 'length') =>
  `size-${idx}-${field}`;

function emitSizes(sizes: SheetStockMatrix['sizes']) {
  // Index-keyed drafts shift when sizes change; clear so a stale draft
  // can't end up displayed against the wrong row after a remove.
  drafts.reset();
  newThickness.value = {};
  emit('update:modelValue', { ...props.modelValue, sizes });
}

function commitSizeDim(idx: number, field: 'width' | 'length'): void {
  const mm = drafts.commit(sizeKey(idx, field));
  if (mm == null) return;
  emitSizes(
    props.modelValue.sizes.map((s, i) =>
      i === idx ? { ...s, [field]: mm } : s,
    ),
  );
}

function commitSizeName(idx: number, name: string): void {
  const trimmed = name.trim();
  emitSizes(
    props.modelValue.sizes.map((s, i) =>
      i === idx ? { ...s, name: trimmed || undefined } : s,
    ),
  );
}

// Thickness-add: toggled via a Plus button. When open, a text input is
// shown and auto-focused; on blur/Enter the value is committed and the
// input closes. One-shot parse via the composable's `parse` helper.
const newThickness = ref<Record<number, string>>({});
const showThicknessInput = ref<Record<number, boolean>>({});
const showThicknessHelp = ref(false);

const thicknessPlaceholder = computed(() =>
  unit.value === 'mm' ? 'e.g. 18 or 18.5' : 'e.g. 3/4 or 1 1/4',
);

function addThickness(sizeIndex: number) {
  const mm = drafts.parse(newThickness.value[sizeIndex]);
  newThickness.value[sizeIndex] = '';
  showThicknessInput.value[sizeIndex] = false;
  if (mm == null) return;
  emitSizes(
    props.modelValue.sizes.map((s, i) =>
      i === sizeIndex ? { ...s, thickness: [...s.thickness, mm] } : s,
    ),
  );
}

function removeThickness(sizeIndex: number, dimIndex: number) {
  emitSizes(
    props.modelValue.sizes.map((s, i) =>
      i === sizeIndex
        ? { ...s, thickness: s.thickness.filter((_, j) => j !== dimIndex) }
        : s,
    ),
  );
}

function addSize() {
  // Seed with the standard sheet size in the active unit: 4×8 ft for
  // inches, 1220×2440 mm for metric. Most projects' first sheet is this;
  // edge cases are one edit away.
  const widthMm = unit.value === 'in' ? convertUnits(48, 'in', 'mm') : 1220;
  const lengthMm = unit.value === 'in' ? convertUnits(96, 'in', 'mm') : 2440;
  emitSizes([
    ...props.modelValue.sizes,
    { width: widthMm, length: lengthMm, thickness: [] },
  ]);
}

function removeSize(sizeIndex: number) {
  emitSizes(props.modelValue.sizes.filter((_, i) => i !== sizeIndex));
}

// Local draft names so the input isn't reformatted while the user is typing.
const nameDrafts = ref<Record<number, string>>({});

function nameDisplay(
  idx: number,
  size: SheetStockMatrix['sizes'][number],
): string {
  return nameDrafts.value[idx] ?? size.name ?? '';
}

function onNameInput(idx: number, value: string) {
  nameDrafts.value[idx] = value;
}

function onNameBlur(idx: number) {
  const draft = nameDrafts.value[idx];
  if (draft !== undefined) {
    commitSizeName(idx, draft);
    delete nameDrafts.value[idx];
  }
}

function commitSizeQty(idx: number, raw: number | string) {
  const n = Math.floor(Number(raw));
  const quantity = Number.isFinite(n) && n >= 1 ? n : 1;
  emitSizes(
    props.modelValue.sizes.map((s, i) => (i === idx ? { ...s, quantity } : s)),
  );
}
</script>

<template>
  <div class="flex flex-col gap-2" data-testid="sheet-dimensions">
    <label class="text-xs font-medium text-muted uppercase tracking-wider">
      {{ isOffcut ? 'Board Offcut List' : `Board sizes (${unit})` }}
    </label>

    <div
      v-for="(size, sizeIndex) in modelValue.sizes"
      :key="sizeIndex"
      class="rounded border border-subtle bg-elevated px-3 py-2.5 flex flex-col gap-2"
      data-testid="sheet-size-row"
    >
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="isOffcut">
          <span
            class="text-[11px] uppercase tracking-wider text-dim font-medium shrink-0"
            >Name</span
          >
          <UInput
            :model-value="nameDisplay(sizeIndex, size)"
            class="min-w-32 flex-none"
            :placeholder="`Board ${sizeIndex + 1}`"
            :data-testid="`sheet-size-name-${sizeIndex}`"
            @update:model-value="(v: string) => onNameInput(sizeIndex, v)"
            @blur="onNameBlur(sizeIndex)"
            @keydown.enter="onNameBlur(sizeIndex)"
          />
        </template>
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <span
            v-if="isOffcut"
            class="text-[11px] uppercase tracking-wider text-dim font-medium shrink-0"
            >Dimensions</span
          >
          <UInput
            :model-value="
              drafts.display(sizeKey(sizeIndex, 'width'), size.width)
            "
            class="flex-1 font-mono min-w-0"
            placeholder="width"
            :data-testid="`sheet-size-width-${sizeIndex}`"
            @update:model-value="
              (v: string) => drafts.set(sizeKey(sizeIndex, 'width'), v)
            "
            @blur="commitSizeDim(sizeIndex, 'width')"
            @keydown.enter="commitSizeDim(sizeIndex, 'width')"
          />
          <span class="text-dim text-sm shrink-0">&times;</span>
          <UInput
            :model-value="
              drafts.display(sizeKey(sizeIndex, 'length'), size.length)
            "
            class="flex-1 font-mono min-w-0"
            placeholder="length"
            :data-testid="`sheet-size-length-${sizeIndex}`"
            @update:model-value="
              (v: string) => drafts.set(sizeKey(sizeIndex, 'length'), v)
            "
            @blur="commitSizeDim(sizeIndex, 'length')"
            @keydown.enter="commitSizeDim(sizeIndex, 'length')"
          />
          <template v-if="isOffcut">
            <span
              class="text-[11px] uppercase tracking-wider text-dim font-medium shrink-0"
              >Qty</span
            >
            <UInput
              :model-value="String(size.quantity ?? 1)"
              type="number"
              :min="1"
              step="1"
              class="w-14 font-mono shrink-0"
              :data-testid="`sheet-size-qty-${sizeIndex}`"
              @update:model-value="
                (v: number | string) => commitSizeQty(sizeIndex, v)
              "
            />
          </template>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            size="xs"
            class="shrink-0"
            data-testid="sheet-size-remove"
            @click="removeSize(sizeIndex)"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-1">
          <label
            class="text-[11px] font-medium text-muted uppercase tracking-wider"
          >
            Thicknesses
          </label>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-info"
            size="xs"
            class="opacity-40 hover:opacity-100 transition-opacity -my-1"
            @click="showThicknessHelp = true"
          />
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            v-for="(dim, i) in size.thickness"
            :key="i"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-subtle bg-default text-[12px] text-teal-300/80 font-mono"
            data-testid="sheet-thickness-chip"
          >
            {{ drafts.format(dim) }}{{ unit }}
            <button
              class="text-dim hover:text-body leading-none ml-0.5 transition-colors"
              data-testid="sheet-thickness-remove"
              @click="removeThickness(sizeIndex, i)"
            >
              &times;
            </button>
          </span>
          <input
            v-if="showThicknessInput[sizeIndex]"
            :ref="
              (el) => {
                if (el) (el as HTMLInputElement).focus();
              }
            "
            v-model="newThickness[sizeIndex]"
            type="text"
            class="bg-default rounded px-2 py-0.5 text-[12px] text-teal-300/70 font-mono w-40 outline-none border border-subtle focus:border-teal-600 placeholder:text-dim transition-colors"
            :placeholder="thicknessPlaceholder"
            data-testid="sheet-thickness-add"
            @keydown.enter.prevent="addThickness(sizeIndex)"
            @keydown.escape="showThicknessInput[sizeIndex] = false"
            @blur="addThickness(sizeIndex)"
          />
          <UButton
            v-else
            color="neutral"
            variant="ghost"
            icon="i-lucide-plus"
            size="xs"
            data-testid="sheet-thickness-add-btn"
            @click="showThicknessInput[sizeIndex] = true"
          />
        </div>
      </div>
    </div>

    <UButton
      color="neutral"
      variant="soft"
      size="xs"
      icon="i-lucide-plus"
      class="self-start mt-1"
      data-testid="sheet-size-add"
      @click="addSize"
    >
      Add size
    </UButton>
  </div>

  <UModal v-model:open="showThicknessHelp" :ui="{ content: 'sm:max-w-xl' }">
    <template #content>
      <div
        class="p-6 flex flex-col gap-4 bg-elevated border border-default rounded-lg"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-hi">Thickness values</h2>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            class="rounded-full"
            @click="showThicknessHelp = false"
          />
        </div>

        <template v-if="unit === 'mm'">
          <p class="text-sm text-muted">
            Enter a number in millimetres. The
            <code class="text-teal-300/80">mm</code> suffix is optional and
            case-insensitive; a space before it is fine.
          </p>
          <table class="text-sm w-full border-collapse">
            <thead>
              <tr class="text-left text-dim text-xs uppercase tracking-wider">
                <th class="pb-1 font-medium w-1/3">You type</th>
                <th class="pb-1 font-medium">Interpreted as</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-subtle">
              <tr
                v-for="row in [
                  ['18', '18 mm'],
                  ['18.5', '18.5 mm'],
                  ['18mm', '18 mm'],
                  ['18 mm', '18 mm'],
                  ['18MM', '18 mm — case insensitive'],
                  ['18Mm', '18 mm — any capitalisation'],
                ]"
                :key="row[0]"
                class="text-body"
              >
                <td class="py-1.5 font-mono text-teal-300/80">{{ row[0] }}</td>
                <td class="py-1.5 text-muted">{{ row[1] }}</td>
              </tr>
            </tbody>
          </table>
          <p class="text-xs text-dim">
            Fractions and feet are not accepted — use decimals (e.g.
            <code class="text-teal-300/80">12.7</code> not
            <code class="text-teal-300/80">1/2"</code>).
          </p>
        </template>

        <template v-else>
          <p class="text-sm text-muted">
            Enter a measurement in inches. Decimals, fractions, mixed numbers,
            and feet+inches all work.
          </p>
          <table class="text-sm w-full border-collapse">
            <thead>
              <tr class="text-left text-dim text-xs uppercase tracking-wider">
                <th class="pb-1 font-medium w-1/3">You type</th>
                <th class="pb-1 font-medium">Interpreted as</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-subtle">
              <tr
                v-for="row in [
                  ['3/4', '¾ inch'],
                  ['1 1/4', '1¼ inches'],
                  ['1-3/4', '1¾ inches — dash or space ok'],
                  ['0.75', '¾ inch'],
                  ['1.5', '1½ inches'],
                  ['3/4&quot;', '¾ inch — straight double-quote glyph'],
                  ['3/4 &#8243;', '¾ inch — double-prime glyph (&#8243;)'],
                  ['3/4 in', '¾ inch — in suffix, <em>any case</em>'],
                  ['3/4 in.', '¾ inch — trailing period ok'],
                  ['1ft 6in', '18 inches — feet + in suffix'],
                  ['1\' 6&quot;', '18 inches — feet + glyph'],
                ]"
                :key="row[0]"
                class="text-body"
              >
                <td class="py-1.5 font-mono text-teal-300/80" v-html="row[0]" />
                <td class="py-1.5 text-muted" v-html="row[1]" />
              </tr>
            </tbody>
          </table>
          <p class="text-xs text-dim">
            <span class="text-warning-400 font-medium">Not accepted:</span>
            <code class="text-teal-300/80">inch</code> or
            <code class="text-teal-300/80">inches</code> (the full word) — use
            <code class="text-teal-300/80">in</code>, a
            <code class="text-teal-300/80">"</code> glyph, or no suffix at all.
            Curly/smart quotes are also not recognised.
          </p>
        </template>
      </div>
    </template>
  </UModal>
</template>
