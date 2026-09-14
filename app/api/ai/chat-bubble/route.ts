import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, extractIp } from "@/lib/security/rateLimit";
import { routeLlmCompletion } from "@/lib/ai/router";
import { bubbleSystemPrompt } from "@/lib/ai/prompts/bubbleSystemPrompt";
import { emptySearchPrompt } from "@/lib/ai/prompts/emptySearchPrompt";
import { ragPrompt } from "@/lib/ai/prompts/ragPrompt";
import { prisma } from "@/lib/prisma";
import { normalizeLegalDisplayText } from "@/lib/text/normalizeLegalDisplayText";
import { requireAdmin } from "@/lib/security/adminAuth";

function sanitizeInput(str: string): string {
  if (!str) return "";
  return str
    .replace(/ignore previous instructions/gi, "")
    .replace(/forget all rules/gi, "")
    .replace(/you are now a/gi, "")
    .trim();
}

function normalizeChatIntent(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "general_platform_help";
  const normalized = value.trim();
  if (normalized === "general") return "general_platform_help";
  return ["latest_changes", "search_help", "empty_search_assistant", "document_qa", "admin_source_diagnostic", "general_platform_help", "rag"].includes(normalized) ? normalized : "general_platform_help";
}

function normalizedLower(value: string | null | undefined) {
  return normalizeLegalDisplayText(value).toLowerCase();
}

function candidateMatchesMatter(candidate: { documentTitle?: string; matter?: string; text?: string }, matter?: string | null) {
  if (!matter) return true;
  const target = matter.toLowerCase();
  return [candidate.documentTitle, candidate.matter, candidate.text].some((value) =>
    normalizedLower(value).includes(target)
  );
}

function detectPeriodLabel(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("esta semana") || lower.includes("últimos 7") || lower.includes("ultimos 7")) {
    return "esta semana";
  }
  if (lower.includes("hoy")) return "hoy";
  if (lower.includes("ayer")) return "ayer";
  if (lower.includes("mes")) return "este mes";
  return "el periodo solicitado";
}

function isEvasiveLatestChangesAnswer(answer: string) {
  return /usa la acción de búsqueda|busqueda jurídica filtrada|búsqueda jurídica filtrada|no es posible acceder al análisis en tiempo real|puedo ayudarte a revisar cambios recientes|te sugiero contrastar esta orientación/i.test(answer);
}

function buildLatestChangesAnswer(
  message: string,
  materia: string | null,
  chunks: Array<{ documentTitle: string; source: string; matter?: string; date?: string; url?: string; isOfficial?: boolean }>
) {
  const periodLabel = detectPeriodLabel(message);
  const matterLabel = materia ? `materia ${materia}` : "la materia solicitada";
  const relevantDocs = chunks.filter((chunk) => candidateMatchesMatter(chunk, materia)).slice(0, 4);
  const docs = relevantDocs.length > 0 ? relevantDocs : chunks.slice(0, 4);
  const confidence = docs.length === 0 ? "Bajo" : docs.some((doc) => doc.isOfficial) ? "Medio" : "Bajo";

  const documentLines = docs.length > 0
    ? docs.map((doc, index) => {
        const title = normalizeLegalDisplayText(doc.documentTitle || "Documento");
        const source = normalizeLegalDisplayText(doc.source || "Fuente local");
        const docMatter = normalizeLegalDisplayText(doc.matter || matterLabel);
        const url = doc.url ? `\n   Liga oficial: ${doc.url}` : "";
        return `${index + 1}. ${title}\n   Fuente: ${source}. Materia: ${docMatter}.${url}`;
      }).join("\n")
    : `- No hay documentos de ${matterLabel} indexados para mostrar como respaldo directo.`;

  return `**Respuesta directa**
Revisé los documentos indexados para ${matterLabel} en ${periodLabel}. No encontré una reforma ${materia || ""} reciente confirmada dentro de las fuentes cargadas para ese periodo. Sí encontré documentos base relacionados que conviene contrastar contra DOF, Cámara de Diputados y SJF.

**Documentos relacionados**
${documentLines}

**Puntos clave**
1. La ausencia de hallazgos en la base local no confirma por sí sola que no exista publicación oficial.
2. Para cerrar la revisión, verifica DOF/SIDOF, Cámara de Diputados y Semanario Judicial de la Federación.
3. Si el asunto tiene plazo o estrategia procesal, conserva la liga oficial y la fecha de publicación antes de usar el resultado.

**Nivel de confianza**
${confidence}: basado en documentos disponibles en la plataforma, pendiente de contraste final en fuente oficial.

Este análisis es orientativo y debe contrastarse con la fuente oficial y el caso concreto.`;
}

function detectPeriodStart(message: string) {
  const lower = message.toLowerCase();
  const start = new Date();

  if (lower.includes("hoy")) {
    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (lower.includes("ayer")) {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (lower.includes("mes")) {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  return start;
}

function buildLatestChangeActions(materia: string | null) {
  const matter = materia || "penal";
  const matterLabel = `derecho ${matter}`;

  return [
    {
      label: `Buscar reformas recientes en ${matter}`,
      type: "search_query",
      payload: {
        query: `reformas ${matterLabel}`,
        matter,
        dateRange: "this_week",
      },
    },
    {
      label: `Crear alerta de ${matterLabel}`,
      type: "create_alert",
      payload: { query: matterLabel, matter },
    },
    {
      label: "Ver monitoreo legal",
      type: "open_url",
      payload: { href: "/monitoreo" },
    },
  ];
}

async function retrieveIndexedChangeEvidence(message: string, materia: string | null) {
  const startDate = detectPeriodStart(message);
  const matterFilter: any = materia
    ? {
        OR: [
          { matter: { contains: materia, mode: "insensitive" } },
          {
            documentVersion: {
              document: {
                OR: [
                  { matter: { contains: materia, mode: "insensitive" } },
                  { title: { contains: materia, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      }
    : {};

  const versionMatterFilter: any = materia
    ? {
        document: {
          OR: [
            { matter: { contains: materia, mode: "insensitive" } },
            { title: { contains: materia, mode: "insensitive" } },
          ],
        },
      }
    : {};

  let changes: any[] = [];
  let notifications: any[] = [];
  let versions: any[] = [];

  try {
    changes = await (prisma as any).documentChange.findMany({
      where: {
        detectedAt: { gte: startDate },
        ...matterFilter,
      },
      orderBy: { detectedAt: "desc" },
      take: 8,
      select: {
        id: true,
        changeDescription: true,
        detectedAt: true,
        sourceUrl: true,
        matter: true,
        jurisdiction: true,
        priority: true,
        reviewStatus: true,
        documentVersion: {
          select: {
            id: true,
            sourceUrl: true,
            createdAt: true,
            document: {
              select: {
                id: true,
                title: true,
                shortCode: true,
                matter: true,
                officialUrl: true,
              },
            },
          },
        },
      },
    });
  } catch (error) {
    console.error("[legal-ai] indexed changes query failed:", error);
  }

  try {
    notifications = await (prisma as any).notification.findMany({
      where: {
        createdAt: { gte: startDate },
        documentVersion: versionMatterFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        createdAt: true,
        status: true,
        payload: true,
        documentVersion: {
          select: {
            id: true,
            sourceUrl: true,
            document: {
              select: {
                id: true,
                title: true,
                shortCode: true,
                matter: true,
                officialUrl: true,
              },
            },
          },
        },
      },
    });
  } catch (error) {
    console.error("[legal-ai] notification evidence query failed:", error);
  }

  try {
    versions = await (prisma as any).documentVersion.findMany({
      where: {
        createdAt: { gte: startDate },
        ...versionMatterFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        createdAt: true,
        sourceUrl: true,
        document: {
          select: {
            id: true,
            title: true,
            shortCode: true,
            matter: true,
            officialUrl: true,
          },
        },
      },
    });
  } catch (error) {
    console.error("[legal-ai] document version evidence query failed:", error);
  }

  return { startDate, changes, notifications, versions };
}

function buildIndexedChangesAnswer(
  materia: string | null,
  evidence: Awaited<ReturnType<typeof retrieveIndexedChangeEvidence>>,
) {
  const matterLabel = materia ? ` en materia ${materia}` : "";
  const lines = evidence.changes.map((change, index) => {
    const document = change.documentVersion?.document;
    const title = normalizeLegalDisplayText(document?.title || "Documento monitoreado");
    const date = change.detectedAt ? new Date(change.detectedAt).toLocaleDateString("es-MX") : "fecha no registrada";
    const source = change.sourceUrl || change.documentVersion?.sourceUrl || document?.officialUrl;
    const sourceLine = source ? `\n   Fuente oficial: ${source}` : "";

    return `${index + 1}. ${title}\n   Cambio indexado: ${normalizeLegalDisplayText(change.changeDescription)}\n   Detectado: ${date}.${sourceLine}`;
  });

  return `**Respuesta directa**
Encontré ${evidence.changes.length} cambio(s) indexado(s)${matterLabel} para el periodo consultado.

**Cambios detectados**
${lines.join("\n\n")}

**Advertencia de verificación**
Estos resultados provienen de cambios previamente indexados por Radar Jurídico. Antes de tomar una decisión jurídica, abre la fuente oficial y confirma texto vigente, fecha de publicación y aplicación al caso concreto.`;
}

function getModeInstructions(mode: string): string {
  switch (mode) {
    case "Estrategia Procesal":
      return `\nMODO ESTRATEGIA PROCESAL:
Tu objetivo es ayudar a diseñar la estrategia procesal para un caso.
Pide de forma clara y directa al usuario los siguientes datos si no los ha proporcionado:
- Materia jurídica del caso
- Autoridad emisora del acto
- Acto reclamado o combatido
- Fecha de notificación del acto
- Etapa procesal actual
- Objetivo del cliente
Con base en estos datos, propone alternativas de defensa, recursos procedentes, plazos estimados de interposición, riesgos y sugerencias de pruebas.`;

    case "Resumen de Documento":
      return `\nMODO RESUMEN DE DOCUMENTO:
Tu objetivo es resumir un documento legal de forma sumamente práctica para un abogado.
Estructura tu respuesta incluyendo de forma destacada:
- Tema central y objeto del documento
- Obligaciones y derechos nuevos que se crean
- Plazos límite o de vigencia
- Sujetos obligados o afectados
- Riesgos legales identificados
- Puntos críticos que un abogado debe revisar`;

    case "Análisis de Reforma":
      return `\nMODO ANÁLISIS DE REFORMA:
Tu objetivo es analizar una reforma o cambio regulatorio.
Compara la situación anterior con la nueva, explica las implicaciones del cambio, la fecha de entrada en vigor y los artículos transitorios clave.`;

    case "Borrador Jurídico":
      return `\nMODO BORRADOR JURÍDICO:
Tu objetivo es ayudar a redactar la estructura, consideraciones o cláusulas de un escrito jurídico (contrato, demanda, recurso).
Proporciona una estructura sugerida (Proemio, Declaraciones, Cláusulas, Puntos Petitorios) adaptada al derecho mexicano. Recuerda incluir la advertencia de que es solo una propuesta de borrador.`;

    case "Asistencia General":
    default:
      return `\nMODO ASISTENCIA GENERAL:
Responde a las dudas generales sobre leyes mexicanas, funcionamiento de la plataforma o conceptos jurídicos de manera informativa y conversacional.`;
  }
}

async function retrieveContextTextual(query: string, matter?: string | null, limit = 6): Promise<{
  chunks: Array<{ text: string; documentTitle: string; source: string; matter?: string; date?: string; url?: string; isOfficial?: boolean }>;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const words = query.trim().split(/\s+/).filter(w => w.length > 2);
  
  if (words.length === 0) {
    return { chunks: [], warnings };
  }

  // 1. Query DocumentChunk
  let dbChunks: any[] = [];
  try {
    const chunkWhere: any = {};
    chunkWhere.OR = words.flatMap(word => [
      { text: { contains: word, mode: "insensitive" } },
      { article: { contains: word, mode: "insensitive" } }
    ]);
    
    dbChunks = await (prisma as any).documentChunk.findMany({
      where: chunkWhere,
      take: limit * 2,
      include: {
        documentVersion: {
          include: {
            document: true
          }
        }
      }
    });
  } catch (err) {
    console.error("[legal-ai] DocumentChunk query failed:", err);
  }

  // 2. Query Item
  let dbItems: any[] = [];
  try {
    const itemWhere: any = {};
    itemWhere.OR = words.flatMap(word => [
      { title: { contains: word, mode: "insensitive" } },
      { summary: { contains: word, mode: "insensitive" } }
    ]);
    dbItems = await (prisma as any).item.findMany({
      where: itemWhere,
      take: limit * 2
    });
  } catch (err) {
    console.error("[legal-ai] Item query failed:", err);
  }

  // Map candidates
  const candidates: any[] = [];
  
  dbChunks.forEach(c => {
    const doc = c.documentVersion?.document;
    candidates.push({
      text: c.text,
      documentTitle: doc?.title || "Documento",
      source: doc?.source || "Base local",
      matter: doc?.matter || c.sectionPath || "General",
      date: c.createdAt ? c.createdAt.toISOString() : undefined,
      url: doc?.canonicalUrl || undefined,
      isOfficial: ["dof", "scjn", "sjf", "diputados", "senado", "senado_web"].includes((doc?.source || "").toLowerCase())
    });
  });

  dbItems.forEach(item => {
    candidates.push({
      text: item.summary || item.title,
      documentTitle: item.title,
      source: item.source || "Publicación",
      matter: Array.isArray(item.tema) && item.tema.length > 0 ? item.tema.join(", ") : "General",
      date: item.published ? item.published.toISOString() : undefined,
      url: item.url || undefined,
      isOfficial: ["dof", "scjn", "sjf", "diputados", "senado", "senado_web"].includes((item.source || "").toLowerCase())
    });
  });

  // Score candidates
  candidates.forEach(c => {
    let score = 0;
    
    // Matter match
    if (matter && c.matter && c.matter.toLowerCase().includes(matter.toLowerCase())) {
      score += 100;
    }
    
    // Official source match
    if (c.isOfficial) {
      score += 50;
    }
    
    // Date bonus (more recent first)
    if (c.date) {
      const diffDays = (Date.now() - new Date(c.date).getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < 30) score += 30;
      else if (diffDays < 180) score += 15;
    }
    
    c.score = score;
  });

  // Sort and limit, keeping the requested legal matter ahead of adjacent topics.
  const matterFiltered = matter ? candidates.filter((candidate) => candidateMatchesMatter(candidate, matter)) : candidates;
  const pool = matterFiltered.length > 0 ? matterFiltered : candidates;
  const sorted = pool.sort((a, b) => b.score - a.score).slice(0, limit);
  return { chunks: sorted, warnings };
}

function classifyIntentRegex(message: string): { intent: string; materia: string | null } {
  const lower = message.toLowerCase().trim();
  let intent = "general_platform_help";
  let materia: string | null = null;

  if (lower.includes("cambio") || lower.includes("reforma") || lower.includes("novedad") || lower.includes("publica") || lower.includes("últimos cambios") || lower.includes("esta semana")) {
    intent = "latest_changes";
  } else if (lower.includes("buscar") || lower.includes("como busco")) {
    intent = "search_help";
  }

  // Materias keywords
  if (lower.includes("penal") || lower.includes("delito")) materia = "penal";
  else if (lower.includes("fiscal") || lower.includes("sat") || lower.includes("impuesto")) materia = "fiscal";
  else if (lower.includes("laboral") || lower.includes("trabajo") || lower.includes("despido")) materia = "laboral";
  else if (lower.includes("salud") || lower.includes("cofepris")) materia = "salud";
  else if (lower.includes("constitucional") || lower.includes("amparo")) materia = "constitucional";
  else if (lower.includes("civil") || lower.includes("arrendamiento") || lower.includes("divorcio")) materia = "civil";
  else if (lower.includes("mercantil") || lower.includes("comercio")) materia = "mercantil";

  return { intent, materia };
}

function parseModelJsonObject(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

export async function POST(req: NextRequest) {
  // Logs técnicos en stderr para no contaminar stdout en tests
  console.error("[legal-ai] request.start");

  let payload: any = {};
  try {
    payload = await req.json().catch(() => ({}));
  } catch (err) {
    console.error("[legal-ai] Failed to parse JSON body:", err);
  }

  const { message, mode = "Asistencia General", query, selectedText, documentId, currentPath, resultCount } = payload;

  // Security check for admin pages
  if (currentPath && typeof currentPath === "string" && currentPath.startsWith("/admin")) {
    const adminCheck = requireAdmin(req);
    if (!adminCheck.ok) return adminCheck.response;
  }

  const ip = extractIp(req);
  const rateLimitResult = checkRateLimit(ip, 30);
  if (!rateLimitResult.ok) {
    console.error("[legal-ai] Rate limit hit");
    return new Response(JSON.stringify({ 
      ok: false, 
      error: "rate_limit", 
      friendlyMessage: "Demasiadas solicitudes. Por favor intente más tarde." 
    }), {
      status: 429,
      headers: { "Content-Type": "application/json", ...rateLimitResult.headers }
    });
  }

  // Validaciones del entorno
  const hasNvidiaKey = !!process.env.NVIDIA_API_KEY?.trim();
  const hasAnyApiKey = hasNvidiaKey;
  const nvidiaModel = process.env.NVIDIA_MODEL || "meta/llama-3.2-11b-vision-instruct";
  const provider = hasNvidiaKey ? "nvidia" : "local";
  console.error(`[legal-ai] config check: LLM_PROVIDER=${provider}, NVIDIA_MODEL=${nvidiaModel}, NVIDIA_API_KEY_CONFIGURED=${hasNvidiaKey}`);

  try {
    if (!message || typeof message !== "string") {
      return NextResponse.json({ 
        ok: false, 
        error: "invalid_message", 
        friendlyMessage: "El mensaje es obligatorio y debe ser texto." 
      }, { status: 400 });
    }

    console.error(`[legal-ai] mode: ${mode}`);

    const cleanMessage = sanitizeInput(message);
    const cleanSelectedText = selectedText ? sanitizeInput(String(selectedText)) : "";
    const regexMatch = classifyIntentRegex(cleanMessage);

    // 1. Classifier LLM Call (for tests compatibility)
    let intent = normalizeChatIntent(mode);
    let materia: string | null = regexMatch.materia;

    try {
      const classifierPrompt = `Clasifica el mensaje del usuario de una plataforma jurídica en una de las siguientes intenciones:
- "latest_changes": El usuario pide novedades, reformas, decretos, circulares o publicaciones de fechas recientes ("esta semana", "hoy", "ayer", "últimos días", "recientemente", "materia fiscal esta semana").
- "search_help": El usuario pide consejos sobre cómo buscar, qué términos usar o cómo encontrar información.
- "empty_search_assistant": Búsquedas que no arrojaron resultados o ayuda directa.
- "document_qa": El usuario pregunta sobre un documento específico (si se proporciona documentId o texto del documento).
- "admin_source_diagnostic": Dudas o soporte sobre ingestas de fuentes oficiales y telemetría.
- "general_platform_help": Mensajes generales de ayuda o preguntas enciclopédicas/generales ("explícame qué es la patria potestad", etc.).

Debes responder ÚNICAMENTE con un objeto JSON válido que contenga:
{
  "intent": "latest_changes" | "search_help" | "empty_search_assistant" | "document_qa" | "admin_source_diagnostic" | "general_platform_help",
  "materia": string | null
}
`;
      const classifierResult = await routeLlmCompletion(
        classifierPrompt + `\n\nMensaje: "${cleanMessage}"`,
        "classification",
        Math.random().toString(36).substring(7)
      );

      const parsed = JSON.parse(classifierResult.answer.trim());
      if (parsed.intent) {
        intent = normalizeChatIntent(parsed.intent);
        materia = parsed.materia || materia;
      } else {
        intent = documentId ? "document_qa" : regexMatch.intent;
      }
    } catch (e) {
      // Fallback to regex
      intent = documentId ? "document_qa" : regexMatch.intent;
    }

    // Deterministic guardrail: recency language must not be downgraded to generic help.
    if (regexMatch.intent === "latest_changes" && (intent === "general_platform_help" || normalizeChatIntent(mode) === "general_platform_help")) {
      intent = "latest_changes";
    }

    // Empty search context override guardrail
    if (resultCount === 0 || mode === "empty_search_assistant") {
      intent = "empty_search_assistant";
    }
    
    console.error(`[legal-ai] intent: ${intent}`);

    if (intent === "latest_changes") {
      const indexedEvidence = await retrieveIndexedChangeEvidence(cleanMessage, materia);
      const latestActions = buildLatestChangeActions(materia);

      if (indexedEvidence.changes.length === 0) {
        return NextResponse.json({
          ok: true,
          answer: "No encontré cambios indexados para ese periodo.",
          displayAnswer: "No encontré cambios indexados para ese periodo.",
          sources: [],
          citations: [],
          actions: latestActions,
          mode: "latest_changes",
          usedLocalData: false,
          usedFallbackNoKeys: !hasAnyApiKey,
          warnings: ["Verifica directamente en la fuente oficial si el asunto depende de una fecha o plazo."],
          followUpQuestions: [
            "¿Quieres crear una alerta para esta materia?",
            "¿Quieres abrir el monitoreo legal?",
            "¿Quieres ampliar el periodo de búsqueda?",
          ],
          technical: {
            intent,
            resultCount: 0,
            usedLocalData: false,
            mode: intent,
            provider: !hasAnyApiKey ? "local" : provider,
            usedFallbackNoKeys: !hasAnyApiKey,
          },
        });
      }

      const indexedSources = indexedEvidence.changes.map((change) => {
        const document = change.documentVersion?.document;
        return {
          title: normalizeLegalDisplayText(document?.title || "Documento monitoreado"),
          fuente: "Fuente oficial monitoreada",
          materia: normalizeLegalDisplayText(change.matter || document?.matter || materia || "General"),
          url: change.sourceUrl || change.documentVersion?.sourceUrl || document?.officialUrl || null,
        };
      });

      const indexedAnswer = buildIndexedChangesAnswer(materia, indexedEvidence);

      return NextResponse.json({
        ok: true,
        answer: indexedAnswer,
        displayAnswer: indexedAnswer,
        sources: indexedSources,
        citations: indexedSources,
        actions: latestActions,
        mode: "latest_changes",
        usedLocalData: true,
        usedFallbackNoKeys: !hasAnyApiKey,
        warnings: ["Contrasta cada resultado con la fuente oficial antes de tomar una decisión jurídica."],
        followUpQuestions: [
          "¿Quieres ver el detalle del documento monitoreado?",
          "¿Quieres crear una alerta sobre esta materia?",
          "¿Quieres revisar otro periodo?",
        ],
        technical: {
          intent,
          resultCount: indexedEvidence.changes.length,
          usedLocalData: true,
          mode: intent,
          provider: !hasAnyApiKey ? "local" : provider,
          usedFallbackNoKeys: !hasAnyApiKey,
        },
      });
    }

    // Retrieve context without calling embeddings in this request
    console.error("[legal-ai] rag.search.start");
    const { chunks } = await retrieveContextTextual(cleanMessage, materia, 6);
    console.error(`[legal-ai] rag.results: ${chunks.length}`);

    // Build context text keeping total under 12,000 characters
    let contextText = "";
    let characterCount = 0;
    const finalCitations: any[] = [];

    for (const chunk of chunks) {
      const chunkText = `[Doc: ${chunk.documentTitle} | Fuente: ${chunk.source}]\n${chunk.text}\n\n`;
      if (characterCount + chunkText.length > 12000) {
        break;
      }
      contextText += chunkText;
      characterCount += chunkText.length;
      
      finalCitations.push({
        title: normalizeLegalDisplayText(chunk.documentTitle),
        fuente: normalizeLegalDisplayText(chunk.source),
        materia: normalizeLegalDisplayText(chunk.matter || "General"),
        url: chunk.url || null
      });
    }

    // Build prompting
    let systemPrompt = bubbleSystemPrompt;
    if (intent === "empty_search_assistant") {
      systemPrompt = `${bubbleSystemPrompt}\n\n${emptySearchPrompt}`;
    } else if (intent === "document_qa" || intent === "rag") {
      systemPrompt = `${bubbleSystemPrompt}\n\n${ragPrompt}`;
    }

    // Inject lawyer modes
    systemPrompt += getModeInstructions(mode);

    const userContext = `
[MENSAJE DEL USUARIO]: "${cleanMessage}"
[TEXTO SELECCIONADO]: "${cleanSelectedText}"
[CONTEXTO DE DOCUMENTOS LEGALES ENCONTRADOS]:
${contextText || "No se encontraron documentos relacionados en la base local."}
`;

    const finalPrompt = `
${systemPrompt}

${userContext}

Por favor responde a la consulta del usuario estructurando tu respuesta en formato JSON exacto:
{
  "answer": "Tu respuesta estructurada con Respuesta directa, Explicación jurídica, Puntos clave, Aplicación práctica y Fuentes consideradas.",
  "followUpQuestions": ["Pregunta 1", "Pregunta 2", "Pregunta 3"]
}
`;

    let answerText = "";
    let followUpQuestions: string[] = [];
    let providerActions: any[] = [];
    let usedFallback = false;

    // Timeout de 20s para llamada a modelo externo
    const llmTimeoutMs = 20000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), llmTimeoutMs);

    try {
      const completion = await routeLlmCompletion(
        finalPrompt,
        intent,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      console.error(`[legal-ai] provider.success: ${completion.provider}`);

      try {
        const parsed = parseModelJsonObject(completion.answer);
        answerText = parsed.answer || "";
        followUpQuestions = parsed.followUpQuestions || [];
        providerActions = parsed.suggestedActions || parsed.actions || [];
      } catch (e) {
        answerText = completion.answer;
      }
    } catch (llmErr) {
      clearTimeout(timeoutId);
      console.error("[legal-ai] provider.failed:", llmErr);
      console.error("[legal-ai] fallback.used: true");
      usedFallback = true;
      
      // Fallback amable no técnico
      answerText = `Puedo darte una orientación preliminar con la información disponible.

**Respuesta directa**:
En principio, no es posible acceder al análisis en tiempo real en este momento. Sin embargo, con base en el criterio jurídico general, podemos revisar tu solicitud.

**Explicación jurídica**:
Las consultas regulatorias en México requieren un análisis de las publicaciones del Diario Oficial de la Federación (DOF) o del Semanario Judicial de la Federación (SJF) vigentes.

**Puntos clave**:
1. El marco legal mexicano requiere la confirmación en fuentes oficiales.
2. Es aconsejable contrastar cualquier término con la ley aplicable del caso concreto.

**Aplicación práctica**:
Te sugiero contrastar esta orientación con los textos normativos vigentes o reformular tu pregunta.`;

      followUpQuestions = [
        "¿Cuáles son las fuentes oficiales aplicables?",
        "¿Existe alguna reforma reciente sobre este tema?",
        "¿Cómo puedo buscar jurisprudencia sobre esto?"
      ];
    }

    if (intent === "latest_changes" && isEvasiveLatestChangesAnswer(answerText)) {
      answerText = buildLatestChangesAnswer(cleanMessage, materia, chunks);
    }

    // Default follow-up questions if empty
    if (!followUpQuestions || followUpQuestions.length === 0) {
      if (cleanMessage.toLowerCase().includes("amparo")) {
        followUpQuestions = [
          "¿Cuál es la diferencia entre amparo directo e indirecto?",
          "¿Qué plazo tengo para promover un amparo?",
          "¿Qué requisitos debe contener una demanda de amparo?"
        ];
      } else {
        followUpQuestions = [
          "¿Cuáles son las fuentes oficiales aplicables?",
          "¿Existe alguna reforma reciente sobre este tema?",
          "¿Cómo puedo buscar jurisprudencia sobre esto?"
        ];
      }
    }

    // Deterministic actions array for tests and dashboard backwards compatibility
    const finalActions: any[] = [...providerActions];
    if (intent === "latest_changes") {
      const matterLabel = materia ? `derecho ${materia}` : "derecho penal";
      
      const hasSearchAction = finalActions.some(a => a.type === "search_query");
      if (!hasSearchAction) {
        finalActions.push({
          label: `Buscar reformas recientes en ${materia || "penal"}`,
          type: "search_query",
          payload: {
            query: `reformas ${matterLabel}`,
            matter: materia || "penal",
            dateRange: "this_week",
          },
        });
      }

      const hasAlertAction = finalActions.some(a => a.type === "create_alert");
      if (!hasAlertAction) {
        finalActions.push({
          label: `Crear alerta de ${matterLabel}`,
          type: "create_alert",
          payload: { query: matterLabel, matter: materia || "penal" },
        });
      }
    } else if (intent === "empty_search_assistant") {
      const hasSearchAction = finalActions.some(a => a.type === "search");
      if (!hasSearchAction) {
        let synonymQuery = "regulación";
        let synonymLabel = "Buscar regulación";
        
        const qLower = (query || message || "").toLowerCase();
        if (qLower.includes("familia") || qLower.includes("civil")) {
          synonymQuery = "pensión alimenticia o patria potestad";
          synonymLabel = "Buscar alimentos o patria potestad";
        } else if (qLower.includes("penal")) {
          synonymQuery = "delitos o código penal";
          synonymLabel = "Buscar delitos o código penal";
        } else if (qLower.includes("fiscal") || qLower.includes("sat")) {
          synonymQuery = "impuestos o código fiscal";
          synonymLabel = "Buscar impuestos o código fiscal";
        }

        finalActions.push({
          label: synonymLabel,
          type: "search",
          payload: { query: synonymQuery }
        });
      }

      const hasClearFilters = finalActions.some(a => a.type === "clear_filters");
      if (!hasClearFilters) {
        finalActions.push({
          label: "Quitar filtros de búsqueda",
          type: "clear_filters",
          payload: {}
        });
      }

      const hasAddSource = finalActions.some(a => a.type === "add_source_url");
      if (!hasAddSource) {
        finalActions.push({
          label: "Agregar link jurídico",
          type: "add_source_url",
          payload: { url: "" }
        });
      }
    }

    console.error("[legal-ai] response.done");

    const mappedMode = intent === "general_platform_help" ? "general_platform_help" : intent;
    const effectiveProvider = usedFallback ? "local" : provider;
    const isNoKeysLocal = (effectiveProvider === "local" || usedFallback) && !hasAnyApiKey;

    return NextResponse.json({
      ok: true,
      answer: answerText,
      displayAnswer: answerText, // backward compatibility
      sources: finalCitations,
      citations: finalCitations, // backward compatibility
      actions: finalActions, // backward compatibility
      mode: mappedMode, // backward compatibility
      usedLocalData: chunks.length > 0, // backward compatibility
      usedFallbackNoKeys: isNoKeysLocal,
      warnings: usedFallback ? ["Se utilizó orientación preliminar local."] : [],
      followUpQuestions,
      technical: {
        provider: effectiveProvider,
        intent,
        resultCount: chunks.length,
        usedLocalData: chunks.length > 0,
        mode: intent,
        usedFallbackNoKeys: isNoKeysLocal,
      }
    });

  } catch (err: any) {
    console.error("[legal-ai] critical error:", err);
    console.error("[legal-ai] response.done");
    return NextResponse.json({ 
      ok: false, 
      error: "internal_server_error", 
      friendlyMessage: "No pude generar la respuesta en este momento. Intenta reformular tu pregunta o verifica tu conexión." 
    }, { status: 500 });
  }
}
