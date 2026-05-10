<script lang="ts" setup>
/**
 * Onboarding accordion that lists supported 3D-model import workflows.
 * Shared between the landing page and the BOM empty state. Pass
 * `:show-manual="false"` where a sibling button already exposes manual
 * entry (BOM empty state). `dense` tightens the trigger padding for
 * compact empty-state layouts.
 */
const props = withDefaults(
  defineProps<{
    showManual?: boolean;
    dense?: boolean;
  }>(),
  { showManual: true, dense: false },
);

const ALL_ITEMS = [
  {
    value: 'onshape',
    label: 'From Onshape',
    icon: 'i-lucide-box',
    slot: 'onshape',
    content: ' ',
  },
  {
    value: 'sketchup',
    label: 'From SketchUp',
    icon: 'i-lucide-pentagon',
    slot: 'sketchup',
    content: ' ',
  },
  {
    value: 'other',
    label: 'Other 3D tools',
    icon: 'i-lucide-blocks',
    slot: 'other',
    content: ' ',
  },
  {
    value: 'manual',
    label: 'No 3D model? Add parts by hand',
    icon: 'i-lucide-pencil-ruler',
    slot: 'manual',
    content: ' ',
  },
];

const items = computed(() =>
  props.showManual ? ALL_ITEMS : ALL_ITEMS.slice(0, 3),
);
</script>

<template>
  <UAccordion
    :items="items"
    type="single"
    collapsible
    :ui="{
      item: 'border border-subtle rounded-lg mb-2 overflow-hidden last:border-b last:border-b-subtle',
      trigger: dense
        ? 'px-4 py-2.5 hover:bg-mist-900 transition-colors data-[state=open]:bg-mist-900'
        : 'px-4 py-3 hover:bg-mist-900 transition-colors data-[state=open]:bg-mist-900',
      content: 'border-t border-subtle',
      body: dense ? 'px-4 py-3' : 'px-4 py-4',
      label: 'text-sm font-medium text-body',
      leadingIcon: 'text-teal-400',
    }"
  >
    <template #onshape-body>
      <div class="space-y-3 text-sm text-muted leading-relaxed">
        <p>
          <strong class="text-body">Onshape</strong> exports natively to
          <span class="font-mono text-dim">.gltf</span>
          &mdash; the format Cutlist Studio reads best.
        </p>
        <ol class="space-y-2 list-decimal list-inside">
          <li>
            Model each part at its real-world dimensions. Assign a
            <strong class="text-body">unique appearance colour</strong>
            to each material &mdash; e.g. oak parts one colour, plywood another.
          </li>
          <li>
            Go to <strong class="text-body">File &rarr; Export</strong>, set
            format to <span class="font-mono text-dim">GLTF</span>, and
            download.
          </li>
          <li>
            Drag the <span class="font-mono text-dim">.gltf</span> file into
            Cutlist Studio, or click
            <strong class="text-body">Import Model</strong> inside your project.
          </li>
        </ol>
        <img
          src="/onshape-export.png"
          alt="Onshape export dialog showing GLTF format selected"
          class="mt-2 rounded-lg border border-subtle w-full max-w-sm"
        />
      </div>
    </template>

    <template #sketchup-body>
      <div class="space-y-3 text-sm text-muted leading-relaxed">
        <p>
          <strong class="text-body">SketchUp</strong> exports to
          <span class="font-mono text-dim">.dae</span>
          (COLLADA) which Cutlist Studio supports natively.
        </p>
        <ol class="space-y-2 list-decimal list-inside">
          <li>
            Model each part as a
            <strong class="text-body">separate component</strong>. Apply a
            different material/colour to each wood type.
          </li>
          <li>
            Go to
            <strong class="text-body">File &rarr; Export &rarr; 3D Model</strong
            >, choose <span class="font-mono text-dim">COLLADA (.dae)</span>,
            and save.
          </li>
          <li>
            Drag the <span class="font-mono text-dim">.dae</span> file into
            Cutlist Studio, or click
            <strong class="text-body">Import Model</strong> inside your project.
          </li>
        </ol>
      </div>
    </template>

    <template #other-body>
      <div class="space-y-3 text-sm text-muted leading-relaxed">
        <p>
          Any tool that exports
          <strong class="text-body">GLTF</strong> or
          <strong class="text-body">COLLADA (.dae)</strong> will work. This
          includes:
        </p>
        <ul class="space-y-1.5 ml-4 list-disc">
          <li>
            <strong class="text-body">Fusion 360</strong> &mdash; export as GLTF
            or use a COLLADA exporter
          </li>
          <li>
            <strong class="text-body">Blender</strong> &mdash; File &rarr;
            Export &rarr; glTF 2.0
          </li>
          <li>
            <strong class="text-body">FreeCAD</strong> &mdash; export as GLTF
            via the Mesh workbench
          </li>
          <li>
            <strong class="text-body">SolidWorks</strong> &mdash; export as
            COLLADA or use a GLTF plugin
          </li>
        </ul>
        <p>
          The key: assign
          <strong class="text-body">distinct colours per material</strong>
          so the importer can tell your wood types apart.
        </p>
      </div>
    </template>

    <template v-if="showManual" #manual-body>
      <div class="space-y-3 text-sm text-muted leading-relaxed">
        <p>
          No CAD model? No problem. Create a project, then use
          <strong class="text-body">Add Part Manually</strong> to enter each
          piece with its dimensions, quantity, and material.
        </p>
        <p>
          You can also mix &mdash; import a model for most parts and add a few
          extras by hand.
        </p>
      </div>
    </template>
  </UAccordion>
</template>
