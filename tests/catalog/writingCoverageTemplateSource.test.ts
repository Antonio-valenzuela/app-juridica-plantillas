import { describe, expect, it } from 'vitest';
import { CANONICAL_DOCUMENT_TYPES } from '@/lib/catalog/legalCatalog';
import { DocumentTemplates, familyDerivedTemplateFor, familyDerivedTemplateIds } from '@/lib/legal-engine/documentTemplates';
import { buildWritingCoverageMatrix } from '@/scripts/audit/build-writing-coverage.mjs';
import { resolveTemplateProvenance, TEMPLATE_SOURCE } from '@/scripts/audit/templateProvenance.mjs';

/**
 * La auditoría de cobertura debe usar el resolver real de plantillas: un tipo sin plantilla directa pero con
 * plantilla derivada por el motor de familias NO es un tipo «sin plantilla». Estas pruebas no cambian estados
 * (`IMPLEMENTED`, `PASS`, `humanReview`) ni selectores: solo comprueban cómo se clasifica la procedencia.
 */
describe('procedencia de la plantilla (resolveTemplateProvenance)', () => {
  const directId = Object.keys(DocumentTemplates)[0];
  const derivedId = familyDerivedTemplateIds().find((id) => !DocumentTemplates[id])!;

  it('clasifica una plantilla declarada como DIRECT', () => {
    const result = resolveTemplateProvenance(directId);
    expect(result.source).toBe(TEMPLATE_SOURCE.DIRECT);
    expect(result.template).toBe(DocumentTemplates[directId]);
  });

  it('clasifica una plantilla registrada por el motor de familias como FAMILY_DERIVED', () => {
    expect(derivedId).toBeTruthy();
    const result = resolveTemplateProvenance(derivedId);
    expect(result.source).toBe(TEMPLATE_SOURCE.FAMILY_DERIVED);
    expect(result.template).toBe(familyDerivedTemplateFor(derivedId));
    expect(result.template?.tipo).toBe(derivedId);
  });

  it('un id desconocido, vacío o que solo resuelve a la plantilla de OTRO tipo es NONE', () => {
    for (const id of ['tipo_que_no_existe_xyz', '', '   ', 'recurso_apelacion_civil']) {
      const result = resolveTemplateProvenance(id);
      expect(result.source, id).toBe(TEMPLATE_SOURCE.NONE);
      expect(result.template, id).toBeUndefined();
    }
  });
});

describe('matriz de cobertura: plantillas directas y derivadas por familia', () => {
  const matrix = buildWritingCoverageMatrix();
  const rowsById = new Map(matrix.rows.map((row) => [row.id, row]));
  const implemented = CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.status === 'IMPLEMENTED' && entry.implemented);

  it('cada tipo IMPLEMENTED con plantilla resoluble aparece con templateExists y su procedencia', () => {
    const problems: string[] = [];
    for (const entry of implemented) {
      const row = rowsById.get(entry.id)!;
      const expected = DocumentTemplates[entry.id] ? TEMPLATE_SOURCE.DIRECT : familyDerivedTemplateFor(entry.id) ? TEMPLATE_SOURCE.FAMILY_DERIVED : TEMPLATE_SOURCE.NONE;
      if (row.templateSource !== expected) problems.push(`${entry.id}: templateSource=${row.templateSource}, esperado ${expected}`);
      if (expected !== TEMPLATE_SOURCE.NONE && !row.templateExists) problems.push(`${entry.id}: templateExists=false pero la plantilla resuelve (${expected})`);
      if (row.builtInTemplateId !== entry.id && expected !== TEMPLATE_SOURCE.NONE) problems.push(`${entry.id}: builtInTemplateId=${row.builtInTemplateId}`);
    }
    expect(problems).toEqual([]);
  });

  it('un tipo derivado por familia no se reporta como «no existe DocumentTemplate»', () => {
    const derivedImplemented = implemented.filter((entry) => !DocumentTemplates[entry.id] && familyDerivedTemplateFor(entry.id));
    expect(derivedImplemented.length).toBeGreaterThan(0);
    for (const entry of derivedImplemented) {
      const row = rowsById.get(entry.id)!;
      expect(row.templateSource, entry.id).toBe(TEMPLATE_SOURCE.FAMILY_DERIVED);
      expect(row.statusReason, entry.id).not.toMatch(/no existe DocumentTemplate/i);
    }
  });

  // Aserción independiente: sigue detectando un IMPLEMENTED sin ninguna plantilla realmente resoluble.
  it('ningún tipo IMPLEMENTED queda sin plantilla resoluble en la matriz', () => {
    const missing = implemented.filter((entry) => rowsById.get(entry.id)!.templateSource === TEMPLATE_SOURCE.NONE).map((entry) => entry.id);
    expect(missing).toEqual([]);
  });

  it('el resumen cuenta las filas por procedencia', () => {
    const counts = matrix.summary.templateSourceCounts as Record<string, number>;
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(matrix.rows.length);
    expect(counts[TEMPLATE_SOURCE.FAMILY_DERIVED]).toBe(matrix.rows.filter((row) => row.templateSource === TEMPLATE_SOURCE.FAMILY_DERIVED).length);
    // `documentTemplateCount` sigue siendo el número de plantillas DIRECTAS declaradas.
    expect(matrix.summary.documentTemplateCount).toBe(Object.keys(DocumentTemplates).length);
  });

  it('la procedencia no cambia estados ni selección: los no generables siguen en FAIL y sin selección', () => {
    const notGenerable = CANONICAL_DOCUMENT_TYPES.filter((entry) => !(entry.status === 'IMPLEMENTED' && entry.implemented));
    expect(notGenerable.length).toBeGreaterThan(0);
    for (const entry of notGenerable) {
      const row = rowsById.get(entry.id)!;
      expect(row.status, entry.id).toBe('FAIL');
      expect(row.selectable, entry.id).toBe(false);
      expect(row.humanReview, entry.id).toBe('PENDING');
    }
  });
});
