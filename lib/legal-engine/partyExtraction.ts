/**
 * partyExtraction.ts
 *
 * FUENTE ÚNICA DE VERDAD para la validación de candidatos a "parte procesal".
 * La consume el motor (caseAnalysis.ts) y la ficha del frontend
 * (app/machotes/page.tsx → detectCaseFicha) para que NUNCA usen criterios gemelos.
 *
 * Reglas mínimas de calidad (corrección P3):
 *  1. Rechazar capturas con estructura evidente de fecha (numérica o escrita en letra).
 *  2. No permitir que la captura cruce una oración (corte en frontera ". Mayúscula").
 *  3. Preferir separación semántica explícita de campo ("label:" / "label-") — los
 *     patrones consumidores exigen separador; este módulo valida el resultado.
 *  4. Conservar nombres institucionales complejos (H. PLENO DEL TRIBUNAL…).
 *  5. Rechazar frases preposicionales como inicio de nombre ("Ante el Instituto…").
 */

const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';

/** Fecha numérica: "17 de octubre de 2024", "el 3 de mayo". */
const DATE_NUMERIC_RE = new RegExp(`^\\s*(?:el\\s+)?\\d{1,2}\\s+de\\s+(?:${MONTHS})(?:\\s+de\\s+\\d{4})?`, 'i');
/** Fecha escrita en letra: "El diecisiete de octubre de dos mil veinticuatro". */
const DATE_WRITTEN_RE = new RegExp(`^\\s*(?:el\\s+)?[a-záéíóúñ]+\\s+de\\s+(?:${MONTHS})\\b`, 'i');
/** Cierre de fecha escrito en letra: "…octubre de dos mil veintiséis". */
const DATE_WRITTEN_YEAR_RE = new RegExp(`\\b(?:${MONTHS})\\s+de\\s+(?:dos\\s+mil[a-záéíóúñ\\s]*|veinti[uú]n)\\b`, 'i');

/**
 * Inicios preposicionales típicos de FRASE, no de nombre de parte.
 * Nota conservadora: también se rechazan inicios "Del/De la" aunque existan
 * apellidos compuestos raros con esa forma — un [DATO PENDIENTE] es preferible
 * a absorber una oración del expediente.
 */
const PREPOSITIONAL_START_RE =
  /^\s*(?:ante|para|seg[uú]n|bajo|con|del|de\s+la|de\s+los|de\s+las|al|en|entre|sin|sobre|tras|hasta|desde|durante|mediante|contra|dentro)\b/i;

/** Palabras que delatan que la captura es una oración, no una denominación. */
const SENTENCE_STOPWORD_RE =
  /\b(?:promovi[oó]|present[oó]|notific[oó]|requiri[oó]|dijo|señal[oó]|manifest[oó]|compareci[oó]|acreditando|para\s+que|a\s+fin\s+de|con\s+fecha|dentro\s+del?\s+juicio|en\s+los\s+autos)\b/i;

/** Recorta la captura antes del inicio de una nueva oración (". Mayúscula"). */
export function trimToSentence(raw: string): string {
  let v = (raw || '').trim().replace(/[.;:,]+$/, '').replace(/[\])}]+$/, '');
  const boundary = v.search(/\.\s+[A-ZÁÉÍÓÚÑ("“]/);
  // Corta cuando queda un nombre útil antes de una nueva etiqueta/oración.
  // El umbral bajo también cubre nombres breves ("Ana Ruiz. DEMANDADO:")
  // sin romper abreviaturas iniciales: se exige que la captura anterior tenga
  // al menos dos palabras.
  if (boundary >= 4 && v.slice(0, boundary).trim().split(/\s+/).length >= 2) {
    v = v.slice(0, boundary).trim().replace(/[.;:,]+$/, '').replace(/[\])}]+$/, '');
  }
  return v.trim();
}

/**
 * Valida un candidato a nombre de parte/autoridad.
 * Debe recibir la captura YA recortada con trimToSentence.
 */
export function isValidPartyName(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const v = String(raw).trim();
  if (v.length < 4 || v.length > 120) return false;
  if (DATE_NUMERIC_RE.test(v) || DATE_WRITTEN_RE.test(v)) return false;
  if (DATE_WRITTEN_YEAR_RE.test(v)) return false;
  if (PREPOSITIONAL_START_RE.test(v)) return false;
  // Debe iniciar con letra (no dígito, no símbolo, no corchete vacío).
  if (!/^[A-ZÁÉÍÓÚÑÜÑa-záéíóúñ]/.test(v)) return false;
  // Denominación plausible: al menos dos tokens o un token largo (empresas).
  const tokens = v.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 && v.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '').length < 6) return false;
  return true;
}

/**
 * Extrae el PRIMER candidato VÁLIDO para un campo de parte.
 * A diferencia de un `match()` simple, itera TODAS las apariciones de cada
 * patrón: si la primera aparición produce basura (fecha/frase preposicional),
 * se intenta la siguiente y luego el patrón siguiente.
 */
export function extractPartyField(corpus: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(corpus)) !== null && guard < 200) {
      guard++;
      if (!m[1]) break;
      const candidate = trimToSentence(m[1]);
      if (isValidPartyName(candidate)) return candidate;
      // Seguridad regex: evitar bucles infinitos con patrones de longitud cero.
      if (re.lastIndex === m.index) re.lastIndex++;
    }
  }
  return undefined;
}

/** True when a source value is visibly redacted/anonimized rather than absent. */
export function isAnonymizedValue(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const value = String(raw).trim();
  const maskChars = (value.match(/[\*#xX…•·█_]/g) || []).length;
  return maskChars >= 2 && /^[\s\*#xX…•·█_.,;:/\\-]+$/.test(value);
}

/**
 * Finds a visibly redacted field using the same candidates as the regular
 * party extractor. Redaction is metadata about the source, not a party name.
 */
export function extractAnonymizedField(corpus: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    let guard = 0;
    while ((match = re.exec(corpus)) !== null && guard < 200) {
      guard++;
      if (match[1] && isAnonymizedValue(match[1])) return match[1].trim();
      if (re.lastIndex === match.index) re.lastIndex++;
    }
  }
  return undefined;
}

/**
 * Patrón de ANCLA institucional: captura la propia denominación del órgano
 * sin requerir label previo. Se usa como último recurso para AUTORIDAD.
 * El consumidor debe verificar mayusculidad con isInstitutionalCaps().
 */
export const INSTITUTIONAL_ANCHOR_PATTERNS: RegExp[] = [
  /((?:H\.\s*)?(?:PLENO\s+DEL\s+)?TRIBUNAL[^;,\n]{0,70})/,
  /((?:H\.\s*)?JUZGADO\s+(?:[A-ZÁÉÍÓÚÑ]+\s+){0,4}DE\s+DISTRITO[^;,\n]{0,50})/,
  /(JUNTA\s+(?:ESPECIAL|DE\s+CONCILIACI[ÓO]N\s+Y\s+ARBITRAJE)[^;,\n]{0,60})/,
  /(TRIBUNAL\s+DE\s+ARBITRAJE\s+Y\s+ESCALAF[ÓO]N[^;,\n]{0,60})/,
];

/**
 * True si la denominación capturada por ancla es mayormente MAYÚSCULAS
 * (forma típica de nombres institucionales en sentencias), lo que evita
 * absorber prosa minúscula tipo "tribunal sostuvo que…".
 */
export function isInstitutionalCaps(candidate: string): boolean {
  const letters = candidate.match(/[A-ZÁÉÍÓÚÑÜa-záéíóúñü]/g) || [];
  if (letters.length === 0) return false;
  const upper = letters.filter((c) => /[A-ZÁÉÍÓÚÑÜ]/.test(c)).length;
  return upper / letters.length >= 0.5;
}

/**
 * Extrae la AUTORIDAD por ancla institucional (sin label previo).
 * Último recurso cuando el documento no trae "AUTORIDAD RESPONSABLE:".
 * Exige denominación mayormente mayúscula + validación general, e itera
 * apariciones hasta encontrar una válida.
 */
export function extractInstitutionalAuthority(corpus: string): string | undefined {
  for (const pattern of INSTITUTIONAL_ANCHOR_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(corpus)) !== null && guard < 200) {
      guard++;
      // La captura del ancla puede quedar truncada por el salto de línea:
      // absorber las líneas de continuación del nombre envuelto.
      const acc = absorbNameFromTail(m[0], corpus.slice(m.index + m[0].length));
      const candidate = trimToSentence(acc);
      if (isInstitutionalCaps(candidate) && isValidPartyName(candidate)) return candidate;
      if (re.lastIndex === m.index) re.lastIndex++;
    }
  }
  return undefined;
}

/**
 * Acumula líneas de continuación de un nombre institucional ENVUELTO:
 * "H. PLENO DEL TRIBUNAL DE\nARBITRAJE Y ESCALAFÓN…".
 *
 * @param seed  Nombre acumulado ANTES de la cola ('' si el nombre empieza en tail).
 * @param tail  Texto crudo posterior al seed / al label. Su primera porción
 *              (antes del primer \n) es la continuación EN LA MISMA línea.
 * Solo absorbe líneas mayormente mayúsculas; jamás rúbricas procesales nuevas,
 * labels de campo ("QUEJOSO Y RECURRENTE:") ni valores entre corchetes.
 */
function absorbNameFromTail(seed: string, tail: string): string {
  let acc = (seed || '').trim();
  const RUBRIC_START_RE =
    /^(?:POR\s+(?:LO|TANTO)|PORS?\s+TANTO|CONSIDERANDO|RESULTANDO|VISTO|PRIMERO|SEGUNDO|TERCERO|PROTESTO|PETITORIO|EXPOSE|EXPONGO)\b/i;
  const parts = (tail || '').split('\n');
  const max = Math.min(parts.length, 6);
  for (let i = 0; i < max; i++) {
    const ln = parts[i].trim();
    if (!ln) {
      if (i === 0) continue; // artefacto: la captura terminó exactamente en el salto
      break;                 // fin de párrafo → fin del nombre
    }
    if (/[:;]$/.test(ln)) break; // nueva etiqueta de campo → fin del nombre
    if (/^[[(]/.test(ln)) break; // valor entre corchetes/paréntesis → otra cosa
    // Línea-label de campo nueva ("QUEJOSO Y RECURRENTE:", "FECHA: …") → fin.
    if (/^[A-ZÁÉÍÓÚÑ0-9 .,\-]{2,45}:\s/i.test(ln)) break;
    if (RUBRIC_START_RE.test(ln)) break;
    if (!isInstitutionalCaps(ln)) break;
    if (acc.length >= 140) break;
    // Validación incremental: si al absorber la línea el nombre deja de ser
    // plausible, se revierte y se corta (la línea pertenecía a otro campo).
    const next = `${acc ? `${acc} ` : ''}${ln}`;
    if (!isValidPartyName(trimToSentence(next.split(',')[0]))) break;
    acc = next;
  }
  return acc.split(',')[0];
}

/** Labels de AUTORIDAD con separador OBLIGATORIO al final del patrón. */
const AUTHORITY_LABEL_PATTERNS: RegExp[] = [
  /(?:autoridad(?:es)?(?:\s+señalada(?:s)?\s+como)?\s+(?:responsable(?:s)?|ejecutora(?:s)?|ordenadora(?:s)?|demandada(?:s)?|emisora(?:s)?))\s*[:.\s\-]+\s*/i,
  /(?:órgano\s+jurisdiccional|tribunal\s+colegiado|juzgado\s+de\s+distrito|junta\s+especial)\s*[:.\s\-]+\s*/i,
];

/**
 * Extrae la entidad colocada tras un label de AUTORIDAD, tolerando nombres
 * institucionales ENVUELTOS en varias líneas ("H. PLENO DEL TRIBUNAL DE\n
 * ARBITRAJE Y ESCALAFÓN…"). La denominación termina en la primera coma
 * complementaria, en frontera de oración o cuando la línea siguiente ya no
 * continúa el nombre en mayúsculas. Nunca absorbe fechas ni oraciones ajenas.
 */
export function extractAuthorityLabeled(corpus: string): string | undefined {
  for (const labelPattern of AUTHORITY_LABEL_PATTERNS) {
    const re = new RegExp(labelPattern.source, 'gi');
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(corpus)) !== null && guard < 200) {
      guard++;
      const acc = absorbNameFromTail('', corpus.slice(m.index + m[0].length));
      const candidate = trimToSentence(acc);
      if (isValidPartyName(candidate)) return candidate;
      if (re.lastIndex === m.index) re.lastIndex++;
    }
  }
  return undefined;
}

/**
 * Extrae el órgano jurisdiccional que emitió la resolución recurrida.
 *
 * Esta captura es deliberadamente independiente de `extractAuthorityLabeled`:
 * la autoridad responsable del acto de origen y el órgano que resolvió el
 * amparo pueden ser instituciones distintas. Solo se acepta una denominación
 * que aparezca anclada a una fórmula resolutiva/procesal y que identifique un
 * órgano jurisdiccional; nunca se reutiliza por similitud el primer tribunal
 * mencionado en la fuente.
 */
export function extractResolvingCourt(corpus: string): string | undefined {
  const patterns: RegExp[] = [
    /(?:acuerdo|sentencia|resoluci[oó]n)\s+del\s+([^,\n]+(?:\n[^,\n]+){0,3})(?=,\s*correspondiente\b)/i,
    /as[ií]\s+lo\s+resolvi[oó]\s+este\s+([^,\n]+(?:\n[^,\n]+){0,3})(?=,\s*(?:por|en)\b)/i,
    /\b(?:este|el)\s+([^,\n]+(?:\n[^,\n]+){0,3})\s+(?:registr[oó]|admiti[oó]|resolvi[oó])\b/i,
  ];

  for (const pattern of patterns) {
    const match = corpus.match(pattern);
    const candidate = trimToSentence(match?.[1]?.replace(/\s+/g, ' ') || '');
    if (candidate && /\b(?:tribunal|juzgado|sala)\b/i.test(candidate) && isValidPartyName(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
