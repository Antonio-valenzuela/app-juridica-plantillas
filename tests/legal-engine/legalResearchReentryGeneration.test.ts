import { describe, expect, it, vi } from 'vitest';
import type { AIRequest } from '@/lib/ai/providers/types';
import type { ContentBlock } from '@/lib/legal-engine/types';
import type { DocumentCoverageItem } from '@/lib/legal-engine/coverageMatrix';
import type { LegalIssueItem } from '@/lib/legal-engine/legalIssueMatrix';
import type { DerivedIssueReadiness, LegalResearchBundle } from '@/lib/legal-engine/legal-research/types';
import { draftBlockFromIssueResult, validateIssueDraftResult } from '@/lib/legal-engine/issueDraftResult';
import { evaluateIssueDraftResult } from '@/lib/legal-engine/semanticEvaluator';
import { isCoverageSatisfied } from '@/lib/legal-engine/coveragePolicy';
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';
import { buildIssuePrompt, buildVerifiedResearchContext, executeIssueScopedGeneration, executeReadyIssueTasks, resolveEffectiveIssueGenerationEligibility } from '@/lib/legal-engine/issueScopedGeneration';
import {
  draftResultFixture,
  generationTaskFixture,
  issueFixture,
  passEvaluation,
  validationInputFixture,
  bundleFixture,
  buildPackWithResearch,
  contextFixture,
  documentFixture,
  providerResponseForRequest,
  richAnalysisFixture,
  readinessFixture,
  verifiedAuthorityFixture,
} from './legalResearchReentryFixtures';

describe('FASE 5B additive research metadata', () => {
  it('preserves verified research metadata from result into DraftBlock', () => {
    const result = draftResultFixture({
      verifiedAuthorityIds: ['verified-authority-1'],
      researchHash: 'research-hash-1',
    });
    const task = generationTaskFixture('issue-research-1');
    const block = draftBlockFromIssueResult(
      result,
      task,
      passEvaluation(`blk-${task.id}`),
    );

    expect(block.verifiedAuthorityIds).toEqual(['verified-authority-1']);
    expect(block.researchHash).toBe('research-hash-1');
    expect(block.authorityIds).toEqual(['source-authority-1']);
  });
});

describe('FASE 5B effective issue generation eligibility', () => {
  it('keeps canonical READY eligible without a research bundle', () => {
    const result = resolveEffectiveIssueGenerationEligibility({
      issue: issueFixture({ status: 'READY_FOR_GENERATION', researchStatus: 'NOT_REQUIRED' }),
      formal: false,
      taskType: 'ISSUE',
    });

    expect(result).toMatchObject({
      eligible: true,
      effectiveStatus: 'READY_FOR_GENERATION',
      reason: 'READY_CANONICAL',
    });
  });

  it('unlocks NEEDS_RESEARCH only with matching sufficient bundle and readiness', () => {
    const issue = issueFixture({ status: 'NEEDS_RESEARCH', researchStatus: 'NEEDS_RESEARCH' });
    const bundle = bundleFixture(issue.id);
    const readiness = readinessFixture(issue.id, bundle.researchHash);
    const result = resolveEffectiveIssueGenerationEligibility({
      issue,
      derivedReadiness: readiness,
      researchBundle: bundle,
      formal: false,
      taskType: 'ISSUE',
    });

    expect(result.eligible).toBe(true);
    expect(result.effectiveStatus).toBe('READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH');
    expect(result.reason).toBe('READY_WITH_VERIFIED_RESEARCH');
    expect(issue.status).toBe('NEEDS_RESEARCH');
  });

  it('blocks when the sufficient bundle hash differs from readiness', () => {
    const issue = issueFixture({ status: 'NEEDS_RESEARCH', researchStatus: 'NEEDS_RESEARCH' });
    const bundle = bundleFixture(issue.id, { researchHash: 'research-hash-current' });
    const result = resolveEffectiveIssueGenerationEligibility({
      issue,
      derivedReadiness: readinessFixture(issue.id, 'research-hash-stale'),
      researchBundle: bundle,
      formal: false,
      taskType: 'ISSUE',
    });

    expect(result).toMatchObject({ eligible: false, reason: 'RESEARCH_HASH_MISMATCH' });
  });

  it('returns explicit reasons for relation, formal, and research-plan-only blockers', () => {
    const issue = issueFixture({ status: 'READY_FOR_GENERATION', relationStatus: 'INFERRED' as LegalIssueItem['relationStatus'] });
    expect(resolveEffectiveIssueGenerationEligibility({ issue, formal: false, taskType: 'ISSUE' }).reason)
      .toBe('RELATION_NOT_EXPLICIT');
    expect(resolveEffectiveIssueGenerationEligibility({ issue: issueFixture({ status: 'READY_FOR_GENERATION', researchStatus: 'NOT_REQUIRED' }), formal: true, taskType: 'ISSUE' }).reason)
      .toBe('FORMAL_DETERMINISTIC_TASK');
    expect(resolveEffectiveIssueGenerationEligibility({ issue: issueFixture({ status: 'NEEDS_RESEARCH' }), formal: false, taskType: 'LEGAL_RESEARCH' }).reason)
      .toBe('LEGAL_RESEARCH_PLAN_ONLY');
  });

  it.each([
    ['BLOCKED_BY_CONFLICT', { status: 'BLOCKED_BY_CONFLICT', conflictIds: ['conflict-1'] }],
    ['BLOCKED_BY_CLIENT_POSITION', { status: 'NEEDS_CLIENT_POSITION', clientPositionStatus: 'UNKNOWN' }],
    ['UNLINKED_COVERAGE_REQUIRES_REVIEW', { status: 'UNLINKED', relationStatus: 'UNLINKED' }],
    ['UNKNOWN_ISSUE_STATUS_REQUIRES_REVIEW', { status: 'UNKNOWN' }],
  ])('keeps canonical blocker %s ahead of research', (reason, overrides) => {
    const issue = issueFixture(overrides as Partial<LegalIssueItem>);
    const bundle = bundleFixture(issue.id);
    const result = resolveEffectiveIssueGenerationEligibility({
      issue,
      derivedReadiness: readinessFixture(issue.id, bundle.researchHash),
      researchBundle: bundle,
      formal: false,
      taskType: 'ISSUE',
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe(reason);
  });
});

describe('FASE 5B consumable verified research context', () => {
  it('projects only consumable same-issue authorities', () => {
    const incompatibleJurisdiction = verifiedAuthorityFixture('wrong-jurisdiction', 'issue-research-1', {
      jurisdictionStatus: 'WRONG_JURISDICTION',
    });
    const otherIssue = verifiedAuthorityFixture('other-issue-authority', 'issue-other');
    const bundle = bundleFixture('issue-research-1', {
      verifiedAuthorities: [
        verifiedAuthorityFixture(),
        incompatibleJurisdiction,
        otherIssue,
      ],
    });

    const context = buildVerifiedResearchContext(bundle, 'issue-research-1');

    expect(context.authorities.map((authority) => authority.id)).toEqual(['verified-authority-1']);
    expect(context.requestId).toBe('request-issue-research-1');
    expect(context.researchHash).toBe('research-hash-1');
    expect(context).not.toHaveProperty('rejectedCandidates');
    expect(context).not.toHaveProperty('corpus');
  });

  it.each([
    'CURRENT_BUT_TEMPORAL_REVIEW_REQUIRED',
    'REPEALED',
    'SUPERSEDED',
    'UNKNOWN_EFFECTIVE_DATE',
  ] as const)('rejects temporal status %s from the consumable context', (temporalStatus) => {
    const authority = verifiedAuthorityFixture(`authority-${temporalStatus}`, 'issue-research-1', { temporalStatus });
    const context = buildVerifiedResearchContext(
      bundleFixture('issue-research-1', { verifiedAuthorities: [authority] }),
      'issue-research-1',
    );

    expect(context.authorities).toEqual([]);
  });

  it('rejects an unresolved regime and another issue bundle without mutating input', () => {
    const bundle = bundleFixture('issue-research-1', {
      regimeResolution: { ...bundleFixture('issue-research-1').regimeResolution, status: 'LEGAL_REGIME_UNRESOLVED' },
    });
    const before = JSON.stringify(bundle);

    expect(buildVerifiedResearchContext(bundle, 'issue-research-2').authorities).toEqual([]);
    expect(buildVerifiedResearchContext(bundle, 'issue-research-1').authorities).toEqual([]);
    expect(JSON.stringify(bundle)).toBe(before);
  });

  it('omits rejected secondary candidates from the consumable context', () => {
    const bundle = bundleFixture('issue-research-1', {
      rejectedCandidates: [{
        candidate: {
          id: 'secondary-candidate-1',
          requestId: 'request-issue-research-1',
          authorityType: 'STATUTE',
          observedCitation: 'SECONDARY FIXTURE COMMENTARY',
          sourceTier: 'SECONDARY_SUPPORT',
          retrievedAt: '2026-01-01T00:00:00.000Z',
          metadataStatus: 'COMPLETE',
          candidateStatus: 'REJECTED',
        },
        reasons: ['NON_OFFICIAL_ONLY'],
        detail: ['Fixture secondary candidate is not consumable.'],
        rejectedAt: '2026-01-01T00:00:00.000Z',
      }],
    });

    const context = buildVerifiedResearchContext(bundle, 'issue-research-1');
    const prompt = buildIssuePrompt(
      buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), { verifiedResearch: context }),
      generationTaskFixture('issue-research-1'),
    );

    expect(context.authorities.map((authority) => authority.id)).toEqual(['verified-authority-1']);
    expect(JSON.stringify(context)).not.toContain('SECONDARY FIXTURE COMMENTARY');
    expect(JSON.stringify(context)).not.toContain('rejectedCandidates');
    expect(prompt.userMessage).not.toContain('SECONDARY FIXTURE COMMENTARY');
    expect(prompt.userMessage).not.toContain('rejectedCandidates');
  });
});

describe('FASE 5B additive research maps and IssueContextPack', () => {
  it('keeps source authorities separate and excludes complete bundle internals', () => {
    const issue = issueFixture({ id: 'issue-research-1' });
    const pack = buildPackWithResearch(issue, {
      verifiedResearch: contextFixture('issue-research-1'),
    });
    const serialized = JSON.stringify(pack);

    expect(pack.verifiedResearch?.legalIssueId).toBe('issue-research-1');
    expect(pack.verifiedResearch?.requestId).toBe('request-issue-research-1');
    expect(pack.verifiedResearch?.researchHash).toBe('research-hash-1');
    expect(pack.verifiedResearch?.authorities.map((authority) => authority.id)).toEqual(['verified-authority-1']);
    expect(pack.authorities.map((authority) => authority.id)).toEqual(['source-authority-1']);
    expect(serialized).not.toContain('rejectedCandidates');
    expect(serialized).not.toContain('corpus');
  });

  it('does not select a research context belonging to another issue', () => {
    const context = contextFixture('issue-research-1');
    const build = () => buildPackWithResearch(issueFixture({ id: 'issue-research-2' }), { verifiedResearch: context });

    expect(build).toThrow('RESEARCH_CONTEXT_OUT_OF_SCOPE');
  });
});

describe('FASE 5B deterministic contextHash V2', () => {
  it('changes contextHash when only researchHash changes', () => {
    const first = buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), {
      verifiedResearch: contextFixture('issue-research-1', { researchHash: 'research-hash-1' }),
    });
    const second = buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), {
      verifiedResearch: contextFixture('issue-research-1', { researchHash: 'research-hash-2' }),
    });

    expect(first.contextHash).not.toBe(second.contextHash);
  });

  it('keeps contextHash stable when equivalent authorities are reordered', () => {
    const first = buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), {
      verifiedResearch: contextFixture('issue-research-1', { authorityOrder: ['verified-authority-1', 'verified-authority-2'] }),
    });
    const second = buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), {
      verifiedResearch: contextFixture('issue-research-1', { authorityOrder: ['verified-authority-2', 'verified-authority-1'] }),
    });

    expect(first.contextHash).toBe(second.contextHash);
  });

  it('does not change contextHash for operational timestamp changes', () => {
    const firstContext = contextFixture('issue-research-1');
    const secondContext = contextFixture('issue-research-1');
    (secondContext.authorities[0].temporalValidity as { checkedAt: string }).checkedAt = '2030-01-01T00:00:00.000Z';
    const first = buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), { verifiedResearch: firstContext });
    const second = buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), { verifiedResearch: secondContext });

    expect(first.contextHash).toBe(second.contextHash);
  });
});

describe('FASE 5B verified-authority prompt', () => {
  it('serializes verified authorities and their limits without research corpus', () => {
    const prompt = buildIssuePrompt(
      buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), {
        verifiedResearch: contextFixture('issue-research-1'),
      }),
      generationTaskFixture('issue-research-1'),
    );

    expect(prompt.systemPrompt).toContain('VERIFIED AUTHORITIES AVAILABLE');
    expect(prompt.systemPrompt).toContain('facts/evidence allowlisted');
    expect(prompt.userMessage).toContain('El requisito debe acreditarse.');
    expect(prompt.userMessage).toContain('CURRENT_AND_APPLICABLE');
    expect(prompt.userMessage).toContain('APPLICABLE');
    expect(prompt.userMessage).toContain('No acredita por sí misma un hecho del expediente.');
    expect(prompt.userMessage).not.toContain('rejectedCandidates');
    expect(prompt.userMessage).not.toContain('AuthorityCandidate');
  });
});

describe('FASE 5B IssueDraftResult research validation', () => {
  it('rejects an unknown verified authority ID', () => {
    const validation = validateIssueDraftResult(
      draftResultFixture({
        verifiedAuthorityIds: ['invented-verified-authority'],
        researchHash: 'research-hash-1',
      }),
      validationInputFixture({
        allowedVerifiedAuthorityIds: ['verified-authority-1'],
        expectedResearchHash: 'research-hash-1',
        researchUnlocked: true,
      }),
    );

    expect(validation.status).toBe('INVALID_FATAL');
    expect(validation.errors).toContain('VERIFIED_AUTHORITY_ID_OUT_OF_SCOPE');
  });

  it('requires the exact research hash for an unlocked result', () => {
    const validation = validateIssueDraftResult(
      draftResultFixture({ researchHash: 'old-research-hash' }),
      validationInputFixture({
        allowedVerifiedAuthorityIds: ['verified-authority-1'],
        expectedResearchHash: 'research-hash-1',
        researchUnlocked: true,
      }),
    );

    expect(validation.status).toBe('INVALID_FATAL');
    expect(validation.errors).toContain('RESEARCH_HASH_MISMATCH');
  });

  it('keeps source mention IDs independent from verified authority IDs', () => {
    const validation = validateIssueDraftResult(
      draftResultFixture({ authorityMentionIds: ['source-authority-1'], verifiedAuthorityIds: ['verified-authority-1'], researchHash: 'research-hash-1' }),
      validationInputFixture({
        allowedVerifiedAuthorityIds: ['verified-authority-1'],
        expectedResearchHash: 'research-hash-1',
        researchUnlocked: true,
      }),
    );

    expect(validation.status).toBe('VALID_ACCEPTED');
    expect(validation.result?.authorityMentionIds).toEqual(['source-authority-1']);
    expect(validation.result?.verifiedAuthorityIds).toEqual(['verified-authority-1']);
  });

  it('keeps research metadata optional for a normal result', () => {
    const validation = validateIssueDraftResult(
      draftResultFixture(),
      validationInputFixture(),
    );

    expect(validation.status).toBe('VALID_ACCEPTED');
    expect(validation.result).not.toHaveProperty('verifiedAuthorityIds');
    expect(validation.result).not.toHaveProperty('researchHash');
  });
});

describe('FASE 5B DraftBlock metadata', () => {
  it('preserves research metadata on a non-final block without changing legacy fields', () => {
    const task = generationTaskFixture('issue-research-1');
    const result = draftResultFixture({
      authorityMentionIds: ['source-authority-1'],
      verifiedAuthorityIds: ['verified-authority-1'],
      researchHash: 'research-hash-1',
    });
    const block = draftBlockFromIssueResult(result, task, passEvaluation(`blk-${task.id}`), 'VALID_NON_FINAL');

    expect(block.issueDraftValidationStatus).toBe('VALID_NON_FINAL');
    expect(block.authorityIds).toEqual(['source-authority-1']);
    expect(block.verifiedAuthorityIds).toEqual(['verified-authority-1']);
    expect(block.researchHash).toBe('research-hash-1');
    expect(block.legalIssueIds).toEqual(['issue-research-1']);
    expect(block.coverageItemIds).toEqual(['coverage-research-1']);
  });
});

describe('FASE 5B provider eligibility boundary', () => {
  it('calls the final provider for a research-unlocked issue', async () => {
    const issue = issueFixture({ id: 'issue-research-1', status: 'NEEDS_RESEARCH', researchStatus: 'NEEDS_RESEARCH' });
    const bundle = bundleFixture(issue.id);
    const provider = vi.fn(async (request: AIRequest) => providerResponseForRequest(request, { researchHash: bundle.researchHash }));
    const outcome = await executeIssueScopedGeneration(
      generationTaskFixture(issue.id),
      documentFixture([issue.id]),
      richAnalysisFixture(),
      {
        invokeProvider: provider,
        researchBundlesByIssueId: new Map([[issue.id, bundle]]),
        derivedReadinessByIssueId: new Map([[issue.id, readinessFixture(issue.id, bundle.researchHash)]]),
      },
    );

    expect(provider).toHaveBeenCalledTimes(1);
    expect(outcome.legalIssueId).toBe(issue.id);
  });

  it('keeps UNKNOWN at zero final provider calls', async () => {
    const issue = issueFixture({ id: 'issue-research-1', status: 'UNKNOWN', researchStatus: 'NEEDS_RESEARCH' });
    const provider = vi.fn();
    const outcome = await executeIssueScopedGeneration(
      generationTaskFixture(issue.id),
      documentFixture([issue.id]),
      richAnalysisFixture(),
      { invokeProvider: provider },
    );

    expect(provider).not.toHaveBeenCalled();
    expect(outcome.status).toBe('BLOCKED');
  });

  it('does not invoke research adapters during issue generation', async () => {
    const issue = issueFixture({ id: 'issue-research-1', status: 'NEEDS_RESEARCH', researchStatus: 'NEEDS_RESEARCH' });
    const bundle = bundleFixture(issue.id);
    const researchSearch = vi.fn();
    const researchRetrieve = vi.fn();
    const provider = vi.fn(async (request: AIRequest) => providerResponseForRequest(request, { researchHash: bundle.researchHash }));

    await executeIssueScopedGeneration(
      generationTaskFixture(issue.id),
      documentFixture([issue.id]),
      richAnalysisFixture(),
      {
        invokeProvider: provider,
        researchBundlesByIssueId: new Map([[issue.id, bundle]]),
        derivedReadinessByIssueId: new Map([[issue.id, readinessFixture(issue.id, bundle.researchHash)]]),
      },
    );

    expect(provider).toHaveBeenCalledTimes(1);
    expect(researchSearch).not.toHaveBeenCalled();
    expect(researchRetrieve).not.toHaveBeenCalled();
  });

  it.each([
    ['missing bundle', {}, {}],
    ['partial research', { researchStatus: 'VERIFIED_PARTIAL' }, { researchReadiness: 'RESEARCH_PARTIAL' }],
    ['no authority found', { researchStatus: 'NO_AUTHORITY_FOUND' }, { researchReadiness: 'RESEARCH_REQUIRED' }],
    ['unresolved regime', { researchStatus: 'REGIME_UNRESOLVED' }, { researchReadiness: 'LEGAL_REGIME_UNRESOLVED' }],
    ['human review', { researchStatus: 'REQUIRES_HUMAN_REVIEW' }, { researchReadiness: 'RESEARCH_REQUIRED' }],
  ])('keeps %s at zero final provider calls', async (_label, bundleOverrides, readinessOverrides) => {
    const issue = issueFixture({ id: 'issue-research-1', status: 'NEEDS_RESEARCH', researchStatus: 'NEEDS_RESEARCH' });
    const bundle = bundleFixture(issue.id, bundleOverrides as Partial<LegalResearchBundle>);
    const provider = vi.fn();
    const outcome = await executeIssueScopedGeneration(
      generationTaskFixture(issue.id),
      documentFixture([issue.id]),
      richAnalysisFixture(),
      {
        invokeProvider: provider,
        researchBundlesByIssueId: Object.keys(bundleOverrides).length ? new Map([[issue.id, bundle]]) : undefined,
        derivedReadinessByIssueId: Object.keys(bundleOverrides).length
          ? new Map([[issue.id, readinessFixture(issue.id, bundle.researchHash, readinessOverrides as Partial<DerivedIssueReadiness>)]])
          : undefined,
      },
    );

    expect(provider).not.toHaveBeenCalled();
    expect(outcome.status).toBe('BLOCKED');
  });
});

describe('FASE 5B verified-authority citation and proposition discipline', () => {
  it('rejects a concrete authority citation absent from both scoped allowlists', () => {
    const validation = validateIssueDraftResult(
      draftResultFixture({
        legalDevelopment: ['Conforme al artículo 999 del Código inventado, el requisito queda satisfecho.'],
      }),
      validationInputFixture({
        allowedAuthorityCitations: [{ id: 'source-authority-1', citationText: 'SOURCE_CITED FIXTURE' }],
        allowedVerifiedAuthorityCitations: [{ id: 'verified-authority-1', citationText: 'ARTICULO FEDERAL FIXTURE 14' }],
      }),
    );

    expect(validation.status).toBe('INVALID_FATAL');
    expect(validation.errors).toContain('AUTHORITY_CITATION_OUT_OF_SCOPE');
  });

  it('requires the verified authority ID when its canonical citation is used', () => {
    const validation = validateIssueDraftResult(
      draftResultFixture({
        legalDevelopment: ['Conforme al ARTICULO FEDERAL FIXTURE 14, el requisito debe acreditarse.'],
        verifiedAuthorityIds: [],
      }),
      validationInputFixture({
        allowedVerifiedAuthorityIds: ['verified-authority-1'],
        allowedVerifiedAuthorityCitations: [{ id: 'verified-authority-1', citationText: 'ARTICULO FEDERAL FIXTURE 14' }],
      }),
    );

    expect(validation.status).toBe('INVALID_FATAL');
    expect(validation.errors).toContain('VERIFIED_AUTHORITY_ID_MISSING');
  });

  it('fails when the generated application overclaims a verified proposition as an adjudicated fact', () => {
    const result = draftResultFixture({
      verifiedAuthorityIds: ['verified-authority-1'],
      legalDevelopment: ['La autoridad establece el requisito de acreditar A y B.'],
      application: 'La parte actora acreditó A y B en el expediente.',
    });
    const pack = buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), {
      verifiedResearch: contextFixture('issue-research-1'),
    });

    const evaluation = evaluateIssueDraftResult(
      result,
      generationTaskFixture('issue-research-1'),
      documentFixture(['issue-research-1']),
      pack,
    );

    expect(evaluation.verdict).toBe('FAIL');
    expect(evaluation.hardFailReasons).toContain('VERIFIED_PROPOSITION_OVERCLAIM');
  });
});

describe('FASE 5B downstream Coverage gate', () => {
  const coverageItem = {
    id: 'coverage-research-1',
    category: 'AUTHORITY_MENTION',
    description: 'Requisito jurídico scoped',
    required: true,
    status: 'pending',
    targetSectionIds: ['section-1'],
    scope: 'SUBSTANTIVE',
    satisfactionPolicy: 'SEMANTIC_SUBSTANTIVE',
    blocking: true,
  } as unknown as DocumentCoverageItem;

  it('does not cover an item from a sufficient research bundle alone', () => {
    const sufficientResearchBundle = bundleFixture('issue-research-1');
    expect(sufficientResearchBundle.researchStatus).toBe('VERIFIED_SUFFICIENT');

    expect(isCoverageSatisfied(coverageItem, [], [])).toEqual({
      satisfied: false,
      reason: 'NO_GENERATED_BLOCK',
    });
  });

  it('allows research-unlocked content only after accepted validation and PASS', () => {
    const block = {
      id: 'blk-research-accepted',
      text: 'Contenido jurídico scoped',
      generatedBy: 'AI',
      generationRequirement: 'AI_REQUIRED',
      coverageItemIds: [coverageItem.id],
      issueDraftValidationStatus: 'VALID_ACCEPTED',
      verifiedAuthorityIds: ['verified-authority-1'],
      researchHash: 'research-hash-1',
    } as unknown as ContentBlock;

    expect(isCoverageSatisfied(coverageItem, [block], [{
      blockId: block.id,
      verdict: 'PASS',
      hardFailReasons: [],
    }])).toEqual({
      satisfied: true,
      reason: 'VALID_SUBSTANTIVE_BLOCK',
    });
  });
});

describe('FASE 5B research generation trace links', () => {
  it('records research links across attempt and DraftBlock without copying the bundle', async () => {
    const doc = documentFixture(['issue-research-1']);
    const trace = createGenerationTraceContext({ doc, options: { enabled: true } });
    const bundle = bundleFixture('issue-research-1');
    const provider = vi.fn(async (request: AIRequest) => providerResponseForRequest(request, {
      verifiedAuthorityIds: ['verified-authority-1'],
      researchHash: bundle.researchHash,
    }));

    const outcome = await executeIssueScopedGeneration(
      generationTaskFixture('issue-research-1'),
      doc,
      richAnalysisFixture(),
      {
        invokeProvider: provider,
        trace,
        researchBundlesByIssueId: new Map([['issue-research-1', bundle]]),
        derivedReadinessByIssueId: new Map([['issue-research-1', readinessFixture('issue-research-1', bundle.researchHash)]]),
      },
    );
    const closed = trace.close();

    expect(outcome.status).toBe('ACCEPTED');
    expect(closed.issueGenerationAttempts[0].research).toMatchObject({
      requestId: 'request-issue-research-1',
      researchHash: 'research-hash-1',
      verifiedAuthorityIds: ['verified-authority-1'],
      researchReadiness: 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH',
      effectiveEligibilityReason: 'READY_WITH_VERIFIED_RESEARCH',
    });
    expect(closed.draftBlocks[0].research?.researchHash).toBe('research-hash-1');
    expect(JSON.stringify(closed)).not.toContain('rejectedCandidates');
  });

  it('records a blocked research decision without creating a provider attempt', async () => {
    const doc = documentFixture(['issue-research-1']);
    doc.legalIssueMatrix!.issues[0] = issueFixture({
      id: 'issue-research-1',
      status: 'BLOCKED_BY_CONFLICT',
      conflictIds: ['conflict-1'],
    });
    const trace = createGenerationTraceContext({ doc, options: { enabled: true } });
    const provider = vi.fn();
    const outcome = await executeIssueScopedGeneration(
      generationTaskFixture('issue-research-1'),
      doc,
      richAnalysisFixture(),
      {
        invokeProvider: provider,
        trace,
        researchBundlesByIssueId: new Map([['issue-research-1', bundleFixture('issue-research-1')]]),
        derivedReadinessByIssueId: new Map([['issue-research-1', readinessFixture('issue-research-1')]]),
      },
    );
    const closed = trace.close();

    expect(outcome.status).toBe('BLOCKED');
    expect(provider).not.toHaveBeenCalled();
    expect(closed.issueGenerationAttempts).toHaveLength(0);
    expect(closed.taskExecutions[0].research).toMatchObject({
      researchReadiness: 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH',
      effectiveEligibilityReason: 'BLOCKED_BY_CONFLICT',
    });
  });

  it('reconstructs the Coverage to Issue to Research to Task to DraftBlock chain', async () => {
    const issue = issueFixture({ id: 'issue-research-1' });
    const doc = documentFixture([issue.id]);
    const task = generationTaskFixture(issue.id);
    const bundle = bundleFixture(issue.id);
    const trace = createGenerationTraceContext({ doc, options: { enabled: true } });
    const provider = vi.fn(async (request: AIRequest) => providerResponseForRequest(request, {
      verifiedAuthorityIds: ['verified-authority-1'],
      researchHash: bundle.researchHash,
    }));

    const outcome = await executeIssueScopedGeneration(task, doc, richAnalysisFixture(), {
      invokeProvider: provider,
      trace,
      researchBundlesByIssueId: new Map([[issue.id, bundle]]),
      derivedReadinessByIssueId: new Map([[issue.id, readinessFixture(issue.id, bundle.researchHash)]]),
    });
    const closed = trace.close();
    const coverage = doc.coverageMatrix?.items.find((item) => item.id === issue.coverageItemIds[0]);

    expect(coverage?.id).toBe('coverage-research-1');
    expect(issue.coverageItemIds).toContain(coverage?.id);
    expect(bundle.legalIssueId).toBe(issue.id);
    expect(closed.generationTasks.some((planned) => planned.taskId === task.id)).toBe(true);
    expect(closed.issueGenerationAttempts[0]).toMatchObject({ legalIssueId: issue.id, taskId: task.id });
    expect(closed.issueGenerationAttempts[0].research?.researchHash).toBe(bundle.researchHash);
    expect(closed.taskExecutions.some((execution) => execution.taskId === task.id)).toBe(true);
    expect(closed.draftBlocks[0]).toMatchObject({ generationTaskId: task.id, coverageItemIds: [coverage?.id] });
    expect(outcome.status).toBe('ACCEPTED');
  });
});

describe('FASE 5B readonly pipeline research inputs', () => {
  it('does not mutate CoverageMatrix during research eligibility', async () => {
    const issue = issueFixture({ id: 'issue-research-1' });
    const doc = documentFixture([issue.id]);
    const coverageSnapshot = JSON.stringify(doc.coverageMatrix);
    const bundle = bundleFixture(issue.id);
    const provider = vi.fn(async (request: AIRequest) => providerResponseForRequest(request, {
      verifiedAuthorityIds: ['verified-authority-1'],
      researchHash: bundle.researchHash,
    }));

    await executeIssueScopedGeneration(
      generationTaskFixture(issue.id),
      doc,
      richAnalysisFixture(),
      {
        invokeProvider: provider,
        researchBundlesByIssueId: new Map([[issue.id, bundle]]),
        derivedReadinessByIssueId: new Map([[issue.id, readinessFixture(issue.id, bundle.researchHash)]]),
      },
    );

    expect(JSON.stringify(doc.coverageMatrix)).toBe(coverageSnapshot);
  });

  it('does not mutate RichCaseAnalysis during research eligibility', async () => {
    const issue = issueFixture({ id: 'issue-research-1' });
    const doc = documentFixture([issue.id]);
    const analysis = richAnalysisFixture();
    const analysisSnapshot = JSON.stringify(analysis.richCaseAnalysis);
    const bundle = bundleFixture(issue.id);
    const provider = vi.fn(async (request: AIRequest) => providerResponseForRequest(request, {
      verifiedAuthorityIds: ['verified-authority-1'],
      researchHash: bundle.researchHash,
    }));

    await executeIssueScopedGeneration(
      generationTaskFixture(issue.id),
      doc,
      analysis,
      {
        invokeProvider: provider,
        researchBundlesByIssueId: new Map([[issue.id, bundle]]),
        derivedReadinessByIssueId: new Map([[issue.id, readinessFixture(issue.id, bundle.researchHash)]]),
      },
    );

    expect(JSON.stringify(analysis.richCaseAnalysis)).toBe(analysisSnapshot);
  });

  it('allows each research issue only with its own sufficient artifact', async () => {
    const issues = [
      issueFixture({ id: 'issue-research-1' }),
      issueFixture({ id: 'issue-research-2' }),
    ];
    const doc = documentFixture(issues.map((issue) => issue.id));
    const bundles = new Map(issues.map((issue) => [issue.id, bundleFixture(issue.id)]));
    const readiness = new Map(issues.map((issue) => [issue.id, readinessFixture(issue.id, bundles.get(issue.id)!.researchHash)]));
    const issueSnapshot = JSON.parse(JSON.stringify(doc.legalIssueMatrix));
    const bundleSnapshot = JSON.parse(JSON.stringify(Array.from(bundles.entries())));
    const readinessSnapshot = JSON.parse(JSON.stringify(Array.from(readiness.entries())));
    const provider = vi.fn(async (request: AIRequest) => {
      const legalIssueId = String((request.legalContext as { legalIssue: { id: string } }).legalIssue.id);
      return providerResponseForRequest(
        request,
        {
          legalIssueId,
          verifiedAuthorityIds: ['verified-authority-1'],
          researchHash: bundles.get(legalIssueId)!.researchHash,
        },
      );
    });

    const outcomes = await executeReadyIssueTasks(
      issues.map((issue) => generationTaskFixture(issue.id)),
      doc,
      richAnalysisFixture(),
      {
        invokeProvider: provider,
        maxConcurrency: 1,
        researchBundlesByIssueId: bundles,
        derivedReadinessByIssueId: readiness,
      },
    );

    expect(provider).toHaveBeenCalledTimes(2);
    expect(outcomes.map((outcome) => outcome.legalIssueId)).toEqual(['issue-research-1', 'issue-research-2']);
    expect(outcomes.every((outcome) => outcome.status === 'ACCEPTED')).toBe(true);
    expect(doc.legalIssueMatrix).toEqual(issueSnapshot);
    expect(Array.from(bundles.entries())).toEqual(bundleSnapshot);
    expect(Array.from(readiness.entries())).toEqual(readinessSnapshot);
  });
});
