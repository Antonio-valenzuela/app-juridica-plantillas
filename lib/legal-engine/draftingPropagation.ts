import type { RichCaseAnalysis } from './case-extraction/types';
import type { UploadedSourceDocument } from './types';

/** Planning input, never a finding of truth, verification or substantive Coverage. */
export interface DraftingSpan { sourceId: string; page?: number; start: number; end: number; text: string }
export interface FactResponseContract {
  sourceFactId: string; sourceText: string;
  clientPosition: DraftingSpan | null;
  responseType: 'ADMIT' | 'DENY' | 'CLARIFY' | 'IGNORE_IF_LEGALLY_APPROPRIATE' | 'UNKNOWN_REQUIRES_CLIENT_POSITION';
  responseScope: 'FACT' | 'PROOF_ONLY'; responseReason: string;
  supportingEvidenceIds: string[]; contradictionIds: string[]; missingData: string[]; risk: string[];
}
export interface ClaimResponseContract {
  claimId: string; claimText: string; position: DraftingSpan | null;
  factualBasis: string[]; legalIssueIds: string[]; evidenceIds: string[]; defenseIds: string[]; status: string;
}
export interface ChallengeContract {
  id: string; kind: 'GRIEVANCE' | 'CONCEPT' | 'PENAL_PROCEDURAL';
  grievanceId?: string; conceptId?: string; decisionId: string; challengedActId: string;
  challengedText: string; sourceSpan: DraftingSpan; authorityReasoning: string;
  errorType: 'MOTIVATION' | null; clientPosition: DraftingSpan | null;
  legalRuleIds: string[]; constitutionalOrLegalRuleIds: string[];
  recordSupportIds: string[]; recordSupport: DraftingSpan[];
  reasoning: string | null; legalContradiction: string | null; prejudice: string | null;
  requestedEffect: DraftingSpan | null; missingData: string[]; missingRequirements: string[];
  proceduralQuestion: string; rightsIssue: null; requestedAction: DraftingSpan | null;
  personRole: DraftingSpan | null; proceduralStage: DraftingSpan | null;
  facts: Array<{ id: string; text: string }>; crimeClassification?: 'MISSING' | 'NOT_EVALUATED';
}
export type LegalDraftingContract = FactResponseContract | ClaimResponseContract | ChallengeContract;
export interface DraftingProjection {
  version: '1'; factResponses: FactResponseContract[]; claimResponses: ClaimResponseContract[]; challenges: ChallengeContract[];
}
export const MISSING_DATA_CONSTRAINTS = [
  'DO NOT FILL MISSING DATA', 'DO NOT CONVERT MISSING INTO A FACT', 'DO NOT CREATE UNVERIFIED AUTHORITIES',
] as const;

function instructionSpan(instruction: string, re: RegExp): DraftingSpan | null {
  const match = re.exec(instruction);
  if (!match?.[1]) return null;
  const start = match.index + match[0].indexOf(match[1]);
  return { sourceId: 'ATTORNEY_INSTRUCTION', start, end: start + match[1].length, text: match[1] };
}
function sourceLabel(sources: UploadedSourceDocument[], label: string): DraftingSpan | null {
  for (const source of sources) {
    const text = source.extractedText || source.content || '';
    const match = new RegExp(`(?:^|[.\\n]\\s*)(?:${label})\\s*:\\s*([^\\n.]+)`, 'i').exec(text);
    if (!match?.[1]) continue;
    const start = match.index + match[0].indexOf(match[1]);
    const page = source.pages?.find(p => p.text.includes(match[1]))?.page;
    return { sourceId: source.id, page, start, end: start + match[1].length, text: match[1] };
  }
  return null;
}
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

/** Conservative explicit-number or unique phrase alignment, not role-based adoption.
 * Unmatched/ambiguous free text stays UNKNOWN. Proof denials never become factual denials.
 */
function positionForFact(rich: RichCaseAnalysis, factId: string, instruction: string): { span: DraftingSpan; type: FactResponseContract['responseType']; scope: FactResponseContract['responseScope'] } | null {
  const fact = rich.facts.find(f => f.id === factId)!;
  const clauses = [...instruction.matchAll(/\b((?:admitir|negar|aclarar)\s+[^;.]+)/gi)];
  for (const clause of clauses) {
    const text = clause[1].split(/\s+y\s+aclarar\s+/i)[0];
    const key = normalize(text);
    const opposing = key.replace(/^admitir\b/, 'negar');
    if (opposing !== key && clauses.some(other => normalize(other[1]) === opposing)) return null;
    if (/\b(?:no|sin)\s+(?:admitir|negar|aclarar)\b/i.test(instruction.slice(Math.max(0,clause.index! - 5),clause.index! + 10))) continue;
    const number = /\bhecho\s+(\d+)\b/i.exec(text)?.[1];
    const sourceText = normalize(fact.proposition);
    const numbered = number && new RegExp(`^\\s*${number}[.)]`).test(fact.proposition);
    // Complete action + object phrase, only a unique celebration proposition.
    const celebration = /^admitir la celebracion del (\w+)$/i.exec(key);
    const celebrationMatches = celebration ? rich.facts.filter(f =>
      /\bcelebr(?:o|aron|ado|acion)\b/.test(normalize(f.proposition))
      && normalize(f.proposition).includes(celebration[1])) : [];
    // An express challenge to proof is not a statement that the underlying fact is false.
    const proof = /^negar que este probado el (\w+)$/i.exec(key);
    const proofMatches = proof ? rich.facts.filter(f => new RegExp(`\\b${proof[1]}\\b`).test(normalize(f.proposition))) : [];
    if (!numbered && !(celebrationMatches.length === 1 && celebrationMatches[0].id === factId)
      && !(proofMatches.length === 1 && proofMatches[0].id === factId)) continue;
    if (number && !numbered) continue;
    if (!sourceText.trim()) continue;
    const start = clause.index!;
    return {
      span: { sourceId: 'ATTORNEY_INSTRUCTION', start, end: start + clause[1].length, text: clause[1] },
      type: /^admitir/i.test(text) ? 'ADMIT' : /^negar/i.test(text) ? 'DENY' : 'CLARIFY',
      scope: proof ? 'PROOF_ONLY' : 'FACT',
    };
  }
  return null;
}

export function buildDraftingProjection(rich: RichCaseAnalysis, instruction: string, sources: UploadedSourceDocument[] = []): DraftingProjection {
  const factResponses = rich.facts.map((fact): FactResponseContract => {
    const position = positionForFact(rich, fact.id, instruction);
    return {
      sourceFactId: fact.id, sourceText: fact.proposition, clientPosition: position?.span || null,
      responseType: position?.type || 'UNKNOWN_REQUIRES_CLIENT_POSITION', responseScope: position?.scope || 'FACT',
      responseReason: position ? `Instrucción expresa: ${position.span.text}` : 'No consta instrucción individual sobre este hecho.',
      supportingEvidenceIds: rich.evidenceMentions.filter(e => e.relatedFactIds.includes(fact.id)).map(e => e.id),
      contradictionIds: rich.conflicts.filter(c => c.itemIds.includes(fact.id)).map(c => c.conflictId),
      missingData: position ? [] : ['MISSING_CLIENT_POSITION'],
      risk: ['SOURCE_ALLEGATION_NOT_ESTABLISHED', ...(position?.scope === 'PROOF_ONLY' ? ['DO_NOT_DENY_UNDERLYING_FACT'] : [])],
    };
  });
  // Do not infer opposition to a claim from a position on one factual constituent.
  const claimResponses = rich.claims.map((claim): ClaimResponseContract => ({
    claimId: claim.id, claimText: claim.requestedRelief, position: null,
    factualBasis: [...claim.factualBasisIds], legalIssueIds: [],
    evidenceIds: rich.evidenceMentions.filter(e => e.relatedClaimIds?.includes(claim.id)).map(e => e.id),
    defenseIds: [], status: 'MISSING_CLIENT_POSITION',
  }));
  const effect = instructionSpan(instruction, /\bEfecto\s+(?:solicitado|pretendido)\s*:\s*([^\n.]+)/i);
  const position = instructionSpan(instruction, /\bAgravio\s+(?:solicitado|del ejercicio)\s*:\s*([^\n.]+)/i);
  const penalAction = instructionSpan(instruction, /\bPetición\s+del ejercicio\s*:\s*([^\n.]+)/i);
  const kind = /\bamparo\b/i.test(instruction) ? 'CONCEPT' : /\bpenal\b/i.test(instruction) ? 'PENAL_PROCEDURAL' : 'GRIEVANCE';
  const decisions = (rich.decisionReasonings || []).map(d => {
    for (const source of sources) {
      const text = source.extractedText || source.content || '';
      const start = text.indexOf(d.proposition);
      if (start >= 0) return { id: d.id, span: { sourceId: source.id, page: d.provenance[0]?.page, start, end: start + d.proposition.length, text: d.proposition } };
    }
    return null;
  }).filter((d): d is NonNullable<typeof d> => Boolean(d));
  // A literal procedural act is sufficient for a review issue, never for legal certification.
  if (kind === 'PENAL_PROCEDURAL' && decisions.length === 0) {
    const span = sourceLabel(sources, 'Acto');
    if (span) decisions.push({ id: `procedural-act-${span.sourceId}-${span.start}`, span: {...span,page:span.page} });
  }
  const record = sourceLabel(sources, 'Constancias? (?:del ejercicio|disponible en el ejercicio)|Prueba o dato disponible');
  const role = sourceLabel(sources, 'Representado ficticio');
  const stage = sourceLabel(sources, 'Etapa');
  const challenges = decisions.map(({id,span}): ChallengeContract => {
    // A lone instruction cannot be silently attached to several different decisions.
    const scopedPosition = decisions.length === 1 ? position || penalAction : null;
    const requestedEffect = decisions.length === 1 ? effect || penalAction : null;
    const recordSupport = record ? [record] : [];
    const sourceText = sources.find(s => s.id === span.sourceId)?.extractedText || '';
    const motivationSupport = scopedPosition && /^falta de explicaci[oó]n individual de la (?:pertinencia|negativa)$/i.test(scopedPosition.text)
      && /(?:no explica la relaci[oó]n entre|sin explicar requisitos faltantes ni motivo individual)/i.test(sourceText);
    const legalQuestion = scopedPosition ? `Cuestión por verificar oficialmente: si ${JSON.stringify(span.text)} responde de manera individual al planteamiento ${JSON.stringify(scopedPosition.text)}.` : 'Pendiente: delimitar el cuestionamiento del abogado sobre el acto identificado.';
    const missingData = ['UNVERIFIED_AUTHORITY', 'PROCEDURAL_REQUIREMENTS_UNVERIFIED',
      ...(!scopedPosition ? ['MISSING_CLIENT_POSITION','MISSING_ARGUMENT_REASONING'] : []),
      ...(!requestedEffect ? ['MISSING_REQUESTED_EFFECT'] : []), ...(!record ? ['MISSING_RECORD_SUPPORT'] : [])];
    const prejudice = kind === 'CONCEPT'
      ? sourceText.match(/[^.]*\bimpide obtener una respuesta[^.]*/i)?.[0]?.trim() || null
      : kind === 'GRIEVANCE' && record
        ? `Inferencia procesal para revisión, no hecho acreditado: el rechazo identificado impide incorporar la documental ofrecida descrita en ${record.text}; no se concluye que deba admitirse ni que cambie el resultado del juicio.` : null;
    if (!prejudice) missingData.push('PREJUDICE_REQUIRES_CONFIRMATION');
    return {
      id: `drafting-${kind.toLowerCase()}-${id}`, kind,
      ...(kind === 'GRIEVANCE' ? {grievanceId: `grievance-${id}`} : {}),
      ...(kind === 'CONCEPT' ? {conceptId: `concept-${id}`} : {}),
      decisionId: id, challengedActId: id, challengedText: span.text, sourceSpan: span, authorityReasoning: span.text,
      errorType: motivationSupport ? 'MOTIVATION' : null, clientPosition: scopedPosition,
      legalRuleIds: [], constitutionalOrLegalRuleIds: [],
      recordSupportIds: recordSupport.map(s => `record-${s.sourceId}-${s.start}`), recordSupport,
      reasoning: scopedPosition && record
        ? `Planteamiento del abogado: ${scopedPosition.text}. Frente a la razón expresada en el acto (${span.text}), la constancia identificada (${record.text}) delimita el material cuya respuesta individual se solicita examinar. El cuestionamiento es si esa razón responde a dicho material, no si la parte tiene automáticamente razón. De confirmarse mediante fuente oficial el deber normativo y su aplicabilidad, deberá contrastarse la respuesta concreta con ese deber; no se afirma todavía una infracción acreditada.`
        : scopedPosition ? legalQuestion : null,
      legalContradiction: scopedPosition ? legalQuestion : null,
      prejudice, requestedEffect, missingData, missingRequirements: [...missingData], proceduralQuestion: legalQuestion,
      rightsIssue: null, requestedAction: requestedEffect, personRole: role, proceduralStage: stage,
      facts: rich.facts.map(f => ({id:f.id,text:f.proposition})),
      ...(kind === 'PENAL_PROCEDURAL' ? {
        crimeClassification: /\b(?:no|ni) se conoce delito imputado\b/i.test(sourceText) ? 'MISSING' as const : 'NOT_EVALUATED' as const,
      } : {}),
    };
  });
  return {version:'1',factResponses,claimResponses,challenges};
}

export function renderDraftingReview(contract: LegalDraftingContract): string {
  if ('sourceFactId' in contract) return [
    `HECHO ${contract.sourceFactId}`, `Alegación de origen: ${contract.sourceText}`,
    contract.clientPosition ? `Postura expresa del abogado (${contract.responseScope === 'PROOF_ONLY' ? 'únicamente acreditación, no negación del hecho' : 'alcance fáctico'}): ${contract.clientPosition.text}.` : 'PENDIENTE: postura individual del cliente. No se admite ni se niega este hecho.',
    `Razón: ${contract.responseReason}`, `Soporte vinculado: ${contract.supportingEvidenceIds.join(', ') || 'ninguno individualizado'}.`,
    'Se conserva como alegación, no como hecho acreditado.',
  ].join('\n');
  if ('claimId' in contract) return [
    `PRESTACIÓN ${contract.claimId}: ${contract.claimText}`,
    'PENDIENTE: postura individual, fundamento y estrategia del abogado. No se inventa oposición.',
    `Hechos vinculados: ${contract.factualBasis.join(', ') || 'no individualizados'}.`,
    `Pruebas vinculadas: ${contract.evidenceIds.join(', ') || 'no individualizadas'}.`,
  ].join('\n');
  return [
    `${contract.kind === 'CONCEPT' ? 'CONCEPTO DE VIOLACIÓN' : contract.kind === 'PENAL_PROCEDURAL' ? 'CUESTIÓN PROCESAL PENAL' : 'AGRAVIO'} — BORRADOR PARA REVISIÓN`,
    `${contract.kind === 'CONCEPT' ? 'ACTO RECLAMADO' : 'RESOLUCIÓN COMBATIDA'}: ${contract.challengedText}`,
    `${contract.kind === 'CONCEPT' ? 'RAZONAMIENTO DE LA AUTORIDAD' : 'CONSIDERACIÓN ESPECÍFICA'}: ${contract.authorityReasoning}`,
    `PLANTEAMIENTO EXPRESAMENTE SOLICITADO: ${contract.clientPosition?.text || '[PENDIENTE: postura del abogado]'}`,
    ...(contract.kind === 'CONCEPT' ? ['NORMA: [PENDIENTE: premisa normativa y aplicabilidad verificadas oficialmente]'] : [
      `ERROR ATRIBUIDO: ${contract.errorType ? `Hipótesis solicitada por el abogado: ${contract.clientPosition?.text}; pendiente de verificación jurídica.` : '[PENDIENTE: error jurídicamente sustentado]'}`,
      `NORMA/CUESTIÓN JURÍDICA: ${contract.proceduralQuestion}`,
    ]),
    `${contract.kind === 'CONCEPT' ? 'CONTRADICCIÓN JURÍDICA' : 'RAZONAMIENTO'}: ${contract.reasoning || '[PENDIENTE: argumento respaldado]'}`,
    `${contract.kind === 'CONCEPT' ? 'AFECTACIÓN' : 'PERJUICIO'}: ${contract.prejudice || '[PENDIENTE: afectación específica respaldada]'}`,
    `CONSTANCIA DEL EXPEDIENTE: ${contract.recordSupport.map(s => s.text).join('; ') || '[PENDIENTE: constancia individualizada]'}`,
    `EFECTO: ${contract.requestedEffect?.text || '[PENDIENTE: instrucción expresa]'}`,
    ...(contract.kind === 'PENAL_PROCEDURAL' ? [
      `Persona y calidad procesal según fuente: ${contract.personRole?.text || 'PENDIENTE'}`,
      `Etapa según fuente: ${contract.proceduralStage?.text || 'PENDIENTE'}`,
      contract.crimeClassification === 'MISSING'
        ? 'Clasificación del delito: no aportada según la fuente; no se formula imputación.'
        : 'Clasificación del delito: no evaluada por esta proyección de revisión procesal; conservar el análisis penal de origen.',
    ] : []),
    `PENDIENTES: Pendientes que bloquean conclusión jurídica: ${contract.missingData.join(', ')}.`,
    'LÍMITE: No se sostiene violación acreditada, norma verificada ni procedencia del medio de defensa.',
  ].join('\n');
}
