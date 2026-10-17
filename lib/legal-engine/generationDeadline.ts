const STANDARD_GENERATION_JOB_DEADLINE_MS = 15 * 60 * 1000;
const EXTENDED_GENERATION_JOB_DEADLINE_MS = 25 * 60 * 1000;

export function getGenerationJobDeadlineMs(generationExtension?: { generationMode?: string } | null): number {
  const configured = Number(process.env.GENERATION_JOB_DEADLINE_MS);
  if (Number.isFinite(configured) && configured >= 60_000) {
    return Math.floor(configured);
  }

  return generationExtension?.generationMode === 'extended-legal'
    ? EXTENDED_GENERATION_JOB_DEADLINE_MS
    : STANDARD_GENERATION_JOB_DEADLINE_MS;
}

export class GenerationDeadlineError extends Error {
  readonly code = 'GENERATION_TIMEOUT';

  constructor() {
    super('El tiempo máximo de generación fue alcanzado.');
    this.name = 'GenerationDeadlineError';
  }
}

/**
 * Ejecuta la generación con plazo cooperativo: al vencer el plazo se aborta `signal`, de modo que el
 * pipeline deje de llamar a proveedores, y la promesa se rechaza con `GENERATION_TIMEOUT`.
 */
export async function runWithGenerationDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
  controller: AbortController = new AbortController(),
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  // Cualquier aborto (plazo o cancelación del usuario) rechaza con su causa: GENERATION_TIMEOUT o GENERATION_CANCELLED.
  const aborted = new Promise<never>((_, reject) => {
    const onAbort = () => reject(controller.signal.reason);
    if (controller.signal.aborted) onAbort();
    else controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  aborted.catch(() => undefined);
  timeoutId = setTimeout(() => controller.abort(new GenerationDeadlineError()), deadlineMs);
  try {
    return await Promise.race([run(controller.signal), aborted]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
