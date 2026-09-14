/**
 * coverageMatrix.ts — MATRIZ DE COBERTURA DOCUMENTAL JURÍDICA (FASE 3)
 *
 * Mapea todo lo que el escrito jurídico necesita cubrir ANTES de redactar:
 *   CaseAnalysis → Legal Issues → Coverage Matrix → Document Plan → Section Plans → Issue Plans
 *
 * Principios:
 * - Reutilización de tipos existentes (Fact, Claim, Evidence, Ruling).
 * - Trazabilidad hacia elementos de entrada (sourceReference, page, docId).
 * - Deduplicación de issues semánticos idénticos.
 * - Validación de invariantes (sin IDs huérfanos, required items asignados a secciones).
 * - Cero jurisprudencia o pruebas inventadas.
 */

import type { AnalyzedClaim, AnalyzedFact, SourceReference, UniversalLegalDocument, DocumentNode } from './types';
import type { CaseAnalysis, LegalIssue } from './caseAnalysis';
import type { DraftingPlan, SectionPlan, IssuePlan } from './pipeline';
import type { LegalIssueMatrix } from './legalIssueMatrix';
import { buildRichCoverageMatrix } from './richCoverage';

export type CoverageCategory =
  | 'FACT'
  | 'CLAIM'
  | 'CLAIM_RESPONSE'
  | 'FACT_RESPONSE'
  | 'RELIEF'
  | 'DEFENSE'
  | 'EXCEPTION'
  | 'EVIDENCE'
  | 'EVIDENCE_TREATMENT'
  | 'EVIDENCE_OFFER'
  | 'LEGAL_ISSUE'
  | 'CONSTITUTIONAL_ISSUE'
  | 'CHALLENGED_REASONING'
  | 'SOURCE_ARGUMENT_RESPONSE'
  | 'AUTHORITY_MENTION'
  | 'MISSING_CLIENT_POSITION'
  | 'CONFLICT_REVIEW'
  | 'PETITION_SUPPORT'
  | 'FORMAL_REQUIREMENT'
  | 'AUTHORITY'
  | 'PROCEDURAL_REQUIREMENT'
  | 'REQUESTED_RELIEF';

export type CoverageItemStatus =
  | 'pending'
  | 'drafting'
  | 'generated'
  | 'covered'
  | 'weak'
  | 'unsupported'
  | 'needs_client_position'
  | 'blocked'
  | 'contradictory'
  | 'insufficient'
  | 'not_applicable';

export type CoverageScope = 'SUBSTANTIVE' | 'FORMAL';

export type CoverageSatisfactionPolicy =
  | 'REQUIRES_SEMANTIC_RESPONSE'
  | 'FORMAL_DETERMINISTIC_ALLOWED'
  | 'REFERENCE_ONLY';

export type CoverageEntityType =
  | 'CLAIM'
  | 'FACT'
  | 'DOCUMENT'
  | 'EVIDENCE_MENTION'
  | 'EVIDENCE_OFFER'
  | 'ARGUMENT'
  | 'AUTHORITY_MENTION'
  | 'CONFLICT'
  | 'MISSING_DATA'
  | 'PROCEDURAL_REQUIREMENT'
  | 'FORMAL_REQUIREMENT';

export type CoverageRelationStatus = 'EXPLICIT' | 'UNLINKED' | 'UNKNOWN';

export interface DocumentCoverageItem {
  id: string;
  sourceId?: string;
  category: CoverageCategory;
  description: string;
  title?: string;
  required: boolean;
  status: CoverageItemStatus;
  sourceReferences?: SourceReference[];
  relatedFactIds?: string[];
  relatedClaimIds?: string[];
  relatedEvidenceIds?: string[];
  relatedAuthorityIds?: string[];
  relatedChallengedReasoningIds?: string[];
  targetSectionIds: string[];
  generatedBlockIds?: string[];
  sourceEntityType?: CoverageEntityType;
  sourceEntityIds?: string[];
  claimIds?: string[];
  factIds?: string[];
  evidenceMentionIds?: string[];
  evidenceOfferIds?: string[];
  argumentIds?: string[];
  authorityMentionIds?: string[];
  conflictIds?: string[];
  missingDataIds?: string[];
  scope?: CoverageScope;
  satisfactionPolicy?: CoverageSatisfactionPolicy;
  blocking?: boolean;
  requiresClientPosition?: boolean;
  statusReason?: string;
  relationStatus?: CoverageRelationStatus;
  provenance?: import('./case-extraction/types').SourceProvenance[];
  metadata?: Record<string, unknown>;
}

export interface CoverageMatrix {
  documentId?: string;
  documentType?: string;
  items: DocumentCoverageItem[];
  summary: {
    total: number;
    required: number;
    pending: number;
    generated: number;
    covered: number;
    unsupported: number;
    weak: number;
    notApplicable: number;
    blocked?: number;
    needsClientPosition?: number;
    contradictory?: number;
    insufficient?: number;
    byCategory?: Partial<Record<CoverageCategory, number>>;
  };
}

/**
 * Normaliza y deduplica variantes semánticas del mismo problema jurídico (3Q).
 * Ej. "Falta de exhaustividad", "Violación al principio de exhaustividad",
 * "La sentencia no fue exhaustiva" colapsan a una sola cuestión jurídica canónica.
 */
export function normalizeIssueSemanticKey(title: string): string {
  const clean = (title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  if (/exhaustiv|incongruen|congruen|omisi[oó]n.*pronunciam/.test(clean)) return 'exhaustividad_congruencia';
  if (/fundamentac|motivac|indebida.*fundam/.test(clean)) return 'fundamentacion_motivacion';
  if (/debido.*proceso|formalidad.*esencial|audiencia|defensa/.test(clean)) return 'debido_proceso';
  if (/valoraci[oó]n.*prueba|desestim.*prueba|omisi[oó]n.*valor/.test(clean)) return 'valoracion_probatoria';
  if (/interes.*superior|menor|infancia/.test(clean)) return 'interes_superior_menor';
  if (/pro.*persona|control.*convencional|derecho.*humano/.test(clean)) return 'principio_pro_persona';
  if (/prescripci[oó]n|caducidad|plazo.*termin/.test(clean)) return 'prescripcion_caducidad';
  if (/personalidad|legitimac|personeria/.test(clean)) return 'legitimacion_personalidad';
  if (/competencia|jurisdicci[oó]n/.test(clean)) return 'competencia_jurisdiccion';
  if (/constitucionalidad.*norma|inconstitucionalidad/.test(clean)) return 'inconstitucionalidad_norma';

  // Fallback: usar las primeras 4 palabras significativas
  const words = clean.split(/\s+/).filter((w) => w.length > 3).slice(0, 4);
  return words.join('_') || 'cuestion_juridica_general';
}

/**
 * Deduplica una lista de LegalIssues agrupando variantes semánticas equivalentes.
 */
export function deduplicateLegalIssues(issues: LegalIssue[]): LegalIssue[] {
  const byKey = new Map<string, LegalIssue>();

  for (const issue of issues) {
    const key = issue.canonicalKey || normalizeIssueSemanticKey(issue.title);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, { ...issue, canonicalKey: key });
    } else {
      // Fusionar referencias e información complementaria
      if (!existing.parameter && issue.parameter) existing.parameter = issue.parameter;
      if (!existing.sourceDoc && issue.sourceDoc) {
        existing.sourceDoc = issue.sourceDoc;
        existing.page = issue.page;
        existing.excerpt = issue.excerpt;
      }
      if (issue.relatedFactIds) {
        existing.relatedFactIds = Array.from(new Set([...(existing.relatedFactIds || []), ...issue.relatedFactIds]));
      }
      if (issue.relatedClaimIds) {
        existing.relatedClaimIds = Array.from(new Set([...(existing.relatedClaimIds || []), ...issue.relatedClaimIds]));
      }
      if (issue.relatedEvidenceIds) {
        existing.relatedEvidenceIds = Array.from(new Set([...(existing.relatedEvidenceIds || []), ...issue.relatedEvidenceIds]));
      }
      if (issue.relatedChallengedReasoningIds) {
        existing.relatedChallengedReasoningIds = Array.from(new Set([...(existing.relatedChallengedReasoningIds || []), ...issue.relatedChallengedReasoningIds]));
      }
    }
  }

  return Array.from(byKey.values());
}

/**
 * Busca el ID de una sección por palabra clave o tipo canónico.
 */
function findSectionId(sections: DocumentNode[] = [], pattern: RegExp | string): string {
  const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  const match = sections.find((s) => regex.test(s.title) || regex.test(s.type));
  return match?.id || 'sec-target-general';
}

/**
 * Construye la CoverageMatrix estructurada a partir del CaseAnalysis y las secciones del documento.
 */
export function buildLegacyCoverageMatrix(
  caseAnalysis: CaseAnalysis,
  doc: UniversalLegalDocument,
  sections: DocumentNode[] = doc.sections || []
): CoverageMatrix {
  const items: DocumentCoverageItem[] = [];
  const isContestacion = /contestaci[oó]n/i.test(doc.documentTypeLabel || doc.documentType) || (caseAnalysis as any)?.family === 'CONTESTACION';
  const isRevisionAmparoDirecto = /revisi[oó]n.*amparo.*directo/i.test(doc.documentTypeLabel || doc.documentType);

  const hechosSecId = findSectionId(sections, /hecho|antecedente/i);
  const prestacionesSecId = findSectionId(sections, /prestaci|pretensi|petitorio/i);
  const agraviosSecId = findSectionId(sections, /agravio|concepto.*violaci|argument|consideraci/i);
  const pruebasSecId = findSectionId(sections, /prueba|evidencia/i);
  const excepcionesSecId = findSectionId(sections, /excepcion|defensa/i);
  const procedenciaSecId = findSectionId(sections, /procedencia|oportunidad|interes/i);

  // ── 1. CLAIMS / PRESTACIONES (3G) ──────────────────────────────────────────
  // En contestaciones y demandas, cada pretensión detectada es un REQUIRED coverage item.
  const claimResponses: AnalyzedClaim[] = caseAnalysis.claimResponses || [];
  const rawClaims: string[] = caseAnalysis.claims || [];
  const isClaimApplicable = prestacionesSecId !== 'sec-target-general';

  if (claimResponses.length > 0) {
    claimResponses.forEach((claim) => {
      items.push({
        id: `cov-claim-${claim.id}`,
        category: 'CLAIM',
        description: `Prestación ${claim.number}: ${claim.text}`,
        required: isClaimApplicable,
        status: isClaimApplicable ? 'pending' : 'not_applicable',
        sourceReferences: claim.sourceReference ? [claim.sourceReference] : undefined,
        relatedClaimIds: [claim.id],
        targetSectionIds: [prestacionesSecId],
      });
    });
  } else if (rawClaims.length > 0) {
    rawClaims.forEach((claimText, idx) => {
      items.push({
        id: `cov-claim-raw-${idx + 1}`,
        category: 'CLAIM',
        description: `Prestación ${idx + 1}: ${claimText}`,
        required: isClaimApplicable,
        status: isClaimApplicable ? 'pending' : 'not_applicable',
        targetSectionIds: [prestacionesSecId],
      });
    });
  }

  // ── 2. FACTS (3F & 3H) ─────────────────────────────────────────────────────
  // En contestaciones, cada hecho de la demanda que requiera respuesta es REQUIRED (3H).
  const facts: AnalyzedFact[] = caseAnalysis.facts || [];
  const isFactApplicable = hechosSecId !== 'sec-target-general';
  facts.forEach((fact) => {
    const isRequired = isContestacion || Boolean(fact.confidence && fact.confidence >= 0.7);
    items.push({
      id: isContestacion ? `cov-fact-resp-${fact.id}` : `cov-fact-${fact.id}`,
      category: 'FACT',
      description: isContestacion
        ? `Respuesta y fijación de postura sobre el Hecho ${fact.number}: ${fact.text.slice(0, 120)}`
        : `Hecho ${fact.number}: ${fact.text.slice(0, 120)}`,
      required: isFactApplicable ? isRequired : false,
      status: isFactApplicable ? 'pending' : 'not_applicable',
      sourceReferences: fact.sourceReference ? [fact.sourceReference] : undefined,
      relatedFactIds: [fact.id],
      relatedEvidenceIds: (fact as any).relatedEvidenceIds || [],
      targetSectionIds: [hechosSecId],
      metadata: {
        actor: (fact as any).actor,
        date: (fact as any).date,
        contestedStatus: (fact as any).contestedStatus || 'UNKNOWN',
      },
    });
  });

  // ── 3. EVIDENCE (3I) ───────────────────────────────────────────────────────
  // No inventa pruebas: solo registra evidencias reales extraídas.
  const evidenceList = caseAnalysis.evidence || [];
  const isEvApplicable = pruebasSecId !== 'sec-target-general';
  evidenceList.forEach((ev) => {
    items.push({
      id: `cov-ev-${ev.id || items.length + 1}`,
      category: 'EVIDENCE',
      description: `Prueba ${ev.type}: ${ev.description.slice(0, 120)}`,
      required: isEvApplicable ? Boolean(ev.confirmed) : false,
      status: isEvApplicable ? 'pending' : 'not_applicable',
      sourceReferences: ev.sourceReference ? [ev.sourceReference] : undefined,
      relatedFactIds: (ev as any).relatedFactIds || [],
      relatedClaimIds: (ev as any).relatedClaimIds || [],
      targetSectionIds: [pruebasSecId],
    });
  });

  // ── 4. CHALLENGED REASONING / RULINGS (3J) ────────────────────────────────
  // Para recursos y amparos: consideraciones concretas combatidas.
  const challengedActs = caseAnalysis.challengedActs || [];
  const isAgravioApplicable = agraviosSecId !== 'sec-target-general';
  challengedActs.forEach((act, idx) => {
    items.push({
      id: `cov-challenged-act-${idx + 1}`,
      category: 'CHALLENGED_REASONING',
      description: `Acto impugnado de ${act.authority}: ${act.actDescription.slice(0, 120)}`,
      required: isAgravioApplicable,
      status: isAgravioApplicable ? 'pending' : 'not_applicable',
      sourceReferences: act.excerpt ? [{ documentId: act.authority, page: act.page, textSnippet: act.excerpt }] : undefined,
      targetSectionIds: [agraviosSecId],
    });
  });

  const challengedReasonings = (caseAnalysis as any).challengedReasonings || [];
  challengedReasonings.forEach((cr: any) => {
    const targetId = agraviosAgravioTarget(sections, cr.number) || agraviosSecId;
    const isCrApplicable = targetId !== 'sec-target-general';
    items.push({
      id: `cov-cr-${cr.id}`,
      category: 'CHALLENGED_REASONING',
      description: `Consideración combatida ${cr.number}: ${cr.rulingText.slice(0, 120)}`,
      required: isCrApplicable,
      status: isCrApplicable ? 'pending' : 'not_applicable',
      sourceReferences: cr.sourceReference ? [cr.sourceReference] : undefined,
      relatedChallengedReasoningIds: [cr.id],
      targetSectionIds: [targetId],
    });
  });

  // ── 5. LEGAL ISSUES & CONSTITUTIONAL ISSUES (3K & 3M) ──────────────────────
  const constitutionalIssues = deduplicateLegalIssues(caseAnalysis.proceduralPosture?.constitutionalIssues || []);
  const legalityIssues = deduplicateLegalIssues(caseAnalysis.proceduralPosture?.legalityIssues || []);
  const extraLegalIssues = deduplicateLegalIssues((caseAnalysis.legalIssues || []).filter(
    (li) => !constitutionalIssues.some((ci) => ci.id === li.id) && !legalityIssues.some((l2) => l2.id === li.id)
  ));

  constitutionalIssues.forEach((issue) => {
    items.push({
      id: `cov-issue-${issue.id}`,
      sourceId: issue.id,
      category: 'CONSTITUTIONAL_ISSUE',
      description: `Cuestión Constitucional: ${issue.title}`,
      required: isAgravioApplicable,
      status: isAgravioApplicable ? 'pending' : 'not_applicable',
      sourceReferences: issue.sourceDoc ? [{ documentId: issue.sourceDoc, page: issue.page, textSnippet: issue.excerpt }] : undefined,
      relatedFactIds: issue.relatedFactIds || [],
      relatedClaimIds: issue.relatedClaimIds || [],
      relatedChallengedReasoningIds: issue.relatedChallengedReasoningIds || [],
      targetSectionIds: [agraviosSecId],
      metadata: { parameter: issue.parameter },
    });
  });

  legalityIssues.forEach((issue) => {
    items.push({
      id: `cov-issue-${issue.id}`,
      sourceId: issue.id,
      category: 'LEGAL_ISSUE',
      description: `Cuestión Jurídica: ${issue.title}`,
      required: isAgravioApplicable,
      status: isAgravioApplicable ? 'pending' : 'not_applicable',
      sourceReferences: issue.sourceDoc ? [{ documentId: issue.sourceDoc, page: issue.page, textSnippet: issue.excerpt }] : undefined,
      relatedFactIds: issue.relatedFactIds || [],
      relatedClaimIds: issue.relatedClaimIds || [],
      relatedChallengedReasoningIds: issue.relatedChallengedReasoningIds || [],
      targetSectionIds: [agraviosSecId],
      metadata: { parameter: issue.parameter },
    });
  });

  extraLegalIssues.forEach((issue) => {
    items.push({
      id: `cov-issue-${issue.id}`,
      sourceId: issue.id,
      category: issue.category === 'CONSTITUTIONAL' ? 'CONSTITUTIONAL_ISSUE' : 'LEGAL_ISSUE',
      description: `Cuestión Jurídica: ${issue.title}`,
      required: isAgravioApplicable,
      status: isAgravioApplicable ? 'pending' : 'not_applicable',
      sourceReferences: (issue as any).sourceDoc ? [{ documentId: (issue as any).sourceDoc, page: (issue as any).page, textSnippet: (issue as any).excerpt }] : undefined,
      relatedFactIds: issue.relatedFactIds || [],
      relatedClaimIds: (issue as any).relatedClaimIds || [],
      relatedChallengedReasoningIds: (issue as any).relatedChallengedReasoningIds || [],
      targetSectionIds: [agraviosSecId],
    });
  });

  // ── 6. REQUISITOS PROCESALES EXTRAORDINARIOS (3M) ──────────────────────────
  if (isRevisionAmparoDirecto) {
    items.push({
      id: 'cov-proc-procedencia',
      category: 'PROCEDURAL_REQUIREMENT',
      description: 'Justificación de procedencia del recurso de revisión en amparo directo (Art. 81, frac. II Ley de Amparo)',
      required: true,
      status: 'pending',
      targetSectionIds: [procedenciaSecId],
    });
    if (caseAnalysis.proceduralPosture?.exceptionalInterest) {
      items.push({
        id: 'cov-proc-interes-excepcional',
        category: 'PROCEDURAL_REQUIREMENT',
        description: `Acreditación de interés excepcional en materia constitucional: ${caseAnalysis.proceduralPosture.exceptionalInterest}`,
        required: true,
        status: 'pending',
        targetSectionIds: [procedenciaSecId],
      });
    }
  }

  // ── 7. EXCEPCIONES Y DEFENSAS EN CONTESTACIÓN (3N) ─────────────────────────
  if (isContestacion) {
    items.push({
      id: 'cov-defensas-gral',
      category: 'DEFENSE',
      description: 'Planteamiento defensivo y excepciones procesales derivadas del expediente',
      required: true,
      status: 'pending',
      targetSectionIds: [excepcionesSecId],
    });
  }

  // ── Cálculo del sumario ────────────────────────────────────────────────────
  const byCategory: Partial<Record<CoverageCategory, number>> = {};
  let requiredCount = 0;
  let pendingCount = 0;
  let generatedCount = 0;
  let coveredCount = 0;
  let weakCount = 0;
  let unsupportedCount = 0;
  let notApplicableCount = 0;

  items.forEach((item) => {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    if (item.required) requiredCount++;
    if (item.status === 'pending') pendingCount++;
    else if (item.status === 'generated') generatedCount++;
    else if (item.status === 'covered') coveredCount++;
    else if (item.status === 'weak') weakCount++;
    else if (item.status === 'unsupported') unsupportedCount++;
    else if (item.status === 'not_applicable') notApplicableCount++;
  });

  return {
    documentId: doc.id,
    documentType: doc.documentType,
    items,
    summary: {
      total: items.length,
      required: requiredCount,
      pending: pendingCount,
      generated: generatedCount,
      covered: coveredCount,
      weak: weakCount,
      unsupported: unsupportedCount,
      notApplicable: notApplicableCount,
      byCategory,
    },
  };
}

/**
 * Public Coverage constructor. RichCaseAnalysis is canonical whenever it is
 * present; legacy arrays are consulted only when the rich representation is
 * absent. The rich builder is populated incrementally by the FASE 2 entity
 * tasks and never receives the legacy projection as an input.
 */
export function buildCoverageMatrix(
  caseAnalysis: CaseAnalysis,
  doc: UniversalLegalDocument,
  sections: DocumentNode[] = doc.sections || [],
): CoverageMatrix {
  if (caseAnalysis.richCaseAnalysis) {
    return buildRichCoverageMatrix(caseAnalysis.richCaseAnalysis, doc, sections);
  }
  return buildLegacyCoverageMatrix(caseAnalysis, doc, sections);
}

function agraviosAgravioTarget(sections: DocumentNode[], numStr: string): string | undefined {
  return sections.find((s) => new RegExp(`agravio.*${numStr}|consideraci[oó]n.*${numStr}`, 'i').test(s.title))?.id;
}

// ── VALIDACIÓN DE INVARIANTES (3P) ──────────────────────────────────────────

export interface ValidationInvariantsResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Valida formalmente los invariantes de cobertura y planificación profunda:
 * 1. Cada CoverageItem.required debe tener al menos un targetSectionId (salvo que sea global).
 * 2. Cada IssuePlan debe referenciar un LegalIssue real existente.
 * 3. Cada evidenceId debe existir en el análisis.
 * 4. Cada factId debe existir en el análisis.
 * 5. No debe haber IDs huérfanos.
 * 6. No debe haber duplicados required accidentales (mismo category y descripción).
 * 7. El DocumentPlan no debe contener referencias a items de cobertura inexistentes.
 */
export function validateCoverageAndPlanInvariants(
  coverageMatrix: CoverageMatrix,
  documentPlan?: DraftingPlan,
  caseAnalysis?: CaseAnalysis,
  legalIssueMatrix?: LegalIssueMatrix,
): ValidationInvariantsResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const coverageItemIds = new Set(coverageMatrix.items.map((i) => i.id));
  const factIds = new Set((caseAnalysis?.facts || []).map((f) => f.id));
  const claimIds = new Set((caseAnalysis?.claimResponses || []).map((c) => c.id));
  const evidenceIds = new Set((caseAnalysis?.evidence || []).map((e) => e.id).filter(Boolean));
  const allIssues = [
    ...(caseAnalysis?.proceduralPosture?.constitutionalIssues || []),
    ...(caseAnalysis?.proceduralPosture?.legalityIssues || []),
  ];
  const legacyIssueIds = new Set(allIssues.map((i) => i.id));
  const rich = caseAnalysis?.richCaseAnalysis;
  const effectiveMatrix = legalIssueMatrix
    || documentPlan?.legalIssueMatrix
    || (caseAnalysis as CaseAnalysis & { legalIssueMatrix?: LegalIssueMatrix }).legalIssueMatrix;
  const isRich = Boolean(rich || effectiveMatrix?.sourceMode === 'RICH');
  const richIssueIds = new Set((effectiveMatrix?.issues || []).map((i: { id: string }) => i.id));
  const issueIds = isRich && richIssueIds.size > 0
    ? richIssueIds
    : (richIssueIds.size > 0 ? new Set([...richIssueIds, ...legacyIssueIds]) : legacyIssueIds);
  const richIds = rich
    ? {
        claims: new Set(rich.claims.map((item) => item.id)),
        facts: new Set(rich.facts.map((item) => item.id)),
        evidenceMentions: new Set(rich.evidenceMentions.map((item) => item.id)),
        evidenceOffers: new Set(rich.evidenceOffers.map((item) => item.id)),
        arguments: new Set(rich.arguments.map((item) => item.id)),
        decisionReasonings: new Set((rich.decisionReasonings || []).map((item) => item.id)),
        authorities: new Set(rich.authorities.map((item) => item.id)),
        proceduralTimeline: new Set((rich.proceduralTimeline || []).map((item) => item.id)),
        conflicts: new Set(rich.conflicts.map((item) => item.conflictId)),
        missingData: new Set(rich.missingData.map((item, index) => (item as typeof item & { id?: string }).id || `missing-data-${item.field}-${index + 1}`)),
      }
    : undefined;

  // Invariante 1 & 6: Coverage items
  const seenRequiredKeys = new Set<string>();

  for (const item of coverageMatrix.items) {
    const mayBeGlobalRichItem = rich && (item.category === 'MISSING_CLIENT_POSITION' || item.category === 'CONFLICT_REVIEW');
    if (item.required && (!item.targetSectionIds || item.targetSectionIds.length === 0) && !mayBeGlobalRichItem) {
      errors.push(`CoverageItem required "${item.id}" no tiene targetSectionIds asignado.`);
    }

    if (item.required) {
      const compositeKey = `${item.category}::${(item.description || '').trim().toLowerCase()}`;
      if (seenRequiredKeys.has(compositeKey)) {
        errors.push(`CoverageItem required duplicado detectado: "${item.id}" (${compositeKey}).`);
      }
      seenRequiredKeys.add(compositeKey);
    }

    // Comprobar referencias de hechos (Invariante 3P: cero huérfanos)
    for (const fId of item.relatedFactIds || []) {
      if (!factIds.has(fId)) {
        errors.push(`CoverageItem "${item.id}" referencia un factId inexistente: "${fId}".`);
      }
    }

    // Comprobar referencias de prestaciones
    for (const cId of item.relatedClaimIds || []) {
      if (!claimIds.has(cId)) {
        errors.push(`CoverageItem "${item.id}" referencia un claimId inexistente: "${cId}".`);
      }
    }

    // Comprobar referencias de pruebas
    for (const eId of item.relatedEvidenceIds || []) {
      if (!evidenceIds.has(eId)) {
        errors.push(`CoverageItem "${item.id}" referencia un evidenceId inexistente: "${eId}".`);
      }
    }

    // Comprobar referencias de issues
    for (const iId of item.relatedChallengedReasoningIds || []) {
      const isRichReasoning = richIds?.decisionReasonings.has(iId) === true;
      if (!isRichReasoning && issueIds.size > 0 && !issueIds.has(iId)) {
        errors.push(`CoverageItem "${item.id}" referencia un issueId inexistente: "${iId}".`);
      }
    }

    // Invariante 3Q: Cobertura rica sin IDs huérfanos
    if (richIds) {
      const richReferences: [string, Set<string>, string][] = [
        ...(item.claimIds || []).map((id) => ['claimId', richIds.claims, id] as [string, Set<string>, string]),
        ...(item.factIds || []).map((id) => ['factId', richIds.facts, id] as [string, Set<string>, string]),
        ...(item.evidenceMentionIds || []).map((id) => ['evidenceMentionId', richIds.evidenceMentions, id] as [string, Set<string>, string]),
        ...(item.evidenceOfferIds || []).map((id) => ['evidenceOfferId', richIds.evidenceOffers, id] as [string, Set<string>, string]),
        ...(item.argumentIds || []).map((id) => ['argumentId', richIds.arguments, id] as [string, Set<string>, string]),
        ...(item.relatedChallengedReasoningIds || []).map((id) => ['decisionReasoningId', richIds.decisionReasonings, id] as [string, Set<string>, string]),
        ...(item.authorityMentionIds || []).map((id) => ['authorityMentionId', richIds.authorities, id] as [string, Set<string>, string]),
        ...(item.sourceEntityType === 'PROCEDURAL_REQUIREMENT'
          ? (item.sourceEntityIds || []).map((id) => ['proceduralEventId', richIds.proceduralTimeline, id] as [string, Set<string>, string])
          : []),
        ...(item.conflictIds || []).map((id) => ['conflictId', richIds.conflicts, id] as [string, Set<string>, string]),
        ...(item.missingDataIds || []).map((id) => ['missingDataId', richIds.missingData, id] as [string, Set<string>, string]),
      ];
      for (const [kind, knownIds, id] of richReferences) {
        if (!knownIds.has(id)) {
          errors.push(`CoverageItem "${item.id}" referencia un ${kind} rico inexistente: "${id}".`);
        }
      }
    }
  }

  // Invariante 2, 7: DocumentPlan
  if (documentPlan) {
    for (const sec of documentPlan.sections) {
      for (const covId of sec.coverageItemIds || []) {
        if (!coverageItemIds.has(covId)) {
          errors.push(`Sección "${sec.title}" referencia un coverageItemId inexistente: "${covId}".`);
        }
      }

      for (const ip of sec.issuePlans || []) {
        if (ip.issueId) {
          if (isRich && effectiveMatrix) {
            if (!richIssueIds.has(ip.issueId)) {
              errors.push(`IssuePlan "${ip.id}" en sección "${sec.title}" referencia un issueId inexistente: "${ip.issueId}".`);
            }
          } else if (issueIds.size > 0 && !issueIds.has(ip.issueId)) {
            errors.push(`IssuePlan "${ip.id}" en sección "${sec.title}" referencia un issueId inexistente: "${ip.issueId}".`);
          }
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

// ── OBSERVABILIDAD (3U) ─────────────────────────────────────────────────────

export function getCaseAnalysisSummary(analysis: CaseAnalysis): string {
  const cIssues = analysis.proceduralPosture?.constitutionalIssues?.length || 0;
  const lIssues = analysis.proceduralPosture?.legalityIssues?.length || 0;
  return [
    `[CASE ANALYSIS SUMMARY]`,
    `  facts: ${analysis.facts?.length || 0}`,
    `  claims: ${analysis.claims?.length || 0}`,
    `  evidence: ${analysis.evidence?.length || 0}`,
    `  rulings: ${analysis.rulings?.length || 0}`,
    `  challengedActs: ${analysis.challengedActs?.length || 0}`,
    `  legalIssues: ${cIssues + lIssues} (${cIssues} const, ${lIssues} leg)`,
    `  argumentAxes: ${analysis.argumentAxes?.length || 0}`,
  ].join('\n');
}

export function getCoverageSummary(matrix: CoverageMatrix): string {
  const cats = Object.entries(matrix.summary.byCategory || {})
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
  return [
    `[COVERAGE SUMMARY]`,
    `  total: ${matrix.summary.total}`,
    `  required: ${matrix.summary.required}`,
    `  pending: ${matrix.summary.pending}`,
    `  covered: ${matrix.summary.covered}`,
    `  weak: ${matrix.summary.weak}`,
    `  unsupported: ${matrix.summary.unsupported}`,
    `  categories: { ${cats} }`,
  ].join('\n');
}

export function getDocumentPlanSummary(plan: DraftingPlan): string {
  const lines = [
    `[DOCUMENT PLAN SUMMARY]`,
    `  documentType: ${plan.documentType}`,
    `  estimatedPages: ${plan.estimatedPages} (words: ~${plan.estimatedWords})`,
    `  sections: ${plan.sections.length}`,
  ];
  plan.sections.forEach((sec, idx) => {
    const covCount = sec.coverageItemIds?.length || 0;
    const ipCount = sec.issuePlans?.length || 0;
    const cpCount = sec.claimPlans?.length || 0;
    const fpCount = sec.factResponsePlans?.length || 0;
    lines.push(`    [${idx + 1}] "${sec.title}" -> cov: ${covCount}, issues: ${ipCount}, claims: ${cpCount}, facts: ${fpCount}`);
  });
  return lines.join('\n');
}
