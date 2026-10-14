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
 * El órgano jurisdiccional y sus funcionarios dirigen el proceso; nunca son
 * actor, demandado, promovente ni tercero. Cubre el tratamiento de cortesía con
 * que se les dirige el escrito ("C. JUEZ NOVENO DE LO CIVIL", "H. TRIBUNAL…").
 * Las autoridades ADMINISTRATIVAS sí pueden ser parte (autoridad demandada en un
 * juicio de nulidad), por eso no se incluyen aquí.
 */
const JURISDICTIONAL_DESIGNATION_RE = new RegExp(
  '^(?:(?:C\\.|CC\\.|CIUDADAN[OA]S?|H\\.|HONORABLE|SU|EL|LA|LOS|LAS)\\s*)*'
  + '(?:JUEZ(?:A|AS)?|JUECES|MAGISTRAD[OA]S?|MINISTR[OA]S?(?:\\s+(?:PONENTE|INSTRUCTOR))?|SECRETARI[OA]S?\\s+(?:DE\\s+ACUERDOS|PROYECTISTA|DE\\s+ESTUDIO)|ACTUARI[OA]S?|NOTIFICADOR(?:A|ES)?'
  + '|JUZGADO|TRIBUNAL|SALA\\b|PLENO|JUNTA\\s+(?:LOCAL|FEDERAL|ESPECIAL|DE\\s+CONCILIACI[OÓ]N)|CENTRO\\s+(?:FEDERAL\\s+)?DE\\s+CONCILIACI[OÓ]N'
  + '|PRESIDENT[EA]\\s+DE\\s+(?:LA\\s+|EL\\s+)?(?:JUNTA|SALA|TRIBUNAL)|[OÓ]RGANO\\s+JURISDICCIONAL|AUTORIDAD\\s+JUDICIAL|SEÑOR[IÍ]A|US[IÍ]A)(?![A-Za-zÁÉÍÓÚÑáéíóúñ])',
  'i',
);

/**
 * Referencias deícticas o genéricas: "ESTE H. JUZGADO", "dicho tribunal", "mi
 * representada", "la parte actora". Describen a alguien ya nombrado; no son el
 * nombre de una parte y no deben ocupar ese campo.
 */
const DEICTIC_START_RE = /^(?:ESTE|ESTA|ESE|ESA|ESTOS|ESTAS|DICH[OA]S?|AQUEL(?:LA)?|MI|MIS|NUESTR[OA]S?|SU|SUS)(?:\s|$)/i;
const GENERIC_ROLE_RE =
  /^(?:(?:EL|LA|LOS|LAS)\s+)?(?:PARTE\s+)?(?:ACTOR(?:A|ES)?|DEMANDAD[OA]S?|QUEJOS[OA]S?|PROMOVENTES?|RECURRENTES?|TERCER[OA]S?(?:\s+INTERESAD[OA]S?)?|OCURSANTES?|SUSCRIT[OA]S?|COMPARECIENTES?|APODERAD[OA]S?|MANDANTES?|PODERDANTES?|REPRESENTAD[OA]S?|CONTRAPARTE|AUTORIDAD(?:ES)?\s+RESPONSABLES?)\.?$/i;

/** Los extractores recorren TODAS las apariciones: sin bandera `g`, `exec` repetiría siempre la primera. */
function withGlobal(flags: string): string {
  return flags.includes('g') ? flags : `${flags}g`;
}

/** Fórmulas de cortesía o cierre del escrito ("P R E S E N T E", "PROTESTO LO NECESARIO"). */
const FORMULA_RE = /^(?:P\s*R\s*E\s*S\s*E\s*N\s*T\s*E|PROTESTO|ATENTAMENTE|BAJO\s+PROTESTA)\b/i;

/** True si el texto designa al órgano jurisdiccional o a uno de sus funcionarios. */
export function isJurisdictionalDesignation(raw: string | undefined | null): boolean {
  return Boolean(raw) && JURISDICTIONAL_DESIGNATION_RE.test(String(raw).trim());
}

/**
 * Valida un candidato a PARTE PROCESAL (actor, demandado, promovente, tercero,
 * abogado). Además de las reglas generales, rechaza al órgano jurisdiccional,
 * sus funcionarios y las referencias deícticas o genéricas. Si ningún candidato
 * sobrevive, el campo queda pendiente para el abogado en lugar de llenarse con
 * un nombre equivocado.
 */
export function isValidProceduralPartyName(raw: string | undefined | null): boolean {
  if (!isValidPartyName(raw) || isNonPartyDesignation(raw)) return false;
  const value = String(raw).trim();
  // Un nombre de parte es nombre propio o denominación: inicia con mayúscula
  // (o es un valor anonimizado), no abarca varios renglones de prosa y no
  // contiene la sintaxis de una oración ("NO PROBÓ SU ACCIÓN COMO…").
  if (!/^[A-ZÁÉÍÓÚÑÜ[*]/.test(value)) return false;
  if ((value.match(/\n/g) || []).length > 1) return false;
  if (SENTENCE_STOPWORD_RE.test(value)) return false;
  // Ruido de OCR: un nombre de persona o denominación no lleva cifras sueltas
  // ("Ahora 1 A") ni empieza con un adverbio o pronombre ("Me bien. la parte…").
  if (/\d/.test(value) && !/\b(?:S\.?\s*A\.?|S\.?\s*C\.?|S\.?\s*de\s*R\.?\s*L\.?|A\.?\s*C\.?)\b/i.test(value)) return false;
  if (NON_NAME_FIRST_WORD.has(value.split(/[\s,.]+/)[0].toLowerCase())) return false;
  const functionWords = value
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((token) => SENTENCE_FUNCTION_WORDS.has(token)).length;
  return functionWords < 2;
}

/**
 * Palabras funcionales propias de una oración y ajenas a un nombre. No incluye
 * los conectores que sí forman nombres ("de", "del", "la", "y", "los").
 */
/** Palabras que no inician el nombre de una parte (adverbios, pronombres, conectores de oración). */
const NON_NAME_FIRST_WORD = new Set([
  'ahora', 'me', 'te', 'nos', 'bien', 'mal', 'aquí', 'aqui', 'así', 'asi', 'también', 'tambien', 'entonces',
  'luego', 'después', 'despues', 'antes', 'pues', 'porque', 'aunque', 'que', 'cuando', 'donde', 'mismo', 'misma',
  'dicho', 'dicha', 'no', 'sí', 'si', 'ya', 'hoy', 'ayer', 'mañana', 'parte', 'fojas', 'foja', 'página', 'pagina',
]);

const SENTENCE_FUNCTION_WORDS = new Set([
  'que', 'como', 'se', 'no', 'su', 'sus', 'por', 'para', 'es', 'son', 'fue', 'ha', 'han', 'lo', 'le', 'les',
  'con', 'sin', 'cuando', 'donde', 'porque', 'pero', 'sino', 'si', 'sí', 'ya', 'muy', 'más', 'esta', 'este',
  'dicho', 'dicha', 'cual', 'cuales', 'quien', 'quienes', 'era', 'sea', 'ser', 'haber', 'hubo', 'posible',
]);

/**
 * True si el documento INICIA una acción (demanda o amparo). Solo entonces quien
 * comparece en el proemio es la parte actora/quejosa; en una contestación o un
 * recurso, el compareciente es otra parte y no debe rotularse como actor.
 */
export function initiatesAction(corpus: string): boolean {
  return /\b(?:vengo\s+a\s+(?:demandar|promover|solicitar\s+el\s+amparo)|promuevo\s+(?:juicio|demanda|formal\s+demanda)|interpongo\s+(?:formal\s+)?(?:demanda|juicio)|demando\s+(?:en\s+la\s+v[ií]a|a\b|de\b|en\s+contra)|solicito\s+(?:el\s+amparo|la\s+protecci[oó]n\s+de\s+la\s+justicia\s+federal)|entablo\s+formal\s+demanda)/i.test(corpus || '');
}

// Persona moral: «CRÉDITOS SINTÉTICOS, S.A. DE C.V., por conducto de su apoderado…». El sufijo societario
// no forma parte del nombre capturado (como en REPRESENTATION_RE).
const PROEMIO_RE = /(?:^|\n)[ \t]*(?:C\.[ \t]+|CIUDADAN[OA][ \t]+)?([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ. \t]{3,80}?)(?:,\s*(?:S\.?\s*A\.?(?:\s*DE\s*C\.?\s*V\.?)?|S\.?\s*C\.?|S\.?\s*DE\s*R\.?\s*L\.?(?:\s*DE\s*C\.?\s*V\.?)?|A\.?\s*C\.?|S\.?\s*A\.?\s*P\.?\s*I\.?(?:\s*DE\s*C\.?\s*V\.?)?))?,\s*(?:mexican[oa]|mayor\s+de\s+edad|solter[oa]|casad[oa]|por\s+mi\s+propio\s+derecho|por\s+propio\s+derecho|en\s+mi\s+car[aá]cter|en\s+nombre\s+y\s+representaci[oó]n|se[ñn]alando\s+como\s+domicilio|por\s+conducto\s+de\s+su\s+(?:apoderad[oa]|representante))/g;

/**
 * Nombre de quien comparece en el proemio ("JUAN PÉREZ, por mi propio derecho…").
 * Nunca devuelve el destinatario del escrito ("C. JUEZ…", "H. TRIBUNAL…").
 */
export function extractProemioCompareciente(corpus: string): string | undefined {
  const re = new RegExp(PROEMIO_RE.source, PROEMIO_RE.flags);
  let match: RegExpExecArray | null;
  let guard = 0;
  while ((match = re.exec(corpus || '')) !== null && guard < 50) {
    guard++;
    const candidate = trimToSentence(match[1].replace(/\s+/g, ' '));
    if (isValidProceduralPartyName(candidate)) {
      // Quien comparece como apoderado o representante no es la parte: lo es su representada.
      const represented = (corpus || '').slice(match.index, match.index + 500).match(REPRESENTATION_RE)?.[1];
      const representedName = represented ? trimToSentence(represented.replace(/\s+/g, ' ')) : '';
      return representedName && isValidProceduralPartyName(representedName) ? representedName : candidate;
    }
    if (re.lastIndex === match.index) re.lastIndex++;
  }
  return undefined;
}

const REPRESENTATION_RE = /en\s+(?:mi|su)\s+car[aá]cter\s+de\s+(?:apoderad[oa]|representante|mandatari[oa])(?:\s+(?:legal|general|jur[ií]dic[oa]))?(?:\s+para\s+pleitos\s+y\s+cobranzas)?\s+de\s+(?:la\s+(?:persona\s+)?moral\s+(?:denominada\s+)?)?([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ.&\s]{3,90}?)(?:,\s*(?:S\.?\s*A\.?|S\.?\s*C\.?|S\.?\s*de\s*R\.?\s*L\.?)[^,]*)?(?:,|\s+personalidad|\s+parte|\s+ante|\s+con\s+domicilio|\n)/;

const ACTION_TARGET_RE = /(?:vengo\s+a\s+demandar(?:\s+formalmente)?(?:\s+en\s+la\s+v[íi]a[^,\n]+?)?\s+(?:en\s+contra\s+de(?:l)?|a)|demando\s+(?:en\s+la\s+v[íi]a[^,\n]+?\s+)?(?:en\s+contra\s+de(?:l)?|a)|se\s+demanda\s+(?:en\s+la\s+v[íi]a[^,\n]+?\s+)?(?:en\s+contra\s+de(?:l)?|a)|demandar\s+(?:la\s+nulidad[^,\n]+?\s+)?(?:en\s+contra\s+de(?:l)?|a))\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ.,\s]{3,80}?)(?:\s+y\/o|\s*,\s*|\s+con\s+domicilio|\s+qui[eé]n|\s*\n)/gi;

/**
 * «vengo a demandar a JUAN PÉREZ el pago de…»: sin coma, la captura se lleva el objeto de la acción.
 * El nombre termina donde empieza una frase en minúsculas (artículo o preposición seguido de otra
 * palabra en minúscula). «María de la Luz» se conserva: tras «la» sigue una mayúscula.
 */
export function trimClaimObject(value: string): string {
  const cut = value.search(/\s(?:el|la|los|las|lo|por|para|que|al|del|un|una)\s+[a-záéíóúñ]/);
  return cut > 0 ? value.slice(0, cut).trim().replace(/[,;:.]+$/, '') : value;
}

/**
 * Contraparte contra quien se dirige la acción ("vengo a demandar a X, con
 * domicilio…"). Recorre todas las apariciones y descarta al juzgado y las
 * referencias deícticas ("demando ante ESTE H. JUZGADO…").
 */
export function extractActionTarget(corpus: string): string | undefined {
  const re = new RegExp(ACTION_TARGET_RE.source, ACTION_TARGET_RE.flags);
  let match: RegExpExecArray | null;
  let guard = 0;
  while ((match = re.exec(corpus || '')) !== null && guard < 50) {
    guard++;
    // "en contra de la SECRETARÍA…": el artículo en minúscula no forma parte del nombre.
    const candidate = trimClaimObject(trimToSentence(match[1].trim().replace(/^de(?:l)?\s+/i, '').replace(/^(?:la|el|los|las)\s+(?=[A-ZÁÉÍÓÚÑ])/, '')));
    if (isValidProceduralPartyName(candidate)) return candidate;
    if (re.lastIndex === match.index) re.lastIndex++;
  }
  return undefined;
}

/**
 * Órgano jurisdiccional al que se DIRIGE el escrito, tomado del encabezado
 * ("C. JUEZ NOVENO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL", "H. TRIBUNAL…").
 * Es la autoridad que conoce del asunto, nunca una parte.
 */
export function extractAddressedCourt(corpus: string): string | undefined {
  const lines = (corpus || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20);
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^(?:(?:C\.|CC\.|H\.|CIUDADAN[OA])\s*)?((?:JUEZ(?:A)?|JUZGADO|TRIBUNAL|SALA|MAGISTRAD[OA]|JUNTA|PRESIDENT[EA]\s+DE\s+LA\s+JUNTA)\b[^\n]{3,140})$/i);
    if (!match || !isInstitutionalCaps(match[1])) continue;
    let name = match[1].replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim();
    // Continuación envuelta del nombre ("DEL PRIMER PARTIDO JUDICIAL"). El OCR parte la
    // denominación en cualquier palabra: se une mientras la línea actual termine en un
    // conector («DEL») o la siguiente empiece con uno, hasta 3 líneas y sin cruzar «PRESENTE».
    for (let extra = 1; extra <= 3; extra++) {
      const next = lines[index + extra] || '';
      const endsOpen = /\b(?:DE|DEL|EN|LA|LO|LOS|LAS|AL|Y)$/i.test(name);
      const startsConnector = /^(?:DE|DEL|EN)\s/i.test(next);
      if (!next || /^P\s*R\s*E\s*S\s*E\s*N\s*T\s*E\b/i.test(next) || !isInstitutionalCaps(next)) break;
      if (!(endsOpen || startsConnector)) break;
      name = `${name} ${next.replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim()}`;
    }
    return name.replace(/\s+/g, ' ');
  }
  return undefined;
}

/** True si el texto es el juzgado/sus funcionarios o una referencia deíctica o genérica, no un nombre de parte. */
export function isNonPartyDesignation(raw: string | undefined | null): boolean {
  const value = String(raw || '').trim();
  if (!value) return false;
  return isJurisdictionalDesignation(value)
    || DEICTIC_START_RE.test(value)
    || GENERIC_ROLE_RE.test(value)
    || FORMULA_RE.test(value);
}

/**
 * Extrae el PRIMER candidato VÁLIDO para un campo de parte.
 * A diferencia de un `match()` simple, itera TODAS las apariciones de cada
 * patrón: si la primera aparición produce basura (fecha/frase preposicional,
 * el propio juzgado o una referencia como "ESTE H."), se intenta la siguiente
 * y luego el patrón siguiente.
 */
export function extractPartyField(corpus: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, withGlobal(pattern.flags));
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(corpus)) !== null && guard < 200) {
      guard++;
      if (!m[1]) break;
      const candidate = trimToSentence(m[1]);
      if (isValidProceduralPartyName(candidate)) return candidate;
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
    const re = new RegExp(pattern.source, withGlobal(pattern.flags));
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
    const re = new RegExp(pattern.source, withGlobal(pattern.flags));
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
    // Línea de destinatario/tratamiento ("C. JUEZ…", "LIC. …", "P R E S E N T E") = otro campo.
    if (/^(?:C\.|CC\.|LIC\.|MTRO\.|MTRA\.|DR\.|DRA\.)\s/i.test(ln) || /^P\s*R\s*E\s*S\s*E\s*N\s*T\s*E\b/i.test(ln)) break;
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
