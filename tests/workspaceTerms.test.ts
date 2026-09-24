import { describe, expect, it } from 'vitest';
import { calculateWorkspaceTerm } from '@/lib/workspace/terms';

describe('workspace term calculation', () => {
  it('supports calendar days and explicit inclusion of the start date', () => {
    const result = calculateWorkspaceTerm({
      startDate: '2026-09-10',
      days: 3,
      mode: 'CALENDAR',
      includeStart: true,
      excludedDates: [],
      jurisdiction: 'federal',
    });

    expect(result.calculatedDate).toBe('2026-09-12');
    expect(result.provisional).toBe(true);
  });

  it('skips weekends and configured excluded dates in business mode', () => {
    const result = calculateWorkspaceTerm({
      startDate: '2026-09-10',
      days: 2,
      mode: 'BUSINESS',
      includeStart: false,
      excludedDates: ['2026-09-11'],
      jurisdiction: 'federal',
    });

    expect(result.calculatedDate).toBe('2026-09-15');
    expect(result.assumptions).toContain('Fechas excluidas configuradas: 2026-09-11');
    expect(result.assumptions).toContain('Jurisdicción indicada: federal');
  });
});
