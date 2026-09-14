import { describe, expect, it, vi } from 'vitest';
import { Packer } from 'docx';
import { DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import { resolveDocxPageProfile } from '@/lib/legal-engine/exportPageProfiles';
import {
  DocxSerializationError,
  renderDocx,
} from '@/lib/legal-engine/exportDocxUniversal';
import type { ExportRenderModel } from '@/lib/legal-engine/finalDocumentMaterializationTypes';

const model: ExportRenderModel = {
  schemaVersion: 'fase7-v1',
  documentId: 'doc-serialization-failure',
  title: 'Documento de prueba',
  header: [],
  sections: [{
    id: 'section-serialization',
    title: 'Sección',
    type: 'argument',
    depth: 0,
    orderPath: [1],
    paragraphs: [{
      id: 'block-serialization',
      text: 'Texto que no debe producir un fallback.',
      runs: [{ text: 'Texto que no debe producir un fallback.' }],
      role: 'BODY',
      style: {},
      orderPath: [1, 0],
      keepNext: false,
      keepTogether: false,
      pageBreakBefore: false,
      provenance: {
        documentId: 'doc-serialization-failure',
        verificationMode: 'RICH_ASSEMBLY',
        blockId: 'block-serialization',
        coverageItemIds: [],
        legalIssueIds: [],
        sourceDocumentIds: [],
        sourceRefs: [],
        manualEdit: false,
      },
    }],
  }],
  footer: [],
  documentFingerprint: 'document-serialization-fingerprint',
  materializationFingerprint: 'materialization-serialization-fingerprint',
};

const options = {
  format: 'docx' as const,
  pageProfile: resolveDocxPageProfile(),
  lawyerProfile: DEFAULT_LAWYER_PROFILE,
};

describe('FASE 7 Task 4 — DOCX serialization boundary', () => {
  it('fails closed when DOCX serialization fails', async () => {
    const serializationError = new Error('simulated DOCX serialization error');
    const packerSpy = vi.spyOn(Packer, 'toBuffer').mockRejectedValueOnce(serializationError);

    try {
      await expect(renderDocx(model, options))
        .rejects.toBeInstanceOf(DocxSerializationError);
      expect(packerSpy).toHaveBeenCalledTimes(1);
    } finally {
      packerSpy.mockRestore();
    }
  });
});
