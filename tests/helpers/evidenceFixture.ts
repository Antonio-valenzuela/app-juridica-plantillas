import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { resolveWritingType } from '@/lib/catalog/writingTypeIdentity';

/** Materia por área (misma correspondencia que la evidencia funcional por tipo). */
const MATTER_BY_AREA: Record<string, string> = {
  civil: 'CIVIL', mercantil: 'MERCANTIL', laboral: 'LABORAL', familiar: 'FAMILIAR',
  penal: 'PENAL', agrario: 'AGRARIO', constitucional_amparo: 'CONSTITUCIONAL',
  administrativo: 'ADMINISTRATIVO', fiscal: 'FISCAL', inmobiliario: 'INMOBILIARIO',
  corporativo: 'CORPORATIVO', contractual: 'CONTRACTUAL', propiedad_intelectual: 'PROPIEDAD_INTELECTUAL',
  seguridad_social: 'LABORAL', migratorio: 'ADMINISTRATIVO',
  proteccion_consumidor: 'GENERAL', transparencia_datos_personales: 'GENERAL',
  electoral: 'CONSTITUCIONAL', sucesorio: 'CIVIL',
};

/**
 * Fixture sintético y determinista (sin proveedor). Los tokens de HECHO son EXCLUSIVOS de
 * `caseAnalysis.facts`: la cronología, las pretensiones y la fuente usan tokens distintos, para
 * que un tipo no pueda "conservar los hechos" renderizando solo otra parte del análisis.
 */
export const FACT_TOKENS = ['HECHO_SINTETICO_1', 'HECHO_SINTETICO_2'];

export function syntheticAnalysis(): any {
  return {
    parties: { actor: 'ACTOR SINTETICO', demandado: 'DEMANDADO SINTETICO' },
    authorities: ['AUTORIDAD COMPETENTE SINTETICA'],
    caseNumbers: { principal: 'EXP-EVID-2026/001' },
    proceduralTimeline: [
      { date: '2026-01-15', event: 'Actuación previa ACTUACION_SINTETICA_1', sourceDocument: 'src-evidence', certainty: 1 },
      { date: '2026-02-20', event: 'Actuación posterior ACTUACION_SINTETICA_2', sourceDocument: 'src-evidence', certainty: 1 },
    ], challengedActs: [],
    claims: ['Pretensión PRETENSION_SINTETICA_1'], claimResponses: [], arguments: [],
    evidence: [{ id: 'ev-1', type: 'DOCUMENTAL', description: 'Constancia documental aportada', confirmed: true, provenance: 'LAWYER_CONFIRMED' }],
    facts: FACT_TOKENS.map((token, index) => ({ id: `f-${index + 1}`, number: String(index + 1), text: `${token}: hecho verificable.`, confidence: 1 })),
  };
}

/**
 * Texto sintético de fuente acorde con su tipo declarado. Las compuertas del motor
 * (p. ej. la viabilidad de la revisión de amparo directo) exigen que la fuente
 * realmente sea lo que dice ser; un documento genérico no las satisface.
 */
export function syntheticSourceBody(sourceDocumentType: string): string {
  if (/AMPARO_DIRECTO/.test(sourceDocumentType)) return 'SENTENCIA DE AMPARO DIRECTO. TRIBUNAL COLEGIADO. RESULTANDO. CONSIDERANDO. SE RESUELVE. ';
  if (/SENTENCIA|LAUDO/.test(sourceDocumentType)) return 'SENTENCIA QUE DA ORIGEN AL ESCRITO. ';
  if (/DEMANDA/.test(sourceDocumentType)) return 'DEMANDA QUE ORIGINA EL JUICIO. ';
  return 'DOCUMENTO FUENTE CLASIFICADO. ';
}

export interface GeneratedFixture {
  titles: string[];
  body: string;
}

/** Genera el tipo con el pipeline real, sin proveedor, y devuelve títulos y cuerpo. */
export async function generateWithFixture(id: string, options: { userInstruction?: string; analysis?: any } = {}): Promise<GeneratedFixture> {
  const identity = resolveWritingType(id);
  const sourceType = identity.compatibleSources.acceptedSourceTypes[0]
    || (identity.compatibleSources.acceptsAnySource ? 'REQUERIMIENTO_CIVIL' : 'SENTENCIA_O_RESOLUCION');
  const source = createSourceDocument({
    id: 'src-evidence', filename: 'fuente.txt', sourceValidated: true,
    content: `${syntheticSourceBody(sourceType)}FUENTE_SINTETICA_A. FUENTE_SINTETICA_B. ` + 'CONTENIDO VERIFICABLE DE AUTOS. '.repeat(8),
    classification: { sourceDocumentType: sourceType, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
  } as any);
  const doc: any = await runGenerationPipeline({
    selectedDocumentType: id, documentTypeLabel: identity.label, matter: MATTER_BY_AREA[identity.areaId] || 'CIVIL', jurisdiction: 'Jalisco',
    userInstruction: options.userInstruction ?? `Promover ${identity.label} con los hechos del expediente.`,
    sourceDocuments: [source], caseAnalysis: options.analysis ?? syntheticAnalysis(),
    workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
  } as any);
  return {
    titles: doc.sections.map((section: any) => String(section.title || '')),
    body: doc.sections.flatMap((section: any) => (section.content || []).map((block: any) => block.text || '')).join('\n'),
  };
}

export const normalizeTitle = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Secciones requeridas que NO aparecen en la salida (misma regla que la evidencia funcional). */
export function missingRequiredSections(required: readonly string[], titles: readonly string[]): string[] {
  const normalized = titles.map(normalizeTitle);
  return required.filter((section) => {
    const key = normalizeTitle(section);
    return !normalized.some((title) => title.includes(key) || key.includes(title));
  });
}
