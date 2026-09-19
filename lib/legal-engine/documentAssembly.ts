import type { ContentBlock, DocumentNode, UniversalLegalDocument } from './types';
import type { GenerationTask } from './generationTasks';
import { hasSeedMarkers, hasUnresolvedFactualDependencies } from './seedMarkers';
import { stableResearchId } from './legal-research/canonical';
import type {
  DocumentAssemblyFinding,
  DocumentAssemblyInput,
  DocumentAssemblyResult,
  DocumentAssemblySection,
  DocumentAssemblyTraceMetadata,
} from './documentAssemblyTypes';

interface PlannedSection {
  section: DocumentNode;
  index: number;
  path: readonly string[];
  orderPath: readonly number[];
}

interface CandidateBlock {
  sectionId: string;
  block: ContentBlock;
}

interface BlockPlacement {
  section: PlannedSection;
  block: ContentBlock;
  task?: GenerationTask;
  classRank: number;
  sourceIndex: number;
}

const EMPTY_IDS: readonly string[] = [];

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    result[key] = cloneValue((value as Record<string, unknown>)[key]);
  }
  return result as T;
}

function sortedUnique(values: readonly string[] | undefined): string[] {
  return [...new Set((values || []).filter((value): value is string => typeof value === 'string' && value.length > 0))].sort();
}

function normalizedText(text: string): string {
  return String(text || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function finding(
  code: string,
  severity: DocumentAssemblyFinding['severity'],
  message: string,
  block?: ContentBlock,
  sectionIds: readonly string[] = EMPTY_IDS,
): DocumentAssemblyFinding {
  return {
    code,
    severity,
    message,
    reason: code,
    blockIds: block ? [block.id] : [],
    legalIssueIds: sortedUnique(block?.legalIssueIds),
    coverageItemIds: sortedUnique(block?.coverageItemIds),
    sectionIds: [...sectionIds],
  };
}

function flattenPlanSections(sections: readonly DocumentNode[]): PlannedSection[] {
  const result: PlannedSection[] = [];
  const walk = (items: readonly DocumentNode[], parentPath: readonly string[], parentOrderPath: readonly number[]) => {
    items.forEach((section, index) => {
      const path = [...parentPath, section.id];
      const orderPath = [...parentOrderPath, section.order ?? index];
      result.push({ section, index: result.length, path, orderPath });
      walk(section.children || [], path, orderPath);
    });
  };
  walk(sections, [], []);
  return result;
}

function sectionSortKey(section: PlannedSection): string {
  return `${section.index.toString().padStart(8, '0')}:${section.orderPath.map((value) => String(value).padStart(8, '0')).join('.')}`;
}

function taskForBlock(block: ContentBlock, taskById: Map<string, GenerationTask>): GenerationTask | undefined {
  const taskId = block.generationTaskId || block.taskId;
  return taskId ? taskById.get(taskId) : undefined;
}

function isFallbackBlock(block: ContentBlock): boolean {
  return block.generatedBy === 'FALLBACK'
    || Boolean(block.fallbackStatus && block.fallbackStatus !== 'NONE');
}

function isManualBlock(block: ContentBlock): boolean {
  return block.isManuallyEdited === true;
}

function isFormalCandidate(block: ContentBlock): boolean {
  return (block.generatedBy === 'DETERMINISTIC' || block.generationRequirement === 'DETERMINISTIC')
    && !isFallbackBlock(block);
}

function admitBlock(
  candidate: CandidateBlock,
  taskById: Map<string, GenerationTask>,
  sectionById: Map<string, PlannedSection>,
): { admitted: boolean; task?: GenerationTask; classRank: number; finding?: DocumentAssemblyFinding } {
  const { block, sectionId } = candidate;
  const section = sectionById.get(sectionId);
  if (!section) {
    return {
      admitted: false,
      classRank: 9,
      finding: finding('MISSING_CANONICAL_PLACEMENT', 'BLOCKER', `El bloque ${block.id} no tiene una sección canónica.`, block),
    };
  }

  if (isManualBlock(block)) {
    return { admitted: true, task: taskForBlock(block, taskById), classRank: 1 };
  }

  // 1. FAIL-CLOSED: Bloque con estado explícitamente inválido
  if (block.issueDraftValidationStatus === 'INVALID_FATAL' || block.issueDraftValidationStatus === 'INVALID_RETRYABLE') {
    return {
      admitted: false,
      classRank: 9,
      finding: finding('INVALID_BLOCK_EXCLUDED', 'REVIEW', `El bloque ${block.id} tiene estado inválido y se excluye del assembly.`, block, [sectionId]),
    };
  }

  // 2. FAIL-CLOSED: Bloque vacío (formal o sustantivo)
  if (!normalizedText(block.text)) {
    return {
      admitted: false,
      classRank: 9,
      finding: finding('EMPTY_BLOCK_EXCLUDED', 'REVIEW', `El bloque ${block.id} está vacío.`, block, [sectionId]),
    };
  }

  // 3. FAIL-CLOSED: Truncamiento o dependencias no resueltas (seed markers / [DATO PENDIENTE...])
  if (block.generationStatus === 'truncated' || hasSeedMarkers(block.text) || hasUnresolvedFactualDependencies(block.text)) {
    return {
      admitted: false,
      classRank: 9,
      finding: finding('UNRESOLVED_BLOCK_EXCLUDED', 'REVIEW', `El bloque ${block.id} tiene truncamiento o dependencia pendiente.`, block, [sectionId]),
    };
  }

  // 4. FAIL-CLOSED: Reprobación semántica dura
  if (block.semanticEvaluation && (block.semanticEvaluation.verdict === 'FAIL' || (block.semanticEvaluation.hardFailReasons || []).length > 0)) {
    return {
      admitted: false,
      classRank: 9,
      finding: finding('SEMANTIC_BLOCK_NOT_ACCEPTED', 'REVIEW', `El bloque ${block.id} no alcanza el contrato semántico PASS.`, block, [sectionId]),
    };
  }

  // 5. Candidato formal determinístico válido
  if (isFormalCandidate(block)) {
    return { admitted: true, task: taskForBlock(block, taskById), classRank: 0 };
  }

  // 6. VALID_NON_FINAL admitido como borrador para revisión únicamente si superó los filtros fail-closed anteriores
  if (block.issueDraftValidationStatus === 'VALID_NON_FINAL') {
    return {
      admitted: true,
      task: taskForBlock(block, taskById),
      classRank: 3,
      finding: finding('VALID_NON_FINAL_BLOCK_ADMITTED', 'REVIEW', `El bloque ${block.id} requiere revisión del abogado (VALID_NON_FINAL) y se incluye como borrador.`, block, [sectionId]),
    };
  }

  // 7. Bloques de fallback no validados para borrador quedan excluidos
  if (isFallbackBlock(block)) {
    return {
      admitted: false,
      classRank: 9,
      finding: finding('FALLBACK_BLOCK_EXCLUDED', 'REVIEW', `El bloque ${block.id} es fallback y no entra como contenido sustantivo final.`, block, [sectionId]),
    };
  }

  // 8. Bloques sustantivos finales requieren tarea/placement canónico
  const task = taskForBlock(block, taskById);
  if (!task) {
    return {
      admitted: false,
      classRank: 9,
      finding: finding('MISSING_CANONICAL_PLACEMENT', 'BLOCKER', `El bloque sustantivo ${block.id} no tiene task/placement canónico.`, block, [sectionId]),
    };
  }

  // 9. Bloques sustantivos finales deben tener aceptación VALID_ACCEPTED
  if (block.issueDraftValidationStatus !== 'VALID_ACCEPTED') {
    return {
      admitted: false,
      classRank: 9,
      finding: finding('BLOCK_NOT_ACCEPTED', 'REVIEW', `El bloque ${block.id} no tiene aceptación final de FASE 5B.`, block, [sectionId]),
    };
  }

  return { admitted: true, task, classRank: 2 };
}

function comparePlacements(left: BlockPlacement, right: BlockPlacement): number {
  const sectionComparison = sectionSortKey(left.section).localeCompare(sectionSortKey(right.section));
  if (sectionComparison !== 0) return sectionComparison;
  const leftTaskOrder = left.task?.order ?? Number.MAX_SAFE_INTEGER;
  const rightTaskOrder = right.task?.order ?? Number.MAX_SAFE_INTEGER;
  if (leftTaskOrder !== rightTaskOrder) return leftTaskOrder - rightTaskOrder;
  const leftParentOrder = left.task?.orderInParent ?? Number.MAX_SAFE_INTEGER;
  const rightParentOrder = right.task?.orderInParent ?? Number.MAX_SAFE_INTEGER;
  if (leftParentOrder !== rightParentOrder) return leftParentOrder - rightParentOrder;
  if (left.classRank !== right.classRank) return left.classRank - right.classRank;
  const idComparison = left.block.id.localeCompare(right.block.id);
  if (idComparison !== 0) return idComparison;
  return left.sourceIndex - right.sourceIndex;
}

function blockFingerprintPayload(placement: BlockPlacement) {
  const { block, section, task } = placement;
  return {
    sectionId: section.section.id,
    sectionPath: section.path,
    sectionOrder: section.orderPath,
    blockId: block.id,
    text: normalizedText(block.text),
    issueDraftValidationStatus: block.issueDraftValidationStatus || null,
    generationStatus: block.generationStatus || null,
    generationRequirement: block.generationRequirement || null,
    generatedBy: block.generatedBy || null,
    generationTaskId: block.generationTaskId || block.taskId || null,
    taskOrder: task?.order ?? null,
    taskOrderInParent: task?.orderInParent ?? null,
    legalIssueIds: sortedUnique(block.legalIssueIds),
    coverageItemIds: sortedUnique(block.coverageItemIds),
    factIds: sortedUnique(block.factIds),
    evidenceIds: sortedUnique(block.evidenceIds),
    authorityIds: sortedUnique(block.authorityIds),
    issueDraftResultHash: block.issueDraftResultHash || null,
    strategicCandidateId: block.strategicCandidateId || null,
    decisionReasoningId: block.decisionReasoningId || null,
    strategicArgumentPlanId: block.strategicArgumentPlanId || null,
    manuallyEdited: block.isManuallyEdited === true,
  };
}

function inputFingerprintPayload(input: DocumentAssemblyInput, placements: readonly BlockPlacement[], excludedDraftBlockIds: readonly string[]) {
  return {
    documentId: input.document.id,
    documentType: input.document.documentType,
    templateId: input.documentPlan.templateId,
    sectionIds: flattenPlanSections(input.documentPlan.sections).map((entry) => entry.section.id),
    blocks: placements.map(blockFingerprintPayload),
    excludedDraftBlockIds: [...excludedDraftBlockIds].sort(),
  };
}

function makeOutputDocument(
  input: DocumentAssemblyInput,
  assemblySections: readonly DocumentAssemblySection[],
): UniversalLegalDocument {
  const document = cloneValue(input.document);
  document.sections = assemblySections.map((assemblySection) => {
    const planSection = flattenPlanSections(input.documentPlan.sections)
      .find((entry) => entry.section.id === assemblySection.sectionId)?.section;
    if (!planSection) return {
      id: assemblySection.sectionId,
      type: assemblySection.type,
      title: assemblySection.title,
      order: assemblySection.order,
      content: assemblySection.blocks.map((block) => cloneValue(block)),
      children: [],
      isRepeatable: false,
      isEditable: true,
      isGenerated: true,
      isManuallyEdited: false,
      variables: [],
      validationErrors: [],
      validationWarnings: [],
    };
    const clonedSection = cloneValue(planSection);
    clonedSection.content = assemblySection.blocks.map((block) => cloneValue(block));
    clonedSection.children = clonedSection.children?.map((child) => cloneValue(child));
    return clonedSection;
  });
  return document;
}

function buildTrace(
  input: DocumentAssemblyInput,
  placements: readonly BlockPlacement[],
  excludedDraftBlockIds: readonly string[],
  findings: readonly DocumentAssemblyFinding[],
  inputFingerprint: string,
  outputFingerprint: string,
): DocumentAssemblyTraceMetadata {
  const orderedSectionIds = [...new Set(placements.map((placement) => placement.section.section.id))];
  const orderedBlockIds = placements.map((placement) => placement.block.id);
  return {
    assemblyId: stableResearchId('assembly', { inputFingerprint, outputFingerprint }),
    inputFingerprint,
    outputFingerprint,
    generationId: input.generationTrace?.generationId,
    orderedSectionIds,
    orderedBlockIds,
    sourceDraftBlockIds: [...new Set([...placements.map((placement) => placement.block.id), ...excludedDraftBlockIds])],
    excludedDraftBlockIds: [...excludedDraftBlockIds],
    findingCodes: [...new Set(findings.map((item) => item.code))].sort(),
    blockLinks: placements.map((placement) => ({
      blockId: placement.block.id,
      generationTaskId: placement.block.generationTaskId || placement.block.taskId || placement.task?.id,
      issueDraftResultHash: placement.block.issueDraftResultHash,
      legalIssueIds: sortedUnique(placement.block.legalIssueIds),
      coverageItemIds: sortedUnique(placement.block.coverageItemIds),
      ...(placement.block.strategicCandidateId ? { strategicCandidateId: placement.block.strategicCandidateId } : {}),
      ...(placement.block.decisionReasoningId ? { decisionReasoningId: placement.block.decisionReasoningId } : {}),
      ...(placement.block.strategicArgumentPlanId ? { strategicArgumentPlanId: placement.block.strategicArgumentPlanId } : {}),
    })),
  };
}

function candidateBlocks(input: DocumentAssemblyInput): CandidateBlock[] {
  const explicit = input.candidateBlocks.map((candidate) => ({
    sectionId: candidate.sectionId,
    block: cloneValue(candidate.block),
  }));
  const seen = new Set(explicit.map((candidate) => candidate.block.id));
  for (const section of input.candidateSections) {
    for (const block of section.content || []) {
      if (seen.has(block.id)) continue;
      seen.add(block.id);
      explicit.push({ sectionId: section.id, block: cloneValue(block) });
    }
  }
  return explicit;
}

export function assembleLegalDraft(input: DocumentAssemblyInput): DocumentAssemblyResult {
  const plannedSections = flattenPlanSections(input.documentPlan.sections);
  const sectionById = new Map<string, PlannedSection>();
  const findings: DocumentAssemblyFinding[] = [];

  for (const plannedSection of plannedSections) {
    if (sectionById.has(plannedSection.section.id)) {
      findings.push(finding(
        'DUPLICATE_SECTION_ID',
        'BLOCKER',
        `La sección ${plannedSection.section.id} aparece más de una vez en el plan.`,
        undefined,
        [plannedSection.section.id],
      ));
      continue;
    }
    sectionById.set(plannedSection.section.id, plannedSection);
  }

  const tasks = new Map<string, GenerationTask>();
  for (const task of input.generationTasks) {
    if (!tasks.has(task.id)) tasks.set(task.id, task);
  }

  const admitted: BlockPlacement[] = [];
  const excludedDraftBlockIds: string[] = [];
  const sourceCandidates = candidateBlocks(input);
  sourceCandidates.forEach((candidate, sourceIndex) => {
    const decision = admitBlock(candidate, tasks, sectionById);
    if (decision.finding) findings.push(decision.finding);
    if (!decision.admitted) {
      excludedDraftBlockIds.push(candidate.block.id);
      return;
    }
    const section = sectionById.get(candidate.sectionId);
    if (!section) {
      excludedDraftBlockIds.push(candidate.block.id);
      return;
    }
    admitted.push({
      section,
      block: cloneValue(candidate.block),
      task: decision.task,
      classRank: decision.classRank,
      sourceIndex,
    });
  });

  admitted.sort(comparePlacements);
  const duplicateBlockIds = new Set<string>();
  const seenBlockIds = new Set<string>();
  for (const placement of admitted) {
    if (seenBlockIds.has(placement.block.id)) duplicateBlockIds.add(placement.block.id);
    seenBlockIds.add(placement.block.id);
  }
  if (duplicateBlockIds.size > 0) {
    findings.push({
      code: 'DUPLICATE_BLOCK_ID',
      severity: 'BLOCKER',
      message: `Hay IDs de bloque duplicados: ${[...duplicateBlockIds].sort().join(', ')}.`,
      reason: 'DUPLICATE_BLOCK_ID',
      blockIds: [...duplicateBlockIds].sort(),
      legalIssueIds: [],
      coverageItemIds: [],
      sectionIds: [],
    });
  }

  const blocksBySection = new Map<string, ContentBlock[]>();
  for (const placement of admitted) {
    const blocks = blocksBySection.get(placement.section.section.id) || [];
    blocks.push(cloneValue(placement.block));
    blocksBySection.set(placement.section.section.id, blocks);
  }

  const assemblySections: DocumentAssemblySection[] = plannedSections.map((plannedSection) => {
    const blocks = blocksBySection.get(plannedSection.section.id) || [];
    return {
      sectionId: plannedSection.section.id,
      sectionPath: [...plannedSection.path],
      title: plannedSection.section.title,
      type: plannedSection.section.type,
      order: plannedSection.section.order,
      blockIds: blocks.map((block) => block.id),
      blocks,
    };
  });

  const orderedBlocks = admitted.map((placement) => cloneValue(placement.block));
  const inputFingerprint = stableResearchId('assembly-input', inputFingerprintPayload(input, admitted, excludedDraftBlockIds));
  const outputFingerprint = stableResearchId('assembly-output', {
    documentId: input.document.id,
    documentType: input.document.documentType,
    sections: assemblySections.map((section) => ({
      sectionId: section.sectionId,
      order: section.order,
      blockIds: section.blockIds,
    })),
    blocks: admitted.map(blockFingerprintPayload),
    findingCodes: [...new Set(findings.map((item) => item.code))].sort(),
  });
  const trace = buildTrace(input, admitted, [...new Set(excludedDraftBlockIds)].sort(), findings, inputFingerprint, outputFingerprint);
  const document = makeOutputDocument(input, assemblySections);
  const linkedLegalIssueIds = sortedUnique(orderedBlocks.flatMap((block) => block.legalIssueIds || []));
  const linkedCoverageItemIds = sortedUnique(orderedBlocks.flatMap((block) => block.coverageItemIds || []));

  return {
    documentId: input.document.id,
    documentType: input.document.documentType,
    document,
    sections: assemblySections,
    orderedBlocks,
    sourceDraftBlockIds: [...new Set(sourceCandidates.map((candidate) => candidate.block.id))],
    excludedDraftBlockIds: [...new Set(excludedDraftBlockIds)].sort(),
    linkedLegalIssueIds,
    linkedCoverageItemIds,
    assemblyStatus: findings.some((item) => item.severity === 'BLOCKER') ? 'BLOCKED' : 'ASSEMBLED',
    validationStatus: 'NOT_VALIDATED',
    readiness: 'INCOMPLETE',
    findings,
    trace,
  };
}
