import type { AIProviderResult, AIRequest } from '@/lib/ai/providers/types';
import { runFastMode } from '@/lib/ai/orchestrator';
import type { GenerationTask, GenerationTaskType } from './generationTasks';
import { evaluateBlockQuality, type BlockQualityEvaluation } from './semanticEvaluator';
import { stableResearchId } from './legal-research/canonical';
import { createEmptyDocument, type ContentBlock } from './types';
import type { GenerationTraceContext, ProviderActuallyUsed } from './generationTrace';
import type { SectionContextPacket } from './sectionContextPacket';
import type { SectionDraft } from './sectionDraft';

export const SECTION_GENERATION_PROMPT_VERSION = 'SECTION_GENERATION_V1';

const SECTION_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['READY', 'INSUFFICIENT_SUPPORT'] },
    text: { type: 'string' },
    usedCoverageItemIds: { type: 'array', items: { type: 'string' } },
    usedFactIds: { type: 'array', items: { type: 'string' } },
    usedEvidenceIds: { type: 'array', items: { type: 'string' } },
    usedAuthorityIds: { type: 'array', items: { type: 'string' } },
    unresolvedRequirements: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'text', 'usedCoverageItemIds', 'usedFactIds', 'usedEvidenceIds', 'usedAuthorityIds', 'unresolvedRequirements'],
};

interface SectionGenerationOutput {
  status: 'READY' | 'INSUFFICIENT_SUPPORT';
  text: string;
  usedCoverageItemIds: string[];
  usedFactIds: string[];
  usedEvidenceIds: string[];
  usedAuthorityIds: string[];
  unresolvedRequirements: string[];
}

export type SectionClaimSupport = 'SUPPORTED_EXPLICITLY' | 'SUPPORTED_PARAPHRASE' | 'UNSUPPORTED_INFERENCE' | 'GENERIC_FILLER';

export interface SectionClaimGrounding {
  claim: string;
  support: SectionClaimSupport;
  matchedSource?: string;
  matchedSourceIds?: string[];
  overlap: number;
}

interface SectionAllowedProposition {
  id: string;
  kind: 'FACT' | 'EVIDENCE' | 'AUTHORITY' | 'ISSUE_OUTPUT';
  text: string;
  relatedSourceIds?: string[];
}

const CLAIM_STOP_WORDS = new Set([
  'a', 'al', 'ante', 'como', 'con', 'de', 'del', 'el', 'ella', 'en', 'ese', 'esa', 'este', 'esta',
  'ha', 'la', 'las', 'lo', 'los', 'para', 'por', 'que', 'se', 'su', 'sus', 'un', 'una', 'y',
]);

function normalizedClaim(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function claimTokens(value: string): Set<string> {
  return new Set(normalizedClaim(value).split(' ').filter((token) => (token.length > 2 || token === 'no' || token === 'ni') && !CLAIM_STOP_WORDS.has(token)));
}

function orderedClaimTokens(value: string): string[] {
  return normalizedClaim(value).split(' ').filter((token) => (token.length > 2 || token === 'no' || token === 'ni') && !CLAIM_STOP_WORDS.has(token));
}

function preservesSourceOrder(claim: string, source: string): boolean {
  const claimTokensInOrder = orderedClaimTokens(claim);
  const sourceTokensInOrder = orderedClaimTokens(source);
  const sharedTokens = claimTokensInOrder.filter((token) => sourceTokensInOrder.includes(token));
  for (let index = 0; index < sharedTokens.length; index += 1) {
    const leftSourceIndex = sourceTokensInOrder.indexOf(sharedTokens[index]);
    for (let next = index + 1; next < sharedTokens.length; next += 1) {
      if (leftSourceIndex > sourceTokensInOrder.indexOf(sharedTokens[next])) return false;
    }
  }
  return true;
}

function hasNegation(value: string): boolean {
  return /\b(?:no|nunca|jamas|jamás|ni|sin)\b/i.test(normalizedClaim(value));
}

function allowedSectionPropositions(packet: SectionContextPacket, output?: SectionGenerationOutput): SectionAllowedProposition[] {
  const usedFactIds = new Set(output?.usedFactIds || []);
  const usedEvidenceIds = new Set(output?.usedEvidenceIds || []);
  const usedAuthorityIds = new Set(output?.usedAuthorityIds || []);
  const usedCoverageIds = new Set(output?.usedCoverageItemIds || []);
  const hasUsageFilter = Boolean(output);
  const hasPrimaryUsage = !hasUsageFilter || usedFactIds.size > 0 || usedEvidenceIds.size > 0 || usedAuthorityIds.size > 0;
  const propositions: SectionAllowedProposition[] = [
    ...packet.facts.filter((fact) => !hasUsageFilter || usedFactIds.has(fact.id)).map((fact) => ({ id: fact.id, kind: 'FACT' as const, text: fact.proposition })),
    ...packet.evidence.filter((evidence) => !hasUsageFilter || usedEvidenceIds.has(evidence.id)).map((evidence) => ({ id: evidence.id, kind: 'EVIDENCE' as const, text: evidence.description, relatedSourceIds: evidence.relatedFactIds })),
    ...packet.verifiedAuthorities.filter((authority) => !hasUsageFilter || usedAuthorityIds.has(authority.id)).flatMap((authority) => [
      { id: authority.id, kind: 'AUTHORITY' as const, text: authority.proposition || '' },
      { id: authority.id, kind: 'AUTHORITY' as const, text: authority.citationText },
    ]),
    ...packet.groundedIssueOutputs.filter((issueOutput) => issueOutput.status === 'ACCEPTED'
      && (output ? hasPrimaryUsage && issueOutput.coverageItemIds.some((id) => usedCoverageIds.has(id)) : true)).flatMap((issueOutput) => [
      { id: issueOutput.taskId, kind: 'ISSUE_OUTPUT' as const, text: issueOutput.thesis || '', relatedSourceIds: issueOutput.sourceEntityIds },
      ...issueOutput.factualDevelopment.map((text) => ({ id: issueOutput.taskId, kind: 'ISSUE_OUTPUT' as const, text, relatedSourceIds: issueOutput.sourceEntityIds })),
      ...issueOutput.evidentiaryDevelopment.map((text) => ({ id: issueOutput.taskId, kind: 'ISSUE_OUTPUT' as const, text, relatedSourceIds: issueOutput.sourceEntityIds })),
      ...issueOutput.legalDevelopment.map((text) => ({ id: issueOutput.taskId, kind: 'ISSUE_OUTPUT' as const, text, relatedSourceIds: issueOutput.sourceEntityIds })),
      { id: issueOutput.taskId, kind: 'ISSUE_OUTPUT' as const, text: issueOutput.application || '', relatedSourceIds: issueOutput.sourceEntityIds },
      { id: issueOutput.taskId, kind: 'ISSUE_OUTPUT' as const, text: issueOutput.conclusion || '', relatedSourceIds: issueOutput.sourceEntityIds },
    ]),
  ];
  const seen = new Set<string>();
  return propositions.filter((item) => {
    const text = item.text.trim();
    const key = `${item.id}:${item.kind}:${normalizedClaim(text)}`;
    if (!text || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function classifySectionClaims(text: string, packet: SectionContextPacket, output?: SectionGenerationOutput): SectionClaimGrounding[] {
  const sources = allowedSectionPropositions(packet, output).map((source) => ({ ...source, normalized: normalizedClaim(source.text), tokens: claimTokens(source.text) }));
  return text.split(/(?<=[.!?;])\s+|\n+/).map((claim) => claim.trim()).filter(Boolean).map((claim) => {
    const normalized = normalizedClaim(claim);
    const tokens = claimTokens(claim);
    const explicit = sources.find((source) => source.normalized === normalized);
    if (explicit) return { claim, support: 'SUPPORTED_EXPLICITLY' as const, matchedSource: explicit.text, matchedSourceIds: [explicit.id], overlap: 1 };

    const unionTokens = new Set(sources.flatMap((source) => [...source.tokens]));
    const candidates = sources.map((source) => {
      const shared = [...tokens].filter((token) => source.tokens.has(token)).length;
      const outputCoverage = tokens.size > 0 ? shared / tokens.size : 0;
      const sourceCoverage = source.tokens.size > 0 ? shared / source.tokens.size : 0;
      return {
        source,
        shared,
        outputCoverage,
        sourceCoverage,
        orderCompatible: preservesSourceOrder(claim, source.text),
        polarityCompatible: hasNegation(claim) === hasNegation(source.text),
      };
    }).sort((left, right) => right.outputCoverage - left.outputCoverage || right.sourceCoverage - left.sourceCoverage);
    const best = candidates[0];
    const unionShared = [...tokens].filter((token) => unionTokens.has(token)).length;
    const unionCoverage = tokens.size > 0 ? unionShared / tokens.size : 0;
    const novelTokens = [...tokens].filter((token) => !best?.source.tokens.has(token));
    const matchedSources = sources.filter((source) => [...tokens].some((token) => source.tokens.has(token)));
    const novelSupportedByRelatedSource = novelTokens.every((token) => sources.some((source) => source.id !== best?.source.id
      && source.tokens.has(token)
      && (best?.source.relatedSourceIds?.includes(source.id) || source.relatedSourceIds?.includes(best?.source.id || ''))));
    if (best && best.shared >= 2 && best.outputCoverage >= 0.65 && best.sourceCoverage >= 0.45
      && best.orderCompatible && best.polarityCompatible
      && (novelTokens.length === 0 || novelSupportedByRelatedSource)) {
      return {
        claim,
        support: 'SUPPORTED_PARAPHRASE' as const,
        matchedSource: matchedSources.map((source) => source.text).join(' | '),
        matchedSourceIds: [...new Set(matchedSources.map((source) => source.id))],
        overlap: best.outputCoverage,
      };
    }
    if (best && best.shared >= 2) {
      return {
        claim,
        support: 'UNSUPPORTED_INFERENCE' as const,
        matchedSource: matchedSources.map((source) => source.text).join(' | '),
        matchedSourceIds: [...new Set(matchedSources.map((source) => source.id))],
        overlap: best.outputCoverage,
      };
    }
    return { claim, support: 'GENERIC_FILLER' as const, overlap: unionCoverage };
  });
}

export interface SectionGenerationOptions {
  invokeProvider?: (request: AIRequest) => Promise<AIProviderResult>;
  trace?: GenerationTraceContext;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function jsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOutput(response: AIProviderResult): SectionGenerationOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.content);
  } catch {
    throw new Error('SECTION_OUTPUT_NOT_JSON');
  }
  if (!jsonRecord(parsed)) throw new Error('SECTION_OUTPUT_SCHEMA_INVALID');
  const required = ['status', 'text', 'usedCoverageItemIds', 'usedFactIds', 'usedEvidenceIds', 'usedAuthorityIds', 'unresolvedRequirements'];
  const allowedKeys = new Set(required);
  if (Object.keys(parsed).some((key) => !allowedKeys.has(key))) throw new Error('SECTION_OUTPUT_SCHEMA_INVALID');
  if (required.some((key) => !(key in parsed))) throw new Error('SECTION_OUTPUT_SCHEMA_INVALID');
  const arrays = ['usedCoverageItemIds', 'usedFactIds', 'usedEvidenceIds', 'usedAuthorityIds', 'unresolvedRequirements'];
  if (arrays.some((key) => !Array.isArray(parsed[key]) || !(parsed[key] as unknown[]).every((item) => typeof item === 'string'))) throw new Error('SECTION_OUTPUT_SCHEMA_INVALID');
  if ((parsed.status !== 'READY' && parsed.status !== 'INSUFFICIENT_SUPPORT') || typeof parsed.text !== 'string') throw new Error('SECTION_OUTPUT_SCHEMA_INVALID');
  return {
    status: parsed.status,
    text: parsed.text,
    usedCoverageItemIds: uniqueSorted(parsed.usedCoverageItemIds as string[]),
    usedFactIds: uniqueSorted(parsed.usedFactIds as string[]),
    usedEvidenceIds: uniqueSorted(parsed.usedEvidenceIds as string[]),
    usedAuthorityIds: uniqueSorted(parsed.usedAuthorityIds as string[]),
    unresolvedRequirements: uniqueSorted(parsed.unresolvedRequirements as string[]),
  };
}

function metadataLeak(text: string, packet: SectionContextPacket): boolean {
  if (/(?:confidence\s*[:=]|\bOCR\b|\belement\s+\d+|\bPARAGRAPH\b|\bSOURCE_MENTIONED\b|\bfactId\b|\bevidenceId\b|\bauthorityId\b)/i.test(text)) return true;
  const internalIds = [
    ...packet.sourceManifest.accepted.coverageItemIds,
    ...packet.sourceManifest.accepted.factIds,
    ...packet.sourceManifest.accepted.evidenceIds,
    ...packet.sourceManifest.accepted.authorityIds,
    ...packet.sourceManifest.accepted.issueOutputTaskIds,
    packet.contextHash,
  ];
  return internalIds.some((id) => id.length > 2 && text.includes(id));
}

function traceProvider(value: string | undefined): ProviderActuallyUsed {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'nvidia') return 'NVIDIA';
  if (normalized === 'gemini') return 'GEMINI';
  if (normalized === 'groq') return 'GROQ';
  if (normalized === 'local') return 'LOCAL';
  return 'NONE';
}

function buildSyntheticTask(packet: SectionContextPacket, output: SectionGenerationOutput): GenerationTask {
  const role = packet.section.role.trim().toLowerCase();
  const taskType: GenerationTaskType = role === 'argument' || role === 'legal_argument' || role === 'legal_grounds' || role === 'agravios'
    ? 'ISSUE'
    : role === 'evidence'
      ? 'EVIDENCE'
        : role === 'facts' || role === 'background'
          ? 'FACT_RESPONSE'
        : 'SECTION_SUPPORT';
  return {
    id: `section:${packet.section.id}`,
    sectionId: packet.section.id,
    sectionTitle: packet.section.title,
    taskType,
    title: packet.section.title,
    objective: packet.sectionObjective,
    complexity: 'DEEP',
    tokenBudget: 4000,
    status: 'in_progress',
    coverageItemIds: output.usedCoverageItemIds,
    factIds: output.usedFactIds,
    evidenceIds: output.usedEvidenceIds,
    authorityIds: output.usedAuthorityIds,
    scopedFacts: packet.facts.filter((fact) => output.usedFactIds.includes(fact.id)).map((fact) => ({ ...fact, text: fact.proposition })),
    scopedEvidence: packet.evidence.filter((evidence) => output.usedEvidenceIds.includes(evidence.id)).map((evidence) => ({
      ...evidence,
      title: evidence.description.replace(/[.\s]+$/g, ''),
      type: evidence.kind,
    })),
    scopedAuthorities: packet.verifiedAuthorities.filter((authority) => output.usedAuthorityIds.includes(authority.id)),
    legalIssueIds: packet.groundedIssueOutputs.map((item) => item.legalIssueId),
  };
}

function emptySectionOutput(): SectionGenerationOutput {
  return {
    status: 'INSUFFICIENT_SUPPORT',
    text: '',
    usedCoverageItemIds: [],
    usedFactIds: [],
    usedEvidenceIds: [],
    usedAuthorityIds: [],
    unresolvedRequirements: [],
  };
}

function evaluationBlock(packet: SectionContextPacket, output: SectionGenerationOutput): { block: ContentBlock; task: GenerationTask; evaluation: BlockQualityEvaluation } {
  const task = buildSyntheticTask(packet, output);
  const block: ContentBlock = {
    id: `section-draft-block-${packet.section.id}`,
    layer: 'GENERATED_ARGUMENT',
    trustLevel: 'AI_INFERENCE',
    text: output.text.trim(),
    provenance: 'AI_GENERATED',
    generationStatus: 'generated',
    generationRequirement: 'AI_REQUIRED',
    coverageItemIds: [...output.usedCoverageItemIds],
    factIds: [...output.usedFactIds],
    evidenceIds: [...output.usedEvidenceIds],
    authorityIds: [...output.usedAuthorityIds],
    legalIssueIds: [...task.legalIssueIds || []],
    generationTaskIds: [`section:${packet.section.id}`, ...packet.sourceManifest.accepted.issueOutputTaskIds],
    generatedBy: 'AI',
    provider: 'nvidia',
  };
  const evaluation = evaluateBlockQuality(
    block,
    task,
    createEmptyDocument({
      id: `section-doc-${packet.section.id}`,
      title: packet.documentObjective,
      documentType: 'section-generation',
      documentTypeLabel: 'Section generation',
      matter: 'legal',
      sections: [],
    }),
    undefined,
    [],
  );
  return { block, task, evaluation };
}

interface SectionDraftUsage {
  coverageItemIds: string[];
  factIds: string[];
  evidenceIds: string[];
  authorityIds: string[];
}

function usageFromOutput(output?: SectionGenerationOutput): SectionDraftUsage {
  return output
    ? {
        coverageItemIds: [...output.usedCoverageItemIds],
        factIds: [...output.usedFactIds],
        evidenceIds: [...output.usedEvidenceIds],
        authorityIds: [...output.usedAuthorityIds],
      }
    : { coverageItemIds: [], factIds: [], evidenceIds: [], authorityIds: [] };
}

function baseDraft(packet: SectionContextPacket, status: SectionDraft['status'], diagnostics: string[], response?: AIProviderResult, semanticEvaluation?: BlockQualityEvaluation, text = '', usage: SectionDraftUsage = usageFromOutput()): SectionDraft {
  const outputHash = stableResearchId('section-output', {
    sectionId: packet.section.id,
    contextHash: packet.contextHash,
    text,
    status,
    diagnostics,
    usedCoverageItemIds: usage.coverageItemIds,
    usedFactIds: usage.factIds,
    usedEvidenceIds: usage.evidenceIds,
    usedAuthorityIds: usage.authorityIds,
  });
  return {
    id: `section-draft-${packet.section.id}-${outputHash.slice(-16)}`,
    sectionId: packet.section.id,
    text,
    status,
    readiness: status === 'ACCEPTED' ? 'READY' : status === 'BLOCKED' ? 'BLOCKED' : 'REQUIRES_REVIEW',
    coverageItemIds: [...usage.coverageItemIds],
    legalIssueIds: [...packet.groundedIssueOutputs.map((item) => item.legalIssueId)].sort(),
    factIds: [...usage.factIds],
    evidenceIds: [...usage.evidenceIds],
    authorityIds: [...usage.authorityIds],
    generationTaskIds: [`section:${packet.section.id}`, ...packet.sourceManifest.accepted.issueOutputTaskIds],
    sourceManifest: packet.sourceManifest,
    provider: {
      requested: 'nvidia',
      actuallyUsed: response?.providerActuallyUsed || response?.provider || 'none',
      model: response?.model || null,
      calls: response ? 1 : 0,
      fallbackReason: response?.fallbackReason || null,
    },
    semanticEvaluation,
    trace: {
      promptVersion: SECTION_GENERATION_PROMPT_VERSION,
      contextHash: packet.contextHash,
      outputHash,
      finishReason: response?.finishReason,
      diagnostics: [...diagnostics],
    },
    hash: outputHash,
    diagnostics: [...diagnostics],
  };
}

export function buildSectionPrompt(packet: SectionContextPacket): Pick<AIRequest, 'systemPrompt' | 'userMessage' | 'outputSchema'> {
  const systemPrompt = [
    'YOU ARE WRITING ONE COMPLETE LEGAL SECTION.',
    'Redacta una sola sección jurídica completa en prosa continua, técnica y lista para revisión humana.',
    'La respuesta completa debe ser exactamente un objeto JSON válido, sin Markdown, sin encabezados y sin texto antes o después del objeto.',
    'FINAL OUTPUT CONTRACT: {"status":"READY","text":"...","usedCoverageItemIds":["ID_EXACTO_DEL_PACKET"],"usedFactIds":["ID_EXACTO_DEL_PACKET"],"usedEvidenceIds":["ID_EXACTO_DEL_PACKET"],"usedAuthorityIds":[],"unresolvedRequirements":[]}. status solo puede ser READY o INSUFFICIENT_SUPPORT.',
    'Sustituye cada ID de ejemplo únicamente por IDs exactos presentes en el SectionContextPacket; no copies los placeholders ni agregues propiedades.',
    'Los CoverageItems son restricciones internas; no los conviertas en un párrafo por item.',
    'Usa únicamente el SectionContextPacket permitido. No inventes hechos, pruebas, autoridades, posiciones del cliente ni investigación faltante.',
    'Cada afirmación fáctica o probatoria de text debe estar expresamente contenida o ser una paráfrasis conservadora de allowedPropositions.',
    'Los tipos de fuente, nombres de archivo, metadata de provenance y objetivos de redacción no son proposiciones sustantivas y no autorizan afirmaciones nuevas.',
    'No imprimas IDs internos, confidence, extraction method, OCR, estados del sistema, nombres de campos ni metadata técnica dentro de text.',
    'Si el soporte es insuficiente, devuelve status INSUFFICIENT_SUPPORT y text vacío; no rellenes.',
    'Devuelve únicamente JSON válido conforme al esquema. Los arrays used* son metadata de grounding y nunca deben aparecer en text.',
  ].join('\n');
  const userMessage = JSON.stringify({
    documentObjective: packet.documentObjective,
    section: packet.section,
    sectionObjective: packet.sectionObjective,
    requirements: packet.requirements,
    groundedIssueOutputs: packet.groundedIssueOutputs
      .filter((output) => output.status === 'ACCEPTED')
      .map((output) => ({
        taskId: output.taskId,
        status: output.status,
        coverageItemIds: output.coverageItemIds,
        thesis: output.thesis,
        factualDevelopment: output.factualDevelopment,
        evidentiaryDevelopment: output.evidentiaryDevelopment,
        legalDevelopment: output.legalDevelopment,
        application: output.application,
        conclusion: output.conclusion,
      })),
    allowedPropositions: allowedSectionPropositions(packet),
    facts: packet.facts.map((fact) => ({ id: fact.id, proposition: fact.proposition, assertionStatus: fact.assertionStatus })),
    evidence: packet.evidence.map((evidence) => ({ id: evidence.id, kind: evidence.kind, description: evidence.description, relatedFactIds: evidence.relatedFactIds, status: evidence.status })),
    verifiedAuthorities: packet.verifiedAuthorities.map((authority) => ({ id: authority.id, citationText: authority.citationText, proposition: authority.proposition, verificationStatus: authority.verificationStatus })),
    research: packet.research.map((item) => ({ legalIssueId: item.legalIssueId, status: item.status })),
    argumentSupports: packet.argumentSupports || [],
    clientPosition: packet.clientPosition ? { status: packet.clientPosition.status } : undefined,
    previousSectionSummaries: packet.previousSectionSummaries,
    sourceManifest: { accepted: packet.sourceManifest.accepted },
    limits: packet.limits,
  });
  return { systemPrompt, userMessage, outputSchema: SECTION_OUTPUT_SCHEMA };
}

export async function generateSectionDraft(packet: SectionContextPacket, options: SectionGenerationOptions = {}): Promise<SectionDraft> {
  const startedAt = new Date().toISOString();
  const traceTask = buildSyntheticTask(packet, emptySectionOutput());
  options.trace?.recordTaskPlanned(traceTask, packet);
  const recordExecution = (responseStatus: string, response?: AIProviderResult, diagnostics: string[] = [], evaluation?: BlockQualityEvaluation, fallbackUsed = false, finalBlockId?: string, taskForTrace: GenerationTask = traceTask): void => {
    options.trace?.recordTaskExecution({
      taskId: taskForTrace.id,
      taskType: taskForTrace.taskType,
      sectionId: taskForTrace.sectionId,
      coverageItemIds: taskForTrace.coverageItemIds || [],
      legalIssueIds: taskForTrace.legalIssueIds || [],
      evidenceIds: taskForTrace.evidenceIds || [],
      factIds: taskForTrace.factIds || [],
      claimIds: taskForTrace.claimIds || [],
      providerRequested: response?.providerRequested || 'nvidia',
      providerActuallyUsed: traceProvider(response?.providerActuallyUsed || response?.provider),
      model: response?.model,
      startedAt,
      completedAt: new Date().toISOString(),
      tokenBudget: taskForTrace.tokenBudget,
      continuationCount: 0,
      responseStatus,
      rawOutputHash: response?.content ? stableResearchId('section-provider-output', response.content) : undefined,
      evaluation,
      retryCount: 0,
      fallbackUsed,
      fallbackReason: response?.fallbackReason || (diagnostics.length > 0 ? diagnostics.join('; ') : null),
      finalBlockId,
      error: diagnostics.length > 0 ? diagnostics.join('; ') : undefined,
    });
    if (evaluation) options.trace?.recordSemanticEvaluation(evaluation);
  };
  if (packet.status === 'BLOCKED' || packet.blockers.length > 0) {
    const diagnostics = [...new Set(packet.blockers.concat(packet.diagnostics))];
    recordExecution('BLOCKED', undefined, diagnostics);
    return baseDraft(packet, 'BLOCKED', diagnostics);
  }
  const prompt = buildSectionPrompt(packet);
  const request: AIRequest = {
    ...prompt,
    mode: 'fast',
    taskType: 'SECTION_SUPPORT',
    maxTokens: 4000,
    temperature: 0.2,
    legalContext: packet as unknown as Record<string, unknown>,
    requestId: `section:${packet.section.id}:${packet.contextHash}`,
  };
  const invokeProvider = options.invokeProvider || runFastMode;
  let response: AIProviderResult;
  try {
    response = await invokeProvider(request);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 300).replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
    const diagnostics = ['PROVIDER_ERROR', message];
    recordExecution('REVIEW_REQUIRED', undefined, diagnostics);
    return baseDraft(packet, 'REVIEW_REQUIRED', diagnostics);
  }
  const effectiveProvider = String(response.providerActuallyUsed || response.provider || '').toLowerCase();
  if (!response.success || effectiveProvider !== 'nvidia' || response.origin === 'LOCAL_PLACEHOLDER' || response.isLegalAiContent === false) {
    const diagnostics = ['PROVIDER_FALLBACK_REJECTED', ...(response.warnings || []).slice(0, 2)];
    recordExecution('REVIEW_REQUIRED', response, diagnostics, undefined, true);
    return baseDraft(packet, 'REVIEW_REQUIRED', diagnostics, response);
  }
  if (response.isTruncated || response.finishReason === 'length') {
    const diagnostics = ['SECTION_OUTPUT_TRUNCATED'];
    recordExecution('REVIEW_REQUIRED', response, diagnostics);
    return baseDraft(packet, 'REVIEW_REQUIRED', diagnostics, response);
  }
  let output: SectionGenerationOutput;
  try {
    output = parseOutput(response);
  } catch (error) {
    const diagnostics = [error instanceof Error ? error.message : 'SECTION_OUTPUT_SCHEMA_INVALID'];
    recordExecution('REVIEW_REQUIRED', response, diagnostics);
    return baseDraft(packet, 'REVIEW_REQUIRED', diagnostics, response);
  }
  if (output.status === 'INSUFFICIENT_SUPPORT' || output.unresolvedRequirements.length > 0 || !output.text.trim()) {
    const diagnostics = ['INSUFFICIENT_SUPPORT', ...output.unresolvedRequirements];
    recordExecution('REVIEW_REQUIRED', response, diagnostics);
    return baseDraft(packet, 'REVIEW_REQUIRED', diagnostics, response, undefined, output.text.trim());
  }
  if (metadataLeak(output.text, packet)) {
    const diagnostics = ['SECTION_METADATA_LEAK'];
    recordExecution('REVIEW_REQUIRED', response, diagnostics);
    return baseDraft(packet, 'REVIEW_REQUIRED', diagnostics, response, undefined, output.text.trim());
  }
  const allowed = {
    coverage: new Set(packet.sourceManifest.accepted.coverageItemIds),
    facts: new Set(packet.sourceManifest.accepted.factIds),
    evidence: new Set(packet.sourceManifest.accepted.evidenceIds),
    authorities: new Set(packet.sourceManifest.accepted.authorityIds),
  };
  const invalid = [
    ...output.usedCoverageItemIds.filter((id) => !allowed.coverage.has(id)).map(() => 'UNKNOWN_COVERAGE_ID'),
    ...output.usedFactIds.filter((id) => !allowed.facts.has(id)).map(() => 'UNKNOWN_FACT_ID'),
    ...output.usedEvidenceIds.filter((id) => !allowed.evidence.has(id)).map(() => 'UNKNOWN_EVIDENCE_ID'),
    ...output.usedAuthorityIds.filter((id) => !allowed.authorities.has(id)).map(() => 'UNKNOWN_AUTHORITY_ID'),
  ];
  if (invalid.length > 0) {
    const diagnostics = [...new Set(invalid)];
    recordExecution('REVIEW_REQUIRED', response, diagnostics);
    return baseDraft(packet, 'REVIEW_REQUIRED', diagnostics, response, undefined, output.text.trim());
  }
  const { block, task, evaluation } = evaluationBlock(packet, output);
  if (evaluation.verdict !== 'FAIL' && evaluation.hardFailReasons.length === 0) {
    const claimGrounding = classifySectionClaims(output.text, packet, output);
    const unsupportedClaims = claimGrounding.filter((claim) => claim.support === 'UNSUPPORTED_INFERENCE' || claim.support === 'GENERIC_FILLER');
    if (unsupportedClaims.length > 0) {
      const diagnostics = [
        'SECTION_CLAIM_GROUNDING_FAILED',
        ...unsupportedClaims.map((claim) => `${claim.support}: ${claim.claim.slice(0, 180)}`),
      ];
      recordExecution('REVIEW_REQUIRED', response, diagnostics, evaluation, false, undefined, task);
      return baseDraft(packet, 'REVIEW_REQUIRED', diagnostics, response, evaluation, output.text.trim(), usageFromOutput(output));
    }
  }
  const diagnostics = evaluation.verdict === 'PASS'
    ? []
    : evaluation.verdict === 'FAIL' || evaluation.hardFailReasons.length > 0
      ? ['SECTION_SEMANTIC_HARD_FAIL', ...evaluation.hardFailReasons]
      : ['SECTION_SEMANTIC_REVIEW_REQUIRED', ...evaluation.deficiencies];
  const status: SectionDraft['status'] = evaluation.verdict === 'PASS'
    ? 'ACCEPTED'
    : evaluation.verdict === 'FAIL' || evaluation.hardFailReasons.length > 0
      ? 'REVIEW_REQUIRED'
      : 'VALID_NON_FINAL';
  recordExecution(status, response, diagnostics, evaluation, false, status === 'ACCEPTED' || status === 'VALID_NON_FINAL' ? block.id : undefined, task);
  const draft = baseDraft(packet, status, diagnostics, response, evaluation, output.text.trim(), usageFromOutput(output));
  if (status === 'REVIEW_REQUIRED') return draft;
  options.trace?.recordDraftBlock({ ...block, semanticEvaluation: evaluation, semanticScore: evaluation.overallScore, generationTaskId: task.id, generationId: options.trace?.generationId });
  return draft;
}

export function sectionDraftToContentBlock(draft: SectionDraft): ContentBlock {
  return {
    id: draft.id,
    layer: 'GENERATED_ARGUMENT',
    trustLevel: 'AI_INFERENCE',
    text: draft.text,
    provenance: 'AI_GENERATED',
    generationStatus: draft.status === 'ACCEPTED' || draft.status === 'VALID_NON_FINAL' ? 'generated' : 'partial',
    generationRequirement: 'AI_REQUIRED',
    semanticEvaluation: draft.semanticEvaluation,
    semanticEvaluations: draft.semanticEvaluation ? [draft.semanticEvaluation] : [],
    coverageItemIds: [...draft.coverageItemIds],
    factIds: [...draft.factIds],
    evidenceIds: [...draft.evidenceIds],
    authorityIds: [...draft.authorityIds],
    legalIssueIds: [...draft.legalIssueIds],
    generationTaskIds: [...draft.generationTaskIds],
    generationTaskId: draft.generationTaskIds[0],
    generatedBy: 'AI',
    provider: draft.provider.actuallyUsed,
    model: draft.provider.model,
    generationId: undefined,
    fallbackStatus: draft.provider.fallbackReason ? 'REJECTED_FALLBACK' : undefined,
    fallbackReason: draft.provider.fallbackReason || null,
    semanticScore: draft.semanticEvaluation?.overallScore,
    issueDraftValidationStatus: draft.status === 'VALID_NON_FINAL' ? 'VALID_NON_FINAL' : draft.status === 'ACCEPTED' ? 'VALID_ACCEPTED' : 'INVALID_FATAL',
  };
}
