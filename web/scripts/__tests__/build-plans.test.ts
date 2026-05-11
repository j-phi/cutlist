import {
  mkdir,
  mkdtemp,
  copyFile,
  writeFile,
  readFile,
  readdir,
  rm,
  unlink,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPlans, parseDataUrl, extForMime } from '../build-plans';
import type { PlanManifest } from '~/utils/plans/types';

const DEMO_CUTLIST = join(__dirname, '..', '..', 'public', 'demo.cutlist');

describe('helpers', () => {
  it('extForMime maps image MIMEs to extensions, defaults to bin', () => {
    expect(extForMime('image/png')).toBe('png');
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime('IMAGE/PNG')).toBe('png');
    expect(extForMime('application/zip')).toBe('bin');
  });

  it('parseDataUrl decodes base64 payloads, returns null on garbage', () => {
    const out = parseDataUrl('data:image/png;base64,aGVsbG8=');
    expect(out?.mime).toBe('image/png');
    expect(Buffer.from(out!.bytes).toString()).toBe('hello');
    expect(parseDataUrl('not-a-data-url')).toBe(null);
  });
});

describe('buildPlans', () => {
  let plansDir: string;

  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), 'plans-test-'));
    plansDir = join(root, 'plans');
    await mkdir(plansDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(join(plansDir, '..'), { recursive: true, force: true });
  });

  async function seed(slug: string, sidecar: Record<string, unknown>) {
    await copyFile(DEMO_CUTLIST, join(plansDir, `${slug}.cutlist`));
    await writeFile(join(plansDir, `${slug}.json`), JSON.stringify(sidecar));
  }

  it('returns an empty index when no plans are present', async () => {
    expect(await buildPlans({ plansDir })).toEqual([]);
  });

  it('throws when a .cutlist has no matching sidecar', async () => {
    await copyFile(DEMO_CUTLIST, join(plansDir, 'orphan.cutlist'));
    await expect(buildPlans({ plansDir })).rejects.toThrow(/sidecar/);
  });

  it('rejects filenames that would produce a non-kebab-case slug', async () => {
    await seed('Coffee Table', { title: 'x', description: 'y' });
    await expect(buildPlans({ plansDir })).rejects.toThrow(/slug/i);
  });

  it('extracts assets, scene thumbs, and resolved doc refs', async () => {
    await seed('demo', { title: 'Test', description: 'd', tags: ['t1'] });
    const [summary] = await buildPlans({ plansDir });
    expect(summary).toMatchObject({
      slug: 'demo',
      title: 'Test',
      tags: ['t1'],
    });
    expect(summary.hero).toMatch(/^\/plans\/_build\/demo\//);

    const manifest: PlanManifest = JSON.parse(
      await readFile(
        join(plansDir, '_build', 'demo', 'manifest.json'),
        'utf-8',
      ),
    );
    expect(manifest.cutlistUrl).toBe('/plans/demo.cutlist');
    expect(
      (await readdir(join(plansDir, '_build', 'demo', 'assets'))).length,
    ).toBeGreaterThan(0);

    // Embed refs in the resolved doc point into the extracted folder.
    const urls = collectResolvedUrls(manifest.doc);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.startsWith('/plans/_build/demo/'))).toBe(true);
  });

  it('wipes _build between runs so removed plans drop', async () => {
    await seed('demo', { title: 'T', description: 'd' });
    await buildPlans({ plansDir });
    await unlink(join(plansDir, 'demo.cutlist'));
    await unlink(join(plansDir, 'demo.json'));
    expect(await buildPlans({ plansDir })).toEqual([]);
    expect(existsSync(join(plansDir, '_build', 'demo'))).toBe(false);
  });
});

type DocNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
};

function collectResolvedUrls(node: unknown): string[] {
  const n = node as DocNode | null;
  if (!n) return [];
  const out: string[] = [];
  if (
    (n.type === 'imageBlock' || n.type === 'sceneBlock') &&
    typeof n.attrs?.resolvedUrl === 'string'
  ) {
    out.push(n.attrs.resolvedUrl);
  }
  for (const c of n.content ?? []) out.push(...collectResolvedUrls(c));
  return out;
}
