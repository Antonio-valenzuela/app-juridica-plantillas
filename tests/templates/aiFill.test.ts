import { describe, it, expect } from "vitest";
import { resolveTaxonomy, filterNoise } from "@/lib/ingest/normalize";
import { extractPdfTextServer } from "@/lib/pdf/pdfExtractor";

describe("Document Taxonomy & Noise Filtering", () => {
  it("filters navigation noise correctly", () => {
    const raw = "Inicio | Contacto | Ayuda SALDOS del mandato y fideicomiso... Rights Reserved";
    const cleaned = filterNoise(raw);
    expect(cleaned).not.toContain("Inicio | Contacto | Ayuda");
    expect(cleaned).toContain("SALDOS del mandato y fideicomiso");
  });

  it("classifies SALDOS and fideicomiso items as Información administrativa and not LEY", () => {
    const result = resolveTaxonomy("LEY", false, "SALDOS del mandato y fideicomiso");
    expect(result).toBe("Información administrativa");
  });

  it("classifies explicit laws correctly when evidence exists", () => {
    const result = resolveTaxonomy("LEY", true, "Ley de Amparo");
    expect(result).toBe("Ley");
  });
});

describe("PDF Extraction Server Unit Test", () => {
  it("rejects empty buffer gracefully", async () => {
    await expect(extractPdfTextServer(Buffer.from(""))).rejects.toThrow("vacío");
  });
});
