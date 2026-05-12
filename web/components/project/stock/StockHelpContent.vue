<template>
  <div class="tiptap-doc overflow-y-auto px-4 py-4">
    <h3>Stock</h3>
    <p>
      The materials you have on hand — sheets like plywood, or timber sold in
      sticks. Parts get packed onto these to minimise waste.
    </p>

    <h3>Sheet vs Timber</h3>
    <ul>
      <li><strong>Sheet</strong> — 2D panels (W × L) and thicknesses.</li>
      <li>
        <strong>Timber</strong> — 1D sticks with a cross-section and lengths.
      </li>
    </ul>

    <h3>Material allowance</h3>
    <p>
      Extra material reserved <em>per part</em>, for planing rough stock down or
      leaving waste for crosscuts.
    </p>
    <ul>
      <li>
        <strong>Length</strong> — added to each part's length on the stick.
      </li>
      <li>
        <strong>Cross-section</strong> — for timber, added to width and
        thickness (S4S planing takes from all four faces). For sheets, added to
        the rip width only.
      </li>
    </ul>
    <p>
      Example: 4 parts × 500 mm on a 2400 mm stick, +50 mm length allowance → 4
      × 550 = 2200 mm used, 200 mm offcut.
    </p>

    <h3>Blade kerf</h3>
    <p>
      Set in <strong>Settings</strong>, applied to every cut on top of any
      allowance. Allowance is for planing or trimming; kerf is the material lost
      to the blade itself.
    </p>
  </div>
</template>
