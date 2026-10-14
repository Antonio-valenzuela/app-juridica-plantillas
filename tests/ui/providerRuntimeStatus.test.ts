import { describe, expect, it } from 'vitest';
import { deriveProviderIndicator } from '@/lib/runtime/providerStatus';

// Contrato cambiado (2026-10-13, a petición del titular): «Cadena IA disponible» afirmaba disponibilidad cuando
// solo se sabe que hay una clave configurada. El indicador distingue configuración de consentimiento y resultado.
describe('indicador de proveedores en la nube', () => {
  it('dice «configurada», nombra los proveedores de la cadena y no promete disponibilidad ni autorización', () => {
    const indicator = deriveProviderIndicator({ ok: true, chain: ['groq', 'nvidia', 'local'], providers: [{ id: 'gemini', available: true }, { id: 'groq', available: true }, { id: 'nvidia', available: false }, { id: 'local', available: true }] });
    expect(indicator).toMatchObject({ tone: 'success', label: 'IA en la nube configurada' });
    expect(indicator.detail).toContain('Groq');
    expect(indicator.detail).not.toContain('Gemini'); // configurado, pero fuera de la cadena vigente
    expect(indicator.detail).toMatch(/sin tu autorización/);
    expect(indicator.label).not.toMatch(/disponible/i);
  });

  it('un proveedor con clave pero fuera de la cadena no cuenta como configurado', () => {
    expect(deriveProviderIndicator({ ok: true, chain: ['nvidia', 'local'], providers: [{ id: 'gemini', available: true }, { id: 'nvidia', available: false }, { id: 'local', available: true }] }).label).toBe('Solo redacción local');
  });

  it('distingue redacción local de indisponibilidad total', () => {
    expect(deriveProviderIndicator({ ok: false, providers: [{ id: 'gemini', available: false }, { id: 'local', available: true }] })).toMatchObject({ tone: 'warning', label: 'Solo redacción local' });
    expect(deriveProviderIndicator({ ok: false, providers: [] })).toMatchObject({ tone: 'danger', label: 'Generación no disponible' });
  });
});
