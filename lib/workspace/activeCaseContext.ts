export interface ActiveCaseFicha {
  expediente?: string;
  autoridad?: string;
  actor?: string;
  demandado?: string;
  materia?: string;
}

export interface ActiveCaseContext {
  expedienteNumber: string;
  court?: string;
  actor?: string;
  demandado?: string;
  matter?: string;
}

export function toActiveCaseContext(ficha: ActiveCaseFicha | null | undefined): ActiveCaseContext | null {
  if (!ficha) return null;

  const expedienteNumber = ficha.expediente?.trim();
  const court = ficha.autoridad?.trim() || undefined;
  const actor = ficha.actor?.trim() || undefined;
  const demandado = ficha.demandado?.trim() || undefined;
  const matter = ficha.materia?.trim() || undefined;

  if (!expedienteNumber && !court && !actor && !demandado && !matter) return null;

  return {
    expedienteNumber: expedienteNumber || 'Sin expediente',
    ...(court ? { court } : {}),
    ...(actor ? { actor } : {}),
    ...(demandado ? { demandado } : {}),
    ...(matter ? { matter } : {}),
  };
}
