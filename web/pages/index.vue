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
        <!-- ═══════════════════════════════════════════════════════════════════ -->
        <!-- HERO                                                               -->
        <!-- ═══════════════════════════════════════════════════════════════════ -->
        <section
          class="relative min-h-[calc(100vh-2.5rem)] flex flex-col items-center overflow-hidden pt-16 px-4"
        >
          <!-- Teal spotlight glow -->
          <div
            class="absolute inset-0 pointer-events-none select-none hero-spotlight"
            aria-hidden="true"
          />

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

          <!-- Hero content -->
          <div
            class="relative z-10 flex-1 flex flex-col items-center justify-center gap-8 w-full max-w-[1200px]"
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
                  : 'border-subtle bg-mist-950/70 shadow-2xl shadow-black/50'
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
          </div>

          <!-- Browser mockup pinned to bottom of hero -->
          <div
            class="relative z-10 w-full max-w-[1200px] mt-16 rounded-t-xl overflow-hidden border border-b-0 border-mist-800 shadow-2xl shadow-black/50"
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
              <div class="flex-1 mx-8 py-1 rounded-md bg-mist-900 text-center">
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
        </section>

        <!-- ═══════════════════════════════════════════════════════════════════ -->
        <!-- LAYOUT SHOWCASE                                                    -->
        <!-- ═══════════════════════════════════════════════════════════════════ -->
        <section class="py-20 px-4 border-t border-subtle">
          <div class="max-w-5xl mx-auto">
            <div class="text-center mb-10">
              <h2
                class="text-teal-400 text-xs font-semibold uppercase tracking-wider mb-3"
              >
                Layout
              </h2>
              <p class="text-2xl font-bold text-hi mb-3">
                Optimized cutting plans, one click away
              </p>
              <p class="text-sm text-muted max-w-md mx-auto">
                Multiple packing strategies compete to find the layout with the
                fewest boards and least waste. Tweak blade kerf, margins, and
                stock filters in real time.
              </p>
            </div>

            <div class="relative">
              <div
                class="rounded-xl overflow-hidden border border-mist-800 shadow-2xl shadow-black/50"
              >
                <img
                  src="/layout.webp"
                  alt="Cutlist Studio Layout tab showing optimized board layouts across multiple stock materials"
                  class="w-full block"
                />
              </div>

              <!-- Export to PDF callout -->
              <div
                class="hidden sm:flex absolute -top-4 -right-2 sm:-right-4 lg:-right-8 items-center gap-2 px-3 py-2 rounded-lg bg-teal-500 text-black shadow-lg shadow-teal-500/30 rotate-[3deg]"
              >
                <UIcon name="i-lucide-file-down" class="w-4 h-4" />
                <span class="text-xs font-semibold whitespace-nowrap">
                  One-click PDF export
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- ═══════════════════════════════════════════════════════════════════ -->
        <!-- BUILD SHOWCASE                                                     -->
        <!-- ═══════════════════════════════════════════════════════════════════ -->
        <section class="py-20 px-4 border-t border-subtle">
          <div class="max-w-5xl mx-auto">
            <div class="text-center mb-10">
              <h2
                class="text-teal-400 text-xs font-semibold uppercase tracking-wider mb-3"
              >
                Build
              </h2>
              <p class="text-2xl font-bold text-hi mb-3">
                Document your build alongside your model
              </p>
              <p class="text-sm text-muted max-w-md mx-auto">
                A rich-text workspace for build notes, photos, and embedded
                scenes. Capture exploded views from the 3D model and drop them
                straight into your instructions.
              </p>
            </div>

            <div
              class="rounded-xl overflow-hidden border border-mist-800 shadow-2xl shadow-black/50"
            >
              <img
                src="/build.webp"
                alt="Cutlist Studio Build tab showing rich-text instructions with embedded model scenes and photos"
                class="w-full block"
              />
            </div>
          </div>
        </section>

        <!-- ═══════════════════════════════════════════════════════════════════ -->
        <!-- GETTING YOUR MODEL IN                                              -->
        <!-- ═══════════════════════════════════════════════════════════════════ -->
        <section class="py-20 px-4 border-t border-subtle">
          <div class="max-w-2xl mx-auto">
            <h2
              class="text-teal-400 text-xs font-semibold uppercase tracking-wider text-center mb-3"
            >
              Getting your model in
            </h2>
            <p class="text-sm text-muted text-center mb-8 max-w-md mx-auto">
              Cutlist Studio reads 3D models exported from CAD tools. Pick your
              workflow below.
            </p>

            <ImportGuidesAccordion />
          </div>
        </section>

        <!-- ═══════════════════════════════════════════════════════════════════ -->
        <!-- FEATURES                                                           -->
        <!-- ═══════════════════════════════════════════════════════════════════ -->
        <section class="py-20 px-4 border-t border-subtle">
          <div class="max-w-3xl mx-auto">
            <h2
              class="text-teal-400 text-xs font-semibold uppercase tracking-wider text-center mb-10"
            >
              Features
            </h2>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
              <div class="flex gap-3">
                <UIcon
                  name="i-lucide-layout-grid"
                  class="w-4 h-4 text-teal-400 shrink-0 mt-0.5"
                />
                <div>
                  <p class="text-body font-medium text-hi">
                    Tournament optimizer
                  </p>
                  <p class="text-sm text-muted mt-0.5">
                    Multiple packing strategies compete &mdash; the layout with
                    the fewest boards, least waste, and cleanest cut sequence
                    wins automatically.
                  </p>
                </div>
              </div>

              <div class="flex gap-3">
                <UIcon
                  name="i-lucide-scissors"
                  class="w-4 h-4 text-teal-400 shrink-0 mt-0.5"
                />
                <div>
                  <p class="text-body font-medium text-hi">
                    Pick your cut style
                  </p>
                  <p class="text-sm text-muted mt-0.5">
                    Tidy column-aligned strips for table saws, Compact for
                    tighter yield, or CNC for routers. Set a project default and
                    override per material.
                  </p>
                </div>
              </div>

              <div class="flex gap-3">
                <UIcon
                  name="i-lucide-rotate-3d"
                  class="w-4 h-4 text-teal-400 shrink-0 mt-0.5"
                />
                <div>
                  <p class="text-body font-medium text-hi">Grain direction</p>
                  <p class="text-sm text-muted mt-0.5">
                    Lock grain per part so the optimizer won't rotate it.
                  </p>
                </div>
              </div>

              <div class="flex gap-3">
                <UIcon
                  name="i-lucide-file-down"
                  class="w-4 h-4 text-teal-400 shrink-0 mt-0.5"
                />
                <div>
                  <p class="text-body font-medium text-hi">PDF export</p>
                  <p class="text-sm text-muted mt-0.5">
                    Download cutting diagrams to take to the workshop or send to
                    a cut service.
                  </p>
                </div>
              </div>

              <div class="flex gap-3">
                <UIcon
                  name="i-lucide-eye"
                  class="w-4 h-4 text-teal-400 shrink-0 mt-0.5"
                />
                <div>
                  <p class="text-body font-medium text-hi">3D viewer</p>
                  <p class="text-sm text-muted mt-0.5">
                    Inspect your imported model with orbit, zoom, and part
                    selection.
                  </p>
                </div>
              </div>

              <div class="flex gap-3">
                <UIcon
                  name="i-lucide-hard-drive"
                  class="w-4 h-4 text-teal-400 shrink-0 mt-0.5"
                />
                <div>
                  <p class="text-body font-medium text-hi">
                    Offline &amp; private
                  </p>
                  <p class="text-sm text-muted mt-0.5">
                    Everything runs in your browser. No server, no accounts, no
                    tracking.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Footer -->
        <footer class="py-8 px-4 border-t border-subtle text-center">
          <p class="text-xs text-dim">
            Built by Matt &mdash;
            <NuxtLink
              to="/about"
              class="text-muted hover:text-body transition-colors underline"
              >About</NuxtLink
            >
          </p>
        </footer>
      </div>
    </ClientOnly>

    <NewProjectDialog v-model:open="showNewProject" />
  </AppShell>
</template>

<style scoped>
.hero-spotlight {
  background-image: radial-gradient(
    ellipse 120% 70% at 50% 45%,
    rgba(20, 184, 166, 0.2) 0%,
    rgba(20, 184, 166, 0.09) 35%,
    transparent 75%
  );
}

@media (min-width: 640px) {
  .hero-spotlight {
    background-image: radial-gradient(
      ellipse 60% 50% at 50% 45%,
      rgba(20, 184, 166, 0.18) 0%,
      rgba(20, 184, 166, 0.08) 35%,
      transparent 75%
    );
  }
}
</style>
