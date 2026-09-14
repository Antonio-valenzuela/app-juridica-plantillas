import { describe, it, expect } from 'vitest';
import { PROFESSIONAL_TEMPLATES } from '@/lib/templates/templateDefinitions';
import { renderToDocument } from '@/lib/templates/templateRenderer';
import { exportToDocx } from '@/lib/templates/exportDocx';

describe('Exportación DOCX', () => {
  it('debe generar un buffer DOCX válido', async () => {
    const template = PROFESSIONAL_TEMPLATES[0];
    const values: Record<string, string | string[]> = {};
    for (const section of template.sections) {
      if (section.type === 'repeatable') {
        values[section.id] = ['Dato 1', 'Dato 2'];
      } else {
        values[section.id] = `Valor de ${section.title}`;
      }
    }

    const doc = renderToDocument(template, values);
    const buffer = await exportToDocx(doc);

    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(0);

    // DOCX files start with PK (ZIP header)
    const view = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
    expect(view[0]).toBe(0x50); // P
    expect(view[1]).toBe(0x4B); // K
  });

  it('debe generar DOCX para cada una de las 15 plantillas', async () => {
    for (const template of PROFESSIONAL_TEMPLATES) {
      const values: Record<string, string | string[]> = {};
      for (const section of template.sections) {
        if (section.type === 'repeatable') {
          values[section.id] = ['Test'];
        } else {
          values[section.id] = 'Test';
        }
      }

      const doc = renderToDocument(template, values);
      const buffer = await exportToDocx(doc);
      expect(buffer.byteLength).toBeGreaterThan(0);
    }
  });

  it('debe generar DOCX con campos vacíos sin error', async () => {
    const template = PROFESSIONAL_TEMPLATES[0];
    const doc = renderToDocument(template, {});
    const buffer = await exportToDocx(doc);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
