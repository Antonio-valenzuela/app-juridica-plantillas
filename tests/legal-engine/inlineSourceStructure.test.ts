import { describe, it, expect } from 'vitest';
import { controlledSource } from '@/tests/fixtures/controlledLegalQuality';
import { buildSourceGrounding } from '@/lib/legal-engine/sourceGrounding';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

const source: UploadedSourceDocument = controlledSource('contestacion');
describe('Original one-line controlled demand', () => {
  it('preserves its explicitly labeled alphanumeric case identifier', () => {
    expect(buildSourceGrounding(source).caseMetadata.expediente.value).toBe('SYN-CIV-001');
    expect(reconstructCaseAnalysis([source], 'Preparar contestación.').caseNumbers.principal).toBe('SYN-CIV-001');
  });
  it('segments four source facts and the requested relief before analysis', () => {
    const grounding = buildSourceGrounding(source);
    expect(grounding.caseFacts).toHaveLength(4);
    expect(grounding.caseClaims).toHaveLength(1);
    expect(grounding.caseClaims[0].text).toBe('cumplimiento del convenio y pago del saldo alegado.');
    for (const span of [...grounding.caseFacts, ...grounding.caseClaims]) {
      expect(grounding.sourceText.slice(span.startOffset, span.endOffset).trim()).toBe(span.text);
      expect(span.page).toBe(1);
      expect(span.authorityOnly).toBe(false);
    }
    expect(grounding.sourceText).toBe(source.extractedText);
  });
  it('propagates individual facts and relief without inventing a lawyer position', () => {
    const analysis = reconstructCaseAnalysis([source], 'Preparar contestación.');
    expect(analysis.facts).toHaveLength(4);
    // The pre-existing rich extractor splits two expressly independent reliefs
    // (cumplimiento / pago); the raw grounding retains their single source span.
    expect(analysis.claimResponses?.map(c => c.text)).toEqual(['cumplimiento del convenio', 'pago del saldo alegado.']);
    expect(analysis.facts.every(f => f.lawyerPosition === 'UNDEFINED')).toBe(true);
    expect(analysis.facts.every(f => source.extractedText!.includes(f.sourceFact!))).toBe(true);
    expect(analysis.facts.map(f => f.number)).toEqual(['1', '2', '3', '4']);
  });
  it('does not split a decimal or an ordinary sentence mentioning hechos', () => {
    const text = 'DEMANDA CIVIL. HECHOS: 1. A reclama 1200.50 unidades y menciona los hechos del caso. 2. B no ha definido postura. PRUEBAS: documento referido.';
    const input = { ...source, content: text, extractedText: text, pages: [{ page: 1, text, chars: text.length }] };
    const grounding = buildSourceGrounding(input);
    expect(grounding.caseFacts).toHaveLength(2);
    expect(grounding.caseFacts[0].text).toContain('1200.50');
  });
});
