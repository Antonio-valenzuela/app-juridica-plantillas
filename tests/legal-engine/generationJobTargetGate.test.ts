import { describe, expect, it } from 'vitest';
import { completeJob, createGenerationJob, getGenerationJob } from '@/lib/legal-engine/generationJobs';

// Un trabajo cuyo documento no alcanzó la meta, o cuyo timeout dejó un checkpoint parcial, nunca queda como
// «generado y listo para revisión final», aunque la lectura de preparación sea READY.
function syntheticDoc(pageTargetResult?: Record<string, unknown>) {
  return {
    id: `doc-${Math.random().toString(36).slice(2, 8)}`,
    status: 'draft',
    sections: [{ id: 's1', title: 'Sección sintética', content: [{ id: 'b1', text: 'Texto sintético.' }] }],
    generationMetadata: pageTargetResult ? { pageTargetResult } : {},
    documentAssemblyResult: { readiness: 'READY' },
    validation: { warnings: [], errors: [] },
  } as any;
}

const owner = { organizationId: 'test', userId: 'test', lawyerId: 'test' } as any;

describe('estado terminal de trabajos con meta de extensión', () => {
  it('meta alcanzada y preparación READY: completado y listo', () => {
    const job = createGenerationJob({ ...owner, fingerprint: 'meta-ok', total: 1 });
    completeJob(job.jobId, syntheticDoc({ outcome: 'MET' }));
    const done = getGenerationJob(job.jobId)!;
    expect(done.terminalStatus).toBe('COMPLETED');
    expect(done.stage).toBe('Documento generado y listo para revisión final');
  });

  it('BELOW_TARGET: nunca completado ni anunciado como listo', () => {
    const job = createGenerationJob({ ...owner, fingerprint: 'meta-baja', total: 1 });
    completeJob(job.jobId, syntheticDoc({ outcome: 'BELOW_TARGET', stopReason: 'CONTENT_LIMIT_REACHED' }));
    const done = getGenerationJob(job.jobId)!;
    expect(done.terminalStatus).toBe('NEEDS_REVIEW');
    expect(done.stage).not.toBe('Documento generado y listo para revisión final');
  });

  it('timeout (BELOW_TARGET/TIMEOUT): nunca completado ni anunciado como listo', () => {
    const job = createGenerationJob({ ...owner, fingerprint: 'timeout', total: 1 });
    completeJob(job.jobId, syntheticDoc({ outcome: 'BELOW_TARGET', failureCause: 'TIMEOUT', stopReason: 'TIMEOUT' }));
    const done = getGenerationJob(job.jobId)!;
    expect(done.terminalStatus).toBe('NEEDS_REVIEW');
    expect(done.stage).not.toBe('Documento generado y listo para revisión final');
  });

  it('fallo de medición: nunca completado', () => {
    const job = createGenerationJob({ ...owner, fingerprint: 'medicion', total: 1 });
    completeJob(job.jobId, syntheticDoc({ outcome: 'BELOW_TARGET', failureCause: 'MEASUREMENT_FAILED' }));
    expect(getGenerationJob(job.jobId)!.terminalStatus).toBe('NEEDS_REVIEW');
  });
});
