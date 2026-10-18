import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportUniversalToDocxWithMold } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdfWithMold } from '@/lib/legal-engine/exportPdfUniversal';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { inspectDocxMold, moldPdfSettings } from '@/lib/templates/docxMold';
import { buildSyntheticLawyerTemplate } from '../helpers/syntheticLawyerTemplate';

/**
 * Genera plantilla.docx / resultado.docx / resultado.pdf sintéticos para la comparación visual.
 * Solo corre con EXPORT_SAMPLES=1 (no forma parte de la suite normal).
 */
const run = process.env.EXPORT_SAMPLES === '1' ? it : it.skip;

function block(id: string, text: string) {
  return { id, layer: 'USER_POSITION' as const, trustLevel: 'VERIFIED' as const, text };
}

describe('muestras para comparación visual', () => {
  run('genera plantilla, Word y PDF', async () => {
    const outDir = path.resolve('audit/plantilla-abogado');
    mkdirSync(outDir, { recursive: true });
    const template = await buildSyntheticLawyerTemplate();
    writeFileSync(path.join(outDir, 'plantilla.docx'), template);

    const doc = createEmptyDocument({
      id: 'doc-muestra',
      title: 'Contestación sintética',
      documentType: 'escrito_libre',
      documentTypeLabel: 'Escrito libre',
      sections: [
        createDocumentNode({ id: 'proemio', order: 10, title: 'PROEMIO Y COMPARECENCIA', type: 'identity', content: [block('b1', 'María López comparece en el expediente 812/2026 con la personalidad debidamente acreditada para exponer lo siguiente.')] }),
        createDocumentNode({ id: 'hechos', order: 20, title: 'HECHOS', type: 'facts', content: [block('b2', 'El 3 de marzo de 2026 la actora entregó el inmueble arrendado a la demandada sin objeción alguna, según consta en el acta de entrega que se acompaña al presente escrito.')] }),
        createDocumentNode({ id: 'petitorios', order: 30, title: 'PUNTOS PETITORIOS', type: 'petition', content: [block('b4', 'PRIMERO. Tenerme por presentado en tiempo y forma. SEGUNDO. Proveer de conformidad con lo solicitado.')] }),
        createDocumentNode({ id: 'firma', order: 40, title: 'FIRMA', type: 'signature', content: [block('b5', 'PROTESTO LO NECESARIO EN DERECHO. CIUDAD DE MÉXICO A LA FECHA DE SU PRESENTACIÓN.')] }),
      ],
      generationMetadata: { ...createEmptyDocument().generationMetadata, preflight: { status: 'READY', missingFields: [] } } as never,
    });
    doc.intake = { request: 'caso sintético María López 812/2026 3 de marzo de 2026' } as never;
    doc.missingFields = [];
    doc.anonymizedFields = [];
    doc.validation = { isValid: true, errors: [], warnings: [] };
    (doc as never as { qualityGate: unknown }).qualityGate = { passed: true, canMarkAsFinal: true };
    const ready = markDocumentAsReadyToExport(doc, { explicit: true });

    const word = await exportUniversalToDocxWithMold(ready, {
      templateBytes: template,
      templateText: 'C. Juan Pérez, expediente 345/2022. El 18 de agosto de 2021 pagó $85,000.00.',
      caseValues: ['María López', '812/2026', '3 de marzo de 2026'],
    });
    writeFileSync(path.join(outDir, 'resultado.docx'), word.buffer);
    const pdf = await exportUniversalToPdfWithMold(ready, moldPdfSettings(await inspectDocxMold(template)));
    writeFileSync(path.join(outDir, 'resultado.pdf'), pdf);
    expect(word.buffer.length).toBeGreaterThan(1000);
  });
});
