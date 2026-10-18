import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '@/lib/legal-engine/types';

describe('createEmptyDocument — identidad del documento', () => {
  it('respeta el id solicitado por el llamador (UI, jobs y fixtures)', () => {
    expect(createEmptyDocument({ id: 'doc-programado-1' }).id).toBe('doc-programado-1');
  });

  it('genera un id único cuando no se solicita', () => {
    const first = createEmptyDocument().id;
    const second = createEmptyDocument().id;
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });
});
