/**
 * Defensive default helpers. Applied on reads so records written by older
 * versions (which may be missing fields added later) still hydrate cleanly.
 */

import { DEFAULT_SETTINGS } from '~/utils/settings';
import type { IdbProject, IdbModelMeta } from './types';

export function applyProjectDefaults(
  p: Partial<IdbProject> & { id: string; name: string },
): IdbProject {
  return {
    ...p,
    stock: p.stock ?? '',
    colorMap: p.colorMap ?? {},
    excludedColors: p.excludedColors ?? [],
    distanceUnit: p.distanceUnit ?? DEFAULT_SETTINGS.distanceUnit,
    bladeWidth: p.bladeWidth ?? DEFAULT_SETTINGS.bladeWidth,
    margin: p.margin ?? DEFAULT_SETTINGS.margin,
    optimize: p.optimize ?? DEFAULT_SETTINGS.optimize,
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
