import { describe, expect, it } from 'vitest';
import { projectRichCaseAnalysis } from '@/lib/legal-engine/case-extraction/legacyProjection';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { RichCaseAnalysis } from '@/lib/legal-engine/case-extraction/types';

function base(): CaseAnalysis {
  return {
    parties: {}, authorities: [], caseNumbers: {}, proceduralTimeline: [], challengedActs: [], claims: [], arguments: [], evidence: [], facts: [], rulings: [], citations: [],
    proceduralPosture: { proceduralWrit: '', isExtraordinary: false, constitutionalIssues: [], legalityIssues: [], exceptionalInterest: null },
    caseTheory: { factualTheory: '', legalTheory: '', constitutionalTheory: '', proceduralTheory: '', opposingTheory: '', vulnerabilities: [], strengths: [] },
    argumentAxes: [], missingData: [], unsupportedClaims: [],
  };
}

function rich(overrides: Partial<RichCaseAnalysis>): RichCaseAnalysis {
  return {
    parties: [], assertions: [], claims: [], facts: [], documents: [], evidenceMentions: [], evidenceOffers: [], arguments: [], authorities: [], dates: [], amounts: [], conflicts: [], missingData: [],
    sourcePosition: { status: 'UNKNOWN', assertionIds: [], provenance: [] }, clientPosition: { status: 'UNKNOWN', source: 'SOURCE_POSITION', propositionIds: [], provenance: [] },
    extractionStats: { sourceUnitCount: 0, candidatesDetected: 0, candidatesAccepted: 0, candidatesMerged: 0, candidatesRejected: 0, candidatesForReview: 0, rejectionReasons: {}, provenanceComplete: 0, provenancePartial: 0, provenanceMissing: 0 }, candidates: [], proceduralTimeline: [], ...overrides,
  };
}

describe('projectRichCaseAnalysis', () => {
  it('does not strengthen a source evidence mention', () => {
    const provenance = createSourceProvenance({ sourceId: 'src-a', excerpt: 'contrato', extractionMethod: 'PARAGRAPH', confidence: 1, inferenceLevel: 'LITERAL' });
    const projection = projectRichCaseAnalysis(rich({ documents: [{ id: 'doc-1', title: 'contrato', status: 'SOURCE_MENTIONED', provenance: [provenance] }], evidenceMentions: [{ id: 'ev-1', documentItemId: 'doc-1', description: 'contrato', relatedFactIds: [], relatedClaimIds: [], status: 'SOURCE_MENTIONED', provenance: [provenance] }] }), base());

    expect(projection.caseAnalysis.evidence?.[0].confirmed).not.toBe(true);
    expect(projection.losses).toContain('EvidenceMention status cannot be represented as CLIENT_CONFIRMED in legacy evidence');
  });

  it('does not convert a source assertion into a client-established fact', () => {
    const provenance = createSourceProvenance({ sourceId: 'src-a', excerpt: 'La actora afirma que ocurrió.', page: 2, extractionMethod: 'PARAGRAPH', confidence: 1, inferenceLevel: 'LITERAL' });
    const projection = projectRichCaseAnalysis(rich({ facts: [{ id: 'fact-1', proposition: 'ocurrió', participants: [], assertionStatus: 'SOURCE_ASSERTION', provenance: [provenance], relatedDocumentIds: ['src-a'] }] }), base());

    expect(projection.caseAnalysis.facts?.[0].position).toBe('REQUIRE_LAWYER_INPUT');
    expect(projection.caseAnalysis.facts?.[0].contestedStatus).toBe('UNKNOWN');
  });
});
