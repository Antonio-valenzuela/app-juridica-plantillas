/**
 * Lote 1 (anexo): la regla atribuida a una cita no verificada sale del cuerpo y se devuelve para el anexo
 * de revisión. El cuerpo conserva solo el marcador breve. Datos sintéticos.
 */
import { describe, expect, it } from 'vitest';
import { markUnverifiedAuthorityReferences } from '@/lib/legal-engine/authorityReferenceAudit';

const text = 'La tesis 1a.4, emitida por un Tribunal Colegiado, establece que los jueces de distrito pueden resolver la causa.';

describe('regla atribuida a cita no verificada', () => {
  const result = markUnverifiedAuthorityReferences({ text, blockId: 'blk-1', authorityUses: [], verifiedAuthorities: [] });

  it('el cuerpo no conserva la regla atribuida', () => {
    expect(result.text).not.toContain('pueden resolver la causa');
    expect(result.text).not.toContain('establece que');
  });

  it('el cuerpo conserva la cita marcada y el marcador breve de pendiente', () => {
    expect(result.text).toContain('[NO VERIFICADO: tesis 1a.4');
    expect(result.text).toContain('PENDIENTE DE DESARROLLO');
  });

  it('la regla queda disponible para el anexo de revisión, asociada a su cita', () => {
    expect(result.movedRules).toHaveLength(1);
    expect(result.movedRules[0]!.citation).toContain('tesis 1a.4');
    expect(result.movedRules[0]!.rule).toContain('pueden resolver la causa');
  });
});
