<template>
  <div class="overflow-y-auto px-3 py-3 space-y-5 text-sm text-body">
    <section class="space-y-1.5">
      <h4 class="text-xs font-medium text-muted uppercase tracking-wider">
        What is "stock"?
      </h4>
      <p class="text-muted">
        Stock is the material you have on hand: sheet goods like plywood / MDF,
        or timber like 2×4s and dressed pine. Each entry describes the
        dimensions you can buy. The packer lays your parts onto these materials
        and minimises waste.
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
          cross-section (W × T) and the lengths it's sold in.
        </li>
      </ul>
    </section>

    <section class="space-y-1.5">
      <h4 class="text-xs font-medium text-muted uppercase tracking-wider">
        Material allowance
      </h4>
      <p class="text-muted">
        Extra material reserved <span class="text-body">per part</span>, not at
        the end of the stock. Use it when you're buying rougher stock and
        planing it down to the modeled size, or to leave waste at each end for
        crosscutting.
      </p>
      <div
        class="rounded border border-subtle bg-default p-2.5 font-mono text-xs text-muted space-y-1"
      >
        <p class="text-dim">
          4 parts × 500 mm on a 2400 mm stick, +50 mm length allowance:
        </p>
        <p><span class="text-teal-400">Per part</span> = 500 + 50 = 550 mm</p>
        <p><span class="text-teal-400">Total</span> = 4 × 550 = 2200 mm</p>
        <p><span class="text-teal-400">Offcut</span> = 2400 − 2200 = 200 mm</p>
      </div>
      <ul class="text-muted space-y-1 pl-4 list-disc marker:text-dim mt-2">
        <li>
          <span class="text-body">Along length</span> — added to every part's
          length on the stick.
        </li>
        <li>
          <span class="text-body">Across cross-section</span> — for timber,
          added to each part's width <em>and</em> thickness (S4S planing removes
          material from all four faces). For sheet stock, added to the
          rip-direction width only.
        </li>
        <li>
          Leave both at <span class="text-body">0</span> when modeled dims =
          stock dims.
        </li>
      </ul>
    </section>

    <section class="space-y-1.5">
      <h4 class="text-xs font-medium text-muted uppercase tracking-wider">
        The suggestion banner
      </h4>
      <p class="text-muted">
        On the BOM tab, the suggester clusters parts by cross-section and offers
        matching presets in one click. It writes the cross-section allowance
        automatically — if parts are modeled smaller than a catalogue preset
        (e.g. 66 mm parts vs a 70 mm stick), the gap becomes the allowance.
      </p>
    </section>

    <section class="space-y-1.5">
      <h4 class="text-xs font-medium text-muted uppercase tracking-wider">
        Blade kerf
      </h4>
      <p class="text-muted">
        The saw kerf set in <span class="text-body">Settings</span> applies to
        every cut, on top of any allowance. Allowance reserves material for
        planing or end-trimming; kerf reserves the material lost to the blade
        itself.
      </p>
    </section>
  </div>
</template>
