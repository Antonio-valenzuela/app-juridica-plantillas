import { defaultProviderRouter } from '../lib/ai/providerRouter';
import { getProviderChain } from '../lib/ai/providerChain';

async function testProviders() {
  console.log('Configured chain:', getProviderChain());
  
  for (const p of ['gemini', 'groq', 'nvidia']) {
    const provider = defaultProviderRouter.getProvider(p as any);
    if (!provider) {
      console.log(`Provider ${p}: NOT CONFIGURED`);
      continue;
    }
    const avail = await provider.isAvailable();
    console.log(`Provider ${p} isAvailable:`, avail);
    if (avail) {
      try {
        const start = Date.now();
        const res = await provider.generate({
          systemPrompt: 'Responde de forma muy breve (una oración).',
          userMessage: 'Di "Generador operativo".',
          maxTokens: 50,
          temperature: 0.1,
          externalProviderOptIn: true,
          privateCaseContext: false,
        });
        console.log(`Provider ${p} generate result:`, {
          success: res.success,
          model: res.model,
          latencyMs: Date.now() - start,
          content: res.content?.slice(0, 100),
          error: res.errorCode || res.warnings,
        });
      } catch (err) {
        console.log(`Provider ${p} error:`, err);
      }
    }
  }
}

testProviders();
