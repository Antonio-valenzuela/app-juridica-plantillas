import { describe, expect, it } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { runGenerationPipeline } from '../../lib/legal-engine/pipeline';
import { retrieveManualRules, formatManualTaskContext, type ManualIndex, type ManualMatter } from '../../lib/operational-manual/core';

const index = JSON.parse(readFileSync('data/documents/operational-manual/v1.0/index.json', 'utf8')) as ManualIndex;

describe('offline manual journeys with real pipeline and deterministic generator', () => {
  it.each(['CIVIL', 'PENAL', 'AMPARO'] as ManualMatter[])('%s retains audit trace and cannot finalize incomplete writing', async (matter) => {
    const selection = retrieveManualRules(index, { matter, task: 'análisis y redacción de escrito', budgetChars: 4500, measureContext: (rules) => formatManualTaskContext(rules).length });
    const document = await runGenerationPipeline({
      generationId: `synthetic-manual-${matter}`,
      traceOptions: { enabled: true },
      flow: 'NEW_WRITING', matter,
      documentTypeLabel: 'Escrito libre de prueba sintética',
      userInstruction: 'Verificar integración operativa sin hechos de clientes.',
      generateSection: async () => 'Borrador sintético. Artículo pendiente de verificación oficial; no constituye fundamento verificado.',
    });
    const trace = document.generationMetadata.auditTrace;
    expect(trace?.operationalManual?.manualVersion).toBe('1.0');
    expect(trace?.operationalManual?.auditFindings.length).toBeGreaterThan(0);
    expect(document.status).not.toBe('final');
    expect(selection.usedChars).toBeLessThanOrEqual(4500);
    writeFileSync(`audit/operational-manual-verification-2026-09-29/journey-${matter}.json`, JSON.stringify({
      matter, task: 'synthetic deterministic NEW_WRITING',
      manualVersion: index.manifest.version, manualHash: index.manifest.sourceHash,
      selectedRuleCount: selection.selected.length,
      selectedPages: [...new Set(selection.selected.map(r => r.physicalPage))],
      selectedRuleIds: selection.selected.map(r => r.stableRuleId),
      contextCharacters: selection.usedChars,
      discardedRuleCount: selection.discardedRulesByContextLimit.length,
      selectedRules: selection.selected,
      discardedRulesByContextLimit: selection.discardedRulesByContextLimit,
      serializedTaskManualCharacters: ('\n\nGUÍA OPERATIVA INTERNA LEX PLANTILLAS (NO ES AUTORIDAD JURÍDICA NI FUENTE DE HECHOS):\n' + selection.selected.map(rule => `[${rule.stableRuleId} | página física ${rule.physicalPage}] ${rule.originalText.trim()}`).join('\n')).length,
      auditFindings: trace?.operationalManual?.auditFindings,
      coverage: document.coverageMatrix,
      qualityGate: trace?.qualityGateResult,
      status: document.status,
      trace,
      scopeLimit: 'Custom deterministic generator bypasses GenerationTask provider execution. This is NOT evidence of a complete task-to-provider journey.',
    }, null, 2));
  }, 30000);
});
