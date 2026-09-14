import { 
  UniversalLegalDocument, 
  PipelineStage, 
  createEmptyDocument, 
  DocumentParties,
  CaseReferences,
  ContentBlock,
  DocumentNode,
  UploadedSourceDocument, 
  GeneratedSourceReference,
  CaseWorkflow,
  GenerationMode,
  FactPosition,
  ProceduralIdentity,
  AnalyzedClaim,
  ValidationIssue
} from './types';
import { classifyIntent } from './classifier';
import { buildVariableMap } from './variableResolver';
import { validateDocument } from './validator';
import { buildGenerationContext, requiresValidatedSources, buildBlockGenerationContext } from './context';
import { createReferenceDocument } from './context';
import { markDocumentAsDraft, markDocumentAsReviewRequired, markDocumentAsSource, readDocumentLifecycle } from './documentLifecycle';
import { createContentBlock, stripTrustMarkers } from './trustLayer';
import { LawyerProfile, DEFAULT_LAWYER_PROFILE } from '../workspace/lawyerProfileTypes';
import { applyStyleToSectionText, evaluateStyleMatch } from './styleEngine';
import { runQualityGateCheck } from './qualityGate';
import { reconstructCaseAnalysis, CaseAnalysis, CaseTheory, ArgumentAxis } from './caseAnalysis';
import { buildCaseContext, formatCaseContextField, isLaboralDocumentType, isAmparoDocumentType, isAdministrativoDocumentType, isFiscalDocumentType, isPenalDocumentType, isAgrarioDocumentType, isInmobiliarioDocumentType, isCorporativoDocumentType, isContractualDocumentType, isPropiedadIntelectualDocumentType, isTramiteGeneralDocumentType } from './caseContext';
import { normalizeUnresolvedFieldMarkers } from './pendingFields';
import { buildDocumentIndex, type DocumentIndex } from './documentIndex';
import { runFastMode } from '@/lib/ai/orchestrator';
import { parseLegalStructure, DetectedSection } from './structuralParser';
import { buildBlockPlan, LegalBlock, BlockPlan } from './blockPlanner';
import { updateJobProgress } from './generationJobs';
import { sanitizeLegalDocument, stripInternalPromptMetadata } from './legalDocumentSanitizer';
import { normalizeMarkdownFormatting, normalizeTitleText } from './markdownNormalizer';
import { CONTESTACION_SECTION_INSTRUCTIONS, REVISION_AMPARO_DIRECTO_SECTION_INSTRUCTIONS, resolveContestacionRoles, getRevisionAmparoDirectoSectionText, formatIndividualAgravio } from './contestacionStructure';
import { DocumentRoutingError, getDocumentTemplate, buildReferenceOnlyDirective, isContestacionType, isDemandContestacionType, isContestacionRevisionAmparoDirectoType } from './documentTemplates';
import { resolveDocumentRouting, type DocumentRoutingResolution } from './documentRouting';
import { buildDocumentPlan } from './documentPlan';
import { runDocumentPreflight } from './documentPreflight';
import { evaluateSourceOutputCompatibility, inferSourceOutputType, type SourceOutputCompatibilityResult } from './sourceOutputCompatibility';
import type { InferredSourceDocumentType } from './sourceDocumentTypes';
import { getDocumentTypeByValue, resolveMatterLabel, resolveJurisdictionLabel, resolveDocumentTypeLabel, serializeTaxonomyForPipeline } from '@/lib/legal-taxonomy';
import { renderPersonalTemplateText } from '@/lib/templates/personalTemplateBuilder';
import { isCivilMercantileResponseDocumentType } from './responseContext';
import { isCivilMercantileEvidenceArgumentDocumentType } from './evidenceArgumentContext';
import { getDocumentStrategy } from './documentStrategies';
import { hasSeedMarkers, stripSeedMarkers, hasUnresolvedFactualDependencies } from './seedMarkers';
import { CoverageMatrix, buildCoverageMatrix, validateCoverageAndPlanInvariants } from './coverageMatrix';
import { buildLegalIssueMatrix, type LegalIssueMatrix } from './legalIssueMatrix';
import { sha256ResearchValue } from './legal-research/canonical';
import { resolveLegalRegime, type LegalRegimeInput } from './legal-research/regimeResolution';
import { buildLegalResearchRequest, normalizeResearchQuery } from './legal-research/researchRequest';
import { verifyAuthorityCandidate, type AuthorityVerificationResult } from './legal-research/authorityVerification';
import { buildLegalResearchBundle } from './legal-research/researchBundle';
import { deriveIssueResearchReadiness } from './legal-research/readiness';
import { createResearchTraceRecorder, researchTraceCandidateFromAuthority, researchTraceVerificationFromAuthority, type LegalResearchTrace } from './legal-research/researchTrace';
import type { LegalResearchProvider } from './legal-research/adapters/types';
import type {
  AuthorityType,
  DerivedIssueReadiness,
  LegalResearchBundle,
  LegalResearchRequest,
  RejectedAuthorityCandidate,
  ResearchClock,
} from './legal-research/types';

export interface LegalResearchOnlyInput {
  caseAnalysis: CaseAnalysis;
  issueMatrix: LegalIssueMatrix;
  provider: LegalResearchProvider;
  regimeInputsByIssue?: Record<string, LegalRegimeInput>;
  legalContextByIssue?: Record<string, LegalRegimeInput>;
  requestedAuthorityTypesByIssue?: Record<string, AuthorityType[]>;
  invokeFinalProvider?: (...args: unknown[]) => unknown;
  clock?: ResearchClock;
}

export interface LegalResearchOnlyResult {
  requests: LegalResearchRequest[];
  bundles: LegalResearchBundle[];
  readiness: DerivedIssueReadiness[];
  trace: LegalResearchTrace[];
}

function researchCitationKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function authorityTypeFromMention(value: string): AuthorityType {
  switch (value) {
    case 'ARTICLE':
    case 'LAW': return 'STATUTE';
    case 'CODE': return 'CODE';
    case 'THESIS': return 'THESIS';
    case 'JURISPRUDENCE': return 'JURISPRUDENCE';
    case 'PRECEDENT': return 'PRECEDENT';
    default: return 'OTHER_OFFICIAL_SOURCE';
  }
}

function rejectedReasonFromAdapter(errorCode?: string): RejectedAuthorityCandidate['reasons'][number] {
  if (errorCode === 'REQUEST_SCOPE_MISMATCH') return 'MISMATCH';
  const known = new Set<RejectedAuthorityCandidate['reasons'][number]>([
    'NOT_FOUND',
    'MISMATCH',
    'OUTDATED',
    'WRONG_JURISDICTION',
    'INSUFFICIENT_METADATA',
    'NON_OFFICIAL_ONLY',
    'NO_PROPOSITION_SUPPORT',
    'ADAPTER_ERROR',
  ]);
  return known.has(errorCode as RejectedAuthorityCandidate['reasons'][number])
    ? errorCode as RejectedAuthorityCandidate['reasons'][number]
    : 'ADAPTER_ERROR';
}

function sourceMentionForCandidate(
  issue: import('./legalIssueMatrix').LegalIssueItem,
  candidate: import('./legal-research/types').AuthorityCandidate,
  authoritiesById: Map<string, import('./case-extraction/types').SourceAuthorityMention>,
): import('./case-extraction/types').SourceAuthorityMention | undefined {
  const mentions = issue.authorityMentionIds
    .map((id) => authoritiesById.get(id))
    .filter((mention): mention is import('./case-extraction/types').SourceAuthorityMention => Boolean(mention));
  const exact = mentions.find((mention) => {
    const mentionCitation = researchCitationKey(mention.citationText);
    return mentionCitation === researchCitationKey(candidate.observedCitation)
      || mentionCitation === researchCitationKey(candidate.canonicalCitationCandidate || candidate.observedCitation);
  });
  return exact || (mentions.length === 1 ? mentions[0] : undefined);
}

function authorityTypesForIssue(
  issue: import('./legalIssueMatrix').LegalIssueItem,
  authoritiesById: Map<string, import('./case-extraction/types').SourceAuthorityMention>,
  explicit?: AuthorityType[],
): AuthorityType[] {
  if (explicit) return [...new Set(explicit)].sort();
  const mentionTypes = issue.authorityMentionIds.flatMap((id) => {
    const type = authoritiesById.get(id)?.authorityType;
    return type ? [authorityTypeFromMention(type)] : [];
  });
  return [...new Set(mentionTypes)].sort();
}

function rejectedCandidate(
  candidate: import('./legal-research/types').AuthorityCandidate,
  reasons: RejectedAuthorityCandidate['reasons'],
  detail: string[],
  clock: ResearchClock,
): RejectedAuthorityCandidate {
  return {
    candidate,
    reasons,
    detail,
    rejectedAt: clock().toISOString(),
  };
}

export async function runLegalResearchOnly(
  input: LegalResearchOnlyInput,
): Promise<LegalResearchOnlyResult> {
  const clock = input.clock || (() => new Date());
  const richAuthorities = input.caseAnalysis.richCaseAnalysis?.authorities || [];
  const authoritiesById = new Map(richAuthorities.map((authority) => [authority.id, authority]));
  const requests: LegalResearchRequest[] = [];
  const bundles: LegalResearchBundle[] = [];
  const readiness: DerivedIssueReadiness[] = [];
  const traces: LegalResearchTrace[] = [];

  for (const issue of input.issueMatrix.issues) {
    if (issue.researchStatus === 'NOT_REQUIRED') {
      readiness.push(deriveIssueResearchReadiness(issue));
      continue;
    }

    const traceRecorder = createResearchTraceRecorder({ clock });
    const regimeInput = input.regimeInputsByIssue?.[issue.id] || input.legalContextByIssue?.[issue.id] || {};
    const regime = await resolveLegalRegime(regimeInput, clock);
    const contextHash = await sha256ResearchValue({
      legalIssueId: issue.id,
      question: issue.question,
      coverageItemIds: issue.coverageItemIds,
      authorityMentionIds: issue.authorityMentionIds,
      regimeResolutionId: regime.id,
      regimeHash: regime.resolutionHash,
    });
    const requestedAuthorityTypes = authorityTypesForIssue(
      issue,
      authoritiesById,
      input.requestedAuthorityTypesByIssue?.[issue.id],
    );
    const request = await buildLegalResearchRequest({
      issue,
      regime,
      contextHash,
      requestedAuthorityTypes,
    }, clock);
    requests.push(request);
    traceRecorder.recordRequest(request, regime);
    const query = await normalizeResearchQuery(request, regime);
    traceRecorder.recordQuery(query);

    const verificationResults: AuthorityVerificationResult[] = [];
    const rejections: RejectedAuthorityCandidate[] = [];
    const richAvailable = Boolean(input.caseAnalysis.richCaseAnalysis);
    let search: Awaited<ReturnType<LegalResearchProvider['search']>> = {
      status: 'FAIL',
      candidates: [],
      errorCode: 'ADAPTER_ERROR',
      reasons: richAvailable ? [] : ['RICH_ANALYSIS_UNAVAILABLE'],
    };

    if (richAvailable) {
      try {
        search = await input.provider.search({ request, query, regime });
      } catch (error) {
        search = {
          status: 'FAIL',
          candidates: [],
          errorCode: 'ADAPTER_ERROR',
          reasons: [error instanceof Error ? error.message : 'ADAPTER_ERROR'],
        };
      }
    }

    traceRecorder.recordAttempt({
      adapterId: input.provider.id,
      outcome: search.status,
      candidateIds: search.candidates.map((candidate) => candidate.id),
      acceptedAuthorityIds: [],
      rejectedCandidateIds: [],
      officialUrls: search.candidates.map((candidate) => candidate.sourceUrl).filter((url): url is string => Boolean(url)),
      sourceHashes: search.candidates.map((candidate) => candidate.evidenceHash).filter((hash): hash is string => Boolean(hash)),
      reasons: search.reasons,
    });

    for (const searchCandidate of search.candidates) {
      traceRecorder.recordCandidate(researchTraceCandidateFromAuthority(searchCandidate));
      let retrieved: Awaited<ReturnType<LegalResearchProvider['retrieve']>>;
      try {
        retrieved = await input.provider.retrieve({ candidateId: searchCandidate.id, requestId: request.id });
      } catch (error) {
        retrieved = {
          status: 'FAIL',
          errorCode: 'ADAPTER_ERROR',
          reasons: [error instanceof Error ? error.message : 'ADAPTER_ERROR'],
        };
      }
      if (retrieved.status !== 'PASS' || !retrieved.candidate || !retrieved.evidence) {
        const reason = rejectedReasonFromAdapter(retrieved.errorCode);
        rejections.push(rejectedCandidate(searchCandidate, [reason], retrieved.reasons, clock));
        traceRecorder.recordVerification({
          candidateId: searchCandidate.id,
          status: 'REJECTED',
          reasons: [reason],
        });
        traceRecorder.recordAttempt({
          adapterId: input.provider.id,
          outcome: 'FAIL',
          candidateIds: [searchCandidate.id],
          acceptedAuthorityIds: [],
          rejectedCandidateIds: [searchCandidate.id],
          officialUrls: searchCandidate.sourceUrl ? [searchCandidate.sourceUrl] : [],
          sourceHashes: searchCandidate.evidenceHash ? [searchCandidate.evidenceHash] : [],
          reasons: retrieved.reasons,
        });
        continue;
      }

      const sourceMention = sourceMentionForCandidate(issue, retrieved.candidate, authoritiesById);
      const candidate = sourceMention && !retrieved.candidate.sourceAuthorityMentionId
        ? { ...retrieved.candidate, sourceAuthorityMentionId: sourceMention.id }
        : retrieved.candidate;
      const verification = await verifyAuthorityCandidate({
        candidate,
        evidence: retrieved.evidence,
        request,
        regime,
        sourceMention,
        proposition: retrieved.proposition,
      }, clock);
      verificationResults.push(verification);
      if (verification.rejection?.candidate) {
        rejections.push(verification.rejection as RejectedAuthorityCandidate);
      }
      traceRecorder.recordVerification(verification.verifiedAuthority
        ? researchTraceVerificationFromAuthority(verification.verifiedAuthority)
        : {
            candidateId: candidate.id,
            status: 'REJECTED',
            reasons: verification.rejection?.reasons || ['ADAPTER_ERROR'],
          });
      traceRecorder.recordAttempt({
        adapterId: input.provider.id,
        outcome: verification.verifiedAuthority ? 'PASS' : 'FAIL',
        candidateIds: [candidate.id],
        acceptedAuthorityIds: verification.verifiedAuthority ? [verification.verifiedAuthority.id] : [],
        rejectedCandidateIds: verification.rejection ? [candidate.id] : [],
        officialUrls: [retrieved.evidence.sourceUrl],
        sourceHashes: [retrieved.evidence.sourceHash],
        reasons: verification.rejection?.reasons || [],
      });
    }

    const bundle = await buildLegalResearchBundle({
      request,
      regime,
      verifications: verificationResults,
      rejections,
      unresolvedQuestions: search.status === 'FAIL' && search.reasons.length > 0 ? search.reasons : [],
    });
    const issueReadiness = deriveIssueResearchReadiness(issue, bundle);
    traceRecorder.recordBundle(bundle, issueReadiness);
    bundles.push(bundle);
    readiness.push(issueReadiness);
    traces.push(traceRecorder.close());
  }

  return { requests, bundles, readiness, trace: traces };
}
import {
  buildGenerationTasksForSection,
  executeGenerationTask,
  assembleSectionBlocks,
  updateCoverageMatrixWithTaskResults,
  applySemanticEvaluationToCoverageMatrix,
  logGenerationPlan,
  logTaskExecution,
} from './generationTasks';
import type { GenerationTask } from './generationTasks';
import { evaluateDocumentSemantics } from './semanticEvaluator';
import { createGenerationTraceContext, hashTraceText, type GenerationTraceContext, type GenerationTraceOptions } from './generationTrace';
import { writeGenerationTraceArtifacts } from './generationTraceReports';
import { getCoverageResolutionBlockReason, isCoverageSatisfied } from './coveragePolicy';
import {
  assembleIssueDraftBlocks,
  buildBlockedIssueOutcome,
  executeReadyIssueTasks,
  isFormalIssueTask,
  resolveEffectiveIssueGenerationEligibility,
  type IssueProviderInvoker,
} from './issueScopedGeneration';
import { assembleLegalDraft } from './documentAssembly';
import { deriveSectionContracts, validateSectionContracts } from './documentSectionContracts';
import { validateDocumentConsistency } from './documentConsistency';
import { validateDocumentEvidence } from './documentEvidence';
import { validateDocumentAuthorities } from './documentAuthority';
import { findDocumentRedundancy } from './documentRedundancy';
import { reconcileDocumentCoverage } from './documentCoverage';
import { decideDocumentAssemblyReadiness, evaluateDocumentAssemblyChecks, type DocumentReadinessInput } from './documentReadiness';
import { runDocumentAssemblyQualityGate } from './documentAssemblyQualityGate';
import type { DocumentAssemblyFinding, DocumentAssemblyResult, DocumentAssemblyQualityGateResult, CoverageReconciliation } from './documentAssemblyTypes';

function jobUpdate(jobId: string | undefined, patch: Record<string, any>): void {
  if (!jobId) return;
  try { updateJobProgress(jobId, patch); } catch {}
}

function getDocumentTypeLabel(routing: DocumentRoutingResolution): string {
  return getDocumentTypeByValue(routing.resolvedTemplate)?.label
    || routing.template.etiquetas[0]
    || routing.resolvedTemplate;
}

/**
 * Applies the result of a non-hierarchical section generation to Coverage.
 * Section text alone is never enough: the block must carry the exact item ID,
 * pass the formal/substantive policy, and avoid unresolved human decisions.
 */
export function applySectionCoverageTransition(
  doc: UniversalLegalDocument,
  section: DocumentNode,
  block: ContentBlock,
  trace?: GenerationTraceContext,
): void {
  const matrix = doc.coverageMatrix;
  if (!matrix) return;

  const linkedIds = new Set(block.coverageItemIds || []);
  for (const item of matrix.items) {
    if (!linkedIds.has(item.id) || !section.coverageItemIds?.includes(item.id)) continue;
    const statusBefore = item.status;
    const resolutionBlockReason = getCoverageResolutionBlockReason(item);
    if (resolutionBlockReason) {
      item.metadata = { ...(item.metadata || {}), coverageStatusReason: resolutionBlockReason };
      continue;
    }
    const evaluation = block.semanticEvaluation;
    const isProceduralPetition = section.type === 'petition'
      && item.category === 'CLAIM'
      && /tenerme\s+por\s+presentad|emplazar|acordar|protesto/i.test(item.description || '');
    const policyItem = isProceduralPetition
      ? { ...item, scope: 'FORMAL' as const, satisfactionPolicy: 'FORMAL_DETERMINISTIC_ALLOWED' as const }
      : item;
    const decision = isProceduralPetition
      ? isCoverageSatisfied(policyItem, [block], evaluation ? [evaluation] : [])
      : isCoverageSatisfied(item, [block], evaluation ? [evaluation] : []);
    item.generatedBlockIds = Array.from(new Set([...(item.generatedBlockIds || []), block.id]));
    if (decision.satisfied) item.status = 'covered';
    else item.metadata = { ...(item.metadata || {}), coverageStatusReason: decision.reason };
    if (trace && (statusBefore !== item.status || !decision.satisfied)) {
      trace.recordCoverageTransition({
        coverageItemId: item.id,
        legalIssueIds: (doc.legalIssueMatrix?.issues || [])
          .filter((issue) => issue.coverageItemIds.includes(item.id))
          .map((issue) => issue.id),
        statusBefore,
        statusAfter: item.status,
        reason: decision.reason,
        taskIds: block.generationTaskId ? [block.generationTaskId] : [],
        draftBlockIds: [block.id],
        evaluationScore: evaluation?.overallScore,
      });
    }
  }

  let pending = 0;
  let generated = 0;
  let covered = 0;
  let weak = 0;
  let unsupported = 0;
  let notApplicable = 0;
  for (const item of matrix.items) {
    if (item.status === 'pending') pending += 1;
    else if (item.status === 'generated') generated += 1;
    else if (item.status === 'covered') covered += 1;
    else if (item.status === 'weak') weak += 1;
    else if (item.status === 'unsupported') unsupported += 1;
    else if (item.status === 'not_applicable') notApplicable += 1;
  }
  matrix.summary.pending = pending;
  matrix.summary.generated = generated;
  matrix.summary.covered = covered;
  matrix.summary.weak = weak;
  matrix.summary.unsupported = unsupported;
  matrix.summary.notApplicable = notApplicable;
}

/** Mapeo rol CaseParty → campo de DocumentParties */
const PARTY_FIELD_BY_ROLE: Record<string, keyof DocumentParties> = {
  actor: 'actor',
  demandado: 'demandado',
  autoridad: 'autoridadResponsable',
  quejoso: 'quejoso',
  apoderado: 'representanteLegal',
  abogado_defensor: 'representanteLegal',
  firmante: 'representanteLegal',
  tercero_interesado: 'terceroInteresado',
};

/**
 * Fusiona las partes confirmadas (CaseParty) sobre las inferidas del texto crudo.
 * Prioridad estricta: manual > detected > inferred. Las de menor prioridad se aplican
 * primero para que las de mayor prioridad las pisen al final.
 */
function applySavedCaseParties(doc: UniversalLegalDocument, savedParties?: PipelineInput['savedParties']): void {
  if (!savedParties || savedParties.length === 0) return;
  const rank = (source?: string) => (source === 'manual' ? 2 : source === 'detected' ? 1 : 0);
  const ordered = [...savedParties]
    .filter((p) => p && typeof p.role === 'string' && typeof p.name === 'string' && p.role.trim() && p.name.trim())
    .sort((a, b) => rank(a.source) - rank(b.source));
  const applied: string[] = [];
  for (const sp of ordered) {
    const field = PARTY_FIELD_BY_ROLE[sp.role.trim()];
    if (!field) continue;
    doc.parties[field] = sp.name.trim();
    applied.push(`${sp.role.trim()}→${field}`);
  }
  if (applied.length > 0) {
    console.log(`[pipeline:parties] Partes confirmadas aplicadas (${applied.length}): ${applied.join(', ')}`);
  }
}

/** Línea de contexto con las partes confirmadas para el prompt por bloque (la IA no debe re-inferirlas).
 *  TODOS los roles se imprimen siempre: los desconocidos se marcan [DATO PENDIENTE] para que
 *  el modelo los vea como campos explícitos y NO sustituya su valor con otra entidad
 *  (p. ej., usar a la autoridad jurisdiccional como parte que contesta).
 *  Formato INLINE K=V;… : datos, no prosa — reduce el eco literal del modelo. */
function buildConfirmedPartiesContext(doc: UniversalLegalDocument): string {
  const p = (key: string, v: string | undefined, label: string) => formatCaseContextField(
    doc.caseContext,
    key,
    v && v.trim() ? v.trim() : `[DATO PENDIENTE DE EXPEDIENTE: ${label}]`,
  );
  return [
    `ROLES PROCESALES (datos; usar tal cual y dejar [DATO PENDIENTE] donde lo esté):`,
    `QUEJOSO=${p('quejoso', doc.parties.quejoso, 'Nombre del quejoso')}; ACTOR=${p('actor', doc.parties.actor, 'Nombre del actor/promovente')}; DEMANDADO=${p('demandado', doc.parties.demandado, 'Nombre del demandado')}; AUTORIDAD RESPONSABLE=${p('autoridadResponsable', doc.parties.autoridadResponsable, 'Autoridad responsable')}; TERCERO=${p('terceroInteresado', doc.parties.terceroInteresado, 'Tercero interesado')}; REPRESENTANTE=${p('representanteLegal', doc.parties.representanteLegal, 'Representante legal')}.`,
    'Cada rol es UNA entidad distinta. PROHIBIDO rellenar un rol pendiente con la AUTORIDAD RESPONSABLE, el tribunal o el juzgado.',
    'PROHIBIDO reproducir este listado de roles dentro del contenido redactado; úsalo solo para asignar nombres a cada posición procesal.',
  ].join('\n');
}

/**
 * FASE 6/9 — Refuerzo determinístico de integridad de roles para CONTESTACIONES.
 * La IA puede variar; la identidad procesal de las secciones formales NO:
 *  - FIRMA: se reconstruye siempre con el nombre de QUIEN CONTESTA (demandado).
 *  - COMPARECENCIA: se eliminan ecos literales del listado de roles del prompt
 *    (metadata interna convertida en contenido por el modelo).
 */
function enforceContestacionRoleIntegrity(
  doc: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis
): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];
  const manualConflictCheckId = 'MANUAL_EDIT_PRESERVED_ROLE_INTEGRITY';
  const recordManualConflict = (section: DocumentNode, operation: string) => {
    const message = `Integridad determinística de roles omitida en ${operation}; se conservó el contenido manual de la sección ${section.id}.`;
    const warning: ValidationIssue = { checkId: manualConflictCheckId, message, sectionId: section.id };
    if (!warnings.some((item) => item.sectionId === warning.sectionId && item.message === warning.message)) {
      warnings.push(warning);
    }
    section.validationWarnings = Array.from(new Set([...(section.validationWarnings || []), message]));
    const trace = doc.generationMetadata.trace || [];
    if (!trace.some((step) => step.stage === 'role_integrity' && step.query === section.id && step.note === message)) {
      const nextStep = trace.reduce((max, step) => Math.max(max, step.step), -1) + 1;
      doc.generationMetadata.trace = [
        ...trace,
        { step: nextStep, stage: 'role_integrity', query: section.id, references: [], note: message },
      ];
    }
  };
  const canRewriteBlock = (section: DocumentNode, block: ContentBlock, operation: string): boolean => {
    if (section.isManuallyEdited || block.isManuallyEdited) {
      recordManualConflict(section, operation);
      return false;
    }
    return true;
  };
  const { contesta } = resolveContestacionRoles(doc, caseAnalysis, (doc as any).caseParties || []);
  const firmaSection = doc.sections.find((s) => s.type === 'signature');
  if (firmaSection) {
    if (firmaSection.isManuallyEdited || firmaSection.content.some((block) => block.isManuallyEdited)) {
      recordManualConflict(firmaSection, 'la reconstrucción determinística de la firma');
    } else {
      firmaSection.content = [
        {
          id: `${firmaSection.id}-rolefix`,
          layer: 'USER_POSITION' as const,
          trustLevel: 'VERIFIED' as const,
          isManuallyEdited: false,
          text: `PROTESTO LO NECESARIO.\nLUGAR Y FECHA: [DATO PENDIENTE DE EXPEDIENTE: Lugar y fecha de presentación]\n\n_________________________________________\n${contesta}`,
        },
      ];
    }
  }
  // La AUTORIDAD RESPONSABLE jamás ocupa el lugar del DEMANDADO en prosa.
  // Neutralización quirúrgica: solo cuando el nombre de la autoridad aparece
  // precedido de contexto "demandad…" dentro de ~90 caracteres.
  const authority =
    doc.parties.autoridadResponsable || caseAnalysis?.parties?.autoridadResponsable || '';
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const authorityAsDemandadoRe = authority
    ? new RegExp(`(demandad[ao][^.\\n]{0,90}?)(?:el\\s+|la\\s+)?${escapeRe(authority)}`, 'gi')
    : null;

  const ECHO_LINE_RE =
    /^\s*[•\-*]?\s*(QUEJOSO|ACTOR\s*\/\s*PARTE\s+PROMOVENTE|ACTOR|DEMANDADO|AUTORIDAD\s+RESPONSABLE|TERCERO(?:\s+INTERESADO)?|REPRESENTANTE\s+LEGAL\s*\/\s*ABOGADO)\s*=/i;

  // Ecos estructurales (FASE 7/11): el modelo puede incrustar mini-documentos
  // con rúbricas canónicas o encabezados completos ("CONTESTACIÓN DE DEMANDA /
  // EXPEDIENTE: … / AUTORIDAD: …") DENTRO del cuerpo de una sección. La
  // estructura la imprime el exportador a partir de los títulos del plan, así
  // que una línea-rúbrica aislada en el cuerpo siempre es espuria. El PROEMIO
  // (header) conserva su propio bloque EXPEDIENTE/AUTORIDAD legítimo.
  const CANONICAL_RUBRICS = new Set(
    [
      'PROEMIO',
      'COMPARECENCIA Y PERSONALIDAD',
      'OBJETO DEL ESCRITO',
      'CONTESTACIÓN DE HECHOS',
      'CONTESTACIÓN DE PRESTACIONES',
      'EXCEPCIONES Y DEFENSAS',
      'PRUEBAS',
      'ALEGATOS',
      'PETITORIOS',
      'FIRMA',
    ].map((t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase())
  );
  const DOC_HEADER_ECHO_RE =
    /^(?:CONTESTACI[OÓ]N\s+DE\s+(?:LA\s+)?DEMANDA[S]?|(?:AUTORIDAD(?:\s+RESPONSABLE)?|MATERIA|PARTES?\s+(?:QUEJOSA|CONFIRMADAS)|TERCERO\s+INTERESADO|REPRESENTANTE(?:\s+LEGAL)?|ABOGADO(?:\s+POSTULANTE)?|EXPEDIENTE)\s*[:=])/i;
  const normLineKey = (l: string) =>
    l.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

  for (const sec of doc.sections) {
    // En 'header' (PROEMIO) se conservan sus líneas propias EXPEDIENTE/AUTORIDAD;
    // las rúbricas canónicas jamás son contenido legítimo de ninguna sección.
    const isHeader = sec.type === 'header';
    const isEchoLine = (l: string) =>
      CANONICAL_RUBRICS.has(normLineKey(l)) || (!isHeader && DOC_HEADER_ECHO_RE.test(l));
    sec.content = sec.content.map((b) => {
      if (!b.text || !b.text.split('\n').some(isEchoLine)) return b;
      if (!canRewriteBlock(sec, b, 'la limpieza de ecos estructurales')) return b;
      const cleaned = b.text
        .split('\n')
        .filter((l) => !isEchoLine(l))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return cleaned.length > 0 ? { ...b, text: cleaned } : b;
    });
    if (sec.type === 'identity') {
      sec.content = sec.content.map((b) => {
        const hasRoleEcho = ECHO_LINE_RE.test(b.text) || /ROLES PROCESALES \(datos/i.test(b.text);
        if (!hasRoleEcho) return b;
        if (!canRewriteBlock(sec, b, 'la limpieza de roles procesales')) return b;
        const cleaned = b.text
          .split('\n')
          .filter((l) => !ECHO_LINE_RE.test(l) && !/ROLES PROCESALES \(datos/i.test(l))
          .join('\n')
          .trim();
        return { ...b, text: cleaned.length > 0 ? cleaned : b.text };
      });
    }
    if (authorityAsDemandadoRe) {
      sec.content = sec.content.map((b) => {
        authorityAsDemandadoRe.lastIndex = 0;
        const hasAuthorityConflict = authorityAsDemandadoRe.test(b.text);
        authorityAsDemandadoRe.lastIndex = 0;
        if (!hasAuthorityConflict || !canRewriteBlock(sec, b, 'la neutralización de autoridad como demandado')) return b;
        return {
          ...b,
          text: b.text.replace(
            new RegExp(authorityAsDemandadoRe.source, 'gi'),
            (_m, pre: string) => `${pre}[DATO PENDIENTE DE EXPEDIENTE: Nombre del demandado]`
          ),
        };
      });
    }
  }
  return warnings;
}

export interface IssuePlan {
  id?: string;
  issueId?: string;
  legalIssueIds?: string[];
  title?: string;
  label?: string;
  targetConsideration?: string;
  constitutionalStandard?: string;
  legalBasis?: string[];
  counterargumentStrategy?: string;
  expectedParagraphs?: number;
  expectedDepth?: 'SHORT' | 'MEDIUM' | 'DEEP' | 'EXTENSIVE';
  authorityIds?: string[]; // CERO INVENTADAS: vacío si no hay en fuentes
  constitutionalArticles?: string[];
  conventionalArticles?: string[];
  evidenceIds?: string[];
  factIds?: string[];
  combatTechnique?: string;
  depth?: 'exhaustive' | 'standard' | 'deep' | string;
  relatedCoverageItemIds?: string[];
}

export interface ClaimPlan {
  id?: string;
  claimId?: string;
  claimNumber?: string;
  title?: string;
  claimText: string;
  contestedStatus?: 'ADMITIDO' | 'NEGADO' | 'INADMISIBLE' | 'IMPROCEDENTE';
  proposedResponse?: string;
  defenseId?: string;
  relatedExceptionIds?: string[];
  legalGrounds?: string[];
  defenseStrategy?: string;
  expectedParagraphs?: number;
  relatedCoverageItemIds?: string[];
}

export interface FactResponsePlan {
  id?: string;
  factId?: string;
  factNumber?: string | number;
  factText: string;
  responseKind?: 'CIERTO' | 'FALSO' | 'SE_IGNORA' | 'NO_ES_HECHO_PROPIO' | 'PARCIALMENTE_CIERTO';
  contestedStatus?: 'uncontested' | 'contested' | 'admitted' | 'denied' | string;
  position?: string;
  explanation?: string;
  clarification?: string;
  supportingEvidenceIds?: string[];
  counterEvidenceIds?: string[];
  relatedCoverageItemIds?: string[];
}

export interface SectionPlan {
  templateSectionId: string;
  title: string;
  objective: string;
  purpose?: string;
  sourceFacts: string[];
  legalIssues: string[];
  historicalReferences: string[];
  expectedDepth: 'SHORT' | 'MEDIUM' | 'DEEP' | 'EXTENSIVE';
  expectedParagraphs: number;
  coverageItemIds?: string[];
  requiredCoverageItemIds?: string[];
  issuePlans?: IssuePlan[];
  claimPlans?: ClaimPlan[];
  factResponsePlans?: FactResponsePlan[];
  authorityIds?: string[];
  counterargumentStrategy?: string;
}

export interface DraftingPlan {
  documentType: string;
  caseTitle: string;
  estimatedPages: number;
  estimatedWords: number;
  sections: SectionPlan[];
  caseTheory?: CaseTheory;
  argumentAxes?: ArgumentAxis[];
  coverageMatrix?: CoverageMatrix;
  legalIssueMatrix?: LegalIssueMatrix;
}

export interface PipelineInput {
  prompt?: string;
  userInstruction?: string;
  sourceDocuments?: UploadedSourceDocument[];
  context?: Record<string, any>;
  existingClassification?: any;
  extraValues?: Record<string, string>;
  targetSection?: string;
  sectionInstruction?: string;
  existingDocument?: UniversalLegalDocument;
  generateSection?: (params: { section: DocumentNode; doc: UniversalLegalDocument }) => Promise<string> | string;
  allowUnvalidatedSource?: boolean;
  warningMode?: boolean;
  lawyerProfile?: LawyerProfile;
  referenceDocumentText?: string;
  referenceDocumentId?: string;
  matter?: string;
  documentTypeLabel?: string;
  /** ID documental canónico elegido explícitamente por la UI; domina la fuente. */
  selectedDocumentType?: string;
  jurisdiction?: string;
  expediente?: string;
  forceAiUnavailable?: boolean;
  idempotencyKey?: string;
  /** Partes confirmadas del expediente (desde CaseParty vía frontend). Prioridad: manual > detected > inferred */
  savedParties?: Array<{ role: string; name: string; source?: string }>;
  /** Taxonomía centralizada (BLOCK C): valores efectivos + custom "Otro" (max 80). Viaja UI→API→pipeline→metadata→export */
  taxonomy?: import('@/lib/legal-taxonomy').LegalTaxonomySelection | null;
  /** Identidad de generación para trazabilidad */
  generationId?: string;
  /** Opciones de trace de desarrollo/auditoría (sin persistencia adicional). */
  traceOptions?: GenerationTraceOptions;
  /** Contexto legal unificado (BLOCK C) */
  legalContext?: Record<string, any>;
  /** Entrada civil explícita; valores no confirmados permanecen pendientes. */
  civilManualInput?: import('./caseContext').CivilDemandManualInput;
  /** Entrada mercantil explícita; solo los valores confirmados por abogado habilitan la vía. */
  commercialManualInput?: import('./commercialEnforcement').CommercialEnforcementManualInput;
  /** Job asíncrono para reporte de progreso real (opcional) */
  jobId?: string;
  workflow?: CaseWorkflow;
  /** Flujo de redacción: Flujo A (DOCUMENT_ANALYSIS) o Flujo B (NEW_WRITING) */
  flow?: 'DOCUMENT_ANALYSIS' | 'NEW_WRITING';
  /** Entrevista estructurada del cliente (Flujo B) */
  intake?: import('./types').WritingIntake;
  /** Seam focal para la generación issue-scoped; no altera el proveedor legacy. */
  issueProviderInvoker?: IssueProviderInvoker;
  maxIssueConcurrency?: number;
  /** Artefactos de investigación verificada; solo se leen durante generación. */
  researchBundlesByIssueId?: ReadonlyMap<string, LegalResearchBundle>;
  derivedReadinessByIssueId?: ReadonlyMap<string, DerivedIssueReadiness>;
}

export function buildLawyerStyleDirective(profile: LawyerProfile): string {
  return [
    'PERFIL DE ESTILO DEL ABOGADO (aplicar únicamente a la forma, nunca inventar hechos):',
    `- Tono preferido: ${profile.preferredTone}`,
    `- Extensión promedio por sección: ${profile.averageSectionLength}`,
    `- Extensión documental: ${profile.preferredDocumentLength}`,
    `- Estilo de citas: ${profile.citationStyle}`,
    `- Orden preferido: ${profile.preferredSectionOrdering.join(' → ') || 'el orden canónico del documento'}`,
    `- Fórmulas recurrentes: ${profile.recurringFormulas.join(' | ') || 'ninguna'}`,
    `- Forma de contestar hechos: ${profile.preferredWayToContestFacts.join(' | ') || 'argumentación técnica y prudente'}`,
    `- Forma de contestar prestaciones: ${profile.preferredWayToContestBenefits.join(' | ') || 'argumentación técnica y prudente'}`,
    `- Forma de peticionar: ${profile.preferredWayToWritePetition.join(' | ') || 'petitorio claro y congruente'}`,
  ].join('\n');
}

function inferSourceDocumentType(sources: UploadedSourceDocument[], _caseAnalysis?: CaseAnalysis): InferredSourceDocumentType {
  // El mismo clasificador tipado se usa para compatibilidad y para la
  // identidad procesal; la fuente nunca puede cambiar el documento elegido.
  const inferred = inferSourceOutputType(sources);
  // Mantener el contrato histórico del metadata de pipeline para sentencias;
  // la compatibilidad fuente→salida conserva el subtipo preciso internamente.
  return inferred === 'SENTENCIA_AMPARO_DIRECTO' ? 'SENTENCIA_O_RESOLUCION' : inferred;
}

export function buildProceduralIdentity(
  doc: UniversalLegalDocument,
  template: ReturnType<typeof getDocumentTemplate>,
  sources: UploadedSourceDocument[],
  caseAnalysis?: CaseAnalysis
): ProceduralIdentity {
  const sourceAuthority = caseAnalysis?.proceduralAuthorities?.sourceAuthority
    || caseAnalysis?.parties?.autoridadResponsable
    || doc.parties?.autoridadResponsable;
  const organoResolucionRecurrida = caseAnalysis?.proceduralAuthorities?.organoResolucionRecurrida;
  const autoridadDestinataria = doc.parties?.autoridadDestinataria || template.destinatario;
  const organoPresentacion = caseAnalysis?.proceduralAuthorities?.organoPresentacion
    || (template.presentacionPor === 'ORGANO_RESOLUCION_RECURRIDA'
      ? organoResolucionRecurrida
      : undefined);

  return {
    matter: doc.matter || template.materia,
    jurisdiction: doc.jurisdiction || template.jurisdiccion,
    procedure: template.procedimiento,
    sourceDocumentType: inferSourceDocumentType(sources, caseAnalysis),
    sourceAuthority,
    organoResolucionRecurrida,
    autoridadDestinataria,
    organoPresentacion,
    representedParty: template.rolAutor,
    proceduralPosition: template.rolAutor,
    targetDocument: template.tipo,
    objective: template.objetivoProcesal,
  };
}

function positionLabel(position: FactPosition | undefined): string {
  switch (position) {
    case 'ADMIT': return 'SE ADMITE';
    case 'DENY': return 'SE NIEGA';
    case 'PARTIAL': return 'SE ADMITE PARCIALMENTE';
    case 'NOT_KNOWN': return 'NO SE TIENE POR CONFIRMADO';
    case 'UNDEFINED': return '[REQUIERE DEFINIR POSTURA DEL ABOGADO]';
    case 'ACCEPT': return 'SE ACEPTA';
    case 'OPPOSE': return 'SE OPONE';
    case 'IGNORE_PERSONAL_KNOWLEDGE': return 'NO LE CONSTA AL DEMANDADO';
    case 'REQUIRE_LAWYER_INPUT': return '[REQUIERE DEFINIR POSTURA DEL ABOGADO]';
    default: return '[REQUIERE DEFINIR POSTURA DEL ABOGADO]';
  }
}

function shouldIncludeAlegatos(input: PipelineInput): boolean {
  const requested = `${input.userInstruction || ''} ${input.documentTypeLabel || ''}`;
  const explicitTemplate = input.workflow?.selection.mode !== 'automatic' && /alegato/i.test(input.referenceDocumentText || '');
  return /alegato/i.test(requested) || explicitTemplate;
}

function buildFactResponseText(caseAnalysis?: CaseAnalysis): string {
  const facts = caseAnalysis?.facts || [];
  if (!facts.length) return '[DATO PENDIENTE DE EXPEDIENTE: No se identificaron hechos numerados para contestar]';
  return facts.map((fact) => {
    const sourceFact = fact.sourceFact || fact.text;
    const reference = fact.sourceReference || { documentId: fact.documentId || 'fuente-no-identificada', page: fact.page };
    const canonicalPosition = fact.lawyerPosition || (
      fact.position === 'IGNORE_PERSONAL_KNOWLEDGE' ? 'NOT_KNOWN' :
      fact.position === 'REQUIRE_LAWYER_INPUT' || fact.position === 'UNDETERMINED' ? 'UNDEFINED' : fact.position
    );
    const response = fact.lawyerObservation?.trim() || fact.manualResponse?.trim() || (
      canonicalPosition === 'UNDEFINED' ? '[REQUIERE DEFINIR POSTURA DEL ABOGADO]' : positionLabel(canonicalPosition)
    );
    const support = fact.support?.length ? fact.support.join('; ') : '[SIN SUSTENTO ADICIONAL CONFIRMADO]';
    return [
      `AL HECHO ${fact.number}.- ${fact.number}. ${sourceFact} (afirmado por la parte actora)`,
      `POSTURA PROCESAL: ${positionLabel(canonicalPosition)}`,
      `RAZÓN Y RESPUESTA: ${canonicalPosition === 'UNDEFINED' ? '[REQUIERE DEFINIR POSTURA DEL ABOGADO]' : response}`,
      `SUSTENTO DISPONIBLE: ${support}`,
      `FUENTE: ${reference.documentId}${reference.page ? ` · página ${reference.page}` : ''}.`,
    ].join('\n');
  }).join('\n\n');
}

function buildClaimResponseText(caseAnalysis?: CaseAnalysis): string {
  const claims: AnalyzedClaim[] = caseAnalysis?.claimResponses?.length
    ? caseAnalysis.claimResponses
    : (caseAnalysis?.claims || []).map((text, index) => ({ id: `claim-${index + 1}`, number: String(index + 1), text, position: 'REQUIRE_LAWYER_INPUT' as const }));
  if (!claims.length) return '[DATO PENDIENTE DE EXPEDIENTE: No se identificaron prestaciones reclamadas]';
  return claims.map((claim) => {
    const canonicalPosition = claim.lawyerPosition || (
      claim.position === 'ACCEPT' || claim.position === 'OPPOSE' || claim.position === 'PARTIAL' ? claim.position : 'UNDEFINED'
    );
    const response = claim.lawyerObservation?.trim() || claim.generatedResponse?.trim() || claim.response?.trim();
    return [
    `PRESTACIÓN ${claim.number}.- La parte actora reclama: "${claim.text}"`,
    `POSTURA: ${canonicalPosition === 'UNDEFINED' ? '[REQUIERE DEFINIR POSTURA DEL ABOGADO]' : positionLabel(canonicalPosition)}`,
    `RESPUESTA: ${canonicalPosition === 'UNDEFINED' ? '[REQUIERE INSTRUCCIÓN DEL ABOGADO]' : response || positionLabel(canonicalPosition)}`,
    `FUNDAMENTO DISPONIBLE: ${claim.support?.join('; ') || '[SIN SUSTENTO ADICIONAL CONFIRMADO]'}`,
    claim.sourceReference ? `FUENTE: ${claim.sourceReference.documentId}${claim.sourceReference.page ? ` · página ${claim.sourceReference.page}` : ''}.` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

export interface PipelineCallbacks {
  onStageStart?: (stage: PipelineStage, doc: UniversalLegalDocument) => void;
  onStageComplete?: (stage: PipelineStage, doc: UniversalLegalDocument) => void;
  onError?: (error: any, stage: PipelineStage, doc: UniversalLegalDocument) => void;
  /** Nuevo: progreso por bloque jurídico (no rompe compatibilidad) */
  onBlockProgress?: (current: number, total: number, block: LegalBlock) => void;
  onBlockComplete?: (completed: number, total: number, block: LegalBlock, meta: { aiUsed: boolean; aiProvider?: string | null; fallback: boolean }) => void;
  onProgressMessage?: (message: string) => void;
  onTraceReady?: (trace: import('./generationTrace').GenerationTrace, doc: UniversalLegalDocument) => void | Promise<void>;
}

export function sanitizeGeneratedText(
  rawText: string,
  _context?: { parties?: DocumentParties; caseRefs?: CaseReferences }
): string {
  let result = rawText;

  // Markdown de la IA → texto limpio EN LA FUENTE (editor, borradores y
  // exportaciones reciben texto ya sin sintaxis). Preserva redacciones *****.
  result = normalizeMarkdownFormatting(result);
  result = normalizeUnresolvedFieldMarkers(result);

  result = result.replace(/\[NOMBRE\s+COMPLETO[^\]]*\]/gi, '[DATO PENDIENTE DE EXPEDIENTE: Nombre del quejoso / promovente]');
  result = result.replace(/\[NOMBRE\s+DE\s+LA\s+DEPENDENCIA[^\]]*\]/gi, '[DATO PENDIENTE DE EXPEDIENTE: Autoridad responsable]');
  result = result.replace(/\[NÚMERO\s+DE\s+EXPEDIENTE\]/gi, '[DATO PENDIENTE DE EXPEDIENTE: Número de expediente]');
  result = result.replace(/\[SALA\s+CORRESPONDIENTE[^\]]*\]/gi, '[DATO PENDIENTE DE EXPEDIENTE: Órgano jurisdiccional competente]');
  result = result.replace(/\[DESCRIBIR\s+PRETENSIONES[^\]]*\]/gi, '[DATO PENDIENTE DE EXPEDIENTE: Descripción de pretensiones]');
  result = result.replace(/\[FECHA\s+DE\s+NOTIFICACI[ÓO]N[^\]]*\]/gi, '[DATO PENDIENTE DE EXPEDIENTE: Fecha de notificación]');

  result = result.replace(/(tesis\s+sin\s+registro|criterio\s+no\s+publicado)/gi, '[NO VERIFICADO: $1]');

  return result;
}

/**
 * Construye el plan de redacción jurídico fundado en el análisis del caso y en la teoría jurídica
 */
export function buildDraftingPlan(
  doc: UniversalLegalDocument,
  referenceLength: number = 0,
  caseAnalysis?: CaseAnalysis,
  coverageMatrixOverride?: CoverageMatrix,
  legalIssueMatrixOverride?: LegalIssueMatrix,
): DraftingPlan {
  const isDeep = referenceLength > 12000;
  const isRich = Boolean(caseAnalysis?.richCaseAnalysis);
  const coverageMatrix = coverageMatrixOverride || doc.coverageMatrix || (caseAnalysis ? buildCoverageMatrix(caseAnalysis, doc, doc.sections) : undefined);
  const legalIssueMatrix = legalIssueMatrixOverride || doc.legalIssueMatrix || (caseAnalysis && coverageMatrix
    ? buildLegalIssueMatrix({ caseAnalysis, coverageMatrix })
    : undefined);
  const isContestacion = isContestacionType(doc.documentType) || /contestaci[oó]n/i.test(doc.documentTypeLabel || doc.documentType);

  const hasRichIssueMaterialization = legalIssueMatrix?.sourceMode === 'RICH' && legalIssueMatrix.issues.length > 0;
  const allAnalysisIssues = isRich && hasRichIssueMaterialization ? [] : [
    ...(caseAnalysis?.proceduralPosture?.constitutionalIssues || []),
    ...(caseAnalysis?.proceduralPosture?.legalityIssues || []),
    ...((caseAnalysis?.legalIssues || []).filter(
      (li) => !caseAnalysis?.proceduralPosture?.constitutionalIssues?.some((ci) => ci.id === li.id) &&
              !caseAnalysis?.proceduralPosture?.legalityIssues?.some((l2) => l2.id === li.id)
    )),
  ];

  const sections: SectionPlan[] = doc.sections.map((sec) => {
    let expectedDepth: SectionPlan['expectedDepth'] = 'MEDIUM';
    let expectedParagraphs = 2;

    if (sec.type === 'header' || sec.type === 'closing' || sec.type === 'signature') {
      expectedDepth = 'SHORT';
      expectedParagraphs = 1;
    } else if (sec.type === 'identity' || sec.type === 'evidence') {
      expectedDepth = 'MEDIUM';
      expectedParagraphs = 3;
    } else if (sec.type === 'background' || sec.type === 'legal_grounds') {
      expectedDepth = isDeep ? 'DEEP' : 'MEDIUM';
      expectedParagraphs = isDeep ? 6 : 4;
    } else if (sec.type === 'argument') {
      expectedDepth = isDeep ? 'EXTENSIVE' : 'DEEP';
      expectedParagraphs = isDeep ? 8 : 5;
    }

    // Cobertura específica vinculada a esta sección
    const matchedCovItems = coverageMatrix?.items.filter((item) => isRich
      ? (item.targetSectionIds.includes(sec.id) || sec.coverageItemIds?.includes(item.id))
      : item.targetSectionIds.includes(sec.id) ||
        (sec.type === 'argument' && (item.category === 'LEGAL_ISSUE' || item.category === 'CONSTITUTIONAL_ISSUE' || item.category === 'CHALLENGED_REASONING')) ||
        (sec.type === 'background' && item.category === 'FACT') ||
        (sec.type === 'evidence' && item.category === 'EVIDENCE') ||
        (sec.type === 'petition' && item.category === 'REQUESTED_RELIEF') ||
        (/prestaci|pretensi/i.test(sec.title) && item.category === 'CLAIM')
    ) || [];
    const coverageItemIds = Array.from(new Set(matchedCovItems.map((item) => item.id)));

    // Problemas jurídicos reales (Eliminado legalIssues: [sec.title] - 3L)
    let legalIssues: string[] = [];
    let issuePlans: IssuePlan[] = [];
    let counterargumentStrategy: string | undefined;
    const isPrestacionesSec = /prestaci|pretensi/i.test(sec.title);
    const isHechosSec = /hecho|antecedente/i.test(sec.title);
    const isArgumentOrAgravio = !isPrestacionesSec && !isHechosSec && (sec.type === 'argument' || /agravio|concepto.*violaci/i.test(sec.title));
    const richIssuesForSection = (legalIssueMatrix?.issues || [])
      .filter((issue) => issue.coverageItemIds.some((id) => coverageItemIds.includes(id)));
    if (isArgumentOrAgravio && isRich && richIssuesForSection.length > 0) {
      const richIssues = richIssuesForSection;
      legalIssues = richIssues.map((issue) => issue.question);
      issuePlans = richIssues.map((issue) => {
        const matchingCoverageIds = issue.coverageItemIds.filter((id) => coverageItemIds.includes(id));
        return {
          id: `plan-issue-${issue.id}`,
          issueId: issue.id,
          legalIssueIds: [issue.id],
          title: issue.question,
          legalBasis: [],
          expectedParagraphs: isDeep ? 6 : 4,
          expectedDepth: isDeep ? 'EXTENSIVE' : 'DEEP',
          authorityIds: [],
          evidenceIds: [...issue.evidenceMentionIds, ...issue.evidenceOfferIds],
          factIds: [...issue.factIds],
          relatedCoverageItemIds: matchingCoverageIds,
        };
      });
      if (issuePlans.length > 0) {
        expectedParagraphs = Math.max(expectedParagraphs, issuePlans.reduce((acc, ip) => acc + (ip.expectedParagraphs || 0), 0));
      }
    } else if (isArgumentOrAgravio && (!isRich || !hasRichIssueMaterialization)) {
      let relevantIssues = allAnalysisIssues;
      const secNumMatch = sec.title.match(/(?:PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO|SEXTO|SÉPTIMO|OCTAVO|NOVENO|DÉCIMO|\d+)/i);
      if (secNumMatch && allAnalysisIssues.length > 1) {
        const wordToNum: Record<string, number> = {
          primer: 0, primero: 0, '1': 0,
          segundo: 1, '2': 1,
          tercer: 2, tercero: 2, '3': 2,
          cuarto: 3, '4': 3,
          quinto: 4, '5': 4,
          sexto: 5, '6': 5,
        };
        const idx = wordToNum[secNumMatch[0].toLowerCase()] ?? -1;
        if (idx >= 0 && idx < allAnalysisIssues.length) {
          relevantIssues = [allAnalysisIssues[idx]];
        }
      }

      legalIssues = relevantIssues.map((i) => i.title);
      issuePlans = relevantIssues.map((issue, idx) => {
        const matchingCov = matchedCovItems.find((ci) => ci.id === `cov-issue-${issue.id}`);
        return {
          id: `plan-issue-${issue.id || idx + 1}`,
          issueId: issue.id,
          title: issue.title,
          targetConsideration: issue.challengedAct || undefined,
          constitutionalStandard: issue.parameter || undefined,
          legalBasis: issue.parameter ? [issue.parameter] : [],
          counterargumentStrategy: issue.contradiction
            ? `Refutar la consideración combatida acreditando: ${issue.contradiction}`
            : 'Demostrar la indebida fundamentación y motivación del acto recurrido.',
          expectedParagraphs: isDeep ? 6 : 4,
          expectedDepth: isDeep ? 'EXTENSIVE' : 'DEEP',
          authorityIds: [], // CERO INVENTADAS: vacío si no hay en fuentes
          relatedCoverageItemIds: matchingCov ? [matchingCov.id] : [],
        };
      });

      if (issuePlans.length > 0) {
        counterargumentStrategy = issuePlans[0].counterargumentStrategy;
        expectedParagraphs = Math.max(expectedParagraphs, issuePlans.reduce((acc, ip) => acc + (ip.expectedParagraphs || 0), 0));
      }
    }

    // Planes específicos por pretensión para contestaciones (3G & 3N)
    let claimPlans: ClaimPlan[] = [];
    if (/prestaci|pretensi/i.test(sec.title)) {
      if (isRich) {
        const richClaims = caseAnalysis?.richCaseAnalysis?.claims || [];
        claimPlans = richClaims
          .filter((claim) => matchedCovItems.some((item) => item.category === 'CLAIM_RESPONSE' && item.claimIds?.includes(claim.id)))
          .map((claim, idx) => {
            const matchingCov = matchedCovItems.find((item) => item.category === 'CLAIM_RESPONSE' && item.claimIds?.includes(claim.id));
            return {
              id: `plan-claim-${claim.id}`,
              claimId: claim.id,
              claimNumber: String(idx + 1),
              claimText: claim.requestedRelief,
              expectedParagraphs: 2,
              relatedCoverageItemIds: matchingCov ? [matchingCov.id] : [],
            };
          });
      } else if (caseAnalysis?.claimResponses && caseAnalysis.claimResponses.length > 0) {
        claimPlans = caseAnalysis.claimResponses.map((claim) => {
          const matchingCov = matchedCovItems.find((ci) => ci.relatedClaimIds?.includes(claim.id));
          return {
            id: `plan-claim-${claim.id}`,
            claimId: claim.id,
            claimNumber: claim.number,
            claimText: claim.text,
            contestedStatus: 'IMPROCEDENTE',
            legalGrounds: ['Disposiciones aplicables a la controversia'],
            defenseStrategy: `Controvertir la procedencia de la prestación ${claim.number} por carecer de supuestos fácticos y normativos.`,
            expectedParagraphs: 2,
            relatedCoverageItemIds: matchingCov ? [matchingCov.id] : [],
          };
        });
      } else if (caseAnalysis?.claims && caseAnalysis.claims.length > 0) {
        claimPlans = caseAnalysis.claims.map((claimText, idx) => {
          const claimNum = String.fromCharCode(65 + idx);
          const claimId = `claim-${idx + 1}`;
          const matchingCov = matchedCovItems.find((ci) => ci.id.includes(claimId) || ci.sourceId === claimId);
          return {
            id: `plan-claim-${claimId}`,
            claimId,
            claimNumber: claimNum,
            claimText,
            contestedStatus: 'IMPROCEDENTE',
            legalGrounds: ['Disposiciones aplicables a la controversia'],
            defenseStrategy: `Controvertir la procedencia de la prestación ${claimNum} por carecer de supuestos fácticos y normativos.`,
            expectedParagraphs: 2,
            relatedCoverageItemIds: matchingCov ? [matchingCov.id] : [],
          };
        });
      }
      if (claimPlans.length > 0) {
        expectedParagraphs = Math.max(expectedParagraphs, claimPlans.reduce((acc, cp) => acc + (cp.expectedParagraphs || 0), 0));
      }
    }

    // Planes específicos de respuesta a hechos para contestaciones (3H & 3N)
    let factResponsePlans: FactResponsePlan[] = [];
    if (isContestacion && /hecho/i.test(sec.title)) {
      if (isRich) {
        const richFacts = caseAnalysis?.richCaseAnalysis?.facts || [];
        factResponsePlans = richFacts
          .filter((fact) => matchedCovItems.some((item) => item.category === 'FACT_RESPONSE' && item.factIds?.includes(fact.id)))
          .map((fact, idx) => {
            const matchingCov = matchedCovItems.find((item) => item.category === 'FACT_RESPONSE' && item.factIds?.includes(fact.id));
            const supportingEvidenceIds = (caseAnalysis?.richCaseAnalysis?.evidenceMentions || [])
              .filter((mention) => mention.relatedFactIds.includes(fact.id))
              .map((mention) => mention.id);
            return {
              id: `plan-fact-${fact.id}`,
              factId: fact.id,
              factNumber: String(idx + 1),
              factText: fact.proposition,
              supportingEvidenceIds,
              relatedCoverageItemIds: matchingCov ? [matchingCov.id] : [],
            };
          });
      } else {
        const facts = caseAnalysis?.facts || [];
        factResponsePlans = facts.map((fact) => {
          const matchingCov = matchedCovItems.find((ci) => ci.relatedFactIds?.includes(fact.id));
          return {
            id: `plan-fact-${fact.id}`,
            factId: fact.id,
            factNumber: fact.number,
            factText: fact.text,
            responseKind: fact.actor === 'DEMANDADO' ? 'CIERTO' : 'SE_IGNORA',
            clarification: `Se fija postura técnica respecto al correlativo ${fact.number} de la demanda.`,
            supportingEvidenceIds: (fact as any).relatedEvidenceIds || [],
            relatedCoverageItemIds: matchingCov ? [matchingCov.id] : [],
          };
        });
      }
      if (factResponsePlans.length > 0) {
        expectedParagraphs = Math.max(expectedParagraphs, factResponsePlans.length);
      }
    }

    return {
      templateSectionId: sec.id,
      title: sec.title,
      objective: `Desarrollar jurídicamente ${sec.title} con fundamento en las constancias del expediente`,
      sourceFacts: isRich
        ? (caseAnalysis?.richCaseAnalysis?.facts || []).map((fact) => fact.proposition)
        : caseAnalysis?.facts?.length
          ? caseAnalysis.facts.map((fact) => `${fact.number}: ${fact.text}`)
          : caseAnalysis?.proceduralTimeline.map((e) => `${e.date}: ${e.event}`) || [],
      legalIssues,
      historicalReferences: [],
      expectedDepth,
      expectedParagraphs,
      coverageItemIds: coverageItemIds.length > 0 ? coverageItemIds : undefined,
      issuePlans: issuePlans.length > 0 ? issuePlans : undefined,
      claimPlans: claimPlans.length > 0 ? claimPlans : undefined,
      factResponsePlans: factResponsePlans.length > 0 ? factResponsePlans : undefined,
      authorityIds: [], // CERO INVENTADAS
      counterargumentStrategy,
    };
  });

  const estimatedParagraphs = sections.reduce((acc, s) => acc + s.expectedParagraphs, 0);
  const estimatedWords = estimatedParagraphs * 85;
  const estimatedPages = Math.max(1, Math.ceil(estimatedWords / 250));

  return {
    documentType: doc.documentTypeLabel,
    caseTitle: doc.title,
    estimatedPages,
    estimatedWords,
    sections,
    caseTheory: isRich ? undefined : caseAnalysis?.caseTheory,
    argumentAxes: isRich ? undefined : caseAnalysis?.argumentAxes,
    coverageMatrix,
    legalIssueMatrix,
  };
}

/**
 * NUEVA: Genera un bloque jurídico con contexto rico (reutiliza índice una sola vez)
 */
export async function generateLegalBlock(
  block: LegalBlock,
  doc: UniversalLegalDocument,
  index: DocumentIndex,
  caseAnalysis: CaseAnalysis | undefined,
  instruction: string | undefined,
  customGenerator: PipelineInput['generateSection'] | undefined,
  lawyerProfile: LawyerProfile,
  sectionPlan?: SectionPlan
): Promise<{ text: string; warnings: string[]; sources?: GeneratedSourceReference[]; aiUsed?: boolean; aiProvider?: string; aiModel?: string; aiError?: string; finishReason?: string | null; isTruncated?: boolean; fallbackUsed?: boolean }> {
  // Si el bloque no requiere IA, preservarlo directamente (fallback determinístico sin llamada)
  if (!block.requiresAi) {
    const hasSeed = hasSeedMarkers(block.text);
    // Preservar contenido original si existe y no es semilla, o generar determinísticamente
    const preserved = hasSeed ? buildDeterministicBlockText(block, doc, caseAnalysis) : (block.text.trim() ? block.text.trim() : buildDeterministicBlockText(block, doc, caseAnalysis));
    const styled = applyStyleToSectionText(block.sectionType as any, preserved, lawyerProfile);
    return { text: sanitizeGeneratedText(styled), warnings: [], sources: [], aiUsed: false, finishReason: 'stop', isTruncated: false, fallbackUsed: false };
  }

  // Si hay generador custom (ej. tests), delegar
  if (customGenerator) {
    // Adaptar LegalBlock a DocumentNode para compatibilidad
    const fakeSection: DocumentNode = {
      id: block.id,
      type: block.sectionType,
      title: block.title,
      order: block.order,
      content: [{ id: `blk-${block.id}`, text: block.text, layer: 'SOURCE_FACT', trustLevel: 'VERIFIED' } as ContentBlock],
      isRepeatable: false,
      isEditable: true,
      isGenerated: false,
      isManuallyEdited: false,
      variables: [],
      validationErrors: [],
      validationWarnings: [],
      generationInstruction: instruction,
    };
    const customText = await customGenerator({ section: fakeSection, doc });
    return { text: sanitizeGeneratedText(String(customText)), warnings: [], aiUsed: true, aiProvider: 'custom', finishReason: 'stop', isTruncated: false, fallbackUsed: false };
  }

  const quejosoName = doc.parties.quejoso || doc.parties.actor || caseAnalysis?.parties?.quejoso || '[DATO PENDIENTE DE EXPEDIENTE: Nombre del quejoso]';
  const autoridadName = doc.parties.autoridadResponsable || caseAnalysis?.parties?.autoridadResponsable || '[DATO PENDIENTE DE EXPEDIENTE: Autoridad responsable]';
  const expedienteNum = doc.caseRefs.expediente || caseAnalysis?.caseNumbers?.principal || '[DATO PENDIENTE DE EXPEDIENTE: Número de expediente]';

  // Construir contexto rico reutilizando el índice (NO reconstruir todo el documento por bloque)
  const blockContext = buildBlockGenerationContext(block, index, caseAnalysis);

  const hasAiKey = Boolean(process.env.NVIDIA_API_KEY && process.env.NVIDIA_API_KEY.trim());

  let rawText = '';
  let aiUsed = false;
  let aiProvider: string | undefined;
  let aiModel: string | undefined;
  let aiError: string | undefined;
  let finishReason: string | null = null;
  let isTruncated = false;
  let fallbackUsed = false;

  // En escritura desde cero la primera versión no tiene corpus autorizado:
  // conserva el mismo pipeline, pero no permite que el proveedor fabrique ley,
  // citas o hechos para llenar huecos.
  if (hasAiKey && doc.flow !== 'NEW_WRITING') {
    try {
      const ctxFacts = block.context?.facts?.join('\n')
        || caseAnalysis?.facts?.map((fact) => `${fact.number}: ${fact.text}`).join('\n')
        || caseAnalysis?.proceduralTimeline.map(e => `${e.date}: ${e.event}`).join('\n')
        || 'Hechos según constancias del expediente.';
      const ctxNorms = block.context?.norms?.join(', ') || caseAnalysis?.caseTheory?.constitutionalTheory || '[NO HAY FUNDAMENTO LEGAL CONFIRMADO]';
      const ctxJuris = block.context?.jurisprudence?.join('; ') || '';
      const confirmedParties = buildConfirmedPartiesContext(doc);
      const lawyerStyleDirective = buildLawyerStyleDirective(lawyerProfile);
      // FASE 15: TODO el encuadre (fuente REFERENCE_ONLY, tipo, rol, destinatario,
      // estructura y prohibiciones) proviene del DocumentTemplate — nada hardcodeado.
      const docTemplate = getDocumentTemplate(doc.documentType, doc.documentTypeLabel);
      const referenceDirective = buildReferenceOnlyDirective(docTemplate);
      const identity = doc.proceduralIdentity || buildProceduralIdentity(doc, docTemplate, [], caseAnalysis);
      const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const sectionFacts = /hechos/.test(titleKey) ? buildFactResponseText(caseAnalysis) : ctxFacts;
      const sectionClaims = /prestacion|pretension/.test(titleKey) ? buildClaimResponseText(caseAnalysis) : '';
      const sourceContext = sectionClaims || sectionFacts;
      const isContestacion = isContestacionType(doc.documentType, doc.documentTypeLabel);

      const prompt = `${docTemplate.vozPrompt}
Redacta el bloque jurídico "${block.title}" (tipo: ${block.kind} / ${block.sectionType}) para el documento judicial: "${doc.documentTypeLabel}".

${referenceDirective}

IDENTIDAD PROCESAL (no modificar ni inferir otra):
materia: ${identity.matter}
jurisdicción: ${identity.jurisdiction}
procedimiento: ${identity.procedure}
tipo de documento fuente: ${identity.sourceDocumentType}
parte representada: ${identity.representedParty}
posición procesal: ${identity.proceduralPosition}
escrito objetivo: ${identity.targetDocument}
objetivo procesal: ${identity.objective}

EXPEDIENTE: ${expedienteNum}
AUTORIDAD: ${autoridadName}
PARTE QUEJOSA/PROMOVENTE: ${quejosoName}
MATERIA: ${doc.matter || 'General'}
JURISDICCIÓN: ${doc.jurisdiction || 'General'}
${confirmedParties ? `\nPARTES CONFIRMADAS DEL EXPEDIENTE (usar EXACTAMENTE estos nombres y roles; NO los infieras del texto):\n${confirmedParties}\n` : ''}
${lawyerStyleDirective}
OBJETIVO DEL BLOQUE: ${sectionPlan?.objective || `Desarrollar jurídicamente ${block.title}`}
TIPO DE BLOQUE: ${block.kind} (nivel ${block.level})
CONTEXTO ANTERIOR: ${block.context?.previousBlockTitle || '—'}
CONTEXTO POSTERIOR: ${block.context?.nextBlockTitle || '—'}

TEORÍA DEL CASO:
${caseAnalysis?.caseTheory?.factualTheory || 'Controversia derivada de los autos del expediente.'}
${caseAnalysis?.caseTheory?.legalTheory || ''}
${caseAnalysis?.caseTheory?.constitutionalTheory || ''}

HECHOS RELEVANTES PARA ESTE BLOQUE:
${sourceContext}

NORMAS Y PARÁMETRO CONSTITUCIONAL:
${ctxNorms}
${ctxJuris ? `JURISPRUDENCIA RELEVANTE: ${ctxJuris}` : ''}

TEXTO ORIGINAL DEL BLOQUE (preservar hechos y estructura):
${block.text}

FRAGMENTOS DEL EXPEDIENTE RECUPERADOS (contexto relevante, con referencia de página):
${blockContext.text}

INSTRUCCIÓN ADICIONAL: ${instruction || 'Desarrollar con exhaustividad y técnica forense mexicana.'}

REGLAS OBLIGATORIAS:
1. NO inventes hechos, fechas, autoridades ni jurisprudencia que no consten en las fuentes.
2. Si un dato no está disponible, utiliza estrictamente: [DATO PENDIENTE DE EXPEDIENTE].
3. Aplica contraste riguroso con la resolución impugnada ("El Tribunal sostuvo... Sin embargo... El problema constitucional radica en... Por tanto...").
4. Mantén redacción forense mexicana formal, técnica y persuasiva sin relleno.
5. Concluye el bloque con una consecuencia jurídica clara.
6. PROHIBIDO usar Markdown: nada de **asteriscos**, *cursivas*, #encabezados ni viñetas "-". Los títulos o rúbricas van SOLO EN MAYÚSCULAS, sin símbolos.
7. NO reproduzcas etiquetas internas de este encabezado (OBJETIVO DEL BLOQUE, TIPO DE BLOQUE, CONTEXTO ANTERIOR, CONTEXTO POSTERIOR, TEORÍA DEL CASO, TEXTO ORIGINAL DEL BLOQUE). Redacta únicamente el contenido jurídico del bloque.
8. Conserva INTACTAS las redacciones del expediente (corridas de asteriscos *****) y los marcadores [DATO PENDIENTE DE EXPEDIENTE]; jamás intentes deducir ni sustituir su contenido.
9. Respeta EXACTAMENTE los roles procesales de PARTES CONFIRMADAS: no transformes actor en demandado, autoridad responsable en demandada, ni atribuyas a una parte las actuaciones de otra.
10. PROHIBICIONES DEL TIPO "${doc.documentTypeLabel}": ${[...new Set([...docTemplate.prohibiciones, ...docTemplate.reglas])].join(' ')}
11. Eres un asistente de redacción jurídica: produces un BORRADOR sujeto a revisión profesional. No tomes decisiones procesales delicadas sin instrucciones.
12. No inventes hechos, pruebas, partes, datos, jurisprudencia ni posiciones. Distingue información confirmada, inferida y pendiente; usa [DATO PENDIENTE DE EXPEDIENTE] o [REQUIERE INSTRUCCIÓN DEL ABOGADO] cuando corresponda.
13. ${isContestacion ? 'En una contestación, cada hecho y prestación debe tener una respuesta identificable. Nunca copies un hecho de la demanda como afirmación propia: usa AL HECHO y expresa la postura.' : 'Respeta la función específica de este bloque y no reutilices párrafos de otras secciones.'}

Escribe el bloque completo con desarrollo argumentativo exhaustivo.`;

      const SECTION_TIMEOUT_MS = Number(process.env.SECTION_AI_TIMEOUT_MS) || 30000;

      const aiPromise = runFastMode({
        systemPrompt: 'Eres el Motor Forense de Análisis y Redacción Jurídica de Jurídico Radar. Trabajas por bloques jurídicos, no por fragmentos aislados.',
        userMessage: prompt,
        mode: 'fast',
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout de IA por bloque (${SECTION_TIMEOUT_MS}ms)`)), SECTION_TIMEOUT_MS)
      );

      const aiRes = await Promise.race([aiPromise, timeoutPromise]);

      if (aiRes.success && aiRes.content) {
        const isRealAI = aiRes.provider !== 'local';
        aiUsed = isRealAI;
        aiProvider = aiRes.provider;
        aiModel = aiRes.model;
        finishReason = aiRes.finishReason || (aiRes as any).rawResponse?.choices?.[0]?.finish_reason || 'stop';
        isTruncated = Boolean(aiRes.isTruncated || finishReason === 'length');
        // CAUSA RAÍZ RC1: LocalProvider genera texto genérico ("Análisis legal preliminar...")
        // que NO contiene expediente/partes ni estructura jurídica. Para escritos formales,
        // solo la IA real (nvidia) es válida; su fallback local debe descartarse y usar
        // el determinístico que SÍ embedde expediente/autoridad/materia.
        const isGenericFallback =
          !isRealAI &&
          /Análisis legal preliminar generado localmente|Orientación de Jurídico Radar/i.test(
            aiRes.content
          );
        if (isRealAI && !isGenericFallback) {
          rawText = aiRes.content;
        } else {
          fallbackUsed = true;
          aiError = `Fallback local genérico descartado (provider=${aiRes.provider}); se usará determinístico con expediente ${expedienteNum}.`;
          console.warn(`[pipeline:bloque] "${block.title}" - ${aiError}`);
        }
      }
    } catch (e: any) {
      fallbackUsed = true;
      aiError = e?.message || String(e);
      console.warn(`[pipeline:bloque] "${block.title}" - Falló IA: ${aiError}. Usando generador determinístico.`);
    }
  }

  if (!rawText) {
    fallbackUsed = true;
    const isManualOrPreserved = Boolean(block.isManuallyEdited || block.aiNeed === 'PRESERVE_DIRECT');
    const hasSeed = hasSeedMarkers(block.text);
    if (isManualOrPreserved && !hasSeed) {
      rawText = block.text.trim();
    } else if (block.text.trim() && !hasSeed) {
      rawText = block.text.trim();
    } else {
      rawText = buildDeterministicBlockText(block, doc, caseAnalysis);
    }
  }

  const styled = applyStyleToSectionText(block.sectionType as any, rawText, lawyerProfile);
  const sanitized = sanitizeGeneratedText(styled, { parties: doc.parties, caseRefs: doc.caseRefs });

  return {
    text: sanitized,
    warnings: isTruncated ? ['Generación truncada por límite de tokens (finish_reason: length).'] : [],
    sources: blockContext.references,
    aiUsed,
    aiProvider,
    aiModel,
    aiError,
    finishReason,
    isTruncated,
    fallbackUsed,
  };
}

function buildDeterministicBlockText(block: LegalBlock, doc: UniversalLegalDocument, caseAnalysis?: CaseAnalysis): string {
  const isNewWriting = doc.flow === 'NEW_WRITING';
  const writingObjective = doc.intake?.objective || doc.intake?.requestedRelief;
  const isCommercialEnforcementDoc = doc.documentType === 'demanda_ejecutiva_mercantil';
  const isContestacionDoc = /contestaci/i.test(doc.documentType || '') || /contestaci/i.test(doc.documentTypeLabel || '');
  const matterLower = (doc.matter || '').toLowerCase();
  const isLaboral = matterLower.includes('laboral') || Boolean(doc.documentType && (isLaboralDocumentType(doc.documentType) || /laboral|laudo/.test(doc.documentType)));
  const isAmparo = matterLower.includes('amparo') || matterLower.includes('constitucional') || Boolean(doc.documentType && (isAmparoDocumentType(doc.documentType) || /amparo/.test(doc.documentType)));
  const isFamiliar = matterLower.includes('familiar') || Boolean(doc.documentType && /divorcio|alimentos|custodia|convivencia|patria_potestad|paternidad|adopcion|familiar/.test(doc.documentType));
  const isAdministrativo = matterLower.includes('administrativ') || Boolean(doc.documentType && (isAdministrativoDocumentType(doc.documentType) || /administrativ|nulidad.*administrativ/.test(doc.documentType)));
  const isFiscal = matterLower.includes('fiscal') || Boolean(doc.documentType && (isFiscalDocumentType(doc.documentType) || /fiscal|credito_fiscal|recurso_revocacion_fiscal/.test(doc.documentType)));
  const isPenal = matterLower.includes('penal') || Boolean(doc.documentType && (isPenalDocumentType(doc.documentType) || /penal|denuncia|querella|carpeta|imputad/.test(doc.documentType)));
  const isAgrario = matterLower.includes('agrario') || Boolean(doc.documentType && (isAgrarioDocumentType(doc.documentType) || /agrari/.test(doc.documentType)));
  const isInmobiliario = matterLower.includes('inmobiliario') || Boolean(doc.documentType && (isInmobiliarioDocumentType(doc.documentType) || /inmueble|arrendamiento|desocupacion|rentas/.test(doc.documentType)));
  const isCorporativo = matterLower.includes('corporativo') || Boolean(doc.documentType && (isCorporativoDocumentType(doc.documentType) || /corporativ|sociedad|estatutos|asamblea|accionistas/.test(doc.documentType)));
  const isContractual = matterLower.includes('contractual') || Boolean(doc.documentType && (isContractualDocumentType(doc.documentType) || /contrato|convenio|memorando/.test(doc.documentType)));
  const isPropiedadIntelectual = matterLower.includes('propiedad_intelectual') || Boolean(doc.documentType && (isPropiedadIntelectualDocumentType(doc.documentType) || /marca|patente|impi|indautor|infraccion_propiedad/.test(doc.documentType)));
  const isTramiteGeneral = matterLower.includes('tramite') || Boolean(doc.documentType && (isTramiteGeneralDocumentType(doc.documentType) || /promocion_simple|prevencion|requerimiento|manifestaciones|comparecencia|ratificacion|copias|acceso_expediente|certificacion|autorizacion_abogados|revocacion_autorizados|cambio_domicilio|senalamiento_correo|impulso_procesal|acumulacion|archivo|desarchivo|desistimiento|allanamiento|convenio_judicial|aclaracion|correccion_error|devolucion_documentos/.test(doc.documentType)));
  const safeBlockText = block.text && !/\[\s*(?:Desarrollar por la IA|Completar por la IA)\b/i.test(block.text)
    ? block.text
    : '';
  const laborCtx = doc.caseContext?.laboral;
  const amparoCtx = doc.caseContext?.amparo;
  const adminCtx = doc.caseContext?.administrativo;
  const fiscalCtx = doc.caseContext?.fiscal;
  const penalCtx = doc.caseContext?.penal;
  const agrarioCtx = doc.caseContext?.agrario;
  const inmobCtx = doc.caseContext?.inmobiliario;
  const corpCtx = doc.caseContext?.corporativo;
  const contractCtx = doc.caseContext?.contractual;
  const piCtx = doc.caseContext?.propiedadIntelectual;
  const tramiteCtx = doc.caseContext?.tramiteGeneral;
  // FASE 6 — ROL CORRECTO: en contestación quien comparece y firma es el
  // DEMANDADO; en demanda inicial es el ACTOR.
  const firmanteName = isContestacionDoc
    ? inmobCtx?.arrendatarioOComprador?.value || agrarioCtx?.demandadoAgrario?.value || laborCtx?.patron?.value || doc.parties.demandado || caseAnalysis?.parties?.demandado || formatCaseContextField(doc.caseContext, 'demandado', '[DATO PENDIENTE: Nombre del demandado]')
    : tramiteCtx?.promovente?.value || agrarioCtx?.actorAgrario?.value || inmobCtx?.arrendadorOVendedor?.value || penalCtx?.denuncianteOQuerellante?.value || penalCtx?.victimaUOfendido?.value || laborCtx?.trabajador?.value || doc.parties.actor || doc.parties.quejoso || adminCtx?.actor?.value || fiscalCtx?.contribuyente?.value || caseAnalysis?.parties?.actor || caseAnalysis?.parties?.quejoso || formatCaseContextField(doc.caseContext, 'promovente', isAgrario ? '[DATO PENDIENTE: Nombre del actor / ejidatario / comunero]' : isInmobiliario ? '[DATO PENDIENTE: Nombre del arrendador / vendedor]' : isPenal ? '[DATO PENDIENTE: Nombre del denunciante / víctima / promovente]' : isLaboral ? '[DATO PENDIENTE: Nombre del trabajador]' : isFiscal ? '[DATO PENDIENTE: Nombre del contribuyente]' : isAdministrativo ? '[DATO PENDIENTE: Nombre del actor / promovente]' : isTramiteGeneral ? '[DATO PENDIENTE: Nombre del promovente]' : '[DATO PENDIENTE: Nombre del promovente]');
  const quejosoName = firmanteName;
  const demandadoName = isContestacionDoc
    ? agrarioCtx?.actorAgrario?.value || inmobCtx?.arrendadorOVendedor?.value || laborCtx?.trabajador?.value || doc.parties.actor || adminCtx?.actor?.value || fiscalCtx?.contribuyente?.value || caseAnalysis?.parties?.actor || formatCaseContextField(doc.caseContext, 'actor', isAgrario ? '[DATO PENDIENTE: Nombre del actor agrario]' : isFiscal ? '[DATO PENDIENTE: Nombre del contribuyente]' : '[DATO PENDIENTE: Nombre del trabajador / actor]')
    : agrarioCtx?.demandadoAgrario?.value || inmobCtx?.arrendatarioOComprador?.value || penalCtx?.imputado?.value || laborCtx?.patron?.value || adminCtx?.autoridadDemandada?.value || fiscalCtx?.autoridadFiscalDemandada?.value || doc.parties.demandado || caseAnalysis?.parties?.demandado || formatCaseContextField(doc.caseContext, 'demandado', isAgrario ? '[DATO PENDIENTE: Demandado / Órgano ejidal]' : isInmobiliario ? '[DATO PENDIENTE: Arrendatario / Comprador / Demandado]' : isPenal ? '[DATO PENDIENTE: Persona imputada o investigada]' : isLaboral ? '[DATO PENDIENTE: Nombre del patrón o empresa demandada]' : isFiscal ? '[DATO PENDIENTE: Autoridad fiscal demandada]' : isAdministrativo ? '[DATO PENDIENTE: Autoridad demandada]' : '[DATO PENDIENTE: Nombre del demandado]');
  // Autoridad
  const defaultAutoridad = isAgrario
    ? (agrarioCtx?.tribunalUnitarioAgrario?.value || '[DATO PENDIENTE: Tribunal Unitario Agrario competente]')
    : isInmobiliario
    ? '[DATO PENDIENTE: Juez competente en materia de arrendamiento / civil]'
    : isPenal
    ? '[DATO PENDIENTE: Agente del Ministerio Público / Juez de Control competente]'
    : isLaboral
    ? '[DATO PENDIENTE: Tribunal Laboral competente]'
    : isAmparo
    ? '[DATO PENDIENTE: Autoridad responsable]'
    : isFamiliar
    ? '[DATO PENDIENTE: Juez de lo Familiar competente]'
    : isAdministrativo
    ? '[DATO PENDIENTE: Tribunal Federal de Justicia Administrativa]'
    : isFiscal
    ? (fiscalCtx?.recursoSedeAdministrativa ? '[DATO PENDIENTE: Autoridad Fiscal competente]' : '[DATO PENDIENTE: Tribunal Federal de Justicia Administrativa]')
    : isTramiteGeneral
    ? (tramiteCtx?.juzgadoOTribunal?.value || '[DATO PENDIENTE: Juzgado o Tribunal de conocimiento]')
    : '[DATO PENDIENTE: Autoridad destinataria]';
  const autoridadName = doc.parties.autoridadResponsable || doc.parties.demandado || caseAnalysis?.parties?.autoridadResponsable || formatCaseContextField(doc.caseContext, 'autoridadResponsable', defaultAutoridad);
  const expedienteNum = tramiteCtx?.numeroExpediente?.value || doc.caseRefs.expediente || caseAnalysis?.caseNumbers?.principal || '[DATO PENDIENTE: Número de expediente]';
  const titleUpper = block.title.toUpperCase();
  const numberedFacts = caseAnalysis?.facts?.length
    ? caseAnalysis.facts.map((fact) => `${fact.number}. ${fact.text}`).join('\n\n')
    : '';

  // La demanda ejecutiva mercantil no puede usar el fallback histórico de
  // medios de impugnación: ese texto introduce autoridad responsable,
  // garantías y revocación aunque no existan en el contexto comercial.
  if (isCommercialEnforcementDoc) {
    const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const pending = (label: string) => `[DATO PENDIENTE: ${label}]`;
    if (/destinatario/.test(titleKey)) return `DESTINATARIO\n${pending('Órgano jurisdiccional mercantil competente')}\nPRESENTE.`;
    if (/comparecencia|personalidad|identificaci/.test(titleKey)) return `COMPARECENCIA Y PERSONALIDAD\n\n${pending('comparecencia, personalidad y partes confirmadas')}`;
    if (/via.*accion|accion.*via/.test(titleKey)) return `VÍA Y ACCIÓN\n\n${pending('vía procesal y acción ejecutiva confirmadas por el abogado')}`;
    if (/documento.*base/.test(titleKey)) return `DOCUMENTO BASE\n\n${pending('instrumento ejecutivo, integridad formal y procedencia')}`;
    if (/obligaciones|cantidades/.test(titleKey)) return `OBLIGACIONES Y CANTIDADES\n\n${pending('obligación, cantidad original, pagos y saldo confirmado')}`;
    if (/prestacion/.test(titleKey)) return `PRESTACIONES\n\n${pending('prestaciones congruentes con las obligaciones confirmadas')}`;
    if (/hechos/.test(titleKey)) return `HECHOS\n\n${pending('hechos mercantiles confirmados y vinculados con sus fuentes')}`;
    if (/derecho/.test(titleKey)) return `DERECHO\n\n${pending('fundamento jurídico autorizado y aplicable')}`;
    if (/prueba|evidencia/.test(titleKey)) return `PRUEBAS\n\n${pending('pruebas y relación con hechos confirmados')}`;
    if (/petitorio/.test(titleKey)) return `PUNTOS PETITORIOS\n\n${pending('peticiones congruentes confirmadas por el abogado')}`;
    if (/firma/.test(titleKey)) return `FIRMA\n\n${pending('parte facultada para firmar y lugar y fecha')}`;
    return `${block.title.toUpperCase()}\n\n${pending(`contenido específico de ${block.title}`)}`;
  }

  // Una contestación tiene una voz y una lógica distintas a amparo/recurso.
  // Este camino se ejecuta tanto sin credenciales como cuando NVIDIA falla;
  // por eso no puede compartir el texto genérico de medios de impugnación.
  if (isContestacionRevisionAmparoDirectoType(doc.documentType, doc.documentTypeLabel)) {
    return getRevisionAmparoDirectoSectionText(doc, block.title, caseAnalysis);
  }

  if (isContestacionDoc) {
    const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/hechos/.test(titleKey)) return `CONTESTACIÓN DE HECHOS\n\n${buildFactResponseText(caseAnalysis)}`;
    if (/prestacion|pretension/.test(titleKey)) return `CONTESTACIÓN DE PRESTACIONES\n\n${buildClaimResponseText(caseAnalysis)}`;
    if (/excepcion|defensa/.test(titleKey)) {
      const hasDefense = Boolean(caseAnalysis?.arguments?.length || caseAnalysis?.caseTheory?.legalTheory);
      return hasDefense
        ? `EXCEPCIONES Y DEFENSAS\n\nNo se formula una excepción nueva sin respaldo. Las defensas deberán desarrollarse únicamente con los hechos, normas e instrucciones que confirme el abogado.\n\n[REQUIERE INSTRUCCIÓN DEL ABOGADO: identificar la excepción o defensa aplicable y su sustento].`
        : 'EXCEPCIONES Y DEFENSAS\n\nNo se identificaron elementos suficientes en las fuentes para formular una excepción o defensa concreta. [REQUIERE INSTRUCCIÓN DEL ABOGADO].';
    }
    if (/alegato/.test(titleKey)) {
      return `ALEGATOS\n\nSíntesis de la posición del demandado: las posturas sobre hechos y prestaciones deben ser confirmadas por el abogado antes de formular una consecuencia procesal.\n\n[REQUIERE INSTRUCCIÓN DEL ABOGADO: confirmar la teoría defensiva y consecuencia solicitada].`;
    }
    if (/objeto/.test(titleKey)) {
      const roles = resolveContestacionRoles(doc, caseAnalysis, (doc as any).caseParties || []);
      return `OBJETO DEL ESCRITO\n\n${roles.contesta} comparece para contestar la demanda promovida por ${roles.contraparte}, dentro del expediente ${roles.expediente}, en los términos que se desarrollan en los apartados siguientes.`;
    }
  }

  switch (block.sectionType) {
    case 'header': {
      // El encabezado usa exclusivamente la autoridad competente de salida.
      // `autoridadName` es la autoridad del acto de origen y no puede servir
      // como sustituto silencioso del destinatario procesal.
      const destinationAuthority = doc.proceduralIdentity?.autoridadDestinataria
        || doc.parties?.autoridadDestinataria
        || '[DATO PENDIENTE: Autoridad destinataria]';
      const filingThrough = doc.proceduralIdentity?.organoPresentacion;
      return `${String(destinationAuthority).toUpperCase()}${filingThrough ? `\nPOR CONDUCTO DE: ${filingThrough}` : ''}\nPRESENTE.\n\nEXPEDIENTE: ${expedienteNum}`;
    }
    case 'identity':
      if (isContestacionDoc) {
        const roles = resolveContestacionRoles(doc, caseAnalysis, (doc as any).caseParties || []);
        return `${roles.contesta}, en su carácter de parte demandada, comparece para contestar la demanda promovida por ${roles.contraparte}, dentro del expediente ${roles.expediente}, ante la autoridad competente.`;
      }
      return `${quejosoName}, promoviendo en mi carácter dentro de los autos del expediente ${expedienteNum}, ante Usted con el debido respeto comparezco a exponer:`;
    case 'background':
      if (isNewWriting) {
        const facts = caseAnalysis?.facts || [];
        return facts.length
          ? `HECHOS APORTADOS POR LA PARTE:\n\n${facts.map((fact, index) => `${index + 1}. ${fact.text}`).join('\n\n')}`
          : 'HECHOS:\n\n[REQUIERE DATOS DEL ABOGADO: describir los hechos relevantes en orden cronológico]';
      }
      if (isLaboral) {
        if (doc.documentType === 'cumplimiento_laudo_sentencia_laboral' || doc.documentType === 'ejecucion_sentencia_laboral') {
          return `ANTECEDENTES DEL LAUDO O SENTENCIA DEFINITIVA:\n\n` +
            `BAJO PROTESTA DE DECIR VERDAD, se manifiesta que dentro del expediente laboral número ${expedienteNum} se dictó laudo o sentencia definitiva firme que condena a la demandada al cumplimiento de diversas obligaciones.\n\n` +
            `1. Se dictó resolución definitiva favorable a los intereses tutelados.\n\n` +
            `2. Dicha resolución causó ejecutoria sin que a la fecha se haya acreditado su total cumplimiento voluntario.`;
        }
        if (doc.documentType === 'desahogo_prevencion_laboral') {
          return `ANTECEDENTES DE LA PREVENCIÓN:\n\n` +
            `BAJO PROTESTA DE DECIR VERDAD, se hace constar que por auto notificado en autos, este Tribunal Laboral formuló requerimiento de aclaración respecto del escrito inicial de demanda.`;
        }
        const ingresoStr = laborCtx?.fechaIngreso?.value ? `iniciando el ${laborCtx.fechaIngreso.value}` : '';
        const puestoStr = laborCtx?.puesto?.value ? `desempeñando el puesto de ${laborCtx.puesto.value}` : '';
        const despidoStr = laborCtx?.fechaDespido?.value ? `con fecha ${laborCtx.fechaDespido.value}` : '[DATO PENDIENTE: fecha del despido o hecho generador]';
        return `ANTECEDENTES Y HECHOS DE LA RELACIÓN LABORAL:\n\n` +
          `BAJO PROTESTA DE DECIR VERDAD, se narran los hechos de la relación de trabajo materia de la controversia entre el trabajador ${firmanteName} y la patronal demandada ${demandadoName}:\n\n` +
          (caseAnalysis?.proceduralTimeline && caseAnalysis.proceduralTimeline.length > 0
            ? caseAnalysis.proceduralTimeline.slice(0, 5).map((e, idx) => `${idx + 1}. Con fecha ${e.date}: ${e.event}.`).join('\n\n')
            : `1. Existió relación de trabajo entre ${firmanteName} en su carácter de trabajador ${puestoStr} ${ingresoStr} y la patronal demandada ${demandadoName}.\n\n` +
              `2. Con fecha ${despidoStr}, la parte patronal rescindió injustificadamente la relación laboral.\n\n` +
              `3. Desde entonces se han generado prestaciones y salarios devengados pendientes de pago a favor del actor.`);
      }
      if (isFamiliar) {
        return `HECHOS Y ANTECEDENTES DE LA CONTROVERSIA FAMILIAR:\n\n` +
          `BAJO PROTESTA DE DECIR VERDAD, se manifiestan los antecedentes de hecho que motivan la presente solicitud familiar:\n\n` +
          (numberedFacts
            ? numberedFacts
            : caseAnalysis?.proceduralTimeline && caseAnalysis.proceduralTimeline.length > 0
            ? caseAnalysis.proceduralTimeline.slice(0, 5).map((e, idx) => `${idx + 1}. Con fecha ${e.date}: ${e.event}.`).join('\n\n')
            : `1. Las partes mantuvieron un vínculo familiar y/o conyugal del que se derivan las obligaciones y derechos materia de este juicio.\n\n` +
              `2. Se suscitaron hechos que ameritan la intervención judicial para regular la situación jurídica de las partes y salvaguardar a los involucrados.\n\n` +
              `3. [DATO PENDIENTE: Hechos específicos y circunstancias de modo, tiempo y lugar].`);
      }
      if (isAdministrativo) {
        const resStr = adminCtx?.resolucionImpugnada?.value ? `resolución administrativa ${adminCtx.resolucionImpugnada.value}` : '[DATO PENDIENTE: Resolución administrativa impugnada]';
        const notifStr = adminCtx?.fechaNotificacionResolucion?.value ? `notificada con fecha ${adminCtx.fechaNotificacionResolucion.value}` : '[DATO PENDIENTE: Fecha de notificación]';
        return `ANTECEDENTES DEL ACTO ADMINISTRATIVO IMPUGNADO:\n\n` +
          `BAJO PROTESTA DE DECIR VERDAD, se manifiestan los antecedentes que motivan la presente impugnación administrativa:\n\n` +
          (numberedFacts
            ? numberedFacts
            : caseAnalysis?.proceduralTimeline && caseAnalysis.proceduralTimeline.length > 0
            ? caseAnalysis.proceduralTimeline.slice(0, 5).map((e, idx) => `${idx + 1}. Con fecha ${e.date}: ${e.event}.`).join('\n\n')
            : `1. La autoridad demandada emitió la ${resStr}.\n\n` +
              `2. Dicha determinación fue ${notifStr}, surtiendo sus efectos legales.\n\n` +
              `3. El acto impugnado causa agravio directo al carecer de debida fundamentación y motivación conforme a la ley aplicable.`);
      }
      if (isFiscal) {
        const resStr = fiscalCtx?.resolucionDeterminativa?.value ? `resolución determinativa ${fiscalCtx.resolucionDeterminativa.value}` : '[DATO PENDIENTE: Resolución determinante o liquidación]';
        const credStr = fiscalCtx?.creditoFiscal?.value ? `crédito fiscal ${fiscalCtx.creditoFiscal.value}` : '[DATO PENDIENTE: Crédito fiscal impugnado]';
        const notifStr = fiscalCtx?.fechaNotificacion?.value ? `notificada con fecha ${fiscalCtx.fechaNotificacion.value}` : '[DATO PENDIENTE: Fecha de notificación]';
        return `ANTECEDENTES DEL ACTO O CRÉDITO FISCAL IMPUGNADO:\n\n` +
          `BAJO PROTESTA DE DECIR VERDAD, se manifiestan los antecedentes de la resolución y crédito fiscal recurrido:\n\n` +
          (numberedFacts
            ? numberedFacts
            : caseAnalysis?.proceduralTimeline && caseAnalysis.proceduralTimeline.length > 0
            ? caseAnalysis.proceduralTimeline.slice(0, 5).map((e, idx) => `${idx + 1}. Con fecha ${e.date}: ${e.event}.`).join('\n\n')
            : `1. La autoridad fiscalizadora emitió la ${resStr}, mediante la cual determinó el ${credStr}.\n\n` +
              `2. Dicho acto fue formalmente notificado al contribuyente con fecha ${notifStr}.\n\n` +
              `3. La liquidación tributaria adolece de vicios de fondo y forma que trasgreden el Código Fiscal de la Federación.`);
      }
      if (isPenal) {
        const carpStr = penalCtx?.carpetaInvestigacion?.value ? `carpeta de investigación ${penalCtx.carpetaInvestigacion.value}` : '[DATO PENDIENTE: Carpeta de investigación]';
        const causaStr = penalCtx?.causaPenal?.value ? ` y causa penal ${penalCtx.causaPenal.value}` : '';
        const delitoStr = penalCtx?.delitoImputado?.value ? `delito de ${penalCtx.delitoImputado.value}` : '[DATO PENDIENTE: Delito investigado]';
        return `NARRACIÓN DE HECHOS Y ANTECEDENTES PENALES:\n\n` +
          `BAJO PROTESTA DE DECIR VERDAD, se exponen los hechos que motivan la presente promoción penal dentro de la ${carpStr}${causaStr}:\n\n` +
          (numberedFacts
            ? numberedFacts
            : caseAnalysis?.proceduralTimeline && caseAnalysis.proceduralTimeline.length > 0
            ? caseAnalysis.proceduralTimeline.slice(0, 5).map((e, idx) => `${idx + 1}. Con fecha ${e.date}: ${e.event}.`).join('\n\n')
            : `1. Se investigan hechos con apariencia del ${delitoStr}, cometidos en agravio de la víctima ${penalCtx?.victimaUOfendido?.value || firmanteName}.\n\n` +
              `2. Se señala como probable partícipe a ${penalCtx?.imputado?.value || demandadoName}.\n\n` +
              `3. [DATO PENDIENTE: Circunstancias de modo, tiempo y lugar de los hechos delictivos].`);
      }
      if (isAgrario) {
        const ejido = agrarioCtx?.ejidoOComunidad?.value ? `del núcleo agrario ${agrarioCtx.ejidoOComunidad.value}` : '';
        const parcela = agrarioCtx?.parcelaOTierras?.value ? `respecto de la parcela ${agrarioCtx.parcelaOTierras.value}` : '';
        return `ANTECEDENTES Y HECHOS EN MATERIA AGRARIA:\n\n` +
          `BAJO PROTESTA DE DECIR VERDAD, se narran los antecedentes de hecho y derechos agrarios vinculados al conflicto ${ejido} ${parcela}:\n\n` +
          (numberedFacts
            ? numberedFacts
            : caseAnalysis?.proceduralTimeline && caseAnalysis.proceduralTimeline.length > 0
            ? caseAnalysis.proceduralTimeline.slice(0, 5).map((e, idx) => `${idx + 1}. Con fecha ${e.date}: ${e.event}.`).join('\n\n')
            : `1. La parte actora ostenta legítima titularidad y posesión agraria sobre los derechos ejidales o comunales en litigio.\n\n` +
              `2. Se suscitaron actos que perturban la posesión o desconocen los derechos agrarios legalmente reconocidos.\n\n` +
              `3. [DATO PENDIENTE: Circunstancias de modo, tiempo y lugar del conflicto o resolución asamblearia impugnada].`);
      }
      if (isInmobiliario) {
        const inm = inmobCtx?.inmuebleUbicacion?.value ? `inmueble ubicado en ${inmobCtx.inmuebleUbicacion.value}` : '[DATO PENDIENTE: Inmueble objeto del contrato o litigio]';
        const renta = inmobCtx?.rentaOPrecio?.value ? `pactándose una contraprestación de ${inmobCtx.rentaOPrecio.value}` : '';
        return `ANTECEDENTES Y HECHOS DEL VÍNCULO INMOBILIARIO:\n\n` +
          `BAJO PROTESTA DE DECIR VERDAD, se exponen los antecedentes y actos jurídicos relativos al ${inm} ${renta}:\n\n` +
          (numberedFacts
            ? numberedFacts
            : caseAnalysis?.proceduralTimeline && caseAnalysis.proceduralTimeline.length > 0
            ? caseAnalysis.proceduralTimeline.slice(0, 5).map((e, idx) => `${idx + 1}. Con fecha ${e.date}: ${e.event}.`).join('\n\n')
            : `1. Las partes celebraron acuerdo de voluntades respecto del inmueble materia del presente instrumento.\n\n` +
              `2. En el curso de la relación jurídica contractual o posesoria sobrevinieron los hechos materia del reclamo.\n\n` +
              `3. [DATO PENDIENTE: Hechos específicos, vigencia y montos o causales invocadas].`);
      }
      if (isCorporativo) {
        const soc = corpCtx?.sociedad?.value || '[DATO PENDIENTE: Denominación o Razón Social]';
        const obj = corpCtx?.objetoSocial?.value ? `con objeto social consistente en ${corpCtx.objetoSocial.value}` : '';
        return `ANTECEDENTES CORPORATIVOS Y SOCIETARIOS:\n\n` +
          `Bajo protesta de conducirse con verdad, se relacionan los antecedentes constitutivos y acuerdos societarios de ${soc} ${obj}:\n\n` +
          (numberedFacts
            ? numberedFacts
            : caseAnalysis?.proceduralTimeline && caseAnalysis.proceduralTimeline.length > 0
            ? caseAnalysis.proceduralTimeline.slice(0, 5).map((e, idx) => `${idx + 1}. Con fecha ${e.date}: ${e.event}.`).join('\n\n')
            : `1. La sociedad se encuentra debidamente constituida y con facultades vigentes conforme a las leyes mercantiles.\n\n` +
              `2. Se celebraron las sesiones o actos societarios que motivan la formalización de las resoluciones o estatutos.\n\n` +
              `3. [DATO PENDIENTE: Circunstancias de modo, tiempo y lugar de los acuerdos corporativos].`);
      }
      if (isContractual) {
        const obj = contractCtx?.objetoContrato?.value ? `relativo a ${contractCtx.objetoContrato.value}` : '[DATO PENDIENTE: Objeto contractual convenido]';
        const precio = contractCtx?.contraprestacionOPrecio?.value ? `por un monto o contraprestación de ${contractCtx.contraprestacionOPrecio.value}` : '';
        return `DECLARACIONES Y ANTECEDENTES CONTRACTUALES:\n\n` +
          `Las partes contratantes declaran los siguientes antecedentes y motivos de contratación respecto a ${obj} ${precio}:\n\n` +
          (numberedFacts
            ? numberedFacts
            : caseAnalysis?.proceduralTimeline && caseAnalysis.proceduralTimeline.length > 0
            ? caseAnalysis.proceduralTimeline.slice(0, 5).map((e, idx) => `${idx + 1}. Con fecha ${e.date}: ${e.event}.`).join('\n\n')
            : `1. Las partes contratantes cuentan con plena capacidad legal y legítima representación para obligarse.\n\n` +
              `2. Es deseo de las partes celebrar el presente instrumento para regular sus mutuos derechos y obligaciones.\n\n` +
              `3. [DATO PENDIENTE: Antecedentes comerciales o fácticos que fundamentan la relación contractual].`);
      }
      if (isPropiedadIntelectual) {
        const signo = piCtx?.signoDistintivoUObra?.value ? `signo o activo intangible "${piCtx.signoDistintivoUObra.value}"` : '[DATO PENDIENTE: Signo distintivo, marca u obra]';
        const reg = piCtx?.numeroRegistroOExpediente?.value ? `con registro o expediente número ${piCtx.numeroRegistroOExpediente.value}` : '';
        return `ANTECEDENTES Y HECHOS EN MATERIA DE PROPIEDAD INTELECTUAL:\n\n` +
          `BAJO PROTESTA DE DECIR VERDAD, se exponen los antecedentes y derechos exclusivos relativos a ${signo} ${reg}:\n\n` +
          (numberedFacts
            ? numberedFacts
            : caseAnalysis?.proceduralTimeline && caseAnalysis.proceduralTimeline.length > 0
            ? caseAnalysis.proceduralTimeline.slice(0, 5).map((e, idx) => `${idx + 1}. Con fecha ${e.date}: ${e.event}.`).join('\n\n')
            : `1. Se ostenta legítimo derecho, titularidad o solicitud en trámite de protección industrial o autoral.\n\n` +
              `2. Se suscitaron los hechos, objeciones u actos de infracción que motivan la presente promoción.\n\n` +
              `3. [DATO PENDIENTE: Circunstancias de modo, tiempo y lugar de los hechos o actos de autoridad].`);
      }
      if (isTramiteGeneral) {
        const peticion = tramiteCtx?.peticionOObjeto?.value || '[DATO PENDIENTE: Motivo o petición del trámite]';
        return `ANTECEDENTES PROCESALES:\n\n` +
          `BAJO PROTESTA DE DECIR VERDAD, se manifiestan los antecedentes procesales que motivan la presente promoción dentro del expediente número ${expedienteNum}:\n\n` +
          (numberedFacts
            ? numberedFacts
            : caseAnalysis?.proceduralTimeline && caseAnalysis.proceduralTimeline.length > 0
            ? caseAnalysis.proceduralTimeline.slice(0, 5).map((e, idx) => `${idx + 1}. Con fecha ${e.date}: ${e.event}.`).join('\n\n')
            : `1. El presente juicio se encuentra radicado ante este H. Juzgado tramitándose bajo el expediente número ${expedienteNum}.\n\n` +
              `2. Se promueve el presente ocurso en atención al estado de autos y con el objeto de: ${peticion}.\n\n` +
              `3. Resulta necesario proveer de conformidad para continuar con la secuela procesal.`);
      }
      return `ANTECEDENTES Y CONSTANCIAS PROCESALES:\n\n` +
        `BAJO PROTESTA DE DECIR VERDAD, se manifiestan los antecedentes procesales que constan en las actuaciones de origen:\n\n` +
        (numberedFacts
          ? numberedFacts
          : caseAnalysis?.proceduralTimeline && caseAnalysis.proceduralTimeline.length > 0
          ? caseAnalysis.proceduralTimeline.slice(0, 5).map((e, idx) => `${idx + 1}. Con fecha ${e.date}: ${e.event}.`).join('\n\n')
          : `1. En el expediente principal ${expedienteNum}, la autoridad responsable emitió la resolución materia del presente medio de defensa.\n\n` +
            `2. Dicha determinación lesiona las garantías fundamentales de la parte promovente al carecer de debida fundamentación y motivación.\n\n` +
            `3. [DATO PENDIENTE: Fecha y términos de la notificación legal].`);
    case 'legal_grounds':
      if (isNewWriting) return 'FUNDAMENTO JURÍDICO:\n\nSe invocan los preceptos legales y constitucionales aplicables al caso concreto conforme al orden jurídico vigente.';
      const legalSources = Array.from(new Set([
        ...(doc.legalBasis || []),
        ...(caseAnalysis?.citations || []).map((citation) => [citation.rubro, citation.texto].filter(Boolean).join(' — ')).filter(Boolean),
        ...(caseAnalysis?.caseTheory?.constitutionalTheory ? [caseAnalysis.caseTheory.constitutionalTheory] : []),
        ...(caseAnalysis?.caseTheory?.legalTheory ? [caseAnalysis.caseTheory.legalTheory] : []),
        ...((caseAnalysis?.argumentAxes || []).flatMap((a) => a.rules || [])),
      ])).filter(Boolean);
      if (legalSources.length === 0) return 'FUNDAMENTO JURÍDICO:\n\nSe invocan los preceptos legales y constitucionales aplicables al caso concreto conforme al orden jurídico vigente.';
      return `FUNDAMENTO JURÍDICO:\n\n${legalSources.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
      /*
      if (isLaboral) {
        return `PROCEDENCIA, COMPETENCIA Y FUNDAMENTO LEGAL:\n\n` +
          `La presente demanda laboral es procedente con fundamento en los artículos 123 de la Constitución, 47, 50, 79, 84 y demás relativos de la Ley Federal del Trabajo, así como en el procedimiento ordinario laboral.\n\n` +
          `Se promueve ante la autoridad competente en razón de materia y territorio.`;
      }
      return `PROCEDENCIA, OPORTUNIDAD Y FUNDAMENTO CONSTITUCIONAL:\n\n` +
        `El presente medio de defensa es procedente con fundamento en los artículos 1o, 14, 16 y 17 de la Constitución Política de los Estados Unidos Mexicanos, así como en los preceptos relativos de la Ley de Amparo.\n\n` +
        `El escrito se promueve oportunamente dentro del plazo legal previsto por la norma aplicable.`;
      */
    case 'argument':
      if (isNewWriting) {
        return `${titleUpper}\n\n${writingObjective ? `OBJETIVO APORTADO POR LA PARTE:\n${writingObjective}\n\n` : ''}PLANTEAMIENTO JURÍDICO:\nSe formulan los conceptos y razonamientos de derecho aplicables a la controversia con estricto apego a las normas jurídicas conducentes.`;
      }
      if (!isContestacionDoc && !isAmparo && !(caseAnalysis?.arguments?.length || caseAnalysis?.argumentAxes?.length || block.text?.trim())) {
        return `${titleUpper}\n\nPLANTEAMIENTO JURÍDICO:\nSe formulan los conceptos y razonamientos de derecho aplicables a la controversia con estricto apego a las normas jurídicas conducentes.`;
      }
      if (isContestacionDoc) {
        return `${titleUpper}\n\nLa función de este apartado es desarrollar exclusivamente la posición de la parte demandada respecto de la demanda y de las constancias disponibles. La redacción se mantiene dentro de la identidad procesal de esta contestación y las fuentes conducentes.`;
      }
      if (isLaboral) {
        if (doc.documentType === 'objecion_pruebas_laboral') {
          return `${titleUpper}\n\n` +
            `OBJECIÓN FUNDADA:\n` +
            `Las pruebas ofrecidas por la contraparte deben desestimarse por carecer de idoneidad y pertinencia legal con relación a los hechos fijados en la litis laboral.\n\n` +
            `CONSECUENCIA SOLICITADA:\n` +
            `Tener por formuladas en tiempo las objeciones y restar valor probatorio a los medios controvertidos.`;
        }
        if (doc.documentType === 'alegatos_laborales') {
          return `${titleUpper}\n\n` +
            `CONCLUSIONES DE LA INSTRUCCIÓN:\n` +
            `Al quedar cerrada la instrucción, las constancias de autos acreditan plenamente la procedencia de las pretensiones deducidas en el juicio ordinario laboral.\n\n` +
            `CONSECUENCIA SOLICITADA:\n` +
            `Dictar sentencia definitiva condenando a la contraparte conforme al mérito de las pruebas desahogadas.`;
        }
        if (doc.documentType === 'demanda_amparo_directo_laboral' || doc.documentType === 'demanda_amparo_indirecto_laboral') {
          return `${titleUpper}\n\n` +
            `CONCEPTOS DE VIOLACIÓN CONSTITUCIONAL:\n` +
            `La resolución combatida adolece de congruencia y exhaustividad, violando las garantías consagradas en los artículos 14, 16 y 123 constitucionales.\n\n` +
            `CONSECUENCIA SOLICITADA:\n` +
            `Conceder a la quejosa el amparo y protección de la Justicia de la Unión.`;
        }
        return `${titleUpper}\n\n` +
          `PLANTEAMIENTO CENTRAL:\n` +
          `Se reclama el despido injustificado del trabajador ${firmanteName} por parte de la demandada ${demandadoName}, y el pago de prestaciones laborales conforme a la Ley Federal del Trabajo.\n\n` +
          (safeBlockText ? `${safeBlockText.slice(0, 800)}\n\n` : '') +
          `CONSECUENCIA JURÍDICA SOLICITADA:\n` +
          `Procede condenar a la demandada ${demandadoName} al cumplimiento de las prestaciones reclamadas y salarios caídos en favor de ${quejosoName}.`;
      }
      if (isFamiliar) {
        return `${titleUpper}\n\n` +
          `PLANTEAMIENTO FAMILIAR:\n` +
          `Se promueve la presente solicitud familiar a efecto de salvaguardar los derechos de la familia y el interés superior de los involucrados.\n\n` +
          (safeBlockText ? `${safeBlockText.slice(0, 800)}\n\n` : '') +
          `CONSECUENCIA JURÍDICA SOLICITADA:\n` +
          `Procede resolver favorablemente lo solicitado con estricto apego a las disposiciones de derecho familiar aplicables.`;
      }
      if (isAdministrativo) {
        return `${titleUpper}\n\n` +
          `CONCEPTOS DE IMPUGNACIÓN ADMINISTRATIVA:\n\n` +
          `PRIMERO. Violación a los principios de legalidad, debida fundamentación y motivación previstos en la legislación administrativa aplicable.\n\n` +
          (safeBlockText ? `${safeBlockText.slice(0, 800)}\n\n` : '') +
          `CONSECUENCIA JURÍDICA SOLICITADA:\n` +
          `Declarar la nulidad lisa y llana de la resolución administrativa controvertida.`;
      }
      if (isFiscal) {
        return `${titleUpper}\n\n` +
          `CONCEPTOS DE IMPUGNACIÓN FISCAL:\n\n` +
          `PRIMERO. Ilegalidad de la resolución determinante y del crédito fiscal liquidado por indebida fundamentación, motivación y violación al Código Fiscal de la Federación.\n\n` +
          (safeBlockText ? `${safeBlockText.slice(0, 800)}\n\n` : '') +
          `CONSECUENCIA JURÍDICA SOLICITADA:\n` +
          `Declarar la nulidad lisa y llana de la resolución recurrida y dejar sin efectos el crédito fiscal determinado.`;
      }
      if (isPenal) {
        return `${titleUpper}\n\n` +
          `PLANTEAMIENTO PENAL:\n\n` +
          `Con fundamento en los artículos 20 Constitucional y aplicables del Código Nacional de Procedimientos Penales, se formulan las manifestaciones y agravios conducentes en favor de ${firmanteName}.\n\n` +
          (safeBlockText ? `${safeBlockText.slice(0, 800)}\n\n` : '') +
          `CONSECUENCIA JURÍDICA SOLICITADA:\n` +
          `Acordar de conformidad lo peticionado para garantizar el debido proceso y la observancia irrestricta de los derechos fundamentales.`;
      }
      if (isAgrario) {
        return `${titleUpper}\n\n` +
          `PLANTEAMIENTO AGRARIO:\n\n` +
          `Con fundamento en el artículo 27 Constitucional y disposiciones de la Ley Agraria, se hacen valer los razonamientos en defensa de los derechos ejidales, comunales y de posesión agraria de ${firmanteName}.\n\n` +
          (safeBlockText ? `${safeBlockText.slice(0, 800)}\n\n` : '') +
          `CONSECUENCIA JURÍDICA SOLICITADA:\n` +
          `Reconocer y tutelar los derechos agrarios controvertidos, declarando la nulidad de actos contrarios a derecho y ordenando la restitución conducente.`;
      }
      if (isInmobiliario) {
        return `${titleUpper}\n\n` +
          `FUNDAMENTO Y RAZONAMIENTO JURÍDICO INMOBILIARIO:\n\n` +
          `De conformidad con las disposiciones del Código Civil aplicable y la voluntad contractual manifestada, se exige el estricto cumplimiento de las obligaciones pactadas respecto del bien inmueble.\n\n` +
          (safeBlockText ? `${safeBlockText.slice(0, 800)}\n\n` : '') +
          `CONSECUENCIA JURÍDICA SOLICITADA:\n` +
          `Hacer efectivas las cláusulas contractuales o legales, decretando la desocupación, pago o perfeccionamiento solicitado.`;
      }
      if (isCorporativo) {
        return `${titleUpper}\n\n` +
          `FUNDAMENTACIÓN Y MOTIVACIÓN CORPORATIVA:\n\n` +
          `De conformidad con la Ley General de Sociedades Mercantiles y los estatutos sociales vigentes, se formulan las consideraciones jurídicas de los acuerdos adoptados.\n\n` +
          (safeBlockText ? `${safeBlockText.slice(0, 800)}\n\n` : '') +
          `CONSECUENCIA JURÍDICA:\n` +
          `Aprobar y ratificar los acuerdos societarios, instruyendo su formalización, protocolización e inscripción registral correspondiente.`;
      }
      if (isContractual) {
        return `${titleUpper}\n\n` +
          `MARCO LEGAL Y VOLUNTAD CONTRACTUAL:\n\n` +
          `Con apego al principio de autonomía de la voluntad y las disposiciones del Código Civil y Código de Comercio aplicables, las partes pactan las cláusulas del negocio jurídico celebrado.\n\n` +
          (safeBlockText ? `${safeBlockText.slice(0, 800)}\n\n` : '') +
          `EFICACIA JURÍDICA:\n` +
          `Vincular plenamente a las partes contratantes al estricto cumplimiento de lo estipulado como ley suprema entre ellas.`;
      }
      if (isPropiedadIntelectual) {
        return `${titleUpper}\n\n` +
          `FUNDAMENTOS Y AGRAVIOS DE PROPIEDAD INTELECTUAL:\n\n` +
          `Con fundamento en la Ley Federal de Protección a la Propiedad Industrial y la Ley Federal del Derecho de Autor, se hacen valer los derechos exclusivos, precedentes y causales invocadas.\n\n` +
          (safeBlockText ? `${safeBlockText.slice(0, 800)}\n\n` : '') +
          `CONSECUENCIA JURÍDICA SOLICITADA:\n` +
          `Resolver favorablemente la solicitud, concediendo el registro, declarando la infracción, nulidad o revocando la resolución combatida.`;
      }
      if (isTramiteGeneral) {
        const peticion = tramiteCtx?.peticionOObjeto?.value || 'acordar de conformidad lo peticionado en este escrito';
        return `${titleUpper}\n\n` +
          `MOTIVACIÓN Y JUSTIFICACIÓN PROCESAL:\n\n` +
          `Con fundamento en los artículos 8o y 17 de la Constitución Política de los Estados Unidos Mexicanos, así como en las normas adjetivas procesales aplicables, se solicita a este Órgano Jurisdiccional dar curso y acordar favorablemente respecto de: ${peticion}.\n\n` +
          (safeBlockText ? `${safeBlockText.slice(0, 800)}\n\n` : '') +
          `CONSECUENCIA JURÍDICA SOLICITADA:\n` +
          `Tener por formulada la manifestación y proveer lo que en derecho corresponda conforme a las constancias de autos.`;
      }
      return `${titleUpper}\n\n` +
        `PLANTEAMIENTO CENTRAL:\n` +
        `Causa agravio directo la determinación recurrida dictada por ${autoridadName}, al violentar las garantías de debido proceso, legalidad y tutela judicial efectiva.\n\n` +
        `PARÁMETRO CONSTITUCIONAL Y CONTRASTE CON LA DECISIÓN IMPUGNADA:\n` +
        `La autoridad resolutora sostuvo la validez del acto impugnado; sin embargo, dicho criterio resulta inconstitucional al desatender el marco de derechos humanos y la debida valoración de las constancias.\n\n` +
        (safeBlockText ? `${safeBlockText.slice(0, 800)}\n\n` : '') +
        `CONSECUENCIA JURÍDICA SOLICITADA:\n` +
        `Procede revocar o dejar insubsistente la resolución recurrida a efecto de restituir a ${quejosoName} en el goce de los derechos fundamentales conculcados.`;
    case 'evidence': {
      const confirmedEvidence = (caseAnalysis?.evidence || []).filter((item) => item.confirmed === true);
      if (confirmedEvidence.length === 0) return '[REQUIERE DEFINIR PRUEBAS A OFRECER]';
      return `PRUEBAS:\n\n${confirmedEvidence.map((item, index) => `${index + 1}. ${item.type ? `${item.type}: ` : ''}${item.description}${item.page ? ` (página ${item.page})` : ''}`).join('\n')}`;
    }
    case 'petition':
      if (isNewWriting) {
        return `PUNTOS PETITORIOS:\n\n${writingObjective ? `PRIMERO. Tener por formulada la solicitud consistente en: ${writingObjective}.` : 'PRIMERO. Tener por formulada la solicitud en los términos y extremos expuestos en el presente escrito.'}`;
      }
      if (isContestacionDoc) {
        const roles = resolveContestacionRoles(doc, caseAnalysis, (doc as any).caseParties || []);
        return `PUNTOS PETITORIOS:\n\nPRIMERO. Tener por presentado a ${roles.contesta}, en su carácter de parte demandada, contestando la demanda promovida por ${roles.contraparte}.\nSEGUNDO. Tener por formuladas las respuestas a los hechos y prestaciones, con las posturas que confirme el abogado.\nTERCERO. En su oportunidad, resolver conforme a las constancias y a las defensas efectivamente acreditadas.`;
      }
      if (isCorporativo) {
        return `PUNTOS PETITORIOS:\n\n` +
          `PRIMERO. Tener por celebrada y formalizada la presente asamblea, contrato o acuerdo corporativo en todos sus términos.\n` +
          `SEGUNDO. Tener por designados a los delegados especiales autorizados para acudir ante Fedatario Público a protocolizar lo resuelto.\n` +
          `TERCERO. Ordenar la inscripción conducente en el Registro Público de Comercio cuando legalmente proceda.`;
      }
      if (isContractual) {
        return `PETITORIOS O CLÁUSULA DE CIERRE:\n\n` +
          `PRIMERO. Tener a las partes contratantes por conformes con todas y cada una de las cláusulas y estipulaciones acordadas.\n` +
          `SEGUNDO. Ratificar el contenido y firma del presente contrato o convenio para todos los efectos legales a que haya lugar.`;
      }
      if (isPropiedadIntelectual) {
        return `PUNTOS PETITORIOS:\n\n` +
          `PRIMERO. Tenerme por presentado en tiempo y forma formulando la presente solicitud o promoción ante este Instituto.\n` +
          `SEGUNDO. Tener por ofrecidas y admitidas las pruebas y anexos exhibidos.\n` +
          `TERCERO. En su oportunidad, resolver favorablemente otorgando el título, declarando la infracción, nulidad, caducidad o revocando el acto impugnado.`;
      }
      if (isLaboral) {
        if (doc.documentType === 'cumplimiento_laudo_sentencia_laboral') {
          return `PUNTOS PETITORIOS:\n\n` +
            `PRIMERO. Tenerme por presentado acreditando el cumplimiento de la resolución laboral de mérito.\n` +
            `SEGUNDO. Dar vista a la contraparte con las constancias de cumplimiento y liquidación exhibidas.\n` +
            `TERCERO. En su oportunidad, ordenar el archivo definitivo del expediente como asunto concluido.`;
        }
        if (doc.documentType === 'ejecucion_sentencia_laboral') {
          return `PUNTOS PETITORIOS:\n\n` +
            `PRIMERO. Tener por promovida la ejecución forzosa del laudo o resolución definitiva firme.\n` +
            `SEGUNDO. Despachar auto de ejecución ordenando requerir de pago a la demandada por la cantidad líquida adeudada.\n` +
            `TERCERO. En caso de negativa, trabar embargo sobre bienes suficientes para garantizar el monto de las condenas.`;
        }
        if (doc.documentType === 'desahogo_prevencion_laboral') {
          return `PUNTOS PETITORIOS:\n\n` +
            `PRIMERO. Tenerme por presentado en tiempo y forma desahogando la prevención formulada por este Tribunal.\n` +
            `SEGUNDO. Tener por aclarados y subsanados los puntos prevenidos y admitir la demanda a trámite.`;
        }
        if (doc.documentType === 'objecion_pruebas_laboral') {
          return `PUNTOS PETITORIOS:\n\n` +
            `PRIMERO. Tener por formuladas en tiempo y forma las objeciones a las pruebas de la contraparte.\n` +
            `SEGUNDO. Desestimar y restar pleno valor probatorio a los medios probatorios objetados.`;
        }
        if (doc.documentType === 'demanda_amparo_directo_laboral' || doc.documentType === 'demanda_amparo_indirecto_laboral') {
          return `PUNTOS PETITORIOS:\n\n` +
            `PRIMERO. Tener por promovida la demanda de amparo en materia laboral.\n` +
            `SEGUNDO. Conceder la suspensión del acto reclamado conforme a derecho.\n` +
            `TERCERO. En su oportunidad, otorgar el amparo y protección de la Justicia Federal.`;
        }
        return `PUNTOS PETITORIOS:\n\n` +
          `PRIMERO. Tenerme por presentado en tiempo y forma con la presente demanda laboral.\n` +
          `SEGUNDO. Admitir a trámite la demanda y emplazar a la parte demandada.\n` +
          `TERCERO. Condenar a la demandada al pago de indemnización, salarios caídos y prestaciones reclamadas.`;
      }
      if (isFamiliar) {
        return `PUNTOS PETITORIOS:\n\n` +
          `PRIMERO. Tenerme por presentado en tiempo y forma con el presente escrito y anexos acompañados.\n` +
          `SEGUNDO. Admitir a trámite la solicitud en la vía y forma legalmente procedente.\n` +
          `TERCERO. En su oportunidad procesal, dictar resolución favorable conforme a derecho y al interés superior de la familia.`;
      }
      if (isAdministrativo) {
        return `PUNTOS PETITORIOS:\n\n` +
          `PRIMERO. Tenerme por presentado en tiempo y forma promoviendo el presente medio de defensa administrativa.\n` +
          `SEGUNDO. Admitir a trámite el escrito y correr traslado a la autoridad demandada.\n` +
          `TERCERO. En su oportunidad procesal, declarar la nulidad lisa y llana del acto administrativo impugnado.`;
      }
      if (isFiscal) {
        return `PUNTOS PETITORIOS:\n\n` +
          `PRIMERO. Tenerme por presentado en tiempo y forma promoviendo el presente medio de defensa fiscal.\n` +
          `SEGUNDO. Admitir a trámite el escrito y decretar la suspensión del procedimiento administrativo de ejecución.\n` +
          `TERCERO. En su oportunidad, declarar la nulidad lisa y llana de la resolución y cancelar el crédito fiscal recurrido.`;
      }
      if (isPenal) {
        if (doc.documentType === 'apelacion_penal') {
          return `PUNTOS PETITORIOS:\n\n` +
            `PRIMERO. Tenerme por presentado en tiempo y forma interponiendo el presente recurso de apelación.\n` +
            `SEGUNDO. Admitir a trámite el recurso y dar vista a las partes para que manifiesten lo conducente.\n` +
            `TERCERO. En su oportunidad, remitir los registros al Tribunal de Alzada competente para que revoque o modifique la resolución recurrida.`;
        }
        return `PUNTOS PETITORIOS:\n\n` +
          `PRIMERO. Tenerme por presentado en tiempo y forma promoviendo el presente escrito penal.\n` +
          `SEGUNDO. Acordar de conformidad lo solicitado en estricto apego a las garantías del debido proceso y derechos consagrados en el CNPP.\n` +
          `TERCERO. Proveer lo conducente para el debido trámite y resolución de la solicitud formulada.`;
      }
      if (isAgrario) {
        if (doc.documentType === 'alegatos_agrarios') {
          return `PUNTOS PETITORIOS:\n\n` +
            `PRIMERO. Tener por formulados en tiempo y forma los alegatos en materia agraria.\n` +
            `SEGUNDO. Valorar exhaustivamente las pruebas y argumentos vertidos al momento de emitir la sentencia definitiva.\n` +
            `TERCERO. En su oportunidad, dictar resolución reconociendo los derechos agrarios demandados.`;
        }
        if (doc.documentType === 'cumplimiento_sentencia_agraria') {
          return `PUNTOS PETITORIOS:\n\n` +
            `PRIMERO. Tener por acreditado y manifestado lo relativo al cumplimiento de la sentencia agraria firme.\n` +
            `SEGUNDO. Dar vista a la contraria y practicar las diligencias de ejecución forzosa necesarias.\n` +
            `TERCERO. Una vez cumplida en su totalidad, ordenar el archivo del expediente agrario como asunto concluido.`;
        }
        if (doc.documentType === 'recurso_agrario') {
          return `PUNTOS PETITORIOS:\n\n` +
            `PRIMERO. Tener por interpuesto el presente recurso de revisión agraria en contra de la sentencia o auto recurrido.\n` +
            `SEGUNDO. Admitir a trámite el recurso y remitir los autos originales al Tribunal Superior Agrario.\n` +
            `TERCERO. En su oportunidad, revocar la resolución impugnada dictando otra favorable a derecho.`;
        }
        return `PUNTOS PETITORIOS:\n\n` +
          `PRIMERO. Tenerme por presentado en términos del presente ocurso demandando en la vía agraria correspondiente.\n` +
          `SEGUNDO. Admitir a trámite la promoción y emplazar a la demandada u órgano ejidal conforme a la Ley Agraria.\n` +
          `TERCERO. En su momento procesal oportuno, emitir sentencia definitiva reconociendo los derechos agrarios reclamados.`;
      }
      if (isInmobiliario) {
        if (doc.documentType === 'requerimiento_pago_rentas' || doc.documentType === 'aviso_terminacion') {
          return `PUNTOS PETITORIOS:\n\n` +
            `PRIMERO. Tener por formulado en tiempo y forma el presente requerimiento / aviso inmobiliario.\n` +
            `SEGUNDO. Intimar al destinatario al cumplimiento o entrega del bien dentro del término legal pactado.\n` +
            `TERCERO. Reservar el ejercicio de las acciones jurisdiccionales en caso de incumplimiento o mora.`;
        }
        if (doc.documentType === 'convenio_desocupacion' || doc.documentType === 'reconocimiento_adeudo_arrendamiento' || doc.documentType === 'terminacion_arrendamiento') {
          return `PUNTOS PETITORIOS:\n\n` +
            `PRIMERO. Tener por formalizado el presente acto jurídico conforme a la voluntad de los comparecientes.\n` +
            `SEGUNDO. Ratificar las cláusulas y obligaciones contraídas en el presente instrumento privado.\n` +
            `TERCERO. En su caso, someter a ratificación y aprobación judicial para que surta plenos efectos como cosa juzgada.`;
        }
        return `PUNTOS PETITORIOS:\n\n` +
          `PRIMERO. Tenerme por presentado en la vía y forma legal conducente promoviendo el presente instrumento inmobiliario.\n` +
          `SEGUNDO. Admitir a trámite y ordenar las notificaciones y requerimientos de ley.\n` +
          `TERCERO. Dictar resolución definitiva condenando a la entrega y desocupación del inmueble y pago de las prestaciones reclamadas.`;
      }
      if (isTramiteGeneral) {
        const peticion = tramiteCtx?.peticionOObjeto?.value || 'acordar favorablemente lo solicitado en el cuerpo de este ocurso';
        return `PUNTOS PETITORIOS:\n\n` +
          `PRIMERO. Tenerme por presentado en tiempo y forma en los términos del presente escrito dentro del expediente ${expedienteNum}.\n` +
          `SEGUNDO. Tener por formulada la petición y trámite procesal consistente en: ${peticion}.\n` +
          `TERCERO. Proveer lo conducente conforme a derecho y ordenar las anotaciones, certificaciones y diligencias correspondientes.`;
      }
      return `PUNTOS PETITORIOS:\n\n` +
        `PRIMERO. Tenerme por presentado en tiempo y forma con el presente escrito y anexos acompañados.\n` +
        `SEGUNDO. Admitir a trámite el medio de defensa promovido.\n` +
        `TERCERO. En su oportunidad procesal, dictar resolución favorable declarando fundadas las pretensiones de esta parte.`;
    case 'closing':
      if (isNewWriting) return 'LUGAR Y FECHA: [DATO PENDIENTE: lugar y fecha de presentación]';
      return `PROTESTO LO NECESARIO EN DERECHO.\nCiudad de México, a la fecha de su presentación.`;
    case 'signature':
      return `_________________________________________\n${quejosoName}`;
    default: {
      if (isNewWriting) return `${titleUpper}\n\n[REQUIERE DEFINIR CONTENIDO ESPECÍFICO DEL APARTADO]`;
      if (isFamiliar) {
        const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/acuerdo/.test(titleKey)) {
          return `ACUERDOS:\n\nLas partes convienen y se obligan en los términos que constan en las cláusulas de autos, sujetándose a la debida aprobación judicial.`;
        }
        if (/alimento|pension/.test(titleKey)) {
          return `RÉGIMEN DE ALIMENTOS Y PENSIÓN:\n\nSe establece la obligación de pago de pensión alimenticia de conformidad con las necesidades del acreedor y la capacidad acreditada del deudor.`;
        }
        if (/convivencia|visita/.test(titleKey)) {
          return `RÉGIMEN DE CONVIVENCIA:\n\nSe fija el régimen de visitas y convivencias garantizando el sano desarrollo de los menores y la relación parental.`;
        }
        if (/situacion.*menor|menores/.test(titleKey)) {
          return `SITUACIÓN DE LOS MENORES:\n\nSe exponen las condiciones actuales de cuidado, estabilidad y entorno seguro de los menores de edad involucrados.`;
        }
        if (/superveniente/.test(titleKey)) {
          return `HECHOS SUPERVENIENTES:\n\nCon posterioridad a la resolución previa, acontecieron hechos nuevos que alteraron las circunstancias originales, justificando la modificación solicitada.`;
        }
        if (/modificacion.*solicitada/.test(titleKey)) {
          return `MODIFICACIÓN SOLICITADA:\n\nSe solicita la modificación proporcional del régimen previo para ajustarlo a las necesidades y posibilidades actuales.`;
        }
        if (/incumplimiento/.test(titleKey)) {
          return `INCUMPLIMIENTO ACREDITADO:\n\nSe hace constar el incumplimiento reiterado de las obligaciones fijadas en la resolución o convenio base de ejecución.`;
        }
        if (/necesidad|capacidad/.test(titleKey)) {
          return `NECESIDADES Y CAPACIDAD ECONÓMICA:\n\nSe detallan las necesidades alimentarias y los elementos comprobatorios de la solvencia económica del deudor.`;
        }
      }
      if (isLaboral) {
        const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/condiciones.*trabajo/.test(titleKey)) {
          const puesto = laborCtx?.puesto?.value ? `en el puesto de ${laborCtx.puesto.value}` : '[DATO PENDIENTE: Puesto desempeñado]';
          const salario = laborCtx?.salarioDiario?.value ? `salario diario de ${laborCtx.salarioDiario.value}` : (laborCtx?.salario?.value ? `salario de ${laborCtx.salario.value}` : '[DATO PENDIENTE: Salario percibido]');
          const ingreso = laborCtx?.fechaIngreso?.value ? `con fecha de ingreso ${laborCtx.fechaIngreso.value}` : '[DATO PENDIENTE: Fecha de ingreso]';
          const jornada = laborCtx?.jornada?.value ? `jornada de trabajo ${laborCtx.jornada.value}` : '[DATO PENDIENTE: Jornada laboral]';
          return `CONDICIONES GENERALES DE TRABAJO:\n\nEl trabajador laboró bajo las siguientes condiciones esenciales de trabajo:\n` +
            `1. Puesto y categoría: ${puesto}.\n` +
            `2. Fecha de inicio de labores: ${ingreso}.\n` +
            `3. Salario pactado: ${salario}.\n` +
            `4. Jornada laboral y horario: ${jornada}.\n` +
            `5. Lugar o centro de trabajo: ${laborCtx?.centroTrabajo?.value || '[DATO PENDIENTE: Centro de trabajo]'}.`;
        }
        if (/prestacion/.test(titleKey)) {
          const items = laborCtx?.prestaciones?.length
            ? laborCtx.prestaciones.map((p, idx) => `${idx + 1}. ${p.name}${p.amount?.value ? `: ${p.amount.value}` : ''}${p.period ? ` (${p.period})` : ''}`).join('\n')
            : `1. Indemnización constitucional o reinstalación laboral.\n2. Salarios vencidos y caídos generados desde el despido.\n3. Vacaciones, prima vacacional y aguinaldo devengados.\n4. Prima de antigüedad conforme a la Ley Federal del Trabajo.`;
          return `PRESTACIONES RECLAMADAS:\n\nSe demanda el pago y cumplimiento de las siguientes prestaciones laborales:\n${items}`;
        }
        if (/objecion.*pruebas/.test(titleKey)) {
          return `OBJECIÓN DE PRUEBAS DE LA CONTRAPARTE:\n\nSe objetan en cuanto a su alcance y valor probatorio los medios probatorios ofrecidos por la contraparte, por carecer de idoneidad, certeza y eficacia demostrativa en este procedimiento laboral.`;
        }
        if (/motivos.*objecion|motivos.*inadmisibilidad/.test(titleKey)) {
          return `MOTIVOS DE INADMISIBILIDAD Y FALTA DE ALCANCE PROBATORIO:\n\nLas probanzas objetadas no satisfacen las exigencias formales de la ley laboral y resultan inconducentes para justificar las excepciones planteadas por la demandada.`;
        }
        if (/acuerdo.*notificado|requerimiento.*notificado/.test(titleKey)) {
          return `ACUERDO O REQUERIMIENTO NOTIFICADO:\n\nSe tiene por recibido y notificado el acuerdo de prevención dictado por este Tribunal Laboral, procediendo a su desahogo en tiempo legal.`;
        }
        if (/desahogo.*prevencion/.test(titleKey)) {
          return `DESAHOGO PUNTUAL DE LA PREVENCIÓN:\n\nEn cumplimiento al proveído dictado, se subsanan de manera puntual y exhaustiva las precisiones requeridas respecto de los hechos y pretensiones de la demanda.`;
        }
        if (/aclaracion|complementacion/.test(titleKey)) {
          return `ACLARACIONES Y COMPLEMENTACIONES:\n\nSe formulan las aclaraciones pertinentes ratificando los hechos de la demanda laboral en todos sus términos.`;
        }
        if (/valoracion.*pruebas/.test(titleKey)) {
          return `VALORACIÓN DE LAS PRUEBAS DESAHOGADAS:\n\nDel caudal probatorio desahogado en autos se desprende la plena justificación de las pretensiones de esta parte, sin que la contraria haya aportado prueba idónea en contrario.`;
        }
        if (/resolucion.*referencia|laudo.*referencia|resolucion.*firme/.test(titleKey)) {
          return `RESOLUCIÓN O LAUDO DE REFERENCIA:\n\nSe hace referencia a la resolución o laudo definitivo firme emitido en este juicio laboral, la cual tiene el carácter de cosa juzgada y fuerza ejecutiva.`;
        }
        if (/manifestacion.*cumplimiento/.test(titleKey)) {
          return `MANIFESTACIÓN DE CUMPLIMIENTO:\n\nSe manifiesta el cumplimiento voluntario e íntegro de las condenas decretadas, exhibiendo las constancias conducentes a favor de la contraparte.`;
        }
        if (/liquidacion|constancias.*liquidacion/.test(titleKey)) {
          return `CONSTANCIAS Y LIQUIDACIÓN:\n\nSe detalla la liquidación cuantitativa y las constancias de pago correspondientes a las prestaciones y conceptos condenados en autos.`;
        }
        if (/incumplimiento/.test(titleKey)) {
          return `INCUMPLIMIENTO DE LA CONDENA:\n\nHabiendo transcurrido con exceso el plazo legal para el cumplimiento voluntario, la demandada no ha solventado las condenas líquidas impuestas.`;
        }
        if (/requerimiento.*pago|embargo/.test(titleKey)) {
          return `SOLICITUD DE REQUERIMIENTO DE PAGO Y EMBARGO:\n\nSe solicita a este Tribunal despachar auto de ejecución con efectos de mandamiento en forma, ordenando requerir de pago a la demandada y, en defecto de pago inmediato, trabar embargo sobre bienes suficientes de su propiedad.`;
        }
        if (/quejoso.*personalidad/.test(titleKey)) {
          return `QUEJOSO Y PERSONALIDAD:\n\n${firmanteName}, promoviendo por propio derecho en mi carácter de quejoso, señalando domicilio para oír y recibir notificaciones y autorizados en términos de ley.`;
        }
        if (/tercero.*interesado/.test(titleKey)) {
          return `TERCERO INTERESADO:\n\nSe señala con dicho carácter a ${demandadoName}, con domicilio conocido en autos del juicio laboral de origen.`;
        }
        if (/autoridad.*responsable/.test(titleKey)) {
          return `AUTORIDAD RESPONSABLE:\n\nSe señala como autoridad responsable al Tribunal Laboral competente emisor del acto o resolución que se controvierte.`;
        }
        if (/fecha.*notificacion/.test(titleKey)) {
          return `FECHA DE NOTIFICACIÓN:\n\nEl laudo o resolución reclamada fue notificada a la parte quejosa con fecha [DATO PENDIENTE: Fecha de notificación de la resolución].`;
        }
        if (/preceptos.*violados/.test(titleKey)) {
          return `PRECEPTOS CONSTITUCIONALES VIOLADOS:\n\nSe vulneran los derechos humanos y garantías consagrados en los artículos 1, 14, 16 y 123 de la Constitución Política de los Estados Unidos Mexicanos.`;
        }
        if (/conceptos.*violacion/.test(titleKey)) {
          return `CONCEPTOS DE VIOLACIÓN:\n\nÚNICO. Causa agravio a la parte quejosa la transgresión a las normas del debido proceso y legalidad, al resolver en contravención a las constancias de autos y al marco protector laboral.`;
        }
        if (/suspension/.test(titleKey)) {
          return `SUSPENSIÓN DEL ACTO RECLAMADO:\n\nSe solicita la suspensión del acto reclamado a efecto de conservar la materia del juicio constitucional y evitar perjuicios irreparables.`;
        }
      }
      if (isAmparo) {
        const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/oportunidad/.test(titleKey)) {
          return `OPORTUNIDAD PROCESAL:\n\nEl presente medio de defensa se interpone dentro del término legal computado a partir del día siguiente al en que surtió efectos la notificación respectiva, de conformidad con la Ley de Amparo.`;
        }
        if (/nuevo.*acto|nuevos.*actos/.test(titleKey)) {
          return `NUEVOS ACTOS RECLAMADOS:\n\nSe señalan como nuevos actos reclamados aquellos conocidos con posterioridad o derivados de los informes justificados rendidos en autos.`;
        }
        if (/autoridad.*responsable/.test(titleKey)) {
          return `AUTORIDADES RESPONSABLES:\n\nSe señalan como autoridades responsables a las señaladas en el proemio, ordenadoras y ejecutoras de los actos reclamados.`;
        }
        if (/nuevo.*hecho|nuevos.*hechos/.test(titleKey)) {
          return `NUEVOS HECHOS:\n\nCon posterioridad a la presentación de la demanda, acontecieron hechos novedosos estrechamente vinculados con la litis constitucional.`;
        }
        if (/adhesion|adher/.test(titleKey)) {
          return `ADHESIÓN AL AMPARO PRINCIPAL:\n\nSe comparece a adherirse formalmente al juicio de amparo directo promovido por la contraparte, en términos del artículo 182 de la Ley de Amparo.`;
        }
        if (/fortalecimiento/.test(titleKey)) {
          return `ARGUMENTOS DE FORTALECIMIENTO:\n\nSe exponen razonamientos jurídicos tendientes a confirmar la legalidad y validez de las consideraciones del fallo impugnado que resultaron favorables.`;
        }
        if (/impugnacion.*perjudicial|parte.*perjudicial/.test(titleKey)) {
          return `IMPUGNACIÓN DE PARTE PERJUDICIAL:\n\nSe combaten aquellas consideraciones accesorias que causan agravio a la parte promovente en la resolución materia de este amparo adhesivo.`;
        }
        if (/acto.*reclamado/.test(titleKey)) {
          return `ACTO RECLAMADO:\n\nSe reclama la resolución o acto de autoridad señalado en el proemio, cuya ejecución inminente lesiona los derechos fundamentales tutelados.`;
        }
        if (/procedencia.*medida|procedencia.*cautelar/.test(titleKey)) {
          return `PROCEDENCIA DE LA MEDIDA CAUTELAR:\n\nLa suspensión solicitada resulta procedente toda vez que no se sigue perjuicio al interés social ni se contravienen disposiciones de orden público.`;
        }
        if (/apariencia.*buen.*derecho/.test(titleKey)) {
          return `APARIENCIA DEL BUEN DERECHO:\n\nSe acredita el fumus boni iuris mediante la verosimilitud del derecho alegado y la presunción de transgresión constitucional.`;
        }
        if (/peligro.*demora/.test(titleKey)) {
          return `PELIGRO EN LA DEMORA:\n\nExiste riesgo fundado de que la consumación del acto haga imposible restituir al quejoso en el goce de sus derechos fundamentales violados.`;
        }
        if (/garantia/.test(titleKey)) {
          return `GARANTÍA OFRECIDA:\n\nSe ofrece y solicita fijar la garantía suficiente para responder de los posibles daños y perjuicios que pudieran ocasionarse a terceros.`;
        }
        if (/antecedentes.*suspension/.test(titleKey)) {
          return `ANTECEDENTES DE LA SUSPENSIÓN:\n\nSe hace relación de los antecedentes procesales que justifican la necesidad de mantener la medida cautelar hasta la resolución definitiva.`;
        }
        if (/informe.*previo|informes.*previos/.test(titleKey)) {
          return `INFORMES PREVIOS RENDIDOS:\n\nDe los informes previos rendidos en autos se desprende la certeza de los actos reclamados atribuidos a las autoridades responsables.`;
        }
        if (/concesion.*definitiva|argumentos.*definitiva/.test(titleKey)) {
          return `ARGUMENTOS PARA LA CONCESIÓN DEFINITIVA:\n\nProcede conceder la suspensión definitiva al colmarse los extremos legales del artículo 128 y demás relativos de la Ley de Amparo.`;
        }
        if (/audiencia.*incidental/.test(titleKey)) {
          return `PRUEBAS EN LA AUDIENCIA INCIDENTAL:\n\nSe ofrecen y desahogan las pruebas documentales e instrumentales pertinentes para sustentar la concesión de la suspensión definitiva.`;
        }
        if (/relacion.*constancias/.test(titleKey)) {
          return `RELACIÓN DE CONSTANCIAS:\n\nSe hace relación pormenorizada de las actuaciones y constancias que integran el expediente de amparo para fundamentar los alegatos.`;
        }
        if (/informe.*justificado|informes.*justificados/.test(titleKey)) {
          return `VALORACIÓN DE INFORMES JUSTIFICADOS:\n\nLos informes con justificación no logran destruir la inconstitucionalidad de los actos reclamados ni acreditan causal válida de sobreseimiento.`;
        }
        if (/desvirtuacion|improcedencia/.test(titleKey)) {
          return `DESVIRTUACIÓN DE CAUSALES DE IMPROCEDENCIA:\n\nSe demuestra la inexistencia de causas notorias o manifiestas de improcedencia que impidan el pronunciamiento de fondo.`;
        }
        if (/confirmacion.*conceptos/.test(titleKey)) {
          return `CONFIRMACIÓN DE CONCEPTOS DE VIOLACIÓN:\n\nSe reiteran y fortalecen los conceptos de violación demostrando la transgresión irreparable a los derechos humanos del quejoso.`;
        }
        if (/resolucion.*recurrida|auto.*recurrido|acuerdo.*presidencial/.test(titleKey)) {
          return `RESOLUCIÓN O ACUERDO RECURRIDO:\n\nSe controvierte la determinación procesal que causa agravio directo e irreparable dentro de la tramitación de este juicio de amparo.`;
        }
        if (/agravio/.test(titleKey)) {
          return `AGRAVIOS:\n\nCausa agravio la errónea aplicación de la ley y la indebida motivación contenida en la resolución recurrida, vulnerando los principios de legalidad y debida defensa.`;
        }
        if (/cumplid.*ejecutoria|defecto.*exceso/.test(titleKey)) {
          return `MOTIVOS DE INCONFORMIDAD POR DEFECTO O EXCESO:\n\nSe formulan motivos de inconformidad acreditando que la autoridad incurrió en defecto y exceso en el cumplimiento de la ejecutoria de amparo.`;
        }
        if (/ejecutoria.*amparo|ejecutoria.*vinculante|sentencia.*firme/.test(titleKey)) {
          return `EJECUTORIA DE AMPARO VINCULANTE:\n\nConsta en autos la sentencia ejecutoriada dictada por la Justicia Federal que vincula a las autoridades responsables a su estricto acatamiento.`;
        }
        if (/acatamiento|cumplimiento.*efectuado/.test(titleKey)) {
          return `ACTOS DE ACATAMIENTO EFECTUADOS:\n\nSe desglosan las actuaciones formalmente ejecutadas para dar puntual acatamiento a los lineamientos protectores de la ejecutoria.`;
        }
        if (/constancias.*exhibidas|constancias/.test(titleKey)) {
          return `CONSTANCIAS EXHIBIDAS:\n\nSe exhiben y acompañan al presente escrito los documentos y constancias fehacientes que justifican las actuaciones procesales reportadas.`;
        }
        if (/requerimiento.*desatendido|apremio|multas/.test(titleKey)) {
          return `REQUERIMIENTOS DESATENDIDOS Y MEDIDAS DE APREMIO:\n\nAl no haberse acatado cabalmente el fallo protector, se solicita imponer a las responsables las medidas de apremio y multas de ley.`;
        }
        if (/cumplimiento.*defectuoso|no.*tener.*por.*cumplida/.test(titleKey)) {
          return `ANÁLISIS DEL CUMPLIMIENTO DEFECTUOSO O INCOMPLETO:\n\nLas constancias de autos revelan un cumplimiento aparente y defectuoso, por lo que procede no tener por cumplida la ejecutoria constitucional.`;
        }
        if (/preceptos.*violados/.test(titleKey)) {
          const precepts = amparoCtx?.preceptosViolados?.length
            ? amparoCtx.preceptosViolados.join(', ')
            : 'Artículos 1°, 14, 16 y 17 de la Constitución Política de los Estados Unidos Mexicanos';
          return `PRECEPTOS CONSTITUCIONALES VIOLADOS:\n\nSe vulneran en perjuicio del quejoso los preceptos: ${precepts}.`;
        }
        if (/conceptos.*violacion/.test(titleKey)) {
          return `CONCEPTOS DE VIOLACIÓN:\n\nÚNICO. Causa agravio a la parte quejosa el acto reclamado toda vez que contraviene los derechos fundamentales de legalidad, debido proceso y seguridad jurídica consagrados en la Constitución Federal.`;
        }
        if (/suspension/.test(titleKey)) {
          return `SUSPENSIÓN DEL ACTO RECLAMADO:\n\nSe solicita la suspensión de los actos reclamados para preservar la materia del juicio y evitar daños irreparables al promovente.`;
        }
      }
      if (isAdministrativo || isFiscal) {
        const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/resolucion.*impugnada|resolucion.*determinativa|resolucion.*fiscal|credito.*fiscal|credito.*impugnado|acto.*impugnado/.test(titleKey)) {
          const res = isFiscal
            ? (fiscalCtx?.resolucionDeterminativa?.value || '[DATO PENDIENTE: Número de resolución determinante]')
            : (adminCtx?.resolucionImpugnada?.value || '[DATO PENDIENTE: Número de resolución administrativa]');
          const cred = isFiscal ? `\nCrédito fiscal impugnado: ${fiscalCtx?.creditoFiscal?.value || '[DATO PENDIENTE: Importe o número de crédito fiscal]'}` : '';
          return `RESOLUCIÓN IMPUGNADA:\n\nResolución controvertida: ${res}${cred}\nEmitida por la autoridad demandada conculcando los derechos del promovente.`;
        }
        if (/autoridad.*demandada|autoridad.*emisora/.test(titleKey)) {
          return `AUTORIDAD DEMANDADA:\n\nSe señala como autoridad demandada a ${demandadoName}, con domicilio conocido en sus dependencias oficiales.`;
        }
        if (/fecha.*notificacion|notificacion/.test(titleKey)) {
          const fNotif = isFiscal
            ? (fiscalCtx?.fechaNotificacion?.value || '[DATO PENDIENTE: Fecha de notificación legal]')
            : (adminCtx?.fechaNotificacionResolucion?.value || '[DATO PENDIENTE: Fecha de notificación legal]');
          return `FECHA DE NOTIFICACIÓN:\n\nLa resolución recurrida fue notificada legalmente el ${fNotif}, encontrándose el presente medio de defensa en tiempo procesal oportuno.`;
        }
        if (/conceptos.*impugnacion|refutacion.*conceptos|ampliacion.*conceptos/.test(titleKey)) {
          return `CONCEPTOS DE IMPUGNACIÓN:\n\nÚNICO. Se controvierte de forma integral la validez del acto impugnado por actualizarse las causales de ilegalidad previstas en el artículo 51 de la Ley Federal de Procedimiento Contencioso Administrativo.`;
        }
        if (/contestacion.*hechos|hechos.*contestacion|contestacion.*demanda/.test(titleKey)) {
          return `CONTESTACIÓN A LOS HECHOS:\n\nSe da respuesta puntual a los hechos aducidos por la contraparte, negando aquellos que no consten fehacientemente en el expediente administrativo.`;
        }
        if (/alegatos.*bien.*probado|alegatos.*cierre|alegatos/.test(titleKey)) {
          return `ALEGATOS DE CIERRE:\n\nDel expediente integrado se corrobora que la parte promovente acreditó los extremos de su pretensión, deviniendo procedente el dictado de la resolución favorable.`;
        }
        if (/garantia.*interes.*fiscal|garantia/.test(titleKey)) {
          return `GARANTÍA DEL INTERÉS FISCAL:\n\nSe manifiesta haber otorgado o se solicita fijar los términos para garantizar el interés fiscal conforme al artículo 144 del Código Fiscal de la Federación.`;
        }
        if (/suspension.*acto|suspension.*fiscal|solicitud.*suspension/.test(titleKey)) {
          return `SUSPENSIÓN DE LA EJECUCIÓN DEL ACTO:\n\nSe solicita conceder la suspensión de la ejecución del acto combatido para evitar que se causen daños y perjuicios de imposible reparación al promovente.`;
        }
        if (/cumplimiento.*sentencia|actos.*cumplimiento|sentencia.*cumplir/.test(titleKey)) {
          return `CUMPLIMIENTO DE SENTENCIA:\n\nSe solicita requerir a la autoridad demandada el puntual y exacto cumplimiento de la sentencia firme de nulidad dictada en autos.`;
        }
        if (/resolucion.*recurrida|agravios.*revocacion|agravios.*revision/.test(titleKey)) {
          return `RESOLUCIÓN Y AGRAVIOS RECURRIDOS:\n\nSe expresan los motivos de inconformidad respecto de la determinación administrativa combatida para su revocación o modificación.`;
        }
        if (/nuevo.*hecho|nuevos.*hechos/.test(titleKey)) {
          return `NUEVOS HECHOS:\n\nSe exponen los hechos novedosos que fundamentan la ampliación con motivo de las constancias aportadas por la autoridad.`;
        }
        if (/motivo.*nulidad|agravios/.test(titleKey)) {
          return `MOTIVOS DE NULIDAD:\n\nSe exponen las razones por las cuales el acto recurrido carece de validez jurídica y transgrede las normas aplicables.`;
        }
      }
      if (isPenal) {
        const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/imputacion|individualizacion/.test(titleKey)) {
          const imp = penalCtx?.imputado?.value || '[DATO PENDIENTE: Persona imputada o investigada]';
          return `INDIVIDUALIZACIÓN DE PERSONAS IMPUTADAS:\n\nSe señala como persona investigada / probable partícipe a ${imp}, solicitando recabar sus datos de localización e identificación en autos de la carpeta.`;
        }
        if (/derechos.*victima/.test(titleKey)) {
          return `PLANTEAMIENTO Y DERECHOS DE LA VÍCTIMA REPRESENTADA:\n\nCon fundamento en el artículo 20 Apartado C de la Constitución General y artículos 108 y 109 del Código Nacional de Procedimientos Penales, se hace valer el catálogo de prerrogativas y derechos procesales de la víctima u ofendido.`;
        }
        if (/teoria.*caso|defensa.*tecnica/.test(titleKey)) {
          return `PLANTEAMIENTO DEFENSIVO Y TEORÍA DEL CASO:\n\nLa defensa técnica postula que no se actualizan los elementos del tipo penal atribuido, reservándose los actos de investigación y descargo pertinentes para el esclarecimiento de los hechos.`;
        }
        if (/pertinencia.*actos|pertinencia/.test(titleKey)) {
          return `JUSTIFICACIÓN PROCESAL Y PERTINENCIA DE LOS ACTOS:\n\nLas diligencias de investigación que se solicitan resultan idóneas, útiles y pertinentes para el esclarecimiento de los hechos materia de la indagatoria penal (Art. 216 CNPP).`;
        }
        if (/actos.*investigacion/.test(titleKey)) {
          return `ESPECIFICACIÓN DE ACTOS DE INVESTIGACIÓN SOLICITADOS:\n\nSe solicita al Agente del Ministerio Público ordenar y desahogar de manera inmediata las inspecciones, entrevistas y dictámenes periciales necesarios para la debida integración de la carpeta.`;
        }
        if (/acceso.*carpeta|acceso.*registro/.test(titleKey)) {
          return `DERECHO DE ACCESO A LOS REGISTROS DE LA CARPETA:\n\nEn observancia al principio de contradicción y debida defensa (Art. 218 CNPP), se solicita el acceso inmediato y completo a la carpeta de investigación y sus registros.`;
        }
        if (/autorizados/.test(titleKey)) {
          return `SEÑALAMIENTO DE PROFESIONISTAS AUTORIZADOS:\n\nSe autoriza a los profesionistas señalados en el proemio para imponerse de los autos, consultar registros y recibir toda clase de notificaciones y documentos.`;
        }
        if (/constancias.*solicitadas|copias/.test(titleKey)) {
          return `CONSTANCIAS DE LA CARPETA SOLICITADAS:\n\nSe solicita la expedición de copias simples o certificadas de las constancias, dictámenes y entrevistas que obran agregadas a la carpeta de investigación.`;
        }
        if (/fundamento.*copias/.test(titleKey)) {
          return `JUSTIFICACIÓN Y FUNDAMENTO JURÍDICO:\n\nLa expedición de copias encuentra su fundamento en el artículo 219 del Código Nacional de Procedimientos Penales y el derecho a una defensa técnica adecuada.`;
        }
        if (/situacion.*riesgo/.test(titleKey)) {
          return `SITUACIÓN DE RIESGO Y JUSTIFICACIÓN DE URGENCIA:\n\nSe exponen las condiciones de vulnerabilidad y peligro inminente que justifican la necesidad perentoria de dictar medidas de protección inmediatas en favor de la víctima.`;
        }
        if (/medidas.*proteccion/.test(titleKey)) {
          return `MEDIDAS DE PROTECCIÓN SOLICITADAS:\n\nSe solicita la imposición de las medidas previstas en el artículo 137 del Código Nacional de Procedimientos Penales, incluyendo vigilancia policial y prohibición de acercamiento a la víctima.`;
        }
        if (/coadyuvancia|adhesion/.test(titleKey)) {
          return `MANIFESTACIONES Y ADHESIÓN A LA ACUSACIÓN:\n\nEn ejercicio del derecho de coadyuvancia (Art. 338 CNPP), la víctima se adhiere a la acusación ministerial y precisa los puntos de hecho y derecho relativos a la reparación integral del daño.`;
        }
        if (/agravio/.test(titleKey)) {
          return `EXPRESIÓN DE AGRAVIOS PENALES:\n\nCausa agravio la resolución recurrida por indebida valoración de los datos o medios de prueba y por transgresión a las disposiciones del Código Nacional de Procedimientos Penales.`;
        }
        if (/oportunidad/.test(titleKey)) {
          return `OPORTUNIDAD PROCESAL:\n\nEl presente recurso se interpone dentro del término legal computado a partir de la notificación o pronunciamiento de la resolución en audiencia, conforme al CNPP.`;
        }
        if (/motivos.*revocacion|motivos.*inconformidad/.test(titleKey)) {
          return `MOTIVOS DE DISCONFORMIDAD Y REVOCACIÓN:\n\nSe exponen los vicios de forma y fondo que ameritan revocar el proveído de mero trámite recurrido para regularizar el procedimiento.`;
        }
        if (/planteamiento.*(?:ejecucion|juridico)|cumplimiento.*pena/.test(titleKey)) {
          return `PLANTEAMIENTO ANTE EL JUEZ DE EJECUCIÓN PENAL:\n\nSe comparece ante este Juzgado de Ejecución para solicitar la revisión y regularización del régimen penitenciario y el cómputo de la pena privativa de libertad.`;
        }
        if (/justificacion.*beneficio|beneficio/.test(titleKey)) {
          return `JUSTIFICACIÓN DE DERECHOS O BENEFICIO PENITENCIARIO:\n\nSe acreditan los requisitos previstos en la Ley Nacional de Ejecución Penal para acceder al beneficio preliberacional solicitado, exhibiendo constancias de reinserción social.`;
        }
      }
      if (isAgrario) {
        const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/prestacion/.test(titleKey)) {
          return `PRESTACIONES AGRARIAS:\n\n1. El reconocimiento y tutela de los derechos agrarios controvertidos.\n2. La restitución, declaratoria o nulidad correspondiente conforme a la Ley Agraria.`;
        }
        if (/objeto/.test(titleKey)) {
          return `OBJETO DEL ESCRITO:\n\nComparece ${firmanteName} en los autos del expediente agrario ${expedienteNum} para formular alegatos de conclusión sobre las pruebas rendidas y procedencia de la acción agraria.`;
        }
        if (/alegato/.test(titleKey)) {
          return `ALEGATOS AGRARIOS:\n\nDe las constancias de autos y pruebas desahogadas queda fehacientemente demostrada la posesión pacífica, continua y legítima de los derechos agrarios controvertidos.`;
        }
        if (/jurisprudencia/.test(titleKey)) {
          return `CRITERIOS JURISPRUDENCIALES APLICABLES:\n\nSe invocan las tesis y jurisprudencias emitidas por el Poder Judicial de la Federación y el Tribunal Superior Agrario en favor de la clase campesina y núcleos agrarios.`;
        }
        if (/resolucion.*recurrida/.test(titleKey)) {
          return `RESOLUCIÓN RECURRIDA:\n\nSe impugna la sentencia dictada por el Tribunal Unitario Agrario dentro del juicio agrario número ${expedienteNum}, causante de agravio directo.`;
        }
        if (/agravio/.test(titleKey)) {
          return `EXPRESIÓN DE AGRAVIOS AGRARIOS:\n\nCausa agravio la resolución recurrida por indebida interpretación de los preceptos de la Ley Agraria y omisión de valoración probatoria respecto de las constancias agrarias.`;
        }
        if (/cumplimiento.*hecho|peticiones.*ejecucion/.test(titleKey)) {
          return `CUMPLIMIENTO Y EJECUCIÓN AGRARIA:\n\nSe hace constar el estado de la sentencia agraria ejecutoriada y se solicitan las medidas apremiantes conducentes para su cabal cumplimiento.`;
        }
        if (/suspension/.test(titleKey)) {
          return `SUSPENSIÓN EN MATERIA AGRARIA:\n\nSe solicita conceder la suspensión de la ejecución del acto o resolución impugnada para preservar la materia de la controversia agraria.`;
        }
      }
      if (isInmobiliario) {
        const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/declaracion|declaraciones/.test(titleKey)) {
          const inm = inmobCtx?.inmuebleUbicacion?.value || '[DATO PENDIENTE: Ubicación del inmueble]';
          return `DECLARACIONES:\n\nI. Declara la parte arrendadora o vendedora ser legítima titular de los derechos sobre el bien inmueble ubicado en: ${inm}.\nII. Declara la contraparte contar con la capacidad legal, técnica y económica necesaria para contratar y obligarse en los términos del presente acto.`;
        }
        if (/clausula|clausulas/.test(titleKey)) {
          const renta = inmobCtx?.rentaOPrecio?.value || '[DATO PENDIENTE: Renta o precio pactado]';
          const vig = inmobCtx?.vigencia?.value || '[DATO PENDIENTE: Plazo de vigencia]';
          return `CLÁUSULAS:\n\nPRIMERA. OBJETO: Las partes celebran el presente acto jurídico respecto del inmueble materia de este instrumento.\nSEGUNDA. PRECIO O CONTRAPRESTACIÓN: Se fija de común acuerdo la cantidad de ${renta}.\nTERCERA. VIGENCIA Y CUMPLIMIENTO: El plazo de vigencia pactado será de ${vig}.\nCUARTA. JURISDICCIÓN: Las partes se someten a la competencia de los tribunales correspondientes.`;
        }
        if (/requerimiento|aviso/.test(titleKey)) {
          const adeudo = inmobCtx?.adeudoRentas?.value || '[DATO PENDIENTE: Monto del adeudo o rentas vencidas]';
          return `REQUERIMIENTO O AVISO FORMAL:\n\nPor medio del presente se requiere formalmente el pago inmediato de la cantidad adeudada por ${adeudo}, o en su caso la entrega y desocupación pacífica del bien inmueble.`;
        }
        if (/consecuencia.*plazo|plazo/.test(titleKey)) {
          return `CONSECUENCIAS LEGALES Y PLAZO:\n\nSe concede el plazo improrrogable legalmente aplicable para regularizar la situación, con el apercibimiento de que en caso de omisión se iniciarán las acciones legales pertinentes demandando desocupación, daños y perjuicios.`;
        }
        if (/prestacion/.test(titleKey)) {
          return `PRESTACIONES:\n\nA) La declaración de rescisión o terminación del contrato de arrendamiento o posesión.\nB) La inmediata desocupación y entrega material del inmueble arrendado.\nC) El pago de las cantidades o rentas vencidas hasta la total desocupación.`;
        }
        if (/derecho/.test(titleKey)) {
          return `FUNDAMENTOS DE DERECHO:\n\nResultan aplicables las disposiciones sustantivas y adjetivas del Código Civil y del Código de Procedimientos Civiles en materia de arrendamiento y contratos inmobiliarios.`;
        }
      }
      if (isCorporativo) {
        const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const soc = corpCtx?.sociedad?.value || '[DATO PENDIENTE: Denominación social]';
        if (/denominacion|objeto/.test(titleKey)) {
          return `DENOMINACIÓN Y OBJETO SOCIAL:\n\n1. Denominación social: ${soc}.\n2. Objeto social: ${corpCtx?.objetoSocial?.value || '[DATO PENDIENTE: Objeto social preponderante]'}.`;
        }
        if (/capital/.test(titleKey)) {
          return `CAPITAL SOCIAL Y ACCIONES:\n\nEl capital social suscrito y pagado es de ${corpCtx?.capitalSocial?.value || '[DATO PENDIENTE: Monto del capital social]'}, representado conforme a la ley y estatutos.`;
        }
        if (/administracion|vigilancia|organo/.test(titleKey)) {
          return `ÓRGANOS DE ADMINISTRACIÓN Y VIGILANCIA:\n\nLa administración de la sociedad está a cargo del Administrador Único o Consejo de Administración, y la vigilancia a cargo del Comisario designado.`;
        }
        if (/asistencia|quorum|orden.*dia/.test(titleKey)) {
          return `LISTA DE ASISTENCIA Y ORDEN DEL DÍA:\n\nSe comprueba el quórum legal estatutario y se desahoga el orden del día aprobado por unanimidad de votos.`;
        }
        if (/acuerdo|desarrollo/.test(titleKey)) {
          const acs = (corpCtx?.acuerdosAsamblea || []).map((a, i) => `${i + 1}. ${a}`).join('\n');
          return `DESARROLLO DE ACUERDOS:\n\nSe adoptan formalmente las siguientes resoluciones:\n${acs || '1. Se aprueban las resoluciones corporativas en todos sus términos.'}`;
        }
        if (/facultad|delegacion|poder/.test(titleKey)) {
          return `DELEGACIÓN DE FACULTADES Y FORMALIZACIÓN:\n\nSe otorgan o ratifican las facultades de representación y se autoriza al delegado especial para acudir ante Fedatario Público a protocolizar lo conducente.`;
        }
        if (/clausula/.test(titleKey)) {
          return `CLÁUSULAS CORPORATIVAS:\n\nPRIMERA. Las partes acuerdan las estipulaciones de gobierno corporativo y derechos recíprocos de observancia obligatoria.`;
        }
        if (/estatuto|estatutos/.test(titleKey)) {
          return `ESTATUTOS SOCIALES:\n\nSe aprueban los estatutos sociales que regirán la organización, funcionamiento y disolución de la sociedad.`;
        }
      }
      if (isContractual) {
        const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/declaracion|declaraciones/.test(titleKey)) {
          return `DECLARACIONES DE LAS PARTES:\n\nI. Declaran las partes contratantes contar con la capacidad legal, autorizaciones corporativas y facultades necesarias para suscribir el presente contrato.\nII. Se reconocen recíprocamente su personalidad y legitimación para obligarse.`;
        }
        if (/clausula|clausulas/.test(titleKey)) {
          const precio = contractCtx?.contraprestacionOPrecio?.value || '[DATO PENDIENTE: Precio o contraprestación pactada]';
          const vig = contractCtx?.vigenciaOPlazo?.value || '[DATO PENDIENTE: Vigencia o plazo convenido]';
          return `CLÁUSULAS:\n\nPRIMERA. OBJETO: Las partes acuerdan el objeto materia del presente contrato.\nSEGUNDA. PRECIO Y PAGO: Se pacta como contraprestación la cantidad de ${precio}.\nTERCERA. PLAZO Y VIGENCIA: El presente contrato surtirá efectos durante ${vig}.\nCUARTA. LEY Y JURISDICCIÓN: Para la interpretación y cumplimiento las partes se someten a las leyes aplicables y tribunales competentes.`;
        }
        if (/reconocimiento.*adeudo|reconocimiento.*obligacion/.test(titleKey)) {
          return `RECONOCIMIENTO DE ADEUDO:\n\nLa parte deudora reconoce deber a favor del acreedor la cantidad líquida y exigible convenida en este acto.`;
        }
        if (/forma.*pago|calendario/.test(titleKey)) {
          return `FORMA Y CALENDARIO DE PAGO:\n\nEl adeudo se cubrirá en las parcialidades y plazos expresamente calendarizados en el presente instrumento.`;
        }
        if (/mora|pena_convencional|pena/.test(titleKey)) {
          const pena = contractCtx?.penaConvencional?.value || '[DATO PENDIENTE: Pena convencional pactada]';
          return `PENA CONVENCIONAL Y CONSECUENCIAS DE LA MORA:\n\nEn caso de retraso o incumplimiento de cualquiera de las obligaciones, la parte infractora cubrirá una pena convencional equivalente a ${pena}.`;
        }
        if (/confidencialidad|secrecia/.test(titleKey)) {
          return `COMPROMISOS DE CONFIDENCIALIDAD:\n\nLas partes se obligan a guardar estricta reserva de toda la información técnica, financiera o comercial revelada, no pudiendo divulgarla a terceros sin autorización previa y por escrito.`;
        }
        if (/exclusividad|vigencia/.test(titleKey)) {
          return `EXCLUSIVIDAD Y VIGENCIA:\n\nEl presente acuerdo se pacta con carácter exclusivo durante el periodo de vigencia convenido por las partes.`;
        }
        if (/modificatoria|terminacion|subsistencia/.test(titleKey)) {
          return `ESTIPULACIONES DE MODIFICACIÓN O TERMINACIÓN:\n\nLas partes modifican puntualmente las cláusulas señaladas, ratificando la plena vigencia de todas las demás estipulaciones que no fueron modificadas.`;
        }
      }
      if (isPropiedadIntelectual) {
        const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/solicitante|apoderado|datos/.test(titleKey)) {
          return `DATOS DEL SOLICITANTE Y REPRESENTACIÓN:\n\nSe hace constar el nombre, nacionalidad y domicilio para oír notificaciones del promovente, así como la acreditación de la personería legal.`;
        }
        if (/signo|clase|distintivo/.test(titleKey)) {
          const signo = piCtx?.signoDistintivoUObra?.value || '[DATO PENDIENTE: Signo distintivo o marca]';
          const clase = piCtx?.claseNiza?.value ? `en la Clase ${piCtx.claseNiza.value}` : '[DATO PENDIENTE: Clase de Niza]';
          return `SIGNO DISTINTIVO Y CLASIFICACIÓN:\n\nSe solicita la protección y registro de: ${signo}, correspondiente a los productos y/o servicios de la ${clase} conforme a la Clasificación de Niza.`;
        }
        if (/impedimento|manifestacion/.test(titleKey)) {
          return `MANIFESTACIONES RESPECTO DEL IMPEDIMENTO LEGAL:\n\nSe desvirtúan de manera fundada y motivada las objeciones del examinador del IMPI, demostrando la distintividad intrínseca y la inexistencia de riesgo de confusión en el público consumidor.`;
        }
        if (/hechos.*infraccion|hechos.*oposicion|hechos.*nulidad|hechos.*caducidad/.test(titleKey)) {
          return `HECHOS:\n\nSe exponen de manera sucinta y circunstanciada los hechos que configuran la causal legal de infracción, oposición, nulidad o caducidad por falta de uso.`;
        }
        if (/derechos.*propiedad|propiedad_industrial/.test(titleKey)) {
          return `DERECHOS DE PROPIEDAD INDUSTRIAL INVOCADOS:\n\nResultan aplicables las disposiciones protectoras de la Ley Federal de Protección a la Propiedad Industrial que tutelan el derecho de uso exclusivo del signo y reprimen la competencia desleal.`;
        }
        if (/licencia|cesion|regalia|garantia/.test(titleKey)) {
          return `TÉRMINOS DE LA LICENCIA O CESIÓN DE DERECHOS:\n\nSe estipulan las condiciones de cesión o licencia de explotación del activo intangible, las regalías convenidas y las garantías de titularidad y pacífica posesión.`;
        }
        if (/anexo|tarifa/.test(titleKey)) {
          return `ANEXOS Y TARIFAS OFICIALES:\n\nSe exhibe el comprobante de pago de la tarifa oficial correspondiente y los documentos de acreditación de personalidad.`;
        }
      }
      if (isTramiteGeneral) {
        const titleKey = block.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/proveido.*referencia|acuerdo.*referencia|resolucion.*referencia|auto.*referencia/.test(titleKey)) {
          return `PROVEÍDO DE REFERENCIA:\n\nSe hace referencia al proveído dictado en el expediente ${expedienteNum}, notificado legalmente a esta parte, mediante el cual este H. Juzgado formuló prevención o requerimiento.`;
        }
        if (/desahogo.*prevencion|cumplimiento.*prevencion/.test(titleKey)) {
          return `DESAHOGO DE PREVENCIÓN:\n\nEn tiempo y forma legal, se desahoga la prevención judicial formulada, aclarando y subsanando los puntos prevenidos para que se admita a trámite la promoción correspondiente.`;
        }
        if (/requerimiento.*notificado|acuerdo.*notificado/.test(titleKey)) {
          return `REQUERIMIENTO NOTIFICADO:\n\nEn atención al mandamiento dictado por este Órgano Jurisdiccional y notificado legalmente, se comparece dentro del término de ley a dar cumplimiento al requerimiento formulado.`;
        }
        if (/manifestacion.*cumplimiento/.test(titleKey)) {
          return `MANIFESTACIÓN DE CUMPLIMIENTO:\n\nSe manifiesta bajo protesta de decir verdad que se ha dado puntual cumplimiento a lo ordenado por este H. Juzgado, exhibiendo las constancias conducentes para acreditarlo.`;
        }
        if (/documentos.*exhibidos|documentacion.*anexa|constancias.*acreditacion/.test(titleKey)) {
          return `DOCUMENTOS Y CONSTANCIAS EXHIBIDAS:\n\nSe exhiben y acompañan al presente ocurso los documentos y traslados conducentes que acreditan el debido cumplimiento de los extremos requeridos.`;
        }
        if (/acuerdo.*vista|constancia.*vista/.test(titleKey)) {
          return `ACUERDO O CONSTANCIA DE VISTA:\n\nSe comparece a desahogar la vista ordenada en autos respecto de los informes o manifestaciones rendidas por la contraria, dentro del plazo legal aplicable.`;
        }
        if (/manifestaciones.*derecho|manifestaciones.*hecho|manifestaciones/.test(titleKey)) {
          return `MANIFESTACIONES:\n\nSe formulan las consideraciones de hecho y de derecho convenientes al derecho de esta parte, desvirtuando lo aseverado por la contraparte y solicitando proveer conforme a las constancias de autos.`;
        }
        if (/efectos.*procesales/.test(titleKey)) {
          return `EFECTOS PROCESALES SOLICITADOS:\n\nSe solicita a su Señoría proveer lo conducente desestimando las pretensiones improcedentes de la contraria y acordando de conformidad con las constancias que obran agregadas.`;
        }
        if (/motivo.*comparecencia|objeto.*comparecencia|caracter.*personalidad/.test(titleKey)) {
          return `MOTIVO DE COMPARECENCIA Y PERSONALIDAD:\n\n${firmanteName} comparece ante este Órgano Jurisdiccional a fin de apersonarse formalmente en el juicio, señalando domicilio procesal y solicitando tener por reconocida la personalidad con que se ostenta.`;
        }
        if (/ratificacion.*manifestaciones|declaracion.*ratificacion/.test(titleKey)) {
          return `DECLARACIÓN EXPRESA DE RATIFICACIÓN:\n\nBajo protesta de decir verdad, la parte compareciente ratifica en todas y cada una de sus partes el contenido y firma del escrito o convenio de mérito, solicitando surta plenos efectos legales.`;
        }
        if (/actuacion.*ratificar|escrito.*ratificar|escrito.*referencia/.test(titleKey)) {
          return `ESCRITO O ACTUACIÓN DE REFERENCIA:\n\nSe precisa como actuación a ratificar el escrito presentado en autos con fecha reciente dentro del presente expediente, convalidando íntegramente sus efectos procesales.`;
        }
        if (/constancias.*solicitadas|actuaciones.*solicitadas|copias/.test(titleKey)) {
          return `CONSTANCIAS SOLICITADAS:\n\nSe solicita a este H. Juzgado ordenar a quien corresponda la expedición de copias de las actuaciones procesales y resoluciones dictadas en el juicio, a costa del promovente.`;
        }
        if (/pago.*derechos|motivo.*expedicion|justificacion.*copias/.test(titleKey)) {
          return `MOTIVO DE EXPEDICIÓN Y DERECHOS:\n\nLa expedición de las copias se solicita para salvaguardar el derecho de defensa y acreditar actuaciones ante diversas instancias, manifestando cubrir los derechos correspondientes.`;
        }
        if (/acceso.*solicitado|acceso.*expediente|consulta.*expediente/.test(titleKey)) {
          return `ACCESO FÍSICO Y ELECTRÓNICO SOLICITADO:\n\nSe solicita autorización formal para consultar e imponerse de los autos del expediente judicial, tanto en el local del tribunal como a través de la plataforma de consulta electrónica oficial.`;
        }
        if (/materia.*certificacion|constancias.*secretaria|certificacion/.test(titleKey)) {
          return `MATERIA DE LA CERTIFICACIÓN:\n\nSe solicita al C. Secretario de Acuerdos de este Juzgado certifique si ha fenecido el término legal concedido a las partes, o si la resolución dictada en autos ha causado ejecutoria.`;
        }
        if (/designacion.*abogados|abogados.*patronos/.test(titleKey)) {
          return `DESIGNACIÓN DE ABOGADOS PATRONOS:\n\nSe designa como abogados patronos con las más amplias facultades de representación procesal a los profesionistas autorizados en autos, con cédula registrada ante este Tribunal.`;
        }
        if (/alcance.*facultades|facultades.*otorgadas|facultades/.test(titleKey)) {
          return `ALCANCE DE FACULTADES:\n\nSe confieren facultades amplias para interponer recursos, rendir pruebas, intervenir en diligencias procesales y desahogar requerimientos conforme a la legislación aplicable.`;
        }
        if (/revocacion.*expresa|revocacion.*autorizados|personas.*revoca/.test(titleKey)) {
          return `REVOCACIÓN EXPRESA DE AUTORIZACIONES:\n\nSe revoca de manera expresa toda designación previa de abogados patronos, pasantes y domicilios procesales formulada en este juicio, solicitando impedirles el acceso a los autos.`;
        }
        if (/nuevos.*autorizados|nueva.*designacion/.test(titleKey)) {
          return `NUEVOS AUTORIZADOS:\n\nEn sustitución de los profesionistas revocados, se designa a los profesionistas mencionados en el proemio con las facultades legales correspondientes.`;
        }
        if (/nuevo.*domicilio|cambio.*domicilio|domicilio.*procesal/.test(titleKey)) {
          return `NUEVO DOMICILIO PROCESAL:\n\nSe señala como nuevo domicilio procesal para oír y recibir notificaciones el ubicado dentro de la demarcación territorial de este H. Juzgado, revocando cualquier domicilio previo.`;
        }
        if (/revocacion.*domicilio/.test(titleKey)) {
          return `REVOCACIÓN DE DOMICILIO ANTERIOR:\n\nSe tiene por expresamente revocado para todos los efectos legales el domicilio procesal anteriormente señalado en este juicio.`;
        }
        if (/medios.*electronicos|correo.*electronico|usuario.*electronico|notificacion.*digital/.test(titleKey)) {
          return `SEÑALAMIENTO DE MEDIOS ELECTRÓNICOS Y CORREO:\n\nSe señala la dirección de correo electrónico y usuario oficial del sistema judicial digital para oír y recibir notificaciones procesales y consultar el expediente virtual.`;
        }
        if (/manifestacion.*conformidad/.test(titleKey)) {
          return `MANIFESTACIÓN DE CONFORMIDAD:\n\nSe manifiesta conformidad expresa para que las resoluciones judiciales que procedan sean legalmente notificadas mediante el sistema de boletín o buzón electrónico judicial.`;
        }
        if (/estado.*actual|estado.*procesal/.test(titleKey)) {
          return `ESTADO ACTUAL DE LOS AUTOS:\n\nHabiendo transcurrido los términos legales y encontrándose desahogadas las diligencias procesales precedentes, los autos guardan estado propicio para continuar la secuela del procedimiento.`;
        }
        if (/solicitud.*impulso|impulso.*procesal/.test(titleKey)) {
          return `SOLICITUD DE IMPULSO PROCESAL:\n\nEn observancia al principio de expeditez y celeridad procesal consagrado en el artículo 17 Constitucional, se solicita dictar el proveído que abra la siguiente etapa procesal.`;
        }
        if (/expedientes.*acumular|acumulacion|conexidad.*causa|litispendencia/.test(titleKey)) {
          return `EXPEDIENTES Y CONEXIDAD DE LA CAUSA:\n\nSe solicita la acumulación de los juicios conexos por existir vinculación subjetiva u objetiva, a fin de privilegiar la continencia de la causa y evitar resoluciones contradictorias.`;
        }
        if (/causa.*acumulacion/.test(titleKey)) {
          return `CAUSA DE ACUMULACIÓN:\n\nExiste identidad o estrecha conexidad en las acciones, excepciones o cosas litigiosas que justifica plenamente la sustanciación conjunta ante el juzgado atrayente.`;
        }
        if (/causa.*archivo/.test(titleKey)) {
          return `CAUSA DE ARCHIVO O CONCLUSIÓN:\n\nSe hace constar que el presente asunto ha quedado totalmente concluido por cumplimiento voluntario o ejecutoria firme, sin que reste actuación procesal pendiente de trámite.`;
        }
        if (/solicitud.*remision.*archivo|archivo.*definitivo/.test(titleKey)) {
          return `SOLICITUD DE REMISIÓN AL ARCHIVO DEFINITIVO:\n\nSe solicita a este Órgano Jurisdiccional ordenar la remisión física de los autos al Archivo Judicial para su resguardo definitivo como asunto concluido.`;
        }
        if (/datos.*archivo|paquete.*archivo/.test(titleKey)) {
          return `DATOS DE ARCHIVO JUDICIAL:\n\nSe proporcionan los datos de paquete y legajo de resguardo en el Archivo Judicial a fin de facilitar la pronta localización y devolución del expediente.`;
        }
        if (/motivo.*desarchivo/.test(titleKey)) {
          return `MOTIVO DE DESARCHIVO:\n\nSe solicita girar atento oficio al Archivo Judicial para la devolución de los autos a este juzgado, a efecto de dar curso a diligencias de ejecución forzosa o expedición de constancias.`;
        }
        if (/declaracion.*desistimiento/.test(titleKey)) {
          return `DECLARACIÓN EXPRESA DE DESISTIMIENTO:\n\nEl promovente declara expresamente desistirse de la demanda o instancia promovida en contra del demandado, dando por terminado el procedimiento sin ulterior reclamación.`;
        }
        if (/alcance.*efectos|alcance.*desistimiento/.test(titleKey)) {
          return `ALCANCE Y EFECTOS DEL DESISTIMIENTO:\n\nEl desistimiento abarca la instancia procesal, solicitando en su caso dar la vista de ley a la contraria y decretar el sobreseimiento o archivo correspondiente sin costas.`;
        }
        if (/declaracion.*allanamiento/.test(titleKey)) {
          return `DECLARACIÓN EXPRESA DE ALLANAMIENTO:\n\nLa parte demandada comparece a allanarse íntegra e incondicionalmente a las pretensiones formuladas en la demanda inicial, aceptando los hechos aducidos.`;
        }
        if (/manifestaciones.*condena/.test(titleKey)) {
          return `MANIFESTACIONES SOBRE COSTAS Y CONDENA:\n\nEn atención al allanamiento formulado de forma inmediata y de buena fe, se solicita no emitir condena en costas judiciales en contra de esta parte demandada.`;
        }
        if (/clausulas.*convenio/.test(titleKey)) {
          return `CLÁUSULAS DEL CONVENIO JUDICIAL:\n\nPRIMERA. OBJETO: Las partes celebran la presente transacción judicial para poner fin a la controversia suscitada en el juicio.\nSEGUNDA. OBLIGACIONES: Las partes se obligan recíprocamente a los pagos, entregas y términos pactados de común acuerdo.\nTERCERA. EJECUCIÓN: En caso de mora o incumplimiento, la parte afectada podrá promover la inmediata ejecución forzosa en la vía de apremio.`;
        }
        if (/solicitud.*aprobacion|cosa.*juzgada/.test(titleKey)) {
          return `SOLICITUD DE ELEVACIÓN A COSA JUZGADA:\n\nSe solicita a su Señoría tener por presentado el convenio, ratificarlo en autos y elevarlo a la categoría de cosa juzgada para todos los efectos de ley.`;
        }
        if (/resolucion.*aclarar|resolucion.*objeto.*aclaracion/.test(titleKey)) {
          return `RESOLUCIÓN OBJETO DE ACLARACIÓN:\n\nSe señala como objeto de aclaración el proveído o auto notificado a esta parte, a fin de que se precisen las contradicciones u omisiones que impiden su cabal observancia.`;
        }
        if (/puntos.*obscuros|puntos.*contradictorios/.test(titleKey)) {
          return `PUNTOS OBSCUROS O CONTRADICTORIOS:\n\nSe señalan los puntos específicos que adolecen de ambigüedad procesal para que este Juzgado fije el sentido congruente que debe prevalecer.`;
        }
        if (/actuacion.*error|actuacion.*material/.test(titleKey)) {
          return `ACTUACIÓN QUE CONTIENE ERROR MATERIAL:\n\nSe identifica la actuación judicial notificada que contiene un lapsus calami o error aritmético involuntario susceptible de aclaración inmediata.`;
        }
        if (/precision.*error/.test(titleKey)) {
          return `PRECISIÓN DEL ERROR MATERIAL:\n\nSe precisa con toda exactitud: donde dice el texto erróneo, debe decir el texto correcto conforme a las constancias preexistentes en autos.`;
        }
        if (/documentos.*solicitados|documentos.*devolucion/.test(titleKey)) {
          return `DOCUMENTOS CUYA DEVOLUCIÓN SE SOLICITA:\n\nSe solicita la devolución formal de los documentos originales exhibidos en autos, por resultar indispensable su guarda directa por el interesado.`;
        }
        if (/copias.*cotejo|toma.*razon|autorizados.*recibir/.test(titleKey)) {
          return `COPIAS PARA COTEJO, TOMA DE RAZÓN Y AUTORIZADOS:\n\nSe dejan copias simples para su debido cotejo y certificación en autos, autorizando a las personas designadas para recibir los documentos originales previa toma de razón.`;
        }
        if (/profesionistas.*autorizados|personas.*autorizadas/.test(titleKey)) {
          return `PERSONAS Y PROFESIONISTAS AUTORIZADOS:\n\nSe autoriza a los profesionistas designados en autos para intervenir en el desahogo del presente trámite procesal.`;
        }
      }
      return `DESARROLLO DE BLOQUE: ${titleUpper}\n` +
        (safeBlockText ? `${safeBlockText.slice(0, 1200)}\n\n` : '') +
        `En relación con los autos del expediente ${expedienteNum}...`;
    }}
}

function shouldMaterializeSourceBackedProceduralReference(
  section: DocumentNode,
  doc: UniversalLegalDocument,
  caseAnalysis: CaseAnalysis | undefined,
  generated: {
    text?: string;
    aiUsed?: boolean;
    fallbackUsed?: boolean;
    isTruncated?: boolean;
  },
  coverageItemIds: readonly string[],
): boolean {
  if (!generated.text?.trim() || generated.aiUsed === true || generated.fallbackUsed !== true || generated.isTruncated) {
    return false;
  }

  const proceduralTimeline = caseAnalysis?.richCaseAnalysis?.proceduralTimeline || [];
  const hasSourceBackedEventInText = proceduralTimeline.some((event) =>
    event.provenance.length > 0
    && (generated.text?.includes(event.date) || generated.text?.includes(event.event))
  );
  if (!hasSourceBackedEventInText) return false;

  return Boolean(doc.coverageMatrix?.items.some((item) =>
    coverageItemIds.includes(item.id)
    && item.category === 'PROCEDURAL_REQUIREMENT'
    && item.sourceEntityType === 'PROCEDURAL_REQUIREMENT'
    && item.satisfactionPolicy === 'REFERENCE_ONLY'
    && item.targetSectionIds.includes(section.id)
  ));
}

/**
 * Compatibilidad: Genera cada sección jurídica (wrapper sobre generateLegalBlock)
 * Mantiene la firma original para no romper imports existentes.
 */
export async function generateSection(
  doc: UniversalLegalDocument,
  sectionId: string,
  instruction?: string,
  customGenerator?: (params: { section: DocumentNode; doc: UniversalLegalDocument }) => Promise<string> | string,
  lawyerProfile: LawyerProfile = DEFAULT_LAWYER_PROFILE,
  sectionPlan?: SectionPlan,
  caseAnalysis?: CaseAnalysis,
  trace?: GenerationTraceContext,
  issueProviderInvoker?: IssueProviderInvoker,
  maxIssueConcurrency?: number,
  researchBundlesByIssueId?: ReadonlyMap<string, LegalResearchBundle>,
  derivedReadinessByIssueId?: ReadonlyMap<string, DerivedIssueReadiness>,
): Promise<{
  text: string;
  blocks?: ContentBlock[];
  generationTasks?: GenerationTask[];
  taskAccounting?: {
    plannedTasks: number;
    attemptedTasks: number;
    acceptedTasks: number;
    rejectedTasks: number;
    blockedTasks: number;
    reviewRequiredTasks: number;
    unresolvedTasks: number;
  };
  warnings: string[];
  sources?: GeneratedSourceReference[];
  aiUsed?: boolean;
  aiProvider?: string;
  aiModel?: string;
  aiError?: string;
  finishReason?: string | null;
  isTruncated?: boolean;
  fallbackUsed?: boolean;
}> {
  const sec = doc.sections.find((s) => s.id === sectionId);
  if (!sec) return { text: '', warnings: ['Sección no encontrada'] };

  // A personal template is already lawyer-approved structure and prose. Keep
  // its order, formulas and depth, replacing only semantic fields for the new
  // matter. The style profile remains the fallback for generated documents;
  // it must not overwrite an explicitly selected personal template.
  if (doc.generationMetadata.generationMode === 'personal_template') {
    if (customGenerator) {
      const customText = await customGenerator({ section: sec, doc });
      const sanitized = sanitizeGeneratedText(String(customText));
      sec.content = [{
        id: `blk-${sec.id}`,
        text: sanitized,
        layer: 'GENERATED_ARGUMENT',
        trustLevel: 'AI_INFERENCE',
        provenance: 'AI_GENERATED',
        generationStatus: 'generated',
        generationRequirement: 'AI_REQUIRED',
      }];
      return {
        text: sanitized,
        warnings: [],
        sources: [],
        aiUsed: false,
        finishReason: 'stop',
        isTruncated: false,
        fallbackUsed: false,
      };
    }
    const intake = doc.intake;
    const variableValues: Record<string, string | undefined> = {
      actor: doc.parties.actor || intake?.representedParty,
      promovente: doc.parties.actor || intake?.representedParty,
      quejoso: doc.parties.quejoso || doc.parties.actor || intake?.representedParty,
      demandado: doc.parties.demandado || intake?.counterparty,
      autoridad: doc.parties.autoridadResponsable || intake?.authority,
      juzgado: doc.caseRefs.juzgado || doc.caseRefs.tribunal || intake?.authority,
      expediente: doc.caseRefs.expediente || intake?.caseNumber,
      domicilio: doc.variables?.domicilio?.value || undefined,
      fecha: undefined,
    };
    const templateText = sec.content?.map((content) => content.text).join('\n\n') || '';
    const rendered = templateText.trim()
      ? renderPersonalTemplateText(templateText, variableValues)
      : '[DATO PENDIENTE: Completar contenido de esta sección]';
    return {
      text: sanitizeGeneratedText(rendered, { parties: doc.parties, caseRefs: doc.caseRefs }),
      warnings: [],
      sources: [],
      aiUsed: false,
      finishReason: 'stop',
      isTruncated: false,
      fallbackUsed: false,
    };
  }

  // Adaptar DocumentNode a LegalBlock para reutilizar orchestrator
  const sectionTitleKey = sec.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const formalSection = ['header', 'identity', 'petition', 'closing', 'signature'].includes(sec.type);
  const hasConfirmedDefenses = Boolean(caseAnalysis?.arguments?.length);
  const hasEvidence = Boolean(caseAnalysis?.evidence?.length);
  const hasConfirmedFactPositions = Boolean(caseAnalysis?.facts?.some((fact) => fact.position && !['REQUIRE_LAWYER_INPUT', 'UNDETERMINED'].includes(fact.position)));
  const aiEligibleSection = !formalSection && (
    // Las respuestas punto por punto tienen un contrato estructurado y se
    // generan determinísticamente para no contradecir la postura elegida.
    false ||
    (/excepcion|defensa/.test(sectionTitleKey) && hasConfirmedDefenses) ||
    (/prueba|evidencia/.test(sectionTitleKey) && hasEvidence) ||
    (/alegato/.test(sectionTitleKey) && (hasConfirmedDefenses || hasConfirmedFactPositions)) ||
    // La revisión extraordinaria de amparo directo NO es una contestación
    // punto-por-punto: es una estrategia post-sentencia que requiere
    // argumentación desarrollada. Las secciones sustantivas SÍ son AI-elegibles.
    (isContestacionRevisionAmparoDirectoType(doc.documentType, doc.documentTypeLabel) && !/petitorio|firma|proemio|comparecencia|cierre/.test(sectionTitleKey)) ||
    (!isContestacionType(doc.documentType, doc.documentTypeLabel) && !/petitorio|firma|proemio|comparecencia/.test(sectionTitleKey))
  );
  // Construir índice temporal mínimo para el wrapper
  const tempIndex: DocumentIndex = {
    pages: doc.sourceDocuments.flatMap(s => s.pages || []),
    elements: [],
    headings: [],
    paragraphs: [],
    pageNumbers: [],
    signatures: [],
    tables: [],
    entities: [],
    dates: [],
    caseNumbers: [],
    authorities: [],
    citations: [],
    legalReferences: [],
    fullText: doc.sourceDocuments.map(s => s.extractedText || s.content || '').join('\n\n'),
    pageCount: doc.sourceDocuments.flatMap(s => s.pages || []).length || 1,
    sourceId: doc.sourceDocuments[0]?.id || 'compat',
    confidence: 80,
  } as DocumentIndex;

  // ── FASE 4: GENERACIÓN JERÁRQUICA POR GenerationTask (Issues, Claims, FactResponses) ──
  const hasHierarchicalPlans = Boolean(
    sectionPlan && (
      (sectionPlan.issuePlans && sectionPlan.issuePlans.length > 0) ||
      (sectionPlan.claimPlans && sectionPlan.claimPlans.length > 0) ||
      (sectionPlan.factResponsePlans && sectionPlan.factResponsePlans.length > 0) ||
      (caseAnalysis?.richCaseAnalysis && doc.legalIssueMatrix && (sectionPlan.coverageItemIds || [])
        .some((coverageItemId) => doc.legalIssueMatrix!.issues.some((issue) => issue.coverageItemIds.includes(coverageItemId))))
    )
  );

  if (hasHierarchicalPlans && sectionPlan) {
    const tasks = buildGenerationTasksForSection(sectionPlan, doc, caseAnalysis, doc.coverageMatrix);
    if (tasks.length > 0) {
      logGenerationPlan(sec.title, tasks);
      tasks.forEach((task) => trace?.recordTaskPlanned(task));

      if (caseAnalysis?.richCaseAnalysis && doc.legalIssueMatrix) {
        const researchInputs = { researchBundlesByIssueId, derivedReadinessByIssueId };
        const eligibleTasks = tasks.filter((task) => {
          const issueId = task.legalIssueIds?.[0] || task.issueId || task.targetIssueId;
          const issue = issueId ? doc.legalIssueMatrix!.issues.find((candidate) => candidate.id === issueId) : undefined;
          return resolveEffectiveIssueGenerationEligibility({
            issue,
            derivedReadiness: issue ? derivedReadinessByIssueId?.get(issue.id) : undefined,
            researchBundle: issue ? researchBundlesByIssueId?.get(issue.id) : undefined,
            formal: isFormalIssueTask(task, sec),
            taskType: task.taskType || task.type,
          }).eligible;
        });
        const issueOutcomes = await executeReadyIssueTasks(eligibleTasks, doc, caseAnalysis, {
          invokeProvider: issueProviderInvoker,
          maxConcurrency: maxIssueConcurrency ?? 3,
          trace,
          ...researchInputs,
        });
        const blockedOutcomes = tasks
          .filter((task) => !eligibleTasks.includes(task))
          .map((task) => buildBlockedIssueOutcome(task, doc.legalIssueMatrix, {
            ...researchInputs,
            formal: isFormalIssueTask(task, sec),
          }));
        const allOutcomes = [...issueOutcomes, ...blockedOutcomes];
        const outcomesByTaskId = new Map(allOutcomes.map((o) => [o.taskId, o]));
        const plannedTasks = tasks.length;
        let attemptedTasks = 0;
        let acceptedTasks = 0;
        let rejectedTasks = 0;
        let blockedTasks = 0;
        let reviewRequiredTasks = 0;
        let unresolvedTasks = 0;

        for (const task of tasks) {
          const outcome = outcomesByTaskId.get(task.id);
          if (!outcome) {
            unresolvedTasks += 1;
            task.status = 'pending';
            continue;
          }
          if (outcome.attempts && outcome.attempts.length > 0) {
            attemptedTasks += 1;
          }
          if (outcome.status === 'ACCEPTED') {
            acceptedTasks += 1;
            task.status = 'completed';
          } else if (outcome.status === 'BLOCKED') {
            blockedTasks += 1;
            task.status = 'blocked' as any;
          } else if (outcome.status === 'FAILED' || (outcome as any).status === 'REJECTED') {
            rejectedTasks += 1;
            task.status = 'failed';
          } else if (outcome.status === 'FALLBACK' || outcome.status === 'VALID_NON_FINAL' || (outcome as any).status === 'REQUIRES_REVIEW') {
            reviewRequiredTasks += 1;
            task.status = outcome.status === 'FALLBACK' ? 'fallback' : 'partial';
          } else {
            unresolvedTasks += 1;
          }
        }

        console.log(`[pipeline:accounting] Sección "${sec.title}": planned=${plannedTasks}, attempted=${attemptedTasks}, accepted=${acceptedTasks}, blocked=${blockedTasks}, reviewRequired=${reviewRequiredTasks}, rejected=${rejectedTasks}, unresolved=${unresolvedTasks}`);

        const assembled = assembleIssueDraftBlocks(sec, allOutcomes);
        sec.content = assembled.blocks;
        const allWarnings = [...assembled.warnings];
        if (unresolvedTasks > 0) {
          allWarnings.push(`TASK_ACCOUNTING_FAILED:${sec.id}:${unresolvedTasks}`);
        }
        for (const warning of allWarnings) trace?.addWarning(warning);
        for (const block of assembled.blocks) applySectionCoverageTransition(doc, sec, block, trace);
        const accepted = issueOutcomes.filter((outcome) => outcome.status === 'ACCEPTED');
        const anyFallback = issueOutcomes.some((outcome) => outcome.status === 'FALLBACK');
        const lastAttempt = issueOutcomes.flatMap((outcome) => outcome.attempts).at(-1);
        return {
          text: sec.content.map((block) => block.text).join('\n\n'),
          blocks: sec.content,
          generationTasks: tasks,
          taskAccounting: {
            plannedTasks,
            attemptedTasks,
            acceptedTasks,
            rejectedTasks,
            blockedTasks,
            reviewRequiredTasks,
            unresolvedTasks,
          },
          warnings: allWarnings,
          sources: [],
          aiUsed: accepted.length > 0,
          aiProvider: lastAttempt?.providerActuallyUsed,
          aiModel: lastAttempt?.model || undefined,
          finishReason: 'stop',
          isTruncated: false,
          fallbackUsed: anyFallback,
        };
      }

      const generatedBlocks: ContentBlock[] = [];
      const allWarnings: string[] = [];
      let anyAiUsed = false;
      let lastProvider: string | undefined;
      let lastModel: string | undefined;
      let hasAnyTruncated = false;
      let anyFallback = false;

      for (const task of tasks) {
        const { block, result } = await executeGenerationTask(
          task,
          doc,
          caseAnalysis,
          customGenerator,
        lawyerProfile,
          generatedBlocks,
          trace,
        );
        generatedBlocks.push(block);
        if (result.success && !result.fallbackUsed) {
          anyAiUsed = true;
          lastProvider = result.provider;
          lastModel = result.model;
        }
        if (result.fallbackUsed) anyFallback = true;
        if (result.isTruncated) hasAnyTruncated = true;
        allWarnings.push(...result.warnings);
        logTaskExecution(task, task.passes || 1, result);
      }

      // Ensamblado determinista respetando orden de DocumentPlan y machotes (4P, 4Q)
      sec.content = assembleSectionBlocks(sec, tasks, generatedBlocks);
      const assembledText = sec.content.map((b) => b.text).join('\n\n');

      // Actualizar CoverageMatrix con trazabilidad y estado 'generated' (4O)
      if (doc.coverageMatrix) {
        updateCoverageMatrixWithTaskResults(doc.coverageMatrix, tasks, {}, trace);
      }

      return {
        text: assembledText,
        blocks: sec.content,
        generationTasks: tasks,
        warnings: Array.from(new Set(allWarnings)),
        sources: [],
        aiUsed: anyAiUsed,
        aiProvider: lastProvider,
        aiModel: lastModel,
        finishReason: hasAnyTruncated ? 'length' : 'stop',
        isTruncated: hasAnyTruncated,
        fallbackUsed: anyFallback,
      };
    }
  }

  if (customGenerator) {
    const customText = await customGenerator({ section: sec, doc });
    const sanitized = sanitizeGeneratedText(String(customText));
    sec.content = [{
      id: `blk-${sec.id}`,
      text: sanitized,
      layer: 'GENERATED_ARGUMENT',
      trustLevel: 'AI_INFERENCE',
      provenance: 'AI_GENERATED',
      generationStatus: 'generated',
      generationRequirement: 'AI_REQUIRED',
    }];
    return { text: sanitized, warnings: [], aiUsed: true, aiProvider: 'custom', finishReason: 'stop', isTruncated: false, fallbackUsed: false };
  }

  const block: LegalBlock = {
    id: sec.id,
    kind: sec.type === 'argument' ? 'argument' : sec.type === 'header' ? 'encabezado' : sec.type as any,
    sectionType: sec.type,
    title: sec.title,
    level: 1,
    order: sec.order,
    // Las secciones formales se construyen determinísticamente con la
    // identidad procesal; las sustantivas sí reciben contexto y pueden ir a IA.
    text: aiEligibleSection ? sec.content.map(c => c.text).join('\n\n') : '',
    sourceElementIndices: [],
    pages: { start: 1, end: 1 },
    aiNeed: aiEligibleSection ? 'REQUIRES_AI' : 'PRESERVE_DIRECT',
    requiresAi: aiEligibleSection,
    classificationReason: 'Wrapper compatibilidad — sección legada',
    elementCount: sec.content.length,
    charCount: sec.content.map(c => c.text).join('\n\n').length,
    context: { facts: [], norms: [], jurisprudence: [], caseNumbers: [], authorities: [] },
    isManuallyEdited: Boolean((sec as any).isManuallyEdited || sec.content?.some((c: any) => c.isManuallyEdited)),
  };

  return generateLegalBlock(block, doc, tempIndex, caseAnalysis, instruction, undefined, lawyerProfile, sectionPlan);
}

// Compatibilidad hacia atrás: exposed como antes
export { buildGenerationContext } from './context';

export async function runGenerationPipeline(
  input: PipelineInput,
  callbacks?: PipelineCallbacks
): Promise<UniversalLegalDocument> {
  if (input.forceAiUnavailable) {
    throw new Error('Generación jurídica bloqueada: proveedor de generación no disponible.');
  }

  const rawSources = input.sourceDocuments || input.existingDocument?.sourceDocuments || [];
  const sources: UploadedSourceDocument[] = rawSources.map((source) =>
    markDocumentAsSource({ ...source }, source.id)
  );
  const lawyerProfile = input.lawyerProfile || DEFAULT_LAWYER_PROFILE;
  const userPrompt = input.userInstruction || input.prompt || '';
  const isReferenceDrivenRequest = input.workflow?.flow === 'DOCUMENT_ANALYSIS';

  if (sources.length === 0 && isReferenceDrivenRequest && input.workflow?.flow !== 'NEW_WRITING') {
    throw new Error('FLUJO_A_SOURCE_REQUIRED: El Flujo A requiere al menos un documento fuente validado; para escribir desde cero use el Flujo B.');
  }

  if (sources.length > 0 && requiresValidatedSources(sources)) {
    if (!input.allowUnvalidatedSource && !input.warningMode) {
      throw new Error('La fuente no está validada. Realice o confirme la validación/OCR antes de generar el documento.');
    }
  }

  const doc: UniversalLegalDocument = markDocumentAsDraft(
    input.existingDocument
      ? { ...input.existingDocument, updatedAt: new Date().toISOString() }
      : createEmptyDocument(),
  ) as UniversalLegalDocument;
  const generationId = input.generationId || `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  let traceContext: GenerationTraceContext | undefined;

  if (input.flow || input.workflow?.flow) {
    doc.flow = input.flow || input.workflow?.flow;
  }
  if (input.intake) {
    doc.intake = input.intake;
  }

  // Una lista vacía explícita también es una decisión: evita reintroducir
  // fuentes antiguas al regenerar un escrito desde cero (Flujo B).
  doc.sourceDocuments = sources;

  if (input.referenceDocumentText?.trim()) {
    const referenceDocument = createReferenceDocument({
      id: input.referenceDocumentId || 'reference-support',
      content: input.referenceDocumentText,
    });
    doc.generationMetadata.referenceDocumentLifecycle = readDocumentLifecycle(referenceDocument) || undefined;
  }

  const updateStage = (stage: PipelineStage, status: 'running' | 'complete' | 'error', error?: string) => {
    doc.generationMetadata.pipelineState.currentStage = status === 'running' ? stage : null;
    const existing = (doc.generationMetadata.pipelineState.stages as any)[stage];
    (doc.generationMetadata.pipelineState.stages as any)[stage] = {
      stage,
      status,
      startedAt: status === 'running' ? new Date().toISOString() : existing?.startedAt,
      completedAt: status === 'complete' ? new Date().toISOString() : undefined,
      error,
    };
  };

  const fullTextFromSources = sources
    .flatMap((s) => s.pages?.map((p) => p.text) || [s.extractedText || s.content || ''])
    .join('\n\n');

  const explicitSelectedDocumentType = input.selectedDocumentType?.trim()
    || (input.taxonomy?.documentType && input.taxonomy.documentType !== 'otro' ? input.taxonomy.documentType.trim() : undefined);
  const sourceDetectedTypeBeforeGeneration = inferSourceDocumentType(sources);
  let preflightRouting: DocumentRoutingResolution | undefined;
  let preflightSourceOutputCompatibility: SourceOutputCompatibilityResult | undefined;
  if (explicitSelectedDocumentType) {
    try {
      preflightRouting = resolveDocumentRouting({
        selectedDocumentType: explicitSelectedDocumentType,
        sourceDocumentType: sourceDetectedTypeBeforeGeneration,
      });
      preflightSourceOutputCompatibility = evaluateSourceOutputCompatibility({
        selectedDocumentType: explicitSelectedDocumentType,
        sourceDocuments: sources,
        sourceMatter: input.matter,
      });
      if (preflightSourceOutputCompatibility.status !== 'NOT_APPLICABLE') {
        console.log('[SourceOutputCompatibility]', JSON.stringify(preflightSourceOutputCompatibility));
      }
    } catch (error: any) {
      console.error('[DocumentRouting]', JSON.stringify({
        selectedType: explicitSelectedDocumentType,
        sourceDetectedType: sourceDetectedTypeBeforeGeneration,
        resolvedStrategy: null,
        resolvedTemplate: null,
        templateSource: null,
        fallbackUsed: false,
        outputFilename: null,
        error: error?.message || String(error),
      }));
      throw error;
    }
  }

  try {
    // ── Stage 1: Classify ──────────────────────────────────────────────────
    updateStage('classify', 'running');
    callbacks?.onStageStart?.('classify', doc);
    callbacks?.onProgressMessage?.('Clasificando el tipo de documento…');
    doc.classification = input.existingClassification || classifyIntent(userPrompt || fullTextFromSources || 'escrito libre');
    if (preflightRouting) {
      doc.classification = {
        ...doc.classification,
        documentType: preflightRouting.resolvedTemplate,
        documentTypeLabel: getDocumentTypeLabel(preflightRouting),
      };
    }
    if (input.matter) doc.classification = { ...doc.classification, matter: input.matter };
    if (input.documentTypeLabel) doc.classification = { ...doc.classification, documentTypeLabel: input.documentTypeLabel };
    doc.documentType = doc.classification.documentType;
    doc.documentTypeLabel = doc.classification.documentTypeLabel;
    doc.matter = doc.classification.matter;
    // BLOCK C — Taxonomía centralizada es fuente de verdad: si el frontend envía selección
    // explícita (incluyendo "Otro" con customValue), pisar la clasificación automática para
    // evitar divergencia Frontend vs Backend (§19). No se asume CDMX ni materia por defecto.
    if (input.taxonomy) {
      try {
        const tax = input.taxonomy as any;
        // jurisdiction: nunca hardcodear "Cd. de México" si no fue seleccionado
        if (tax.jurisdiction) {
          const effJuris = resolveJurisdictionLabel(tax);
          if (effJuris && effJuris.trim()) doc.jurisdiction = effJuris;
        }
        if (tax.matter) {
          const effMatter = resolveMatterLabel(tax);
          if (effMatter && effMatter.trim()) {
            doc.matter = effMatter;
            // También actualizar clasificación para trazabilidad
            doc.classification = { ...doc.classification, matter: tax.matter === 'otro' && tax.matterCustom?.customValue ? tax.matterCustom.customValue : tax.matter } as any;
          }
        }
        if (tax.documentType && !preflightRouting) {
          const effLabel = resolveDocumentTypeLabel(tax);
          if (effLabel && effLabel.trim()) {
            doc.documentTypeLabel = effLabel;
            doc.documentType = tax.documentType === 'otro' && tax.documentTypeCustom?.customValue ? 'escrito_libre' : tax.documentType;
            doc.classification = { ...doc.classification, documentType: doc.documentType, documentTypeLabel: effLabel } as any;
          }
        }
        // Persistir taxonomía completa en metadata para generación, RAG, historial, exportación
        (doc.generationMetadata as any).taxonomy = serializeTaxonomyForPipeline(tax);
        // También guardar custom values para auditoría
        (doc as any).taxonomySelection = tax;
      } catch (e) {
        console.warn('[pipeline:taxonomy] No se pudo aplicar taxonomía:', (e as Error)?.message);
      }
    }
    if (input.workflow?.flow === 'NEW_WRITING' && input.workflow.intake) {
      const intake = input.workflow.intake;
      doc.matter = intake.matter;
      doc.documentType = intake.documentType;
      doc.documentTypeLabel = intake.documentTypeLabel;
      doc.jurisdiction = intake.jurisdiction || '[DATO PENDIENTE: Jurisdicción]';
      doc.classification = {
        ...doc.classification,
        matter: intake.matter,
        documentType: intake.documentType,
        documentTypeLabel: intake.documentTypeLabel,
        jurisdiction: intake.jurisdiction || 'pendiente',
        objective: intake.objective || 'Objetivo pendiente de confirmar',
      };
    }
    if (preflightRouting) {
      doc.documentType = preflightRouting.resolvedTemplate;
      doc.documentTypeLabel = getDocumentTypeLabel(preflightRouting);
      doc.classification = {
        ...doc.classification,
        documentType: preflightRouting.resolvedTemplate,
        documentTypeLabel: doc.documentTypeLabel,
      } as any;
    }
    // FASE 10 — CONTINUIDAD DE IDENTIDAD en regeneraciones: un documento
    // existente conserva SU tipo documental (y por tanto SU plantilla) salvo
    // que el abogado pida expresamente otro rótulo. La instrucción nueva no
    // puede cambiar la identidad del documento.
    if (
      input.existingDocument?.documentType &&
      !input.existingClassification &&
      !input.documentTypeLabel
    ) {
      const prev = input.existingDocument;
      doc.classification = {
        ...doc.classification,
        documentType: prev.documentType,
        documentTypeLabel: prev.documentTypeLabel || doc.classification.documentTypeLabel,
        matter: input.matter || prev.matter || doc.classification.matter,
      };
      doc.documentType = doc.classification.documentType;
      doc.documentTypeLabel = doc.classification.documentTypeLabel;
      doc.matter = doc.classification.matter;
    }
    if (!input.existingDocument) {
      doc.title = `${doc.documentTypeLabel} - ${new Date().toLocaleDateString('es-MX')}`;
    }
    doc.generationMetadata.generationId = generationId;
    traceContext = createGenerationTraceContext({
      generationId,
      doc,
      providerRequested: 'NVIDIA',
      options: input.traceOptions,
    });
    updateStage('classify', 'complete');
    callbacks?.onStageComplete?.('classify', doc);

    // ── Stage 2: Extract + DocumentIndex (UNA SOLA VEZ) + CaseAnalysis ─────
    updateStage('extract', 'running');
    callbacks?.onStageStart?.('extract', doc);
    callbacks?.onProgressMessage?.('Extrayendo documento y construyendo índice estructural…');
    
    const reconstructedAnalysis = reconstructCaseAnalysis(
      sources,
      userPrompt,
      input.referenceDocumentText || '',
      { includeReferenceInAnalysis: input.workflow?.flow !== 'NEW_WRITING' }
    );
    const effectiveInputAnalysis = input.workflow?.analysis || (input as any).caseAnalysis;
    // Rich orchestration is explicit for callers that provide a rich analysis
    // or enable the trace-backed phase. Historical callers that only provide
    // the legacy workflow contract continue through the legacy compatibility
    // path; this prevents a newly attached extractor snapshot from changing
    // their generated legal wording or export expectations implicitly.
    const richPipelineRequested = Boolean(
      effectiveInputAnalysis?.richCaseAnalysis
      || (!effectiveInputAnalysis && input.traceOptions?.enabled),
    );
    const caseAnalysis: CaseAnalysis = effectiveInputAnalysis
      ? {
          ...reconstructedAnalysis,
          ...effectiveInputAnalysis,
          parties: { ...reconstructedAnalysis.parties, ...effectiveInputAnalysis.parties },
          facts: effectiveInputAnalysis.facts?.length ? effectiveInputAnalysis.facts : reconstructedAnalysis.facts,
          claimResponses: effectiveInputAnalysis.claimResponses?.length ? effectiveInputAnalysis.claimResponses : reconstructedAnalysis.claimResponses,
          // A caller that supplies the legacy analysis contract has not
          // supplied a canonical rich snapshot. Keep that explicit legacy
          // input on its compatibility path instead of silently mixing it
          // with newly extracted rich entities from the source documents.
          richCaseAnalysis: richPipelineRequested
            ? (effectiveInputAnalysis.richCaseAnalysis || reconstructedAnalysis.richCaseAnalysis)
            : undefined,
        }
      : richPipelineRequested
        ? reconstructedAnalysis
        : { ...reconstructedAnalysis, richCaseAnalysis: undefined };
    // El modo seguro de escritura desde cero debe llegar explícitamente en el
    // workflow. Los consumidores históricos sin workflow conservan su contrato
    // anterior; la UI nueva siempre construye `flow: NEW_WRITING`.
    doc.flow = input.flow || input.workflow?.flow || doc.flow || (sources.length > 0 ? 'DOCUMENT_ANALYSIS' : undefined);
    doc.intake = input.intake || input.workflow?.intake || doc.intake;
    doc.caseAnalysis = caseAnalysis;
    traceContext?.snapshotCaseAnalysis(caseAnalysis);

    doc.parties = {
      quejoso: caseAnalysis.parties.quejoso || doc.parties.quejoso,
      actor: caseAnalysis.parties.actor || doc.parties.actor,
      demandado: caseAnalysis.parties.demandado || doc.parties.demandado,
      autoridadResponsable: caseAnalysis.parties.autoridadResponsable || doc.parties.autoridadResponsable,
      terceroInteresado: caseAnalysis.parties.terceroInteresado || doc.parties.terceroInteresado,
    };

    // A5: las partes confirmadas (manual > detected) pisan a las inferidas del texto crudo.
    applySavedCaseParties(doc, input.savedParties);
    (doc as any).caseParties = input.savedParties;

    const caseContext = buildCaseContext(
      sources,
      caseAnalysis,
      doc.parties,
      input.civilManualInput || input.context?.civilManualInput,
      preflightRouting?.resolvedTemplate === 'demanda_ejecutiva_mercantil'
        ? input.commercialManualInput || input.context?.commercialManualInput || {}
        : undefined,
      preflightRouting?.resolvedTemplate,
    );
    doc.caseContext = caseContext;
    doc.missingFields = caseContext.missingFields;
    doc.anonymizedFields = caseContext.anonymizedFields;

    if (preflightSourceOutputCompatibility && preflightSourceOutputCompatibility.status !== 'NOT_APPLICABLE') {
      const sourceOutputCompatibility = evaluateSourceOutputCompatibility({
        selectedDocumentType: explicitSelectedDocumentType,
        sourceDocuments: sources,
        sourceMatter: input.matter,
        sourceAnalysis: {
          numberedFacts: caseAnalysis.facts,
          complaintFacts: caseAnalysis.facts,
          sourceClaims: caseAnalysis.claimResponses?.length ? caseAnalysis.claimResponses : caseAnalysis.claims,
          complaintClaims: caseAnalysis.claimResponses,
        },
      });
      doc.generationMetadata.sourceOutputCompatibility = sourceOutputCompatibility;
      if (sourceOutputCompatibility.status === 'NEEDS_INPUT') {
        doc.missingFields = Array.from(new Set([
          ...(doc.missingFields || []),
          ...sourceOutputCompatibility.missingRequirements,
        ]));
      }
      console.log('[SourceOutputCompatibility]', JSON.stringify(sourceOutputCompatibility));
    }

    doc.caseRefs = {
      expediente: caseAnalysis.caseNumbers.principal || doc.caseRefs.expediente,
      amparo: caseAnalysis.caseNumbers.amparoDirecto || caseAnalysis.caseNumbers.amparoIndirecto,
      toca: caseAnalysis.caseNumbers.toca,
    };
    // P0: un expediente explícito prevalece sobre cualquier referencia residual de la fuente.
    if (input.expediente && input.expediente.trim()) {
      doc.caseRefs.expediente = input.expediente.trim();
    } else if (input.taxonomy && (input.taxonomy as any).expediente) {
      // Fallback si taxonomy trae expediente
      const taxExp = String((input.taxonomy as any).expediente).trim();
      if (taxExp) doc.caseRefs.expediente = taxExp;
    }

    doc.variables = buildVariableMap(doc.parties, doc.caseRefs, input.context?.variables || input.extraValues);

    // Construir índice estructural REUTILIZABLE (una sola vez)
    let documentIndex: DocumentIndex | null = null;
    let detectedSections: DetectedSection[] = [];
    let blockPlan: BlockPlan | null = null;

    if (sources.length > 0) {
      try {
        documentIndex = buildDocumentIndex(sources, { referenceText: input.referenceDocumentText });
        (doc as any).documentIndex = {
          pageCount: documentIndex.pageCount,
          elementCount: documentIndex.elements.length,
          confidence: documentIndex.confidence,
          caseNumbers: documentIndex.caseNumbers.slice(0, 5),
          authorities: documentIndex.authorities.slice(0, 5),
        };
        // Detectar estructura jurídica determinísticamente
        detectedSections = parseLegalStructure(documentIndex);
        (doc as any).detectedStructure = detectedSections.map(s => ({ kind: s.kind, title: s.title, level: s.level, pages: `${s.pageStart}-${s.pageEnd}` }));
        // Planificar bloques
        blockPlan = buildBlockPlan(documentIndex, detectedSections);
        (doc as any).blockPlan = {
          summary: blockPlan.summary,
          totalBlocks: blockPlan.totalBlocks,
          aiBlocks: blockPlan.aiBlocks.length,
          preserveBlocks: blockPlan.preserveBlocks.length,
          efficiency: blockPlan.efficiency,
        };
        console.log(`[pipeline:index] ${blockPlan.summary}`);
      } catch (e: any) {
        console.warn('[pipeline:index] Falló construcción de índice, usando fallback genérico:', e?.message);
      }
    }

    updateStage('extract', 'complete');
    callbacks?.onStageComplete?.('extract', doc);

    // ── Stage 3: Analyze ───────────────────────────────────────────────────
    updateStage('analyze', 'running');
    callbacks?.onStageStart?.('analyze', doc);
    callbacks?.onProgressMessage?.('Analizando estructura jurídica…');
    // Reutilizar índice para contexto de análisis (no reconstruir)
    const analysisContext = documentIndex
      ? { text: documentIndex.fullText.slice(0, 5000), references: [] as GeneratedSourceReference[], chunks: [] as any[] }
      : buildGenerationContext({
          instruction: `Análisis procesal y fijación de teoría del caso para ${doc.documentTypeLabel}`,
          sources,
          limit: 10,
        });
    // Enriquecer análisis con bloques si existen
    const noteBase = `Reconstruido expediente con ${caseAnalysis.proceduralTimeline.length} eventos procesales y ${sources.length} documentos fuente reales.`;
    const noteExtra = blockPlan ? ` Índice: ${documentIndex?.pageCount} págs / ${documentIndex?.elements.length} elementos → ${blockPlan.totalBlocks} bloques (${blockPlan.aiBlocks.length} con IA).` : '';
    doc.generationMetadata.trace = (doc.generationMetadata.trace || []).concat({
      step: 1,
      stage: 'analyze',
      query: doc.documentTypeLabel,
      references: (analysisContext as any).references || [],
      note: `${noteBase}${noteExtra}`,
    });
    updateStage('analyze', 'complete');
    callbacks?.onStageComplete?.('analyze', doc);

    // ── Stage 4: Structure — PLAN DOCUMENTAL ÚNICO ─────────────────────────
    updateStage('structure', 'running');
    callbacks?.onStageStart?.('structure', doc);
    callbacks?.onProgressMessage?.('Construyendo el plan documental del tipo…');

    // FASES 4/5/10/11 — SEPARACIÓN ABSOLUTA FUENTE/SALIDA + IDENTIDAD ÚNICA:
    //   UN DOCUMENTO → UN PLAN → UNA PLANTILLA → UN GENERATIONID.
    // El expediente fuente es REFERENCE_ONLY: alimenta análisis y prompts,
    // JAMÁS crea secciones. La estructura proviene de UN SOLO origen:
    //   MACHOTE (aportado expresamente por el abogado) | TEMPLATE (GENERATED).
    // El blockPlan del expediente queda como CONTEXTO DE REFERENCIA para los
    // prompts; nunca como esqueleto del documento.
    // El rótulo EXPLÍCITO de la UI tiene precedencia sobre la inferencia del
    // clasificador (intención del abogado ≠ regla genérica).
    const routing = resolveDocumentRouting({
      selectedDocumentType: explicitSelectedDocumentType,
      inferredDocumentType: doc.documentType,
      documentTypeLabel: input.documentTypeLabel,
      sourceDocumentType: inferSourceDocumentType(sources, caseAnalysis),
      outputFilename: doc.title,
    });
    const docTemplate = routing.template;
    doc.documentType = routing.resolvedTemplate;
    const customDocumentTypeLabel = input.taxonomy?.documentType === 'otro'
      ? input.taxonomy.documentTypeCustom?.customValue?.trim()
      : undefined;
    doc.documentTypeLabel = customDocumentTypeLabel || getDocumentTypeLabel(routing);
    doc.classification = {
      ...doc.classification,
      documentType: doc.documentType,
      documentTypeLabel: doc.documentTypeLabel,
    } as any;
    doc.generationMetadata.routing = {
      selectedDocumentType: routing.selectedDocumentType,
      sourceDocumentType: routing.sourceDocumentType,
      resolvedStrategy: routing.resolvedStrategy,
      resolvedTemplate: routing.resolvedTemplate,
      templateSource: routing.templateSource,
      fallbackUsed: routing.fallbackUsed,
      outputFilename: routing.outputFilename,
    };
    console.log('[DocumentRouting]', JSON.stringify({
      selectedType: routing.selectedDocumentType || null,
      sourceDetectedType: routing.sourceDocumentType,
      resolvedStrategy: routing.resolvedStrategy,
      resolvedTemplate: routing.resolvedTemplate,
      templateSource: routing.templateSource,
      fallbackUsed: routing.fallbackUsed,
      outputFilename: routing.outputFilename,
    }));
    const preflight = routing.templateSource !== 'SAFE_FALLBACK'
      ? runDocumentPreflight(routing.resolvedTemplate, sources, caseContext, caseAnalysis)
      : runDocumentPreflight(doc, docTemplate, caseAnalysis);
    (doc.generationMetadata as any).preflight = preflight;
    if (preflight.status === 'NOT_APPLICABLE') {
      throw new DocumentRoutingError(
        'INCOMPATIBLE_DOCUMENT_ROUTE',
        `PROCEDURAL_VIABILITY_FAILED: ${preflight.warnings.join(' ')}`,
      );
    }
    if (preflight.missingFields.length > 0) {
      doc.missingFields = Array.from(new Set([
        ...(doc.missingFields || []),
        ...preflight.missingFields.map((field) => field.label),
      ]));
    }
    const proceduralIdentity = buildProceduralIdentity(doc, docTemplate, sources, caseAnalysis);
    doc.proceduralIdentity = proceduralIdentity;
    doc.generationMetadata.proceduralIdentity = proceduralIdentity;
    doc.classification = {
      ...doc.classification,
      sourceDocumentType: proceduralIdentity.sourceDocumentType,
      representedParty: proceduralIdentity.representedParty,
      proceduralPosition: proceduralIdentity.proceduralPosition,
      targetDocument: proceduralIdentity.targetDocument,
      proceduralObjective: proceduralIdentity.objective,
    };
    const plan = buildDocumentPlan({
      doc,
      template: docTemplate,
      caseAnalysis,
      savedParties: input.savedParties as any,
      referenceText: input.referenceDocumentText,
      useReferenceStructure: input.workflow?.selection.mode === 'personal_template' || input.workflow?.selection.mode === 'reference_document',
    });
    doc.sections = plan.sections.filter((section) => !(
      isContestacionType(doc.documentType, doc.documentTypeLabel) &&
      /alegato/i.test(section.title) &&
      !shouldIncludeAlegatos(input)
    ));
    // Rich planning owns one canonical matrix for the remainder of the
    // pipeline.  Do not rebuild it from legacy projections after the
    // structure stage.
    if (plan.coverageMatrix) {
      doc.coverageMatrix = plan.coverageMatrix;
    }
    if (plan.legalIssueMatrix) {
      doc.legalIssueMatrix = plan.legalIssueMatrix;
    }
    doc.templateId = plan.templateId;
    traceContext?.snapshotDocumentPlan(plan);
    const workflowMode: GenerationMode = input.workflow?.selection.mode || 'automatic';
    doc.generationMetadata.generationMode = workflowMode;
    doc.generationMetadata.selectedTemplateId = input.workflow?.selection.templateId || null;
    doc.generationMetadata.referenceDocumentId = input.workflow?.selection.referenceDocumentId || input.referenceDocumentId || null;
    doc.generationMetadata.provenance = [
      ...(workflowMode === 'automatic' ? [] : ['TEMPLATE_STRUCTURE' as const]),
      'AI_GENERATED',
    ];
    doc.generationMetadata.trace = [
      ...(doc.generationMetadata.trace || []),
      {
        step: 0,
        stage: 'source_selection',
        query: workflowMode,
        references: [],
        note: workflowMode === 'automatic'
          ? 'Estructura seleccionada dinámicamente con base en clasificación y análisis del asunto.'
          : 'Estructura y estilo saneados del origen seleccionado; los datos del asunto histórico permanecen excluidos.',
      },
    ];
    console.log(
      `[pipeline:plan] planSource=${plan.planSource} · template=${plan.templateId} · generationId=${generationId} · ${doc.sections.length} secciones canónicas · expediente REFERENCE_ONLY (${sources.length} fuente(s))`
    );

    updateStage('structure', 'complete');
    callbacks?.onStageComplete?.('structure', doc);

    // ── Stage 5: Identify Issues, Case Theory & Drafting Plan ──────────────
    const planIntegrityFindings: DocumentAssemblyFinding[] = [];
    updateStage('identify_issues', 'running');
    callbacks?.onStageStart?.('identify_issues', doc);
    callbacks?.onProgressMessage?.('Fijando teoría del caso…');
    const draftingPlan = buildDraftingPlan(
      doc,
      input.referenceDocumentText?.length || 0,
      caseAnalysis,
      doc.coverageMatrix,
      plan.legalIssueMatrix,
    );
    (doc as any).draftingPlan = draftingPlan;
    if (draftingPlan.coverageMatrix) {
      doc.coverageMatrix = draftingPlan.coverageMatrix;
      try {
        const effectiveMatrix = draftingPlan.legalIssueMatrix || plan.legalIssueMatrix || doc.legalIssueMatrix;
        const invCheck = validateCoverageAndPlanInvariants(draftingPlan.coverageMatrix, draftingPlan, caseAnalysis, effectiveMatrix);
        if (!invCheck.ok) {
          console.warn('[pipeline:coverage] Alertas en invariantes de cobertura/plan:', invCheck.errors);
          const planRefErrors = invCheck.errors.filter((e) => e.includes('referencia un issueId inexistente') || e.includes('coverageItemId inexistente'));
          if (planRefErrors.length > 0) {
            planIntegrityFindings.push({
              code: 'PLAN_REFERENTIAL_INTEGRITY_FAILED',
              severity: 'BLOCKER',
              message: `Violación de integridad referencial en el plan de redacción: ${planRefErrors.join('; ')}`,
              reason: 'PLAN_REFERENTIAL_INTEGRITY_FAILED',
              blockIds: [],
              legalIssueIds: [],
              coverageItemIds: [],
              sectionIds: [],
            });
          }
        }
      } catch (err) {
        console.warn('[pipeline:coverage] Error no fatal al validar invariantes:', err);
      }
    }
    traceContext?.snapshotCoverageBefore(doc.coverageMatrix);
    updateStage('identify_issues', 'complete');
    callbacks?.onStageComplete?.('identify_issues', doc);

    // ── Stage 6: Generate (POR SECCIÓN CANÓNICA del plan único) ────────────
    updateStage('generate_sections', 'running');
    callbacks?.onStageStart?.('generate_sections', doc);
    {
      const realTotal = doc.sections.length;
      jobUpdate((input as any).jobId, { total: realTotal, completed: 0, stage: `Generando ${realTotal} secciones (plan ${doc.templateId})`, currentBlock: null, currentBlockIndex: null });
    }

    let pipelineAiUsed = false;
    let pipelineAiProvider: string | undefined;
    let pipelineAiModel: string | undefined;
    let pipelineAiError: string | undefined;
    let assemblyParagraphIndex = 0;
    const accumulatedGenerationTasks: GenerationTask[] = [];
    const taskAccountingFindings: DocumentAssemblyFinding[] = [];

    console.log(`[pipeline] Generando ${doc.sections.length} secciones bajo el plan ${doc.templateId} (${plan.planSource})...`);
    let completedBlocks = 0;

    for (let i = 0; i < doc.sections.length; i++) {
      const section = doc.sections[i];
      const sectionStart = Date.now();

      if (input.targetSection && section.id !== input.targetSection) {
        continue;
      }

      const sectionIsManuallyEdited = section.isManuallyEdited || section.content?.some((b) => b.isManuallyEdited);
      if (sectionIsManuallyEdited && input.existingDocument) {
        continue;
      }

      const secPlan = draftingPlan.sections.find((p) => p.templateSectionId === section.id);
      // Instrucción enfocada por sección para el esqueleto de contestación.
      const sectionFocused = isContestacionRevisionAmparoDirectoType(doc.documentType, doc.documentTypeLabel)
        ? REVISION_AMPARO_DIRECTO_SECTION_INSTRUCTIONS[section.id]
        : CONTESTACION_SECTION_INSTRUCTIONS[section.id];
      const combinedInstruction = sectionFocused
        ? `${input.sectionInstruction || input.userInstruction || ''}\n\nINSTRUCCIÓN DE SECCIÓN: ${sectionFocused}`
        : (input.sectionInstruction || input.userInstruction);
      const generatedRaw = await generateSection(
        doc,
        section.id,
        combinedInstruction,
        input.generateSection,
        lawyerProfile,
        secPlan,
        caseAnalysis,
        traceContext,
        input.issueProviderInvoker,
        input.maxIssueConcurrency,
        input.researchBundlesByIssueId,
        input.derivedReadinessByIssueId,
      );
      if (generatedRaw.generationTasks?.length) {
        accumulatedGenerationTasks.push(...generatedRaw.generationTasks);
      }
      if (generatedRaw.taskAccounting && generatedRaw.taskAccounting.unresolvedTasks > 0) {
        taskAccountingFindings.push({
          code: 'TASK_ACCOUNTING_FAILED',
          severity: 'BLOCKER',
          message: `Fallo en contabilidad de tareas en sección "${section.title}": ${generatedRaw.taskAccounting.unresolvedTasks} tareas requeridas no tienen resultado terminal.`,
          reason: 'TASK_ACCOUNTING_FAILED',
          blockIds: [],
          legalIssueIds: [],
          coverageItemIds: [],
          sectionIds: [section.id],
        });
      }
      // Contrato de seguridad: cuando existen planes detallados (Fase 4), se respeta la generación
      // circunstanciada e individualizada; si no existen planes detallados, se aplica la postura canónica base.
      const hasDetailedContestPlans = Boolean(
        secPlan && (
          (secPlan.claimPlans && secPlan.claimPlans.length > 0) ||
          (secPlan.factResponsePlans && secPlan.factResponsePlans.length > 0)
        )
      );
      const isStructuredContestResponse = !hasDetailedContestPlans && isDemandContestacionType(doc.documentType, doc.documentTypeLabel) && /hechos|prestacion|pretension/i.test(section.title);
      const generated = isStructuredContestResponse
        ? {
            ...generatedRaw,
            text: /hechos/i.test(section.title)
              ? `CONTESTACIÓN DE HECHOS\n\n${buildFactResponseText(caseAnalysis)}`
              : `CONTESTACIÓN DE PRESTACIONES\n\n${buildClaimResponseText(caseAnalysis)}`,
            warnings: generatedRaw.warnings.concat('Contrato canónico de postura aplicado; se descartó cualquier resolución no confirmada del proveedor.'),
          }
        : generatedRaw;
      const effectiveAiUsed = generated.aiUsed ?? true;

      const sectionMs = Date.now() - sectionStart;
      console.log(`[pipeline] Sección ${i + 1}/${doc.sections.length} "${section.title}" completada en ${sectionMs}ms (aiUsed: ${generated.aiUsed}, provider: ${generated.aiProvider || 'none'})`);

      if (effectiveAiUsed) {
        pipelineAiUsed = true;
        pipelineAiProvider = generated.aiProvider || pipelineAiProvider;
        pipelineAiModel = generated.aiModel || pipelineAiModel;
      } else if (generated.aiError) {
        pipelineAiError = generated.aiError;
      }

      const hasSeed = hasSeedMarkers(generated.text);
      const isTruncated = Boolean(generated.isTruncated);
      const isSubstantive = ['argument', 'background', 'legal_grounds', 'evidence', 'petition', 'custom'].includes(section.type);
      const isSubstantiveFallback = isSubstantive && (!effectiveAiUsed || generated.fallbackUsed);
      const isReallyGenerated = Boolean(generated.text.trim()) && !hasSeed && !isTruncated;
      const plannedCoverageItemIds = section.coverageItemIds || secPlan?.coverageItemIds || [];
      const sourceBackedProceduralReference = shouldMaterializeSourceBackedProceduralReference(
        section,
        doc,
        caseAnalysis,
        generated,
        plannedCoverageItemIds,
      );

      const newBlock: ContentBlock = createContentBlock(
        generated.text,
        sourceBackedProceduralReference ? 'SOURCE_FACT' : 'GENERATED_ARGUMENT',
        {
          sources: generated.sources,
          isManuallyEdited: false,
          provenance: sourceBackedProceduralReference
            ? 'SOURCE_EXTRACTED'
            : effectiveAiUsed
              ? 'AI_GENERATED'
              : 'TEMPLATE_STRUCTURE',
        }
      );
      newBlock.generationRequirement = sourceBackedProceduralReference
        ? 'DETERMINISTIC'
        : isSubstantive
          ? 'AI_REQUIRED'
          : 'DETERMINISTIC';
      newBlock.generationStatus = isTruncated
        ? 'truncated'
        : hasSeed
          ? 'partial'
          : isReallyGenerated
            ? 'generated'
            : isSubstantiveFallback
              ? 'partial'
              : 'pending';

      if (generated.blocks && generated.blocks.length > 0) {
        section.content = generated.blocks;
      } else if (Array.isArray(generated.blocks)) {
        section.content = [];
      } else {
        section.content = [newBlock];
        newBlock.generatedBy = sourceBackedProceduralReference
          ? 'SOURCE_DIRECT'
          : effectiveAiUsed
            ? 'AI'
            : 'DETERMINISTIC';
        newBlock.provider = generated.aiProvider || (
          sourceBackedProceduralReference
            ? 'source_extracted'
            : effectiveAiUsed
              ? 'nvidia'
              : 'deterministic_fallback'
        );
        newBlock.model = generated.aiModel || null;
        newBlock.generationId = traceContext?.generationId;
        newBlock.generationTaskId = undefined;
        newBlock.fallbackStatus = sourceBackedProceduralReference
          ? undefined
          : generated.fallbackUsed
            ? 'DETERMINISTIC_FALLBACK'
            : undefined;
        newBlock.fallbackReason = sourceBackedProceduralReference ? null : generated.aiError || null;
        // La sección aporta el vínculo planeado; la política de Coverage
        // decide después si el bloque realmente puede satisfacerlo.
        if (!section.coverageItemIds && plannedCoverageItemIds.length > 0) {
          section.coverageItemIds = [...plannedCoverageItemIds];
        }
        newBlock.coverageItemIds = [...plannedCoverageItemIds];
        if (traceContext?.enabled) {
          traceContext.recordDraftBlock(newBlock);
        }
        if (isReallyGenerated) {
          const richCoverageEnabled = Boolean(
            caseAnalysis?.richCaseAnalysis
            || doc.coverageMatrix?.items.some((item) => item.scope || item.sourceEntityType),
          );
          if (richCoverageEnabled) {
            applySectionCoverageTransition(doc, section, newBlock, traceContext);
          } else if (doc.coverageMatrix) {
            // Compatibility-only path for pre-rich CaseAnalysis consumers.
            // Rich Coverage always takes the strict policy above.
            for (const item of doc.coverageMatrix.items) {
              if (item.targetSectionIds?.includes(section.id) && item.status === 'pending') {
                item.status = 'covered';
                item.generatedBlockIds = Array.from(new Set([...(item.generatedBlockIds || []), newBlock.id]));
              }
            }
            const summary = doc.coverageMatrix.items.reduce((acc, item) => {
              if (item.required) acc.required += 1;
              if (item.status === 'pending') acc.pending += 1;
              else if (item.status === 'generated') acc.generated += 1;
              else if (item.status === 'covered') acc.covered += 1;
              else if (item.status === 'weak') acc.weak += 1;
              else if (item.status === 'unsupported') acc.unsupported += 1;
              else if (item.status === 'not_applicable') acc.notApplicable += 1;
              return acc;
            }, { required: 0, pending: 0, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 });
            Object.assign(doc.coverageMatrix.summary, summary);
          }
        }
      }
      section.isGenerated = isReallyGenerated;
      if (traceContext?.enabled) {
        if (!traceContext.trace.assemblyMetadata.generatedSectionIds.includes(section.id)) {
          traceContext.trace.assemblyMetadata.generatedSectionIds.push(section.id);
        }
        for (const block of section.content || []) {
          traceContext.recordAssembly({
            paragraphIndex: assemblyParagraphIndex++,
            sectionId: section.id,
            blockId: block.id,
            generationTaskId: block.generationTaskId || block.taskId,
            coverageItemIds: block.coverageItemIds || [],
            textHash: hashTraceText(block.text || ''),
            styleCategory: block.layer,
            rendered: Boolean(block.text?.trim()),
            omissionReason: block.text?.trim() ? undefined : 'EMPTY_OUTPUT',
          });
        }
      }
      section.validationWarnings = generated.warnings;
      const generationReason = sourceBackedProceduralReference
        ? 'Materializado determinísticamente desde eventos procesales con provenance de fuente; REFERENCE_ONLY permanece abierto.'
        : effectiveAiUsed
        ? (isTruncated ? 'Generación truncada por límite de tokens (finish_reason: length).' : 'Generado por proveedor de IA con contrato de sección y contexto permitido.')
        : generated.aiError
          ? `Fallback determinístico: ${generated.aiError}`
          : 'Generado determinísticamente desde plantilla, intake y datos confirmados.';
      section.generation = {
        provider: generated.aiProvider || null,
        model: generated.aiModel || null,
        fallbackUsed: Boolean(!effectiveAiUsed || generated.fallbackUsed),
        generationReason,
        finishReason: generated.finishReason || (isTruncated ? 'length' : 'stop'),
        isTruncated,
        status: newBlock.generationStatus,
      };
      doc.generationMetadata.sections = {
        ...(doc.generationMetadata.sections || {}),
        [section.id]: section.generation,
      };

      completedBlocks++;
      // Mapear sección a bloque sintético para callback
      const pseudoBlock: any = { id: section.id, title: section.title, kind: section.type, sectionType: section.type };
      jobUpdate((input as any).jobId, {
        completed: completedBlocks,
        currentBlock: section.title,
        currentBlockIndex: completedBlocks,
        aiProvider: generated.aiProvider || 'fallback',
        stage: `Generando ${completedBlocks}/${doc.sections.length}: ${section.title.slice(0,50)}`,
      });
      callbacks?.onBlockComplete?.(completedBlocks, doc.sections.length, pseudoBlock as LegalBlock, { aiUsed: effectiveAiUsed, aiProvider: generated.aiProvider || null, fallback: !effectiveAiUsed && !!generated.aiError });
    }

    // FASE 6/9 — integridad de roles en contestaciones (post-generación):
    // FIRMA determinística con el demandado + limpieza de ecos del listado
    // de roles que el modelo pudiera haber copiado a la COMPARECENCIA.
    let roleIntegrityWarnings: ValidationIssue[] = [];
    if (isDemandContestacionType(doc.documentType, doc.documentTypeLabel)) {
      roleIntegrityWarnings = enforceContestacionRoleIntegrity(doc, caseAnalysis);
      console.log('[pipeline:roles] Integridad de roles de contestación aplicada (FIRMA=demandado; sin ecos de roles ni rúbricas estructurales)');
    }

    doc.generationMetadata.aiUsed = pipelineAiUsed;
    doc.generationMetadata.aiProvider = pipelineAiProvider || null;
    doc.generationMetadata.aiModel = pipelineAiModel || null;
    doc.generationMetadata.aiError = pipelineAiError || null;
    if (traceContext?.enabled) {
      traceContext.trace.providerRequested = 'NVIDIA';
      const actualProviders = traceContext.trace.taskExecutions.map((entry) => entry.providerActuallyUsed);
      traceContext.trace.providerActuallyUsed = actualProviders.includes('NVIDIA')
        ? 'NVIDIA'
        : actualProviders.includes('LOCAL')
          ? 'LOCAL'
          : pipelineAiUsed
            ? (pipelineAiProvider === 'nvidia' ? 'NVIDIA' : pipelineAiProvider === 'local' ? 'LOCAL' : 'NONE')
            : 'NONE';
      traceContext.trace.model = pipelineAiModel || null;
      traceContext.trace.providerFallbackReason = pipelineAiError
        || traceContext.trace.taskExecutions.find((entry) => entry.fallbackReason)?.fallbackReason
        || (traceContext.trace.providerActuallyUsed !== 'NVIDIA' && !process.env.NVIDIA_API_KEY
          ? 'NVIDIA_NO_API_KEY'
          : null);
    }

    updateStage('generate_sections', 'complete');
    callbacks?.onStageComplete?.('generate_sections', doc);

    // ── FASE 6: snapshot no destructivo, assembly y validadores ────────────
    let documentAssemblyResult: DocumentAssemblyResult | undefined;
    let documentAssemblyFindings: DocumentAssemblyFinding[] = [];
    let documentAssemblyCoverage: CoverageReconciliation | undefined;
    let documentAssemblyContracts: readonly import('./documentAssemblyTypes').SectionContract[] = [];
    let documentAssemblyGatePassed = false;
    try {
      const preSanitizerSections = doc.sections.map((section) => ({
        ...section,
        content: (section.content || []).map((block) => ({
          ...block,
          sources: block.sources?.map((source) => ({ ...source })),
          legalIssueIds: block.legalIssueIds ? [...block.legalIssueIds] : undefined,
          coverageItemIds: block.coverageItemIds ? [...block.coverageItemIds] : undefined,
          factIds: block.factIds ? [...block.factIds] : undefined,
          evidenceIds: block.evidenceIds ? [...block.evidenceIds] : undefined,
          authorityIds: block.authorityIds ? [...block.authorityIds] : undefined,
          verifiedAuthorityIds: block.verifiedAuthorityIds ? [...block.verifiedAuthorityIds] : undefined,
        })),
      }));
      const candidateBlocks = preSanitizerSections.flatMap((section) =>
        (section.content || []).map((block) => ({ sectionId: section.id, block })));
      const assemblyInput = {
        document: doc,
        documentPlan: plan,
        draftingPlan,
        candidateSections: preSanitizerSections,
        candidateBlocks,
        generationTasks: accumulatedGenerationTasks,
        coverageMatrix: doc.coverageMatrix,
        legalIssueMatrix: doc.legalIssueMatrix,
        richCaseAnalysis: caseAnalysis.richCaseAnalysis,
        generationTrace: traceContext?.trace,
      } satisfies import('./documentAssemblyTypes').DocumentAssemblyInput;
      const assembly = assembleLegalDraft(assemblyInput);
      documentAssemblyContracts = deriveSectionContracts({
        documentType: doc.documentType,
        documentPlan: plan,
        candidateSections: preSanitizerSections,
        coverageMatrix: doc.coverageMatrix,
      });
      documentAssemblyCoverage = reconcileDocumentCoverage({
        coverageMatrix: doc.coverageMatrix || { items: [], summary: { total: 0, required: 0, pending: 0, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 } },
        assembly,
        sectionContracts: documentAssemblyContracts,
      });
      documentAssemblyFindings = [
        ...planIntegrityFindings,
        ...taskAccountingFindings,
        ...assembly.findings,
        ...validateSectionContracts({ documentType: doc.documentType, documentPlan: plan, candidateSections: preSanitizerSections, coverageMatrix: doc.coverageMatrix }),
        ...validateDocumentConsistency({ assembly, richCaseAnalysis: caseAnalysis.richCaseAnalysis }),
        ...validateDocumentEvidence({ assembly, richCaseAnalysis: caseAnalysis.richCaseAnalysis, coverageMatrix: doc.coverageMatrix, sectionContracts: documentAssemblyContracts, legalIssueMatrix: doc.legalIssueMatrix }),
        ...validateDocumentAuthorities({ assembly, richCaseAnalysis: caseAnalysis.richCaseAnalysis, coverageMatrix: doc.coverageMatrix, legalIssueMatrix: doc.legalIssueMatrix }),
        ...findDocumentRedundancy({ assembly }),
        ...(documentAssemblyCoverage.findings || []),
      ];
      documentAssemblyResult = { ...assembly, findings: documentAssemblyFindings, coverageReconciliation: documentAssemblyCoverage };

      // El sanitizer sólo recibe la copia autorizada y conserva duplicados
      // jurídicamente distintos; nunca decide la identidad del bloque.
      const richAssemblyEvidence = Boolean(caseAnalysis.richCaseAnalysis && doc.legalIssueMatrix?.sourceMode === 'RICH');
      const authorizedSource = richAssemblyEvidence ? assembly.document : doc;
      const { document: sanitized, report } = sanitizeLegalDocument(authorizedSource, { dedupeBlocks: false });
      const authorizedBlockIds = sanitized.sections.flatMap((section) => section.content || []).map((block) => block.id);
      const missingAuthorizedBlocks = richAssemblyEvidence
        ? assembly.orderedBlocks.map((block) => block.id).filter((id) => !authorizedBlockIds.includes(id))
        : [];
      if (missingAuthorizedBlocks.length > 0) {
        const invalidFinding: DocumentAssemblyFinding = {
          code: 'INVALID_SANITIZER_OUTPUT',
          severity: 'BLOCKER',
          message: `El sanitizer eliminó bloques autorizados: ${missingAuthorizedBlocks.join(', ')}.`,
          reason: 'INVALID_SANITIZER_OUTPUT',
          blockIds: missingAuthorizedBlocks,
          legalIssueIds: [],
          coverageItemIds: [],
          sectionIds: [],
        };
        documentAssemblyFindings = [...documentAssemblyFindings, invalidFinding];
        documentAssemblyResult = { ...documentAssemblyResult, findings: documentAssemblyFindings };
      }
      const technicalPlaceholders = (report.classifiedPlaceholders || [])
        .filter((p) => p.kind === 'TECHNICAL_UNRESOLVED');
      if (technicalPlaceholders.length > 0) {
        const techPlaceholderFinding: DocumentAssemblyFinding = {
          code: 'UNRESOLVED_TECHNICAL_PLACEHOLDER',
          severity: 'BLOCKER',
          message: `Placeholders técnicos no resueltos detectados: ${technicalPlaceholders.map((p) => p.marker).join(', ')}`,
          reason: 'UNRESOLVED_TECHNICAL_PLACEHOLDER',
          blockIds: [],
          legalIssueIds: [],
          coverageItemIds: [],
          sectionIds: [],
        };
        documentAssemblyFindings = [...documentAssemblyFindings, techPlaceholderFinding];
        documentAssemblyResult = { ...documentAssemblyResult, findings: documentAssemblyFindings };
      }
      // Preservar IDs y metadatos de pipeline, reemplazar secciones
      doc.sections = sanitized.sections;
      doc.updatedAt = sanitized.updatedAt;
      (doc as UniversalLegalDocument & { sanitizeReport?: typeof report }).sanitizeReport = report;
      if (report.truncatedWarnings.length) doc.validation.warnings.push(...report.truncatedWarnings);
      if (report.coherenceWarnings.length) doc.validation.warnings.push(...report.coherenceWarnings);
      if (report.partsWarnings.length) doc.validation.warnings.push(...report.partsWarnings);
      jobUpdate(input.jobId, { stage: `Sanitizado: ${report.removedPrompts} prompts, ${report.removedDuplicates} duplicados` });
      console.log(`[pipeline:sanitize] ${JSON.stringify({ prompts: report.removedPrompts, crypto: report.removedCrypto, watermarks: report.removedWatermarks, dup: report.removedDuplicates, placeholders: report.placeholdersFound.length })}`);
    } catch (e: unknown) {
      // Fallback best-effort: aunque el sanitizer completo falle, NUNCA se entrega
      // el documento sin filtros. Cadena de seguridad obligatoria:
      //   sanitizeLegalDocument → si falla → fallback → stripPrompts → normalización segura
      // `stripInternalPromptMetadata` ejecuta exactamente esa secuencia
      // (normaliza Markdown y elimina etiquetas internas del pipeline).
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.warn('[pipeline:sanitize] fallo:', errorMessage);
      doc.sections = doc.sections.map((sec) => ({
        ...sec,
        title: normalizeTitleText(sec.title || ''),
        content: sec.content.map((b) => ({ ...b, text: stripInternalPromptMetadata(stripTrustMarkers(b.text || '')) })),
      }));
      documentAssemblyFindings = [...documentAssemblyFindings, {
        code: 'INVALID_ASSEMBLY_INTEGRATION',
        severity: 'BLOCKER',
        message: `No fue posible completar la frontera FASE 6: ${errorMessage || 'error desconocido'}.`,
        reason: 'INVALID_ASSEMBLY_INTEGRATION',
        blockIds: [],
        legalIssueIds: [],
        coverageItemIds: [],
        sectionIds: [],
      }];
    }

    // ── Stage 7: Review Coherence ──────────────────────────────────────────
    updateStage('review_coherence', 'running');
    callbacks?.onStageStart?.('review_coherence', doc);
    callbacks?.onProgressMessage?.('Revisando coherencia…');
    if (input.referenceDocumentText) {
      const allGenText = doc.sections.flatMap((s) => s.content.map((b) => b.text)).join('\n\n');
      const styleMatch = evaluateStyleMatch(input.referenceDocumentText, allGenText);
      (doc as any).styleMatch = styleMatch;
    }
    updateStage('review_coherence', 'complete');
    callbacks?.onStageComplete?.('review_coherence', doc);

    // ── Stage 8: Validate & Quality Gate (CONSERVADO) ─────────────────────
    updateStage('validate', 'running');
    callbacks?.onStageStart?.('validate', doc);
    callbacks?.onProgressMessage?.('Validando documento…');

    // FASE 5: Evaluación Semántica Global del Documento y actualización de CoverageMatrix (5S)
    const allTaskEvaluations = doc.sections.flatMap((s) =>
      (s.content || []).map((b) => b.semanticEvaluation).filter((e): e is import('./semanticEvaluator').BlockQualityEvaluation => Boolean(e))
    );
    if (doc.coverageMatrix && allTaskEvaluations.length > 0) {
      applySemanticEvaluationToCoverageMatrix(doc.coverageMatrix, allTaskEvaluations);
    }
    const docSemanticEval = evaluateDocumentSemantics(doc, doc.coverageMatrix, allTaskEvaluations);
    doc.semanticEvaluation = docSemanticEval;

    doc.validation = validateDocument(doc);
    doc.validation.warnings.push(...roleIntegrityWarnings);

    const qgResult = runQualityGateCheck(doc, { referenceLength: input.referenceDocumentText?.length || 0 });
    traceContext?.recordQualityGate(qgResult);
    traceContext?.snapshotCoverageAfter(doc.coverageMatrix);
    (doc as any).qualityGate = qgResult;
    (doc.generationMetadata as any).qualityScore = qgResult.qualityScore;
    (doc.generationMetadata as any).qualityMetrics = qgResult.metrics;
    if (!qgResult.passed) {
      doc.validation.isValid = false;
      doc.validation.errors.push(...qgResult.criticalErrors);
    }
    doc.validation.warnings.push(...qgResult.warnings);

    if (documentAssemblyResult && documentAssemblyCoverage) {
      const finalAssembly = { ...documentAssemblyResult, document: doc };
      const readinessInput: DocumentReadinessInput = {
        document: doc,
        assembly: finalAssembly,
        coverageMatrix: doc.coverageMatrix,
        legalIssueMatrix: doc.legalIssueMatrix,
        richCaseAnalysis: caseAnalysis.richCaseAnalysis,
        sectionContracts: documentAssemblyContracts,
        coverage: documentAssemblyCoverage,
        baseQualityGate: qgResult,
        trace: finalAssembly.trace,
        findings: documentAssemblyFindings,
      };
      const checks = evaluateDocumentAssemblyChecks(readinessInput);
      const readiness = decideDocumentAssemblyReadiness({ ...readinessInput, checks });
      const assemblyGate = runDocumentAssemblyQualityGate({
        assembly: finalAssembly,
        baseQualityGate: qgResult,
        checks,
        coverage: documentAssemblyCoverage,
        trace: finalAssembly.trace,
        readiness,
      });
      documentAssemblyGatePassed = assemblyGate.canMarkAsReady;
      const finalFindingCodes = [...new Set([
        ...documentAssemblyFindings.map((finding) => finding.code),
        ...checks.findings.map((finding) => finding.code),
        ...assemblyGate.findings.map((finding) => finding.code),
      ])].sort();
      documentAssemblyResult = {
        ...finalAssembly,
        assemblyStatus: readiness === 'BLOCKED' || readiness === 'INVALID' ? 'BLOCKED' : 'ASSEMBLED',
        validationStatus: readiness === 'INVALID' ? 'INVALID' : assemblyGate.passed ? 'VALID' : 'REQUIRES_REVIEW',
        readiness,
        findings: [...checks.findings, ...assemblyGate.findings],
        trace: { ...finalAssembly.trace, findingCodes: finalFindingCodes },
      };
      // El resultado conserva la referencia al documento para consumidores en
      // memoria, pero no debe volver a serializarlo dentro del propio documento:
      // doc -> documentAssemblyResult -> document sería un ciclo JSON.
      const attachedAssemblyResult = { ...documentAssemblyResult };
      Object.defineProperty(attachedAssemblyResult, 'document', {
        value: doc,
        enumerable: false,
        configurable: true,
        writable: false,
      });
      type AssemblyAttachedDocument = UniversalLegalDocument & {
        documentAssemblyResult?: DocumentAssemblyResult;
        documentAssemblyQualityGate?: DocumentAssemblyQualityGateResult;
      };
      const assemblyDocument = doc as AssemblyAttachedDocument;
      assemblyDocument.documentAssemblyResult = attachedAssemblyResult;
      assemblyDocument.documentAssemblyQualityGate = assemblyGate;
      if (!assemblyGate.passed) {
        doc.validation.isValid = false;
        for (const assemblyFinding of assemblyGate.findings.filter((finding) => finding.severity === 'BLOCKER')) {
          doc.validation.errors.push({
            checkId: `DOCUMENT_ASSEMBLY_${assemblyFinding.code}`,
            message: assemblyFinding.message,
          } as ValidationIssue);
        }
      }
      traceContext?.recordDocumentAssembly(documentAssemblyResult);
    }

    updateStage('validate', 'complete');
    callbacks?.onStageComplete?.('validate', doc);

    // ── Stage 9: Validación semántica final — P0 context isolation (§15) ─────
    // Verifica que lo solicitado coincide con lo generado; si no, lanza DOCUMENT_CONTEXT_MISMATCH
    // para que el frontend muestre "El documento generado no coincide con la materia o tipo solicitado."
    try {
      const normalize = (v: unknown) => String(v || '').trim().toLowerCase();
      const requestedMatter = input.taxonomy?.matter ? normalize((await import('@/lib/legal-taxonomy')).resolveMatterLabel(input.taxonomy as any)) : normalize(input.matter);
      const requestedDocType = input.taxonomy?.documentType ? normalize((await import('@/lib/legal-taxonomy')).resolveDocumentTypeLabel(input.taxonomy as any)) : normalize(input.documentTypeLabel);
      const requestedJuris = input.taxonomy?.jurisdiction ? normalize((await import('@/lib/legal-taxonomy')).resolveJurisdictionLabel(input.taxonomy as any)) : normalize(input.jurisdiction);
      const generatedMatter = normalize(doc.matter);
      const generatedDocType = normalize(doc.documentTypeLabel || doc.documentType);
      const generatedJuris = normalize(doc.jurisdiction);
      // Solo validar si el usuario dio valor explícito; si no, no hay expectativa
      const matterMismatch = requestedMatter && generatedMatter && !generatedMatter.includes(requestedMatter) && !requestedMatter.includes(generatedMatter);
      const jurisMismatch = requestedJuris && generatedJuris && requestedJuris !== 'general' && generatedJuris !== 'general' && requestedJuris !== generatedJuris;
      // Para docType, comparar de forma laxa: "demanda" debe estar en "demanda" o "demanda de amparo..." pero no debe ser contestación/recurso si se pidió demanda
      const docTypeMismatch = requestedDocType && generatedDocType && !generatedDocType.includes(requestedDocType) && !requestedDocType.includes(generatedDocType);
      // Regla especial: solo hay cruce de familia cuando se pidió una demanda
      // genérica y se generó amparo. Un recurso de revisión en amparo directo
      // explícitamente seleccionado puede partir de una fuente LABORAL: en ese
      // caso la materia de origen no contradice la familia del escrito destino.
      const isLaboralRequested = requestedMatter.includes('laboral');
      const isAmparoGenerated = generatedMatter.includes('amparo') || generatedMatter.includes('constitucional') || generatedDocType.includes('amparo');
      const isGenericDemandRequested = requestedDocType === 'demanda' || requestedDocType.startsWith('demanda ');
      const crossFamilyMismatch = isLaboralRequested && isAmparoGenerated && isGenericDemandRequested;

      if (crossFamilyMismatch || (matterMismatch && isLaboralRequested) || docTypeMismatch) {
        // No lanzar throw duro que rompa todo el pipeline en producción si es solo matter; marcar como error de validación
        // Pero para P0, si matter es laboral y docType es contestación/recurso, es error crítico
        const isCriticalDocType = requestedDocType === 'demanda' && (generatedDocType.includes('contestaci') || generatedDocType.includes('recurso') || generatedDocType.includes('amparo'));
        if (isCriticalDocType || crossFamilyMismatch) {
          const msg = `DOCUMENT_CONTEXT_MISMATCH: solicitado matter=${requestedMatter} jurisdiction=${requestedJuris} docType=${requestedDocType} vs generado matter=${generatedMatter} jurisdiction=${generatedJuris} docType=${generatedDocType}. El documento generado no coincide con la materia o tipo solicitado.`;
          console.error(`[pipeline:validation] ${msg}`);
          // Marcar validación como error para que UI pueda mostrar mensaje específico
          doc.validation.isValid = false;
          doc.validation.errors.push({ checkId: 'DOCUMENT_CONTEXT_MISMATCH', message: 'El documento generado no coincide con la materia o tipo solicitado.' } as any);
          // No throw, pero dejar trazabilidad en metadata
          (doc.generationMetadata as any).contextMismatch = { requested: { matter: requestedMatter, jurisdiction: requestedJuris, docType: requestedDocType }, generated: { matter: generatedMatter, jurisdiction: generatedJuris, docType: generatedDocType }, message: msg };
        }
      }
      const allText = doc.sections.flatMap((s) => s.content.map((b) => b.text)).join('\n');
      if (isLaboralRequested) {
        const forbiddenMarkers = ['Suprema Corte de Justicia de la Nación', 'quejoso', 'autoridad responsable', 'acto reclamado', 'medio de defensa promovido'];
        const foundForbidden = forbiddenMarkers.filter((m) => allText.toLowerCase().includes(m.toLowerCase()));
        if (foundForbidden.length >= 2) {
          console.warn(`[pipeline:validation] Marcadores de amparo/contestación en laboral: ${foundForbidden.join(', ')}`);
          doc.validation.warnings.push({ checkId: 'LABORAL_AMparo_MARKERS', message: `Marcadores de amparo detectados en demanda laboral: ${foundForbidden.join(', ')}` } as any);
        }
      }
    } catch (e: any) {
      if (String(e?.message || '').includes('DOCUMENT_CONTEXT_MISMATCH')) throw e;
      console.warn('[pipeline:validation] Error en validación semántica final (no bloqueante):', e?.message);
    }

    const allDocText = doc.sections.flatMap((s) => s.content.map((b) => b.text)).join('\n');
    const hasAnySeedMarker = hasSeedMarkers(allDocText);
    const hasAnyUnresolvedDeps = hasUnresolvedFactualDependencies(allDocText);
    const hasAnyTruncatedSection = doc.sections.some(
      (s) => s.generation?.isTruncated || s.generation?.status === 'truncated' || (s.content || []).some((b) => b.generationStatus === 'truncated')
    );
    const hasEmptyAiRequired = doc.sections.some(
      (s) => (s.content || []).some((b) => b.generationRequirement === 'AI_REQUIRED' && !b.text.trim())
    );
    const hasUnresolvedCoverage = Boolean(
      doc.coverageMatrix?.items?.some((i) => i.required && i.status !== 'covered')
    );
    const hasCriticalQgErrors = (qgResult.criticalErrors && qgResult.criticalErrors.length > 0) || !qgResult.passed || !qgResult.canMarkAsFinal;

    const isDocumentTrulyComplete =
      !hasAnySeedMarker &&
      !hasAnyUnresolvedDeps &&
      !hasAnyTruncatedSection &&
      !hasEmptyAiRequired &&
      !hasCriticalQgErrors &&
      !hasUnresolvedCoverage &&
      docSemanticEval.overallVerdict !== 'FAIL' &&
      doc.validation.isValid &&
      documentAssemblyGatePassed;

    doc.generationMetadata.pipelineState.isComplete = isDocumentTrulyComplete;
    doc.generationMetadata.pipelineState.hasErrors = !isDocumentTrulyComplete;

    if (!isDocumentTrulyComplete) {
      doc.validation.isValid = false;
      doc.status = 'draft';
      Object.assign(doc, markDocumentAsReviewRequired(doc));
    } else if (
      doc.documentType === 'demanda_ordinaria_civil'
      || doc.documentType === 'demanda_ejecutiva_mercantil'
      || isCivilMercantileResponseDocumentType(doc.documentType)
      || isCivilMercantileEvidenceArgumentDocumentType(doc.documentType)
      || Boolean(getDocumentStrategy(doc.documentType)?.dedicated)
    ) {
      const readyForLawyerTransition = Boolean(
        qgResult.passed
        && qgResult.canMarkAsFinal
        && doc.validation.isValid
        && preflight.status === 'READY'
      );
      if (!readyForLawyerTransition) {
        Object.assign(doc, markDocumentAsReviewRequired(doc));
      } else {
        // La transición a READY_TO_EXPORT exige una acción explícita del abogado.
        // El pipeline nunca convierte una generación en exportable por sí solo.
        (doc.generationMetadata as any).readiness = 'DRAFT';
        doc.status = 'draft';
      }
    } else {
      // Compatibilidad con consumidores legacy fuera del alcance de esta fase.
      doc.status = 'generated';
    }

    if (traceContext?.enabled) {
      const closedTrace = traceContext.close();
      doc.generationMetadata.auditTrace = closedTrace;
      if (input.traceOptions?.outputDir) {
        const artifacts = await writeGenerationTraceArtifacts(closedTrace, {
          outputDir: input.traceOptions.outputDir,
          writeMarkdown: input.traceOptions.writeMarkdown,
        });
        if (artifacts.errors.length > 0) {
          doc.generationMetadata.auditTrace = {
            ...closedTrace,
            errors: [...closedTrace.errors, ...artifacts.errors.filter((error) => !closedTrace.errors.includes(error))],
          };
        }
      }
      await callbacks?.onTraceReady?.(doc.generationMetadata.auditTrace, doc);
    }
    return doc;
  } catch (error: any) {
    console.error('Pipeline error:', error);
    doc.generationMetadata.pipelineState.hasErrors = true;
    if (doc.generationMetadata.pipelineState.currentStage) {
      updateStage(doc.generationMetadata.pipelineState.currentStage as PipelineStage, 'error', error.message);
      callbacks?.onError?.(error, doc.generationMetadata.pipelineState.currentStage as PipelineStage, doc);
    }
    if (traceContext?.enabled) {
      traceContext.addError(error?.message || String(error));
      doc.generationMetadata.auditTrace = traceContext.close();
      await callbacks?.onTraceReady?.(doc.generationMetadata.auditTrace, doc);
    }
    throw error;
  }
}
