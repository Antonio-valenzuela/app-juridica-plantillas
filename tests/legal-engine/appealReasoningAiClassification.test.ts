import { describe, expect, it, vi } from 'vitest';
import {
  classifyAppealReasoningBlocks,
  type AppealClassificationBlockInput,
  type AppealClassificationContext,
  type AppealProviderRequest,
} from '@/lib/legal-engine/case-extraction/appealReasoningAiClassification';

const sourceText = 'Este juzgado determina que no se acreditó la entrega del bien reclamado.';
const block = (id = 'block-1', text = sourceText): AppealClassificationBlockInput => ({
  id, resolutionId: 'resolution-1', section: 'CONSIDERANDO PRIMERO', kind: 'REASONING',
  pages: [5], sourceText: text,
  sourceSpans: [{ sourceId: 'source-1', page: 5, start: 100, end: 100 + text.length, excerpt: text }],
  fallback: { impact: 'ADVERSE', appliedRule: 2, classificationReason: 'Determinístico de respaldo.' },
});
const context = {
  documentType: 'apelacion_civil', representedRole: 'actor' as const, representedNames: ['PERSONA ALFA'],
  globalOutcome: { impact: 'ADVERSE' as const, classificationReason: 'Resolutivo adverso.' },
} satisfies AppealClassificationContext;
const valid = {
  afectacion: 'ADVERSE', regla: 2, razon_breve: 'El juzgado tuvo por no acreditado el hecho.',
  cita_literal: sourceText,
};
const providerResult = (content: string, provider = 'gemini') => ({ success: true, provider, content });

describe('appeal reasoning AI classification', () => {
  it('accepts only strict JSON with a complete literal sentence from the full block span', async () => {
    const call = vi.fn(async (_request: AppealProviderRequest) => providerResult(JSON.stringify(valid)));
    const [result] = await classifyAppealReasoningBlocks([block()], context, call, { promptVersion: 'test-valid' });
    expect(result).toMatchObject({
      blockId: 'block-1', impact: 'ADVERSE', appliedRule: 2, status: 'AI_VALIDATED',
      citationValidated: true, validatedQuote: sourceText,
    });
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0].userMessage).toContain('PERSONA ALFA');
    expect(call.mock.calls[0][0].userMessage).toContain('Resolutivo adverso.');
    expect(call.mock.calls[0][0].userMessage).toContain(sourceText);
    expect(call.mock.calls[0][0].outputSchema.required).toEqual(['afectacion', 'regla', 'razon_breve', 'cita_literal']);
  });

  it('allows the two anonymized civil and family structures to classify with their confirmed roles', async () => {
    const cases = [
      { type: 'apelacion_civil', role: 'actor' as const, name: 'PERSONA CIVIL', text: sourceText },
      { type: 'apelacion_familiar', role: 'demandado' as const, name: 'PERSONA FAMILIAR', text: 'Este juzgado concluye que la prueba fue insuficiente para demostrar el pago.' },
    ];
    for (const [index, item] of cases.entries()) {
      const itemBlock = block(`structure-${index}`, item.text);
      const call = vi.fn(async (_request: AppealProviderRequest) => providerResult(JSON.stringify({
        ...valid, cita_literal: item.text,
      })));
      const [result] = await classifyAppealReasoningBlocks([itemBlock], {
        ...context, documentType: item.type, representedRole: item.role, representedNames: [item.name],
      }, call, { promptVersion: `test-structure-${index}` });
      expect(result.status).toBe('AI_VALIDATED');
      expect(call.mock.calls[0][0].userMessage).toContain(item.name);
      expect(call.mock.calls[0][0].userMessage).toContain(item.text);
    }
  });

  it('rejects a citation that does not occur in the block, even if it contains a refusal phrase', async () => {
    const call = vi.fn(async (_request: AppealProviderRequest) => providerResult(JSON.stringify({
      ...valid, cita_literal: 'Este juzgado declara improcedente la acción intentada.',
    })));
    const [result] = await classifyAppealReasoningBlocks([block()], context, call, { promptVersion: 'test-fake-quote' });
    expect(result).toMatchObject({ impact: 'UNDETERMINED', status: 'INDETERMINATE', citationValidated: false, reasonCode: 'CITATION_NOT_IN_BLOCK' });
  });

  it('accepts a clean long citation aligned to OCR noise and returns the original source span', async () => {
    const noisy = 'La entrega resulta insuficiente para demostrar la recepci0n documental.';
    const clean = 'La entrega resulta insuficiente para demostrar la recepción documental.';
    const call = vi.fn(async (_request: AppealProviderRequest) => providerResult(JSON.stringify({
      ...valid, cita_literal: clean,
    })));
    const [result] = await classifyAppealReasoningBlocks([block('ocr-noise', noisy)], context, call, { promptVersion: 'test-ocr-clean-citation' });
    expect(result).toMatchObject({
      status: 'AI_VALIDATED', impact: 'ADVERSE', citationValidated: true,
      validatedQuote: noisy,
      validatedCitation: { sourceId: 'source-1', page: 5, start: 100, end: 100 + noisy.length, excerpt: noisy },
    });
  });

  it('rejects a citation copied from a different block', async () => {
    const otherBlockQuote = 'La entrega resulta insuficiente por la falta de reconocimiento documental.';
    const ownBlock = block('own-block', 'El expediente describe la fecha en que se ofreció la constancia documental.');
    const call = vi.fn(async (_request: AppealProviderRequest) => providerResult(JSON.stringify({ ...valid, cita_literal: otherBlockQuote })));
    const [result] = await classifyAppealReasoningBlocks([ownBlock], context, call, { promptVersion: 'test-other-block-citation' });
    expect(result).toMatchObject({ status: 'INDETERMINATE', citationValidated: false, reasonCode: 'CITATION_NOT_IN_BLOCK' });
  });

  it('requires exact normalized matching for citations shorter than six words', async () => {
    const shortSource = 'La prueba fue insuficiente.';
    const call = vi.fn(async (_request: AppealProviderRequest) => providerResult(JSON.stringify({
      ...valid, cita_literal: 'La prueba fue insuficient.' ,
    })));
    const [result] = await classifyAppealReasoningBlocks([block('short-citation', shortSource)], context, call, { promptVersion: 'test-short-citation-exact' });
    expect(result).toMatchObject({ status: 'INDETERMINATE', citationValidated: false, reasonCode: 'CITATION_NOT_IN_BLOCK' });
  });

  it('does not accept malformed JSON after the single permitted retry', async () => {
    const call = vi.fn(async (_request: AppealProviderRequest) => providerResult('{broken json'));
    const [result] = await classifyAppealReasoningBlocks([block()], context, call, { promptVersion: 'test-invalid-json' });
    expect(result).toMatchObject({ impact: 'UNDETERMINED', status: 'INDETERMINATE', reasonCode: 'INVALID_JSON' });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('uses the current deterministic result with a warning when the provider times out', async () => {
    const call = vi.fn(async (_request: AppealProviderRequest) => { throw new Error('provider timeout'); });
    const [result] = await classifyAppealReasoningBlocks([block()], context, call, { promptVersion: 'test-timeout' });
    expect(result).toMatchObject({ impact: 'ADVERSE', status: 'DETERMINISTIC_FALLBACK', reasonCode: 'PROVIDER_TIMEOUT' });
    expect(result.warning).toBeTruthy();
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('rejects adverse labels unless the validated quote contains an actual rejection or insufficiency conclusion', async () => {
    const neutralText = 'Este juzgado analiza la documentación y describe el trámite procesal.';
    const call = vi.fn(async (_request: AppealProviderRequest) => providerResult(JSON.stringify({
      ...valid, cita_literal: neutralText,
    })));
    const [result] = await classifyAppealReasoningBlocks([block('neutral-source', neutralText)], context, call, { promptVersion: 'test-no-adverse-anchor' });
    expect(result).toMatchObject({ impact: 'UNDETERMINED', status: 'INDETERMINATE', reasonCode: 'ADVERSE_WITHOUT_REJECTION_SPAN' });
  });

  it('never treats the local deterministic provider as a successful legal AI classification', async () => {
    const call = vi.fn(async (_request: AppealProviderRequest) => providerResult(JSON.stringify(valid), 'local'));
    const [result] = await classifyAppealReasoningBlocks([block()], context, call, { promptVersion: 'test-local-fallback' });
    expect(result).toMatchObject({ impact: 'ADVERSE', status: 'DETERMINISTIC_FALLBACK', reasonCode: 'PROVIDER_UNAVAILABLE' });
  });

  it('obeys the per-resolution provider call budget and keeps unprocessed blocks on deterministic fallback', async () => {
    const call = vi.fn(async (_request: AppealProviderRequest) => providerResult(JSON.stringify(valid)));
    const results = await classifyAppealReasoningBlocks([block('one'), block('two')], context, call, {
      promptVersion: 'test-call-budget', maxCallsPerResolution: 1,
    });
    expect(call).toHaveBeenCalledTimes(1);
    expect(results[1]).toMatchObject({ status: 'DETERMINISTIC_FALLBACK', reasonCode: 'CALL_LIMIT_REACHED' });
  });

  it('does not invoke the provider without explicit external-provider consent', async () => {
    const call = vi.fn(async (_request: AppealProviderRequest) => providerResult(JSON.stringify(valid)));
    const [result] = await classifyAppealReasoningBlocks([block()], context, call, {
      promptVersion: 'test-consent-required', externalProviderOptIn: false,
    });
    expect(result).toMatchObject({ status: 'DETERMINISTIC_FALLBACK', reasonCode: 'EXTERNAL_CONSENT_REQUIRED' });
    expect(call).not.toHaveBeenCalled();
  });

  it('caches by block, confirmed party and prompt version to avoid duplicate provider calls', async () => {
    const call = vi.fn(async (_request: AppealProviderRequest) => providerResult(JSON.stringify(valid)));
    const options = { promptVersion: 'test-cache-version' };
    const first = await classifyAppealReasoningBlocks([block('cached-block')], context, call, options);
    const second = await classifyAppealReasoningBlocks([block('cached-block')], context, call, options);
    expect(first[0].status).toBe('AI_VALIDATED');
    expect(second[0]).toEqual(first[0]);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('keeps an over-budget block on deterministic fallback without sending a truncated excerpt', async () => {
    const large = block('large-block', `${sourceText} ${'texto de continuación. '.repeat(160)}`);
    const call = vi.fn(async (_request: AppealProviderRequest) => providerResult(JSON.stringify(valid)));
    const [result] = await classifyAppealReasoningBlocks([large], context, call, {
      promptVersion: 'test-input-budget', maxTokensPerBlock: 256,
    });
    expect(result).toMatchObject({ status: 'DETERMINISTIC_FALLBACK', reasonCode: 'BLOCK_TOKEN_LIMIT' });
    expect(call).not.toHaveBeenCalled();
  });
});
