<script lang="ts" setup>
import {
  STORAGE_KEYS,
  getLocalStorageJson,
  setLocalStorageJson,
} from '~/utils/localStorage';

const props = defineProps<{ projectId: string }>();

function load(projectId: string): boolean {
  const stored = getLocalStorageJson<boolean>(
    STORAGE_KEYS.ui.projectStockHelpExpanded(projectId),
  );
  return typeof stored === 'boolean' ? stored : true;
}

const expanded = ref(load(props.projectId));

watch(
  () => props.projectId,
  (id) => {
    expanded.value = load(id);
  },
);

watch(expanded, (value) => {
  setLocalStorageJson(
    STORAGE_KEYS.ui.projectStockHelpExpanded(props.projectId),
    value,
  );
});
</script>

<template>
  <div
    class="border border-default rounded-lg bg-base overflow-hidden shrink-0"
  >
    <button
      type="button"
      class="flex items-center gap-2 w-full p-3 text-left hover:bg-surface transition-colors"
      :aria-expanded="expanded"
      aria-label="Toggle how stock works"
      data-testid="stock-help-toggle"
      @click="expanded = !expanded"
    >
      <UIcon
        :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        class="w-4 h-4 text-dim shrink-0"
      />
      <span class="text-sm font-medium text-hi">How stock works</span>
    </button>

    <div
      v-if="expanded"
      class="px-4 pb-4 pt-1 space-y-5 text-sm text-body border-t border-subtle"
    >
      <section class="space-y-1.5">
        <h4 class="text-xs font-medium text-muted uppercase tracking-wider">
          What is "stock"?
        </h4>
        <p class="text-muted">
          Stock is the material you have on hand for the build: sheet goods like
          plywood / MDF, or timber like 2×4s and dressed pine. Each entry
          describes the dimensions you can buy, not a specific board. The packer
          lays your parts onto these materials and minimises waste.
        </p>
      </section>

      <section class="space-y-1.5">
        <h4 class="text-xs font-medium text-muted uppercase tracking-wider">
          Sheet vs Timber
        </h4>
        <ul class="text-muted space-y-1 pl-4 list-disc marker:text-dim">
          <li>
            <span class="text-body">Sheet</span> — 2D panels. Set one or more
            board sizes (width × length) and the thicknesses available.
          </li>
          <li>
            <span class="text-body">Timber</span> — 1D sticks. Set the
            cross-section (W × T) and the lengths it's sold in (e.g. 2400, 3000,
            3600 mm).
          </li>
        </ul>
      </section>

      <section class="space-y-1.5">
        <h4 class="text-xs font-medium text-muted uppercase tracking-wider">
          Material allowance
        </h4>
        <p class="text-muted">
          Extra material reserved <span class="text-body">per part</span>, not
          at the end of the stock. Use it when you're buying rougher stock and
          planing it down to the modeled size, or to leave waste at each end for
          crosscutting.
        </p>
        <div
          class="rounded border border-subtle bg-default p-3 font-mono text-xs text-muted space-y-1"
        >
          <p class="text-dim">
            Example — 4 parts of 500 mm on a 2400 mm stick, with +50 mm length
            allowance:
          </p>
          <p>
            <span class="text-teal-400">Reserved per part</span> = 500 + 50 =
            550 mm
          </p>
          <p>
            <span class="text-teal-400">Total used</span> = 4 × 550 = 2200 mm
          </p>
          <p>
            <span class="text-teal-400">Offcut</span> = 2400 − 2200 = 200 mm
          </p>
        </div>
        <ul class="text-muted space-y-1 pl-4 list-disc marker:text-dim mt-2">
          <li>
            <span class="text-body">Along length</span> — added to every part's
            length on the stick. Crosscut waste, end-trim.
          </li>
          <li>
            <span class="text-body">Across cross-section</span> — for timber,
            added to each part's width <em>and</em> thickness (S4S planing
            removes material on all four faces). For sheet stock, added to the
            rip-direction width only.
          </li>
          <li>
            Leave both at <span class="text-body">0</span> when your modeled
            dimensions are the finished stock dimensions.
          </li>
        </ul>
      </section>

      <section class="space-y-1.5">
        <h4 class="text-xs font-medium text-muted uppercase tracking-wider">
          The "Detected … stock sizes" banner
        </h4>
        <p class="text-muted">
          On the BOM tab, the suggester clusters your parts by cross-section and
          offers matching presets in one click. It writes a per-cluster
          allowance automatically — if your parts are modeled smaller than the
          catalogue preset (e.g. 66 mm parts vs a 70 mm stick), the gap becomes
          the cross-section allowance, so the packer accepts the parts on the
          rougher stock.
        </p>
      </section>

      <section class="space-y-1.5">
        <h4 class="text-xs font-medium text-muted uppercase tracking-wider">
          Blade kerf
        </h4>
        <p class="text-muted">
          The saw kerf set in <span class="text-body">Settings</span> applies to
          every cut, on top of any allowance. Allowance reserves material for
          planing or end-trimming; kerf reserves the material lost to the saw
          blade itself.
        </p>
      </section>
    </div>
  </div>
</template>
