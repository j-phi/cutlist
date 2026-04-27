import type {
  IdbAnnotation,
  IdbBuildStep,
  IdbModel,
  IdbScene,
} from '~/composables/useIdb';
import { SCHEMA_VERSION } from '~/utils/versions';
import { gzipCompress } from '~/utils/compress';

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
  buildSteps?: IdbBuildStep[];
  scenes?: IdbScene[];
  annotations?: IdbAnnotation[];
}

/**
 * Minimal database surface needed to build a `ProjectExport`. Decouples the
 * data-building logic from the concrete IDB composable so it can be exercised
 * directly in tests without a Nuxt runtime.
 */
export interface ProjectExportDb {
  getProjectWithModels: ReturnType<typeof useIdb>['getProjectWithModels'];
  getModelRawSource: ReturnType<typeof useIdb>['getModelRawSource'];
  getBuildSteps: ReturnType<typeof useIdb>['getBuildSteps'];
  getScenesForModel: ReturnType<typeof useIdb>['getScenesForModel'];
  getAnnotationsForProject: ReturnType<
    typeof useIdb
  >['getAnnotationsForProject'];
}

/**
 * Build the `ProjectExport` payload for `projectId` by reading project,
 * models (with each model's `rawSource`), build steps, scenes (gathered
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

  const [buildSteps, sceneLists, annotations] = await Promise.all([
    idb.getBuildSteps(projectId),
    Promise.all(idbProject.models.map((m) => idb.getScenesForModel(m.id))),
    idb.getAnnotationsForProject(projectId),
  ]);
  const scenes = sceneLists.flat();

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
    buildSteps,
    scenes,
    annotations,
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
  }

  return { exportProject };
}
