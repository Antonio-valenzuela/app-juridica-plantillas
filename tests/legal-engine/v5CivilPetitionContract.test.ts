import { describe, expect, it, vi } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
vi.mock('@/lib/ai/fastMode', () => ({ runFastMode: async () => ({ success: false, text: '', error: 'OFFLINE' }) }));

describe('V5 civil demand cannot become a generic defense', () => {
  it('does not invent a defense remedy, favorable judgment, timely filing or accredited personality', async () => {
    const document = await runGenerationPipeline({ selectedDocumentType: 'demanda_ordinaria_civil', matter: 'civil',
      userInstruction: 'Preparar demanda de cumplimiento de la obligación alegada; no hay personalidad ni autoridad jurídica confirmada.',
      sourceDocuments: [createSourceDocument({ id: 'synthetic-contract', filename: 'contrato.txt',
        content: 'CONTRATO CIVIL SINTÉTICO. HECHOS: 1. La parte promovente manifiesta que no recibió la entrega pactada. PRESTACIONES: cumplimiento de la entrega. No se aporta poder ni documento de representación.',
        sourceValidated: true, classification: { sourceDocumentType: 'CONTRATO_CIVIL' } })],
      savedParties: [{ role: 'actor', name: 'PROMOVENTE SINTÉTICO', source: 'manual' }],
      generateSection: ({ section }) => `La sección ${section.title} requiere la confirmación de las alegaciones y de sus fuentes antes de una conclusión definitiva.`,
    });
    const petition = document.sections.filter(section => section.type === 'petition').flatMap(section => section.content.map(block => block.text)).join('\n');
    const identity = document.sections.filter(section => section.type === 'identity').flatMap(section => section.content.map(block => block.text)).join('\n');
    expect(petition).not.toMatch(/medio de defensa|resolución favorable|en tiempo y forma/i);
    expect(petition).toMatch(/pendiente|confirm/i);
    expect(identity).not.toMatch(/personalidad se acredita|documentación que obra en autos/i);
    expect(identity).toMatch(/pendiente|confirm/i);
    expect(document.documentType).toBe('demanda_ordinaria_civil');
    expect(document.status).toBe('draft');
  });
  it('preserves affirmative lawyer-confirmed personality and requests without generic additions', async () => {
    const document = await runGenerationPipeline({ selectedDocumentType: 'demanda_ordinaria_civil', matter: 'civil',
      userInstruction: 'Preparar demanda civil únicamente con los datos confirmados del ejercicio.',
      civilManualInput: {
        parties: { actor: { value: 'PROMOVENTE SINTÉTICO', confirmedByLawyer: true } },
        personality: { value: 'por propio derecho', confirmedByLawyer: true },
        requests: [{ id: 'synthetic-request', value: 'Ordenar la entrega del objeto identificado en la constancia sintética.', confirmedByLawyer: true }],
      },
      generateSection: ({ section }) => `[PENDIENTE: confirmar los datos específicos de ${section.title}].`,
    });
    const text = document.sections.flatMap(section => section.content.map(block => block.text)).join('\n');
    expect(text).toContain('por propio derecho');
    expect(text).toContain('Ordenar la entrega del objeto identificado en la constancia sintética.');
    expect(text).not.toMatch(/Admitir a trámite el medio de defensa|dictar resolución favorable/i);
  });
});
