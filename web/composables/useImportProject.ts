import { importProjectFromFile as importProjectFromCompressedFile } from '~/utils/projectImport';
import { reportError } from './useAppErrors';

export default function useImportProject() {
  const { appendProject } = useProjects();
  const { setActiveProject } = useProjectNavigation();
  const { reloadSteps } = useBuildSteps();
  const idb = useIdb();

  async function importFromFile(file: File) {
    const newProjectId = await importProjectFromCompressedFile(file, idb);
    await appendProject(newProjectId);
    setActiveProject(newProjectId);
    await reloadSteps(newProjectId);
  }

  function pickAndImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.cutlist';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        await importFromFile(file);
      } catch (err) {
        reportError({
          title: 'Import failed',
          description: err instanceof Error ? err.message : String(err),
          severity: 'error',
        });
      }
    };
    input.click();
  }

  return { pickAndImport, importFromFile };
}
