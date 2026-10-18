import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportUniversalToDocx, exportUniversalToDocxWithMold, TemplateCarryoverExportError } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdfWithMold } from '@/lib/legal-engine/exportPdfUniversal';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { inspectDocxMold, moldPdfSettings } from '@/lib/templates/docxMold';
import { buildSyntheticLawyerTemplate } from '../helpers/syntheticLawyerTemplate';

const TEMPLATE_TEXT = 'C. Juan Pérez, expediente 345/2022. El 18 de agosto de 2021 pagó $85,000.00.';

function block(id: string, text: string) {
  return { id, layer: 'USER_POSITION' as const, trustLevel: 'VERIFIED' as const, text };
}

function makeDocument(extraFact?: string) {
  const doc = createEmptyDocument({
    id: 'doc-mold',
    title: 'Contestación sintética',
    documentType: 'escrito_libre',
    documentTypeLabel: 'Escrito libre',
    sections: [
      createDocumentNode({ id: 'proemio', title: 'PROEMIO Y COMPARECENCIA', type: 'identity', content: [block('b1', 'María López comparece en el expediente 812/2026 con la personalidad debidamente acreditada para exponer lo siguiente.')] }),
      createDocumentNode({
        id: 'hechos', title: 'HECHOS', type: 'facts',
        content: [block('b2', 'El 3 de marzo de 2026 la actora entregó el inmueble arrendado a la demandada sin objeción alguna.'), ...(extraFact ? [block('b3', extraFact)] : [])],
      }),
      createDocumentNode({ id: 'petitorios', title: 'PUNTOS PETITORIOS', type: 'petition', content: [block('b4', 'PRIMERO. Tenerme por presentado en tiempo y forma. SEGUNDO. Proveer de conformidad con lo solicitado.')] }),
      createDocumentNode({ id: 'firma', title: 'FIRMA', type: 'signature', content: [block('b5', 'PROTESTO LO NECESARIO EN DERECHO. CIUDAD DE MÉXICO A LA FECHA DE SU PRESENTACIÓN.')] }),
    ],
    generationMetadata: { ...createEmptyDocument().generationMetadata, preflight: { status: 'READY', missingFields: [] } } as never,
  });
  doc.intake = { request: 'caso sintético' } as never;
  doc.missingFields = [];
  doc.anonymizedFields = [];
  doc.validation = { isValid: true, errors: [], warnings: [] };
  (doc as never as { qualityGate: unknown }).qualityGate = { passed: true, canMarkAsFinal: true };
  return markDocumentAsReadyToExport(doc, { explicit: true });
}

const caseValues = ['María López', '812/2026', '3 de marzo de 2026'];

describe('exportación con el diseño de la plantilla del abogado', () => {
  it('DOCX: conserva el diseño y solo contiene el escrito nuevo', async () => {
    const templateBytes = await buildSyntheticLawyerTemplate();
    const { buffer, warnings, blocked } = await exportUniversalToDocxWithMold(makeDocument(), { templateBytes, templateText: TEMPLATE_TEXT, caseValues });

    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file('word/document.xml')!.async('string');
    expect(documentXml).toContain('María López comparece');
    expect(documentXml).toContain('w:val="CuerpoLex"');
    expect(documentXml).toContain('w:val="TituloLex"');
    for (const old of ['Juan Pérez', '345/2022', '85,000']) expect(documentXml).not.toContain(old);

    const info = await inspectDocxMold(buffer);
    expect(info.page.margins).toEqual({ top: 2268, right: 1134, bottom: 1701, left: 2268 });
    expect(info.hasHeaderFooterImages).toBe(true);
    expect(info.headerTexts.join(' ')).toContain('LEX & ASOCIADOS');
    expect(info.headerTexts.join(' ')).not.toContain('345/2022');
    expect(blocked).toEqual([]);
    expect(warnings.join(' ')).toContain('encabezado o pie');

    // La exportación normal sigue sin cambios de diseño.
    const plain = await exportUniversalToDocx(makeDocument());
    expect((await inspectDocxMold(plain)).page.margins).not.toEqual(info.page.margins);
  });

  it('un párrafo con datos de la plantilla anterior se bloquea (DRAFT) o impide FINAL', async () => {
    const templateBytes = await buildSyntheticLawyerTemplate();
    const withLeak = 'Según el expediente 345/2022 se debe la cantidad de $85,000.00.';
    await expect(
      exportUniversalToDocxWithMold(makeDocument(withLeak), { templateBytes, templateText: TEMPLATE_TEXT, caseValues }),
    ).rejects.toBeInstanceOf(TemplateCarryoverExportError);
  });

  it('PDF aproximado: usa la página, márgenes y letra del molde', async () => {
    const templateBytes = await buildSyntheticLawyerTemplate();
    const settings = moldPdfSettings(await inspectDocxMold(templateBytes));
    const pdf = await exportUniversalToPdfWithMold(makeDocument(), settings);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.toString('latin1')).toContain('113.4');
    expect(settings.warnings.join(' ')).toContain('aproxima');
  });
});
