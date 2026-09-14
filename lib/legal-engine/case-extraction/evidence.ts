import type {
  DocumentItem,
  EvidenceExtractionContext,
  EvidenceMention,
  EvidenceOffer,
  ExtractionCandidate,
  SourceProvenance,
} from './types';
import { createSourceProvenance, hashExcerpt } from './provenance';

export interface DocumentsAndEvidenceResult {
  documents: DocumentItem[];
  evidenceMentions: EvidenceMention[];
  evidenceOffers: EvidenceOffer[];
  reviewReasons: string[];
}

const EVIDENCE_SECTION_RE = /^(?:PRUEBAS?|MEDIOS?\s+DE\s+PRUEBA|DOCUMENTALES?|ANEXOS?|EVIDENCIA)\s*:/i;
const CONCRETE_EVIDENCE_RE = /\b(?:pruebas?\s+(?:documental(?:es)?|confesional(?:es)?|testimonial(?:es)?|pericial(?:es)?|presuncional(?:es)?|instrumental(?:es)?)|documental(?:es)?\s+de\s+informes|documental(?:es)?|confesional(?:es)?|testimonial(?:es)?|pericial(?:es)?|presuncional(?:es)?|instrumental(?:es)?\s+de\s+actuaciones|contratos?|pagar[eé]s?|recibos?|comprobantes?|requerimientos?|constancia(?:s)?\s+(?:de\s+[^,.;\n]+|laboral(?:es)?|de\s+notificaci[oó]n)|nombramientos?|actas?\s+de\s+[^,.;\n]+|expediente\s+(?:natural|laboral|de\s+origen))(?=\s|$|[.,;:!?])/gi;
const CONCRETE_EVIDENCE_TEST_RE = new RegExp(CONCRETE_EVIDENCE_RE.source, 'i');
const EVIDENCE_CONTEXT_RE = /\b(?:en\s+autos|autos\s+del\s+(?:presente\s+)?juicio|actuaciones\s+que\s+integran|del\s+laudo|juicio\s+(?:laboral|de\s+origen)|parte\s+(?:actora|demandada)\s+(?:ofreci[oó]|aport[oó]|exhibi[oó])|ofrecid[oa]s?|aportad[oa]s?|exhibid[oa]s?|admitid[oa]s?|desahogad[oa]s?|a\s+cargo\s+de|a\s+foja\s+\d+|ofrezco)\b/i;
const JURISPRUDENCE_RE = /\b(?:jurisprudencia|tesis|precedente|m[aá]ximo\s+tribunal)\b/i;

interface EvidenceSegment {
  description: string;
  type?: string;
  explicitOffer?: boolean;
}

function stripEvidenceLabel(text: string): { body: string; type?: string } {
  const withoutNumber = text.replace(/^\s*(?:\d+|[A-Z]|[IVXLCDM]+)[.)-]\s*/i, '');
  const label = withoutNumber.match(/^\s*(PRUEBAS?|MEDIOS?\s+DE\s+PRUEBA|DOCUMENTAL(?:\s+(?:P[ÚU]BLICA|PRIVADA))?|ANEXOS?|EVIDENCIA)\s*[:.]\s*(.*)$/i);
  if (!label) return { body: withoutNumber.trim() };
  return { body: label[2].trim(), type: label[1].trim().toUpperCase() };
}

function segmentsForEvidence(body: string): string[] {
  // Narrative evidence descriptions often contain commas for names,
  // qualifiers and relations. Keep those as one mention; split commas only
  // for compact list prose with no narrative cue.
  if (/\b(?:consistente|a\s+cargo|para\s+acreditar|relacionad[oa]|vinculad[oa])\b/i.test(body)) return [body.trim()];
  const commaSegments = body.split(/[,;]+/).map((part) => part.trim()).filter(Boolean);
  if (commaSegments.length > 1) {
    return commaSegments.flatMap((part) => part.split(/\s+y\s+/i).map((item) => item.trim()).filter(Boolean));
  }
  return commaSegments;
}

function relationIds(text: string, context: EvidenceExtractionContext): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(/\bhecho\s+(\d+)\b/gi)) {
    const id = context.factIdsByNumber[match[1]];
    if (id) ids.push(id);
  }
  return Array.from(new Set(ids));
}

function statedPurpose(text: string): string | undefined {
  const match = text.match(/\bpara\s+(.+?)(?=\s+relacionad[oa]\b|[.;]|$)/i);
  return match?.[1]?.trim() || undefined;
}

function evidenceTypeFor(description: string): string | undefined {
  if (/documental/i.test(description)) return 'DOCUMENTAL';
  if (/confesional/i.test(description)) return 'CONFESIONAL';
  if (/testimonial/i.test(description)) return 'TESTIMONIAL';
  if (/pericial/i.test(description)) return 'PERICIAL';
  if (/presuncional/i.test(description)) return 'PRESUNCIONAL';
  if (/instrumental/i.test(description)) return 'INSTRUMENTAL';
  if (/contrato/i.test(description)) return 'CONTRATO';
  if (/pagar[eé]/i.test(description)) return 'PAGARÉ';
  if (/recibo/i.test(description)) return 'RECIBO';
  if (/comprobante/i.test(description)) return 'COMPROBANTE';
  if (/constancia/i.test(description)) return 'CONSTANCIA';
  if (/nombramiento/i.test(description)) return 'NOMBRAMIENTO';
  if (/acta/i.test(description)) return 'ACTA';
  if (/expediente/i.test(description)) return 'EXPEDIENTE';
  return undefined;
}

function identityValue(value: string): string {
  return value
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableEntityId(prefix: string, values: string[]): string {
  return `${prefix}-${hashExcerpt(values.map(identityValue).join('|')).slice(0, 24)}`;
}

function extendEvidenceSegment(text: string, end: number): number {
  const qualifiers = [
    /^\s+a\s+cargo\s+(?:de|del)\s+[^,.;\n]+/i,
    /^\s+en\s+su\s+doble\s+aspecto/i,
    /^\s*,?\s*(?:exhibid[oa]s?|aportad[oa]s?)(?:\s+(?:con|en)\s+[^,.;\n]+)?/i,
    /^\s+ofrecid[oa]s?\s+por\s+(?:la|el)\s+(?:parte\s+)?(?:actora|demandada|quejosa|promovente)/i,
    /^\s+de\s+(?:la|el)\s+(?:demandada|demandante|actor|hoy\s+actor)/i,
    /^\s+a\s+foja\s+\d+/i,
    /^\s+para\s+[^,.;\n]+/i,
  ];
  let currentEnd = end;
  for (let pass = 0; pass < qualifiers.length; pass += 1) {
    const tail = text.slice(currentEnd);
    const qualifier = qualifiers.find((item) => item.test(tail));
    if (!qualifier) break;
    const match = tail.match(qualifier);
    if (!match) break;
    currentEnd += match[0].length;
  }
  return currentEnd;
}

function embeddedEvidenceSegments(text: string): EvidenceSegment[] {
  const segments: EvidenceSegment[] = [];
  const seen = new Set<string>();
  const listOffer = /\bparte\s+(?:actora|demandada|quejosa|promovente)\s+ofreci[oó]\s+(?:los\s+)?siguientes\s+medios?\s+de\s+convicci[oó]n\s*:/i.exec(text);
  const listStart = listOffer ? listOffer.index + listOffer[0].length : -1;
  const listEnd = listStart >= 0 ? text.indexOf('.', listStart) : -1;
  for (const match of text.matchAll(CONCRETE_EVIDENCE_RE)) {
    const start = match.index ?? 0;
    const before = text.slice(Math.max(0, start - 24), start);
    if (/\b(?:dicha|referida|indicada|mencionada|anterior|incluida\s+la)\s*$/i.test(before)) continue;
    const end = extendEvidenceSegment(text, start + match[0].length);
    const description = text.slice(start, end).replace(/\s+/g, ' ').trim();
    const key = identityValue(description);
    if (!description || seen.has(key)) continue;
    seen.add(key);
    segments.push({
      description,
      type: evidenceTypeFor(description),
      explicitOffer: listStart >= 0 && start >= listStart && (listEnd < 0 || start < listEnd),
    });
  }
  return segments;
}

function isJurisprudenceOnly(candidate: ExtractionCandidate, section?: string): boolean {
  const jurisprudenceIndex = candidate.rawText.search(JURISPRUDENCE_RE);
  if (jurisprudenceIndex < 0 && section !== 'DERECHO') return false;
  if (section === 'DERECHO') return true;
  if (!EVIDENCE_CONTEXT_RE.test(candidate.rawText)) return true;
  const concreteIndexes = Array.from(candidate.rawText.matchAll(CONCRETE_EVIDENCE_RE))
    .map((match) => match.index ?? -1)
    .filter((index) => index >= 0);
  return concreteIndexes.length === 0 || concreteIndexes.every((index) => index > jurisprudenceIndex);
}

function hasExplicitEvidenceLabel(candidate: ExtractionCandidate, section?: string): boolean {
  return candidate.kind === 'EVIDENCE'
    || section === 'PRUEBAS'
    || EVIDENCE_SECTION_RE.test(candidate.rawText);
}

function isEvidenceCandidate(candidate: ExtractionCandidate): boolean {
  const section = candidate.provenance.find((item) => item.section)?.section;
  if (isJurisprudenceOnly(candidate, section)) return false;
  if (hasExplicitEvidenceLabel(candidate, section) || candidate.kind === 'DOCUMENT') return true;
  return embeddedEvidenceSegments(candidate.rawText).length > 0 && EVIDENCE_CONTEXT_RE.test(candidate.rawText);
}

function explicitOfferStatus(text: string, segment: string, segmentIsExplicitListOffer = false): EvidenceOffer['status'] | undefined {
  if (/\bcliente\s+confirma\b/i.test(segment)) return 'CLIENT_CONFIRMED';
  if (/(?:abogado\s+confirma|se\s+ofrece|ofrece|ofrecemos|ofreci[oó]|ofrecieron|ofrecid[oa]s?|ofrezco)(?=\s|$|[,:;.])/i.test(segment)) return 'PARTY_OFFERED';

  // A list introduced by "la parte ... ofreció los siguientes medios" gives
  // each concrete list item the same historical PARTY_OFFERED relation.  It
  // does not turn a generic mention or a later admission/rejection into an
  // offer.
  if (segmentIsExplicitListOffer) {
    return 'PARTY_OFFERED';
  }

  // Preserve an explicit first-person offer tied to this extracted segment,
  // such as "ofrezco ... el expediente natural".
  const haystack = text.toLocaleLowerCase('es-MX');
  const needle = segment.toLocaleLowerCase('es-MX');
  let searchFrom = 0;
  let segmentIndex = -1;
  while (searchFrom < haystack.length) {
    segmentIndex = haystack.indexOf(needle, searchFrom);
    if (segmentIndex < 0) break;
    const preceding = text.slice(Math.max(0, segmentIndex - 120), segmentIndex);
    if (/(?:ofrezco|ofrece|ofreci[oó]|ofrecieron)[^.;:]{0,100}$/i.test(preceding)) return 'PARTY_OFFERED';
    searchFrom = segmentIndex + Math.max(needle.length, 1);
  }
  return undefined;
}

function provenanceForSegment(candidate: ExtractionCandidate, segment: string): SourceProvenance[] {
  return candidate.provenance.map((item) => createSourceProvenance({
    sourceId: item.sourceId,
    sourceType: item.sourceType,
    sourceName: item.sourceName,
    page: item.page,
    section: item.section,
    paragraphIndex: item.paragraphIndex,
    elementIndex: item.elementIndex,
    excerpt: segment,
    speakerRole: item.speakerRole,
    extractionMethod: item.extractionMethod,
    confidence: item.confidence,
    inferenceLevel: item.inferenceLevel,
  }));
}

function segmentsForCandidate(candidate: ExtractionCandidate, section?: string): EvidenceSegment[] {
  if (hasExplicitEvidenceLabel(candidate, section)) {
    const { body, type } = stripEvidenceLabel(candidate.rawText);
    return segmentsForEvidence(body)
      .filter((description) => CONCRETE_EVIDENCE_TEST_RE.test(description))
      .map((description) => ({ description, type }));
  }
  return embeddedEvidenceSegments(candidate.rawText);
}

export function extractDocumentsAndEvidence(
  candidates: ExtractionCandidate[],
  context: EvidenceExtractionContext,
): DocumentsAndEvidenceResult {
  const documents: DocumentItem[] = [];
  const evidenceMentions: EvidenceMention[] = [];
  const evidenceOffers: EvidenceOffer[] = [];
  const reviewReasons: string[] = [];

  for (const candidate of candidates) {
    if (!isEvidenceCandidate(candidate)) continue;
    const section = candidate.provenance.find((item) => item.section)?.section;
    const segments = segmentsForCandidate(candidate, section);
    for (const evidenceSegment of segments) {
      const segment = evidenceSegment.description;
      const type = evidenceSegment.type;
      const documentId = stableEntityId('document', [type || '', segment]);
      const evidenceId = stableEntityId('evidence-mention', [type || '', segment, 'SOURCE_MENTIONED']);
      const provenance = provenanceForSegment(candidate, segment);
      documents.push({
        id: documentId,
        title: segment,
        documentType: type,
        status: 'SOURCE_MENTIONED',
        provenance,
      });
      const mention: EvidenceMention = {
        id: evidenceId,
        documentItemId: documentId,
        type,
        description: segment,
        relatedFactIds: relationIds(segment, context),
        relatedClaimIds: [],
        statedPurpose: statedPurpose(segment),
        status: 'SOURCE_MENTIONED',
        provenance,
      };
      evidenceMentions.push(mention);
      const offerStatus = explicitOfferStatus(candidate.rawText, segment, evidenceSegment.explicitOffer);
      if (offerStatus) {
        evidenceOffers.push({
          id: stableEntityId('evidence-offer', [evidenceId, offerStatus]),
          evidenceMentionId: evidenceId,
          status: offerStatus,
          provenance,
        });
      }
    }
    if (segments.length === 1 && /\s+y\s+/i.test(segments[0].description) && !/\b(?:y\s+sus|y\s+su)\b/i.test(segments[0].description)) {
      reviewReasons.push('EVIDENCE_CONJUNCTION_REQUIRES_REVIEW');
    }
  }

  return { documents, evidenceMentions, evidenceOffers, reviewReasons };
}
