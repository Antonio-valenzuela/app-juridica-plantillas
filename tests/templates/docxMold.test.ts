import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildCarryoverBlocklist } from '@/lib/templates/carryoverFilter';
import { DocxMoldError, inspectDocxMold, moldPdfSettings, renderWithDocxMold } from '@/lib/templates/docxMold';
import { buildSyntheticLawyerTemplate } from '../helpers/syntheticLawyerTemplate';

const newContent = [
  { role: 'title' as const, text: 'CONTESTACIÓN DE DEMANDA' },
  { role: 'body' as const, text: 'María López comparece en el expediente 812/2026 para manifestar lo siguiente.' },
  { role: 'heading' as const, text: 'HECHOS', sectionTitle: 'HECHOS' },
  { role: 'body' as const, text: '1. El 3 de marzo de 2026 la actora entregó el inmueble.\nSe adjunta constancia.', sectionTitle: 'HECHOS' },
  { role: 'closing' as const, text: 'PROTESTO LO NECESARIO' },
];

async function text(zip: JSZip, path: string) {
  return zip.file(path)!.async('string');
}

describe('molde visual DOCX', () => {
  it('lee página y tipografía de la plantilla', async () => {
    const info = await inspectDocxMold(await buildSyntheticLawyerTemplate());
    expect(info.page.margins).toEqual({ top: 2268, right: 1134, bottom: 1701, left: 2268 });
    expect(info.typography.fontName).toBe('Garamond');
    expect(info.typography.fontSizePt).toBe(13);
    expect(info.headerTexts.join(' ')).toContain('LEX & ASOCIADOS');
    expect(info.hasHeaderFooterImages).toBe(true);
    expect(info.sectionTitles).toContain('HECHOS');
  });

  it('conserva márgenes, estilos, header y footer, y solo contiene el texto nuevo', async () => {
    const template = await buildSyntheticLawyerTemplate();
    const blocklist = buildCarryoverBlocklist('C. Juan Pérez, expediente 345/2022. $85,000.00', ['María López', '812/2026']);
    const out = await renderWithDocxMold(template, newContent, { blocklist });

    const before = await JSZip.loadAsync(template);
    const after = await JSZip.loadAsync(out.bytes);

    expect(await text(after, 'word/styles.xml')).toBe(await text(before, 'word/styles.xml'));
    const info = await inspectDocxMold(out.bytes);
    expect(info.page.margins).toEqual({ top: 2268, right: 1134, bottom: 1701, left: 2268 });
    expect(Object.keys(after.files).filter((n) => n.startsWith('word/media/')).length)
      .toBe(Object.keys(before.files).filter((n) => n.startsWith('word/media/')).length);
    expect(info.hasHeaderFooterImages).toBe(true);
    expect(info.headerTexts.join(' ')).toContain('LEX & ASOCIADOS');
    expect(await text(after, 'word/document.xml')).toContain('w:val="CuerpoLex"');
    expect(await text(after, 'word/document.xml')).toContain('w:val="TituloLex"');

    const everything = (await Promise.all(
      Object.keys(after.files)
        .filter((n) => /^(word\/(document|header\d*|footer\d*)|docProps\/core)\.xml$/.test(n))
        .map((n) => text(after, n)),
    )).join('\n');
    for (const old of ['Juan Pérez', '345/2022', '85,000', '18 de agosto de 2021']) expect(everything).not.toContain(old);
    expect(everything).toContain('María López comparece');
    expect(everything).toContain('3 de marzo de 2026');
    expect(out.clearedHeaderFooter).toEqual(['Expediente 345/2022']);
    expect(out.warnings.join(' ')).toContain('encabezado o pie');
  });

  it('rechaza archivos que no son .docx', async () => {
    await expect(renderWithDocxMold(Buffer.from('no es un zip'), newContent)).rejects.toBeInstanceOf(DocxMoldError);
  });

  it('el PDF aproximado iguala página y márgenes y avisa lo que no puede igualar', async () => {
    const settings = moldPdfSettings(await inspectDocxMold(await buildSyntheticLawyerTemplate()));
    expect(settings.pageProfile).toMatchObject({ unit: 'pt', width: 612, height: 792, margins: { top: 113.4, right: 56.7, bottom: 85.05, left: 113.4 } });
    expect(settings.fontSizePt).toBe(13);
    expect(settings.lineHeight).toBe(1.5);
    expect(settings.warnings.join(' ')).toContain('Garamond');
    expect(settings.warnings.join(' ')).toContain('imágenes del membrete');
  });
});
