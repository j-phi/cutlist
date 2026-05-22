<template>
  <div
    class="overflow-y-auto px-3 py-3 text-xs text-muted leading-relaxed space-y-3"
  >
    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Cut plans
      </h3>
      <p>
        Each board shows how your parts will be cut from that sheet or stick.
        Boards are added automatically as needed to fit all your parts, using
        the stock you defined in the Stock tab.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Cut mode
      </h3>
      <p>Controls the packing algorithm used to arrange parts.</p>
      <ul class="list-disc pl-4 marker:text-dim space-y-1">
        <li>
          <span class="text-body">Auto</span> — tries all modes and picks the
          best result.
        </li>
        <li>
          <span class="text-body">Tidy</span> — guillotine cuts only (straight,
          edge-to-edge). Ideal for table saw or track saw work.
        </li>
        <li>
          <span class="text-body">Compact</span> — allows non-guillotine
          placement for tighter nesting and less waste.
        </li>
        <li>
          <span class="text-body">CNC</span> — optimized for router and jigsaw
          workflows where cut paths can be arbitrary.
        </li>
      </ul>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Blade kerf
      </h3>
      <p>
        Material consumed by the blade on each cut. Enter your saw blade's kerf
        width here. Applies to both sheets and timber, and is accounted for in
        all spacing between parts.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Margin
        <span class="normal-case font-normal text-dim">(sheets only)</span>
      </h3>
      <p>
        A border reserved on all four edges of each board. Use it for rough mill
        edges, clamping clearance, or to avoid defects near the edge. Does not
        affect timber. Set once here and it applies to all sheet stock.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Part labels
      </h3>
      <ul class="list-disc pl-4 marker:text-dim space-y-1">
        <li>
          <span class="text-body">Part #s</span> — shows the part number from
          the BOM on each piece in the layout.
        </li>
        <li>
          <span class="text-body">Part names</span> — shows the part name from
          the BOM instead. Toggle as needed for readability.
        </li>
      </ul>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Manual placement
      </h3>
      <p>
        Enable to drag and drop parts between boards to override the automatic
        layout. Useful for grain matching, toolpath optimization, or when you
        want a specific part on a specific board.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        PDF export
      </h3>
      <p>
        Exports all boards as a printable cut plan, including dimensions, part
        numbers, and material information for each board.
      </p>
    </section>
  </div>
</template>
