import { NextResponse } from 'next/server';
import { GeminiProvider } from '@/lib/ai/providers/gemini';
import { GroqProvider } from '@/lib/ai/providers/groq';
import { NVIDIAProvider } from '@/lib/ai/providers/nvidia';
import { LocalProvider } from '@/lib/ai/providers/local';
import { getProviderChain } from '@/lib/ai/providerChain';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const providers = [
    ['gemini', new GeminiProvider()],
    ['groq', new GroqProvider()],
    ['nvidia', new NVIDIAProvider()],
    ['local', new LocalProvider()],
  ] as const;
  const results = await Promise.all(providers.map(async ([id, provider]) => {
    let available = false;
    try { available = await provider.isAvailable(); } catch { available = false; }
    return { id, available };
  }));
  const remoteAvailable = results.some((provider) => provider.id !== 'local' && provider.available);
  return NextResponse.json({ ok: remoteAvailable, chain: getProviderChain(), providers: results }, { status: remoteAvailable ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
