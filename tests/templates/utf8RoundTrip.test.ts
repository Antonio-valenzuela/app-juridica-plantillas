import { describe, expect, it } from 'vitest';
import mammoth from 'mammoth';
import { exportToDocx } from '@/lib/templates/exportDocx';
import { renderToDocument } from '@/lib/templates/templateRenderer';
import { sanitizeTemplateContent } from '@/lib/templates/templateSanitizer';
import type { ProfessionalTemplate } from '@/lib/templates/templateTypes';

const UTF8_SENTENCE = 'Jurídico, contestación, promoción, excepción, acción, niño, señor, Constitución';

describe('Round trip UTF-8 de documentos jurídicos', () => {
  it('conserva acentos y ñ desde persistencia hasta render y DOCX', async () => {
    const persisted = sanitizeTemplateContent(UTF8_SENTENCE);
    const template: ProfessionalTemplate = {
      id: 'utf8-test',
      category: 'General',
      title: 'Plantilla UTF-8',
      description: 'Prueba de caracteres jurídicos',
      legalBasis: '[PENDIENTE: verificar fundamento normativo aplicable]',
      documentType: 'machote',
      applicableLaws: ['[PENDIENTE: verificar legislación aplicable]'],
      warnings: [],
      disclaimer: 'Revisión profesional obligatoria.',
      exportFormats: ['docx'],
      sections: [],
      originalText: persisted,
    };

    const rendered = renderToDocument(template, {});
    const renderedText = JSON.stringify(rendered);
    const buffer = await exportToDocx(rendered);
    const extracted = await mammoth.extractRawText({ buffer });

    expect(persisted).toBe(UTF8_SENTENCE);
    expect(renderedText).toContain(UTF8_SENTENCE);
    expect(extracted.value).toContain(UTF8_SENTENCE);
  });

  it('repara mojibake CP437 de extracción sin sustituir cadenas manualmente', () => {
    const corrupted = 'P├ígina 1\nREVISI├ôN';
    expect(sanitizeTemplateContent(corrupted)).toBe('Página 1\nREVISIÓN');
  });
});
