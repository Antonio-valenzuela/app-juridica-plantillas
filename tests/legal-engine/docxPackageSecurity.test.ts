import { describe, expect, it } from 'vitest';
import { DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import { resolveDocxPageProfile } from '@/lib/legal-engine/exportPageProfiles';
import { renderDocx } from '@/lib/legal-engine/exportDocxUniversal';
import type {
  ExportRenderModel,
  RenderParagraph,
} from '@/lib/legal-engine/finalDocumentMaterializationTypes';
import { parseXml, readDocxPackage } from '../helpers/docxPackageReader';

function securityModel(text: string): ExportRenderModel {
  const makeParagraph = (id: string, role: RenderParagraph['role']): RenderParagraph => ({
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
      documentId: 'doc-security-task4',
      verificationMode: 'RICH_ASSEMBLY',
      blockId: id,
      coverageItemIds: [],
      legalIssueIds: [],
      sourceDocumentIds: [],
      sourceRefs: [],
      manualEdit: false,
    },
  });

  return {
    schemaVersion: 'fase7-v1',
    documentId: 'doc-security-task4',
    title: 'No automatic title',
    header: [makeParagraph('header-authorized', 'HEADER')],
    sections: [{
      id: 'section-security',
      title: 'No automatic heading',
      type: 'argument',
      depth: 0,
      orderPath: [1],
      paragraphs: [makeParagraph('body-authorized', 'BODY')],
    }],
    footer: [makeParagraph('footer-authorized', 'FOOTER')],
    documentFingerprint: 'document-security-fingerprint',
    materializationFingerprint: 'materialization-security-fingerprint',
  };
}

function options() {
  return {
    format: 'docx' as const,
    pageProfile: resolveDocxPageProfile(),
    lawyerProfile: DEFAULT_LAWYER_PROFILE,
  };
}

describe('FASE 7 Task 4 — DOCX package security and XML controls', () => {
  it('handles invalid XML control characters without substantive corruption', async () => {
    const text = 'Inicio\u0001fin — ñ áéíóú ü §';
    const artifact = await renderDocx(securityModel(text), options());
    const packageReader = await readDocxPackage(artifact.bytes);
    const documentXml = await packageReader.readText('word/document.xml');

    expect(documentXml).not.toContain('\u0001');
    expect(documentXml).toContain('Inicio');
    expect(documentXml).toContain('fin');
    expect(documentXml).toContain('ñ');
    expect(documentXml).toContain('áéíóú');
    expect(documentXml).toContain('ü');
    expect(documentXml).toContain('§');
    expect(() => parseXml(documentXml)).not.toThrow();
  });

  it('contains no macros OLE objects or external active relationships', async () => {
    const artifact = await renderDocx(securityModel('Contenido sin activos.'), options());
    const packageReader = await readDocxPackage(artifact.bytes);
    const entries = packageReader.entryNames.map((entry) => entry.toLowerCase());

    expect(entries.some((entry) => /vbaproject|oleobject|embeddings|activex|external\s*links|\.exe$|\.dll$/.test(entry))).toBe(false);

    const relationshipEntries = packageReader.entryNames.filter((entry) => entry.endsWith('.rels'));
    for (const relationshipEntry of relationshipEntries) {
      const relationshipsXml = await packageReader.readText(relationshipEntry);
      const relationships = parseXml(relationshipsXml);
      const relationshipNodes = Array.from(relationships.getElementsByTagName('Relationship'));
      for (const relationship of relationshipNodes) {
        const targetMode = relationship.getAttribute('TargetMode');
        const target = relationship.getAttribute('Target') || '';
        expect(targetMode).not.toBe('External');
        expect(target).not.toMatch(/^(?:https?:|ftp:|file:|\\\\|\/\/)/i);
      }
    }

    const contentTypes = parseXml(await packageReader.readText('[Content_Types].xml'));
    expect(contentTypes.toString()).not.toMatch(/vbaProject|oleObject|activeX|externalLink/i);
  });
});
