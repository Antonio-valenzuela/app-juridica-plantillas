export const GENERATION_STATUS_MAX_FAILURES = 3;

export type GenerationStatusReadResult =
  | {
      kind: 'success';
      data: Record<string, any>;
      consecutiveFailures: 0;
    }
  | {
      kind: 'retry';
      message: string;
      consecutiveFailures: number;
    }
  | {
      kind: 'terminal-error';
      message: string;
      consecutiveFailures: number;
    };

function statusErrorMessage(status: number, parsed?: Record<string, any>): string {
  if (status >= 500) {
    return 'El servidor no pudo responder al consultar el progreso. La generación se detuvo; puedes reintentar.';
  }
  if (status === 404 || parsed?.error === 'JOB_NOT_FOUND') {
    return 'La sesión de generación expiró o no fue encontrada.';
  }
  return parsed?.error || 'No se pudo consultar el progreso de la generación.';
}

/**
 * Clasifica una respuesta del endpoint de estado sin dejar el spinner infinito.
 * Los errores recuperables tienen un límite explícito; las respuestas de éxito,
 * incluido status=failed del job, llegan al consumidor para que muestre su causa.
 */
export function parseGenerationStatusResponse(
  status: number,
  body: string,
  consecutiveFailures: number
): GenerationStatusReadResult {
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(body) as Record<string, any>;
  } catch {
    const failures = consecutiveFailures + 1;
    const message = statusErrorMessage(status);
    return failures >= GENERATION_STATUS_MAX_FAILURES
      ? { kind: 'terminal-error', message, consecutiveFailures: failures }
      : { kind: 'retry', message, consecutiveFailures: failures };
  }

  if (status >= 200 && status < 300 && parsed?.ok === true) {
    return { kind: 'success', data: parsed, consecutiveFailures: 0 };
  }

  const failures = consecutiveFailures + 1;
  const message = statusErrorMessage(status, parsed);
  const retryable = status === 404 || status >= 500;
  if (!retryable || failures >= GENERATION_STATUS_MAX_FAILURES) {
    return { kind: 'terminal-error', message, consecutiveFailures: failures };
  }
  return { kind: 'retry', message, consecutiveFailures: failures };
}

export function classifyGenerationStatusException(
  consecutiveFailures: number
): Exclude<GenerationStatusReadResult, { kind: 'success' }> {
  const failures = consecutiveFailures + 1;
  const message = 'No se pudo conectar con el servidor para consultar el progreso. La generación se detuvo; puedes reintentar.';
  return failures >= GENERATION_STATUS_MAX_FAILURES
    ? { kind: 'terminal-error', message, consecutiveFailures: failures }
    : { kind: 'retry', message, consecutiveFailures: failures };
}
