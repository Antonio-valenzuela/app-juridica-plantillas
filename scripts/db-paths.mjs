// Ruta de la base SQLite local; espejo de lib/db/localDatabase.ts (resolveLocalDatabasePath).
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function storageRoot() {
  const configured = process.env.LEXPLANTILLAS_STORAGE_ROOT?.trim() || process.env.LEGAL_WORKSPACE_ROOT?.trim();
  const appData = process.platform === 'win32'
    ? process.env.LOCALAPPDATA?.trim() || join(homedir(), 'AppData', 'Local')
    : process.env.XDG_DATA_HOME?.trim() || join(homedir(), '.local', 'share');
  return resolve(configured || join(appData, 'LexPlantillas'));
}

export function databasePath() {
  return resolve(process.env.LEXPLANTILLAS_DATABASE_PATH?.trim() || join(storageRoot(), 'data', 'lexplantillas.db'));
}
