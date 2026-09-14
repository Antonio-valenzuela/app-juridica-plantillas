import { describe, expect, it, vi } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import type { DocumentAssemblyResult } from '@/lib/legal-engine/documentAssemblyTypes';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

const MARKER = 'TEST-ANTECEDENTES-VISIBLE-XYZ';

type AssemblyAttachedDocument = UniversalLegalDocument & {
  documentAssemblyResult?: DocumentAssemblyResult;
};

function sourceWithVisibleProceduralEvent() {
  return createSourceDocument({
    id: 'fixture-antecedentes-visible-source',
    filename: 'fixture-antecedentes-visible-source.pdf',
    type: 'application/pdf',
    sourceValidated: true,
    classification: { sourceDocumentType: 'SENTENCIA_AMPARO_DIRECTO' },
    pages: [{
      page: 1,
      chars: 420,
      text: [
        'ANTECEDENTES',
        `El 3 de enero de 2024 se presentó ${MARKER}.`,
        'El 10 de febrero de 2024 se notificó la resolución.',
        'El 15 de marzo de 2024 se interpuso el recurso.',
      ].join('\n'),
    }],
  });
}

function sectionText(document: UniversalLegalDocument, title: RegExp): string {
  return document.sections
    .filter((section) => title.test(section.title))
    .flatMap((section) => section.content || [])
    .map((block) => block.text)
    .join('\n\n');
}

describe('ANTECEDENTES visible materialization', () => {
  it('materializes source-backed procedural text through assembly into the editor', async () => {
    const provider = vi.fn();
    const result = await runGenerationPipeline({
      selectedDocumentType: 'recurso_revision_amparo_directo',
      documentTypeLabel: 'Recurso de revisión en amparo directo',
      matter: 'Amparo',
      jurisdiction: 'Federal',
      userInstruction: 'Preparar recurso de revisión en amparo directo con antecedentes.',
      sourceDocuments: [sourceWithVisibleProceduralEvent()],
      issueProviderInvoker: provider,
      generationId: 'generation-antecedentes-visible-red',
      traceOptions: { enabled: true },
    });

    const attached = result as AssemblyAttachedDocument;
    const assembly = attached.documentAssemblyResult;
    const proceduralItems = result.coverageMatrix?.items.filter((item) =>
      item.category === 'PROCEDURAL_REQUIREMENT'
      && item.satisfactionPolicy === 'REFERENCE_ONLY'
    ) || [];
    const antecedentsAssembly = assembly?.sections.find((section) => /antecedente/i.test(section.title));
    const antecedentsBlock = antecedentsAssembly?.blocks.find((block) => block.text.includes(MARKER));

    expect(proceduralItems.length).toBeGreaterThan(0);
    expect(provider).not.toHaveBeenCalled();
    expect(sectionText(result, /antecedente/i)).toContain(MARKER);
    expect(antecedentsAssembly?.blocks.map((block) => block.text).join('\n\n')).toContain(MARKER);
    expect(antecedentsBlock).toMatchObject({
      generatedBy: 'SOURCE_DIRECT',
      generationRequirement: 'DETERMINISTIC',
      provenance: 'SOURCE_EXTRACTED',
      fallbackStatus: undefined,
    });
    expect(antecedentsBlock?.legalIssueIds || []).toEqual([]);
    expect(assembly?.findings.some((finding) =>
      finding.code === 'FALLBACK_BLOCK_EXCLUDED'
      && finding.sectionIds.includes(antecedentsAssembly?.sectionId || '')
    )).toBe(false);
    expect(assembly?.coverageReconciliation?.items.find((item) =>
      proceduralItems.some((coverage) => coverage.id === item.coverageItemId)
    )).toMatchObject({ satisfied: false, reason: 'NO_GENERATED_BLOCK' });
  }, 30000);
});
