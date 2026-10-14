import { describe, expect, it } from 'vitest';
import { extractMaterialLegalCitations } from '@/lib/legal-engine/materialLegalCitations';
import { markUnverifiedAuthorityReferences } from '@/lib/legal-engine/authorityReferenceAudit';

describe('«constitucional» no es una cita de la Constitución', () => {
  it('el adjetivo no se detecta ni se parte con el marcador', () => {
    const text = 'INTERÉS EXCEPCIONAL EN MATERIA CONSTITUCIONAL: la cuestión constitucional y el bloque de constitucionalidad.';
    expect(extractMaterialLegalCitations(text)).toHaveLength(0);
    const marked = markUnverifiedAuthorityReferences({ text, blockId: 'b', authorityUses: [], verifiedAuthorities: [] });
    expect(marked.text).toBe(text);
  });

  it('la Constitución sí se sigue detectando y marcando (el gate no se relaja)', () => {
    const text = 'Conforme al artículo 14 de la Constitución Política de los Estados Unidos Mexicanos, nadie puede ser privado.';
    expect(extractMaterialLegalCitations(text).length).toBeGreaterThan(0);
    const marked = markUnverifiedAuthorityReferences({ text, blockId: 'b', authorityUses: [], verifiedAuthorities: [] });
    expect(marked.text).toMatch(/\[NO VERIFICADO: [^\]]*Constituci[oó]n/);
    expect(marked.text).not.toMatch(/\]al\b/);
  });
});
