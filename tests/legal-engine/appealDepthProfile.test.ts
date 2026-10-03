import { describe, expect, it } from 'vitest';
import { buildDraftingPlan } from '@/lib/legal-engine/pipeline';
import { resolveDraftDepthProfile } from '@/lib/legal-engine/draftDepth';
import { CANONICAL_APPEAL_CIVIL_TEST_SECTIONS } from '../fixtures/appealCivilSections';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

function appealDocument(): UniversalLegalDocument {
  const doc = createEmptyDocument({
    id: 'depth-appeal', documentType: 'apelacion_civil', documentTypeLabel: 'recurso de apelación civil',
    matter: 'civil', jurisdiction: 'local civil', flow: 'DOCUMENT_ANALYSIS',
  });
  doc.caseRefs = { ...doc.caseRefs, expediente: '1152/2013' };
  doc.sections = CANONICAL_APPEAL_CIVIL_TEST_SECTIONS.map((section, index) => ({
    id: section.id,
    type: section.type,
    title: section.title,
    order: index + 1,
    isRepeatable: false,
    content: [],
  } as any)) as UniversalLegalDocument['sections'];
  return doc;
}

function plan(depth: 'PROFESSIONAL_20' | 'EXTENSIVE_40') {
  const doc = appealDocument();
  const result = buildDraftingPlan(doc, 0, undefined, undefined, undefined, resolveDraftDepthProfile(depth).draftDepth);
  const typeByTitle = new Map(CANONICAL_APPEAL_CIVIL_TEST_SECTIONS.map(section => [section.title, section.type]));
  return {
    raw: result,
    sections: result.sections.map(section => ({ ...section, type: typeByTitle.get(section.title) || 'custom' })),
  };
}

const totalParagraphs = (result: ReturnType<typeof plan>) =>
  result.sections.reduce((sum, section) => sum + (section.expectedParagraphs || 0), 0);

const byTitle = (result: ReturnType<typeof plan>, title: string) =>
  result.sections.find(section => section.title === title)!;

describe('la profundidad Extensa cambia materialmente el plan del recurso', () => {
  it('Extensa desarrolla más secciones que Profesional', () => {
    expect(totalParagraphs(plan('EXTENSIVE_40'))).toBeGreaterThan(totalParagraphs(plan('PROFESSIONAL_20')));
  });

  it('Extensa alcanza mayor profundidad declarada en las secciones sustantivas', () => {
    const profesional = plan('PROFESSIONAL_20');
    const extensa = plan('EXTENSIVE_40');
    const sustantivas = ['argument', 'background', 'legal_grounds', 'custom'];
    for (const section of extensa.sections.filter(candidate => sustantivas.includes(candidate.type))) {
      const baseline = profesional.sections.find(candidate => candidate.title === section.title);
      expect(section.expectedParagraphs).toBeGreaterThanOrEqual(baseline!.expectedParagraphs);
    }
    expect(byTitle(extensa, 'AGRAVIOS').expectedDepth).toBe('EXTENSIVE');
  });

  it('las secciones sustantivas propias del recurso (OBJETO, CONSIDERACIONES, EFECTOS) también se profundizan', () => {
    const profesional = plan('PROFESSIONAL_20');
    const extensa = plan('EXTENSIVE_40');
    for (const title of ['OBJETO: INTERPOSICIÓN DEL RECURSO', 'CONSIDERACIONES COMBATIDAS', 'EFECTOS SOLICITADOS A LA ALZADA']) {
      expect(byTitle(extensa, title).expectedParagraphs).toBeGreaterThan(byTitle(profesional, title).expectedParagraphs);
      expect(byTitle(extensa, title).expectedDepth).not.toBe('SHORT');
    }
  });

  it('las secciones formales siguen siendo cortas en ambas profundidades', () => {
    for (const depth of ['PROFESSIONAL_20', 'EXTENSIVE_40'] as const) {
      for (const section of plan(depth).sections) {
        if (['header', 'closing', 'signature'].includes(section.type)) expect(section.expectedDepth).toBe('SHORT');
      }
    }
  });

  it('Extensa no se alcanza por relleno: cada sección profundiza según su función', () => {
    const extensa = plan('EXTENSIVE_40');
    const argumental = byTitle(extensa, 'AGRAVIOS');
    const formal = byTitle(extensa, 'RUBRO / AUTORIDAD');
    expect(argumental.expectedParagraphs).toBeGreaterThan(formal.expectedParagraphs);
    expect(byTitle(extensa, 'FIRMA').expectedParagraphs).toBeLessThan(argumental.expectedParagraphs);
  });
});