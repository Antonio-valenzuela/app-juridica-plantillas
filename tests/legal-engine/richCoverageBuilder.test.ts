import { describe, expect, it } from 'vitest';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { makeFixtureFCaseAnalysis, makeFixtureDocument } from '@/tests/fixtures/richCoverageFixtures';
import type { ExtractionStats, MissingDataItem } from '@/lib/legal-engine/case-extraction/types';

describe('Coverage builder dispatch', () => {
  it('uses rich entities even when legacy arrays disagree', () => {
    const analysis = makeFixtureFCaseAnalysis({
      claims: ['LEGACY CLAIM THAT MUST NOT DRIVE RICH PLANNING'],
      facts: [],
      richCaseAnalysis: {
        claims: [],
        facts: [],
        parties: [],
        assertions: [],
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
        extractionStats: {} as unknown as ExtractionStats,
        candidates: [],
      },
    });
    const doc = makeFixtureDocument();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    expect(matrix.items).toEqual([]);
    expect(matrix.items.some((item) => item.description.includes('LEGACY CLAIM'))).toBe(false);
  });

  it('uses legacy behavior only when richCaseAnalysis is absent', () => {
    const analysis = makeFixtureFCaseAnalysis({ richCaseAnalysis: undefined });
    analysis.claims = ['LEGACY CLAIM'];
    const doc = makeFixtureDocument();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    expect(matrix.items.some((item) => item.description.includes('LEGACY CLAIM'))).toBe(true);
  });

  it('creates one substantive CoverageItem per rich claim and preserves explicit links', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.claims = [
      {
        id: 'fixture-f-claim-1',
        requestedRelief: 'Pago de salarios',
        factualBasisIds: ['fixture-f-fact-1'],
        evidenceMentionIds: ['fixture-f-evidence-mention-1'],
        provenance: [],
        status: 'SOURCE_MENTIONED',
      },
      {
        id: 'fixture-f-claim-2',
        requestedRelief: 'Pago de indemnización',
        factualBasisIds: [],
        evidenceMentionIds: [],
        provenance: [],
        status: 'SOURCE_ASSERTED',
      },
    ];
    const doc = makeFixtureDocument();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const claims = matrix.items.filter((item) => item.claimIds?.length === 1);
    expect(claims).toHaveLength(2);
    expect(claims.map((item) => item.claimIds?.[0])).toEqual(['fixture-f-claim-1', 'fixture-f-claim-2']);
    expect(claims.every((item) => item.scope === 'SUBSTANTIVE')).toBe(true);
    expect(claims.some((item) => item.description.includes('IMPROCEDENTE'))).toBe(false);
    expect(claims[0].factIds).toEqual(['fixture-f-fact-1']);
    expect(claims[0].evidenceMentionIds).toEqual(['fixture-f-evidence-mention-1']);
  });

  it('keeps SOURCE_ASSERTION and unknown client posture without inventing a response', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.facts = [{
      id: 'fixture-f-fact-1',
      proposition: 'La relación jurídica inició en enero de 2024',
      participants: [],
      assertionStatus: 'SOURCE_ASSERTION',
      provenance: [],
      relatedDocumentIds: [],
    }];
    const doc = makeFixtureDocument();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const fact = matrix.items.find((item) => item.factIds?.includes('fixture-f-fact-1'))!;
    expect(fact.scope).toBe('SUBSTANTIVE');
    expect(fact.metadata?.assertionStatus).toBe('SOURCE_ASSERTION');
    expect(fact.status).toBe('needs_client_position');
    expect(fact.metadata?.responseKind).toBeUndefined();
    const missing = matrix.items.find((item) => item.category === 'MISSING_CLIENT_POSITION' && item.factIds?.includes('fixture-f-fact-1'));
    expect(missing?.blocking).toBe(true);
  });

  it('links a confirmed client position only when proposition IDs explicitly match', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.facts = [{
      id: 'fixture-f-fact-2',
      proposition: 'La jornada se desarrollaba de lunes a viernes',
      participants: [],
      assertionStatus: 'SOURCE_ASSERTION',
      provenance: [],
      relatedDocumentIds: [],
    }];
    analysis.richCaseAnalysis!.clientPosition = {
      status: 'CONFIRMED',
      source: 'CLIENT_POSITION',
      propositionIds: ['fixture-f-fact-2'],
      provenance: [],
    };
    const doc = makeFixtureDocument();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const fact = matrix.items.find((item) => item.factIds?.includes('fixture-f-fact-2'))!;
    expect(fact.metadata?.clientPositionStatus).toBe('CONFIRMED');
  });

  it('creates treatment for EvidenceMention without creating an EvidenceOffer', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.documents = [{
      id: 'fixture-f-document-1',
      title: 'Contrato laboral',
      status: 'SOURCE_MENTIONED',
      provenance: [],
    }];
    analysis.richCaseAnalysis!.evidenceMentions = [{
      id: 'fixture-f-evidence-mention-1',
      documentItemId: 'fixture-f-document-1',
      type: 'CONTRATO',
      description: 'Contrato mencionado en la fuente',
      relatedFactIds: ['fixture-f-fact-1'],
      relatedClaimIds: ['fixture-f-claim-1'],
      status: 'SOURCE_MENTIONED',
      provenance: [],
    }];
    const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
    const mention = matrix.items.find((item) => item.evidenceMentionIds?.includes('fixture-f-evidence-mention-1'))!;
    expect(mention.category).toBe('EVIDENCE_TREATMENT');
    expect(mention.evidenceOfferIds || []).toEqual([]);
    expect(matrix.items.some((item) => item.evidenceOfferIds?.includes('fixture-f-evidence-mention-1'))).toBe(false);
  });

  it('creates offer Coverage only for an explicit EvidenceOffer', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.evidenceOffers = [{
      id: 'fixture-f-offer-1',
      evidenceMentionId: 'fixture-f-evidence-mention-1',
      status: 'PARTY_OFFERED',
      provenance: [],
    }];
    const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
    const offer = matrix.items.find((item) => item.evidenceOfferIds?.includes('fixture-f-offer-1'))!;
    expect(offer.category).toBe('EVIDENCE_OFFER');
    expect(offer.sourceEntityType).toBe('EVIDENCE_OFFER');
  });

  it('keeps blocking and informational missing data distinct', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.missingData = [
      {
        id: 'fixture-f-missing-posture',
        field: 'clientPosition',
        reason: 'No client posture was found',
        importance: 'HIGH',
        sectionAffected: 'POSTURA',
        blocking: true,
        sourceSearched: ['fixture-f-source'],
        requiresClientInput: true,
      } as MissingDataItem,
      {
        id: 'fixture-f-missing-secondary',
        field: 'secondaryAddress',
        reason: 'Address was not present',
        importance: 'LOW',
        sectionAffected: 'COMPARECENCIA',
        blocking: false,
        sourceSearched: ['fixture-f-source'],
        requiresClientInput: false,
      } as MissingDataItem,
    ];
    const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
    const blocking = matrix.items.find((item) => item.missingDataIds?.includes('fixture-f-missing-posture'))!;
    const informational = matrix.items.find((item) => item.missingDataIds?.includes('fixture-f-missing-secondary'))!;
    expect(blocking.blocking).toBe(true);
    expect(informational.blocking).toBe(false);
  });

  it('leaves every material conflict open and blocking', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.conflicts = [{
      conflictId: 'fixture-f-conflict-1',
      type: 'AMOUNT',
      itemIds: ['fixture-f-claim-1'],
      sourceIds: ['fixture-f-source-a', 'fixture-f-source-b'],
      description: 'Las fuentes expresan cantidades distintas',
      requiresReview: true,
    }];
    const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
    const conflict = matrix.items.find((item) => item.conflictIds?.includes('fixture-f-conflict-1'))!;
    expect(conflict.category).toBe('CONFLICT_REVIEW');
    expect(conflict.status).toBe('blocked');
    expect(conflict.statusReason).toMatch(/revisi[oó]n/i);
    expect(conflict.metadata?.selectedSourceId).toBeUndefined();
  });

  it('preserves source arguments and cited authorities without legal verification', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.arguments = [{
      id: 'fixture-f-argument-1',
      proposition: 'La fuente sostiene una respuesta vinculada al hecho 2',
      supportingFactIds: ['fixture-f-fact-2'],
      citedAuthorityIds: ['fixture-f-authority-1'],
      provenance: [],
    }];
    analysis.richCaseAnalysis!.authorities = [{
      id: 'fixture-f-authority-1',
      authorityType: 'ARTICLE',
      citationText: 'Artículo citado en la fuente',
      verificationStatus: 'SOURCE_CITED',
      provenance: [],
    }];
    const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
    const argument = matrix.items.find((item) => item.argumentIds?.includes('fixture-f-argument-1'))!;
    const authority = matrix.items.find((item) => item.authorityMentionIds?.includes('fixture-f-authority-1'))!;
    expect(argument.category).toBe('SOURCE_ARGUMENT_RESPONSE');
    expect(argument.factIds).toEqual(['fixture-f-fact-2']);
    expect(authority.metadata?.verificationStatus).toBe('SOURCE_CITED');
    expect(authority.metadata?.verificationStatus).not.toBe('LEGALLY_VERIFIED');
  });

  it('does not turn OCR line fragments into mandatory argument coverage', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.arguments = [
      {
        id: 'fixture-noise',
        proposition: 'a',
        supportingFactIds: [],
        citedAuthorityIds: [],
        provenance: [],
      },
      {
        id: 'fixture-material',
        proposition: 'La parte actora sostiene una interpretación que debe confrontarse con las constancias del expediente.',
        supportingFactIds: [],
        citedAuthorityIds: [],
        provenance: [],
      },
    ];

    const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
    const argumentsInCoverage = matrix.items.filter((item) => item.category === 'SOURCE_ARGUMENT_RESPONSE');
    expect(argumentsInCoverage.map((item) => item.argumentIds?.[0])).toEqual(['fixture-material']);
  });

  it('keeps judgment reasoning and citations reference-only unless explicitly challenged', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.arguments = [{
      id: 'fixture-court-argument',
      proposition: 'El juzgador considera infundada la pretensión por falta de prueba suficiente.',
      supportingFactIds: [],
      citedAuthorityIds: ['fixture-court-authority'],
      provenance: [{ ...analysis.richCaseAnalysis!.arguments[0].provenance[0], section: 'RAZONES Y FUNDAMENTOS DE LA DECISIÓN' }],
    }];
    analysis.richCaseAnalysis!.authorities = [{
      id: 'fixture-court-authority',
      authorityType: 'ARTICLE',
      citationText: 'Artículo 14 constitucional',
      verificationStatus: 'SOURCE_CITED',
      provenance: [{ ...analysis.richCaseAnalysis!.arguments[0].provenance[0], section: 'RAZONES Y FUNDAMENTOS DE LA DECISIÓN' }],
    }];

    const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
    expect(matrix.items.some((item) => item.argumentIds?.includes('fixture-court-argument'))).toBe(false);
    const authority = matrix.items.find((item) => item.authorityMentionIds?.includes('fixture-court-authority'))!;
    expect(authority.required).toBe(false);
    expect(authority.satisfactionPolicy).toBe('REFERENCE_ONLY');
  });

  it('creates petition support only when a petition requirement has explicit supporting links', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.arguments = [{
      id: 'fixture-f-argument-1',
      proposition: 'La fuente vincula el hecho 2 con el petitorio',
      supportingFactIds: ['fixture-f-fact-2'],
      citedAuthorityIds: [],
      petitionSectionIds: ['sec-petitorios'],
      provenance: [],
    }];
    const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
    const petition = matrix.items.find((item) => item.category === 'PETITION_SUPPORT');
    expect(petition?.factIds).toEqual(['fixture-f-fact-2']);
  });
});
