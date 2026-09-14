import { describe, expect, it } from 'vitest';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { buildCaseContext } from '@/lib/legal-engine/caseContext';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { buildDocumentPlan } from '@/lib/legal-engine/documentPlan';
import { getDocumentStrategy } from '@/lib/legal-engine/documentStrategies';
import { DocumentTemplates } from '@/lib/legal-engine/documentTemplates';
import { runDocumentPreflight } from '@/lib/legal-engine/documentPreflight';
import { getRequiredSectionIds } from '@/lib/legal-engine/exportGuards';
import {
  evaluateSourceOutputCompatibility,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { generatePrintHtml } from '@/lib/templates/exportPdf';
import { exportToDocx } from '@/lib/templates/exportDocx';
import { exportToText } from '@/lib/templates/exportText';
import { ExportGuardError } from '@/lib/legal-engine/exportGuards';

const IMPLEMENTED_OUTPUTS = [
  { id: 'ofrecimiento_pruebas_civil', sourceType: 'DEMANDA_CIVIL' },
  { id: 'objecion_pruebas_civil', sourceType: 'PRUEBA_DOCUMENTAL_CIVIL' },
  { id: 'desahogo_vista_civil', sourceType: 'ACUERDO' },
  { id: 'alegatos_civil', sourceType: 'DEMANDA_CIVIL' },
  { id: 'ofrecimiento_pruebas_mercantil', sourceType: 'DEMANDA_MERCANTIL' },
  { id: 'objecion_documentos_mercantil', sourceType: 'DOCUMENTO_MERCANTIL_BASE' },
  { id: 'alegatos_mercantil', sourceType: 'DEMANDA_MERCANTIL' },
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
    claims: ['Pretensión sintética'],
    claimResponses: [],
    arguments: [],
    evidence: [{
      id: 'evidence-1', type: 'DOCUMENTAL', description: 'Documento probatorio sintético',
      confirmed: false, provenance: 'SOURCE_EXTRACTED', sourceReference: { documentId: 'source', page: 1 },
    }],
    facts: [{
      id: 'fact-1', number: '1', text: 'Hecho sintético', confidence: 1,
      position: 'UNDEFINED', lawyerPosition: 'UNDEFINED', sourceReference: { documentId: 'source', page: 1 },
    }],
    rulings: [],
    citations: [],
    proceduralPosture: { proceduralWrit: '', isExtraordinary: false, constitutionalIssues: [], legalityIssues: [], exceptionalInterest: null },
    caseTheory: { factualTheory: '', legalTheory: '', constitutionalTheory: '', proceduralTheory: '', opposingTheory: '', vulnerabilities: [], strengths: [] },
    argumentAxes: [{
      id: 'argument-1', title: 'Argumento sintético', issue: 'Cuestión sintética', facts: ['fact-1'], rules: [],
      reasoning: 'Razonamiento sintético', counterargument: '', rebuttal: '', requestedConsequence: 'Consecuencia por confirmar',
      sources: [{ documentId: 'source', page: 1, excerpt: 'Fragmento sintético' }],
    }],
    missingData: [],
    anonymizedData: [],
    unsupportedClaims: [],
    ...overrides,
  };
}

describe('LOOP 8B FASE 2D — evidencia y argumentos Civil/Mercantil', () => {
  it.each(IMPLEMENTED_OUTPUTS)('$id tiene strategy, template y estado IMPLEMENTED', ({ id }) => {
    expect(getDocumentStrategy(id)).toMatchObject({ id, documentType: id, dedicated: true });
    expect(DocumentTemplates[id]).toMatchObject({ tipo: id, esqueletoDedicado: true });
    expect(getCatalogDocument(id)).toMatchObject({ id, status: 'IMPLEMENTED', strategyId: id, templateId: id });
  });

  it.each(IMPLEMENTED_OUTPUTS)('$id declara source compatibility explícita', ({ id, sourceType }) => {
    const policy = evaluateSourceOutputCompatibility({ selectedDocumentType: id, sourceDocuments: [source('primary', sourceType)] });
    expect(policy.selectedDocumentType).toBe(id);
    expect(policy.compatibilityStatus).toBe('EXPLICIT_COMPATIBILITY');
    expect(policy.status).toBe('COMPATIBLE');
    expect(policy.acceptedSourceTypes).toContain(sourceType);
  });

  it('mantiene conclusiones_civil como ASSISTED_DRAFT y no finge soporte productivo', () => {
    expect(getCatalogDocument('conclusiones_civil')).toMatchObject({ status: 'ASSISTED_DRAFT', strategyId: null, templateId: null });
    expect(getDocumentStrategy('conclusiones_civil')).toBeUndefined();
    expect(DocumentTemplates['conclusiones_civil']).toBeUndefined();
  });

  it('no marca una evidencia extraída como confirmada por tener descripción', () => {
    const context = buildCaseContext(
      [source('source', 'DEMANDA_CIVIL')],
      analysis(),
      undefined,
      undefined,
      undefined,
      'ofrecimiento_pruebas_civil',
    );

    expect(context.civilMercantileEvidenceArgument?.evidence).toMatchObject([{
      id: 'evidence-1', status: 'REQUIRES_LAWYER_CONFIRMATION', relatedFacts: [],
    }]);
  });

  it('bloquea preflight de ofrecimiento cuando evidencia o sus relaciones no están confirmadas', () => {
    const context = buildCaseContext(
      [source('source', 'DEMANDA_CIVIL')],
      analysis(),
      undefined,
      undefined,
      undefined,
      'ofrecimiento_pruebas_civil',
    );
    const result = runDocumentPreflight(
      'ofrecimiento_pruebas_civil',
      [source('source', 'DEMANDA_CIVIL')],
      context,
      analysis(),
    );

    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.missingFields.map((field) => field.id)).toEqual(expect.arrayContaining(['evidence_confirmation', 'evidence_fact_links']));
  });

  it.each(IMPLEMENTED_OUTPUTS)('$id conserva sus secciones y no adopta una estructura de otra familia', ({ id }) => {
    const template = DocumentTemplates[id];
    if (!template) throw new Error('Missing evidence template');
    const plan = buildDocumentPlan({
      doc: { documentType: id, documentTypeLabel: id, matter: id.includes('mercantil') ? 'MERCANTIL' : 'CIVIL', sections: [] } as any,
      template,
      referenceText: 'DEMANDA DE AMPARO DIRECTO\nCONCEPTOS DE VIOLACIÓN\nSUSPENSIÓN\n'.repeat(30),
      useReferenceStructure: true,
    });

    expect(plan.planSource).toBe('GENERATED');
    expect(plan.sections.map((section) => section.title)).toEqual(template.estructura);
    expect(getRequiredSectionIds(id)).toEqual(getDocumentStrategy(id)?.requiredSectionIds);
  });

  it('rechaza una fuente laboral para la salida civil de pruebas', () => {
    expect(() => evaluateSourceOutputCompatibility({
      selectedDocumentType: 'ofrecimiento_pruebas_civil',
      sourceDocuments: [source('laboral', 'DEMANDA_LABORAL')],
    })).toThrowError(/SOURCE_DOCUMENT_INCOMPATIBLE/);
  });

  it('genera alegatos mercantiles bajo el pipeline único y conserva DRAFT si faltan confirmaciones', async () => {
    const document = await runGenerationPipeline({
      selectedDocumentType: 'alegatos_mercantil',
      documentTypeLabel: 'Alegatos mercantiles',
      matter: 'MERCANTIL',
      userInstruction: 'Preparar alegatos mercantiles sintéticos.',
      sourceDocuments: [source('mercantile', 'DEMANDA_MERCANTIL')],
      generateSection: async ({ section }: { section: { title: string } }) => `Contenido sintético de ${section.title}.`,
    } as any);

    expect(document.documentType).toBe('alegatos_mercantil');
    expect(document.templateId).toBe('alegatos_mercantil');
    expect((document.generationMetadata as any).readiness).toBe('REVIEW_REQUIRED');
    expect(document.status).toBe('draft');
  });

  it('bloquea los tres exporters legacy para cualquier actuación 2D canónica', async () => {
    const legacy = {
      title: 'Documento sintético', documentType: 'ofrecimiento_pruebas_civil', header: '', body: '',
      sections: [], footer: '', warnings: [], disclaimer: '', generatedAt: new Date().toISOString(),
    };
    expect(() => generatePrintHtml(legacy)).toThrow(ExportGuardError);
    expect(() => exportToText(legacy)).toThrow(ExportGuardError);
    await expect(exportToDocx(legacy)).rejects.toBeInstanceOf(ExportGuardError);
  });
});
