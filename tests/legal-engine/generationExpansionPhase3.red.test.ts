import { describe, expect, it } from 'vitest';
import { expandDocumentToPageTarget } from '@/lib/legal-engine/generationExpansion';
import { resolveGenerationExtensionContract } from '@/lib/legal-engine/generationExtension';
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';

function documentWithDraftDepth(coverageItems: any[], facts: any[] = [], sections = ['section-1']) {
  return {
    documentType: 'contestacion_demanda_civil',
    documentTypeLabel: 'Contestación civil',
    sourceDocuments: [{ id: 'source-1' }],
    generationMetadata: { generationId: 'phase3-expansion-test', draftDepth: 'PROFESSIONAL_20' },
    coverageMatrix: { items: coverageItems },
    caseAnalysis: { facts },
    sections: sections.map((id, order) => ({
      id,
      title: id === 'section-1' ? 'Contestación de hechos' : 'Excepciones y defensas',
      type: 'argument',
      order,
      content: [{ id: `base-${id}`, text: `Base ${id}` }],
    })),
  } as any;
}

function extensionContract(minPages = 2) {
  return resolveGenerationExtensionContract({
    generationMode: 'extended-legal',
    targetPages: minPages,
    minPages,
    maxPages: minPages + 2,
    maxCallsPerDocument: 4,
    maxExpansionPasses: 1,
  });
}

const measurePages = async (document: any) => ({
  actualPages: 1 + document.sections.filter((section: any) => section.content.length > 1).length,
  wordCount: 100,
  characterCount: 600,
  pdfBytes: 1000,
});

const legalResponse = {
  provider: 'groq',
  model: 'test-model',
  success: true,
  content: 'Desarrollo nuevo, concreto y vinculado con el soporte disponible.',
  latencyMs: 1,
  origin: 'AI_GENERATED_LEGAL_CONTENT',
  isLegalAiContent: true,
};

describe('expansión profesional limitada por soporte de fuente', () => {
  it('no consulta al proveedor si una cobertura pendiente carece de hechos, prueba o autoridad vinculada', async () => {
    const document = documentWithDraftDepth([{
      id: 'coverage-unlinked',
      status: 'pending',
      required: true,
      targetSectionIds: ['section-1'],
      relatedFactIds: [],
      relatedEvidenceIds: [],
      relatedAuthorityIds: [],
    }]);
    let calls = 0;

    const result = await expandDocumentToPageTarget(document, document.caseAnalysis, extensionContract(), {
      measure: measurePages,
      invokeProvider: async () => {
        calls += 1;
        return legalResponse as any;
      },
    });

    expect(calls).toBe(0);
    expect(result.contentStopReason).toBe('ATTORNEY_INPUT_REQUIRED');
    expect(result.metrics.actualPages).toBe(1);
  });

  it('no redacta una defensa cuando la cobertura vinculada requiere postura del abogado', async () => {
    const document = documentWithDraftDepth([{
      id: 'coverage-needs-position',
      status: 'needs_client_position',
      required: true,
      requiresClientPosition: true,
      targetSectionIds: ['section-1'],
      relatedFactIds: ['fact-1'],
    }], [{ id: 'fact-1', number: '1', text: 'La fuente contiene una afirmación pendiente.', confidence: 1 }]);
    let calls = 0;

    const result = await expandDocumentToPageTarget(document, document.caseAnalysis, extensionContract(), {
      measure: measurePages,
      invokeProvider: async () => {
        calls += 1;
        return legalResponse as any;
      },
    });

    expect(calls).toBe(0);
    expect(result.contentStopReason).toBe('ATTORNEY_INPUT_REQUIRED');
    expect(document.sections[0].content).toHaveLength(1);
  });

  it('continues a supported VALID_NON_FINAL section below its word budget even after the page minimum is met', async () => {
    const document = documentWithDraftDepth([{
      id: 'coverage-open',
      status: 'pending',
      required: true,
      targetSectionIds: ['section-1'],
      relatedFactIds: ['fact-1'],
    }], [{
      id: 'fact-1',
      number: '1',
      text: 'La fuente contiene el hecho relacionado con la pretensión.',
      sourceFact: 'La fuente contiene el hecho relacionado con la pretensión.',
      documentId: 'source-1',
      lawyerPosition: 'ADMIT',
      confidence: 1,
    }]);
    document.sections[0].content.push({
      id: 'provider-non-final',
      text: 'La respuesta identifica el hecho, pero deja pendiente su desarrollo jurídico completo.',
      generationStatus: 'generated',
      issueDraftValidationStatus: 'VALID_NON_FINAL',
      coverageItemIds: ['coverage-open'],
      factIds: ['fact-1'],
      generatedBy: 'AI',
    } as any);
    const contract = extensionContract(2);
    contract.sectionWordTargets = { 'section-1': 300 };
    contract.sectionBudgets = {
      'section-1': { targetWords: 300, priority: 'HIGH', maxContinuations: 2 },
    };
    const continuationText = 'La valoración jurídica complementaria examina el alcance concreto del hecho y su vínculo con la pretensión reclamada.';
    const trace = createGenerationTraceContext({ generationId: 'continuation-word-accounting', doc: document, options: { enabled: true } });
    let calls = 0;

    const result = await expandDocumentToPageTarget(document, document.caseAnalysis, contract, {
      trace,
      measure: measurePages,
      invokeProvider: async () => {
        calls += 1;
        return {
          ...legalResponse,
          content: continuationText,
        } as any;
      },
    });

    expect(result.metrics.actualPages).toBe(2);
    expect(calls).toBe(1);
    expect(contract.metrics.continuationCalls).toBe(1);
    expect(document.sections[0].content.at(-1)?.text).toContain('valoración jurídica complementaria');
    const sectionAccounting = trace.trace.wordAccounting.find((item) => item.sectionId === 'section-1');
    const generatedWords = continuationText.match(/[\p{L}\p{N}]+/gu)?.length;
    expect(sectionAccounting).toMatchObject({
      providerGeneratedWords: generatedWords,
      validatedWords: generatedWords,
      materializedWords: generatedWords,
      admittedWords: generatedWords,
    });
  });

  it('rechaza y contabiliza una ampliación soportada truncada por el proveedor', async () => {
    const document = documentWithDraftDepth([{
      id: 'coverage-open',
      status: 'pending',
      required: true,
      targetSectionIds: ['section-1'],
      relatedFactIds: ['fact-1'],
    }], [{
      id: 'fact-1',
      number: '1',
      text: 'La fuente contiene el hecho relacionado con la pretensión.',
      sourceFact: 'La fuente contiene el hecho relacionado con la pretensión.',
      documentId: 'source-1',
      lawyerPosition: 'ADMIT',
      confidence: 1,
    }]);
    const trace = createGenerationTraceContext({ generationId: 'truncated-supported-expansion', doc: document, options: { enabled: true } });
    const result = await expandDocumentToPageTarget(document, document.caseAnalysis, extensionContract(), {
      trace,
      measure: measurePages,
      invokeProvider: async () => ({
        ...legalResponse,
        content: 'La valoración probatoria debe permanecer abierta hasta que sup',
        finishReason: 'length',
        isTruncated: true,
      } as any),
    });

    expect(document.sections[0].content).toHaveLength(1);
    expect(result.contentStopReason).toBe('PROVIDER_UNAVAILABLE');
    expect(result.warnings).toContain('EXTENSION_OUTPUT_TRUNCATED:section-1');
    expect(trace.trace.wordAccounting.find((item) => item.sectionId === 'section-1')).toMatchObject({
      rejectedWords: 9,
      validatedWords: 0,
    });
  });

  it('conserva oraciones completas de una ampliación soportada truncada y contabiliza solo la cola perdida', async () => {
    const document = documentWithDraftDepth([{
      id: 'coverage-open', status: 'pending', required: true, targetSectionIds: ['section-1'], relatedFactIds: ['fact-1'],
    }], [{
      id: 'fact-1', number: '1', text: 'La fuente contiene el hecho relacionado con la pretensión.',
      sourceFact: 'La fuente contiene el hecho relacionado con la pretensión.', documentId: 'source-1',
      lawyerPosition: 'ADMIT', confidence: 1,
    }]);
    const complete = 'La valoración debe atender a la pretensión efectivamente formulada y a los hechos que delimitan la controversia. La prueba relacionada requiere examinarse por su contenido, origen y conexión concreta con cada extremo reclamado.';
    const trace = createGenerationTraceContext({ generationId: 'partial-supported-expansion', doc: document, options: { enabled: true } });
    const result = await expandDocumentToPageTarget(document, document.caseAnalysis, extensionContract(), {
      trace,
      measure: measurePages,
      invokeProvider: async () => ({
        ...legalResponse,
        content: `${complete} Si del material procesal se desprende`,
        finishReason: 'length', isTruncated: true,
      } as any),
    });

    expect(document.sections[0].content).toHaveLength(2);
    expect(document.sections[0].content[1].text).toBe(complete);
    expect(result.warnings).toContain('EXTENSION_OUTPUT_PARTIALLY_RECOVERED:section-1');
    expect(result.contentStopReason).toBe('TARGET_REACHED');
    const accounting = trace.trace.wordAccounting.find((item) => item.sectionId === 'section-1');
    expect(accounting?.validatedWords).toBe(complete.match(/[\p{L}\p{N}]+/gu)?.length);
    expect(accounting?.rejectedWords).toBeGreaterThan(0);
  });

  it('compara contenido entre secciones para impedir repetir la misma ampliación en el documento', async () => {
    const document = documentWithDraftDepth([
      { id: 'coverage-1', status: 'pending', required: true, targetSectionIds: ['section-1'], relatedFactIds: ['fact-1'] },
      { id: 'coverage-2', status: 'pending', required: true, targetSectionIds: ['section-2'], relatedFactIds: ['fact-2'] },
    ], [
      { id: 'fact-1', number: '1', text: 'Primera afirmación de fuente.', sourceFact: 'Primera afirmación de fuente.', documentId: 'source-1', lawyerPosition: 'ADMIT', confidence: 1 },
      { id: 'fact-2', number: '2', text: 'Segunda afirmación de fuente.', sourceFact: 'Segunda afirmación de fuente.', documentId: 'source-1', lawyerPosition: 'DENY', confidence: 1 },
    ], ['section-1', 'section-2']);
    document.caseAnalysis.authorities = ['Autoridad citada en fuente pero no verificada.'];
    let calls = 0;
    const prompts: string[] = [];

    const result = await expandDocumentToPageTarget(document, document.caseAnalysis, extensionContract(3), {
      measure: measurePages,
      invokeProvider: async (request: any) => {
        calls += 1;
        prompts.push(request.userMessage);
        return { ...legalResponse, content: 'La misma ampliación jurídica repetida en dos secciones.' } as any;
      },
    });

    expect(calls).toBe(2);
    expect(prompts[0]).toContain('Primera afirmación de fuente.');
    expect(prompts[0]).not.toContain('Segunda afirmación de fuente.');
    expect(prompts[0]).not.toContain('Autoridad citada en fuente pero no verificada.');
    expect(prompts[1]).toContain('Segunda afirmación de fuente.');
    expect(document.sections.map((section: any) => section.content.length)).toEqual([2, 1]);
    expect(result.warnings).toContain('EXTENSION_DUPLICATE_REJECTED_DOCUMENT');
  });
});
