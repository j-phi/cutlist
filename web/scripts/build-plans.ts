#!/usr/bin/env bun
/**
 * Build-time extractor for the plans marketplace.
 *
 * Walks `web/public/plans/<slug>.cutlist` + `<slug>.json` pairs, validates
 * each export, extracts asset blobs and scene thumbnails as real image files
 * under `_build/<slug>/`, rewrites build-doc embed refs to point at those
 * files, and writes a per-plan manifest plus a top-level index.
 *
 * Wired into `predev` / `prebuild`. Re-runs are idempotent — `_build/` is
 * wiped each run so removed plans drop cleanly.
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import type { ProjectExport } from '~/composables/useExportProject';
import { parseProjectExport } from '~/utils/projectImport';
import { injectResolvedRefs } from '~/utils/plans/injectResolvedRefs';
import type {
  PlanManifest,
  PlanSidecar,
  PlanSummary,
} from '~/utils/plans/types';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PLANS_DIR = join(SCRIPT_DIR, '..', 'public', 'plans');

// Slugs become URL segments AND filesystem paths under public/. Lowercase
// kebab-case keeps URLs clean and dodges case-sensitivity surprises between
// macOS dev (case-insensitive APFS) and Linux deploys.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

function extForMime(mime: string): string {
  return MIME_EXT[mime.toLowerCase()] ?? 'bin';
}

// Buffer → Uint8Array coercion: keeps types portable between Bun/Node and
// gives `writeFile` a value it can pipe through without complaint.
function bufToBytes(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

interface DataUrl {
  mime: string;
  bytes: Uint8Array;
}

function parseDataUrl(dataUrl: string): DataUrl | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/.exec(dataUrl);
  if (!match) return null;
  const isBase64 = match[2] === ';base64';
  const payload = isBase64
    ? Buffer.from(match[3], 'base64')
    : Buffer.from(decodeURIComponent(match[3]), 'binary');
  return { mime: match[1], bytes: bufToBytes(payload) };
}

async function decompressCutlist(path: string): Promise<ProjectExport> {
  const compressed = await readFile(path);
  const decompressed = gunzipSync(bufToBytes(compressed));
  return parseProjectExport(JSON.parse(new TextDecoder().decode(decompressed)));
}

async function loadSidecar(path: string): Promise<PlanSidecar> {
  const parsed = JSON.parse(
    await readFile(path, 'utf-8'),
  ) as Partial<PlanSidecar>;
  if (typeof parsed.title !== 'string' || !parsed.title) {
    throw new Error(`Missing or invalid "title" in ${path}`);
  }
  if (typeof parsed.description !== 'string') {
    throw new Error(`Missing or invalid "description" in ${path}`);
  }
  return {
    title: parsed.title,
    description: parsed.description,
    hero: parsed.hero,
    tags: parsed.tags ?? [],
    credit: parsed.credit,
  };
}

async function extractPlan(
  slug: string,
  cutlistPath: string,
  sidecarPath: string,
  buildDir: string,
): Promise<PlanSummary> {
  const sidecar = await loadSidecar(sidecarPath);
  const project = await decompressCutlist(cutlistPath);

  const slugDir = join(buildDir, slug);
  const assetsDir = join(slugDir, 'assets');
  const scenesDir = join(slugDir, 'scenes');
  await mkdir(assetsDir, { recursive: true });
  await mkdir(scenesDir, { recursive: true });

  const publicSlug = `/plans/_build/${slug}`;

  const assetUrls = new Map<string, string>();
  for (const asset of project.assets ?? []) {
    const filename = `${asset.id}.${extForMime(asset.mimeType)}`;
    await writeFile(
      join(assetsDir, filename),
      bufToBytes(Buffer.from(asset.blobBase64, 'base64')),
    );
    assetUrls.set(asset.id, `${publicSlug}/assets/${filename}`);
  }

  const sceneUrls = new Map<string, string>();
  for (const scene of project.scenes ?? []) {
    if (!scene.thumbnailDataUrl) continue;
    const parsed = parseDataUrl(scene.thumbnailDataUrl);
    if (!parsed) continue;
    const filename = `${scene.id}.${extForMime(parsed.mime)}`;
    await writeFile(join(scenesDir, filename), parsed.bytes);
    sceneUrls.set(scene.id, `${publicSlug}/scenes/${filename}`);
  }

  const summary: PlanSummary = {
    slug,
    title: sidecar.title,
    description: sidecar.description,
    tags: sidecar.tags ?? [],
    credit: sidecar.credit,
    hero: sidecar.hero ?? sceneUrls.values().next().value,
  };

  const manifest: PlanManifest = {
    ...summary,
    cutlistUrl: `/plans/${slug}.cutlist`,
    doc: project.buildDoc
      ? injectResolvedRefs(project.buildDoc.doc, { assetUrls, sceneUrls })
      : null,
  };

  await writeFile(
    join(slugDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  return summary;
}

async function discoverPlans(
  plansDir: string,
): Promise<Array<{ slug: string; cutlistPath: string; sidecarPath: string }>> {
  if (!existsSync(plansDir)) return [];
  const entries = await readdir(plansDir);
  return entries
    .filter((f) => f.endsWith('.cutlist'))
    .map((file) => {
      const slug = file.replace(/\.cutlist$/, '');
      if (!SLUG_RE.test(slug)) {
        throw new Error(
          `Invalid plan filename "${file}" — slug "${slug}" must match ${SLUG_RE} (lowercase letters, digits, dashes; starting with a letter or digit).`,
        );
      }
      const sidecar = `${slug}.json`;
      if (!entries.includes(sidecar)) {
        throw new Error(
          `Plan "${slug}" has ${file} but no sidecar ${sidecar} in ${plansDir}`,
        );
      }
      return {
        slug,
        cutlistPath: join(plansDir, file),
        sidecarPath: join(plansDir, sidecar),
      };
    });
}

export interface BuildPlansOptions {
  plansDir?: string;
}

export async function buildPlans(
  options: BuildPlansOptions = {},
): Promise<PlanSummary[]> {
  const plansDir = options.plansDir ?? DEFAULT_PLANS_DIR;
  const buildDir = join(plansDir, '_build');

  if (existsSync(buildDir)) {
    await rm(buildDir, { recursive: true, force: true });
  }
  await mkdir(buildDir, { recursive: true });

  const plans = await discoverPlans(plansDir);
  const summaries: PlanSummary[] = [];
  for (const p of plans) {
    try {
      summaries.push(
        await extractPlan(p.slug, p.cutlistPath, p.sidecarPath, buildDir),
      );
      console.log(`  ✓ ${p.slug}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to build plan "${p.slug}": ${message}`);
    }
  }

  summaries.sort((a, b) => a.title.localeCompare(b.title));
  await writeFile(
    join(buildDir, 'index.json'),
    JSON.stringify(summaries, null, 2),
  );
  return summaries;
}

// `import.meta.main` is Bun-specific (and undefined elsewhere), so this
// branch only fires when the script is invoked directly via `bun`.
if ((import.meta as { main?: boolean }).main) {
  const start = Date.now();
  buildPlans()
    .then((summaries) => {
      console.log(
        `Built ${summaries.length} plan(s) in ${Date.now() - start}ms`,
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { parseDataUrl, extForMime };
