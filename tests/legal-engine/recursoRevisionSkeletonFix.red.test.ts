/**
 * RED TEST — BUG #1: Skeleton del recurso_revision_amparo_directo
 *
 * Demuestra que getRevisionAmparoDirectoSectionText NO puede resolver
 * los títulos reales de recurso_revision_amparo_directo:
 *   - INTERÉS EXCEPCIONAL
 *   - BLOQUE DE CONSTITUCIONALIDAD
 *
 * porque el skeleton interno usa títulos distintos y el fuzzy matcher
 * no los contempla.
 *
 * Este test DEBE fallar ANTES del fix y PASAR después.
 */
import { describe, it, expect } from 'vitest';
import { getRevisionAmparoDirectoSectionText } from '../../lib/legal-engine/contestacionStructure';
import { createEmptyDocument } from '../../lib/legal-engine/types';

function mkRecursoDoc() {
  return createEmptyDocument({
    id: 'doc-recurso-test',
    title: 'Recurso de revisión en amparo directo',
    documentType: 'recurso_revision_amparo_directo',
    documentTypeLabel: 'Recurso de revisión en amparo directo',
    matter: 'Amparo',
    sections: [],
  } as any);
}

describe('BUG #1 RED — getRevisionAmparoDirectoSectionText skeleton mismatch', () => {
  it('INTERÉS EXCEPCIONAL NO debe regresar el placeholder genérico [DATO PENDIENTE DE EXPEDIENTE]', () => {
    const doc = mkRecursoDoc();
    const text = getRevisionAmparoDirectoSectionText(doc, 'INTERÉS EXCEPCIONAL', undefined);
    // El bug: regresa "[DATO PENDIENTE DE EXPEDIENTE: Contenido de INTERÉS EXCEPCIONAL]"
    // porque no hay match en el skeleton de contestacion_revision_extraordinaria
    expect(text).not.toMatch(/^\[DATO PENDIENTE DE EXPEDIENTE: Contenido de/);
    // Debe tener al menos estructura mínima de la sección
    expect(text.length).toBeGreaterThan(50);
  });

  it('BLOQUE DE CONSTITUCIONALIDAD NO debe regresar placeholder genérico', () => {
    const doc = mkRecursoDoc();
    const text = getRevisionAmparoDirectoSectionText(doc, 'BLOQUE DE CONSTITUCIONALIDAD', undefined);
    expect(text).not.toMatch(/^\[DATO PENDIENTE DE EXPEDIENTE: Contenido de/);
    expect(text.length).toBeGreaterThan(50);
  });

  it('SENTENCIA RECURRIDA debe resolver vía fuzzy match', () => {
    const doc = mkRecursoDoc();
    const text = getRevisionAmparoDirectoSectionText(doc, 'SENTENCIA RECURRIDA', undefined);
    expect(text).not.toMatch(/^\[DATO PENDIENTE DE EXPEDIENTE: Contenido de/);
    expect(text.length).toBeGreaterThan(20);
  });

  it('AGRAVIOS debe resolver a la sección de agravios del skeleton', () => {
    const doc = mkRecursoDoc();
    const text = getRevisionAmparoDirectoSectionText(doc, 'AGRAVIOS', undefined);
    expect(text).not.toMatch(/^\[DATO PENDIENTE DE EXPEDIENTE: Contenido de/);
    expect(text.length).toBeGreaterThan(20);
  });
});
