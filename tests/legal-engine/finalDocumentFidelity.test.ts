import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  makeAcceptedBlock,
  makeDocumentFixture,
  makeEmptyAssemblyResult,
  makeManualBlock,
  type DocumentAssemblyQualityGateResult,
  type DocumentAssemblyResult,
} from '@/lib/legal-engine/documentAssemblyTypes';
import { createDocumentNode, type ContentBlock, type DocumentNode } from '@/lib/legal-engine/types';
import {
  verifyFinalDocumentExportability,
  type RichVerifiedInput,
} from '@/lib/legal-engine/finalDocumentMaterializationGate';
import { materializePreparedFinalDocument } from '@/lib/legal-engine/finalDocumentMaterialization';
import type { ExportValidationResult } from '@/lib/legal-engine/exportGuards';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

type AssemblyAttachedDocument = UniversalLegalDocument & {
  documentAssemblyResult?: DocumentAssemblyResult;
  documentAssemblyQualityGate?: DocumentAssemblyQualityGateResult;
};

function node(id: string, content: ContentBlock[], order = 1, title = id, type: DocumentNode['type'] = 'argument'): DocumentNode {
  return createDocumentNode({ id, title, type, order, content });
}

function richInput(sections: DocumentNode[]): RichVerifiedInput {
  const lifecycle = { entityKind: 'DRAFT' as const, readiness: 'READY_TO_EXPORT' as const };
  const baseDocument = makeDocumentFixture({ id: 'doc-fidelity-fixture', sections });
  const document = { ...baseDocument, lifecycle, __juridicoRadar: lifecycle } as AssemblyAttachedDocument;
  const baseAssembly = makeEmptyAssemblyResult();
  const blocks = sections.flatMap((entry) => entry.content);
  const assembly: DocumentAssemblyResult = {
    ...baseAssembly,
    documentId: document.id,
    documentType: document.documentType,
    document,
    orderedBlocks: blocks,
    assemblyStatus: 'ASSEMBLED',
    validationStatus: 'VALID',
    readiness: 'READY',
    trace: {
      ...baseAssembly.trace,
      orderedSectionIds: sections.map((entry) => entry.id),
      orderedBlockIds: blocks.map((block) => block.id),
      blockLinks: blocks.map((block) => ({
        blockId: block.id,
        generationTaskId: block.generationTaskId,
        legalIssueIds: [...(block.legalIssueIds || [])],
        coverageItemIds: [...(block.coverageItemIds || [])],
      })),
    },
  };
  const gate: DocumentAssemblyQualityGateResult = {
    passed: true,
    canMarkAsReady: true,
    readiness: 'READY',
    baseQualityGate: { passed: true, canMarkAsFinal: true } as never,
    findings: [],
    checks: [],
  };
  const attachedAssembly = { ...assembly };
  Object.defineProperty(attachedAssembly, 'document', { value: document, enumerable: false, configurable: true, writable: false });
  document.documentAssemblyResult = attachedAssembly;
  document.documentAssemblyQualityGate = gate;
  const exportValidation = { ok: true, errors: [], warnings: [] } satisfies ExportValidationResult;
  return verifyFinalDocumentExportability({ document, exportValidation });
}

describe('FASE 7 Task 2 — exact prepared text and provenance fidelity', () => {
  it('preserves exact prepared substantive text through materialization', () => {
    const text = '  Texto preparado **literal**.\n\nCon espacios finales  ';
    const model = materializePreparedFinalDocument(richInput([
      node('sec-exact', [makeAcceptedBlock({ id: 'block-exact', text })]),
    ]));

    expect(model.sections[0]?.paragraphs[0]?.text).toBe(text);
    expect(model.sections[0]?.paragraphs[0]?.runs).toEqual([{ text }]);
  });

  it('does not reapply destructive sanitization or style text injection', () => {
    const source = readFileSync('lib/legal-engine/finalDocumentMaterialization.ts', 'utf8');

    expect(source).not.toMatch(/sanitizeLegalDocument|stripTrustMarkers|normalizeTitleText|normalizeMarkdownFormatting|applyStyleToSectionText/);
    expect(source).not.toMatch(/dedupe|similarity|summar|rewrite/i);
    expect(source).not.toMatch(/normalizeLegalDocumentText/);
  });

  it('preserves manual text and manual edit provenance', () => {
    const manualText = 'Texto manual que no puede reemplazarse.';
    const model = materializePreparedFinalDocument(richInput([
      node('sec-manual', [makeManualBlock({ id: 'block-manual', text: manualText, provenance: 'USER_EDITED' })]),
    ]));
    const paragraph = model.sections[0]?.paragraphs[0];

    expect(paragraph?.text).toBe(manualText);
    expect(paragraph?.provenance.manualEdit).toBe(true);
    expect(paragraph?.provenance.blockId).toBe('block-manual');
  });

  it('preserves same text from blocks with different issue identities', () => {
    const text = 'Misma redacción con dos identidades jurídicas.';
    const model = materializePreparedFinalDocument(richInput([
      node('sec-issues', [
        makeAcceptedBlock({ id: 'block-issue-a', text, legalIssueIds: ['issue-a'], coverageItemIds: ['coverage-a'], provenance: 'AI_GENERATED' }),
        makeAcceptedBlock({ id: 'block-issue-b', text, legalIssueIds: ['issue-b'], coverageItemIds: ['coverage-b'], provenance: 'LAWYER_CONFIRMED' }),
      ]),
    ]));
    const paragraphs = model.sections[0]?.paragraphs || [];

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual([text, text]);
    expect(paragraphs.map((paragraph) => paragraph.provenance.blockId)).toEqual(['block-issue-a', 'block-issue-b']);
    expect(paragraphs.map((paragraph) => paragraph.provenance.legalIssueIds)).toEqual([['issue-a'], ['issue-b']]);
    expect(paragraphs.map((paragraph) => paragraph.provenance.coverageItemIds)).toEqual([['coverage-a'], ['coverage-b']]);
  });

  it('does not introduce facts absent from the prepared document', () => {
    const model = materializePreparedDocumentWithMetadata({ factIds: ['fact-existing'], text: 'Texto sin hechos nuevos.' });

    expect(JSON.stringify(model)).not.toContain('factIds');
    expect(model.sections[0]?.paragraphs[0]?.text).toBe('Texto sin hechos nuevos.');
  });

  it('does not introduce authorities absent from the prepared document', () => {
    const model = materializePreparedDocumentWithMetadata({ authorityIds: ['authority-existing'], text: 'Texto sin autoridades nuevas.' });

    expect(JSON.stringify(model)).not.toContain('authorityIds');
    expect(model.sections[0]?.paragraphs[0]?.text).toBe('Texto sin autoridades nuevas.');
  });

  it('does not introduce evidence absent from the prepared document', () => {
    const model = materializePreparedDocumentWithMetadata({ evidenceIds: ['evidence-existing'], text: 'Texto sin evidencia nueva.' });

    expect(JSON.stringify(model)).not.toContain('evidenceIds');
    expect(model.sections[0]?.paragraphs[0]?.text).toBe('Texto sin evidencia nueva.');
  });

  it('does not introduce petitions absent from the prepared document', () => {
    const petitionText = 'Por lo expuesto, solicito se provea conforme a derecho.';
    const model = materializePreparedDocumentWithMetadata({ text: petitionText, type: 'petition' });

    expect(model.sections).toHaveLength(1);
    expect(model.sections[0]?.paragraphs).toHaveLength(1);
    expect(model.sections[0]?.paragraphs[0]?.text).toBe(petitionText);
  });
});

function materializePreparedDocumentWithMetadata(metadata: {
  factIds?: string[];
  authorityIds?: string[];
  evidenceIds?: string[];
  text: string;
  type?: DocumentNode['type'];
}) {
  const block = makeAcceptedBlock({
    id: 'block-metadata',
    text: metadata.text,
    factIds: metadata.factIds,
    authorityIds: metadata.authorityIds,
    evidenceIds: metadata.evidenceIds,
  });
  return materializePreparedFinalDocument(richInput([
    node('sec-metadata', [block], 1, 'Metadata', metadata.type || 'argument'),
  ]));
}
