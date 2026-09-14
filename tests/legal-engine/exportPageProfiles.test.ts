import { describe, expect, it } from 'vitest';
import {
  PageProfileResolutionError,
  resolveDocxPageProfile,
  resolvePdfPageProfile,
} from '@/lib/legal-engine/exportPageProfiles';

const docxServerOption = {
  id: 'docx-letter-approved',
  unit: 'twip' as const,
  width: 12240,
  height: 15840,
  margins: { top: 1440, right: 1440, bottom: 1440, left: 1728 },
};

const pdfServerOption = {
  id: 'pdf-letter-approved',
  unit: 'pt' as const,
  width: 612,
  height: 792,
  margins: { top: 72, right: 72, bottom: 72, left: 72 },
};

describe('FASE 7 Task 3 — export page profiles', () => {
  it('resolves the same profile deterministically for the same input', () => {
    const docxFirst = resolveDocxPageProfile({ serverOption: docxServerOption });
    const docxSecond = resolveDocxPageProfile({ serverOption: docxServerOption });
    const pdfFirst = resolvePdfPageProfile({ serverOption: pdfServerOption });
    const pdfSecond = resolvePdfPageProfile({ serverOption: pdfServerOption });

    expect(docxFirst).toEqual(docxSecond);
    expect(pdfFirst).toEqual(pdfSecond);
    expect(docxFirst).not.toBe(docxSecond);
    expect(pdfFirst).not.toBe(pdfSecond);
    expect(docxFirst).toMatchObject({ ...docxServerOption, source: 'SERVER_OPTION' });
    expect(pdfFirst).toMatchObject({ ...pdfServerOption, source: 'SERVER_OPTION' });

    expect(resolveDocxPageProfile()).toEqual({
      ...docxServerOption,
      id: 'docx-letter-compatibility-default',
      source: 'COMPATIBILITY_DEFAULT',
    });
    expect(resolvePdfPageProfile()).toEqual({
      ...pdfServerOption,
      id: 'pdf-letter-compatibility-default',
      source: 'COMPATIBILITY_DEFAULT',
    });
  });

  it('rejects unsafe page dimensions, margins and units', () => {
    const unsafeProfiles: Array<() => unknown> = [
      () => resolveDocxPageProfile({ serverOption: { ...docxServerOption, width: 0 } }),
      () => resolveDocxPageProfile({ serverOption: { ...docxServerOption, height: Number.POSITIVE_INFINITY } }),
      () => resolveDocxPageProfile({ serverOption: { ...docxServerOption, margins: { ...docxServerOption.margins, left: -1 } } }),
      () => resolveDocxPageProfile({ serverOption: { ...docxServerOption, unit: 'pt' } }),
      () => resolvePdfPageProfile({ serverOption: { ...pdfServerOption, width: Number.MAX_SAFE_INTEGER } }),
      () => resolvePdfPageProfile({ serverOption: { ...pdfServerOption, margins: { ...pdfServerOption.margins, right: 600 } } }),
      () => resolvePdfPageProfile({ serverOption: { ...pdfServerOption, unit: 'twip' } }),
      () => resolveDocxPageProfile({
        documentMetadata: { pageProfile: docxServerOption },
      }),
      () => resolvePdfPageProfile(pdfServerOption),
    ];

    for (const resolveUnsafeProfile of unsafeProfiles) {
      expect(resolveUnsafeProfile).toThrow(PageProfileResolutionError);
    }
  });
});
