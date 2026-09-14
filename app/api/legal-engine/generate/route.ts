import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { UploadedSourceDocument, UniversalLegalDocument, CaseWorkflow } from '@/lib/legal-engine/types';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { LawyerProfile } from '@/lib/workspace/lawyerProfileTypes';
import { loadLawyerProfile } from '@/lib/workspace/lawyerProfileStore';
import { buildFingerprint } from '@/lib/legal-engine/generationLock';
import { createGenerationJob, findActiveJobByFingerprint, getGenerationJob, updateJobProgress, completeJob, failJob } from '@/lib/legal-engine/generationJobs';
import { CUSTOM_VALUE_MAX_LENGTH, sanitizeCustomValue } from '@/lib/legal-taxonomy';
import { resolveGenerationTotal } from '@/lib/legal-engine/generationProgress';

type CompletionDocument = UniversalLegalDocument & {
  documentAssemblyResult?: { readiness?: string };
  generationMetadata: UniversalLegalDocument['generationMetadata'] & { readiness?: string };
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const taxonomyValueSchema = z.object({
  value: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  customValue: z.string().max(CUSTOM_VALUE_MAX_LENGTH).optional().nullable(),
}).nullable().optional();

const taxonomySchema = z.object({
  matter: z.string().min(1).max(50).optional(),
  matterCustom: taxonomyValueSchema,
  jurisdiction: z.string().min(1).max(50).optional(),
  jurisdictionCustom: taxonomyValueSchema,
  documentType: z.string().min(1).max(80).optional(),
  documentTypeCustom: taxonomyValueSchema,
  procedure: z.string().max(50).nullable().optional(),
  via: z.string().max(50).nullable().optional(),
  authority: z.string().max(100).nullable().optional(),
}).nullable().optional();

function buildFingerprintFromBody(body: any, sourcesArr: UploadedSourceDocument[]): string {
  const caseParties = Array.isArray(body.caseParties) ? body.caseParties : [];
  const partiesHash = caseParties
    .map((p: any) => `${String(p.role || '').trim().toLowerCase()}:${String(p.name || '').trim().toLowerCase()}`)
    .sort()
    .join('|');
  // Expediente puede venir en body.expediente, body.caseRefs.expediente o dentro de instruction
  const expedienteFromBody = (body.expediente || body.caseRefs?.expediente || '') as string;
  const expedienteFromPrompt = (() => {
    const instr = String(body.userInstruction || '');
    const m = instr.match(/(?:expediente|EXPEDIENTE)\s*[:\-]?\s*([A-Z0-9\-\/\.]+)/i);
    return m ? m[1] : '';
  })();
  return buildFingerprint({
    sourceIds: sourcesArr.filter(Boolean).map((s: any) => s?.id).filter(Boolean),
    userInstruction: body.userInstruction || '',
    matter: (body.taxonomy?.matter || body.matter) as string | undefined,
    jurisdiction: (body.taxonomy?.jurisdiction || body.jurisdiction) as string | undefined,
    documentType: (body.selectedDocumentType || body.taxonomy?.documentType || body.documentType) as string | undefined,
    documentTypeLabel: (body.taxonomy?.documentTypeLabel || body.documentTypeLabel) as string | undefined,
    referenceDocumentId: body.referenceDocumentId as string | undefined,
    expediente: expedienteFromBody || expedienteFromPrompt || '',
    partiesHash,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  // Validación de taxonomía (BLOCK C): si viene taxonomy, validar customValue max 80 y sanitizar
  let taxonomy: any = body.taxonomy || null;
  if (taxonomy) {
    const parsed = taxonomySchema.safeParse(taxonomy);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'INVALID_TAXONOMY', details: parsed.error.issues }, { status: 400 });
    }
    taxonomy = parsed.data;
    // Sanitizar customValues (trim, max 80, eliminar absurdamente largas ya hecho por sanitize)
    for (const key of ['matterCustom', 'jurisdictionCustom', 'documentTypeCustom'] as const) {
      const cv = (taxonomy as any)[key];
      if (cv?.customValue) {
        const sanitized = sanitizeCustomValue(cv.customValue);
        if (cv.value === 'otro' || cv.value === 'otra') {
          if (!sanitized) {
            return NextResponse.json({ ok: false, error: 'CUSTOM_VALUE_REQUIRED', field: key }, { status: 400 });
          }
          (taxonomy as any)[key].customValue = sanitized;
        } else {
          (taxonomy as any)[key].customValue = sanitized;
        }
      }
    }
  }

  const {
    userInstruction,
    sourceDocuments,
    allowUnvalidatedSource,
    referenceDocumentText,
    referenceDocumentId,
    matter,
    documentTypeLabel,
    jurisdiction,
    selectedDocumentType: bodySelectedDocumentType,
    expediente,
    existingDocument,
    lawyerProfile,
    caseParties,
    idempotencyKey: bodyIdempotencyKey,
    workflow,
  } = body;
  const selectedDocumentType = typeof bodySelectedDocumentType === 'string'
    ? bodySelectedDocumentType.trim().slice(0, 80) || undefined
    : undefined;

  const workflowSnapshot = workflow && typeof workflow === 'object'
    ? workflow as CaseWorkflow
    : undefined;

  // A5: las partes confirmadas vienen del frontend (caseParties) y se reenvían al pipeline
  // como savedParties. Este endpoint NO consulta la tabla de partes en ningún momento.
  const savedParties = Array.isArray(caseParties)
    ? (caseParties
        .filter((p: any) => p && typeof p.role === 'string' && typeof p.name === 'string' && p.role.trim() && p.name.trim())
        .map((p: any) => ({ role: p.role.trim(), name: p.name.trim(), ...(typeof p.source === 'string' ? { source: p.source } : {}) }))
      )
    : undefined;

  // B4: si el body NO trae lawyerProfile → cargar el guardado del org; si tampoco existe →
  // DEFAULT_LAWYER_PROFILE (loadLawyerProfile nunca escribe). Si el body SÍ lo trae, se usa
  // tal cual (compatibilidad con el flujo existente).
  const bodyProfile = lawyerProfile as LawyerProfile | undefined;
  let effectiveLawyerProfile = bodyProfile && typeof bodyProfile === 'object' ? bodyProfile : undefined;
  if (!effectiveLawyerProfile) {
    try {
      const loaded = await loadLawyerProfile(auth.context.organizationId, auth.context.lawyerId);
      effectiveLawyerProfile = loaded.profile;
      console.log(`[generate:POST] lawyerProfile cargado automáticamente (${loaded.fromDefault ? 'DEFAULT_LAWYER_PROFILE' : 'perfil guardado del org'})`);
    } catch (err: any) {
      console.warn('[generate:POST] No se pudo cargar el perfil del org:', err?.message);
    }
  }

  const sourcesArr = (sourceDocuments as UploadedSourceDocument[] | undefined) || [];
  const headerKey = req.headers.get('x-idempotency-key')?.trim() || req.headers.get('x-generation-id')?.trim() || '';
  const idempotencyKey = headerKey || bodyIdempotencyKey?.trim() || null;
  const fingerprint = buildFingerprintFromBody(body, sourcesArr);
  const wantSync = Boolean(body.sync) || req.nextUrl.searchParams.get('sync') === '1';

  // Logging crítico para diagnóstico 404 (PASO 2)
  console.log('[generate:POST] Validaciones:');
  console.log('  auth.ok:', auth.ok);
  console.log('  body keys:', Object.keys(body).length > 0 ? Object.keys(body).slice(0, 5) : 'empty');
  console.log('  fingerprint:', fingerprint ? fingerprint.slice(0, 24) + '...' : 'null');
  console.log('  idempotencyKey:', idempotencyKey ? idempotencyKey.slice(0, 16) + '...' : 'null');
  console.log('  sourcesArr:', sourcesArr.length);

  // Resolver labels efectivos desde taxonomy si está presente (evita enviar solo "otro")
  let effectiveMatter = matter as string | undefined;
  let effectiveDocumentTypeLabel = documentTypeLabel as string | undefined;
  let effectiveJurisdiction = jurisdiction as string | undefined;
  if (taxonomy) {
    const { resolveMatterLabel, resolveJurisdictionLabel, resolveDocumentTypeLabel } = await import('@/lib/legal-taxonomy');
    if (taxonomy.matter) effectiveMatter = resolveMatterLabel(taxonomy);
    if (taxonomy.jurisdiction) effectiveJurisdiction = resolveJurisdictionLabel(taxonomy);
    if (taxonomy.documentType) effectiveDocumentTypeLabel = resolveDocumentTypeLabel(taxonomy);
  }

  // Compat sync directo (para tests internos o clientes legacy que lo soliciten explícitamente)
  if (wantSync) {
    try {
      const doc = await runGenerationPipeline({
        userInstruction, sourceDocuments: sourcesArr, allowUnvalidatedSource,
        referenceDocumentText, referenceDocumentId, matter: effectiveMatter, documentTypeLabel: effectiveDocumentTypeLabel, selectedDocumentType, jurisdiction: effectiveJurisdiction, expediente: (expediente as string | undefined)?.trim() || undefined, taxonomy, existingDocument, lawyerProfile: effectiveLawyerProfile, savedParties, workflow: workflowSnapshot, idempotencyKey: fingerprint,
      }, {} as any);
      return NextResponse.json({ ok: true, document: doc });
    } catch (err: any) {
      if ([
        'SOURCE_DOCUMENT_INCOMPATIBLE',
        'MISSING_SOURCE_COMPATIBILITY_RULE',
        'DOCUMENT_TYPE_NOT_IMPLEMENTED',
        'UNKNOWN_DOCUMENT_TYPE',
        'INCOMPATIBLE_DOCUMENT_ROUTE',
      ].includes(err?.code)) {
        return NextResponse.json({ ok: false, error: err.message, errorCode: err.code, errorMetadata: err.metadata }, { status: 422 });
      }
      throw err;
    }
  }

  // 1. Anti-duplicado: si ya existe job activo con mismo fingerprint/idempotencyKey, reutilizar
  const existingJob = findActiveJobByFingerprint(fingerprint, idempotencyKey);
  console.log('  existingJob encontrado?:', !!existingJob, existingJob ? `(jobId:${existingJob.jobId.slice(0,8)}...)` : '');
  if (existingJob) {
    console.log('[generate:POST] Reutilizando job existente:', existingJob.jobId);
    return NextResponse.json({
      ok: true,
      jobId: existingJob.jobId,
      status: existingJob.status,
      total: existingJob.total,
      completed: existingJob.completed,
      percentage: existingJob.percentage,
      currentBlock: existingJob.currentBlock,
      reused: true,
    }, { headers: { 'X-Job-Id': existingJob.jobId } });
  }

  // 2. Crear job y responder INMEDIATAMENTE (sin esperar pipeline)
  console.log('[generate:POST] Creando job...');
  const job = createGenerationJob({ fingerprint, idempotencyKey, total: 0, stage: 'Preparando documento…' });
  console.log('[generate:POST] ✓ Job creado exitosamente:', job.jobId);

  // 3. Lanzar pipeline en background, actualizando progreso REAL por bloque (sin timeout global)
  // Detach promise — no await
  (async () => {
    try {
      const callbacks = {
        onStageStart: (stage: any) => {
          updateJobProgress(job.jobId, { stage: String(stage), logLine: `[pipeline:stage] ${stage} iniciado` });
        },
        onProgressMessage: (msg: string) => {
          updateJobProgress(job.jobId, { stage: msg });
        },
        onBlockProgress: (current: number, total: number, block: any) => {
          // current es contador IA-only; aquí actualizamos currentBlock para UI
          updateJobProgress(job.jobId, {
            currentBlock: block.title,
            currentBlockIndex: current,
            aiProvider: null,
            logLine: `[pipeline:bloque] Preparando ${current}/${total} "${block.title.slice(0,60)}"`,
          });
        },
      };

      // Ejecutar pipeline con callbacks. El pipeline internamente invoca generateLegalBlock
      // con timeout individual 15s por bloque y fallback determinístico — sin timeout global.
      const doc: UniversalLegalDocument = await runGenerationPipeline(
        {
          userInstruction,
          sourceDocuments: sourcesArr,
          allowUnvalidatedSource,
          referenceDocumentText: referenceDocumentText as string | undefined,
          referenceDocumentId: referenceDocumentId as string | undefined,
          matter: effectiveMatter,
          documentTypeLabel: effectiveDocumentTypeLabel,
          selectedDocumentType,
          jurisdiction: effectiveJurisdiction,
          expediente: (expediente as string | undefined)?.trim() || undefined,
          taxonomy,
          existingDocument: existingDocument as UniversalLegalDocument | undefined,
          lawyerProfile: effectiveLawyerProfile,
          savedParties,
          workflow: workflowSnapshot,
          idempotencyKey: idempotencyKey || fingerprint,
          jobId: job.jobId,
        },
        // Bridge: además de callbacks estándar, enganchar progreso real por bloque
        {
          onStageStart: callbacks.onStageStart as any,
          onProgressMessage: callbacks.onProgressMessage as any,
          onBlockProgress: callbacks.onBlockProgress as any,
          onStageComplete: () => {},
        } as any
      );

      const finalTotal = resolveGenerationTotal(doc, job.total);
      const completionDoc = doc as CompletionDocument;
      const docReadiness = completionDoc.documentAssemblyResult?.readiness
        || completionDoc.generationMetadata.readiness
        || (doc.status === 'draft' || !doc.generationMetadata?.pipelineState?.isComplete ? 'REQUIRES_REVIEW' : 'READY');
      const stageText = docReadiness === 'READY'
        ? 'Documento generado y listo para revisión final'
        : docReadiness === 'BLOCKED' || docReadiness === 'INVALID'
          ? 'Documento generado con bloqueos estructurales (requiere subsanación)'
          : 'Documento generado en borrador (requiere revisión del abogado)';
      // Marcamos progreso final real: completed = total
      updateJobProgress(job.jobId, { total: finalTotal, completed: finalTotal, percentage: 100, stage: stageText, currentBlock: doc.sections[doc.sections.length-1]?.title || null });
      completeJob(job.jobId, doc, { documentReadiness: docReadiness });
      console.log(`[pipeline:job] Job ${job.jobId} completado ${finalTotal}/${finalTotal}`);
    } catch (err: any) {
      console.error(`[pipeline:job] Job ${job.jobId} fallido:`, err?.message);
      failJob(job.jobId, err?.message || 'Error desconocido en pipeline', err?.code, err?.metadata);
    }
  })();

  // Enriquecer total estimado de forma optimista si podemos inferir de sources/reference
  // El total real se actualizará cuando blockPlan esté listo (callbacks)
  return NextResponse.json({
    ok: true,
    jobId: job.jobId,
    status: job.status,
    total: job.total,
    completed: job.completed,
    percentage: job.percentage,
    stage: job.stage,
  }, { headers: { 'X-Job-Id': job.jobId } });
}

// Compat: GET con jobId también soportado vía /generate?jobId=xxx (redirección a status)
// y legacy sync para tests que hacen POST y esperan document directo: si cliente envía ?sync=1, se ejecuta sync
export async function GET(req: NextRequest) {
  // El job contiene el documento completo — exige la MISMA identidad que POST/status.
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');
  if (jobId) {
    const job = getGenerationJob(jobId);
    if (!job) return NextResponse.json({ ok: false, error: 'JOB_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({
      ok: true,
      jobId: job.jobId,
      status: job.status,
      total: job.total,
      completed: job.completed,
      percentage: job.percentage,
      currentBlock: job.currentBlock,
      stage: job.stage,
      aiProvider: job.aiProvider,
      error: job.error,
    });
  }
  return NextResponse.json({ ok: false, error: 'MISSING_JOBID' }, { status: 400 });
}
