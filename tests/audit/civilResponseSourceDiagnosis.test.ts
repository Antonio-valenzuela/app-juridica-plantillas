import { it, expect, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { appealResolutionSource } from '../fixtures/appealResolutionSource';
vi.mock('@/lib/ai/orchestrator', () => ({ runFastMode: vi.fn().mockRejectedValue(new Error('PROVIDER_NETWORK_UNAVAILABLE: simulated offline')) }));
it('records the exact sentence vs civil demand pipeline outcome offline', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('OFFLINE_TEST_NETWORK_FORBIDDEN')));
  const text = 'DEMANDA CIVIL\nJUZGADO CIVIL\nACTOR: PERSONA ALFA\nDEMANDADO: PERSONA BETA\nPRESTACIONES\nA) Pago de la cantidad adeudada conforme al contrato.\nHECHOS\n1. Las partes celebraron un contrato.\nDERECHO\nPRUEBAS\nDocumental: contrato acompañado.\nPUNTOS PETITORIOS\nTener por presentada la demanda.';
  const sources = [
    { ...appealResolutionSource, sourceValidated: true },
    createSourceDocument({ id: 'civil-demand-offline', filename: 'demanda-civil.txt', type: 'text/plain', sourceValidated: true, classification: { sourceDocumentType: 'DEMANDA_CIVIL' }, pages: [{ page: 1, text, chars: text.length }] }),
  ];
  const results: { source: string; code: string; message?: string; sections?: number }[] = [];
  try {
    for (const [index, source] of sources.entries()) {
      try {
        const result = await runGenerationPipeline({ selectedDocumentType: 'contestacion_demanda_civil', matter: 'Civil', jurisdiction: 'Jalisco', sourceDocuments: [source], userInstruction: 'Preparar borrador de contestación sin asumir postura ni hechos acreditados.', generationId: `offline-source-diagnosis-${index}` });
        results.push({ source: index ? 'DEMANDA_CIVIL' : 'SENTENCIA', code: 'DOCUMENT_RETURNED', sections: result.sections.length });
      } catch (error: any) {
        results.push({ source: index ? 'DEMANDA_CIVIL' : 'SENTENCIA', code: error.code || error.message?.split(':')[0] || 'UNCLASSIFIED', message: error.message });
      }
    }
    mkdirSync('audit/apelaciones-fase-1b', { recursive: true });
    writeFileSync('audit/apelaciones-fase-1b/source-diagnosis.json', JSON.stringify(results, null, 2));
    console.log('OFFLINE_SOURCE_DIAGNOSIS', JSON.stringify(results));
    expect(results[0].code).toBe('SOURCE_DOCUMENT_INCOMPATIBLE');
    expect(results[1].code).toBe('DOCUMENT_RETURNED');
  } finally { vi.unstubAllGlobals(); }
}, 60000);
