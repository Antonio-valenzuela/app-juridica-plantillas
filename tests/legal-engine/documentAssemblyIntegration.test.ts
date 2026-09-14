import { describe, expect, it, vi } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import type { PipelineInput } from '@/lib/legal-engine/pipeline';
import type { DocumentAssemblyResult } from '@/lib/legal-engine/documentAssemblyTypes';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

type AssemblyAttachedDocument = UniversalLegalDocument & { documentAssemblyResult?: DocumentAssemblyResult };

async function runControlledRichPipeline(overrides: Partial<PipelineInput> = {}): Promise<AssemblyAttachedDocument> {
  return runGenerationPipeline({
    userInstruction: 'Preparar un escrito jurídico de prueba con estructura formal.',
    traceOptions: { enabled: true },
    generateSection: async ({ section }: { section: { title: string } }) => `Contenido controlado de ${section.title}.`,
    ...overrides,
  }) as Promise<AssemblyAttachedDocument>;
}

describe('FASE 6 document assembly pipeline integration', () => {
  it('runs document assembly after generation and records the result before final readiness', async () => {
    const result = await runControlledRichPipeline();
    expect(result.generationMetadata.auditTrace?.documentAssembly?.assemblyId).toBeTruthy();
    expect(result.generationMetadata.auditTrace?.documentAssembly?.findingCodes).toBeDefined();
    expect(result.documentAssemblyResult).toBeDefined();
  }, 30000);

  it('does not add a provider call when the controlled output is formal/deterministic', async () => {
    const provider = vi.fn();
    const result = await runControlledRichPipeline({ issueProviderInvoker: provider });
    expect(provider).not.toHaveBeenCalled();
    expect(result.validation.errors.some((error) => error.checkId === 'DOCUMENT_ASSEMBLY_PROVIDER_CALL')).toBe(false);
  }, 30000);

  it('keeps final completeness false when FASE 6 is not READY', async () => {
    const result = await runControlledRichPipeline();
    const assembly = result.documentAssemblyResult;
    expect(assembly?.readiness).not.toBe('READY');
    expect(result.generationMetadata.pipelineState.isComplete).not.toBe(true);
    expect(result.lifecycle?.readiness).not.toBe('READY_TO_EXPORT');
  }, 30000);

  it('keeps the returned document JSON-serializable after attaching assembly metadata', async () => {
    const result = await runControlledRichPipeline();

    expect(() => JSON.stringify(result)).not.toThrow();
  }, 30000);
});
