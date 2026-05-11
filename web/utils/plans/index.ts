/**
 * Runtime accessors for the plans marketplace.
 *
 * The build step (`scripts/build-plans.ts`) emits a static manifest tree
 * under `web/public/plans/_build/`. At runtime we just `$fetch` those
 * JSON files — no decompression, no IDB writes, no Tiptap on the index
 * page.
 */

import type { PlanManifest, PlanSummary } from './types';

export type { PlanManifest, PlanSidecar, PlanSummary } from './types';

let summariesCache: Promise<PlanSummary[]> | null = null;

export function listPlans(): Promise<PlanSummary[]> {
  if (!summariesCache) {
    summariesCache = $fetch<PlanSummary[]>('/plans/_build/index.json').catch(
      (err) => {
        summariesCache = null;
        throw err;
      },
    );
  }
  return summariesCache;
}

export function loadPlan(slug: string): Promise<PlanManifest> {
  return $fetch<PlanManifest>(`/plans/_build/${slug}/manifest.json`);
}
