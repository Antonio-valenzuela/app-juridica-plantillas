import { routeLlmCompletion } from '@/lib/ai/router';
import { isOfficialLegalSourceUrl } from '@/lib/legal/officialSourceUrl';
import type { AIAssistResult } from './templateTypes';

const ALLOWED_AI_SECTION_IDS = new Set([
  'hechos',
  'conceptos_violacion',
  'agravios',
  'pruebas',
  'puntos_petitorios',
]);

export interface VerifiedTemplateSource {
  id: string;
  title: string;
  url: string;
  type: 'ley' | 'jurisprudencia';
  excerpt: string;
}

interface ModelSource {
  sourceId?: unknown;
  title?: unknown;
  url?: unknown;
  type?: unknown;
}

export const isAllowedTemplateAiSection = (sectionId: string): boolean =>
  ALLOWED_AI_SECTION_IDS.has(sectionId);

export const filterVerifiedAiSources = (
  citedSources: ModelSource[],
  verifiedSources: VerifiedTemplateSource[]
): {
  sources: AIAssistResult['sourcesUsed'];
  warnings: string[];
} => {
  const sources: AIAssistResult['sourcesUsed'] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const citation of citedSources) {
    const sourceId = typeof citation.sourceId === 'string' ? citation.sourceId : '';
    const url = typeof citation.url === 'string' ? citation.url : '';
    const available = verifiedSources.find((source) => source.id === sourceId);

    if (!available || available.url !== url) {
      warnings.push(
        `La cita "${sourceId || 'sin identificador'}" no corresponde a una fuente verificada disponible y fue removida.`
      );
      continue;
    }
    if (!isOfficialLegalSourceUrl(available.url)) {
      warnings.push(
        `La cita "${sourceId}" no tiene una URL oficial permitida y fue removida.`
      );
      continue;
    }
    if (citation.type !== available.type) {
      warnings.push(
        `La cita "${sourceId}" no coincide con el tipo de fuente verificada y fue removida.`
      );
      continue;
    }
    if (seen.has(sourceId)) continue;

    seen.add(sourceId);
    sources.push({
      sourceId: available.id,
      title: available.title,
      url: available.url,
      type: available.type,
    });
  }

  return { sources, warnings };
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

export const sanitizeTemplateCaseContext = (
  value: unknown
): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .flatMap(([key, rawValue]) => {
        const normalized =
          typeof rawValue === 'string'
            ? rawValue.trim()
            : Array.isArray(rawValue)
              ? rawValue
                  .filter((item): item is string => typeof item === 'string')
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .join('\n')
              : '';
        return normalized ? [[key.slice(0, 80), normalized.slice(0, 2_000)]] : [];
      })
      .slice(0, 30)
  );
};

const stripJsonFence = (answer: string): string => {
  const trimmed = answer.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
};

export const parseAiAssistResponse = (
  answer: string,
  verifiedSources: VerifiedTemplateSource[]
): AIAssistResult & { usedFallbackNoKeys?: boolean } => {
  try {
    const parsed = JSON.parse(stripJsonFence(answer)) as Record<string, unknown>;
    if (
      typeof parsed.proposedText !== 'string' ||
      !Array.isArray(parsed.sourcesUsed) ||
      !Array.isArray(parsed.pendingElements) ||
      !Array.isArray(parsed.warnings) ||
      !['alto', 'medio', 'bajo'].includes(String(parsed.confidenceLevel))
    ) {
      throw new Error('Estructura incompleta');
    }

    const filtered = filterVerifiedAiSources(
      parsed.sourcesUsed as ModelSource[],
      verifiedSources
    );

    return {
      proposedText: parsed.proposedText
        .replace(/\[(?:Desarrollar|Agregar|Relacionar)[^\]]*\]/gi, '[PENDIENTE: completar dato]'),
      sourcesUsed: filtered.sources,
      pendingElements: stringArray(parsed.pendingElements),
      warnings: [...stringArray(parsed.warnings), ...filtered.warnings],
      confidenceLevel:
        filtered.warnings.length > 0
          ? 'bajo'
          : (parsed.confidenceLevel as AIAssistResult['confidenceLevel']),
    };
  } catch {
    throw new Error('La IA no devolvió una respuesta estructurada válida.');
  }
};

export const developWithAI = async (params: {
  templateId: string;
  sectionId: string;
  userInput: string;
  caseContext: Record<string, string>;
  verifiedSources: VerifiedTemplateSource[];
}): Promise<AIAssistResult & { usedFallbackNoKeys?: boolean }> => {
  const {
    templateId,
    sectionId,
    userInput,
    caseContext,
    verifiedSources,
  } = params;

  if (!isAllowedTemplateAiSection(sectionId)) {
    throw new Error('La sección solicitada no admite asistencia de IA.');
  }

  const sourcesText =
    verifiedSources.length === 0
      ? 'No hay fuentes verificadas disponibles. No cites normas ni jurisprudencia.'
      : verifiedSources
          .map(
            (source) =>
              `- ID: ${source.id}\n  Tipo: ${source.type}\n  Título: ${source.title}\n  URL: ${source.url}\n  Extracto indexado: ${source.excerpt}`
          )
          .join('\n');

  const prompt = `Eres un asistente de redacción jurídica para México. Redacta únicamente una propuesta de trabajo que deberá revisar una persona profesional.

Plantilla: ${templateId}
Sección: ${sectionId}
Instrucción de la persona usuaria: ${userInput}
Contexto capturado: ${JSON.stringify(caseContext)}

FUENTES VERIFICADAS DISPONIBLES:
${sourcesText}

REGLAS:
- No inventes artículos, plazos, autoridades, registros digitales ni hechos.
- Sólo puedes citar una fuente de la lista anterior y debes copiar exactamente su ID, URL y tipo.
- Si falta un dato usa "[PENDIENTE: descripción]".
- Devuelve exclusivamente JSON:
{
  "proposedText": "texto propuesto",
  "sourcesUsed": [{"sourceId":"id exacto","title":"título","url":"url exacta","type":"ley|jurisprudencia"}],
  "pendingElements": ["datos faltantes"],
  "warnings": ["advertencias"],
  "confidenceLevel": "alto|medio|bajo"
}`;

  try {
    const response = await routeLlmCompletion(prompt, 'template_ai_assist');
    const hasAnyApiKey = !!process.env.NVIDIA_API_KEY?.trim();
    const usedFallbackNoKeys = (response.provider === 'local' || response.usedFallback) && !hasAnyApiKey;

    return {
      ...parseAiAssistResponse(response.answer, verifiedSources),
      usedFallbackNoKeys,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('sección') || error.message.includes('estructurada'))
    ) {
      throw error;
    }
    const hasAnyApiKey = !!process.env.NVIDIA_API_KEY?.trim();
    if (!hasAnyApiKey) {
      console.warn("[AI Router] Fallback a 'local': ninguna API key configurada (NVIDIA_API_KEY)");
    }
    throw new Error('No fue posible generar la propuesta asistida.');
  }
};
