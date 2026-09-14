import { NextRequest, NextResponse } from 'next/server';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { runFastMode } from '@/lib/ai/orchestrator';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';
import { sanitizeProfileInput } from '@/lib/workspace/lawyerProfileStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Límite de muestra: nunca se mandan documentos completos enormes al proveedor de IA.
const MAX_SAMPLE_CHARS = Number(process.env.PROFILE_EXTRACT_MAX_CHARS) || 12000;
const EXTRACT_TIMEOUT_MS = Number(process.env.PROFILE_EXTRACT_AI_TIMEOUT_MS) || 60000;

function buildSampleText(sources: UploadedSourceDocument[]): string {
  const chunks: string[] = [];
  let used = 0;
  for (const doc of sources) {
    if (used >= MAX_SAMPLE_CHARS) break;
    const pageTexts = Array.isArray(doc.pages)
      ? doc.pages.map((p) => p?.text || '').filter((t) => t.trim().length > 0)
      : [];
    const raw = (doc.extractedText || doc.content || pageTexts.join('\n\n') || '').trim();
    if (!raw) continue;
    const slice = raw.slice(0, MAX_SAMPLE_CHARS - used);
    used += slice.length;
    const label = String(doc.name || doc.filename || 'documento').slice(0, 120);
    chunks.push(`--- MUESTRA: ${label} ---\n${slice}`);
  }
  return chunks.join('\n\n');
}

function extractJsonBlock(text: string): string {
  const cleaned = text.replace(/```json/gi, '```').trim();
  const fenced = cleaned.match(/```([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : cleaned;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : '';
}

const SYSTEM_PROMPT =
  'Eres el Motor Forense de Análisis y Redacción Jurídica de Jurídico Radar. Analizas escritos de muestra de un abogado para inferir su perfil de estilo de redacción. Respondes EXCLUSIVAMENTE con JSON válido, sin markdown, sin explicaciones ni texto adicional.';

function buildUserPrompt(sample: string): string {
  return `Analiza los siguientes escritos jurídicos de muestra de un mismo abogado/despacho e infiere su PERFIL DE ESTULO de redacción.

Responde ÚNICAMENTE con un objeto JSON válido con EXACTAMENTE estas claves (omite cualquier clave cuyo valor no puedas inferir; no inventes contenido):

{
  "lawyerName": string,
  "firmName": string,
  "preferredTone": "formal_academico" | "combativo_tecnico" | "directo_conciso" | "jurisprudencial",
  "preferredStructure": string[],        // secciones que el abogado suele usar (ej. ENCABEZADO, PROEMIO, ANTECEDENTES, HECHOS, AGRAVIOS, PRUEBAS, PETITORIOS, FIRMA)
  "preferredSectionOrdering": string[],
  "recurringFormulas": string[],         // fórmulas literales recurrentes del abogado
  "openingPatterns": string[],
  "closingPatterns": string[],
  "argumentPatterns": string[],
  "citationStyle": "completo_con_registro" | "sintetico" | "pie_de_pagina" | "transcripcion_marcada",
  "legalTerminology": string[],
  "preferredDefenses": string[],
  "preferredWayToContestFacts": string[],
  "preferredWayToContestBenefits": string[],
  "preferredWayToAttackEvidence": string[],
  "preferredWayToDevelopConstitutionalArguments": string[],
  "preferredWayToWritePetition": string[],
  "averageSectionLength": "breve" | "medio" | "extenso",
  "preferredDocumentLength": "conciso" | "estandar" | "extenso_exhaustivo"
}

REGLAS:
1. SOLO JSON. Sin bloques de código, sin comentarios, sin texto antes o después.
2. Cada array: máximo 8 elementos, frases cortas tomadas o adaptadas de las muestras.
3. No inventes datos personales que no aparezcan en las muestras.

ESCRITOS DE MUESTRA:
${sample}`;
}

// POST /api/workspace/lawyer-profile/extract
// Recibe sourceDocuments (mismo tipo UploadedSourceDocument que usa /api/legal-engine/generate),
// infiere el LawyerProfile con el MISMO orquestador NVIDIA-first del pipeline y devuelve el
// JSON propuesto. NO guarda nada en DB: el frontend lo muestra para revisión y confirma vía PUT.
export async function POST(req: NextRequest) {
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const sourceDocuments: unknown = body?.sourceDocuments;
  if (!Array.isArray(sourceDocuments) || sourceDocuments.length === 0) {
    return NextResponse.json({ ok: false, error: 'MISSING_SOURCE_DOCUMENTS' }, { status: 400 });
  }

  const sample = buildSampleText(sourceDocuments as UploadedSourceDocument[]);
  if (sample.trim().length < 200) {
    return NextResponse.json(
      { ok: false, error: 'NO_TEXT_CONTENT', message: 'Los documentos no contienen suficiente texto extraído para analizar.' },
      { status: 422 }
    );
  }

  try {
    const aiPromise = runFastMode({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: buildUserPrompt(sample),
      mode: 'fast',
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout de extracción de perfil (${EXTRACT_TIMEOUT_MS}ms)`)), EXTRACT_TIMEOUT_MS)
    );

    const aiRes = await Promise.race([aiPromise, timeoutPromise]);

    if (!aiRes.success || !aiRes.content) {
      console.error('[lawyer-profile:extract] Proveedor IA sin contenido:', aiRes.provider);
      return NextResponse.json({ ok: false, error: 'AI_UNAVAILABLE' }, { status: 502 });
    }

    const jsonBlock = extractJsonBlock(aiRes.content);
    if (!jsonBlock) {
      return NextResponse.json({ ok: false, error: 'AI_INVALID_RESPONSE' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonBlock);
    } catch {
      return NextResponse.json({ ok: false, error: 'AI_INVALID_RESPONSE' }, { status: 502 });
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ ok: false, error: 'AI_INVALID_RESPONSE' }, { status: 502 });
    }

    // Misma sanitización que PUT: solo campos conocidos y válidos sobreviven.
    const proposed = sanitizeProfileInput(parsed as Record<string, unknown>);
    if (Object.keys(proposed).length === 0) {
      return NextResponse.json({ ok: false, error: 'AI_EMPTY_PROFILE' }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      proposed,
      aiUsed: aiRes.provider !== 'local',
      provider: aiRes.provider,
      model: aiRes.model,
    });
  } catch (err: any) {
    const isTimeout = String(err?.message || '').includes('Timeout');
    console.error('[lawyer-profile:extract] Error:', err?.message);
    return NextResponse.json(
      { ok: false, error: isTimeout ? 'AI_TIMEOUT' : 'EXTRACT_FAILED' },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
