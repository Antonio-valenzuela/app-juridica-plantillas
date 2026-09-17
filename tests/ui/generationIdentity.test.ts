import { describe, expect, it } from 'vitest';
import { createGenerationIdentityFactory } from '@/lib/legal-engine/generationIdentity';

describe('stable generation identity', () => {
  it('preserves the logical generation identity across a render and rerender', () => {
    const factory = createGenerationIdentityFactory('render-test');
    const firstRender = { generationId: factory.next() };
    const rerender = firstRender;

    expect(rerender.generationId).toBe(firstRender.generationId);
  });

  it('allocates distinct identities for distinct generations and instances', () => {
    const firstInstance = createGenerationIdentityFactory('render-test');
    const secondInstance = createGenerationIdentityFactory('render-test');

    const firstGeneration = firstInstance.next();
    const secondGeneration = firstInstance.next();
    const otherInstanceGeneration = secondInstance.next();

    expect(secondGeneration).not.toBe(firstGeneration);
    expect(otherInstanceGeneration).not.toBe(firstGeneration);
    expect(otherInstanceGeneration).not.toBe(secondGeneration);
  });
});
