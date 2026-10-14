import type { CaseDossier, DossierAgravio } from './caseDossier';
export { extractResolutivos } from './caseDossier';

/**
 * Contestación de agravios (parte apelada): textos deterministas de las secciones fijas y plantilla de cada
 * bloque de agravio. Solo usa datos de la ficha confirmada; lo que no consta queda como campo por completar.
 *
 * Estructura fija: RUBRO Y DESTINATARIO · PROEMIO · OPORTUNIDAD · SÍNTESIS DE LA SENTENCIA APELADA ·
 * CONTESTACIÓN A LOS AGRAVIOS (un bloque por agravio) · CONSTANCIAS INVOCADAS · PUNTOS PETITORIOS ·
 * LUGAR Y FECHA · FIRMA.
 */

export const AGRAVIOS_PLACEHOLDER_TITLE = 'CONTESTACIÓN A LOS AGRAVIOS';

const ORDINAL = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO', 'NOVENO', 'DÉCIMO'];

export function agravioOrdinal(number: number): string {
  return ORDINAL[number - 1] || String(number);
}

export function agravioSectionTitle(number: number): string {
  return `CONTESTACIÓN AL AGRAVIO ${agravioOrdinal(number)}`;
}

/** Instrucción de redacción de un bloque de agravio (la recibe el redactor; nada de ella se imprime). */
export function agravioInstruction(agravio: DossierAgravio): string {
  return [
    `Contesta el AGRAVIO ${agravioOrdinal(agravio.number)} del apelante: «${agravio.text.slice(0, 1200)}».`,
    'Califícalo como infundado, inoperante o inatendible, solo si lo sostienen lo que la sentencia realmente resolvió y las constancias del expediente que consten en las fuentes.',
    'Si ni la sentencia ni las constancias bastan para calificarlo, no lo califiques ni inventes fundamento: limítate a lo que consta.',
    'Escribe únicamente la respuesta a este agravio, sin encabezados, sin firma y sin hablar de otros agravios.',
  ].join(' ');
}

const courtesy = (court: string) => /^(?:C\.|H\.)/i.test(court) ? court
  : /^JUE[ZC]/i.test(court) ? `C. ${court}`
    : /^(?:TRIBUNAL|JUZGADO|SALA|JUNTA)/i.test(court) ? `H. ${court}` : court;

const pending = (label: string) => `[DATO PENDIENTE: ${label}]`;

export interface AgraviosRenderContext {
  dossier?: CaseDossier;
  /** Número de expediente ya resuelto por el pipeline (prevalece sobre el de la ficha). */
  expediente?: string;
  /** Resolutivos de la sentencia apelada, textuales. */
  resolutivos?: readonly string[];
}

function expedienteOf(context: AgraviosRenderContext): string {
  const value = (context.expediente || context.dossier?.expediente || '').trim();
  return value && !/^\[/.test(value) && !/EN TURNO/i.test(value) ? value : pending('número de expediente');
}

function apelanteName(dossier?: CaseDossier): string {
  if (!dossier?.appellantSide) return 'la parte apelante';
  const names = dossier.parties.filter((party) => party.role === dossier.appellantSide).map((party) => party.name);
  return names.length ? names.join(', ') : 'la parte apelante';
}

/** Texto de cada sección fija (sin repetir el título, que se imprime aparte). */
export function renderAgraviosAnswerSection(title: string, type: string, context: AgraviosRenderContext): string | undefined {
  const key = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const { dossier } = context;
  const exp = expedienteOf(context);
  const represented = dossier?.representedName?.trim() || pending('nombre de la parte apelada');

  if (/^rubro/.test(key)) {
    const court = dossier?.court ? courtesy(dossier.court).toUpperCase() : pending('órgano jurisdiccional');
    return `${court}\nPRESENTE.\n\nEXPEDIENTE: ${exp}`;
  }
  if (/^proemio/.test(key)) {
    const date = dossier?.resolution?.date ? ` dictada el ${dossier.resolution.date}` : '';
    return `${represented}, en su carácter de parte apelada dentro del expediente ${exp}, comparece a contestar los agravios que hizo valer ${apelanteName(dossier)} en su recurso de apelación contra la sentencia definitiva${date}.`;
  }
  if (/^oportunidad/.test(key)) {
    return `La contestación se presenta dentro del plazo legal que corre desde la notificación del traslado de los agravios, ocurrida el ${pending('fecha de notificación del traslado de los agravios')}.`;
  }
  if (/^sintesis/.test(key)) {
    const date = dossier?.resolution?.date ? ` de ${dossier.resolution.date}` : '';
    const court = dossier?.resolution?.court || dossier?.court;
    const intro = `La sentencia definitiva${date}${court ? `, dictada por ${court},` : ''} resolvió:`;
    return context.resolutivos?.length
      ? `${intro}\n\n${context.resolutivos.join('\n')}`
      : `${intro} ${pending('puntos resolutivos de la sentencia apelada')}`;
  }
  if (/^constancias/.test(key)) {
    return `Se invocan las constancias que integran el expediente ${exp}, en particular la sentencia definitiva apelada y las actuaciones que se citan al contestar cada agravio.`;
  }
  if (/^puntos petitorios|^petitorios/.test(key) || type === 'petition') {
    return [
      'PRIMERO. Tener a la parte apelada por presentada, contestando en tiempo y forma los agravios del apelante.',
      'SEGUNDO. Declarar que los agravios expresados no prosperan, en los términos expuestos en este escrito.',
      'TERCERO. Confirmar la sentencia apelada.',
    ].join('\n');
  }
  if (/^lugar y fecha/.test(key) || type === 'closing') {
    return closingText(dossier?.city);
  }
  if (/^firma/.test(key) || type === 'signature') {
    return signatureText(dossier?.representedName, 'Parte apelada');
  }
  if (/^contestacion a los agravios/.test(key)) {
    return pending('agravios del apelante: sube su escrito de apelación para contestarlos');
  }
  return undefined;
}

/** Texto determinista de un bloque de agravio cuando no hay redactor disponible. */
export function renderAgravioFallback(agravio: DossierAgravio): string {
  const summary = agravio.text.length > 600 ? `${agravio.text.slice(0, 600).trimEnd()}…` : agravio.text;
  return [
    `El apelante sostiene que ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`,
    '',
    `[REQUIERE POSTURA DEL ABOGADO: calificar el agravio ${agravioOrdinal(agravio.number)} como infundado, inoperante o inatendible y señalar la parte de la sentencia o la constancia que lo respalda]`,
  ].join('\n');
}

/* ── cierre y firma (compartidos por todos los tipos) ─────────────────────── */

/** Lugar de la ficha; la fecha no consta y queda en blanco. */
export function closingText(city?: string): string {
  return `PROTESTO LO NECESARIO.\n\n${city?.trim() || '____________________'}, a ______ de ____________________ de ________.`;
}

export function signatureText(name: string | undefined, roleLabel: string): string {
  const signer = name?.trim() || pending('nombre de quien firma');
  return `_________________________________________\n${signer}\n${roleLabel}`;
}
