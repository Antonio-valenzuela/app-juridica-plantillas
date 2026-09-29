import { describe, it, expect } from 'vitest';
import {
  evaluateAuthorityProposition,
  validateTextAuthorityPropositions,
  correctMisappliedLaborAuthorities,
} from '@/lib/legal-engine/authorityPropositionGate';

describe('Authority-Proposition Validation Gate (Blocker 1: RED -> FIX -> GREEN)', () => {
  it('FAILS when artículo 39-A LFT is cited for fixed-term expiration or natural termination', () => {
    const result = evaluateAuthorityProposition({
      authorityCitation: 'artículo 39-A de la Ley Federal del Trabajo',
      proposition: 'terminación natural de la relación laboral por vencimiento de contrato determinado',
    });

    expect(result.status).toBe('FAIL');
    expect(result.reasons).toContain('MISAPPLIED_AUTHORITY:ART_39_A_REGULATES_PROBATION_NOT_EXPIRATION');
    expect(result.corrections.correctAuthorities).toContain('artículo 53 fracción III LFT');
    expect(result.corrections.correctAuthorities).toContain('artículos 35, 37 y 39 LFT');
  });

  it('FAILS when artículo 39-A LFT is cited to claim that it regulates contratos por tiempo determinado', () => {
    const result = evaluateAuthorityProposition({
      authorityCitation: 'artículo 39-A LFT',
      proposition: 'regula específicamente el contrato por tiempo determinado y la llegada del término',
    });

    expect(result.status).toBe('FAIL');
    expect(result.reasons).toContain('MISAPPLIED_AUTHORITY:ART_39_A_REGULATES_PROBATION_NOT_EXPIRATION');
  });

  it('PASSES when artículo 53 fracción III and 35-39 LFT are cited conditionally for term expiration', () => {
    const result = evaluateAuthorityProposition({
      authorityCitation: 'artículo 53 fracción III LFT',
      proposition: 'terminación de la relación laboral por vencimiento del término fijado',
      argumentContext: 'De acreditarse la validez de la estipulación del término conforme al artículo 37 de la LFT, y en el supuesto de no subsistir la materia del trabajo al tenor del artículo 39 de la Ley Federal del Trabajo...',
      applicableRegime: 'APARTADO_A',
    });

    expect(result.status).toBe('PASS');
    expect(result.reasons).toHaveLength(0);
  });

  it('detects misapplied 39-A authority in generated prose blocks', () => {
    const badProse = `
      La Ley Federal del Trabajo, en su artículo 39, establece que el contrato de trabajo puede ser por tiempo determinado.
      El artículo 39-A de la misma ley, que regula específicamente el contrato por tiempo determinado, señala que este debe constar por escrito.
      Si la actora afirma que su contratación fue por tiempo determinado, entonces la relación laboral se extinguió legítimamente por la llegada del término pactado.
    `;

    const validation = validateTextAuthorityPropositions(badProse, { matter: 'laboral' });
    expect(validation.isValid).toBe(false);
    expect(validation.violations).toContain('MISAPPLIED_AUTHORITY:ART_39_A_FOR_TIEMPO_DETERMINADO');
  });

  it('passes and validates compliant prose with correct articles and conditional argumentation', () => {
    const compliantProse = `
      Con fundamento en los artículos 35, 37 y 53 fracción III de la Ley Federal del Trabajo, y de manera cautelar,
      de acreditarse la validez del término pactado y que no subsiste la materia del trabajo conforme al artículo 39 de la Ley Federal del Trabajo,
      operaría la terminación natural del vínculo laboral por vencimiento del término pactado.
    `;

    const validation = validateTextAuthorityPropositions(compliantProse, { matter: 'laboral' });
    expect(validation.isValid).toBe(true);
    expect(validation.violations).toHaveLength(0);
  });

  it('corrects misapplied 39-A text to proper LFT articles 35, 37, 39, 53 frac. III and conditional phrasing', () => {
    const badProse = `El artículo 39-A de la misma ley, que regula específicamente el contrato por tiempo determinado, señala que la relación concluye al término pactado.`;
    const corrected = correctMisappliedLaborAuthorities(badProse);

    expect(corrected).not.toContain('artículo 39-A');
    expect(corrected).toContain('53 fracción III');
    expect(corrected).toContain('39');
  });
});
