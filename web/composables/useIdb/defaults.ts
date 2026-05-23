/**
 * Defensive default helpers. Applied on reads so records written by older
 * versions (which may be missing fields added later) still hydrate cleanly.
 */

import type { JSONContent } from '@tiptap/core';
import { DEFAULT_SETTINGS } from '~/utils/settings';
import type {
  BandedEdges,
  IdbProject,
  IdbModelMeta,
  IdbAnnotation,
  IdbBuildDoc,
  PartOverride,
} from './types';

/** No edges banded — the read-path default for `PartOverride.bandedEdges`. */
export const NO_BANDED_EDGES: BandedEdges = Object.freeze({
  length1: false,
  length2: false,
  width1: false,
  width2: false,
});

/** The shape Tiptap returns from `editor.getJSON()` for a fresh editor. */
export const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

export function applyProjectDefaults(
  p: Partial<IdbProject> & { id: string; name: string },
): IdbProject {
  return {
    ...p,
    stocks: p.stocks ?? [],
    colorMap: p.colorMap ?? {},
    excludedColors: p.excludedColors ?? [],
    distanceUnit: p.distanceUnit ?? DEFAULT_SETTINGS.distanceUnit,
    precision: p.precision ?? DEFAULT_SETTINGS.precision,
    bladeWidth: p.bladeWidth ?? DEFAULT_SETTINGS.bladeWidth,
    margin: p.margin ?? DEFAULT_SETTINGS.margin,
    defaultAlgorithm: p.defaultAlgorithm ?? DEFAULT_SETTINGS.defaultAlgorithm,
    showPartNumbers: p.showPartNumbers ?? DEFAULT_SETTINGS.showPartNumbers,
    showBomName: p.showBomName ?? DEFAULT_SETTINGS.showBomName,
    layoutAlignH: p.layoutAlignH ?? DEFAULT_SETTINGS.layoutAlignH,
    layoutAlignV: p.layoutAlignV ?? DEFAULT_SETTINGS.layoutAlignV,
    labelPlacement: p.labelPlacement ?? DEFAULT_SETTINGS.labelPlacement,
    bandingThicknessUm:
      p.bandingThicknessUm ?? DEFAULT_SETTINGS.bandingThicknessUm,
    subtractBandingThickness:
      p.subtractBandingThickness ?? DEFAULT_SETTINGS.subtractBandingThickness,
    optimizationObjective:
      p.optimizationObjective ?? DEFAULT_SETTINGS.optimizationObjective,
  } as IdbProject;
}

/**
 * Read-path defaults for a single `PartOverride` (F7). Records written before
 * v10's banding fields existed lack `bandedEdges`; hydrate them to "no edges
 * banded". `bandingThicknessUm` stays `undefined` when absent — that's the
 * sentinel for "fall back to the project default", not a missing value.
 */
export function applyPartOverrideDefaults(o: PartOverride): PartOverride {
  return {
    ...o,
    bandedEdges: o.bandedEdges ?? { ...NO_BANDED_EDGES },
  };
}

export function applyModelDefaults(
  m: Partial<IdbModelMeta> & { id: string; projectId: string },
): IdbModelMeta {
  return {
    ...m,
    source: m.source ?? 'gltf',
    enabled: m.enabled ?? true,
    // `partOverrides` is stored sparse — an override carries only the fields
    // the user actually set. We do NOT eagerly fill `bandedEdges` here (that
    // would bloat storage and break round-trip equality); F7's consumer reads
    // each override through `applyPartOverrideDefaults`, the documented
    // read-path safety net for the migration-free banding fields.
    partOverrides: m.partOverrides ?? {},
    colors: m.colors ?? [],
    nodePartMap: m.nodePartMap ?? [],
  } as IdbModelMeta;
}

export function applyBuildDocDefaults(
  d: Partial<IdbBuildDoc> & { projectId: string },
): IdbBuildDoc {
  return {
    projectId: d.projectId,
    title: d.title ?? '',
    doc: d.doc ?? EMPTY_DOC,
    updatedAt: d.updatedAt ?? new Date().toISOString(),
  };
}

export function applyAnnotationDefaults(
  a: Partial<IdbAnnotation> & {
    id: string;
    sceneId: string;
    kind: IdbAnnotation['kind'];
  },
): IdbAnnotation {
  if (typeof a.groupId !== 'number') {
    throw new Error(
      `Annotation ${a.id} is missing required field 'groupId' — corrupt data.`,
    );
  }
  if (a.kind === 'callout') {
    return { ...a, text: a.text ?? '' } as IdbAnnotation;
  }
  return a as IdbAnnotation;
}
