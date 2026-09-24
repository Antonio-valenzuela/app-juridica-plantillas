import { afterEach, describe, expect, it } from 'vitest';
import { extractIp, checkRateLimit } from '@/lib/security/rateLimit';

describe('trusted proxy y rate limit single-node', () => {
  afterEach(() => {
    delete (process.env as any).TRUST_PROXY;
  });

  it('ignora x-forwarded-for arbitrario cuando TRUST_PROXY no está habilitado', () => {
    const request = new Request('http://localhost/api/test', {
      headers: { 'x-forwarded-for': '198.51.100.10' },
    });

    expect(extractIp(request)).toBe('direct-client');
  });

  it('usa el primer hop solo con política explícita de proxy confiable', () => {
    (process.env as any).TRUST_PROXY = 'true';
    const request = new Request('http://localhost/api/test', {
      headers: { 'x-forwarded-for': '198.51.100.10, 10.0.0.4' },
    });

    expect(extractIp(request)).toBe('198.51.100.10');
  });

  it('aplica un límite single-node honesto y devuelve retry metadata', () => {
    const key = `rate-test-${Date.now()}-${Math.random()}`;
    expect(checkRateLimit(key, 2).ok).toBe(true);
    expect(checkRateLimit(key, 2).ok).toBe(true);
    const limited = checkRateLimit(key, 2);
    expect(limited.ok).toBe(false);
    expect(limited.headers['Retry-After']).toBeTruthy();
  });
});
