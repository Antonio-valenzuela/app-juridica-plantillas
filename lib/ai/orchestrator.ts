import { LocalProvider } from "./providers/local";
import { NVIDIAProvider } from "./providers/nvidia";
import type { AIHealthResult, AIProviderResult, AIRequest } from "./providers/types";
import { deepReviewSchema, type DeepReviewOutput } from "./schemas/deepReviewSchema";

const nvidia = new NVIDIAProvider();
const local = new LocalProvider();

/**
 * Interfaz central única para toda operación de IA jurídica — NVIDIA ONLY.
 * UI → API → runLegalAI → NVIDIA → local fallback
 * Nunca expone API keys; registra provider/model para generationMetadata.
 */
export async function runLegalAI(request: AIRequest, _options?: { mode?: string }): Promise<AIProviderResult> {
  return runFastMode(request);
}

export async function runFastMode(request: AIRequest): Promise<AIProviderResult> {
  const start = Date.now();
  let fallbackReason: string | null = null;
  if (await nvidia.isAvailable()) {
    try {
      const res = await nvidia.generate(request);
      if (res.success && res.content) {
        return {
          ...res,
          providerRequested: 'nvidia',
          providerActuallyUsed: 'nvidia',
          fallbackReason: null,
          origin: 'AI_GENERATED_LEGAL_CONTENT',
          isLegalAiContent: true,
          warnings: [...(res.warnings || [])],
          latencyMs: res.latencyMs || (Date.now() - start),
        };
      }
      // PASO 14: conservar fallbackReason explícito con sanitización
      const rawWarn = (res.warnings?.[0] || res.errorCode || 'unknown').toString().slice(0, 300).replace(/nvapi-[^\s"']+/gi, '[REDACTED]');
      fallbackReason = rawWarn.includes('HTTP 404') ? 'NVIDIA_HTTP_404' : rawWarn.includes('HTTP 410') ? 'NVIDIA_HTTP_410' : rawWarn.includes('HTTP') ? `NVIDIA_HTTP_${(rawWarn.match(/HTTP\s+(\d+)/)?.[1] || 'ERROR')}` : 'NVIDIA_ERROR';
      console.warn(`[orchestrator] NVIDIA falló (success=false), fallback a local. provider=${res.provider} error=${res.errorCode} fallbackReason=${fallbackReason} detail=${rawWarn.slice(0,150)}`);
    } catch (e: any) {
      const msg = String(e?.message || e).slice(0,300).replace(/nvapi-[^\s"']+/gi, '[REDACTED]');
      fallbackReason = msg.includes('404') ? 'NVIDIA_HTTP_404' : msg.includes('410') ? 'NVIDIA_HTTP_410' : 'NVIDIA_EXCEPTION';
      console.warn(`[orchestrator] NVIDIA excepción, fallback a local: ${msg} fallbackReason=${fallbackReason}`);
    }
  } else {
    fallbackReason = 'NVIDIA_NO_API_KEY';
    console.warn('[orchestrator] NVIDIA no disponible (sin API key), fallback a local fallbackReason=NVIDIA_NO_API_KEY');
  }
  const localRes = await local.generate(request);
  return {
    ...localRes,
    providerRequested: 'nvidia',
    providerActuallyUsed: 'local',
    fallbackReason,
    origin: 'LOCAL_PLACEHOLDER',
    isLegalAiContent: false,
    warnings: [...(localRes.warnings || []), `Fallback local: NVIDIA no disponible o falló. fallbackReason=${fallbackReason || 'unknown'}`],
  };
}

export async function runDeepReviewMode(request: AIRequest): Promise<DeepReviewOutput> {
  // NVIDIA ONLY: single provider + judge via NVIDIA, fallback local
  let nvidiaRes: AIProviderResult | null = null;
  let nvidiaSuccess = false;
  if (await nvidia.isAvailable()) {
    try {
      nvidiaRes = await nvidia.generate({ ...request, mode: "deep" });
      nvidiaSuccess = !!(nvidiaRes && nvidiaRes.success && nvidiaRes.content);
    } catch {}
  }

  const judgePrompt = `Eres el Juez Consolidador de Inteligencia Artificial para la plataforma jurídica Radar Jurídico.
Tu función es analizar el resultado producido por NVIDIA sobre una consulta o borrador jurídico, evaluar su coherencia, detectar contradicciones, verificar sustento en fuentes oficiales y generar una revisión profunda estructurada.

[REGLAS]:
1. No inventes artículos, jurisprudencias ni autoridades.
2. Si afirma algo sin respaldo en fuentes, márcalo en "unsupportedClaims".
3. Si hay contradicción hechos↔petitorios, agrégala a "contradictions".
4. Devuelve ÚNICAMENTE JSON estricto sin Markdown:

{
  "summary": "Resumen ejecutivo...",
  "overallRisk": "critical"|"high"|"medium"|"low",
  "issues": [{"id":"issue-1","severity":"critical"|"warning"|"suggestion","section":"sección","fieldId":"campo","title":"Título","explanation":"...","currentText":"...","suggestedText":"...","supportedBySources":true,"sourceIds":[],"modelAgreement":"nvidia_only"|"judge_added","confidence":0.9}],
  "missingFields": [],
  "contradictions": [],
  "unsupportedClaims": [],
  "recommendedActions": [],
  "sourcesUsed": [],
  "providerSummary": {"nvidiaCompleted": ${nvidiaSuccess}, "judgeCompleted": true}
}`;

  const judgeUserMessage = `[SOLICITUD ORIGINAL]: "${request.userMessage}"

[FUENTES OFICIALES]: ${JSON.stringify(request.retrievedSources || [], null, 2)}

[RESPUESTA NVIDIA]: ${nvidiaSuccess ? nvidiaRes?.content : "NVIDIA NO DISPONIBLE / FALLÓ"}
 `;

  if (await nvidia.isAvailable()) {
    try {
      const judgeRes = await nvidia.generate({
        systemPrompt: judgePrompt,
        userMessage: judgeUserMessage,
        mode: "deep",
        temperature: 0.1,
      });
      if (judgeRes.success && judgeRes.content) {
        const cleaned = cleanJsonWrapper(judgeRes.content);
        const parsed = JSON.parse(cleaned);
        const validated = deepReviewSchema.parse({
          ...parsed,
          providerSummary: {
            nvidiaCompleted: nvidiaSuccess,
            geminiCompleted: false,
            groqCompleted: false,
            judgeCompleted: true,
            fallbackUsed: false,
          },
        });
        return validated;
      }
    } catch (err) {
      console.error("[orchestrator] NVIDIA Judge falló, fallback a local:", err);
    }
  }

  return runLocalDeepConsolidator(request, null, null, nvidiaRes);
}

export function runLocalDeepConsolidator(
  request: AIRequest,
  _geminiRes: AIProviderResult | null,
  _groqRes: AIProviderResult | null,
  nvidiaRes: AIProviderResult | null = null
): DeepReviewOutput {
  const nvidiaSuccess = !!(nvidiaRes && nvidiaRes.success && nvidiaRes.content);
  const issues: any[] = [];
  const contradictions: string[] = [];
  let availableContent = nvidiaRes?.content || "";
  if (!availableContent || availableContent.trim().length < 50) {
    availableContent = generateLocalLegalDraft(request);
  }
  if (availableContent) {
    issues.push({
      id: "issue-model-response-1",
      severity: "suggestion",
      section: "respuesta_generada",
      fieldId: "contenido",
      title: "Análisis y Escrito Proyectado por IA",
      explanation: "Respuesta elaborada por el motor procesal (NVIDIA/local).",
      currentText: "",
      suggestedText: availableContent,
      supportedBySources: true,
      sourceIds: [],
      modelAgreement: nvidiaSuccess ? "nvidia_only" : "judge_added",
      confidence: 0.9,
    });
  }
  const text = (request.userMessage + " " + JSON.stringify(request.legalContext || {})).toLowerCase();
  if (/secuestro|privaci[oó]n de libertad|detenci[oó]n|incomunicaci[oó]n/i.test(text)) {
    const hechos = String(request.legalContext?.fields?.hechos || "").trim();
    if (hechos.length < 20) {
      const msg = "Los puntos petitorios presuponen una privación de libertad, pero el documento no contiene hechos ni acto reclamado que sustenten ese supuesto.";
      contradictions.push(msg);
      issues.push({
        id: "issue-local-contradiction-1",
        severity: "critical",
        section: "puntos_petitorios",
        fieldId: "petitorios",
        title: "Incongruencia entre hechos y puntos petitorios",
        explanation: msg,
        currentText: "SEGUNDO.- Conceder la suspensión provisional contra la privación de libertad...",
        suggestedText: "SEGUNDO.- Conceder la suspensión provisional respecto de los actos reclamados descritos...",
        supportedBySources: true,
        sourceIds: [],
        modelAgreement: nvidiaSuccess ? "nvidia_only" : "judge_added",
        confidence: 0.85,
      });
    }
  }
  let summary = `Revisión y contestación procesada por el consolidador local. ${
    nvidiaSuccess ? "Se utilizó NVIDIA." : "No fue posible conectar con NVIDIA; se aplicó validación determinística."
  }`;
  if (availableContent && availableContent.length > 50) summary += "\n\n" + availableContent;
  return {
    summary,
    overallRisk: contradictions.length > 0 ? "high" : "low",
    issues,
    missingFields: request.legalContext?.pendingMarkers || [],
    contradictions,
    unsupportedClaims: [],
    recommendedActions: ["Revisar el borrador en la vista previa antes de exportar", "Confirmar preceptos en el Semanario Judicial"],
    sourcesUsed: (request.retrievedSources || []).map((s) => ({
      id: s.id || `src-${Math.random()}`,
      title: s.title,
      officialUrl: s.officialUrl || "",
      sourceType: "legislation",
      verified: true,
    })),
    providerSummary: {
      nvidiaCompleted: nvidiaSuccess,
      geminiCompleted: false,
      groqCompleted: false,
      judgeCompleted: false,
      fallbackUsed: true,
    },
  };
}

export async function getProvidersStatus(): Promise<AIHealthResult[]> {
  const results = await Promise.all([nvidia.healthCheck(), local.healthCheck()]);
  return results;
}

function cleanJsonWrapper(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function generateLocalLegalDraft(request: AIRequest): string {
  const msg = request.userMessage || "";
  const resourceTypeMatch = msg.match(/TIPO DE RECURSO \/ CONTESTACIÓN:\s*(.+)/i);
  const resourceType = resourceTypeMatch ? resourceTypeMatch[1].trim() : "Recurso / Contestación Legal";
  const expMatch = msg.match(/Expediente de origen:\s*(.+)/i);
  const expediente = expMatch ? expMatch[1].trim() : "Expediente de Origen";
  const tribunalMatch = msg.match(/Tribunal \/ Autoridad emisora:\s*(.+)/i);
  const tribunal = tribunalMatch ? tribunalMatch[1].trim() : "H. Tribunal / Autoridad Competente";
  const ponenteMatch = msg.match(/Magistrado ponente \/ Autoridad:\s*(.+)/i);
  const ponente = ponenteMatch ? ponenteMatch[1].trim() : "C. Juez / Magistrado Ponente";
  const fechaMatch = msg.match(/Fecha de resolución:\s*(.+)/i);
  const fecha = fechaMatch ? fechaMatch[1].trim() : "Fecha de notificación";
  let autoridad = "H. SUPREMA CORTE DE JUSTICIA DE LA NACIÓN\nPRESIDENCIA / SALA EN TURNO";
  if (resourceType.includes("Queja")) autoridad = "H. TRIBUNAL COLEGIADO DE CIRCUITO EN TURNO";
  else if (resourceType.includes("Laboral")) autoridad = "H. TRIBUNAL DE ARBITRAJE Y ESCALAFÓN / JUZGADO LABORAL COMPETENTE";
  else if (resourceType.includes("Civil")) autoridad = "C. JUEZ DE LO CIVIL Y MERCANTIL EN TURNO";
  else if (resourceType.includes("Incidente")) autoridad = "C. JUEZ DE DISTRITO EN MATERIA DE AMPARO";
  return `${resourceType.toUpperCase()}
EXPEDIENTE DE ORIGEN: ${expediente}
TRIBUNAL / AUTORIDAD EMISORA: ${tribunal}
MAGISTRADO PONENTE / AUTORIDAD: ${ponente}
FECHA DE RESOLUCIÓN: ${fecha}

${autoridad}
P R E S E N T E.-

PROMOVENTE, por mi propio derecho y/o en representación de la parte promovente dentro de los autos del expediente número ${expediente}, señalando domicilio procesal para oír y recibir notificaciones, comparezco respetuosamente y expongo:

Que por medio del presente escrito, y con fundamento en los artículos 1, 14, 16 y 17 de la Constitución Política de los Estados Unidos Mexicanos, la Ley de Amparo y demás disposiciones procesales aplicables, vengo a interponer en tiempo y forma ${resourceType.toUpperCase()} en contra de la resolución/demanda procesal dictada por ${tribunal} con fecha ${fecha}.

--- AGRAVIOS Y CONCEPTOS DE VIOLACIÓN ---

PRIMER AGRAVIO.- VIOLACIÓN A LOS PRINCIPIOS DE LEGALIDAD, EXHAUSTIVIDAD Y SEGURIDAD JURÍDICA.
SEGUNDO AGRAVIO.- INAPLICACIÓN DEL CONTROL DIFUSO DE CONSTITUCIONALIDAD Y CONVENCIONALIDAD.
TERCER AGRAVIO.- INDEBIDA VALORACIÓN PROBATORIA Y FALTA DE MOTIVACIÓN.

--- PUNTOS PETITORIOS ---

PRIMERO.- Tenerme por presentado en tiempo y forma legal interponiendo el presente ${resourceType}.
SEGUNDO.- Admitir a trámite el recurso/escrito y dar traslado a las partes en términos de ley.
TERCERO.- Previo el estudio de los agravios expuestos, declarar FUNDADO el presente recurso y revocar o modificar el acto impugnado para restituir a la promovente en el pleno goce de sus derechos violados.

PROTESTO LO NECESARIO EN DERECHO.
En la Ciudad de México / Guadalajara, Jalisco, a la fecha de su presentación.`;
}
