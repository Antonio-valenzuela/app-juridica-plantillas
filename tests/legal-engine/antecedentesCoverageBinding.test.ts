import { describe, expect, it } from 'vitest';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { bindCoverageToSections, buildRichCoverageMatrix } from '@/lib/legal-engine/richCoverage';
import { buildLegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import type { RichCaseAnalysis } from '@/lib/legal-engine/case-extraction/types';

function proceduralSource() {
  return {
    id: 'fixture-procedural-source',
    filename: 'fixture-procedural-source.pdf',
    type: 'application/pdf',
    sourceValidated: true,
    pages: [{
      page: 4,
      chars: 260,
      text: [
        'ANTECEDENTES',
        'El 3 de enero de 2024 se presentó la demanda.',
        'El 10 de febrero de 2024 se notificó la resolución.',
        'El 15 de marzo de 2024 se interpuso el recurso.',
        'AGRAVIOS:',
        'La parte actora sostiene que la sentencia es ilegal porque el tribunal determinó indebidamente la controversia.',
      ].join('\n'),
    }],
  };
}

function documentWithDistinctBackgroundSections() {
  return createEmptyDocument({
    id: 'fixture-antecedentes-document',
    documentType: 'recurso_revision_amparo_directo',
    documentTypeLabel: 'Recurso de revisión en amparo directo',
    sections: [
      createDocumentNode({ id: 'sec-sentencia-recurrida', type: 'background', title: 'SENTENCIA RECURRIDA', order: 1 }),
      createDocumentNode({ id: 'sec-antecedentes', type: 'background', title: 'ANTECEDENTES', order: 2 }),
      createDocumentNode({ id: 'sec-agravios', type: 'argument', title: 'AGRAVIOS', order: 3 }),
    ],
  });
}

function explicitRichNegativeFixture(): RichCaseAnalysis {
  const provenance = [{
    sourceId: 'fixture-rich-negative-source',
    sourceType: 'application/pdf',
    sourceName: 'fixture-rich-negative-source.pdf',
    page: 1,
    excerptHash: 'fixture-excerpt-hash',
    excerpt: 'Contenido fuente de prueba.',
    extractionMethod: 'PARAGRAPH' as const,
    confidence: 0.95,
    inferenceLevel: 'LITERAL' as const,
  }];
  return {
    parties: [],
    assertions: [],
    claims: [],
    facts: [{
      id: 'fact-negative-1',
      proposition: 'Hecho establecido de prueba.',
      participants: [],
      assertionStatus: 'ESTABLISHED_FACT',
      provenance,
      relatedDocumentIds: ['fixture-rich-negative-source'],
    }],
    evidenceMentions: [{
      id: 'evidence-negative-1',
      type: 'DOCUMENTAL',
      description: 'Mención de evidencia en la fuente.',
      relatedFactIds: ['fact-negative-1'],
      relatedClaimIds: [],
      status: 'SOURCE_MENTIONED',
      provenance,
    }],
    evidenceOffers: [{
      id: 'offer-negative-1',
      evidenceMentionId: 'evidence-negative-1',
      status: 'PARTY_OFFERED',
      provenance,
    }],
    arguments: [{
      id: 'argument-negative-1',
      proposition: 'Argumento sustantivo de la parte actora.',
      supportingFactIds: ['fact-negative-1'],
      citedAuthorityIds: ['authority-negative-1'],
      provenance,
    }],
    authorities: [{
      id: 'authority-negative-1',
      authorityType: 'JURISPRUDENCE',
      citationText: 'Criterio citado en la fuente.',
      verificationStatus: 'SOURCE_CITED',
      provenance,
    }],
    proceduralTimeline: [{
      id: 'procedural-negative-1',
      date: '3 de enero de 2024',
      event: 'Se presentó el escrito procesal.',
      eventType: 'FILING',
      provenance,
      certainty: 0.95,
    }],
    missingData: [],
    conflicts: [],
    clientPosition: { status: 'UNKNOWN', source: 'SOURCE_POSITION', propositionIds: [], provenance },
    candidates: [],
  } as unknown as RichCaseAnalysis;
}

describe('ANTECEDENTES rich Coverage binding', () => {
  it('carries a source-backed procedural event into rich analysis and ANTECEDENTES Coverage', () => {
    const analysis = reconstructCaseAnalysis([proceduralSource()], 'Preparar recurso de revisión.');
    const rich = analysis.richCaseAnalysis as (RichCaseAnalysis & {
      proceduralTimeline?: Array<{ id: string; date: string; event: string; provenance: Array<{ sourceId: string; page?: number }> }>;
    });

    expect(rich.proceduralTimeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        date: '3 de enero de 2024',
        event: expect.stringMatching(/se presentó la demanda/i),
        provenance: expect.arrayContaining([expect.objectContaining({ sourceId: 'fixture-procedural-source', page: 4 })]),
      }),
    ]));

    const doc = documentWithDistinctBackgroundSections();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const proceduralCoverage = matrix.items.filter((item) => item.category === 'PROCEDURAL_REQUIREMENT'
      && item.sourceEntityType === 'PROCEDURAL_REQUIREMENT');
    expect(proceduralCoverage.length).toBeGreaterThan(0);
    expect(proceduralCoverage.every((item) => item.targetSectionIds.length > 0)).toBe(true);
    expect(proceduralCoverage.every((item) => item.targetSectionIds.includes('sec-antecedentes'))).toBe(true);
    expect(proceduralCoverage.every((item) => item.provenance && item.provenance.length > 0)).toBe(true);

    const issueMatrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: matrix });
    expect(issueMatrix.issues.some((issue) => issue.coverageItemIds.some((id) =>
      proceduralCoverage.some((item) => item.id === id)))).toBe(false);

    const binding = bindCoverageToSections(doc.sections, matrix);
    expect(binding.sections.find((section) => section.id === 'sec-antecedentes')?.coverageItemIds)
      .toEqual(expect.arrayContaining(proceduralCoverage.map((item) => item.id)));
  });

  it('does not bind a substantive party argument to ANTECEDENTES', () => {
    const analysis = reconstructCaseAnalysis([proceduralSource()], 'Preparar recurso de revisión.');
    const doc = documentWithDistinctBackgroundSections();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const binding = bindCoverageToSections(doc.sections, matrix);
    const antecedents = binding.sections.find((section) => section.id === 'sec-antecedentes');
    const argumentIds = matrix.items
      .filter((item) => item.category === 'SOURCE_ARGUMENT_RESPONSE')
      .map((item) => item.id);

    expect(argumentIds.length).toBeGreaterThan(0);
    expect(antecedents?.coverageItemIds || []).not.toEqual(expect.arrayContaining(argumentIds));
  });

  it('keeps arguments, authority citations, and evidence out of ANTECEDENTES', () => {
    const doc = createEmptyDocument({
      id: 'fixture-rich-negative-document',
      documentType: 'recurso_revision_amparo_directo',
      sections: [
        createDocumentNode({ id: 'sec-antecedentes-negative', type: 'background', title: 'ANTECEDENTES', order: 1 }),
        createDocumentNode({ id: 'sec-agravios-negative', type: 'argument', title: 'AGRAVIOS', order: 2 }),
        createDocumentNode({ id: 'sec-pruebas-negative', type: 'evidence', title: 'PRUEBAS', order: 3 }),
      ],
    });
    const rich = explicitRichNegativeFixture();
    const matrix = buildRichCoverageMatrix(rich, doc, doc.sections);
    const binding = bindCoverageToSections(doc.sections, matrix);
    const antecedents = binding.sections.find((section) => section.id === 'sec-antecedentes-negative');
    const excludedIds = matrix.items
      .filter((item) => ['SOURCE_ARGUMENT_RESPONSE', 'AUTHORITY_MENTION', 'EVIDENCE_TREATMENT', 'EVIDENCE_OFFER'].includes(item.category))
      .map((item) => item.id);
    const procedural = matrix.items.filter((item) => item.category === 'PROCEDURAL_REQUIREMENT');

    expect(excludedIds.length).toBe(4);
    expect(antecedents?.coverageItemIds || []).not.toEqual(expect.arrayContaining(excludedIds));
    expect(procedural.every((item) => item.targetSectionIds.includes('sec-antecedentes-negative'))).toBe(true);
    expect(procedural.every((item) => !item.targetSectionIds.includes('sec-agravios-negative'))).toBe(true);
  });
});
