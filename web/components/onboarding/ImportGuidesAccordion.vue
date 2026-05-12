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
          <strong class="text-body">SketchUp</strong> can export to
          <span class="font-mono text-dim">.dae</span> or
          <span class="font-mono text-dim">.fbx</span>. Both work; each has a
          gotcha noted below.
        </p>
        <ol class="space-y-2 list-decimal list-inside">
          <li>
            Model each part as a
            <strong class="text-body">separate component</strong> (not just a
            group). Apply a different material / colour per wood type.
          </li>
          <li>
            <strong class="text-body">File &rarr; Export &rarr; 3D Model</strong
            >, choose either
            <span class="font-mono text-dim">COLLADA (.dae)</span> or
            <span class="font-mono text-dim">Autodesk FBX (.fbx)</span>.
          </li>
          <li>Drag the file into Cutlist Studio.</li>
        </ol>
        <div
          class="mt-2 p-3 rounded-lg border border-subtle bg-surface space-y-2"
        >
          <p>
            <strong class="text-body">If exporting .dae:</strong>
            click <strong class="text-body">Options&hellip;</strong> and enable
            <em>&ldquo;Triangulate all faces.&rdquo;</em> Non-triangulated DAE
            files won&rsquo;t import.
          </p>
          <p>
            <strong class="text-body">If exporting .fbx:</strong>
            in the export dialog, set
            <strong class="text-body">Units</strong> to
            <span class="font-mono text-dim">Meters</span>. SketchUp tags the
            file&rsquo;s unit but the importer always reads numbers as meters
            &mdash; if you leave it on Inches, every part imports at 39&times;
            its real size.
          </p>
        </div>
      </div>
    </template>

    <template #other-body>
      <div class="space-y-3 text-sm text-muted leading-relaxed">
        <p>Cutlist Studio reads these 3D formats:</p>
        <ul class="space-y-2 ml-4 list-disc">
          <li>
            <span class="font-mono text-dim">.gltf</span> /
            <span class="font-mono text-dim">.glb</span> &mdash; preferred; unit
            + axis info is always correct (Onshape, Blender, FreeCAD).
          </li>
          <li>
            <span class="font-mono text-dim">.dae</span> &mdash; Rhino, Maya,
            FreeCAD, etc. Units and up-axis are read from the file. SketchUp
            users: enable <em>&ldquo;Triangulate all faces&rdquo;</em> on
            export.
          </li>
          <li>
            <span class="font-mono text-dim">.fbx</span> &mdash; Fusion 360,
            Maya, AutoCAD, SketchUp Pro.
            <strong class="text-body">Watch out:</strong> the FBX importer
            ignores embedded unit tags and treats coordinates as meters. If your
            tool offers a units choice on export, pick
            <span class="font-mono text-dim">Meters</span>; otherwise your parts
            will import at the wrong scale.
          </li>
        </ul>
        <p>
          The key in any format: each wood part should be a
          <strong class="text-body">separate component / object</strong> and
          materials should have
          <strong class="text-body">distinct colours</strong> so the importer
          can tell your wood types apart.
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
