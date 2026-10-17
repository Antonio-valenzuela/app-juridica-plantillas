import { describe, expect, it } from 'vitest';
import { parsePageTarget, pageTargetFailureResult, DEFAULT_PAGE_TARGET } from '@/lib/legal-engine/pageTarget';
import { pageTargetRequestField } from '@/lib/legal-engine/pageTargetRequest';

describe('propagación de la meta de páginas a la solicitud', () => {
  it('serializa la meta 40 en el campo común que reciben todos los flujos', () => {
    const body = JSON.parse(JSON.stringify({ userInstruction: 'x', ...pageTargetRequestField({ preset: 'EXTENSO', pages: 40 }) }));
    expect(body.pageTarget).toEqual({ preset: 'EXTENSO', pages: 40 });
  });

  it('el servidor recibe y conserva el objetivo tal cual (round-trip del payload)', () => {
    const sent = JSON.parse(JSON.stringify(pageTargetRequestField({ preset: 'EXTENSO', pages: 40 })));
    expect(parsePageTarget(sent.pageTarget)).toEqual({ preset: 'EXTENSO', pages: 40 });
  });

  it('sin meta no añade el campo, para no alterar el comportamiento por defecto', () => {
    expect(pageTargetRequestField(undefined)).toEqual({});
    expect(pageTargetRequestField(null)).toEqual({});
  });

  it('usa como valor por defecto la meta DETALLADO de 20 páginas', () => {
    expect(pageTargetRequestField(DEFAULT_PAGE_TARGET).pageTarget?.pages).toBe(20);
  });

  it('no debilita la validación: valores inválidos siguen rechazándose en el servidor', () => {
    expect(() => parsePageTarget('abc')).toThrow();
    expect(() => parsePageTarget({ pages: 1 })).toThrow();
    expect(() => parsePageTarget({ pages: 61 })).toThrow();
  });
});

describe('resultado honesto de timeout y fallo de medición', () => {
  it('timeout: BELOW_TARGET con causa TIMEOUT, nunca cumplido', () => {
    const result = pageTargetFailureResult({ preset: 'EXTENSO', pages: 40 }, 'TIMEOUT');
    expect(result.outcome).toBe('BELOW_TARGET');
    expect(result.failureCause).toBe('TIMEOUT');
    expect(result.stopReason).toBe('TIMEOUT');
    expect(result.notice).toContain('Motivo');
  });

  it('fallo de medición: BELOW_TARGET con causa MEASUREMENT_FAILED', () => {
    const result = pageTargetFailureResult({ preset: 'DETALLADO', pages: 20 }, 'MEASUREMENT_FAILED');
    expect(result.outcome).toBe('BELOW_TARGET');
    expect(result.failureCause).toBe('MEASUREMENT_FAILED');
    expect(result.actualPages).toBe(0);
  });
});

import { getGenerationJobDeadlineMs } from '@/lib/legal-engine/generationDeadline';
import { pageTargetToGenerationExtension } from '@/lib/legal-engine/pageTarget';

describe('plazo derivado de la meta validada en el servidor', () => {
  it('una meta extensa produce modo extended-legal y plazo de 25 minutos, aunque el cliente envíe modo estándar', () => {
    const serverContract = pageTargetToGenerationExtension({ preset: 'EXTENSO', pages: 40 });
    expect(serverContract.generationMode).toBe('extended-legal');
    expect(getGenerationJobDeadlineMs(serverContract)).toBe(25 * 60 * 1000);
    expect(getGenerationJobDeadlineMs({ generationMode: 'standard' })).toBe(15 * 60 * 1000);
  });
});
