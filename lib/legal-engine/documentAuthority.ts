import type { SourceAuthorityMention, RichCaseAnalysis } from './case-extraction/types';
import type { CoverageMatrix } from './coverageMatrix';
import type { LegalIssueMatrix } from './legalIssueMatrix';
import type {
  DocumentAssemblyFinding,
  DocumentAssemblyResult,
} from './documentAssemblyTypes';

export interface DocumentAuthorityInput {
  assembly: DocumentAssemblyResult;
  richCaseAnalysis?: RichCaseAnalysis;
  coverageMatrix?: CoverageMatrix;
  legalIssueMatrix?: LegalIssueMatrix;
  verifiedAuthorityIds?: readonly string[];
}

export interface DocumentAuthorityAllowlist {
  authorityIds: readonly string[];
  citationTexts: readonly string[];
  verifiedAuthorityIds: readonly string[];
  authorityIssueIds: Readonly<Record<string, readonly string[]>>;
  authorityCoverageIds: Readonly<Record<string, readonly string[]>>;
  authoritiesById: Readonly<Record<string, SourceAuthorityMention>>;
}

const AUTHORITY_CITATION_PATTERN = /\b(?:tesis|jurisprudencia|precedente|criterio|ley|c[oó]digo|constituci[oó]n|reglamento|acuerdo)\b[^.;\n]{0,120}?\b\d{1,4}(?:[\/-]\d{2,4})\b/giu;

function unique(values: readonly string[] | undefined): string[] {
  return [...new Set((values || []).filter((value): value is string => typeof value === 'string' && value.length > 0))].sort();
}

function normalizeCitation(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addRelation(
  target: Record<string, Set<string>>,
  authorityId: string,
  relationId: string,
): void {
  if (!target[authorityId]) target[authorityId] = new Set<string>();
  target[authorityId].add(relationId);
}

export function buildAuthorityAllowlist(input: DocumentAuthorityInput): DocumentAuthorityAllowlist {
  const authoritiesById: Record<string, SourceAuthorityMention> = {};
  const authorityIssueIds: Record<string, Set<string>> = {};
  const authorityCoverageIds: Record<string, Set<string>> = {};
  const citationTexts = new Set<string>();

  for (const authority of input.richCaseAnalysis?.authorities || []) {
    authoritiesById[authority.id] = authority;
    citationTexts.add(authority.citationText);
  }

  for (const issue of input.legalIssueMatrix?.issues || []) {
    for (const authorityId of issue.authorityMentionIds) {
      addRelation(authorityIssueIds, authorityId, issue.id);
      for (const coverageItemId of issue.coverageItemIds) {
        addRelation(authorityCoverageIds, authorityId, coverageItemId);
      }
    }
  }

  for (const item of input.coverageMatrix?.items || []) {
    const authorityIds = unique([
      ...(item.authorityMentionIds || []),
      ...(item.relatedAuthorityIds || []),
    ]);
    for (const authorityId of authorityIds) addRelation(authorityCoverageIds, authorityId, item.id);
  }

  const verifiedAuthorityIds = unique([
    ...(input.verifiedAuthorityIds || []),
    ...input.assembly.orderedBlocks.flatMap((block) => block.verifiedAuthorityIds || []),
  ]).filter((authorityId) => authoritiesById[authorityId]?.verificationStatus === 'LEGALLY_VERIFIED');

  return {
    authorityIds: Object.keys(authoritiesById).sort(),
    citationTexts: [...citationTexts].sort(),
    verifiedAuthorityIds,
    authorityIssueIds: Object.fromEntries(
      Object.entries(authorityIssueIds).map(([id, values]) => [id, [...values].sort()]),
    ),
    authorityCoverageIds: Object.fromEntries(
      Object.entries(authorityCoverageIds).map(([id, values]) => [id, [...values].sort()]),
    ),
    authoritiesById,
  };
}

function finding(
  code: string,
  message: string,
  block: { id: string; legalIssueIds?: string[]; coverageItemIds?: string[]; authorityIds?: string[] },
  authorityIds: readonly string[] = [],
): DocumentAssemblyFinding {
  return {
    code,
    severity: 'BLOCKER',
    message,
    reason: message,
    blockIds: [block.id],
    legalIssueIds: unique(block.legalIssueIds),
    coverageItemIds: unique(block.coverageItemIds),
    sectionIds: [],
    authorityIds: unique([...authorityIds, ...(block.authorityIds || [])]),
  };
}

function citationMatchesAllowed(citation: string, allowlist: DocumentAuthorityAllowlist): boolean {
  const normalized = normalizeCitation(citation);
  return allowlist.citationTexts.some((allowed) => normalizeCitation(allowed) === normalized);
}

function blockSectionIds(assembly: DocumentAssemblyResult, blockId: string): string[] {
  return assembly.sections.filter((section) => section.blockIds.includes(blockId)).map((section) => section.sectionId);
}

function hasExplicitIssueLink(
  block: { legalIssueIds?: string[]; coverageItemIds?: string[] },
  authorityId: string,
  allowlist: DocumentAuthorityAllowlist,
): boolean {
  const issueIds = new Set(block.legalIssueIds || []);
  const authorityIssues = allowlist.authorityIssueIds[authorityId] || [];
  if (authorityIssues.length > 0) return authorityIssues.some((issueId) => issueIds.has(issueId));

  const coverageIds = new Set(block.coverageItemIds || []);
  const authorityCoverage = allowlist.authorityCoverageIds[authorityId] || [];
  return authorityCoverage.some((coverageId) => coverageIds.has(coverageId));
}

export function validateDocumentAuthorities(input: DocumentAuthorityInput): readonly DocumentAssemblyFinding[] {
  const allowlist = buildAuthorityAllowlist(input);
  const findings: DocumentAssemblyFinding[] = [];
  const allowedIds = new Set(allowlist.authorityIds);
  const allowedVerifiedIds = new Set(allowlist.verifiedAuthorityIds);

  for (const block of input.assembly.orderedBlocks) {
    const sectionIds = blockSectionIds(input.assembly, block.id);
    const explicitAuthorityIds = unique(block.authorityIds);
    const citations = [...(block.text || '').matchAll(AUTHORITY_CITATION_PATTERN)].map((match) => match[0]);

    for (const citation of citations) {
      if (!citationMatchesAllowed(citation, allowlist)) {
        findings.push({
          ...finding('NEW_AUTHORITY_DURING_ASSEMBLY', `La cita "${citation}" no existe en la allowlist autorizada.`, block),
          sectionIds,
        });
      }
    }

    for (const authorityId of explicitAuthorityIds) {
      if (!allowedIds.has(authorityId)) {
        findings.push({
          ...finding('NEW_AUTHORITY_DURING_ASSEMBLY', `La autoridad ${authorityId} no existe en el grafo autorizado.`, block, [authorityId]),
          sectionIds,
        });
        continue;
      }

      if ((block.legalIssueIds || []).length > 0 && !hasExplicitIssueLink(block, authorityId, allowlist)) {
        findings.push({
          ...finding('AUTHORITY_WRONG_ISSUE', `La autoridad ${authorityId} no está vinculada explícitamente a la issue o Coverage del bloque.`, block, [authorityId]),
          sectionIds,
        });
      }
    }

    for (const verifiedAuthorityId of unique(block.verifiedAuthorityIds)) {
      if (!allowedIds.has(verifiedAuthorityId)) {
        findings.push({
          ...finding('NEW_AUTHORITY_DURING_ASSEMBLY', `La autoridad verificada ${verifiedAuthorityId} no existe en el grafo autorizado.`, block, [verifiedAuthorityId]),
          sectionIds,
        });
        continue;
      }

      const authority = allowlist.authoritiesById[verifiedAuthorityId];
      if (authority.verificationStatus !== 'LEGALLY_VERIFIED' || !allowedVerifiedIds.has(verifiedAuthorityId)) {
        findings.push({
          ...finding('UNVERIFIED_AUTHORITY_USED_AS_VERIFIED', `La autoridad ${verifiedAuthorityId} fue citada como verificada aunque su estado es ${authority.verificationStatus}.`, block, [verifiedAuthorityId]),
          sectionIds,
        });
      }
    }
  }

  return findings;
}
