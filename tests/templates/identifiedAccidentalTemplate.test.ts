import { describe, expect, it } from 'vitest';
import { selectIdentifiedAccidentalTemplate } from '@/lib/templates/identifiedAccidentalTemplate';

const identifiedSourceFileName = 'DOCUMENTO_TEST_001.pdf';

const candidates = [
  {
    id: 'real-test-row',
    sourceFileName: identifiedSourceFileName,
    title: 'Documento jurídico de prueba',
  },
  {
    id: 'real-template',
    sourceFileName: 'demanda-civil.docx',
    title: 'Demanda civil',
  },
  {
    id: 'unrelated-document',
    sourceFileName: 'oficio.docx',
    title: 'Oficio del asunto canario',
  },
];

describe('selectIdentifiedAccidentalTemplate', () => {
  it('selecciona el registro real usando el nombre completo exacto del archivo', () => {
    expect(selectIdentifiedAccidentalTemplate(candidates, {
      sourceFileName: identifiedSourceFileName,
    })).toEqual(['real-test-row']);
  });

  it('no selecciona una fila unrelated aunque su título mencione datos del asunto', () => {
    expect(selectIdentifiedAccidentalTemplate(candidates, {
      sourceFileName: 'DOCUMENTO_NO_CONFIRMADO.pdf',
    })).toEqual([]);
  });

  it('no relaja la igualdad del nombre del archivo ni selecciona una fila normal', () => {
    expect(selectIdentifiedAccidentalTemplate(candidates, {
      sourceFileName: 'DOCUMENTO_TEST_002.pdf',
    })).toEqual([]);
    expect(selectIdentifiedAccidentalTemplate(candidates, {
      sourceFileName: identifiedSourceFileName.toLowerCase(),
    })).toEqual([]);
    expect(selectIdentifiedAccidentalTemplate(candidates, {
      sourceFileName: `${identifiedSourceFileName} `,
    })).toEqual([]);
  });

  it('devuelve [] sin lanzar cuando candidates es undefined', () => {
    expect(selectIdentifiedAccidentalTemplate(undefined, {
      sourceFileName: identifiedSourceFileName,
    })).toEqual([]);
  });

  it('devuelve [] sin lanzar cuando options es undefined', () => {
    expect(selectIdentifiedAccidentalTemplate(candidates, undefined)).toEqual([]);
  });

  it('devuelve [] para una lista vacía o un sourceFileName vacío', () => {
    expect(selectIdentifiedAccidentalTemplate([], {
      sourceFileName: identifiedSourceFileName,
    })).toEqual([]);
    expect(selectIdentifiedAccidentalTemplate(candidates, { sourceFileName: '' })).toEqual([]);
  });

  it('elimina IDs duplicados conservando determinísticamente el primer orden', () => {
    const candidatesWithDuplicate = [
      candidates[0],
      { ...candidates[0] },
      { ...candidates[0], id: 'another-real-row' },
    ];

    expect(selectIdentifiedAccidentalTemplate(candidatesWithDuplicate, {
      sourceFileName: identifiedSourceFileName,
    })).toEqual(['real-test-row', 'another-real-row']);
  });

  it('no muta candidates ni options al seleccionar', () => {
    const input = [
      ...candidates,
      { ...candidates[0] },
    ];
    const inputSnapshot = input.map((candidate) => ({ ...candidate }));
    const options = { sourceFileName: identifiedSourceFileName };
    const optionsSnapshot = { ...options };

    expect(selectIdentifiedAccidentalTemplate(input, options)).toEqual(['real-test-row']);
    expect(input).toEqual(inputSnapshot);
    expect(options).toEqual(optionsSnapshot);
  });
});
