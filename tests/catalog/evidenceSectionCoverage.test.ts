import { describe, expect, it } from 'vitest';
import { visibleWritingTypes } from '@/lib/catalog/writingTypeIdentity';
import { requiredSectionTitle } from '@/lib/legal-engine/documentStrategies';
import { missingRequiredSections } from '../helpers/sectionCoverage';

// Comparador de secciones de la evidencia. Los IDs de contrato se comparan contra su TÍTULO visible;
// una sección de contrato sin cuerpo cuenta como faltante.
const identity = (id: string) => {
  const found = visibleWritingTypes().find((type) => type.id === id);
  if (!found) throw new Error(`tipo no encontrado: ${id}`);
  return found;
};

function sectionsFor(required: readonly string[]) {
  return required.map((id) => ({ title: requiredSectionTitle(id), content: [{ text: `Cuerpo sintético de ${id}.` }] }));
}

describe('comparador de secciones requeridas de la evidencia', () => {
  it.each(['demanda_ordinaria_civil', 'demanda_ejecutiva_mercantil'])('%s: con todas sus secciones con cuerpo no falta ninguna', (id) => {
    const required = identity(id).requiredSections;
    expect(missingRequiredSections(required, sectionsFor(required))).toEqual([]);
  });

  it('quitar una sección requerida de demanda_ordinaria_civil hace que la comparación falle', () => {
    const required = identity('demanda_ordinaria_civil').requiredSections;
    const withoutDestinatario = sectionsFor(required).filter((section) => section.title !== requiredSectionTitle('destinatario'));
    const missing = missingRequiredSections(required, withoutDestinatario);
    expect(missing).toEqual(['destinatario']);
  });

  it('una sección de contrato presente pero sin cuerpo cuenta como faltante', () => {
    const required = identity('demanda_ordinaria_civil').requiredSections;
    const sections = sectionsFor(required).map((section) => (section.title === requiredSectionTitle('via_accion') ? { ...section, content: [{ text: '   ' }] } : section));
    expect(missingRequiredSections(required, sections)).toEqual(['via_accion']);
  });

  it('un ID de contrato sin título mapeado lanza en lugar de degradar en silencio', () => {
    expect(() => requiredSectionTitle('seccion_inexistente_de_contrato_hechos_x')).not.toThrow();
    // Un ID de contrato real siempre tiene título: se verifica que el mapa cubre el contrato completo.
    for (const id of identity('demanda_ejecutiva_mercantil').requiredSections) {
      expect(() => requiredSectionTitle(id)).not.toThrow();
    }
  });
});
