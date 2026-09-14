import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import { createDocumentNode, createEmptyDocument, type DocumentNode, type UniversalLegalDocument } from '@/lib/legal-engine/types';
import type { RichCaseAnalysis } from '@/lib/legal-engine/case-extraction/types';
import type { LegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import type { CoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import type { SectionPlan, IssuePlan } from '@/lib/legal-engine/pipeline';

function fixtureProvenance(section: string, excerpt: string, elementIndex: number) {
  return [createSourceProvenance({
    sourceId: 'fixture-rrad-source',
    sourceType: 'SENTENCIA_AMPARO_DIRECTO',
    sourceName: 'fixture-sentencia-amparo-directo.txt',
    page: 1,
    section,
    elementIndex,
    excerpt,
    extractionMethod: 'PARAGRAPH',
    confidence: 1,
    inferenceLevel: 'LITERAL',
  })];
}

export function buildFixtureRichCaseAnalysis(): RichCaseAnalysis {
  return {
    parties: [{
      id: 'fixture-rrad-party-autoridad',
      name: 'H. TRIBUNAL COLEGIADO DEL DÉCIMO CIRCUITO',
      role: 'AUTORIDAD',
      aliases: [],
      provenance: fixtureProvenance('PARTES', 'H. TRIBUNAL COLEGIADO DEL DÉCIMO CIRCUITO', 0),
      confidence: 1,
      confirmed: true
    }],
    assertions: [],
    claims: [
      {
        id: 'fixture-rrad-claim-1',
        requestedRelief: 'Inconstitucionalidad de norma',
        factualBasisIds: ['fixture-rrad-fact-1'],
        evidenceMentionIds: [],
        provenance: fixtureProvenance('CONCEPTOS_VIOLACION', 'Se reclama la inconstitucionalidad.', 1),
        status: 'SOURCE_ASSERTED'
      }
    ],
    facts: [
      {
        id: 'fixture-rrad-fact-1',
        proposition: 'Fixture fact 1',
        participants: [],
        assertionStatus: 'SOURCE_ASSERTION',
        provenance: fixtureProvenance('ANTECEDENTES', 'Fixture fact 1', 2),
        relatedDocumentIds: []
      },
      {
        id: 'fixture-rrad-fact-2',
        proposition: 'Fixture fact 2',
        participants: [],
        assertionStatus: 'SOURCE_ASSERTION',
        provenance: fixtureProvenance('ANTECEDENTES', 'Fixture fact 2', 3),
        relatedDocumentIds: []
      }
    ],
    documents: [
      {
        id: 'fixture-rrad-document-1',
        title: 'Fixture Document',
        status: 'SOURCE_MENTIONED',
        provenance: fixtureProvenance('PRUEBAS', 'Fixture Document', 4)
      }
    ],
    evidenceMentions: [
      {
        id: 'fixture-rrad-evidence-mention-1',
        documentItemId: 'fixture-rrad-document-1',
        type: 'DOCUMENTAL',
        description: 'Documento en la fuente',
        relatedFactIds: ['fixture-rrad-fact-1'],
        relatedClaimIds: [],
        status: 'SOURCE_MENTIONED',
        provenance: fixtureProvenance('PRUEBAS', 'Documento en la fuente', 4)
      }
    ],
    evidenceOffers: [
      {
        id: 'fixture-rrad-offer-1',
        evidenceMentionId: 'fixture-rrad-evidence-mention-1',
        status: 'PARTY_OFFERED',
        provenance: fixtureProvenance('PRUEBAS', 'Se ofrece la documental', 5)
      }
    ],
    arguments: [
      {
        id: 'fixture-rrad-argument-1',
        proposition: 'Fixture argument 1',
        supportingFactIds: ['fixture-rrad-fact-1'],
        citedAuthorityIds: ['fixture-rrad-authority-1'],
        petitionSectionIds: [],
        provenance: fixtureProvenance('AGRAVIOS', 'Fixture argument 1', 6)
      }
    ],
    authorities: [
      {
        id: 'fixture-rrad-authority-1',
        authorityType: 'ARTICLE',
        citationText: 'Fixture authority 1',
        verificationStatus: 'SOURCE_CITED',
        provenance: fixtureProvenance('AGRAVIOS', 'Fixture authority 1', 7)
      }
    ],
    dates: [],
    amounts: [],
    proceduralTimeline: [],
    conflicts: [],
    missingData: [],
    sourcePosition: {
      status: 'KNOWN',
      assertionIds: [],
      provenance: fixtureProvenance('SENTENCIA', 'Se niega el amparo', 8)
    },
    clientPosition: {
      status: 'UNKNOWN',
      source: 'SOURCE_POSITION',
      propositionIds: [],
      provenance: []
    },
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
      provenanceMissing: 0
    },
    candidates: []
  };
}

export function buildFixtureLegalIssueMatrix(): LegalIssueMatrix {
  return {
    documentId: 'fixture-rrad-document',
    documentType: 'recurso_revision_amparo_directo',
    sourceMode: 'RICH',
    summary: {
      total: 3,
      required: 3,
      blocked: 0,
      readyForGeneration: 3,
      needsLegalResearch: 0,
      needsClientPosition: 0,
      unresolvedConflict: 0,
      unlinked: 0,
    },
    issues: [
      {
        id: 'fixture-rrad-issue-1',
        issueType: 'SOURCE_ARGUMENT',
        question: 'Fixture constitutional issue 1',
        relationStatus: 'EXPLICIT',
        status: 'READY_FOR_GENERATION',
        clientPositionStatus: 'NOT_REQUIRED',
        researchStatus: 'NOT_REQUIRED',
        required: true,
        blocking: false,
        provenance: [],
        source: {
          mode: 'RICH_COVERAGE',
          coverageItemId: 'cov-bloque-1',
          coverageCategory: 'CONSTITUTIONAL_ISSUE',
          sourceEntityIds: ['fixture-rrad-claim-1'],
        },
        coverageItemIds: ['cov-bloque-1'],
        factIds: ['fixture-rrad-fact-1'],
        claimIds: ['fixture-rrad-claim-1'],
        argumentIds: ['fixture-rrad-argument-1'],
        evidenceMentionIds: [],
        evidenceOfferIds: [],
        authorityMentionIds: ['fixture-rrad-authority-1'],
        conflictIds: [],
        missingDataIds: [],
      },
      {
        id: 'fixture-rrad-issue-2',
        issueType: 'SOURCE_ARGUMENT',
        question: 'Fixture exceptional interest issue',
        relationStatus: 'EXPLICIT',
        status: 'READY_FOR_GENERATION',
        clientPositionStatus: 'NOT_REQUIRED',
        researchStatus: 'NOT_REQUIRED',
        required: true,
        blocking: false,
        provenance: [],
        source: {
          mode: 'RICH_COVERAGE',
          coverageItemId: 'cov-interes-1',
          coverageCategory: 'LEGAL_ISSUE',
          sourceEntityIds: ['fixture-rrad-fact-2'],
        },
        coverageItemIds: ['cov-interes-1'],
        factIds: ['fixture-rrad-fact-2'],
        claimIds: [],
        argumentIds: [],
        evidenceMentionIds: [],
        evidenceOfferIds: [],
        authorityMentionIds: [],
        conflictIds: [],
        missingDataIds: [],
      },
      {
        id: 'fixture-rrad-issue-3',
        issueType: 'SOURCE_ARGUMENT',
        question: 'Fixture agravio 1',
        relationStatus: 'EXPLICIT',
        status: 'READY_FOR_GENERATION',
        clientPositionStatus: 'NOT_REQUIRED',
        researchStatus: 'NOT_REQUIRED',
        required: true,
        blocking: false,
        provenance: [],
        source: {
          mode: 'RICH_COVERAGE',
          coverageItemId: 'cov-agravio-1',
          coverageCategory: 'LEGAL_ISSUE',
          sourceEntityIds: ['fixture-rrad-argument-1'],
        },
        coverageItemIds: ['cov-agravio-1'],
        factIds: [],
        claimIds: [],
        argumentIds: ['fixture-rrad-argument-1'],
        evidenceMentionIds: [],
        evidenceOfferIds: [],
        authorityMentionIds: [],
        conflictIds: [],
        missingDataIds: [],
      },
    ],
  };
}

export function buildFixtureCoverageMatrix(): CoverageMatrix {
  return {
    documentId: 'fixture-rrad-document',
    documentType: 'recurso_revision_amparo_directo',
    summary: { total: 4, required: 4, pending: 4, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
    items: [
      {
        id: 'cov-bloque-1',
        category: 'CONSTITUTIONAL_ISSUE',
        scope: 'SUBSTANTIVE',
        description: 'Bloque de constitucionalidad',
        status: 'pending',
        required: true,
        sourceId: 'fixture-rrad-claim-1',
        claimIds: ['fixture-rrad-claim-1'],
        targetSectionIds: ['sec-bloque-constitucionalidad'],
      },
      {
        id: 'cov-agravio-1',
        category: 'LEGAL_ISSUE',
        scope: 'SUBSTANTIVE',
        description: 'Agravio principal',
        status: 'pending',
        required: true,
        sourceId: 'fixture-rrad-argument-1',
        argumentIds: ['fixture-rrad-argument-1'],
        targetSectionIds: ['sec-agravios'],
      },
      {
        id: 'cov-interes-1',
        category: 'LEGAL_ISSUE',
        scope: 'SUBSTANTIVE',
        description: 'Interés excepcional',
        status: 'pending',
        required: true,
        sourceId: 'fixture-rrad-issue-2',
        targetSectionIds: ['sec-interes-excepcional'],
      },
      {
        id: 'cov-prueba-1',
        category: 'EVIDENCE',
        scope: 'SUBSTANTIVE',
        description: 'Prueba documental',
        status: 'pending',
        required: true,
        sourceId: 'fixture-rrad-evidence-mention-1',
        evidenceMentionIds: ['fixture-rrad-evidence-mention-1'],
        targetSectionIds: ['sec-pruebas'],
      },
    ],
  };
}

export function buildFixtureDocument(): UniversalLegalDocument {
  const sections: DocumentNode[] = [
    createDocumentNode({ id: 'sec-proemio', type: 'identity', title: 'PROEMIO Y PERSONALIDAD', order: 1 }),
    createDocumentNode({ id: 'sec-suprema-corte', type: 'header', title: 'SUPREMA CORTE DESTINATARIA', order: 2 }),
    createDocumentNode({ id: 'sec-sentencia-recurrida', type: 'background', title: 'SENTENCIA RECURRIDA', order: 3 }),
    createDocumentNode({ id: 'sec-antecedentes', type: 'facts', title: 'ANTECEDENTES', order: 4 }),
    createDocumentNode({ id: 'sec-interes-excepcional', type: 'argument', title: 'INTERÉS EXCEPCIONAL', order: 5 }),
    createDocumentNode({ id: 'sec-bloque-constitucionalidad', type: 'argument', title: 'BLOQUE DE CONSTITUCIONALIDAD', order: 6 }),
    createDocumentNode({ id: 'sec-agravios', type: 'argument', title: 'AGRAVIOS', order: 7 }),
    createDocumentNode({ id: 'sec-pruebas', type: 'evidence', title: 'PRUEBAS', order: 8 }),
    createDocumentNode({ id: 'sec-petitorios', type: 'petition', title: 'PUNTOS PETITORIOS', order: 9 }),
    createDocumentNode({ id: 'sec-firma', type: 'signature', title: 'FIRMA DEL RECURRENTE / ABOGADO', order: 10 }),
  ];

  const doc = createEmptyDocument({
    id: 'fixture-rrad-document',
    documentType: 'recurso_revision_amparo_directo',
    documentTypeLabel: 'Recurso de revisión en amparo directo',
    matter: 'amparo',
    sections,
  });

  doc.parties = {
    autoridadResponsable: 'H. TRIBUNAL COLEGIADO DEL DÉCIMO CIRCUITO'
  };
  doc.legalIssueMatrix = buildFixtureLegalIssueMatrix();
  doc.coverageMatrix = buildFixtureCoverageMatrix();

  return doc;
}

export function buildFixtureDraftingPlanSections(): SectionPlan[] {
  return [
    {
      templateSectionId: 'sec-bloque-constitucionalidad',
      title: 'BLOQUE DE CONSTITUCIONALIDAD',
      objective: 'Establecer bloque constitucional',
      sourceFacts: [],
      legalIssues: ['fixture-rrad-issue-1'],
      historicalReferences: [],
      expectedDepth: 'MEDIUM',
      expectedParagraphs: 2,
      issuePlans: [
        {
          id: 'plan-bloque-1',
          issueId: 'fixture-rrad-issue-1',
          title: 'Plan de bloque',
          expectedDepth: 'MEDIUM'
        }
      ]
    },
    {
      templateSectionId: 'sec-agravios',
      title: 'AGRAVIOS',
      objective: 'Formular agravios',
      sourceFacts: [],
      legalIssues: ['fixture-rrad-issue-3'],
      historicalReferences: [],
      expectedDepth: 'DEEP',
      expectedParagraphs: 4,
      issuePlans: [
        {
          id: 'plan-agravio-1',
          issueId: 'fixture-rrad-issue-3',
          title: 'Plan de agravio',
          expectedDepth: 'DEEP'
        }
      ]
    }
  ];
}

export function buildStaleIssuePlan(): IssuePlan {
  return {
    id: 'plan-stale-1',
    issueId: 'stale-issue-999',
    title: 'Stale Issue Plan',
    expectedDepth: 'SHORT'
  };
}
