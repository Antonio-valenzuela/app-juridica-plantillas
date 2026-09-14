import { describe, expect, it } from 'vitest';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { validateForExport } from '@/lib/legal-engine/exportGuards';
import {
  materializePreparedFinalDocument,
} from '@/lib/legal-engine/finalDocumentMaterialization';
import { verifyCompatibilityMaterialization } from '@/lib/legal-engine/finalDocumentMaterializationGate';

function makeCompatibilityDocument(documentType = 'escrito_libre') {
  const document = createEmptyDocument({
    id: `task7-compat-${documentType}`,
    title: 'Documento compatible sintético',
    documentType,
    documentTypeLabel: 'Documento compatible sintético',
    sections: [
      createDocumentNode({
        id: 'compatible-body',
        title: 'CUERPO',
        type: 'facts',
        content: [{
          id: 'compatible-block',
          layer: 'USER_POSITION',
          trustLevel: 'VERIFIED',
          text: 'Posición expresa del usuario, pendiente de revisión profesional.',
        }],
      }),
      createDocumentNode({
        id: 'compatible-petition',
        title: 'PETITORIOS',
        type: 'petition',
        content: [{ id: 'compatible-petition-block', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: 'PRIMERO. Lo solicitado.' }],
      }),
    ],
    generationMetadata: {
      ...createEmptyDocument().generationMetadata,
      preflight: { status: 'READY', missingFields: [] },
      ...(documentType === 'demanda_ordinaria_civil' ? {
        sourceOutputCompatibility: {
          selectedDocumentType: 'demanda_ordinaria_civil',
          sourceDocumentType: 'NO_SOURCE_DOCUMENT',
          sourceMatter: 'NO_IDENTIFICADA',
          requiredSourceTypes: [],
          acceptedSourceTypes: [],
          optionalSourceTypes: [],
          sourceRequired: false,
          compatibilityStatus: 'EXPLICIT_COMPATIBILITY',
          status: 'COMPATIBLE',
          missingRequirements: [],
        },
      } : {}),
    } as never,
  });
  (document as any).qualityGate = { passed: true, canMarkAsFinal: true };
  return markDocumentAsReadyToExport(document, { explicit: true });
}

function verifiedCompatibility(document = makeCompatibilityDocument()) {
  return verifyCompatibilityMaterialization({
    document,
    exportValidation: { ...validateForExport(document), ok: true },
  });
}

describe('FASE 7 Task 7 — approved compatibility export', () => {
  it('41. preserves non-labor compatibility without fabricating FASE 6 evidence', () => {
    const verified = verifiedCompatibility();
    expect(verified.verificationMode).toBe('COMPATIBILITY');
    expect(verified).not.toHaveProperty('assembly');
    expect(verified).not.toHaveProperty('assemblyGate');
    expect(verified.compatibility.compatibilityStatus).toBe('ACCEPTS_ANY_SOURCE_INTENTIONALLY');
  });

  it('42. preserves formal-only compatibility without fabricating substantive Coverage', () => {
    const verified = verifiedCompatibility(makeCompatibilityDocument('demanda_ordinaria_civil'));
    expect(verified.compatibility).toMatchObject({
      status: 'COMPATIBLE',
      compatibilityStatus: 'EXPLICIT_COMPATIBILITY',
      selectedDocumentType: 'demanda_ordinaria_civil',
    });
    expect(verified).not.toHaveProperty('richEvidence');
    expect(verified.document.legalIssueMatrix).toBeUndefined();
  });

  it('45. materializes an approved compatibility input without fabricated rich evidence', () => {
    const verified = verifiedCompatibility();
    const model = materializePreparedFinalDocument(verified);
    const paragraphs = [
      ...model.header,
      ...model.sections.flatMap((section) => section.paragraphs),
      ...model.footer,
    ];
    expect(paragraphs.length).toBeGreaterThan(0);
    expect(paragraphs.every((paragraph) => paragraph.provenance.verificationMode === 'COMPATIBILITY')).toBe(true);
    expect(model).not.toHaveProperty('assembly');
    expect(model).not.toHaveProperty('coverageMatrix');
  });

  it('46. marks compatibility materialization with verificationMode COMPATIBILITY', () => {
    const model = materializePreparedFinalDocument(verifiedCompatibility());
    expect(model.sections[0]?.paragraphs[0]?.provenance.verificationMode).toBe('COMPATIBILITY');
  });
});
