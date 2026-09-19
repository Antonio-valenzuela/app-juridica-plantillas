import { describe, expect, it, vi } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import type { DocumentAssemblyResult } from '@/lib/legal-engine/documentAssemblyTypes';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

const SENTINEL_MARKER = 'TEST-SUBSTANTIVE-CONTENT-XYZ';

type AssemblyAttachedDocument = UniversalLegalDocument & {
  documentAssemblyResult?: DocumentAssemblyResult;
};

function createSentinelSourceDocument() {
  return createSourceDocument({
    id: 'fixture-sentinel-source',
    filename: 'sentencia_amparo_directo_800_2024.pdf',
    type: 'application/pdf',
    sourceValidated: true,
    classification: { sourceDocumentType: 'SENTENCIA_AMPARO_DIRECTO' },
    pages: [{
      page: 1,
      chars: 600,
      text: [
        'SEGUNDO TRIBUNAL COLEGIADO EN MATERIA ADMINISTRATIVA DEL TERCER CIRCUITO',
        'AMPARO DIRECTO 800/2024',
        'QUEJOSO: EMPRESA DEMANDANTE S.A. DE C.V.',
        'SENTENCIA DEFINITIVA',
        'ANTECEDENTES',
        `El 3 de enero de 2024 se presentó demanda de amparo directo en el expediente AMPARO DIRECTO 800/2024.`,
        'El 10 de febrero de 2024 se dictó la sentencia definitiva recurrida.',
        'El 15 de marzo de 2024 se interpuso en tiempo el presente recurso de revisión.',
      ].join('\n'),
    }],
  });
}

function getSectionContent(document: UniversalLegalDocument, titlePattern: RegExp): string {
  return document.sections
    .filter((s) => titlePattern.test(s.title))
    .flatMap((s) => s.content || [])
    .map((b) => b.text)
    .join('\n\n');
}

describe('SENTINEL E2E — Substantive Content Delivery to Final Document', () => {
  it('injects sentinel content via issueProviderInvoker and reaches final document assembly', async () => {
    // Provider que retorna contenido sustantivo centinela
    const mockInvoker = vi.fn().mockImplementation(async (request) => {
      const prompt = (request.userMessage || '').toLowerCase();
      let substantive = `Desarrollo jurídico sustantivo ${SENTINEL_MARKER}: `;
      if (prompt.includes('interés') || prompt.includes('excepcional')) {
        substantive += 'Se actualiza el interés excepcional en materia constitucional al omitirse la interpretación del artículo 14.';
      } else if (prompt.includes('bloque') || prompt.includes('constitucional')) {
        substantive += 'Violación directa al bloque de constitucionalidad conforme a los artículos 1 y 133 de la CPEUM.';
      } else if (prompt.includes('agravio')) {
        substantive += 'PRIMER AGRAVIO: La omisión de fijar el alcance del derecho humano de audiencia genera agravio irreparable.';
      } else {
        substantive += 'Argumentación jurídica sustantiva de procedencia del recurso de revisión.';
      }

      return {
        provider: 'nvidia',
        model: 'sentinel-mock-model',
        success: true,
        content: substantive,
        latencyMs: 15,
        origin: 'AI_GENERATED_LEGAL_CONTENT',
      };
    });

    const prevKey = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = 'test-sentinel-key';
    const orchestrator = await import('@/lib/ai/orchestrator');
    const spy = vi.spyOn(orchestrator, 'runFastMode').mockImplementation(mockInvoker as any);

    try {
      const result = await runGenerationPipeline({
        selectedDocumentType: 'recurso_revision_amparo_directo',
        documentTypeLabel: 'Recurso de revisión en amparo directo',
        matter: 'Amparo',
        jurisdiction: 'Federal',
        userInstruction: 'Interponer recurso de revisión en amparo directo fundado en omisión constitucional.',
        sourceDocuments: [createSentinelSourceDocument()],
        generationId: 'sentinel-e2e-delivery-test',
        traceOptions: { enabled: true },
      });

      const attached = result as AssemblyAttachedDocument;
      const assembly = attached.documentAssemblyResult;

    // 1. Verificar que el documento tiene secciones
    expect(result.sections.length).toBeGreaterThanOrEqual(7);

    // 2. Verificar que el assembly contiene secciones y bloques
    expect(assembly).toBeDefined();
    expect(assembly?.sections.length).toBeGreaterThanOrEqual(7);

    // 3. Verificar que ANTECEDENTES proviene determinísticamente de la fuente
    const antecedentesText = getSectionContent(result, /antecedente/i);
    expect(antecedentesText).toContain('AMPARO DIRECTO 800/2024');

    // 4. Verificar que las secciones sustantivas NO contienen placeholders genéricos de error
    const fullAssembledText = (assembly?.sections || [])
      .flatMap((s) => s.blocks)
      .map((b) => b.text)
      .join('\n\n');

    expect(fullAssembledText).not.toContain('[DATO PENDIENTE DE EXPEDIENTE: Contenido de INTERÉS EXCEPCIONAL]');
    expect(fullAssembledText).not.toContain('[DATO PENDIENTE DE EXPEDIENTE: Contenido de BLOQUE DE CONSTITUCIONALIDAD]');
    console.log('SECTIONS DUMP:', result.sections.map(s => ({
      title: s.title,
      type: s.type,
      blocksCount: s.content?.length || 0,
      preview: (s.content || []).map(b => b.text).join(' ').slice(0, 100)
    })));

    // 5. Verificar que las secciones sustantivas tienen desarrollo procesal real
    const interesText = getSectionContent(result, /inter[eé]s\s+excepcional/i);
    expect(interesText.length).toBeGreaterThan(100);
    expect(interesText).not.toContain('DATO PENDIENTE');

    const bloqueText = getSectionContent(result, /bloque\s+de\s+constitucionali/i);
    expect(bloqueText.length).toBeGreaterThan(100);
    expect(bloqueText).not.toContain('DATO PENDIENTE');

      const agraviosText = getSectionContent(result, /agravio/i);
      expect(agraviosText.length).toBeGreaterThan(100);
      expect(agraviosText).not.toContain('DATO PENDIENTE');
    } finally {
      spy.mockRestore();
      if (prevKey === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = prevKey;
    }
  });
});
