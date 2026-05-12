<template>
  <div
    class="overflow-y-auto px-3 py-3 text-xs text-muted leading-relaxed space-y-3"
  >
    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Stock
      </h3>
      <p>
        The materials you have on hand — sheets like plywood, or timber sold in
        sticks. Parts get packed onto these to minimise waste.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Sheet vs Timber
      </h3>
      <ul class="list-disc pl-4 marker:text-dim space-y-1">
        <li>
          <span class="text-body">Sheet</span> — 2D panels (W × L) and
          thicknesses.
        </li>
        <li>
          <span class="text-body">Timber</span> — 1D sticks with a cross-section
          and lengths.
        </li>
      </ul>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Material allowance
      </h3>
      <p>
        Extra material reserved
        <em class="text-body not-italic font-medium">per part</em>, for planing
        rough stock down or leaving waste for crosscuts.
      </p>
      <ul class="list-disc pl-4 marker:text-dim space-y-1">
        <li>
          <span class="text-body">Length</span> — added to each part's length on
          the stick.
        </li>
        <li>
          <span class="text-body">Cross-section</span> — for timber, added to
          width and thickness (S4S planing takes from all four faces). For
          sheets, added to the rip width only.
        </li>
      </ul>
      <p>
        Example: 4 parts × 500 mm on a 2400 mm stick, +50 mm length allowance →
        4 × 550 = 2200 mm used, 200 mm offcut.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Blade kerf
      </h3>
      <p>
        Set in <span class="text-body">Settings</span>, applied to every cut on
        top of any allowance. Allowance is for planing or trimming; kerf is the
        material lost to the blade itself.
      </p>
    </section>
  </div>
</template>
