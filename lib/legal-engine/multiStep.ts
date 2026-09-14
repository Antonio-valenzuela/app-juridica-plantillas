import type { PipelineTraceStep, UploadedSourceDocument } from './types';
import { buildGenerationContext, type GenerationContext } from './context';

export async function runMultiStepLegalQuery(input: { question: string; sources: UploadedSourceDocument[]; maxSteps?: number }): Promise<{ context: GenerationContext; trace: PipelineTraceStep[] }> {
  const maxSteps = Math.max(1, Math.min(input.maxSteps || 2, 3));
  const trace: PipelineTraceStep[] = [];
  let query = input.question;
  let context = buildGenerationContext({ instruction: query, sources: input.sources });
  for (let step = 1; step <= maxSteps; step++) {
    context = buildGenerationContext({ instruction: query, sources: input.sources });
    trace.push({ step, stage: 'retrieve', query, references: context.references, note: step === 1 ? 'Recuperación inicial por relevancia.' : 'Recuperación de seguimiento sobre la evidencia previa.' });
    const terms = context.chunks.flatMap((chunk) => chunk.text.match(/[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{6,}/g) || []).slice(0, 2);
    query = `${input.question} ${terms.join(' ')}`;
  }
  return { context, trace };
}
