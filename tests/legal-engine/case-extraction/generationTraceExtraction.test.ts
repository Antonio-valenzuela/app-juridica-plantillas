import { describe, expect, it } from 'vitest';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

function source(text: string): UploadedSourceDocument {
  return { id: 'src-trace', filename: 'trace.txt', type: 'txt', content: text, extractedText: text, sourceValidated: true };
}

describe('GenerationTrace extraction record', () => {
  it('records candidate decisions and rich entity counts with one generation ID', () => {
    const trace = createGenerationTraceContext({ generationId: 'gen-extraction-1', doc: createEmptyDocument(), options: { enabled: true } });
    reconstructCaseAnalysis([source('ACTOR: Ana López\nPRESTACIONES: pago del contrato\nHECHOS:\n1. Se celebró contrato.')], 'Analizar expediente', '', { includeReferenceInAnalysis: false, trace });
    const closed = trace.close();

    expect(closed.generationId).toBe('gen-extraction-1');
    expect(closed.extraction?.sourceUnitCount).toBeGreaterThan(0);
    expect(closed.extraction?.candidateCounts.CLAIM).toBeGreaterThan(0);
    expect(closed.extraction?.decisions.length).toBeGreaterThan(0);
  });

  it('does not place raw secrets in extraction trace decisions', () => {
    const trace = createGenerationTraceContext({ generationId: 'gen-secret-test', doc: createEmptyDocument(), options: { enabled: true } });
    reconstructCaseAnalysis([source('NVIDIA_API_KEY=nvapi-secret\nHECHOS:\n1. Se registró la fuente.')], 'Analizar expediente', '', { trace });

    expect(JSON.stringify(trace.close())).not.toMatch(/nvapi-secret|NVIDIA_API_KEY=/i);
  });
});
