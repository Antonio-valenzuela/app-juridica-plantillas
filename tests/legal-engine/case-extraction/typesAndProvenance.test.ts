import { describe, expect, it } from 'vitest';
import {
  createSourceProvenance,
  hashExcerpt,
  sanitizeExcerpt,
} from '@/lib/legal-engine/case-extraction/provenance';
import type {
  ExtractionCandidate,
  RichCaseAnalysis,
  SourceProvenance,
} from '@/lib/legal-engine/case-extraction/types';

describe('case extraction types and provenance primitives', () => {
  it('creates stable, secret-free provenance for a source excerpt', () => {
    const raw = 'La parte actora promovió el juicio con API_KEY=super-secret';
    const provenance = createSourceProvenance({
      sourceId: 'source-1',
      sourceName: 'demanda.txt',
      page: 2,
      section: 'HECHOS',
      paragraphIndex: 4,
      elementIndex: 8,
      excerpt: raw,
      extractionMethod: 'PARAGRAPH',
      confidence: 0.8,
      inferenceLevel: 'LITERAL',
    });

    expect(provenance.sourceId).toBe('source-1');
    expect(provenance.page).toBe(2);
    expect(provenance.excerpt).not.toContain('super-secret');
    expect(provenance.excerptHash).toBe(hashExcerpt(raw));
    expect(provenance.extractionMethod).toBe('PARAGRAPH');
    expect(provenance.inferenceLevel).toBe('LITERAL');
  });

  it('sanitizes credential-like values without dropping provenance metadata', () => {
    expect(sanitizeExcerpt('token: abc123 password = hunter2')).toBe(
      'token: [REDACTED] password = [REDACTED]',
    );
  });

  it('exposes canonical rich analysis and candidate decision types', () => {
    const provenance: SourceProvenance = createSourceProvenance({
      sourceId: 'source-1',
      excerpt: 'HECHO PRIMERO. Se celebró el contrato.',
      extractionMethod: 'NUMBERED_LIST',
      confidence: 0.95,
      inferenceLevel: 'LITERAL',
    });
    const candidate: ExtractionCandidate = {
      candidateId: 'candidate-1',
      kind: 'FACT',
      rawText: 'Se celebró el contrato.',
      provenance: [provenance],
      decision: 'ACCEPTED',
    };
    const analysis: RichCaseAnalysis = {
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
        sourceUnitCount: 1,
        candidatesDetected: 1,
        candidatesAccepted: 1,
        candidatesMerged: 0,
        candidatesRejected: 0,
        candidatesForReview: 0,
        rejectionReasons: {},
        provenanceComplete: 1,
        provenancePartial: 0,
        provenanceMissing: 0,
      },
      candidates: [candidate],
    };

    expect(analysis.candidates[0].decision).toBe('ACCEPTED');
    expect(analysis.facts).toHaveLength(0);
  });
});
