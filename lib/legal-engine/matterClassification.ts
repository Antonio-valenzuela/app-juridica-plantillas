/**
 * matterClassification.ts
 *
 * FUENTE ÚNICA para clasificar la materia de un documento fuente. La consumen el
 * motor (sourceGrounding.ts) y la ficha del expediente (app/machotes/page.tsx).
 *
 * La materia se decide combinando señales independientes, nunca por una palabra
 * aislada del cuerpo:
 *  - FORO: órgano jurisdiccional al que se dirige o que emite el documento
 *    (encabezado/destinatario). Es la señal más fuerte.
 *  - DECLARACIÓN: "materia civil", "juicio ordinario mercantil", "juicio laboral"…
 *  - LEGISLACIÓN: ordenamientos citados (Código Civil, Ley Federal del Trabajo…).
 *  - CONTENIDO: vocabulario propio de la materia; cada término DISTINTO suma poco
 *    y el total está acotado, así que el contenido solo decide cuando varios
 *    términos distintos coinciden.
 *
 * Si la mejor materia no supera el umbral o no aventaja con claridad a la segunda,
 * el resultado es NO_IDENTIFICADA: el dato queda sin confirmar para que el abogado
 * lo revise, en lugar de adivinarlo.
 */

export type SubstantiveMatter =
  | 'CIVIL'
  | 'FAMILIAR'
  | 'MERCANTIL'
  | 'LABORAL'
  | 'ADMINISTRATIVA'
  | 'PENAL'
  | 'AGRARIA'
  | 'AMPARO';

export type MatterDecision = SubstantiveMatter | 'NO_IDENTIFICADA';

export interface MatterClassification {
  matter: MatterDecision;
  /** 0–1. Baja cuando la decisión descansa en señales débiles. */
  confidence: number;
  /** Señales que sustentan la materia elegida (para trazabilidad/revisión). */
  evidence: string[];
  scores: Record<SubstantiveMatter, number>;
}

interface Signal {
  matter: SubstantiveMatter;
  pattern: RegExp;
  label: string;
}

const FORUM_WEIGHT = 6;
const DECLARATION_WEIGHT = 4;
const CONTENT_TERM_WEIGHT = 1;
const CONTENT_CAP = 4;
const DECISION_THRESHOLD = 3;
const DECISION_MARGIN = 1.5;

/** Órgano jurisdiccional (destinatario o emisor). Se busca solo en el encabezado. */
const FORUM_SIGNALS: Signal[] = [
  { matter: 'AMPARO', label: 'Juzgado de Distrito / Tribunal Colegiado', pattern: /\b(?:juez(?:a)?|juzgado)\s+(?:[a-z]+\s+){0,4}de\s+distrito\b|\btribunal(?:es)?\s+colegiado|\bsuprema\s+corte\s+de\s+justicia/ },
  { matter: 'FAMILIAR', label: 'Juzgado familiar', pattern: /\b(?:juez(?:a)?|juzgado|sala)\b[^\n]{0,60}\b(?:de\s+lo\s+familiar|en\s+materia\s+familiar|familiar)\b/ },
  { matter: 'CIVIL', label: 'Juzgado civil', pattern: /\b(?:juez(?:a)?|juzgado|sala)\b[^\n]{0,60}\b(?:de\s+lo\s+civil|en\s+materia\s+civil|civil(?:es)?)\b/ },
  { matter: 'MERCANTIL', label: 'Juzgado mercantil', pattern: /\b(?:juez(?:a)?|juzgado|sala)\b[^\n]{0,60}\b(?:de\s+lo\s+mercantil|en\s+materia\s+mercantil|mercantil)\b/ },
  { matter: 'LABORAL', label: 'Tribunal o junta laboral', pattern: /\b(?:tribunal|juzgado|juez(?:a)?)\b[^\n]{0,40}\blaboral\b|\bjunta\s+(?:local|federal|especial)\b|\bjunta\s+de\s+conciliacion\s+y\s+arbitraje\b|\btribunal\s+(?:federal\s+)?de\s+conciliacion\s+y\s+arbitraje\b|\btribunal\s+de\s+arbitraje\s+y\s+escalafon\b|\bcentro\s+(?:federal\s+)?de\s+conciliacion\b/ },
  { matter: 'ADMINISTRATIVA', label: 'Tribunal administrativo', pattern: /\btribunal\s+(?:federal\s+)?de\s+justicia\s+(?:fiscal\s+y\s+)?administrativa\b|\btribunal\s+de\s+lo\s+contencioso\s+administrativo\b|\bsala\s+(?:regional|superior)?[^\n]{0,40}\badministrativa\b/ },
  { matter: 'PENAL', label: 'Juzgado penal', pattern: /\bjuez(?:a)?\s+de\s+control\b|\btribunal\s+de\s+enjuiciamiento\b|\b(?:juez(?:a)?|juzgado|sala)\b[^\n]{0,60}\b(?:de\s+lo\s+penal|en\s+materia\s+penal|penal)\b/ },
  { matter: 'AGRARIA', label: 'Tribunal agrario', pattern: /\btribunal\s+(?:unitario\s+|superior\s+)?agrario\b/ },
];

/** Declaración expresa de materia o vía procesal. */
const DECLARATION_SIGNALS: Signal[] = [
  { matter: 'AMPARO', label: 'Juicio de amparo', pattern: /\b(?:demanda\s+de\s+amparo|juicio\s+de\s+amparo|amparo\s+(?:directo|indirecto))\b/ },
  { matter: 'FAMILIAR', label: 'Materia/vía familiar', pattern: /\bmateria\s+familiar\b|\bjuicio\s+(?:oral\s+|ordinario\s+|especial\s+)?(?:familiar|de\s+divorcio|de\s+alimentos)\b|\bcontroversia\s+(?:del\s+orden\s+)?familiar\b/ },
  { matter: 'CIVIL', label: 'Materia/vía civil', pattern: /\bmateria\s+civil\b|\bv[i]a\s+(?:ordinaria\s+)?civil\b|\bjuicio\s+(?:ordinario\s+|oral\s+|especial\s+|sumario\s+)?civil\b|\bdemanda\s+(?:ordinaria\s+)?civil\b/ },
  { matter: 'MERCANTIL', label: 'Materia/vía mercantil', pattern: /\bmateria\s+(?:oral\s+)?mercantil\b|\bjuicio\s+(?:ordinario\s+|ejecutivo\s+|oral\s+|especial\s+)?mercantil\b|\bdemanda\s+mercantil\b|\bv[i]a\s+(?:ejecutiva\s+)?mercantil\b/ },
  { matter: 'LABORAL', label: 'Materia/vía laboral', pattern: /\bmateria\s+(?:del\s+)?(?:trabajo|laboral)\b|\b(?:juicio|procedimiento|demanda|conflicto)\s+(?:ordinario\s+|individual\s+)?(?:laboral|de\s+trabajo)\b/ },
  { matter: 'ADMINISTRATIVA', label: 'Juicio contencioso administrativo', pattern: /\bmateria\s+(?:fiscal\s+y\s+)?administrativa\b|\bjuicio\s+(?:contencioso\s+administrativo|de\s+nulidad)\b/ },
  { matter: 'PENAL', label: 'Materia/causa penal', pattern: /\bmateria\s+penal\b|\bcausa\s+penal\b|\bcarpeta\s+(?:de\s+investigacion|administrativa)\b/ },
  { matter: 'AGRARIA', label: 'Materia agraria', pattern: /\bmateria\s+agraria\b|\bjuicio\s+agrario\b/ },
];

/** Ordenamientos citados. Peso intermedio: ubican la materia pero no bastan solos frente a un foro. */
const LEGISLATION_SIGNALS: Array<Signal & { weight: number }> = [
  { matter: 'CIVIL', weight: 2, label: 'Código Civil / procesal civil', pattern: /\bcodigo\s+(?:nacional\s+de\s+procedimientos\s+civiles|de\s+procedimientos\s+civiles|civil)\b/ },
  { matter: 'MERCANTIL', weight: 2, label: 'Código de Comercio / LGTOC', pattern: /\bcodigo\s+de\s+comercio\b|\bley\s+general\s+de\s+titulos\s+y\s+operaciones\s+de\s+credito\b/ },
  { matter: 'LABORAL', weight: 3, label: 'Ley Federal del Trabajo / burocrática', pattern: /\bley\s+federal\s+del\s+trabajo\b|\bley\s+(?:federal\s+)?(?:de\s+los\s+|para\s+los\s+)?(?:trabajadores|servidores\s+publicos)\s+(?:al\s+servicio\s+del\s+estado|del\s+estado)\b/ },
  { matter: 'ADMINISTRATIVA', weight: 3, label: 'Ley de contencioso administrativo / Código Fiscal', pattern: /\bley\s+(?:federal\s+)?de(?:l)?\s+(?:procedimiento\s+)?(?:contencioso\s+administrativo|justicia\s+administrativa)\b|\bcodigo\s+fiscal\b|\bley\s+de\s+(?:procedimiento\s+administrativo|movilidad)\b/ },
  { matter: 'PENAL', weight: 3, label: 'Código penal / CNPP', pattern: /\bcodigo\s+(?:nacional\s+de\s+procedimientos\s+penales|penal)\b/ },
  { matter: 'AGRARIA', weight: 3, label: 'Ley Agraria', pattern: /\bley\s+agraria\b/ },
  { matter: 'AMPARO', weight: 2, label: 'Ley de Amparo', pattern: /\bley\s+de\s+amparo\b/ },
];

/** Vocabulario propio de cada materia. Solo cuentan términos DISTINTOS. */
const CONTENT_TERMS: Record<SubstantiveMatter, RegExp[]> = {
  LABORAL: [/\bdespid(?:o|ida|ido)\b/, /\bsalarios?\s+caidos\b/, /\breinstalacion\b/, /\brelacion\s+(?:laboral|de\s+trabajo)\b/, /\bprestaciones\s+laborales\b/, /\baguinaldo\b/, /\bprima\s+vacacional\b/, /\btrabajador(?:a|es)?\b/, /\bpatr[o]n(?:al)?\b/, /\bjornada\s+(?:de\s+trabajo|laboral|extraordinaria)\b/, /\bindemnizacion\s+constitucional\b/, /\blaudo\b/, /\bprima\s+de\s+antig[u]edad\b/],
  FAMILIAR: [/\bpension\s+alimenticia\b/, /\balimentos\b/, /\bguarda\s+y\s+custodia\b/, /\bpatria\s+potestad\b/, /\bdivorcio\b/, /\bregimen\s+de\s+(?:convivencia|visitas)\b/, /\bmenor(?:es)?\s+de\s+edad\b/, /\bconyuge\b/, /\bconcubin(?:ato|a|o)\b/],
  CIVIL: [/\barrendamiento\b/, /\bcompraventa\b/, /\busucapion\b|\bprescripcion\s+adquisitiva\b/, /\baccion\s+reivindicatoria\b/, /\bdano\s+moral\b/, /\bresponsabilidad\s+civil\b/, /\bhipotec(?:a|ario)\b/, /\brescision\s+(?:del?\s+)?contrato\b/, /\bposesion\b/, /\bcontrato\s+de\s+(?:mutuo|prestacion\s+de\s+servicios|donacion|comodato)\b/],
  MERCANTIL: [/\bpagare\b/, /\bletra\s+de\s+cambio\b/, /\bcheque\b/, /\btitulos?\s+de\s+credito\b/, /\bcomerciante\b/, /\bsociedad\s+(?:anonima|mercantil)\b/, /\bendoso\b/, /\bacto\s+de\s+comercio\b/],
  ADMINISTRATIVA: [/\bacto\s+administrativo\b/, /\bresolucion\s+impugnada\b/, /\bnulidad\b/, /\bmulta\b/, /\binfraccion\b|\bfotoinfraccion\b/, /\bcredito\s+fiscal\b/, /\bautoridad\s+(?:fiscal|administrativa|demandada)\b/, /\bservicio\s+de\s+administracion\s+tributaria\b/],
  PENAL: [/\bdelito\b/, /\bimputad[oa]\b/, /\bvictima\b/, /\bvinculacion\s+a\s+proceso\b/, /\bministerio\s+publico\b/, /\bprision\s+preventiva\b/, /\bsentenciad[oa]\b/],
  AGRARIA: [/\bejid(?:o|al|atario)\b/, /\bcomuner[oa]\b/, /\bparcela\b/, /\basamblea\s+ejidal\b/],
  AMPARO: [/\bquejos[oa]\b/, /\bacto\s+reclamado\b/, /\bautoridad(?:es)?\s+responsables?\b/, /\bconceptos?\s+de\s+violacion\b/, /\bsuspension\s+(?:provisional|definitiva|del\s+acto)\b/, /\btercer[oa]\s+interesad[oa]\b/],
};

const MATTERS: SubstantiveMatter[] = ['CIVIL', 'FAMILIAR', 'MERCANTIL', 'LABORAL', 'ADMINISTRATIVA', 'PENAL', 'AGRARIA', 'AMPARO'];

function fold(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[ \t]+/g, ' ');
}

/** Encabezado: primeras líneas con contenido, donde va el destinatario o el órgano emisor. */
function headerOf(folded: string): string {
  return folded
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(0, 30)
    .join('\n')
    .slice(0, 3_000);
}

export function classifyMatter(text: string): MatterClassification {
  const folded = fold(text);
  const header = headerOf(folded);
  const opening = folded.slice(0, 8_000);
  const body = folded.slice(0, 40_000);
  const scores = Object.fromEntries(MATTERS.map((matter) => [matter, 0])) as Record<SubstantiveMatter, number>;
  const evidence: Record<SubstantiveMatter, string[]> = Object.fromEntries(MATTERS.map((matter) => [matter, []])) as unknown as Record<SubstantiveMatter, string[]>;

  for (const signal of FORUM_SIGNALS) {
    if (signal.pattern.test(header)) {
      scores[signal.matter] += FORUM_WEIGHT;
      evidence[signal.matter].push(`foro: ${signal.label}`);
    }
  }
  for (const signal of DECLARATION_SIGNALS) {
    if (signal.pattern.test(opening)) {
      scores[signal.matter] += DECLARATION_WEIGHT;
      evidence[signal.matter].push(`declaración: ${signal.label}`);
    }
  }
  for (const signal of LEGISLATION_SIGNALS) {
    if (signal.pattern.test(body)) {
      scores[signal.matter] += signal.weight;
      evidence[signal.matter].push(`legislación: ${signal.label}`);
    }
  }
  for (const matter of MATTERS) {
    const distinct = CONTENT_TERMS[matter].filter((pattern) => pattern.test(body)).length;
    if (distinct > 0) {
      scores[matter] += Math.min(CONTENT_CAP, distinct * CONTENT_TERM_WEIGHT);
      evidence[matter].push(`contenido: ${distinct} término(s) propios`);
    }
  }

  // El amparo es una vía, no una materia sustantiva: un amparo directo contra un
  // laudo sigue siendo materia laboral. Primero se decide la materia sustantiva y
  // solo si no hay señales suficientes se recurre a AMPARO.
  const substantive = MATTERS.filter((matter) => matter !== 'AMPARO').sort((left, right) => scores[right] - scores[left]);
  const [best, second] = substantive;
  const top = scores[best];
  const margin = top - scores[second];
  if (top >= DECISION_THRESHOLD && margin >= DECISION_MARGIN) {
    return { matter: best, confidence: confidenceFor(top, margin), evidence: evidence[best], scores };
  }
  if (scores.AMPARO >= DECISION_THRESHOLD && scores.AMPARO - top >= DECISION_MARGIN) {
    return { matter: 'AMPARO', confidence: confidenceFor(scores.AMPARO, scores.AMPARO - top), evidence: evidence.AMPARO, scores };
  }
  return { matter: 'NO_IDENTIFICADA', confidence: 0, evidence: [], scores };
}

function confidenceFor(top: number, margin: number): number {
  return Number(Math.min(0.95, 0.5 + Math.min(top, 12) / 30 + Math.min(margin, 6) / 30).toFixed(2));
}

const MATTER_LABELS: Record<MatterDecision, string> = {
  CIVIL: 'Civil',
  FAMILIAR: 'Familiar',
  MERCANTIL: 'Mercantil',
  LABORAL: 'Laboral',
  ADMINISTRATIVA: 'Administrativa',
  PENAL: 'Penal',
  AGRARIA: 'Agraria',
  AMPARO: 'Amparo',
  NO_IDENTIFICADA: 'Por confirmar',
};

/** Etiqueta para la ficha del expediente. "Por confirmar" cuando no hay señales suficientes. */
export function matterLabelFor(decision: MatterDecision): string {
  return MATTER_LABELS[decision];
}
