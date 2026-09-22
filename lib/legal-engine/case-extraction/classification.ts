import type {
  CandidateClassification,
  CandidateDecision,
  CandidateKind,
  ExtractionCandidate,
  SpeakerRole,
} from './types';

const SECTION_LABELS: Record<string, CandidateKind> = {
  HECHOS: 'FACT',
  HECHO: 'FACT',
  ANTECEDENTES: 'FACT',
  PRESTACIONES: 'CLAIM',
  PRETENSIONES: 'CLAIM',
  PETICIONES: 'CLAIM',
  PETITORIOS: 'CLAIM',
  PRUEBAS: 'EVIDENCE',
  DOCUMENTALES: 'DOCUMENT',
  ANEXOS: 'DOCUMENT',
  ARGUMENTOS: 'ARGUMENT',
  AGRAVIOS: 'ARGUMENT',
  DERECHO: 'ARGUMENT',
  FUNDAMENTOS: 'ARGUMENT',
  AUTORIDADES: 'PARTY',
};

function sectionFromCandidate(candidate: ExtractionCandidate): string | undefined {
  const provenanceSection = candidate.provenance.find((item) => item.section)?.section;
  if (provenanceSection) {
    const raw = provenanceSection.replace(/[\s:;,.\-]+$/, '').trim().toUpperCase();
    const unspaced = raw.replace(/\s+/g, '');
    if (/HECHO/i.test(raw) || /HECHO/i.test(unspaced)) return 'HECHOS';
    if (/PRESTACI|PRETENS|PETICI/i.test(raw) || /PRESTACI|PRETENS|PETICI/i.test(unspaced)) return 'PRESTACIONES';
    if (/PRUEBA|EVIDENC/i.test(raw) || /PRUEBA|EVIDENC/i.test(unspaced)) return 'PRUEBAS';
    if (/DERECHO|FUNDAMENTO|AGRAVIO|ARGUMENTO/i.test(raw) || /DERECHO|FUNDAMENTO|AGRAVIO|ARGUMENTO/i.test(unspaced)) return 'ARGUMENTOS';
    return unspaced || raw;
  }
  const prefix = candidate.rawText.match(/^\s*([^:.-]{3,80})\s*:/)?.[1];
  if (prefix) {
    const raw = prefix.trim().toUpperCase();
    if (/HECHO/i.test(raw)) return 'HECHOS';
    if (/PRESTACI|PRETENS|PETICI/i.test(raw)) return 'PRESTACIONES';
    return raw;
  }
  return undefined;
}

export function inferSpeakerRole(text: string): SpeakerRole | undefined {
  if (/\b(?:la\s+)?(?:parte\s+)?actora\b|\bactor(?:a)?\b/i.test(text)) return 'PARTE_ACTORA';
  if (/\b(?:la\s+)?(?:parte\s+)?demandad[oa]\b/i.test(text)) return 'PARTE_DEMANDADA';
  if (/\bpromovente\b/i.test(text)) return 'PROMOVENTE';
  if (/\bautoridad(?:es)?\b/i.test(text)) return 'AUTORIDAD';
  if (/\btercero\s+interesado\b|\btercera\s+interesada\b/i.test(text)) return 'TERCERO';
  if (/\b(?:representante|apoderad[oa]|autorizad[oa])\b/i.test(text)) return 'REPRESENTANTE';
  if (/\b(?:juzgado|tribunal|sala|resolutor)\b/i.test(text)) return 'RESOLUTOR';
  return undefined;
}

function explicitParty(text: string): boolean {
  return /^(?:actor(?:a)?|demandad[oa]|quejos[oa]|promovente|autoridad(?:\s+responsable)?|tercero(?:\s+interesad[oa])?|representante|apoderad[oa]|autorizad[oa])\s*:/i.test(text.trim());
}

function isSourceAssertion(text: string): boolean {
  return /\b(?:afirma|manifiesta|sostiene|señala|refiere|aduce|niega|alega|expone)\b/i.test(text)
    && Boolean(inferSpeakerRole(text));
}

const COURT_REASONING_RE = /\b(?:este\s+(?:órgano\s+colegiado|tribunal|juzgado|tribunal\s+colegiado)\s+(?:advierte|considera|estima|concluye)|tal\s+sustento\s+es\s+(?:in)?fundado|resulta\s+(?:in)?fundad[ao]|son\s+inoperantes|de\s+los\s+antecedentes\s+expuestos\s+se\s+obtiene|de\s+lo\s+antes\s+citado\s+se\s+concluye|luego,?\s+de\s+las\s+actuaciones|tales\s+probanzas|finalmente,?\s+resulta\s+innecesario)\b/i;
const HOLDING_RE = /\b(?:se\s+impone\s+(?:negar|conceder)\s+el\s+amparo|no\s+ampara\s+ni\s+protege|r\s*e\s*s\s*u\s*e\s*l\s*v\s*e(?=\s*:\s*\S))\b/i;
const PARTY_REPORT_RE = /\b(?:el\s+quejos[oa]\s+(?:refiere|sostiene|aduce|señala|argumenta)|la\s+parte\s+(?:actora|demandada)\s+(?:refiere|sostiene|aduce|señala|argumenta)|por\s+otra\s+parte,?\s+en\s+el\s+[^.]{0,80}\s+concepto)\b/i;

function outsideQuotedOrReportedText(text: string): boolean {
  // A candidate containing a quote or a reported party allegation is mixed at
  // this layer.  Keep it as its existing source classification and let the
  // bounded rich extractor decide only on an explicit judicial span.
  return !/[“”«»"]/u.test(text) && !PARTY_REPORT_RE.test(text);
}

function courtReasoningKind(text: string): CandidateKind | undefined {
  if (!outsideQuotedOrReportedText(text)) return undefined;
  if (HOLDING_RE.test(text)) return 'HOLDING';
  if (COURT_REASONING_RE.test(text)) return 'DECISION_REASONING';
  return undefined;
}

function classificationFor(kind: string, confidence: number, reason: string): CandidateClassification {
  return { label: kind, confidence, reason };
}

function classifyOne(candidate: ExtractionCandidate): ExtractionCandidate {
  const text = candidate.rawText.trim();
  const section = sectionFromCandidate(candidate);
  let kind: CandidateKind = 'ASSERTION';
  let confidence = 0.4;
  let reason = 'No deterministically specific category was found; review is required.';
  const courtKind = courtReasoningKind(text);
  const speakerRole = courtKind ? 'RESOLUTOR' : inferSpeakerRole(text);
  const isScjnMetadata = /^(?:Registro\s+digital|Instancia|Tesis|Fuente:\s*Semanario|Suprema\s+Corte\s+de\s+Justicia|Tipo:\s*Jurisprudencia|Contradicci[óo]n\s+de\s+tesis)\b/i.test(text);

  if (courtKind) {
    kind = courtKind;
    confidence = 0.96;
    reason = courtKind === 'HOLDING'
      ? 'Deterministic judicial holding marker is present outside quoted or reported party text.'
      : 'Deterministic court-reasoning marker is present outside quoted or reported party text.';
  } else if (isScjnMetadata) {
    kind = 'AUTHORITY';
    confidence = 0.98;
    reason = 'SCJN metadata or judicial citation line in source text.';
  } else if (explicitParty(text)) {
    kind = 'PARTY';
    confidence = 0.99;
    reason = 'Explicit party-role label in source text.';
  } else if (section && SECTION_LABELS[section]) {
    kind = SECTION_LABELS[section];
    confidence = 0.92;
    reason = `Candidate is inside the explicit ${section} section.`;
  } else if (isSourceAssertion(text)) {
    kind = 'ASSERTION';
    confidence = 0.98;
    reason = 'Attribution verb and speaking party are explicit; proposition remains a source assertion.';
  } else if (/\b(?:\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[a-záéíóúñ]+\s+de\s+\d{4})\b/i.test(text)) {
    kind = 'DATE';
    confidence = 0.95;
    reason = 'Date-shaped source value.';
  } else if (/(?:\$|\b(?:MXN|USD|pesos?|dólares?)\b|\bimporte\b|\bcantidad\b)/i.test(text)
    && /\d/.test(text)) {
    kind = 'AMOUNT';
    confidence = 0.9;
    reason = 'Amount-shaped source value with an explicit numeric marker.';
  } else if (/\b(?:art(?:ículo)?\.?\s+\d+|jurisprudencia|tesis|ley\s+de|código|precedente)\b/i.test(text)) {
    kind = 'AUTHORITY';
    confidence = 0.88;
    reason = 'Authority citation marker is present; legal verification is not inferred.';
  } else if (/\b(?:contrato|recibo|requerimiento|documento|anexo|acta|comprobante)\b/i.test(text)) {
    kind = 'DOCUMENT';
    confidence = 0.72;
    reason = 'Document noun is present without asserting admissibility or offer.';
  }

  const recognized = kind !== 'ASSERTION' || isSourceAssertion(text);
  const decision: CandidateDecision = recognized ? 'ACCEPTED' : candidate.decision;
  return {
    ...candidate,
    kind,
    speakerRole: candidate.speakerRole ?? speakerRole,
    classification: classificationFor(kind === 'ASSERTION' && isSourceAssertion(text) ? 'SOURCE_ASSERTION' : kind, confidence, reason),
    decision,
    decisionReason: recognized ? reason : candidate.decisionReason,
  };
}

export function classifyCandidates(candidates: ExtractionCandidate[]): ExtractionCandidate[] {
  return candidates.map(classifyOne);
}
