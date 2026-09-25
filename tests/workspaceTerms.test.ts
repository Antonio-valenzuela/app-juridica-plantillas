import { describe, expect, it } from 'vitest';
import { calculateWorkspaceTerm, workspaceTermStorageKey } from '@/lib/workspace/terms';

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

  it('separa el último cálculo por expediente sin afirmar persistencia jurídica en servidor', () => {
    expect(workspaceTermStorageKey('draft-123')).toBe('workspace-term:last:draft-123');
    expect(workspaceTermStorageKey()).toBe('workspace-term:last:unassigned');
  });

  it('mantiene cálculos independientes por expediente y recupera el de A al volver', () => {
    const storage = new Map<string, string>();
    const calculateFor = (caseId: string, startDate: string) => {
      const input = { startDate, days: 2, mode: 'CALENDAR' as const, includeStart: false, excludedDates: [] };
      const record = { input, result: calculateWorkspaceTerm(input), calculatedAt: '2026-09-24T20:00:00.000Z', caseId };
      storage.set(workspaceTermStorageKey(caseId), JSON.stringify(record));
    };

    calculateFor('case-a', '2026-09-10');
    calculateFor('case-b', '2026-10-10');

    expect(JSON.parse(storage.get(workspaceTermStorageKey('case-a'))!).result.calculatedDate).toBe('2026-09-12');
    expect(JSON.parse(storage.get(workspaceTermStorageKey('case-b'))!).result.calculatedDate).toBe('2026-10-12');
    expect(JSON.parse(storage.get(workspaceTermStorageKey('case-a'))!).caseId).toBe('case-a');
  });

  it('rechaza fecha inicial vacía, fechas inválidas y días no válidos', () => {
    const base = { mode: 'CALENDAR' as const, includeStart: false, excludedDates: [] };
    expect(() => calculateWorkspaceTerm({ ...base, startDate: '', days: 1 })).toThrow('YYYY-MM-DD');
    expect(() => calculateWorkspaceTerm({ ...base, startDate: '2026-02-30', days: 1 })).toThrow('no es válida');
    expect(() => calculateWorkspaceTerm({ ...base, startDate: '2026-09-24', days: 0 })).toThrow('mayor que cero');
  });

  it('mantiene la advertencia de cálculo orientativo', () => {
    const result = calculateWorkspaceTerm({
      startDate: '2026-09-24',
      days: 1,
      mode: 'CALENDAR',
      includeStart: false,
      excludedDates: [],
    });
    expect(result.provisional).toBe(true);
    expect(result.assumptions.join(' ')).toContain('requiere verificación del calendario oficial');
  });
});
