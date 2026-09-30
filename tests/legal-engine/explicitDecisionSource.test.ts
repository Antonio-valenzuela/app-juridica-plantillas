import { describe, it, expect } from 'vitest';
import { controlledSource, type ControlledMatter } from '@/tests/fixtures/controlledLegalQuality';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';
const source = (matter: string): UploadedSourceDocument => controlledSource(matter as ControlledMatter);
describe('Explicit source decisions without a numbered considerando', () => {
  it.each(['apelacion', 'amparo'])('identifies the actual decision and reasoning in %s', matter => {
    const input = source(matter);
    const analysis = reconstructCaseAnalysis([input], matter === 'amparo' ? 'Preparar amparo indirecto.' : 'Preparar recurso de apelación.');
    expect(analysis.challengedActs.length).toBeGreaterThan(0);
    expect(analysis.challengedReasonings?.length).toBeGreaterThan(0);
    const reasoning = analysis.challengedReasonings![0];
    expect(reasoning.sourceReference?.documentId).toBe(input.id);
    expect(input.extractedText).toContain(reasoning.rulingText);
    expect(analysis.verifiedAuthorities || []).toHaveLength(0);
    expect(analysis.richCaseAnalysis?.decisionReasonings?.length).toBeGreaterThan(0);
    expect(analysis.richCaseAnalysis!.decisionReasonings![0].provenance[0].sourceId).toBe(input.id);
  });
  it('does not turn a request for a future resolution into a challenged decision', () => {
    const text = 'Se solicita resolución: recibir la petición y resolverla.';
    const input = { ...source('amparo'), content: text, extractedText: text, pages: [{ page: 1, text, chars: text.length }] };
    const analysis = reconstructCaseAnalysis([input], 'Preparar amparo indirecto.');
    expect(analysis.challengedReasonings).toHaveLength(0);
  });
  it('does not invent illegality, counterargument or rebuttal from a source decision alone', () => {
    const analysis = reconstructCaseAnalysis([source('apelacion')], 'Preparar recurso de apelación.');
    const axis = analysis.argumentAxes![0];
    expect(axis.reasoning).not.toContain('afecta los derechos fundamentales');
    expect(axis.counterargument).not.toContain('consideró satisfechos los extremos legales');
    expect(axis.rebuttal).not.toContain('resulta incongruente y vulnera');
    expect(axis.reasoning).toMatch(/PENDIENTE|REQUIERE/);
  });
});
