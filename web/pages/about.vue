<template>
  <div class="absolute inset-0 overflow-y-auto bg-base">
    <div class="max-w-2xl mx-auto px-6 py-12">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-2 text-dim hover:text-body text-xs transition-colors mb-10"
      >
        <UIcon name="i-lucide-arrow-left" class="w-3 h-3" />
        Back to app
      </NuxtLink>

      <h1 class="text-2xl font-semibold text-white mb-1">Cutlist Generator</h1>
      <p class="text-dim text-body mt-2 mb-10">
        A free cutting plan optimizer, built for the workshop.
      </p>

      <section class="space-y-8 text-sm text-body leading-relaxed">
        <div>
          <p>
            Cutlist Generator is built on the foundation of
            <a
              href="https://github.com/matthewcobb/cutlist"
              target="_blank"
              class="text-teal-400 hover:text-teal-300 underline"
              >Matthew Cobb's exceptional Cutlist app</a
            >
            &mdash; a beautifully simple browser-based cutting plan tool. We've
            extended it with a multi-strategy packing tournament, 3D model
            import, edge banding, cost optimization, part label export, a
            rich-text build doc, and more.
          </p>
          <p class="mt-3">
            Everything runs entirely in your browser. No server, no accounts, no
            sign-up required. We hope you find it as useful as we do.
          </p>
        </div>

        <div>
          <h2
            class="text-teal-400 text-xs font-semibold uppercase tracking-wider mb-3"
          >
            What it does
          </h2>
          <p>
            Whether you model in Onshape, Fusion 360, SketchUp, or FreeCAD,
            Cutlist Generator speaks your language. Import
            <strong class="text-white">GLTF</strong>,
            <strong class="text-white">GLB</strong>,
            <strong class="text-white">FBX</strong>, or
            <strong class="text-white">COLLADA/.dae</strong> files and parts are
            extracted automatically &mdash; or enter them by hand if you prefer.
            Assign stock materials &mdash; sheet goods like plywood or MDF, or
            dimensional lumber like 2&times;4s &mdash; and the app figures out
            how to fit everything onto the fewest boards and sticks possible.
            Export a PDF cutting diagram to take to the workshop, or save the
            project as a <code class="text-teal-300">.cutlist</code> file to
            share with a cut service or a collaborator.
          </p>
        </div>

        <div>
          <h2
            class="text-teal-400 text-xs font-semibold uppercase tracking-wider mb-3"
          >
            The cutting engine
          </h2>
          <p>
            For sheet stock, the engine runs a
            <strong class="text-white">tournament</strong> &mdash; multiple
            packing strategies compete against each other and the best layout
            wins. Three strategies enter, one leaves:
            <strong class="text-white">Tidy</strong> (a guillotine packer that
            aligns similar-width parts into clean columns &mdash; the closest
            thing to laying parts out by hand on a table saw),
            <strong class="text-white">Compact</strong> (a free-rect guillotine
            packer that squeezes every last millimetre of yield), and
            <strong class="text-white">CNC</strong> (non-guillotine, for routers
            that can cut anywhere on a sheet). Pin a strategy per project, or
            per material when one stock suits one style and another suits
            another.
          </p>
          <p class="mt-3">
            Scoring is multi-dimensional: fewest boards first, then least waste,
            then tightest concentration &mdash; and if you've added sheet
            prices,
            <strong class="text-white">material cost</strong> enters the
            objective too. The tournament finds the layout that's genuinely
            cheapest to build, not just the one that uses the fewest cuts.
          </p>
          <p class="mt-3">
            For dimensional lumber, the engine runs a
            <strong class="text-white">1D first-fit-decreasing</strong> packer:
            parts are matched to sticks of the same cross-section and laid out
            longest-first with kerf between cuts. Short offcuts get reused on
            earlier sticks via multi-board lookback, and the shopping list tells
            you exactly how many sticks of each length to buy.
          </p>
          <p class="mt-3">
            When edge banding is enabled, the engine
            <strong class="text-white">subtracts banding thickness</strong> from
            part cut sizes automatically &mdash; so the diagram shows the
            dimension you actually cut, not the finished size. Measurement
            labels on the board diagram can be switched between edge, outside,
            inside, or text-only mode to match whatever your workshop workflow
            demands.
          </p>
        </div>

        <div>
          <h2
            class="text-teal-400 text-xs font-semibold uppercase tracking-wider mb-3"
          >
            Features
          </h2>
          <ul class="space-y-3 mt-2">
            <li
              v-for="feature in features"
              :key="feature.title"
              class="flex gap-3"
            >
              <UIcon
                :name="feature.icon"
                class="w-4 h-4 text-teal-400 shrink-0 mt-0.5"
              />
              <div>
                <strong class="text-white">{{ feature.title }}</strong>
                <span class="text-muted">
                  &mdash; {{ feature.description }}</span
                >
              </div>
            </li>
          </ul>
        </div>

        <div>
          <h2
            class="text-teal-400 text-xs font-semibold uppercase tracking-wider mb-3"
          >
            Privacy
          </h2>
          <p>
            Your projects and models are stored locally in your browser &mdash;
            nothing is sent to any server. No accounts, no cookies, no
            cross-site tracking, no ad networks.
          </p>
          <p class="mt-3">
            All third-party data collection is currently
            <strong class="text-white">disabled</strong>. No analytics scripts
            load, no error reports are sent, and no usage data of any kind
            leaves your machine. The app runs fully offline once loaded.
          </p>
        </div>

        <div>
          <p>
            Cutlist Generator is
            <strong class="text-white">free to use</strong> with no sign-up. The
            app is still in active development &mdash; if you have feedback or
            ideas,
            <a
              href="https://github.com/j-phi/cutlist/issues"
              target="_blank"
              class="text-teal-400 hover:text-teal-300 underline"
              >open an issue on GitHub</a
            >.
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<script lang="ts" setup>
const features = [
  {
    icon: 'i-lucide-box',
    title: '3D model import',
    description:
      'GLTF, GLB, FBX, and COLLADA (.dae) from Blender, Fusion 360, SketchUp, Onshape, FreeCAD, and others. Parts are extracted automatically.',
  },
  {
    icon: 'i-lucide-pencil',
    title: 'Manual parts entry',
    description:
      'No 3D model? Enter parts by hand with dimensions, quantity, and material.',
  },
  {
    icon: 'i-lucide-layout-grid',
    title: 'Tournament optimizer',
    description:
      'Tidy, compact, and CNC packers compete — the cleanest layout with the fewest boards and least waste wins.',
  },
  {
    icon: 'i-lucide-square',
    title: 'Sheet goods + dimensional lumber',
    description:
      'Pack plywood / MDF and 2×4s / CLS / dowels in the same project. The engine routes each part to the right stock kind automatically.',
  },
  {
    icon: 'i-lucide-scissors',
    title: 'Real-world cuts',
    description:
      'Layouts produce edge-to-edge cuts you can actually make with a track saw or panel saw.',
  },
  {
    icon: 'i-lucide-rotate-3d',
    title: 'Grain direction lock',
    description: "Lock grain per part so the optimizer won't rotate it.",
  },
  {
    icon: 'i-lucide-file-down',
    title: 'PDF export',
    description:
      'Download cutting diagrams to take to the workshop or send to a cut service.',
  },
  {
    icon: 'i-lucide-eye',
    title: '3D viewer',
    description:
      'Inspect your imported model with orbit, zoom, and part selection.',
  },
  {
    icon: 'i-lucide-hard-drive',
    title: 'Offline & private',
    description:
      'No server, no accounts, no invasive tracking. Your data stays on your machine.',
  },
  {
    icon: 'i-lucide-tag',
    title: 'Part label stickers',
    description:
      'Export a printable sticker sheet — one label per part — to stick directly onto your boards as you cut.',
  },
  {
    icon: 'i-lucide-frame',
    title: 'Edge banding',
    description:
      'Mark banded faces per part. The shopping list and PDF report total banding length and estimated cost.',
  },
  {
    icon: 'i-lucide-circle-dollar-sign',
    title: 'Cost optimization',
    description:
      'Set a price per sheet and let the optimizer minimize material cost, not just board count.',
  },
  {
    icon: 'i-lucide-notebook-pen',
    title: 'Build doc',
    description:
      'Write step-by-step assembly instructions alongside your project, with images and embedded 3D viewer scenes.',
  },
  {
    icon: 'i-lucide-film',
    title: 'Scene timeline',
    description:
      'Capture named viewer states — exploded views, step callouts, hidden parts — and play them back as a build sequence.',
  },
];

useHead({
  title: 'About — Cutlist Generator | Free Cutting Plan Optimizer',
  meta: [
    {
      name: 'description',
      content:
        'Cutlist Generator is a free browser-based tool for optimizing wood cutting plans. Import GLTF, GLB, or COLLADA 3D models or enter parts manually, assign stock materials, and generate efficient board layouts with PDF export. No sign-up, no server — runs entirely in your browser.',
    },
    {
      name: 'keywords',
      content:
        'cutlist generator, cutting plan optimizer, wood cutting layout, panel optimization, sheet goods calculator, plywood cutting plan, board layout tool, CNC nesting, guillotine cut optimizer, woodworking software, free cutlist tool, GLTF import woodworking, COLLADA woodworking',
    },
    {
      property: 'og:title',
      content: 'Cutlist Generator — Free Cutting Plan Optimizer',
    },
    {
      property: 'og:description',
      content:
        'Turn your parts list into optimized cutting plans. Import 3D models or enter parts by hand, assign stock materials, and generate efficient board layouts. Free, private, browser-based.',
    },
    {
      property: 'og:type',
      content: 'website',
    },
  ],
});
</script>
