import type { ExtractionCandidate, NormalizedAmount, NormalizedDate, SourceProvenance } from './types';

const MONTHS: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  setiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
};

function provenanceOf(candidate: ExtractionCandidate): SourceProvenance[] {
  return candidate.provenance.map((item) => ({ ...item, extractionMethod: 'NORMALIZATION', inferenceLevel: 'NORMALIZED' }));
}

function monthNumber(value: string): string | undefined {
  return MONTHS[value.toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
}

function normalizeDateText(raw: string): Pick<NormalizedDate, 'normalizedValue' | 'precision'> {
  const complete = raw.match(/\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})\b/i);
  if (complete) {
    const month = monthNumber(complete[2]);
    const day = Number(complete[1]);
    if (month && day >= 1 && day <= 31) {
      return { normalizedValue: `${complete[3]}-${month}-${String(day).padStart(2, '0')}`, precision: 'DAY' };
    }
  }

  const numeric = raw.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { normalizedValue: `${numeric[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, precision: 'DAY' };
    }
  }

  const monthYear = raw.match(/\b([a-záéíóúñ]+)\s+de\s+(\d{4})\b/i) ?? raw.match(/\b([a-záéíóúñ]+)\s+(\d{4})\b/i);
  if (monthYear) {
    const month = monthNumber(monthYear[1]);
    if (month) return { normalizedValue: `${monthYear[2]}-${month}`, precision: 'MONTH' };
  }

  const year = raw.match(/\b(\d{4})\b/);
  if (year) return { normalizedValue: year[1], precision: 'YEAR' };
  return { normalizedValue: undefined, precision: 'UNKNOWN' };
}

export function normalizeDateCandidate(candidate: ExtractionCandidate): NormalizedDate {
  const rawValue = candidate.rawText.trim();
  return {
    rawValue,
    ...normalizeDateText(rawValue),
    provenance: provenanceOf(candidate),
  };
}

function parseNumeric(value: string): number | undefined {
  const cleaned = value.replace(/[^\d,.-]/g, '');
  if (!cleaned) return undefined;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const decimals = cleaned.length - lastComma - 1;
    normalized = decimals === 3 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function amountDetails(raw: string): { numeric?: number; currency?: string; unit?: string; hasMarker: boolean } {
  const numeric = raw.match(/[-+]?\d[\d.,]*/)?.[0];
  const currency = /(?:\bMXN\b|\bM\.?N\.?\b|pesos?\b|\$)/i.test(raw)
    ? 'MXN'
    : /(?:\bUSD\b|d[oó]lares?|US\$)/i.test(raw)
      ? 'USD'
      : /(?:\bEUR\b|euros?|€)/i.test(raw)
        ? 'EUR'
        : undefined;
  const unit = raw.match(/%/) ? '%' : raw.match(/\b(?:d[ií]as?|mes(?:es)?|a[nñ]os?|unidades?|piezas?)\b/i)?.[0];
  const hasMarker = Boolean(currency || unit);
  return { numeric: numeric ? parseNumeric(numeric) : undefined, currency, unit, hasMarker };
}

export function normalizeAmountCandidate(candidate: ExtractionCandidate): NormalizedAmount {
  const rawValue = candidate.rawText.trim();
  const details = amountDetails(rawValue);
  return {
    rawValue,
    ...(details.hasMarker && details.numeric !== undefined ? { normalizedValue: details.numeric } : {}),
    ...(details.currency ? { currency: details.currency } : {}),
    ...(details.unit ? { unit: details.unit } : {}),
    provenance: provenanceOf(candidate),
  };
}
