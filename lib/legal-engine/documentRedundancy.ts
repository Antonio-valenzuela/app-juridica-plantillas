import type { ContentBlock } from './types';
import { stableResearchId } from './legal-research/canonical';
import type {
  DocumentAssemblyFinding,
  DocumentAssemblyResult,
} from './documentAssemblyTypes';

export interface DocumentDuplicateBlockContext {
  block: ContentBlock;
  sectionId: string;
  functionRole?: string;
  propositionIds?: readonly string[];
}

export interface DocumentRedundancyInput {
  assembly: DocumentAssemblyResult;
  blockContexts?: readonly DocumentDuplicateBlockContext[];
}

function unique(values: readonly string[] | undefined): string[] {
  return [...new Set((values || []).filter((value): value is string => typeof value === 'string' && value.length > 0))].sort();
}

function normalizedText(text: string): string {
  return String(text || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function textFingerprint(text: string): string {
  return stableResearchId('document-redundancy-text', normalizedText(text));
}

function defaultFunctionRole(input: DocumentRedundancyInput, block: ContentBlock, sectionId: string): string {
  const section = input.assembly.sections.find((candidate) => candidate.sectionId === sectionId);
  return section?.type || block.generatedBy || block.layer || 'CUSTOM';
}

function propositionIds(context: DocumentDuplicateBlockContext): readonly string[] {
  const blockWithPropositions = context.block as ContentBlock & { propositionIds?: readonly string[] };
  return context.propositionIds || blockWithPropositions.propositionIds || [];
}

export function buildDocumentDuplicateKey(blockContext: DocumentDuplicateBlockContext): string {
  const block = blockContext.block;
  return stableResearchId('document-duplicate-key', {
    sectionId: blockContext.sectionId,
    functionRole: blockContext.functionRole || 'CUSTOM',
    legalIssueIds: unique(block.legalIssueIds),
    coverageItemIds: unique(block.coverageItemIds),
    propositionIds: unique(propositionIds(blockContext)),
    evidenceIds: unique(block.evidenceIds),
    textFingerprint: textFingerprint(block.text),
  });
}

function finding(
  code: string,
  severity: DocumentAssemblyFinding['severity'],
  message: string,
  contexts: readonly DocumentDuplicateBlockContext[],
): DocumentAssemblyFinding {
  return {
    code,
    severity,
    message,
    reason: message,
    blockIds: unique(contexts.map(({ block }) => block.id)),
    legalIssueIds: unique(contexts.flatMap(({ block }) => block.legalIssueIds || [])),
    coverageItemIds: unique(contexts.flatMap(({ block }) => block.coverageItemIds || [])),
    sectionIds: unique(contexts.map(({ sectionId }) => sectionId)),
  };
}

function defaultContexts(input: DocumentRedundancyInput): DocumentDuplicateBlockContext[] {
  return input.assembly.orderedBlocks.map((block) => {
    const section = input.assembly.sections.find((candidate) => candidate.blockIds.includes(block.id));
    const sectionId = section?.sectionId || '';
    return {
      block,
      sectionId,
      functionRole: defaultFunctionRole(input, block, sectionId),
    };
  });
}

export function findDocumentRedundancy(input: DocumentRedundancyInput): readonly DocumentAssemblyFinding[] {
  const contexts = [...(input.blockContexts || defaultContexts(input))];
  const findings: DocumentAssemblyFinding[] = [];
  const byDuplicateKey = new Map<string, DocumentDuplicateBlockContext[]>();
  const byText = new Map<string, DocumentDuplicateBlockContext[]>();

  for (const context of contexts) {
    const duplicateKey = buildDocumentDuplicateKey(context);
    const textKey = textFingerprint(context.block.text);
    const duplicateGroup = byDuplicateKey.get(duplicateKey) || [];
    duplicateGroup.push(context);
    byDuplicateKey.set(duplicateKey, duplicateGroup);
    const textGroup = byText.get(textKey) || [];
    textGroup.push(context);
    byText.set(textKey, textGroup);
  }

  for (const group of byDuplicateKey.values()) {
    if (group.length < 2) continue;
    findings.push(finding(
      'DUPLICATE_BLOCK_SAME_FUNCTION',
      'WARNING',
      'Se detectaron bloques repetidos en el mismo slot funcional; ambos se conservan.',
      group,
    ));
  }

  for (const group of byText.values()) {
    if (group.length < 2) continue;
    const byKey = new Map<string, DocumentDuplicateBlockContext[]>();
    for (const context of group) {
      const key = buildDocumentDuplicateKey(context);
      const keyGroup = byKey.get(key) || [];
      keyGroup.push(context);
      byKey.set(key, keyGroup);
    }
    if (byKey.size < 2) continue;
    const scopedContexts = [...byKey.values()].map((items) => items[0]);
    findings.push(finding(
      'REPEATED_TEXT_DIFFERENT_SCOPE',
      'WARNING',
      'El mismo texto aparece en alcances jurídicos distintos; ambos bloques se conservan.',
      scopedContexts,
    ));
  }

  return findings;
}
