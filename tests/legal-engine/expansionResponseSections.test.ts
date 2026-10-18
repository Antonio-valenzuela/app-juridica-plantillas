/**
 * Lote 3 (P1-6): la ampliación no añade bloques a la respuesta individual de cada hecho. Contrato nuevo: las
 * secciones «Contestación de hechos/prestaciones» no son candidatas en un escrito de respuesta. Las defensas,
 * excepciones y objeciones siguen ampliándose. Datos sintéticos; proveedor simulado.
 */
import { describe, expect, it } from 'vitest';
import { expandDocumentToPageTarget } from '@/lib/legal-engine/generationExpansion';
import { resolveGenerationExtensionContract } from '@/lib/legal-engine/generationExtension';

function docOf(documentType: string, sections: Array<{ id: string; title: string }>) {
  return {
    id: `exp-${documentType}`, documentType, documentTypeLabel: documentType, sourceDocuments: [],
    generationMetadata: { generationId: 'exp-resp', draftDepth: 'PROFESSIONAL_20' },
    sections: sections.map((section, order) => ({
      id: section.id, title: section.title, type: 'argument', order,
      content: [{ id: `b-${section.id}`, text: `Texto previo de ${section.title}.` }],
    })),
    validation: { warnings: [], errors: [] }, status: 'draft',
  } as any;
}

const contract = resolveGenerationExtensionContract({ generationMode: 'extended-legal', targetPages: 3, minPages: 3, maxPages: 5, maxCallsPerDocument: 20, maxExpansionPasses: 2 } as any);

async function expandedSectionIds(document: any): Promise<string[]> {
  const prompts: string[] = [];
  await expandDocumentToPageTarget(document, undefined, contract, {
    measure: async () => ({ actualPages: 1, wordCount: 10, characterCount: 60, pdfBytes: 100 }) as any,
    invokeProvider: async (request: any) => {
      prompts.push(String(request.userMessage));
      return { provider: 'groq', model: 't', success: true, latencyMs: 1, content: `Desarrollo nuevo y específico ${prompts.length} vinculado con el soporte.`, origin: 'AI_GENERATED_LEGAL_CONTENT', isLegalAiContent: true } as any;
    },
  });
  return document.sections
    .filter((section: any) => section.content.length > 1)
    .map((section: any) => section.id);
}

describe('ampliación: secciones de respuesta individual', () => {
  it('en una contestación no se amplía «Contestación de hechos»', async () => {
    const ids = await expandedSectionIds(docOf('contestacion_demanda_civil', [
      { id: 'sec-hechos', title: 'Contestación de hechos' },
      { id: 'sec-excepciones', title: 'Excepciones y defensas' },
    ]));
    expect(ids).not.toContain('sec-hechos');
  });

  it('en una contestación sí se amplían las excepciones y defensas', async () => {
    const ids = await expandedSectionIds(docOf('contestacion_demanda_civil', [
      { id: 'sec-hechos', title: 'Contestación de hechos' },
      { id: 'sec-excepciones', title: 'Excepciones y defensas' },
    ]));
    expect(ids).toContain('sec-excepciones');
  });

  it('una objeción de pruebas sigue ampliando su sección de objeción', async () => {
    const ids = await expandedSectionIds(docOf('objecion_pruebas_civil', [
      { id: 'sec-objecion', title: 'Objeción a las pruebas' },
    ]));
    expect(ids).toContain('sec-objecion');
  });
});
