import type { UniversalLegalDocument } from './types';
import { extractMaterialLegalCitations, normalizeLegalCitation } from './materialLegalCitations';
import { rolAutorOf } from './documentTemplates';
import { findRedundantParagraphs, normalizeForComparison, splitParagraphs, type ParagraphRef } from './textRedundancy';

/**
 * Validador de la SALIDA generada: andamiaje interno, citas sin respaldo, hechos sin
 * origen, alegaciones presentadas como probadas, bloques duplicados y rotulado de
 * borrador. No modifica el documento: reporta hallazgos para que las pruebas (y las
 * compuertas de exportación) fallen cuando aparezcan.
 *
 * `neutralizeGeneratedText` aplica la parte determinista y segura de la corrección
 * (retirar andamiaje, marcar citas sin respaldo, deduplicar) sin inventar contenido.
 */

export type OutputFindingCode =
  | 'NON_CONTENTIOUS_VOCABULARY'
  | 'SCAFFOLDING'
  | 'PROMPT_LEAK'
  | 'JSON_LEAK'
  | 'PROVIDER_ID'
  | 'IRRELEVANT_PLACEHOLDER'
  | 'UNSUPPORTED_CITATION'
  | 'FACT_WITHOUT_ORIGIN'
  | 'ALLEGATION_AS_PROVEN'
  | 'DUPLICATE_BLOCK'
  | 'REPEATED_HEADING'
  | 'NOT_LABELED_DRAFT';

export interface OutputFinding {
  code: OutputFindingCode;
  severity: 'BLOCKER' | 'WARNING';
  sectionId?: string;
  blockId?: string;
  excerpt: string;
  detail: string;
}

export interface OutputValidationContext {
  /** Textos de las fuentes (demanda, resolución…) contra los que se comprueba el origen. */
  sourceTexts?: readonly string[];
  /** Instrucción del abogado: también es origen legítimo de datos. */
  instruction?: string;
  /** Citas con verificación oficial (texto tal como aparece en la salida). */
  verifiedCitations?: readonly string[];
  /** Hechos/datos confirmados por el abogado (p. ej. de la ficha). */
  confirmedFacts?: readonly string[];
  /** Umbral de similitud de párrafos casi duplicados. */
  nearDuplicateThreshold?: number;
  /** Permite documentos con estado `final` (la exportación FINAL tiene sus propias compuertas). */
  allowFinal?: boolean;
}

export interface OutputValidationResult {
  ok: boolean;
  blockers: OutputFinding[];
  warnings: OutputFinding[];
  findings: OutputFinding[];
}

// ───────────────────────────── andamiaje ─────────────────────────────

const SCAFFOLD_PATTERNS: ReadonlyArray<{ code: OutputFindingCode; re: RegExp; detail: string }> = [
  { code: 'SCAFFOLDING', re: /DESARROLLO\s+DE\s+BLOQUE/i, detail: 'Encabezado interno «DESARROLLO DE BLOQUE».' },
  { code: 'SCAFFOLDING', re: /\ben\s+relaci[oó]n\s+con\s+los\s+autos\s+del\s+expediente\b[^\n]{0,60}\.\.\.\s*$/im, detail: 'Cola de relleno del generador determinista.' },
  { code: 'SCAFFOLDING', re: /\[(?:Desarrollar|Completar)\s+por\s+la\s+IA/i, detail: 'Marcador de desarrollo pendiente del motor.' },
  { code: 'PROMPT_LEAK', re: /(?:^|\n)\s*(?:#{1,6}\s*)?(?:OBJETIVO\s+DEL\s+BLOQUE|TIPO\s+DE\s+BLOQUE|CONTEXTO\s+ANTERIOR|CONTEXTO\s+POSTERIOR|REGLAS\s+OBLIGATORIAS|FORMATO\s+DE\s+SALIDA|SALIDA\s+ESPERADA|TEXTO\s+ORIGINAL\s+DEL\s+BLOQUE|INSTRUCCIONES\s*:)/i, detail: 'Encabezado de instrucciones del prompt.' },
  { code: 'PROMPT_LEAK', re: /(?:^|\n)\s*(?:SYSTEM|USER|ASSISTANT)\s*:/, detail: 'Rol de conversación del proveedor.' },
  { code: 'PROMPT_LEAK', re: /\bcomo\s+(?:un\s+)?(?:modelo\s+de\s+lenguaje|asistente\s+de\s+ia|inteligencia\s+artificial)\b|\bAqu[ií]\s+(?:tienes|est[aá])\s+(?:el|la|tu)\s+(?:texto|escrito|borrador|respuesta)\b/i, detail: 'Frase del asistente de IA dirigida al usuario.' },
  { code: 'JSON_LEAK', re: /```|(?:^|\n)\s*[{[]\s*"[A-Za-z_]+"\s*:/, detail: 'Fragmento JSON o bloque de código en el cuerpo.' },
  { code: 'JSON_LEAK', re: /"(?:blockId|sectionId|taskId|requestId|generationId)"\s*:/, detail: 'Identificadores internos serializados.' },
  { code: 'PROVIDER_ID', re: /\b(?:nvapi-[A-Za-z0-9_-]{8,}|nvidia\/[a-z0-9._-]+|meta\/llama[\w.-]*|nemotron[\w.-]*|gemini-[\w.-]+|gpt-\d[\w.-]*|claude-[\w.-]+|mixtral[\w.-]*|llama-?\d[\w.-]*)\b/i, detail: 'Identificador de proveedor o modelo de IA.' },
  { code: 'PROVIDER_ID', re: /\b(?:aiUsed|providerUsed|requestId|generationId)\s*[:=]/, detail: 'Metadato de generación impreso.' },
  { code: 'IRRELEVANT_PLACEHOLDER', re: /\{\{[^}]{1,60}\}\}|\$\{[^}]{1,60}\}|\[object Object\]|\bundefined\b|\bnull\b|\bNaN\b|\blorem ipsum\b|\bFIXME\b/i, detail: 'Placeholder técnico sin resolver.' },
  // «todo» es una palabra española («en todo lo que favorezca», «TODO LO ACTUADO»): solo cuenta el marcador
  // de desarrollo en mayúsculas seguido de «:», «(» o de una nota en minúsculas.
  { code: 'IRRELEVANT_PLACEHOLDER', re: /(?:^|[\s/#*-])TODO(?:\s*[:(]|\s+[a-z])/, detail: 'Placeholder técnico sin resolver.' },
];

/**
 * Vocabulario contencioso en minúscula, como rol en la prosa. Los nombres propios en mayúsculas quedan fuera.
 * «demandado/a» cuenta solo como sustantivo de parte («la parte demandada», «al demandado»), no como adjetivo
 * («derechos demandados», «autoridad demandada»).
 */
const NON_CONTENTIOUS_FORBIDDEN_VOCABULARY = /\b(?:excepci[oó]n(?:es)?|actor(?:a)?s?)\b|\b(?:parte|el|la|al|del|los|las|a\s+la|a\s+el)\s+demandad[oa]s?\b/;

function excerptAround(text: string, index: number, length = 90): string {
  const start = Math.max(0, index - 20);
  return text.slice(start, start + length).replace(/\s+/g, ' ').trim();
}

// ──────────────────────── origen de hechos y citas ────────────────────────

const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const DATE_RE = new RegExp(`\\b\\d{1,2}\\s+de\\s+(?:${MONTHS})\\s+de\\s+\\d{4}\\b`, 'gi');
const EXPEDIENTE_RE = /\b\d{1,6}\/\d{4}\b/g;
const AMOUNT_RE = /\$\s?\d[\d,]*(?:\.\d+)?/g;
const REGISTRO_RE = /registro\s+(?:digital|ius)\s*[:#]?\s*(\d{5,9})/gi;

function stripPendingMarkers(text: string): string {
  return text.replace(/\[(?:DATO\s+PENDIENTE|POSTURA\s+PENDIENTE|NO\s+VERIFICADO|REQUIERE|PENDIENTE|VERIFICAR)[^\]]*\]/gi, ' ');
}

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function buildSupportCorpus(context: OutputValidationContext): { text: string; digitsOnly: string } {
  const text = normalizeForComparison([
    ...(context.sourceTexts || []),
    context.instruction || '',
    ...(context.confirmedFacts || []),
    ...(context.verifiedCitations || []),
  ].join('\n'));
  return { text, digitsOnly: digits([...(context.sourceTexts || []), context.instruction || '', ...(context.confirmedFacts || [])].join(' ')) };
}

const PROOF_ASSERTION_RE = /\b(?:qued[oó]|queda|ha\s+quedado|est[aá]|se\s+encuentra)\s+(?:plenamente\s+|debidamente\s+|fehacientemente\s+)?(?:acreditad[oa]s?|probad[oa]s?|demostrad[oa]s?|comprobad[oa]s?)\b|\bse\s+(?:acredit[oó]|demostr[oó]|prob[oó]|comprob[oó])\b/i;
const ATTRIBUTION_RE = /\b(?:tuvo\s+por|consider[oó]|estim[oó]|determin[oó]|concluy[oó]|resolvi[oó]|sostiene|manifiesta|alega|refiere|afirma|seg[uú]n|a\s+decir\s+de|[:;]\s*["“])\b|\[PRUEBA\b|\bPRUEBA\s*:/i;

// ───────────────────────────── validación ─────────────────────────────

interface BlockRef { sectionId: string; blockId: string; text: string; sectionType?: string }

function collectBlocks(doc: Pick<UniversalLegalDocument, 'sections'>): BlockRef[] {
  const blocks: BlockRef[] = [];
  const visit = (nodes: readonly any[]) => {
    for (const node of nodes || []) {
      for (const block of node.content || []) {
        if (typeof block?.text === 'string') blocks.push({ sectionId: node.id, blockId: block.id, text: block.text, sectionType: node.type });
      }
      if (node.children?.length) visit(node.children);
    }
  };
  visit(doc.sections || []);
  return blocks;
}

export function validateGeneratedText(
  text: string,
  context: OutputValidationContext = {},
  where: { sectionId?: string; blockId?: string } = {},
): OutputFinding[] {
  const findings: OutputFinding[] = [];
  const push = (code: OutputFindingCode, severity: OutputFinding['severity'], index: number, detail: string) =>
    findings.push({ code, severity, ...where, excerpt: excerptAround(text, index), detail });

  for (const pattern of SCAFFOLD_PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags.replace('g', ''));
    const match = re.exec(text);
    if (match) push(pattern.code, 'BLOCKER', match.index, pattern.detail);
  }

  const support = buildSupportCorpus(context);
  const visible = stripPendingMarkers(text);

  // Citas: cada artículo/ley/tesis debe provenir de la fuente, de la instrucción o de una
  // verificación oficial; si no, debe estar marcada como NO VERIFICADO (el extractor ya
  // ignora las que están dentro del marcador).
  const verified = (context.verifiedCitations || []).map(normalizeLegalCitation);
  for (const citation of extractMaterialLegalCitations(visible)) {
    // Solo se auditan referencias que pueden inventarse como autoridad: artículos con número y
    // tesis/jurisprudencia/registro. Un título genérico sin artículo («la Constitución», «LEY Y
    // JURISDICCIÓN» como encabezado) no afirma ninguna norma concreta.
    const isSpecific = Boolean(citation.articleText) || /^(?:registro|tesis|jurisprudencia|precedente)\b/i.test(citation.text);
    if (!isSpecific) continue;
    const aliases = citation.aliases.map(normalizeLegalCitation);
    const supported = aliases.some((alias) => alias && (support.text.includes(alias) || verified.some((item) => item.includes(alias) || alias.includes(item))));
    if (!supported) push('UNSUPPORTED_CITATION', 'BLOCKER', citation.start, `Cita sin respaldo ni marcador de verificación: «${citation.text}».`);
  }
  for (const match of visible.matchAll(REGISTRO_RE)) {
    if (!support.digitsOnly.includes(match[1]) && !verified.some((item) => item.includes(match[1]))) {
      push('UNSUPPORTED_CITATION', 'BLOCKER', match.index || 0, `Registro digital ${match[1]} sin respaldo ni verificación.`);
    }
  }

  // Hechos con identidad propia (expediente, importes, fechas) deben tener origen.
  for (const match of visible.matchAll(EXPEDIENTE_RE)) {
    if (!support.text.includes(match[0].replace('/', ' ')) && !support.digitsOnly.includes(digits(match[0]))) {
      push('FACT_WITHOUT_ORIGIN', 'BLOCKER', match.index || 0, `Número ${match[0]} sin origen en fuente, instrucción ni ficha.`);
    }
  }
  for (const match of visible.matchAll(AMOUNT_RE)) {
    if (!support.digitsOnly.includes(digits(match[0]))) push('FACT_WITHOUT_ORIGIN', 'BLOCKER', match.index || 0, `Importe ${match[0]} sin origen.`);
  }
  for (const match of visible.matchAll(DATE_RE)) {
    const normalized = normalizeForComparison(match[0]);
    if (!support.text.includes(normalized)) push('FACT_WITHOUT_ORIGIN', 'WARNING', match.index || 0, `Fecha «${match[0]}» sin origen identificable.`);
  }

  // Alegación presentada como probada.
  for (const sentence of visible.split(/(?<=[.!?])\s+|\n+/)) {
    if (PROOF_ASSERTION_RE.test(sentence) && !ATTRIBUTION_RE.test(sentence) && !sentence.includes('[POR VERIFICAR')) {
      push('ALLEGATION_AS_PROVEN', 'BLOCKER', Math.max(0, text.indexOf(sentence.slice(0, 40))), 'Afirma que un hecho está probado sin atribuirlo ni citar la prueba.');
    }
  }
  return findings;
}

export function validateGeneratedOutput(
  doc: Pick<UniversalLegalDocument, 'sections' | 'status'> & Partial<UniversalLegalDocument>,
  context: OutputValidationContext = {},
): OutputValidationResult {
  const findings: OutputFinding[] = [];
  const blocks = collectBlocks(doc);

  for (const block of blocks) {
    findings.push(...validateGeneratedText(block.text, context, { sectionId: block.sectionId, blockId: block.blockId }));
  }

  // Bloques duplicados / casi duplicados (entre secciones también).
  const paragraphs: ParagraphRef[] = blocks.flatMap((block) =>
    splitParagraphs(block.text).map((text, index) => ({ id: `${block.sectionId}/${block.blockId}#${index}`, text })));
  for (const pair of findRedundantParagraphs(paragraphs, context.nearDuplicateThreshold ?? 0.85)) {
    findings.push({
      code: 'DUPLICATE_BLOCK',
      severity: pair.exact ? 'BLOCKER' : 'WARNING',
      sectionId: pair.b.id.split('/')[0],
      blockId: pair.b.id.split('/')[1]?.split('#')[0],
      excerpt: pair.b.text.slice(0, 90),
      detail: pair.exact ? 'Párrafo idéntico a uno anterior.' : `Párrafo casi idéntico (${Math.round(pair.similarity * 100)} %) a uno anterior.`,
    });
  }

  // Encabezados de sección repetidos.
  const seen = new Map<string, string>();
  for (const section of (doc.sections || []) as any[]) {
    const key = normalizeForComparison(section.title || '');
    if (!key) continue;
    if (seen.has(key)) {
      findings.push({ code: 'REPEATED_HEADING', severity: 'WARNING', sectionId: section.id, excerpt: String(section.title), detail: `Encabezado repetido (también en la sección ${seen.get(key)}).` });
    } else seen.set(key, section.id);
  }

  // Familia no contenciosa (rol parte_interesada explícito): advertencia, no bloqueo, hasta corregir plantillas.
  if (doc.documentType && rolAutorOf(doc.documentType, doc.documentTypeLabel) === 'parte_interesada') {
    for (const block of blocks) {
      const match = block.text.match(NON_CONTENTIOUS_FORBIDDEN_VOCABULARY);
      if (match?.index === undefined) continue;
      findings.push({ code: 'NON_CONTENTIOUS_VOCABULARY', severity: 'WARNING', sectionId: block.sectionId, blockId: block.blockId, excerpt: excerptAround(block.text, match.index), detail: `Vocabulario contencioso (${match[0]}) en un escrito no contencioso.` });
    }
  }

  if (doc.status === 'final' && !context.allowFinal) {
    findings.push({ code: 'NOT_LABELED_DRAFT', severity: 'BLOCKER', excerpt: String(doc.status), detail: 'La salida generada debe quedar como borrador para revisión del abogado.' });
  }

  const blockers = findings.filter((finding) => finding.severity === 'BLOCKER');
  const warnings = findings.filter((finding) => finding.severity === 'WARNING');
  return { ok: blockers.length === 0, blockers, warnings, findings };
}

/** Contexto de respaldo a partir de las fuentes y la instrucción del propio documento. */
export function contextFromDocument(
  doc: Partial<UniversalLegalDocument>,
  extra: Partial<OutputValidationContext> = {},
): OutputValidationContext {
  const sources = ((doc as any).sourceDocuments || []) as Array<{ extractedText?: string; content?: string; pages?: Array<{ text: string }> }>;
  const sourceTexts = sources.map((source) => source.pages?.length ? source.pages.map((page) => page.text).join('\n') : (source.extractedText || source.content || ''));
  const intake = (doc as any).intake || {};
  const caseRefs = (doc as any).caseRefs || {};
  const parties = (doc as any).parties || {};
  const confirmedFacts = [
    ...Object.values(caseRefs).filter((value): value is string => typeof value === 'string'),
    ...Object.values(parties).filter((value): value is string => typeof value === 'string'),
    ...Object.values(intake).filter((value): value is string => typeof value === 'string'),
    ...(extra.confirmedFacts || []),
  ];
  return { ...extra, sourceTexts: [...sourceTexts, ...(extra.sourceTexts || [])], confirmedFacts };
}

// ───────────────────────────── neutralización ─────────────────────────────

const PROVIDER_ID_SOURCE = String.raw`(?:nvapi-[A-Za-z0-9_-]{8,}|nvidia\/[a-z0-9._-]+|meta\/llama[\w.-]*|nemotron[\w.-]*|gemini-[\w.-]+|gpt-\d[\w.-]*|claude-[\w.-]+|mixtral[\w.-]*|llama-?\d[\w.-]*)`;

export const ALLEGATION_MARKER = '[POR VERIFICAR: hecho presentado como probado sin prueba identificada]';

/**
 * Una afirmación de que un hecho está probado, sin atribuirla a una fuente ni citar la prueba,
 * convierte una alegación en hecho. No se borra (puede ser correcta): se marca solo esa oración.
 */
export function markUnattributedProofAssertions(text: string): { text: string; count: number } {
  let count = 0;
  const lines = String(text || '').split('\n').map((line) => {
    const sentences = line.split(/(?<=[.!?])\s+/);
    return sentences.map((sentence) => {
      if (sentence.includes('[POR VERIFICAR') || !PROOF_ASSERTION_RE.test(sentence) || ATTRIBUTION_RE.test(sentence)) return sentence;
      count++;
      return `${ALLEGATION_MARKER} ${sentence}`;
    }).join(' ');
  });
  return { text: count > 0 ? lines.join('\n') : text, count };
}

const SCAFFOLD_LINE_RES: readonly RegExp[] = [
  /^\s*\[?DESARROLLO\s+DE\s+BLOQUE\s*:.*$/gim,
  /^\s*en\s+relaci[oó]n\s+con\s+los\s+autos\s+del\s+expediente\b[^\n]*\.\.\.\s*$/gim,
  /^\s*\[(?:Desarrollar|Completar)\s+por\s+la\s+IA[^\]]*\]\s*$/gim,
  /^\s*(?:SYSTEM|USER|ASSISTANT)\s*:.*$/gm,
  // Bloques de código/JSON completos y delimitadores sueltos.
  /```[a-z]*[\s\S]*?```/gi,
  /^```[a-z]*\s*$/gim,
  // Objeto/arreglo JSON suelto en una línea (el normalizador de Markdown ya pudo quitar las vallas).
  /^\s*[{[]\s*"[A-Za-z_]\w*"\s*:[^\n]*[}\]]\s*$/gm,
  // Frases del asistente dirigidas al usuario.
  /^\s*Aqu[ií]\s+(?:tienes|est[aá])\b[^\n]*$/gim,
  /^[^\n]*\bcomo\s+(?:un\s+)?(?:modelo\s+de\s+lenguaje|asistente\s+de\s+ia|inteligencia\s+artificial)\b[^\n]*$/gim,
  // Encabezados de instrucciones del prompt (solo la línea).
  /^\s*(?:#{1,6}\s*)?(?:OBJETIVO\s+DEL\s+BLOQUE|TIPO\s+DE\s+BLOQUE|CONTEXTO\s+ANTERIOR|CONTEXTO\s+POSTERIOR|REGLAS\s+OBLIGATORIAS|FORMATO\s+DE\s+SALIDA|SALIDA\s+ESPERADA|TEXTO\s+ORIGINAL\s+DEL\s+BLOQUE|INSTRUCCIONES)\s*:[^\n]*$/gim,
  // Cualquier línea que imprima un identificador de proveedor/modelo o metadatos de generación.
  new RegExp(String.raw`^[^\n]*\b${PROVIDER_ID_SOURCE}[^\n]*$`, 'gim'),
  /^\s*(?:aiUsed|providerUsed|requestId|generationId|provider|model|modelo|proveedor)\s*[:=][^\n]*$/gim,
];

/**
 * Retira el andamiaje reconocible y deduplica párrafos idénticos consecutivos o
 * repetidos. NUNCA reescribe ni añade contenido jurídico. Las citas sin respaldo se
 * marcan con el verificador de autoridades existente (`markUnverifiedAuthorityReferences`),
 * no aquí.
 */
export function neutralizeGeneratedText(text: string): { text: string; actions: string[] } {
  const actions: string[] = [];
  let output = String(text || '');
  for (const re of SCAFFOLD_LINE_RES) {
    const before = output;
    output = output.replace(new RegExp(re.source, re.flags), '');
    if (output !== before) actions.push(`REMOVED:${re.source.slice(0, 40)}`);
  }
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const paragraph of output.split(/\n{2,}/)) {
    const key = normalizeForComparison(paragraph);
    if (key.length >= 80 && seen.has(key)) {
      actions.push('DEDUPED_PARAGRAPH');
      continue;
    }
    if (key) seen.add(key);
    kept.push(paragraph);
  }
  output = kept.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  const marked = markUnattributedProofAssertions(output);
  if (marked.count > 0) actions.push(`MARKED_ALLEGATION_AS_PROVEN:${marked.count}`);
  return { text: marked.text, actions };
}

// ───────────────────────────── higiene final del documento ─────────────────────────────

const HYGIENE_EXEMPT_SECTION_TYPES = new Set(['header', 'signature', 'closing', 'title']);

/**
 * Higiene determinista final (sin inventar contenido):
 *  1. retira andamiaje y párrafos repetidos dentro de cada bloque;
 *  2. quita los párrafos idénticos repetidos ENTRE bloques conservando una aparición
 *     (la de la sección de petitorios si existe; si no, la primera);
 *  3. si un apartado queda vacío, deja un marcador de dato pendiente (nunca silencio).
 * No toca bloques editados por el abogado ni encabezados/firma/cierre.
 */
export function enforceOutputHygiene(doc: { sections: any[] }): { actions: string[] } {
  const actions: string[] = [];
  const sections = (doc.sections || []) as any[];

  for (const section of sections) {
    if (HYGIENE_EXEMPT_SECTION_TYPES.has(section.type)) continue;
    for (const block of section.content || []) {
      if (block.isManuallyEdited || typeof block.text !== 'string') continue;
      const cleaned = neutralizeGeneratedText(block.text);
      if (cleaned.actions.length > 0) {
        block.text = cleaned.text;
        actions.push(...cleaned.actions.map((action) => `${section.id}:${action}`));
      }
    }
  }

  type Occurrence = { section: any; block: any; index: number; isPetition: boolean };
  const occurrences = new Map<string, Occurrence[]>();
  for (const section of sections) {
    if (HYGIENE_EXEMPT_SECTION_TYPES.has(section.type)) continue;
    for (const block of section.content || []) {
      if (block.isManuallyEdited || typeof block.text !== 'string') continue;
      block.text.split(/\n{2,}/).forEach((paragraph: string, index: number) => {
        const key = normalizeForComparison(paragraph);
        if (key.length < 80) return;
        const list = occurrences.get(key) || [];
        list.push({ section, block, index, isPetition: section.type === 'petition' });
        occurrences.set(key, list);
      });
    }
  }
  const drop = new Map<any, Set<number>>();
  for (const list of occurrences.values()) {
    if (list.length < 2) continue;
    const keep = list.find((entry) => entry.isPetition) || list[0];
    for (const entry of list) {
      if (entry === keep) continue;
      const set = drop.get(entry.block) || new Set<number>();
      set.add(entry.index);
      drop.set(entry.block, set);
      actions.push(`${entry.section.id}:DEDUPED_ACROSS_SECTIONS`);
    }
  }
  for (const [block, indexes] of drop) {
    block.text = block.text.split(/\n{2,}/).filter((_: string, index: number) => !indexes.has(index)).join('\n\n').trim();
  }

  // Casi duplicados (≥ 92 % de n-gramas compartidos): son el mismo párrafo con retoques mínimos,
  // típico de una meta de extensión cumplida repitiendo contenido. Se conserva la primera aparición.
  const nearRefs = new Map<string, { block: any; index: number; section: any }>();
  const nearParagraphs: ParagraphRef[] = [];
  for (const section of sections) {
    if (HYGIENE_EXEMPT_SECTION_TYPES.has(section.type)) continue;
    for (const block of section.content || []) {
      if (block.isManuallyEdited || typeof block.text !== 'string') continue;
      block.text.split(/\n{2,}/).forEach((paragraph: string, index: number) => {
        const id = `${section.id}/${block.id}#${index}`;
        nearRefs.set(id, { block, index, section });
        nearParagraphs.push({ id, text: paragraph });
      });
    }
  }
  const nearDrop = new Map<any, Set<number>>();
  const alreadyDropped = new Set<string>();
  for (const pair of findRedundantParagraphs(nearParagraphs, 0.92)) {
    if (alreadyDropped.has(pair.a.id) || alreadyDropped.has(pair.b.id)) continue;
    const target = nearRefs.get(pair.b.id)!;
    alreadyDropped.add(pair.b.id);
    const set = nearDrop.get(target.block) || new Set<number>();
    set.add(target.index);
    nearDrop.set(target.block, set);
    actions.push(`${target.section.id}:DEDUPED_NEAR_DUPLICATE`);
  }
  for (const [block, indexes] of nearDrop) {
    block.text = block.text.split(/\n{2,}/).filter((_: string, index: number) => !indexes.has(index)).join('\n\n').trim();
  }

  for (const section of sections) {
    if (HYGIENE_EXEMPT_SECTION_TYPES.has(section.type) || !section.content?.length) continue;
    const anyText = section.content.some((block: any) => String(block.text || '').trim());
    if (anyText) {
      // Bloques vacíos sin referencias cruzadas se retiran.
      section.content = section.content.filter((block: any) =>
        String(block.text || '').trim() || block.coverageItemIds?.length || block.taskId || block.isManuallyEdited);
      continue;
    }
    section.content[0].text = `[DATO PENDIENTE: apartado «${section.title || section.id}» sin redacción propia — su contenido ya figura en otra sección o debe desarrollarlo el abogado con información respaldada en el expediente]`;
    actions.push(`${section.id}:EMPTY_SECTION_MARKED`);
  }
  return { actions };
}
