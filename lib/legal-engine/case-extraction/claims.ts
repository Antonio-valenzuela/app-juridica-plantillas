import { normalizeAmountCandidate } from './normalization';
import type {
  ClaimExtractionContext,
  ClaimItem,
  ExtractionCandidate,
  PartyRole,
} from './types';

const CLAIM_SECTION_RE = /^(?:PRESTACION(?:ES)?|PRETENSION(?:ES)?|PETICION(?:ES)?|PETITORIO(?:S)?)\s*:/i;
const RELIEF_START_RE = /^(?:cumplimiento|pago|restituci[oó]n|entrega|condena|declaraci[oó]n|reconocimiento|nulidad|resarcimiento|indemnizaci[oó]n|suspensi[oó]n|cancelaci[oó]n|inscripci[oó]n)\b/i;

function claimBody(text: string): string {
  return text.replace(CLAIM_SECTION_RE, '').trim();
}

function independentReliefs(body: string): string[] {
  // Preserve a single prose sentence that begins with a generic article;
  // explicit list items remain the mechanism for independently declared reliefs.
  if (/^el\s+/i.test(body)) return [body];
  if (/\by\s+(?:sus|los|las)\s+(?:efectos?|consecuencias?|accesorios?)\b/i.test(body)) return [body];
  const parts = body
    .split(/\s+y\s+(?=(?:cumplimiento|pago|restituci[oó]n|entrega|condena|declaraci[oó]n|reconocimiento|nulidad|resarcimiento|indemnizaci[oó]n|suspensi[oó]n|cancelaci[oó]n|inscripci[oó]n)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length !== 2) return [body];
  const [left, right] = parts;
  return RELIEF_START_RE.test(left) && RELIEF_START_RE.test(right) ? parts : [body];
}

function claimantId(text: string, context: ClaimExtractionContext): string | undefined {
  const role: PartyRole | undefined = /\b(?:actor|actora|parte\s+actora)\b/i.test(text)
    ? 'ACTOR'
    : /\b(?:demandado|demandada|parte\s+demandada)\b/i.test(text)
      ? 'DEMANDADO'
      : /\bpromovente\b/i.test(text)
        ? 'PROMOVENTE'
        : undefined;
  return role ? context.partyIdsByRole[role]?.[0] : undefined;
}

function amountFor(text: string, candidate: ExtractionCandidate) {
  if (!/(?:\$|\b(?:MXN|USD|pesos?|d[oó]lares?)\b|%)/i.test(text)) return undefined;
  const amount = normalizeAmountCandidate({ ...candidate, rawText: text, kind: 'AMOUNT' });
  return amount.normalizedValue !== undefined ? amount : undefined;
}

/** Fórmulas de transición o introducción («en consecuencia, se solicita lo siguiente»): no son pretensiones. */
const TRANSITION_FORMULA_RE = /^(?:en\s+(?:consecuencia|virtud|m[ée]rito)|por\s+lo\s+(?:anterior|expuesto|tanto|cual)|de\s+lo\s+anterior|con\s+base\s+en\s+lo\s+anterior|lo\s+anterior|se\s+solicita\s+lo\s+siguiente|en\s+ese\s+sentido)(?!\p{L})/iu;
/** Verbo o sustantivo de pretensión (condena, declaración, pago, nulidad…). */
const RELIEF_TERM_RE = /(?<!\p{L})(?:conden\p{L}*|pag\p{L}*|declar\p{L}*|reclam\p{L}*|orden\p{L}*|absolv\p{L}*|reconoc\p{L}*|nulidad|rescisi\p{L}*|cumplimiento|indemnizaci\p{L}*|prestaci\p{L}*|pago|devoluci\p{L}*|entrega)(?!\p{L})/iu;
/** Un texto que no es pretensión: termina en «:», es una fórmula de transición, o carece de inciso y de término de pretensión. */
function isNonClaimFormula(body: string): boolean {
  const text = body.trim();
  if (/:\s*$/.test(text)) return true;
  if (TRANSITION_FORMULA_RE.test(text)) return true;
  const hasIncise = /(?:^|\s)[a-z]\)\s|(?:^|\s)[ivxlc]+\.\s/i.test(text);
  return !hasIncise && !RELIEF_TERM_RE.test(text);
}

export function extractClaims(
  candidates: ExtractionCandidate[],
  context: ClaimExtractionContext,
): { claims: ClaimItem[]; reviewReasons: string[] } {
  const claims: ClaimItem[] = [];
  const reviewReasons: string[] = [];

  for (const candidate of candidates) {
    const section = candidate.provenance.find((item) => item.section)?.section;
    if (candidate.kind !== 'CLAIM' && !CLAIM_SECTION_RE.test(candidate.rawText) && section !== 'PRESTACIONES') continue;
    const body = claimBody(candidate.rawText);
    if (!body) continue;
    if (isNonClaimFormula(body)) continue;
    if (/^(?:CONTESTACI[OÓ]N\s+(?:DE\s+|A\s+LAS\s+)?PRESTACIONES|PRESTACIONES|PRETENSIONES|PETICIONES)$/i.test(body.replace(/[:.\-]+$/, '').trim())) {
      continue;
    }
    const reliefs = independentReliefs(body);
    if (reliefs.length === 1 && /\s+y\s+/i.test(body) && !reviewReasons.includes('AMBIGUOUS_RELIEF_CONJUNCTION_REQUIRES_REVIEW')) {
      reviewReasons.push('AMBIGUOUS_RELIEF_CONJUNCTION_REQUIRES_REVIEW');
    }

    reliefs.forEach((requestedRelief, index) => {
      claims.push({
        id: `claim-${claims.length + 1}`,
        claimantPartyId: claimantId(candidate.rawText, context),
        requestedRelief,
        factualBasisIds: [],
        evidenceMentionIds: [],
        amount: amountFor(requestedRelief, candidate),
        provenance: [...candidate.provenance],
        status: 'SOURCE_MENTIONED',
      });
      void index;
    });
  }

  return { claims, reviewReasons };
}
