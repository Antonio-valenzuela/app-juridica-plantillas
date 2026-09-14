import { describe, expect, it } from 'vitest';
import { formatExportIssues } from '@/lib/legal-engine/exportErrors';

describe('Errores de exportación', () => {
  it('convierte ValidationIssue estructurados en mensajes legibles', () => {
    expect(formatExportIssues([
      { checkId: 'missing_petition', message: 'Falta la sección de petitorios.' },
      { checkId: 'pending', message: 'Hay datos pendientes.' },
    ])).toBe('Falta la sección de petitorios. | Hay datos pendientes.');
  });

  it('nunca presenta [object Object] como explicación al abogado', () => {
    expect(formatExportIssues({ checkId: 'quality', message: 'Resolver observaciones jurídicas.' }))
      .toBe('Resolver observaciones jurídicas.');
    expect(formatExportIssues(undefined)).toBe('');
  });
});
