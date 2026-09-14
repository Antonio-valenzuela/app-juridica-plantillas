import { describe, expect, it } from 'vitest';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { createEmptyDocument, type UploadedSourceDocument } from '@/lib/legal-engine/types';
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';
import { deduplicateRichItems } from '@/lib/legal-engine/case-extraction/deduplication';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import { fixtureA_cleanText, fixtureC_commaEvidence, fixtureD_conflictingSources } from '../fixtures/caseAnalysisExtractionFixtures';

function source(text: string, id = 'contract-source'): UploadedSourceDocument {
  return { id, filename: `${id}.txt`, type: 'txt', content: text, extractedText: text, sourceValidated: true };
}

function rich(text: string, id = 'contract-source') {
  return reconstructCaseAnalysis([source(text, id)], 'Analizar', '', { includeReferenceInAnalysis: false }).richCaseAnalysis!;
}

describe('30 extraction contracts', () => {
  it('01 extracts actor and demandado', () => {
    const a = rich('ACTOR: Ana López\nDEMANDADO: Beta Servicios');
    expect(a.parties.map((p) => p.role)).toEqual(expect.arrayContaining(['ACTOR', 'DEMANDADO']));
  });
  it('02 preserves the role of the speaker asserting a fact', () => {
    const a = rich('La actora afirma que el pago quedó pendiente.');
    expect(a.assertions[0]?.actorRole).toBe('PARTE_ACTORA');
  });
  it('03 keeps an allegation as a source assertion', () => {
    const a = rich('La actora afirma que el pago quedó pendiente.');
    expect(a.assertions[0]?.status).toBe('ALLEGED');
    expect(a.facts.some((f) => f.assertionStatus === 'ESTABLISHED_FACT')).toBe(false);
  });
  it('04 extracts two claims from one explicit relief phrase', () => {
    const a = rich('PRESTACIONES: pago de la factura y cumplimiento del contrato');
    expect(a.claims).toHaveLength(2);
  });
  it('05 extracts two atomic events with clear date boundaries', () => {
    const a = rich('La actora afirma que el contrato se firmó el 4 de marzo de 2026 y la factura se entregó el 8 de marzo de 2026.');
    expect(a.facts.length).toBe(2);
    expect(a.facts.map((f) => f.date?.normalizedValue)).toEqual(expect.arrayContaining(['2026-03-04', '2026-03-08']));
  });
  it('06 parses the conventional PRUEBAS enumeration', () => {
    expect(rich('PRUEBAS: contrato, comprobantes y requerimiento').evidenceMentions).toHaveLength(3);
  });
  it('07 preserves comma-separated evidence as three mentions', () => {
    expect(rich('PRUEBAS: contrato, recibos, requerimiento').evidenceMentions).toHaveLength(3);
  });
  it('08 parses numbered evidence', () => {
    const a = rich('PRUEBAS:\n1. contrato\n2. recibos');
    expect(a.evidenceMentions).toHaveLength(2);
  });
  it('09 parses bullet evidence', () => {
    const a = rich('PRUEBAS:\n- contrato\n- recibos');
    expect(a.evidenceMentions).toHaveLength(2);
  });
  it('10 retains table evidence provenance from DocumentIndex', () => {
    const a = rich('PRUEBAS\n| contrato | hecho 1 |');
    expect(a.evidenceMentions.length).toBeGreaterThan(0);
    expect(a.evidenceMentions[0].provenance[0]?.extractionMethod).toBe('TABLE');
  });
  it('11 keeps mentioned evidence out of CLIENT_CONFIRMED', () => {
    const a = rich('PRUEBAS: contrato mencionado');
    expect(a.evidenceMentions[0]?.status).toBe('SOURCE_MENTIONED');
    expect(a.evidenceOffers).toHaveLength(0);
  });
  it('12 does not offer an opposing document automatically', () => {
    const a = rich('DOCUMENTO DE LA CONTRAPARTE: contrato aportado por la actora');
    expect(a.documents[0]?.status).toBe('SOURCE_MENTIONED');
    expect(a.evidenceOffers).toHaveLength(0);
  });
  it('13 normalizes a complete date', () => {
    const date = rich('FECHA: 4 de marzo de 2026').dates[0];
    expect(date).toMatchObject({ normalizedValue: '2026-03-04', precision: 'DAY' });
  });
  it('14 keeps a partial date without inventing a day', () => {
    const date = rich('FECHA: marzo de 2026').dates[0];
    expect(date).toMatchObject({ normalizedValue: '2026-03', precision: 'MONTH' });
  });
  it('15 preserves a normalized amount and its raw value', () => {
    const amount = rich('IMPORTE: $10,000 MXN').amounts[0];
    expect(amount).toMatchObject({ normalizedValue: 10000, currency: 'MXN' });
    expect(amount.rawValue).toContain('$10,000');
  });
  it('16 records contradictory amounts as open conflicts', () => {
    const a = reconstructCaseAnalysis(fixtureD_conflictingSources(), 'Analizar', '', { includeReferenceInAnalysis: false }).richCaseAnalysis!;
    expect(a.amounts.map((item) => item.normalizedValue)).toEqual(expect.arrayContaining([10000, 12000]));
    expect(a.conflicts.some((conflict) => conflict.type === 'AMOUNT' && conflict.requiresReview)).toBe(true);
  });
  it('17 keeps an article citation SOURCE_CITED', () => {
    expect(rich('DERECHO: artículo 14 constitucional').authorities[0]?.verificationStatus).toBe('SOURCE_CITED');
  });
  it('18 keeps thesis and jurisprudence as mentions', () => {
    const a = rich('DERECHO: jurisprudencia sobre tutela judicial y tesis aislada 123/2024');
    expect(a.authorities.every((item) => item.verificationStatus === 'SOURCE_CITED')).toBe(true);
  });
  it('19 keeps an argument distinct from a fact', () => {
    const a = rich('HECHOS:\n1. Se firmó el contrato.\nARGUMENTOS: Es ilegal porque vulnera el hecho 1.');
    expect(a.arguments.length).toBeGreaterThan(0);
    expect(a.arguments[0].supportingFactIds.length).toBeGreaterThan(0);
    expect(a.arguments[0].proposition).not.toBe(a.facts[0]?.proposition);
  });
  it('20 reports missing client position', () => {
    expect(rich('ACTOR: Ana López').missingData.some((item) => item.field === 'clientPosition')).toBe(true);
  });
  it('21 does not invent a procedural posture', () => {
    const a = rich('ACTOR: Ana López');
    expect(a.clientPosition.status).toBe('UNKNOWN');
    expect(a.clientPosition.source).toBe('SOURCE_POSITION');
  });
  it('22 attaches provenance to every material rich item', () => {
    const a = rich('ACTOR: Ana\nPRESTACIONES: pago\nHECHOS: Se firmó el contrato.\nPRUEBAS: contrato\nDERECHO: artículo 14 constitucional');
    const collections = [a.parties, a.assertions, a.claims, a.facts, a.documents, a.evidenceMentions, a.arguments, a.authorities];
    expect(collections.flat().every((item) => item.provenance.length > 0 && item.provenance.every((p) => p.sourceId && p.excerptHash))).toBe(true);
  });
  it('23 preserves both provenance references after duplicate document fusion', () => {
    const a = reconstructCaseAnalysis([source('PRUEBAS: contrato', 'src-a'), source('PRUEBAS: contrato', 'src-b')], 'Analizar', '', { includeReferenceInAnalysis: false }).richCaseAnalysis!;
    expect(a.documents).toHaveLength(1);
    expect(a.documents[0].provenance.map((p) => p.sourceId).sort()).toEqual(['src-a', 'src-b']);
  });
  it('24 keeps similar names separate and exposes identity review', () => {
    const a = rich('ACTOR: Ana López\nACTOR: Ana L. López');
    expect(a.parties).toHaveLength(2);
    expect(a.conflicts.some((conflict) => conflict.type === 'IDENTITY' && conflict.requiresReview)).toBe(true);
  });
  it('25 registers extraction in GenerationTrace', () => {
    const trace = createGenerationTraceContext({ generationId: 'contract-trace', doc: createEmptyDocument(), options: { enabled: true } });
    reconstructCaseAnalysis([source('PRESTACIONES: pago')], 'Analizar', '', { trace });
    expect(trace.close().extraction?.candidateCounts.CLAIM).toBeGreaterThan(0);
  });
  it('26 never writes an API key into the trace', () => {
    const trace = createGenerationTraceContext({ generationId: 'contract-secret', doc: createEmptyDocument(), options: { enabled: true } });
    reconstructCaseAnalysis([source('NVIDIA_API_KEY=nvapi-secret\nHECHOS: Se registró la fuente.')], 'Analizar', '', { trace });
    expect(JSON.stringify(trace.close())).not.toMatch(/nvapi-secret|NVIDIA_API_KEY=/i);
  });
  it('27 extracts a complete synthetic fixture into non-empty CaseAnalysis', () => {
    const a = reconstructCaseAnalysis([fixtureA_cleanText()], 'Analizar', '', { includeReferenceInAnalysis: false });
    expect(a.richCaseAnalysis?.candidates.length).toBeGreaterThan(0);
    expect(a.facts.length + a.claims.length + a.evidence.length).toBeGreaterThan(0);
  });
  it('28 keeps the legacy evidence array non-empty for enumerated evidence', () => {
    expect(reconstructCaseAnalysis([fixtureC_commaEvidence()], 'Analizar', '', { includeReferenceInAnalysis: false }).evidence.length).toBeGreaterThan(0);
  });
  it('29 produces at least two claims when two claims exist in source', () => {
    expect(rich('PRESTACIONES:\n1. pago de factura\n2. reconocimiento de intereses').claims).toHaveLength(2);
  });
  it('30 leaves absent data absent', () => {
    const a = rich('ACTOR: Ana López');
    expect(a.authorities).toHaveLength(0);
    expect(a.amounts).toHaveLength(0);
    expect(a.evidenceOffers).toHaveLength(0);
  });
});

void createSourceProvenance;
void deduplicateRichItems;
