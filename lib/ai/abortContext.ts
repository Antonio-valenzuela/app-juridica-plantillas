import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Cancelación cooperativa de la generación. Un plazo agotado aborta la señal del pipeline; esta señal
 * viaja por contexto asíncrono hasta el router y los adaptadores, de modo que ninguna llamada nueva
 * se inicie y las ya en vuelo se aborten a nivel de red.
 */
export class GenerationCancelledError extends Error {
  readonly code = 'GENERATION_CANCELLED';

  constructor() {
    super('La generación fue cancelada antes de completar la llamada al proveedor.');
    this.name = 'GenerationCancelledError';
  }
}

const abortStore = new AsyncLocalStorage<{ signal?: AbortSignal }>();

/** Fija la señal para la cadena asíncrona actual (una generación por cadena de llamadas). */
export function bindGenerationSignal(signal: AbortSignal | undefined): void {
  if (signal) abortStore.enterWith({ signal });
}

export function currentAbortSignal(): AbortSignal | undefined {
  return abortStore.getStore()?.signal;
}

export function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new GenerationCancelledError();
}

/**
 * Enlaza una señal externa con el `AbortController` interno de un adaptador. Devuelve la función que
 * retira el enlace; debe llamarse al terminar la petición para no dejar escuchadores colgados.
 */
export function linkAbortSignal(controller: AbortController, signal: AbortSignal | undefined): () => void {
  if (!signal) return () => undefined;
  if (signal.aborted) {
    controller.abort();
    return () => undefined;
  }
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

/**
 * Promesa que se rechaza al abortarse la señal. Permite que el pipeline deje de esperar de inmediato,
 * aunque un adaptador no respondiera a la cancelación. `dispose` retira el escuchador.
 */
export function abortRace(signal: AbortSignal | undefined): { promise: Promise<never>; dispose: () => void } {
  let onAbort: (() => void) | undefined;
  const promise = new Promise<never>((_, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(new GenerationCancelledError());
      return;
    }
    onAbort = () => reject(new GenerationCancelledError());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  promise.catch(() => undefined);
  return {
    promise,
    dispose: () => {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    },
  };
}

/** Espera una llamada al proveedor, pero deja de esperar al abortarse la señal aunque el adaptador no responda. */
export async function withAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  const race = abortRace(signal);
  try {
    return await Promise.race([promise, race.promise]);
  } finally {
    race.dispose();
  }
}
