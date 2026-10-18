/**
 * Lote 4 (P1-3) — control fáctico por bloque antes de aceptarlo. Datos sintéticos; sin proveedores.
 * Una fecha o un monto que el expediente no contiene rechaza el bloque, con el motivo registrado.
 */
import { describe, expect, it } from 'vitest';
import { evaluateBlockFactualSupport } from '@/lib/legal-engine/blockFactualGate';
import { expandDocumentToPageTarget } from '@/lib/legal-engine/generationExpansion';
import { resolveGenerationExtensionContract } from '@/lib/legal-engine/generationExtension';

const SOURCE = 'El contrato de arrendamiento se firmó el 3 de mayo de 2019 por la cantidad de $15,000.00 pesos.';

describe('evaluateBlockFactualSupport', () => {
  it('una fecha ausente de la fuente rechaza el bloque con motivo registrado', () => {
    const result = evaluateBlockFactualSupport('Las partes firmaron el contrato el 12 de junio de 2020.', [SOURCE]);
    expect(result.accepted).toBe(false);
    expect(result.rejectedItems).toContain('FECHA_NO_EN_FUENTE:12 de junio de 2020');
  });

  it('una fecha presente en la fuente se acepta', () => {
    expect(evaluateBlockFactualSupport('El contrato se firmó el 3 de mayo de 2019.', [SOURCE]).accepted).toBe(true);
  });

  it('un monto ausente de la fuente rechaza el bloque', () => {
    const result = evaluateBlockFactualSupport('La renta mensual fue de $20,000.00 pesos.', [SOURCE]);
    expect(result.accepted).toBe(false);
    expect(result.rejectedItems.some((item) => item.startsWith('MONTO_NO_EN_FUENTE'))).toBe(true);
  });

  it('un monto presente en la fuente, con otro formato, se acepta', () => {
    expect(evaluateBlockFactualSupport('El precio fue de 15,000 pesos.', [SOURCE]).accepted).toBe(true);
  });

  it('un texto sin fechas ni montos no se bloquea por este control', () => {
    expect(evaluateBlockFactualSupport('La parte demandada sostiene una defensa jurídica general.', [SOURCE]).accepted).toBe(true);
  });
});

describe('ampliación: el bloque con fecha inventada no entra al documento', () => {
  it('la fecha no respaldada no aparece en el contenido de la sección', async () => {
    const document = {
      id: 'soporte-factual', documentType: 'contestacion_demanda_civil', documentTypeLabel: 'Contestación', sourceDocuments: [],
      generationMetadata: { generationId: 'soporte', sourceGrounding: [{ sourceId: 'src-1', sourceText: SOURCE }] },
      sections: [{ id: 'sec-1', title: 'Desarrollo', type: 'argument', order: 0, content: [{ id: 'b1', text: 'Texto previo sintético.' }] }],
      validation: { warnings: [], errors: [] }, status: 'draft',
    } as any;
    const contract = resolveGenerationExtensionContract({ generationMode: 'extended-legal', targetPages: 2, minPages: 2, maxPages: 4, maxCallsPerDocument: 2, maxExpansionPasses: 1 } as any);
    const expansion = await expandDocumentToPageTarget(document, undefined, contract, {
      measure: async () => ({ actualPages: 1, wordCount: 10, characterCount: 60, pdfBytes: 100 }) as any,
      invokeProvider: async () => ({
        provider: 'groq', model: 'test', success: true, latencyMs: 1,
        content: 'La notificación se practicó el 12 de junio de 2020 sin objeción de la parte actora.',
        origin: 'AI_GENERATED_LEGAL_CONTENT', isLegalAiContent: true,
      }) as any,
    });
    const text = document.sections[0].content.map((block: { text: string }) => block.text).join('\n');
    expect(text).not.toContain('12 de junio de 2020');
    // El rechazo queda registrado con su motivo, no solo desaparece el texto.
    expect(expansion.warnings.some((warning) => warning.startsWith('FACTUAL_SUPPORT_MISSING:sec-1'))).toBe(true);
  });
});
