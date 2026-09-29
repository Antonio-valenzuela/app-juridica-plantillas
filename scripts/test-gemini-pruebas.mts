import fs from 'node:fs';
import { generateGeminiCompletion } from '../lib/ai/providers/gemini';

// Load .env
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      const val = (match[2] || '').trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

async function testGemini() {
  for (const m of ['gemini-flash-lite-latest', 'gemini-2.5-flash']) {
    process.env.GEMINI_MODEL = m;
    const start = Date.now();
    const res = await generateGeminiCompletion({
      prompt: 'Escribe un párrafo formal para la sección de PRUEBAS de una contestación de demanda laboral.',
      systemPrompt: 'Redactor jurídico profesional.',
      maxTokens: 2048,
    });
    console.log(`Model ${m}:`, {
      finishReason: res.finishReason,
      isTruncated: res.isTruncated,
      tokensUsed: res.tokensUsed,
      outputLength: res.text.length,
      durationMs: Date.now() - start,
    });
  }
}

testGemini();
