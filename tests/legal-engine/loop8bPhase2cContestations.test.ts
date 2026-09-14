import { describe, expect, it } from 'vitest';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { buildCaseContext } from '@/lib/legal-engine/caseContext';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { getDocumentStrategy } from '@/lib/legal-engine/documentStrategies';
import { DocumentTemplates, getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { buildDocumentPlan } from '@/lib/legal-engine/documentPlan';
import { runDocumentPreflight } from '@/lib/legal-engine/documentPreflight';
import {
  evaluateSourceOutputCompatibility,
  getSourceOutputCompatibilityPolicy,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import { getRequiredSectionIds } from '@/lib/legal-engine/exportGuards';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';

const OUTPUTS = [
  { id: 'contestacion_demanda_oral_civil', sourceType: 'DEMANDA_CIVIL', procedure: 'CONTESTACION_ORAL_CIVIL' },
  { id: 'contestacion_demanda_arrendamiento', sourceType: 'DEMANDA_CIVIL', procedure: 'CONTESTACION_ARRENDAMIENTO' },
  { id: 'reconvencion_civil', sourceType: 'CONTESTACION_DEMANDA', procedure: 'RECONVENCION_CIVIL' },
  { id: 'contestacion_reconvencion_civil', sourceType: 'RECONVENCION_CIVIL', procedure: 'CONTESTACION_RECONVENCION_CIVIL' },
  { id: 'reconvencion_mercantil', sourceType: 'CONTESTACION_DEMANDA', procedure: 'RECONVENCION_MERCANTIL' },
  { id: 'contestacion_reconvencion_mercantil', sourceType: 'RECONVENCION_MERCANTIL', procedure: 'CONTESTACION_RECONVENCION_MERCANTIL' },
  { id: 'excepciones_mercantiles', sourceType: 'DEMANDA_MERCANTIL', procedure: 'EXCEPCIONES_MERCANTILES' },
] as const;

function source(id: string, sourceDocumentType: string, role: 'PRIMARY' | 'SUPPORTING' | 'REFERENCE' | 'UNSPECIFIED' = 'PRIMARY') {
  return createSourceDocument({
    id,
    filename: `${id}.txt`,
    content: `Fuente sintética ${sourceDocumentType}.`,
    sourceValidated: true,
    classification: { sourceDocumentType, role, provenance: 'KNOWN_PROVENANCE' },
  });
}

function analysis(overrides: Partial<CaseAnalysis> = {}): CaseAnalysis {
  return {
    parties: { actor: 'Actor sintético', demandado: 'Demandado sintético' },
    authorities: ['Juzgado sintético competente'],
    caseNumbers: { principal: 'EXP-SINTETICO' },
    proceduralTimeline: [],
    challengedActs: [],
    claims: ['Prestación sintética'],
    claimResponses: [{ id: 'claim-1', number: '1', text: 'Prestación sintética', position: 'OPPOSE', lawyerPosition: 'OPPOSE' }],
    arguments: [],
    evidence: [],
    facts: [{
      id: 'fact-1', number: '1', text: 'Hecho sintético', confidence: 1,
      position: 'DENY', lawyerPosition: 'DENY', sourceReference: { documentId: 'civil', page: 1 },
    }],
    rulings: [],
    citations: [],
    proceduralPosture: { proceduralWrit: '', isExtraordinary: false, constitutionalIssues: [], legalityIssues: [], exceptionalInterest: null },
    caseTheory: { factualTheory: '', legalTheory: '', constitutionalTheory: '', proceduralTheory: '', opposingTheory: '', vulnerabilities: [], strengths: [] },
    argumentAxes: [],
    missingData: [],
    anonymizedData: [],
    unsupportedClaims: [],
    ...overrides,
  };
}

describe('LOOP 8B FASE 2C — contestaciones, reconvenciones y excepciones', () => {
  it.each(OUTPUTS)('$id tiene strategy, template y registry dedicados', ({ id, procedure }) => {
    expect(getDocumentStrategy(id)).toMatchObject({ id, documentType: id, dedicated: true, procedure });
    expect(getDocumentTemplate(id)).toMatchObject({ tipo: id, esqueletoDedicado: true });
    expect(getCatalogDocument(id)).toMatchObject({ id, status: 'IMPLEMENTED', strategyId: id, templateId: id });
  });

  it.each(OUTPUTS)('$id declara compatibilidad fuente → salida explícita', ({ id, sourceType }) => {
    const policy = getSourceOutputCompatibilityPolicy(id);
    expect(policy).toMatchObject({ selectedDocumentType: id, status: 'EXPLICIT_COMPATIBILITY' });
    expect(policy.acceptedSourceTypes).toContain(sourceType);
  });

  it.each(OUTPUTS)('$id tiene secciones canónicas derivadas del template', ({ id }) => {
    expect(getRequiredSectionIds(id).length).toBeGreaterThanOrEqual(8);
  });

  it.each(OUTPUTS)('$id mantiene alineadas strategy, template y export guard', ({ id }) => {
    expect(getDocumentStrategy(id)?.requiredSectionIds).toEqual(getRequiredSectionIds(id));
  });

  it('rechaza una fuente laboral para una contestación civil oral', () => {
    expect(() => evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_oral_civil',
      sourceDocuments: [source('laboral', 'DEMANDA_LABORAL')],
    })).toThrowError(/SOURCE_DOCUMENT_INCOMPATIBLE/);
  });

  it('conserva las posturas procesales en el contexto tipado', () => {
    const context = buildCaseContext(
      [source('civil', 'DEMANDA_CIVIL')],
      analysis({ facts: [{ id: 'fact-1', number: '1', text: 'Hecho sintético', confidence: 1, position: 'UNDETERMINED' }] }),
      undefined,
      undefined,
      undefined,
      'contestacion_demanda_oral_civil',
    );

    expect(context.civilMercantileResponse).toMatchObject({
      documentType: 'contestacion_demanda_oral_civil',
      matter: 'CIVIL',
      facts: [{ posture: 'REQUIERE_POSTURA_ABOGADO' }],
      claims: [{ posture: 'NIEGA' }],
    });
  });

  it('no convierte una posición de análisis en postura confirmada sin lawyerPosition', () => {
    const context = buildCaseContext(
      [source('civil', 'DEMANDA_CIVIL')],
      analysis({
        facts: [{ id: 'fact-1', number: '1', text: 'Hecho sintético', confidence: 1, position: 'ADMIT' } as any],
      }),
      undefined,
      undefined,
      undefined,
      'contestacion_demanda_oral_civil',
    );

    expect(context.civilMercantileResponse?.facts[0]?.posture).toBe('REQUIERE_POSTURA_ABOGADO');
  });

  it('exige una fuente controladora PRIMARY o SUPPORTING en la ruta 2C', () => {
    const referenceOnly = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_oral_civil',
      sourceDocuments: [source('reference', 'DEMANDA_CIVIL', 'REFERENCE')],
    });
    const unspecified = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_oral_civil',
      sourceDocuments: [source('unspecified', 'DEMANDA_CIVIL', 'UNSPECIFIED')],
    });

    expect(referenceOnly.status).toBe('NEEDS_INPUT');
    expect(referenceOnly.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'reference', status: 'REFERENCE_ONLY', controlsOutput: false }),
    ]));
    expect(unspecified.status).toBe('NEEDS_INPUT');
    expect(unspecified.missingRequirements).toContain('source_role:unspecified');
  });

  it('el overload de preflight por documento también aplica el contrato 2C', () => {
    const id = 'contestacion_demanda_oral_civil';
    const doc = {
      ...createSourceDocument({ id: 'reference', filename: 'reference.txt', content: 'Fuente sintética', sourceValidated: true, classification: { sourceDocumentType: 'DEMANDA_CIVIL', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' } }),
    };
    const document = {
      ...({ documentType: id, templateId: id, sourceDocuments: [doc] } as any),
      caseAnalysis: analysis(),
    } as any;
    const result = runDocumentPreflight(document, DocumentTemplates[id], analysis());

    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.missingFields.map((field) => field.id)).toContain('case_context');
  });

  it('ignora una estructura de machote de referencia para una salida 2C dedicada', () => {
    const id = 'reconvencion_mercantil';
    const template = DocumentTemplates[id];
    if (!template) throw new Error('Missing specialized template');
    const document = {
      ...({ documentType: id, documentTypeLabel: 'Reconvención mercantil', matter: 'MERCANTIL' } as any),
      sections: [],
    } as any;
    const plan = buildDocumentPlan({
      doc: document,
      template,
      referenceText: 'DEMANDA DE AMPARO DIRECTO\nCONCEPTOS DE VIOLACIÓN\nSUSPENSIÓN\n'.repeat(30),
      useReferenceStructure: true,
    });

    expect(plan.planSource).toBe('GENERATED');
    expect(plan.sections.map((section) => section.title)).toEqual(template.estructura);
  });

  it('bloquea preflight cuando la fuente y las posturas no están completas', () => {
    const incompleteAnalysis = analysis({
      facts: [{ id: 'fact-1', number: '1', text: 'Hecho sintético', confidence: 1, position: 'UNDETERMINED' }],
      claimResponses: [{ id: 'claim-1', number: '1', text: 'Prestación sintética', position: 'REQUIRE_LAWYER_INPUT' }],
    });
    const context = buildCaseContext(
      [source('civil', 'DEMANDA_CIVIL')],
      incompleteAnalysis,
      undefined,
      undefined,
      undefined,
      'contestacion_demanda_oral_civil',
    );
    const result = runDocumentPreflight(
      'contestacion_demanda_oral_civil',
      source('civil', 'DEMANDA_CIVIL'),
      context,
      incompleteAnalysis,
    );
    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.missingFields.map((field) => field.id)).toEqual(expect.arrayContaining(['fact_postures', 'claim_postures']));
  });

  it('acepta la fuente canónica de una reconvención mercantil sin abrir una ruta civil', () => {
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'reconvencion_mercantil',
      sourceDocuments: [source('mercantil', 'CONTESTACION_DEMANDA')],
    });
    expect(result.compatibilityStatus).toBe('EXPLICIT_COMPATIBILITY');
    expect(result.selectedDocumentType).toBe('reconvencion_mercantil');
  });

  it('genera reconvención mercantil con su plan dedicado y la deja en revisión si faltan posturas', async () => {
    const document = await runGenerationPipeline({
      selectedDocumentType: 'reconvencion_mercantil',
      documentTypeLabel: 'Reconvención mercantil',
      matter: 'Mercantil',
      userInstruction: 'Preparar reconvención mercantil sintética.',
      sourceDocuments: [createSourceDocument({
        id: 'mercantile-source',
        filename: 'mercantile-source.txt',
        content: 'DEMANDA MERCANTIL. HECHOS:\n1. Hecho mercantil sintético.\nPRESTACIONES:\n1. Prestación mercantil sintética.',
        sourceValidated: true,
        classification: { sourceDocumentType: 'CONTESTACION_DEMANDA', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
      })],
      generateSection: async ({ section }: { section: { title: string } }) => `Contenido sintético de ${section.title}.`,
    } as any);

    expect(document.documentType).toBe('reconvencion_mercantil');
    expect(document.templateId).toBe('reconvencion_mercantil');
    expect(document.sections.map((section) => section.title)).toEqual(expect.arrayContaining([
      'HECHOS DE LA RECONVENCIÓN',
      'PRESTACIONES RECONVENCIONALES',
      'PETITORIOS',
    ]));
    expect((document.generationMetadata as any).preflight.status).toBe('NEEDS_INPUT');
    expect((document.generationMetadata as any).readiness).toBe('REVIEW_REQUIRED');
    expect(document.status).toBe('draft');
  });
});
