<script lang="ts" setup>
defineEmits<{
  pickFile: [];
  addManualPart: [];
}>();

const importGuides = [
  {
    value: 'onshape',
    label: 'From Onshape (.gltf)',
    icon: 'i-lucide-box',
    slot: 'onshape' as const,
    content: ' ',
  },
  {
    value: 'sketchup',
    label: 'From SketchUp (.dae)',
    icon: 'i-lucide-pentagon',
    slot: 'sketchup' as const,
    content: ' ',
  },
  {
    value: 'other',
    label: 'Other 3D tools',
    icon: 'i-lucide-blocks',
    slot: 'other' as const,
    content: ' ',
  },
];
</script>

<template>
  <div class="px-6 pt-16 pb-24 space-y-6 max-w-lg mx-auto">
    <!-- Heading + actions -->
    <div class="text-center space-y-3">
      <div
        class="w-14 h-14 rounded-2xl bg-surface border border-subtle flex items-center justify-center mx-auto cursor-pointer hover:bg-teal-400/10 hover:border-teal-400/20 transition-colors group"
        aria-label="Import model"
        role="button"
        tabindex="0"
        @click="$emit('pickFile')"
        @keydown.enter.prevent="$emit('pickFile')"
        @keydown.space.prevent="$emit('pickFile')"
      >
        <UIcon
          name="i-lucide-package-open"
          class="w-6 h-6 text-dim group-hover:text-teal-400/60 transition-colors"
        />
      </div>
      <div class="space-y-1">
        <p class="text-base font-semibold text-hi">Drag your model here</p>
        <p class="text-sm text-muted leading-relaxed">
          Import a
          <span class="font-mono text-dim">.gltf</span> from Onshape or
          <span class="font-mono text-dim">.dae</span> from SketchUp to
          automatically generate your cut list, or add parts manually.
        </p>
      </div>
      <div class="flex items-center justify-center gap-2">
        <UButton
          color="primary"
          variant="soft"
          icon="i-lucide-upload"
          label="Import Model"
          @click="$emit('pickFile')"
        />
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-plus"
          label="Add Part Manually"
          @click="$emit('addManualPart')"
        />
      </div>
    </div>

    <!-- Export guides -->
    <UAccordion
      :items="importGuides"
      type="single"
      collapsible
      :ui="{
        item: 'border border-subtle rounded-lg mb-2 overflow-hidden last:border-b last:border-b-subtle',
        trigger:
          'px-4 py-2.5 hover:bg-mist-900 transition-colors data-[state=open]:bg-mist-900',
        content: 'border-t border-subtle',
        body: 'px-4 py-3',
        label: 'text-sm font-medium text-body',
        leadingIcon: 'text-teal-400',
      }"
    >
      <template #onshape-body>
        <ol
          class="space-y-2 list-decimal list-inside text-sm text-muted leading-relaxed"
        >
          <li>
            Model each part at real-world dimensions. Assign a
            <strong class="text-body">unique colour</strong> per material.
          </li>
          <li>
            <strong class="text-body">File &rarr; Export</strong>, set format to
            <span class="font-mono text-dim">GLTF</span>, and download.
          </li>
          <li>
            Drag the <span class="font-mono text-dim">.gltf</span> file here or
            click <strong class="text-body">Import Model</strong>.
          </li>
        </ol>
        <img
          src="/onshape-export.png"
          alt="Onshape export dialog showing GLTF format selected"
          class="mt-3 rounded-lg border border-subtle w-full"
        />
      </template>

      <template #sketchup-body>
        <ol
          class="space-y-2 list-decimal list-inside text-sm text-muted leading-relaxed"
        >
          <li>
            Model each part as a
            <strong class="text-body">separate component</strong>. Apply a
            different material/colour per wood type.
          </li>
          <li>
            <strong class="text-body">File &rarr; Export &rarr; 3D Model</strong
            >, choose <span class="font-mono text-dim">COLLADA (.dae)</span>.
          </li>
          <li>
            Drag the <span class="font-mono text-dim">.dae</span> file here or
            click <strong class="text-body">Import Model</strong>.
          </li>
        </ol>
      </template>

      <template #other-body>
        <div class="text-sm text-muted leading-relaxed space-y-2">
          <p>
            Any tool that exports
            <strong class="text-body">GLTF</strong> or
            <strong class="text-body">COLLADA (.dae)</strong> will work &mdash;
            including Fusion 360, Blender, FreeCAD, and SolidWorks.
          </p>
          <p>
            Assign
            <strong class="text-body">distinct colours per material</strong>
            so the importer can tell your wood types apart.
          </p>
        </div>
      </template>
    </UAccordion>
  </div>
</template>
