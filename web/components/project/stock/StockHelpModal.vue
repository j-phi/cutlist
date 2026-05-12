<script lang="ts" setup>
const open = defineModel<boolean>('open', { default: false });
</script>

<template>
  <UModal v-model:open="open" title="How stock works">
    <template #content>
      <div
        class="bg-elevated border border-default rounded-lg max-h-[80vh] flex flex-col"
      >
        <div class="flex items-center justify-between p-6 pb-4 shrink-0">
          <h3 class="text-lg font-medium text-white">How stock works</h3>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            class="rounded-full"
            @click="open = false"
          />
        </div>

        <div class="overflow-y-auto px-6 pb-6 space-y-6 text-sm text-body">
          <section class="space-y-2">
            <h4 class="text-base font-medium text-hi">What is "stock"?</h4>
            <p class="text-muted">
              Stock is the material you have on hand for the build: sheet goods
              like plywood / MDF, or timber like 2×4s and dressed pine. Each
              entry describes the dimensions you can buy, not a specific board.
              The packer lays your parts onto these materials and minimises
              waste.
            </p>
          </section>

          <section class="space-y-2">
            <h4 class="text-base font-medium text-hi">Sheet vs Timber</h4>
            <ul class="text-muted space-y-1.5 pl-4 list-disc marker:text-dim">
              <li>
                <span class="text-body">Sheet</span> — 2D panels. You set one or
                more board sizes (width × length) and the thicknesses available.
              </li>
              <li>
                <span class="text-body">Timber</span> — 1D sticks. You set the
                cross-section (W × T) and the lengths it's sold in (e.g. 2400,
                3000, 3600 mm).
              </li>
            </ul>
          </section>

          <section class="space-y-2">
            <h4 class="text-base font-medium text-hi">Material allowance</h4>
            <p class="text-muted">
              Extra material reserved <span class="text-body">per part</span>,
              not at the end of the stock. Use it when you're buying rougher
              stock and planing it down to the modeled size, or to reserve waste
              at each end for crosscutting.
            </p>
            <div
              class="rounded border border-subtle bg-base p-3 font-mono text-xs text-muted space-y-1.5"
            >
              <p class="text-dim">
                Example — 4 parts of 500 mm on a 2400 mm stick, with +50 mm
                length allowance:
              </p>
              <p>
                <span class="text-teal-400">Reserved per part</span> = 500 + 50
                = 550 mm
              </p>
              <p>
                <span class="text-teal-400">Total used</span> = 4 × 550 = 2200
                mm
              </p>
              <p>
                <span class="text-teal-400">Offcut</span> = 2400 − 2200 = 200 mm
              </p>
            </div>
            <ul
              class="text-muted space-y-1.5 pl-4 list-disc marker:text-dim mt-2"
            >
              <li>
                <span class="text-body">Along length</span> — added to every
                part's length on the stick. Crosscut waste, end-trim.
              </li>
              <li>
                <span class="text-body">Across cross-section</span> — added to
                each part's width <em>and</em> thickness for timber (S4S planing
                removes material on all four faces). For sheet stock, it's added
                to the rip-direction width only.
              </li>
              <li>
                Leave both at <span class="text-body">0</span> when your modeled
                dimensions are the finished stock dimensions.
              </li>
            </ul>
          </section>

          <section class="space-y-2">
            <h4 class="text-base font-medium text-hi">
              The "Detected … stock sizes" banner
            </h4>
            <p class="text-muted">
              On the BOM tab, the suggester clusters your parts by cross-section
              and offers matching presets in one click. It writes a per-cluster
              allowance automatically — if your parts are modeled smaller than
              the catalogue preset (e.g. 66 mm parts vs a 70 mm stick), the gap
              becomes the cross-section allowance, so the packer accepts the
              parts on the rougher stock.
            </p>
          </section>

          <section class="space-y-2">
            <h4 class="text-base font-medium text-hi">Blade kerf</h4>
            <p class="text-muted">
              The saw kerf set in <span class="text-body">Settings</span>
              applies to every cut, in addition to any allowance. Allowance
              reserves material for planing or end-trimming; kerf reserves the
              material lost to the saw blade itself.
            </p>
          </section>
        </div>
      </div>
    </template>
  </UModal>
</template>
