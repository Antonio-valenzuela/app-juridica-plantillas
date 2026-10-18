/**
 * factsPolicy.ts — criterio de aceptación de HECHOS por tipo de escrito.
 *
 * Un escrito sustantivo (demanda, contestación, recurso, alegatos…), una
 * solicitud de copias y un contrato no tienen las mismas necesidades. Exigir la
 * misma narración de hechos a todos obliga a inventar secciones inútiles; no
 * exigirla a ninguno permite perder información relevante sin avisar.
 *
 * Tres clases explícitas, cada una con su razón y su criterio verificable:
 *
 *  - NARRATIVE_REQUIRED: escrito sustantivo. Los hechos proporcionados DEBEN
 *    aparecer en el cuerpo. Un marcador de "pendiente" NO los sustituye cuando
 *    el análisis del caso sí los trae: sería pérdida silenciosa con coartada.
 *  - PROCEDURAL_CONTEXT: trámite/solicitud/cumplimiento. Una narración completa
 *    no corresponde al propósito; se exige contexto procesal (expediente),
 *    identificación de la parte y una petición concreta.
 *  - INSTRUMENT: contrato/convenio. Su contenido son partes, objeto y
 *    cláusulas; se exige identificación de las partes.
 *  - COMMERCIAL_CONTEXT: demanda ejecutiva mercantil. Su contrato solo admite el contexto
 *    mercantil CONFIRMADO por el abogado; se exige que esos hechos confirmados aparezcan.
 *  - PROCEDURAL_ANTECEDENTS: estrategia post-sentencia. Su insumo factual son
 *    los antecedentes procesales (cronología) y los agravios que derivan de la
 *    sentencia fuente; se exige que la cronología procesal aparezca.
 *
 * Esta clasificación NO relaja ningún Quality Gate del motor: solo decide qué
 * criterio de la prueba de evidencia es el adecuado para cada tipo.
 */

export type FactsPolicy = 'NARRATIVE_REQUIRED' | 'PROCEDURAL_CONTEXT' | 'INSTRUMENT' | 'PROCEDURAL_ANTECEDENTS' | 'COMMERCIAL_CONTEXT';

export interface FactsPolicyDecision {
  policy: FactsPolicy;
  /** Razón explícita (auditable) de la clasificación. */
  reason: string;
}

export interface FactsPolicySubject {
  id: string;
  familyId: string;
  requiredSections: readonly string[];
}

const FACTS_SECTION_RE = /HECHO|ANTECEDENT|EXPOSICI|NARRACI|RELATO/i;
const INSTRUMENT_SECTION_RE = /CL[ÁA]USULA|DECLARACION|OBJETO DEL CONVENIO/i;
const PROCEDURAL_ID_RE = /^(solicitud_|cumplimiento_|desahogo_prevencion)/;

/**
 * Excepciones por ID: tipos que, por prefijo, parecerían trámite pero cuyo
 * propósito exige narrar hechos. Cada una con su razón.
 */
const NARRATIVE_EXCEPTIONS: Readonly<Record<string, string>> = Object.freeze({
  solicitud_medida_proteccion: 'La medida de protección se funda en hechos de riesgo que deben narrarse.',
  solicitud_suspension_fiscal: 'La suspensión se solicita sobre un acto fiscal cuyos hechos deben constar.',
});

/**
 * Estrategias post-sentencia: el insumo factual es la cronología procesal, no
 * una narración de hechos del litigio.
 */
const ANTECEDENTS_EXCEPTIONS: Readonly<Record<string, string>> = Object.freeze({
  contestacion_revision_extraordinaria_amparo_directo:
    'Estrategia post-sentencia de amparo directo: los antecedentes procesales (cronología) y los agravios derivados de la sentencia sustituyen a la narración de hechos del litigio.',
});

/**
 * Respuestas a un recurso: el insumo es la sentencia apelada y los agravios del apelante, no una narración de
 * hechos del litigio; se verifica el contexto procesal (expediente, partes) y la petición.
 */
const PROCEDURAL_CONTEXT_EXCEPTIONS: Readonly<Record<string, string>> = Object.freeze({
  contestacion_agravios: 'Contestación de agravios: responde los agravios del apelante apoyándose en la sentencia apelada; no narra hechos del litigio.',
});

export function factsPolicyFor(subject: FactsPolicySubject): FactsPolicyDecision {
  if (subject.id === 'demanda_ejecutiva_mercantil') {
    return { policy: 'COMMERCIAL_CONTEXT', reason: 'Su contrato solo admite el contexto mercantil confirmado por el abogado: se verifican esos hechos, no los del análisis genérico.' };
  }
  const antecedents = ANTECEDENTS_EXCEPTIONS[subject.id];
  if (antecedents) return { policy: 'PROCEDURAL_ANTECEDENTS', reason: antecedents };
  const proceduralException = PROCEDURAL_CONTEXT_EXCEPTIONS[subject.id];
  if (proceduralException) return { policy: 'PROCEDURAL_CONTEXT', reason: proceduralException };
  const exception = NARRATIVE_EXCEPTIONS[subject.id];
  if (exception) return { policy: 'NARRATIVE_REQUIRED', reason: exception };

  if (subject.familyId.startsWith('tramite_')) {
    return { policy: 'PROCEDURAL_CONTEXT', reason: 'Trámite procesal: la petición concreta y el contexto del expediente sustituyen a la narración de hechos.' };
  }
  if (subject.requiredSections.some(section => INSTRUMENT_SECTION_RE.test(section))) {
    return { policy: 'INSTRUMENT', reason: 'Instrumento contractual: su contenido son partes, objeto y cláusulas, no los hechos de un litigio.' };
  }
  if (subject.requiredSections.some(section => FACTS_SECTION_RE.test(section))) {
    return { policy: 'NARRATIVE_REQUIRED', reason: 'La estructura propia del tipo declara una sección de hechos o antecedentes.' };
  }
  if (PROCEDURAL_ID_RE.test(subject.id)) {
    return { policy: 'PROCEDURAL_CONTEXT', reason: 'Solicitud, cumplimiento o desahogo: se acredita con contexto procesal y petición concreta.' };
  }
  return { policy: 'NARRATIVE_REQUIRED', reason: 'Escrito sustantivo sin exclusión declarada: los hechos proporcionados no pueden perderse.' };
}

export interface FactsCriterionInput {
  policy: FactsPolicy;
  body: string;
  /** Hechos del caso que deben conservarse (texto distintivo). */
  factTokens: readonly string[];
  /** Datos de contexto: expediente y partes. */
  expedienteToken: string;
  partyTokens: readonly string[];
  /** Eventos de la cronología procesal (solo para PROCEDURAL_ANTECEDENTS). */
  timelineTokens?: readonly string[];
  /** Hechos del contexto mercantil confirmado (solo para COMMERCIAL_CONTEXT). */
  commercialTokens?: readonly string[];
}

const PENDING_EXPEDIENTE_RE = /\[(?:DATO )?PENDIENTE[^\]]*EXPEDIENTE[^\]]*\]/i;
const PENDING_PARTY_RE = /\[(?:DATO )?PENDIENTE[^\]]*(?:PARTE|ACTOR|DEMANDADO|PROMOVENTE|NOMBRE|PERSONALIDAD)[^\]]*\]/i;
const PETITION_RE = /(?<![A-ZÁÉÍÓÚÑ])(PRIMERO|SEGUNDO|SOLICITO|SOLICITA|SOLICITAMOS|SE SIRVA|SE TENGA|TENERME POR|TENER POR PRESENTAD[OA])(?![A-ZÁÉÍÓÚÑ])/i;

/** Devuelve los motivos de rechazo (vacío = cumple el criterio de su clase). */
export function evaluateFactsCriterion(input: FactsCriterionInput): string[] {
  const reasons: string[] = [];
  const { body } = input;
  const hasParty = input.partyTokens.some(token => body.includes(token)) || PENDING_PARTY_RE.test(body);

  if (input.policy === 'NARRATIVE_REQUIRED') {
    if (!input.factTokens.some(token => body.includes(token))) reasons.push('FACTS_SILENTLY_DROPPED');
    return reasons;
  }
  if (!hasParty) reasons.push('PARTY_CONTEXT_MISSING');
  if (input.policy === 'COMMERCIAL_CONTEXT') {
    if (!(input.commercialTokens || []).some(token => body.includes(token))) reasons.push('COMMERCIAL_FACTS_DROPPED');
  }
  if (input.policy === 'PROCEDURAL_ANTECEDENTS') {
    if (!(input.timelineTokens || []).some(token => body.includes(token))) reasons.push('PROCEDURAL_ANTECEDENTS_DROPPED');
    if (!body.includes(input.expedienteToken) && !PENDING_EXPEDIENTE_RE.test(body)) reasons.push('PROCEDURAL_CONTEXT_MISSING');
  }
  if (input.policy === 'PROCEDURAL_CONTEXT') {
    if (!body.includes(input.expedienteToken) && !PENDING_EXPEDIENTE_RE.test(body)) reasons.push('PROCEDURAL_CONTEXT_MISSING');
    if (!PETITION_RE.test(body)) reasons.push('PETITION_MISSING');
  }
  return reasons;
}
