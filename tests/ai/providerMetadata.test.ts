import { describe, it, expect, vi } from 'vitest';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { buildFormattedDocument } from '@/lib/legal-engine/legalFormatter';
import { buildFallbackAnalysis } from '@/lib/legal-engine/legalFormatAnalyzer';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';

describe('Provider metadata — NVIDIA vs documento recién cargado', () => {
  it('Caso 1: documento recién cargado → aiUsed=false, aiModel undefined, provider no inventado', async () => {
    // Simula upload: createEmptyDocument como en page.tsx tras uploadFilesInternal (post-fix)
    const src = createSourceDocument({
      id: 'doc-upload-1',
      filename: 'contrato.pdf',
      sourceValidated: true,
      pages: [{ page: 1, text: 'Contrato de trabajo', chars: 100 }],
    });
    const uploadedDoc = createEmptyDocument({
      title: 'contrato',
      documentType: 'machote_real',
      documentTypeLabel: 'Documento Oficial',
      matter: 'Amparo',
      // jurisdiction no hardcodeada — undefined deja que createEmptyDocument ponga default 'federal' pero nunca 'Cd. de México'
      jurisdiction: undefined,
      sourceDocuments: [src],
      generationMetadata: {
        pipelineState: { currentStage: null, stages: {} as any, isComplete: true, hasErrors: false },
        aiUsed: false,
      } as any,
      status: 'draft',
    });
    expect(uploadedDoc.generationMetadata.aiUsed).toBe(false);
    expect(uploadedDoc.generationMetadata.aiModel == null).toBe(true); // undefined o null
    expect((uploadedDoc.generationMetadata as any).aiProvider == null).toBe(true);
    expect(uploadedDoc.generationMetadata.aiModel).not.toBe('gemini-legal-engine');
    expect(uploadedDoc.generationMetadata.aiModel).not.toBe('nvidia/nemotron-parse-v1.2');
    // buildFormattedDocument con fallback también debe ser neutro si no hubo IA
    const analysis = buildFallbackAnalysis('Texto');
    const formatted = buildFormattedDocument(analysis, [src], { aiUsed: false });
    expect(formatted.generationMetadata.aiUsed).toBe(false);
    expect(formatted.generationMetadata.aiModel == null).toBe(true);
    expect(formatted.generationMetadata.aiProvider == null).toBe(true);
  });

  it('Caso 2: generación con NVIDIA (mock) → provider=nvidia, model=NVIDIA_MODEL, generationId presente', async () => {
    const nvidiaModel = process.env.NVIDIA_MODEL || 'meta/llama-3.2-11b-vision-instruct';
    const prevKey = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = ['test', 'provider', 'key'].join('-');
    // Mock runFastMode para simular NVIDIA success sin llamar red real
    const { NVIDIAProvider } = await import('@/lib/ai/providers/nvidia');
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(NVIDIAProvider.prototype, 'generate').mockResolvedValue({
      provider: 'nvidia',
      model: nvidiaModel,
      success: true,
      content: 'Contenido generado por NVIDIA para prueba de metadata. '.repeat(10),
      latencyMs: 100,
    });

    const doc = await runGenerationPipeline({
      userInstruction: 'Generar demanda laboral con NVIDIA',
      taxonomy: { matter: 'laboral', jurisdiction: 'local', documentType: 'demanda' } as any,
      matter: 'Laboral',
      jurisdiction: 'Local',
      documentTypeLabel: 'Demanda',
      allowUnvalidatedSource: true,
    });

    expect(doc.generationMetadata.aiUsed).toBe(true);
    expect(doc.generationMetadata.aiProvider).toBe('nvidia');
    expect(doc.generationMetadata.aiModel).toBe(nvidiaModel);
    expect((doc.generationMetadata as any).generationId).toBeTruthy();
    expect(typeof (doc.generationMetadata as any).generationId).toBe('string');
    expect(doc.generationMetadata.aiModel).not.toBe('gemini-legal-engine');

    vi.restoreAllMocks();
    process.env.NVIDIA_API_KEY = prevKey;
  });

  it('Caso 2b: generación sin API key (fallback local) → aiUsed false, no provider inventado como gemini', async () => {
    const originalKey = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = '';
    const doc = await runGenerationPipeline({
      userInstruction: 'Demanda sin IA',
      taxonomy: { matter: 'civil', jurisdiction: 'local', documentType: 'demanda' } as any,
      matter: 'Civil',
      jurisdiction: 'Local',
      documentTypeLabel: 'Demanda',
      allowUnvalidatedSource: true,
    });
    // Con fallback local, aiUsed debe ser false y no debe decir gemini
    expect(doc.generationMetadata.aiUsed).toBe(false);
    expect(doc.generationMetadata.aiModel == null || doc.generationMetadata.aiModel === 'local-deterministic-rules-v1' || doc.generationMetadata.aiModel === null).toBe(true);
    expect(doc.generationMetadata.aiModel).not.toBe('gemini-legal-engine');
    process.env.NVIDIA_API_KEY = originalKey;
  });
});
