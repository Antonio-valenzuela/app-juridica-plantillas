/**
 * factsSeed.ts — semilla determinista de HECHOS para escritos sustantivos.
 *
 * Sin proveedor de IA (o cuando la IA no logra generar una sección), el plan
 * dejaba vacías las secciones de hechos y el relleno afirmaba «hechos con
 * respaldo verificable pendientes» aunque el análisis del caso SÍ traía hechos.
 * Esto los conserva con su procedencia real:
 *
 *  - afirmación de una parte        → "Afirma <actor>: …"  (nunca hecho probado)
 *  - consta en una fuente concreta  → "Consta en la fuente …: …"
 *  - sin procedencia verificable    → "Referido en el expediente, por confirmar: …"
 *
 * No inventa hechos ni cambia el modo de generación de la sección: la semilla
 * sigue siendo `AI_REQUIRED`, de modo que con proveedor la IA la desarrolla.
 */
import type { AnalyzedFact } from './types';

const MAX_FACTS = 40;
const LOW_CONFIDENCE = 0.6;

export interface SeedSectionRef {
  title: string;
  type: string;
}

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function factText(fact: AnalyzedFact): string {
  return (fact.sourceFact || fact.text || '').replace(/\s+/g, ' ').trim();
}

function provenanceLabel(fact: AnalyzedFact): string {
  const reliability = fact.confidence < LOW_CONFIDENCE ? ' (por verificar)' : '';
  if (fact.actor || fact.contestedStatus === 'CONTESTED') {
    return `Afirma ${fact.actor || 'una de las partes'}${reliability}`;
  }
  const doc = fact.sourceReference?.documentId || fact.documentId;
  const page = fact.sourceReference?.page ?? fact.page;
  if (doc || (fact.supportingSources && fact.supportingSources.length > 0)) {
    return `Consta en la fuente${doc ? ` ${doc}` : ''}${page ? `, página ${page}` : ''}${reliability}`;
  }
  return `Referido en el expediente, por confirmar${reliability}`;
}

/** Texto determinista de hechos; vacío si no hay hechos utilizables. */
export function renderFactsSeed(facts: readonly AnalyzedFact[] | undefined): string {
  const usable = (facts || []).filter(fact => factText(fact).length > 0).slice(0, MAX_FACTS);
  if (!usable.length) return '';
  return usable
    .map((fact, index) => `${index + 1}. ${provenanceLabel(fact)}: ${factText(fact).replace(/[.;]\s*$/, '')}.`)
    .join('\n');
}

const NON_BODY_TYPES = new Set(['header', 'identity', 'signature', 'closing', 'annex', 'evidence', 'petition']);
const FACTS_TITLE_RE = /hechos|antecedentes|constancias|controversia|planteamiento|manifestaciones|motivos|litis|riesgo|exposicion/;

/**
 * Sección donde deben entrar los hechos: 1) una sección tipada como
 * antecedentes; 2) una cuyo título los anuncia; 3) la primera sección de
 * cuerpo. -1 si el documento no tiene ninguna sección de cuerpo.
 */
export function pickFactsSectionIndex(sections: readonly SeedSectionRef[]): number {
  const background = sections.findIndex(section => section.type === 'background');
  if (background >= 0) return background;
  const titled = sections.findIndex(section => !NON_BODY_TYPES.has(section.type) && FACTS_TITLE_RE.test(normalize(section.title)));
  if (titled >= 0) return titled;
  return sections.findIndex(section => !NON_BODY_TYPES.has(section.type));
}

/** ¿El texto son solo marcadores de pendiente (sin contenido real)? */
function isPendingOnly(text: string, title: string): boolean {
  // El encabezado repetido de la sección ("HECHOS DE LA RECONVENCIÓN:") no es contenido.
  const withoutTitle = normalize(text).split(normalize(title)).join('');
  return withoutTitle.replace(/\[[^\]]*\]/g, '').replace(/[\s.:;,\-–—]+/g, '').length === 0;
}

/**
 * Sustituye la semilla puramente pendiente de la sección de hechos por los
 * hechos del análisis. NUNCA pisa contenido real: si la sección ya tiene texto
 * que no sea un marcador, el documento se devuelve intacto. Los marcadores
 * pendientes sustituidos se eliminan, porque dejarlos junto a los hechos
 * afirmaría que faltan datos que sí existen.
 */
export function injectNarrativeFacts<T extends { title: string; type: string; content?: Array<{ text: string }> }>(
  sections: T[],
  facts: readonly AnalyzedFact[] | undefined,
): T[] {
  const seed = renderFactsSeed(facts);
  if (!seed) return sections;
  const index = pickFactsSectionIndex(sections.map(section => ({ title: section.title, type: section.type })));
  if (index < 0) return sections;
  const target = sections[index];
  const blocks = target.content || [];
  if (!blocks.length || blocks.some(block => block.text && !isPendingOnly(block.text, target.title))) return sections;
  const replaced = { ...target, content: [{ ...blocks[0], text: seed }] } as T;
  return sections.map((section, i) => (i === index ? replaced : section));
}
