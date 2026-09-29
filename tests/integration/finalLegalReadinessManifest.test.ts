import { describe, expect, it } from 'vitest';
import { validateFinalLegalReadinessManifest } from '@/lib/audit/finalLegalReadinessManifest';

describe('final legal readiness manifest', () => {
  it('requires six unique isolated source cases with hashes', () => {
    const result = validateFinalLegalReadinessManifest({
      cases: Array.from({ length: 5 }, (_, index) => ({
        caseNumber: String(index + 1).padStart(2, '0'),
        sourceRelativePath: `Datos/case-${index + 1}.docx`,
        sourceSha256: `hash-${index + 1}`,
        sourceBytes: 1000,
      })),
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Se requieren exactamente 6 casos de auditoría.');
  });

  it('rejects production paths and duplicate sources', () => {
    const result = validateFinalLegalReadinessManifest({
      cases: Array.from({ length: 6 }, (_, index) => ({
        caseNumber: '01',
        sourceRelativePath: index === 0 ? 'data/uploads/production.docx' : 'Datos/case.docx',
        sourceSha256: index === 0 ? 'same' : 'same',
        sourceBytes: 1000,
      })),
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Los números de caso deben ser únicos.',
      'Las fuentes deben ser únicas por ruta y hash.',
      'Una fuente no puede estar dentro del almacenamiento productivo.',
    ]));
  });
});
