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
          <span class="text-body">Sheet</span> — a 2D panel defined by width,
          length, and thickness. Parts are nested onto the face of the board.
        </li>
        <li>
          <span class="text-body">Timber</span> — a 1D stick defined by
          cross-section dimensions and available lengths. Parts are cut along
          the stick.
        </li>
      </ul>
      <p>
        Parts are matched to stock by material name and thickness (sheets) or
        cross-section (timber). Names must match exactly.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Material allowance
        <span class="normal-case font-normal text-dim">(timber only)</span>
      </h3>
      <p>
        Extra material added
        <em class="text-body not-italic font-medium">per part</em> to account
        for rough stock. Two dimensions:
      </p>
      <ul class="list-disc pl-4 marker:text-dim space-y-1">
        <li>
          <span class="text-body">Along length</span> — waste reserved for
          crosscuts and end trimming.
        </li>
        <li>
          <span class="text-body">Across cross-section</span> — extra width and
          thickness for S4S planing (material is removed from all four faces).
        </li>
      </ul>
      <p>
        Example: 4 parts × 500 mm, +50 mm length allowance → 4 × 550 = 2200 mm
        consumed on the stick.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Cost
        <span class="normal-case font-normal text-dim">(optional)</span>
      </h3>
      <p>
        An optional price per board for each sheet size, in whatever currency
        you like (the number is shown as-is). When set, the cut plan's shopping
        list reports the material cost per material and a project total —
        counting only the general boards you have to buy, not offcuts you
        already own. Sizes left blank are simply omitted from the cost.
      </p>
      <p>
        The shopping list also shows <span class="text-body">yield</span> — the
        share of each purchased board's area actually used by your parts,
        measured against whole boards consumed.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Blade kerf
      </h3>
      <p>
        Material consumed by the blade on each cut. Set in the
        <span class="text-body">Layout</span> tab toolbar. Applies to both
        sheets and timber.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Margin
        <span class="normal-case font-normal text-dim">(sheets only)</span>
      </h3>
      <p>
        A border inset applied to all four edges of every board, set in the
        <span class="text-body">Layout</span> tab toolbar. Use it to reserve
        clamping space or avoid rough mill edges. It shrinks the usable area of
        the whole board, not individual parts.
      </p>
    </section>
  </div>
</template>
