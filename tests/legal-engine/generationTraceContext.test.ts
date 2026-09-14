import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import {
  createGenerationTraceContext,
  hashTraceText,
  sanitizeTraceValue,
  stripTransientAuditTrace,
} from '@/lib/legal-engine/generationTrace';

describe('GenerationTraceContext', () => {
  it('creates one stable generationId and ISO timestamps', () => {
    const ctx = createGenerationTraceContext({
      doc: createEmptyDocument({ id: 'trace-test-doc' }),
      options: { enabled: true },
    });

    expect(ctx.generationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ctx.trace.startedAt).toMatch(/Z$/);

    const closed = ctx.close();
    expect(closed.completedAt).toMatch(/Z$/);
    expect(ctx.close().generationId).toBe(ctx.generationId);
  });

  it('honors an explicit generationId', () => {
    const ctx = createGenerationTraceContext({
      generationId: 'generation-explicit-001',
      doc: createEmptyDocument(),
      options: { enabled: true },
    });

    expect(ctx.generationId).toBe('generation-explicit-001');
    expect(ctx.trace.generationId).toBe('generation-explicit-001');
  });

  it('redacts secret values while preserving legal structure', () => {
    const safe = sanitizeTraceValue({
      parties: { actor: 'Parte Sintética' },
      NVIDIA_API_KEY: 'nvapi-secret',
      authorization: 'Bearer token',
      nested: { password: 'pw-secret', fact: 'Hecho documentado' },
    });

    expect(safe).toMatchObject({
      parties: { actor: 'Parte Sintética' },
      nested: { fact: 'Hecho documentado' },
    });
    expect(JSON.stringify(safe)).not.toMatch(/nvapi-secret|Bearer token|pw-secret/i);
  });

  it('hashes text deterministically and strips only transient auditTrace', () => {
    const trace = createGenerationTraceContext({
      doc: createEmptyDocument(),
      options: { enabled: true },
    }).close();
    const original = createEmptyDocument({
      generationMetadata: { ...createEmptyDocument().generationMetadata, auditTrace: trace },
    });

    expect(hashTraceText('texto')).toBe(hashTraceText('texto'));
    const persisted = stripTransientAuditTrace(original);
    expect(persisted.generationMetadata.auditTrace).toBeUndefined();
    expect(original.generationMetadata.auditTrace).toBeDefined();
  });
});
