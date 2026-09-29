export interface FinalLegalReadinessCaseManifest {
  caseNumber: string;
  sourceRelativePath: string;
  sourceSha256: string;
  sourceBytes: number;
}

export interface FinalLegalReadinessManifestInput {
  cases?: readonly FinalLegalReadinessCaseManifest[];
}

export interface FinalLegalReadinessManifestValidation {
  ok: boolean;
  errors: string[];
}

function normalizedPath(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
}

function isProductionStoragePath(value: string): boolean {
  const path = normalizedPath(value);
  return /(^|\/)(data\/uploads|uploads|storage\/production|prisma)(\/|$)/.test(path);
}

export function validateFinalLegalReadinessManifest(
  input: FinalLegalReadinessManifestInput,
): FinalLegalReadinessManifestValidation {
  const cases = input.cases || [];
  const errors: string[] = [];
  const caseNumbers = new Set<string>();
  const sourcePaths = new Set<string>();
  const sourceHashes = new Set<string>();
  let duplicateCaseNumber = false;
  let duplicateSource = false;

  if (cases.length !== 6) errors.push('Se requieren exactamente 6 casos de auditoría.');

  for (const current of cases) {
    const caseNumber = current.caseNumber.trim();
    const sourcePath = normalizedPath(current.sourceRelativePath);
    const sourceHash = current.sourceSha256.trim().toLowerCase();

    if (caseNumbers.has(caseNumber)) duplicateCaseNumber = true;
    caseNumbers.add(caseNumber);
    if (sourcePaths.has(sourcePath) || sourceHashes.has(sourceHash)) duplicateSource = true;
    sourcePaths.add(sourcePath);
    sourceHashes.add(sourceHash);

    if (isProductionStoragePath(current.sourceRelativePath)) {
      errors.push('Una fuente no puede estar dentro del almacenamiento productivo.');
    }
    if (!caseNumber || !sourcePath || !sourceHash || current.sourceBytes <= 0) {
      errors.push('Cada caso debe tener número, ruta, hash y tamaño de fuente válidos.');
    }
  }

  if (duplicateCaseNumber) errors.push('Los números de caso deben ser únicos.');
  if (duplicateSource) errors.push('Las fuentes deben ser únicas por ruta y hash.');

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
