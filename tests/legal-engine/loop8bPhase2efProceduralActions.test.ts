import { describe, expect, it } from 'vitest';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { getDocumentStrategy } from '@/lib/legal-engine/documentStrategies';
import { DocumentTemplates } from '@/lib/legal-engine/documentTemplates';
import { getRequiredSectionIds } from '@/lib/legal-engine/exportGuards';
import { evaluateSourceOutputCompatibility } from '@/lib/legal-engine/sourceOutputCompatibility';
import { createSourceDocument } from '@/lib/legal-engine/context';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';

const TARGETS = [
  ['incidente_nulidad_actuaciones', 'CIVIL', 'ACUERDO'],
  ['incidente_liquidacion', 'CIVIL', 'SENTENCIA_O_RESOLUCION'],
  ['incidente_costas', 'CIVIL', 'SENTENCIA_O_RESOLUCION'],
  ['incidente_ejecucion', 'CIVIL', 'SENTENCIA_O_RESOLUCION'],
  ['incidente_cumplimiento', 'CIVIL', 'SENTENCIA_O_RESOLUCION'],
  ['incidente_personalidad', 'CIVIL', 'ACUERDO'],
  ['incidente_competencia', 'CIVIL', 'ACUERDO'],
  ['incidente_acumulacion', 'CIVIL', 'ACUERDO'],
  ['solicitud_medida_cautelar_civil', 'CIVIL', 'DEMANDA_CIVIL'],
  ['providencia_precautoria', 'CIVIL', 'ACUERDO'],
  ['solicitud_embargo_precautorio', 'CIVIL', 'DEMANDA_CIVIL'],
  ['providencias_precautorias_mercantiles', 'MERCANTIL', 'ACUERDO'],
  ['apelacion_civil', 'CIVIL', 'SENTENCIA_O_RESOLUCION'],
  ['revocacion_civil', 'CIVIL', 'ACUERDO'],
  ['aclaracion_sentencia_civil', 'CIVIL', 'SENTENCIA_O_RESOLUCION'],
  ['apelacion_mercantil', 'MERCANTIL', 'SENTENCIA_O_RESOLUCION'],
  ['revocacion_mercantil', 'MERCANTIL', 'ACUERDO'],
  ['aclaracion_sentencia_mercantil', 'MERCANTIL', 'SENTENCIA_O_RESOLUCION'],
  ['solicitud_ejecucion_sentencia_civil', 'CIVIL', 'SENTENCIA_O_RESOLUCION'],
  ['liquidacion_sentencia_civil', 'CIVIL', 'SENTENCIA_O_RESOLUCION'],
  ['requerimiento_cumplimiento_sentencia', 'CIVIL', 'SENTENCIA_O_RESOLUCION'],
  ['ejecucion_sentencia_mercantil', 'MERCANTIL', 'SENTENCIA_O_RESOLUCION'],
  ['liquidacion_mercantil', 'MERCANTIL', 'SENTENCIA_O_RESOLUCION'],
  ['embargo_mercantil', 'MERCANTIL', 'ACUERDO'],
] as const;

function source(sourceDocumentType: string, id = 'synthetic-source') {
  return createSourceDocument({
    id,
    filename: `${id}.txt`,
    content: `Fuente sintética ${sourceDocumentType}.`,
    sourceValidated: true,
    classification: { sourceDocumentType, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
  });
}

function analysis(): CaseAnalysis {
  return {
    parties: { actor: 'Actor sintético', demandado: 'Demandado sintético' },
    authorities: ['Órgano sintético competente'],
    caseNumbers: { principal: 'EXP-SINTETICO' },
    proceduralTimeline: [], challengedActs: [], claims: ['Pretensión sintética'], claimResponses: [], arguments: [],
    evidence: [], facts: [], rulings: [], citations: [],
    proceduralPosture: { proceduralWrit: '', isExtraordinary: false, constitutionalIssues: [], legalityIssues: [], exceptionalInterest: null },
    caseTheory: { factualTheory: '', legalTheory: '', constitutionalTheory: '', proceduralTheory: '', opposingTheory: '', vulnerabilities: [], strengths: [] },
    argumentAxes: [], missingData: [], anonymizedData: [], unsupportedClaims: [],
  };
}

describe('LOOP 8B FASE 2E/2F — incidentes, cautelares, recursos y ejecución', () => {
  it.each(TARGETS)('%s tiene contrato documental dedicado e IMPLEMENTED', (id) => {
    expect(getDocumentStrategy(id)).toMatchObject({ id, documentType: id, dedicated: true });
    expect(DocumentTemplates[id]).toMatchObject({ tipo: id, esqueletoDedicado: true });
    expect(getCatalogDocument(id)).toMatchObject({ id, status: 'IMPLEMENTED', strategyId: id, templateId: id });
    expect(getRequiredSectionIds(id)).toEqual(getDocumentStrategy(id)?.requiredSectionIds);
  });

  it.each(TARGETS)('%s declara compatibilidad de fuente y rechaza la materia opuesta', (id, matter, sourceType) => {
    const policy = evaluateSourceOutputCompatibility({ selectedDocumentType: id, sourceDocuments: [source(sourceType)] });
    expect(policy.compatibilityStatus).toBe('EXPLICIT_COMPATIBILITY');
    expect(policy.status).toBe('COMPATIBLE');
    expect(policy.acceptedSourceTypes).toContain(sourceType);
    const opposite = matter === 'CIVIL' ? 'DEMANDA_MERCANTIL' : 'DEMANDA_CIVIL';
    expect(() => evaluateSourceOutputCompatibility({ selectedDocumentType: id, sourceDocuments: [source(opposite, 'opposite')] })).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
  });

  it('mantiene incidente y recurso genéricos como familias no generables', () => {
    expect(getCatalogDocument('incidente')).toMatchObject({ kind: 'FAMILY', status: 'NOT_APPLICABLE' });
    expect(getCatalogDocument('recurso')).toMatchObject({ kind: 'FAMILY', status: 'NOT_APPLICABLE' });
  });

  it('usa el pipeline único y conserva REVIEW_REQUIRED ante datos de decisión faltantes', async () => {
    const document = await runGenerationPipeline({
      selectedDocumentType: 'apelacion_civil', documentTypeLabel: 'Apelación civil', matter: 'CIVIL',
      userInstruction: 'Preparar recurso sintético.', sourceDocuments: [source('SENTENCIA_O_RESOLUCION')],
      caseAnalysis: analysis(),
      generateSection: async ({ section }: { section: { title: string } }) => `Contenido sintético de ${section.title}.`,
    } as any);
    expect(document.documentType).toBe('apelacion_civil');
    expect(document.templateId).toBe('apelacion_civil');
    expect((document.generationMetadata as any).readiness).toBe('REVIEW_REQUIRED');
    expect(document.status).toBe('draft');
  });
});
