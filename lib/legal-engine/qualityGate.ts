import { UniversalLegalDocument, ValidationIssue } from './types';
import { extractUnresolvedFieldMarkers, normalizeUnresolvedFieldMarkers } from './pendingFields';
import { isContestacionRevisionAmparoDirectoType } from './documentTemplates';
import { getMissingRequiredSectionIds } from './exportGuards';
import { evaluateCivilDemandQuality } from './civilDemandQuality';
import { evaluateCommercialEnforcementQuality } from './commercialEnforcement';
import { evaluateCivilMercantileResponseQuality } from './responseQuality';
import { evaluateCivilMercantileEvidenceArgumentQuality } from './evidenceArgumentQuality';
import { hasSeedMarkers, hasUnresolvedFactualDependencies } from './seedMarkers';
import { validateLegalIssueMatrix } from './legalIssueMatrix';

export interface QualityGateResult {
  passed: boolean;
  canMarkAsFinal: boolean;
  qualityScore: number; // 0 to 100
  criticalErrors: ValidationIssue[];
  warnings: ValidationIssue[];
  suggestions: string[];
  missingFields: string[];
  anonymizedFields: string[];
  metrics: {
    totalSections: number;
    emptySectionsCount: number;
    wordCount: number;
    characterCount: number;
    pendingFieldsCount: number;
    missingFieldsCount: number;
    anonymizedFieldsCount: number;
    unverifiedCitationsCount: number;
    manuallyEditedSectionsCount: number;
    sourceReferencesCount: number;
    referenceLength?: number;
    isProportional: boolean;
    incompatibleConceptsCount: number;
    repeatedSectionsCount: number;
    factsTotal: number;
    factsWithResponse: number;
    claimsTotal: number;
    claimsWithResponse: number;
    contradictoryPositionCount: number;
    duplicateFactResponseCount: number;
    unsupportedFactualClaimCount: number;
    unsupportedEvidenceCount: number;
    inappropriateSectionCount: number;
    voiceInconsistencyCount: number;
    proceduralMismatchCount: number;
  };
}

export interface DocumentQualityGateRule {
  id: string;
  appliesTo?: readonly string[] | ((doc: UniversalLegalDocument) => boolean);
  severity?: 'critical' | 'warning';
  evaluate: (doc: UniversalLegalDocument) => ValidationIssue[];
}

const documentQualityGateRules = new Map<string, DocumentQualityGateRule>();

/** Registra una regla adicional sin sustituir los gates universales. */
export function registerDocumentQualityGateRule(rule: DocumentQualityGateRule): () => void {
  if (!rule.id.trim()) throw new TypeError('Quality gate rule id is required');
  documentQualityGateRules.set(rule.id, rule);
  return () => {
    if (documentQualityGateRules.get(rule.id) === rule) documentQualityGateRules.delete(rule.id);
  };
}

function appliesQualityGateRule(rule: DocumentQualityGateRule, doc: UniversalLegalDocument): boolean {
  if (!rule.appliesTo) return true;
  return typeof rule.appliesTo === 'function'
    ? rule.appliesTo(doc)
    : rule.appliesTo.includes(doc.documentType);
}

const INCOMPATIBLE_BY_FAMILY: Record<string, string[]> = {
  contestacion: ['acto reclamado', 'concepto de violación', 'conceptos de violación', 'autoridad responsable', 'sentencia recurrida', 'agravio', 'agravios', 'recurso', 'amparo', 'revocar la resolución', 'revocar o dejar insubsistente', 'declaratoria de inconstitucionalidad', 'inconstitucionalidad', 'restituir en el goce de derechos fundamentales', 'protección de la justicia federal'],
  demanda: ['acto reclamado', 'concepto de violación', 'conceptos de violación', 'agravio', 'agravios', 'sentencia recurrida', 'revocar o dejar insubsistente'],
};

function normalizedText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

export function runQualityGateCheck(
  doc: UniversalLegalDocument,
  options: { referenceLength?: number } = {}
): QualityGateResult {
  const criticalErrors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const suggestions: string[] = [];

  let wordCount = 0;
  let characterCount = 0;
  let emptySectionsCount = 0;
  let pendingFieldsCount = 0;
  let missingFieldsCount = 0;
  let anonymizedFieldsCount = 0;
  let unverifiedCitationsCount = 0;
  let manuallyEditedSectionsCount = 0;
  let sourceReferencesCount = 0;
  let incompatibleConceptsCount = 0;
  let repeatedSectionsCount = 0;
  let contradictoryPositionCount = 0;
  let duplicateFactResponseCount = 0;
  let unsupportedFactualClaimCount = 0;
  let unsupportedEvidenceCount = 0;
  let inappropriateSectionCount = 0;
  let voiceInconsistencyCount = 0;
  let proceduralMismatchCount = 0;
  let matrixNeedsResearch = false;

  const totalSections = doc.sections.length;
  const missingRequiredSections = getMissingRequiredSectionIds(doc);
  for (const sectionId of missingRequiredSections) {
    criticalErrors.push({
      checkId: 'MISSING_REQUIRED_SECTION',
      sectionId,
      message: `Falta la sección canónica requerida "${sectionId}" para ${doc.documentType}.`,
    });
  }

  doc.sections.forEach((sec) => {
    if (sec.isManuallyEdited) manuallyEditedSectionsCount++;

    const secText = sec.content.map((b) => {
      if (b.sources && b.sources.length > 0) sourceReferencesCount += b.sources.length;
      return b.text;
    }).join('\n\n').trim();

    if (sec.validationErrors?.length) {
      criticalErrors.push({
        checkId: `invalid_section_${sec.id}`,
        sectionId: sec.id,
        message: `La sección "${sec.title}" contiene errores de validación: ${sec.validationErrors.join('; ')}`,
      });
    }

    // Chequeo incondicional de bloques AI_REQUIRED vacíos
    for (const block of sec.content || []) {
      if (block.generationRequirement === 'AI_REQUIRED' && !block.text.trim()) {
        criticalErrors.push({
          checkId: `empty_ai_required_block_${block.id}`,
          sectionId: sec.id,
          message: `El bloque "${block.id}" de la sección "${sec.title}" requiere generación por IA (AI_REQUIRED) y está vacío.`
        });
      }
    }

    // Chequeo incondicional de truncamiento por límite de tokens
    if (sec.generation?.isTruncated || sec.generation?.finishReason === 'length' || (sec.content || []).some(b => b.generationStatus === 'truncated')) {
      criticalErrors.push({
        checkId: `truncated_generation_${sec.id}`,
        sectionId: sec.id,
        message: `La sección "${sec.title}" fue truncada por límite de tokens (finish_reason: length) y se encuentra incompleta.`
      });
    }

    // Chequeo incondicional de dependencias fácticas no resueltas ([DATO PENDIENTE DE EXPEDIENTE:...])
    if (hasUnresolvedFactualDependencies(secText) || (sec.content || []).some(b => hasUnresolvedFactualDependencies(b.text))) {
      criticalErrors.push({
        checkId: `unresolved_factual_dependency_${sec.id}`,
        sectionId: sec.id,
        message: `La sección "${sec.title}" contiene dependencias fácticas no resueltas ([DATO PENDIENTE DE EXPEDIENTE: ...]) y no puede considerarse completa.`
      });
    }

    // Chequeo incondicional de marcadores seed residuales
    if (hasSeedMarkers(secText) || (sec.content || []).some(b => hasSeedMarkers(b.text))) {
      criticalErrors.push({
        checkId: `seed_marker_present_${sec.id}`,
        sectionId: sec.id,
        message: `La sección "${sec.title}" contiene marcadores de semilla residuales ([Desarrollar por la IA...]).`
      });
    }

    if (!secText) {
      emptySectionsCount++;
      criticalErrors.push({
        checkId: `empty_section_${sec.id}`,
        sectionId: sec.id,
        message: `La sección "${sec.title}" está vacía sin contenido redactado.`
      });
    } else {
      characterCount += secText.length;
      wordCount += secText.split(/\s+/).filter(Boolean).length;

      // Check unflagged pending markers (e.g. raw [NOMBRE] without DATO PENDIENTE)
      const normalizedSecText = normalizeUnresolvedFieldMarkers(secText);
      const unresolvedMarkers = extractUnresolvedFieldMarkers(normalizedSecText);
      const pendingMarkers = unresolvedMarkers.filter((marker) => marker.kind === 'PENDING');
      const anonymizedMarkers = unresolvedMarkers.filter((marker) => marker.kind === 'ANONYMIZED');
      pendingFieldsCount += pendingMarkers.length + anonymizedMarkers.length;
      anonymizedFieldsCount += anonymizedMarkers.length;

      const rawBracketMatches = normalizedSecText.match(/\[(?!DATO PENDIENTE|DATO ANONIMIZADO|NO VERIFICADO|DOCUMENTO GENERADO)[A-ZÁÉÍÓÚÑ_\s]{3,}\]/g);
      if (rawBracketMatches) {
        pendingFieldsCount += rawBracketMatches.length;
        warnings.push({
          checkId: `unflagged_pending_${sec.id}`,
          sectionId: sec.id,
          message: `La sección "${sec.title}" contiene marcadore(s) pendiente(s) no estandarizado(s): ${rawBracketMatches.join(', ')}`
        });
      }

      // Check DATO PENDIENTE count
      const pendingMatches = pendingMarkers.map((marker) => marker.marker);
      if (pendingMatches.length > 0) {
        warnings.push({
          checkId: `pending_data_${sec.id}`,
          sectionId: sec.id,
          message: `La sección "${sec.title}" contiene ${pendingMatches.length} campo(s) pendiente(s) o no resuelto(s).`
        });
      }

      if (anonymizedMarkers.length > 0) {
        warnings.push({
          checkId: `anonymized_data_${sec.id}`,
          sectionId: sec.id,
          message: `La sección "${sec.title}" conserva ${anonymizedMarkers.length} campo(s) anonimizados de la fuente.`,
        });
      }

      // Check UNVERIFIED citations
      const unverifiedMatches = secText.match(/\[NO VERIFICADO:[^\]]+\]/g);
      if (unverifiedMatches) {
        unverifiedCitationsCount += unverifiedMatches.length;
        warnings.push({
          checkId: `unverified_citation_${sec.id}`,
          sectionId: sec.id,
          message: `La sección "${sec.title}" contiene ${unverifiedMatches.length} cita(s) o jurisprudencia(s) no verificada(s).`
        });
      }

      // Check repeated paragraphs inside section
      const paragraphs = secText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      const uniqueParagraphs = new Set(paragraphs);
      if (paragraphs.length > uniqueParagraphs.size) {
        warnings.push({
          checkId: `duplicate_paragraphs_${sec.id}`,
          sectionId: sec.id,
          message: `La sección "${sec.title}" contiene párrafos duplicados o repetidos.`
        });
      }

      if (hasSeedMarkers(secText) || /\[Completar por la IA\]|\[Desarrollar por la IA\]|\[SECCIÓN GENERADA:/i.test(secText)) {
        criticalErrors.push({
          checkId: `empty_generated_instruction_${sec.id}`,
          sectionId: sec.id,
          message: `La sección "${sec.title}" conserva una instrucción interna o marcador de generación por IA pendiente de desarrollo.`
        });
      }

      if (/(?:nota\s+(?:de\s+elaboraci[óo]n|editorial|interna)|a\s+suprimir\s+antes\s+de\s+la\s+presentaci[óo]n)/i.test(secText)) {
        criticalErrors.push({
          checkId: `internal_drafting_note_${sec.id}`,
          sectionId: sec.id,
          message: `La sección "${sec.title}" contiene notas internas de elaboración que deben eliminarse antes de la presentación definitiva.`
        });
      }
    }
  });

  // Chequeo incondicional de cobertura requerida (FASE 5)
  if (doc.coverageMatrix?.items) {
    const uncoveredRequired = doc.coverageMatrix.items.filter((item) => item.required && item.status !== 'covered');
    if (uncoveredRequired.length > 0) {
      criticalErrors.push({
        checkId: 'UNRESOLVED_COVERAGE_REQUIREMENT',
        message: `El documento contiene ${uncoveredRequired.length} requerimiento(s) obligatorio(s) de cobertura no resuelto(s): ${uncoveredRequired.map((i) => `"${i.title || i.description || i.id}" (${i.status})`).join(', ')}.`,
      });
    }

    for (const item of doc.coverageMatrix.items) {
      if (item.category === 'CONFLICT_REVIEW' && item.blocking && item.status !== 'covered') {
        criticalErrors.push({
          checkId: 'BLOCKING_COVERAGE_CONFLICT',
          message: `El conflicto de cobertura "${item.id}" permanece abierto y requiere revisión.`,
        });
      }
      if (item.category === 'MISSING_CLIENT_POSITION' && item.blocking && item.status !== 'covered') {
        criticalErrors.push({
          checkId: 'MISSING_CLIENT_POSITION',
          message: `La cobertura "${item.id}" requiere una postura explícita del cliente.`,
        });
      }
      if (item.category === 'PETITION_SUPPORT' && item.required && item.status !== 'covered') {
        criticalErrors.push({
          checkId: 'UNRESOLVED_PETITION_SUPPORT',
          message: `El apoyo explícito del petitorio "${item.id}" no está resuelto.`,
        });
      }
      if (item.category === 'EVIDENCE_OFFER' && item.required && item.status !== 'covered') {
        criticalErrors.push({
          checkId: 'UNRESOLVED_EVIDENCE_OFFER',
          message: `La oferta de prueba "${item.id}" no tiene tratamiento resuelto.`,
        });
      }
    }
  }

  // FASE 3: la matriz debe conservar una topología auditable. La investigación
  // pendiente mantiene la salida en revisión, pero no convierte por sí sola
  // el documento en un fallo estructural ni detiene su planificación.
  if (doc.legalIssueMatrix) {
    if (doc.coverageMatrix) {
      const matrixValidation = validateLegalIssueMatrix(doc.legalIssueMatrix, doc.coverageMatrix, doc.caseAnalysis);
      for (const message of matrixValidation.errors) {
        criticalErrors.push({ checkId: 'LEGAL_ISSUE_MATRIX_STRUCTURAL', message });
      }
    }

    for (const issue of doc.legalIssueMatrix.issues) {
      if (issue.status === 'BLOCKED_BY_CONFLICT' && issue.required) {
        criticalErrors.push({
          checkId: 'LEGAL_ISSUE_CONFLICT_BLOCKER',
          message: `La LegalIssue requerida "${issue.id}" permanece bloqueada por conflicto y requiere revisión.`,
        });
      }
      if (issue.status === 'NEEDS_CLIENT_POSITION' && issue.required) {
        criticalErrors.push({
          checkId: 'LEGAL_ISSUE_CLIENT_POSITION_BLOCKER',
          message: `La LegalIssue requerida "${issue.id}" requiere una postura explícita del cliente.`,
        });
      }
      if (issue.status === 'NEEDS_RESEARCH' || issue.researchStatus !== 'NOT_REQUIRED') {
        matrixNeedsResearch = true;
        warnings.push({
          checkId: 'LEGAL_RESEARCH_REQUIRED',
          message: `La LegalIssue "${issue.id}" requiere investigación o verificación de fuente antes de una respuesta jurídica final.`,
        });
      }
    }
  }

  // Chequeo de evaluación semántica global (FASE 5)
  const requiredCoverageResolved = !doc.coverageMatrix?.items?.some((item) => item.required && item.status !== 'covered');
  const semanticFailureOnlyFromNonCoverage = Boolean(
    doc.semanticEvaluation?.blockEvaluations?.length
    && doc.semanticEvaluation.blockEvaluations.every((evaluation) =>
      evaluation.verdict === 'PASS'
      || (evaluation.verdict === 'FAIL' && evaluation.hardFailReasons.length > 0 && evaluation.hardFailReasons.every((reason) => /NOT_COVERAGE/.test(reason)))
    )
  );
  if (doc.semanticEvaluation?.overallVerdict === 'FAIL' && !(requiredCoverageResolved && semanticFailureOnlyFromNonCoverage)) {
    criticalErrors.push({
      checkId: 'SEMANTIC_EVALUATION_FAILED',
      message: `El documento reprobó la evaluación semántica forense: ${doc.semanticEvaluation.deficiencies.slice(0, 3).join('; ')}`,
    });
  }

  const missingFields = Array.from(new Set([
    ...(doc.missingFields || []),
    ...(doc.caseContext?.missingFields || []),
    ...(((doc.generationMetadata as unknown as { preflight?: { missingFields?: Array<{ label?: string }> } })?.preflight?.missingFields || [])
      .map((field: { label?: string }) => field?.label || '')
      .filter(Boolean)),
  ].map((field) => field.trim()).filter(Boolean)));
  const anonymizedFields = Array.from(new Set([
    ...(doc.anonymizedFields || []),
    ...(doc.caseContext?.anonymizedFields || []),
  ].map((field) => field.trim()).filter(Boolean)));
  missingFieldsCount = missingFields.length;
  anonymizedFieldsCount = Math.max(anonymizedFieldsCount, anonymizedFields.length);
  pendingFieldsCount += missingFieldsCount + anonymizedFields.length;
  if (missingFields.length > 0) {
    warnings.push({ checkId: 'missing_fields', message: `Faltan ${missingFields.length} campo(s) por integrar: ${missingFields.join(', ')}.` });
  }
  if (anonymizedFields.length > 0) {
    warnings.push({ checkId: 'anonymized_fields', message: `La fuente contiene ${anonymizedFields.length} campo(s) anonimizados que requieren confirmación profesional.` });
  }

  const preflight = (doc.generationMetadata as unknown as {
    preflight?: { status?: string; missingFields?: unknown[] };
  } | undefined)?.preflight;
  if (preflight && typeof preflight === 'object' && preflight !== null) {
    const preflightRecord = preflight as { status?: string; missingFields?: unknown[] };
    if (preflightRecord.status && preflightRecord.status !== 'READY') {
      criticalErrors.push({
        checkId: 'DOCUMENT_PREFLIGHT_NOT_READY',
        message: `El preflight documental está en estado ${preflightRecord.status}; no puede pasar a FINAL.`,
      });
    }
    if (Array.isArray(preflightRecord.missingFields) && preflightRecord.missingFields.length > 0
      && !criticalErrors.some((issue) => issue.checkId === 'DOCUMENT_PREFLIGHT_NOT_READY')) {
      criticalErrors.push({
        checkId: 'DOCUMENT_PREFLIGHT_NOT_READY',
        message: 'El preflight documental conserva campos requeridos sin confirmar; no puede pasar a FINAL.',
      });
    }
  }

  const allText = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');
  const sourceText = (doc.sourceDocuments || []).flatMap((source) => source.pages?.map((page) => page.text) || [source.extractedText || source.content || '']).join('\n');
  const family = normalizedText(`${doc.documentType} ${doc.documentTypeLabel}`);
  const isNewWriting = doc.flow === 'NEW_WRITING';
  const isPostSentenceAmparo = isContestacionRevisionAmparoDirectoType(doc.documentType, doc.documentTypeLabel);
  const isDemandContestacion = family.includes('contestacion') && !isPostSentenceAmparo;
  const isAmparoDoc = Boolean(
    (doc.matter || '').toLowerCase().includes('amparo') ||
    (doc.matter || '').toLowerCase().includes('constitucional') ||
    family.includes('amparo')
  );
  const forbidden = isDemandContestacion
    ? INCOMPATIBLE_BY_FAMILY.contestacion
    : (family === 'demanda' || family.includes('demanda ')) && !isAmparoDoc ? INCOMPATIBLE_BY_FAMILY.demanda : [];
  for (const phrase of forbidden) {
    if (normalizedText(allText).includes(normalizedText(phrase)) && !normalizedText(sourceText).includes(normalizedText(phrase))) {
      incompatibleConceptsCount++;
      proceduralMismatchCount++;
      criticalErrors.push({ checkId: 'PROCEDURAL_MISMATCH', message: `El escrito objetivo contiene el concepto incompatible "${phrase}" sin evidencia equivalente en las fuentes.` });
    }
  }

  if (isPostSentenceAmparo) {
    const incompatiblePostSentence = [
      /\bdemanda\s+de\s+amparo\s+(?:directo|indirecto)\b/i,
      /^\s*conceptos?\s+de\s+violaci[oó]n\s*$/im,
      /^\s*suspensi[oó]n(?:\s+del\s+acto\s+reclamado)?\s*$/im,
    ];
    if (incompatiblePostSentence.some((pattern) => pattern.test(allText))) {
      incompatibleConceptsCount++;
      proceduralMismatchCount++;
      criticalErrors.push({
        checkId: 'POST_SENTENCE_CROSS_TEMPLATE',
        message: 'La estrategia post-sentencia contiene estructura o contenido propio de una demanda de amparo; no puede pasar el quality gate.',
      });
    }
  }

  // Comparación entre secciones: detecta copia sustancial, no solo títulos iguales.
  const sectionTokens = doc.sections.map((section) => new Set(normalizedText(section.content.map((block) => block.text).join(' ')).split(/\W+/).filter((token) => token.length > 4)));
  for (let i = 0; i < sectionTokens.length; i++) {
    for (let j = i + 1; j < sectionTokens.length; j++) {
      const a = sectionTokens[i];
      const b = sectionTokens[j];
      if (a.size < 12 || b.size < 12) continue;
      const intersection = [...a].filter((token) => b.has(token)).length;
      const union = new Set([...a, ...b]).size;
      if (intersection / Math.max(1, union) >= 0.82) {
        repeatedSectionsCount++;
        warnings.push({ checkId: 'repeated_sections', sectionId: doc.sections[j].id, message: `Las secciones "${doc.sections[i].title}" y "${doc.sections[j].title}" tienen desarrollo casi idéntico.` });
      }
    }
  }

  const facts = doc.caseAnalysis?.facts || [];
  const factsWithResponse = isNewWriting || !isDemandContestacion ? facts.length : facts.filter((fact) => {
    const section = doc.sections.find((candidate) => /hechos/.test(normalizedText(candidate.title)));
    const text = section?.content.map((block) => block.text).join('\n') || '';
    const marker = `AL HECHO ${fact.number}`;
    const start = text.indexOf(marker);
    const next = start >= 0 ? text.slice(start + marker.length).search(/\n\s*AL HECHO\s+/i) : -1;
    const block = start >= 0 ? text.slice(start, next >= 0 ? start + marker.length + next : undefined) : '';
    return start >= 0 && /POSTURA PROCESAL/i.test(block);
  }).length;
  const claims = doc.caseAnalysis?.claimResponses || (doc.caseAnalysis?.claims || []).map((text, index) => ({ id: `claim-${index}`, number: String(index + 1), text, position: 'UNDETERMINED' as const }));
  const claimsSection = doc.sections.find((candidate) => /prestacion|pretension/.test(normalizedText(candidate.title)));
  const claimsText = claimsSection?.content.map((block) => block.text).join('\n') || '';
  const normalizedClaimsText = normalizedText(claimsText);
  const claimsWithResponse = claims.filter((claim) => {
    const numberedMarker = `prestacion ${normalizedText(claim.number)}`;
    const sourceClaim = normalizedText(claim.text);
    const sourceMarker = sourceClaim.slice(0, Math.min(80, sourceClaim.length));
    const markerIndex = normalizedClaimsText.indexOf(numberedMarker);
    const sourceIndex = sourceMarker.length >= 12 ? normalizedClaimsText.indexOf(sourceMarker) : -1;
    if (markerIndex < 0 && sourceIndex < 0) return false;
    const blockStart = markerIndex >= 0 ? markerIndex : sourceIndex;
    const claimBlock = claimsText.slice(blockStart, blockStart + 1600);
    return /POSTURA:|RESPUESTA:|se\s+(?:niega|admite|opone)|improcedente|absoluci[oó]n|no\s+procede|rechaza/i.test(claimBlock);
  }).length;
  if (!isNewWriting && isDemandContestacion) {
    if (facts.length > factsWithResponse) {
      criticalErrors.push({ checkId: 'facts_without_response', message: `Hechos sin bloque de contestación identificable: ${facts.length - factsWithResponse} de ${facts.length}.` });
    }
    if (claims.length > claimsWithResponse) {
      criticalErrors.push({ checkId: 'claims_without_response', message: `Prestaciones sin respuesta identificable: ${claims.length - claimsWithResponse} de ${claims.length}.` });
    }
  }

  const factsSectionText = doc.sections.find((candidate) => /hechos/.test(normalizedText(candidate.title)))?.content.map((block) => block.text).join('\n') || '';
  for (const fact of isDemandContestacion ? facts : []) {
    const marker = `AL HECHO ${fact.number}`;
    const first = factsSectionText.indexOf(marker);
    const second = first >= 0 ? factsSectionText.indexOf(marker, first + marker.length) : -1;
    if (second >= 0) {
      duplicateFactResponseCount++;
      criticalErrors.push({ checkId: 'DUPLICATE_FACT_RESPONSE', message: `El hecho ${fact.number} tiene más de una respuesta en la salida.` });
    }
    const canonical = fact.lawyerPosition || (fact.position === 'IGNORE_PERSONAL_KNOWLEDGE' ? 'NOT_KNOWN' : fact.position === 'REQUIRE_LAWYER_INPUT' || fact.position === 'UNDETERMINED' ? 'UNDEFINED' : fact.position);
    const start = first >= 0 ? first : -1;
    const next = start >= 0 ? factsSectionText.slice(start + marker.length).search(/\n\s*AL HECHO\s+/i) : -1;
    const block = start >= 0 ? factsSectionText.slice(start, next >= 0 ? start + marker.length + next : undefined) : '';
    if (canonical === 'UNDEFINED' && /\b(?:se admite|se niega|se rechaza|es falso|falsa|improcedente|no procede)\b/i.test(block)) {
      contradictoryPositionCount++;
      criticalErrors.push({ checkId: 'CONTRADICTORY_POSITION', message: `El hecho ${fact.number} quedó sin postura, pero contiene una conclusión categórica.` });
    }
  }

  const evidenceSection = doc.sections.find((candidate) => candidate.type === 'evidence' || /prueba|evidencia/.test(normalizedText(candidate.title)));
  const confirmedEvidence = (doc.caseAnalysis?.evidence || []).filter((item) => item.confirmed === true);
  const evidenceText = evidenceSection?.content.map((block) => block.text).join('\n') || '';
  if (confirmedEvidence.length === 0 && /\b(?:documental|instrumental|presuncional|testimonial|pericial|confesional)\b/i.test(evidenceText) && !/\[REQUIERE DEFINIR PRUEBAS A OFRECER\]/i.test(evidenceText)) {
    unsupportedEvidenceCount++;
    criticalErrors.push({ checkId: 'UNSUPPORTED_EVIDENCE', sectionId: evidenceSection?.id, message: 'La sección de pruebas ofrece medios no confirmados por el abogado o las fuentes.' });
  }

  // Control mínimo y auditable de hechos concretos: una fecha que aparece en
  // la salida debe existir en el corpus autorizado o en la entrada del abogado.
  const authorizedFacts = normalizedText(`${sourceText} ${doc.intake?.request || ''} ${facts.map((fact) => fact.sourceFact || fact.text).join(' ')}`);
  const generatedDates = allText.match(/\b(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4})\b/gi) || [];
  const unsupportedDate = generatedDates.find((date) => !authorizedFacts.includes(normalizedText(date)));
  if (unsupportedDate) {
    unsupportedFactualClaimCount++;
    criticalErrors.push({ checkId: 'UNSUPPORTED_FACTUAL_CLAIM', message: `La salida introduce la fecha no respaldada "${unsupportedDate}".` });
  }

  const hasAlegatos = doc.sections.some((section) => /alegato/i.test(section.title));
  if (hasAlegatos && isDemandContestacion && !allText.match(/\[REQUIERE INSTRUCCI[ÓO]N DEL ABOGADO:.*alegat/i)) {
    // Una sección alegatos sólo es válida si la instrucción o plantilla la pidió.
    inappropriateSectionCount++;
    warnings.push({ checkId: 'INAPPROPRIATE_SECTION', message: 'ALEGATOS está presente sin una instrucción explícita identificable.' });
  }

  const firstPerson = (allText.match(/\b(?:comparezco|solicito|manifiesto|promuevo|tengo por)\b/gi) || []).length;
  const thirdPerson = (allText.match(/\b(?:comparece|solicita|manifiesta|promueve|tiene por)\b/gi) || []).length;
  if (firstPerson >= 2 && thirdPerson >= 2 && Math.min(firstPerson, thirdPerson) / Math.max(firstPerson, thirdPerson) > 0.3) {
    voiceInconsistencyCount++;
    warnings.push({ checkId: 'VOICE_INCONSISTENCY', message: 'La voz narrativa mezcla primera y tercera persona de forma relevante.' });
  }

  // Check document length quality gate
  if (characterCount < 300) {
    criticalErrors.push({
      checkId: 'doc_too_short',
      message: `El escrito es demasiado corto (${characterCount} caracteres, ${wordCount} palabras). No cumple con el estándar de extensión jurídica exhaustiva.`
    });
  }

  // Check Proportionality Quality Gate against reference document
  let isProportional = true;
  const refLength = options.referenceLength || 0;
  if (refLength > 15000 && characterCount < 4000) {
    isProportional = false;
    criticalErrors.push({
      checkId: 'UNDERDEVELOPED',
      message: `[UNDERDEVELOPED] El documento generado (${characterCount} chars, ${wordCount} palabras) es desproporcionado respecto a la extensión del machote de referencia (${refLength} chars, 21 págs). Se requiere ejecución con LLM de alta densidad argumentativa.`
    });
  }

  // Check petition section requirement
  const hasPetition = doc.sections.some(s => s.type === 'petition' && s.content.some(b => b.text.trim()));
  if (!hasPetition) {
    criticalErrors.push({
      checkId: 'missing_petition',
      message: 'El escrito no contiene la sección obligatoria de Puntos Petitorios.'
    });
  }

  for (const rule of documentQualityGateRules.values()) {
    if (!appliesQualityGateRule(rule, doc)) continue;
    const issues = rule.evaluate(doc) || [];
    for (const issue of issues) {
      if (rule.severity === 'warning') warnings.push(issue);
      else criticalErrors.push(issue);
    }
  }

  for (const issue of evaluateCivilDemandQuality(doc)) {
    criticalErrors.push(issue);
  }
  for (const issue of evaluateCommercialEnforcementQuality(doc)) {
    criticalErrors.push(issue);
  }
  for (const issue of evaluateCivilMercantileResponseQuality(doc)) {
    criticalErrors.push(issue);
  }
  for (const issue of evaluateCivilMercantileEvidenceArgumentQuality(doc)) {
    criticalErrors.push(issue);
  }

  // Calculate Quality Score
  let qualityScore = 100;
  qualityScore -= criticalErrors.length * 25;
  qualityScore -= emptySectionsCount * 15;
  qualityScore -= pendingFieldsCount * 5;
  qualityScore -= unverifiedCitationsCount * 5;
  if (characterCount < 1000) qualityScore -= 10;
  if (!isProportional) qualityScore -= 30;
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  const passed = criticalErrors.length === 0;
  const canMarkAsFinal = passed && !matrixNeedsResearch && pendingFieldsCount === 0 && emptySectionsCount === 0 && isProportional;

  if (!canMarkAsFinal) {
    suggestions.push('Resuelva los campos pendientes y confirme los datos anonimizados antes de marcar el documento como FINALIZADO.');
  }
  if (unverifiedCitationsCount > 0) {
    suggestions.push('Coteje las citas con la Gaceta del Semanario Judicial de la Federación.');
  }

  return {
    passed,
    canMarkAsFinal,
    qualityScore,
    criticalErrors,
    warnings,
    suggestions,
    missingFields,
    anonymizedFields,
    metrics: {
      totalSections,
      emptySectionsCount,
      wordCount,
      characterCount,
      pendingFieldsCount,
      missingFieldsCount,
      anonymizedFieldsCount,
      unverifiedCitationsCount,
      manuallyEditedSectionsCount,
      sourceReferencesCount,
      referenceLength: refLength,
      isProportional,
      incompatibleConceptsCount,
      repeatedSectionsCount,
      factsTotal: facts.length,
      factsWithResponse,
      claimsTotal: claims.length,
      claimsWithResponse,
      contradictoryPositionCount,
      duplicateFactResponseCount,
      unsupportedFactualClaimCount,
      unsupportedEvidenceCount,
      inappropriateSectionCount,
      voiceInconsistencyCount,
      proceduralMismatchCount,
    }
  };
}
