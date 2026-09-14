import { describe, expect, it } from 'vitest';
import {
  GENERATION_STATUS_MAX_FAILURES,
  parseGenerationStatusResponse,
} from '@/lib/legal-engine/generationPolling';
import { resolveGenerationTotal } from '@/lib/legal-engine/generationProgress';

describe('Polling de generación', () => {
  it('convierte un 500 no-JSON en un error visible después de un límite', () => {
    const first = parseGenerationStatusResponse(500, 'Internal Server Error', 0);
    expect(first.kind).toBe('retry');
    expect(first.consecutiveFailures).toBe(1);

    const terminal = parseGenerationStatusResponse(
      500,
      'Internal Server Error',
      GENERATION_STATUS_MAX_FAILURES - 1
    );
    expect(terminal.kind).toBe('terminal-error');
    if (terminal.kind === 'terminal-error') {
      expect(terminal.message).toContain('consultar el progreso');
    }
  });

  it('acepta el estado JSON real y reinicia el contador de errores', () => {
    const result = parseGenerationStatusResponse(
      200,
      JSON.stringify({ ok: true, jobId: 'job-1', status: 'processing', total: 9, completed: 4 }),
      2
    );

    expect(result).toEqual({
      kind: 'success',
      data: { ok: true, jobId: 'job-1', status: 'processing', total: 9, completed: 4 },
      consecutiveFailures: 0,
    });
  });

  it('conserva el fallo de una sección como estado terminal legible', () => {
    const result = parseGenerationStatusResponse(
      200,
      JSON.stringify({ ok: true, jobId: 'job-1', status: 'failed', error: 'Falló la sección Hechos' }),
      0
    );

    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.data.status).toBe('failed');
      expect(result.data.error).toBe('Falló la sección Hechos');
    }
  });

  it('usa las secciones del documento como total visible, no los bloques auxiliares', () => {
    expect(resolveGenerationTotal({ sections: Array.from({ length: 9 }, () => ({})), blockPlan: { totalBlocks: 2 } })).toBe(9);
  });
});
