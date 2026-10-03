import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadActiveManual } from '@/lib/operational-manual/store';
import { retrieveManualRules, formatManualTaskContext, type ManualIndex, type ManualMatter } from '@/lib/operational-manual/core';

const { runFastModeMock } = vi.hoisted(() => ({ runFastModeMock: vi.fn() }));
vi.mock('@/lib/ai/orchestrator', () => ({ runFastMode: runFastModeMock }));

import { generateLegalBlock, buildBlockManualMethodology } from '@/lib/legal-engine/pipeline';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';
import { DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';

const manual: ManualIndex = JSON.parse(readFileSync('data/documents/operational-manual/v1.0/index.json', 'utf8'));
const asMatter = (value: string): ManualMatter => value as ManualMatter;
const MANUAL_HEADER = 'GUÍA OPERATIVA INTERNA LEX PLANTILLAS';

function providerOk(content: string) {
  return {
    provider: 'offline-fixture', model: 'offline', success: true, content, latencyMs: 1,
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop', isTruncated: false,
  };
}

function appealFixture() {
  const doc = createEmptyDocument({
    id: 'manual-appeal', documentType: 'apelacion_civil', documentTypeLabel: 'recurso de apelación civil',
    matter: 'civil', jurisdiction: 'local civil', flow: 'DOCUMENT_ANALYSIS',
  });
  doc.generationMetadata.externalProviderOptIn = true;
  doc.caseRefs = { ...doc.caseRefs, expediente: '1152/2013' };
  const block = {
    id: 'sec-agravios', kind: 'argument', sectionType: 'argument', title: 'AGRAVIOS', level: 1, order: 11,
    text: 'AGRAVIOS: desarrollar los agravios individualizados conforme al expediente.',
    sourceElementIndices: [], pages: { start: 1, end: 1 },
    aiNeed: 'REQUIRES_AI', requiresAi: true, classificationReason: 'fixture offline',
    elementCount: 1, charCount: 60,
    context: { facts: ['Hecho confirmado de fixture.'], norms: [], jurisprudence: [], caseNumbers: [], authorities: [] },
  } as any;
  const trace = createGenerationTraceContext({
    generationId: 'manual-appeal-trace', doc,
    options: { enabled: true, now: () => new Date('2026-10-01T12:00:00.000Z'), monotonicNow: () => 10 },
  });
  return { doc, block, trace };
}

const runBlock = ({ doc, block, trace }: ReturnType<typeof appealFixture>) =>
  generateLegalBlock(block, doc, {} as any, undefined, undefined, undefined, DEFAULT_LAWYER_PROFILE, undefined, trace);

describe('la Guía Operativa llega al generador como metodología interna, nunca como autoridad', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', 'offline-manual-key');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('NVIDIA_API_KEY', '');
    runFastModeMock.mockReset();
    runFastModeMock.mockResolvedValue(providerOk('AGRAVIO PRIMERO. La resolución recurrida omitió pronunciarse sobre la prueba documental.'));
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it('el retrieval de AGRAVIOS recupera metodología de agravio, silogismo y congruencia', () => {
    const selection = retrieveManualRules(manual, {
      matter: asMatter('CIVIL'), caseType: 'apelacion_civil',
      task: 'AGRAVIOS metodologia del agravio silogismo premisa mayor premisa menor conclusion congruencia peticiones',
      stage: 'AGRAVIOS', budgetChars: 4500,
      measureContext: rules => formatManualTaskContext(rules).length,
    });
    const text = selection.selected.map(rule => rule.originalText).join('\n');
    expect(selection.selected.length).toBeGreaterThan(0);
    expect(text).toMatch(/agravio/i);
    expect(text).toMatch(/premisa|mayor|menor|silogismo/i);
    expect(text).toMatch(/petici[oó]n|congruencia/i);
  });

  it('nunca se inyecta el Manual completo: el contexto está acotado y es trazable', () => {
    const context = formatManualTaskContext(
      retrieveManualRules(manual, { matter: asMatter('CIVIL'), caseType: 'apelacion_civil', task: 'AGRAVIOS', budgetChars: 4500 }).selected,
    );
    expect(context.length).toBeGreaterThan(0);
    expect(context.length).toBeLessThanOrEqual(6500);
    expect(context).toContain(MANUAL_HEADER);
    // Declarado como no autoridad dentro del propio prompt.
    expect(context).toMatch(/NO ES AUTORIDAD JUR/);
    // Cada fragmento conserva página: trazabilidad sin citar el PDF completo.
    expect(context).toMatch(/página física \d+/);
    expect(context).not.toContain('%PDF');
    expect(context.length).toBeLessThan(manual.pages.reduce((sum, page) => sum + page.text.length, 0) / 10);
  });

  it('el prompt del bloque AGRAVIOS incluye la metodología del Manual antes de generar', async () => {
    await runBlock(appealFixture());
    expect(runFastModeMock).toHaveBeenCalled();
    const userMessage = String(runFastModeMock.mock.calls[0][0].userMessage);
    expect(userMessage).toContain(MANUAL_HEADER);
  });

  it('el Manual se recupera por sección y la metodología de agravios es pertinente', async () => {
    const { doc } = appealFixture();
    const agravios = await buildBlockManualMethodology(doc, 'AGRAVIOS', 'argument');
    expect(agravios.context).toContain(MANUAL_HEADER);
    expect(agravios.selectedRuleIds.length).toBeGreaterThan(0);
    expect(agravios.manualVersion).toBe('1.0');
    expect(agravios.manualHash).toBe(manual.manifest.sourceHash);
    expect(agravios.context).toMatch(/agravio/i);
  });

  it('el trace registra manualVersion, páginas y fragmentos usados', async () => {
    const fixture = appealFixture();
    await runBlock(fixture);
    const manualTrace = fixture.trace.close().operationalManual;
    expect(manualTrace).toBeDefined();
    expect(manualTrace!.manualVersion).toBe('1.0');
    expect(manualTrace!.manualHash).toBe(manual.manifest.sourceHash);
    expect(manualTrace!.selectedPages.length).toBeGreaterThan(0);
    const blockRetrieval = manualTrace!.retrievals.find(entry => entry.retrievalStage === 'LEGACY_BLOCK');
    expect(blockRetrieval).toBeDefined();
    expect(blockRetrieval!.selectedRuleIds.length).toBeGreaterThan(0);
  });

  it('el Manual es CANONICAL, activo y está indexado completo', () => {
    expect(manual.manifest.version).toBe('1.0');
    expect(manual.manifest.active).toBe(true);
    expect(manual.manifest.errors).toHaveLength(0);
    expect(manual.manifest.detectedPages).toBe(212);
    expect(manual.fragments.length).toBeGreaterThan(1000);
  });

  it('el Manual jamás satisface verificación de autoridad: no se proyecta a VERIFIED', () => {
    const selection = retrieveManualRules(manual, {
      matter: asMatter('CIVIL'), caseType: 'apelacion_civil', task: 'articulo 421 cargas de la prueba jurisprudencia', budgetChars: 4500,
    });
    for (const fragment of selection.selected) {
      expect(fragment).not.toHaveProperty('verificationStatus');
      expect(fragment).not.toHaveProperty('sourceTier');
      expect(fragment.sourceDocumentId).toBe('lex-plantillas-operativo-juridico');
    }
    const text = selection.selected.map(fragment => fragment.originalText).join('\n');
    expect(text).toMatch(/verificar|no inventar|distingue siempre|fuente oficial/i);
  });

  it('loadActiveManual resuelve el mismo Manual indexado en el repositorio', async () => {
    const active = await loadActiveManual();
    expect(active).not.toBeNull();
    expect(active!.manifest.version).toBe('1.0');
    expect(active!.manifest.sourceHash).toBe(manual.manifest.sourceHash);
  });
});