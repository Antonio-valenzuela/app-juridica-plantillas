import { describe, expect, it } from 'vitest';
import { redactAppealReplayText } from '@/scripts/audit/appealReplayRedaction';

describe('appeal real replay redaction', () => {
  it('redacts confirmed party names despite a one-character OCR error', () => {
    const result = redactAppealReplayText(
      'Se absuelve a Person0 Alfa Ochoa y se agrega la constancia.',
      ['Persona Alfa Ochoa'],
    );
    expect(result).not.toMatch(/Person0|Persona Alfa Ochoa/i);
    expect(result).toContain('[PARTE]');
  });

  it.each([
    'Se absuelve a Persona Sintetica Uno.',
    'Se condena a Persona Sintetica Dos por el concepto indicado.',
    'Documento otorgado por Persona Sintetica Tres ante fedatario.',
  ])('redacts 2–4 capitalized words after identifying legal phrases', text => {
    const result = redactAppealReplayText(text, []);
    expect(result).not.toMatch(/Persona Sintetica (?:Uno|Dos|Tres)/);
    expect(result).toContain('[PERSONA]');
  });
});
