import { describe, expect, it } from "vitest";
import { getLocalDeterministicVector, generateNVIDIAEmbedding } from "../../lib/ai/providers/nvidiaEmbeddings";

describe("Subfase A - Nemotron Embeddings & Búsqueda Vectorial", () => {
  it("genera vectores locales deterministas de 1024 dimensiones para fallbacks", () => {
    const text = "Ley Federal del Trabajo Artículo 123";
    const v1 = getLocalDeterministicVector(text, 1024);
    const v2 = getLocalDeterministicVector(text, 1024);

    expect(v1).toHaveLength(1024);
    expect(v1).toEqual(v2);
  });

  it("devuelve vectores normalizados usando el cache y fallback cuando no hay API key", async () => {
    const originalKey = process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_API_KEY;

    const vectors = await generateNVIDIAEmbedding("Consulta de prueba de amparo indirecto", "query");
    expect(vectors).toHaveLength(1);
    expect(vectors[0]).toHaveLength(1024);

    if (originalKey) process.env.NVIDIA_API_KEY = originalKey;
  });
});
