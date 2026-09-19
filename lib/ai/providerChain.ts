/**
 * lib/ai/providerChain.ts
 * Única fuente de verdad para el orden de providers.
 * Orden predeterminado: Gemini (principal) → Groq (secundario) → NVIDIA (tercero) → local (determinístico).
 */

export function getProviderChain(): string[] {
  const raw = (process.env.AI_PROVIDER_CHAIN || '').trim();
  let chain: string[] = [];
  if (raw) {
    chain = raw.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean)
      .filter((p) => ['gemini', 'groq', 'nvidia', 'local'].includes(p));
  }

  if (chain.length === 0) {
    chain = ['gemini', 'groq', 'nvidia', 'local'];
  }

  // Si NVIDIA_PRIMARY_PROVIDER === 'true', NVIDIA se coloca al frente
  if (process.env.NVIDIA_PRIMARY_PROVIDER?.trim().toLowerCase() === 'true') {
    chain = chain.filter((p) => p !== 'nvidia');
    chain.unshift('nvidia');
  }

  // Deduplicar manteniendo orden
  const seen = new Set<string>();
  chain = chain.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
  if (!chain.includes('local')) chain.push('local');
  return chain;
}

export function isNvidiaPrimary(): boolean {
  const flag = process.env.NVIDIA_PRIMARY_PROVIDER?.trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return getProviderChain()[0] === 'nvidia';
}

export function getNvidiaModel(): string {
  return process.env.NVIDIA_MODEL?.trim() || process.env.GLM_MODEL?.trim() || 'meta/llama-3.2-11b-vision-instruct';
}
