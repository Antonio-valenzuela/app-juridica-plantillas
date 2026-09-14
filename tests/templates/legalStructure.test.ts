import { describe, expect, it } from 'vitest';
import { PROFESSIONAL_TEMPLATES } from '@/lib/templates/templateDefinitions';

const section = (templateId: string, sectionId: string) => {
  const template = PROFESSIONAL_TEMPLATES.find((item) => item.id === templateId);
  return template?.sections.find((item) => item.id === sectionId);
};

describe('estructura jurídica de plantillas activas', () => {
  it('amparo captura fecha de conocimiento y derechos violados', () => {
    expect(section('amparo-indirecto', 'fecha_conocimiento')).toMatchObject({
      type: 'text',
      required: true,
    });
    expect(section('amparo-indirecto', 'derechos_violados')).toMatchObject({
      type: 'textarea',
      required: true,
    });
  });

  it('civil y alimentos separan competencia, relación, capacidad y necesidades', () => {
    expect(section('demanda-ordinaria-civil', 'via_competencia')).toMatchObject({ type: 'textarea' });
    for (const id of ['relacion_acreedores', 'capacidad_economica', 'necesidades_especificas']) {
      expect(section('demanda-alimentos', id)).toMatchObject({ type: 'textarea' });
    }
  });

  it('ejecutiva y revocación capturan sus datos de procedencia', () => {
    for (const id of ['titulo_credito', 'fecha_titulo', 'monto_titulo', 'firmantes_titulo', 'via_procedencia']) {
      expect(section('ejecutiva-mercantil', id)).toBeDefined();
    }
    for (const id of ['numero_resolucion', 'fecha_resolucion', 'autoridad_emisora']) {
      expect(section('revocacion-fiscal', id)).toBeDefined();
    }
  });
});
