import { describe, expect, it } from 'vitest';
import { validateGeneratedText } from '@/lib/legal-engine/generatedOutputValidator';

const codes = (text: string) => validateGeneratedText(text).map((finding) => finding.code);

describe('«todo» en español no es un marcador de desarrollo', () => {
  it('no marca la prosa jurídica ordinaria', () => {
    expect(codes('LA PRESUNCIONAL LEGAL Y HUMANA, en su doble aspecto, en todo lo que favorezca a la pretensión deducida.')).not.toContain('IRRELEVANT_PLACEHOLDER');
    expect(codes('Se ofrece TODO LO ACTUADO en el expediente.')).not.toContain('IRRELEVANT_PLACEHOLDER');
  });

  it('sigue detectando marcadores de desarrollo y placeholders técnicos', () => {
    for (const text of ['TODO: completar agravios', 'Pendiente // TODO revisar', 'FIXME', 'El monto es undefined', 'Valor: {{actor}}', '[object Object]']) {
      expect(codes(text), text).toContain('IRRELEVANT_PLACEHOLDER');
    }
  });
});
