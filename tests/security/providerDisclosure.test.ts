import { afterEach, describe, expect, it } from 'vitest';
import { getProviderDisclosure } from '@/lib/ai/providerDisclosure';

const keys = ['AI_PROVIDER_CHAIN', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'NVIDIA_API_KEY'];

afterEach(() => {
  for (const key of keys) delete (process.env as any)[key];
});

describe('AI provider operational disclosure', () => {
  it('expone proveedor externo activo sin revelar secretos', () => {
    (process.env as any).AI_PROVIDER_CHAIN = 'gemini,local';
    (process.env as any).GEMINI_API_KEY = 'secret-test-key';

    const disclosure = getProviderDisclosure();

    expect(disclosure.externalTransfer).toBe(true);
    expect(disclosure.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'Gemini', mode: 'EXTERNAL', configured: true, active: true }),
      expect.objectContaining({ provider: 'local', mode: 'LOCAL', configured: true, active: true }),
    ]));
    expect(JSON.stringify(disclosure)).not.toContain('secret-test-key');
  });

  it('no afirma transferencia externa cuando solo existe fallback local', () => {
    (process.env as any).AI_PROVIDER_CHAIN = 'local';

    const disclosure = getProviderDisclosure();

    expect(disclosure.externalTransfer).toBe(false);
    expect(disclosure.providers).toEqual([
      expect.objectContaining({ provider: 'local', mode: 'LOCAL', configured: true, active: true }),
    ]);
  });
});
