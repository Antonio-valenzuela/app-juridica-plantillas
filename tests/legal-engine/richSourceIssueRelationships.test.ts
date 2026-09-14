import { describe, expect, it } from 'vitest';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import { extractArguments, extractAuthorityMentions } from '@/lib/legal-engine/case-extraction/arguments';
import type { ArgumentExtractionContext, ExtractionCandidate, SourceAuthorityMention } from '@/lib/legal-engine/case-extraction/types';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { buildLegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import { makeFixtureDocument, makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';

function candidate(id: string, text: string, page: number, elementIndex: number, kind: ExtractionCandidate['kind'] = 'ARGUMENT', section = 'ARGUMENTOS'): ExtractionCandidate {
  return {
    candidateId: id,
    kind,
    rawText: text,
    provenance: [{ ...createSourceProvenance({
      sourceId: 'source-relationship-fixture',
      excerpt: text,
      page,
      elementIndex,
      section,
      extractionMethod: 'PARAGRAPH',
      confidence: 1,
      inferenceLevel: 'LITERAL',
    }), candidateId: id }],
    decision: 'ACCEPTED',
  };
}

function context(authorities: SourceAuthorityMention[]): ArgumentExtractionContext & { authorityMentions: SourceAuthorityMention[] } {
  return {
    factIds: [],
    authorityIds: authorities.map((authority) => authority.id),
    authorityMentions: authorities,
  };
}

describe('rich source to LegalIssue relationships', () => {
  it('retains an authority only when it is extracted from the same source candidate as the argument', () => {
    const sourceCandidate = candidate(
      'candidate-argument-with-authority',
      'Por tanto, la acción es improcedente con fundamento en el artículo 14 constitucional.',
      4,
      8,
    );
    const authorities = extractAuthorityMentions([sourceCandidate]);
    const result = extractArguments([sourceCandidate], context(authorities));

    expect(result.arguments[0]?.citedAuthorityIds).toEqual([authorities[0]?.id]);
  });

  it('rejects a nearby authority candidate from the same page', () => {
    const argumentCandidate = candidate(
      'candidate-argument-only',
      'Por tanto, la acción es improcedente por falta de acreditación.',
      4,
      8,
    );
    const nearbyAuthorityCandidate = candidate(
      'candidate-nearby-authority',
      'Artículo 14 constitucional.',
      4,
      9,
      'AUTHORITY',
      'AUTORIDAD',
    );
    const authorities = extractAuthorityMentions([nearbyAuthorityCandidate]);
    const result = extractArguments([argumentCandidate, nearbyAuthorityCandidate], context(authorities));

    expect(result.arguments).toHaveLength(1);
    expect(result.arguments[0]?.citedAuthorityIds).toEqual([]);
  });

  it('does not promote an authority candidate to a source argument from textual markers', () => {
    const authorityCandidate = candidate(
      'candidate-authority-only',
      'Artículo 14 constitucional; por tanto, la autoridad citada debe verificarse.',
      4,
      8,
      'AUTHORITY',
      'AUTORIDAD',
    );
    const authorities = extractAuthorityMentions([authorityCandidate]);
    const result = extractArguments([authorityCandidate], context(authorities));

    expect(result.arguments).toEqual([]);
  });

  it('keeps an argument-led mixed candidate even when classification also sees an authority', () => {
    const mixedCandidate = candidate(
      'candidate-mixed-authority-argument',
      'Por tanto, la autoridad debe resolver la cuestión conforme al artículo 14 constitucional.',
      4,
      8,
      'AUTHORITY',
      'OTRA',
    );
    const authorities = extractAuthorityMentions([mixedCandidate]);
    const result = extractArguments([mixedCandidate], context(authorities));

    expect(result.arguments[0]?.citedAuthorityIds).toEqual([authorities[0]?.id]);
  });

  it('does not materialize a rejected candidate as a source argument', () => {
    const rejected = candidate(
      'candidate-rejected',
      'Por tanto, la acción es improcedente.',
      4,
      8,
    );
    rejected.decision = 'REJECTED';

    expect(extractArguments([rejected], context([])).arguments).toEqual([]);
  });

  it('does not accept a stale authority outside the canonical authority id set', () => {
    const sourceCandidate = candidate(
      'candidate-stale-authority',
      'Por tanto, la acción es improcedente con fundamento en el artículo 14 constitucional.',
      4,
      8,
    );
    const [authority] = extractAuthorityMentions([sourceCandidate]);
    const staleAuthority = { ...authority, id: 'authority-stale' };

    const result = extractArguments([sourceCandidate], {
      factIds: [],
      authorityIds: [authority.id],
      authorityMentions: [staleAuthority],
    });

    expect(result.arguments[0]?.citedAuthorityIds).toEqual([]);
  });

  it('requires the same source id even when candidate ids collide', () => {
    const sourceCandidate = candidate(
      'candidate-collision',
      'Por tanto, la acción es improcedente con fundamento en el artículo 14 constitucional.',
      4,
      8,
    );
    const [authority] = extractAuthorityMentions([sourceCandidate]);
    const foreignAuthority = {
      ...authority,
      id: 'authority-foreign-source',
      provenance: authority.provenance.map((entry) => ({ ...entry, sourceId: 'foreign-source' })),
    };

    const result = extractArguments([sourceCandidate], {
      factIds: [],
      authorityIds: [foreignAuthority.id],
      authorityMentions: [foreignAuthority],
    });

    expect(result.arguments[0]?.citedAuthorityIds).toEqual([]);
  });

  it('keeps each explicit argument authority relation scoped to its own issue', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.arguments = [
      {
        id: 'argument-a',
        proposition: 'La fuente sostiene la cuestión A.',
        supportingFactIds: [],
        citedAuthorityIds: ['authority-a'],
        provenance: [],
      },
      {
        id: 'argument-b',
        proposition: 'La fuente sostiene la cuestión B.',
        supportingFactIds: [],
        citedAuthorityIds: ['authority-b'],
        provenance: [],
      },
    ];
    analysis.richCaseAnalysis!.authorities = [
      { id: 'authority-a', authorityType: 'ARTICLE', citationText: 'Artículo A', verificationStatus: 'SOURCE_CITED', provenance: [] },
      { id: 'authority-b', authorityType: 'ARTICLE', citationText: 'Artículo B', verificationStatus: 'SOURCE_CITED', provenance: [] },
    ];

    const document = makeFixtureDocument();
    const coverage = buildCoverageMatrix(analysis, document, document.sections);
    const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
    const issueA = matrix.issues.find((issue) => issue.argumentIds.includes('argument-a'))!;

    expect(issueA.authorityMentionIds).toEqual(['authority-a']);
    expect(issueA.authorityMentionIds).not.toContain('authority-b');
    expect(issueA.factIds).toEqual([]);
    expect(issueA.claimIds).toEqual([]);
  });

  it('preserves a source argument relationship without promoting an authority-only seed', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.arguments = [{
      id: 'argument-explicit',
      proposition: 'La fuente sostiene una cuestión jurídica concreta.',
      supportingFactIds: [],
      citedAuthorityIds: [],
      provenance: [],
    }];
    analysis.richCaseAnalysis!.authorities = [{
      id: 'authority-only',
      authorityType: 'ARTICLE',
      citationText: 'Artículo citado de forma independiente.',
      verificationStatus: 'SOURCE_CITED',
      provenance: [],
    }];

    const document = makeFixtureDocument();
    const coverage = buildCoverageMatrix(analysis, document, document.sections);
    const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
    const sourceIssue = matrix.issues.find((issue) => issue.argumentIds.includes('argument-explicit'))!;
    const authorityIssue = matrix.issues.find((issue) => issue.authorityMentionIds.includes('authority-only'))!;

    expect(sourceIssue.argumentIds).toEqual(['argument-explicit']);
    expect(sourceIssue.authorityMentionIds).toEqual([]);
    expect(authorityIssue.issueType).toBe('AUTHORITY_RESEARCH');
    expect(authorityIssue.argumentIds).toEqual([]);
    expect(authorityIssue.factIds).toEqual([]);
    expect(authorityIssue.claimIds).toEqual([]);
  });
});
