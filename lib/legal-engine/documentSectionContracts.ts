import type { DocumentNode } from './types';
import type { CoverageMatrix } from './coverageMatrix';
import { getRequiredSectionIds, getCanonicalSectionId } from './exportGuards';
import { getDocumentTemplate } from './documentTemplates';
import type { DocumentPlanResult } from './documentPlan';
import type {
  DocumentAssemblyFinding,
  SectionContract,
} from './documentAssemblyTypes';

export interface SectionContractInput {
  documentType?: string;
  documentPlan: DocumentPlanResult;
  candidateSections?: readonly DocumentNode[];
  coverageMatrix?: CoverageMatrix;
}

function normalizeSectionKey(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function sectionMatchesKey(section: Pick<DocumentNode, 'id' | 'title'>, key: string): boolean {
  const normalizedKey = normalizeSectionKey(key);
  const canonicalKey = getCanonicalSectionId(key);
  const candidates = [
    normalizeSectionKey(section.id),
    normalizeSectionKey(section.title),
    getCanonicalSectionId(section.id),
    getCanonicalSectionId(section.title),
  ];
  return candidates.some((candidate) => candidate === normalizedKey
    || candidate === canonicalKey
    || candidate.startsWith(`${normalizedKey}_`)
    || candidate.includes(`_${normalizedKey}`)
    || candidate.includes(normalizedKey)
    || normalizedKey.includes(candidate));
}

function canonicalTemplateSections(input: SectionContractInput): DocumentNode[] {
  const sections = [...(input.candidateSections || input.documentPlan.sections)];
  const documentType = input.documentType || input.documentPlan.templateId;
  const template = getDocumentTemplate(documentType);
  if (template.estructura.length === 0) return sections;

  const used = new Set<string>();
  const ordered: DocumentNode[] = [];
  for (const title of template.estructura) {
    const match = sections.find((section) => !used.has(section.id) && sectionMatchesKey(section, title));
    if (!match) continue;
    used.add(match.id);
    ordered.push(match);
  }
  for (const section of sections) {
    if (!used.has(section.id)) ordered.push(section);
  }
  return ordered;
}

function hasFormalCoverage(section: DocumentNode, matrix?: CoverageMatrix): boolean {
  return Boolean(matrix?.items.some((item) => {
    if (!item.targetSectionIds?.includes(section.id)) return false;
    return item.scope === 'FORMAL' || item.satisfactionPolicy === 'FORMAL_DETERMINISTIC_ALLOWED' || item.category === 'FORMAL_REQUIREMENT';
  }));
}

function roleForSection(section: DocumentNode, matrix?: CoverageMatrix): SectionContract['contentRole'] {
  if (section.type === 'petition') return 'PETITION';
  if (section.type === 'evidence') return 'EVIDENCE';
  if (section.type === 'facts' || section.type === 'background') return 'FACT_RESPONSE';
  if (section.type === 'argument' || section.type === 'legal_grounds') return 'ISSUE_ARGUMENT';
  if (section.type === 'closing') return 'CLOSING';
  if (section.type === 'signature' || section.type === 'header' || section.type === 'identity') return 'FORMAL';
  if (hasFormalCoverage(section, matrix)) return 'FORMAL';
  return 'CUSTOM';
}

export function getSectionContentRole(section: DocumentNode, matrix?: CoverageMatrix): SectionContract['contentRole'] {
  return roleForSection(section, matrix);
}

function allowedCategoriesForRole(role: SectionContract['contentRole']): SectionContract['allowedCoverageCategories'] {
  switch (role) {
    case 'FACT_RESPONSE':
      // ANTECEDENTES puede materializar una referencia procesal fuente; no
      // es una respuesta de issue ni convierte la referencia en Coverage
      // satisfecho (REFERENCE_ONLY conserva esa decisión separada).
      return ['FACT', 'FACT_RESPONSE', 'CLAIM_RESPONSE', 'SOURCE_ARGUMENT_RESPONSE', 'PROCEDURAL_REQUIREMENT'];
    case 'ISSUE_ARGUMENT':
      return ['LEGAL_ISSUE', 'DEFENSE', 'EXCEPTION', 'SOURCE_ARGUMENT_RESPONSE', 'CHALLENGED_REASONING', 'CONSTITUTIONAL_ISSUE'];
    case 'EVIDENCE':
      return ['EVIDENCE', 'EVIDENCE_TREATMENT', 'EVIDENCE_OFFER'];
    case 'PETITION':
      return ['RELIEF', 'PETITION_SUPPORT', 'REQUESTED_RELIEF'];
    case 'FORMAL':
    case 'CLOSING':
      return ['FORMAL_REQUIREMENT', 'PROCEDURAL_REQUIREMENT'];
    default:
      return [];
  }
}

function requiredSectionIds(input: SectionContractInput): string[] {
  const documentType = input.documentType || input.documentPlan.templateId;
  return getRequiredSectionIds(documentType);
}

function isRequiredSection(section: DocumentNode, requiredIds: readonly string[]): boolean {
  return requiredIds.some((requiredId) => sectionMatchesKey(section, requiredId));
}

export function deriveSectionContracts(input: SectionContractInput): readonly SectionContract[] {
  const sections = canonicalTemplateSections(input);
  const requiredIds = requiredSectionIds(input);
  return sections.map((section) => {
    const contentRole = getSectionContentRole(section, input.coverageMatrix);
    const formal = contentRole === 'FORMAL' || contentRole === 'CLOSING';
    return {
      sectionId: section.id,
      sectionPath: [section.id],
      title: section.title,
      type: section.type,
      required: isRequiredSection(section, requiredIds),
      contentRole,
      allowedCoverageCategories: allowedCategoriesForRole(contentRole),
      deterministicAllowed: formal || hasFormalCoverage(section, input.coverageMatrix),
      requiresAcceptedSubstantiveBlock: !formal && contentRole !== 'CUSTOM',
    } satisfies SectionContract;
  });
}

function finding(code: string, severity: DocumentAssemblyFinding['severity'], message: string, sectionIds: readonly string[] = []): DocumentAssemblyFinding {
  return {
    code,
    severity,
    message,
    reason: code,
    blockIds: [],
    legalIssueIds: [],
    coverageItemIds: [],
    sectionIds: [...sectionIds],
  };
}

export function validateSectionContracts(input: SectionContractInput): readonly DocumentAssemblyFinding[] {
  const sections = [...(input.candidateSections || input.documentPlan.sections)];
  const findings: DocumentAssemblyFinding[] = [];
  const seenIds = new Set<string>();
  for (const section of sections) {
    if (seenIds.has(section.id)) {
      findings.push(finding('DUPLICATE_SECTION_ID', 'BLOCKER', `La sección ${section.id} está duplicada.`, [section.id]));
    }
    seenIds.add(section.id);
  }

  const requiredIds = requiredSectionIds(input);
  for (const requiredId of requiredIds) {
    if (!sections.some((section) => sectionMatchesKey(section, requiredId))) {
      findings.push(finding('MISSING_REQUIRED_SECTION', 'BLOCKER', `Falta la sección requerida ${requiredId}.`, [requiredId]));
    }
  }

  const template = getDocumentTemplate(input.documentType || input.documentPlan.templateId);
  const normalizedTemplate = template.estructura.map(normalizeSectionKey);
  const seenCanonicalTitles = new Set<string>();
  for (const section of sections) {
    const titleKey = normalizeSectionKey(section.title);
    if (!normalizedTemplate.includes(titleKey)) continue;
    if (seenCanonicalTitles.has(titleKey)) {
      findings.push(finding('AMBIGUOUS_CANONICAL_ORDER', 'BLOCKER', `La sección canónica ${section.title} está repetida.`, [section.id]));
    }
    seenCanonicalTitles.add(titleKey);
  }
  return findings;
}
