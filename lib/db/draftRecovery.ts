import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveLexPlantillasStoragePaths } from '@/lib/workspace/storagePaths';

/**
 * Copia de recuperación de un borrador cuyo guardado falló.
 *
 * Si la base local rechaza la escritura (disco lleno, archivo bloqueado,
 * esquema dañado), el texto editado se escribe aquí antes de responder el error,
 * para que el abogado no pierda trabajo aunque cierre la aplicación. Vive junto a
 * los datos del usuario, nunca en temporales.
 */

export interface DraftRecoveryCopy {
  version: 1;
  recoveryId: string;
  createdAt: string;
  operation: 'create' | 'update';
  draftId: string | null;
  errorCode: string;
  payload: unknown;
}

export function draftRecoveryDirectory(): string {
  return path.join(resolveLexPlantillasStoragePaths().data, 'recovery', 'drafts');
}

export async function writeDraftRecoveryCopy(input: {
  operation: 'create' | 'update';
  draftId?: string | null;
  errorCode: string;
  payload: unknown;
}): Promise<string> {
  const directory = draftRecoveryDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const createdAt = new Date().toISOString();
  const recoveryId = `${createdAt.replace(/[:.]/g, '-')}-${randomUUID()}`;
  const copy: DraftRecoveryCopy = {
    version: 1,
    recoveryId,
    createdAt,
    operation: input.operation,
    draftId: input.draftId ?? null,
    errorCode: input.errorCode,
    payload: input.payload,
  };
  const file = path.join(directory, `${recoveryId}.json`);
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(copy), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await rename(temporary, file);
  return recoveryId;
}

export async function listDraftRecoveryCopies(): Promise<DraftRecoveryCopy[]> {
  let files: string[];
  try {
    files = await readdir(draftRecoveryDirectory());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const copies = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) =>
    JSON.parse(await readFile(path.join(draftRecoveryDirectory(), file), 'utf8')) as DraftRecoveryCopy));
  return copies.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Respuesta de error clara para el editor. El mensaje se muestra tal cual en la
 * notificación "NO GUARDADO: …" del cliente, que conserva el documento en memoria.
 */
export async function draftSaveFailureResponse(input: {
  operation: 'create' | 'update';
  draftId?: string | null;
  payload: unknown;
  error: unknown;
}): Promise<Response> {
  const errorCode = 'DRAFT_SAVE_FAILED';
  console.error('[legal-drafts] fallo de escritura en la base local:', input.error instanceof Error ? input.error.message : 'unknown');
  let recoveryId: string | null = null;
  try {
    recoveryId = await writeDraftRecoveryCopy({ operation: input.operation, draftId: input.draftId, errorCode, payload: input.payload });
  } catch (recoveryError) {
    console.error('[legal-drafts] tampoco se pudo escribir la copia de recuperación:', recoveryError instanceof Error ? recoveryError.message : 'unknown');
  }
  const error = recoveryId
    ? 'No se pudo guardar el borrador en la base local. Se conservó una copia de recuperación en la carpeta de datos y el texto sigue abierto en el editor.'
    : 'No se pudo guardar el borrador en la base local ni escribir la copia de recuperación. No cierres el editor: copia el texto antes de salir.';
  return Response.json({ ok: false, errorCode, error, recoveryId }, { status: 503 });
}
