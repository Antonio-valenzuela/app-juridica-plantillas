import { describe, expect, it } from "vitest";
import { isScannedPdf, processPdfOcrPipeline } from "../../lib/file/ocrPipeline";

describe("Subfase B - Nemotron OCR Inteligente", () => {
  it("detecta un PDF con texto suficiente y omite el procesamiento OCR", () => {
    const text = "En la ciudad de Guadalajara, Jalisco, a 5 de agosto de 2026, comparecen las partes en el juicio ordinario civil número 456/2026 ante la presencia judicial...";
    expect(isScannedPdf(text)).toBe(false);
  });

  it("detecta un PDF escaneado con texto vacío o escaso", () => {
    expect(isScannedPdf(null)).toBe(true);
    expect(isScannedPdf("")).toBe(true);
    expect(isScannedPdf("Pagina 1")).toBe(true);
  });

  it("devuelve el texto extraído directamente sin llamar al OCR si el PDF ya es válido", async () => {
    const validText = "En la ciudad de Guadalajara, Jalisco, a 5 de agosto de 2026, se dicta sentencia definitiva sobre la acción reivindicatoria del inmueble ubicado en Zapopan.";
    const result = await processPdfOcrPipeline(validText);

    expect(result.hasValidText).toBe(true);
    expect(result.ocrApplied).toBe(false);
    expect(result.extractedText).toBe(validText);
  });
});
