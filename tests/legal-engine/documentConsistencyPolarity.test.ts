/**
 * Lote 4 — control de contradicciones por polaridad (P1-9). Datos sintéticos, sin proveedores.
 */
import { describe, expect, it } from 'vitest';
import { validateDocumentConsistency } from '@/lib/legal-engine/documentConsistency';

const block = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  id, text, factIds: [], legalIssueIds: [], generatedBy: 'AI', layer: 'DRAFT', sectionId: `sec-${id}`, ...extra,
});
const assemblyOf = (blocks: unknown[]) => ({ orderedBlocks: blocks }) as any;

describe('polaridad de hechos del mismo tema', () => {
  it('«existió contrato» frente a «nunca existió contrato» produce un conflicto', () => {
    const findings = validateDocumentConsistency({
      assembly: assemblyOf([
        block('b1', 'Existió un contrato de arrendamiento entre las partes desde enero.'),
        block('b2', 'Nunca existió contrato alguno entre las partes.'),
      ]),
    });
    expect(findings.map((finding) => finding.code)).toContain('EVENT_POLARITY_CONFLICT');
  });

  it('dos afirmaciones del mismo signo no producen conflicto', () => {
    const findings = validateDocumentConsistency({
      assembly: assemblyOf([
        block('b1', 'Existió un contrato de arrendamiento entre las partes.'),
        block('b2', 'El contrato de arrendamiento fue celebrado por ambas partes.'),
      ]),
    });
    expect(findings.map((finding) => finding.code)).not.toContain('EVENT_POLARITY_CONFLICT');
  });

  it('pago y notificación se comparan por polaridad: «no se pagó» frente a «se pagó»', () => {
    const findings = validateDocumentConsistency({
      assembly: assemblyOf([
        block('b1', 'La renta del mes de marzo se pagó en su totalidad.'),
        block('b2', 'La renta del mes de marzo no se pagó en ningún momento.'),
      ]),
    });
    expect(findings.map((finding) => finding.code)).toContain('EVENT_POLARITY_CONFLICT');
  });
});

describe('fecha ausente en la fuente', () => {
  it('un bloque con fecha no autorizada por el expediente queda bloqueado', () => {
    const findings = validateDocumentConsistency({
      assembly: assemblyOf([block('b1', 'El contrato se firmó el 3 de mayo de 2019.', { factIds: ['fact-1'] })]),
      richCaseAnalysis: { facts: [{ id: 'fact-1', proposition: 'Se firmó un contrato.' }], conflicts: [] } as any,
    });
    expect(findings.some((finding) => finding.code === 'NEW_FACT_DURING_ASSEMBLY' && finding.severity === 'BLOCKER')).toBe(true);
  });
});
