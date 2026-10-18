import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { buildContestacionSkeleton } from '@/lib/legal-engine/contestacionStructure';

describe('Legacy response seeds require confirmed support', () => {
  it('does not certify accredited personality, an evidence offer or timely filing without data', () => {
    const doc = createEmptyDocument({ documentType: 'contestacion_demanda_laboral', matter: 'Laboral' });
    const sections = buildContestacionSkeleton(doc);
    const evidence = sections.filter(s => s.type === 'evidence').flatMap(s => s.content.map(b => b.text)).join('\n');
    expect(evidence).toContain('[REQUIERE DEFINIR PRUEBAS A OFRECER]');
    expect(evidence).not.toMatch(/Se formaliza|término procesal legal oportuno/);
  });
  it('does not claim accredited personality without confirmed support', () => {
    const doc = createEmptyDocument({ documentType: 'contestacion_demanda_laboral', matter: 'Laboral' });
    const identity = buildContestacionSkeleton(doc).filter(s => s.type === 'identity').flatMap(s => s.content.map(b => b.text)).join('\n');
    expect(identity).not.toMatch(/debidamente acreditada en autos/);
    expect(identity).toMatch(/PENDIENTE|CONFIRMAR/);
  });
});
