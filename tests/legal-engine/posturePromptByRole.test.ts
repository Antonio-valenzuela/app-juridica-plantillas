/**
 * Lote 3 — directiva de postura según el rol procesal del autor (P1-1, P1-6).
 * Antes, las ampliaciones recibían siempre una directiva «defensiva» (propia de la contestación),
 * incluso en demandas, apelaciones, promociones y actas. Snapshots offline con datos sintéticos.
 */
import { describe, expect, it } from 'vitest';
import { buildExpansionPrompt } from '@/lib/legal-engine/generationExpansion';
import { resolveGenerationExtensionContract } from '@/lib/legal-engine/generationExtension';
import { isResponseDocument, posturePromptModeFor, postureDirectiveLines } from '@/lib/legal-engine/posturePrompt';

const DEFENSIVE_HEADER = 'DIRECTIVA OBLIGATORIA DE POSTURA DEFENSIVA';
const doc = (documentType: string) => ({
  id: `sintetico-${documentType}`, documentType, documentTypeLabel: documentType, sourceDocuments: [], sections: [],
  generationMetadata: {}, validation: { warnings: [], errors: [] },
}) as any;
const section = { id: 'sec-1', title: 'Desarrollo sintético', type: 'argument', order: 0, content: [{ id: 'b1', text: 'Texto sintético previo.' }] } as any;
const contract = resolveGenerationExtensionContract({ generationMode: 'extended-legal', targetPages: 5, minPages: 5, maxPages: 7 } as any);

describe('modo de postura por rol procesal', () => {
  it.each([
    ['demandado', 'DEFENSIVE'], ['apelado', 'DEFENSIVE'], ['actor', 'AFFIRMATIVE'], ['promovente', 'AFFIRMATIVE'],
    ['apelante', 'APPELLATE'], ['parte_interesada', 'NON_CONTENTIOUS'], [undefined, 'NON_CONTENTIOUS'],
  ] as const)('rol %s → %s', (rol, mode) => {
    expect(posturePromptModeFor(rol as any)).toBe(mode);
  });
});

describe('snapshots de directiva por tipo de escrito', () => {
  it('demanda (actor): no lleva directiva defensiva y sí de postura afirmativa', () => {
    const lines = postureDirectiveLines(doc('demanda_ordinaria_civil')).join('\n');
    expect(lines).not.toContain(DEFENSIVE_HEADER);
    expect(lines).toContain('AFIRMATIVA');
  });

  it('contestación (demandado): conserva la directiva defensiva', () => {
    const lines = postureDirectiveLines(doc('contestacion_demanda_civil')).join('\n');
    expect(lines).toContain(DEFENSIVE_HEADER);
  });

  it('promoción (parte interesada): no es contenciosa; sin excepciones ni calidad de demandado o actor', () => {
    const lines = postureDirectiveLines(doc('ofrecimiento_pruebas_civil')).join('\n');
    expect(lines).not.toContain(DEFENSIVE_HEADER);
    expect(lines).toContain('NO CONTENCIOSO');
    expect(lines).not.toMatch(/ESTÁ PERMITIDO[^\n]*excepci/);
  });

  it('el prompt de ampliación usa la directiva del rol del documento', () => {
    const demanda = buildExpansionPrompt(doc('demanda_ordinaria_civil'), section, undefined, contract, 1);
    const promocion = buildExpansionPrompt(doc('ofrecimiento_pruebas_civil'), section, undefined, contract, 1);
    expect(demanda).not.toContain(DEFENSIVE_HEADER);
    expect(promocion).not.toContain(DEFENSIVE_HEADER);
    expect(promocion).toContain('NO CONTENCIOSO');
  });
});

describe('foco por función de sección', () => {
  it('una sección de HECHOS no pide regla jurídica ni refutación', () => {
    const hechos = { ...section, title: 'Hechos' };
    const prompt = buildExpansionPrompt(doc('demanda_ordinaria_civil'), hechos, undefined, contract, 1);
    expect(prompt).not.toContain('regla jurídica aplicable');
    expect(prompt).not.toContain('refutación de la postura contraria');
    expect(prompt).toContain('hechos y prueba estrictamente vinculados');
  });

  it('una sección de fundamentos sí conserva regla jurídica y refutación', () => {
    const derecho = { ...section, title: 'Fundamentos de derecho' };
    const prompt = buildExpansionPrompt(doc('demanda_ordinaria_civil'), derecho, undefined, contract, 1);
    expect(prompt).toContain('regla jurídica aplicable');
    expect(prompt).toContain('refutación de la postura contraria');
  });
});


describe('tipo sin plantilla canónica', () => {
  it('no lanza y conserva la directiva defensiva previa (regresión de generationPipelineContracts)', () => {
    const lines = postureDirectiveLines({ documentType: 'test' });
    expect(lines.join('\n')).toContain(DEFENSIVE_HEADER);
    expect(isResponseDocument({ documentType: 'test' })).toBe(true);
  });
});

import { rolAutorOf } from '@/lib/legal-engine/documentTemplates';

describe('rol del autor por excepción explícita', () => {
  it('contestacion_proveedor es demandado (no parte interesada heredada de la familia)', () => {
    expect(rolAutorOf('contestacion_proveedor')).toBe('demandado');
    expect(isResponseDocument({ documentType: 'contestacion_proveedor' })).toBe(true);
  });
});
