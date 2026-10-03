import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { buildDocumentIndex } from '@/lib/legal-engine/documentIndex';
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';
import { DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import { readFileSync } from 'node:fs';
import { stitchTruncatedText } from '@/lib/legal-engine/generationTasks';

const { runFastModeMock } = vi.hoisted(() => ({ runFastModeMock: vi.fn() }));
vi.mock('@/lib/ai/orchestrator', () => ({ runFastMode: runFastModeMock }));

import { generateLegalBlock } from '@/lib/legal-engine/pipeline';

function providerResponse(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'groq',
    model: 'qwen-test-model',
    success: true,
    content: 'Texto inicial completo.',
    latencyMs: 12,
    usage: { promptTokens: 180, completionTokens: 92, totalTokens: 272 },
    finishReason: 'stop',
    isTruncated: false,
    ...overrides,
  };
}

function generationFixture() {
  const doc = createEmptyDocument({
    id: 'offline-continuation-case',
    documentType: 'escrito_libre',
    documentTypeLabel: 'Escrito libre',
    matter: 'civil',
    jurisdiction: 'local',
    flow: 'DOCUMENT_ANALYSIS',
  });
  doc.generationMetadata.externalProviderOptIn = true;
  const block = {
    id: 'sec-argumentos',
    kind: 'argument',
    sectionType: 'argument',
    title: 'ARGUMENTOS',
    level: 1,
    order: 1,
    text: 'ARGUMENTOS: desarrollar el punto procesal confirmado.',
    sourceElementIndices: [],
    pages: { start: 1, end: 1 },
    aiNeed: 'REQUIRES_AI',
    requiresAi: true,
    classificationReason: 'fixture offline',
    elementCount: 1,
    charCount: 50,
    context: { facts: ['Hecho confirmado de fixture.'], norms: [], jurisprudence: [], caseNumbers: [], authorities: [] },
  } as any;
  const trace = createGenerationTraceContext({
    generationId: 'continuation-trace-offline',
    doc,
    options: { enabled: true, now: () => new Date('2026-10-01T12:00:00.000Z'), monotonicNow: () => 10 },
  });
  return { doc, block, trace };
}

describe('standard legacy section continuation', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', 'offline-test-key');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('NVIDIA_API_KEY', '');
    runFastModeMock.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it('merges a restarted PRUEBAS continuation from the captured laboral run without repeating its prefix', () => {
    const captured = JSON.parse(readFileSync('audit/final-contestaciones-validation/run-2026-10-02T21-56-42-990Z/laboral/generation-trace.json', 'utf8'));
    const attempts = captured.taskExecutions.filter((entry: any) => entry.sectionId === 'sec-con-pruebas');
    const result = stitchTruncatedText(attempts[0].normalizedOutput, attempts[1].normalizedOutput);
    expect(result.match(/PRUEBAS/g)).toHaveLength(1);
    expect(result).toBe(attempts[1].normalizedOutput.trim());
  });

  it('does not discard a changed prefix or a short coincidental prefix', () => {
    expect(stitchTruncatedText('PRUEBAS: contrato A.', 'PRUEBAS: contrato B.')).toContain('contrato A.');
    expect(stitchTruncatedText('Se solicita incorporar A.', 'Se solicita incorporar B.')).toContain('incorporar B.');
  });

  it('merges the full captured PRUEBAS body even when the first attempt ends mid-word', () => {
    const document = JSON.parse(readFileSync('audit/final-contestaciones-validation/run-2026-10-02T21-56-42-990Z/laboral/generated-document.json', 'utf8'));
    const body = document.sections.find((section: any) => section.id === 'sec-con-pruebas').content[0].text;
    // The sanitizer removed the first title; the second title locates the actual restart.
    const restart = body.indexOf('PRUEBAS');
    expect(restart).toBe(4093);
    const first = `PRUEBAS\n\n${body.slice(0, restart).trim()}`;
    const continuation = body.slice(restart).trim();
    expect(first.endsWith('testimon')).toBe(true);
    const result = stitchTruncatedText(first, continuation);
    expect(result).toBe(continuation);
    expect(result).toContain('Por lo tanto, la pretensión de reinstalación');
  });

  const unsupportedCases = [
    ['testimonial', 'evidence', 'TESTIMONIAL DE LOS TESTIGOS QUE SE NOMINEN EN EL ACTO DE AUDIENCIA.', 'UNCONFIRMED_EVIDENCE'],
    ['pericial', 'evidence', 'Se ofrece pericial contable del perito que se designe.', 'UNCONFIRMED_EVIDENCE'],
    ['documental', 'evidence', 'Se ofrece documental consistente en contrato inexistente de fecha 20 de agosto.', 'UNCONFIRMED_EVIDENCE'],
    ['inspección', 'evidence', 'Se ofrece inspección judicial de las instalaciones.', 'UNCONFIRMED_EVIDENCE'],
    ['norma no verificada', 'legal_grounds', '[NO VERIFICADO: Ley X] establece que el demandado debe acreditar la continuidad.', 'UNVERIFIED_LEGAL_ASSERTION'],
    ['valor pleno', 'argument', 'La prueba documental tiene valor probatorio pleno para acreditar la continuidad de la prestación de servicios.', 'ABSOLUTE_EVIDENCE_VALUATION'],
    ['carga probatoria', 'argument', 'La carga de la prueba corresponde a la actora.', 'UNSUPPORTED_PROOF_RULE'],
    ['costas no solicitadas', 'petition', 'Se solicita condenar a la actora al pago de costas.', 'UNSUPPORTED_PETITION'],
  ];
  it.each(unsupportedCases)('does not admit %s from provider output', async (_label, kind, content, code) => {
    const { doc, block, trace } = generationFixture();
    block.sectionType = kind;
    block.title = kind === 'evidence' ? 'PRUEBAS' : kind === 'petition' ? 'PETITORIOS' : 'ARGUMENTOS';
    runFastModeMock.mockResolvedValueOnce(providerResponse({ content }));
    const result = await generateLegalBlock(block, doc, buildDocumentIndex([]), undefined, 'Incorporar únicamente la constancia aportada.', undefined, DEFAULT_LAWYER_PROFILE, undefined, trace);
    expect(result.text).not.toContain(content);
    expect(result.text).toContain('PENDIENTE');
    expect(result.warnings.join(' ')).toContain(code);
    expect(trace.trace.taskExecutions[0].normalizedOutput).toBe(content);
    expect(trace.trace.warnings.join(' ')).toContain(code);
  });

  it('preserves the exact evidence description explicitly offered by the client', async () => {
    const { doc, block, trace } = generationFixture();
    block.sectionType = 'evidence';
    block.title = 'PRUEBAS';
    const description = 'Registro de asistencia firmado de fecha 16 de septiembre de 2026';
    runFastModeMock.mockResolvedValueOnce(providerResponse({ content: `Se ofrece ${description}.` }));
    const result = await generateLegalBlock(block, doc, buildDocumentIndex([]), undefined, `Prueba ofrecida por cliente: ${description}.`, undefined, DEFAULT_LAWYER_PROFILE, undefined, trace);
    expect(result.text).toContain(`Se ofrece ${description}.`);
    expect(result.warnings).toEqual([]);
  });

  it('does not rewrite user-maintained content as if it were new provider output', async () => {
    const { doc, block } = generationFixture();
    block.requiresAi = false;
    block.isManuallyEdited = true;
    block.text = 'Esta parte solicita que el tribunal valore el registro aportado, sin prejuzgar su eficacia.';
    const result = await generateLegalBlock(block, doc, buildDocumentIndex([]), undefined, undefined, undefined, DEFAULT_LAWYER_PROFILE);
    expect(result.text).toBe(block.text);
  });

  it.each(['EXCEPCIONES Y DEFENSAS', 'ALEGATOS'])('does not invent termination or absolution in the deterministic %s fallback', async title => {
    const { doc, block } = generationFixture();
    doc.documentType = 'contestacion_demanda_laboral';
    doc.matter = 'laboral';
    block.title = title;
    block.requiresAi = false;
    block.text = '[Completar por la IA con fuentes autorizadas]';
    const analysis = { arguments: ['Alegación de la actora, no una defensa confirmada.'], caseTheory: { legalTheory: 'Cuestión pendiente.' }, parties: {}, caseNumbers: {} } as any;
    const result = await generateLegalBlock(block, doc, buildDocumentIndex([]), analysis, undefined, undefined, DEFAULT_LAWYER_PROFILE);
    expect(result.text).not.toMatch(/vencimiento del t[eé]rmino|agotamiento de la materia|resoluci[oó]n plenamente absolutoria|conclusi[oó]n legal de los servicios/i);
    expect(result.text).toContain('PENDIENTE');
  });

  it('continues once after length and preserves both attempts in GenerationTrace', async () => {
    const { doc, block, trace } = generationFixture();
    runFastModeMock
      .mockResolvedValueOnce(providerResponse({
        content: 'La constancia es pertinente para documentar la actuación.\n\nEl órgano debe incorporar la constancia que',
        finishReason: 'length',
        isTruncated: true,
      }))
      .mockResolvedValueOnce(providerResponse({
        content: 'la parte promovente exhibe al expediente y dar cuenta de su recepción.',
        finishReason: 'stop',
        isTruncated: false,
      }));

    const result = await (generateLegalBlock as any)(
      block,
      doc,
      buildDocumentIndex([]),
      undefined,
      'Usar únicamente hechos confirmados.',
      undefined,
      DEFAULT_LAWYER_PROFILE,
      undefined,
      trace,
    );

    expect(runFastModeMock).toHaveBeenCalledTimes(2);
    expect(result.isTruncated).toBe(false);
    expect(result.text).toContain('La constancia es pertinente para documentar la actuación.');
    expect(result.text).toContain('El órgano debe incorporar la constancia que la parte promovente exhibe al expediente');
    expect(result.text.match(/la parte promovente exhibe al expediente/gi)).toHaveLength(1);
    const attempts = trace.trace.taskExecutions;
    expect(attempts).toHaveLength(2);
    expect(attempts.map((attempt) => attempt.responseStatus)).toEqual(['truncated', 'completed']);
    expect(attempts.map((attempt) => attempt.continuationCount)).toEqual([0, 1]);
    expect(attempts.map((attempt) => attempt.completionTokens)).toEqual([92, 92]);
    expect(attempts.every((attempt) => attempt.maxTokensRequested === null && attempt.maxTokensResolved === null)).toBe(true);
    expect(runFastModeMock.mock.calls[1][0].userMessage).toContain('La constancia es pertinente para documentar la actuación.');
    expect(runFastModeMock.mock.calls[1][0].userMessage).toContain('Continúa exactamente desde');
    expect(runFastModeMock.mock.calls[1][0].userMessage).toContain('Hecho confirmado de fixture.');
  });

  it('does not continue a response that finished normally', async () => {
    const { doc, block, trace } = generationFixture();
    runFastModeMock.mockResolvedValueOnce(providerResponse({ content: 'Argumento completo.' }));

    const result = await (generateLegalBlock as any)(block, doc, buildDocumentIndex([]), undefined, undefined, undefined, DEFAULT_LAWYER_PROFILE, undefined, trace);

    expect(runFastModeMock).toHaveBeenCalledTimes(1);
    expect(result.isTruncated).toBe(false);
    expect(trace.trace.taskExecutions).toHaveLength(1);
  });

  it('retains the partial text and stays truncated when the single continuation is also cut', async () => {
    const { doc, block, trace } = generationFixture();
    runFastModeMock
      .mockResolvedValueOnce(providerResponse({ content: 'Primer párrafo completo.\n\nLa conclusión pendiente', finishReason: 'length', isTruncated: true }))
      .mockResolvedValueOnce(providerResponse({ content: 'debe analizarse con la constancia', finishReason: 'length', isTruncated: true }));

    const result = await (generateLegalBlock as any)(block, doc, buildDocumentIndex([]), undefined, undefined, undefined, DEFAULT_LAWYER_PROFILE, undefined, trace);

    expect(runFastModeMock).toHaveBeenCalledTimes(2);
    expect(result.isTruncated).toBe(true);
    expect(result.text).toContain('Primer párrafo completo.');
    expect(result.text).toContain('La conclusión pendiente debe analizarse con la constancia');
    expect(trace.trace.taskExecutions.map((attempt) => attempt.responseStatus)).toEqual(['truncated', 'truncated']);
  });
});
