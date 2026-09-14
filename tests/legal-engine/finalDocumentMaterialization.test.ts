import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  makeAcceptedBlock,
  makeDocumentFixture,
  makeEmptyAssemblyResult,
  type DocumentAssemblyQualityGateResult,
  type DocumentAssemblyResult,
} from '@/lib/legal-engine/documentAssemblyTypes';
import { createDocumentNode, type ContentBlock, type DocumentNode } from '@/lib/legal-engine/types';
import {
  verifyFinalDocumentExportability,
  type RichVerifiedInput,
} from '@/lib/legal-engine/finalDocumentMaterializationGate';
import {
  materializePreparedFinalDocument,
} from '@/lib/legal-engine/finalDocumentMaterialization';
import type { ExportValidationResult } from '@/lib/legal-engine/exportGuards';
import type {
  ExportRenderModel,
} from '@/lib/legal-engine/finalDocumentMaterializationTypes';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

type AssemblyAttachedDocument = UniversalLegalDocument & {
  documentAssemblyResult?: DocumentAssemblyResult;
  documentAssemblyQualityGate?: DocumentAssemblyQualityGateResult;
};

function section(
  id: string,
  order: number,
  content: ContentBlock[],
  options: Partial<DocumentNode> = {},
): DocumentNode {
  return createDocumentNode({
    id,
    title: options.title || id,
    type: options.type || 'argument',
    order,
    content,
    children: options.children,
    ...options,
  });
}

function flattenBlocks(nodes: readonly DocumentNode[]): ContentBlock[] {
  return nodes.flatMap((node) => [
    ...node.content,
    ...flattenBlocks(node.children || []),
  ]);
}

function verifiedInput(sections: DocumentNode[]): RichVerifiedInput {
  const lifecycle = { entityKind: 'DRAFT' as const, readiness: 'READY_TO_EXPORT' as const };
  const baseDocument = makeDocumentFixture({ id: 'doc-materialization-fixture', sections });
  const document = {
    ...baseDocument,
    lifecycle,
    __juridicoRadar: lifecycle,
  } as AssemblyAttachedDocument;
  const baseAssembly = makeEmptyAssemblyResult();
  const orderedBlocks = flattenBlocks(sections);
  const assembly: DocumentAssemblyResult = {
    ...baseAssembly,
    documentId: document.id,
    documentType: document.documentType,
    document,
    orderedBlocks,
    assemblyStatus: 'ASSEMBLED',
    validationStatus: 'VALID',
    readiness: 'READY',
    trace: {
      ...baseAssembly.trace,
      orderedSectionIds: sections.map((node) => node.id),
      orderedBlockIds: orderedBlocks.map((block) => block.id),
      blockLinks: orderedBlocks.map((block) => ({
        blockId: block.id,
        generationTaskId: block.generationTaskId,
        legalIssueIds: [...(block.legalIssueIds || [])],
        coverageItemIds: [...(block.coverageItemIds || [])],
      })),
    },
  };
  const assemblyGate: DocumentAssemblyQualityGateResult = {
    passed: true,
    canMarkAsReady: true,
    readiness: 'READY',
    baseQualityGate: { passed: true, canMarkAsFinal: true } as never,
    findings: [],
    checks: [],
  };
  const attachedAssembly = { ...assembly };
  Object.defineProperty(attachedAssembly, 'document', {
    value: document,
    enumerable: false,
    configurable: true,
    writable: false,
  });
  document.documentAssemblyResult = attachedAssembly;
  document.documentAssemblyQualityGate = assemblyGate;

  const exportValidation = { ok: true, errors: [], warnings: [] } satisfies ExportValidationResult;
  return verifyFinalDocumentExportability({ document, exportValidation });
}

function materialize(sections: DocumentNode[]): ExportRenderModel {
  return materializePreparedFinalDocument(verifiedInput(sections));
}

describe('FASE 7 Task 2 — format-neutral semantic materialization', () => {
  it('defines a format-neutral model without format or binary fields', () => {
    const model = materialize([
      section('sec-body', 1, [makeAcceptedBlock({ id: 'block-body', text: 'Texto preparado.' })]),
    ]);
    expect(model).not.toHaveProperty('format');
    expect(model).not.toHaveProperty('pageProfile');
    expect(model).not.toHaveProperty('pageGeometry');
    expect(model).not.toHaveProperty('filename');
    expect(model).not.toHaveProperty('rendererOptions');
    expect(model).toMatchObject({
      schemaVersion: 'fase7-v1',
      documentId: 'doc-materialization-fixture',
      sections: expect.any(Array),
      header: expect.any(Array),
      footer: expect.any(Array),
      materializationFingerprint: expect.any(String),
    });

    const source = [
      readFileSync('lib/legal-engine/finalDocumentMaterializationTypes.ts', 'utf8'),
      readFileSync('lib/legal-engine/finalDocumentMaterialization.ts', 'utf8'),
    ].join('\n');
    expect(source).not.toMatch(/\b(?:Buffer|Uint8Array)\b/);
    expect(source).not.toMatch(/from\s+['"](?:docx|pdf|node:crypto|node:fs|node:path|crypto|fs|path)['"]/);
  });

  it('materializes recursive children with parent and depth metadata', () => {
    const child = section('sec-child', 2, [makeAcceptedBlock({ id: 'block-child', text: 'Texto hijo.' })], {
      title: 'Subsección',
      children: [section('sec-grandchild', 1, [makeAcceptedBlock({ id: 'block-grandchild', text: 'Texto nieto.' })], { title: 'Nieto' })],
    });
    const model = materialize([
      section('sec-parent', 1, [makeAcceptedBlock({ id: 'block-parent', text: 'Texto padre.' })], {
        title: 'Principal',
        children: [child],
      }),
    ]);

    expect(model.sections.map((entry) => entry.id)).toEqual(['sec-parent', 'sec-child', 'sec-grandchild']);
    expect(model.sections).toEqual([
      expect.objectContaining({ id: 'sec-parent', depth: 0, orderPath: [1] }),
      expect.objectContaining({ id: 'sec-child', parentId: 'sec-parent', depth: 1, orderPath: [1, 2] }),
      expect.objectContaining({ id: 'sec-grandchild', parentId: 'sec-child', depth: 2, orderPath: [1, 2, 1] }),
    ]);
  });

  it('preserves canonical section and block order independent of completion order', () => {
    const first = materialize([
      section('sec-two', 20, [makeAcceptedBlock({ id: 'block-two', text: 'Segundo', createdAt: 'later', provider: 'provider-z' })]),
      section('sec-one', 10, [makeAcceptedBlock({ id: 'block-one', text: 'Primero', createdAt: 'earlier', provider: 'provider-a' })]),
    ]);
    const second = materialize([
      section('sec-two', 20, [makeAcceptedBlock({ id: 'block-two', text: 'Segundo', createdAt: 'another-time', provider: 'provider-a' })]),
      section('sec-one', 10, [makeAcceptedBlock({ id: 'block-one', text: 'Primero', createdAt: 'different-time', provider: 'provider-z' })]),
    ]);

    expect(first.sections.map((entry) => entry.id)).toEqual(['sec-one', 'sec-two']);
    expect(first.sections.flatMap((entry) => entry.paragraphs.map((paragraph) => paragraph.text))).toEqual(['Primero', 'Segundo']);
    expect(second.sections.map((entry) => entry.id)).toEqual(first.sections.map((entry) => entry.id));
    expect(second.materializationFingerprint).toBe(first.materializationFingerprint);
  });

  it('never deduplicates distinct blocks or sections', () => {
    const repeatedText = 'Texto repetido legítimo.';
    const model = materialize([
      section('sec-one', 1, [makeAcceptedBlock({ id: 'block-one', text: repeatedText })], { title: 'Misma sección' }),
      section('sec-two', 2, [makeAcceptedBlock({ id: 'block-two', text: repeatedText })], { title: 'Misma sección' }),
    ]);

    expect(model.sections).toHaveLength(2);
    expect(model.sections.flatMap((entry) => entry.paragraphs)).toHaveLength(2);
    expect(model.sections.flatMap((entry) => entry.paragraphs.map((paragraph) => paragraph.text))).toEqual([repeatedText, repeatedText]);
  });

  it('does not duplicate headings represented by section and block content', () => {
    const model = materialize([
      section('sec-hechos', 1, [makeAcceptedBlock({
        id: 'block-heading-content',
        text: 'HECHOS\nEl contenido sustantivo legítimo permanece intacto.',
      })], { title: 'HECHOS' }),
    ]);
    const rendered = model.sections[0];

    expect(rendered.title).toBe('HECHOS');
    expect(rendered.paragraphs).toHaveLength(1);
    expect(rendered.paragraphs[0]?.text).toBe('HECHOS\nEl contenido sustantivo legítimo permanece intacto.');
    expect(rendered.paragraphs.filter((paragraph) => paragraph.role === 'TITLE')).toHaveLength(0);
  });

  it('does not mutate the prepared document or FASE 6 evidence', () => {
    const block = makeAcceptedBlock({
      id: 'block-immutable',
      text: 'Texto inmutable.',
      sources: [{ documentId: 'source-1', page: 1 }],
      legalIssueIds: ['issue-1'],
      coverageItemIds: ['coverage-1'],
    });
    const input = verifiedInput([section('sec-immutable', 1, [block])]);
    const before = structuredClone(input);

    const model = materializePreparedFinalDocument(input);

    expect(input).toEqual(before);
    expect(model.sections[0]?.paragraphs[0]?.provenance.coverageItemIds).not.toBe(block.coverageItemIds);
    expect(model.sections[0]?.paragraphs[0]?.provenance.legalIssueIds).not.toBe(block.legalIssueIds);
    expect(model.sections[0]?.paragraphs[0]?.style).not.toBe(block.style);
    expect(model.sections[0]?.paragraphs[0]?.provenance.verificationMode).toBe('RICH_ASSEMBLY');
  });
});
