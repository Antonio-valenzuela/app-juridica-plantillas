import { describe, expect, it } from 'vitest';
import { normalizeUnresolvedFieldMarkers } from '@/lib/legal-engine/pendingFields';
import { hasUnresolvedFactualDependencies, extractUnresolvedFactualDependencies } from '@/lib/legal-engine/seedMarkers';

describe('V5 pending normalization preserves unresolved dependency detection', () => {
  it.each(['[DATO PENDIENTE DE EXPEDIENTE: fecha de notificación]',
    'DATO NO LOCALIZADO EN LOS DOCUMENTOS PROPORCIONADOS: fecha de notificación',
    'DATO PENDIENTE DE VERIFICACIÓN: fecha de notificación'])('does not lose %s after normalization', marker => {
    const normalized = normalizeUnresolvedFieldMarkers(marker);
    expect(hasUnresolvedFactualDependencies(normalized)).toBe(true);
    expect(extractUnresolvedFactualDependencies(normalized)).toContain(normalized);
  });
  it('does not classify an ordinary documented date as a pending marker', () => {
    expect(hasUnresolvedFactualDependencies('La constancia identifica el 2 de octubre de 2026.')).toBe(false);
  });
});
