import * as Sentry from '@sentry/nuxt';
import type {
  IdbAnnotation,
  IdbAsset,
  IdbBuildDoc,
  IdbModel,
  IdbScene,
} from '~/composables/useIdb';
import { SCHEMA_VERSION } from '~/utils/versions';
import { gzipCompress } from '~/utils/compress';
import { blobToBase64 } from '~/utils/blobBase64';
import { collectAssetIds } from '~/utils/buildDocRemap';

/**
 * Serialised asset record. The blob is base64-encoded so it survives JSON
 * round-tripping; on import the bytes are rebuilt via `base64ToBlob`.
 */
export interface ExportedAsset {
  id: string;
  projectId: string;
  mimeType: string;
  blobBase64: string;
  createdAt: string;
}

export interface ProjectExport {
  version: number;
  exportedAt: string;
  project: {
    id: string;
    name: string;
    colorMap: Record<string, string>;
    excludedColors: string[];
    stock: string;
    distanceUnit: 'in' | 'mm';
    bladeWidth: number;
    margin: number;
    optimize: 'Auto' | 'CNC';
    showPartNumbers: boolean;
    createdAt: string;
    updatedAt: string;
  };
  models: IdbModel[];
  buildDoc?: IdbBuildDoc;
  scenes?: IdbScene[];
  annotations?: IdbAnnotation[];
  assets?: ExportedAsset[];
}

/**
 * Minimal database surface needed to build a `ProjectExport`. Decouples the
 * data-building logic from the concrete IDB composable so it can be exercised
 * directly in tests without a Nuxt runtime.
 */
export interface ProjectExportDb {
  getProjectWithModels: ReturnType<typeof useIdb>['getProjectWithModels'];
  getModelRawSource: ReturnType<typeof useIdb>['getModelRawSource'];
  getBuildDoc: ReturnType<typeof useIdb>['getBuildDoc'];
  getScenesForModel: ReturnType<typeof useIdb>['getScenesForModel'];
  getAnnotationsForProject: ReturnType<
    typeof useIdb
  >['getAnnotationsForProject'];
  getAssetsForProject: ReturnType<typeof useIdb>['getAssetsForProject'];
}

/**
 * Build the `ProjectExport` payload for `projectId` by reading project,
 * models (with each model's `rawSource`), build doc, scenes (gathered
 * per-model since scenes are model-scoped), and annotations from IDB.
 * Returns `null` if the project does not exist.
 */
export async function buildExportData(
  idb: ProjectExportDb,
  projectId: string,
): Promise<ProjectExport | null> {
  const idbProject = await idb.getProjectWithModels(projectId);
  if (!idbProject) return null;

  const fullModels: IdbModel[] = await Promise.all(
    idbProject.models.map(async (m) => ({
      ...m,
      rawSource: await idb.getModelRawSource(m.id),
    })),
  );

  const [buildDoc, sceneLists, annotations, rawAssets] = await Promise.all([
    idb.getBuildDoc(projectId),
    Promise.all(idbProject.models.map((m) => idb.getScenesForModel(m.id))),
    idb.getAnnotationsForProject(projectId),
    idb.getAssetsForProject(projectId),
  ]);
  const scenes = sceneLists.flat();

  // Filter out assets the doc no longer references so the .cutlist.gz
  // ships lean. Read-only on IDB — the on-load sweep in `useBuildDoc`
  // is the source of truth for actually deleting orphans.
  const liveAssetIds = buildDoc
    ? collectAssetIds(buildDoc.doc)
    : new Set<string>();
  const referencedAssets = rawAssets.filter((a) => liveAssetIds.has(a.id));

  const assets: ExportedAsset[] = await Promise.all(
    referencedAssets.map(
      async (a: IdbAsset): Promise<ExportedAsset> => ({
        id: a.id,
        projectId: a.projectId,
        mimeType: a.mimeType,
        blobBase64: await blobToBase64(a.blob),
        createdAt: a.createdAt,
      }),
    ),
  );

  return {
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    project: {
      id: idbProject.id,
      name: idbProject.name,
      colorMap: idbProject.colorMap,
      excludedColors: idbProject.excludedColors,
      stock: idbProject.stock,
      distanceUnit: idbProject.distanceUnit,
      bladeWidth: idbProject.bladeWidth,
      margin: idbProject.margin,
      optimize: idbProject.optimize,
      showPartNumbers: idbProject.showPartNumbers,
      createdAt: idbProject.createdAt,
      updatedAt: idbProject.updatedAt,
    },
    models: fullModels,
    buildDoc,
    scenes,
    annotations,
    assets,
  };
}

/** Normalize a project name into the on-disk filename (sans extension). */
export function exportFilename(projectName: string): string {
  return `${projectName.replace(/\s+/g, '-')}.cutlist`;
}

export default function useExportProject() {
  const { activeId } = useProjects();
  const idb = useIdb();

  async function exportProject() {
    if (!activeId.value) return;

    const data = await buildExportData(idb, activeId.value);
    if (!data) return;

    const blob = await gzipCompress(JSON.stringify(data));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename(data.project.name);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Sentry.logger.info('Project exported', {
      projectId: data.project.id,
      name: data.project.name,
      modelCount: data.models.length,
      sizeBytes: blob.size,
    });
  }

  return { exportProject };
}
