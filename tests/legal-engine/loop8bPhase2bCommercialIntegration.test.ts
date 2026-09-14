import { describe, expect, it } from 'vitest';
import { buildCaseContext } from '@/lib/legal-engine/caseContext';
import { buildDocumentPlan, buildTemplateSkeleton } from '@/lib/legal-engine/documentPlan';
import { DocumentTemplates } from '@/lib/legal-engine/documentTemplates';
import { getCanonicalOutputFilename } from '@/lib/legal-engine/outputFilename';
import { ExportGuardError, prepareUniversalDocumentForExport, validateForExport } from '@/lib/legal-engine/exportGuards';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { generateSection, runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { generatePrintHtml } from '@/lib/templates/exportPdf';
import { exportToDocx } from '@/lib/templates/exportDocx';
import { exportToText } from '@/lib/templates/exportText';
import type { RenderedDocument } from '@/lib/templates/templateTypes';
import { createEmptyDocument, type UploadedSourceDocument } from '@/lib/legal-engine/types';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { CommercialEnforcementManualInput } from '@/lib/legal-engine/commercialEnforcement';

const TARGET_ID = 'demanda_ejecutiva_mercantil';

function source(id = 'commercial-primary'): UploadedSourceDocument {
  return {
    id,
    filename: `${id}.txt`,
    content: 'Contenido mercantil sintético autorizado.',
    sourceValidated: true,
    classification: { sourceDocumentType: 'PAGARE', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
  };
}

function analysis(): CaseAnalysis {
  return {
    parties: {}, authorities: [], caseNumbers: {}, proceduralTimeline: [], challengedActs: [], claims: [], arguments: [], evidence: [], facts: [], rulings: [], citations: [],
    proceduralPosture: { proceduralWrit: '', isExtraordinary: false, constitutionalIssues: [], legalityIssues: [], exceptionalInterest: null },
    caseTheory: { factualTheory: '', legalTheory: '', constitutionalTheory: '', proceduralTheory: '', opposingTheory: '', vulnerabilities: [], strengths: [] },
    argumentAxes: [], missingData: [], anonymizedData: [], unsupportedClaims: [],
  };
}

const confirmed = (value: string) => ({ value, confirmedByLawyer: true as const });
const manual: CommercialEnforcementManualInput = {
  personality: confirmed('Personalidad procesal confirmada'),
  parties: { creditor: confirmed('Acreedor sintético'), debtor: confirmed('Deudor sintético') },
  procedural: {
    court: confirmed('Juzgado mercantil competente'), jurisdiction: confirmed('Competencia por confirmar en forma'),
    procedure: confirmed('Juicio ejecutivo mercantil'), action: confirmed('Acción ejecutiva confirmada'),
    enforceabilityDecision: confirmed('Procedencia confirmada por el abogado'),
  },
  instrument: {
    id: 'instrument-synthetic', instrumentType: 'PAGARE',
    formalCompleteness: confirmed('Integridad formal confirmada'),
    enforceabilityAssessment: confirmed('Ejecutividad confirmada'),
    maturityAndExigibility: confirmed('Vencimiento y exigibilidad confirmados'),
    lawyerDecision: confirmed('Decisión profesional confirmada'),
    amount: { amount: '1000.00', currency: confirmed('MXN'), confirmedByLawyer: true },
    dueDate: confirmed('2026-03-10'),
  },
  obligations: [{ id: 'obligation-synthetic', concept: confirmed('Obligación sintética'), principalAmount: { amount: '1000.00', currency: confirmed('MXN'), confirmedByLawyer: true } }],
  facts: [{ id: 'fact-synthetic', value: 'Hecho mercantil sintético confirmado', confirmedByLawyer: true }],
  claims: [{ id: 'claim-synthetic', value: 'Pago del saldo confirmado', confirmedByLawyer: true, relatedFacts: ['fact-synthetic'], relatedObligations: ['obligation-synthetic'] }],
  evidence: [{ id: 'evidence-synthetic', value: 'Pagaré sintético aportado', confirmedByLawyer: true, relatedFacts: ['fact-synthetic'] }],
  requests: [{ id: 'request-synthetic', value: 'Petición congruente sintética', confirmedByLawyer: true, relatedClaims: ['claim-synthetic'] }],
  legalBasis: [{ id: 'legal-basis-synthetic', value: 'Fundamento sintético confirmado', confirmedByLawyer: true }],
  signature: confirmed('Firma confirmada'),
};

function commercialContext() {
  return buildCaseContext([source()], analysis(), undefined, undefined, manual);
}

function readyCandidate() {
  const context = commercialContext();
  const base = createEmptyDocument({
    documentType: TARGET_ID,
    templateId: TARGET_ID,
    documentTypeLabel: 'Demanda Ejecutiva Mercantil',
    matter: 'MERCANTIL',
    jurisdiction: 'mercantil confirmada',
    caseContext: context,
    sourceDocuments: [source()],
    legalBasis: ['Fundamento sintético confirmado por el abogado.'],
  });
  base.caseContext = context;
  const template = DocumentTemplates[TARGET_ID];
  if (!template) throw new Error('Missing commercial template');
  base.sections = buildTemplateSkeleton(template, base).map((section) => ({
    ...section,
    content: [{
      ...section.content[0],
      text: `Contenido mercantil confirmado para ${section.id}. ` + 'Redacción sintética verificable. '.repeat(24),
    }],
  }));
  base.generationMetadata.preflight = { status: 'READY', missingFields: [] } as never;
  base.validation = { isValid: true, errors: [], warnings: [] };
  const quality = runQualityGateCheck(base);
  (base as any).qualityGate = quality;
  return base;
}

describe('LOOP 8B FASE 2B — integración de pipeline mercantil', () => {
  it('el fallback determinístico mercantil no reutiliza lenguaje de amparo', async () => {
    const template = DocumentTemplates[TARGET_ID];
    if (!template) throw new Error('Missing commercial template');
    const doc = createEmptyDocument({
      documentType: TARGET_ID,
      documentTypeLabel: 'Demanda Ejecutiva Mercantil',
      matter: 'MERCANTIL',
    });
    doc.sections = buildTemplateSkeleton(template, doc);
    const result = await generateSection(doc, 'hechos');

    expect(result.text).not.toMatch(/autoridad responsable|garantías fundamentales|medio de defensa|revocar/i);
    expect(result.text).toMatch(/DATO PENDIENTE|REQUIERE/i);
  });

  it('no convierte una fuente larga en MACHOTE cuando el modo es automático', () => {
    const template = DocumentTemplates[TARGET_ID];
    if (!template) throw new Error('Missing commercial template');
    const doc = createEmptyDocument({
      documentType: TARGET_ID,
      documentTypeLabel: 'Demanda Ejecutiva Mercantil',
      matter: 'MERCANTIL',
    });
    const plan = buildDocumentPlan({
      doc,
      template,
      referenceText: 'Fuente mercantil sintética de referencia. '.repeat(30),
      useReferenceStructure: false,
    });

    expect(plan.planSource).toBe('GENERATED');
    expect(plan.sections.map((section) => section.title)).toEqual(template.estructura);
  });

  it('no permite que un machote de otra familia reemplace el esqueleto mercantil', () => {
    const template = DocumentTemplates[TARGET_ID];
    if (!template) throw new Error('Missing commercial template');
    const doc = createEmptyDocument({
      documentType: TARGET_ID,
      documentTypeLabel: 'Demanda Ejecutiva Mercantil',
      matter: 'MERCANTIL',
    });
    const plan = buildDocumentPlan({
      doc,
      template,
      referenceText: 'CONCEPTOS DE VIOLACIÓN\nSUSPENSIÓN\nAGRAVIOS\n'.repeat(20),
      useReferenceStructure: true,
    });

    expect(plan.planSource).toBe('GENERATED');
    expect(plan.sections.map((section) => section.title)).toEqual(template.estructura);
  });

  it('conserva el contexto comercial en el único pipeline y no autoexporta', async () => {
    const document = await runGenerationPipeline({
      selectedDocumentType: TARGET_ID,
      matter: 'MERCANTIL',
      userInstruction: 'Preparar una demanda ejecutiva mercantil con la fuente sintética confirmada.',
      sourceDocuments: [source()],
      commercialManualInput: manual,
      generateSection: ({ section }) => `Contenido confirmado de ${section.id}. ` + 'Desarrollo mercantil sintético verificable. '.repeat(24),
    });

    expect(document.documentType).toBe(TARGET_ID);
    expect(document.templateId).toBe(TARGET_ID);
    expect(document.caseContext?.commercialEnforcement?.documentType).toBe(TARGET_ID);
    expect((document.generationMetadata as any).preflight.status).toBe('READY');
    expect(document.status).toBe('draft');
    expect(['DRAFT', 'REVIEW_REQUIRED']).toContain((document.generationMetadata as any).readiness);
  });
});

describe('LOOP 8B FASE 2B — gate común y exportación mercantil', () => {
  it('exige preflight y quality gate presentes antes de exportar', async () => {
    const incomplete = readyCandidate();
    delete (incomplete.generationMetadata as any).preflight;
    delete (incomplete as any).qualityGate;
    const report = validateForExport(incomplete);
    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('COMMERCIAL_PREFLIGHT_NOT_READY'),
      expect.stringContaining('COMMERCIAL_QUALITY_GATE_NOT_READY'),
    ]));
    await expect(prepareUniversalDocumentForExport(incomplete)).rejects.toBeInstanceOf(ExportGuardError);
    await expect(exportUniversalToDocx(incomplete)).rejects.toBeInstanceOf(ExportGuardError);
    await expect(exportUniversalToPdf(incomplete)).rejects.toBeInstanceOf(ExportGuardError);
  });

  it('bloquea el mismo canonical cuando llega al DTO de exportación legacy', async () => {
    const legacy: RenderedDocument = {
      title: 'Demanda Ejecutiva Mercantil', documentType: TARGET_ID, header: '', body: 'Contenido sintético',
      sections: [], footer: '', warnings: [], disclaimer: '', generatedAt: new Date().toISOString(),
    };
    expect(() => generatePrintHtml(legacy)).toThrow(ExportGuardError);
    await expect(exportToDocx(legacy)).rejects.toBeInstanceOf(ExportGuardError);
  });

  it.each([
    'contestacion_demanda_oral_civil',
    'contestacion_demanda_arrendamiento',
    'reconvencion_civil',
    'contestacion_reconvencion_civil',
    'reconvencion_mercantil',
    'contestacion_reconvencion_mercantil',
    'excepciones_mercantiles',
  ])('bloquea bypass del exporter de texto legacy para %s', (documentType) => {
    const legacy: RenderedDocument = {
      title: documentType, documentType, header: '', body: 'Contenido sintético',
      sections: [], footer: '', warnings: [], disclaimer: '', generatedAt: new Date().toISOString(),
    };
    expect(() => exportToText(legacy)).toThrow(ExportGuardError);
  });

  it('permite solo READY_TO_EXPORT con gates aprobados y filename canónico', async () => {
    const candidate = readyCandidate();
    expect((candidate as any).qualityGate).toMatchObject({ passed: true, canMarkAsFinal: true });
    const ready = markDocumentAsReadyToExport(candidate, { explicit: true });
    expect(getCanonicalOutputFilename('demanda-ejecutiva-mercantil')).toBe('Demanda Ejecutiva Mercantil.docx');
    const prepared = await prepareUniversalDocumentForExport(ready);
    expect(prepared.document.documentType).toBe(TARGET_ID);
    expect(prepared.qualityGate.canMarkAsFinal).toBe(true);
  });

  it('no acepta readiness escrita en metadata sin lifecycle explícito', () => {
    const candidate = readyCandidate();
    (candidate.generationMetadata as any).readiness = 'READY_TO_EXPORT';
    const report = validateForExport(candidate);
    expect(report.ok).toBe(false);
    expect(report.errors).toContain('LIFECYCLE_NOT_EXPORTABLE: el documento no tiene una transición lifecycle explícita.');
  });

  it('bloquea grafo mercantil roto y provenance hacia fuentes inexistentes', () => {
    const candidate = readyCandidate();
    const context = candidate.caseContext?.commercialEnforcement;
    if (!context) throw new Error('Missing commercial context');
    candidate.caseContext!.commercialEnforcement = {
      ...context,
      claims: context.claims.map((claim) => ({ ...claim, relatedObligations: [], relatedFacts: [] })),
      facts: context.facts.map((fact) => ({
        ...fact,
        sources: [{ documentId: 'source-that-does-not-exist', kind: 'KNOWN_PROVENANCE' }],
      })),
    };
    const quality = runQualityGateCheck(candidate);
    expect(quality.criticalErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'COMMERCIAL_GRAPH_BROKEN' }),
      expect.objectContaining({ checkId: 'COMMERCIAL_PROVENANCE_INVALID' }),
    ]));
  });
});
