import crypto from 'crypto';
import { generateNVIDIAEmbedding } from './providers/nvidiaEmbeddings';

export type EmbeddingResult = {
  embedding: number[];
  model: string;
};

const EMBEDDING_DIMENSIONS = 1024;

/**
 * Genera un embedding determinista basado en SHA-256.
 * Dimensiones: 1024 (alineado con pgvector y NVIDIA nv-embedqa-e5-v5).
 * Uso: Desarrollo local y fallback cuando no hay API key disponible.
 */
function generateDeterministicEmbedding(text: string): number[] {
  const hash = crypto.createHash('sha256').update(text).digest();

  const result = new Array(EMBEDDING_DIMENSIONS);
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    const byteIndex = i % 32;
    const offset = Math.floor(i / 32);
    result[i] = ((hash[byteIndex] + offset) % 255) / 128.0 - 1.0;
  }

  const norm = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
  return result.map((v) => v / (norm || 1));
}

/**
 * Genera un embedding para el texto dado.
 * Prioridad de proveedores:
 *   1. NVIDIA Build (EMBEDDINGS_PROVIDER=nvidia o NVIDIA_API_KEY configurada)
 *   2. OpenAI  (EMBEDDINGS_PROVIDER=openai)
 *   3. Local   (SHA-256 determinístico, dimensiones 1024)
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const provider = process.env.EMBEDDINGS_PROVIDER;

  // Usar NVIDIA si hay API key o el proveedor está configurado explícitamente
  const useNvidia = provider === 'nvidia' || (!provider && !!process.env.NVIDIA_API_KEY?.trim());

  if (useNvidia) {
    try {
      const vectors = await generateNVIDIAEmbedding(text, 'passage');
      if (vectors[0] && vectors[0].length > 0) {
        const model = process.env.EMBEDDING_MODEL || 'nvidia/nv-embedqa-e5-v5';
        return { embedding: vectors[0], model };
      }
    } catch (err) {
      console.warn('[generateEmbedding] NVIDIA falló, usando fallback:', err);
    }
  }

  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          input: text,
          // Usar text-embedding-3-small con 1024 dims para compatibilidad con pgvector
          model: process.env.EMBEDDINGS_MODEL || 'text-embedding-3-small',
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      if (data?.data?.[0]?.embedding) {
        return {
          embedding: data.data[0].embedding,
          model: process.env.EMBEDDINGS_MODEL || 'text-embedding-3-small',
        };
      }
      throw new Error('Respuesta inválida de OpenAI API');
    } catch (error) {
      console.warn('[generateEmbedding] OpenAI falló, usando fallback local.', error);
    }
  }

  return {
    embedding: generateDeterministicEmbedding(text),
    model: 'local-sha256-1024d',
  };
}
