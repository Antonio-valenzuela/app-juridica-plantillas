import { describe, it, expect } from 'vitest';
import { controlledSource } from '@/tests/fixtures/controlledLegalQuality';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildPenalContext } from '@/lib/legal-engine/caseContext';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

const realFixture: UploadedSourceDocument = controlledSource('penal');
function context(text: string) {
  const source = { ...realFixture, content: text, extractedText: text, pages: [{ page: 1, text, chars: text.length }] };
  return buildPenalContext('apelacion_penal', [source], reconstructCaseAnalysis([source], ''), {});
}
describe('Penal source contract: role is not an offence', () => {
  it('does not invent offence from the exact controlled source', () => {
    const result = context(realFixture.extractedText!);
    expect(result.delitoImputado?.value).toBeUndefined();
    expect(result.delitoImputado?.status).toBe('MISSING');
  });
  it.each(['No consta delito de robo.', 'No se conoce el delito imputado.', 'Delito imputado.'])('rejects absent/role-only offence: %s', text => {
    expect(context(text).delitoImputado?.value).toBeUndefined();
  });
  it('keeps an explicit source offence without asserting it was proven', () => {
    expect(context('La fiscalía atribuye el delito de robo.').delitoImputado?.value).toBe('robo');
  });
  it('uses extractedText when content is absent', () => {
    const source = { ...realFixture, content: undefined, extractedText: 'Se atribuye delito de fraude.', pages: [] };
    expect(buildPenalContext('apelacion_penal', [source], reconstructCaseAnalysis([source], ''), {}).delitoImputado?.value).toBe('fraude');
  });
  it('keeps the represented quality separate from the source stage', () => {
    const result = context(realFixture.extractedText!);
    expect((result as unknown as { calidadPersona: { value?: string } }).calidadPersona?.value).toBe('imputado');
    expect((result as unknown as { etapaProcesal: { value?: string } }).etapaProcesal?.value).toBe('investigación complementaria');
  });
  it('does not infer quality or stage from the requested document type', () => {
    const result = context('Constancia disponible. No consta calidad del representado ni etapa procesal.');
    expect((result as unknown as { calidadPersona: { value?: string } }).calidadPersona?.value).toBeUndefined();
    expect((result as unknown as { etapaProcesal: { value?: string } }).etapaProcesal?.value).toBeUndefined();
  });
  it('does not confirm a negated stage label', () => {
    const result = context('No consta etapa: juicio.');
    expect(result.etapaProcesal?.value).toBeUndefined();
  });
});
