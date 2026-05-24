import type {
  Algorithm,
  MeasurementMode,
  Micrometres,
  OptimizationObjective,
  Precision,
  StockMatrix,
} from 'cutlist';
import { trackEvent } from '~/utils/analytics';
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
    stocks: StockMatrix[];
    distanceUnit: 'in' | 'mm';
    precision: Precision;
    bladeWidth: Micrometres;
    margin: Micrometres;
    defaultAlgorithm: Algorithm;
    showPartNumbers: boolean;
    showBomName: boolean;
    layoutAlignH: 'left' | 'right';
    layoutAlignV: 'top' | 'bottom';
    labelPlacement: 'top' | 'center';
    measurementMode: MeasurementMode;
    bandingThicknessUm: Micrometres;
    subtractBandingThickness: boolean;
    optimizationObjective: OptimizationObjective;
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
 * A single archive bundling every project, produced by "Export all" and
 * consumed by `importArchiveData`. Each entry is a normal `ProjectExport`, so
 * the per-project Zod + migration gate applies unchanged on import.
 */
export interface MultiProjectExport {
  version: number;
  exportedAt: string;
  projects: ProjectExport[];
}

/**
 * Minimal database surface needed to build a `ProjectExport`. Decouples the
 * data-building logic from the concrete IDB composable so it can be exercised
 * directly in tests without a Nuxt runtime.
 */
export interface ProjectExportDb {
  getAllProjectsByRecency: ReturnType<typeof useIdb>['getAllProjectsByRecency'];
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
      stocks: idbProject.stocks,
      distanceUnit: idbProject.distanceUnit,
      precision: idbProject.precision,
      bladeWidth: idbProject.bladeWidth,
      margin: idbProject.margin,
      defaultAlgorithm: idbProject.defaultAlgorithm,
      showPartNumbers: idbProject.showPartNumbers,
      showBomName: idbProject.showBomName,
      layoutAlignH: idbProject.layoutAlignH,
      layoutAlignV: idbProject.layoutAlignV,
      labelPlacement: idbProject.labelPlacement,
      measurementMode: idbProject.measurementMode,
      bandingThicknessUm: idbProject.bandingThicknessUm,
      subtractBandingThickness: idbProject.subtractBandingThickness,
      optimizationObjective: idbProject.optimizationObjective,
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

/**
 * Build an "Export all" archive containing every project in the library
 * (FR-DUR-6). Projects with no data (deleted between listing and read) are
 * skipped. The archive is importable back into an equivalent set of projects.
 */
export async function buildExportAllData(
  idb: ProjectExportDb,
): Promise<MultiProjectExport> {
  const list = await idb.getAllProjectsByRecency();
  const built = await Promise.all(list.map((p) => buildExportData(idb, p.id)));
  const projects = built.filter((p): p is ProjectExport => p !== null);
  return {
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    projects,
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
    trackEvent('project-exported', {
      hasModels: data.models.length > 0,
      sizeBytes: blob.size,
    });
  }

  async function exportAllProjects() {
    const data = await buildExportAllData(idb);
    if (data.projects.length === 0) return;

    const blob = await gzipCompress(JSON.stringify(data));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cutlist-all-projects.cutlist`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackEvent('project-exported', {
      hasModels: data.projects.some((p) => p.models.length > 0),
      sizeBytes: blob.size,
    });
  }

  return { exportProject, exportAllProjects };
}
