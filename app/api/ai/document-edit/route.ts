import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, extractIp } from '@/lib/security/rateLimit';
import { requireCaseAccess } from '@/lib/cases/access';
import { isDemoModeEnabled } from '@/lib/security/lawyerAuth';
import { runFastMode } from '@/lib/ai/orchestrator';
import { legalEditPlanSchema, type LegalEditPlan } from '@/lib/ai/schemas/legalEditSchema';
import {
  classifyAssistantIntent,
  containsForbiddenInternalMetadata,
  UNCONFIRMED_PLACEHOLDER,
} from '@/lib/workspace/legalEditContract';

export const dynamic = 'force-dynamic';

/* ============================================================================
   /api/ai/document-edit
   Contrato de edición del Asistente Legal IA sobre el BORRADOR ACTUAL.

   Entrada:  { message, activeDocument (snapshot del workspace), selectedSection? }
   Salida:   { ok, mode: consulta|propuesta|edicion, explanation, operations[], warnings[] }

   La operación de escritura REAL la ejecuta el cliente vía requestDocumentEdits()
   → applyLegalEdits() → estado del editor → persistencia. Este endpoint NUNCA
   escribe en almacenamiento y nunca devuelve operaciones con datos inventados:
   si un dato no está confirmado en el contexto se emite warning y se omite.
   ========================================================================== */

function hasRemoteProvider(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY?.trim());
}

function cleanJsonWrapper(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

/** Contexto estructurado mínimo entregado al modelo (Fase 4 del protocolo). */
function buildModelContext(activeDocument: any, selectedSection?: { id?: string; title?: string }) {
  const doc = activeDocument || {};
  const sectionsIndex: Record<string, string> = doc.sections || {};
  const currentSectionId = selectedSection?.id || Object.keys(sectionsIndex)[0] || null;
  const availableFields = doc.fields && typeof doc.fields === 'object' ? { ...doc.fields } : {};
  const pendingMarkers: string[] = Array.isArray(doc.pendingMarkers) ? doc.pendingMarkers : [];

  return {
    documentId: doc.documentId || doc.draftId || doc.id || null,
    documentType: doc.documentType || null,
    templateId: doc.templateId || null,
    templateName: doc.templateName || doc.title || 'Borrador actual',
    matter: doc.matter || null,
    jurisdiction: doc.jurisdiction || null,
    currentSectionId,
    currentSectionTitle: selectedSection?.title || (currentSectionId ? sectionsIndex[currentSectionId] : null) || null,
    currentDocumentContent: String(doc.previewText || '').slice(0, 24000),
    currentSectionContent: null as string | null,
    documentContext: availableFields,
    caseContext: null as Record<string, any> | null,
    sourceContext: [] as string[],
    availableFields: Object.keys(availableFields),
    editableTargets: pendingMarkers,
  };
}

/**
 * Fallback determinista SIN modelo: solo datos confirmados del snapshot.
 * Para cada placeholder editable busca un campo confirmado cuyo nombre coincida;
 * los que no pueden resolverse quedan como advertencia y conservan su placeholder.
 */

/** Sustantivos-cabeza legítimos por campo: evita contaminación cruzada
 *  (p.ej. [DOMICILIO PROCESAL DEL DEMANDADO] NO se llena con el nombre). */
const FIELD_HEAD_NOUNS: Record<string, string[]> = {
  actor: ['nombre', 'razon', 'razaon', 'denominacion', 'actor', 'promovente', 'parte'],
  demandado: ['nombre', 'razon', 'razaon', 'denominacion', 'demandado', 'demandada', 'parte'],
  quejoso: ['nombre', 'quejoso', 'quejosa', 'parte'],
  tercerointeresado: ['nombre', 'tercero', 'tercera'],
  autoridaderesponsable: ['autoridad', 'responsable', 'juzgado', 'tribunal'],
  representantelegal: ['representante', 'apoderado', 'nombre'],
  expediente: ['numero', 'expediente', 'autos', 'exp', 'juicio'],
  toca: ['toca', 'numero', 'expediente'],
  amparo: ['amparo', 'numero', 'expediente'],
  juzgado: ['juzgado', 'juez', 'autoridad', 'tribunal'],
  tribunal: ['tribunal', 'sala', 'colegiado'],
};

function buildDeterministicPlan(
  mode: 'consulta' | 'propuesta' | 'edicion',
  message: string,
  ctx: ReturnType<typeof buildModelContext>
): LegalEditPlan {
  const warnings: string[] = [];
  const operations: LegalEditPlan['operations'] = [];

  const normalized = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

  const fieldEntries = Object.entries(ctx.documentContext).map(([rawKey, v]) => {
    // Alias semántico desde la clave SIN normalizar: partie_demandado → demandado
    const stripped = rawKey.startsWith('partie_') ? rawKey.slice(7) : rawKey.startsWith('case_') ? rawKey.slice(5) : '';
    return {
      key: normalized(rawKey),
      altKey: stripped && normalized(stripped).length >= 3 ? normalized(stripped) : '',
      rawKey,
      value: String(v ?? '').trim(),
    };
  });

  const candidatesOf = (f: (typeof fieldEntries)[number]) =>
    [f.key, f.altKey].filter(Boolean) as string[];

  const acceptsMarker = (f: (typeof fieldEntries)[number], markerNorm: string, markerHead: string) => {
    const cands = candidatesOf(f);
    // Coincidencia exacta siempre válida.
    if (cands.some((c) => c === markerNorm)) return true;
    // Contención + veto por sustantivo-cabeza.
    const contained = cands.find((c) => c.length >= 5 && markerNorm.includes(c));
    if (!contained) return false;
    const base = f.altKey || f.key;
    const allowedHeads = FIELD_HEAD_NOUNS[base];
    if (!allowedHeads) return true;
    return allowedHeads.some((h) => markerNorm.startsWith(h) || h === markerHead);
  };

  for (const marker of ctx.editableTargets) {
    const markerNorm = normalized(marker.replace(/[[\]]/g, ''));
    if (!markerNorm) continue;
    const markerHead = (normalized(marker).match(/[a-z]+/)?.[0]) || '';

    const match = fieldEntries.find((f) => acceptsMarker(f, markerNorm, markerHead));

    if (match && match.value) {
      operations.push({
        documentId: ctx.documentId || undefined,
        operation: 'replace_field',
        target: marker,
        replacement: match.value,
        reason: `Dato confirmado en el contexto (${match.rawKey}).`,
      });
    } else {
      warnings.push(`${marker}: dato no confirmado en el contexto; se conserva el placeholder.`);
    }
  }

  const explanation =
    mode === 'edicion'
      ? operations.length > 0
        ? `Puedo completar ${operations.length} dato(s) confirmado(s) del borrador. Los datos sin confirmación no serán alterados.`
        : 'No hay datos confirmados suficientes para completar el borrador; ningún placeholder será sustituido.'
      : mode === 'propuesta'
      ? operations.length > 0
        ? `Propuesta: ${operations.length} campo(s) pueden completarse con datos confirmados del contexto.`
        : 'Sin datos confirmados para proponer valores; requiere información adicional.'
      : '';

  return { mode, explanation, operations, warnings };
}

const SYSTEM_PROMPT = `Eres el Asistente Legal IA integrado en un editor de documentos jurídicos mexicanos.

MODOS DE OPERACIÓN (obligatorios):
- CONSULTA: analizar/explicar/responder. NO generes "operations".
- PROPUESTA: proponer cambios concretos PERO no confirmados por el usuario. Genera "operations" pero el sistema NO las aplicará hasta confirmación.
- EDICIÓN: el usuario ordenó expresamente modificar el borrador ("rellena", "corrige", "aplica", "guarda"...). Genera "operations" que el sistema aplicará realmente.

CONTRATO DE OPERACIONES (únicas permitidas):
- replace_field: target = placeholder exacto entre corchetes (p.ej. "[NOMBRE DEL DEMANDADO]"), replacement = valor.
- replace_text: target = fragmento literal EXISTENTE en el documento, replacement = texto nuevo.
- replace_section: sectionId requerido; replacement = contenido íntegro nuevo del apartado.
- insert_after / insert_before: target = ancla literal existente; replacement = párrafo a insertar.

REGLAS ABSOLUTAS:
1. PROHIBIDO INVENTAR nombres, autoridades, domicilios, representantes, fechas, expedientes, cargos, firmas, hechos o pruebas. Si un dato no aparece en availableFields/documentContext usa warnings, NO una operación. Nunca escribas "${UNCONFIRMED_PLACEHOLDER}" como valor.
2. ALCANCE: si piden "rellenar datos" opera SOLO placeholders/campos; no reescribas hechos, excepciones, pruebas, alegatos ni petitorios.
3. Conserva rol procesal, estructura documental, redacciones tachadas con "---" y tono jurídico formal mexicano.
4. PROHIBIDO incluir en replacements metadata interna (OBJETIVO DEL BLOQUE, TEORÍA DEL CASO, CONTEXTO ANTERIOR/POSTERIOR, TEXTO ORIGINAL DEL BLOQUE, prompts o razonamiento).
5. Usa sectionId del índice de apartados cuando lo conozcas.

RESPUESTA: ÚNICAMENTE JSON válido, sin Markdown ni texto extra:
{"mode":"consulta|propuesta|edicion","explanation":"...","operations":[{"documentId":null,"sectionId":"sec-x","operation":"replace_field","target":"[CAMPO]","replacement":"valor","reason":"..."}],"warnings":["..."]}`;

export async function POST(req: NextRequest) {
  try {
    const access = await requireCaseAccess(req);
    let identity: { organizationId: string };
    if (access.ok) {
      identity = { organizationId: access.context.organizationId };
    } else {
      if (!isDemoModeEnabled()) return access.response;
      identity = { organizationId: 'org-demo-legal' };
    }

    const ip = extractIp(req);
    const rateLimitResult = checkRateLimit(ip, 30);
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { ok: false, error: 'rate_limit', friendlyMessage: 'Demasiadas solicitudes. Intente más tarde.' },
        { status: 429 }
      );
    }

    const payload = await req.json().catch(() => ({}));
    const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
    const activeDocument = payload?.activeDocument || null;
    const selectedSection = payload?.selectedSection || undefined;

    if (!message) {
      return NextResponse.json(
        { ok: false, error: 'invalid_message', friendlyMessage: 'El mensaje es obligatorio.' },
        { status: 400 }
      );
    }

    if (!activeDocument) {
      return NextResponse.json({
        ok: true,
        mode: classifyAssistantIntent(message),
        explanation: 'No hay un borrador activo disponible para editar.',
        operations: [],
        warnings: ['Sin contexto de documento.'],
        contextLabel: 'Sin contexto de documento',
        technical: { organizationId: identity.organizationId },
      });
    }

    const intent = classifyAssistantIntent(message);
    const ctx = buildModelContext(activeDocument, selectedSection);

    let plan: LegalEditPlan | null = null;

    if (hasRemoteProvider()) {
      try {
        const userMessage = `[SOLICITUD DEL USUARIO]: ${message}

[DOCUMENTO ACTUAL]
${JSON.stringify(
  {
    ...ctx,
    currentSectionContent: undefined,
  },
  null,
  1
)}

[ÍNDICE DE APARTADOS]
${JSON.stringify(activeDocument.sections || {}, null, 1)}

Genera el JSON de respuesta según tu contrato.`;

        const res = await runFastMode({
          systemPrompt: SYSTEM_PROMPT,
          userMessage,
          mode: 'fast',
          taskType: 'document_edit',
          temperature: 0.1,
          maxTokens: 3000,
        });

        if (res.success && res.content) {
          const parsed = legalEditPlanSchema.safeParse(JSON.parse(cleanJsonWrapper(res.content)));
          if (parsed.success) {
            plan = parsed.data;
            // El modo real lo fija la clasificación determinista (fuente de verdad).
            plan.mode = intent === 'edicion' ? 'edicion' : intent === 'propuesta' ? 'propuesta' : 'consulta';
            if (intent !== 'edicion') plan.operations = [];
          }
        }
      } catch {
        plan = null;
      }
    }

    if (!plan) {
      plan = buildDeterministicPlan(intent, message, ctx);
    }

    // Sanidad final: jamás salir del alcance solicitado ni filtrar metadata interna.
    plan.operations = (plan.operations || []).filter((op) => !containsForbiddenInternalMetadata(op.replacement));
    if (intent === 'consulta') plan.operations = [];

    const contextLabel = activeDocument?.templateName
      ? `Borrador actual (${activeDocument.templateName})`
      : 'Borrador actual';

    return NextResponse.json({
      ok: true,
      mode: plan.mode,
      explanation: plan.explanation,
      operations: plan.operations,
      warnings: plan.warnings.filter(Boolean),
      contextLabel,
      documentId: ctx.documentId,
      technical: { organizationId: identity.organizationId, providerUsed: hasRemoteProvider() ? 'llm+guardrails' : 'deterministic' },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Error en el contrato de edición.' },
      { status: 500 }
    );
  }
}
