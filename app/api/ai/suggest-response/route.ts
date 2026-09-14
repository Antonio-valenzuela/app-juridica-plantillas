import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security/adminAuth';
import { checkRateLimit, extractIp } from '@/lib/security/rateLimit';
import { runFastMode } from '@/lib/ai/orchestrator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const ip = extractIp(req);
    const rateLimitResult = checkRateLimit(ip, 10);
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { ok: false, error: 'rate_limit', friendlyMessage: 'Demasiadas solicitudes. Por favor intente más tarde.' },
        { status: 429 }
      );
    }

    const payload = await req.json().catch(() => ({}));
    const { documentText, documentType, resourceType, expediente } = payload;

    if (!documentText || typeof documentText !== 'string' || documentText.length < 50) {
      return NextResponse.json(
        { ok: false, error: 'invalid_document', friendlyMessage: 'El documento debe tener al menos 50 caracteres.' },
        { status: 400 }
      );
    }

    const systemPrompt = `Eres un abogado litigante mexicano experto con 20 años de experiencia en todas las materias del derecho mexicano. Se te proporciona un documento legal (demanda, sentencia, resolución, etc.) para que lo analices y sugieras estrategias de defensa o respuesta.

Analiza el documento y devuelve un JSON con esta estructura exacta:
{
  "analisis": {
    "tipo_documento": "string - tipo detectado (demanda civil, sentencia de amparo, etc.)",
    "partes": {
      "actor": "nombre del actor/demandante/quejoso",
      "demandado": "nombre del demandado/autoridad responsable",
      "juez": "nombre del juez/magistrado si aparece",
      "tribunal": "tribunal o juzgado"
    },
    "pretensiones": ["lista de pretensiones o puntos reclamados"],
    "fundamentos_citados": ["artículos y leyes citados en el documento"],
    "hechos_clave": ["resumen de los hechos más relevantes"],
    "plazos": "plazos procesales detectados o aplicables"
  },
  "sugerencias": [
    {
      "estrategia": "título corto de la estrategia",
      "descripcion": "explicación detallada de cómo implementar esta defensa",
      "fundamento_legal": "artículos y leyes que sustentan esta estrategia",
      "viabilidad": "alta|media|baja",
      "riesgo": "descripción breve del riesgo de esta estrategia"
    }
  ],
  "advertencias": ["plazos próximos a vencer, requisitos formales, etc."]
}

IMPORTANTE:
- Basa tus sugerencias en legislación mexicana vigente
- Si no puedes identificar algo con certeza, indica [PENDIENTE: verificar]
- Da al menos 3 y máximo 5 sugerencias de estrategia
- Incluye siempre los fundamentos legales específicos (artículo, ley, párrafo)
- Si detectas plazos procesales, advierte sobre ellos`;

    const userMessage = `Por favor analiza este documento:
Tipo sugerido: ${documentType || 'Desconocido'}
Recurso: ${resourceType || 'Desconocido'}
Expediente: ${expediente || 'Desconocido'}

DOCUMENTO:
${documentText}`;

    const requestArgs = {
      systemPrompt,
      userMessage,
      mode: 'fast' as const,
      taskType: 'document_review',
    };

    const aiResult = await runFastMode(requestArgs);

    if (!aiResult.success || !aiResult.content) {
      throw new Error("El proveedor de IA no devolvió un contenido válido.");
    }

    let parsedResponse;
    try {
      const cleanedContent = aiResult.content.trim().replace(/^```(json)?/i, '').replace(/```$/i, '').trim();
      parsedResponse = JSON.parse(cleanedContent);
    } catch (parseError) {
      parsedResponse = {
        analisis: {
          tipo_documento: "No se pudo estructurar",
          partes: {},
          pretensiones: [],
          fundamentos_citados: [],
          hechos_clave: [],
          plazos: ""
        },
        sugerencias: [
          {
            estrategia: "Respuesta en texto libre",
            descripcion: aiResult.content,
            fundamento_legal: "",
            viabilidad: "media",
            riesgo: "No estructurado"
          }
        ],
        advertencias: ["La IA devolvió un formato no estructurado"]
      };
    }

    return NextResponse.json({
      ok: true,
      ...parsedResponse,
      provider: aiResult.provider || 'nvidia'
    });

  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: 'internal_error', friendlyMessage: 'Hubo un error procesando el documento. Intenta más tarde.', details: error.message },
      { status: 500 }
    );
  }
}
