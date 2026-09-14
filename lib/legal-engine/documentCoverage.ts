import type { ContentBlock } from './types';
import { isCoverageSatisfied } from './coveragePolicy';
import type { CoverageMatrix, DocumentCoverageItem } from './coverageMatrix';
import type {
  CoverageReconciliation,
  CoverageReconciliationItem,
  DocumentAssemblyFinding,
  DocumentAssemblyResult,
  SectionContract,
} from './documentAssemblyTypes';

export interface DocumentCoverageInput {
  coverageMatrix: CoverageMatrix;
  assembly: DocumentAssemblyResult;
  sectionContracts?: readonly SectionContract[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))].sort();
}

function blocksForCoverage(assembly: DocumentAssemblyResult, coverageItemId: string): ContentBlock[] {
  return assembly.orderedBlocks.filter((block) => block.coverageItemIds?.includes(coverageItemId));
}

function sectionIdsForBlocks(assembly: DocumentAssemblyResult, blocks: readonly ContentBlock[]): string[] {
  const blockIds = new Set(blocks.map((block) => block.id));
  return unique(assembly.sections
    .filter((section) => section.blockIds.some((blockId) => blockIds.has(blockId)))
    .map((section) => section.sectionId));
}

function compatibleSection(
  item: DocumentCoverageItem,
  sectionId: string,
  sectionContracts: readonly SectionContract[],
): boolean {
  if (item.targetSectionIds.length > 0 && !item.targetSectionIds.includes(sectionId)) return false;
  const contract = sectionContracts.find((candidate) => candidate.sectionId === sectionId);
  return !contract || contract.allowedCoverageCategories.includes(item.category);
}

function finding(
  code: string,
  severity: DocumentAssemblyFinding['severity'],
  message: string,
  options: Partial<Pick<DocumentAssemblyFinding, 'blockIds' | 'coverageItemIds' | 'sectionIds'>> = {},
): DocumentAssemblyFinding {
  return {
    code,
    severity,
    message,
    reason: message,
    blockIds: options.blockIds || [],
    legalIssueIds: [],
    coverageItemIds: options.coverageItemIds || [],
    sectionIds: options.sectionIds || [],
  };
}

function reasonForUnsatisfied(
  item: DocumentCoverageItem,
  blocks: readonly ContentBlock[],
): string {
  if (blocks.length === 0) return 'NO_GENERATED_BLOCK';
  const evaluation = blocks
    .map((block) => block.semanticEvaluation)
    .filter((candidate): candidate is NonNullable<ContentBlock['semanticEvaluation']> => Boolean(candidate));
  return isCoverageSatisfied(item, [...blocks], evaluation).reason;
}

export function reconcileDocumentCoverage(input: DocumentCoverageInput): CoverageReconciliation {
  const sectionContracts = input.sectionContracts || [];
  const findings: DocumentAssemblyFinding[] = [];
  const matrixItemIds = new Set(input.coverageMatrix.items.map((item) => item.id));
  const items: CoverageReconciliationItem[] = [];

  for (const block of input.assembly.orderedBlocks) {
    for (const coverageItemId of block.coverageItemIds || []) {
      if (!matrixItemIds.has(coverageItemId)) {
        const sectionIds = sectionIdsForBlocks(input.assembly, [block]);
        findings.push(finding(
          'ORPHAN_COVERAGE_LINK',
          'BLOCKER',
          `El bloque ${block.id} referencia un Coverage inexistente.`,
          { blockIds: [block.id], coverageItemIds: [coverageItemId], sectionIds },
        ));
      }
    }
  }

  for (const coverageItem of input.coverageMatrix.items) {
    const finalBlocks = blocksForCoverage(input.assembly, coverageItem.id);
    const finalBlockIds = finalBlocks.map((block) => block.id);
    const finalSectionIds = sectionIdsForBlocks(input.assembly, finalBlocks);
    const incompatibleBlocks = finalBlocks.filter((block) => {
      const blockSections = sectionIdsForBlocks(input.assembly, [block]);
      return blockSections.length === 0 || blockSections.some((sectionId) => !compatibleSection(coverageItem, sectionId, sectionContracts));
    });
    const compatibleBlocks = finalBlocks.filter((block) => !incompatibleBlocks.includes(block));
    const evaluations = compatibleBlocks
      .map((block) => block.semanticEvaluation)
      .filter((evaluation): evaluation is NonNullable<ContentBlock['semanticEvaluation']> => Boolean(evaluation));
    const satisfaction = compatibleBlocks.length > 0
      ? isCoverageSatisfied(coverageItem, compatibleBlocks, evaluations)
      : { satisfied: false, reason: incompatibleBlocks.length > 0 ? 'INCOMPATIBLE_SECTION' : reasonForUnsatisfied(coverageItem, finalBlocks) };
    const duplicated = finalBlockIds.length > 1;
    const lostDuringAssembly = (coverageItem.generatedBlockIds || []).some((blockId) =>
      input.assembly.sourceDraftBlockIds.includes(blockId) && !finalBlockIds.includes(blockId));
    const satisfied = satisfaction.satisfied && incompatibleBlocks.length === 0;

    if (incompatibleBlocks.length > 0) {
      findings.push(finding(
        'COVERAGE_INCOMPATIBLE_SECTION',
        coverageItem.required ? 'BLOCKER' : 'REVIEW',
        `El Coverage ${coverageItem.id} aparece desde una sección incompatible.`,
        {
          blockIds: incompatibleBlocks.map((block) => block.id),
          coverageItemIds: [coverageItem.id],
          sectionIds: sectionIdsForBlocks(input.assembly, incompatibleBlocks),
        },
      ));
    }
    if (coverageItem.required && !satisfied) {
      findings.push(finding(
        'REQUIRED_COVERAGE_MISSING',
        'BLOCKER',
        `El Coverage requerido ${coverageItem.id} no quedó satisfecho en la salida final.`,
        { blockIds: finalBlockIds, coverageItemIds: [coverageItem.id], sectionIds: finalSectionIds },
      ));
    }
    if (lostDuringAssembly) {
      findings.push(finding(
        'COVERAGE_LOST_DURING_ASSEMBLY',
        'BLOCKER',
        `El Coverage ${coverageItem.id} perdió un bloque aceptado durante el assembly.`,
        { blockIds: coverageItem.generatedBlockIds || [], coverageItemIds: [coverageItem.id], sectionIds: finalSectionIds },
      ));
    }
    if (duplicated) {
      findings.push(finding(
        'DUPLICATE_COVERAGE_ITEM',
        'WARNING',
        `El Coverage ${coverageItem.id} aparece en varios bloques finales; no se elimina ninguno.`,
        { blockIds: finalBlockIds, coverageItemIds: [coverageItem.id], sectionIds: finalSectionIds },
      ));
    }

    items.push({
      coverageItemId: coverageItem.id,
      finalBlockIds,
      finalSectionIds,
      satisfied,
      reason: satisfaction.reason,
      duplicated,
      lostDuringAssembly,
    });
  }

  const requiredMissingIds = items
    .filter((entry) => input.coverageMatrix.items.find((item) => item.id === entry.coverageItemId)?.required && !entry.satisfied)
    .map((entry) => entry.coverageItemId);
  const duplicatedIds = items.filter((entry) => entry.duplicated).map((entry) => entry.coverageItemId);
  const lostIds = items.filter((entry) => entry.lostDuringAssembly).map((entry) => entry.coverageItemId);

  return {
    items,
    requiredMissingIds,
    duplicatedIds,
    lostIds,
    allRequiredSatisfied: requiredMissingIds.length === 0,
    findings,
  };
}
