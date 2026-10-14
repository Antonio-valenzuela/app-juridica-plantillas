import { describe, expect, it } from 'vitest';
import { parseFederalLawsIndex } from '@/lib/legal/federalLawsIndex';
import { loadWorkspaceLibrary } from '@/lib/workspace/research';

/** Filas con la misma forma que el índice oficial de Diputados (contenido sintético). */
const row = (pdf: string, ref: string, title: string, titleCellExtra: string, reformCell: string) => `
<tr><td valign="top" width="5%"><p>1</p></td>
<td valign="top" width="50%"><p><font size="2"><a href="ref/${ref}.htm"><font face="Verdana">${title}</font></a></font></p>
<p><font face="Verdana" size="2">DOF 02/04/2013</font></p>${titleCellExtra}<p>&nbsp;</p></td>
<td valign="top" align="center" width="18%"><p><font face="Verdana" size="2">${reformCell}</font></p></td>
<td valign="top" width="27%"><p><a target="_blank" href="pdf/${pdf}.pdf"><img src="imagenes/principal/pdf.png"></a></p></td></tr>`;

const html = `<table>${[
  row('LPRUEBA', 'lprueba', 'LEY de Prueba Sint&eacute;tica', '', 'DOF 16/10/2025'),
  row('CPRUEBA', 'cprueba', 'C&Oacute;DIGO Sint&eacute;tico de Procedimientos', '<p>(Abrogado en un plazo que no exceda del 01/04/2027)</p>', 'Notificación 17/06/2025<br>Sentencia SCJN'),
  row('79', 'lnum', 'LEY con PDF num&eacute;rico', '', 'Sin reforma'),
  row('LSENT', 'lsent', 'LEY con Sentencia', '', 'DOF 16/01/2026<br>Sentencia SCJN'),
].join('')}</table>`;

describe('índice oficial de leyes federales', () => {
  const laws = parseFederalLawsIndex(html);

  it('lee título, sigla, publicación y última reforma', () => {
    expect(laws.find((law) => law.sigla === 'LPRUEBA')).toEqual({
      sigla: 'LPRUEBA',
      titulo: 'Ley de Prueba Sintética',
      pdf_url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LPRUEBA.pdf',
      ref_url: 'https://www.diputados.gob.mx/LeyesBiblio/ref/lprueba.htm',
      publicacion_original: '2013-04-02',
      ultima_reforma: '2025-10-16',
    });
  });

  it('no inventa fecha de reforma: conserva la nota literal y la nota de vigencia', () => {
    const code = laws.find((law) => law.sigla === 'CPRUEBA')!;
    expect(code.ultima_reforma).toBeUndefined();
    expect(code.ultima_reforma_nota).toBe('Notificación 17/06/2025 Sentencia SCJN');
    expect(code.nota_vigencia).toBe('Abrogado en un plazo que no exceda del 01/04/2027');
    expect(laws.find((law) => law.titulo === 'Ley con PDF numérico')).toMatchObject({ sigla: 'LNUM', ultima_reforma_nota: 'Sin reforma', pdf_url: expect.stringContaining('/pdf/79.pdf') });
  });

  it('separa la fecha DOF de la observación «Sentencia SCJN»', () => {
    expect(laws.find((law) => law.sigla === 'LSENT')).toMatchObject({ ultima_reforma: '2026-01-16', ultima_reforma_nota: 'Sentencia SCJN' });
  });

  it('la Biblioteca usa el catálogo oficial importado y solo enlaces oficiales', () => {
    const library = loadWorkspaceLibrary();
    expect(library.length).toBeGreaterThan(200);
    for (const item of library) expect(item.officialUrl, item.id).toMatch(/^https:\/\/www\.diputados\.gob\.mx\/LeyesBiblio\//);
    expect(library.find((item) => item.abbreviation === 'LAmp')?.source).toBe('DIPUTADOS_INDEX');
  });
});
