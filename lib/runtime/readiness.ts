import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { getProviderDisclosure } from '@/lib/ai/providerDisclosure';
import { resolvePdfRendererForReadiness } from '@/lib/pdf/ocrProviders';
import { resolveLexPlantillasStoragePaths } from '@/lib/workspace/storagePaths';
import { resolveLocalDatabasePath } from '@/lib/db/localDatabase';

export type RuntimeComponentStatus = 'READY' | 'BLOCKED' | 'CONFIGURED_NOT_VERIFIED' | 'NOT_CONFIGURED';

export interface RuntimeComponent {
  status: RuntimeComponentStatus;
  detail: string;
}

export interface RuntimeReadiness {
  overall: 'READY' | 'NOT_READY';
  components: {
    database: RuntimeComponent;
    storage: RuntimeComponent;
    provider: RuntimeComponent;
    ocr: RuntimeComponent;
  };
}

export interface RuntimeReadinessInput {
  databaseConfigured: boolean;
  databaseVerified: boolean;
  storageReady: boolean;
  providerReady: boolean;
  ocr: {
    enabled: boolean;
    workerReady: boolean;
    languageDataReady: boolean;
    pdfRendererReady: boolean;
  };
}

export function deriveRuntimeReadiness(input: RuntimeReadinessInput): RuntimeReadiness {
  const database: RuntimeComponent = !input.databaseConfigured
    ? { status: 'NOT_CONFIGURED', detail: 'La ruta de la base de datos local no es válida.' }
    : !input.databaseVerified
      ? { status: 'CONFIGURED_NOT_VERIFIED', detail: 'La base de datos local (SQLite) aún no se ha creado o no es escribible.' }
      : { status: 'READY', detail: 'Base de datos local (SQLite) disponible y escribible.' };
  const storage: RuntimeComponent = input.storageReady
    ? { status: 'READY', detail: 'Almacenamiento de uploads disponible.' }
    : { status: 'BLOCKED', detail: 'El almacenamiento de uploads no está disponible o no es escribible.' };
  const provider: RuntimeComponent = input.providerReady
    ? { status: 'READY', detail: 'Existe un proveedor de generación disponible.' }
    : { status: 'NOT_CONFIGURED', detail: 'No existe un proveedor de generación disponible.' };
  const ocr: RuntimeComponent = !input.ocr.enabled
    ? { status: 'NOT_CONFIGURED', detail: 'OCR deshabilitado; las fuentes escaneadas requieren revisión manual.' }
    : !input.ocr.workerReady
      ? { status: 'BLOCKED', detail: 'El worker local de OCR no está disponible.' }
      : !input.ocr.languageDataReady
        ? { status: 'BLOCKED', detail: 'Los datos de idioma del OCR no están disponibles.' }
        : !input.ocr.pdfRendererReady
          ? { status: 'BLOCKED', detail: 'pdftoppm no está disponible para PDFs escaneados.' }
          : { status: 'READY', detail: 'OCR local y renderizado PDF disponibles.' };

  const required = [database, storage, provider];
  const ocrRequirementSatisfied = !input.ocr.enabled || ocr.status === 'READY';
  return {
    overall: required.every((component) => component.status === 'READY') && ocrRequirementSatisfied
      ? 'READY'
      : 'NOT_READY',
    components: { database, storage, provider, ocr },
  };
}

/**
 * La carpeta de uploads se crea en la primera subida: en una instalación nueva aún no existe.
 * Está lista si existe y es escribible, o si su ancestro existente más cercano lo es (se podrá
 * crear). El colector no crea nada.
 */
export async function isWritableOrCreatable(target: string): Promise<boolean> {
  let current = path.resolve(target);
  for (;;) {
    try {
      await access(current, constants.F_OK);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return false;
      current = parent;
      continue;
    }
    return access(current, constants.R_OK | constants.W_OK).then(() => true, () => false);
  }
}

export async function collectRuntimeReadiness(): Promise<RuntimeReadiness> {
  const storageReady = await isWritableOrCreatable(resolveLexPlantillasStoragePaths().templates);

  let databaseConfigured = true;
  let databaseVerified = false;
  try {
    const databasePath = resolveLocalDatabasePath();
    await access(databasePath, constants.R_OK | constants.W_OK);
    databaseVerified = true;
  } catch (error) {
    if ((error as Error).message === 'LOCAL_DB_PATH_INSIDE_NODE_MODULES') databaseConfigured = false;
  }

  const ocrProvider = (process.env.OCR_PROVIDER || 'auto').trim().toLowerCase();
  const ocrEnabled = !['off', 'none'].includes(ocrProvider) && process.env.OCR_ENABLED !== 'false';
  const workerPath = process.env.TESSERACT_WORKER_PATH?.trim()
    || path.join(process.cwd(), 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js');
  const languageDataPath = process.env.TESSDATA_PATH?.trim() || path.join(process.cwd(), 'spa.traineddata');
  const [workerReady, languageDataReady, pdfRenderer] = await Promise.all([
    access(workerPath).then(() => true).catch(() => false),
    access(languageDataPath).then(() => true).catch(() => false),
    ocrEnabled ? resolvePdfRendererForReadiness() : Promise.resolve(null),
  ]);
  const disclosure = getProviderDisclosure();

  return deriveRuntimeReadiness({
    databaseConfigured,
    // El colector no abre la base ni la modifica: comprueba que el archivo local exista y
    // que su carpeta sea escribible. La base se crea y migra en el primer uso.
    databaseVerified,
    storageReady,
    providerReady: disclosure.providers.some((provider) => provider.active),
    ocr: { enabled: ocrEnabled, workerReady, languageDataReady, pdfRendererReady: Boolean(pdfRenderer) },
  });
}
