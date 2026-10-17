/**
 * Lote 5 (P1-5, P2-1): número de expediente. Solo el rótulo o el encabezado fijan el expediente; un
 * «amparo directo N/AAAA» del cuerpo es una cita y el fallback N/AAAA baja la confianza. Datos sintéticos.
 */
import { describe, expect, it } from 'vitest';
import { detectCaseFicha } from '@/lib/legal-engine/caseFichaDetection';

describe('expediente de la ficha', () => {
  it('en una contestación, el rótulo gana y un «amparo directo» del cuerpo no se toma', () => {
    const text = 'CONTESTACIÓN DE DEMANDA\nExpediente: 123/2026\nEn el juicio de amparo directo 3296/2004 la Suprema Corte resolvió un punto ajeno.';
    expect(detectCaseFicha([text]).expediente).toBe('123/2026');
  });

  it('un «amparo directo N/AAAA» citado en el cuerpo no se convierte en expediente', () => {
    const text = 'CONTESTACIÓN DE DEMANDA\nEl criterio del amparo directo 3296/2004 no es aplicable a este caso.';
    expect(detectCaseFicha([text]).expediente).not.toBe('3296/2004');
  });

  it('un número obtenido solo por el fallback N/AAAA tiene menor confianza que con rótulo', () => {
    const withLabel = detectCaseFicha(['ESCRITO DE PRUEBAS\nExpediente: 77/2024\nSe ofrecen pruebas.']);
    const fallbackOnly = detectCaseFicha(['ESCRITO DE PRUEBAS\nSe ofrecen pruebas en el asunto 77/2024.']);
    expect(withLabel.expediente).toBe('77/2024');
    expect(fallbackOnly.expediente).toBe('77/2024');
    expect(fallbackOnly.confianza).toBeLessThan(withLabel.confianza);
  });
});
