import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { buildFormattedDocument } from '@/lib/legal-engine/legalFormatter';
import { buildFallbackAnalysis } from '@/lib/legal-engine/legalFormatAnalyzer';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';

describe('Jurisdicción — no hardcode Cd. de México', () => {
  it('1. plantilla sin jurisdicción → undefined/null, NO Cd. de México', async () => {
    const doc = createEmptyDocument({
      title: 'Test',
      matter: 'laboral',
      jurisdiction: undefined as any,
    });
    // createEmptyDocument default es 'federal', pero nunca 'Cd. de México'
    expect(doc.jurisdiction).not.toBe('Cd. de México');
    expect(doc.jurisdiction).not.toBe('Ciudad de México');
  });

  it('2. documento sin jurisdicción → NO Cd. de México (buildFormattedDocument sin header.jurisdiction)', () => {
    const analysis = buildFallbackAnalysis('Texto de prueba sin jurisdicción');
    // fallback has no jurisdiction
    expect((analysis.header as any).jurisdiction).toBeUndefined();
    const doc = buildFormattedDocument(analysis, []);
    expect(doc.jurisdiction).not.toBe('Cd. de México');
    // debe ser undefined o no Cd. de México
    expect(doc.jurisdiction === undefined || doc.jurisdiction === null || doc.jurisdiction !== 'Cd. de México').toBe(true);
  });

  it('3. usuario selecciona Local → Local', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Demanda laboral',
      taxonomy: { matter: 'laboral', jurisdiction: 'local', documentType: 'demanda' } as any,
      matter: 'Laboral',
      jurisdiction: 'Local',
      documentTypeLabel: 'Demanda',
      allowUnvalidatedSource: true,
    });
    expect(doc.jurisdiction).toBe('Local');
  });

  it('4. usuario selecciona Federal → Federal', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Amparo indirecto',
      taxonomy: { matter: 'amparo', jurisdiction: 'federal', documentType: 'demanda_amparo_indirecto' } as any,
      matter: 'Amparo',
      jurisdiction: 'Federal',
      documentTypeLabel: 'Demanda de Amparo Indirecto',
      allowUnvalidatedSource: true,
    });
    expect(doc.jurisdiction).toBe('Federal');
  });

  it('5. clasificación explícita válida se conserva (sin sobrescribir con Cd. de México)', async () => {
    const src = createSourceDocument({
      id: 'src-1',
      filename: 'test.pdf',
      sourceValidated: true,
      pages: [{ page: 1, text: 'Texto', chars: 5 }],
    });
    const doc = await runGenerationPipeline({
      userInstruction: 'Recurso de queja',
      sourceDocuments: [src],
      taxonomy: { matter: 'laboral', jurisdiction: 'local', documentType: 'recurso_queja' } as any,
      matter: 'Laboral',
      jurisdiction: 'Local',
      documentTypeLabel: 'Recurso de Queja',
      allowUnvalidatedSource: true,
    });
    expect(doc.jurisdiction).toBe('Local');
    expect(doc.matter).toBe('Laboral');
    expect(doc.jurisdiction).not.toBe('Cd. de México');
  });

  it('6. documento cargado sin jurisdicción no asume Cd. de México', async () => {
    const src = createSourceDocument({
      id: 'src-2',
      filename: 'doc.pdf',
      sourceValidated: true,
      pages: [{ page: 1, text: 'Hechos del caso', chars: 10 }],
    });
    const doc = await runGenerationPipeline({
      userInstruction: 'Escrito libre sin jurisdicción explícita',
      sourceDocuments: [src],
      // sin taxonomy ni jurisdiction
      allowUnvalidatedSource: true,
    });
    // No debe ser Cd. de México aunque no se haya seleccionado
    expect(doc.jurisdiction).not.toBe('Cd. de México');
  });
});
