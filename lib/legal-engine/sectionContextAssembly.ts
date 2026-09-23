import type { CaseAnalysis } from './caseAnalysis';
import type { CoverageMatrix } from './coverageMatrix';
import type { LegalIssueItem } from './legalIssueMatrix';
import type { GenerationTask } from './generationTasks';
import type { DocumentNode, UniversalLegalDocument } from './types';
import type { SectionPlan } from './pipeline';
import type { DerivedIssueReadiness, LegalResearchBundle } from './legal-research/types';
import { stableResearchId } from './legal-research/canonical';
import type { IssueGenerationOutcome, IssueDraftResult } from './issueDraftResult';
import { buildVerifiedResearchContext, type ScopedVerifiedAuthority } from './issueScopedGeneration';
import type { FactItem, EvidenceMention, EvidenceOffer, SourceAuthorityMention, SourceProvenance } from './case-extraction/types';
import {
  type SectionAuthorityMaterial,
  type SectionContextLimits,
  type SectionContextPacket,
  type SectionEvidenceMaterial,
  type SectionGroundedIssueOutput,
  type SectionResearchMaterial,
  type SectionSourceManifest,
} from './sectionContextPacket';
import type { DocumentState } from './documentState';

const DEFAULT_LIMITS: SectionContextLimits = {
  maxContextCharacters: 24000,
  maxGroundedIssueOutputs: 25,
  maxFacts: 40,
  maxEvidence: 40,
  maxAuthorities: 25,
  maxResearch: 25,
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function uniqueProvenance(values: SourceProvenance[]): SourceProvenance[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify([value.sourceId, value.page, value.section, value.paragraphIndex, value.elementIndex, value.excerptHash]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function outcomeAllowed(outcome: IssueGenerationOutcome): outcome is IssueGenerationOutcome & { status: 'ACCEPTED' | 'VALID_NON_FINAL'; result: IssueDraftResult } {
  return (outcome.status === 'ACCEPTED' || outcome.status === 'VALID_NON_FINAL') && Boolean(outcome.result);
}

function projectIssueOutput(outcome: IssueGenerationOutcome & { status: 'ACCEPTED' | 'VALID_NON_FINAL'; result: IssueDraftResult }): SectionGroundedIssueOutput {
  const result = outcome.result;
  return {
    taskId: outcome.taskId,
    legalIssueId: outcome.legalIssueId,
    status: outcome.status,
    coverageItemIds: [...result.coverageItemIds],
    sourceEntityIds: [...result.sourceEntityIds],
    authorityMentionIds: [...result.authorityMentionIds],
    verifiedAuthorityIds: [...(result.verifiedAuthorityIds || [])],
    researchHash: result.researchHash,
    thesis: result.thesis,
    factualDevelopment: [...result.factualDevelopment],
    evidentiaryDevelopment: [...result.evidentiaryDevelopment],
    legalDevelopment: [...result.legalDevelopment],
    application: result.application,
    conclusion: result.conclusion,
  };
}

function projectedEvidence(rich: NonNullable<CaseAnalysis['richCaseAnalysis']>, ids: string[]): SectionEvidenceMaterial[] {
  const mentions = new Map(rich.evidenceMentions.map((item) => [item.id, item]));
  const offers = new Map(rich.evidenceOffers.map((item) => [item.id, item]));
  const result: SectionEvidenceMaterial[] = [];
  for (const id of uniqueSorted(ids)) {
    const mention = mentions.get(id);
    if (mention) {
      result.push({ id: mention.id, kind: 'MENTION', description: mention.description, relatedFactIds: [...mention.relatedFactIds], status: mention.status, provenance: [...mention.provenance] });
      continue;
    }
    const offer = offers.get(id);
    if (offer) {
      const mentionForOffer = mentions.get(offer.evidenceMentionId);
      result.push({ id: offer.id, kind: 'OFFER', description: mentionForOffer?.description || offer.id, relatedFactIds: [...(mentionForOffer?.relatedFactIds || [])], status: offer.status, provenance: [...offer.provenance] });
    }
  }
  return result;
}

function projectedAuthorities(
  rich: NonNullable<CaseAnalysis['richCaseAnalysis']>,
  sourceIds: string[],
  researchAuthorities: ScopedVerifiedAuthority[],
): SectionAuthorityMaterial[] {
  const byId = new Map(rich.authorities.map((item) => [item.id, item]));
  const result: SectionAuthorityMaterial[] = [];
  for (const id of uniqueSorted(sourceIds)) {
    const authority = byId.get(id);
    if (authority?.verificationStatus === 'LEGALLY_VERIFIED') {
      result.push({ id: authority.id, citationText: authority.citationText, verificationStatus: 'LEGALLY_VERIFIED', source: 'SOURCE_MENTION', provenance: [...authority.provenance] });
    }
  }
  for (const authority of researchAuthorities) {
    result.push({
      id: authority.id,
      citationText: authority.identity.canonicalCitation,
      verificationStatus: 'LEGALLY_VERIFIED',
      source: 'VERIFIED_RESEARCH',
      provenance: [],
      proposition: authority.proposition.text,
      researchSource: {
        sourceUrl: authority.source.sourceUrl,
        locator: authority.source.locator,
        sourceHash: authority.source.sourceHash,
      },
    });
  }
  const byKey = new Map(result.map((item) => [item.id, item]));
  return [...byKey.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function researchForIssue(
  issue: LegalIssueItem,
  bundles: ReadonlyMap<string, LegalResearchBundle> | undefined,
  readiness: ReadonlyMap<string, DerivedIssueReadiness> | undefined,
): { material?: SectionResearchMaterial; authorities?: ScopedVerifiedAuthority[]; excluded?: { id: string; reason: string; status?: string } } {
  const bundle = bundles?.get(issue.id);
  const ready = readiness?.get(issue.id);
  if (!bundle || !ready) return { excluded: { id: issue.id, reason: 'RESEARCH_BUNDLE_MISSING', status: issue.status } };
  if (bundle.researchStatus !== 'VERIFIED_SUFFICIENT' || ready.researchReadiness !== 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH') {
    return { excluded: { id: issue.id, reason: 'RESEARCH_NOT_SUFFICIENT', status: bundle.researchStatus } };
  }
  const scoped = buildVerifiedResearchContext(bundle, issue.id);
  if (scoped.authorities.length === 0) {
    return { excluded: { id: issue.id, reason: 'RESEARCH_AUTHORITY_OUT_OF_SCOPE', status: bundle.researchStatus } };
  }
  return {
    material: {
      legalIssueId: issue.id,
      requestId: bundle.requestId,
      researchHash: bundle.researchHash,
      verifiedAuthorityIds: scoped.authorities.map((authority) => authority.id).sort(),
      status: bundle.researchStatus,
    },
    authorities: scoped.authorities,
  };
}

function serializedSize(packet: Omit<SectionContextPacket, 'contextHash'>): number {
  return JSON.stringify(packet).length;
}

export function assembleSectionContextPacket(input: {
  doc: UniversalLegalDocument;
  caseAnalysis: CaseAnalysis;
  section: DocumentNode;
  sectionPlan: SectionPlan;
  tasks: GenerationTask[];
  issueOutcomes: IssueGenerationOutcome[];
  researchBundlesByIssueId?: ReadonlyMap<string, LegalResearchBundle>;
  derivedReadinessByIssueId?: ReadonlyMap<string, DerivedIssueReadiness>;
  documentState?: DocumentState;
  limits?: Partial<SectionContextLimits>;
}): SectionContextPacket {
  const limits: SectionContextLimits = { ...DEFAULT_LIMITS, ...(input.limits || {}) };
  const rich = input.caseAnalysis.richCaseAnalysis;
  const blockers: string[] = [];
  const diagnostics: string[] = [];
  const excluded: SectionSourceManifest['excluded'] = [];
  const matrix = input.doc.legalIssueMatrix;
  const allowedOutcomes = input.issueOutcomes.filter(outcomeAllowed);
  let groundedIssueOutputs = allowedOutcomes
    .map((outcome) => projectIssueOutput(outcome))
    .sort((left, right) => left.taskId.localeCompare(right.taskId));
  for (const outcome of input.issueOutcomes) {
    if (!outcomeAllowed(outcome)) {
      excluded.push({ kind: 'ISSUE_OUTPUT', id: outcome.taskId, reason: outcome.status === 'BLOCKED' ? 'BLOCKED_ISSUE_OUTPUT' : 'ISSUE_OUTPUT_NOT_ACCEPTED', status: outcome.status });
    }
  }

  const issueIds = uniqueSorted([
    ...(input.sectionPlan.legalIssueIds || []),
    ...input.tasks.flatMap((task) => task.legalIssueIds || []),
    ...groundedIssueOutputs.map((item) => item.legalIssueId),
  ]);
  const issues = issueIds.map((id) => matrix?.issues.find((item) => item.id === id)).filter((item): item is LegalIssueItem => Boolean(item));
  const issueById = new Map(issues.map((item) => [item.id, item]));
  for (const unresolvedIssueId of issueIds.filter((id) => !issueById.has(id))) {
    blockers.push('ISSUE_NOT_RESOLVED');
    excluded.push({ kind: 'ISSUE_OUTPUT', id: unresolvedIssueId, reason: 'ISSUE_NOT_RESOLVED' });
  }
  groundedIssueOutputs = groundedIssueOutputs.filter((output) => {
    const linkedIssue = issueById.get(output.legalIssueId);
    const researchBundle = input.researchBundlesByIssueId?.get(output.legalIssueId);
    const readiness = input.derivedReadinessByIssueId?.get(output.legalIssueId);
    const unsafe = !linkedIssue
      || linkedIssue.status === 'NEEDS_CLIENT_POSITION'
      || linkedIssue.status === 'BLOCKED_BY_CONFLICT'
      || linkedIssue.status === 'UNLINKED'
      || (linkedIssue.status === 'NEEDS_RESEARCH'
        && (researchBundle?.researchStatus !== 'VERIFIED_SUFFICIENT'
          || readiness?.researchReadiness !== 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH'));
    if (unsafe) {
      const reason = !linkedIssue
        ? 'ISSUE_NOT_RESOLVED'
        : linkedIssue.status === 'NEEDS_CLIENT_POSITION'
          ? 'BLOCKED_BY_CLIENT_POSITION'
          : linkedIssue.status === 'NEEDS_RESEARCH'
            ? 'RESEARCH_NOT_SUFFICIENT'
            : `ISSUE_STATUS_${linkedIssue.status}`;
      excluded.push({ kind: 'ISSUE_OUTPUT', id: output.taskId, reason, status: linkedIssue?.status });
      if (reason === 'BLOCKED_BY_CLIENT_POSITION') blockers.push('CLIENT_POSITION_MISSING');
      if (reason === 'RESEARCH_NOT_SUFFICIENT') blockers.push('RESEARCH_NOT_SUFFICIENT');
      return false;
    }
    return true;
  });
  if (groundedIssueOutputs.length === 0) {
    blockers.push('NO_GROUNDED_OUTPUT');
    excluded.push({ kind: 'ISSUE_OUTPUT', id: input.section.id, reason: 'NO_GROUNDED_OUTPUT' });
  }
  const groundedCoverageIds = new Set(groundedIssueOutputs.flatMap((output) => output.coverageItemIds));
  for (const coverageId of input.sectionPlan.requiredCoverageItemIds || []) {
    if (!groundedCoverageIds.has(coverageId)) {
      blockers.push('REQUIRED_COVERAGE_UNGROUNDED');
      excluded.push({ kind: 'ISSUE_OUTPUT', id: coverageId, reason: 'REQUIRED_COVERAGE_UNGROUNDED' });
    }
  }
  const acceptedTaskIds = new Set(groundedIssueOutputs.map((output) => output.taskId));
  const acceptedIssueIds = new Set(groundedIssueOutputs.map((output) => output.legalIssueId));
  const groundedTasks = input.tasks.filter((task) => acceptedTaskIds.has(task.id));
  const groundedIssues = issues.filter((issue) => acceptedIssueIds.has(issue.id));
  const requiredIssueIds = new Set([
    ...(input.sectionPlan.legalIssueIds || []),
    ...input.tasks.flatMap((task) => task.legalIssueIds || []),
    ...issues.filter((issue) => issue.required || issue.blocking).map((issue) => issue.id),
  ]);
  const outcomesByIssueId = new Map(input.issueOutcomes.filter((outcome) => outcome.legalIssueId).map((outcome) => [outcome.legalIssueId, outcome]));
  for (const outcome of input.issueOutcomes) {
    if (outcome.legalIssueId && !issueById.has(outcome.legalIssueId) && outcome.status !== 'ACCEPTED' && outcome.status !== 'VALID_NON_FINAL') {
      blockers.push('ISSUE_NOT_RESOLVED');
      excluded.push({ kind: 'ISSUE_OUTPUT', id: outcome.taskId, reason: 'ISSUE_NOT_RESOLVED', status: outcome.status });
    }
  }
  for (const issue of issues) {
    if (!requiredIssueIds.has(issue.id)) continue;
    const researchBundle = input.researchBundlesByIssueId?.get(issue.id);
    const readiness = input.derivedReadinessByIssueId?.get(issue.id);
    const researchReady = issue.researchStatus === 'NOT_REQUIRED'
      || (researchBundle?.researchStatus === 'VERIFIED_SUFFICIENT'
        && readiness?.researchReadiness === 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH');
    const issueBlocked = issue.status === 'BLOCKED_BY_CONFLICT'
      || issue.status === 'UNLINKED'
      || issue.status === 'NEEDS_CLIENT_POSITION'
      || issue.researchStatus !== 'NOT_REQUIRED' && !researchReady;
    const outcome = outcomesByIssueId.get(issue.id);
    const outcomeBlocked = !outcome || (outcome.status !== 'ACCEPTED' && outcome.status !== 'VALID_NON_FINAL');
    if (issueBlocked || outcomeBlocked) {
      const reason = issue.status === 'NEEDS_CLIENT_POSITION'
        ? 'CLIENT_POSITION_MISSING'
        : issue.status === 'NEEDS_RESEARCH' || (issue.researchStatus !== 'NOT_REQUIRED' && !researchReady)
          ? 'RESEARCH_NOT_SUFFICIENT'
          : issue.status === 'BLOCKED_BY_CONFLICT'
            ? 'CONFLICT_REQUIRES_REVIEW'
            : issue.status === 'UNLINKED'
              ? 'ISSUE_UNLINKED'
              : outcome?.status === 'BLOCKED'
                ? 'BLOCKED_ISSUE_OUTPUT'
                : 'ISSUE_OUTPUT_MISSING';
      blockers.push(reason);
      excluded.push({ kind: 'ISSUE_OUTPUT', id: issue.id, reason, status: issue.status || outcome?.status });
    }
  }
  const factIds = uniqueSorted([
    ...groundedTasks.flatMap((task) => task.factIds || []),
    ...groundedIssues.flatMap((issue) => issue.factIds),
  ]);
  const evidenceIds = uniqueSorted([
    ...groundedTasks.flatMap((task) => task.evidenceIds || []),
    ...groundedIssues.flatMap((issue) => [...issue.evidenceMentionIds, ...issue.evidenceOfferIds]),
    ...groundedIssueOutputs.flatMap((item) => item.sourceEntityIds),
  ]);
  const authorityIds = uniqueSorted([
    ...groundedTasks.flatMap((task) => task.authorityIds || []),
    ...groundedIssues.flatMap((issue) => issue.authorityMentionIds),
    ...groundedIssueOutputs.flatMap((item) => item.authorityMentionIds),
  ]);

  const factCandidates = rich
    ? factIds.map((id) => rich.facts.find((item) => item.id === id)).filter((item): item is FactItem => Boolean(item))
    : [];
  const facts = factCandidates.filter((item) => item.assertionStatus !== 'UNKNOWN');
  for (const item of factCandidates.filter((candidate) => candidate.assertionStatus === 'UNKNOWN')) {
    excluded.push({ kind: 'FACT', id: item.id, reason: 'FACT_NOT_VERIFIED', status: item.assertionStatus });
  }
  for (const id of factIds.filter((candidateId) => !facts.some((item) => item.id === candidateId))) {
    blockers.push('GROUNDED_FACT_MISSING');
    excluded.push({ kind: 'FACT', id, reason: 'GROUNDED_FACT_MISSING' });
  }
  const evidenceCandidates = rich ? projectedEvidence(rich, evidenceIds) : [];
  const evidence = evidenceCandidates.filter((item) => !['NEEDS_REVIEW', 'POTENTIALLY_RELEVANT'].includes(item.status));
  for (const item of evidenceCandidates.filter((candidate) => ['NEEDS_REVIEW', 'POTENTIALLY_RELEVANT'].includes(candidate.status))) {
    excluded.push({ kind: 'EVIDENCE', id: item.id, reason: 'EVIDENCE_NOT_VERIFIED', status: item.status });
  }
  for (const id of evidenceIds.filter((candidateId) => !evidence.some((item) => item.id === candidateId))) {
    blockers.push('GROUNDED_EVIDENCE_MISSING');
    excluded.push({ kind: 'EVIDENCE', id, reason: 'GROUNDED_EVIDENCE_MISSING' });
  }
  let research: SectionResearchMaterial[] = [];
  const researchAuthorities: ScopedVerifiedAuthority[] = [];
  const researchAuthoritiesByIssueId = new Map<string, ScopedVerifiedAuthority[]>();
  for (const issue of groundedIssues.filter((item) => item.researchStatus !== 'NOT_REQUIRED')) {
    const result = researchForIssue(issue, input.researchBundlesByIssueId, input.derivedReadinessByIssueId);
    if (result.material) {
      research.push(result.material);
      const scopedAuthorities = result.authorities || [];
      researchAuthorities.push(...scopedAuthorities);
      researchAuthoritiesByIssueId.set(issue.id, scopedAuthorities);
    } else if (result.excluded) {
      excluded.push({ kind: 'RESEARCH', ...result.excluded });
      blockers.push(result.excluded.reason);
    }
  }
  let verifiedAuthorities = rich ? projectedAuthorities(rich, authorityIds, researchAuthorities) : [];
  for (const id of authorityIds) {
    if (!verifiedAuthorities.some((authority) => authority.id === id)) {
      excluded.push({ kind: 'AUTHORITY', id, reason: 'AUTHORITY_NOT_VERIFIED' });
    }
  }
  const clientPosition = rich?.clientPosition?.status === 'CONFIRMED'
    ? { status: rich.clientPosition.status, source: rich.clientPosition.source, propositionIds: [...rich.clientPosition.propositionIds], provenance: [...rich.clientPosition.provenance] }
    : undefined;
  if (issues.some((issue) => issue.clientPositionStatus === 'UNKNOWN' || issue.status === 'NEEDS_CLIENT_POSITION')) {
    blockers.push('CLIENT_POSITION_MISSING');
    excluded.push({ kind: 'CLIENT_POSITION', id: 'client-position', reason: 'CLIENT_POSITION_MISSING', status: rich?.clientPosition?.status });
  }

  const capByKey = <T>(items: T[], getId: (item: T) => string, limit: number, kind: SectionSourceManifest['excluded'][number]['kind']): T[] => {
    if (items.length <= limit) return items;
    for (const item of items.slice(limit)) excluded.push({ kind, id: getId(item), reason: 'CONTEXT_LIMIT_EXCEEDED' });
    diagnostics.push(`CONTEXT_LIMIT_${kind}`);
    blockers.push('CONTEXT_OVERFLOW');
    return items.slice(0, limit);
  };
  groundedIssueOutputs = capByKey(groundedIssueOutputs, (item) => item.taskId, limits.maxGroundedIssueOutputs, 'ISSUE_OUTPUT');
  const cappedFacts = capByKey(facts, (item) => item.id, limits.maxFacts, 'FACT');
  const cappedEvidence = capByKey(evidence, (item) => item.id, limits.maxEvidence, 'EVIDENCE');
  research = capByKey(research, (item) => item.legalIssueId, limits.maxResearch, 'RESEARCH');
  verifiedAuthorities = capByKey(verifiedAuthorities, (item) => item.id, limits.maxAuthorities, 'AUTHORITY');
  const acceptedAuthorityIds = new Set(verifiedAuthorities.map((authority) => authority.id));
  const researchSources = groundedIssues.flatMap((issue) => {
    const researchItem = research.find((item) => item.legalIssueId === issue.id);
    if (!researchItem) return [];
    return (researchAuthoritiesByIssueId.get(issue.id) || [])
      .filter((authority) => acceptedAuthorityIds.has(authority.id))
      .map((authority) => ({
      legalIssueId: issue.id,
      requestId: researchItem.requestId,
      researchHash: researchItem.researchHash,
      authorityId: authority.id,
      sourceUrl: authority.source.sourceUrl,
      locator: authority.source.locator,
      sourceHash: authority.source.sourceHash,
      }));
  }).sort((left, right) => `${left.legalIssueId}:${left.authorityId}`.localeCompare(`${right.legalIssueId}:${right.authorityId}`));

  const manifest: SectionSourceManifest = {
    accepted: {
      coverageItemIds: uniqueSorted(groundedIssueOutputs.flatMap((item) => item.coverageItemIds)),
      factIds: cappedFacts.map((item) => item.id).sort(),
      evidenceIds: cappedEvidence.map((item) => item.id).sort(),
      authorityIds: verifiedAuthorities.map((item) => item.id).sort(),
      researchIssueIds: research.map((item) => item.legalIssueId).sort(),
      issueOutputTaskIds: groundedIssueOutputs.map((item) => item.taskId).sort(),
    },
    excluded: excluded.sort((left, right) => `${left.kind}:${left.id}:${left.reason}`.localeCompare(`${right.kind}:${right.id}:${right.reason}`)),
    researchSources,
    provenance: uniqueProvenance([
      ...(rich?.clientPosition?.provenance || []),
      ...cappedFacts.flatMap((item) => item.provenance),
      ...cappedEvidence.flatMap((item) => item.provenance),
      ...verifiedAuthorities.flatMap((item) => item.provenance),
      ...groundedIssues.flatMap((item) => item.provenance),
    ]),
  };

  const base: Omit<SectionContextPacket, 'contextHash'> = {
    version: 'SECTION_CONTEXT_V1',
    status: 'READY',
    section: { id: input.section.id, title: input.section.title, order: input.section.order, role: input.section.type },
    documentObjective: `${input.doc.documentTypeLabel || input.doc.documentType}: ${input.doc.title}`,
    sectionObjective: input.sectionPlan.objective,
    requirements: uniqueSorted([
      ...(input.sectionPlan.requiredCoverageItemIds || []),
      ...(input.sectionPlan.purpose ? [input.sectionPlan.purpose] : []),
      input.sectionPlan.objective,
    ]),
    groundedIssueOutputs,
    facts: cappedFacts,
    evidence: cappedEvidence,
    verifiedAuthorities,
    research,
    clientPosition,
    previousSectionSummaries: input.documentState?.previousConclusions || [],
    blockers,
    sourceManifest: manifest,
    limits,
    diagnostics,
  };

  if (serializedSize(base) > limits.maxContextCharacters) {
    diagnostics.push('CONTEXT_OVERFLOW');
    blockers.push('CONTEXT_OVERFLOW');
  }
  const status: SectionContextPacket['status'] = blockers.length > 0 ? 'BLOCKED' : 'READY';
  const normalizedBase: Omit<SectionContextPacket, 'contextHash'> = { ...base, status, diagnostics: [...new Set(diagnostics)], blockers: [...new Set(blockers)] };
  return { ...normalizedBase, contextHash: stableResearchId('section-context', normalizedBase) };
}
