import type {
  StructuredDocument,
  DocumentBlock,
  BoundingBox,
  DocumentBlockType,
  BlockStyle,
} from '../legal-engine/types';

export interface NemotronParserConfig {
  apiKey?: string;
  endpointUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export interface NemotronParseResult {
  ok: boolean;
  structuredDocument?: StructuredDocument;
  extractedText?: string;
  reason?: 'not_configured' | 'api_error' | 'success';
  message?: string;
  error?: string;
}

/**
 * Obtiene la configuración de NVIDIA Nemotron-Parse desde variables de entorno
 */
export function getNemotronConfig(): NemotronParserConfig {
  return {
    apiKey: process.env.NVIDIA_API_KEY,
    endpointUrl: process.env.NVIDIA_NEMOTRON_PARSE_URL || 'https://integrate.api.nvidia.com/v1/chat/completions',
    model: process.env.NVIDIA_NEMOTRON_PARSE_MODEL || 'nvidia/nemotron-parse-v1.2',
    timeoutMs: process.env.NVIDIA_TIMEOUT_MS ? Number(process.env.NVIDIA_TIMEOUT_MS) : 25000,
  };
}

/**
 * Tokens de control documentados oficialmente por NVIDIA para Nemotron-Parse-v1.2
 */
export const NEMOTRON_PARSE_PROMPT = '</s><s><predict_bbox><predict_classes><output_markdown><predict_no_text_in_pic>';

/**
 * Detecta si una línea contiene metadatos técnicos del PJF o firmas digitales
 * (ej. RSA-SHA256, hashes, certificados, cadenas OCSP, versiones públicas)
 */
function isTechnicalMetadata(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('rsa-sha256') ||
    lower.includes('cadena de firma') ||
    lower.includes('sello digital') ||
    lower.includes('versión pública') ||
    lower.includes('pjf - versión pública') ||
    lower.includes('ocsp') ||
    lower.includes('tsa') ||
    /^[0-9a-fA-F]{32,}$/.test(text.replace(/\s+/g, '')) ||
    /^(sha1|sha256|md5):/i.test(text) ||
    /^(evidencia criptográfica|certificado digital|firmado por:)/i.test(lower)
  );
}

/**
 * Parsea bounding boxes desde los formatos emitidos por Nemotron-Parse
 * ([ymin, xmin, ymax, xmax], {"box_2d": [...]}, <!-- box: [...] -->, <box ...>)
 */
export function extractBoundingBox(raw: any): BoundingBox | undefined {
  if (!raw) return undefined;

  if (
    typeof raw.xmin === 'number' &&
    typeof raw.ymin === 'number' &&
    typeof raw.xmax === 'number' &&
    typeof raw.ymax === 'number'
  ) {
    return {
      xmin: Math.max(0, Math.min(1000, raw.xmin)),
      ymin: Math.max(0, Math.min(1000, raw.ymin)),
      xmax: Math.max(0, Math.min(1000, raw.xmax)),
      ymax: Math.max(0, Math.min(1000, raw.ymax)),
    };
  }

  if (Array.isArray(raw) && raw.length === 4 && raw.every((n) => typeof n === 'number')) {
    return {
      ymin: raw[0],
      xmin: raw[1],
      ymax: raw[2],
      xmax: raw[3],
    };
  }

  if (Array.isArray(raw.box_2d) && raw.box_2d.length === 4) {
    return {
      ymin: raw.box_2d[0],
      xmin: raw.box_2d[1],
      ymax: raw.box_2d[2],
      xmax: raw.box_2d[3],
    };
  }

  return undefined;
}

/**
 * Normaliza la respuesta emitida por Nemotron-Parse convirtiéndola a bloques estructurados
 */
export function normalizeNemotronOutput(
  content: string,
  pageNumber: number = 1
): DocumentBlock[] {
  if (!content || !content.trim()) return [];

  const blocks: DocumentBlock[] = [];
  const lines = content.split('\n');
  let currentOrder = 1;
  let tableAccumulator: string[] = [];
  let inTable = false;

  const flushTable = () => {
    if (tableAccumulator.length === 0) return;
    const tableText = tableAccumulator.join('\n').trim();
    const rows = tableAccumulator
      .map((row) =>
        row
          .split('|')
          .map((c) => c.trim())
          .filter((c) => c.length > 0)
      )
      .filter((r) => r.length > 0 && !r.every((c) => /^[-:]+$/.test(c)));

    const headers = rows.length > 0 ? rows[0] : undefined;
    const dataRows = rows.length > 1 ? rows.slice(1) : [];

    blocks.push({
      id: `blk-p${pageNumber}-${currentOrder++}`,
      pageNumber,
      type: 'Table',
      text: tableText,
      order: currentOrder,
      style: {
        fontSize: '11px',
        textAlign: 'left',
      },
      tableData: {
        headers,
        rows: dataRows,
      },
    });
    tableAccumulator = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detección de líneas de tabla en Markdown
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      tableAccumulator.push(trimmed);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (!trimmed) continue;

    // Buscar anotaciones de bounding box en la línea
    let bbox: BoundingBox | undefined = undefined;
    let cleanText = trimmed;

    const bboxMatch = trimmed.match(/<!--\s*box:\s*\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]\s*-->/i);
    if (bboxMatch) {
      bbox = {
        ymin: Number(bboxMatch[1]),
        xmin: Number(bboxMatch[2]),
        ymax: Number(bboxMatch[3]),
        xmax: Number(bboxMatch[4]),
      };
      cleanText = cleanText.replace(bboxMatch[0], '').trim();
    }

    // Clasificación de Tipo de Bloque
    let blockType: DocumentBlockType = 'Text';
    let blockStyle: BlockStyle = {
      fontSize: '13px',
      textAlign: 'justify',
      lineHeight: '1.6',
    };

    if (isTechnicalMetadata(cleanText)) {
      blockType = 'Metadata';
      blockStyle = {
        fontSize: '9px',
        textAlign: 'left',
        fontStyle: 'italic',
      };
    } else if (/^#\s+/.test(cleanText)) {
      blockType = 'Section-header';
      cleanText = cleanText.replace(/^#\s+/, '').trim();
      blockStyle = {
        fontSize: '16px',
        fontWeight: 'bold',
        textAlign: 'center',
      };
    } else if (/^##\s+/.test(cleanText) || /^###\s+/.test(cleanText)) {
      blockType = 'Section-header';
      cleanText = cleanText.replace(/^#{2,3}\s+/, '').trim();
      blockStyle = {
        fontSize: '14px',
        fontWeight: 'bold',
        textAlign: 'left',
      };
    } else if (
      /^(quejoso|actor|demandado|autoridad\s+responsable|acto\s+reclamado|expediente|toca|juicio|prestaciones|hechos|derecho|petitorios)/i.test(cleanText) &&
      cleanText.length < 120
    ) {
      blockType = 'Section-header';
      blockStyle = {
        fontSize: '13px',
        fontWeight: 'bold',
        textAlign: 'left',
      };
    } else if (/^(página|foja|\d+\s*\/\s*\d+|pág\.)/i.test(cleanText) && cleanText.length < 40) {
      blockType = 'Page-footer';
      blockStyle = {
        fontSize: '10px',
        textAlign: 'right',
      };
    } else if (/^(firma|atentamente|rúbrica|suscribe|protesto\s+lo\s+necesario)/i.test(cleanText) && cleanText.length < 80) {
      blockType = 'Signature';
      blockStyle = {
        fontSize: '12px',
        fontWeight: 'bold',
        textAlign: 'center',
      };
    } else if (/^[\*\-]\s+/.test(cleanText)) {
      blockType = 'List-item';
      cleanText = cleanText.replace(/^[\*\-]\s+/, '').trim();
      blockStyle = {
        fontSize: '13px',
        textAlign: 'justify',
      };
    }

    if (cleanText) {
      blocks.push({
        id: `blk-p${pageNumber}-${currentOrder++}`,
        pageNumber,
        type: blockType,
        text: cleanText,
        bbox,
        order: currentOrder,
        style: blockStyle,
      });
    }
  }

  if (inTable) {
    flushTable();
  }

  return blocks;
}

/**
 * Ejecuta una llamada real al endpoint de NVIDIA Nemotron-Parse para una imagen de página
 */
async function callNemotronApiForPage(
  imageDataUri: string,
  config: NemotronParserConfig
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.endpointUrl!, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: NEMOTRON_PARSE_PROMPT,
              },
              {
                type: 'image_url',
                image_url: { url: imageDataUri },
              },
            ],
          },
        ],
        temperature: 0.0,
        max_tokens: 4096,
        repetition_penalty: 1.1,
        extra_body: {
          repetition_penalty: 1.1,
          top_k: 1,
          skip_special_tokens: false,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`NVIDIA API HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const json = await response.json();
    return json.choices?.[0]?.message?.content || '';
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Función principal para analizar documentos con NVIDIA Nemotron-Parse.
 * Ejecuta el parsing estructural en el backend de forma segura y normaliza la salida.
 */
export async function parseDocumentWithNemotron(input: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  pages?: Array<{ pageNumber: number; text: string }>;
}): Promise<NemotronParseResult> {
  const config = getNemotronConfig();

  // Si NVIDIA_API_KEY no está configurada, retornar fallback seguro
  if (!config.apiKey || !config.apiKey.trim()) {
    return {
      ok: false,
      reason: 'not_configured',
      message: 'NVIDIA Nemotron-Parse no configurado. Usando extracción nativa estándar.',
    };
  }

  try {
    const isImage = input.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(input.fileName);
    const pages = input.pages || [{ pageNumber: 1, text: '' }];
    const allBlocks: DocumentBlock[] = [];
    const structuredPages: StructuredDocument['pages'] = [];

    if (isImage) {
      // Para imágenes, enviar la representación visual a Nemotron-Parse
      const base64Data = input.buffer.toString('base64');
      const dataUri = `data:${input.mimeType || 'image/jpeg'};base64,${base64Data}`;

      const rawContent = await callNemotronApiForPage(dataUri, config);
      const pageBlocks = normalizeNemotronOutput(rawContent, 1);

      allBlocks.push(...pageBlocks);
      structuredPages.push({
        pageNumber: 1,
        text: rawContent,
        blocks: pageBlocks,
      });
    } else {
      // Para documentos multipágina, procesar la estructura preservando fojas y tipos
      for (const p of pages) {
        const pageBlocks = normalizeNemotronOutput(p.text, p.pageNumber);
        allBlocks.push(...pageBlocks);
        structuredPages.push({
          pageNumber: p.pageNumber,
          text: p.text,
          blocks: pageBlocks,
        });
      }
    }

    const structuredDocument: StructuredDocument = {
      fileName: input.fileName,
      pageCount: structuredPages.length,
      pages: structuredPages,
      blocks: allBlocks,
      parsedBy: 'nvidia-nemotron-parse',
      parsedAt: new Date().toISOString(),
    };

    return {
      ok: true,
      reason: 'success',
      structuredDocument,
      extractedText: structuredPages.map((p) => p.text).join('\n\n'),
    };
  } catch (err: any) {
    console.warn('[nemotronParser] Error durante llamada a Nemotron-Parse:', err?.message || err);
    return {
      ok: false,
      reason: 'api_error',
      error: err?.message || 'Error de conexión con NVIDIA Nemotron-Parse.',
    };
  }
}
