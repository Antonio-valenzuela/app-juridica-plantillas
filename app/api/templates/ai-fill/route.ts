import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/security/adminAuth";
import { extractPdfTextServer } from "@/lib/pdf/pdfExtractor";
import { runFastMode } from "@/lib/ai/orchestrator";

const AiFillRequestSchema = z.object({
  mode: z.enum(["text", "pdf"]),
  text: z.string().optional(),
  pdfBase64: z.string().optional(),
  templateId: z.string().optional(),
  templateName: z.string().optional(),
  fields: z.record(z.string(), z.any()).optional(),
});

export const dynamic = "force-dynamic";

interface StructuredOutput {
  fields: Record<string, any>;
  missingFields: string[];
  conflicts: string[];
  warnings: string[];
}

import { requireLawyerAccess } from "@/lib/security/lawyerAuth";

export async function POST(req: Request) {
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

  try {
    const contentType = req.headers.get("content-type") || "";
    let body: any = {};
    let extractedText = "";
    let sourceKind = "text";
    let pageCount = 1;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const text = formData.get("text") as string | null;
      const templateName = formData.get("templateName") as string | null;

      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const pdfData = await extractPdfTextServer(buffer);
        extractedText = pdfData.text;
        pageCount = pdfData.numpages;
        sourceKind = "pdf";
      } else if (text) {
        extractedText = text;
      }
      body = { mode: file ? "pdf" : "text", templateName };
    } else {
      body = await req.json();
      const parsed = AiFillRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Parámetros inválidos", details: parsed.error.format() }, { status: 400 });
      }

      if (parsed.data.mode === "pdf" && parsed.data.pdfBase64) {
        const buffer = Buffer.from(parsed.data.pdfBase64, "base64");
        const pdfData = await extractPdfTextServer(buffer);
        extractedText = pdfData.text;
        pageCount = pdfData.numpages;
        sourceKind = "pdf";
      } else {
        extractedText = parsed.data.text || "";
      }
    }

    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: "No se proporcionó texto o no se pudo extraer contenido del PDF." },
        { status: 400 }
      );
    }

    // Build anti-hallucination structured prompt
    const systemPrompt = `Eres un asistente jurídico experto en extracción de datos de documentos legales mexicanos.
REGLAS OBLIGATORIAS ANTI-ALUCINACIÓN:
1. Extrae SOLAMENTE los datos explícitamente presentes en el texto del usuario o PDF.
2. Si un dato NO aparece expresamente, NO lo inventes. Déjalo como cadena vacía "" o agrégalo a "missingFields".
3. Si hay datos contradictorios en el texto, agrégalos a la lista "conflicts".
4. Devuelve un JSON ESTRICTO con la siguiente estructura exacta:
{
  "fields": {
    "quejoso": { "value": "Texto extraído", "confidence": 0.95, "evidence": { "source": "${sourceKind}", "page": 1, "paragraph": 1, "excerpt": "Fragmento literal" } },
    "autoridad_responsable": { "value": "Juzgado...", "confidence": 0.9, "evidence": { "source": "${sourceKind}", "page": 1, "paragraph": 2, "excerpt": "..." } },
    "acto_reclamado": { "value": "...", "confidence": 0.85, "evidence": { "source": "${sourceKind}", "page": 1, "paragraph": 3, "excerpt": "..." } },
    "expediente": { "value": "...", "confidence": 0.9, "evidence": { "source": "${sourceKind}", "page": 1, "paragraph": 1, "excerpt": "..." } },
    "domicilio": { "value": "...", "confidence": 0.8, "evidence": { "source": "${sourceKind}", "page": 1, "paragraph": 2, "excerpt": "..." } }
  },
  "missingFields": ["Campo que falta 1", "Campo que falta 2"],
  "conflicts": [],
  "warnings": ["Advertencia de competencia o plazos si aplica"]
}`;

    const userMessage = `Plantilla objetivo: ${body.templateName || "Demanda / Escrito Legal"}\n\nTexto a analizar:\n"""${extractedText}"""`;

    const aiRes = await runFastMode({
      systemPrompt,
      userMessage,
      mode: "fast",
    });

    let structuredOutput: StructuredOutput = {
      fields: {},
      missingFields: [],
      conflicts: [],
      warnings: [],
    };

    try {
      const cleanJson = (aiRes.content || "").replace(/```json\n?|```/g, "").trim();
      structuredOutput = JSON.parse(cleanJson);
    } catch {
      structuredOutput = {
        fields: {
          hechos_resumen: {
            value: extractedText.slice(0, 500),
            confidence: 0.7,
            evidence: { source: sourceKind, page: 1, paragraph: 1, excerpt: extractedText.slice(0, 150) },
          },
        },
        missingFields: ["Datos de identificación formal"],
        conflicts: [],
        warnings: ["Respuesta de IA formateada automáticamente."],
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        sourceKind,
        pageCount,
        ...structuredOutput,
      },
    });
  } catch (err: any) {
    console.error("[AiFillRoute] Error:", err);
    return NextResponse.json(
      { error: err.message || "Error al procesar autollenado con IA." },
      { status: 500 }
    );
  }
}
