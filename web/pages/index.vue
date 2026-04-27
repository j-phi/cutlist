<script lang="ts" setup>
const { activeProject } = useProjects();
const { importFromFile, pickAndImport } = useImportProject();
const toast = useToast();

const showNewProject = ref(false);
const loadingDemo = ref(false);

function openNewProject() {
  showNewProject.value = true;
}

async function loadDemo() {
  if (loadingDemo.value) return;
  loadingDemo.value = true;
  try {
    const base = useRuntimeConfig().app.baseURL || '/';
    const response = await fetch(`${base}demo.cutlist`);
    if (!response.ok) {
      throw new Error(`Failed to load demo project (${response.status})`);
    }
    const blob = await response.blob();
    const file = new File([blob], 'demo.cutlist', {
      type: blob.type || 'application/gzip',
    });
    await importFromFile(file);
  } catch (err) {
    toast.add({
      title: 'Demo failed to load',
      description: err instanceof Error ? err.message : String(err),
      color: 'error',
    });
  } finally {
    loadingDemo.value = false;
  }
}

const isDragging = ref(false);

function onDragOver(e: DragEvent) {
  if (e.dataTransfer?.items.length) {
    e.preventDefault();
    isDragging.value = true;
  }
}

function onDragLeave(e: DragEvent) {
  const related = e.relatedTarget as Element | null;
  const current = e.currentTarget as Element;
  if (!related || !current.contains(related)) {
    isDragging.value = false;
  }
}

async function onDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  try {
    await importFromFile(file);
  } catch (err) {
    toast.add({
      title: 'Import failed',
      description: err instanceof Error ? err.message : String(err),
      color: 'error',
    });
  }
}

function scrollToContent() {
  document
    .getElementById('how-it-works')
    ?.scrollIntoView({ behavior: 'smooth' });
}

function scrollToFormats() {
  document
    .getElementById('supported-formats')
    ?.scrollIntoView({ behavior: 'smooth' });
}
</script>

<template>
  <AppShell>
    <ClientOnly>
      <div
        v-if="!activeProject"
        class="flex-1 overflow-y-auto"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- HERO                                                            -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <section
          class="relative min-h-[calc(100vh-2.5rem)] flex flex-col items-center justify-center overflow-hidden pt-16 pb-0 px-4"
        >
          <!-- Grid background with radial fade -->
          <div
            class="absolute inset-0 pointer-events-none select-none"
            aria-hidden="true"
          >
            <div
              class="w-full h-full"
              style="
                background-image:
                  linear-gradient(
                    rgba(20, 184, 166, 0.18) 1px,
                    transparent 1px
                  ),
                  linear-gradient(
                    90deg,
                    rgba(20, 184, 166, 0.18) 1px,
                    transparent 1px
                  );
                background-size: 24px 24px;
                background-position: center center;
                mask-image: radial-gradient(
                  ellipse 70% 60% at 50% 50%,
                  black 0%,
                  transparent 100%
                );
                -webkit-mask-image: radial-gradient(
                  ellipse 70% 60% at 50% 50%,
                  black 0%,
                  transparent 100%
                );
              "
            />
          </div>

          <!-- Hero content: text + action panel + browser mockup -->
          <div
            class="relative z-10 flex flex-col items-center gap-8 w-full max-w-[1200px]"
          >
            <!-- Branding + tagline -->
            <div class="text-center">
              <div class="text-2xl font-bold tracking-tight mb-3">
                <span class="text-white">cutlist</span
                ><span class="text-teal-400">studio</span>
              </div>
              <h1 class="text-2xl font-bold leading-relaxed">
                Turn your design into a cut plan
              </h1>
              <p class="text-body text-muted mt-1.5">
                Free, forever. No account. Works offline.
              </p>
            </div>

            <!-- Action panel -->
            <div
              class="w-full max-w-sm rounded-xl border p-5 transition-all duration-200 backdrop-blur-md"
              :class="
                isDragging
                  ? 'border-teal-400/50 bg-teal-500/5 shadow-[0_0_40px_rgba(20,184,166,0.12)]'
                  : 'border-subtle bg-mist-950/70'
              "
            >
              <template v-if="isDragging">
                <div class="flex justify-center mb-3">
                  <div
                    class="w-11 h-11 rounded-xl flex items-center justify-center bg-teal-400/15 text-teal-400 scale-110"
                  >
                    <UIcon name="i-lucide-download" class="w-5 h-5" />
                  </div>
                </div>
                <p class="text-sm font-semibold text-body text-center">
                  Drop to import project
                </p>
              </template>

              <template v-else>
                <div class="flex flex-col gap-2">
                  <button
                    class="w-full py-2.5 px-4 rounded-lg bg-teal-500 hover:bg-teal-400 active:bg-teal-600 text-black font-semibold text-sm transition-colors"
                    @click="openNewProject"
                  >
                    New Project
                  </button>
                  <button
                    class="w-full py-2.5 px-4 rounded-lg border border-subtle bg-surface hover:bg-mist-800 text-muted hover:text-body text-sm transition-colors"
                    @click="pickAndImport"
                  >
                    Import Project
                  </button>
                  <button
                    class="w-full py-2.5 px-4 rounded-lg border border-subtle bg-surface hover:bg-mist-800 text-muted hover:text-body text-sm transition-colors flex items-center justify-center gap-2"
                    :disabled="loadingDemo"
                    @click="loadDemo"
                  >
                    <UIcon
                      v-if="loadingDemo"
                      name="i-lucide-loader-2"
                      class="w-4 h-4 animate-spin"
                    />
                    {{ loadingDemo ? 'Loading demo...' : 'View Demo Project' }}
                  </button>
                </div>
                <p class="mt-3 text-xs text-muted text-center">
                  or drop a
                  <span class="font-mono text-dim">.cutlist</span> file anywhere
                </p>
              </template>
            </div>

            <!-- Import format hints -->
            <div class="flex items-center justify-center gap-8">
              <button
                class="flex flex-col items-center gap-2 text-dim hover:text-muted transition-colors group"
                @click="scrollToFormats"
              >
                <!-- Onshape file icon -->
                <svg width="40" height="48" viewBox="0 0 40 48" fill="none">
                  <path
                    d="M4 2h20l12 12v30a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"
                    fill="#0d3330"
                    stroke="#14b8a6"
                    stroke-width="1"
                  />
                  <path
                    d="M24 2v8a4 4 0 0 0 4 4h8"
                    fill="none"
                    stroke="#14b8a6"
                    stroke-width="1"
                  />
                  <text
                    x="20"
                    y="34"
                    text-anchor="middle"
                    font-family="monospace"
                    font-size="8"
                    font-weight="600"
                    fill="#14b8a6"
                  >
                    .gltf
                  </text>
                </svg>
                <span class="text-xs">Import from Onshape</span>
              </button>
              <span class="w-px h-10 bg-mist-800" />
              <button
                class="flex flex-col items-center gap-2 text-dim hover:text-muted transition-colors group"
                @click="scrollToFormats"
              >
                <!-- SketchUp file icon -->
                <svg width="40" height="48" viewBox="0 0 40 48" fill="none">
                  <path
                    d="M4 2h20l12 12v30a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"
                    fill="#0d3330"
                    stroke="#14b8a6"
                    stroke-width="1"
                  />
                  <path
                    d="M24 2v8a4 4 0 0 0 4 4h8"
                    fill="none"
                    stroke="#14b8a6"
                    stroke-width="1"
                  />
                  <text
                    x="20"
                    y="34"
                    text-anchor="middle"
                    font-family="monospace"
                    font-size="8"
                    font-weight="600"
                    fill="#14b8a6"
                  >
                    .dae
                  </text>
                </svg>
                <span class="text-xs">Import from SketchUp</span>
              </button>
            </div>

            <!-- Browser mockup — bottom crops into next section -->
            <div
              class="w-full rounded-t-xl overflow-hidden border border-b-0 border-mist-800 shadow-2xl shadow-black/50"
            >
              <!-- Title bar -->
              <div
                class="flex items-center gap-2 px-4 py-2.5 bg-mist-950 border-b border-mist-800"
              >
                <div class="flex items-center gap-1.5">
                  <div class="w-3 h-3 rounded-full bg-mist-700" />
                  <div class="w-3 h-3 rounded-full bg-mist-700" />
                  <div class="w-3 h-3 rounded-full bg-mist-700" />
                </div>
                <div
                  class="flex-1 mx-8 py-1 rounded-md bg-mist-900 text-center"
                >
                  <span class="text-xs text-dim font-mono"
                    >cutliststudio.com</span
                  >
                </div>
              </div>
              <!-- Screenshot -->
              <img
                src="/preview.webp"
                alt="Cutlist Studio app showing a workbench project with 3D model and bill of materials"
                class="w-full block"
              />
            </div>
          </div>
        </section>

        <!-- Fixed scroll indicator -->
        <button
          class="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 text-dim hover:text-muted transition-colors"
          @click="scrollToContent"
        >
          <span class="text-xs uppercase tracking-widest">Learn more</span>
          <UIcon name="i-lucide-chevron-down" class="w-5 h-5 animate-bounce" />
        </button>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- HOW IT WORKS                                                    -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <section id="how-it-works" class="relative">
          <!-- Faint grid background -->
          <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div
              class="w-full h-full opacity-[0.03]"
              style="
                background-image:
                  linear-gradient(rgba(20, 184, 166, 1) 1px, transparent 1px),
                  linear-gradient(
                    90deg,
                    rgba(20, 184, 166, 1) 1px,
                    transparent 1px
                  );
                background-size: 60px 60px;
              "
            />
          </div>

          <div class="relative max-w-5xl mx-auto px-6 py-24 sm:py-32">
            <div class="text-center mb-20">
              <span
                class="text-xs font-mono text-teal-400 uppercase tracking-widest"
                >How it works</span
              >
              <h2
                class="mt-4 text-3xl sm:text-4xl font-bold text-white tracking-tight"
              >
                From model to shop in minutes
              </h2>
              <p
                class="mt-4 text-lg text-muted max-w-2xl mx-auto leading-relaxed"
              >
                Drop in your parts, pick your sheet stock, and get an optimized
                cutting plan ready to print.
              </p>
            </div>

            <!-- Step 1 -->
            <div
              class="grid md:grid-cols-2 gap-12 md:gap-16 items-center mb-24"
            >
              <div>
                <div class="flex items-center gap-3 mb-4">
                  <div
                    class="w-10 h-10 rounded-xl bg-teal-400/10 border border-teal-400/20 flex items-center justify-center"
                  >
                    <span class="text-sm font-mono font-bold text-teal-400"
                      >1</span
                    >
                  </div>
                  <h3 class="text-xl font-semibold text-white">
                    Add your parts
                  </h3>
                </div>
                <p class="text-muted leading-relaxed mb-4">
                  Import a 3D model and every flat panel gets extracted
                  automatically. Works with
                  <span class="text-body">Onshape</span> and
                  <span class="text-body">SketchUp</span> exports out of the
                  box. Prefer a spreadsheet? Just type your parts in manually.
                </p>
                <div class="flex flex-wrap gap-2">
                  <span
                    class="px-2.5 py-1 rounded-md text-xs text-teal-400 bg-teal-400/5 border border-teal-400/15"
                    >Onshape / GLTF</span
                  >
                  <span
                    class="px-2.5 py-1 rounded-md text-xs text-teal-400 bg-teal-400/5 border border-teal-400/15"
                    >SketchUp / COLLADA</span
                  >
                  <span
                    class="px-2.5 py-1 rounded-md text-xs text-teal-400 bg-teal-400/5 border border-teal-400/15"
                    >Manual entry</span
                  >
                  <span
                    class="px-2.5 py-1 rounded-md text-xs text-teal-400 bg-teal-400/5 border border-teal-400/15"
                    >3D preview</span
                  >
                </div>
              </div>
              <!-- Illustration placeholder: parts table -->
              <div class="rounded-xl border border-subtle bg-surface p-5">
                <div
                  class="flex items-center gap-2 mb-4 pb-3 border-b border-subtle"
                >
                  <UIcon name="i-lucide-table-2" class="w-4 h-4 text-dim" />
                  <span
                    class="text-xs font-mono text-dim uppercase tracking-wider"
                    >Bill of materials</span
                  >
                </div>
                <div class="space-y-2">
                  <div
                    v-for="(part, i) in [
                      { name: 'Side panel', w: '800', h: '600', qty: 2 },
                      { name: 'Top shelf', w: '760', h: '300', qty: 3 },
                      { name: 'Back panel', w: '800', h: '400', qty: 1 },
                      { name: 'Divider', w: '280', h: '580', qty: 4 },
                      { name: 'Drawer front', w: '360', h: '180', qty: 6 },
                    ]"
                    :key="i"
                    class="flex items-center gap-3 py-2 px-3 rounded-lg"
                    :class="
                      i === 0
                        ? 'bg-teal-400/5 border border-teal-400/15'
                        : 'hover:bg-mist-800/50'
                    "
                  >
                    <span class="w-5 text-xs font-mono text-dim text-right">{{
                      i + 1
                    }}</span>
                    <span class="flex-1 text-sm text-body truncate">{{
                      part.name
                    }}</span>
                    <span class="text-xs font-mono text-muted tabular-nums"
                      >{{ part.w }} x {{ part.h }}</span
                    >
                    <span class="text-xs text-dim">x{{ part.qty }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Step 2 -->
            <div
              class="grid md:grid-cols-2 gap-12 md:gap-16 items-center mb-24"
            >
              <div class="md:order-2">
                <div class="flex items-center gap-3 mb-4">
                  <div
                    class="w-10 h-10 rounded-xl bg-teal-400/10 border border-teal-400/20 flex items-center justify-center"
                  >
                    <span class="text-sm font-mono font-bold text-teal-400"
                      >2</span
                    >
                  </div>
                  <h3 class="text-xl font-semibold text-white">
                    Pick your stock
                  </h3>
                </div>
                <p class="text-muted leading-relaxed mb-4">
                  Add the sheets you're working with -- dimensions, material,
                  grain direction. Even accounts for the width of your saw
                  blade.
                </p>
                <div class="flex flex-wrap gap-2">
                  <span
                    class="px-2.5 py-1 rounded-md text-xs text-teal-400 bg-teal-400/5 border border-teal-400/15"
                    >Custom sizes</span
                  >
                  <span
                    class="px-2.5 py-1 rounded-md text-xs text-teal-400 bg-teal-400/5 border border-teal-400/15"
                    >Grain direction</span
                  >
                  <span
                    class="px-2.5 py-1 rounded-md text-xs text-teal-400 bg-teal-400/5 border border-teal-400/15"
                    >Blade kerf</span
                  >
                </div>
              </div>
              <!-- Illustration: stock cards -->
              <div
                class="md:order-1 rounded-xl border border-subtle bg-surface p-5"
              >
                <div
                  class="flex items-center gap-2 mb-4 pb-3 border-b border-subtle"
                >
                  <UIcon name="i-lucide-layers" class="w-4 h-4 text-dim" />
                  <span
                    class="text-xs font-mono text-dim uppercase tracking-wider"
                    >Sheet stock</span
                  >
                </div>
                <div class="space-y-3">
                  <div
                    v-for="(stock, i) in [
                      {
                        name: '18mm Birch Plywood',
                        size: '2440 x 1220',
                        color: 'bg-amber-400/20 border-amber-400/30',
                      },
                      {
                        name: '12mm MDF',
                        size: '2440 x 1220',
                        color: 'bg-stone-400/20 border-stone-400/30',
                      },
                      {
                        name: '6mm Hardboard',
                        size: '2440 x 1220',
                        color: 'bg-orange-400/20 border-orange-400/30',
                      },
                    ]"
                    :key="i"
                    class="flex items-center gap-3 p-3 rounded-lg border border-subtle hover:border-mist-600 transition-colors"
                  >
                    <div
                      class="w-10 h-10 rounded-lg border shrink-0"
                      :class="stock.color"
                    />
                    <div class="flex-1 min-w-0">
                      <div class="text-sm text-body truncate">
                        {{ stock.name }}
                      </div>
                      <div class="text-xs font-mono text-muted">
                        {{ stock.size }} mm
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Step 3 -->
            <div class="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
              <div>
                <div class="flex items-center gap-3 mb-4">
                  <div
                    class="w-10 h-10 rounded-xl bg-teal-400/10 border border-teal-400/20 flex items-center justify-center"
                  >
                    <span class="text-sm font-mono font-bold text-teal-400"
                      >3</span
                    >
                  </div>
                  <h3 class="text-xl font-semibold text-white">
                    Get your cut plan
                  </h3>
                </div>
                <p class="text-muted leading-relaxed mb-4">
                  A bunch of arrangements get tried and the best one wins. Every
                  cut is a straight through-cut -- the kind you can actually
                  make with a table saw. Export to a scaled PDF and take it to
                  the shop.
                </p>
                <div class="flex flex-wrap gap-2">
                  <span
                    class="px-2.5 py-1 rounded-md text-xs text-teal-400 bg-teal-400/5 border border-teal-400/15"
                    >Table-saw cuts</span
                  >
                  <span
                    class="px-2.5 py-1 rounded-md text-xs text-teal-400 bg-teal-400/5 border border-teal-400/15"
                    >CNC mode</span
                  >
                  <span
                    class="px-2.5 py-1 rounded-md text-xs text-teal-400 bg-teal-400/5 border border-teal-400/15"
                    >PDF export</span
                  >
                </div>
              </div>
              <!-- Illustration: mini board layout -->
              <div class="rounded-xl border border-subtle bg-surface p-5">
                <div
                  class="flex items-center justify-between mb-4 pb-3 border-b border-subtle"
                >
                  <div class="flex items-center gap-2">
                    <UIcon
                      name="i-lucide-layout-grid"
                      class="w-4 h-4 text-dim"
                    />
                    <span
                      class="text-xs font-mono text-dim uppercase tracking-wider"
                      >Board 1 of 3</span
                    >
                  </div>
                  <span class="text-xs font-mono text-teal-400">94% used</span>
                </div>
                <!-- prettier-ignore -->
                <svg viewBox="0 0 244 122" xmlns="http://www.w3.org/2000/svg" class="w-full rounded-lg">
                  <rect width="244" height="122" fill="rgba(20,184,166,0.03)" stroke="rgba(20,184,166,0.22)" stroke-width="1" rx="2"/>
                  <rect x="3" y="3" width="38" height="116" fill="rgba(20,184,166,0.10)" stroke="rgba(20,184,166,0.35)" stroke-width="0.75" rx="1"/><text x="22" y="64" font-size="6" fill="rgba(20,184,166,0.40)" text-anchor="middle" font-family="monospace">Side L</text>
                  <rect x="43" y="3" width="38" height="116" fill="rgba(20,184,166,0.10)" stroke="rgba(20,184,166,0.35)" stroke-width="0.75" rx="1"/><text x="62" y="64" font-size="6" fill="rgba(20,184,166,0.40)" text-anchor="middle" font-family="monospace">Side R</text>
                  <rect x="83" y="3" width="158" height="62" fill="rgba(20,184,166,0.10)" stroke="rgba(20,184,166,0.35)" stroke-width="0.75" rx="1"/><text x="162" y="38" font-size="7" fill="rgba(20,184,166,0.40)" text-anchor="middle" font-family="monospace">Back</text>
                  <rect x="83" y="67" width="76" height="18" fill="rgba(20,184,166,0.10)" stroke="rgba(20,184,166,0.35)" stroke-width="0.75" rx="1"/><text x="121" y="80" font-size="6" fill="rgba(20,184,166,0.40)" text-anchor="middle" font-family="monospace">Shelf</text>
                  <rect x="161" y="67" width="76" height="18" fill="rgba(20,184,166,0.10)" stroke="rgba(20,184,166,0.35)" stroke-width="0.75" rx="1"/><text x="199" y="80" font-size="6" fill="rgba(20,184,166,0.40)" text-anchor="middle" font-family="monospace">Shelf</text>
                  <rect x="83" y="87" width="76" height="18" fill="rgba(20,184,166,0.10)" stroke="rgba(20,184,166,0.35)" stroke-width="0.75" rx="1"/><text x="121" y="100" font-size="6" fill="rgba(20,184,166,0.40)" text-anchor="middle" font-family="monospace">Shelf</text>
                  <rect x="161" y="87" width="76" height="32" fill="rgba(20,184,166,0.02)" stroke="rgba(20,184,166,0.10)" stroke-width="0.75" stroke-dasharray="3,2" rx="1"/>
                  <rect x="83" y="107" width="76" height="12" fill="rgba(20,184,166,0.02)" stroke="rgba(20,184,166,0.10)" stroke-width="0.75" stroke-dasharray="3,2" rx="1"/>
                </svg>
                <div
                  class="flex items-center justify-between mt-3 text-xs text-muted"
                >
                  <span>18mm Birch Plywood</span>
                  <span class="font-mono">2440 x 1220 mm</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- SUPPORTED FORMATS                                               -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <section id="supported-formats" class="border-t border-subtle">
          <div class="max-w-5xl mx-auto px-6 py-24 sm:py-32">
            <div class="text-center mb-16">
              <span
                class="text-xs font-mono text-teal-400 uppercase tracking-widest"
                >Import</span
              >
              <h2
                class="mt-4 text-3xl sm:text-4xl font-bold text-white tracking-tight"
              >
                Works with your CAD tool
              </h2>
              <p
                class="mt-4 text-lg text-muted max-w-2xl mx-auto leading-relaxed"
              >
                Export from the tool you already use. Every flat panel is
                extracted automatically.
              </p>
            </div>

            <div class="grid md:grid-cols-2 gap-6">
              <!-- Onshape -->
              <div
                class="rounded-xl border border-subtle bg-surface p-6 hover:border-mist-600 transition-colors"
              >
                <div class="flex items-center gap-3 mb-5">
                  <div
                    class="w-10 h-10 rounded-xl bg-teal-400/10 border border-teal-400/20 flex items-center justify-center"
                  >
                    <UIcon name="i-lucide-box" class="w-5 h-5 text-teal-400" />
                  </div>
                  <div>
                    <h3 class="text-sm font-semibold text-white">Onshape</h3>
                    <span class="text-xs font-mono text-dim">.gltf</span>
                  </div>
                </div>
                <ol class="space-y-2.5 text-sm text-muted list-none pl-0 mb-5">
                  <li class="flex gap-2.5">
                    <span
                      class="text-teal-400/60 font-mono text-xs mt-0.5 shrink-0"
                      >1.</span
                    >
                    <span
                      >Model your parts at real-world dimensions in
                      Onshape</span
                    >
                  </li>
                  <li class="flex gap-2.5">
                    <span
                      class="text-teal-400/60 font-mono text-xs mt-0.5 shrink-0"
                      >2.</span
                    >
                    <span
                      >Assign a unique appearance colour to each material</span
                    >
                  </li>
                  <li class="flex gap-2.5">
                    <span
                      class="text-teal-400/60 font-mono text-xs mt-0.5 shrink-0"
                      >3.</span
                    >
                    <span
                      >File &rarr; Export &rarr;
                      <span class="font-mono text-dim">GLTF</span></span
                    >
                  </li>
                  <li class="flex gap-2.5">
                    <span
                      class="text-teal-400/60 font-mono text-xs mt-0.5 shrink-0"
                      >4.</span
                    >
                    <span>Drop the file into Cutlist Studio</span>
                  </li>
                </ol>
                <img
                  src="/onshape-export.png"
                  alt="Onshape export dialog showing GLTF format selected"
                  class="rounded-lg border border-subtle w-full"
                />
              </div>

              <!-- SketchUp -->
              <div
                class="rounded-xl border border-subtle bg-surface p-6 hover:border-mist-600 transition-colors"
              >
                <div class="flex items-center gap-3 mb-5">
                  <div
                    class="w-10 h-10 rounded-xl bg-teal-400/10 border border-teal-400/20 flex items-center justify-center"
                  >
                    <UIcon
                      name="i-lucide-pencil-ruler"
                      class="w-5 h-5 text-teal-400"
                    />
                  </div>
                  <div>
                    <h3 class="text-sm font-semibold text-white">SketchUp</h3>
                    <span class="text-xs font-mono text-dim">.dae</span>
                  </div>
                </div>
                <ol class="space-y-2.5 text-sm text-muted list-none pl-0 mb-5">
                  <li class="flex gap-2.5">
                    <span
                      class="text-teal-400/60 font-mono text-xs mt-0.5 shrink-0"
                      >1.</span
                    >
                    <span
                      >Model your parts as separate components in SketchUp</span
                    >
                  </li>
                  <li class="flex gap-2.5">
                    <span
                      class="text-teal-400/60 font-mono text-xs mt-0.5 shrink-0"
                      >2.</span
                    >
                    <span
                      >Use materials to distinguish different stock types</span
                    >
                  </li>
                  <li class="flex gap-2.5">
                    <span
                      class="text-teal-400/60 font-mono text-xs mt-0.5 shrink-0"
                      >3.</span
                    >
                    <span
                      >File &rarr; Export 3D Model &rarr;
                      <span class="font-mono text-dim"
                        >COLLADA (.dae)</span
                      ></span
                    >
                  </li>
                  <li class="flex gap-2.5">
                    <span
                      class="text-teal-400/60 font-mono text-xs mt-0.5 shrink-0"
                      >4.</span
                    >
                    <span>Drop the file into Cutlist Studio</span>
                  </li>
                </ol>
                <div class="rounded-lg border border-subtle bg-mist-900/50 p-4">
                  <div class="flex items-start gap-2.5">
                    <UIcon
                      name="i-lucide-info"
                      class="w-4 h-4 text-teal-400/60 mt-0.5 shrink-0"
                    />
                    <p class="text-xs text-muted leading-relaxed">
                      Units are converted automatically. Edge lines are filtered
                      out&nbsp;&mdash; only solid geometry becomes parts.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p class="text-center text-sm text-muted mt-8">
              Don't use either? Just
              <button
                class="text-teal-400 hover:text-teal-300 transition-colors"
                @click="openNewProject"
              >
                create a project</button
              >&nbsp;and add parts manually.
            </p>
          </div>
        </section>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- FEATURES                                                        -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <section class="border-t border-subtle bg-mist-900/30">
          <div class="max-w-5xl mx-auto px-6 py-24 sm:py-32">
            <div class="text-center mb-16">
              <span
                class="text-xs font-mono text-teal-400 uppercase tracking-widest"
                >Features</span
              >
              <h2
                class="mt-4 text-3xl sm:text-4xl font-bold text-white tracking-tight"
              >
                All of this, for free
              </h2>
            </div>

            <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div
                v-for="feature in [
                  {
                    icon: 'i-lucide-heart',
                    title: 'Completely free',
                    desc: 'No trial, no tier limits, no surprise paywall. The whole app is free, forever.',
                  },
                  {
                    icon: 'i-lucide-scissors',
                    title: 'Cuts you can actually make',
                    desc: 'Every cut goes edge-to-edge, the way a table saw or track saw works. No impossible L-shaped cuts. Got a CNC? Switch to unconstrained mode.',
                  },
                  {
                    icon: 'i-lucide-file-text',
                    title: 'Scaled PDF drawings',
                    desc: 'Export your cut plan as a PDF with each board on its own page. Labeled parts, real dimensions, ready for the shop floor.',
                  },
                  {
                    icon: 'i-lucide-box',
                    title: '3D model viewer',
                    desc: 'Imported a model? Spin it around, click parts to find them in the cut list, and double-check dimensions before you cut anything.',
                  },
                  {
                    icon: 'i-lucide-wifi-off',
                    title: 'Works offline',
                    desc: 'Everything runs in your browser. No server, no uploads, no internet needed. Take your laptop to the workshop.',
                  },
                  {
                    icon: 'i-lucide-user-x',
                    title: 'No account, no tracking',
                    desc: 'Just open the app and start working. Your projects live in your browser. Export them as files to back up or share.',
                  },
                ]"
                :key="feature.title"
                class="group rounded-xl border border-subtle bg-surface p-6 hover:border-mist-600 transition-colors"
              >
                <div
                  class="w-10 h-10 rounded-xl bg-teal-400/5 border border-teal-400/15 flex items-center justify-center mb-4 group-hover:bg-teal-400/10 transition-colors"
                >
                  <UIcon :name="feature.icon" class="w-5 h-5 text-teal-400" />
                </div>
                <h3 class="text-sm font-semibold text-white mb-2">
                  {{ feature.title }}
                </h3>
                <p class="text-sm text-muted leading-relaxed">
                  {{ feature.desc }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- BOTTOM CTA                                                      -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <section class="border-t border-subtle">
          <div class="max-w-2xl mx-auto px-6 py-24 sm:py-32 text-center">
            <h2
              class="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-4"
            >
              Ready to build something?
            </h2>
            <p class="text-muted leading-relaxed mb-8">
              Drop in your parts, get an optimized cut plan, and start building.
              Free, private, no sign-up.
            </p>
            <div
              class="flex flex-col sm:flex-row items-center justify-center gap-3"
            >
              <button
                class="w-full sm:w-auto px-8 py-3 rounded-lg bg-teal-500 hover:bg-teal-400 active:bg-teal-600 text-black font-semibold text-sm transition-colors"
                @click="openNewProject"
              >
                New Project
              </button>
              <button
                class="w-full sm:w-auto px-8 py-3 rounded-lg border border-subtle bg-surface hover:bg-mist-800 text-muted hover:text-body text-sm transition-colors"
                @click="pickAndImport"
              >
                Import Project
              </button>
            </div>
          </div>
        </section>

        <!-- Footer -->
        <footer class="border-t border-subtle">
          <div
            class="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4"
          >
            <div class="text-sm font-semibold tracking-tight">
              <span class="text-white">cutlist</span
              ><span class="text-teal-400">studio</span>
            </div>
            <div class="flex items-center gap-6">
              <NuxtLink
                to="/about"
                class="text-xs text-muted hover:text-body transition-colors"
                >About</NuxtLink
              >
              <NuxtLink
                to="/terms"
                class="text-xs text-muted hover:text-body transition-colors"
                >Terms</NuxtLink
              >
            </div>
          </div>
        </footer>
      </div>
    </ClientOnly>

    <NewProjectDialog v-model:open="showNewProject" />
  </AppShell>
</template>
