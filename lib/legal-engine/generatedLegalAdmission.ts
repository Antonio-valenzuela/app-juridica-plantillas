import type { CaseAnalysis } from './caseAnalysis';
import type { UniversalLegalDocument } from './types';
import { extractUnresolvedFieldMarkers, normalizeUnresolvedFieldMarkers, type UnresolvedFieldMarkerCause } from './pendingFields';

export type LegalAdmissionReason = 'UNCONFIRMED_EVIDENCE' | 'ABSOLUTE_EVIDENCE_VALUATION'
  | 'UNVERIFIED_LEGAL_ASSERTION' | 'UNSUPPORTED_PROOF_RULE' | 'UNSUPPORTED_PETITION'
  /** P0-B: el bloque contiene ayuda del asistente de interfaz, no derecho. */
  | 'UI_ASSISTANT_CONTENT_LEAK';

/**
 * P0-B — señales de contenido del asistente de interfaz de la app.
 *
 * Un bloque jurídico nunca debe contener ayuda de pantalla. Si lo contiene, el
 * material salió del chat de UI y no de una fuente jurídica: se rechaza con
 * evidencia, se conserva un pendiente explícito y se registra la causa.
 */
export const UI_ASSISTANT_LEAK_PATTERNS: readonly RegExp[] = Object.freeze([
  /resumen\s+de\s+la\s+pantalla/i,
  /panel\s+principal/i,
  /jur[íi]dico\s+radar/i,
  /te\s+encuentras\s+en/i,
  /\bdashboard\b/i,
  /inteligencia\s+regulatoria/i,
  /generaci[óo]n\s+de\s+machotes\s+y\s+plantillas/i,
  /monitoreo\s+legal/i,
  /centro\s+jur[íi]dico\s+e\s+ia\s+sandbox/i,
  /puedes\s+realizar\s+consultas\s+sobre\s+la\s+pantalla/i,
]);

/** Devuelve las señales de UI encontradas, como evidencia del rechazo. */
export function detectUiAssistantLeak(text: string): string[] {
  const haystack = String(text || '');
  return UI_ASSISTANT_LEAK_PATTERNS.filter(pattern => pattern.test(haystack)).map(pattern => pattern.source);
}

/**
 * Naturaleza jurídica de la proposición. La admission se decide sobre esta
 * clasificación, no sobre la coincidencia literal con una fuente.
 * Equivalente operativo de la taxonomía "Distingue siempre" de la Guía
 * Operativa (p. 3) y de la estructura HECHO -> NORMA -> RAZONAMIENTO ->
 * CONCLUSIÓN -> PETICIÓN (p. 138-139) y ACTO -> ERROR -> AFECTACIÓN ->
 * NORMA O PRINCIPIO -> CONSECUENCIA (p. 155).
 */
export type LegalPropositionKind =
  | 'FACTUAL_SOURCE'
  | 'CLIENT_POSITION'
  | 'INFERENCE'
  | 'LEGAL_ARGUMENT'
  | 'VERIFIED_LEGAL_PROPOSITION'
  | 'UNVERIFIED_LEGAL_PROPOSITION'
  | 'PROCEDURAL_REQUEST'
  | 'EVIDENCE_OFFER'
  | 'STRUCTURAL_REASONING';

export interface AdmittedLegalProposition {
  kind: LegalPropositionKind;
  text: string;
  admitted: boolean;
  reasons: LegalAdmissionReason[];
}

export interface GeneratedLegalAdmissionResult {
  /** Estricto: ninguna proposición requirió remediación. */
  accepted: boolean;
  reasons: LegalAdmissionReason[];
  /** Texto remedido: conserva lo admisible y neutraliza sólo lo inseguro. */
  text: string;
  /** Alias histórico de `text`, antes usado como reemplazo total. */
  pendingText: string;
  /** Palabras efectivamente retiradas, no el total de la sección. */
  rejectedWords: number;
  proposals: AdmittedLegalProposition[];
  admittedCount: number;
  neutralizedCount: number;
  fullyNeutralized: boolean;
  pendingMarkerCauses: UnresolvedFieldMarkerCause[];
}

function normalized(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('es').replace(/\s+/g, ' ').replace(/[.;:]+$/g, '').trim();
}

function wordCount(value: string): number {
  return (value.match(/[\p{L}\p{N}]+/gu) || []).length;
}

/** Exact confirmed descriptions, not guessed evidence types or documents. */
export function confirmedEvidenceDescriptions(analysis?: CaseAnalysis, instruction?: string): string[] {
  const descriptions = (analysis?.evidence || []).filter(item => item.confirmed === true)
    .map(item => item.description).filter(Boolean);
  const rich = analysis?.richCaseAnalysis;
  for (const offer of rich?.evidenceOffers || []) {
    if (offer.status !== 'CLIENT_CONFIRMED') continue;
    const mention = rich?.evidenceMentions.find(item => item.id === offer.evidenceMentionId);
    if (mention?.description && mention.provenance.length && offer.provenance.length) descriptions.push(mention.description);
  }
  // This explicit labelled client instruction is also used by the captured fixture.
  // Other mentions in an instruction, allegations or provider text are NOT confirmation.
  for (const match of (instruction || '').matchAll(/(?:^|[\n.])\s*Prueba ofrecida por (?:el )?cliente:\s*([^\n.]+)[.]?/gi)) {
    descriptions.push(match[1].trim());
  }
  return [...new Set(descriptions)];
}

/**
 * Only the confirmed description and a neutral offering prefix are licensed.
 * Free-form paraphrase needs separate source checking, not token overlap.
 */
function refersToConfirmedDescription(proposition: string, descriptions: string[]): boolean {
  // A known document name does not authorize new signers, dates or witnesses.
  const candidate = normalized(proposition).replace(/^se ofrece (?:el |la )?/, '');
  return descriptions.some(description => candidate === normalized(description).replace(/^(?:el |la )/, ''));
}

const SEGMENT_BOUNDARY = /(?<=[.!?;])\s+|\n+/g;

interface Segment { text: string; delimiter: string; }

function segmentPropositions(text: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(SEGMENT_BOUNDARY)) {
    const index = match.index ?? 0;
    segments.push({ text: text.slice(cursor, index), delimiter: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), delimiter: '' });
  return segments;
}

const EVIDENCE_SECTION_LABEL = /^(?:PRUEBAS?|MEDIOS\s+DE\s+PRUEBA|OBJETO\s+PROBATORIO|FUNDAMENTO\s+Y\s+VALORACI[ÓO]N|OBJETO|FUNDAMENTO|PRUEBA)\s*:?\s*$/i;
const ORDINAL_LABEL = /^(?:[IVXLCDM]+|\d+|[A-ZÁÉÍÓÚÑ]{4,14})[.)]\s*$/;
const PENDING_MARKER = /^\[(?:PENDIENTE|REQUIERE|DATO\s+PENDIENTE)[^\]]*\]$/i;

const OFFER_VERB = /\b(?:se\s+ofrece|ofrecemos|ofrezco|ofrece\s+formalmente|se\s+hace\s+formal\s+reserva|se\s+reserva|se\s+exhibe|se\s+acompa[ñn]a|se\s+anexa|se\s+agrega|documental\s+consistente|consistente\s+en)\b/i;
/** Medios cuya sola mención delata una prueba no confirmada si no hay respaldo. */
const FABRICATION_SENSITIVE_MEDIUM = /\b(?:testigos?|testimonial(?:es)?|peritos?|pericial(?:es)?|inspecci[óo]n\s+judicial|confesionales?|experto)\b/i;
const SPECIFIC_EVIDENCE_ITEM = /\b(?:la\s+documental|el\s+documento\s+identificado|documentaci[óo]n\s+laboral|la\s+prueba\s+documental|la\s+prueba\s+testimonial|la\s+prueba\s+pericial|el\s+registro\s+de\s+asistencia)\b/i;

const CLIENT_POSITION = /\b(?:la\s+parte\s+apelante\s+sostiene|la\s+parte\s+sostiene|el\s+despacho\s+sostiene|se\s+sostiene\s+que|sostiene\s+que|arguye\s+que|manifiesta\s+que|considera\s+que|pretende\s+que|afirma\s+que)\b/i;
const FACTUAL_SOURCE = /\b(?:de\s+las\s+constancias|en\s+autos\s+consta|consta\s+en|se\s+advierte|se\s+desprende\s+de|obra\s+en)\b/i;
const INFERENCE = /\b(?:se\s+infiere|se\s+deduce|puede\s+concluirse|se\s+sigue\s+que|de\s+ello\s+se)\b/i;
const LEGAL_ARGUMENT = /\b(?:incongruencia|ilegalidad|excesiv[oa]|abuso\s+de|arbitrari[oa]|vulneraci[óo]n|falta\s+de\s+exhaustividad|motivaci[óo]n\s+desatendida|rebasa|excede|omite\s+pronunciarse|omisi[óo]n)\b/i;

const UNVERIFIED_MARKER_CLAIM = /\[NO\s+VERIFICADO[^\]]*\][^.!?\n]{0,140}?\b(?:establece|dispone|ordena|exige|prev[eé]|determina|conforme|aplicable|debe)\b/i;
const UNVERIFIED_MARKER_ONLY = /\[NO\s+VERIFICADO[^\]]*\]/i;
const ARTICLE_REFERENCE = /\bart[íi]culos?\s+\d+[\w.\-]*/i;
const NORM_REFERENCE = /\b(?:c[óo]digo|ley|legislaci[óo]n|constituci[óo]n|reglamento)\b/i;
const JURISPRUDENCE_REFERENCE = /\b(?:jurisprudencia|tesis\s+aislada|tesis\s+\d\/|precedente|criterio\s+(?:orientador|jurisprudencial))\b/i;
const NORMATIVE_PREDICATE = /\b(?:establece|dispone|ordena|exige|prev[eé]|determina|regula|impone|proh[íi]be|autoriza|obliga|ha\s+se[ñn]alado)\b/i;
const REFERENCE_CLAUSE = /\b(?:conforme\s+al?|conforme\s+con|en\s+los\s+t[ée]rminos\s+de|por\s+lo\s+que\s+dispone|de\s+conformidad\s+con|seg[uú]n\s+el\s+(?:art[íi]culo|precepto|ordenamiento)|al\s+amparo\s+de)\b/i;
const PROOF_RULE = /\b(?:carga\s+(?:de\s+la\s+prueba|probatoria)|inversi[óo]n\s+de\s+(?:la\s+)?carga|presunci[óo]n\s+(?:legal|de\s+hecho)|(?:corresponde|incumbe)\s+(?:a\s+[^.!?\n]{1,60})?(?:probar|acreditar)|(?:debe|deber[aá])\s+(?:probar|acreditar))\b/i;
/** Referencia temporal: se neutraliza la frase, no el razonamiento que la rodea. */
const DEADLINE_CLAIM = /\b(?:dentro\s+del\s+(?:t[ée]rmino|plazo)\s+legal|plazo\s+legal|t[ée]rmino\s+legal|dentro\s+del\s+plazo)\b/i;
const COMPETENCE_CLAIM = /\b(?:competencia\s+(?:material|territorial|por\s+grado|funcional)|es\s+competente\s+el|no\s+se\s+encuentra\s+dentro\s+del\s+[áa]mbito\s+de\s+competencia|excede\s+la\s+competencia|re(?:s|sole)\s+de\s+la\s+competencia)\b/i;
const PROCEDURE_NORMATIVE_CLAIM = /\b(?:procede\s+el\s+recurso|el\s+recurso\s+procede|es\s+procedente\s+el\s+recurso)\b/i;
const ABSOLUTE_VALUATION = /\b(?:valor\s+probatorio\s+(?:pleno|vinculante)|[uú]nica\s+conclusi[óo]n\s+jur[íi]dica|desvirt[uú]a\s+por\s+completo)\b|(?:demuestra|demostraci[óo]n|acredita|prueba|prueban|probar|desvirt[uú]an?)[^.!?\n]{0,35}?\b(?:indubitable|inequ[íi]voc\w*|incuestionable)\b/i;

const PETITION_TRIGGER = /\b(?:se\s+solicita|solicito|solicita|se\s+condene|se\s+absuelva|se\s+revoque|se\s+declare|puntos\s+petitorios)\b/i;
const PETITION_EFFECT = /\b(?:costas?|conden(?:ar|a|ada|aci[óo]n)|sanci[óo]n|nulidad|absoluci[óo]n|sobreseimiento|revocaci[óo]n|revocar|revoque|modificaci[óo]n|modificar|sentencia\s+favorable|desestimaci[óo]n|desestimar|dejar\s+sin\s+efectos)\b/i;

type Remediation = 'SPAN' | 'EXPAND_TO_SENTENCE_END' | 'SENTENCE';

function pendingMark(reason: LegalAdmissionReason): string {
  switch (reason) {
    case 'UNVERIFIED_LEGAL_ASSERTION':
      return '[PENDIENTE DE DESARROLLO / FUNDAMENTO NORMATIVO ESPECÍFICO PENDIENTE DE VERIFICAR: incorporar sólo después de verificar el texto vigente en fuente oficial]';
    case 'UNSUPPORTED_PROOF_RULE':
      return '[PENDIENTE DE DESARROLLO / REGLA DE CARGA PROBATORIA PENDIENTE DE VERIFICAR]';
    case 'UNCONFIRMED_EVIDENCE':
      return '[PENDIENTE DE DESARROLLO / PRUEBA NO CONFIRMADA POR EL CLIENTE]';
    case 'UNSUPPORTED_PETITION':
      return '[PENDIENTE DE DESARROLLO / PETICIÓN NO AUTORIZADA POR EL ABOGADO]';
    case 'ABSOLUTE_EVIDENCE_VALUATION':
      return '[PENDIENTE DE DESARROLLO / VALORACIÓN PROBATORIA ABSOLUTA PENDIENTE DE FUNDAMENTO]';
    case 'UI_ASSISTANT_CONTENT_LEAK':
      // Bloqueante: el contenido no procede de una fuente jurídica.
      return '[PENDIENTE DE DESARROLLO / CONTENIDO NO JURÍDICO: el bloque contenía ayuda del asistente de interfaz y se rechazó (UI_ASSISTANT_CONTENT_LEAK)]';
  }
}

/** Marcadores de dependencia fáctica que deben sobrevivir a la remediación. */
const UNRESOLVED_FACTUAL_MARKER = /\[(?:\s*DATO\s+PENDIENTE\s*(?::\s*[^\]]*)?|\s*REQUIERE\s+[^\]]*|\s*PENDIENTE\s+DE\s+CONFIRMAR[^\]]*|\s*POR\s+DEFINIR[^\]]*)\]/gi;

/**
 * Varias proposiciones inseguras contiguas producen el mismo marcador. Se
 * colapsan para que el texto pendiente sea legible y el recuento de pérdida
 * siga correspondiendo a lo realmente retirado.
 */
function collapsePendingRuns(text: string): string {
  return text.replace(/(\[PENDIENTE DE DESARROLLO \/ [^\]]*\])(?:[\s.,;:]+(?:\[PENDIENTE DE DESARROLLO \/ [^\]]*\]))+/g, match => {
    const distinct = [...new Set(match.match(/\[PENDIENTE DE DESARROLLO \/ [^\]]*\]/g) || [])];
    return distinct.join(' ');
  });
}

interface AdmissionContext {
  descriptions: string[];
  verifiedPropositions: Set<string>;
  requestedEffects: Set<string>;
  legalIssueIds: readonly string[];
}

function buildContext(input: {
  document: UniversalLegalDocument; analysis?: CaseAnalysis; instruction?: string; legalIssueIds?: readonly string[];
}): AdmissionContext {
  const { document, analysis, instruction } = input;
  const descriptions = confirmedEvidenceDescriptions(analysis, instruction);
  const verified = (analysis?.verifiedAuthorities || []).filter(authority =>
    authority.verificationStatus === 'VERIFIED'
    && authority.source.sourceTier === 'OFFICIAL_PRIMARY'
    && Boolean(authority.source.sourceUrl && authority.source.sourceHash && authority.source.locator)
    && authority.jurisdictionValidity.status === 'APPLICABLE'
    && ['CURRENT_AND_APPLICABLE', 'HISTORICALLY_APPLICABLE'].includes(authority.temporalValidity.status)
    && authority.proposition.supportLevel === 'DIRECT'
    && authority.supportsLegalIssueIds.some(id => input.legalIssueIds?.includes(id)));
  const requests = document.generationMetadata.requestContract?.requests.map(item => item.text) || [];
  for (const challenge of analysis?.richCaseAnalysis?.draftingProjection?.challenges || []) {
    if (challenge.clientPosition && challenge.requestedEffect) requests.push(challenge.requestedEffect.text);
  }
  const verifiedPropositions = new Set(verified.map(authority => normalized(authority.proposition.text)));
  return {
    descriptions,
    verifiedPropositions,
    requestedEffects: new Set(requests.map(request => normalized(request).replace(/^se\s+solicita\s+/, ''))),
    legalIssueIds: input.legalIssueIds || [],
  };
}

function coveredByVerifiedAuthority(text: string, context: AdmissionContext): boolean {
  // Identity/existence of a citation is not support for every proposition
  // attributed to it. Official support must cover the actual assertion.
  return context.verifiedPropositions.has(normalized(text));
}

function labelKind(text: string): LegalPropositionKind | null {
  const trimmed = text.trim();
  if (!trimmed) return 'STRUCTURAL_REASONING';
  if (PENDING_MARKER.test(trimmed)) return 'STRUCTURAL_REASONING';
  if (EVIDENCE_SECTION_LABEL.test(trimmed) || ORDINAL_LABEL.test(trimmed)) return 'STRUCTURAL_REASONING';
  return null;
}

function classifySafe(text: string): LegalPropositionKind {
  if (CLIENT_POSITION.test(text)) return 'CLIENT_POSITION';
  if (INFERENCE.test(text)) return 'INFERENCE';
  if (FACTUAL_SOURCE.test(text)) return 'FACTUAL_SOURCE';
  if (LEGAL_ARGUMENT.test(text)) return 'LEGAL_ARGUMENT';
  return 'STRUCTURAL_REASONING';
}

interface Verdict { reason: LegalAdmissionReason; remediation: Remediation; match?: { start: number; end: number }; kind: LegalPropositionKind }

/**
 * Una proposición puede concurrer en más de unaAKA Unsupported: una norma no
 * verificada que además reparte carga probatoria. Se registran TODAS las
 * razones concurrentes y la remediación la fija la más restrictiva, para que
 * el diagnóstico del gate no pierda información de traza.
 */
const REASON_PRIORITY: LegalAdmissionReason[] = [
  'UNCONFIRMED_EVIDENCE', 'UNSUPPORTED_PETITION', 'ABSOLUTE_EVIDENCE_VALUATION',
  'UNVERIFIED_LEGAL_ASSERTION', 'UNSUPPORTED_PROOF_RULE',
];

function evaluateSegment(segment: Segment, sectionType: string, context: AdmissionContext): Verdict[] {
  const text = segment.text;
  const trimmed = text.trim();
  const verdicts: Verdict[] = [];

  // P0-B, primera comprobación: si el texto es ayuda de interfaz no hay nada
  // que remediar segmento a segmento. Se marca como segmento no admisible.
  if (detectUiAssistantLeak(text).length > 0) {
    verdicts.push({ reason: 'UI_ASSISTANT_CONTENT_LEAK', remediation: 'SENTENCE', kind: 'UNVERIFIED_LEGAL_PROPOSITION' });
  }

  const verifiedNorm = coveredByVerifiedAuthority(text, context);
  if (verifiedNorm) return verdicts;

  // 1. Ofrecimiento de prueba. Sólo un medio confirmado por el cliente existe.
  const offersEvidence = OFFER_VERB.test(text)
    || (sectionType === 'evidence' && (FABRICATION_SENSITIVE_MEDIUM.test(text) || SPECIFIC_EVIDENCE_ITEM.test(text)));
  if (offersEvidence) {
    const positionExempt = CLIENT_POSITION.test(text) && !FABRICATION_SENSITIVE_MEDIUM.test(text) && !OFFER_VERB.test(text);
    if (!positionExempt && !refersToConfirmedDescription(text, context.descriptions)) {
      verdicts.push({ reason: 'UNCONFIRMED_EVIDENCE', remediation: 'SENTENCE', kind: 'EVIDENCE_OFFER' });
    }
  }

  // 2. Petición procesal: exige autorización expresa del abogado.
  if (PETITION_TRIGGER.test(text) && PETITION_EFFECT.test(text)) {
    const requested = normalized(trimmed).replace(/^se\s+solicita\s+/, '');
    if (!context.requestedEffects.has(requested)) {
      verdicts.push({ reason: 'UNSUPPORTED_PETITION', remediation: 'SENTENCE', kind: 'PROCEDURAL_REQUEST' });
    }
  }

  // 3. Referencia temporal: se retira la frase, sobrevive el razonamiento.
  const deadline = text.match(DEADLINE_CLAIM);
  if (!verifiedNorm && deadline && deadline.index !== undefined) {
    verdicts.push({
      reason: 'UNVERIFIED_LEGAL_ASSERTION', remediation: 'SPAN', kind: 'UNVERIFIED_LEGAL_PROPOSITION',
      match: { start: deadline.index, end: deadline.index + deadline[0].length },
    });
  }

  // 4. Regla de carga probatoria: afirmación normativa que exige sustento.
  if (!verifiedNorm && PROOF_RULE.test(text)) {
    verdicts.push({ reason: 'UNSUPPORTED_PROOF_RULE', remediation: 'SENTENCE', kind: 'UNVERIFIED_LEGAL_PROPOSITION' });
  }

  // 5. Valoración probatoria absoluta.
  if (!verifiedNorm && ABSOLUTE_VALUATION.test(text)) {
    verdicts.push({ reason: 'ABSOLUTE_EVIDENCE_VALUATION', remediation: 'SENTENCE', kind: 'UNVERIFIED_LEGAL_PROPOSITION' });
  }

  // 6. Marcador [NO VERIFICADO]: nunca puede quedar como proposición de derecho.
  //    Se convierte en el marcador canónico (que además bloquea FINAL) y el
  //    razonamiento contiguo permanece intacto.
  const marker = text.match(UNVERIFIED_MARKER_ONLY);
  if (UNVERIFIED_MARKER_CLAIM.test(text) || (marker && marker.index !== undefined && marker[0].length >= trimmed.length * 0.4)) {
    if (marker && marker.index !== undefined && !UNVERIFIED_MARKER_CLAIM.test(text)) {
      verdicts.push({
        reason: 'UNVERIFIED_LEGAL_ASSERTION', remediation: 'SPAN', kind: 'UNVERIFIED_LEGAL_PROPOSITION',
        match: { start: marker.index, end: marker.index + marker[0].length },
      });
    } else {
      verdicts.push({ reason: 'UNVERIFIED_LEGAL_ASSERTION', remediation: 'SENTENCE', kind: 'UNVERIFIED_LEGAL_PROPOSITION' });
    }
  }

  // 7. Afirmación normativa concreta: artículo, código, jurisprudencia o cláusula de referencia.
  const hasAuthorityReference = ARTICLE_REFERENCE.test(text) || NORM_REFERENCE.test(text) || JURISPRUDENCE_REFERENCE.test(text);
  const assertsNorm = (hasAuthorityReference && (NORMATIVE_PREDICATE.test(text) || REFERENCE_CLAUSE.test(text)))
    || COMPETENCE_CLAIM.test(text) || PROCEDURE_NORMATIVE_CLAIM.test(text);
  if (!verifiedNorm && assertsNorm) {
    // Una cláusula de referencia introduce la norma y se desarrolla hasta el
    // final del enunciado: se retira sólo esa molding normativa.
    const clause = text.match(REFERENCE_CLAUSE);
    if (clause && clause.index !== undefined) {
      verdicts.push({
        reason: 'UNVERIFIED_LEGAL_ASSERTION', remediation: 'EXPAND_TO_SENTENCE_END', kind: 'UNVERIFIED_LEGAL_PROPOSITION',
        match: { start: clause.index, end: clause.index + clause[0].length },
      });
    } else {
      verdicts.push({ reason: 'UNVERIFIED_LEGAL_ASSERTION', remediation: 'SENTENCE', kind: 'UNVERIFIED_LEGAL_PROPOSITION' });
    }
  }

  return verdicts;
}

/**
 * Admisión granular. La unidad de admisión es la proposición (y, cuando la
 * proposición mezcla razonamiento con una referencia no verificada, la cláusula),
 * nunca la sección completa.
 *
 * Se conserva como razonamiento jurídico admisible (H) toda la comparación,
 * delimitación, conexión y desarrollo que la Guía Operativa exige
 * (p. 138-146, p. 155): "de la resolución se advierte", "la parte apelante
 * sostiene", "existe incongruencia entre", "corresponde analizar". Sólo se
 * suspenden las proposiciones que inventan la materia prima del razonamiento:
 * autoridad sin verificar, prueba no ofrecida, petición no autorizada y
 * valoración probatoria absoluta. Todo marcador emitido sigue siendo un
 * seed marker, por lo que FINAL permanece bloqueado.
 */
export function evaluateGeneratedLegalAdmission(input: {
  text: string;
  sectionType: string;
  document: UniversalLegalDocument;
  analysis?: CaseAnalysis;
  instruction?: string;
  legalIssueIds?: readonly string[];
}): GeneratedLegalAdmissionResult {
  const { sectionType } = input;
  const text = normalizeUnresolvedFieldMarkers(input.text);
  const pendingMarkerCauses = [...new Set(extractUnresolvedFieldMarkers(text).map(marker => marker.cause))];
  const context = buildContext(input);
  const segments = segmentPropositions(text);

  const reasons = new Set<LegalAdmissionReason>();
  const proposals: AdmittedLegalProposition[] = [];
  let output = '';
  let admittedCount = 0;
  let neutralizedCount = 0;
  let removedWords = 0;
  const preserved: string[] = [];

  for (const segment of segments) {
    if (!segment.text.trim()) { output += segment.text + segment.delimiter; continue; }

    const label = labelKind(segment.text);
    if (label) {
      proposals.push({ kind: label, text: segment.text.trim(), admitted: true, reasons: [] });
      admittedCount += 1;
      output += segment.text + segment.delimiter;
      continue;
    }

    const verdicts = evaluateSegment(segment, sectionType, context);
    if (!verdicts.length) {
      const kind = classifySafe(segment.text);
      proposals.push({ kind, text: segment.text.trim(), admitted: true, reasons: [] });
      admittedCount += 1;
      preserved.push(segment.text.trim());
      output += segment.text + segment.delimiter;
      continue;
    }

    for (const verdict of verdicts) reasons.add(verdict.reason);
    // Apply every unsafe interval, not just the first finding. Merge overlap
    // before counting losses so the same words cannot be rejected twice.
    const intervals = verdicts.map(verdict => {
      const from = verdict.remediation === 'SENTENCE' || !verdict.match ? 0 : verdict.match.start;
      const to = verdict.remediation === 'SPAN' && verdict.match ? verdict.match.end : segment.text.length;
      return { from, to, verdicts: [verdict] };
    }).sort((a, b) => a.from - b.from);
    const merged: typeof intervals = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (last && interval.from <= last.to) {
        last.to = Math.max(last.to, interval.to);
        last.verdicts.push(...interval.verdicts);
      } else merged.push(interval);
    }
    let cursor = 0;
    const keep = (part: string) => {
      output += part;
      if (!part.trim() || wordCount(part) === 0) return;
      proposals.push({ kind: classifySafe(part), text: part.trim(), admitted: true, reasons: [] });
      admittedCount += 1;
      preserved.push(part.trim());
    };
    for (const interval of merged) {
      keep(segment.text.slice(cursor, interval.from));
      const removed = segment.text.slice(interval.from, interval.to);
      const governing = [...interval.verdicts].sort((a, b) => REASON_PRIORITY.indexOf(a.reason) - REASON_PRIORITY.indexOf(b.reason))[0];
      const carried = [...new Set(removed.match(UNRESOLVED_FACTUAL_MARKER) || [])];
      output += pendingMark(governing.reason) + (carried.length ? ` ${carried.join(' ')}` : '');
      proposals.push({ kind: governing.kind, text: removed.trim(), admitted: false,
        reasons: [...new Set(interval.verdicts.map(verdict => verdict.reason))] });
      removedWords += wordCount(removed);
      cursor = interval.to;
    }
    keep(segment.text.slice(cursor));
    output += segment.delimiter;
    neutralizedCount += 1;
  }

  // La descripción confirmada por el cliente se conserva siempre como nota de
  // procedencia: identifica qué medio existe sin certificar autenticidad ni
  // valor probatorio.
  const sourceEvidence = sectionType === 'evidence' && context.descriptions.length
    ? `\n\nDescripción aportada por el cliente (sin certificar autenticidad ni valor probatorio):\n${context.descriptions.join('\n')}`
    : '';
  const remediated = `${collapsePendingRuns(output)}${sourceEvidence}`;
  const codes = [...reasons];
  return {
    accepted: codes.length === 0,
    reasons: codes,
    text: remediated,
    pendingText: remediated,
    rejectedWords: removedWords,
    proposals,
    admittedCount,
    neutralizedCount,
    fullyNeutralized: admittedCount === 0,
    pendingMarkerCauses,
  };
}
