import { describe, expect, it } from 'vitest';
import { buildMissingData, deriveClientPosition } from '@/lib/legal-engine/case-extraction/missingData';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import type { RichCaseAnalysis } from '@/lib/legal-engine/case-extraction/types';

function analysisWithOnlyPlaintiffSource(): RichCaseAnalysis {
  const provenance = createSourceProvenance({ sourceId: 'src-plaintiff', excerpt: 'La actora demanda.', extractionMethod: 'PARAGRAPH', confidence: 1, inferenceLevel: 'LITERAL' });
  return {
    parties: [{ id: 'party-actor', name: 'Ana', role: 'ACTOR', aliases: [], provenance: [provenance], confidence: 0.9, confirmed: false }],
    assertions: [{ id: 'assertion-1', actorRole: 'PARTE_ACTORA', proposition: 'demanda', status: 'ALLEGED', provenance: [provenance] }],
    claims: [], facts: [], documents: [], evidenceMentions: [], evidenceOffers: [], arguments: [], authorities: [], dates: [], amounts: [], conflicts: [],
    missingData: [], proceduralTimeline: [], sourcePosition: { status: 'KNOWN', assertionIds: ['assertion-1'], provenance: [provenance] },
    clientPosition: { status: 'UNKNOWN', source: 'SOURCE_POSITION', propositionIds: [], provenance: [provenance] },
    extractionStats: { sourceUnitCount: 1, candidatesDetected: 1, candidatesAccepted: 1, candidatesMerged: 0, candidatesRejected: 0, candidatesForReview: 0, rejectionReasons: {}, provenanceComplete: 1, provenancePartial: 0, provenanceMissing: 0 },
    candidates: [],
  };
}

describe('missing data and source/client position', () => {
  it('reports missing defendant position structurally', () => {
    const result = buildMissingData(analysisWithOnlyPlaintiffSource());

    expect(result.items).toContainEqual(expect.objectContaining({ field: 'clientPosition', blocking: true, requiresClientInput: true }));
  });

  it('does not invent a client posture from the plaintiff pleading', () => {
    const position = deriveClientPosition(analysisWithOnlyPlaintiffSource());

    expect(position).toMatchObject({ status: 'UNKNOWN', source: 'SOURCE_POSITION' });
  });
});
