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
            Thanks for stopping by! I wanted a simple way to take a 3D model and
            lay it out onto sheet material &mdash; something that would tell me
            exactly how to cut my boards with minimal waste. The tools that
            existed were either expensive, clunky, or didn't produce cuts you
            could actually make with a track saw.
          </p>
          <p class="mt-3">
            I'm currently building out my own workshop and have been using
            Cutlist to plan and cut all of my workbenches.
          </p>
          <p class="mt-3">
            I've found it incredibly useful already and I hope you do too.
          </p>
        </div>

        <div>
          <h2
            class="text-teal-400 text-xs font-semibold uppercase tracking-wider mb-3"
          >
            What it does
          </h2>
          <p>
            I typically work in OnShape, and wanted a simple way to generate a
            cut list for my projects. Cutlist Studio currently supports Onshape
            and Sketchup imports: (<strong class="text-white">GLTF</strong>,
            <strong class="text-white">GLB</strong>, or
            <strong class="text-white">COLLADA/.dae</strong>) or enter parts by
            hand. Assign stock materials, and the app figures out how to fit
            everything onto the fewest boards possible. Export a PDF cutting
            diagram to take to the workshop, or save the project as a
            <code class="text-teal-300">.cutlist</code> file to share with
            others.
          </p>
        </div>

        <div>
          <h2
            class="text-teal-400 text-xs font-semibold uppercase tracking-wider mb-3"
          >
            The cutting engine
          </h2>
          <p>
            This is the part I'm most proud of. The engine runs a
            <strong class="text-white">tournament</strong> &mdash; multiple
            packing strategies compete against each other and the best layout
            wins. Strategies include strip packing (grouping similar-sized parts
            into rows), guillotine cutting (where every cut goes edge-to-edge,
            just like a real panel saw), and tight packing for CNC routers that
            can cut anywhere on a sheet.
          </p>
          <p class="mt-3">
            The strip packer deserves a special mention &mdash; it groups parts
            by dimension and stacks them into simple horizontal or vertical
            strips. The result is layouts that are
            <strong class="text-white">dead simple to cut by hand</strong>
            with a track saw or circular saw, and they're often the most
            material-efficient too.
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
            nothing is sent to any server. No accounts, no tracking. The only
            external service is
            <strong class="text-white">Sentry</strong>, which reports errors so
            I can fix bugs. That's it.
          </p>
        </div>

        <div>
          <p>
            Cutlist Generator is
            <strong class="text-white">free to use</strong> with no sign-up. The
            app is still in active development &mdash; if you have feedback or
            ideas,
            <a
              href="https://github.com/matthewcobb/cutlist/issues"
              target="_blank"
              class="text-teal-400 hover:text-teal-300 underline"
              >open an issue on GitHub</a
            >.
          </p>
        </div>
      </section>

      <p class="mt-12 text-dim text-xs">Built by Matt!</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
const features = [
  {
    icon: 'i-lucide-box',
    title: '3D model import',
    description:
      'GLTF, GLB, and COLLADA (.dae) from Blender, Fusion 360, SketchUp, FreeCAD, and others. Parts are extracted automatically.',
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
      'Strip, guillotine, and tight packers compete — the layout with the fewest boards and least waste wins.',
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
      'No server, no accounts, no tracking. Your data stays on your machine.',
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
