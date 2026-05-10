/**
 * Defensive default helpers. Applied on reads so records written by older
 * versions (which may be missing fields added later) still hydrate cleanly.
 */

import type { JSONContent } from '@tiptap/core';
import { DEFAULT_SETTINGS } from '~/utils/settings';
import type {
  IdbProject,
  IdbModelMeta,
  IdbAnnotation,
  IdbBuildDoc,
} from './types';

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
    stock: p.stock ?? '',
    colorMap: p.colorMap ?? {},
    excludedColors: p.excludedColors ?? [],
    distanceUnit: p.distanceUnit ?? DEFAULT_SETTINGS.distanceUnit,
    precision: p.precision ?? DEFAULT_SETTINGS.precision,
    bladeWidth: p.bladeWidth ?? DEFAULT_SETTINGS.bladeWidth,
    margin: p.margin ?? DEFAULT_SETTINGS.margin,
    defaultAlgorithm: p.defaultAlgorithm ?? DEFAULT_SETTINGS.defaultAlgorithm,
    showPartNumbers: p.showPartNumbers ?? DEFAULT_SETTINGS.showPartNumbers,
  } as IdbProject;
}

export function applyModelDefaults(
  m: Partial<IdbModelMeta> & { id: string; projectId: string },
): IdbModelMeta {
  return {
    ...m,
    source: m.source ?? 'gltf',
    enabled: m.enabled ?? true,
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
