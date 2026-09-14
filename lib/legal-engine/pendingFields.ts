/**
 * Marcadores de datos no resolubles.
 *
 * El contenido puede llegar desde una plantilla persistida, una edición manual
 * o un proveedor externo. Por eso el consumidor debe reconocer tanto la forma
 * canónica como las variantes compactas que ya circulan en documentos antiguos.
 */

export type UnresolvedFieldMarkerKind = 'PENDING' | 'ANONYMIZED';

export interface UnresolvedFieldMarker {
  marker: string;
  kind: UnresolvedFieldMarkerKind;
  label: string;
}

const FIELD_MARKER_RE = /\[((?:DATO\s*PENDIENTE(?:\s+DE\s+EXPEDIENTE)?|DATOPENDIENTE(?:DEEXPEDIENTE)?|DATO\s+ANONIMIZADO(?:\s+DE\s+EXPEDIENTE)?|DATOANONIMIZADO(?:DEEXPEDIENTE)?))\s*:\s*([^\]]{1,160})\]/giu;

const LABEL_ALIASES: Record<string, string> = {
  nombredelpromovente: 'Nombre del promovente',
  nombredelquejoso: 'Nombre del quejoso',
  nombredelactor: 'Nombre del actor',
  nombredeldemandado: 'Nombre del demandado',
  autoridadresponsable: 'Autoridad responsable',
  numerodeexpediente: 'Número de expediente',
  lugaryfechadepresentacion: 'Lugar y fecha de presentación',
};

function compactLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_\-]+/g, '')
    .toLowerCase();
}

export function normalizePendingFieldLabel(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return 'Campo pendiente';
  const alias = LABEL_ALIASES[compactLabel(raw)];
  if (alias) return alias;

  const spaced = raw
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : 'Campo pendiente';
}

function canonicalKind(raw: string): UnresolvedFieldMarkerKind {
  return raw.replace(/\s+/g, '').toLowerCase().startsWith('datoanonimizado')
    ? 'ANONYMIZED'
    : 'PENDING';
}

function canonicalPrefix(kind: UnresolvedFieldMarkerKind, raw: string): string {
  const compact = raw.replace(/\s+/g, '').toLowerCase();
  const fromExpediente = compact.includes('deexpediente');
  if (kind === 'ANONYMIZED') return fromExpediente ? 'DATO ANONIMIZADO DE EXPEDIENTE' : 'DATO ANONIMIZADO';
  return fromExpediente ? 'DATO PENDIENTE DE EXPEDIENTE' : 'DATO PENDIENTE';
}

export function normalizeUnresolvedFieldMarkers(text: string): string {
  if (!text) return text;
  return text.replace(FIELD_MARKER_RE, (_match, rawPrefix: string, rawLabel: string) => {
    const kind = canonicalKind(rawPrefix);
    return `[${canonicalPrefix(kind, rawPrefix)}: ${normalizePendingFieldLabel(rawLabel)}]`;
  });
}

export function extractUnresolvedFieldMarkers(text: string): UnresolvedFieldMarker[] {
  const normalized = normalizeUnresolvedFieldMarkers(text || '');
  const found: UnresolvedFieldMarker[] = [];
  const seen = new Set<string>();
  const re = new RegExp(FIELD_MARKER_RE.source, FIELD_MARKER_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    const kind = canonicalKind(match[1]);
    const marker = `[${canonicalPrefix(kind, match[1])}: ${normalizePendingFieldLabel(match[2])}]`;
    if (!seen.has(marker)) {
      seen.add(marker);
      found.push({ marker, kind, label: normalizePendingFieldLabel(match[2]) });
    }
  }
  return found;
}

export function extractPendingFieldMarkers(text: string): string[] {
  return extractUnresolvedFieldMarkers(text)
    .filter((item) => item.kind === 'PENDING')
    .map((item) => item.marker);
}

export function hasUnresolvedFieldMarkers(text: string): boolean {
  return extractUnresolvedFieldMarkers(text).length > 0;
}
