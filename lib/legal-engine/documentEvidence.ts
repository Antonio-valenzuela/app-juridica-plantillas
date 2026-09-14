import type { RichCaseAnalysis } from './case-extraction/types';
import type { CoverageMatrix } from './coverageMatrix';
import type { LegalIssueMatrix } from './legalIssueMatrix';
import type {
  DocumentAssemblyFinding,
  DocumentAssemblyResult,
  SectionContract,
} from './documentAssemblyTypes';

export interface DocumentEvidenceInput {
  assembly: DocumentAssemblyResult;
  richCaseAnalysis?: RichCaseAnalysis;
  coverageMatrix?: CoverageMatrix;
  sectionContracts?: readonly SectionContract[];
  legalIssueMatrix?: LegalIssueMatrix;
}

const OFFER_LANGUAGE = /\b(?:se\s+ofrece|ofrece|ofrecemos|ofertamos|prueba\s+documental)\b/i;

function unique(values: readonly string[] | undefined): string[] {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function finding(
  code: string,
  severity: DocumentAssemblyFinding['severity'],
  message: string,
  block: DocumentAssemblyResult['orderedBlocks'][number],
  evidenceIds: readonly string[],
  sectionId: string,
  coverageItemIds: readonly string[] = [],
): DocumentAssemblyFinding {
  return {
    code,
    severity,
    message,
    reason: code,
    blockIds: [block.id],
    legalIssueIds: unique(block.legalIssueIds),
    coverageItemIds: unique(coverageItemIds.length ? coverageItemIds : block.coverageItemIds),
    sectionIds: sectionId ? [sectionId] : [],
    evidenceIds: unique(evidenceIds),
  };
}

function blockSectionId(assembly: DocumentAssemblyResult, blockId: string): string {
  return assembly.sections.find((section) => section.blockIds.includes(blockId))?.sectionId || '';
}

function sectionAllowsEvidence(input: DocumentEvidenceInput, sectionId: string): boolean {
  const contract = input.sectionContracts?.find((candidate) => candidate.sectionId === sectionId);
  return !contract || contract.contentRole === 'EVIDENCE' || contract.allowedCoverageCategories.some((category) => category === 'EVIDENCE' || category === 'EVIDENCE_OFFER');
}

function requiredCoverage(input: DocumentEvidenceInput, block: DocumentAssemblyResult['orderedBlocks'][number]): boolean {
  return Boolean(input.coverageMatrix?.items.some((item) => item.required && item.id && block.coverageItemIds?.includes(item.id)));
}

function linkedToIssue(
  input: DocumentEvidenceInput,
  block: DocumentAssemblyResult['orderedBlocks'][number],
  evidenceId: string,
  mentionFactIds: readonly string[],
  mentionId?: string,
): boolean {
  const blockFacts = new Set(block.factIds || []);
  if (mentionFactIds.some((id) => blockFacts.has(id))) return true;
  if (input.legalIssueMatrix) {
    return input.legalIssueMatrix.issues.some((issue) => block.legalIssueIds?.includes(issue.id)
      && (issue.evidenceMentionIds.includes(evidenceId)
        || issue.evidenceOfferIds.includes(evidenceId)
        || (mentionId ? issue.evidenceMentionIds.includes(mentionId) : false)));
  }
  return false;
}

export function validateDocumentEvidence(input: DocumentEvidenceInput): readonly DocumentAssemblyFinding[] {
  const findings: DocumentAssemblyFinding[] = [];
  const mentions = input.richCaseAnalysis?.evidenceMentions || [];
  const offers = input.richCaseAnalysis?.evidenceOffers || [];
  const mentionById = new Map(mentions.map((mention) => [mention.id, mention]));
  const offerById = new Map(offers.map((offer) => [offer.id, offer]));

  for (const block of input.assembly.orderedBlocks) {
    const sectionId = blockSectionId(input.assembly, block.id);
    const coverageItems = input.coverageMatrix?.items.filter((item) => block.coverageItemIds?.includes(item.id)) || [];
    const references = unique(block.evidenceIds);
    const offerLanguage = OFFER_LANGUAGE.test(block.text);
    const mentionTreatment = coverageItems.some((item) => item.category === 'EVIDENCE_TREATMENT')
      && !coverageItems.some((item) => item.category === 'EVIDENCE_OFFER');
    OFFER_LANGUAGE.lastIndex = 0;

    if (offerLanguage && references.length === 0) {
      findings.push(finding('EVIDENCE_MENTION_WITHOUT_OFFER', requiredCoverage(input, block) ? 'BLOCKER' : 'REVIEW', `El bloque ${block.id} usa lenguaje de oferta sin EvidenceOffer válida.`, block, [], sectionId, coverageItems.map((item) => item.id)));
      continue;
    }

    for (const referenceId of references) {
      const offer = offerById.get(referenceId);
      const mention = mentionById.get(referenceId);

      if (mentionTreatment) {
        if (!mention) {
          findings.push(finding('EVIDENCE_MENTION_NOT_LINKED', 'BLOCKER', `La referencia de evidencia ${referenceId} no resuelve a una mención identificada.`, block, [referenceId], sectionId, coverageItems.map((item) => item.id)));
          continue;
        }
        if (offerLanguage) {
          findings.push(finding('EVIDENCE_MENTION_WITHOUT_OFFER', requiredCoverage(input, block) ? 'BLOCKER' : 'REVIEW', `La mención ${referenceId} no puede presentarse como oferta.`, block, [referenceId], sectionId, coverageItems.map((item) => item.id)));
          continue;
        }
        if (!linkedToIssue(input, block, referenceId, mention.relatedFactIds || [], mention.id)) {
          findings.push(finding('EVIDENCE_WRONG_ISSUE', requiredCoverage(input, block) ? 'BLOCKER' : 'REVIEW', `La mención ${referenceId} no está vinculada explícitamente a la issue del bloque.`, block, [referenceId], sectionId, coverageItems.map((item) => item.id)));
        }
        if (!sectionAllowsEvidence(input, sectionId)) {
          findings.push(finding('EVIDENCE_WRONG_SECTION', requiredCoverage(input, block) ? 'BLOCKER' : 'REVIEW', `La mención ${referenceId} está fuera de una sección compatible.`, block, [referenceId], sectionId, coverageItems.map((item) => item.id)));
        }
        continue;
      }

      if (!offer) {
        if (mention && offerLanguage) {
          findings.push(finding('EVIDENCE_MENTION_WITHOUT_OFFER', requiredCoverage(input, block) ? 'BLOCKER' : 'REVIEW', `La mención ${referenceId} no puede presentarse como oferta.`, block, [referenceId], sectionId, coverageItems.map((item) => item.id)));
        } else {
          findings.push(finding('EVIDENCE_OFFER_NOT_LINKED', 'BLOCKER', `La referencia de evidencia ${referenceId} no resuelve a una oferta autorizada.`, block, [referenceId], sectionId, coverageItems.map((item) => item.id)));
        }
        continue;
      }

      const linkedMention = mentionById.get(offer.evidenceMentionId);
      if (!linkedMention) {
        findings.push(finding('EVIDENCE_OFFER_NOT_LINKED', 'BLOCKER', `La oferta ${offer.id} no tiene una mención existente.`, block, [offer.id, offer.evidenceMentionId], sectionId, coverageItems.map((item) => item.id)));
        continue;
      }
      if (offer.status === 'PARTY_OFFERED') {
        findings.push(finding('EVIDENCE_OFFER_NOT_AUTHORIZED', 'BLOCKER', `La oferta histórica ${offer.id} no está autorizada como oferta del documento actual.`, block, [offer.id, linkedMention.id], sectionId, coverageItems.map((item) => item.id)));
      }
      if (offer.status === 'NEEDS_REVIEW') {
        findings.push(finding('EVIDENCE_OFFER_NEEDS_REVIEW', requiredCoverage(input, block) ? 'BLOCKER' : 'REVIEW', `La oferta ${offer.id} requiere revisión.`, block, [offer.id, linkedMention.id], sectionId, coverageItems.map((item) => item.id)));
      }
      if (!linkedToIssue(input, block, referenceId, linkedMention.relatedFactIds || [], linkedMention.id)) {
        findings.push(finding('EVIDENCE_WRONG_ISSUE', requiredCoverage(input, block) ? 'BLOCKER' : 'REVIEW', `La evidencia ${offer.id} no está vinculada explícitamente a la issue del bloque.`, block, [offer.id, linkedMention.id], sectionId, coverageItems.map((item) => item.id)));
      }
      if (!sectionAllowsEvidence(input, sectionId)) {
        findings.push(finding('EVIDENCE_WRONG_SECTION', requiredCoverage(input, block) ? 'BLOCKER' : 'REVIEW', `La evidencia ${offer.id} está fuera de una sección compatible.`, block, [offer.id, linkedMention.id], sectionId, coverageItems.map((item) => item.id)));
      }
    }
  }
  return findings;
}
