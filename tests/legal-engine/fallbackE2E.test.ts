import { describe, expect, it, vi } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import type { DocumentAssemblyResult } from '@/lib/legal-engine/documentAssemblyTypes';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

type AssemblyAttachedDocument = UniversalLegalDocument & {
  documentAssemblyResult?: DocumentAssemblyResult;
};

function createTestSentenciaSourceDocument() {
  return createSourceDocument({
    id: 'fixture-fallback-source',
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
        'El 3 de enero de 2024 se presentó demanda de amparo directo en el expediente AMPARO DIRECTO 800/2024.',
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

describe('FALLBACK E2E — Deterministic Fallback Delivery Across All Sections', () => {
  it('delivers substantive legal drafting across all 10 canonical sections when provider throws', async () => {
    const prevKey = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = 'test-fallback-key';
    const orchestrator = await import('@/lib/ai/orchestrator');
    const spy = vi.spyOn(orchestrator, 'runFastMode').mockRejectedValue(
      new Error('PROVIDER_NETWORK_UNAVAILABLE: 503 Service Unavailable')
    );

    try {
      const result = await runGenerationPipeline({
        selectedDocumentType: 'recurso_revision_amparo_directo',
        documentTypeLabel: 'Recurso de revisión en amparo directo',
        matter: 'Amparo',
        jurisdiction: 'Federal',
        userInstruction: 'Interponer recurso de revisión en amparo directo fundado en omisión constitucional.',
        sourceDocuments: [createTestSentenciaSourceDocument()],
        generationId: 'fallback-e2e-delivery-test',
        traceOptions: { enabled: true },
      });

      const attached = result as AssemblyAttachedDocument;
      const assembly = attached.documentAssemblyResult;

    // 1. Debe haber 10 secciones canónicas
    expect(result.sections.length).toBe(10);
    expect(assembly).toBeDefined();

    // 2. Cero secciones vacías: todas deben tener al menos 1 bloque de contenido
    for (const sec of result.sections) {
      expect((sec.content || []).length).toBeGreaterThanOrEqual(1);
      const secText = (sec.content || []).map((b) => b.text).join('\n\n');
      expect(secText.trim().length).toBeGreaterThan(0);
    }

    // 3. ANTECEDENTES proviene determinísticamente de la fuente
    const antecedentesText = getSectionContent(result, /antecedente/i);
    expect(antecedentesText).toContain('AMPARO DIRECTO 800/2024');

    // 4. Secciones sustantivas clave tienen desarrollo sustantivo y fondo jurídico real
    const interesText = getSectionContent(result, /inter[eé]s\s+excepcional/i);
    expect(interesText.length).toBeGreaterThan(200);
    expect(interesText).toMatch(/inter[eé]s\s+excepcional/i);
    expect(interesText).not.toContain('DATO PENDIENTE DE EXPEDIENTE: Contenido de INTERÉS EXCEPCIONAL');

    const bloqueText = getSectionContent(result, /bloque\s+de\s+constitucionali/i);
    expect(bloqueText.length).toBeGreaterThan(200);
    expect(bloqueText).toMatch(/bloque\s+de\s+constitucionali/i);
    expect(bloqueText).not.toContain('DATO PENDIENTE DE EXPEDIENTE: Contenido de BLOQUE DE CONSTITUCIONALIDAD');

    const agraviosText = getSectionContent(result, /agravio/i);
    expect(agraviosText.length).toBeGreaterThan(200);
    expect(agraviosText).toMatch(/agravio/i);
    expect(agraviosText).not.toContain('DATO PENDIENTE DE EXPEDIENTE: Contenido de AGRAVIOS');

    const pruebasText = getSectionContent(result, /prueba/i);
    expect(pruebasText.length).toBeGreaterThan(100);
    expect(pruebasText).toMatch(/prueba/i);

    // 5. El assembly del documento también conserva todas las secciones con texto sustantivo
    for (const assemblySec of assembly?.sections || []) {
      expect(assemblySec.blocks.length).toBeGreaterThanOrEqual(1);
      const text = assemblySec.blocks.map((b) => b.text).join('\n\n');
      expect(text.trim().length).toBeGreaterThan(0);
    }
    } finally {
      spy.mockRestore();
      if (prevKey === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = prevKey;
    }
  });
});
