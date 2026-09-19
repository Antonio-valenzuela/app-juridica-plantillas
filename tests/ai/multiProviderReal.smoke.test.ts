import "dotenv/config";
import { describe, it, expect } from "vitest";
import { GeminiProvider } from "@/lib/ai/providers/gemini";
import { GroqProvider } from "@/lib/ai/providers/groq";
import { NVIDIAProvider } from "@/lib/ai/providers/nvidia";
import { defaultProviderRouter } from "@/lib/ai/providerRouter";
import type { AIRequest } from "@/lib/ai/providers/types";

describe("Smoke Real Providers Test — Live API calls", () => {
  const pingRequest: AIRequest = {
    userMessage: "Responde únicamente con la palabra: JURIDICO_OK",
    systemPrompt: "Eres un asistente legal preciso.",
    maxTokens: 50,
    temperature: 0.1,
  };

  it("Gemini real call succeeds when configured", async () => {
    const gemini = new GeminiProvider();
    const available = await gemini.isAvailable();
    if (!available) {
      console.warn("Skipping Gemini real test: GEMINI_API_KEY not present");
      return;
    }

    const res = await gemini.generate(pingRequest);
    console.log(`[TEST-REAL] Gemini: success=${res.success}, model=${res.model}, latencyMs=${res.latencyMs}, outputChars=${res.content.length}`);
    expect(res.success).toBe(true);
    expect(res.provider).toBe("gemini");
    expect(res.content.length).toBeGreaterThan(0);
    // Never leak secrets in response
    const resString = JSON.stringify(res);
    expect(resString).not.toMatch(/AQ\.[a-zA-Z0-9_-]{10,}/);
  }, 30000);

  it("Groq real call succeeds when configured", async () => {
    const groq = new GroqProvider();
    const available = await groq.isAvailable();
    if (!available) {
      console.warn("Skipping Groq real test: GROQ_API_KEY not present");
      return;
    }

    const res = await groq.generate(pingRequest);
    console.log(`[TEST-REAL] Groq: success=${res.success}, model=${res.model}, latencyMs=${res.latencyMs}, outputChars=${res.content.length}`);
    expect(res.success).toBe(true);
    expect(res.provider).toBe("groq");
    expect(res.content.length).toBeGreaterThan(0);
    // Never leak secrets in response
    const resString = JSON.stringify(res);
    expect(resString).not.toMatch(/gsk_[a-zA-Z0-9_-]{10,}/);
  }, 30000);

  it("NVIDIA real call succeeds when configured", async () => {
    const nvidia = new NVIDIAProvider();
    const available = await nvidia.isAvailable();
    if (!available) {
      console.warn("Skipping NVIDIA real test: NVIDIA_API_KEY not present");
      return;
    }

    const res = await nvidia.generate(pingRequest);
    console.log(`[TEST-REAL] NVIDIA: success=${res.success}, model=${res.model}, latencyMs=${res.latencyMs}, outputChars=${res.content.length}`);
    // If NVIDIA is available and succeeds, verify output
    if (res.success) {
      expect(res.provider).toBe("nvidia");
      expect(res.content.length).toBeGreaterThan(0);
    }
    const resString = JSON.stringify(res);
    expect(resString).not.toMatch(/nvapi-[a-zA-Z0-9_-]{10,}/);
  }, 45000);

  it("Router end-to-end live generation chooses primary Gemini", async () => {
    const { result, executionLogs } = await defaultProviderRouter.route(pingRequest);
    console.log(`[TEST-REAL] Router result (Gemini available): providerUsed=${result.providerActuallyUsed}, model=${result.model}, latencyMs=${result.latencyMs}`);
    expect(result.success).toBe(true);
    expect(result.providerActuallyUsed).toBe("gemini");
    expect(result.content.length).toBeGreaterThan(0);
    expect(executionLogs[0].provider).toBe("gemini");
    expect(executionLogs[0].success).toBe(true);
  }, 30000);

  it("Router live fallback to Groq when Gemini is unavailable", async () => {
    const origGeminiKey = process.env.GEMINI_API_KEY;
    try {
      delete process.env.GEMINI_API_KEY;
      const { result, executionLogs } = await defaultProviderRouter.route(pingRequest);
      console.log(`[TEST-REAL] Router fallback (Gemini unavailable): providerUsed=${result.providerActuallyUsed}, model=${result.model}, latencyMs=${result.latencyMs}`);
      expect(result.success).toBe(true);
      expect(result.providerActuallyUsed).toBe("groq");
      expect(result.content.length).toBeGreaterThan(0);
      expect(executionLogs.some((l) => l.provider === "gemini" && l.fallbackReason === "GEMINI_NO_API_KEY")).toBe(true);
      expect(executionLogs.some((l) => l.provider === "groq" && l.success)).toBe(true);
    } finally {
      process.env.GEMINI_API_KEY = origGeminiKey;
    }
  }, 30000);

  it("Router live fallback to NVIDIA when Gemini and Groq are unavailable", async () => {
    const origGeminiKey = process.env.GEMINI_API_KEY;
    const origGroqKey = process.env.GROQ_API_KEY;
    try {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GROQ_API_KEY;
      const { result, executionLogs } = await defaultProviderRouter.route(pingRequest);
      console.log(`[TEST-REAL] Router fallback (Gemini+Groq unavailable): providerUsed=${result.providerActuallyUsed}, model=${result.model}, latencyMs=${result.latencyMs}`);
      expect(result.success).toBe(true);
      expect(result.providerActuallyUsed).toBe("nvidia");
      expect(result.content.length).toBeGreaterThan(0);
      expect(executionLogs.some((l) => l.provider === "gemini" && l.fallbackReason === "GEMINI_NO_API_KEY")).toBe(true);
      expect(executionLogs.some((l) => l.provider === "groq" && l.fallbackReason === "GROQ_NO_API_KEY")).toBe(true);
      expect(executionLogs.some((l) => l.provider === "nvidia" && l.success)).toBe(true);
    } finally {
      process.env.GEMINI_API_KEY = origGeminiKey;
      process.env.GROQ_API_KEY = origGroqKey;
    }
  }, 45000);
});

