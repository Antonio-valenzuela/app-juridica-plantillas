import { defaultProviderRouter } from '../lib/ai/providerRouter';

async function testGemini() {
  process.env.GEMINI_MODEL = 'gemini-2.5-flash';
  const p = defaultProviderRouter.getProvider('gemini');
  try {
    const res = await p!.generate({
      systemPrompt: 'Responde estrictamente en formato JSON',
      userMessage: 'Genera un objeto con un campo "saludo" que diga "Hola mundo"',
      outputSchema: {
        type: 'object',
        properties: {
          saludo: { type: 'string' }
        },
        required: ['saludo']
      },
      maxTokens: 100,
      externalProviderOptIn: true,
      privateCaseContext: false,
    });
    console.log('SUCCESS:', res.success);
    console.log('CONTENT:', res.content);
  } catch (e: any) {
    console.error('ERROR:', e.message);
  }
}

testGemini();
