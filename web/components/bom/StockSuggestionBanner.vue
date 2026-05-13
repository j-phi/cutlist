<script lang="ts" setup>
import { mmToUm } from 'cutlist';
import { suggestStockForProject, type Suggestion } from '~/utils/suggestStock';
import { useStockMutations } from '~/composables/useStockMutations';
import useFormatDistance from '~/composables/useFormatDistance';

const { enabledModels } = useProjects();
const { stock, distanceUnit } = useProjectSettings();
const { add } = useStockMutations();
const formatDistance = useFormatDistance();

const dismissed = ref(false);

const parts = computed(() =>
  enabledModels.value.flatMap((m) => m.parts.map((p) => ({ size: p.size }))),
);

const suggestions = computed<Suggestion[]>(() => {
  if (parts.value.length === 0) return [];
  return suggestStockForProject(
    parts.value,
    distanceUnit.value ?? 'mm',
    stock.value ?? '',
  );
});

const visible = computed(
  () => !dismissed.value && suggestions.value.length > 0,
);

function addAll() {
  add(suggestions.value.map((s) => s.matrix));
  dismissed.value = true;
}
</script>

<template>
  <div
    v-if="visible"
    class="rounded-lg border border-teal-500/40 bg-teal-500/5 p-3 flex items-start gap-3"
    data-testid="stock-suggestion-banner"
  >
    <UIcon
      name="i-lucide-wand-sparkles"
      class="w-5 h-5 text-teal-400 shrink-0 mt-0.5"
    />
    <div class="flex-1 min-w-0">
      <p class="text-sm text-hi font-medium">
        Detected {{ suggestions.length }}
        {{ suggestions.length === 1 ? 'stock size' : 'stock sizes' }}
        from your parts
      </p>
      <ul class="mt-1.5 space-y-0.5">
        <li
          v-for="s in suggestions"
          :key="s.matrix.material"
          class="text-xs text-muted"
          :data-testid="`stock-suggestion-${s.matrix.material}`"
        >
          <span class="text-body">{{ s.matrix.material }}</span>
          <span class="mx-1.5 text-dim">·</span>
          <span
            >{{ s.partsCovered }} part{{
              s.partsCovered === 1 ? '' : 's'
            }}</span
          >
          <template v-if="(s.matrix.oversize?.crossSection ?? 0) > 0">
            <span class="mx-1.5 text-dim">·</span>
            <span class="text-amber-400">
              +{{ formatDistance(mmToUm(s.matrix.oversize!.crossSection)) }}
              extra material
            </span>
          </template>
        </li>
      </ul>
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      <UButton
        size="xs"
        color="primary"
        icon="i-lucide-plus"
        data-testid="stock-suggestion-add-all"
        @click="addAll"
      >
        Add all
      </UButton>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        aria-label="Dismiss stock suggestions"
        data-testid="stock-suggestion-dismiss"
        @click="dismissed = true"
      />
    </div>
  </div>
</template>
