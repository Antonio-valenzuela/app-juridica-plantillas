/**
 * caseFichaDetection.ts
 *
 * Ficha del expediente que se muestra al abogado al cargar un documento. Usa los
 * MISMOS validadores que el motor (partyExtraction.ts) y el mismo clasificador de
 * materia (matterClassification.ts) para que ficha y motor no diverjan.
 *
 * Reglas:
 *  - El órgano jurisdiccional al que se dirige el escrito ("C. JUEZ…", "H.
 *    TRIBUNAL…") va a `autoridad`, nunca a una parte.
 *  - Sin etiqueta expresa, el compareciente del proemio solo es actor si el propio
 *    documento inicia la acción; la contraparte "demandada a…" igual.
 *  - Lo que no tiene evidencia suficiente queda vacío o "Por confirmar".
 */
import {
  extractActionTarget,
  extractAddressedCourt,
  extractAuthorityLabeled,
  extractInstitutionalAuthority,
  extractPartyField,
  extractProemioCompareciente,
  initiatesAction,
  normalizeCourtName,
} from './partyExtraction';
import { classifyMatter, matterLabelFor } from './matterClassification';
import { extractContestacionParties } from './partyEvidence';

export interface CaseFicha {
  expediente: string;
  actor: string;
  demandado: string;
  abogado: string;
  autoridad: string;
  fechas: string;
  materia: string;
  tipo: string;
  confianza: number;
}

function firstMatch(text: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1] && m[1].trim().length > 1) {
      return m[1].trim().replace(/[.;:,]*$/, '');
    }
  }
  return '';
}

/** Quita las líneas de citas de tesis y precedentes (registro digital, rubro de la cita, «Amparo directo N/AAAA. …»). */
export function stripCitedPrecedents(text: string): string {
  return (text || '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:registro\s+digital|instancia|[eé]poca|d[eé]cima\s+[eé]poca|novena\s+[eé]poca|materias?\(?s?\)?|tesis(?:\s+de\s+jurisprudencia)?\s*:|fuente\s*:|tipo\s*:|contradicci[oó]n\s+de\s+tesis|amparo\s+(?:directo|indirecto)(?:\s+en\s+revisi[oó]n)?\s+\d|amparo\s+en\s+revisi[oó]n\s+\d|recurso\s+de\s+(?:queja|reclamaci[oó]n)\s+\d|esta\s+tesis\s+se\s+public[oó])/i.test(line))
    .join('\n')
    .replace(/\b\d{1,2}a?\.?\s*\/?\s*[JL]\.?\s*\d{1,4}\/\d{4}(?:\s*\(\d{1,2}a\.\))?/g, ' ')
    .replace(/\b[IVX]{1,5}\.\d{1,2}[ºo°]?\.[A-Z]{1,3}\.\d{1,4}\s*[A-Z]?\b/g, ' ');
}

export function detectCaseFicha(texts: string[]): CaseFicha {
  const full = texts.join('\n\n');

  const startsAction = initiatesAction(full);

  // El número del caso no se toma de la jurisprudencia o las tesis que el escrito cita («Amparo directo 3296/2004»,
  // «1a./J. 18/2005»): son precedentes ajenos. Y una demanda que inicia la acción todavía no tiene expediente: solo se
  // acepta el número con rótulo explícito («Expediente: …»), no un «N/AAAA» suelto del texto.
  const ownText = stripCitedPrecedents(full);
  const expediente = startsAction
    // Demanda: solo «Expediente: N/AAAA»; «juicio/amparo directo N/AAAA» dentro de la exposición suele ser una cita.
    ? firstMatch(ownText, [/\b(?:expediente|exp\.)\s*(?:n[uú]m(?:ero)?\.?|no\.?)?\s*[:\-]?\s*([0-9]{1,6}\s*[\/\-\.]\s*[0-9]{2,4})/i])
    : firstMatch(ownText, [
      /(?:expediente|juicio|toca|amparo\s+directo|amparo\s+indirecto|proceso)\s*[:\-]?\s*([0-9]{1,6}\s*[\/\-\.]\s*[0-9]{2,4})/i,
    ]) || firstMatch(ownText, [/\b(\d{1,6}\/\d{4})\b/i]);

  const actor =
    extractPartyField(full, [
      /(?:actor|parte\s+actora|demandante)\s*[:\-]\s*([^;,\n]{2,90})/i,
      /(?:quejoso|persona\s+quejosa|parte\s+quejosa|promovente|accionante)\s*[:\-]\s*([^;,\n]{2,90})/i,
    ]) ||
    (startsAction ? extractProemioCompareciente(full) : undefined) ||
    (!startsAction ? extractContestacionParties(full).actor : undefined) ||
    '';

  // En una contestación quien comparece (o su representada) es la parte demandada.
  const answersDemand = !startsAction && /\b(?:dar|doy|damos|producir)\s+contestaci[oó]n\b|\bcontest(?:o|amos)\s+(?:la|a\s+la)\s+demanda\b/i.test(full);
  const demandado =
    extractPartyField(full, [
      /(?:demandado|parte\s+demandada|tercero\s+interesado)\s*[:\-]\s*([^;,\n]{2,90})/i,
    ]) ||
    (startsAction ? extractActionTarget(full) : undefined) ||
    (answersDemand ? extractProemioCompareciente(full) : undefined) ||
    (!startsAction ? extractContestacionParties(full).demandado : undefined) ||
    '';

  // "Lic. X" sin etiqueta puede ser el juez, el secretario o el abogado de
  // cualquiera de las partes: no se asigna rol sin evidencia expresa.
  const abogado =
    extractPartyField(full, [
      /(?:abogado\s+(?:patrono|defensor)|apoderado\s+legal|autorizado|representante\s+legal)\s*[:\-]\s*([^;,\n]{2,90})/i,
    ]) || '';

  const autoridad = normalizeCourtName(
    extractAuthorityLabeled(full) ||
    extractAddressedCourt(full) ||
    extractInstitutionalAuthority(full) ||
    '',
  );

  const fechasMatch = full.match(/(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4})|\b(\d{1,2}\/\d{1,2}\/\d{4})\b/gi);
  const fechas = fechasMatch ? Array.from(new Set(fechasMatch.map((f) => f.replace(/^,?\s*/, '')))).slice(0, 3).join(' · ') : '';

  // Foro + declaración + legislación + contenido. Una palabra aislada ("junta",
  // "patrón") no decide la materia; sin señales suficientes queda "Por confirmar".
  const materia = matterLabelFor(classifyMatter(full).matter);

  let tipo = 'Por confirmar';
  if (/recurso\s+de\s+revisi[oó]n/i.test(full)) tipo = 'Recurso de Revisión';
  else if (/recurso\s+de\s+queja/i.test(full)) tipo = 'Recurso de Queja';
  else if (/contestaci[oó]n/i.test(full) && /demanda/i.test(full)) tipo = 'Contestación de Demanda';
  else if (/amparo\s+directo/i.test(full)) tipo = 'Amparo Directo';
  else if (/amparo\s+indirecto/i.test(full)) tipo = 'Amparo Indirecto';
  else if (startsAction) tipo = 'Demanda';

  const foundCount = [expediente, actor, demandado, abogado, autoridad, fechas].filter(Boolean).length;
  const confianza = Math.min(100, Math.round(35 + foundCount * 11));

  return { expediente, actor, demandado, abogado, autoridad, fechas, materia, tipo, confianza };
}
