import { createSourceDocument } from '@/lib/legal-engine/context';
import { createDocumentNode, createEmptyDocument, type DocumentNode, type UniversalLegalDocument, type UploadedSourceDocument } from '@/lib/legal-engine/types';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { RichCaseAnalysis } from '@/lib/legal-engine/case-extraction/types';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { bindCoverageToSections } from '@/lib/legal-engine/richCoverage';
import { projectRichCaseAnalysis } from '@/lib/legal-engine/case-extraction/legacyProjection';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import { fixtureA_cleanText, fixtureB_continuousText, fixtureC_commaEvidence, fixtureD_conflictingSources, fixtureE_incompleteCase } from '@/tests/fixtures/caseAnalysisExtractionFixtures';

export const emptyRichCaseAnalysis = (): RichCaseAnalysis => ({
  parties: [],
  assertions: [],
  claims: [],
  facts: [],
  documents: [],
  evidenceMentions: [],
  evidenceOffers: [],
  arguments: [],
  authorities: [],
  dates: [],
  amounts: [],
  proceduralTimeline: [],
  conflicts: [],
  missingData: [],
  sourcePosition: { status: 'UNKNOWN', assertionIds: [], provenance: [] },
  clientPosition: { status: 'UNKNOWN', source: 'SOURCE_POSITION', propositionIds: [], provenance: [] },
  extractionStats: {
    sourceUnitCount: 0,
    candidatesDetected: 0,
    candidatesAccepted: 0,
    candidatesMerged: 0,
    candidatesRejected: 0,
    candidatesForReview: 0,
    rejectionReasons: {},
    provenanceComplete: 0,
    provenancePartial: 0,
    provenanceMissing: 0,
  },
  candidates: [],
});

function fixtureFProvenance(section: string, excerpt: string, elementIndex: number) {
  return [createSourceProvenance({
    sourceId: 'fixture-f-source',
    sourceType: 'DEMANDA_LABORAL',
    sourceName: 'fixture-f-contestacion.txt',
    page: 1,
    section,
    elementIndex,
    excerpt,
    extractionMethod: 'PARAGRAPH',
    confidence: 1,
    inferenceLevel: 'LITERAL',
  })];
}

function fixtureFClientPositionProvenance() {
  return [createSourceProvenance({
    sourceId: 'fixture-f-client-position',
    sourceType: 'CLIENT_POSITION',
    sourceName: 'fixture-f-client-input',
    section: 'CLIENT_POSITION',
    elementIndex: 0,
    excerpt: 'El cliente confirma únicamente la postura relativa al hecho 2.',
    extractionMethod: 'MANUAL_INPUT',
    confidence: 1,
    inferenceLevel: 'LITERAL',
  })];
}

export const fixtureFRichCaseAnalysis = (): RichCaseAnalysis => ({
  parties: [{ id: 'fixture-f-party-demandado', name: 'Parte demandada F', role: 'DEMANDADO', aliases: [], provenance: fixtureFProvenance('PARTES', 'Parte demandada F', 0), confidence: 1, confirmed: true }],
  assertions: [],
  claims: [
    { id: 'fixture-f-claim-1', requestedRelief: 'Pago de salarios', factualBasisIds: ['fixture-f-fact-1'], evidenceMentionIds: ['fixture-f-evidence-mention-1'], provenance: fixtureFProvenance('PRESTACIONES', 'Pago de salarios reclamados.', 1), status: 'SOURCE_MENTIONED' },
    { id: 'fixture-f-claim-2', requestedRelief: 'Pago de indemnización', factualBasisIds: ['fixture-f-fact-3'], evidenceMentionIds: [], provenance: fixtureFProvenance('PRESTACIONES', 'Pago de indemnización solicitada.', 2), status: 'SOURCE_ASSERTED' },
  ],
  facts: [
    { id: 'fixture-f-fact-1', proposition: 'La relación jurídica inició en enero de 2024.', participants: [], assertionStatus: 'SOURCE_ASSERTION', provenance: fixtureFProvenance('HECHOS', 'La relación laboral inició en enero de 2024.', 3), relatedDocumentIds: [] },
    { id: 'fixture-f-fact-2', proposition: 'La jornada se desarrollaba de lunes a viernes.', participants: [], assertionStatus: 'SOURCE_ASSERTION', provenance: fixtureFProvenance('HECHOS', 'La jornada se desarrollaba de lunes a viernes.', 4), relatedDocumentIds: [] },
    { id: 'fixture-f-fact-3', proposition: 'La fuente afirma que existió una terminación.', participants: [], assertionStatus: 'SOURCE_ASSERTION', provenance: fixtureFProvenance('HECHOS', 'La parte actora afirma que existió despido.', 5), relatedDocumentIds: [] },
    { id: 'fixture-f-fact-4', proposition: 'Se menciona un adeudo cuya cantidad requiere confirmación.', participants: [], assertionStatus: 'UNKNOWN', provenance: fixtureFProvenance('HECHOS', 'Se menciona un adeudo cuya cantidad requiere confirmación.', 6), relatedDocumentIds: [] },
  ],
  documents: [{ id: 'fixture-f-document-1', title: 'Contrato laboral', status: 'SOURCE_MENTIONED', provenance: fixtureFProvenance('PRUEBAS', 'Contrato laboral y recibos, relacionados explícitamente con los hechos 1 y 2.', 7) }],
  evidenceMentions: [
    { id: 'fixture-f-evidence-mention-1', documentItemId: 'fixture-f-document-1', type: 'CONTRATO', description: 'Contrato mencionado en la fuente.', relatedFactIds: ['fixture-f-fact-1'], relatedClaimIds: [], status: 'SOURCE_MENTIONED', provenance: fixtureFProvenance('PRUEBAS', 'Contrato laboral y recibos, relacionados explícitamente con los hechos 1 y 2.', 7) },
    { id: 'fixture-f-evidence-mention-2', documentItemId: 'fixture-f-document-1', type: 'RECIBO', description: 'Recibos mencionados en la fuente.', relatedFactIds: ['fixture-f-fact-2'], relatedClaimIds: [], status: 'SOURCE_MENTIONED', provenance: fixtureFProvenance('PRUEBAS', 'Contrato laboral y recibos, relacionados explícitamente con los hechos 1 y 2.', 7) },
  ],
  evidenceOffers: [{ id: 'fixture-f-offer-1', evidenceMentionId: 'fixture-f-evidence-mention-1', status: 'PARTY_OFFERED', provenance: fixtureFProvenance('PRUEBAS', 'Contrato laboral y recibos, relacionados explícitamente con los hechos 1 y 2.', 7) }],
  arguments: [{ id: 'fixture-f-argument-1', proposition: 'La fuente vincula el hecho 2 con el petitorio.', supportingFactIds: ['fixture-f-fact-2'], citedAuthorityIds: ['fixture-f-authority-1'], petitionSectionIds: ['sec-petitorios'], provenance: fixtureFProvenance('ARGUMENTOS', 'La fuente vincula el hecho 2 con el petitorio.', 10) }],
  authorities: [{ id: 'fixture-f-authority-1', authorityType: 'ARTICLE', citationText: 'Artículo citado en la fuente.', verificationStatus: 'SOURCE_CITED', provenance: fixtureFProvenance('ARGUMENTOS', 'Artículo citado en la fuente sin verificación jurídica.', 11) }],
  dates: [{ rawValue: 'enero de 2024', precision: 'MONTH', provenance: fixtureFProvenance('HECHOS', 'enero de 2024', 3) }],
  amounts: [{ rawValue: '$20,000.00', normalizedValue: 20000, currency: 'MXN', provenance: fixtureFProvenance('HECHOS', '$20,000.00', 6) }],
  proceduralTimeline: [],
  conflicts: [{ conflictId: 'fixture-f-conflict-1', type: 'AMOUNT', itemIds: ['fixture-f-fact-4'], sourceIds: ['fixture-f-source-a', 'fixture-f-source-b'], description: 'Las fuentes expresan cantidades distintas.', requiresReview: true }],
  missingData: [
    { id: 'fixture-f-missing-posture', field: 'clientPosition', reason: 'No client posture was found for the remaining facts.', importance: 'HIGH', sectionAffected: 'sec-hechos', blocking: true, sourceSearched: ['fixture-f-source', 'fixture-f-client-position'], requiresClientInput: true },
    { id: 'fixture-f-missing-secondary', field: 'secondaryAddress', reason: 'Address was not present.', importance: 'LOW', sectionAffected: 'sec-hechos', blocking: false, sourceSearched: ['fixture-f-source'], requiresClientInput: false },
  ],
  sourcePosition: { status: 'KNOWN', assertionIds: [], provenance: fixtureFProvenance('HECHOS', 'La parte actora afirma que existió despido.', 5) },
  clientPosition: { status: 'CONFIRMED', source: 'CLIENT_POSITION', propositionIds: ['fixture-f-fact-2'], provenance: fixtureFClientPositionProvenance() },
  extractionStats: {
    sourceUnitCount: 1,
    candidatesDetected: 0,
    candidatesAccepted: 0,
    candidatesMerged: 0,
    candidatesRejected: 0,
    candidatesForReview: 0,
    rejectionReasons: {},
    provenanceComplete: 0,
    provenancePartial: 0,
    provenanceMissing: 0,
  },
  candidates: [],
});

export function makeFixtureFCaseAnalysis(overrides: Partial<CaseAnalysis> = {}): CaseAnalysis {
  const base = {
    parties: {},
    authorities: [],
    caseNumbers: {},
    proceduralTimeline: [],
    challengedActs: [],
    claims: ['fixture legacy claim'],
    arguments: [],
    evidence: [],
    facts: [],
    rulings: [],
    citations: [],
    proceduralPosture: {
      proceduralWrit: '',
      isExtraordinary: false,
      constitutionalIssues: [],
      legalityIssues: [],
      exceptionalInterest: null,
    },
    caseTheory: { factualTheory: '', legalTheory: '', constitutionalTheory: '', proceduralTheory: '', opposingTheory: '', vulnerabilities: [], strengths: [] },
    argumentAxes: [],
    missingData: [],
    unsupportedClaims: [],
    richCaseAnalysis: fixtureFRichCaseAnalysis(),
  } as CaseAnalysis;
  return { ...base, ...overrides };
}

export function makeFixtureDocument(): UniversalLegalDocument {
  const sections: DocumentNode[] = [
    createDocumentNode({ id: 'sec-prestaciones', type: 'argument', title: 'PRESTACIONES', order: 1 }),
    createDocumentNode({ id: 'sec-hechos', type: 'facts', title: 'HECHOS', order: 2 }),
    createDocumentNode({ id: 'sec-pruebas', type: 'evidence', title: 'PRUEBAS', order: 3 }),
    createDocumentNode({ id: 'sec-argumentos', type: 'argument', title: 'ARGUMENTOS', order: 4 }),
    createDocumentNode({ id: 'sec-petitorios', type: 'petition', title: 'PUNTOS PETITORIOS', order: 5 }),
    createDocumentNode({ id: 'sec-firma', type: 'signature', title: 'FIRMA', order: 6 }),
  ];
  return createEmptyDocument({
    id: 'fixture-rich-document',
    documentType: 'contestacion_demanda_laboral',
    documentTypeLabel: 'Contestación de demanda laboral',
    matter: 'laboral',
    sections,
  });
}

export function fixtureFSourceDocuments(): UploadedSourceDocument[] {
  return [createSourceDocument({
    id: 'fixture-f-source',
    filename: 'fixture-f-contestacion.txt',
    type: 'txt',
    sourceValidated: true,
    pages: [{
      page: 1,
      text: [
        'DEMANDA LABORAL',
        'DEMANDADO: Parte demandada F',
        'PRESTACIONES:',
        '1. Pago de salarios reclamados.',
        '2. Pago de indemnización solicitada.',
        'HECHOS:',
        '1. La relación laboral inició en enero de 2024.',
        '2. La jornada se desarrollaba de lunes a viernes.',
        '3. La parte actora afirma que existió despido.',
        '4. Se menciona un adeudo cuya cantidad requiere confirmación.',
        'CANTIDAD MENCIONADA: $20,000.00.',
        'PRUEBAS:',
        'Contrato laboral y recibos, relacionados explícitamente con los hechos 1 y 2.',
        'ARGUMENTOS:',
        'La fuente vincula el hecho 2 con el petitorio.',
        'Artículo citado en la fuente sin verificación jurídica.',
      ].join('\n'),
      chars: 0,
    }],
  })];
}

export interface RichCoverageFixtureMetric {
  richCounts: Record<string, number>;
  coverageTotal: number;
  coverageRequired: number;
  coverageBlocked: number;
  coverageByType: Record<string, number>;
  coverageByScope: Record<string, number>;
  coverageByStatus: Record<string, number>;
  candidateDecisions: {
    detected: number;
    accepted: number;
    merged: number;
    rejected: number;
    review: number;
  };
  legacyProjectionLosses: string[];
  plannedSections: number;
  coverageBySection: Record<string, number>;
  sectionsWithoutCoverage: string[];
  orphanCoverageItems: string[];
  finalReadyEligible: boolean;
}

export function collectRichCoverageFixtureMetrics(): Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F', RichCoverageFixtureMetric> {
  const sourceFixtures = {
    A: [fixtureA_cleanText()],
    B: [fixtureB_continuousText()],
    C: [fixtureC_commaEvidence()],
    D: fixtureD_conflictingSources(),
    E: [fixtureE_incompleteCase()],
    F: fixtureFSourceDocuments(),
  } as const;

  return Object.fromEntries(Object.entries(sourceFixtures).map(([key, sources]) => {
    const analysis = key === 'F'
      ? makeFixtureFCaseAnalysis()
      : reconstructCaseAnalysis(sources as UploadedSourceDocument[], 'analizar expediente', '', { includeReferenceInAnalysis: false });
    const rich = analysis.richCaseAnalysis;
    const doc = makeFixtureDocument();
    const matrix = rich ? buildCoverageMatrix(analysis, doc, doc.sections) : { documentId: doc.id, documentType: doc.documentType, items: [], summary: { total: 0, required: 0, pending: 0, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 } };
    const binding = bindCoverageToSections(doc.sections, matrix);
    const coverageByType: Record<string, number> = {};
    const coverageByScope: Record<string, number> = {};
    const coverageByStatus: Record<string, number> = {};
    for (const item of matrix.items) {
      coverageByType[item.category] = (coverageByType[item.category] || 0) + 1;
      if (item.scope) coverageByScope[item.scope] = (coverageByScope[item.scope] || 0) + 1;
      coverageByStatus[item.status] = (coverageByStatus[item.status] || 0) + 1;
    }
    const coverageBySection: Record<string, number> = {};
    for (const section of binding.sections) coverageBySection[section.id] = section.coverageItemIds?.length || 0;
    const metric: RichCoverageFixtureMetric = {
      richCounts: rich ? {
        claims: rich.claims.length,
        facts: rich.facts.length,
        documents: rich.documents.length,
        evidenceMentions: rich.evidenceMentions.length,
        evidenceOffers: rich.evidenceOffers.length,
        arguments: rich.arguments.length,
        authorities: rich.authorities.length,
        conflicts: rich.conflicts.length,
        missingData: rich.missingData.length,
        dates: rich.dates.length,
        amounts: rich.amounts.length,
      } : {},
      coverageTotal: matrix.items.length,
      coverageRequired: matrix.items.filter((item) => item.required).length,
      coverageBlocked: matrix.items.filter((item) => item.status === 'blocked' || item.blocking).length,
      coverageByType,
      coverageByScope,
      coverageByStatus,
      candidateDecisions: {
        detected: rich?.extractionStats.candidatesDetected || 0,
        accepted: rich?.extractionStats.candidatesAccepted || 0,
        merged: rich?.extractionStats.candidatesMerged || 0,
        rejected: rich?.extractionStats.candidatesRejected || 0,
        review: rich?.extractionStats.candidatesForReview || 0,
      },
      legacyProjectionLosses: rich ? projectRichCaseAnalysis(rich, analysis).losses : [],
      plannedSections: binding.sections.length,
      coverageBySection,
      sectionsWithoutCoverage: binding.sections.filter((section) => !(section.coverageItemIds?.length)).map((section) => section.id),
      orphanCoverageItems: binding.orphanCoverageItemIds,
      finalReadyEligible: matrix.items.every((item) => !item.required || item.status === 'covered'),
    };
    return [key, metric];
  })) as Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F', RichCoverageFixtureMetric>;
}
