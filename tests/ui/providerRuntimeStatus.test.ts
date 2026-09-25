import { describe, expect, it } from 'vitest';
import { deriveProviderIndicator } from '@/lib/runtime/providerStatus';

describe('indicador de cadena de providers', () => {
  it('no marca error si hay un provider remoto disponible aunque NVIDIA no lo esté', () => {
    expect(deriveProviderIndicator({ ok: true, providers: [{ id: 'gemini', available: true }, { id: 'nvidia', available: false }, { id: 'local', available: true }] })).toEqual({ tone: 'success', label: 'Cadena IA disponible' });
  });

  it('distingue fallback local de indisponibilidad total', () => {
    expect(deriveProviderIndicator({ ok: false, providers: [{ id: 'gemini', available: false }, { id: 'local', available: true }] })).toEqual({ tone: 'warning', label: 'Modo local disponible' });
    expect(deriveProviderIndicator({ ok: false, providers: [] })).toEqual({ tone: 'danger', label: 'Generación no disponible' });
  });
});
