<template>
  <div
    class="overflow-y-auto px-3 py-3 text-xs text-muted leading-relaxed space-y-3"
  >
    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Bill of Materials
      </h3>
      <p>
        Your full parts list. Parts are extracted automatically from imported 3D
        models, or entered manually. Each part has dimensions, a quantity, and a
        material that determines which stock it gets cut from.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Adding parts
      </h3>
      <ul class="list-disc pl-4 marker:text-dim space-y-1">
        <li>
          <span class="text-body">Import a 3D model</span> — drag and drop a
          .gltf, .glb, .dae, or .fbx file onto this tab, or use the import
          button. Parts and materials are extracted automatically.
        </li>
        <li>
          <span class="text-body">Add Part</span> — enter dimensions, quantity,
          and material manually using the Add Part button.
        </li>
        <li>
          <span class="text-body">Paste from a spreadsheet</span> — copy rows
          from a spreadsheet (Name, Quantity, Length, Width, Material) and paste
          them in the Add Part dialog.
        </li>
      </ul>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Materials
      </h3>
      <p>
        Parts are grouped by material. For imported models, the material name
        comes from the mesh's color or material in the 3D file. Assign matching
        stock entries in the <span class="text-body">Stock</span> tab — the
        names must match exactly.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Warnings
      </h3>
      <p>
        An amber triangle next to a part means no matching stock was found for
        that material and thickness. Go to the
        <span class="text-body">Stock</span> tab and add a stock entry with a
        matching material name and dimensions.
      </p>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-medium text-hi uppercase tracking-wider">
        Grain direction
      </h3>
      <p>
        The optimizer may rotate parts 90° to reduce waste. Lock the grain
        direction per part to prevent this — useful for figured grain, face
        grain panels, or parts where orientation matters for joinery.
      </p>
    </section>
  </div>
</template>
