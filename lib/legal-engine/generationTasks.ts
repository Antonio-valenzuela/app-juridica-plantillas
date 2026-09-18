/**
 * generationTasks.ts — GENERACIÓN JERÁRQUICA Y DYNAMIC BUDGETS (FASE 4)
 *
 * Arquitectura:
 * DocumentPlan → SectionPlan → IssuePlan / ClaimPlan / FactResponsePlan → GenerationTask → ContentBlock → Ensamblado
 *
 * Invariantes:
 * - expectedParagraphs y estimatedPages son únicamente informativos, nunca límites rígidos ni gates de completion.
 * - Cada tarea de generación (issue, claim, fact) recibe presupuesto dinámico según complejidad.
 * - Context Pack específico por tarea: solo hechos, pruebas y considerandos vinculados.
 * - Cero jurisprudencia o datos inventados.
 * - Manejo de truncamiento controlado con deduplicación de costura.
 * - Ensamblado determinista respetando orden y texto humano de machote.
 */

import type { ContentBlock, DocumentNode, UniversalLegalDocument } from './types';
import type { CaseAnalysis, LegalIssue } from './caseAnalysis';
import type { SectionPlan, IssuePlan, ClaimPlan, FactResponsePlan } from './pipeline';
import { buildCoverageMatrix, type CoverageMatrix, type DocumentCoverageItem } from './coverageMatrix';
import { buildLegalIssueMatrix, type LegalIssueItem, type LegalIssueMatrix } from './legalIssueMatrix';
import { buildEvidenceGroups } from './evidenceGrouping';
import type { LawyerProfile } from '../workspace/lawyerProfileTypes';
import { runFastMode } from '@/lib/ai/orchestrator';
import { sanitizeGeneratedText } from './pipeline';
import {
  hasSeedMarkers,
  stripSeedMarkers,
  hasUnresolvedFactualDependencies,
  extractUnresolvedFactualDependencies,
} from './seedMarkers';
import {
  evaluateBlockQuality,
  buildTargetedRevisionPrompt,
  SEMANTIC_THRESHOLDS,
  type BlockQualityEvaluation,
  type RevisionMode,
} from './semanticEvaluator';
import {
  hashTraceText,
  type GenerationOrigin,
  type GenerationTraceContext,
  type ProviderActuallyUsed,
  type CoverageTransitionTrace,
} from './generationTrace';
import { getCoverageResolutionBlockReason, isHardCoverageResolutionBlock, isCoverageSatisfied } from './coveragePolicy';

// ── 1. TIPOS Y DEFINICIONES (4B) ──────────────────────────────────────────

export type GenerationTaskType =
  | 'ISSUE'
  | 'LEGAL_RESEARCH'
  | 'CLAIM'
  | 'FACT_RESPONSE'
  | 'EVIDENCE'
  | 'SECTION_SUPPORT'
  | 'PROCEDURAL_GROUNDS'
  | 'COVERAGE_ITEM';

export type TaskComplexity = 'SHORT' | 'MEDIUM' | 'DEEP' | 'EXTENSIVE';

export type GenerationTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'fallback';

export interface GenerationTask {
  id: string;
  documentId?: string;
  sectionId: string;
  sectionTitle: string;
  taskType?: GenerationTaskType;
  type?: GenerationTaskType;
  title?: string;
  label?: string;
  objective?: string;
  complexity: TaskComplexity;
  tokenBudget: number;
  minOutputTokens?: number;
  status: GenerationTaskStatus;
  order?: number;
  orderInParent?: number;

  coverageItemIds?: string[];
  factIds?: string[];
  evidenceIds?: string[];
  authorityIds?: string[];
  challengedReasoningIds?: string[];
  claimIds?: string[];
  sourceDocIds?: string[];

  scopedFacts?: any[];
  scopedEvidence?: any[];
  scopedAuthorities?: any[];
  constitutionalArticles?: string[];
  conventionalArticles?: string[];

  targetIssueId?: string;
  /** Alias singular legacy; rich-first consumers must prefer legalIssueIds. */
  issueId?: string;
  legalIssueIds?: string[];
  targetClaimId?: string;
  targetFactId?: string;

  issuePlan?: IssuePlan;
  claimPlan?: ClaimPlan;
  factResponsePlan?: FactResponsePlan;

  generatedBlockIds?: string[];
  passes?: number;
  finishReason?: string | null;
  isTruncated?: boolean;
  tokensUsed?: number;
  fallbackUsed?: boolean;
  unresolvedDependencies?: string[];
  error?: string;
  evaluation?: BlockQualityEvaluation;
  revisionPasses?: number;
}

export interface GenerationTaskResult {
  text: string;
  success: boolean;
  finishReason: string | null;
  isTruncated: boolean;
  tokensUsed?: number;
  provider: string;
  model?: string;
  fallbackUsed: boolean;
  warnings: string[];
  evaluation?: BlockQualityEvaluation;
  legalIssueId?: string;
  attemptCount?: number;
  issueDraftValidationStatus?: 'INVALID_FATAL' | 'INVALID_RETRYABLE' | 'VALID_NON_FINAL' | 'VALID_ACCEPTED';
  providerActuallyUsed?: string;
  fallbackReason?: string;
  generatedBlockIds?: string[];
}

// ── 2. LÍMITES TÉCNICOS DE SEGURIDAD (4H) ──────────────────────────────────

export const TASK_LIMITS = {
  MIN_TASK_BUDGET: 800,
  MAX_TASK_BUDGET: 7000,
  MAX_TASKS_PER_SECTION: 25,
  MAX_CONTINUATIONS_PER_TASK: 2,
  MAX_TASK_RETRIES: 2,
  MAX_GLOBAL_DOCUMENT_TASKS: 80,
  MAX_CONCURRENT_GENERATIONS: 3,
} as const;

// ── 3. PRESUPUESTO DINÁMICO (4G) ───────────────────────────────────────────

export interface CalculateBudgetParams {
  taskType?: GenerationTaskType;
  type?: GenerationTaskType;
  complexity: TaskComplexity;
  relatedFactsCount?: number;
  relatedEvidenceCount?: number;
  authoritiesCount?: number;
  relevantSourceCharLength?: number;
  isContestacion?: boolean;
}

/**
 * Calcula el presupuesto de tokens dinámico en función de la complejidad real
 * y el material sustantivo vinculado, eliminando el techo fijo de 2048 (4G).
 */
export function calculateTaskTokenBudget(params: CalculateBudgetParams | GenerationTask): number {
  const taskType = ('taskType' in params ? params.taskType : (params as any).type) || 'ISSUE';
  const complexity = params.complexity || 'MEDIUM';
  const relatedFactsCount = 'relatedFactsCount' in params && params.relatedFactsCount !== undefined
    ? params.relatedFactsCount
    : ((params as any).factIds?.length ?? (params as any).scopedFacts?.length ?? 0);
  const relatedEvidenceCount = 'relatedEvidenceCount' in params && params.relatedEvidenceCount !== undefined
    ? params.relatedEvidenceCount
    : ((params as any).evidenceIds?.length ?? (params as any).scopedEvidence?.length ?? 0);
  const authoritiesCount = 'authoritiesCount' in params && params.authoritiesCount !== undefined
    ? params.authoritiesCount
    : ((params as any).authorityIds?.length ?? (params as any).scopedAuthorities?.length ?? 0);
  const relevantSourceCharLength = 'relevantSourceCharLength' in params && params.relevantSourceCharLength !== undefined
    ? params.relevantSourceCharLength
    : 0;

  // 1. Rangos base por profundidad cualitativa
  let baseBudget = 2200;
  switch (complexity) {
    case 'SHORT':
      baseBudget = 1200;
      break;
    case 'MEDIUM':
      baseBudget = 2200;
      break;
    case 'DEEP':
      baseBudget = 3600;
      break;
    case 'EXTENSIVE':
      baseBudget = 5200;
      break;
  }

  // Ajuste según el tipo de tarea
  if (taskType === 'ISSUE' && (complexity === 'DEEP' || complexity === 'EXTENSIVE')) {
    baseBudget = Math.max(baseBudget, 3600);
  } else if (taskType === 'FACT_RESPONSE' && complexity === 'SHORT') {
    baseBudget = Math.min(baseBudget, 1400);
  }

  // 2. Ajustes por elementos del expediente vinculados (sin inventar tokens)
  const factsBonus = Math.min(500, relatedFactsCount * 100);
  const evidenceBonus = Math.min(600, relatedEvidenceCount * 150);
  const authoritiesBonus = Math.min(400, authoritiesCount * 120);
  const sourceBonus = Math.min(600, Math.floor(relevantSourceCharLength / 500) * 80);

  const calculated = baseBudget + factsBonus + evidenceBonus + authoritiesBonus + sourceBonus;

  // 3. Clamping a límites de seguridad
  return Math.min(TASK_LIMITS.MAX_TASK_BUDGET, Math.max(TASK_LIMITS.MIN_TASK_BUDGET, calculated));
}

// ── 4. CONSTRUCTOR DE TAREAS POR SECCIÓN (4B, 4C, 4E, 4F) ─────────────────

export function buildGenerationTasksForSection(
  secPlan: SectionPlan,
  doc: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis,
  coverageMatrix?: CoverageMatrix,
): GenerationTask[] {
  const tasks: GenerationTask[] = [];
  const sourceDocIds = doc.sourceDocuments?.map((s) => s.id).filter(Boolean);
  const finalizeTasks = (list: GenerationTask[]): GenerationTask[] => {
    if (sourceDocIds && sourceDocIds.length > 0) {
      for (const t of list) {
        if (!t.sourceDocIds) {
          t.sourceDocIds = sourceDocIds;
        }
      }
    }
    return list;
  };
  const sectionId = secPlan.templateSectionId;
  const sectionTitle = secPlan.title;
  const isContestacion = /contestaci[oó]n/i.test(doc.documentTypeLabel || doc.documentType);
  const isRich = Boolean(caseAnalysis?.richCaseAnalysis);
  const legalIssueMatrix = doc.legalIssueMatrix || (caseAnalysis && coverageMatrix
    ? buildLegalIssueMatrix({ caseAnalysis, coverageMatrix })
    : undefined);
  const issueIdsForCoverage = (coverageItemIds: string[]): string[] => legalIssueMatrix?.issues
    .filter((issue) => issue.coverageItemIds.some((id) => coverageItemIds.includes(id)))
    .map((issue) => issue.id) || [];
  const issueScopedCoverageGroups = (items: DocumentCoverageItem[]): Array<{ issue: LegalIssueItem; items: DocumentCoverageItem[] }> => {
    if (!legalIssueMatrix) return [];
    return legalIssueMatrix.issues
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((issue) => ({
        issue,
        items: items.filter((item) => issue.coverageItemIds.includes(item.id)),
      }))
      .filter((group) => group.items.length > 0);
  };

  // ── CASO A: TAREAS POR ISSUE / AGRAVIO (4C) ───────────────────────────────
  if (secPlan.issuePlans && secPlan.issuePlans.length > 0) {
    secPlan.issuePlans.forEach((ip, idx) => {
      if (tasks.length >= TASK_LIMITS.MAX_TASKS_PER_SECTION) return;

      const canonicalIssueIds = ip.legalIssueIds || (ip.issueId ? [ip.issueId] : []);
      const canonicalIssue = isRich
        ? legalIssueMatrix?.issues.find((issue) => canonicalIssueIds.includes(issue.id))
        : undefined;
      const legacyIssue = !isRich
        ? caseAnalysis?.proceduralPosture?.constitutionalIssues?.find((i) => i.id === ip.issueId)
          || caseAnalysis?.proceduralPosture?.legalityIssues?.find((i) => i.id === ip.issueId)
          || caseAnalysis?.legalIssues?.find((i) => i.id === ip.issueId)
        : undefined;

      const relatedFacts = canonicalIssue?.factIds ?? legacyIssue?.relatedFactIds ?? ip.factIds ?? [];
      const relatedEv = canonicalIssue
        ? [...canonicalIssue.evidenceMentionIds, ...canonicalIssue.evidenceOfferIds]
        : legacyIssue?.relatedEvidenceIds || (legacyIssue as any)?.evidenceIds || ip.evidenceIds || [];
      const authorityIds = canonicalIssue?.authorityMentionIds ?? ip.authorityIds ?? [];

      const issueId = canonicalIssueIds[0] || ip.issueId || ip.id || `issue-${idx + 1}`;
      const title = canonicalIssue?.question || ip.title || (ip as any).label || `Agravio ${idx + 1}`;

      // Vincular a items de cobertura de este issue
      const matchedCovIds = coverageMatrix?.items
        .filter((ci) => isRich
          ? Boolean(canonicalIssue?.coverageItemIds.includes(ci.id) || ip.relatedCoverageItemIds?.includes(ci.id))
          : ci.id === `cov-issue-${issueId}` || ci.sourceId === issueId || ci.relatedChallengedReasoningIds?.some((crId) => ip.id?.includes(crId)))
        .map((ci) => ci.id) || [];

      const complexity: TaskComplexity = ip.expectedDepth
        || ((ip as any).depth === 'exhaustive' ? 'EXTENSIVE' : (ip as any).depth === 'standard' ? 'MEDIUM' : 'DEEP');
      const sourceLength = (ip.targetConsideration?.length || 0) + (ip.counterargumentStrategy?.length || 0);

      const tokenBudget = calculateTaskTokenBudget({
        taskType: 'ISSUE',
        complexity,
        relatedFactsCount: relatedFacts.length,
        relatedEvidenceCount: relatedEv.length,
        authoritiesCount: authorityIds.length,
        relevantSourceCharLength: sourceLength,
      });

      tasks.push({
        id: `task-issue-${sectionId}-${issueId}`,
        documentId: doc.id,
        sectionId,
        sectionTitle,
        taskType: 'ISSUE',
        type: 'ISSUE',
        targetIssueId: issueId,
        legalIssueIds: isRich && canonicalIssueIds.length > 0 ? [...canonicalIssueIds] : undefined,
        title,
        label: title,
        objective: `Desarrollar el planteamiento y fundamentación de: ${title}`,
        complexity,
        tokenBudget,
        status: 'pending',
        order: (idx + 1) * 10,
        orderInParent: (idx + 1) * 10,
        coverageItemIds: matchedCovIds.length > 0 ? matchedCovIds : (secPlan.coverageItemIds || [issueId]),
        factIds: relatedFacts,
        evidenceIds: relatedEv,
        authorityIds,
        issuePlan: ip,
        constitutionalArticles: (ip as any).constitutionalArticles || [],
        conventionalArticles: (ip as any).conventionalArticles || [],
      });
    });

    // Rich sections may also carry independent conflict/missing-data Coverage;
    // let the rich pass below append those generic tasks. Legacy sections keep
    // the historical early return and task shape unchanged.
    if (!(isRich && coverageMatrix)) return finalizeTasks(tasks);
  }

  // ── CASO B: TAREAS POR PRESTACIÓN EN CONTESTACIÓN (4E) ────────────────────
  if (secPlan.claimPlans && secPlan.claimPlans.length > 0) {
    secPlan.claimPlans.forEach((cp, idx) => {
      if (tasks.length >= TASK_LIMITS.MAX_TASKS_PER_SECTION) return;

      const claimId = cp.claimId || cp.id || `claim-${idx + 1}`;
      const matchedCovIds = coverageMatrix?.items
        .filter((ci) => isRich
          ? ci.category === 'CLAIM_RESPONSE' && ci.claimIds?.includes(claimId)
          : ci.category === 'CLAIM' && (ci.id.includes(claimId) || ci.sourceId === claimId || ci.relatedClaimIds?.includes(claimId)))
        .map((ci) => ci.id) || [];

      const tokenBudget = calculateTaskTokenBudget({
        taskType: 'CLAIM',
        complexity: 'MEDIUM',
        relevantSourceCharLength: cp.claimText?.length || 0,
        isContestacion: true,
      });

      const claimLabel = `Contestación a la Prestación ${cp.claimNumber || claimId}`;
      tasks.push({
        id: `task-claim-${sectionId}-${claimId}`,
        documentId: doc.id,
        sectionId,
        sectionTitle,
        taskType: 'CLAIM',
        type: 'CLAIM',
        targetClaimId: claimId,
        title: claimLabel,
        label: claimLabel,
        objective: `Fijar postura técnico-jurídica fundada y motivada respecto a la prestación: ${cp.claimText}`,
        complexity: 'MEDIUM',
        tokenBudget,
        status: 'pending',
        order: (idx + 1) * 10,
        orderInParent: (idx + 1) * 10,
        coverageItemIds: matchedCovIds.length > 0 ? matchedCovIds : (secPlan.coverageItemIds || [claimId]),
        legalIssueIds: issueIdsForCoverage(matchedCovIds),
        factIds: [],
        evidenceIds: (cp as any).defenseId ? [(cp as any).defenseId] : [],
        authorityIds: [],
        claimIds: [claimId],
        claimPlan: cp,
      });
    });

    // Rich sections may also carry independent conflict/missing-data Coverage;
    // let the rich pass below append those generic tasks. Legacy sections keep
    // the historical early return and task shape unchanged.
    if (!(isRich && coverageMatrix)) return finalizeTasks(tasks);
  }

  // ── CASO C: TAREAS POR HECHO EN CONTESTACIÓN (4F) ─────────────────────────
  if (secPlan.factResponsePlans && secPlan.factResponsePlans.length > 0) {
    secPlan.factResponsePlans.forEach((fp, idx) => {
      if (tasks.length >= TASK_LIMITS.MAX_TASKS_PER_SECTION) return;

      const factId = fp.factId || fp.id || `fact-${idx + 1}`;
      const suppEvIds = fp.supportingEvidenceIds || (fp as any).counterEvidenceIds || [];

      const matchedCovIds = coverageMatrix?.items
        .filter((ci) => isRich
          ? ci.category === 'FACT_RESPONSE' && ci.factIds?.includes(factId)
          : ci.category === 'FACT' && (ci.id.includes(factId) || ci.sourceId === factId || ci.relatedFactIds?.includes(factId)))
        .map((ci) => ci.id) || [];

      const factText = fp.factText || '';
      const clarification = fp.clarification || (fp as any).explanation || '';
      const complexity: TaskComplexity = suppEvIds.length > 0 || factText.length > 180 ? 'MEDIUM' : 'SHORT';
      const tokenBudget = calculateTaskTokenBudget({
        taskType: 'FACT_RESPONSE',
        complexity,
        relatedEvidenceCount: suppEvIds.length,
        relevantSourceCharLength: factText.length + clarification.length,
        isContestacion: true,
      });

      const factLabel = `Contestación al Hecho ${fp.factNumber || factId}`;
      tasks.push({
        id: `task-fact-${sectionId}-${factId}`,
        documentId: doc.id,
        sectionId,
        sectionTitle,
        taskType: 'FACT_RESPONSE',
        type: 'FACT_RESPONSE',
        targetFactId: factId,
        title: factLabel,
        label: factLabel,
        objective: `Contestar individualmente el correlativo ${fp.factNumber || factId} fijando postura técnica sin asumir hechos ajenos`,
        complexity,
        tokenBudget,
        status: 'pending',
        order: (idx + 1) * 10,
        orderInParent: (idx + 1) * 10,
        coverageItemIds: matchedCovIds.length > 0 ? matchedCovIds : (secPlan.coverageItemIds || [factId]),
        legalIssueIds: issueIdsForCoverage(matchedCovIds),
        factIds: [factId],
        evidenceIds: suppEvIds,
        authorityIds: [],
        factResponsePlan: fp,
      });
    });

    // Rich sections may also carry independent conflict/missing-data Coverage;
    // let the rich pass below append those generic tasks. Legacy sections keep
    // the historical early return and task shape unchanged.
    if (!(isRich && coverageMatrix)) return finalizeTasks(tasks);
  }

  if (isRich && coverageMatrix) {
    const sectionItems = coverageMatrix.items.filter((item) => {
      if (!item.required || item.metadata?.compatibilityAlias) return false;
      if (item.targetSectionIds.includes(sectionId)) return true;
      // Global review items have no structural target and are surfaced once
      // on the first planned section instead of being silently dropped.
      return item.targetSectionIds.length === 0
        && sectionId === doc.sections[doc.sections.length - 1]?.id
        && (item.category === 'CONFLICT_REVIEW' || item.category === 'MISSING_CLIENT_POSITION');
    });

    const nativeEvidenceItems = sectionItems.filter((item) =>
      item.category === 'EVIDENCE_TREATMENT' || item.category === 'EVIDENCE_OFFER');
    const evidenceIssueGroups = buildEvidenceGroups(caseAnalysis!.richCaseAnalysis!, nativeEvidenceItems)
      .map((group) => {
        const items = nativeEvidenceItems.filter((item) => group.coverageItemIds.includes(item.id));
        const mentionIssue = group.evidenceMentionIds.length === 1
          ? legalIssueMatrix?.issues.find((issue) =>
            issue.issueType === 'EVIDENCE_RELEVANCE' && issue.evidenceMentionIds.includes(group.evidenceMentionIds[0]),
          )
          : undefined;
        const issue = mentionIssue || legalIssueMatrix?.issues.find((candidate) =>
          candidate.coverageItemIds.some((id) => group.coverageItemIds.includes(id)),
        );
        return { issue, items };
      })
      .filter((group) => group.items.length > 0)
      .sort((left, right) => nativeEvidenceItems.indexOf(left.items[0]) - nativeEvidenceItems.indexOf(right.items[0]));
    const groupedEvidenceCoverageIds = new Set(evidenceIssueGroups.flatMap((group) => group.items.map((item) => item.id)));
    const appendEvidenceTask = (
      items: DocumentCoverageItem[],
      issue: LegalIssueItem | undefined,
      idx: number,
    ) => {
      const evidenceIds = [...new Set([
        ...(issue?.evidenceMentionIds || []),
        ...(issue?.evidenceOfferIds || []),
        ...items.flatMap((item) => [...(item.evidenceMentionIds || []), ...(item.evidenceOfferIds || [])]),
      ])];
      const factIds = [...new Set([
        ...(issue?.factIds || []),
        ...items.flatMap((item) => item.factIds || []),
      ])];
      const coverageItemIds = items.map((item) => item.id);
      tasks.push({
        id: `task-evidence-${sectionId}-${issue?.id || coverageItemIds[0]}`,
        documentId: doc.id,
        sectionId,
        sectionTitle,
        taskType: 'EVIDENCE',
        type: 'EVIDENCE',
        title: items[0].description,
        label: items[0].description,
        objective: 'Tratar únicamente la evidencia identificada y sus relaciones explícitas.',
        complexity: 'MEDIUM',
        tokenBudget: calculateTaskTokenBudget({ taskType: 'EVIDENCE', complexity: 'MEDIUM', relatedEvidenceCount: evidenceIds.length }),
        status: 'pending',
        order: (idx + 1) * 10,
        orderInParent: (idx + 1) * 10,
        coverageItemIds,
        legalIssueIds: issue ? [issue.id] : issueIdsForCoverage(coverageItemIds),
        factIds,
        evidenceIds,
        authorityIds: [],
      });
    };
    evidenceIssueGroups.forEach(({ issue, items }, idx) => appendEvidenceTask(items, issue, idx));
    nativeEvidenceItems
      .filter((item) => !groupedEvidenceCoverageIds.has(item.id))
      .forEach((item, idx) => appendEvidenceTask([item], undefined, evidenceIssueGroups.length + idx));

    const sectionSupportItems = sectionItems.filter((item) =>
      item.category === 'SOURCE_ARGUMENT_RESPONSE' || item.category === 'PETITION_SUPPORT');
    if (sectionSupportItems.length > 0) {
      const supportGroups = issueScopedCoverageGroups(sectionSupportItems);
      const groupedSupportIds = new Set(supportGroups.flatMap((group) => group.items.map((item) => item.id)));
      supportGroups.forEach(({ issue, items }, idx) => {
        const factIds = [...new Set([...issue.factIds, ...items.flatMap((item) => item.factIds || [])])];
        const evidenceIds = [...new Set([
          ...issue.evidenceMentionIds,
          ...issue.evidenceOfferIds,
          ...items.flatMap((item) => [...(item.evidenceMentionIds || []), ...(item.evidenceOfferIds || [])]),
        ])];
        const authorityIds = [...new Set([
          ...issue.authorityMentionIds,
          ...items.flatMap((item) => item.authorityMentionIds || []),
        ])];
        tasks.push({
          id: `task-section-support-${sectionId}-issue-${issue.id}`,
          documentId: doc.id,
          sectionId,
          sectionTitle,
          taskType: 'SECTION_SUPPORT',
          type: 'SECTION_SUPPORT',
          targetIssueId: issue.id,
          title: `Apoyo de sección para ${issue.question}`,
          label: 'RICH_ISSUE_SUPPORT',
          objective: `Desarrollar únicamente el apoyo de sección vinculado a la cuestión jurídica: ${issue.question}`,
          complexity: 'MEDIUM',
          tokenBudget: calculateTaskTokenBudget({ taskType: 'SECTION_SUPPORT', complexity: 'MEDIUM', relatedFactsCount: factIds.length, relatedEvidenceCount: evidenceIds.length, authoritiesCount: authorityIds.length }),
          status: 'pending',
          order: 30 + idx,
          orderInParent: 30 + idx,
          coverageItemIds: items.map((item) => item.id),
          legalIssueIds: [issue.id],
          factIds,
          evidenceIds,
          authorityIds,
        });
      });

      const unscopedSupportItems = sectionSupportItems.filter((item) => !groupedSupportIds.has(item.id));
      if (unscopedSupportItems.length > 0) {
        tasks.push({
          id: `task-section-support-${sectionId}-rich-coverage`,
          documentId: doc.id,
          sectionId,
          sectionTitle,
          taskType: 'SECTION_SUPPORT',
          type: 'SECTION_SUPPORT',
          title: `Apoyo de sección para ${unscopedSupportItems.length} Coverage`,
          label: 'RICH_SECTION_SUPPORT',
          objective: 'Desarrollar únicamente el apoyo de sección derivado de argumentos y enlaces explícitos.',
          complexity: 'MEDIUM',
          tokenBudget: calculateTaskTokenBudget({ taskType: 'SECTION_SUPPORT', complexity: 'MEDIUM', relatedFactsCount: unscopedSupportItems.reduce((count, item) => count + (item.factIds?.length || 0), 0) }),
          status: 'pending',
          order: 30 + supportGroups.length,
          orderInParent: 30 + supportGroups.length,
          coverageItemIds: unscopedSupportItems.map((item) => item.id),
          legalIssueIds: [],
          factIds: unscopedSupportItems.flatMap((item) => item.factIds || []),
          evidenceIds: unscopedSupportItems.flatMap((item) => [...(item.evidenceMentionIds || []), ...(item.evidenceOfferIds || [])]),
          authorityIds: unscopedSupportItems.flatMap((item) => item.authorityMentionIds || []),
        });
      }
    }

    const genericItems = sectionItems.filter((item) => !nativeEvidenceItems.includes(item)
      && !sectionSupportItems.includes(item)
      && (item.category === 'CONFLICT_REVIEW'
        || (item.category === 'MISSING_CLIENT_POSITION' && Boolean(item.missingDataIds?.length))));
    for (const [idx, item] of genericItems.entries()) {
      tasks.push({
        id: `task-coverage-${sectionId}-${item.id}`,
        documentId: doc.id,
        sectionId,
        sectionTitle,
        taskType: 'COVERAGE_ITEM',
        type: 'COVERAGE_ITEM',
        title: item.description,
        label: item.category,
        objective: `Resolver o documentar el Coverage ${item.id} únicamente con sus enlaces explícitos.`,
        complexity: 'SHORT',
        tokenBudget: calculateTaskTokenBudget({ taskType: 'COVERAGE_ITEM', complexity: 'SHORT', relatedFactsCount: item.factIds?.length || 0, relatedEvidenceCount: item.evidenceMentionIds?.length || 0 }),
        status: item.status === 'blocked' ? 'fallback' : 'pending',
        order: (idx + 1) * 10,
        orderInParent: (idx + 1) * 10,
        coverageItemIds: [item.id],
        legalIssueIds: issueIdsForCoverage([item.id]),
        factIds: [...(item.factIds || [])],
        evidenceIds: [...(item.evidenceMentionIds || []), ...(item.evidenceOfferIds || [])],
        authorityIds: [...(item.authorityMentionIds || [])],
      });
    }

    if (tasks.length > 0) return finalizeTasks(tasks);
  }

  // ── CASO D: TAREA GENERAL DE SECCIÓN (SOPORTE DE SECCIÓN ÚNICA) ───────────
  let fallbackCoverageIds = secPlan.coverageItemIds || [];
  if (isRich && coverageMatrix) {
    const fallbackCoverageItems = fallbackCoverageIds
      .map((coverageItemId) => coverageMatrix.items.find((item) => item.id === coverageItemId))
      .filter((item): item is DocumentCoverageItem => item !== undefined && !item.metadata?.compatibilityAlias);
    const issueGroups = issueScopedCoverageGroups(fallbackCoverageItems);
    if (issueGroups.length > 0) {
      const groupedCoverageIds = new Set(issueGroups.flatMap((group) => group.items.map((item) => item.id)));
      issueGroups.forEach(({ issue, items }, idx) => {
        const factIds = [...new Set([...issue.factIds, ...items.flatMap((item) => item.factIds || [])])];
        const evidenceIds = [...new Set([
          ...issue.evidenceMentionIds,
          ...issue.evidenceOfferIds,
          ...items.flatMap((item) => [...(item.evidenceMentionIds || []), ...(item.evidenceOfferIds || [])]),
        ])];
        const authorityIds = [...new Set([
          ...issue.authorityMentionIds,
          ...items.flatMap((item) => item.authorityMentionIds || []),
        ])];
        const complexity: TaskComplexity = secPlan.expectedDepth || 'MEDIUM';
        tasks.push({
          id: `task-issue-${sectionId}-${issue.id}`,
          documentId: doc.id,
          sectionId,
          sectionTitle,
          taskType: 'ISSUE',
          type: 'ISSUE',
          targetIssueId: issue.id,
          legalIssueIds: [issue.id],
          title: issue.question,
          label: issue.question,
          objective: `Desarrollar únicamente la cuestión jurídica: ${issue.question}. ${secPlan.objective}`,
          complexity,
          tokenBudget: calculateTaskTokenBudget({
            taskType: 'ISSUE',
            complexity,
            relatedFactsCount: factIds.length,
            relatedEvidenceCount: evidenceIds.length,
            authoritiesCount: authorityIds.length,
          }),
          status: 'pending',
          order: (idx + 1) * 10,
          orderInParent: (idx + 1) * 10,
          coverageItemIds: items.map((item) => item.id),
          factIds,
          evidenceIds,
          authorityIds,
        });
      });

      const residualCoverageIds = fallbackCoverageIds.filter((coverageItemId) => !groupedCoverageIds.has(coverageItemId)
        && !coverageMatrix.items.find((item) => item.id === coverageItemId)?.metadata?.compatibilityAlias);
      fallbackCoverageIds = residualCoverageIds;
      if (residualCoverageIds.length === 0) return finalizeTasks(tasks);
    }
  }

  const complexity: TaskComplexity = secPlan.expectedDepth || 'MEDIUM';
  const tokenBudget = calculateTaskTokenBudget({
    taskType: 'SECTION_SUPPORT',
    complexity,
    relatedFactsCount: secPlan.sourceFacts?.length || 0,
  });

  tasks.push({
    id: `task-sec-${sectionId}`,
    documentId: doc.id,
    sectionId,
    sectionTitle,
    taskType: 'SECTION_SUPPORT',
    title: secPlan.title,
    objective: secPlan.objective,
    complexity,
    tokenBudget,
    status: 'pending',
    order: 10,
    coverageItemIds: fallbackCoverageIds,
    legalIssueIds: issueIdsForCoverage(fallbackCoverageIds),
    factIds: [],
    evidenceIds: [],
    authorityIds: [],
  });

  return finalizeTasks(tasks);
}

export function buildLegalResearchTaskForIssue(
  issue: LegalIssueItem,
  doc: UniversalLegalDocument,
  sectionId: string,
): GenerationTask {
  return {
    id: `task-research-${issue.id}`,
    documentId: doc.id,
    sectionId,
    sectionTitle: doc.sections.find((section) => section.id === sectionId)?.title || 'Investigación jurídica',
    taskType: 'LEGAL_RESEARCH',
    type: 'LEGAL_RESEARCH',
    legalIssueIds: [issue.id],
    coverageItemIds: [...issue.coverageItemIds],
    factIds: [...issue.factIds],
    evidenceIds: [...issue.evidenceMentionIds, ...issue.evidenceOfferIds],
    authorityIds: [...issue.authorityMentionIds],
    objective: `Identificar los requisitos de investigación para la issue ${issue.id} sin resolverla ni afirmar aplicabilidad.`,
    complexity: 'MEDIUM',
    tokenBudget: 1200,
    status: 'pending',
  };
}

// ── 5. CONSTRUCTOR DE CONTEXT PACK Y SOURCE GROUNDING (4I, 4J, 4K) ─────────

export function buildTaskContextPack(
  task: GenerationTask,
  doc: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis,
  lawyerProfile?: LawyerProfile,
): { systemPrompt: string; userMessage: string } {
  const quejosoName = doc.parties.quejoso || doc.parties.actor || caseAnalysis?.parties?.quejoso || '[PROMOVENTE]';
  const autoridadName = doc.parties.autoridadResponsable || caseAnalysis?.parties?.autoridadResponsable || '[AUTORIDAD EMISORA]';
  const expedienteNum = doc.caseRefs.expediente || caseAnalysis?.caseNumbers?.principal || '[DATO PENDIENTE: Expediente]';
  const taskIssueIds = task.legalIssueIds || (task.targetIssueId ? [task.targetIssueId] : []);
  const taskCoverage = doc.coverageMatrix || (caseAnalysis ? buildCoverageMatrix(caseAnalysis, doc, doc.sections) : undefined);
  const taskMatrix = doc.legalIssueMatrix || (caseAnalysis && taskCoverage
    ? buildLegalIssueMatrix({ caseAnalysis, coverageMatrix: taskCoverage })
    : undefined);
  const scopedIssues = taskMatrix?.issues.filter((issue) => taskIssueIds.includes(issue.id)) || [];
  const rich = caseAnalysis?.richCaseAnalysis;

  // Reglas estrictas de source grounding (4J)
  const systemPromptLines = [
    'Eres un motor forense de redacción jurídica de alta precisión técnica para el sistema judicial mexicano.',
    'REGLAS DE RIGOR JURÍDICO INQUEBRANTABLES:',
    '1. Utiliza ÚNICAMENTE los hechos, pruebas, consideraciones y datos contenidos en el contexto proporcionado.',
    '2. PROHIBIDO inventar nombres, fechas, cantidades, actuaciones, pruebas, registros, tesis, jurisprudencias o conclusiones no sustentadas.',
    '3. Si un dato fáctico o probatorio indispensable no consta en el contexto: NO inventes datos. Redacta el planteamiento jurídico exclusivamente sobre las constancias acreditadas en autos, o formula la defensa prudente basada en la carga de la prueba de la contraparte. PROHIBIDO emitir textos pendientes o placeholders que dejen la oración incompleta.',
    '4. Redacta en prosa forense continua, técnica, formal y persuasiva. NO uses formato Markdown (sin asteriscos, sin almohadillas ni viñetas).',
  ];

  // Scoped Evidence (4I, 4J)
  const evidenceList = (task.scopedEvidence && task.scopedEvidence.length > 0)
    ? task.scopedEvidence
    : rich
      ? rich.evidenceMentions.filter((evidence) => (task.evidenceIds || []).includes(evidence.id))
      : (caseAnalysis?.evidence || []).filter((e) => Boolean(e.id && (task.evidenceIds || []).includes(e.id)));

  const factList = rich
    ? rich.facts.filter((fact) => (task.factIds || []).includes(fact.id))
    : [];
  if (factList.length > 0) {
    systemPromptLines.push(
      '',
      'HECHOS VINCULADOS EXPLÍCITAMENTE:\n' +
        factList.map((fact) => `- ${fact.id}: ${fact.proposition}`).join('\n'),
    );
  }

  if (evidenceList.length > 0) {
    systemPromptLines.push(
      '',
      'PRUEBAS DISPONIBLES VINCULADAS:\n' +
      evidenceList.map((e: any) => `- ${e.title || e.id || 'Prueba'}: ${e.description || e.type}`).join('\n')
    );
  }

  // Scoped Authorities (4K)
  const authoritiesList = (task.scopedAuthorities && task.scopedAuthorities.length > 0)
    ? task.scopedAuthorities
    : rich
      ? rich.authorities.filter((authority) => (task.authorityIds || []).includes(authority.id))
      : (caseAnalysis?.authorities || []).filter((a: any) => {
          const aId = typeof a === 'string' ? a : a?.id;
          return Boolean(aId && (task.authorityIds || []).includes(aId));
        });

  if (authoritiesList.length > 0) {
    systemPromptLines.push(
      '',
      'CRITERIOS Y AUTORIDADES:\n' +
       authoritiesList.map((a: any) => typeof a === 'string' ? `- ${a}` : `- ${a.citationText || a.citation || a.rubro || a.id}: ${a.topic || ''}`).join('\n')
    );
  } else {
    systemPromptLines.push('', 'CRITERIOS Y AUTORIDADES:\nNinguna identificada');
  }

  const systemPrompt = systemPromptLines.join('\n');

  // Instrucción por tipo de tarea
  const promptLines: string[] = [
    `DOCUMENTO: ${doc.documentTypeLabel}`,
    `SECCIÓN: ${task.sectionTitle}`,
    `OBJETIVO ESPECÍFICO DE ESTA TAREA: ${task.objective}`,
    `EXPEDIENTE: ${expedienteNum}`,
    `AUTORIDAD / JUZGADO: ${autoridadName}`,
    `PARTE QUE REPRESENTAS: ${quejosoName}`,
    '',
  ];

  if (scopedIssues.length > 0) {
    promptLines.push(
      '── ISSUES CANÓNICAS ACOTADAS ──',
      ...scopedIssues.map((issue) => `ISSUE ${issue.id}: ${issue.question} | researchStatus=${issue.researchStatus}`),
      `RELACIONES EXPLÍCITAS: claims=${task.claimIds?.join(',') || '[]'}; facts=${task.factIds?.join(',') || '[]'}; evidence=${task.evidenceIds?.join(',') || '[]'}; authorities=${task.authorityIds?.join(',') || '[]'}`,
      '',
    );
  }

  if (lawyerProfile) {
    promptLines.push(`TONO PROFESIONAL: ${lawyerProfile.preferredTone}; ESTILO: ${lawyerProfile.citationStyle}`);
  }

  // Contexto acotado por tipo de tarea (4C, 4E, 4F)
  if ((task.taskType || task.type) === 'LEGAL_RESEARCH') {
    promptLines.push(
      '── PLAN DE INVESTIGACIÓN JURÍDICA ──',
      'Esta tarea solo identifica requisitos de investigación y verificación pendientes.',
      'No consulta proveedores, fuentes externas ni afirma aplicabilidad jurídica.',
    );
  } else if (task.taskType === 'ISSUE' && task.issuePlan) {
    const ip = task.issuePlan;
    promptLines.push(
      '── ELEMENTOS DE LA CUESTIÓN JURÍDICA A DESARROLLAR ──',
      `TÍTULO DEL AGRAVIO / CONCEPTO: ${ip.title}`,
      ip.targetConsideration ? `CONSIDERACIÓN IMPUGNADA: ${ip.targetConsideration}` : '',
      ip.constitutionalStandard ? `PARÁMETRO CONSTITUCIONAL / NORMATIVO: ${ip.constitutionalStandard}` : '',
      ip.counterargumentStrategy ? `ESTRATEGIA DE REFUTACIÓN: ${ip.counterargumentStrategy}` : '',
      '',
      'ESTRUCTURA DE RAZONAMIENTO OBLIGATORIA (4D):',
      '1. Identificar la determinación o consideración controvertida de la autoridad recurrida.',
      '2. Explicar el punto jurídico litigioso y los hechos acreditados que lo sustentan.',
      '3. Contrastar con el parámetro constitucional y legal aplicable.',
      '4. Demostrar la ilegalidad, indebida motivación o vulneración de derechos.',
      '5. Concluir con la consecuencia jurídica solicitada (revocación / modificación / amparo).',
    );

    // Cero invención de jurisprudencia (4K)
    if (task.authorityIds && task.authorityIds.length > 0) {
      promptLines.push(`AUTORIDADES Y CRITERIOS VINCULADOS: ${task.authorityIds.join(', ')}`);
    } else {
      promptLines.push('AUTORIDADES: No se citan tesis no verificadas. Desarrolla el argumento con base en la ley y razonamiento lógico-jurídico.');
    }
  } else if (task.taskType === 'CLAIM' && task.claimPlan) {
    const cp = task.claimPlan;
    promptLines.push(
      '── CONTESTACIÓN DE PRESTACIÓN ESPECÍFICA (4E) ──',
      `PRESTACIÓN CORRELATIVA: ${cp.claimNumber}`,
      `TEXTO DE LA PRESTACIÓN RECLAMADA: ${cp.claimText}`,
      `POSTURA DEFENSIVA: ${cp.defenseStrategy}`,
      'INSTRUCCIÓN: Redacta una contestación de fondo circunstanciada, técnica y prudente. PROHIBIDO reducir la respuesta a una plantilla de "Se niega". Explica por qué no se actualizan los supuestos de procedencia o por qué carece de sustento.',
    );
  } else if (task.taskType === 'FACT_RESPONSE' && task.factResponsePlan) {
    const fp = task.factResponsePlan;
    promptLines.push(
      '── CONTESTACIÓN DE HECHO ESPECÍFICO (4F) ──',
      `CORRELATIVO: Hecho ${fp.factNumber}`,
      `HECHO AFIRMADO POR LA CONTRAPARTE: ${fp.factText}`,
      `POSTURA PROCESAL: ${fp.responseKind}`,
      fp.clarification ? `CIRCUNSTANCIACIÓN: ${fp.clarification}` : '',
      (fp.supportingEvidenceIds || []).length > 0 ? `PRUEBAS RELACIONADAS: ${(fp.supportingEvidenceIds || []).join(', ')}` : '',
      'INSTRUCCIÓN: Redacta la contestación a este hecho fijando la postura de manera clara y circunstanciada sin asumir hechos ajenos. Puede requerir uno o varios párrafos según la complejidad.',
    );
  } else {
    promptLines.push(
      `CONTENIDO A DESARROLLAR: ${task.title}`,
      `OBJETIVO: ${task.objective}`,
    );
  }

  return {
    systemPrompt,
    userMessage: promptLines.filter(Boolean).join('\n'),
  };
}

// ── 6. DEDUPLICACIÓN DE COSTURA EN CONTINUACIÓN (4M) ───────────────────────

/**
 * Deduplica texto solapado en la costura de una continuación truncada.
 */
export function stitchTruncatedText(existingText: string, continuationText: string): string {
  const cleanExisting = existingText.trim();
  const cleanContinuation = continuationText.trim();

  if (!cleanExisting) return cleanContinuation;
  if (!cleanContinuation) return cleanExisting;

  // 1. Check direct character overlap on seam
  const maxOverlap = Math.min(250, cleanExisting.length, cleanContinuation.length);
  for (let len = maxOverlap; len >= 5; len--) {
    const suffix = cleanExisting.slice(-len);
    if (cleanContinuation.startsWith(suffix)) {
      const rest = cleanContinuation.slice(len).trim();
      return rest ? `${cleanExisting} ${rest}` : cleanExisting;
    }
  }

  // 2. Check word-based overlap on seam without dropping short words
  const existingWords = cleanExisting.split(/\s+/);
  const contWords = cleanContinuation.split(/\s+/);
  const maxWordOverlap = Math.min(15, existingWords.length, contWords.length);

  for (let wCount = maxWordOverlap; wCount >= 1; wCount--) {
    const endWords = existingWords.slice(-wCount).join(' ');
    const startWords = contWords.slice(0, wCount).join(' ');
    if (endWords.toLowerCase() === startWords.toLowerCase()) {
      const remainingContWords = contWords.slice(wCount).join(' ');
      return remainingContWords ? `${cleanExisting} ${remainingContWords}` : cleanExisting;
    }
  }

  // 3. Normal join
  const endsWithPunct = /[.;:\n]$/.test(cleanExisting);
  return endsWithPunct ? `${cleanExisting}\n\n${cleanContinuation}` : `${cleanExisting} ${cleanContinuation}`;
}

function getReviewOnlyTaskReason(task: GenerationTask, doc: UniversalLegalDocument): string | undefined {
  if ((task.taskType || task.type) !== 'COVERAGE_ITEM') return undefined;
  const item = doc.coverageMatrix?.items.find((candidate) => task.coverageItemIds?.includes(candidate.id));
  if (!item) return undefined;
  if (item.category === 'CONFLICT_REVIEW') return 'BLOCKING_CONFLICT_REQUIRES_REVIEW';
  if (item.category === 'MISSING_CLIENT_POSITION') return 'MISSING_CLIENT_POSITION_REQUIRED';
  return undefined;
}

function completeLegalResearchPlanningTask(
  task: GenerationTask,
  trace: GenerationTraceContext | undefined,
  startedAt: string,
  taskStartedMs: number,
): { block: ContentBlock; result: GenerationTaskResult } {
  const issueIds = task.legalIssueIds || [];
  const planningText = `[LEGAL_RESEARCH_PLANNED: ${issueIds.join(',') || task.id}]`;
  task.status = 'completed';
  task.fallbackUsed = false;
  task.generatedBlockIds = [`blk-${task.id}`];
  const block: ContentBlock = {
    id: `blk-${task.id}`,
    text: planningText,
    layer: 'SOURCE_FACT',
    trustLevel: 'UNVERIFIED',
    provenance: 'INFERRED',
    generationStatus: 'partial',
    generationRequirement: 'DETERMINISTIC',
    isManuallyEdited: false,
    generatedBy: 'DETERMINISTIC',
    provider: 'none',
    model: null,
    generationId: trace?.generationId,
    generationTaskId: task.id,
    coverageItemIds: task.coverageItemIds || [],
    fallbackStatus: 'LEGAL_RESEARCH_PLANNED',
    fallbackReason: 'LEGAL_RESEARCH_REQUIRED',
  };
  trace?.recordDraftBlock(block);
  trace?.recordTaskExecution({
    taskId: task.id,
    taskType: task.taskType || task.type,
    sectionId: task.sectionId,
    coverageItemIds: task.coverageItemIds || [],
    legalIssueIds: issueIds,
    evidenceIds: task.evidenceIds || [],
    factIds: task.factIds || [],
    claimIds: task.claimIds || [],
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - taskStartedMs,
    tokenBudget: task.tokenBudget,
    inputSizeBytes: 0,
    outputSizeBytes: Buffer.byteLength(planningText, 'utf8'),
    continuationCount: 0,
    responseStatus: 'planned',
    rawOutputHash: hashTraceText(planningText),
    normalizedOutput: planningText,
    retryCount: 0,
    fallbackUsed: false,
    providerRequested: 'none',
    providerActuallyUsed: 'NONE',
    model: null,
    origin: 'LOCAL_PLACEHOLDER',
    finalBlockId: block.id,
  });
  return {
    block,
    result: {
      text: planningText,
      success: true,
      finishReason: 'plan-only',
      isTruncated: false,
      provider: 'none',
      fallbackUsed: false,
      warnings: ['LEGAL_RESEARCH_REQUIRED', 'LEGAL_RESEARCH_PLAN_ONLY_NO_PROVIDER'],
    },
  };
}

// ── 7. EJECUCIÓN DE TAREA CON CONTINUACIÓN CONTROLADA (4L, 4M, 4N, 5O) ─────

export async function executeGenerationTask(
  task: GenerationTask,
  doc: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis,
  customGenerator?: (params: {
    section: DocumentNode;
    doc: UniversalLegalDocument;
    task?: GenerationTask;
    revisionMode?: RevisionMode;
    deficiencies?: string[];
    pass?: number;
  }) => Promise<string> | string,
  lawyerProfile?: LawyerProfile,
  siblingBlocks: ContentBlock[] = [],
  trace?: GenerationTraceContext,
): Promise<{ block: ContentBlock; result: GenerationTaskResult }> {
  const taskStartedAt = new Date().toISOString();
  const taskStartedMs = Date.now();
  task.status = 'in_progress';
  task.passes = 1;
  task.revisionPasses = 0;
  trace?.recordTaskPlanned(task);

  if ((task.taskType || task.type) === 'LEGAL_RESEARCH') {
    return completeLegalResearchPlanningTask(task, trace, taskStartedAt, taskStartedMs);
  }

  // Conflict and missing-position Coverage is a review obligation, not a
  // drafting prompt. Keep a local auditable marker and avoid asking any
  // provider to invent a resolution for it.
  const reviewOnlyReason = getReviewOnlyTaskReason(task, doc);
  if (reviewOnlyReason) {
    task.status = 'fallback';
    task.fallbackUsed = true;
    task.error = reviewOnlyReason;
    const reviewText = `[REQUIERE REVISIÓN DEL ABOGADO: ${task.title || task.label || task.id}]`;
    const block: ContentBlock = {
      id: `blk-${task.id}`,
      text: reviewText,
      layer: 'SOURCE_FACT',
      trustLevel: 'UNVERIFIED',
      provenance: 'INFERRED',
      generationStatus: 'partial',
      generationRequirement: 'AI_REQUIRED',
      isManuallyEdited: false,
      generatedBy: 'FALLBACK',
      provider: 'none',
      model: null,
      generationId: trace?.generationId,
      generationTaskId: task.id,
      coverageItemIds: task.coverageItemIds || [],
      fallbackStatus: 'LOCAL_PLACEHOLDER',
      fallbackReason: reviewOnlyReason,
    };
    task.generatedBlockIds = [block.id];
    const evaluation = evaluateBlockQuality(block, task, doc, caseAnalysis, siblingBlocks);
    task.evaluation = evaluation;
    block.semanticEvaluation = evaluation;
    trace?.recordSemanticEvaluation(evaluation);
    trace?.recordDraftBlock(block);
    trace?.recordTaskExecution({
      taskId: task.id,
      taskType: task.taskType || task.type,
      sectionId: task.sectionId,
      coverageItemIds: task.coverageItemIds || [],
      legalIssueIds: task.legalIssueIds || (task.targetIssueId ? [task.targetIssueId] : []),
      evidenceIds: task.evidenceIds || [],
      factIds: task.factIds || [],
      claimIds: task.claimIds || [],
      startedAt: taskStartedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - taskStartedMs,
      tokenBudget: task.tokenBudget,
      inputSizeBytes: 0,
      outputSizeBytes: Buffer.byteLength(reviewText, 'utf8'),
      continuationCount: 0,
      responseStatus: 'fallback',
      rawOutputHash: hashTraceText(reviewText),
      normalizedOutput: reviewText,
      evaluation,
      retryCount: 0,
      fallbackUsed: true,
      fallbackReason: reviewOnlyReason,
      providerRequested: 'nvidia',
      providerActuallyUsed: 'NONE',
      model: null,
      origin: 'LOCAL_PLACEHOLDER',
      finalBlockId: block.id,
      error: reviewOnlyReason,
    });
    return {
      block,
      result: {
        text: reviewText,
        success: false,
        finishReason: 'stop',
        isTruncated: false,
        provider: 'local',
        fallbackUsed: true,
        warnings: [reviewOnlyReason],
        evaluation,
      },
    };
  }

  // Si hay customGenerator (pruebas unitarias o mocks)
  if (customGenerator) {
    const fakeSection: DocumentNode = {
      id: task.sectionId,
      type: 'argument',
      title: task.title || task.label || 'Sección',
      order: task.order ?? task.orderInParent ?? 0,
      content: [],
      isRepeatable: false,
      isEditable: true,
      isGenerated: false,
      isManuallyEdited: false,
      variables: [],
      validationErrors: [],
      validationWarnings: [],
    };
    try {
      const customText = await customGenerator({ section: fakeSection, doc, task, pass: 1 });
      let sanitized = sanitizeGeneratedText(String(customText));
      if (!sanitized.trim()) {
        throw new Error('Generador produjo texto vacío');
      }
      let unresolvedDeps = extractUnresolvedFactualDependencies(sanitized);

      const block: ContentBlock = {
        id: `blk-${task.id}`,
        text: sanitized,
        layer: 'GENERATED_ARGUMENT',
        trustLevel: 'AI_INFERENCE',
        provenance: 'AI_GENERATED',
        generationStatus: unresolvedDeps.length > 0 ? 'partial' : 'generated',
        generationRequirement: 'AI_REQUIRED',
        isManuallyEdited: false,
        taskId: task.id,
        coverageItemIds: task.coverageItemIds || [],
        factIds: task.factIds || [],
        evidenceIds: task.evidenceIds || [],
        revisionNumber: 0,
        generatedBy: 'AI',
        provider: 'custom',
        model: null,
        generationId: trace?.generationId,
        generationTaskId: task.id,
      };

      // FASE 5: Evaluación Semántica
      let evaluation = evaluateBlockQuality(block, task, doc, caseAnalysis, siblingBlocks);
      task.evaluation = evaluation;

      // Si es WEAK y se permiten revisiones dirigidas (hasta 2 pases)
      while (
        evaluation.verdict === 'WEAK' &&
        (task.revisionPasses || 0) < SEMANTIC_THRESHOLDS.MAX_SEMANTIC_REVISIONS_PER_TASK
      ) {
        task.revisionPasses = (task.revisionPasses || 0) + 1;
        task.passes = (task.passes || 1) + 1;
        const prevBlockId = block.id;
        const revisedText = await customGenerator({
          section: fakeSection,
          doc,
          task,
          revisionMode: evaluation.revisionMode,
          deficiencies: evaluation.deficiencies,
          pass: (task.revisionPasses || 0) + 1,
        });
        if (revisedText && typeof revisedText === 'string') {
          sanitized = sanitizeGeneratedText(revisedText);
          block.text = sanitized;
          block.revisionOfBlockId = prevBlockId;
          block.revisionNumber = task.revisionPasses;
          block.taskId = task.id;
          block.coverageItemIds = task.coverageItemIds || [];
          block.factIds = task.factIds || [];
          block.evidenceIds = task.evidenceIds || [];
          unresolvedDeps = extractUnresolvedFactualDependencies(sanitized);
          evaluation = evaluateBlockQuality(block, task, doc, caseAnalysis, siblingBlocks);
          task.evaluation = evaluation;
        } else {
          break;
        }
      }

      if (unresolvedDeps.length > 0) {
        task.status = 'partial';
        task.unresolvedDependencies = unresolvedDeps;
        block.generationStatus = 'partial';
      } else {
        task.status = 'completed';
        block.generationStatus = 'generated';
      }

      block.semanticEvaluation = evaluation;
      task.generatedBlockIds = [block.id];
      trace?.recordSemanticEvaluation(evaluation);
      trace?.recordDraftBlock(block);
      trace?.recordTaskExecution({
        taskId: task.id,
        taskType: task.taskType || task.type,
        sectionId: task.sectionId,
        coverageItemIds: task.coverageItemIds || [],
        legalIssueIds: task.legalIssueIds || (task.targetIssueId ? [task.targetIssueId] : []),
        evidenceIds: task.evidenceIds || [],
        factIds: task.factIds || [],
        claimIds: task.claimIds || [],
        startedAt: taskStartedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - taskStartedMs,
        tokenBudget: task.tokenBudget,
        inputSizeBytes: 0,
        outputSizeBytes: Buffer.byteLength(sanitized, 'utf8'),
        continuationCount: 0,
        responseStatus: 'success',
        rawOutputHash: hashTraceText(String(customText)),
        normalizedOutput: sanitized,
        evaluation,
        retryCount: task.revisionPasses || 0,
        fallbackUsed: false,
        fallbackReason: null,
        providerRequested: 'custom',
        providerActuallyUsed: 'NONE',
        model: null,
        origin: 'AI_GENERATED_LEGAL_CONTENT',
        finalBlockId: block.id,
      });
      return {
        block,
        result: {
          text: sanitized,
          success: true,
          finishReason: 'stop',
          isTruncated: false,
          provider: 'custom',
          fallbackUsed: false,
          warnings: evaluation.deficiencies || [],
          evaluation,
        },
      };
    } catch (err: any) {
      task.status = 'fallback';
      task.fallbackUsed = true;
      task.error = err?.message || 'Error en generador';
      const fallbackText = buildDeterministicTaskFallback(task, doc, caseAnalysis);
      const block: ContentBlock = {
        id: `blk-${task.id}`,
        text: fallbackText,
        layer: 'SOURCE_FACT',
        trustLevel: 'UNVERIFIED',
        provenance: 'INFERRED',
        generationStatus: 'partial',
        generationRequirement: 'AI_REQUIRED',
        isManuallyEdited: false,
        generatedBy: 'FALLBACK',
        provider: 'none',
        model: null,
        generationId: trace?.generationId,
        generationTaskId: task.id,
        fallbackStatus: 'DETERMINISTIC_FALLBACK',
        fallbackReason: task.error,
      };
      task.generatedBlockIds = [block.id];
      const fallbackEval = evaluateBlockQuality(block, task, doc, caseAnalysis, siblingBlocks);
      task.evaluation = fallbackEval;
      block.semanticEvaluation = fallbackEval;
      trace?.recordSemanticEvaluation(fallbackEval);
      trace?.recordDraftBlock(block);
      trace?.recordTaskExecution({
        taskId: task.id,
        taskType: task.taskType || task.type,
        sectionId: task.sectionId,
        coverageItemIds: task.coverageItemIds || [],
        legalIssueIds: task.legalIssueIds || (task.targetIssueId ? [task.targetIssueId] : []),
        evidenceIds: task.evidenceIds || [],
        factIds: task.factIds || [],
        claimIds: task.claimIds || [],
        startedAt: taskStartedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - taskStartedMs,
        tokenBudget: task.tokenBudget,
        inputSizeBytes: 0,
        outputSizeBytes: Buffer.byteLength(fallbackText, 'utf8'),
        continuationCount: 0,
        responseStatus: 'fallback',
        rawOutputHash: hashTraceText(fallbackText),
        normalizedOutput: fallbackText,
        evaluation: fallbackEval,
        retryCount: 0,
        fallbackUsed: true,
        fallbackReason: task.error,
        providerRequested: 'custom',
        providerActuallyUsed: 'NONE',
        model: null,
        origin: 'DETERMINISTIC_FALLBACK',
        finalBlockId: block.id,
        error: task.error,
      });
      return {
        block,
        result: {
          text: fallbackText,
          success: false,
          finishReason: 'stop',
          isTruncated: false,
          provider: 'deterministic_fallback',
          fallbackUsed: true,
          warnings: [`Fallo en generador para ${task.id}: ${task.error}`],
          evaluation: fallbackEval,
        },
      };
    }
  }

  const { systemPrompt, userMessage } = buildTaskContextPack(task, doc, caseAnalysis, lawyerProfile);
  trace?.recordTaskPlanned(task, { systemPrompt, userMessage });
  let accumulatedText = '';
  let finishReason: string | null = 'stop';
  let isTruncated = false;
  let fallbackUsed = false;
  let tokensUsed = 0;
  const providerRequested = 'nvidia';
  let providerUsed = 'deterministic_fallback';
  let providerModel: string | null = null;
  let providerActuallyUsed: ProviderActuallyUsed = 'NONE';
  let origin: GenerationOrigin = 'DETERMINISTIC_FALLBACK';
  let fallbackReason: string | null = null;
  let continuationPasses = 0;
  const warnings: string[] = [];

  try {
    // ── Pase 1 ──────────────────────────────────────────────────────────────
    const aiRes = await runFastMode({
      systemPrompt,
      userMessage,
      mode: 'fast',
      maxTokens: task.tokenBudget,
    });

    const isLegalAiResponse = Boolean(
      aiRes.success &&
      aiRes.content &&
      aiRes.origin !== 'LOCAL_PLACEHOLDER' &&
      aiRes.isLegalAiContent !== false
    );

    if (isLegalAiResponse) {
      accumulatedText = aiRes.content.trim();
      finishReason = aiRes.finishReason || 'stop';
      isTruncated = Boolean(aiRes.isTruncated || finishReason === 'length');
      tokensUsed += aiRes.usage?.totalTokens || 0;
      providerUsed = aiRes.provider;
      providerModel = aiRes.model || null;
      providerActuallyUsed = aiRes.provider === 'nvidia' ? 'NVIDIA' : aiRes.provider === 'local' ? 'LOCAL' : 'NONE';
      origin = aiRes.origin === 'SOURCE_DIRECT' || aiRes.origin === 'USER'
        ? aiRes.origin
        : 'AI_GENERATED_LEGAL_CONTENT';
      fallbackReason = aiRes.fallbackReason || null;

      // ── Pase de continuación si quedó truncado (4M) ───────────────────────
      while (isTruncated && continuationPasses < TASK_LIMITS.MAX_CONTINUATIONS_PER_TASK) {
        continuationPasses++;
        task.passes = (task.passes || 1) + 1;

        const tailExcerpt = accumulatedText.slice(-250);
        const continuationUserMessage = [
          `TAREA: ${task.title}`,
          `El desarrollo argumentativo anterior quedó inconcluso en este punto exacto:`,
          `"...${tailExcerpt}"`,
          '',
          'INSTRUCCIÓN DE CONTINUACIÓN ESTRICTA (4M):',
          'Continúa exactamente desde el argumento inconcluso sin repetir lo ya redactado y concluye de forma contundente el planteamiento jurídico.',
        ].join('\n');

        const contRes = await runFastMode({
          systemPrompt,
          userMessage: continuationUserMessage,
          mode: 'fast',
          maxTokens: Math.min(3000, task.tokenBudget),
        });

        const isLegalContinuation = Boolean(
          contRes.success &&
          contRes.content &&
          contRes.origin !== 'LOCAL_PLACEHOLDER' &&
          contRes.isLegalAiContent !== false
        );

        if (isLegalContinuation) {
          accumulatedText = stitchTruncatedText(accumulatedText, contRes.content);
          finishReason = contRes.finishReason || 'stop';
          isTruncated = Boolean(contRes.isTruncated || finishReason === 'length');
          tokensUsed += contRes.usage?.totalTokens || 0;
          providerUsed = contRes.provider;
          providerModel = contRes.model || providerModel;
          providerActuallyUsed = contRes.provider === 'nvidia' ? 'NVIDIA' : contRes.provider === 'local' ? 'LOCAL' : providerActuallyUsed;
        } else if (contRes.success && contRes.content) {
          fallbackUsed = true;
          providerUsed = contRes.provider;
          providerModel = contRes.model || providerModel;
          providerActuallyUsed = contRes.provider === 'local' ? 'LOCAL' : 'NONE';
          origin = contRes.origin === 'LOCAL_PLACEHOLDER' ? 'LOCAL_PLACEHOLDER' : 'DETERMINISTIC_FALLBACK';
          fallbackReason = contRes.fallbackReason || 'LOCAL_PLACEHOLDER_DURING_CONTINUATION';
          warnings.push(`La continuación de ${task.id} no fue contenido jurídico de IA; se conserva el texto previo y se marca fallback.`);
          break;
        } else {
          fallbackUsed = true;
          fallbackReason = aiRes.fallbackReason || contRes.fallbackReason || 'NVIDIA_CONTINUATION_FAILED';
          break;
        }
      }

      // Si después de los pases permitidos sigue truncado:
      if (isTruncated) {
        task.status = 'partial';
        task.isTruncated = true;
        warnings.push(`Tarea ${task.id} quedó parcialmente truncada tras ${continuationPasses} continuaciones.`);
      } else {
        task.status = 'completed';
      }
    } else {
      // Fallback/local seguro (4N: NO fingir razonamiento ni marcar covered)
      fallbackUsed = true;
      task.status = 'fallback';
      if (aiRes.success && aiRes.content && aiRes.origin === 'LOCAL_PLACEHOLDER') {
        accumulatedText = aiRes.content.trim();
        providerUsed = aiRes.provider;
        providerModel = aiRes.model || null;
        providerActuallyUsed = 'LOCAL';
        origin = 'LOCAL_PLACEHOLDER';
        fallbackReason = aiRes.fallbackReason || 'NVIDIA_FALLBACK_LOCAL';
        warnings.push(`Fallback local utilizado en ${task.id}: el proveedor externo no produjo contenido jurídico de IA.`);
      } else {
        accumulatedText = buildDeterministicTaskFallback(task, doc, caseAnalysis);
        providerUsed = 'deterministic_fallback';
        providerModel = null;
        providerActuallyUsed = 'NONE';
        origin = 'DETERMINISTIC_FALLBACK';
        fallbackReason = aiRes.fallbackReason || aiRes.errorCode || 'NVIDIA_UNAVAILABLE';
        warnings.push(`Fallback determinístico utilizado en ${task.id}: proveedor de IA no disponible.`);
      }
    }
  } catch (err: any) {
    fallbackUsed = true;
    task.status = 'failed';
    task.error = String(err?.message || err);
    accumulatedText = buildDeterministicTaskFallback(task, doc, caseAnalysis);
    providerUsed = 'deterministic_fallback';
    providerModel = null;
    providerActuallyUsed = 'NONE';
    origin = 'DETERMINISTIC_FALLBACK';
    fallbackReason = task.error;
    warnings.push(`Fallo en ejecución de tarea ${task.id}: ${task.error}`);
  }

  let sanitized = sanitizeGeneratedText(accumulatedText);
  let unresolvedDeps = extractUnresolvedFactualDependencies(sanitized);
  if (unresolvedDeps.length > 0) {
    task.status = 'partial';
    task.unresolvedDependencies = unresolvedDeps;
    warnings.push(`Tarea ${task.id} contiene ${unresolvedDeps.length} dependencias fácticas no resueltas: ${unresolvedDeps.join(', ')}`);
  }

  const block: ContentBlock = {
    id: `blk-${task.id}`,
    text: sanitized,
    layer: fallbackUsed ? 'SOURCE_FACT' : 'GENERATED_ARGUMENT',
    trustLevel: fallbackUsed ? 'UNVERIFIED' : 'AI_INFERENCE',
    provenance: fallbackUsed ? 'INFERRED' : 'AI_GENERATED',
    generationStatus: fallbackUsed ? 'partial' : task.isTruncated ? 'truncated' : unresolvedDeps.length > 0 ? 'partial' : 'generated',
    generationRequirement: 'AI_REQUIRED',
    isManuallyEdited: false,
    taskId: task.id,
    coverageItemIds: task.coverageItemIds || [],
    factIds: task.factIds || [],
    evidenceIds: task.evidenceIds || [],
    revisionNumber: 0,
    generatedBy: fallbackUsed ? 'FALLBACK' : 'AI',
    provider: providerUsed,
    model: providerModel,
    generationId: trace?.generationId,
    generationTaskId: task.id,
    fallbackStatus: fallbackUsed ? origin : undefined,
    fallbackReason: fallbackUsed ? fallbackReason : null,
  };

  // FASE 5: Evaluación Semántica
  let evaluation = evaluateBlockQuality(block, task, doc, caseAnalysis, siblingBlocks);
  task.evaluation = evaluation;

  // FASE 5O: Si verdict === 'WEAK' y no hubo fallback ni truncamiento ni dependencias fácticas
  if (!fallbackUsed && evaluation.verdict === 'WEAK' && !task.isTruncated && unresolvedDeps.length === 0) {
    while (
      evaluation.verdict === 'WEAK' &&
      (task.revisionPasses || 0) < SEMANTIC_THRESHOLDS.MAX_SEMANTIC_REVISIONS_PER_TASK
    ) {
      task.revisionPasses = (task.revisionPasses || 0) + 1;
      task.passes = (task.passes || 1) + 1;
      const prevBlockId = block.id;
      const revisionPrompt = buildTargetedRevisionPrompt(task, block, evaluation);

      const revRes = await runFastMode({
        systemPrompt: revisionPrompt.systemInstruction,
        userMessage: revisionPrompt.userMessage,
        mode: 'fast',
        maxTokens: task.tokenBudget,
      });

      if (revRes.success && revRes.content) {
        sanitized = sanitizeGeneratedText(revRes.content.trim());
        unresolvedDeps = extractUnresolvedFactualDependencies(sanitized);
        if (unresolvedDeps.length > 0) {
          task.unresolvedDependencies = unresolvedDeps;
        }
        block.text = sanitized;
        block.revisionOfBlockId = prevBlockId;
        block.revisionNumber = task.revisionPasses;
        block.taskId = task.id;
        block.coverageItemIds = task.coverageItemIds || [];
        block.factIds = task.factIds || [];
        block.evidenceIds = task.evidenceIds || [];
        tokensUsed += revRes.usage?.totalTokens || 0;
        evaluation = evaluateBlockQuality(block, task, doc, caseAnalysis, siblingBlocks);
        task.evaluation = evaluation;
      } else {
        break;
      }
    }
  }

  // Actualizar estados técnicos y de generación
  if (unresolvedDeps.length > 0 || (task.unresolvedDependencies && task.unresolvedDependencies.length > 0)) {
    task.status = 'partial';
    block.generationStatus = 'partial';
  } else if (task.isTruncated || isTruncated) {
    task.status = 'partial';
    block.generationStatus = 'truncated';
  } else if (fallbackUsed) {
    task.status = 'fallback';
    block.generationStatus = 'partial';
  } else {
    task.status = 'completed';
    block.generationStatus = 'generated';
    if (evaluation.deficiencies.length > 0) {
      warnings.push(...evaluation.deficiencies);
    }
  }

  block.semanticEvaluation = evaluation;
  task.generatedBlockIds = [block.id];
  task.finishReason = finishReason;
  task.tokensUsed = tokensUsed;
  task.fallbackUsed = fallbackUsed;
  block.semanticScore = evaluation.overallScore;
  block.genericityClass = evaluation.caseDensityMetrics && evaluation.caseDensityMetrics.genericPhrasesCount > 0
    ? 'GENERIC'
    : 'SPECIFIC';

  trace?.recordSemanticEvaluation(evaluation);
  trace?.recordDraftBlock(block);
  trace?.recordTaskExecution({
    taskId: task.id,
    taskType: task.taskType || task.type,
    sectionId: task.sectionId,
    coverageItemIds: task.coverageItemIds || [],
    legalIssueIds: task.legalIssueIds || (task.targetIssueId ? [task.targetIssueId] : []),
    evidenceIds: task.evidenceIds || [],
    factIds: task.factIds || [],
    claimIds: task.claimIds || [],
    contextPack: { systemPrompt, userMessage },
    providerRequested,
    providerActuallyUsed,
    model: providerModel,
    startedAt: taskStartedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - taskStartedMs,
    tokenBudget: task.tokenBudget,
    inputSizeBytes: Buffer.byteLength(`${systemPrompt}\n${userMessage}`, 'utf8'),
    outputSizeBytes: Buffer.byteLength(sanitized, 'utf8'),
    continuationCount: continuationPasses,
    responseStatus: fallbackUsed ? 'fallback' : task.status,
    rawOutputHash: hashTraceText(accumulatedText),
    normalizedOutput: sanitized,
    evaluation,
    retryCount: task.revisionPasses || 0,
    fallbackUsed,
    fallbackReason,
    origin,
    finalBlockId: block.id,
    error: task.error,
  });

  return {
    block,
    result: {
      text: block.text,
      success: !fallbackUsed && (task.status as string) !== 'failed',
      finishReason,
      isTruncated,
      tokensUsed,
      provider: providerUsed,
      fallbackUsed,
      warnings,
      evaluation,
    },
  };
}

function buildDeterministicTaskFallback(
  task: GenerationTask,
  doc: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis,
): string {
  const taskType = task.taskType || task.type;
  const title = task.title || task.label || 'AGRAVIO';
  if (taskType === 'ISSUE') {
    return `AGRAVIO POR OMISIÓN DE ESTUDIO:\n\n${title.toUpperCase()}\n\n[DATO PENDIENTE DE EXPEDIENTE: Fundamentación y desarrollo argumentativo de ${title}]`;
  }
  if (taskType === 'CLAIM') {
    return `CONTESTACIÓN A LA PRESTACIÓN ${task.claimPlan?.claimNumber || task.targetClaimId || ''}:\n[REQUIERE INSTRUCCIÓN DEL ABOGADO: fijar postura y excepciones aplicables]`;
  }
  if (taskType === 'FACT_RESPONSE') {
    return `AL HECHO ${task.factResponsePlan?.factNumber || task.targetFactId || ''}:\n[REQUIERE DEFINIR POSTURA DEL ABOGADO: contestación circunstanciada]`;
  }
  return `[DATO PENDIENTE DE EXPEDIENTE: ${title}]`;
}

// ── 8. ENSAMBLADO DETERMINISTA DE SECCIÓN (4P, 4Q) ─────────────────────────

export function assembleSectionBlocks(
  section: DocumentNode,
  tasks: GenerationTask[],
  generatedBlocks: ContentBlock[],
): ContentBlock[] {
  // 1. Preservar bloques humanos o existentes que no sean semillas
  const preservedHumanBlocks: ContentBlock[] = (section.content || []).filter(
    (b) => b.isManuallyEdited || (b.layer === 'USER_POSITION' && !hasSeedMarkers(b.text)),
  );

  // 2. Ordenar bloques generados según el orden estricto de sus tareas
  const taskOrderMap = new Map<string, number>();
  for (const t of tasks) {
    const taskOrder = t.order ?? t.orderInParent ?? 0;
    taskOrderMap.set(`blk-${t.id}`, taskOrder);
    taskOrderMap.set(t.id, taskOrder);
  }

  const sortedGenerated = [...generatedBlocks].sort((a, b) => {
    const orderA = taskOrderMap.get(a.id) ?? 999;
    const orderB = taskOrderMap.get(b.id) ?? 999;
    return orderA - orderB;
  });

  // 3. Sanitizar marcadores de semilla residuales
  const cleanedGenerated = sortedGenerated.map((b) => ({
    ...b,
    text: stripSeedMarkers(b.text),
  }));

  // 4. Si hay bloques humanos preservados, colocarlos primero o ensamblarlos
  if (preservedHumanBlocks.length > 0) {
    return [...preservedHumanBlocks, ...cleanedGenerated];
  }

  return cleanedGenerated;
}

// ── 9. ACTUALIZACIÓN DE ESTADO EN COVERAGE MATRIX (4O) ──────────────────────

export function updateCoverageMatrixWithTaskResults(
  coverageMatrix: CoverageMatrix,
  tasks: GenerationTask[],
  options: { applySemanticEvaluation?: boolean } = {},
  trace?: GenerationTraceContext,
): void {
  for (const task of tasks) {
    const covIds = (task.coverageItemIds && task.coverageItemIds.length > 0)
      ? task.coverageItemIds
      : [task.targetIssueId, task.targetClaimId, task.targetFactId].filter(Boolean) as string[];

    for (const covId of covIds) {
      const item = coverageMatrix.items.find(
        (i) => i.id === covId || i.sourceId === covId || i.id === `cov-issue-${covId}` || i.id === `cov-claim-${covId}` || i.id === `cov-fact-${covId}`
      );
      if (!item) continue;

      if (!item.generatedBlockIds) item.generatedBlockIds = [];
      const statusBefore = item.status;
      if (task.generatedBlockIds) {
        item.generatedBlockIds = Array.from(new Set([...item.generatedBlockIds, ...task.generatedBlockIds]));
      }

      // A semantic PASS describes the generated block; it cannot resolve a
      // conflict or invent the client's missing position. Keep these Coverage
      // states open in both the task and evaluation update paths.
      const resolutionBlockReason = getCoverageResolutionBlockReason(item);
      if (resolutionBlockReason && isHardCoverageResolutionBlock(item)) {
        item.metadata = { ...(item.metadata || {}), coverageStatusReason: resolutionBlockReason };
        if (trace) {
          trace.recordCoverageTransition({
            coverageItemId: item.id,
            legalIssueIds: task.legalIssueIds || (task.targetIssueId ? [task.targetIssueId] : []),
            statusBefore,
            statusAfter: item.status,
            reason: resolutionBlockReason,
            taskIds: [task.id],
            draftBlockIds: task.generatedBlockIds || [],
            evaluationScore: task.evaluation?.overallScore,
          });
        }
        continue;
      }

      // 4N, 4O & FASE 5: generated != covered
      if (task.fallbackUsed || task.status === 'failed' || task.status === 'fallback') {
        if (item.status === 'pending') item.status = 'weak';
      } else if (task.unresolvedDependencies && task.unresolvedDependencies.length > 0) {
        item.status = 'unsupported';
      } else if (options.applySemanticEvaluation) {
        if (task.evaluation?.verdict === 'PASS') {
          item.status = 'covered';
        } else if (task.evaluation?.verdict === 'WEAK') {
          item.status = 'weak';
        } else if (task.evaluation?.verdict === 'FAIL') {
          item.status = 'unsupported';
        } else {
          item.status = 'generated';
        }
      } else {
        if (task.status === 'completed') {
          item.status = 'generated';
        } else if (task.status === 'partial') {
          item.status = 'weak';
        }
      }

      // A claim/fact may still need an explicit client position. Preserve the
      // useful generated/weak state for diagnostics, but never call it covered.
      if (resolutionBlockReason && item.status === 'covered') {
        item.status = statusBefore === 'needs_client_position' ? 'needs_client_position' : 'generated';
        item.metadata = { ...(item.metadata || {}), coverageStatusReason: resolutionBlockReason };
      }

      const coverageReason = task.evaluation?.hardFailReasons?.find((reason) => /NOT_COVERAGE|SEMANTIC_SCORE_BELOW_THRESHOLD|NO_GENERATED_BLOCK/.test(reason));
      if (coverageReason) {
        item.metadata = { ...(item.metadata || {}), coverageStatusReason: coverageReason };
      }
      if (trace && (statusBefore !== item.status || coverageReason || resolutionBlockReason)) {
        const transition: CoverageTransitionTrace = {
          coverageItemId: item.id,
          legalIssueIds: task.legalIssueIds || (task.targetIssueId ? [task.targetIssueId] : []),
          statusBefore,
          statusAfter: item.status,
          reason: coverageReason || resolutionBlockReason || (item.status === 'covered' ? 'VALID_SUBSTANTIVE_BLOCK' : 'SEMANTIC_SCORE_BELOW_THRESHOLD'),
          taskIds: [task.id],
          draftBlockIds: task.generatedBlockIds || [],
          evaluationScore: task.evaluation?.overallScore,
        };
        trace.recordCoverageTransition(transition);
      }
    }
  }

  // Recalcular el sumario
  let requiredCount = 0;
  let pendingCount = 0;
  let generatedCount = 0;
  let coveredCount = 0;
  let weakCount = 0;
  let unsupportedCount = 0;
  let notApplicableCount = 0;

  coverageMatrix.items.forEach((item) => {
    if (item.required) requiredCount++;
    if (item.status === 'pending') pendingCount++;
    else if (item.status === 'generated') generatedCount++;
    else if (item.status === 'covered') coveredCount++;
    else if (item.status === 'weak') weakCount++;
    else if (item.status === 'unsupported') unsupportedCount++;
    else if (item.status === 'not_applicable') notApplicableCount++;
  });

  coverageMatrix.summary.required = requiredCount;
  coverageMatrix.summary.pending = pendingCount;
  coverageMatrix.summary.generated = generatedCount;
  coverageMatrix.summary.covered = coveredCount;
  coverageMatrix.summary.weak = weakCount;
  coverageMatrix.summary.unsupported = unsupportedCount;
  coverageMatrix.summary.notApplicable = notApplicableCount;
}

export function applySemanticEvaluationToCoverageMatrix(
  coverageMatrix: CoverageMatrix,
  tasksOrEvaluations: (GenerationTask | BlockQualityEvaluation)[],
): void {
  for (const entry of tasksOrEvaluations) {
    if ('verdict' in entry) {
      const evaluation = entry as BlockQualityEvaluation;
      for (const covId of evaluation.coveredCoverageItemIds) {
        const item = coverageMatrix.items.find(
          (i) => i.id === covId || i.sourceId === covId || i.id === `cov-issue-${covId}` || i.id === `cov-claim-${covId}` || i.id === `cov-fact-${covId}`
        );
        if (item && evaluation.verdict === 'PASS') {
          const statusBeforeEvaluation = item.status;
          const resolutionBlockReason = getCoverageResolutionBlockReason(item);
          if (resolutionBlockReason && isHardCoverageResolutionBlock(item)) {
            item.metadata = { ...(item.metadata || {}), coverageStatusReason: resolutionBlockReason };
            continue;
          }
          const syntheticBlock = {
            id: evaluation.blockId,
            text: '__evaluated_block__',
            generatedBy: 'AI' as const,
            generationRequirement: 'AI_REQUIRED' as const,
            coverageItemIds: [item.id],
          };
          const decision = isCoverageSatisfied(item, [syntheticBlock], [evaluation]);
          if (decision.satisfied && !resolutionBlockReason) {
            item.status = 'covered';
          } else {
            item.status = statusBeforeEvaluation === 'needs_client_position' ? 'needs_client_position' : 'weak';
            item.metadata = { ...(item.metadata || {}), coverageStatusReason: resolutionBlockReason || decision.reason };
          }
        } else if (item && item.scope === 'FORMAL' && item.satisfactionPolicy === 'FORMAL_DETERMINISTIC_ALLOWED' && item.generatedBlockIds?.length) {
          // Formal structure may be closed deterministically without semantic
          // evaluation; substantive items never take this path.
          item.status = 'covered';
        }
      }
      for (const missingId of evaluation.missingCoverageItemIds) {
        const item = coverageMatrix.items.find(
          (i) => i.id === missingId || i.sourceId === missingId || i.id === `cov-issue-${missingId}` || i.id === `cov-claim-${missingId}` || i.id === `cov-fact-${missingId}`
        );
        if (item) {
          const resolutionBlockReason = getCoverageResolutionBlockReason(item);
          if (resolutionBlockReason && isHardCoverageResolutionBlock(item)) {
            item.metadata = { ...(item.metadata || {}), coverageStatusReason: resolutionBlockReason };
            continue;
          }
          item.status = evaluation.verdict === 'WEAK' ? 'weak' : 'unsupported';
          item.metadata = { ...(item.metadata || {}), coverageStatusReason: resolutionBlockReason || (evaluation.verdict === 'WEAK' ? 'SEMANTIC_SCORE_BELOW_THRESHOLD' : 'NO_GENERATED_BLOCK') };
        }
      }
    } else {
        updateCoverageMatrixWithTaskResults(coverageMatrix, [entry as GenerationTask], { applySemanticEvaluation: true });
    }
  }

  for (const item of coverageMatrix.items) {
    if (item.scope === 'FORMAL'
      && item.satisfactionPolicy === 'FORMAL_DETERMINISTIC_ALLOWED'
      && item.generatedBlockIds?.length
      && item.status !== 'covered') {
      item.status = 'covered';
      item.metadata = { ...(item.metadata || {}), coverageStatusReason: 'VALID_STRUCTURAL_BLOCK' };
    }
  }

  let requiredCount = 0;
  let pendingCount = 0;
  let generatedCount = 0;
  let coveredCount = 0;
  let weakCount = 0;
  let unsupportedCount = 0;
  let notApplicableCount = 0;

  coverageMatrix.items.forEach((item) => {
    if (item.required) requiredCount++;
    if (item.status === 'pending') pendingCount++;
    else if (item.status === 'generated') generatedCount++;
    else if (item.status === 'covered') coveredCount++;
    else if (item.status === 'weak') weakCount++;
    else if (item.status === 'unsupported') unsupportedCount++;
    else if (item.status === 'not_applicable') notApplicableCount++;
  });

  coverageMatrix.summary.required = requiredCount;
  coverageMatrix.summary.pending = pendingCount;
  coverageMatrix.summary.generated = generatedCount;
  coverageMatrix.summary.covered = coveredCount;
  coverageMatrix.summary.weak = weakCount;
  coverageMatrix.summary.unsupported = unsupportedCount;
  coverageMatrix.summary.notApplicable = notApplicableCount;
}

// ── 10. OBSERVABILIDAD (4U) ────────────────────────────────────────────────

export function logGenerationPlan(sectionTitle: string, tasks: GenerationTask[]): void {
  console.log(`\n[GENERATION PLAN] Section "${sectionTitle}": ${tasks.length} task(s)`);
  tasks.forEach((t, i) => {
    console.log(`  [${i + 1}] task=${t.id} type=${t.taskType || t.type} complexity=${t.complexity} budget=${t.tokenBudget} cov=[${(t.coverageItemIds || []).join(', ')}]`);
  });
}

export function logTaskExecution(task: GenerationTask, pass: number, result: GenerationTaskResult): void {
  console.log(`[GENERATION] task=${task.id} pass=${pass} finishReason=${result.finishReason} tokens=${result.tokensUsed || 0} status=${task.status} fallback=${result.fallbackUsed}`);
}
