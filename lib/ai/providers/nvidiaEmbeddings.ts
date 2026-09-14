import { fetch } from "undici";

export interface NVIDIAEmbeddingResponse {
  embedding: number[];
  index: number;
}

const embeddingCache = new Map<string, number[]>();

export function getLocalDeterministicVector(text: string, dimensions: number = 1024): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  const vector: number[] = new Array(dimensions);
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    const val = Math.sin(hash + i);
    vector[i] = val;
    norm += val * val;
  }

  norm = Math.sqrt(norm) || 1;
  return vector.map((v) => v / norm);
}

export async function generateNVIDIAEmbedding(
  text: string | string[],
  inputType: "query" | "passage" = "passage"
): Promise<number[][]> {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  const baseUrl = (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");
  const model = process.env.EMBEDDING_MODEL || "nvidia/nv-embedqa-e5-v5";

  const inputs = Array.isArray(text) ? text : [text];
  const results: number[][] = [];
  const missingInputs: { index: number; text: string }[] = [];

  // Check in-memory cache for fast response and token saving
  inputs.forEach((item, idx) => {
    const cacheKey = `${inputType}:${item}`;
    if (embeddingCache.has(cacheKey)) {
      results[idx] = embeddingCache.get(cacheKey)!;
    } else {
      missingInputs.push({ index: idx, text: item });
    }
  });

  if (missingInputs.length === 0) {
    return results;
  }

  if (!apiKey) {
    missingInputs.forEach(({ index, text: item }) => {
      const fallbackVec = getLocalDeterministicVector(item, 1024);
      embeddingCache.set(`${inputType}:${item}`, fallbackVec);
      results[index] = fallbackVec;
    });
    return results;
  }

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: missingInputs.map((m) => m.text),
        model,
        input_type: inputType,
        encoding_format: "float",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[NVIDIA Embeddings] HTTP ${response.status}: ${errText}. Aplicando fallback local.`);
      missingInputs.forEach(({ index, text: item }) => {
        const fallbackVec = getLocalDeterministicVector(item, 1024);
        results[index] = fallbackVec;
      });
      return results;
    }

    const data = (await response.json()) as any;
    if (data && Array.isArray(data.data)) {
      data.data.forEach((d: any, apiIdx: number) => {
        const originalIndex = missingInputs[apiIdx].index;
        const vec = d.embedding;
        embeddingCache.set(`${inputType}:${missingInputs[apiIdx].text}`, vec);
        results[originalIndex] = vec;
      });
      return results;
    }

    throw new Error("Respuesta de embeddings inválida de NVIDIA API");
  } catch (error: any) {
    console.error("[NVIDIA Embeddings] Error en la generación:", error.message || error);
    missingInputs.forEach(({ index, text: item }) => {
      const fallbackVec = getLocalDeterministicVector(item, 1024);
      results[index] = fallbackVec;
    });
    return results;
  }
}
