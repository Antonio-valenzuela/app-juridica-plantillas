import type { DocumentNode, UniversalLegalDocument } from './types';
import type {
  CoverageCategory,
  CoverageMatrix,
  DocumentCoverageItem,
} from './coverageMatrix';
import type { CaseConflict, ClientPosition, ClaimItem, MissingDataItem, RichCaseAnalysis, RichProceduralTimelineEvent } from './case-extraction/types';

/**
 * Builds Coverage from the canonical rich analysis.  This module deliberately
 * does not read any legacy CaseAnalysis arrays: the dispatcher decides which
 * representation is authoritative before reaching this function.
 */
export function buildRichCoverageMatrix(
  rich: RichCaseAnalysis,
  doc: UniversalLegalDocument,
  sections: DocumentNode[] = doc.sections || [],
): CoverageMatrix {
  const evidenceItems = buildEvidenceCoverageItems(rich, sections);
  const factItems = buildFactCoverageItems(rich, sections);
  const argumentItems = buildArgumentCoverageItems(rich, sections);
  const authorityItems = buildAuthorityCoverageItems(rich, sections);
  const petitionItems = buildPetitionSupportCoverageItems(rich, sections);
  const claimItems = rich.claims
    .filter((claim) => Boolean(claim.id && claim.requestedRelief.trim()))
    .map((claim) => buildClaimCoverageItem(claim, sections, rich.clientPosition));
  const proceduralTimelineItems = buildProceduralTimelineCoverageItems(rich, sections);
  const missingItems = buildMissingDataCoverageItems(rich.missingData);
  const conflictItems = buildConflictCoverageItems(rich.conflicts, sections);
  const items = [
    ...factItems,
    ...evidenceItems,
    ...claimItems,
    ...proceduralTimelineItems,
    ...authorityItems,
    ...argumentItems,
    ...petitionItems,
    ...missingItems,
    ...conflictItems,
  ];
  const compatibilityItems = rich.candidates.length > 0
    ? buildLegacyCategoryCompatibilityItems(items, doc, sections)
    : [];

  return {
    documentId: doc.id,
    documentType: doc.documentType,
    items: [...items, ...compatibilityItems],
    summary: summarizeRichCoverage([...items, ...compatibilityItems]),
  };
}

function buildProceduralTimelineCoverageItems(
  rich: RichCaseAnalysis,
  sections: DocumentNode[],
): DocumentCoverageItem[] {
  const targetSectionIds = findProceduralTimelineSections(sections);
  return (rich.proceduralTimeline || [])
    .filter((event) => Boolean(event.id && event.date.trim() && event.event.trim()))
    .map((event: RichProceduralTimelineEvent): DocumentCoverageItem => ({
      id: `cov-procedural-timeline-${event.id}`,
      sourceId: event.provenance[0]?.sourceId,
      category: 'PROCEDURAL_REQUIREMENT',
      title: `Antecedente procesal del ${event.date}`,
      description: `Antecedente procesal (${event.date}): ${event.event.trim()}`,
      required: true,
      status: targetSectionIds.length > 0 ? 'pending' : 'blocked',
      targetSectionIds,
      sourceEntityType: 'PROCEDURAL_REQUIREMENT',
      sourceEntityIds: [event.id],
      scope: 'SUBSTANTIVE',
      // Narrative source material does not create an artificial LegalIssue or
      // require an argumentative response from the client.
      satisfactionPolicy: 'REFERENCE_ONLY',
      blocking: targetSectionIds.length === 0,
      requiresClientPosition: false,
      statusReason: targetSectionIds.length > 0
        ? 'SOURCE_PROCEDURAL_EVENT_REFERENCE_ONLY'
        : 'ANTECEDENTES_SECTION_NOT_FOUND',
      relationStatus: 'EXPLICIT',
      provenance: [...event.provenance],
      metadata: {
        eventId: event.id,
        eventType: event.eventType,
        date: event.date,
        certainty: event.certainty,
      },
    }));
}

/**
 * Short-lived aliases for consumers from FASE 3 that still filter the old
 * category names.  They are derived exclusively from rich items, carry no
 * semantic rich IDs and are marked as compatibility metadata; canonical rich
 * items remain the only source used by rich planning.
 */
function buildLegacyCategoryCompatibilityItems(
  items: DocumentCoverageItem[],
  doc: UniversalLegalDocument,
  sections: DocumentNode[],
): DocumentCoverageItem[] {
  const aliases: DocumentCoverageItem[] = [];
  for (const item of items) {
    if (item.category === 'CLAIM_RESPONSE' && item.claimIds?.length) {
      aliases.push({
        ...item,
        id: `compat-claim-${item.claimIds[0]}`,
        category: 'CLAIM',
        claimIds: undefined,
        relatedClaimIds: [...item.claimIds],
        metadata: { ...(item.metadata || {}), compatibilityAlias: true, richSourceId: item.claimIds[0] },
      });
    }
    if (item.category === 'FACT_RESPONSE' && item.factIds?.length) {
      aliases.push({
        ...item,
        id: `compat-fact-${item.factIds[0]}`,
        category: 'FACT',
        factIds: undefined,
        relatedFactIds: [...item.factIds],
        status: 'pending',
        blocking: false,
        requiresClientPosition: false,
        metadata: { ...(item.metadata || {}), compatibilityAlias: true, richSourceId: item.factIds[0] },
      });
    }
    if (item.category === 'EVIDENCE_TREATMENT' && item.evidenceMentionIds?.length) {
      aliases.push({
        ...item,
        id: `compat-evidence-${item.evidenceMentionIds[0]}`,
        category: 'EVIDENCE',
        evidenceMentionIds: undefined,
        relatedFactIds: [...(item.factIds || [])],
        relatedClaimIds: [...(item.claimIds || [])],
        metadata: { ...(item.metadata || {}), compatibilityAlias: true, richSourceId: item.evidenceMentionIds[0] },
      });
    }
  }
  if (/revision.*amparo.*directo/i.test(doc.documentType) && (items.some((item) => item.category === 'SOURCE_ARGUMENT_RESPONSE') || items.some((item) => item.category === 'AUTHORITY_MENTION'))) {
    const targetSectionIds = sections.filter((section) => section.type === 'legal_grounds').map((section) => section.id);
    aliases.push({
      id: 'compat-procedural-requirement',
      category: 'PROCEDURAL_REQUIREMENT',
      description: 'Requisito procesal del documento pendiente de desarrollo con la fuente disponible.',
      required: true,
      status: 'pending',
      targetSectionIds,
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      blocking: true,
      metadata: { compatibilityAlias: true },
    });
  }
  return aliases;
}

function buildFactCoverageItems(rich: RichCaseAnalysis, sections: DocumentNode[]): DocumentCoverageItem[] {
  const targetSectionIds = findFactSections(sections);
  const requiresResponse = targetSectionIds.length > 0;
  const items: DocumentCoverageItem[] = [];

  for (const fact of rich.facts) {
    if (!fact.id || !fact.proposition.trim()) continue;
    const explicitlyConfirmed = rich.clientPosition.propositionIds.includes(fact.id)
      && rich.clientPosition.status === 'CONFIRMED';
    const explicitlyUnknown = rich.clientPosition.propositionIds.includes(fact.id)
      && rich.clientPosition.status === 'UNKNOWN';
    const postureUnknown = !explicitlyConfirmed;

    // STEP 1 FIX (CR-1):
    // ESTABLISHED_FACT = hecho judicialmente determinado (acto de autoridad).
    // No requiere postura estratégica del abogado para ser DESCRITO/REDACTADO;
    // puede requerir postura para ser IMPUGNADO o ACEPTADO, pero eso es una
    // decisión de finalización, no un bloqueo de generación.
    // SOURCE_ASSERTION / UNKNOWN: sí requieren postura para finalizar la respuesta.
    const isEstablishedFact = fact.assertionStatus === 'ESTABLISHED_FACT';

    // requiresClientPosition: ¿bloquea la GENERACIÓN por falta de postura?
    //   false = puede generarse borrador; la postura puede requerirse para FINALIZAR.
    //   true  = sin postura no puede generarse ni siquiera borrador.
    const requiresClientPosition = requiresResponse && !isEstablishedFact;

    // El estado is needs_client_position solo cuando realmente bloquea la generación.
    const status = requiresResponse && postureUnknown && requiresClientPosition
      ? 'needs_client_position'
      : 'pending';

    items.push({
      id: `cov-fact-response-${fact.id}`,
      category: 'FACT_RESPONSE',
      description: `Respuesta al hecho: ${fact.proposition.trim()}`,
      required: requiresResponse,
      status,
      targetSectionIds,
      sourceEntityType: 'FACT',
      sourceEntityIds: [fact.id],
      factIds: [fact.id],
      scope: requiresResponse ? 'SUBSTANTIVE' : undefined,
      satisfactionPolicy: requiresResponse ? 'REQUIRES_SEMANTIC_RESPONSE' : 'REFERENCE_ONLY',
      blocking: requiresResponse && postureUnknown && requiresClientPosition,
      requiresClientPosition,
      statusReason: isEstablishedFact
        ? 'ESTABLISHED_FACT_DRAFTABLE'
        : explicitlyConfirmed
          ? 'CLIENT_POSITION_CONFIRMED'
          : 'CLIENT_POSITION_UNKNOWN',
      relationStatus: 'EXPLICIT',
      provenance: [...fact.provenance],
      metadata: {
        assertionStatus: fact.assertionStatus,
        clientPositionStatus: explicitlyConfirmed ? 'CONFIRMED' : explicitlyUnknown ? 'UNKNOWN' : undefined,
        date: fact.date,
        amount: fact.amount,
        relatedDocumentIds: [...fact.relatedDocumentIds],
      },
    });

    // Solo emitir MISSING_CLIENT_POSITION cuando realmente bloquea la generación
    if (requiresResponse && postureUnknown && requiresClientPosition) {
      items.push({
        id: `cov-missing-client-position-${fact.id}`,
        category: 'MISSING_CLIENT_POSITION',
        description: `Falta postura del cliente para el hecho ${fact.id}`,
        required: true,
        status: 'needs_client_position',
        targetSectionIds,
        sourceEntityType: 'MISSING_DATA',
        sourceEntityIds: [fact.id],
        factIds: [fact.id],
        scope: 'SUBSTANTIVE',
        satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
        blocking: true,
        requiresClientPosition: true,
        statusReason: 'CLIENT_POSITION_UNKNOWN_FOR_FACT',
        relationStatus: 'EXPLICIT',
        metadata: { field: 'clientPosition', relatedFactId: fact.id },
      });
    }
  }

  return items;
}

function buildArgumentCoverageItems(rich: RichCaseAnalysis, sections: DocumentNode[]): DocumentCoverageItem[] {
  const targetSectionIds = findArgumentSections(sections);
  // Build a lookup set of established fact IDs for quick checking
  const establishedFactIds = new Set(
    rich.facts.filter((f) => f.assertionStatus === 'ESTABLISHED_FACT').map((f) => f.id),
  );
  return rich.arguments
    .filter((argument) => Boolean(argument.id && isMaterialSourceArgument(argument)))
    .map((argument): DocumentCoverageItem => {
      // STEP 1 FIX (CR-1):
      // An argument with supportingFactIds has documentary backing.
      // It can produce a provisional draft even without explicit client position.
      // requiresClientPosition = false → can be GENERATABLE_REQUIRES_REVIEW.
      // If the argument has NO factual support at all, client position is needed.
      const hasDirectFactualSupport = argument.supportingFactIds.length > 0;
      const hasEstablishedFactSupport = argument.supportingFactIds.some((id) => establishedFactIds.has(id));

      // Arguments backed by established facts: no client position needed to DRAFT.
      // Arguments backed only by SOURCE_ASSERTION facts: require client position.
      const requiresClientPosition = !hasEstablishedFactSupport;

      return {
        id: `cov-source-argument-${argument.id}`,
        category: 'SOURCE_ARGUMENT_RESPONSE',
        description: `Respuesta al argumento de fuente: ${argument.proposition.trim()}`,
        required: targetSectionIds.length > 0,
        status: targetSectionIds.length > 0 ? 'pending' : 'not_applicable',
        targetSectionIds,
        sourceEntityType: 'ARGUMENT',
        sourceEntityIds: [argument.id],
        argumentIds: [argument.id],
        relatedChallengedReasoningIds: [...(argument.challengedReasoningIds || [])],
        factIds: [...argument.supportingFactIds],
        authorityMentionIds: [...argument.citedAuthorityIds],
        scope: targetSectionIds.length > 0 ? 'SUBSTANTIVE' : undefined,
        satisfactionPolicy: targetSectionIds.length > 0 ? 'REQUIRES_SEMANTIC_RESPONSE' : 'REFERENCE_ONLY',
        blocking: targetSectionIds.length > 0 && requiresClientPosition,
        requiresClientPosition,
        statusReason: hasEstablishedFactSupport
          ? 'SOURCE_ARGUMENT_ESTABLISHED_FACT_BACKED'
          : hasDirectFactualSupport
            ? 'SOURCE_ARGUMENT_FACT_BACKED'
            : 'SOURCE_ARGUMENT_REQUIRES_RESPONSE',
        relationStatus: argument.supportingFactIds.length > 0
          || argument.citedAuthorityIds.length > 0
          || (argument.challengedReasoningIds || []).length > 0
          ? 'EXPLICIT'
          : 'UNLINKED',
        provenance: [...argument.provenance],
        metadata: { speakerRole: argument.speakerRole },
      };
    });
}

/**
 * Candidate segmentation can leave page headers, isolated OCR tokens and
 * line fragments classified as arguments.  Those fragments remain in the
 * rich extraction for traceability, but they must not become mandatory legal
 * coverage requirements.  Explicit entity links keep short, source-backed
 * propositions eligible; otherwise a proposition must have enough lexical
 * substance to represent an argument rather than a layout fragment.
 */
function isMaterialSourceArgument(argument: RichCaseAnalysis['arguments'][number]): boolean {
  const proposition = argument.proposition.replace(/\s+/g, ' ').trim();
  if (!proposition) return false;
  const sourceSections = argument.provenance.map((entry) => entry.section || '').join(' ');
  const comesFromCourtDecisionSection = /razones\s+y\s+fundamentos\s+de\s+la\s+decisi[oó]n|antecedentes\s+al\s+tr[aá]mite/i.test(sourceSections);
  const hasExplicitLink = argument.supportingFactIds.length > 0
    || argument.citedAuthorityIds.length > 0
    || (argument.challengedReasoningIds || []).length > 0;
  // A judgment's narrated reasoning is source context, not an argument
  // supplied by the current lawyer.  Keep it traceable in rich extraction;
  // only an explicit challenge can turn it into response coverage.
  if (comesFromCourtDecisionSection && (argument.challengedReasoningIds || []).length === 0) return false;
  if (hasExplicitLink) return proposition.length >= 24;
  if (proposition.length < 48) return false;
  const words = proposition.match(/[\p{L}\p{N}]{2,}/gu) || [];
  if (words.length < 8) return false;
  const lettersAndNumbers = (proposition.match(/[\p{L}\p{N}]/gu) || []).length;
  const visibleCharacters = proposition.replace(/\s/g, '').length;
  return visibleCharacters > 0 && lettersAndNumbers / visibleCharacters >= 0.62;
}

function buildAuthorityCoverageItems(rich: RichCaseAnalysis, sections: DocumentNode[]): DocumentCoverageItem[] {
  const targetSectionIds = findArgumentSections(sections);
  return rich.authorities
    .filter((authority) => Boolean(authority.id && authority.citationText.trim()))
    .map((authority): DocumentCoverageItem => {
      const sourceSections = authority.provenance.map((entry) => entry.section || '').join(' ');
      const courtDecisionSource = /razones\s+y\s+fundamentos\s+de\s+la\s+decisi[oó]n|antecedentes\s+al\s+tr[aá]mite/i.test(sourceSections);
      const required = targetSectionIds.length > 0 && !courtDecisionSource;
      return {
        id: `cov-authority-mention-${authority.id}`,
        category: 'AUTHORITY_MENTION',
        description: `Autoridad citada en la fuente: ${authority.citationText.trim()}`,
        required,
        status: required ? 'pending' : 'not_applicable',
        targetSectionIds: required ? targetSectionIds : [],
        sourceEntityType: 'AUTHORITY_MENTION',
        sourceEntityIds: [authority.id],
        authorityMentionIds: [authority.id],
        scope: required ? 'SUBSTANTIVE' : undefined,
        satisfactionPolicy: required ? 'REQUIRES_SEMANTIC_RESPONSE' : 'REFERENCE_ONLY',
        blocking: false,
        requiresClientPosition: false,
        statusReason: courtDecisionSource ? 'COURT_DECISION_REFERENCE_ONLY' : 'SOURCE_CITED_NOT_VERIFIED',
        relationStatus: 'EXPLICIT',
        provenance: [...authority.provenance],
        metadata: {
          authorityType: authority.authorityType,
          verificationStatus: authority.verificationStatus,
        },
      };
    });
}

function buildPetitionSupportCoverageItems(rich: RichCaseAnalysis, sections: DocumentNode[]): DocumentCoverageItem[] {
  const items: DocumentCoverageItem[] = [];
  for (const argument of rich.arguments) {
    const explicitSectionIds = argument.petitionSectionIds || [];
    const targetSectionIds = explicitSectionIds.filter((id) => sections.some((section) => section.id === id && section.type === 'petition'));
    if (targetSectionIds.length === 0 || (argument.supportingFactIds.length === 0 && argument.citedAuthorityIds.length === 0)) continue;
    items.push({
      id: `cov-petition-support-${argument.id}`,
      category: 'PETITION_SUPPORT',
      description: `Apoyo explícito de fuente al petitorio mediante el argumento ${argument.id}`,
      required: true,
      status: 'pending',
      targetSectionIds,
      sourceEntityType: 'ARGUMENT',
      sourceEntityIds: [argument.id],
      argumentIds: [argument.id],
      factIds: [...argument.supportingFactIds],
      authorityMentionIds: [...argument.citedAuthorityIds],
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      blocking: true,
      requiresClientPosition: true,
      statusReason: 'EXPLICIT_PETITION_SUPPORT',
      relationStatus: 'EXPLICIT',
      provenance: [...argument.provenance],
    });
  }
  return items;
}

function buildMissingDataCoverageItems(missingData: MissingDataItem[]): DocumentCoverageItem[] {
  return missingData.map((missing, index): DocumentCoverageItem => {
    const missingId = (missing as MissingDataItem & { id?: string }).id
      || `missing-data-${missing.field}-${index + 1}`;
    const status = missing.blocking
      ? 'blocked'
      : missing.requiresClientInput
        ? 'needs_client_position'
        : 'pending';
    return {
      id: `cov-missing-data-${missingId}`,
      category: 'MISSING_CLIENT_POSITION',
      description: `Dato faltante (${missing.field}): ${missing.reason}`,
      required: missing.blocking,
      status,
      targetSectionIds: missing.sectionAffected ? [missing.sectionAffected] : [],
      sourceEntityType: 'MISSING_DATA',
      sourceEntityIds: [missingId],
      missingDataIds: [missingId],
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      blocking: missing.blocking,
      requiresClientPosition: missing.requiresClientInput,
      statusReason: missing.requiresClientInput ? 'CLIENT_INPUT_REQUIRED' : 'MISSING_DATA_RECORDED',
      relationStatus: 'EXPLICIT',
      metadata: {
        field: missing.field,
        importance: missing.importance,
        sourceSearched: [...missing.sourceSearched],
      },
    };
  });
}

function buildConflictCoverageItems(conflicts: CaseConflict[], sections: DocumentNode[]): DocumentCoverageItem[] {
  return conflicts.map((conflict): DocumentCoverageItem => {
    const targetSectionIds = conflict.itemIds.flatMap((id) => {
      if (/fact/i.test(id)) return findFactSections(sections);
      if (/claim/i.test(id)) return findClaimResponseSections(sections);
      if (/evidence/i.test(id)) return findEvidenceSections(sections);
      return [];
    });
    return {
    id: `cov-conflict-${conflict.conflictId}`,
    category: 'CONFLICT_REVIEW',
    description: `Conflicto pendiente de revisión: ${conflict.description}`,
    required: true,
    status: 'blocked',
    targetSectionIds: Array.from(new Set(targetSectionIds)),
    sourceEntityType: 'CONFLICT',
    sourceEntityIds: [conflict.conflictId],
    conflictIds: [conflict.conflictId],
    scope: 'SUBSTANTIVE',
    satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
    blocking: true,
    statusReason: 'REQUIERE REVISIÓN DE CONFLICTO',
    relationStatus: 'EXPLICIT',
    metadata: {
      conflictType: conflict.type,
      itemIds: [...conflict.itemIds],
      sourceIds: [...conflict.sourceIds],
      requiresReview: conflict.requiresReview,
    },
    };
  });
}

function buildEvidenceCoverageItems(rich: RichCaseAnalysis, sections: DocumentNode[]): DocumentCoverageItem[] {
  const targetSectionIds = findEvidenceSections(sections);
  const requiresTreatment = targetSectionIds.length > 0;
  const treatmentItems = rich.evidenceMentions
    .filter((mention) => Boolean(mention.id && mention.description.trim()))
    .map((mention): DocumentCoverageItem => ({
      id: `cov-evidence-treatment-${mention.id}`,
      category: 'EVIDENCE_TREATMENT',
      description: `Tratamiento de evidencia mencionada${mention.type ? ` (${mention.type})` : ''}: ${mention.description.trim()}`,
      required: requiresTreatment,
      status: requiresTreatment ? 'pending' : 'not_applicable',
      targetSectionIds,
      sourceEntityType: 'EVIDENCE_MENTION',
      sourceEntityIds: [mention.id],
      evidenceMentionIds: [mention.id],
      factIds: [...mention.relatedFactIds],
      claimIds: [...mention.relatedClaimIds],
      scope: requiresTreatment ? 'SUBSTANTIVE' : undefined,
      satisfactionPolicy: requiresTreatment ? 'REQUIRES_SEMANTIC_RESPONSE' : 'REFERENCE_ONLY',
      blocking: requiresTreatment,
      requiresClientPosition: false,
      statusReason: mention.status === 'SOURCE_MENTIONED' ? 'SOURCE_MENTIONED_REQUIRES_TREATMENT' : 'EVIDENCE_STATUS_PRESERVED',
      relationStatus: mention.relatedFactIds.length > 0 || mention.relatedClaimIds.length > 0 ? 'EXPLICIT' : 'UNLINKED',
      provenance: [...mention.provenance],
      metadata: { evidenceMentionStatus: mention.status, documentItemId: mention.documentItemId },
    }));

  const offerItems = rich.evidenceOffers
    .filter((offer) => Boolean(offer.id && offer.evidenceMentionId))
    .map((offer): DocumentCoverageItem => ({
      id: `cov-evidence-offer-${offer.id}`,
      category: 'EVIDENCE_OFFER',
      description: `Oferta de prueba vinculada a evidencia mencionada ${offer.evidenceMentionId}`,
      required: requiresTreatment,
      status: requiresTreatment ? 'pending' : 'not_applicable',
      targetSectionIds,
      sourceEntityType: 'EVIDENCE_OFFER',
      sourceEntityIds: [offer.id],
      evidenceMentionIds: [offer.evidenceMentionId],
      evidenceOfferIds: [offer.id],
      scope: requiresTreatment ? 'SUBSTANTIVE' : undefined,
      satisfactionPolicy: requiresTreatment ? 'REQUIRES_SEMANTIC_RESPONSE' : 'REFERENCE_ONLY',
      blocking: requiresTreatment,
      requiresClientPosition: offer.status !== 'CLIENT_CONFIRMED',
      statusReason: `EVIDENCE_OFFER_STATUS_${offer.status}`,
      relationStatus: 'EXPLICIT',
      provenance: [...offer.provenance],
      metadata: { evidenceOfferStatus: offer.status },
    }));

  return [...treatmentItems, ...offerItems];
}

function buildClaimCoverageItem(
  claim: ClaimItem,
  sections: DocumentNode[],
  clientPosition: ClientPosition,
): DocumentCoverageItem {
  const targetSectionIds = findClaimResponseSections(sections);
  const explicitlyLinkedToUnknownClientPosition = clientPosition.propositionIds.includes(claim.id)
    && clientPosition.status === 'UNKNOWN';
  const clientPositionKnown = clientPosition.propositionIds.includes(claim.id)
    && clientPosition.status === 'CONFIRMED';

  return {
    id: `cov-claim-${claim.id}`,
    category: 'CLAIM_RESPONSE',
    description: `Respuesta a la prestación: ${claim.requestedRelief.trim()}`,
    required: targetSectionIds.length > 0,
    status: explicitlyLinkedToUnknownClientPosition ? 'needs_client_position' : 'pending',
    targetSectionIds,
    sourceEntityType: 'CLAIM',
    sourceEntityIds: [claim.id],
    claimIds: [claim.id],
    factIds: claim.factualBasisIds.length > 0 ? [...claim.factualBasisIds] : [],
    evidenceMentionIds: claim.evidenceMentionIds.length > 0 ? [...claim.evidenceMentionIds] : [],
    scope: 'SUBSTANTIVE',
    satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
    blocking: targetSectionIds.length > 0,
    requiresClientPosition: true,
    statusReason: explicitlyLinkedToUnknownClientPosition
      ? 'CLIENT_POSITION_UNKNOWN'
      : 'RICH_CLAIM_PENDING_RESPONSE',
    relationStatus: claim.factualBasisIds.length > 0 || claim.evidenceMentionIds.length > 0
      ? 'EXPLICIT'
      : 'UNLINKED',
    provenance: [...claim.provenance],
    metadata: {
      claimStatus: claim.status,
      claimantPartyId: claim.claimantPartyId,
      clientPositionKnown,
    },
  };
}

/**
 * Selects the canonical response section from document structure.  It uses
 * section type/title metadata only and does not branch on a labor/civil
 * document family.  A later binding pass may replace this provisional target
 * with template-declared section metadata while preserving the item ID.
 */
function findClaimResponseSections(sections: DocumentNode[]): string[] {
  const eligible = sections.filter((section) => {
    const title = section.title.toLocaleLowerCase();
    return /prestaci|pretensi|claim|relief|demanda/.test(title)
      && section.type !== 'signature'
      && section.type !== 'closing';
  });

  if (eligible.length > 0) return [eligible[0].id];

  const typed = sections.find((section) => section.type === 'argument' || section.type === 'petition');
  return typed ? [typed.id] : [];
}

function findEvidenceSections(sections: DocumentNode[]): string[] {
  const section = sections.find((candidate) => candidate.type === 'evidence'
    || /prueba|evidence/.test(candidate.title.toLocaleLowerCase()));
  return section ? [section.id] : [];
}

function findFactSections(sections: DocumentNode[]): string[] {
  const section = sections.find((candidate) => candidate.type === 'facts'
    || candidate.type === 'background'
    || /hecho|antecedente|fact/.test(candidate.title.toLocaleLowerCase()));
  return section ? [section.id] : [];
}

function findProceduralTimelineSections(sections: DocumentNode[]): string[] {
  const antecedents = sections
    .filter((section) => (section.type === 'facts' || section.type === 'background')
      && /antecedente/i.test(section.title))
    .map((section) => section.id);
  if (antecedents.length > 0) return antecedents;

  // Some canonical templates name the same narrative slot HECHOS or
  // CONTESTACIÓN DE HECHOS.  Use that declared facts slot only when an
  // explicit ANTECEDENTES section is absent; never fall back to an argument
  // or legal-grounds section.
  const facts = sections
    .filter((section) => (section.type === 'facts' || section.type === 'background')
      && /hecho|fact/i.test(section.title))
    .map((section) => section.id);
  if (facts.length > 0) return [facts[0]];

  const background = sections.find((section) => section.type === 'facts' || section.type === 'background');
  return background ? [background.id] : [];
}

function findArgumentSections(sections: DocumentNode[]): string[] {
  return sections
    .filter((section) => (section.type === 'argument' || section.type === 'legal_grounds')
      && !/prestaci|pretensi|petitori|petition|relief/i.test(section.title))
    .map((section) => section.id);
}

export function summarizeRichCoverage(items: DocumentCoverageItem[]): CoverageMatrix['summary'] {
  const byCategory: Partial<Record<CoverageCategory, number>> = {};
  let required = 0;
  let pending = 0;
  let generated = 0;
  let covered = 0;
  let unsupported = 0;
  let weak = 0;
  let notApplicable = 0;
  let blocked = 0;
  let needsClientPosition = 0;
  let contradictory = 0;
  let insufficient = 0;

  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    if (item.required) required += 1;
    if (item.status === 'pending') pending += 1;
    if (item.status === 'generated') generated += 1;
    if (item.status === 'covered') covered += 1;
    if (item.status === 'unsupported') unsupported += 1;
    if (item.status === 'weak') weak += 1;
    if (item.status === 'not_applicable') notApplicable += 1;
    if (item.status === 'blocked' || item.blocking) blocked += 1;
    if (item.status === 'needs_client_position' || item.requiresClientPosition) needsClientPosition += 1;
    if (item.status === 'contradictory') contradictory += 1;
    if (item.status === 'insufficient') insufficient += 1;
  }

  return {
    total: items.length,
    required,
    pending,
    generated,
    covered,
    unsupported,
    weak,
    notApplicable,
    blocked,
    needsClientPosition,
    contradictory,
    insufficient,
    byCategory,
  };
}

export interface CoverageSectionBinding {
  sections: DocumentNode[];
  orphanCoverageItemIds: string[];
}

/**
 * Attaches rich Coverage to an already selected document structure.  The
 * binding validates explicit target IDs and section types; it never searches
 * by a similar title or creates a new section for an unmatched item.
 */
export function bindCoverageToSections(
  sections: DocumentNode[],
  matrix: CoverageMatrix,
): CoverageSectionBinding {
  const boundSections = sections.map((section) => ({
    ...section,
    coverageItemIds: [...(section.coverageItemIds || [])],
    requiredCoverageItemIds: [...(section.requiredCoverageItemIds || [])],
  }));
  const byId = new Map(boundSections.map((section) => [section.id, section]));
  const orphans: string[] = [];

  for (const item of matrix.items) {
    const linked: DocumentNode[] = [];
    for (const sectionId of item.targetSectionIds) {
      const section = byId.get(sectionId);
      if (section && isEligibleSection(item, section)) linked.push(section);
    }
    if (linked.length === 0) {
      orphans.push(item.id);
      continue;
    }
    for (const section of linked) {
      section.coverageItemIds = Array.from(new Set([...(section.coverageItemIds || []), item.id]));
      if (item.required) {
        section.requiredCoverageItemIds = Array.from(new Set([...(section.requiredCoverageItemIds || []), item.id]));
      }
      const entityIds = item.sourceEntityIds?.join(', ') || item.claimIds?.join(', ') || item.factIds?.join(', ') || '';
      const reason = `Coverage ${item.category}${entityIds ? ` [${entityIds}]` : ''}`;
      if (!section.coverageReason?.includes(reason)) {
        section.coverageReason = section.coverageReason ? `${section.coverageReason}; ${reason}` : reason;
      }
    }
  }

  for (const section of boundSections) {
    section.requiredCoverageItemIds = (section.requiredCoverageItemIds || [])
      .filter((id) => (section.coverageItemIds || []).includes(id));
  }
  return { sections: boundSections, orphanCoverageItemIds: orphans };
}

function isEligibleSection(item: DocumentCoverageItem, section: DocumentNode): boolean {
  const id = section.id.toLocaleLowerCase();
  switch (item.category) {
    case 'CLAIM_RESPONSE':
      return section.type === 'argument' && /prestaci|claim|pretensi/.test(id);
    case 'PETITION_SUPPORT':
      return section.type === 'petition' && /petitori|petition|relief/.test(id);
    case 'FACT':
    case 'FACT_RESPONSE':
      return section.type === 'facts' || section.type === 'background';
    case 'EVIDENCE':
    case 'EVIDENCE_TREATMENT':
    case 'EVIDENCE_OFFER':
      return section.type === 'evidence';
    case 'SOURCE_ARGUMENT_RESPONSE':
    case 'AUTHORITY_MENTION':
      return section.type === 'argument' || section.type === 'legal_grounds';
    case 'PROCEDURAL_REQUIREMENT':
      return (section.type === 'facts' || section.type === 'background')
        && /antecedente/i.test(section.title);
    case 'FORMAL_REQUIREMENT':
      return section.type === 'header' || section.type === 'closing' || section.type === 'signature';
    default:
      return section.type !== 'signature' && section.type !== 'closing';
  }
}
