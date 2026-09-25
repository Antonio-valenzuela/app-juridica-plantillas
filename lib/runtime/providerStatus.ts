export interface ProviderStatusSnapshot {
  chain?: string[];
  providers?: Array<{ id: string; available: boolean }>;
  ok?: boolean;
}

export interface ProviderIndicator {
  tone: 'success' | 'warning' | 'danger';
  label: 'Cadena IA disponible' | 'Modo local disponible' | 'Generación no disponible';
}

export function deriveProviderIndicator(snapshot: ProviderStatusSnapshot | null | undefined): ProviderIndicator {
  const providers = snapshot?.providers || [];
  const remoteAvailable = providers.some((provider) => provider.id !== 'local' && provider.available);
  const localAvailable = providers.some((provider) => provider.id === 'local' && provider.available);
  if (snapshot?.ok && remoteAvailable) return { tone: 'success', label: 'Cadena IA disponible' };
  if (localAvailable) return { tone: 'warning', label: 'Modo local disponible' };
  return { tone: 'danger', label: 'Generación no disponible' };
}
