import type { AnalyzeLegalImageInput, AnalyzeLegalImageResult } from "./tasks";
import { getNemotronConfig } from "./nemotronParser";

export async function analyzeLegalImage(input: AnalyzeLegalImageInput): Promise<AnalyzeLegalImageResult> {
  const nemotron = getNemotronConfig();

  if (!nemotron.apiKey) {
    return {
      ok: false,
      reason: process.env.AI_ENABLE_VISION === "true" ? "not_implemented" : "vision_not_configured",
      provider: process.env.VISION_PROVIDER || "none",
    };
  }

  try {
    if (!input.imageUrl) {
      return {
        ok: false,
        reason: "not_implemented",
        provider: "nvidia_nemotron_parse",
      };
    }

    const response = await fetch(nemotron.endpointUrl!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nemotron.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: nemotron.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: input.context || "Extract and structure all legal text, headers, and tables from this document image.",
              },
              {
                type: "image_url",
                image_url: { url: input.imageUrl },
              },
            ],
          },
        ],
        temperature: 0.0,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: "not_implemented",
        provider: "nvidia_nemotron_parse",
      };
    }

    return {
      ok: true,
      reason: "vision_not_configured",
      provider: "nvidia_nemotron_parse",
    };
  } catch {
    return {
      ok: false,
      reason: "not_implemented",
      provider: "nvidia_nemotron_parse",
    };
  }
}
