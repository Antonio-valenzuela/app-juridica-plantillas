import { describe, expect, it } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { SourceDocumentIncompatibleError } from '@/lib/legal-engine/sourceOutputCompatibility';

function civilSource(id: string, sourceDocumentType: string, role?: string) {
  return createSourceDocument({
    id,
    filename: `${id}.txt`,
    content: 'Fuente civil sintética para una prueba de integración.',
    classification: { sourceDocumentType },
    sourceValidated: true,
    ...(role ? { role } : {}),
  } as any);
}

describe('demanda_ordinaria_civil — integración del pipeline único', () => {
  it('permite NEW_WRITING sin archivo, conserva el canonical y deja el borrador en revisión si faltan datos', async () => {
    const document = await runGenerationPipeline({
      selectedDocumentType: 'demanda_ordinaria_civil',
      documentTypeLabel: 'Demanda Ordinaria Civil',
      matter: 'Civil',
      userInstruction: 'Preparar una demanda ordinaria civil desde cero con datos sintéticos.',
      workflow: {
        flow: 'NEW_WRITING',
        sourceDocuments: [],
        selection: { mode: 'automatic' },
        request: 'Demanda ordinaria civil sintética',
        matter: 'Civil',
        documentType: 'demanda_ordinaria_civil',
        documentTypeLabel: 'Demanda Ordinaria Civil',
        facts: [],
        evidence: [],
        fields: [],
        pending: [],
        readiness: { status: 'BLOCKED', missingEssential: [], pending: [] },
      } as any,
      generateSection: ({ section }) => `Contenido sintético pendiente de confirmar para ${section.title}.`,
    });

    expect(document.documentType).toBe('demanda_ordinaria_civil');
    expect(document.sourceDocuments).toHaveLength(0);
    expect((document.generationMetadata as any).preflight?.status).toBe('NEEDS_INPUT');
    expect((document.generationMetadata as any).readiness).toBe('REVIEW_REQUIRED');
    expect(document.status).toBe('draft');
  });

  it('conserva roles individuales en múltiples fuentes y no permite que REFERENCE controle el output', async () => {
    const document = await runGenerationPipeline({
      selectedDocumentType: 'demanda_ordinaria_civil',
      documentTypeLabel: 'Demanda Ordinaria Civil',
      matter: 'Civil',
      userInstruction: 'Preparar demanda ordinaria civil con fuentes auxiliares sintéticas.',
      sourceDocuments: [
        civilSource('contrato-civil', 'CONTRATO_CIVIL', 'PRIMARY'),
        civilSource('comunicacion-civil', 'COMUNICACION_CIVIL', 'SUPPORTING'),
        civilSource('referencia-civil', 'DOCUMENTO_CIVIL_AUXILIAR', 'REFERENCE'),
      ],
      generateSection: ({ section }) => `Contenido sintético pendiente de confirmar para ${section.title}.`,
    });

    expect(document.documentType).toBe('demanda_ordinaria_civil');
    expect(document.generationMetadata.routing?.resolvedTemplate).toBe('demanda_ordinaria_civil');
    expect((document.caseContext as any)?.civil?.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'contrato-civil', role: 'PRIMARY' }),
      expect.objectContaining({ id: 'comunicacion-civil', role: 'SUPPORTING' }),
      expect.objectContaining({ id: 'referencia-civil', role: 'REFERENCE' }),
    ]));
  });

  it('bloquea una fuente mercantil principal incompatible sin cambiar de familia', async () => {
    await expect(runGenerationPipeline({
      selectedDocumentType: 'demanda_ordinaria_civil',
      documentTypeLabel: 'Demanda Ordinaria Civil',
      matter: 'Civil',
      userInstruction: 'Preparar demanda ordinaria civil sintética.',
      sourceDocuments: [civilSource('demanda-mercantil', 'DEMANDA_MERCANTIL', 'PRIMARY')],
      generateSection: ({ section }) => `Contenido sintético para ${section.title}.`,
    })).rejects.toBeInstanceOf(SourceDocumentIncompatibleError);
  });
});
