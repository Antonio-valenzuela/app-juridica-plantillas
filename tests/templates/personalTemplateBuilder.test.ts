import { describe, expect, it } from 'vitest';
import {
  analyzePersonalTemplateText,
  renderPersonalTemplateText,
} from '@/lib/templates/personalTemplateBuilder';

const sourceText = `DEMANDA FAMILIAR
JUZGADO FAMILIAR DE PRIMERA INSTANCIA
ACTOR: PERSONA_CANARIO_78491
DEMANDADO: PARTE_DEMANDADA_CANARIO
EXPEDIENTE: EXP-CANARIO-9988
DOMICILIO: DOMICILIO_CANARIO_X
FECHA: 18 de agosto de 2026

HECHOS
La menor requiere medidas provisionales y protección judicial.

FUNDAMENTO Y DERECHO
Por lo anteriormente expuesto, se solicita la tutela judicial efectiva.

PRUEBAS
Documental pública.

PETITORIOS
PRIMERO. Tenerme por presentado.
`;

describe('personal template analysis', () => {
  it('detects structure and removes case-specific canaries into semantic variables', () => {
    const result = analyzePersonalTemplateText(sourceText, { sourceFileName: 'machote-canario.txt' });

    expect(result.parameterizedText).not.toContain('PERSONA_CANARIO_78491');
    expect(result.parameterizedText).not.toContain('EXP-CANARIO-9988');
    expect(result.parameterizedText).not.toContain('DOMICILIO_CANARIO_X');
    expect(result.parameterizedText).toContain('{{actor}}');
    expect(result.parameterizedText).toContain('{{demandado}}');
    expect(result.parameterizedText).toContain('{{expediente}}');
    expect(result.parameterizedText).toContain('{{domicilio}}');
    expect(result.parameterizedText).toContain('{{fecha}}');
    expect(result.parameterizedText).toContain('JUZGADO {{juzgado}}');
    expect(result.variables.map((variable) => variable.id)).toEqual(
      expect.arrayContaining(['actor', 'demandado', 'expediente', 'juzgado', 'domicilio', 'fecha'])
    );
    expect(result.sections.map((section) => section.title)).toEqual(
      expect.arrayContaining(['HECHOS', 'FUNDAMENTO Y DERECHO', 'PRUEBAS', 'PETITORIOS'])
    );
    expect(result.removedData.map((item) => item.variableId)).toEqual(
      expect.arrayContaining(['actor', 'expediente', 'domicilio'])
    );
    expect(result.structureJson.templateOrigin).toBe('user');
    expect(result.styleHints.recurringFormulas).toContain('Por lo anteriormente expuesto');
  });

  it('renders a new case without leaking the original values and marks missing values', () => {
    const result = analyzePersonalTemplateText(sourceText);
    const rendered = renderPersonalTemplateText(result.parameterizedText, {
      actor: 'NUEVA PERSONA',
      demandado: 'NUEVA CONTRAPARTE',
      expediente: 'NUEVO-123/2026',
      domicilio: 'DOMICILIO NUEVO',
      fecha: '29 de agosto de 2026',
    });

    expect(rendered).toContain('NUEVA PERSONA');
    expect(rendered).toContain('NUEVO-123/2026');
    expect(rendered).not.toContain('PERSONA_CANARIO_78491');
    expect(rendered).not.toContain('EXP-CANARIO-9988');
    expect(renderPersonalTemplateText('{{actor}} / {{juzgado}}', { actor: 'A' })).toBe(
      'A / [DATO PENDIENTE: Juzgado / Tribunal]'
    );
  });

  it('normalizes generic name placeholders to semantic fields', () => {
    const result = analyzePersonalTemplateText('ACTOR: {{nombre1}}\nEXPEDIENTE: {{expediente}}');

    expect(result.parameterizedText).toContain('ACTOR: {{actor}}');
    expect(result.parameterizedText).toContain('EXPEDIENTE: {{expediente}}');
    expect(result.parameterizedText).not.toContain('nombre1');
  });
});
