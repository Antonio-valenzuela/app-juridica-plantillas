import { describe, expect, it } from 'vitest';
import { generatePrintHtml } from '@/lib/templates/exportPdf';
import type { RenderedDocument } from '@/lib/templates/templateTypes';

const documentFixture: RenderedDocument = {
  title: 'Documento <seguro>',
  header: 'Encabezado\n<script>alert("header")</script>',
  body: 'Primer renglón\nSegundo <b>renglón</b>',
  sections: [
    {
      title: 'HECHOS & PRUEBAS',
      content: ['Uno\nDos', '<img src=x onerror=alert(1)>'],
      numbered: true,
    },
  ],
  footer: 'Firma\n<svg onload=alert(1)>',
  warnings: [],
  disclaimer: 'Revisión <obligatoria>',
  generatedAt: '2026-07-26T00:00:00.000Z',
};

describe('Vista controlada de impresión', () => {
  it('escapa todo contenido controlado por usuario o modelo', () => {
    const html = generatePrintHtml(documentFixture);

    expect(html).not.toContain('<script>alert("header")</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<svg onload=alert(1)>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;svg');
  });

  it('convierte saltos de línea reales y conserva el flujo de impresión', () => {
    const html = generatePrintHtml(documentFixture);

    expect(html).toContain('Encabezado<br>&lt;script&gt;');
    expect(html).toContain('Primer renglón<br>Segundo');
    expect(html).toContain('body onload="window.print()"');
  });

  it('incluye la fecha de generación en el pie imprimible', () => {
    const html = generatePrintHtml(documentFixture);

    expect(html).toContain('Generado el');
    expect(html).toContain('2026');
  });
});
