import { describe, expect, it } from 'vitest';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { SourceAuthorityMention } from '@/lib/legal-engine/case-extraction/types';
import type { LegalIssueItem, LegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import { createFixtureOfficialAdapter } from '@/lib/legal-engine/legal-research/adapters/fixtureOfficial';
import type { FixtureAuthorityRecord } from '@/lib/legal-engine/legal-research/adapters/fixtureOfficial';
import { runLegalResearchOnly } from '@/lib/legal-engine/pipeline';
import {
  assessLegalResearchPlanCompleteness,
  buildAuthorityVerificationPlan,
  buildStrategicLegalResearchPlan,
  projectAuthorityVerificationPlan,
} from '@/lib/legal-engine/legal-research/plan';
import { resolveEffectiveIssueGenerationEligibility } from '@/lib/legal-engine/issueScopedGeneration';
import { issueFixture } from './legalResearchReentryFixtures';

const scope = {
  scope: 'FEDERAL' as const,
  matter: 'AMPARO',
  procedure: 'AMPARO_DIRECTO',
  temporalCutoff: '2026-09-13',
  temporalPrecision: 'DAY' as const,
  sourceAdapters: ['FIXTURE_OFFICIAL'] as const,
  sourceTiers: ['OFFICIAL_PRIMARY'] as const,
};

const authorityMention = {
  id: 'authority-20',
  authorityType: 'LAW',
  citationText: 'Ley de Amparo, artículo 178',
  verificationStatus: 'SOURCE_CITED',
  provenance: [{ sourceId: 'pdf-0129000036717288006AST', page: 8, excerpt: 'artículo 178' }],
} as unknown as SourceAuthorityMention;

const strategicInput = {
  legalIssueId: 'issue-strategic-fixture',
  propositionToEstablish: 'La omisión de motivación vulnera el parámetro constitucional aplicable.',
  sourceArgumentIds: ['argument-1', 'argument-2'],
  sourceFactIds: ['fact-1', 'fact-2'],
  sourceClaimIds: [],
  challengedReasoningIds: [],
  authorityTypes: ['CONSTITUTION', 'JURISPRUDENCE'] as const,
  adverseAuthorityRequired: true,
  scope,
};

describe('LegalResearchPlan foundation', () => {
  it('builds a deterministic strategic plan with explicit source relations and criteria', async () => {
    const first = await buildStrategicLegalResearchPlan(strategicInput);
    const second = await buildStrategicLegalResearchPlan({
      ...strategicInput,
      sourceFactIds: ['fact-2', 'fact-1'],
      sourceArgumentIds: ['argument-2', 'argument-1'],
    });

    expect(first).toMatchObject({
      legalIssueId: 'issue-strategic-fixture',
      purpose: 'STRATEGIC_ISSUE_RESEARCH',
      sourceFactIds: ['fact-1', 'fact-2'],
      sourceArgumentIds: ['argument-1', 'argument-2'],
      status: 'INCOMPLETE',
    });
    expect(first.researchQuestions).toHaveLength(1);
    expect(first.researchQuestions[0]).toMatchObject({
      propositionToEstablish: strategicInput.propositionToEstablish,
      adverseAuthorityRequired: true,
    });
    expect(first.searchScopes[0]).toMatchObject({
      scope: 'FEDERAL',
      temporalCutoff: '2026-09-13',
      sourceAdapters: ['FIXTURE_OFFICIAL'],
    });
    expect(first.completenessCriteria.adverseAuthorityStatus).toBe('REQUIRED_NOT_CHECKED');
    expect(first.planHash).toBe(second.planHash);
    expect(first.researchQuestions[0].id).toBe(second.researchQuestions[0].id);
    expect(first.authorityRequirements[0].id).toBe(second.authorityRequirements[0].id);
  });

  it('uses independent question identity: same generic wording does not merge different propositions', async () => {
    const first = await buildStrategicLegalResearchPlan(strategicInput);
    const second = await buildStrategicLegalResearchPlan({
      ...strategicInput,
      legalIssueId: 'issue-strategic-other',
      propositionToEstablish: 'La autoridad debió valorar la prueba ofrecida conforme al estándar legal.',
      sourceArgumentIds: ['argument-3'],
      sourceFactIds: ['fact-3'],
    });

    expect(first.researchQuestions[0].id).not.toBe(second.researchQuestions[0].id);
    expect(first.researchQuestions[0].question).toBe(second.researchQuestions[0].question);
    expect(first.authorityRequirements[0].id).not.toBe(second.authorityRequirements[0].id);
  });

  it('fails closed without an explicit relation, proposition, or strategic scope', async () => {
    const missingRelation = await buildStrategicLegalResearchPlan({
      ...strategicInput,
      sourceFactIds: [],
      sourceArgumentIds: [],
      sourceClaimIds: [],
      challengedReasoningIds: [],
    });
    const missingProposition = await buildStrategicLegalResearchPlan({
      ...strategicInput,
      propositionToEstablish: '   ',
    });
    const missingScope = await buildStrategicLegalResearchPlan({
      ...strategicInput,
      scope: undefined,
    });
    const missingTemporalScope = await buildStrategicLegalResearchPlan({
      ...strategicInput,
      scope: { ...scope, temporalCutoff: undefined, temporalPrecision: 'UNKNOWN' },
    });
    const missingSourceScope = await buildStrategicLegalResearchPlan({
      ...strategicInput,
      scope: { ...scope, sourceAdapters: [], sourceTiers: [] },
    });

    expect(missingRelation.status).toBe('BLOCKED');
    expect(missingRelation.blockers).toContain('BLOCKED_MISSING_EXPLICIT_RELATION');
    expect(missingProposition.blockers).toContain('BLOCKED_MISSING_PROPOSITION');
    expect(missingScope.blockers).toContain('BLOCKED_MISSING_SCOPE');
    expect(missingTemporalScope.blockers).toContain('BLOCKED_MISSING_TEMPORAL_SCOPE');
    expect(missingSourceScope.blockers).toContain('BLOCKED_MISSING_SOURCE_SCOPE');
    expect(missingRelation.researchQuestions[0].question).not.toContain('buscar leyes aplicables');
  });

  it('creates authority verification without inventing strategic ownership', async () => {
    const plan = await buildAuthorityVerificationPlan({
      legalIssueId: 'issue-authority-verification',
      authority: authorityMention,
      scope,
    });

    expect(plan).toMatchObject({
      purpose: 'AUTHORITY_VERIFICATION',
      status: 'NOT_STARTED',
      sourceFactIds: [],
      sourceArgumentIds: [],
      sourceClaimIds: [],
      challengedReasoningIds: [],
    });
    expect(plan.researchQuestions[0].propositionToEstablish).toBeUndefined();
    expect(plan.authorityRequirements).toHaveLength(1);
    expect(plan.authorityRequirements[0]).toMatchObject({
      sourceAuthorityMentionId: 'authority-20',
      required: true,
    });
    expect(plan.authorityRequirements[0].id).toContain('authority-requirement-');
    expect(plan.researchQuestions[0].id).not.toBe(plan.authorityRequirements[0].id);
    expect(plan.completenessCriteria.adverseAuthorityStatus).toBe('NOT_REQUIRED');
    expect(projectAuthorityVerificationPlan(plan)).toMatchObject({
      legalIssueId: 'issue-authority-verification',
      sourceAuthorityMentionIds: ['authority-20'],
      requestedAuthorityTypes: ['STATUTE'],
    });
  });

  it('keeps SOURCE_CITED unverified and distinct requirements distinct', async () => {
    const first = await buildAuthorityVerificationPlan({ legalIssueId: 'issue-1', authority: authorityMention, scope });
    const second = await buildAuthorityVerificationPlan({
      legalIssueId: 'issue-1',
      authority: { ...authorityMention, id: 'authority-21' },
      scope,
    });

    expect(authorityMention.verificationStatus).toBe('SOURCE_CITED');
    expect(first.authorityRequirements[0].sourceAuthorityMentionId).toBe('authority-20');
    expect(second.authorityRequirements[0].sourceAuthorityMentionId).toBe('authority-21');
    expect(first.authorityRequirements[0].id).not.toBe(second.authorityRequirements[0].id);
    expect(JSON.stringify(first)).not.toContain('LEGALLY_VERIFIED');
  });

  it('does not declare an adverse-authority plan complete before that check', async () => {
    const plan = await buildStrategicLegalResearchPlan(strategicInput);
    const assessment = await assessLegalResearchPlanCompleteness(plan, {
      coveredResearchQuestionIds: plan.researchQuestions.map((question) => question.id),
      verifiedAuthorityRequirementIds: plan.authorityRequirements.map((requirement) => requirement.id),
      checkedSourceAdapters: ['FIXTURE_OFFICIAL'],
      adverseAuthorityStatus: 'REQUIRED_NOT_CHECKED',
    });

    expect(assessment.status).toBe('INCOMPLETE');
    expect(assessment.completenessCriteria.adverseAuthorityStatus).toBe('REQUIRED_NOT_CHECKED');
    expect(assessment.blockers).toContain('ADVERSE_AUTHORITY_CHECK_REQUIRED');
  });

  it('does not change canonical generation eligibility merely because a plan exists', async () => {
    const issue = issueFixture({
      id: 'issue-client-position',
      status: 'NEEDS_CLIENT_POSITION',
      researchStatus: 'NEEDS_RESEARCH',
      clientPositionStatus: 'UNKNOWN',
    });
    const before = JSON.stringify(issue);
    await buildStrategicLegalResearchPlan({ ...strategicInput, legalIssueId: issue.id });
    const eligibility = resolveEffectiveIssueGenerationEligibility({ issue, formal: false, taskType: 'ISSUE' });

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toBe('BLOCKED_BY_CLIENT_POSITION');
    expect(JSON.stringify(issue)).toBe(before);
  });

  it('projects authority verification into the existing controlled pipeline and bundle', async () => {
    const plan = await buildAuthorityVerificationPlan({
      legalIssueId: 'issue-controlled-authority',
      authority: authorityMention,
      scope,
    });
    const projection = projectAuthorityVerificationPlan(plan);
    const issue: LegalIssueItem = {
      id: 'issue-controlled-authority',
      issueType: 'AUTHORITY_RESEARCH',
      question: projection.question,
      source: {
        mode: 'RICH_COVERAGE',
        coverageItemId: 'coverage-controlled-authority',
        coverageCategory: 'AUTHORITY_MENTION',
        sourceEntityIds: [authorityMention.id],
      },
      coverageItemIds: ['coverage-controlled-authority'],
      claimIds: [],
      factIds: [],
      evidenceMentionIds: [],
      evidenceOfferIds: [],
      argumentIds: [],
      authorityMentionIds: [authorityMention.id],
      conflictIds: [],
      missingDataIds: [],
      clientPositionStatus: 'NOT_REQUIRED',
      required: true,
      blocking: true,
      status: 'NEEDS_RESEARCH',
      researchStatus: 'NEEDS_RESEARCH',
      provenance: [],
      relationStatus: 'EXPLICIT',
    };
    const issueMatrix: LegalIssueMatrix = {
      documentId: 'document-controlled-authority',
      documentType: 'fixture',
      sourceMode: 'RICH',
      issues: [issue],
      summary: {
        total: 1,
        required: 1,
        blocked: 1,
        readyForGeneration: 0,
        needsLegalResearch: 1,
        needsClientPosition: 0,
        unresolvedConflict: 0,
        unlinked: 0,
      },
    };
    const caseAnalysis = {
      richCaseAnalysis: {
        parties: [],
        claims: [],
        facts: [],
        evidenceMentions: [],
        evidenceOffers: [],
        arguments: [],
        authorities: [authorityMention],
        conflicts: [],
        missingData: [],
        sourcePosition: { mode: 'SOURCE_GROUNDED', confidence: 1, sourceIds: [] },
        extractionStats: {},
        candidates: [],
      },
    } as unknown as CaseAnalysis;
    const fixture: FixtureAuthorityRecord = {
      authorityType: 'STATUTE',
      citation: authorityMention.citationText,
      canonicalCitation: 'LEY DE AMPARO ARTICULO 178',
      sourceUrl: 'https://fixture.official.test/federal/ley-amparo-178',
      sourceDomain: 'fixture.official.test',
      issuingAuthority: 'Autoridad federal fixture',
      jurisdiction: 'FEDERAL',
      matter: 'AMPARO',
      procedure: 'AMPARO_DIRECTO',
      publicationDate: '2020-01-01',
      effectiveFrom: '2020-01-02',
      locator: 'fixture:ley-amparo-178',
      proposition: 'El órgano jurisdiccional debe observar el requisito procesal delimitado.',
      content: 'Texto sintético oficial fixture para verificación controlada.',
    };

    const result = await runLegalResearchOnly({
      caseAnalysis,
      issueMatrix,
      provider: createFixtureOfficialAdapter([fixture], () => new Date('2026-01-01T00:00:00.000Z')),
      regimeInputsByIssue: {
        [issue.id]: {
          legalContext: { country: 'MX', scope: 'FEDERAL', matter: 'AMPARO', procedure: 'AMPARO_DIRECTO' },
        },
      },
      requestedAuthorityTypesByIssue: { [issue.id]: projection.requestedAuthorityTypes },
      clock: () => new Date('2026-01-01T00:00:00.000Z'),
    });
    const bundle = result.bundles[0];
    const assessment = await assessLegalResearchPlanCompleteness(plan, {
      coveredResearchQuestionIds: [plan.researchQuestions[0].id],
      verifiedAuthorityRequirementIds: [plan.authorityRequirements[0].id],
      checkedSourceAdapters: ['FIXTURE_OFFICIAL'],
      checkedSourceTiers: ['OFFICIAL_PRIMARY'],
    });

    expect(result.requests[0].requestedAuthorityTypes).toEqual(projection.requestedAuthorityTypes);
    expect(bundle.researchStatus).toBe('VERIFIED_SUFFICIENT');
    expect(bundle.verifiedAuthorities[0].sourceAuthorityMentionIds).toContain('authority-20');
    expect(bundle.verifiedAuthorities[0].verificationStatus).toBe('VERIFIED');
    expect(result.readiness[0].researchReadiness).toBe('READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH');
    expect(assessment.status).toBe('SUFFICIENT');
    expect(plan.status).toBe('NOT_STARTED');
    expect(plan.purpose).toBe('AUTHORITY_VERIFICATION');
  });
});
