export const LOCAL_IMPORT_CATEGORIES = [
  'EXPEDIENTE_REAL',
  'PLANTILLA',
  'ESCRITO',
  'RESOLUCION',
  'SENTENCIA',
  'DEMANDA',
  'CONTESTACION',
  'RECURSO',
  'AMPARO',
  'OFICIO',
  'PRUEBA',
  'LEGISLACION',
  'JURISPRUDENCIA',
  'PROTOCOLO',
  'FORMATO_INSTITUCIONAL',
  'CALCULO',
  'CURSO',
  'REFERENCIA_HISTORICA',
  'DIRECTORIO',
  'ADMINISTRATIVO',
  'OTRO',
] as const;

export type LocalImportCategory = typeof LOCAL_IMPORT_CATEGORIES[number];
export type LocalImportMatter =
  | 'CIVIL'
  | 'FAMILIAR'
  | 'MERCANTIL'
  | 'PENAL'
  | 'AMPARO_CONSTITUCIONAL'
  | 'ADMINISTRATIVO'
  | 'LABORAL'
  | 'SEGURIDAD_SOCIAL'
  | 'DERECHOS_HUMANOS'
  | 'DISCIPLINARIO'
  | 'FISCAL'
  | 'AMBIENTAL'
  | 'OTRA'
  | 'SIN_CLASIFICAR';

export type LocalImportStatus =
  | 'IMPORTABLE'
  | 'DUPLICADO'
  | 'EXCLUIDO_POR_SEGURIDAD'
  | 'DAÑADO'
  | 'REQUIERE_REVISION'
  | 'SIN_CLASIFICAR';

export type LocalImportCompatibility =
  | 'SOPORTADO'
  | 'SOPORTADO_PARCIAL'
  | 'REQUIERE_CONVERSION'
  | 'NO_SOPORTADO';

export type LocalImportTemporalStatus =
  | 'ACTUAL'
  | 'POSIBLEMENTE_DESACTUALIZADO'
  | 'REQUIERE_REVISION';

export type LocalImportExclusionReason =
  | 'CREDENCIAL_O_CERTIFICADO'
  | 'EJECUTABLE_O_SCRIPT'
  | 'ACCESO_DIRECTO'
  | 'TEMPORAL';

export interface LocalImportEntryInput {
  relativePath: string;
  name: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  modifiedAt?: string;
  readable?: boolean;
}

export interface LocalImportRecord extends LocalImportEntryInput {
  id: string;
  status: LocalImportStatus;
  category: LocalImportCategory;
  matter: LocalImportMatter;
  compatibility: LocalImportCompatibility;
  temporalStatus: LocalImportTemporalStatus;
  duplicateOfHash?: string;
  canonicalRecordId?: string;
  exclusionReason?: LocalImportExclusionReason;
  reviewReasons: string[];
  templateCandidate: boolean;
  templateStatus?: 'CANDIDATA_A_PLANTILLA' | 'NO_APLICA';
  imported?: boolean;
  importedAt?: string;
  storageRelativePath?: string;
}

export interface LocalImportSummary {
  analyzed: number;
  importable: number;
  duplicates: number;
  excluded: number;
  damaged: number;
  review: number;
  unclassified: number;
  categoryCounts: Partial<Record<LocalImportCategory, number>>;
  matterCounts: Partial<Record<LocalImportMatter, number>>;
}

export interface LocalImportInventory {
  records: LocalImportRecord[];
  summary: LocalImportSummary;
}

const SECURITY_EXTENSIONS = new Set([
  '.key', '.req', '.csr', '.p12', '.pfx', '.pem', '.der', '.cer', '.crt', '.p7b', '.p7c', '.jks', '.keystore',
]);
const EXECUTABLE_EXTENSIONS = new Set([
  '.exe', '.com', '.msi', '.dll', '.sys', '.scr', '.bat', '.cmd',
  '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.sh', '.jar', '.reg', '.url', '.lnk',
]);
const TEMPORARY_EXTENSIONS = new Set(['.tmp', '.temp', '.bak', '.swp', '.part', '.dmp', '.crdownload', '.download', '.old', '.orig']);
const SUPPORTED_EXTENSIONS = new Set(['.docx', '.pdf', '.jpg', '.jpeg', '.png', '.txt', '.rtf']);
const PARTIAL_EXTENSIONS = new Set(['.doc', '.xls', '.xlsx', '.ppt', '.pptx', '.pps', '.vsd', '.xml']);

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'archivo';
}

function recordId(input: LocalImportEntryInput): string {
  return `local-${input.sha256.slice(0, 16)}-${safePathPart(input.relativePath)}`;
}

function getYear(text: string): number | null {
  const match = text.match(/(?:^|[^0-9])(19|20)\d{2}(?:[^0-9]|$)/);
  return match ? Number(match[0].replace(/[^0-9]/g, '')) : null;
}

function hasAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

function classifyMatter(text: string): LocalImportMatter {
  if (hasAny(text, ['amparo', 'constitucional', 'juicio de garantias'])) return 'AMPARO_CONSTITUCIONAL';
  if (hasAny(text, ['penal', 'imputacion', 'carpeta de investigacion', 'vinculacion a proceso'])) return 'PENAL';
  if (hasAny(text, ['familiar', 'divorcio', 'pension alimenticia', 'alimentos', 'custodia', 'sucesorio'])) return 'FAMILIAR';
  if (hasAny(text, ['mercantil', 'cheque', 'ejecutivo mercantil', 'juicio oral mercantil'])) return 'MERCANTIL';
  if (hasAny(text, ['laboral', 'despido injustificado', 'junta de conciliacion', 'tribunal laboral'])) return 'LABORAL';
  if (hasAny(text, ['civil', 'arrendamiento', 'juicio ordinario civil', 'danos y perjuicios', 'responsabilidad civil'])) return 'CIVIL';
  if (hasAny(text, ['fiscal', 'tributario', 'impuesto', 'sat'])) return 'FISCAL';
  if (hasAny(text, ['administrativo', 'contraloria', 'servidor publico'])) return 'ADMINISTRATIVO';
  if (hasAny(text, ['derechos humanos', 'comision de derechos humanos', 'tortura'])) return 'DERECHOS_HUMANOS';
  if (hasAny(text, ['disciplinario', 'visitaduria'])) return 'DISCIPLINARIO';
  if (hasAny(text, ['ambiental', 'ecologico', 'medio ambiente'])) return 'AMBIENTAL';
  return 'SIN_CLASIFICAR';
}

function classifyCategory(text: string): LocalImportCategory {
  if (hasAny(text, ['plantilla', 'machote', 'modelo reutilizable'])) return 'PLANTILLA';
  if (hasAny(text, ['sentencia', 'laudo', 'fallo'])) return 'SENTENCIA';
  if (hasAny(text, ['resolucion', 'acuerdo', 'auto ', 'proveido'])) return 'RESOLUCION';
  if (hasAny(text, ['demanda', 'accion de'])) return 'DEMANDA';
  if (hasAny(text, ['contestacion', 'contesta'])) return 'CONTESTACION';
  if (hasAny(text, ['recurso', 'revision', 'apelacion', 'queja'])) return 'RECURSO';
  if (hasAny(text, ['amparo', 'juicio de garantias'])) return 'AMPARO';
  if (hasAny(text, ['oficio', 'requerimiento', 'prevencion', 'notificacion'])) return 'OFICIO';
  if (hasAny(text, ['prueba', 'evidencia', 'pericial', 'testimonial'])) return 'PRUEBA';
  if (hasAny(text, ['jurisprudencia', 'tesis aislada', 'precedente'])) return 'JURISPRUDENCIA';
  if (hasAny(text, ['legislacion', 'codigo ', 'constitucion', 'ley '])) return 'LEGISLACION';
  if (hasAny(text, ['protocolo', 'manual'])) return 'PROTOCOLO';
  if (hasAny(text, ['formato', 'cedula', 'solicitud'])) return 'FORMATO_INSTITUCIONAL';
  if (hasAny(text, ['calculo', 'liquidacion', 'planilla', 'interes'])) return 'CALCULO';
  if (hasAny(text, ['curso', 'capacitacion', 'taller'])) return 'CURSO';
  if (hasAny(text, ['directorio', 'telefonos', 'contactos'])) return 'DIRECTORIO';
  if (hasAny(text, ['historico', 'historica', 'archivo muerto'])) return 'REFERENCIA_HISTORICA';
  if (hasAny(text, ['asunto', 'expediente', 'carpeta', 'c.i.', 'ci ']) || /\b\d{2,6}[-/]20\d{2}\b/.test(text)) return 'EXPEDIENTE_REAL';
  if (hasAny(text, ['escrito', 'promocion', 'alegatos', 'manifestacion'])) return 'ESCRITO';
  if (hasAny(text, ['administrativo', 'nomina', 'curriculum', 'curriculo'])) return 'ADMINISTRATIVO';
  return 'OTRO';
}

function classifyCompatibility(extension: string): LocalImportCompatibility {
  if (SUPPORTED_EXTENSIONS.has(extension)) return 'SOPORTADO';
  if (PARTIAL_EXTENSIONS.has(extension)) return extension === '.doc' ? 'SOPORTADO_PARCIAL' : 'REQUIERE_CONVERSION';
  return 'NO_SOPORTADO';
}

function classifyTemporalStatus(text: string, category: LocalImportCategory): LocalImportTemporalStatus {
  const year = getYear(text);
  const currentYear = new Date().getFullYear();
  if (year && year < currentYear - 5) return 'POSIBLEMENTE_DESACTUALIZADO';
  if (category === 'LEGISLACION' && !year) return 'REQUIERE_REVISION';
  return 'ACTUAL';
}

export function classifyLocalImportEntry(input: LocalImportEntryInput): LocalImportRecord {
  const extension = input.extension.toLocaleLowerCase();
  const text = normalized(`${input.relativePath} ${input.name}`);
  const category = classifyCategory(text);
  const matter = classifyMatter(text);
  const compatibility = classifyCompatibility(extension);
  const templateCandidate = category === 'PLANTILLA';
  const base: LocalImportRecord = {
    ...input,
    extension,
    id: recordId({ ...input, extension }),
    status: 'IMPORTABLE',
    category,
    matter,
    compatibility,
    temporalStatus: classifyTemporalStatus(text, category),
    reviewReasons: [],
    templateCandidate,
    templateStatus: templateCandidate ? 'CANDIDATA_A_PLANTILLA' : 'NO_APLICA',
  };

  if (SECURITY_EXTENSIONS.has(extension) || hasAny(text, ['fiel', 'e.firma', 'firma electronica', 'llave privada'])) {
    return { ...base, status: 'EXCLUIDO_POR_SEGURIDAD', exclusionReason: 'CREDENCIAL_O_CERTIFICADO' };
  }
  if (EXECUTABLE_EXTENSIONS.has(extension)) {
    return { ...base, status: 'EXCLUIDO_POR_SEGURIDAD', exclusionReason: extension === '.lnk' ? 'ACCESO_DIRECTO' : 'EJECUTABLE_O_SCRIPT' };
  }
  if (TEMPORARY_EXTENSIONS.has(extension) || /(^|[\\/])~\$|thumbs\.db$|desktop\.ini$/.test(text)) {
    return { ...base, status: 'EXCLUIDO_POR_SEGURIDAD', exclusionReason: 'TEMPORAL' };
  }
  if (input.sizeBytes <= 0 || input.readable === false) {
    return { ...base, status: 'DAÑADO', reviewReasons: ['ARCHIVO_VACIO_O_ILEGIBLE'] };
  }
  if (compatibility === 'NO_SOPORTADO') {
    return { ...base, status: 'REQUIERE_REVISION', reviewReasons: ['FORMATO_NO_SOPORTADO'] };
  }
  if (compatibility !== 'SOPORTADO') {
    return { ...base, status: 'REQUIERE_REVISION', reviewReasons: ['FORMATO_REQUIERE_CONVERSION'] };
  }
  if (matter === 'SIN_CLASIFICAR' && category === 'OTRO') {
    return { ...base, status: 'SIN_CLASIFICAR', reviewReasons: ['EVIDENCIA_INSUFICIENTE'] };
  }
  if (base.temporalStatus === 'REQUIERE_REVISION') {
    return { ...base, status: 'REQUIERE_REVISION', reviewReasons: ['VIGENCIA_NO_INFERIBLE'] };
  }
  return base;
}

export function buildLocalImportInventory(inputs: LocalImportEntryInput[]): LocalImportInventory {
  const records = inputs.map(classifyLocalImportEntry);
  const canonicalByHash = new Map<string, LocalImportRecord>();

  for (const record of records) {
    if (record.status === 'EXCLUIDO_POR_SEGURIDAD' || record.status === 'DAÑADO') continue;
    const canonical = canonicalByHash.get(record.sha256.toLocaleLowerCase());
    if (!canonical) {
      canonicalByHash.set(record.sha256.toLocaleLowerCase(), record);
      continue;
    }
    record.status = 'DUPLICADO';
    record.duplicateOfHash = canonical.sha256;
    record.canonicalRecordId = canonical.id;
  }

  const summary: LocalImportSummary = {
    analyzed: records.length,
    importable: records.filter((record) => record.status === 'IMPORTABLE').length,
    duplicates: records.filter((record) => record.status === 'DUPLICADO').length,
    excluded: records.filter((record) => record.status === 'EXCLUIDO_POR_SEGURIDAD').length,
    damaged: records.filter((record) => record.status === 'DAÑADO').length,
    review: records.filter((record) => record.status === 'REQUIERE_REVISION').length,
    unclassified: records.filter((record) => record.status === 'SIN_CLASIFICAR').length,
    categoryCounts: {},
    matterCounts: {},
  };

  for (const record of records) {
    summary.categoryCounts[record.category] = (summary.categoryCounts[record.category] || 0) + 1;
    summary.matterCounts[record.matter] = (summary.matterCounts[record.matter] || 0) + 1;
  }

  return { records, summary };
}
