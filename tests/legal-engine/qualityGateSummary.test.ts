import { describe, expect, it } from 'vitest';
import { buildQualityGateSummary } from '../../lib/legal-engine/qualityGateSummary';

describe('resumen de incidencias del quality gate', () => {
  it('agrupa cien incidencias repetidas y conserva detalles únicos expandibles', () => {
    const result = buildQualityGateSummary({
      criticalErrors: [],
      warnings: Array.from({ length: 100 }, (_, index) => ({
        checkId: `pending_data_hechos_${index}`,
        sectionId: 'contestacion_hechos',
        message: '[REQUIERE DEFINIR POSTURA DEL ABOGADO]',
      })),
      suggestions: [],
    });

    expect(result.totalIssueCount).toBe(100);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      label: 'Hechos',
      count: 100,
      uniqueDetails: ['[REQUIERE DEFINIR POSTURA DEL ABOGADO]'],
    });
  });
});
