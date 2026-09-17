/**
 * Client-side identity allocator for generation requests.
 *
 * The factory is created once per component instance (via a lazy state
 * initializer) and then reused by event handlers. Render/rerender therefore
 * cannot change the identity of an in-flight logical generation, while each
 * new generation receives a distinct idempotency key.
 */

export interface GenerationIdentityFactory {
  next(): string;
}

export function createGenerationIdentityFactory(scope = 'generation'): GenerationIdentityFactory {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid !== 'function') {
    throw new Error('CRYPTO_RANDOM_UUID_UNAVAILABLE');
  }
  const instanceId = `${scope}-${randomUuid.call(globalThis.crypto)}`;
  let generationSequence = 0;

  return {
    next() {
      generationSequence += 1;
      return `${instanceId}-${generationSequence}`;
    },
  };
}
