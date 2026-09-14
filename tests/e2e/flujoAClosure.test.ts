import { describe, expect, it } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { buildCaseWorkflow } from '@/lib/legal-engine/caseWorkflow';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';

describe('Cierre end-to-end del Flujo A', () => {
  it('genera contestación con hechos, conserva edición y bloquea exportación del DRAFT', async () => {
    const previousKey = process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    try {
      const source = createSourceDocument({
        id: 'flujo-a-e2e',
        filename: 'demanda-flujo-a.txt',
        sourceValidated: true,
        pages: [{
          page: 1,
          text: [
            'HECHO PRIMERO: La parte actora celebró el contrato el 3 de enero de 2026.',
            'HECHO SEGUNDO: La contraparte recibió el pago inicial el 10 de enero de 2026.',
            'HECHO TERCERO: El incumplimiento se actualizó el 15 de febrero de 2026.',
            'HECHO CUARTO: Se realizó requerimiento extrajudicial el 20 de febrero de 2026.',
            'PRESTACIONES: Se reclama el cumplimiento y el pago de daños acreditables.',
            'PRUEBAS: Contrato, comprobantes de pago y requerimiento extrajudicial.',
          ].join('\n'),
          chars: 400,
        }],
      });
      const workflow = buildCaseWorkflow({
        sourceDocuments: [source],
        analysis: {
          facts: [
            { id: 'f1', number: 'PRIMERO', text: 'La parte actora celebró el contrato el 3 de enero de 2026.', confidence: 0.9 },
            { id: 'f2', number: 'SEGUNDO', text: 'La contraparte recibió el pago inicial el 10 de enero de 2026.', confidence: 0.9 },
            { id: 'f3', number: 'TERCERO', text: 'El incumplimiento se actualizó el 15 de febrero de 2026.', confidence: 0.9 },
            { id: 'f4', number: 'CUARTO', text: 'Se realizó requerimiento extrajudicial el 20 de febrero de 2026.', confidence: 0.9 },
          ],
          missingData: [],
        },
        generationMode: 'automatic',
      });
      const generated = await runGenerationPipeline({
        sourceDocuments: [source],
        workflow,
        documentTypeLabel: 'Contestación de demanda',
        userInstruction: 'Contestar la demanda hecho por hecho, incluyendo prestaciones, pruebas, fundamentos y petitorios.',
      });
      const edited = {
        ...generated,
        sections: generated.sections.map((section) => section.title === 'CONTESTACIÓN DE HECHOS'
          ? { ...section, isManuallyEdited: true, content: section.content.map((block) => ({ ...block, isManuallyEdited: true, provenance: 'USER_EDITED' as const, text: `${block.text}\nPÁRRAFO EDITADO POR EL ABOGADO.` })) }
          : section),
      };
      const finalText = edited.sections.flatMap((section) => section.content).map((block) => block.text).join('\n');
      expect(edited.generationMetadata.generationMode).toBe('automatic');
      expect(['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO'].every((fact) => finalText.includes(fact))).toBe(true);
      expect(finalText).toContain('PÁRRAFO EDITADO POR EL ABOGADO.');
      expect(finalText).toContain('PUNTOS PETITORIOS');
      expect(edited.sections.find((section) => section.title === 'CONTESTACIÓN DE HECHOS')?.content[0]?.provenance).toBe('USER_EDITED');

      await expect(exportUniversalToDocx(edited)).rejects.toThrow(/LIFECYCLE_NOT_EXPORTABLE|READY_TO_EXPORT|export/i);
    } finally {
      if (previousKey === undefined) delete process.env.NVIDIA_API_KEY;
      else process.env.NVIDIA_API_KEY = previousKey;
    }
  });
});
