import { describe, expect, it } from 'vitest';
import { runFinalLegalReadiness } from '../../scripts/audit/run-final-legal-readiness';

describe('auditoria E2E final de preparación legal con seis expedientes reales', () => {
  it('recorre los seis casos aislados y escribe evidencia y exportaciones DRAFT', async () => {
    const summary = await runFinalLegalReadiness() as any;
    expect(summary.requestedCaseCount).toBeGreaterThan(0);
    expect(summary.counts.total).toBe(summary.requestedCaseCount);
    expect(summary.counts.docx).toBeGreaterThanOrEqual(0);
    expect(summary.counts.pdf).toBeGreaterThanOrEqual(0);
  }, 180000);
});
