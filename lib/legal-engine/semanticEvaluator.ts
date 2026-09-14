/**
 * semanticEvaluator.ts — Evaluación semántica profunda, anti-genericidad,
 * densidad fáctica y expansión dirigida para el motor jurídico.
 *
 * Responde a la pregunta central de FASE 5:
 * ¿EL BLOQUE GENERADO REALMENTE RESUELVE EL COVERAGE ITEM ASIGNADO?
 *
 * Invariantes:
 *  - generated != covered (CoverageItem sólo pasa a 'covered' tras superar evaluación semántica).
 *  - Cero evaluación por longitud: un bloque de 30 páginas repetitivo REPRUEBA; un bloque conciso y específico APRUEBA.
 *  - Hard Fails inmediatos: seed markers, dependencias fácticas no resueltas ([DATO PENDIENTE...]),
 *    jurisprudencia fabricada, truncamiento sin resolver, o issue no respondido.
 */

import { ContentBlock, DocumentNode, UniversalLegalDocument } from './types';
import { GenerationTask, TaskComplexity } from './generationTasks';
import { CoverageMatrix, DocumentCoverageItem } from './coverageMatrix';
import { CaseAnalysis } from './caseAnalysis';
import { assessCoverageEligibility } from './coverageEligibility';
import {
  hasSeedMarkers,
  hasUnresolvedFactualDependencies,
  extractUnresolvedFactualDependencies,
} from './seedMarkers';
import type { IssueDraftResult } from './issueDraftResult';
import type { IssueContextPack } from './issueScopedGeneration';

export interface IssueSemanticEvaluation {
  legalIssueId: string;
  taskId: string;
  specificity: number;
  factualGrounding: number;
  evidenceGrounding: number;
  positionConsistency: number;
  authorityDiscipline: number;
  application: number;
  completeness: number;
  overallScore: number;
  verdict: EvaluationVerdict;
  revisionMode: RevisionMode;
  deficiencies: string[];
  hardFailReasons: string[];
}

export function toBlockQualityEvaluation(
  evaluation: IssueSemanticEvaluation,
  task: GenerationTask,
): BlockQualityEvaluation {
  const covered = evaluation.verdict === 'PASS'
    ? [...(task.coverageItemIds || [])]
    : [];
  const missing = evaluation.verdict === 'PASS'
    ? []
    : [...(task.coverageItemIds || [])];

  return {
    blockId: `blk-${task.id}`,
    taskId: evaluation.taskId,
    sectionId: task.sectionId,
    factualCoverage: evaluation.factualGrounding,
    legalSupport: evaluation.authorityDiscipline,
    evidenceLinkage: evaluation.evidenceGrounding,
    issueResponsiveness: evaluation.application,
    argumentDepth: evaluation.overallScore,
    specificity: evaluation.specificity,
    completeness: evaluation.completeness,
    repetitionPenalty: 0,
    unsupportedAssertionPenalty: evaluation.hardFailReasons.length > 0 ? 1 : 0,
    overallScore: evaluation.overallScore,
    verdict: evaluation.verdict,
    revisionMode: evaluation.revisionMode,
    deficiencies: [...evaluation.deficiencies],
    coveredCoverageItemIds: covered,
    missingCoverageItemIds: missing,
    hardFailReasons: [...evaluation.hardFailReasons],
  };
}

// ── 1. TIPOS Y ESTRUCTURAS (5B, 5R, 5S) ───────────────────────────────────

export type EvaluationVerdict = 'PASS' | 'WEAK' | 'FAIL';
export type RevisionMode = 'NONE' | 'EXPAND' | 'REWRITE' | 'PATCH';

export interface BlockQualityEvaluation {
  blockId: string;
  taskId: string;
  sectionId?: string;

  // Métricas normalizadas [0.0 .. 1.0]
  factualCoverage: number;       // Uso sustantivo de hechos asignados
  legalSupport: number;          // Fundamento normativo y lógica jurídica
  evidenceLinkage: number;       // Identificación y explicación de pruebas vinculadas
  issueResponsiveness: number;   // Respuesta directa a la controversia asignada (CRÍTICO)
  argumentDepth: number;         // Silogismo jurídico (premisa, subsunción, conclusión)
  specificity: number;           // Densidad de caso vs. boilerplate retórico
  completeness: number;          // Completitud de la respuesta

  // Penalizaciones [0.0 .. 1.0]
  repetitionPenalty: number;     // Penalización por n-gramas repetidos internos o hermanos
  unsupportedAssertionPenalty: number; // Penalización por citas o datos inventados

  // Calificación global ponderada [0.0 .. 1.0]
  overallScore: number;

  verdict: EvaluationVerdict;
  revisionMode: RevisionMode;

  deficiencies: string[];
  coveredCoverageItemIds: string[];
  missingCoverageItemIds: string[];

  hardFailReasons: string[];
  caseDensityMetrics?: {
    entityMentions: number;
    caseFactsUsed: string[];
    evidenceUsed: string[];
    authoritiesUsed: string[];
    genericPhrasesCount: number;
  };
}

export interface DocumentSemanticEvaluation {
  documentId: string;
  blockEvaluations: BlockQualityEvaluation[];
  totalBlocksEvaluated: number;
  passedBlocks: number;
  weakBlocks: number;
  failedBlocks: number;
  averageScore: number;
  overallVerdict: EvaluationVerdict;
  isComplete: boolean;
  uncoveredRequiredItems: string[];
  deficiencies: string[];
}

// ── 2. UMBRALES CENTRALIZADOS (5N, 5Q) ────────────────────────────────────

export const SEMANTIC_THRESHOLDS = {
  PASS_OVERALL: 0.65,
  PASS_ISSUE_RESPONSIVENESS: 0.60,
  PASS_SPECIFICITY: 0.40,
  PASS_FACTUAL_COVERAGE: 0.50,
  PASS_EVIDENCE_LINKAGE: 0.50,
  PASS_ARGUMENT_DEPTH: 0.50,
  MAX_REPETITION_PENALTY: 0.35,
  MAX_UNSUPPORTED_PENALTY: 0.30,
  MAX_SEMANTIC_REVISIONS_PER_TASK: 2,
};

// ── 3. FRASES GENÉRICAS Y CLICHÉS RETÓRICOS (5G) ──────────────────────────

const GENERIC_LEGAL_CLICHES: readonly RegExp[] = [
  /\ben\s+primer\s+lugar\b/gi,
  /\ben\s+segundo\s+lugar\b/gi,
  /\ben\s+tercer\s+lugar\b/gi,
  /\ben\s+consecuencia\b/gi,
  /\bresulta\s+evidente\b/gi,
  /\ba\s+todas\s+luces\b/gi,
  /\bde\s+manera\s+palmaria\b/gi,
  /\bde\s+bulto\b/gi,
  /\bhuelga\s+decir\b/gi,
  /\bes\s+por\s+dem[aá]s\s+sabido\b/gi,
  /\bde\s+las\s+constancias\s+de\s+autos\s+se\s+desprende\s+sin\s+lugar\s+a\s+dudas\b/gi,
  /\bpara\s+todos\s+los\s+efectos\s+legales\s+a\s+que\s+haya\s+lugar\b/gi,
  /\bconforme\s+a\s+derecho\s+y\s+justicia\b/gi,
  /\bjusticia\s+y\s+equidad\b/gi,
  /\bflagrante\s+violaci[oó]n\b/gi,
  /\bviolaci[oó]n\s+manifiesta\b/gi,
  /\bse\s+niega\s+por\s+improcedente\b/gi,
  /\bcarece\s+de\s+acci[oó]n\s+y\s+derecho\b/gi,
  /\bes\s+totalmente\s+falso\b/gi,
  /\bse\s+niega\s+lisa\s+y\s+llanamente\b/gi,
];

// ── 4. HEURÍSTICAS DETERMINISTAS ANTI-GENERICIDAD Y DENSIDAD (5G, 5I) ─────

/**
 * Calcula la densidad de elementos concretos del expediente frente a retórica abstracta.
 */
export function calculateCaseSpecificity(
  text: string,
  task: GenerationTask,
  doc: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis,
): { specificity: number; entityMentions: number; genericPhrasesCount: number } {
  if (!text || typeof text !== 'string') {
    return { specificity: 0, entityMentions: 0, genericPhrasesCount: 0 };
  }

  const normText = text.toLowerCase();

  // 1. Detección de frases cliché abstractas
  let genericPhrasesCount = 0;
  for (const rx of GENERIC_LEGAL_CLICHES) {
    rx.lastIndex = 0;
    const matches = text.match(rx);
    if (matches) genericPhrasesCount += matches.length;
  }

  // 2. Conteo de entidades y datos específicos del caso
  let entityMentions = 0;

  // Nombres de partes
  const parties = [
    doc.parties.quejoso,
    doc.parties.actor,
    doc.parties.demandado,
    doc.parties.autoridadResponsable,
    doc.parties.terceroInteresado,
    caseAnalysis?.parties?.quejoso,
    caseAnalysis?.parties?.actor,
    caseAnalysis?.parties?.demandado,
  ].filter(Boolean) as string[];

  for (const party of parties) {
    const pNorm = party.toLowerCase().trim();
    if (pNorm.length > 3 && normText.includes(pNorm)) {
      entityMentions += 2;
    } else if (pNorm.length > 15) {
      const words = pNorm.split(/\s+/).filter((w) => w.length > 3 && !['tribunal', 'superior', 'sociedad', 'anonima', 'capital', 'variable'].includes(w));
      const matched = words.filter((w) => normText.includes(w));
      if (words.length > 0 && matched.length >= Math.min(2, words.length)) {
        entityMentions += 1.5;
      }
    }
  }

  // Número de expediente / causa
  const expediente = doc.caseRefs?.expediente || caseAnalysis?.caseNumbers?.principal;
  if (expediente && expediente.length > 2 && normText.includes(expediente.toLowerCase())) {
    entityMentions += 2;
  }

  // Artículos normativos citados con número ("artículo 14", "art. 16", "fracción II")
  const articleMatches = text.match(/\b(?:art[íi]culos?|art\.?)\s+\d+(?:\s*(?:bis|ter|qu[aá]ter))?(?:\s*(?:fracci[oó]n|p[aá]rrafo|inciso)\s+[a-z0-9IVXLCDM]+)?/gi);
  if (articleMatches) {
    entityMentions += Math.min(6, articleMatches.length * 1.5);
  }

  // Fechas concretas del caso
  const dateMatches = text.match(/\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+\d{4}\b/gi);
  if (dateMatches) {
    entityMentions += Math.min(5, dateMatches.length * 1.5);
  }

  // Cantidades monetarias o cifras del caso
  const moneyMatches = text.match(/\$\s*[\d,]+(?:\.\d{2})?\s*(?:M\.?N\.?|pesos|MXN)?/gi);
  if (moneyMatches) {
    entityMentions += Math.min(4, moneyMatches.length);
  }

  // Pruebas específicas identificadas
  const evidenceTitles = (task.scopedEvidence || []).map((e: any) => e.title || e.id).filter(Boolean);
  for (const evTitle of evidenceTitles) {
    if (evTitle.length > 4 && normText.includes(evTitle.toLowerCase())) {
      entityMentions += 2.5;
    }
  }

  // Detección de verbos de razonamiento y acción jurídica (uso sustantivo en razonamiento vs. entity-stuffing)
  const normVerbsText = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const reasoningVerbs = normVerbsText.match(/\b(?:acredita(?:n|ba|ndo)?|acredito(?:n)?|demuestra(?:n|ba|ndo)?|demostro(?:n)?|justifica(?:n|ba|ndo)?|justifico(?:n)?|prueba(?:n|ba|ndo)?|probo(?:n)?|evidencia(?:n|ba|ndo)?|evidencio(?:n)?|constata(?:n|ba|ndo)?|constato(?:n)?|transgrede(?:n|ba|ndo)?|transgredio(?:n)?|vulnera(?:n|ba|ndo)?|vulnero(?:n)?|viola(?:n|ba|ndo)?|violo(?:n)?|conculca(?:n|ba|ndo)?|conculco(?:n)?|conculcar|incurre(?:n|ba|ndo)?|incurrio(?:n)?|omite(?:n|ba|ndo)?|omitio(?:n)?|desestima(?:n|ba|ndo)?|desestimo(?:n)?|desconoce(?:n|ba|ndo)?|desconocio(?:n)?|desconocer|emite(?:n|ba|ndo)?|emitio(?:n)?|dicta(?:n|ba|ndo)?|dicto(?:n)?|resuelve(?:n|ba|ndo)?|resolvio(?:n)?|determina(?:n|ba|ndo)?|determino(?:n)?|funda(?:n|ba|ndo)?|fundo(?:n)?|motiva(?:n|ba|ndo)?|motivo(?:n)?|analiza(?:n|ba|ndo)?|analizo(?:n)?|analizar|valora(?:n|ba|ndo)?|valoro(?:n)?|valorar|demanda(?:n|ba|ndo)?|demando(?:n)?|reclama(?:n|ba|ndo)?|reclamo(?:n)?|opone(?:n|ba|ndo)?|opuso(?:n)?|contesta(?:n|ba|ndo)?|contesto(?:n)?|desvirtua(?:n|ba|ndo)?|desvirtuo(?:n)?|celebra(?:n|ba|ndo)?|celebro(?:n)?|pacta(?:n|ba|ndo)?|pacto(?:n)?|incumple(?:n|ba|ndo)?|incumplio(?:n)?|adeuda(?:n|ba|ndo)?|adeudo(?:n)?|notifica(?:n|ba|ndo)?|notifico(?:n)?)\b/gi);
  const reasoningVerbCount = reasoningVerbs ? reasoningVerbs.length : 0;

  // Si hay acumulación de entidades (>= 6) pero nulo razonamiento jurídico (entity-stuffing sin hilación procesal),
  // se castiga la especificidad porque sólo es una lista de datos sin silogismo de fondo.
  let reasoningFactor = 1.0;
  if (entityMentions >= 6 && reasoningVerbCount === 0) {
    reasoningFactor = 0.35;
  } else if (reasoningVerbCount >= 2) {
    reasoningFactor = 1.15;
  }

  // 3. Fórmula de especificidad (0.0 a 1.0)
  // Ratio entre entidades concretas y total ponderado
  const denominator = entityMentions + (genericPhrasesCount * 0.75) + 2;
  const rawSpecificity = Math.min(1.0, Math.max(0.0, entityMentions / denominator));
  const specificity = Math.min(1.0, Math.max(0.0, rawSpecificity * reasoningFactor));

  return {
    specificity,
    entityMentions,
    genericPhrasesCount,
  };
}

// ── 5. DETECCIÓN DE REPETICIÓN SEMÁNTICA MEDIANTE N-GRAMAS (5H) ───────────

/**
 * Tokeniza una cadena en n-gramas de palabras normalizadas para comparación liviana.
 */
function extractWordNGrams(text: string, n: number = 3): Set<string> {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const ngrams = new Set<string>();
  if (words.length < n) {
    if (words.length > 0) ngrams.add(words.join(' '));
    return ngrams;
  }

  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Calcula la similitud de Jaccard entre dos conjuntos de n-gramas.
 */
function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Evalúa la duplicación o repetición tanto entre párrafos del mismo bloque
 * como frente a bloques hermanos (otros agravios o secciones de la misma demanda).
 */
export function calculateRepetitionPenalty(
  text: string,
  siblingTexts: string[] = [],
): { penalty: number; duplicateDetails: string[] } {
  const duplicateDetails: string[] = [];
  if (!text || typeof text !== 'string') return { penalty: 0, duplicateDetails };

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30);

  let internalMaxSim = 0;
  // 1. Similitud interna entre párrafos del mismo bloque
  if (paragraphs.length > 1) {
    const pNgrams = paragraphs.map((p) => extractWordNGrams(p, 3));
    for (let i = 0; i < pNgrams.length; i++) {
      for (let j = i + 1; j < pNgrams.length; j++) {
        const sim = calculateJaccardSimilarity(pNgrams[i], pNgrams[j]);
        if (sim > internalMaxSim) internalMaxSim = sim;
        if (sim > 0.45) {
          duplicateDetails.push(`Párrafos ${i + 1} y ${j + 1} presentan alta redundancia textual (similitud: ${(sim * 100).toFixed(0)}%).`);
        }
      }
    }
  }

  // 2. Similitud frente a bloques hermanos (sibling agravios / contestaciones)
  let siblingMaxSim = 0;
  if (siblingTexts.length > 0) {
    const currentNgrams = extractWordNGrams(text, 3);
    siblingTexts.forEach((sibText, idx) => {
      if (!sibText || sibText.length < 50) return;
      const sibNgrams = extractWordNGrams(sibText, 3);
      const sim = calculateJaccardSimilarity(currentNgrams, sibNgrams);
      if (sim > siblingMaxSim) siblingMaxSim = sim;
      if (sim > 0.40) {
        duplicateDetails.push(`Alta similitud con bloque hermano #${idx + 1} (similitud: ${(sim * 100).toFixed(0)}%). Argumento reciclado sin adaptación al agravio.`);
      }
    });
  }

  // Penalización ponderada: internalMaxSim (hasta 0.6) + siblingMaxSim (hasta 0.5)
  const penalty = Math.min(1.0, Math.max(0.0, (internalMaxSim > 0.4 ? internalMaxSim * 0.7 : 0) + (siblingMaxSim > 0.35 ? siblingMaxSim * 0.8 : 0)));

  return { penalty, duplicateDetails };
}

// ── 6. EVALUACIÓN DE VINCULACIÓN PROBATORIA (5K, 5J) ───────────────────────

/**
 * Evalúa si las pruebas asignadas fueron efectivamente identificadas,
 * utilizadas y concatenadas al argumento probatorio.
 */
export function evaluateEvidenceLinkage(
  text: string,
  task: GenerationTask,
): { score: number; evidenceUsed: string[]; deficiencies: string[] } {
  const deficiencies: string[] = [];
  const evidenceUsed: string[] = [];

  const scopedEv = task.scopedEvidence || [];
  const evIds = task.evidenceIds || [];

  // Si la tarea NO requiere pruebas (5J: no penalizar artificialmente)
  if (scopedEv.length === 0 && evIds.length === 0) {
    return { score: 1.0, evidenceUsed: [], deficiencies: [] };
  }

  const normText = text.toLowerCase();

  // Verbos probatorios forenses
  const hasProofReasoning = /\b(?:acredita|demuestra|se\s+desprende|hace\s+constar|constatado|obra\s+a\s+fojas|desahogad[ao]|justifica|pone\s+de\s+manifiesto)\b/i.test(text);

  // Mención vacía ("de las pruebas se desprende" sin mencionar cuál)
  const hasHollowReference = /\b(?:de\s+las\s+pruebas\s+se\s+desprende|conforme\s+a\s+las\s+pruebas|las\s+probanzas\s+de\s+autos)\b/i.test(text);

  let matchCount = 0;
  for (const ev of scopedEv) {
    const title = (ev.title || ev.id || '').toLowerCase().trim();
    const type = (ev.type || '').toLowerCase().trim();
    const desc = (ev.description || '').toLowerCase().trim();

    const titleFound = title.length > 3 && normText.includes(title);
    const descFound = desc.length > 6 && normText.includes(desc);
    const typeFound = type.length > 5 && normText.includes(type);

    if (titleFound || descFound || typeFound) {
      matchCount++;
      evidenceUsed.push(ev.title || ev.id);
    } else {
      deficiencies.push(`No identifica ni explica la relevancia de la prueba asignada: "${ev.title || ev.id}".`);
    }
  }

  let score = scopedEv.length > 0 ? matchCount / scopedEv.length : 0.5;

  if (hasProofReasoning && matchCount > 0) {
    score = Math.min(1.0, score + 0.2);
  } else if (hasHollowReference && matchCount === 0) {
    score = 0.15;
    deficiencies.push('Cita genérica a "pruebas" sin nombrar ni vincular las pruebas concretas del expediente.');
  } else if (!hasProofReasoning && matchCount > 0) {
    score = Math.max(0.4, score - 0.2);
    deficiencies.push('Menciona la prueba pero omite explicar qué extremo fáctico acredita o desvirtúa.');
  }

  return { score: Math.min(1.0, Math.max(0.0, score)), evidenceUsed, deficiencies };
}

// ── 7. EVALUACIÓN DE COBERTURA FÁCTICA (5C) ────────────────────────────────

export function evaluateFactualCoverage(
  text: string,
  task: GenerationTask,
): { score: number; caseFactsUsed: string[]; deficiencies: string[] } {
  const deficiencies: string[] = [];
  const caseFactsUsed: string[] = [];
  const scopedFacts = task.scopedFacts || [];

  if (scopedFacts.length === 0 && (!task.factIds || task.factIds.length === 0)) {
    return { score: 1.0, caseFactsUsed: [], deficiencies: [] };
  }

  const normText = text.toLowerCase();
  let usedCount = 0;

  for (const f of scopedFacts) {
    const fText = (f.text || '').toLowerCase().trim();
    // Fragmentar el hecho en términos clave significativos (> 4 letras)
    const keywords = fText.split(/\s+/).filter((w: string) => w.length > 4 && !['parte', 'fecha', 'mismo', 'dicho', 'sobre', 'autos'].includes(w));
    const matchedWords = keywords.filter((kw: string) => normText.includes(kw));

    if (matchedWords.length >= Math.min(3, keywords.length)) {
      usedCount++;
      caseFactsUsed.push(f.id || fText.slice(0, 30));
    } else {
      deficiencies.push(`Omite utilizar el hecho relevante: "${(f.text || f.id).slice(0, 70)}...".`);
    }
  }

  const score = scopedFacts.length > 0 ? usedCount / scopedFacts.length : 0.6;
  return { score: Math.min(1.0, Math.max(0.0, score)), caseFactsUsed, deficiencies };
}

// ── 8. EVALUACIÓN DE RESPUESTA A LA CONTROVERSIA / ISSUE RESPONSIVENESS (5F)

export function evaluateIssueResponsiveness(
  text: string,
  task: GenerationTask,
): { score: number; deficiencies: string[] } {
  const deficiencies: string[] = [];
  if (!text || typeof text !== 'string') {
    return { score: 0, deficiencies: ['Texto inexistente para evaluar el issue.'] };
  }

  const normText = text.toLowerCase();
  const title = (task.title || task.label || '').toLowerCase();
  const obj = (task.objective || '').toLowerCase();
  const targetConsideration = (task.issuePlan?.targetConsideration || '').toLowerCase();
  const counterStrategy = (task.issuePlan?.counterargumentStrategy || '').toLowerCase();
  const standard = (task.issuePlan?.constitutionalStandard || '').toLowerCase();

  // Si la tarea es de ISSUE (Agravio / Concepto de Violación)
  if (task.taskType === 'ISSUE' || task.type === 'ISSUE') {
    // 1. Extraer conceptos clave de la consideración impugnada
    const keyTerms = [
      ...title.split(/\s+/),
      ...targetConsideration.split(/\s+/),
      ...counterStrategy.split(/\s+/),
    ].filter((w) => w.length > 5 && !['agravio', 'articulo', 'derecho', 'tribunal', 'primero', 'segundo'].includes(w));

    const matchedTerms = keyTerms.filter((term) => normText.includes(term));
    const termRatio = keyTerms.length > 0 ? matchedTerms.length / keyTerms.length : 0.5;

    // Detectar si el texto es 100% retórica abstracta sin tocar el fondo combatido
    const hasSpecificControversy = termRatio >= 0.25 || (standard.length > 5 && normText.includes(standard.slice(0, 20)));

    if (!hasSpecificControversy) {
      deficiencies.push(`El argumento es genérico y no responde a la controversia asignada ("${task.title}"). Diserta sobre principios generales sin refutar la consideración impugnada.`);
      return { score: 0.20, deficiencies };
    }

    // Verificar silogismo de agravio: (1) Acto impugnado, (2) Precepto vulnerado, (3) Razonamiento de por qué causa agravio
    const mentionsAct = targetConsideration.length > 0
      ? targetConsideration.split(/\s+/).some((w) => w.length > 5 && normText.includes(w))
      : /\b(?:resoluci[oó]n|sentencia|acuerdo|determinaci[oó]n|considerando|acto\s+reclamado)\b/i.test(text);

    const explainsDamage = /\b(?:causa\s+agravio|deja\s+en\s+estado\s+de\s+indefensi[oó]n|violenta|transgrede|incurre\s+en\s+incongruencia|omite\s+pronunciarse|desestima\s+indebidamente)\b/i.test(text);

    let score = 0.5 + (termRatio * 0.3) + (mentionsAct ? 0.1 : 0) + (explainsDamage ? 0.1 : 0);
    return { score: Math.min(1.0, Math.max(0.1, score)), deficiencies };
  }

  // Tareas de pretensión o hecho
  return { score: 0.85, deficiencies: [] };
}

// ── 9. EVALUACIÓN DE PROFUNDIDAD EN CONTESTACIONES (5D, 5E) ───────────────

export function evaluateClaimDepth(
  text: string,
  task: GenerationTask,
): { score: number; deficiencies: string[] } {
  const deficiencies: string[] = [];
  const words = text.trim().split(/\s+/).length;

  // "Se niega por improcedente" o respuestas telegráficas < 12 palabras
  if (words < 12 || /^\s*(?:se\s+niega|se\s+rechaza|es\s+improcedente|se\s+niega\s+por\s+improcedente)[\s\.]*$/i.test(text.trim())) {
    deficiencies.push(`Contestación superficial de la prestación ("${task.title}"). Carece de razón fáctica y defensa de fondo.`);
    return { score: 0.15, deficiencies };
  }

  const hasStance = /\b(?:es\s+improcedente|se\s+niega|se\s+allana|se\s+admite|carece\s+de\s+derecho|no\s+asiste\s+derecho|no\s+ha\s+lugar|se\s+opone)\b/i.test(text);
  const hasReasoning = /\b(?:en\s+virtud\s+de\s+que|toda\s+vez\s+que|en\s+raz[oó]n\s+de|por\s+cuanto\s+a\s+que|atendiendo\s+a\s+que|por\s+no\s+cumplirse|debido\s+a\s+que|al\s+actualizarse)\b/i.test(text);
  const hasDefense = /\b(?:excepci[oó]n|defensa|falta\s+de\s+acci[oó]n|pago|prescripci[oó]n|plus\s+peticio|oscuridad|incompetencia|inexigibilidad)\b/i.test(text);

  const requiresException = Boolean(task.claimPlan?.relatedExceptionIds && task.claimPlan.relatedExceptionIds.length > 0);

  let score = 0.4;
  if (hasStance) score += 0.25;
  if (hasReasoning) score += 0.25;

  if (requiresException) {
    if (hasDefense) score += 0.1;
    else deficiencies.push('No menciona la excepción o defensa vinculada a esta prestación.');
  } else {
    // Si no requiere excepción vinculada en el plan, otorgar el componente de defensa por razonar de fondo
    score += 0.1;
  }

  return { score: Math.min(1.0, score), deficiencies };
}

export function evaluateFactResponseDepth(
  text: string,
  task: GenerationTask,
): { score: number; deficiencies: string[] } {
  const deficiencies: string[] = [];
  const words = text.trim().split(/\s+/).length;
  const isUncontested = task.factResponsePlan?.contestedStatus === 'uncontested'
    || task.factResponsePlan?.position === 'ADMIT'
    || task.complexity === 'SHORT';

  // Si el hecho no está controvertido o es de aceptación simple (personalidad, relación laboral básica sin disputa), "Es cierto" es jurídicamente idóneo y suficiente
  if (isUncontested) {
    const isAdmit = /\b(?:es\s+cierto|se\s+admite|cierto|se\s+reconoce|se\s+tiene\s+por\s+cierto)\b/i.test(text);
    if (isAdmit) {
      return { score: 1.0, deficiencies: [] };
    }
  }

  // "Es falso" o respuestas telegráficas < 12 palabras en hechos controvertidos/complejos
  if (words < 12 || /^\s*(?:es\s+falso|se\s+niega|se\s+ignora)[\s\.]*$/i.test(text.trim())) {
    deficiencies.push(`Respuesta telegráfica al hecho controvertido ("${task.title}"). No aporta circunstanciación ni versión propia sustentada.`);
    return { score: 0.15, deficiencies };
  }

  const hasPosture = /\b(?:es\s+cierto|es\s+falso|se\s+ignora|no\s+es\s+hecho\s+propio|es\s+parcialmente\s+cierto|se\s+niega)\b/i.test(text);
  const hasClarification = /\b(?:aclarando\s+que|la\s+realidad\s+de\s+los\s+hechos|en\s+cuanto\s+a|lo\s+cierto\s+es\s+que|siendo\s+lo\s+verdadero|toda\s+vez\s+que|por\s+cuanto\s+a)\b/i.test(text);
  const hasProofMention = /\b(?:se\s+acreditar[aá]|obra\s+en|como\s+se\s+demostrar[aá]|conforme\s+a\s+la\s+prueba|consta\s+en)\b/i.test(text);

  let score = 0.4;
  if (hasPosture) score += 0.25;
  if (hasClarification) score += 0.25;
  if (hasProofMention) score += 0.1;

  return { score: Math.min(1.0, score), deficiencies };
}

// ── 10. DETECCIÓN DE AFIRMACIONES NO SUSTENTADAS Y FABRICACIONES (5L, 5J) ──

export function detectUnsupportedAssertions(
  text: string,
  task: GenerationTask,
  caseAnalysis?: CaseAnalysis,
): { penalty: number; hardFailReasons: string[]; deficiencies: string[] } {
  const hardFailReasons: string[] = [];
  const deficiencies: string[] = [];
  let penalty = 0;

  // 1. Detección de marcadores seed residuales ([Desarrollar por la IA...])
  if (hasSeedMarkers(text)) {
    hardFailReasons.push('SEED_MARKER_PRESENT: el bloque contiene marcadores de semilla no resueltos.');
    deficiencies.push('El bloque conserva texto de plantilla no desarrollado por IA.');
    penalty = 1.0;
  }

  // 2. Detección de dependencias fácticas no resueltas ([DATO PENDIENTE DE EXPEDIENTE:...])
  if (hasUnresolvedFactualDependencies(text)) {
    const deps = extractUnresolvedFactualDependencies(text);
    hardFailReasons.push(`UNRESOLVED_FACTUAL_DEPENDENCY: contiene datos pendientes de expediente: ${deps.join(', ')}.`);
    deficiencies.push(`El bloque contiene marcadores de dependencia fáctica no resuelta: ${deps.join(', ')}.`);
    penalty = 1.0;
  }

  // 3. Detección de jurisprudencia fabricada (5J, 5L)
  // Separa citas CONCRETAS (Registro Digital de 5+ dígitos, Tesis con número/época) de menciones doctrinarias o generales a la SCJN
  const concreteCitationRegex = /\b(?:registro\s*digital\s*[:\.]?\s*(\d{5,})|tesis\s*[:\.]?\s*([0-9a-z\.\/]{4,}))\b/gi;
  const generalJurisprudenceRegex = /\b(?:jurisprudencia\s+de\s+la\s+suprema\s+corte|criterios?\s+jurisprudenciales?|jurisprudencia\s+por\s+reiteraci[oó]n|jurisprudencia\s+por\s+contradicci[oó]n)\b/gi;

  let match: RegExpExecArray | null;
  const concreteCitations: string[] = [];
  while ((match = concreteCitationRegex.exec(text)) !== null) {
    concreteCitations.push(match[0].trim());
  }

  const allowedAuthorities = [
    ...(task.scopedAuthorities || []).map((a: any) => typeof a === 'string' ? a : (a.registro || a.citation || a.rubro || '')),
    ...(caseAnalysis?.authorities || []).map((a: any) => typeof a === 'string' ? a : (a.registro || a.citation || a.rubro || '')),
  ].map((s) => s.toLowerCase());

  if (concreteCitations.length > 0) {
    const fabricatedConcrete = concreteCitations.filter((cit) => {
      const cNorm = cit.toLowerCase();
      return !allowedAuthorities.some((auth) => auth.length > 3 && (auth.includes(cNorm) || cNorm.includes(auth)));
    });

    if (fabricatedConcrete.length > 0) {
      hardFailReasons.push(`FABRICATED_AUTHORITY: cita registros o tesis específicas inventadas: ${fabricatedConcrete.join('; ')}.`);
      deficiencies.push(`Invención de autoridades judiciales con registro específico: ${fabricatedConcrete.join('; ')}.`);
      penalty = 1.0;
    }
  }

  // Menciones genéricas a jurisprudencia de la SCJN sin registro específico inventado: penalización suave, NUNCA hard fail
  if (generalJurisprudenceRegex.test(text) && allowedAuthorities.length === 0 && concreteCitations.length === 0) {
    penalty = Math.max(penalty, 0.05);
    deficiencies.push('Invocación de jurisprudencia genérica sin número de registro ni tesis autorizada en autos.');
  }

  return { penalty, hardFailReasons, deficiencies };
}

// ── 11. EVALUACIÓN SEMÁNTICA DEL ISSUE (FASE 4) ───────────────────────────

function issueDraftText(result: IssueDraftResult): string {
  return [
    result.thesis,
    ...result.factualDevelopment,
    ...result.evidentiaryDevelopment,
    ...result.legalDevelopment,
    result.counterPosition || '',
    result.application,
    result.conclusion,
  ].filter(Boolean).join('\n');
}

function normalizedTokens(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 4);
}

const CONCRETE_AUTHORITY_CITATION_PATTERN = /\b(?:art[íi]culo|art\.?|tesis|jurisprudencia|registro(?:\s+digital)?)\s+(?:[a-záéíóúñ0-9./-]+\s+)*\d+\b/gi;
const FACT_ASSERTION_PATTERN = /\b(?:acredit(?:ó|o)|demostr(?:ó|o)|prob(?:ó|o)|cumpli(?:ó|o)|incumpli(?:ó|o)|se\s+verific(?:ó|o)|qued(?:ó|o)\s+acreditad[oa])(?=\s|$)([^.!?;\n]*)/gi;
const FACT_ASSERTION_STOPWORDS = new Set([
  'acredito', 'demostro', 'probo', 'cumplio', 'incumplio', 'verifico', 'quedo',
  'parte', 'actor', 'actora', 'demandado', 'demandada', 'expediente', 'hecho',
  'hechos', 'prueba', 'pruebas', 'autos', 'constancia', 'constancias', 'documento',
]);

function normalizeCitation(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function concreteAuthorityCitations(text: string): string[] {
  return text.match(CONCRETE_AUTHORITY_CITATION_PATTERN) || [];
}

function citationIsAllowed(citation: string, allowedCitations: string[]): boolean {
  const normalized = normalizeCitation(citation);
  return allowedCitations.some((allowed) => allowed.includes(normalized) || normalized.includes(allowed));
}

function detectVerifiedPropositionOverclaim(result: IssueDraftResult, pack: IssueContextPack): boolean {
  const verifiedAuthorities = pack.verifiedResearch?.authorities || [];
  if (verifiedAuthorities.length === 0 || (result.verifiedAuthorityIds || []).length === 0) return false;

  const usedIds = new Set(result.verifiedAuthorityIds || []);
  const factAndEvidenceText = [
    ...pack.facts.map((item) => item.proposition),
    ...pack.evidenceMentions.map((item) => item.description),
    ...pack.evidenceOffers.map((item) => item.id),
  ].join(' ');
  const groundedTokens = new Set(normalizedTokens(factAndEvidenceText));
  const groundedSingleTokens = new Set((factAndEvidenceText.match(/\b[A-ZÁÉÍÓÚÑ]\b/g) || []).map((token) => token.toLowerCase()));

  return verifiedAuthorities.some((authority) => {
    if (!usedIds.has(authority.id)) return false;
    const hasFactLimitation = authority.proposition.limitations.some((limitation) =>
      /\b(?:no\s+acredita|no\s+demuestra|no\s+prueba|no\s+establece|por\s+si\s+misma)\b/i.test(limitation));
    if (!hasFactLimitation) return false;

    let match: RegExpExecArray | null;
    while ((match = FACT_ASSERTION_PATTERN.exec(result.application)) !== null) {
      const assertedTail = match[1] || '';
      const assertedWords = normalizedTokens(assertedTail)
        .filter((token) => !FACT_ASSERTION_STOPWORDS.has(token));
      const assertedSingleTokens = (assertedTail.match(/\b[A-ZÁÉÍÓÚÑ]\b/g) || [])
        .map((token) => token.toLowerCase());
      const substantiveTokens = [...assertedWords, ...assertedSingleTokens];
      if (substantiveTokens.length > 0 && !substantiveTokens.some((token) => groundedTokens.has(token) || groundedSingleTokens.has(token))) {
        FACT_ASSERTION_PATTERN.lastIndex = 0;
        return true;
      }
    }
    FACT_ASSERTION_PATTERN.lastIndex = 0;
    return false;
  });
}

function containsAnyToken(text: string, source: string): boolean {
  const tokens = normalizedTokens(source);
  return tokens.length > 0 && tokens.some((token) => text.includes(token));
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function hasConcreteAuthorityCitation(text: string): boolean {
  return /\b(?:art[íi]culo|art\.?|tesis|jurisprudencia|registro)\s+(?:[a-záéíóúñ]+\s+)*\d+/i.test(text);
}

/**
 * Evalúa un resultado ya validado en el límite issue-scoped.
 *
 * Esta evaluación mide trazabilidad, grounding y completitud de la salida;
 * no decide si una regla jurídica es materialmente correcta.
 */
export function evaluateIssueDraftResult(
  result: IssueDraftResult,
  task: GenerationTask,
  doc: UniversalLegalDocument,
  pack: IssueContextPack,
): IssueSemanticEvaluation {
  const text = issueDraftText(result).toLowerCase();
  const deficiencies: string[] = [];
  const hardFailReasons: string[] = [];
  const allowedSourceIds = new Set([
    ...pack.claims.map((item) => item.id),
    ...pack.facts.map((item) => item.id),
    ...pack.evidenceMentions.map((item) => item.id),
    ...pack.evidenceOffers.map((item) => item.id),
    ...pack.sourceArguments.map((item) => item.id),
  ]);
  const allowedAuthorityIds = new Set(pack.authorities.map((item) => item.id));
  const verifiedAuthorities = pack.verifiedResearch?.authorities || [];
  const allowedVerifiedAuthorityIds = new Set(verifiedAuthorities.map((item) => item.id));

  const outOfScopeSources = result.sourceEntityIds.filter((id) => !allowedSourceIds.has(id));
  if (outOfScopeSources.length > 0) {
    pushUnique(hardFailReasons, 'SOURCE_ENTITY_OUT_OF_SCOPE');
    if (outOfScopeSources.some((id) => id.toLowerCase().includes('offer'))) {
      pushUnique(hardFailReasons, 'EVIDENCE_OFFER_OUT_OF_SCOPE');
    }
  }

  const outOfScopeAuthorities = result.authorityMentionIds.filter((id) => !allowedAuthorityIds.has(id));
  if (outOfScopeAuthorities.length > 0) pushUnique(hardFailReasons, 'AUTHORITY_OUT_OF_SCOPE');

  const outOfScopeVerifiedAuthorities = (result.verifiedAuthorityIds || [])
    .filter((id) => !allowedVerifiedAuthorityIds.has(id));
  if (outOfScopeVerifiedAuthorities.length > 0) pushUnique(hardFailReasons, 'VERIFIED_AUTHORITY_OUT_OF_SCOPE');

  const allowedAuthorityCitations = [
    ...pack.authorities.map((item) => item.citationText),
    ...verifiedAuthorities.map((item) => item.identity.canonicalCitation),
  ].map(normalizeCitation);
  const concreteCitations = concreteAuthorityCitations(text);
  const hasOutOfScopeCitation = concreteCitations.some((citation) => !citationIsAllowed(citation, allowedAuthorityCitations));
  if (hasOutOfScopeCitation) pushUnique(hardFailReasons, 'AUTHORITY_CITATION_OUT_OF_SCOPE');

  if (hasConcreteAuthorityCitation(text) && pack.authorities.length === 0 && verifiedAuthorities.length === 0) {
    pushUnique(hardFailReasons, 'AUTHORITY_OUT_OF_SCOPE');
  }
  if (detectVerifiedPropositionOverclaim(result, pack)) {
    pushUnique(hardFailReasons, 'VERIFIED_PROPOSITION_OVERCLAIM');
  }

  const issueTerms = [pack.legalIssue.question, ...pack.coverage.map((item) => item.description || item.title || '')]
    .flatMap(normalizedTokens);
  const issueTermMatches = issueTerms.filter((term) => text.includes(term)).length;
  const specificity = Math.min(1, Math.max(
    issueTermMatches > 0 ? 0.65 : 0.55,
    result.sourceEntityIds.length > 0 ? 0.65 : 0,
    calculateCaseSpecificity(issueDraftText(result), task, doc).specificity,
  ));
  if (specificity < SEMANTIC_THRESHOLDS.PASS_SPECIFICITY) {
    deficiencies.push('ISSUE_SPECIFICITY_LOW');
  }

  const factIds = new Set(pack.facts.map((item) => item.id));
  const groundedFacts = result.sourceEntityIds.filter((id) => factIds.has(id));
  let factualGrounding = result.factualDevelopment.length > 0 ? 0.45 : 0;
  if (groundedFacts.length > 0) factualGrounding += 0.45;
  if (pack.facts.some((fact) => containsAnyToken(text, fact.proposition))) factualGrounding += 0.1;
  factualGrounding = Math.min(1, factualGrounding);
  if (pack.facts.length > 0 && groundedFacts.length === 0) deficiencies.push('FACTUAL_GROUNDING_MISSING');

  const evidenceIds = new Set([
    ...pack.evidenceMentions.map((item) => item.id),
    ...pack.evidenceOffers.map((item) => item.id),
  ]);
  const groundedEvidence = result.sourceEntityIds.filter((id) => evidenceIds.has(id));
  let evidenceGrounding = result.evidentiaryDevelopment.length > 0 ? 0.45 : 0;
  if (groundedEvidence.length > 0) evidenceGrounding += 0.45;
  if (pack.evidenceMentions.length === 0 && pack.evidenceOffers.length === 0) evidenceGrounding = 1;
  evidenceGrounding = Math.min(1, evidenceGrounding);
  if (evidenceIds.size > 0 && groundedEvidence.length === 0) deficiencies.push('EVIDENCE_GROUNDING_MISSING');

  let positionConsistency = 1;
  if (pack.clientPosition?.status === 'CONFIRMED') {
    const contradiction = result.counterPosition
      ? /\b(?:se\s+niega|niega|desconoce|rechaza|contradice|es\s+falso)\b/i.test(result.counterPosition)
      : false;
    if (contradiction) {
      positionConsistency = 0;
      pushUnique(hardFailReasons, 'CLIENT_POSITION_CONTRADICTION');
    }
  }

  const authorityDiscipline = outOfScopeAuthorities.length > 0
    || outOfScopeVerifiedAuthorities.length > 0
    || hasOutOfScopeCitation
    || (hasConcreteAuthorityCitation(text) && pack.authorities.length === 0 && verifiedAuthorities.length === 0)
    ? 0
    : result.authorityMentionIds.length > 0 || (result.verifiedAuthorityIds || []).length > 0
      ? 1
      : 0.75;

  const descriptive = result.draftContract === 'DESCRIPTIVE';
  const application = descriptive
    ? (issueTermMatches > 0 ? 1 : result.sourceEntityIds.length > 0 ? 0.75 : 0)
    : result.application.trim().length > 0
      ? (containsAnyToken(result.application.toLowerCase(), pack.legalIssue.question) ? 1 : 0.75)
      : 0;
  if (!descriptive && application === 0) deficiencies.push('APPLICATION_MISSING');

  if (descriptive && result.factualDevelopment.length === 0) {
    deficiencies.push('FACTUAL_DEVELOPMENT_MISSING');
  }
  if (descriptive && (pack.authorities.length > 0 || pack.sourceArguments.length > 0) && result.legalDevelopment.length === 0) {
    deficiencies.push('LEGAL_DEVELOPMENT_MISSING');
  }

  const requiredComponents = descriptive
    ? [
      result.factualDevelopment.join(' ').trim(),
      ...(pack.evidenceMentions.length > 0 || pack.evidenceOffers.length > 0
        ? [result.evidentiaryDevelopment.join(' ').trim()]
        : []),
      ...(pack.authorities.length > 0 || pack.sourceArguments.length > 0
        ? [result.legalDevelopment.join(' ').trim()]
        : []),
    ]
    : [
      result.thesis.trim(),
      result.factualDevelopment.join(' ').trim(),
      result.evidentiaryDevelopment.join(' ').trim(),
      result.legalDevelopment.join(' ').trim(),
      result.conclusion.trim(),
      result.application.trim(),
    ];
  const completeness = requiredComponents.filter(Boolean).length / requiredComponents.length;
  if (completeness < 1) deficiencies.push('ISSUE_COMPONENTS_INCOMPLETE');

  const dimensions = [
    specificity,
    factualGrounding,
    evidenceGrounding,
    positionConsistency,
    authorityDiscipline,
    application,
    completeness,
  ];
  const overallScore = dimensions.reduce((sum, value) => sum + value, 0) / dimensions.length;
  const repairableWeakness = hardFailReasons.length === 0 && deficiencies.length > 0;
  const verdict: EvaluationVerdict = hardFailReasons.length > 0
    ? 'FAIL'
    : repairableWeakness || overallScore < SEMANTIC_THRESHOLDS.PASS_OVERALL
      ? 'WEAK'
      : 'PASS';
  const revisionMode: RevisionMode = verdict === 'PASS'
    ? 'NONE'
    : verdict === 'FAIL'
      ? 'REWRITE'
      : deficiencies.includes('APPLICATION_MISSING') || deficiencies.includes('EVIDENCE_GROUNDING_MISSING')
        ? 'PATCH'
        : 'EXPAND';

  return {
    legalIssueId: result.legalIssueId,
    taskId: task.id,
    specificity,
    factualGrounding,
    evidenceGrounding,
    positionConsistency,
    authorityDiscipline,
    application,
    completeness,
    overallScore,
    verdict,
    revisionMode,
    deficiencies,
    hardFailReasons,
  };
}

// ── 12. EVALUADOR PRINCIPAL POR BLOQUE (5B, 5N, 5P, 5S) ───────────────────

export function evaluateBlockQuality(
  block: ContentBlock,
  task: GenerationTask,
  doc: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis,
  siblingBlocks: ContentBlock[] = [],
): BlockQualityEvaluation {
  const text = block.text || '';
  const hardFailReasons: string[] = [];
  const deficiencies: string[] = [];
  const taskCovIds = task.coverageItemIds || [task.targetIssueId, task.targetClaimId, task.targetFactId].filter(Boolean) as string[];

  // Unresolved markers and local/deterministic fallback text cannot satisfy a
  // substantive CoverageItem. Keep the normal evaluator running so existing
  // factual/legal hard-fail reasons are preserved alongside this reason.
  const coverageEligibility = taskCovIds.length > 0 ? assessCoverageEligibility(block) : null;

  // A. Bloque vacío
  if (!text.trim()) {
    hardFailReasons.push('EMPTY_REQUIRED_BLOCK: el bloque está completamente vacío.');
    return {
      blockId: block.id,
      taskId: task.id,
      sectionId: task.sectionId,
      factualCoverage: 0,
      legalSupport: 0,
      evidenceLinkage: 0,
      issueResponsiveness: 0,
      argumentDepth: 0,
      specificity: 0,
      completeness: 0,
      repetitionPenalty: 0,
      unsupportedAssertionPenalty: 1.0,
      overallScore: 0,
      verdict: 'FAIL',
      revisionMode: 'REWRITE',
      deficiencies: ['Bloque vacío que requiere redacción'],
      coveredCoverageItemIds: [],
      missingCoverageItemIds: task.coverageItemIds || [],
      hardFailReasons,
    };
  }

  // B. Truncamiento no resuelto
  if (block.generationStatus === 'truncated' || task.isTruncated) {
    hardFailReasons.push('UNRESOLVED_TRUNCATION: el bloque quedó truncado por límite de tokens.');
  }

  // C. Chequeo de afirmaciones no sustentadas / marcadores / jurisprudencia fabricada
  const unsupported = detectUnsupportedAssertions(text, task, caseAnalysis);
  hardFailReasons.push(...unsupported.hardFailReasons);
  deficiencies.push(...unsupported.deficiencies);
  if (coverageEligibility && !coverageEligibility.eligible) {
    hardFailReasons.push(coverageEligibility.reason);
    deficiencies.push('Coverage no elegible: ' + coverageEligibility.reason);
  }

  // D. Especificidad y densidad del caso (5G, 5I)
  const specificityRes = calculateCaseSpecificity(text, task, doc, caseAnalysis);
  const specificity = specificityRes.specificity;
  if (specificity < SEMANTIC_THRESHOLDS.PASS_SPECIFICITY) {
    deficiencies.push(`Baja densidad de elementos del caso (especificidad: ${(specificity * 100).toFixed(0)}%). Abuso de frases retóricas genéricas.`);
  }

  // E. Repetición y duplicación (5H)
  const siblingTexts = siblingBlocks.filter((b) => b.id !== block.id).map((b) => b.text || '');
  const repetition = calculateRepetitionPenalty(text, siblingTexts);
  deficiencies.push(...repetition.duplicateDetails);

  // F. Vinculación probatoria (5K)
  const evidenceRes = evaluateEvidenceLinkage(text, task);
  deficiencies.push(...evidenceRes.deficiencies);

  // G. Cobertura fáctica (5C)
  const factsRes = evaluateFactualCoverage(text, task);
  deficiencies.push(...factsRes.deficiencies);

  // H. Respuesta a la controversia (5F)
  const issueRes = evaluateIssueResponsiveness(text, task);
  deficiencies.push(...issueRes.deficiencies);

  // I. Calidad especializada por tipo de tarea (5D, 5E)
  let argumentDepth = 0.65;
  if (task.taskType === 'CLAIM' || task.type === 'CLAIM') {
    const claimRes = evaluateClaimDepth(text, task);
    argumentDepth = claimRes.score;
    deficiencies.push(...claimRes.deficiencies);
  } else if (task.taskType === 'FACT_RESPONSE' || task.type === 'FACT_RESPONSE') {
    const factRespRes = evaluateFactResponseDepth(text, task);
    argumentDepth = factRespRes.score;
    deficiencies.push(...factRespRes.deficiencies);
  } else if (task.taskType === 'ISSUE' || task.type === 'ISSUE') {
    argumentDepth = issueRes.score;
  }

  // J. Soporte legal (5J: si no hay tesis en contexto, fundamento con normas y lógica es válido; para hechos no se exige cita de ley)
  const isFactResponse = task.taskType === 'FACT_RESPONSE' || task.type === 'FACT_RESPONSE';
  const hasNormCitations = /\b(?:art[íi]culos?|c[oó]digo|ley|constituci[oó]n|convenci[oó]n|jurisprudencia)\b/i.test(text);
  const legalSupport = isFactResponse ? 0.85 : (hasNormCitations ? 0.85 : 0.45);
  if (!hasNormCitations && !isFactResponse) {
    deficiencies.push('Ausencia de invocación de preceptos normativos aplicables.');
  }

  // K. Completitud global
  const completeness = Math.min(1.0, (factsRes.score * 0.4) + (evidenceRes.score * 0.3) + (issueRes.score * 0.3));

  // L. Ponderación de Score Global (0.0 .. 1.0)
  const positiveScore =
    (factsRes.score * 0.15) +
    (legalSupport * 0.15) +
    (evidenceRes.score * 0.15) +
    (issueRes.score * 0.25) +
    (argumentDepth * 0.15) +
    (specificity * 0.15);

  const overallScore = Math.min(1.0, Math.max(0.0, positiveScore - repetition.penalty - unsupported.penalty));

  // M. Decisión de Veredicto (5N)
  // Dimensiones NO compensables: issueResponsiveness, specificity, factualCoverage (si hay scopedFacts), evidenceLinkage (si hay scopedEvidence)
  const hasScopedFacts = Boolean(task.scopedFacts && task.scopedFacts.length > 0);
  const hasScopedEvidence = Boolean(task.scopedEvidence && task.scopedEvidence.length > 0);

  const passesNonCompensable =
    issueRes.score >= SEMANTIC_THRESHOLDS.PASS_ISSUE_RESPONSIVENESS &&
    specificity >= SEMANTIC_THRESHOLDS.PASS_SPECIFICITY &&
    (!hasScopedFacts || factsRes.score >= SEMANTIC_THRESHOLDS.PASS_FACTUAL_COVERAGE) &&
    (!hasScopedEvidence || evidenceRes.score >= SEMANTIC_THRESHOLDS.PASS_EVIDENCE_LINKAGE) &&
    repetition.penalty <= SEMANTIC_THRESHOLDS.MAX_REPETITION_PENALTY;

  let verdict: EvaluationVerdict = 'PASS';
  if (hardFailReasons.length > 0) {
    verdict = 'FAIL';
  } else if (
    overallScore >= SEMANTIC_THRESHOLDS.PASS_OVERALL &&
    passesNonCompensable
  ) {
    verdict = 'PASS';
  } else {
    verdict = 'WEAK';
  }

  // N. Modo de Revisión (5P)
  let revisionMode: RevisionMode = 'NONE';
  if (verdict !== 'PASS') {
    if (repetition.penalty > 0.30 || specificity < 0.30 || issueRes.score < 0.45 || hardFailReasons.length > 0) {
      // Bloque genérico, repetitivo o desviado de tema: reescribir completo
      revisionMode = 'REWRITE';
    } else if (evidenceRes.score < 0.5 && factsRes.score >= 0.6) {
      // Solo le falta integrar la prueba
      revisionMode = 'PATCH';
    } else {
      // Bloque bien encaminado pero incompleto
      revisionMode = 'EXPAND';
    }
  }

  // O. Trazabilidad por item de cobertura (5S)
  const coveredCoverageItemIds: string[] = [];
  const missingCoverageItemIds: string[] = [];

  if (verdict === 'PASS') {
    coveredCoverageItemIds.push(...taskCovIds);
  } else {
    missingCoverageItemIds.push(...taskCovIds);
  }

  return {
    blockId: block.id,
    taskId: task.id,
    sectionId: task.sectionId,
    factualCoverage: factsRes.score,
    legalSupport,
    evidenceLinkage: evidenceRes.score,
    issueResponsiveness: issueRes.score,
    argumentDepth,
    specificity,
    completeness,
    repetitionPenalty: repetition.penalty,
    unsupportedAssertionPenalty: unsupported.penalty,
    overallScore,
    verdict,
    revisionMode,
    deficiencies,
    coveredCoverageItemIds,
    missingCoverageItemIds,
    hardFailReasons,
    caseDensityMetrics: {
      entityMentions: specificityRes.entityMentions,
      caseFactsUsed: factsRes.caseFactsUsed,
      evidenceUsed: evidenceRes.evidenceUsed,
      authoritiesUsed: [],
      genericPhrasesCount: specificityRes.genericPhrasesCount,
    },
  };
}

// ── 12. CONSTRUCTOR DE PROMPT DE REVISIÓN DIRIGIDA (5O, 5P) ───────────────

export function buildTargetedRevisionPrompt(
  task: GenerationTask,
  currentBlock: ContentBlock,
  evaluation: BlockQualityEvaluation,
): { systemInstruction: string; userMessage: string } {
  const mode = evaluation.revisionMode;

  const modeInstruction = mode === 'REWRITE'
    ? 'REESCRIBE POR COMPLETO el argumento desde cero. El borrador anterior fue calificado como WEAK por genérico, repetitivo o desatento a la litis. NO repitas párrafos ni uses fórmulas vacías.'
    : mode === 'PATCH'
      ? 'CORRIGE E INSERTA PUNTUALMENTE el elemento faltante en el argumento, preservando la estructura previa válida.'
      : 'EXPANDE Y PROFUNDIZA el razonamiento jurídico del borrador previo para subsanar los extremos fácticos y probatorios faltantes.';

  const systemInstruction = [
    'Eres un revisor técnico-jurídico forense de máxima exigencia.',
    `MODO DE REVISIÓN ASIGNADO: ${mode}`,
    modeInstruction,
    'DEFICIENCIAS CONCRETAS DETECTADAS QUE ES OBLIGATORIO CORREGIR:',
    ...evaluation.deficiencies.map((d, i) => `${i + 1}. ${d}`),
    '',
    'REGLAS DE REVISIÓN:',
    '1. Responde con precisión a la controversia asignada. Prohibido disertar sobre principios generales sin vincularlos a los hechos.',
    '2. Si falta analizar pruebas, nómbralas explícitamente y explica qué hecho acreditan.',
    '3. Elimina párrafos repetitivos y muletillas retóricas ("en primer lugar", "resulta evidente", etc.).',
    '4. NO inventes hechos, fechas, pruebas ni jurisprudencia que no consten en autos.',
  ].join('\n');

  const userMessage = [
    `BORRADOR PREVIO QUE DEBE SER CORREGIDO (Calificación: ${(evaluation.overallScore * 100).toFixed(0)}/100 - ${evaluation.verdict}):`,
    '\"\"\"',
    currentBlock.text,
    '\"\"\"',
    '',
    'Redacta a continuación la versión corregida cumpliendo todas las instrucciones de revisión.',
  ].join('\n');

  return { systemInstruction, userMessage };
}

// ── 13. EVALUACIÓN SEMÁNTICA GLOBAL DEL DOCUMENTO (5T, 5V) ────────────────

export function evaluateDocumentSemantics(
  doc: UniversalLegalDocument,
  coverageMatrix?: CoverageMatrix,
  blockEvaluations: BlockQualityEvaluation[] = [],
): DocumentSemanticEvaluation {
  const evaluations = [...blockEvaluations];
  const deficiencies: string[] = [];

  const passedBlocks = evaluations.filter((e) => e.verdict === 'PASS').length;
  const weakBlocks = evaluations.filter((e) => e.verdict === 'WEAK').length;
  const failedBlocks = evaluations.filter((e) => e.verdict === 'FAIL').length;

  const avgScore = evaluations.length > 0
    ? evaluations.reduce((acc, e) => acc + e.overallScore, 0) / evaluations.length
    : 0;

  // Verificar items requeridos no cubiertos
  const matrix = coverageMatrix || doc.coverageMatrix;
  const uncoveredRequiredItems: string[] = [];

  if (matrix?.items) {
    for (const item of matrix.items) {
      if (item.required && item.status !== 'covered') {
        uncoveredRequiredItems.push(item.id);
        deficiencies.push(`Item requerido de cobertura no satisfecho: [${item.id}] "${item.title || item.description || item.id}" (status: ${item.status}).`);
      }
    }
  }

  evaluations.forEach((e) => {
    if (e.verdict !== 'PASS') {
      deficiencies.push(`Bloque [${e.blockId}] reprobó evaluación semántica (${e.verdict}): ${e.deficiencies.join('; ')}`);
    }
  });

  const isComplete =
    uncoveredRequiredItems.length === 0 &&
    failedBlocks === 0 &&
    weakBlocks === 0 &&
    evaluations.length > 0;

  const overallVerdict: EvaluationVerdict = failedBlocks > 0
    ? 'FAIL'
    : (weakBlocks > 0 || uncoveredRequiredItems.length > 0)
      ? 'WEAK'
      : 'PASS';

  return {
    documentId: doc.id,
    blockEvaluations: evaluations,
    totalBlocksEvaluated: evaluations.length,
    passedBlocks,
    weakBlocks,
    failedBlocks,
    averageScore: avgScore,
    overallVerdict,
    isComplete,
    uncoveredRequiredItems,
    deficiencies,
  };
}

// ── 14. OBSERVABILIDAD DE EVALUACIÓN (DEV LOGGING) ─────────────────────────

export function logSemanticEvaluation(evalResult: BlockQualityEvaluation): void {
  console.log(`\n[EVALUATION] task=${evalResult.taskId} verdict=${evalResult.verdict} overall=${evalResult.overallScore.toFixed(2)} specificity=${evalResult.specificity.toFixed(2)} issueResp=${evalResult.issueResponsiveness.toFixed(2)} evidence=${evalResult.evidenceLinkage.toFixed(2)} depth=${evalResult.argumentDepth.toFixed(2)}`);
  if (evalResult.deficiencies.length > 0) {
    console.log('deficiencies:');
    evalResult.deficiencies.forEach((d) => console.log(`  - ${d}`));
  }
  if (evalResult.verdict !== 'PASS') {
    console.log(`[REVISION] mode=${evalResult.revisionMode}`);
  }
}

// ── 15. VALIDACIÓN EN TIEMPO DE EJECUCIÓN DE EVALUADOR IA (5M, 5R) ────────

export interface AiSemanticEvaluationPayload {
  factualCoverage: number;
  legalSupport: number;
  evidenceLinkage: number;
  issueResponsiveness: number;
  argumentDepth: number;
  specificity: number;
  completeness: number;
  overallScore: number;
  verdict: EvaluationVerdict;
  revisionMode: RevisionMode;
  deficiencies: string[];
  coveredCoverageItemIds?: string[];
  missingCoverageItemIds?: string[];
}

export function validateAiSemanticEvaluationOutput(
  rawJson: unknown,
  task: GenerationTask,
): { isValid: boolean; evaluation?: AiSemanticEvaluationPayload; errors: string[] } {
  const errors: string[] = [];
  if (!rawJson || typeof rawJson !== 'object') {
    return { isValid: false, errors: ['El payload de evaluación semántica por IA no es un objeto válido.'] };
  }

  const payload = rawJson as Record<string, unknown>;
  const numFields: (keyof AiSemanticEvaluationPayload)[] = [
    'factualCoverage', 'legalSupport', 'evidenceLinkage', 'issueResponsiveness',
    'argumentDepth', 'specificity', 'completeness', 'overallScore',
  ];

  for (const field of numFields) {
    const val = Number(payload[field]);
    if (isNaN(val) || val < 0.0 || val > 1.0) {
      errors.push(`El campo "${field}" debe ser un número normalizado entre 0.0 y 1.0.`);
    }
  }

  const validVerdicts: EvaluationVerdict[] = ['PASS', 'WEAK', 'FAIL'];
  if (!validVerdicts.includes(payload.verdict as EvaluationVerdict)) {
    errors.push(`Veredicto inválido "${payload.verdict}". Debe ser PASS, WEAK o FAIL.`);
  }

  const validModes: RevisionMode[] = ['NONE', 'EXPAND', 'REWRITE', 'PATCH'];
  if (!validModes.includes(payload.revisionMode as RevisionMode)) {
    errors.push(`Modo de revisión inválido "${payload.revisionMode}". Debe ser NONE, EXPAND, REWRITE o PATCH.`);
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  // Sanitización de deficiencias: Rechazar deficiencias que inventen IDs no existentes en el ContextPack / GenerationTask
  const allowedIds = new Set([
    ...(task.coverageItemIds || []),
    ...(task.factIds || []),
    ...(task.evidenceIds || []),
    ...(task.authorityIds || []),
    ...(task.scopedFacts?.map((f) => f.id) || []),
    ...(task.scopedEvidence?.map((e) => e.id) || []),
  ]);

  const rawDeficiencies = Array.isArray(payload.deficiencies) ? payload.deficiencies.map(String) : [];
  const filteredDeficiencies: string[] = [];

  for (const def of rawDeficiencies) {
    // Detectar patrones como [cov-xyz] o [fact-123] o [ev-abc]
    const referencedIds = def.match(/\[([a-zA-Z0-9_\-]+)\]/g)?.map((m) => m.slice(1, -1)) || [];
    const hasHallucinatedId = referencedIds.some((refId) => !allowedIds.has(refId));
    if (hasHallucinatedId) {
      // Ignorar o depurar la deficiencia que inventa IDs no asignados a esta tarea
      continue;
    }
    filteredDeficiencies.push(def);
  }

  const filteredMissing = Array.isArray(payload.missingCoverageItemIds)
    ? (payload.missingCoverageItemIds as string[]).filter((id) => allowedIds.has(id))
    : [];

  const filteredCovered = Array.isArray(payload.coveredCoverageItemIds)
    ? (payload.coveredCoverageItemIds as string[]).filter((id) => allowedIds.has(id))
    : [];

  return {
    isValid: true,
    evaluation: {
      factualCoverage: Number(payload.factualCoverage),
      legalSupport: Number(payload.legalSupport),
      evidenceLinkage: Number(payload.evidenceLinkage),
      issueResponsiveness: Number(payload.issueResponsiveness),
      argumentDepth: Number(payload.argumentDepth),
      specificity: Number(payload.specificity),
      completeness: Number(payload.completeness),
      overallScore: Number(payload.overallScore),
      verdict: payload.verdict as EvaluationVerdict,
      revisionMode: payload.revisionMode as RevisionMode,
      deficiencies: filteredDeficiencies,
      coveredCoverageItemIds: filteredCovered,
      missingCoverageItemIds: filteredMissing,
    },
    errors: [],
  };
}
