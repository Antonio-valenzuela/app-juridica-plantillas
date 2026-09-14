import { describe, expect, it } from 'vitest';
import {
  buildLegalResearchRequest,
  normalizeResearchQuery,
  shouldCreateResearchRequest,
} from '@/lib/legal-engine/legal-research/researchRequest';
import type { LegalIssueItem } from '@/lib/legal-engine/legalIssueMatrix';
import type { LegalRegimeResolution } from '@/lib/legal-engine/legal-research/types';

const fixedClock = () => new Date('2026-01-01T00:00:00.000Z');

const resolvedFederal: LegalRegimeResolution = {
  id: 'regime-federal-1',
  status: 'RESOLVED',
  country: { code: 'MX', displayName: 'México' },
  scope: 'FEDERAL',
  matter: { code: 'civil', displayName: 'Civil' },
  procedure: { code: 'ordinario', displayName: 'Ordinario' },
  temporalPrecision: 'UNKNOWN',
  fieldEvidence: [],
  unresolvedFields: [],
  resolutionHash: 'regime-hash-1',
};

function issueWith(researchStatus: LegalIssueItem['researchStatus'] = 'NEEDS_RESEARCH'): LegalIssueItem {
  return {
    id: 'issue-research-1',
    issueType: 'AUTHORITY_RESEARCH',
    question: '¿Qué requisito debe revisarse?',
    source: { mode: 'RICH_COVERAGE', coverageItemId: 'coverage-1', coverageCategory: 'AUTHORITY_MENTION', sourceEntityIds: ['authority-1'] },
    coverageItemIds: ['coverage-1'],
    claimIds: [],
    factIds: [],
    evidenceMentionIds: [],
    evidenceOfferIds: [],
    argumentIds: [],
    authorityMentionIds: ['authority-1'],
    conflictIds: [],
    missingDataIds: [],
    clientPositionStatus: 'NOT_REQUIRED',
    required: true,
    blocking: true,
    status: researchStatus === 'NOT_REQUIRED' ? 'READY_FOR_GENERATION' : 'NEEDS_RESEARCH',
    researchStatus,
    provenance: [],
    relationStatus: 'EXPLICIT',
  };
}

describe('legal research request', () => {
  it('creates a request only for NEEDS_RESEARCH', async () => {
    const request = await buildLegalResearchRequest({
      issue: issueWith(),
      regime: resolvedFederal,
      contextHash: 'ctx-1',
      requestedAuthorityTypes: ['STATUTE'],
    }, fixedClock);

    expect(request.legalIssueId).toBe('issue-research-1');
    expect(request.status).toBe('READY_FOR_RETRIEVAL');
    expect(request.sourceAuthorityMentionIds).toEqual(['authority-1']);
  });

  it('does not create a request when research is not required', () => {
    expect(shouldCreateResearchRequest(issueWith('NOT_REQUIRED'))).toBe(false);
  });

  it('keeps the question open and derives query terms only from explicit issue/regime data', async () => {
    const request = await buildLegalResearchRequest({
      issue: issueWith(),
      regime: resolvedFederal,
      contextHash: 'ctx-1',
      requestedAuthorityTypes: ['STATUTE'],
    }, fixedClock);
    const query = await normalizeResearchQuery(request, resolvedFederal);

    expect(query.normalizedQuery).toContain('¿qué requisito debe revisarse?');
    expect(query.normalizedQuery).not.toContain('el actor pierde');
  });

  it('does not use a universal CNPCF term', async () => {
    const request = await buildLegalResearchRequest({
      issue: issueWith(),
      regime: resolvedFederal,
      contextHash: 'ctx-1',
      requestedAuthorityTypes: ['STATUTE'],
    }, fixedClock);
    const query = await normalizeResearchQuery(request, resolvedFederal);

    expect(query.normalizedQuery).not.toMatch(/CNPCF/i);
  });

  it('keeps a source-cited verification request distinct from normal research', async () => {
    const request = await buildLegalResearchRequest({
      issue: issueWith('SOURCE_CITED_UNVERIFIED'),
      regime: resolvedFederal,
      contextHash: 'ctx-source-cited',
      requestedAuthorityTypes: ['THESIS'],
    }, fixedClock);

    expect(request.status).toBe('READY_FOR_RETRIEVAL');
    expect(request.requestedAuthorityTypes).toEqual(['THESIS']);
  });
});
