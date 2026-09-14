import { describe, expect, it } from 'vitest';
import { DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import { resolveDocxPageProfile } from '@/lib/legal-engine/exportPageProfiles';
import { renderDocx } from '@/lib/legal-engine/exportDocxUniversal';
import type {
  ExportRenderModel,
  RenderParagraph,
} from '@/lib/legal-engine/finalDocumentMaterializationTypes';
import {
  extractWordDocumentParagraphs,
  normalizeDocxText,
  parseXml,
  readDocxPackage,
} from '../helpers/docxPackageReader';

function paragraph(
  id: string,
  text: string,
  role: RenderParagraph['role'] = 'BODY',
  overrides: Partial<RenderParagraph> = {},
): RenderParagraph {
  return {
    id,
    text,
    runs: [{ text }],
    role,
    style: {},
    orderPath: [1],
    keepNext: false,
    keepTogether: false,
    pageBreakBefore: false,
    provenance: {
      documentId: 'doc-task4',
      verificationMode: 'RICH_ASSEMBLY',
      blockId: id,
      coverageItemIds: [],
      legalIssueIds: [],
      sourceDocumentIds: [],
      sourceRefs: [],
      manualEdit: false,
    },
    ...overrides,
  };
}

function model(bodyParagraphs: RenderParagraph[]): ExportRenderModel {
  return {
    schemaVersion: 'fase7-v1',
    documentId: 'doc-task4',
    documentType: 'escrito_libre',
    title: 'Título técnico no visible',
    header: [],
    sections: [
      {
        id: 'sec-parent',
        title: 'Sección padre no re-renderizada',
        type: 'argument',
        depth: 0,
        orderPath: [1],
        paragraphs: bodyParagraphs.slice(0, 2),
      },
      {
        id: 'sec-child',
        parentId: 'sec-parent',
        title: 'Subsección anidada no re-renderizada',
        type: 'argument',
        depth: 1,
        orderPath: [1, 1],
        paragraphs: bodyParagraphs.slice(2),
      },
    ],
    footer: [],
    documentFingerprint: 'document-fingerprint-task4',
    materializationFingerprint: 'materialization-fingerprint-task4',
  };
}

function options() {
  return {
    format: 'docx' as const,
    pageProfile: resolveDocxPageProfile(),
    lawyerProfile: DEFAULT_LAWYER_PROFILE,
  };
}

describe('FASE 7 Task 4 — DOCX structure and fidelity', () => {
  it('creates a valid DOCX ZIP package', async () => {
    const artifact = await renderDocx(model([paragraph('block-1', 'Contenido válido.')]), options());
    const packageReader = await readDocxPackage(artifact.bytes);

    expect(artifact.format).toBe('docx');
    expect(artifact.bytes.byteLength).toBeGreaterThan(500);
    expect(artifact.bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
    expect(packageReader.entryNames).toContain('[Content_Types].xml');
    expect(packageReader.entryNames).toContain('_rels/.rels');
    expect(packageReader.entryNames).toContain('word/document.xml');
  });

  it('contains a well-formed word/document.xml entry', async () => {
    const artifact = await renderDocx(model([paragraph('block-xml', 'Texto con < & y XML escapable.')]), options());
    const packageReader = await readDocxPackage(artifact.bytes);
    const documentXml = await packageReader.readText('word/document.xml');

    expect(() => parseXml(documentXml)).not.toThrow();
    expect(documentXml).toContain('<w:document');
    expect(documentXml).toContain('Texto con &lt; &amp; y XML escapable.');
  });

  it('DOCX round trip preserves normalized substantive text', async () => {
    const repeated = 'Misma redacción legítima con identidad distinta.';
    const body = [
      paragraph('block-heading', 'HECHOS', 'TITLE'),
      paragraph('block-parent', 'Texto padre con áéíóú, ñ y ü.'),
      paragraph('block-child', 'Contenido anidado preservado.'),
      paragraph('block-repeat-a', repeated),
      paragraph('block-repeat-b', repeated),
      paragraph('block-manual', 'Texto manual que permanece intacto.', 'BODY', {
        provenance: {
          ...paragraph('manual-provenance', '').provenance,
          blockId: 'block-manual',
          manualEdit: true,
        },
      }),
    ];
    const artifact = await renderDocx(model(body), options());
    const packageReader = await readDocxPackage(artifact.bytes);
    const extracted = extractWordDocumentParagraphs(await packageReader.readText('word/document.xml'))
      .filter((text) => text.length > 0);

    const expected = body.map((entry) => entry.text).join('\n');
    expect(normalizeDocxText(extracted.join('\n'))).toBe(normalizeDocxText(expected));
    expect(extracted.filter((text) => text === repeated)).toHaveLength(2);
    expect(extracted).toContain('Contenido anidado preservado.');
    expect(extracted).toContain('Texto manual que permanece intacto.');
    expect(extracted.filter((text) => text === 'HECHOS')).toHaveLength(1);
  });
});
