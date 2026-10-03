import { describe, expect, it } from 'vitest';
import { evaluateGeneratedLegalAdmission } from '@/lib/legal-engine/generatedLegalAdmission';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { hasSeedMarkers } from '@/lib/legal-engine/seedMarkers';

const document = () => createEmptyDocument({ id: 'offline', documentType: 'apelacion_civil', documentTypeLabel: 'Apelación civil', matter: 'civil', jurisdiction: 'local', flow: 'DOCUMENT_ANALYSIS' });
describe('candidate admission requires support for the actual proposition', () => {
  it('marks a rejected candidate with an existing unresolved seed so it cannot become substantive Coverage', () => {
    const result = evaluateGeneratedLegalAdmission({ text: 'La prueba demuestra de forma indubitable la continuidad.', sectionType: 'argument', document: document() });
    expect(result.accepted).toBe(false);
    expect(hasSeedMarkers(result.pendingText)).toBe(true);
  });
  const proposition = 'La carga de la prueba corresponde a la actora.';
  const authority = {
    id: 'official-test-only', verificationStatus: 'VERIFIED',
    source: { sourceTier: 'OFFICIAL_PRIMARY', sourceUrl: 'https://official.example.test/rule', sourceHash: 'fixture-hash', locator: 'fixture-span' },
    temporalValidity: { status: 'CURRENT_AND_APPLICABLE' }, jurisdictionValidity: { status: 'APPLICABLE' },
    proposition: { supportLevel: 'DIRECT', text: proposition }, supportsLegalIssueIds: ['issue-1'],
  };
  it('admits an exact proof proposition supported by an issue-linked officially verified fixture authority', () => {
    const result = evaluateGeneratedLegalAdmission({ text: proposition, sectionType: 'argument', document: document(),
      analysis: { evidence: [], verifiedAuthorities: [authority] } as any, legalIssueIds: ['issue-1'] } as any);
    expect(result.accepted).toBe(true);
  });
  it('does not use an unrelated verified authority to support a different proof proposition', () => {
    const result = evaluateGeneratedLegalAdmission({ text: proposition, sectionType: 'argument', document: document(),
      analysis: { evidence: [], verifiedAuthorities: [{ ...authority, supportsLegalIssueIds: ['other-issue'] }] } as any, legalIssueIds: ['issue-1'] } as any);
    expect(result.reasons).toContain('UNSUPPORTED_PROOF_RULE');
  });
  it('preserves a genuine requested appeal effect', () => {
    const doc = document();
    doc.generationMetadata.requestContract = { requests: [{ text: 'Revocar la resolución recurrida.' }] } as any;
    const result = evaluateGeneratedLegalAdmission({ text: 'Se solicita revocar la resolución recurrida.', sectionType: 'petition', document: doc });
    expect(result.accepted).toBe(true);
  });
  it('does not read a prohibition as confirmation of costs', () => {
    const doc = document();
    doc.generationMetadata.requestContract = { requests: [{ text: 'No pedir costas.' }] } as any;
    const result = evaluateGeneratedLegalAdmission({ text: 'Se solicita condenar al pago de costas.', sectionType: 'petition', document: doc });
    expect(result.accepted).toBe(false);
  });
  it('does not invent revocation without a confirmed requested effect', () => {
    const result = evaluateGeneratedLegalAdmission({ text: 'Se solicita revocar la resolución recurrida.', sectionType: 'petition', document: document() });
    expect(result.reasons).toContain('UNSUPPORTED_PETITION');
  });
  it('rejects a costs petition embedded in an argument, not only in PETITORIOS', () => {
    const result = evaluateGeneratedLegalAdmission({ text: 'En mérito a lo expuesto, se solicita al Tribunal que se condene a la parte actora al pago de costas.', sectionType: 'argument', document: document() });
    expect(result.reasons).toContain('UNSUPPORTED_PETITION');
  });
  it('does not treat the opposing party offer as the client offer', () => {
    const result = evaluateGeneratedLegalAdmission({ text: 'Se ofrece testimonial de ANA.', sectionType: 'evidence', document: document(), analysis: {
      evidence: [], richCaseAnalysis: { evidenceOffers: [{ id: 'opponent', evidenceMentionId: 'e1', status: 'PARTY_OFFERED' }], evidenceMentions: [{ id: 'e1', description: 'testimonial de ANA' }] },
    } as any });
    expect(result.reasons).toContain('UNCONFIRMED_EVIDENCE');
  });
});
