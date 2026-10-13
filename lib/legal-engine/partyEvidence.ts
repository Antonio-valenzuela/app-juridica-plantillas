import type { UploadedSourceDocument } from './types';
import {
  extractActionTarget,
  extractProemioCompareciente,
  isValidProceduralPartyName,
  trimToSentence,
} from './partyExtraction';

/**
 * Señales de procedencia de una parte y partes en contestaciones.
 *
 * Ninguna parte se asigna por una palabra suelta: cada nombre conserva las
 * señales independientes que lo sostienen (etiqueta, proemio, destinatario de la
 * acción…), la foja y el fragmento. Con una sola señal débil la confianza es baja
 * y la UI debe tratar el dato como «por confirmar».
 */

export type PartySignal = 'label' | 'proemio' | 'action_target' | 'contestacion_proemio' | 'contestacion_promovido_por' | 'instruction';

export interface PartyEvidence {
  role: 'actor' | 'demandado';
  value: string;
  signals: PartySignal[];
  /** 0–1. ≥0.85 con etiqueta explícita; una sola señal contextual queda en 0.6–0.75. */
  confidence: number;
  needsConfirmation: boolean;
  page?: number;
  excerpt?: string;
  sourceId?: string;
}

const COMPANY_SUFFIX = String.raw`(?:,\s*(?:S\.?\s*A\.?|S\.?\s*C\.?|S\.?\s*de\s*R\.?\s*L\.?)[^,]*)?`;
const NAME = String.raw`([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ.&\s]{3,100}?)`;
const REPRESENTED_RE = new RegExp(
  String.raw`(?:apoderad[oa]|representante|mandatari[oa])(?:\s+(?:legal|general|jur[ií]dic[oa]))?(?:\s+para\s+pleitos\s+y\s+cobranzas)?\s+de\s+(?:la\s+(?:persona\s+)?moral\s+(?:denominada\s+)?)?` + NAME + COMPANY_SUFFIX + String.raw`,?\s+(?:parte\s+demandada|en\s+su\s+car[aá]cter\s+de\s+demandad[oa])`,
  'i',
);
const PROMOVIDO_POR_RE = new RegExp(
  String.raw`(?:promovid[oa]|instaurad[oa]|entablad[oa]|iniciad[oa]|interpuest[oa])\s+(?:en\s+(?:su|mi)\s+contra\s+)?por\s+` + NAME + COMPANY_SUFFIX + String.raw`(?:,|\s+ante\b|\.)`,
);
const CONTESTA_RE = /\b(?:contestaci[oó]n\s+(?:de\s+la\s+|a\s+la\s+)?demanda|contestar\s+la\s+demanda|dar\s+contestaci[oó]n)\b/i;

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Quita razón social duplicada ("…, S.A. DE C.V.") conservando el nombre completo. */
function cleanName(raw: string): string {
  return trimToSentence(collapse(raw)).replace(/[,\s]+$/, '');
}

/**
 * En una contestación quien comparece NO es la actora. Si el proemio declara
 * expresamente "apoderado de X, parte demandada" y "demanda promovida por Y",
 * ambas partes tienen respaldo literal; si falta una señal, queda pendiente.
 */
export function extractContestacionParties(corpus: string): { actor?: string; demandado?: string } {
  if (!CONTESTA_RE.test(corpus || '')) return {};
  const result: { actor?: string; demandado?: string } = {};
  const demandado = corpus.match(REPRESENTED_RE)?.[1];
  if (demandado) {
    const candidate = cleanName(demandado);
    if (isValidProceduralPartyName(candidate)) result.demandado = candidate;
  }
  const actor = corpus.match(PROMOVIDO_POR_RE)?.[1];
  if (actor) {
    const candidate = cleanName(actor);
    if (isValidProceduralPartyName(candidate)) result.actor = candidate;
  }
  return result;
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

function locate(name: string, sources: UploadedSourceDocument[]): { page?: number; excerpt?: string; sourceId?: string } {
  const needle = fold(name).slice(0, 40);
  if (!needle) return {};
  for (const source of sources) {
    const pages = source.pages?.length ? source.pages : [{ page: 1, text: source.extractedText || source.content || '' }];
    for (const page of pages) {
      const lines = String(page.text || '').split(/\r?\n/);
      for (let index = 0; index < lines.length; index++) {
        if (!lines[index].trim()) continue;
        const joined = fold(`${lines[index]} ${lines[index + 1] || ''}`);
        if (joined.includes(needle)) {
          return { page: page.page, excerpt: collapse(lines[index]).slice(0, 180), sourceId: source.id };
        }
      }
    }
  }
  return {};
}

const LABEL_PATTERNS: Record<'actor' | 'demandado', RegExp> = {
  actor: /(?:actor|actora|parte\s+actora|demandante|promovente|accionante|trabajador(?:a)?)\s*[:\-]\s*/i,
  demandado: /(?:demandado|demandada|parte\s+demandada|fuente\s+de\s+trabajo\s+demandada|patr[oó]n\s+demandado)\s*[:\-]\s*/i,
};

export function buildPartyEvidence(
  role: 'actor' | 'demandado',
  value: string | undefined,
  corpus: string,
  sources: UploadedSourceDocument[],
  fromInstruction = false,
): PartyEvidence | undefined {
  if (!value) return undefined;
  const signals: PartySignal[] = [];
  const foldedValue = fold(value);
  const labeled = new RegExp(LABEL_PATTERNS[role].source + '([^;\\n]{2,120})', 'gi');
  for (const match of corpus.matchAll(labeled)) {
    if (fold(match[1]).startsWith(foldedValue.slice(0, 20))) { signals.push('label'); break; }
  }
  if (role === 'actor' && extractProemioCompareciente(corpus) && fold(extractProemioCompareciente(corpus)!).startsWith(foldedValue.slice(0, 20))) signals.push('proemio');
  if (role === 'demandado') {
    const target = extractActionTarget(corpus);
    if (target && fold(target).startsWith(foldedValue.slice(0, 20))) signals.push('action_target');
  }
  const contestacion = extractContestacionParties(corpus)[role];
  if (contestacion && fold(contestacion).startsWith(foldedValue.slice(0, 20))) {
    signals.push(role === 'demandado' ? 'contestacion_proemio' : 'contestacion_promovido_por');
  }
  if (fromInstruction) signals.push('instruction');
  const confidence = signals.includes('label') ? (signals.length > 1 ? 0.97 : 0.9)
    : signals.length >= 2 ? 0.85
      : signals.length === 1 ? (signals[0] === 'instruction' ? 0.6 : 0.75)
        : 0.5;
  return {
    role, value, signals, confidence,
    needsConfirmation: confidence < 0.7,
    ...locate(value, sources),
  };
}
