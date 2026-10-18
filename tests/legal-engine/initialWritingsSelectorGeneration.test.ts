import { describe, expect, it } from 'vitest';
import { canGenerateDocumentDraft, getCatalogDocument, getInitialWritingDocumentOptions } from '@/lib/catalog/legalCatalog';
import { DOCUMENT_TYPES } from '@/lib/legal-taxonomy';
import { getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { analyzeWritingRequest } from '@/lib/legal-engine/writingIntake';

/**
 * Coherencia selector ↔ generación de Escritos Iniciales: todo tipo que el selector ofrece debe poder generarse
 * (contrato válido, plantilla resoluble) y la instrucción que arma el formulario con su etiqueta debe reconocerse
 * como el tipo elegido. Una etiqueta cruda («demanda_ordinaria_civil») no se reconoce como demanda y bloquea la
 * generación con «Faltan datos esenciales: tipo de escrito».
 */
const FORM_LABEL = (value: string) => DOCUMENT_TYPES.find((d) => d.value === value)?.label || getCatalogDocument(value)?.label || value;
const GENERIC = new Set(['demanda', 'escrito_libre', 'escrito_cumplimiento_sentencia', 'otro']);

describe('Escritos Iniciales: lo que ofrece el selector se puede generar', () => {
  const options = getInitialWritingDocumentOptions({ includeUncertifiedDrafts: true });
  const demands = options.filter((option) => option.value.startsWith('demanda_'));

  it('el selector ofrece las demandas canónicas y cada una es generable y tiene plantilla resoluble', () => {
    expect(demands.length).toBeGreaterThanOrEqual(30);
    for (const option of demands) {
      expect(canGenerateDocumentDraft(option.value, true), option.value).toBe(true);
      expect(getDocumentTemplate(option.value), option.value).toBeTruthy();
    }
  });

  it('con la etiqueta del catálogo, la instrucción del formulario se reconoce como demanda y no queda bloqueada', () => {
    for (const option of demands) {
      const label = FORM_LABEL(option.value);
      expect(label, option.value).not.toMatch(/_/);
      const intake = analyzeWritingRequest(`Redactar ${label}. Materia: Civil. Objetivo y pretensiones: El cumplimiento de la obligación sintética.`);
      expect(intake.documentType, option.value).toBe('demanda');
      expect(intake.readiness.missingEssential, option.value).not.toContain('tipo de escrito');
    }
  });

  it('el identificador crudo no sirve como etiqueta (documenta por qué se usa la etiqueta del catálogo)', () => {
    const intake = analyzeWritingRequest('Redactar demanda_ordinaria_civil. Materia: Civil. Objetivo y pretensiones: El pago sintético.');
    expect(intake.readiness.missingEssential).toContain('tipo de escrito');
  });

  it('los tipos genéricos del selector no dependen de la etiqueta cruda', () => {
    for (const option of options.filter((item) => GENERIC.has(item.value))) expect(FORM_LABEL(option.value), option.value).not.toMatch(/_/);
  });
});
