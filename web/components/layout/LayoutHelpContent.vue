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
        Optimize for
      </h3>
      <p>
        Sets the goal the packing engine ranks layouts by. Found in Optimization
        settings (<span class="text-body">⚙</span> icon).
      </p>
      <ul class="list-disc pl-4 marker:text-dim space-y-1">
        <li>
          <span class="text-body">Fewest boards</span> — uses the smallest
          number of boards, then the least waste. The default.
        </li>
        <li>
          <span class="text-body">Least waste</span> — minimizes leftover
          material area.
        </li>
        <li>
          <span class="text-body">Lowest cost</span> — favors the cheapest mix
          of boards to buy. Available only once at least one stock size has a
          price (set per size in the Stock tab); materials with any unpriced
          size fall back to fewest-boards.
        </li>
      </ul>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Edge banding
      </h3>
      <p>
        Mark which of a part's four edges are banded from the BOM tab (the
        dashed-edge icon on each row). The total banding length — and its cost
        when you set a cost-per-length in Optimization settings — appears in the
        shopping list and PDF.
      </p>
      <ul class="list-disc pl-4 marker:text-dim space-y-1">
        <li>
          <span class="text-body">Subtract banding thickness OFF</span> (the
          default) treats banding as a finish overlay: the part's nominal
          finished size is packed unchanged.
        </li>
        <li>
          <span class="text-body">Subtract banding thickness ON</span> reduces
          the cut size by the banding thickness on each banded edge — banded
          length-edges trim the width, banded width-edges trim the length — so
          the finished part lands on size once banded. The BOM then shows both
          the cut and the finished size.
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
        Align
        <span class="normal-case font-normal text-dim">(sheets only)</span>
      </h3>
      <p>
        Shifts the packed parts as one block to a corner of each board — left or
        right, top or bottom. This is purely presentational: it slides where the
        cluster rests on the sheet but does not change the packing, the number
        of boards, the cuts, or how much material you use. Handy for keeping
        offcut left over in one predictable corner.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Panel order
      </h3>
      <p>
        Controls how boards are sorted within each material group. Found in
        Optimization settings (<span class="text-body">⚙</span> icon).
      </p>
      <ul class="list-disc pl-4 marker:text-dim space-y-1">
        <li>
          <span class="text-body">Board order</span> — keeps boards in the
          sequence the packing engine produced them. Panels stay fixed while you
          drag parts between boards in manual placement, so nothing jumps
          unexpectedly.
        </li>
        <li>
          <span class="text-body">Fullest first</span> — sorts the most densely
          packed boards to the front. Useful for spotting waste at a glance:
          nearly-full boards appear first, sparse boards last.
        </li>
      </ul>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Kerf vs offcut
      </h3>
      <p>
        Not every gap on a board is waste. The thin strips between adjacent
        parts are the
        <span class="text-body">blade kerf</span> — material the saw turns to
        dust on each cut — drawn distinctly from the larger
        <span class="text-body">leftover</span> regions. Leftover regions are
        the usable offcut beyond your packed parts and are labelled with their
        dimensions so you can tell at a glance what is reusable.
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
        <li>
          <span class="text-body">Color parts</span> — fills each piece with a
          stable per-part color. The same color follows a part into the PDF
          export (enable "Color pieces by part" there) so a piece is easy to
          match across screen and print.
        </li>
      </ul>
      <p>
        Names read <span class="text-body">horizontally first</span>: a label
        runs left-to-right and wraps onto up to three lines, rotating to
        vertical only when a piece is too narrow to hold the wrapped name.
        Screen and PDF make the same decision, so a label looks the same in
        both.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Measurement style
      </h3>
      <p>
        When you enable "Show dimensions on pieces" in the PDF export dialog,
        choose how each piece's size is drawn. Your choice is saved with the
        project.
      </p>
      <ul class="list-disc pl-4 marker:text-dim space-y-1">
        <li>
          <span class="text-body">Edge</span> (the default) — engineering
          dimension lines with arrows along each piece's own edges.
        </li>
        <li>
          <span class="text-body">Outside</span> — every piece's width and
          height dimensioned in the margin outside the sheet. Shared edges
          collapse to one dimension and nested sizes stack outward (smallest
          nearest the board) so the lines never cross — the numbers never sit on
          a piece.
        </li>
        <li>
          <span class="text-body">Inside</span> — every piece's width and height
          drawn as dimension lines with arrows inside the piece itself (width
          along the bottom, height up the left edge).
        </li>
        <li>
          <span class="text-body">Text</span> — just the plain W × H size
          centered in each piece, with no dimension lines.
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

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Label export
      </h3>
      <p>
        <span class="text-body">Labels</span> generates a separate PDF of cut
        stickers — one label per part instance (a quantity of 3 prints 3
        stickers). Each label carries the part name and number, the finished
        length × width × thickness, the material, and which board the piece is
        cut from — named after the originating stock (offcuts read “Offcut:
        &lt;name&gt;”, other boards read the stock name plus a board number).
        Parts with a locked grain direction show a grain arrow along the long
        axis. Choose an Avery label-stock preset (5160 / 30-up or 5163 / 10-up)
        to print onto sticker sheets. The button is disabled until you have
        generated a layout, since a label needs to know its board.
      </p>
    </section>
  </div>
</template>
