/**
 * Lote 6 — clase por proposición (audit D.3). Asignación determinista desde los motivos de admisión y
 * resumen del editor. Datos sintéticos; sin proveedores.
 */
import { describe, expect, it } from 'vitest';
import { classifyPropositionReasons, summarizePropositionClasses } from '@/lib/legal-engine/generatedLegalAdmission';

describe('clase por proposición (D.3)', () => {
  it('una cita o plazo sin verificar es UNVERIFIED_CITATION (bloquea FINAL)', () => {
    expect(classifyPropositionReasons(['UNVERIFIED_PRECEDENT_ASSERTION'])).toBe('UNVERIFIED_CITATION');
    expect(classifyPropositionReasons(['UNVERIFIED_DEADLINE'])).toBe('UNVERIFIED_CITATION');
    expect(classifyPropositionReasons(['UNVERIFIED_LEGAL_ASSERTION'])).toBe('UNVERIFIED_CITATION');
  });

  it('un hecho, prueba o petición sin respaldo es UNSUPPORTED_OR_CONTRADICTORY (se rechaza el bloque)', () => {
    expect(classifyPropositionReasons(['UNCONFIRMED_EVIDENCE'])).toBe('UNSUPPORTED_OR_CONTRADICTORY');
    expect(classifyPropositionReasons(['UNSUPPORTED_PETITION'])).toBe('UNSUPPORTED_OR_CONTRADICTORY');
    expect(classifyPropositionReasons(['ABSOLUTE_EVIDENCE_VALUATION'])).toBe('UNSUPPORTED_OR_CONTRADICTORY');
  });

  it('sin motivos de remediación la proposición es razonamiento admisible', () => {
    expect(classifyPropositionReasons([])).toBe('LEGAL_REASONING');
  });

  it('el peor motivo gobierna: una cita sin verificar con petición no autorizada es UNSUPPORTED_OR_CONTRADICTORY', () => {
    expect(classifyPropositionReasons(['UNVERIFIED_PRECEDENT_ASSERTION', 'UNSUPPORTED_PETITION'])).toBe('UNSUPPORTED_OR_CONTRADICTORY');
  });
});

describe('resumen del editor', () => {
  it('cuenta citas sin verificar y datos pendientes, y nombra los modelos usados', () => {
    const summary = summarizePropositionClasses(
      ['UNVERIFIED_CITATION', 'UNVERIFIED_CITATION', 'PENDING_CONFIRMATION', 'LEGAL_REASONING'],
      ['groq'],
    );
    expect(summary).toBe('2 citas sin verificar, 1 datos pendientes, modelos usados: groq');
  });
});
