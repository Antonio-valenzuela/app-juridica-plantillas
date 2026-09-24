import { getProviderChain } from './providerChain';

export type DisclosureProvider = {
  provider: 'Gemini' | 'Groq' | 'NVIDIA' | 'local';
  mode: 'LOCAL' | 'EXTERNAL';
  configured: boolean;
  active: boolean;
  functions: string[];
};

export type ProviderDisclosure = {
  externalTransfer: boolean;
  contentNotice: string;
  retentionNotice: string;
  providers: DisclosureProvider[];
};

const externalProviders = [
  { id: 'gemini', provider: 'Gemini' as const, env: 'GEMINI_API_KEY', functions: ['generación de borradores', 'regeneración selectiva'] },
  { id: 'groq', provider: 'Groq' as const, env: 'GROQ_API_KEY', functions: ['generación de borradores', 'regeneración selectiva'] },
  { id: 'nvidia', provider: 'NVIDIA' as const, env: 'NVIDIA_API_KEY', functions: ['análisis estructural', 'generación de borradores', 'regeneración selectiva'] },
];

export function getProviderDisclosure(env: NodeJS.ProcessEnv = process.env): ProviderDisclosure {
  const chain = getProviderChain();
  const providers: DisclosureProvider[] = [];

  for (const item of externalProviders) {
    const configured = Boolean(env[item.env]?.trim());
    if (!configured && !chain.includes(item.id)) continue;
    providers.push({
      provider: item.provider,
      mode: 'EXTERNAL',
      configured,
      active: configured && chain.includes(item.id),
      functions: item.functions,
    });
  }

  if (chain.includes('local')) {
    providers.push({
      provider: 'local',
      mode: 'LOCAL',
      configured: true,
      active: true,
      functions: ['fallback determinista cuando no hay proveedor externo disponible'],
    });
  }

  const externalTransfer = providers.some((provider) => provider.mode === 'EXTERNAL' && provider.active);
  return {
    externalTransfer,
    contentNotice: externalTransfer
      ? 'El contenido jurídico de las funciones indicadas puede enviarse a los proveedores externos activos y salir del equipo.'
      : 'Las funciones activas no indican transferencia a un proveedor externo; el fallback disponible opera localmente.',
    retentionNotice: 'La disponibilidad y retención del contenido enviado dependen de la configuración y condiciones del proveedor activo; la aplicación no las controla.',
    providers,
  };
}
