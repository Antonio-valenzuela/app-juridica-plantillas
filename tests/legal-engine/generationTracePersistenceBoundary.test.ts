import { describe, expect, it } from 'vitest';
import { createGenerationTraceContext, stripTransientAuditTrace } from '@/lib/legal-engine/generationTrace';
import { createEmptyDocument } from '@/lib/legal-engine/types';

describe('generation trace persistence boundary', () => {
  it('removes transient auditTrace before draft persistence', () => {
    const doc = createEmptyDocument({ id: 'doc-persist' });
    const context = createGenerationTraceContext({ doc, options: { enabled: true } });
    doc.generationMetadata.auditTrace = context.close();
    const persisted = stripTransientAuditTrace(doc);
    expect(persisted.generationMetadata.auditTrace).toBeUndefined();
    expect(doc.generationMetadata.auditTrace).toBeDefined();
  });
});
