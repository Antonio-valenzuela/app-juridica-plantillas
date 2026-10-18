export interface ProviderStatusSnapshot {
  chain?: string[];
  providers?: Array<{ id: string; available: boolean }>;
  ok?: boolean;
}

export interface ProviderIndicator {
  tone: 'success' | 'warning' | 'danger';
  label: 'IA en la nube configurada' | 'Solo redacción local' | 'Generación no disponible';
  /** Explicación para el abogado: qué significa y qué NO garantiza el indicador. */
  detail: string;
}

const PROVIDER_NAMES: Record<string, string> = { gemini: 'Gemini', groq: 'Groq', nvidia: 'NVIDIA' };

/**
 * El indicador solo sabe si hay clave configurada para un proveedor de la cadena vigente. No verifica que
 * el proveedor responda, no autoriza ningún envío (cada operación pide su propio consentimiento) ni anticipa
 * el resultado de la generación.
 */
export function deriveProviderIndicator(snapshot: ProviderStatusSnapshot | null | undefined): ProviderIndicator {
  const providers = snapshot?.providers || [];
  const chain = snapshot?.chain?.length ? snapshot.chain : providers.map((provider) => provider.id);
  const configured = providers.filter((provider) => provider.id !== 'local' && provider.available && chain.includes(provider.id));
  const localAvailable = providers.some((provider) => provider.id === 'local' && provider.available);
  if (snapshot?.ok && configured.length > 0) {
    const names = configured.map((provider) => PROVIDER_NAMES[provider.id] || provider.id).join(', ');
    return {
      tone: 'success',
      label: 'IA en la nube configurada',
      detail: `Configurados: ${names}. Nada se envía sin tu autorización en cada operación; si el proveedor no responde, la generación lo indicará.`,
    };
  }
  if (localAvailable) {
    return {
      tone: 'warning',
      label: 'Solo redacción local',
      detail: 'No hay proveedores de IA en la nube configurados: el borrador se arma con reglas locales y marcará lo que requiere tu redacción.',
    };
  }
  return { tone: 'danger', label: 'Generación no disponible', detail: 'No se pudo comprobar el estado de los proveedores.' };
}
