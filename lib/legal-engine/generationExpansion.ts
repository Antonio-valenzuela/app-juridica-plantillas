import { runFastMode } from '../ai/orchestrator';
import { caseProviderFlags } from '../ai/caseProviderConsent';
import type { AIProviderResult, AIRequest } from '../ai/providers/types';
import type { CaseAnalysis } from './caseAnalysis';
import {
  deduplicateExpansionContent,
  isExtendedGeneration,
  salvageCompleteProviderSentences,
  type GenerationExtensionContract,
} from './generationExtension';
import { assessRemainingDraftSupport } from './draftDepth';
import { measureRenderedDocumentPages, type RenderedDocumentPageMetrics } from './documentPageMetrics';
import type { ContentBlock, DocumentNode, UniversalLegalDocument } from './types';
import type { GenerationTraceContext } from './generationTrace';
import { evaluateGeneratedLegalAdmission } from './generatedLegalAdmission';

export interface ExtendedExpansionOptions {
  invokeProvider?: (request: AIRequest) => Promise<AIProviderResult>;
  measure?: (document: UniversalLegalDocument) => Promise<RenderedDocumentPageMetrics>;
  trace?: GenerationTraceContext;
}

export interface ExtendedExpansionResult {
  metrics: RenderedDocumentPageMetrics;
  expansionPasses: number;
  calls: number;
  warnings: string[];
  contentStopReason?: 'TARGET_REACHED' | 'CONTENT_LIMIT_REACHED' | 'COVERAGE_COMPLETE' | 'PROVIDER_UNAVAILABLE' | 'REPETITION_BLOCKED' | 'RESOURCE_LIMIT' | 'ATTORNEY_INPUT_REQUIRED';
  continuationBudgetAvailable?: boolean;
  callBudgetAvailable?: boolean;
}

function providerOutputMetrics(response: AIProviderResult): { words: number; chars: number } {
  const provider = String(response.providerActuallyUsed || response.provider || '').toLowerCase();
  if (!['nvidia', 'gemini', 'groq'].includes(provider)) return { words: 0, chars: 0 };
  const text = String(response.content || '');
  return { words: countWords(text), chars: text.length };
}

function isTruncatedProviderOutput(response: AIProviderResult): boolean {
  return response.isTruncated === true || response.finishReason === 'length';
}

export function reconcileFinalContentStopReason(input: {
  prior: ExtendedExpansionResult['contentStopReason'];
  finalPages: number;
  minPages: number;
  hasRemainingSupportedAnalysis: boolean;
  hasPendingCoverage?: boolean;
  hasEmptySubstantiveSections?: boolean;
  hasAvailableContinuationBudget?: boolean;
  hasAvailableCallBudget?: boolean;
  hasUnmaterializedValidTasks?: boolean;
  hasUnresolvedAttorneyQuestions?: boolean;
}): NonNullable<ExtendedExpansionResult['contentStopReason']> {
  if (input.finalPages >= input.minPages) return 'TARGET_REACHED';
  if (input.prior === 'PROVIDER_UNAVAILABLE' || input.prior === 'REPETITION_BLOCKED'
    || input.prior === 'RESOURCE_LIMIT' || input.prior === 'ATTORNEY_INPUT_REQUIRED') return input.prior;
  if (input.hasUnresolvedAttorneyQuestions || (input.hasPendingCoverage && !input.hasRemainingSupportedAnalysis)) {
    return 'ATTORNEY_INPUT_REQUIRED';
  }
  if (input.hasRemainingSupportedAnalysis
    || input.hasPendingCoverage
    || input.hasEmptySubstantiveSections
    || input.hasAvailableContinuationBudget
    || input.hasAvailableCallBudget
    || input.hasUnmaterializedValidTasks) return 'RESOURCE_LIMIT';
  if (input.prior === 'COVERAGE_COMPLETE') return 'COVERAGE_COMPLETE';
  return 'CONTENT_LIMIT_REACHED';
}

interface SupportedExpansionPacket {
  sectionId: string;
  coverageItemIds: string[];
  factIds: string[];
  evidenceIds: string[];
  authorityIds: string[];
  legalIssueIds: string[];
  sourceIds: string[];
  facts: string[];
  evidence: string[];
  authorities: string[];
}

function sectionPriority(section: DocumentNode): number {
  const key = `${section.title} ${section.type}`.toLowerCase();
  if (/agravio|excepci|defensa|argument|derecho|contestaci|prestaci/.test(key)) return 4;
  if (/hecho|anteced|proced|prueba|evidencia/.test(key)) return 3;
  if (/petitori|conclusi|cierre|firma|comparec/.test(key)) return 1;
  return 2;
}

function sourceContext(document: UniversalLegalDocument, caseAnalysis?: CaseAnalysis): {
  factIds: string[];
  sourceIds: string[];
  facts: string[];
  authorities: string[];
} {
  const rich = caseAnalysis?.richCaseAnalysis;
  const facts = rich?.facts || caseAnalysis?.facts || [];
  const authorities = rich?.authorities || caseAnalysis?.authorities || [];
  return {
    factIds: facts.map((fact: any) => String(fact.id || '')).filter(Boolean),
    sourceIds: document.sourceDocuments.map((source) => source.id).filter(Boolean),
    facts: facts.slice(0, 80).map((fact: any) => `${fact.id || 'hecho'}: ${fact.proposition || fact.text || fact.description || ''}`),
    authorities: authorities.slice(0, 40).map((authority: any) => typeof authority === 'string'
      ? authority
      : `${authority.id || authority.citation || authority.rubro || 'autoridad'}: ${authority.topic || authority.citationText || ''}`),
  };
}

function uniqueIds(values: unknown[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
}

function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) || []).length;
}

function sectionWordCount(section: DocumentNode): number {
  return countWords((section.content || []).map((block) => block.text).join('\n'));
}

function continuationLimit(section: DocumentNode, contract: GenerationExtensionContract): number {
  return contract.sectionBudgets?.[section.id]?.maxContinuations ?? contract.maxContinuationsPerSection;
}

function sectionIsBelowWordBudget(section: DocumentNode, contract: GenerationExtensionContract): boolean {
  const target = contract.sectionBudgets?.[section.id]?.targetWords ?? contract.sectionWordTargets?.[section.id];
  return typeof target === 'number' && sectionWordCount(section) < target;
}

function hasNonFinalCoverageResponse(section: DocumentNode, packet: SupportedExpansionPacket): boolean {
  const packetCoverageIds = new Set(packet.coverageItemIds);
  return section.content.some((block) => block.issueDraftValidationStatus === 'VALID_NON_FINAL'
    && (block.coverageItemIds || []).some((coverageId) => packetCoverageIds.has(coverageId)));
}

function buildSupportedExpansionPackets(
  document: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis,
): { packets: SupportedExpansionPacket[]; pendingCoverageItemIds: string[]; unresolvedCoverageItemIds: string[]; attorneyQuestionIds: string[] } {
  const sourceIds = new Set(document.sourceDocuments.map((source) => source.id).filter(Boolean));
  const allBlocks = document.sections.flatMap((section) => section.content || []);
  const substantiveBlocks = allBlocks.filter((block) => block.issueDraftValidationStatus !== 'VALID_NON_FINAL');
  const usedCoverageIds = new Set(substantiveBlocks.flatMap((block) => block.coverageItemIds || []));
  const usedFactIds = new Set(substantiveBlocks.flatMap((block) => block.factIds || []));
  const usedEvidenceIds = new Set(substantiveBlocks.flatMap((block) => block.evidenceIds || []));
  const usedAuthorityIds = new Set(substantiveBlocks.flatMap((block) => block.verifiedAuthorityIds || []));
  const metadata = document.generationMetadata as UniversalLegalDocument['generationMetadata'] & {
    factResponseMatrix?: { attorneyInputRequirements?: Array<{ id: string }> };
  };
  const attorneyQuestionIds = uniqueIds([
    ...(metadata.factResponseMatrix?.attorneyInputRequirements || []).map((requirement) => requirement.id),
  ]);
  const confirmedFacts = new Map<string, { text: string; sourceId: string; position: string; response?: string }>();
  for (const fact of caseAnalysis?.facts || []) {
    const sourceId = fact.documentId || fact.sourceReference?.documentId;
    if (!fact.id || !sourceId || !sourceIds.has(sourceId)) continue;
    const text = (fact.sourceFact || fact.text || '').trim();
    if (!text) continue;
    const hasExplicitPosition = Boolean(fact.lawyerPosition && fact.lawyerPosition !== 'UNDEFINED');
    confirmedFacts.set(fact.id, {
      text,
      sourceId,
      position: hasExplicitPosition ? fact.lawyerPosition! : 'CONTESTACION_DEFENSIVA_CARGA_PROBATORIA',
      response: fact.manualResponse?.trim() || undefined,
    });
  }
  const evidenceById = new Map<string, { text: string; sourceIds: string[] }>();
  for (const mention of caseAnalysis?.richCaseAnalysis?.evidenceMentions || []) {
    if (!mention.id || !['SOURCE_ATTACHED', 'EXTRACTED'].includes(mention.status) || !mention.provenance?.length) continue;
    const linkedSources = uniqueIds(mention.provenance.map((item) => item.sourceId)).filter((id) => sourceIds.has(id));
    if (!linkedSources.length || !mention.description.trim()) continue;
    evidenceById.set(mention.id, { text: mention.description.trim(), sourceIds: linkedSources });
  }
  const verifiedAuthorities = new Map<string, { text: string; issueIds: string[]; mentionIds: string[] }>();
  for (const authority of caseAnalysis?.verifiedAuthorities || []) {
    const validTime = ['CURRENT_AND_APPLICABLE', 'HISTORICALLY_APPLICABLE'].includes(authority.temporalValidity.status);
    if (authority.verificationStatus !== 'VERIFIED'
      || authority.source.sourceTier !== 'OFFICIAL_PRIMARY'
      || authority.jurisdictionValidity.status !== 'APPLICABLE'
      || !validTime
      || authority.proposition.supportLevel !== 'DIRECT') continue;
    verifiedAuthorities.set(authority.id, {
      text: `${authority.identity.canonicalCitation}: ${authority.proposition.text}`,
      issueIds: authority.supportsLegalIssueIds,
      mentionIds: authority.sourceAuthorityMentionIds,
    });
  }

  const unresolvedCoverageItemIds = uniqueIds((document.coverageMatrix?.items || [])
    .filter((item) => item.required && ['pending', 'drafting', 'generated', 'weak', 'unsupported', 'insufficient', 'needs_client_position', 'blocked', 'contradictory'].includes(item.status))
    .map((item) => item.id));
  const eligiblePendingCoverage = (document.coverageMatrix?.items || []).filter((item) =>
    item.required
    && ['pending', 'weak', 'insufficient'].includes(item.status)
    && !item.requiresClientPosition
    && item.status !== 'blocked'
    && !usedCoverageIds.has(item.id),
  );
  const pendingCoverageItemIds = uniqueIds(eligiblePendingCoverage.map((item) => item.id));
  const packets = document.sections
    .filter((section) => !['header', 'footer', 'page-header', 'page-footer', 'signature', 'closing', 'petition', 'preamble'].includes(section.type) && !/petitori|proemio|firma|cierre|comparec/i.test(`${section.title} ${section.type}`))
    .map((section): SupportedExpansionPacket | null => {
      const items = eligiblePendingCoverage.filter((item) => item.targetSectionIds?.includes(section.id));
      if (!items.length) return null;
      const facts = new Map<string, { text: string; sourceId: string }>();
      const evidence = new Map<string, { text: string; sourceIds: string[] }>();
      const authorities = new Map<string, { text: string; issueIds: string[]; mentionIds: string[] }>();
      const itemSupport = new Map<string, string[]>();
      for (const item of items) {
        const support: string[] = [];
        const factIds = uniqueIds([...(item.relatedFactIds || []), ...(item.factIds || [])]);
        for (const id of factIds) {
          const fact = confirmedFacts.get(id);
          if (fact && !usedFactIds.has(id)) {
            facts.set(id, { text: `${id} (postura confirmada: ${fact.position}${fact.response ? `; respuesta manual: ${fact.response}` : ''}): ${fact.text}`, sourceId: fact.sourceId });
            support.push(id);
          }
        }
        const evidenceIds = uniqueIds([...(item.relatedEvidenceIds || []), ...(item.evidenceMentionIds || [])]);
        for (const id of evidenceIds) {
          const sourceEvidence = evidenceById.get(id);
          if (sourceEvidence && !usedEvidenceIds.has(id)) {
            evidence.set(id, sourceEvidence);
            support.push(id);
          }
        }
        const authorityIds = uniqueIds([...(item.relatedAuthorityIds || []), ...(item.authorityMentionIds || [])]);
        for (const [id, authority] of verifiedAuthorities) {
          const isLinked = authorityIds.includes(id)
            || authority.mentionIds.some((mentionId) => authorityIds.includes(mentionId));
          const linkedLegalIssueIds = uniqueIds((document.legalIssueMatrix?.issues || [])
            .filter((issue) => issue.coverageItemIds.some((coverageId) => items.some((item) => item.id === coverageId)))
            .map((issue) => issue.id));
          const issueLinked = linkedLegalIssueIds.length === 0 || authority.issueIds.some((issueId) => linkedLegalIssueIds.includes(issueId));
          if (isLinked && issueLinked && !usedAuthorityIds.has(id)) {
            authorities.set(id, authority);
            support.push(id);
          }
        }
        itemSupport.set(item.id, support);
      }
      const supportedItems = items.filter((item) => (itemSupport.get(item.id) || []).length > 0);
      if (!supportedItems.length) return null;
      return {
        sectionId: section.id,
        coverageItemIds: supportedItems.map((item) => item.id),
        factIds: Array.from(facts.keys()),
        evidenceIds: Array.from(evidence.keys()),
        authorityIds: Array.from(authorities.keys()),
        legalIssueIds: uniqueIds(supportedItems.flatMap((item) => item.argumentIds || [])),
        sourceIds: uniqueIds([
          ...Array.from(facts.values()).map((fact) => fact.sourceId),
          ...Array.from(evidence.values()).flatMap((entry) => entry.sourceIds),
        ]),
        facts: Array.from(facts.values()).map((fact) => fact.text),
        evidence: Array.from(evidence, ([id, entry]) => `${id}: ${entry.text}`),
        authorities: Array.from(authorities, ([id, authority]) => `${id}: ${authority.text}`),
      };
    })
    .filter((packet): packet is SupportedExpansionPacket => packet !== null);

  return { packets, pendingCoverageItemIds, unresolvedCoverageItemIds, attorneyQuestionIds };
}

export function hasRemainingSupportedExpansion(document: UniversalLegalDocument, caseAnalysis?: CaseAnalysis): boolean {
  return buildSupportedExpansionPackets(document, caseAnalysis).packets.length > 0;
}

export function buildSupportedExpansionPrompt(
  document: UniversalLegalDocument,
  section: DocumentNode,
  packet: SupportedExpansionPacket,
  contract: GenerationExtensionContract,
): string {
  const existingText = section.content.map((block) => block.text).join('\n\n');
  return [
    'Redacta en español jurídico mexicano una ampliación profesional, específica y estrictamente limitada al material siguiente.',
    'DIRECTIVA OBLIGATORIA DE POSTURA DEFENSIVA SIN INSTRUCCIÓN DEL CLIENTE:',
    'Cuando no exista postura fáctica confirmada por el abogado:',
    'ESTÁ PERMITIDO ÚNICAMENTE: cuestionar la acreditación y suficiencia probatoria del hecho afirmado por la contraria, invocar la carga de la prueba, señalar falta de precisión o presupuestos legales, analizar el alcance probatorio y formular argumentos y excepciones jurídicas subsidiarias sostenibles.',
    'ESTÁ TERMINANTEMENTE PROHIBIDO: afirmar que un hecho es falso sin que conste en la fuente su falsedad, inventar una versión fáctica del demandado (como contratos temporales, convenios, renuncias, faltas, notificaciones, liquidaciones o pagos no acreditados), inventar documentos inexistentes, fechas no mencionadas o causas de terminación laboral no comprobadas en autos, o inventar acontecimientos materiales.',
    'Una afirmación de fuente no equivale a un hecho admitido; si el material no permite una conclusión, delimita la cuestión y deja la decisión al abogado.',
    'No rellenes para alcanzar páginas. No repitas texto, ni dentro de la sección ni en otra parte del documento. Entrega solo texto nuevo y sustantivo.',
    `DOCUMENTO: ${document.documentTypeLabel || document.documentType}`,
    `SECCIÓN: ${section.title}`,
    `COBERTURA PENDIENTE: ${packet.coverageItemIds.join(', ')}`,
    `HECHOS VINCULADOS CON POSTURA EXPLÍCITA: ${packet.facts.join('\n') || 'Ninguno'}`,
    `EVIDENCIA VINCULADA Y TRAZABLE: ${packet.evidence.join('\n') || 'Ninguna'}`,
    `AUTORIDADES OFICIALES VERIFICADAS Y APLICABLES: ${packet.authorities.join('\n') || 'Ninguna'}`,
    `OBJETIVO DE SECCIÓN (orientativo, nunca obligatorio): ${contract.sectionWordTargets?.[section.id] || 0} palabras`,
    `TEXTO EXISTENTE SOLO PARA EVITAR REPETIRLO:\n${existingText.slice(-5000)}`,
  ].join('\n');
}

function makeSupportedExpansionBlock(
  document: UniversalLegalDocument,
  packet: SupportedExpansionPacket,
  text: string,
  response: AIProviderResult,
  sequence: number,
): ContentBlock {
  const taskId = `supported-expansion-${packet.sectionId}-${sequence}`;
  return {
    id: `blk-${taskId}`,
    text: text.trim(),
    layer: 'GENERATED_ARGUMENT',
    trustLevel: 'AI_INFERENCE',
    provenance: 'AI_GENERATED',
    generationStatus: 'generated',
    generationRequirement: 'AI_REQUIRED',
    isManuallyEdited: false,
    generatedBy: 'AI',
    provider: response.provider,
    model: response.model || null,
    generationId: document.generationMetadata.generationId,
    generationTaskId: taskId,
    generationTaskType: 'EXTENSION',
    coverageItemIds: packet.coverageItemIds,
    factIds: packet.factIds,
    evidenceIds: packet.evidenceIds,
    verifiedAuthorityIds: packet.authorityIds,
    legalIssueIds: packet.legalIssueIds,
    sources: packet.sourceIds.map((documentId) => ({ documentId })),
    issueDraftValidationStatus: 'VALID_NON_FINAL',
    revisionNumber: 0,
    fallbackReason: null,
    genericityClass: 'SPECIFIC',
  };
}

async function expandWithSupportedCoverage(
  document: UniversalLegalDocument,
  caseAnalysis: CaseAnalysis | undefined,
  contract: GenerationExtensionContract,
  options: ExtendedExpansionOptions,
  initialMetrics: RenderedDocumentPageMetrics,
): Promise<ExtendedExpansionResult> {
  const measure = options.measure || measureRenderedDocumentPages;
  const invokeProvider = options.invokeProvider || runFastMode;
  const warnings: string[] = [];
  let metrics = initialMetrics;
  let expansionPasses = 0;
  let calls = 0;
  const continuationCallsBySection = new Map<string, number>();
  let contentStopReason: NonNullable<ExtendedExpansionResult['contentStopReason']> = 'TARGET_REACHED';
  const candidates = document.sections
    .filter((section) => !['header', 'footer', 'page-header', 'page-footer', 'signature', 'closing', 'petition', 'preamble'].includes(section.type) && !/petitori|proemio|firma|cierre|comparec/i.test(`${section.title} ${section.type}`))
    .sort((left, right) => sectionPriority(right) - sectionPriority(left) || left.order - right.order);

  const hasBudgetedNonFinalContinuation = (): boolean => {
    const packets = buildSupportedExpansionPackets(document, caseAnalysis).packets;
    return packets.some((packet) => {
      const section = document.sections.find((candidate) => candidate.id === packet.sectionId);
      if (!section || !hasNonFinalCoverageResponse(section, packet) || !sectionIsBelowWordBudget(section, contract)) return false;
      return (continuationCallsBySection.get(section.id) || 0) < continuationLimit(section, contract);
    });
  };

  while ((metrics.actualPages < contract.minPages || hasBudgetedNonFinalContinuation())
    && expansionPasses < contract.maxExpansionPasses
    && calls < contract.maxCallsPerDocument) {
    expansionPasses += 1;
    let addedThisPass = false;
    let sawProviderFailure = false;
    let sawDuplicate = false;
    const support = buildSupportedExpansionPackets(document, caseAnalysis);
    const packetBySection = new Map(support.packets.map((packet) => [packet.sectionId, packet]));
    const assessment = assessRemainingDraftSupport({
      pendingCoverageItemIds: support.packets.flatMap((packet) => packet.coverageItemIds),
      unusedFactIds: support.packets.flatMap((packet) => packet.factIds),
      unusedEvidenceIds: support.packets.flatMap((packet) => packet.evidenceIds),
      verifiedUnappliedAuthorityIds: support.packets.flatMap((packet) => packet.authorityIds),
      unresolvedAttorneyQuestionIds: support.attorneyQuestionIds,
    });
    if (!assessment.canExpand) {
      const unresolvedCoverage = support.unresolvedCoverageItemIds.length > 0;
      contentStopReason = unresolvedCoverage || support.attorneyQuestionIds.length > 0
        ? 'ATTORNEY_INPUT_REQUIRED'
        : 'COVERAGE_COMPLETE';
      break;
    }

    for (const section of candidates) {
      if (calls >= contract.maxCallsPerDocument) break;
      const packet = packetBySection.get(section.id);
      if (!packet) continue;
      const isContinuation = hasNonFinalCoverageResponse(section, packet);
      if (isContinuation && (!sectionIsBelowWordBudget(section, contract)
        || (continuationCallsBySection.get(section.id) || 0) >= continuationLimit(section, contract))) continue;
      if (metrics.actualPages >= contract.minPages && !isContinuation) continue;
      let response: AIProviderResult;
      try {
        if (isContinuation) {
          continuationCallsBySection.set(section.id, (continuationCallsBySection.get(section.id) || 0) + 1);
          contract.metrics.continuationCalls += 1;
        }
        response = await invokeProvider({
          systemPrompt: 'Redacción jurídica profesional con trazabilidad estricta. Respeta las posturas confirmadas y límites del expediente; no inventes ni rellenes.',
          userMessage: buildSupportedExpansionPrompt(document, section, packet, contract),
          mode: 'fast',
          maxTokens: Math.min(contract.maxGeneratedTokens, 1800),
          maxProviderRetries: 1,
          ...caseProviderFlags(document),
        });
      } catch (error) {
        calls += 1;
        contract.metrics.llmCalls += 1;
        contract.metrics.expansionCalls += 1;
        sawProviderFailure = true;
        warnings.push(`EXTENSION_PROVIDER_UNAVAILABLE:${section.id}:${error instanceof Error ? error.name : 'ERROR'}`);
        continue;
      }
      calls += 1;
      contract.metrics.llmCalls += 1;
      contract.metrics.expansionCalls += 1;
      contract.metrics.providerCalls[response.provider] = (contract.metrics.providerCalls[response.provider] || 0) + 1;
      const providerOutput = providerOutputMetrics(response);
      options.trace?.recordWordAccounting({
        sectionId: section.id,
        providerGeneratedWords: providerOutput.words,
        providerGeneratedChars: providerOutput.chars,
      });

      const truncated = isTruncatedProviderOutput(response);
      const recovered = truncated ? salvageCompleteProviderSentences(response.content) : null;
      if (truncated && !recovered?.text) {
        if (providerOutput.words > 0) options.trace?.recordWordAccounting({
          sectionId: section.id,
          rejectedWords: providerOutput.words,
          reason: 'PROVIDER_OUTPUT_TRUNCATED_WITHOUT_COMPLETE_SENTENCE',
          lossStage: 'provider-validation',
        });
        sawProviderFailure = true;
        warnings.push(`EXTENSION_OUTPUT_TRUNCATED:${section.id}`);
        continue;
      }
      const acceptedResponse = recovered
        ? { ...response, content: recovered.text, isTruncated: false, finishReason: 'stop' as const }
        : response;
      if (recovered) {
        if (recovered.rejectedWords > 0) options.trace?.recordWordAccounting({
          sectionId: section.id,
          rejectedWords: recovered.rejectedWords,
          reason: 'PROVIDER_TRUNCATED_INCOMPLETE_TAIL',
          lossStage: 'provider-validation',
        });
        warnings.push(`EXTENSION_OUTPUT_PARTIALLY_RECOVERED:${section.id}`);
      }

      if (!isUsableLegalResponse(acceptedResponse) || (acceptedResponse.provider === 'local' && acceptedResponse.origin !== 'AI_GENERATED_LEGAL_CONTENT')) {
        if (providerOutput.words > 0) options.trace?.recordWordAccounting({
          sectionId: section.id,
          rejectedWords: providerOutput.words,
          reason: response.errorCode || response.fallbackReason || 'PROVIDER_OUTPUT_NOT_USABLE',
          lossStage: 'provider-validation',
        });
        sawProviderFailure = true;
        warnings.push(`EXTENSION_PROVIDER_UNAVAILABLE:${section.id}:${response.errorCode || response.fallbackReason || 'NO_LEGAL_CONTENT'}`);
        continue;
      }
      const generated = acceptedResponse.content.trim();
      if (generated.includes('[SECCIÓN_COMPLETA]')) {
        options.trace?.recordWordAccounting({
          sectionId: section.id,
          rejectedWords: providerOutput.words,
          reason: 'COMPLETION_SENTINEL_WITHOUT_NEW_CONTENT',
          lossStage: 'provider-validation',
        });
        continue;
      }
      const admission = evaluateGeneratedLegalAdmission({ text: generated, sectionType: section.type, document, analysis: caseAnalysis, legalIssueIds: packet.legalIssueIds });
      if (!admission.accepted) {
        const reason = admission.reasons.join('+');
        warnings.push(`LEGAL_ADMISSION_REJECTED:${section.id}:${reason}`);
        options.trace?.addWarning(`LEGAL_ADMISSION_REJECTED:${section.id}:${reason}`);
        options.trace?.recordWordAccounting({ sectionId: section.id, rejectedWords: countWords(generated), reason, lossStage: 'block-admission' });
        continue;
      }
      const wholeDocumentText = document.sections.flatMap((candidate) => candidate.content.map((block) => block.text)).join('\n\n');
      const deduplicated = deduplicateExpansionContent(wholeDocumentText, generated);
      if (deduplicated.removedWords > 0) {
        options.trace?.recordWordAccounting({
          sectionId: section.id,
          dedupRemovedWords: deduplicated.removedWords,
          reason: 'EXTENSION_DUPLICATE_PARAGRAPHS_REMOVED',
          lossStage: 'deduplication',
        });
      }
      if (deduplicated.isDuplicate || !deduplicated.text) {
        contract.metrics.rejectedDuplicateChunks += 1;
        sawDuplicate = true;
        warnings.push('EXTENSION_DUPLICATE_REJECTED_DOCUMENT');
        continue;
      }

      const block = makeSupportedExpansionBlock(document, packet, deduplicated.text, acceptedResponse, calls);
      options.trace?.recordWordAccounting({ sectionId: section.id, validatedWords: deduplicated.acceptedWords });
      section.content.push(block);
      addedThisPass = true;
      options.trace?.recordDraftBlock(block, undefined, section.id);
      metrics = await measure(document);
      if (metrics.actualPages >= contract.minPages) {
        contentStopReason = 'TARGET_REACHED';
        break;
      }
    }
    if (!addedThisPass) {
      const remaining = buildSupportedExpansionPackets(document, caseAnalysis);
      contentStopReason = sawProviderFailure ? 'PROVIDER_UNAVAILABLE'
        : sawDuplicate ? 'REPETITION_BLOCKED'
        : remaining.unresolvedCoverageItemIds.length > 0 || remaining.attorneyQuestionIds.length > 0
          ? 'ATTORNEY_INPUT_REQUIRED'
          : remaining.packets.length > 0 ? 'RESOURCE_LIMIT'
            : 'CONTENT_LIMIT_REACHED';
      if (contentStopReason === 'CONTENT_LIMIT_REACHED') warnings.push('CONTENT_LIMIT_REACHED');
      break;
    }
  }

  if (metrics.actualPages < contract.minPages && contentStopReason === 'TARGET_REACHED') {
    const support = buildSupportedExpansionPackets(document, caseAnalysis);
    contentStopReason = support.packets.length === 0
      ? (support.unresolvedCoverageItemIds.length > 0 || support.attorneyQuestionIds.length > 0 ? 'ATTORNEY_INPUT_REQUIRED' : 'COVERAGE_COMPLETE')
      : 'RESOURCE_LIMIT';
  } else if (metrics.actualPages < contract.minPages
    && contentStopReason === 'TARGET_REACHED'
    && expansionPasses >= contract.maxExpansionPasses) {
    contentStopReason = 'RESOURCE_LIMIT';
  }

  contract.actualPages = metrics.actualPages;
  contract.wordCount = metrics.wordCount;
  contract.characterCount = metrics.characterCount;
  contract.extensionTargetUnmet = metrics.actualPages < contract.minPages;
  if (contract.extensionTargetUnmet) warnings.push(`EXTENSION_TARGET_UNMET:${metrics.actualPages}/${contract.minPages}`);
  return {
    metrics,
    expansionPasses,
    calls,
    warnings: Array.from(new Set(warnings)),
    contentStopReason,
    continuationBudgetAvailable: hasBudgetedNonFinalContinuation()
      && calls < contract.maxCallsPerDocument
      && expansionPasses < contract.maxExpansionPasses,
    callBudgetAvailable: contract.metrics.llmCalls < contract.maxCallsPerDocument,
  };
}

export function buildExpansionPrompt(
  document: UniversalLegalDocument,
  section: DocumentNode,
  caseAnalysis: CaseAnalysis | undefined,
  contract: GenerationExtensionContract,
): string {
  const context = sourceContext(document, caseAnalysis);
  const existingText = section.content.map((block) => block.text).join('\n\n');
  const pending = [
    'delimitación del problema',
    'hechos y prueba estrictamente vinculados',
    'regla jurídica aplicable y su interpretación',
    'subsunción de los hechos acreditados',
    'refutación de la postura contraria',
    'conclusión y efecto procesal',
  ];
  return [
    'Eres redactor jurídico mexicano especializado en contestaciones extensas y source-grounded.',
    'Genera una ampliación sustantiva para una sección existente. No rellenes espacio.',
    'DIRECTIVA OBLIGATORIA DE POSTURA DEFENSIVA SIN INSTRUCCIÓN DEL CLIENTE:',
    'Cuando no exista postura fáctica confirmada por el abogado:',
    'ESTÁ PERMITIDO ÚNICAMENTE: formular observaciones sobre hechos y fuentes concretos sin inventar postura. Carga probatoria, presunciones, efectos procesales y valor jurídico requieren una proposición oficialmente verificada y aplicable; en su ausencia marca PENDIENTE DE FUNDAMENTACIÓN / INVESTIGACIÓN. No ofrezcas evidencia no confirmada ni atribuyas valor pleno a una constancia.',
    'ESTÁ TERMINANTEMENTE PROHIBIDO: afirmar que un hecho es falso sin que conste en la fuente su falsedad, inventar una versión fáctica del demandado (como contratos temporales, convenios, renuncias, faltas, notificaciones, liquidaciones o pagos no acreditados), inventar documentos inexistentes, fechas no mencionadas o causas de terminación laboral no comprobadas en autos, o inventar acontecimientos materiales.',
    'Usa únicamente los hechos, pruebas, autoridades y fuentes identificadas abajo. Si algo no consta, formula una reserva jurídica prudente sin inventarlo.',
    'No repitas texto, encabezados, premisas o citas ya existentes; escribe prosa forense continua sin Markdown.',
    `DOCUMENTO: ${document.documentTypeLabel || document.documentType}`,
    `SECCIÓN: ${section.title}`,
    `OBJETIVO APROXIMADO DE LA SECCIÓN: ${contract.sectionWordTargets?.[section.id] || 0} palabras`,
    `FUENTES: ${context.sourceIds.join(', ') || 'Ninguna identificada'}`,
    `HECHOS VINCULADOS: ${context.factIds.join(', ') || 'Ninguno identificado'}`,
    context.facts.length ? `DETALLE DE HECHOS:\n${context.facts.join('\n')}` : 'DETALLE DE HECHOS: No hay detalle estructurado adicional.',
    context.authorities.length ? `AUTORIDADES IDENTIFICADAS:\n${context.authorities.join('\n')}` : 'AUTORIDADES IDENTIFICADAS: No se proporcionaron autoridades verificadas.',
    `PUNTOS DE PROFUNDIZACIÓN POSIBLES: ${pending.join(' | ')}`,
    'TEXTO EXISTENTE DE LA SECCIÓN (solo para evitar repetición):',
    existingText.slice(-14000),
    '',
    'Entrega únicamente la ampliación nueva. Debe desarrollar razonamiento, relación prueba-hecho, regla-aplicación y consecuencia procesal cuando el expediente lo permita.',
  ].join('\n');
}

function isUsableLegalResponse(response: AIProviderResult): boolean {
  return Boolean(response.success
    && response.content?.trim()
    && response.origin !== 'LOCAL_PLACEHOLDER'
    && response.isLegalAiContent !== false);
}

function makeExpansionBlock(
  document: UniversalLegalDocument,
  section: DocumentNode,
  text: string,
  response: AIProviderResult,
  sequence: number,
  contract: GenerationExtensionContract,
): ContentBlock {
  const context = sourceContext(document, document.caseAnalysis);
  const taskId = `extended-expansion-${section.id}-${sequence}`;
  return {
    id: `blk-${taskId}`,
    text: text.trim(),
    layer: 'GENERATED_ARGUMENT',
    trustLevel: 'AI_INFERENCE',
    provenance: 'AI_GENERATED',
    generationStatus: 'generated',
    generationRequirement: 'AI_REQUIRED',
    isManuallyEdited: false,
    generatedBy: 'AI',
    provider: response.provider,
    model: response.model || null,
    generationId: document.generationMetadata.generationId,
    generationTaskId: taskId,
    generationTaskType: 'EXTENSION',
    coverageItemIds: (document.coverageMatrix?.items || [])
      .filter((item) => item.targetSectionIds?.includes(section.id))
      .map((item) => item.id),
    factIds: context.factIds,
    sources: context.sourceIds.map((documentId) => ({ documentId })),
    issueDraftValidationStatus: 'VALID_NON_FINAL',
    revisionNumber: 0,
    fallbackReason: null,
    semanticScore: undefined,
    genericityClass: 'SPECIFIC',
    ...(contract.generationMode === 'extended-legal' ? {} : {}),
  };
}

export async function expandDocumentToPageTarget(
  document: UniversalLegalDocument,
  caseAnalysis: CaseAnalysis | undefined,
  contract: GenerationExtensionContract,
  options: ExtendedExpansionOptions = {},
): Promise<ExtendedExpansionResult> {
  const measure = options.measure || measureRenderedDocumentPages;
  let metrics = await measure(document);
  const warnings: string[] = [];
  let expansionPasses = 0;
  let calls = 0;
  const invokeProvider = options.invokeProvider || runFastMode;

  if (!isExtendedGeneration(contract)) {
    contract.actualPages = metrics.actualPages;
    contract.wordCount = metrics.wordCount;
    contract.characterCount = metrics.characterCount;
    contract.extensionTargetUnmet = false;
    return { metrics, expansionPasses, calls, warnings };
  }

  if (document.generationMetadata.draftDepth) {
    const supportedResult = await expandWithSupportedCoverage(document, caseAnalysis, contract, options, metrics);
    metrics = supportedResult.metrics;
    expansionPasses += supportedResult.expansionPasses;
    calls += supportedResult.calls;
    warnings.push(...supportedResult.warnings);

    if (metrics.actualPages >= contract.minPages || calls >= contract.maxCallsPerDocument || expansionPasses >= contract.maxExpansionPasses) {
      contract.actualPages = metrics.actualPages;
      contract.wordCount = metrics.wordCount;
      contract.characterCount = metrics.characterCount;
      contract.extensionTargetUnmet = metrics.actualPages < contract.minPages;
      return {
        metrics,
        expansionPasses,
        calls,
        warnings: Array.from(new Set(warnings)),
        contentStopReason: supportedResult.contentStopReason,
      };
    }

  }

  const candidates = document.sections
    .filter((section) => !['header', 'footer', 'page-header', 'page-footer', 'signature', 'closing', 'petition', 'preamble'].includes(section.type) && !/petitori|proemio|firma|cierre|comparec/i.test(`${section.title} ${section.type}`))
    .sort((left, right) => sectionPriority(right) - sectionPriority(left) || left.order - right.order);

  while (
    metrics.actualPages < contract.minPages
    && expansionPasses < contract.maxExpansionPasses
    && calls < contract.maxCallsPerDocument
  ) {
    expansionPasses += 1;
    let addedThisPass = false;
    for (const section of candidates) {
      if (metrics.actualPages >= contract.minPages || calls >= contract.maxCallsPerDocument) break;
      const existingText = section.content.map((block) => block.text).join('\n\n');
      const response = await invokeProvider({
        systemPrompt: 'Redacción jurídica extensa, profesional y estrictamente fundada en el expediente. No inventes datos ni repitas contenido.',
        userMessage: buildExpansionPrompt(document, section, caseAnalysis, contract),
        mode: 'fast',
        maxTokens: Math.min(contract.maxGeneratedTokens, 1800),
        maxProviderRetries: 1,
        ...caseProviderFlags(document),
      });
      calls += 1;
      contract.metrics.llmCalls += 1;
      contract.metrics.expansionCalls += 1;
      contract.metrics.providerCalls[response.provider] = (contract.metrics.providerCalls[response.provider] || 0) + 1;

      const providerOutput = providerOutputMetrics(response);
      options.trace?.recordWordAccounting({
        sectionId: section.id,
        providerGeneratedWords: providerOutput.words,
        providerGeneratedChars: providerOutput.chars,
      });

      const truncated = isTruncatedProviderOutput(response);
      const recovered = truncated ? salvageCompleteProviderSentences(response.content) : null;
      if (truncated && !recovered?.text) {
        if (providerOutput.words > 0) options.trace?.recordWordAccounting({
          sectionId: section.id,
          rejectedWords: providerOutput.words,
          reason: 'PROVIDER_OUTPUT_TRUNCATED_WITHOUT_COMPLETE_SENTENCE',
          lossStage: 'provider-validation',
        });
        warnings.push(`EXTENSION_OUTPUT_TRUNCATED:${section.id}`);
        continue;
      }
      const acceptedResponse = recovered
        ? { ...response, content: recovered.text, isTruncated: false, finishReason: 'stop' as const }
        : response;
      if (recovered) {
        if (recovered.rejectedWords > 0) options.trace?.recordWordAccounting({
          sectionId: section.id,
          rejectedWords: recovered.rejectedWords,
          reason: 'PROVIDER_TRUNCATED_INCOMPLETE_TAIL',
          lossStage: 'provider-validation',
        });
        warnings.push(`EXTENSION_OUTPUT_PARTIALLY_RECOVERED:${section.id}`);
      }

      if ((acceptedResponse.provider === 'local' && acceptedResponse.origin !== 'AI_GENERATED_LEGAL_CONTENT') || acceptedResponse.origin === 'LOCAL_PLACEHOLDER' || acceptedResponse.isLegalAiContent === false) {
        if (providerOutput.words > 0) options.trace?.recordWordAccounting({
          sectionId: section.id,
          rejectedWords: providerOutput.words,
          reason: response.fallbackReason || response.errorCode || 'PROVIDER_OUTPUT_NOT_USABLE',
          lossStage: 'provider-validation',
        });
        warnings.push(`EXTENSION_PROVIDER_UNAVAILABLE:${section.id}:LOCAL_FALLBACK`);
        // A local/non-legal fallback is not admissible as extension content,
        // but it must not abort the whole document. Continue with the next
        // candidate so a transient provider failure cannot strand the target.
        continue;
      }

      if (!isUsableLegalResponse(acceptedResponse)) {
        if (providerOutput.words > 0) options.trace?.recordWordAccounting({
          sectionId: section.id,
          rejectedWords: providerOutput.words,
          reason: response.errorCode || response.fallbackReason || 'PROVIDER_OUTPUT_NOT_USABLE',
          lossStage: 'provider-validation',
        });
        warnings.push(`EXTENSION_PROVIDER_UNAVAILABLE:${section.id}:${response.errorCode || response.fallbackReason || 'NO_LEGAL_CONTENT'}`);
        continue;
      }
      const generated = acceptedResponse.content.trim();
      if (generated.includes('[SECCIÓN_COMPLETA]')) {
        options.trace?.recordWordAccounting({
          sectionId: section.id,
          rejectedWords: providerOutput.words,
          reason: 'COMPLETION_SENTINEL_WITHOUT_NEW_CONTENT',
          lossStage: 'provider-validation',
        });
        continue;
      }
      const admission = evaluateGeneratedLegalAdmission({ text: generated, sectionType: section.type, document, analysis: caseAnalysis, legalIssueIds: section.content.flatMap(block => block.legalIssueIds || []) });
      if (!admission.accepted) {
        const reason = admission.reasons.join('+');
        warnings.push(`LEGAL_ADMISSION_REJECTED:${section.id}:${reason}`);
        options.trace?.addWarning(`LEGAL_ADMISSION_REJECTED:${section.id}:${reason}`);
        options.trace?.recordWordAccounting({ sectionId: section.id, rejectedWords: countWords(generated), reason, lossStage: 'block-admission' });
        continue;
      }
      const wholeDocText = document.sections.flatMap((candidate) => candidate.content.map((block) => block.text)).join('\n\n');
      const deduplicated = deduplicateExpansionContent(wholeDocText, generated);
      if (deduplicated.removedWords > 0) options.trace?.recordWordAccounting({
        sectionId: section.id,
        dedupRemovedWords: deduplicated.removedWords,
        reason: 'EXTENSION_DUPLICATE_PARAGRAPHS_REMOVED',
        lossStage: 'deduplication',
      });
      if (deduplicated.isDuplicate || !deduplicated.text) {
        contract.metrics.rejectedDuplicateChunks += 1;
        warnings.push(`EXTENSION_DUPLICATE_REJECTED:${section.id}`);
        continue;
      }

      options.trace?.recordWordAccounting({ sectionId: section.id, validatedWords: deduplicated.acceptedWords });
      section.content.push(makeExpansionBlock(document, section, deduplicated.text, acceptedResponse, calls, contract));
      addedThisPass = true;
      options.trace?.addWarning(`EXTENDED_EXPANSION_ADDED:${section.id}:${response.provider}`);
      options.trace?.recordDraftBlock(section.content[section.content.length - 1]!, undefined, section.id);
      metrics = await measure(document);
    }
    if (!addedThisPass) break;
  }

  contract.actualPages = metrics.actualPages;
  contract.wordCount = metrics.wordCount;
  contract.characterCount = metrics.characterCount;
  contract.extensionTargetUnmet = metrics.actualPages < contract.minPages;
  if (contract.extensionTargetUnmet) {
    warnings.push(`EXTENSION_TARGET_UNMET:${metrics.actualPages}/${contract.minPages}`);
  }
  const contentStopReason: ExtendedExpansionResult['contentStopReason'] =
    metrics.actualPages >= contract.minPages ? 'TARGET_REACHED' : 'RESOURCE_LIMIT';
  return { metrics, expansionPasses, calls, warnings: Array.from(new Set(warnings)), contentStopReason };
}

