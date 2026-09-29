import { defaultProviderRouter } from '../lib/ai/providerRouter';

async function testGroq() {
  process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';
  const p = defaultProviderRouter.getProvider('groq');
  const res = await p!.generate({
    systemPrompt: 'Di hola',
    userMessage: 'Hola',
    maxTokens: 20,
    externalProviderOptIn: true,
    privateCaseContext: false,
  });
  console.log('Groq with llama-3.3-70b-versatile result:', {
    success: res.success,
    model: res.model,
    content: res.content,
  });
}

testGroq();
