/**
 * lib/ai/providerChain.ts
 * ÚNICA fuente de verdad para el orden de providers.
 * NVIDIA es primario cuando NVIDIA_PRIMARY_PROVIDER !== 'false'.
 * Usado por orchestrator y router (wrapper) para evitar selección duplicada contradictoria.
 */

export function getProviderChain(): string[] {
  // NVIDIA ONLY: nvidia → local (determinístico). Mantiene AI_PROVIDER_CHAIN para compatibilidad pero filtra a nvidia/local.
  const raw = (process.env.AI_PROVIDER_CHAIN || 'nvidia,local').trim();
  let chain = raw.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean)
    .filter((p) => p === 'nvidia' || p === 'local');
  if (chain.length === 0) chain = ['nvidia', 'local'];
  if (!chain.includes('nvidia')) chain.unshift('nvidia');
  if (!chain.includes('local')) chain.push('local');
  // Deduplicar
  const seen = new Set<string>();
  chain = chain.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
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
