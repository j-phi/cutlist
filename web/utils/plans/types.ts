/**
 * Shared types for the plans marketplace, all emitted by
 * `scripts/build-plans.ts` as JSON. Keep JSON-safe.
 */

import type { JSONContent } from '@tiptap/core';

export interface PlanSidecar {
  title: string;
  description: string;
  hero?: string;
  tags?: string[];
  credit?: string;
}

export interface PlanSummary {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  credit?: string;
  hero?: string;
}

export interface PlanManifest extends PlanSummary {
  /** Public URL of the canonical `.cutlist` for the Open / Download CTAs. */
  cutlistUrl: string;
  /** Build-doc Tiptap JSON with embed refs resolved into asset URLs. */
  doc: JSONContent | null;
}
