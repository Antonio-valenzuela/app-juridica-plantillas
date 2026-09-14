import { fetch } from "undici";

export interface OCRPipelineResult {
  hasValidText: boolean;
  extractedText: string;
  isScannedPdf: boolean;
  ocrApplied: boolean;
}

export function isScannedPdf(extractedText: string | null | undefined): boolean {
  if (!extractedText) return true;
  const clean = extractedText.trim();
  if (clean.length < 50) return true;

  const words = clean.split(/\s+/).filter((w) => w.length > 2);
  return words.length < 10;
}

export async function processPdfOcrPipeline(
  extractedText: string | null,
  pdfBuffer?: Buffer | string
): Promise<OCRPipelineResult> {
  const needsOcr = isScannedPdf(extractedText);

  // Si ya tiene texto suficiente y válido, NO se ejecuta el OCR
  if (!needsOcr && extractedText) {
    return {
      hasValidText: true,
      extractedText,
      isScannedPdf: false,
      ocrApplied: false,
    };
  }

  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  const baseUrl = (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");
  const model = process.env.OCR_MODEL || "meta/llama-3.2-90b-vision-instruct";

  if (!apiKey || !pdfBuffer) {
    return {
      hasValidText: false,
      extractedText: extractedText || "",
      isScannedPdf: true,
      ocrApplied: false,
    };
  }

  try {
    const base64Data = typeof pdfBuffer === "string" ? pdfBuffer : pdfBuffer.toString("base64");

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcripción OCR de documento jurídico escaneado. Conserva artículos, numerales y estructura exacta.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Data}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Nemotron OCR] HTTP ${response.status}: ${errText}`);
      return {
        hasValidText: false,
        extractedText: extractedText || "",
        isScannedPdf: true,
        ocrApplied: false,
      };
    }

    const data = (await response.json()) as any;
    const transcribedText = data?.choices?.[0]?.message?.content?.trim() || "";

    return {
      hasValidText: transcribedText.length > 0,
      extractedText: transcribedText || extractedText || "",
      isScannedPdf: true,
      ocrApplied: transcribedText.length > 0,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Nemotron OCR] Error en el pipeline OCR:", msg);
    return {
      hasValidText: false,
      extractedText: extractedText || "",
      isScannedPdf: true,
      ocrApplied: false,
    };
  }
}
