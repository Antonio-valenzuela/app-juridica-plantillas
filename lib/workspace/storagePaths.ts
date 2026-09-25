import os from 'node:os';
import path from 'node:path';

export interface LexPlantillasStoragePaths {
  root: string;
  data: string;
  documents: string;
  imports: string;
  index: string;
  backups: string;
  logs: string;
  workspace: string;
  templates: string;
}

function defaultApplicationDataRoot(): string {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Local');
  }
  return process.env.XDG_DATA_HOME?.trim() || path.join(os.homedir(), '.local', 'share');
}

export function resolveLexPlantillasStorageRoot(explicitRoot?: string): string {
  const configuredRoot = explicitRoot?.trim()
    || process.env.LEXPLANTILLAS_STORAGE_ROOT?.trim()
    || process.env.LEGAL_WORKSPACE_ROOT?.trim();
  return path.resolve(configuredRoot || path.join(defaultApplicationDataRoot(), 'LexPlantillas'));
}

export function resolveLexPlantillasStoragePaths(explicitRoot?: string): LexPlantillasStoragePaths {
  const root = resolveLexPlantillasStorageRoot(explicitRoot);
  const data = path.join(root, 'data');
  const documents = path.join(root, 'documents');
  return {
    root,
    data,
    documents,
    imports: path.join(root, 'imports'),
    index: path.join(root, 'index'),
    backups: path.join(root, 'backups'),
    logs: path.join(root, 'logs'),
    workspace: path.join(data, 'legal-workspace'),
    templates: path.join(documents, 'templates'),
  };
}
