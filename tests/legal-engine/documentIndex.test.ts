import { describe, expect, it } from 'vitest';
import { buildDocumentIndex } from '@/lib/legal-engine/documentIndex';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

describe('buildDocumentIndex', () => {
  it('keeps a judicial page with a FIREL metadata footer out of table classification', () => {
    const text = [
      '- 1 -',
      'ESTUDIO',
      'La autoridad determinó que la parte actora no probó su acción.',
      'FIRMA JUDICIAL DE PRUEBA',
      '\t706a6620636a66330000000000000000000083f5',
      '\t20/10/28 13:41:15',
      'PJF',
    ].join('\n');
    const source: UploadedSourceDocument = {
      id: 'firel-footer-source',
      filename: 'firel-footer-source.pdf',
      type: 'application/pdf',
      content: text,
      pages: [{ page: 1, text, chars: text.length }],
      sourceValidated: true,
    };

    const index = buildDocumentIndex([source]);

    expect(index.tables).toHaveLength(0);
    expect(index.paragraphs.some((element) => element.text === 'La autoridad determinó que la parte actora no probó su acción.')).toBe(true);
  });
});
