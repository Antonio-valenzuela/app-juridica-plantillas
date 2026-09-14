import { describe, expect, it } from 'vitest';
import { resolveLegalRegime } from '@/lib/legal-engine/legal-research/regimeResolution';

const fixedClock = () => new Date('2026-01-01T00:00:00.000Z');

describe('legal regime resolution', () => {
  it('resolves an explicit federal Mexican regime with separate codes and labels', async () => {
    const result = await resolveLegalRegime({
      taxonomy: { matter: 'civil', jurisdiction: 'federal', documentType: 'contestacion_demanda', procedure: 'ordinario' },
      legalContext: { country: 'MX', matter: 'civil', scope: 'FEDERAL', procedure: 'ordinario' },
    }, fixedClock);

    expect(result.status).toBe('RESOLVED');
    expect(result.country).toEqual({ code: 'MX', displayName: expect.any(String) });
    expect(result.scope).toBe('FEDERAL');
    expect(result.matter?.code).toBe('civil');
    expect(result.procedure?.code).toBe('ordinario');
  });

  it('requires a federative entity for STATE and LOCAL', async () => {
    const result = await resolveLegalRegime({
      legalContext: { country: 'MX', scope: 'STATE', matter: 'civil', procedure: 'ordinario' },
    }, fixedClock);

    expect(result.status).toBe('LEGAL_REGIME_UNRESOLVED');
    expect(result.unresolvedFields).toContain('federativeEntity');
  });

  it('does not treat a technical federal default as resolved law', async () => {
    const result = await resolveLegalRegime({
      technicalDocumentDefaults: { jurisdiction: 'federal' },
    }, fixedClock);

    expect(result.status).toBe('LEGAL_REGIME_UNRESOLVED');
    expect(result.unresolvedFields).toEqual(expect.arrayContaining(['country', 'matter']));
  });

  it('preserves relevant date and precision without inventing a day', async () => {
    const result = await resolveLegalRegime({
      legalContext: { country: 'MX', scope: 'FEDERAL', matter: 'civil', relevantDate: '2024', temporalPrecision: 'YEAR' },
    }, fixedClock);

    expect(result.relevantDate).toBe('2024');
    expect(result.temporalPrecision).toBe('YEAR');
    expect(result.relevantDate).not.toContain('-');
  });

  it('keeps a state code and display name separate', async () => {
    const result = await resolveLegalRegime({
      legalContext: {
        country: { code: 'MX', displayName: 'México' },
        scope: 'STATE',
        federativeEntity: { code: 'MX-JAL', displayName: 'Jalisco' },
        matter: { code: 'civil', displayName: 'Civil' },
        procedure: { code: 'ordinario', displayName: 'Juicio ordinario' },
      },
    }, fixedClock);

    expect(result.status).toBe('RESOLVED');
    expect(result.federativeEntity).toEqual({ code: 'MX-JAL', displayName: 'Jalisco' });
  });
});
