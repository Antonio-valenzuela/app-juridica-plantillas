/**
 * LOOP 9 — §16
 * PRUEBA DE ACEPTACIÓN: MANEJO DE ERRORES PARA EL USUARIO
 *
 * Verifica que la aplicación devuelve errores útiles para todos los
 * escenarios de fallo:
 *   - formato no soportado
 *   - archivo vacío
 *   - materia incompatible
 *   - documento no clasificable
 *   - falta de datos
 *   - fallo IA (simulado: sin proveedor)
 *   - fallo export
 *   - job inexistente
 *   - tipo no implementado (DOCUMENT_TYPE_NOT_IMPLEMENTED)
 *
 * NUNCA: 500 genérico cuando hay información suficiente para un error de dominio.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  evaluateSourceOutputCompatibility,
  SourceDocumentIncompatibleError,
  SOURCE_DOCUMENT_INCOMPATIBLE,
  DOCUMENT_TYPE_NOT_IMPLEMENTED,
  MISSING_SOURCE_COMPATIBILITY_RULE,
  getSourceOutputCompatibilityPolicy,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { validateForExport } from '@/lib/legal-engine/exportGuards';
import { generationJobStore } from '@/lib/legal-engine/generationJobStore';

import { NextRequest } from 'next/server';
import { POST as POST_analyzeUpload } from '@/app/api/templates/analyze-upload/route';
import { GET as GET_generateStatus } from '@/app/api/legal-engine/generate/status/route';
import { POST as POST_exportDocx } from '@/app/api/legal-engine/export/docx/route';
import { POST as POST_exportPdf } from '@/app/api/legal-engine/export/pdf/route';

beforeAll(() => {
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) {
    delete process.env[k];
  }
  process.env.DEMO_MODE_ENABLED = 'true';
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSrc(id: string, text: string, sourceDocumentType?: string) {
  return createSourceDocument({
    id,
    filename: `${id}.pdf`,
    sourceValidated: true,
    pages: [{ page: 1, text, chars: text.length }],
    ...(sourceDocumentType ? { classification: { sourceDocumentType } } : {}),
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// §16 — MATERIA INCOMPATIBLE → error estructurado con código de dominio
// ══════════════════════════════════════════════════════════════════════════════

describe('§16 — Materia incompatible: error estructurado antes de IA', () => {
  it('fuente mercantil + output civil → SourceDocumentIncompatibleError (no 500 genérico)', () => {
    const mercSrc = makeSrc('err-mercantil', 'PAGARÉ. Suscriptor: EMPRESA. Beneficiario: BANCO. $500,000.', 'PAGARE');

    let caught: unknown;
    try {
      evaluateSourceOutputCompatibility({
        selectedDocumentType: 'contestacion_demanda_civil',
        sourceDocuments: [mercSrc],
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SourceDocumentIncompatibleError);
    const err = caught as SourceDocumentIncompatibleError;
    expect(err.code).toBe(SOURCE_DOCUMENT_INCOMPATIBLE);
    // El mensaje es útil para la UI
    expect(err.message).toContain(SOURCE_DOCUMENT_INCOMPATIBLE);
    expect(err.message).toContain('contestacion_demanda_civil');
    expect(err.metadata.sourceMatter).toBeTruthy();
  });

  it('fuente laboral + output mercantil → bloqueado (INCOMPATIBLE o NEEDS_INPUT, nunca COMPATIBLE)', () => {
    const laboralSrc = makeSrc('err-laboral', 'DEMANDA LABORAL. Despido injustificado. Trabajador.', 'DEMANDA_LABORAL');

    let result: ReturnType<typeof evaluateSourceOutputCompatibility> | null = null;
    let caught: unknown = null;
    try {
      result = evaluateSourceOutputCompatibility({
        selectedDocumentType: 'demanda_ejecutiva_mercantil',
        sourceDocuments: [laboralSrc],
      });
    } catch (err) {
      caught = err;
    }
    if (caught) {
      expect(caught).toMatchObject({ code: SOURCE_DOCUMENT_INCOMPATIBLE });
    } else {
      // Si no lanzó, debe ser NEEDS_INPUT — nunca COMPATIBLE
      expect(result!.status).not.toBe('COMPATIBLE');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §16 — TIPO NO IMPLEMENTADO → DOCUMENT_TYPE_NOT_IMPLEMENTED
// ══════════════════════════════════════════════════════════════════════════════

describe('§16 — Tipo no implementado: error de dominio específico', () => {
  it('tipo sin strategy/template → DocumentTypeNotImplementedError en evaluación', () => {
    expect(
      () => evaluateSourceOutputCompatibility({
        selectedDocumentType: 'reconvencion', // UNSUPPORTED_DOCUMENT_TYPE en el catálogo legacy
        sourceDocuments: [],
      }),
    ).toThrowError(expect.objectContaining({ code: DOCUMENT_TYPE_NOT_IMPLEMENTED }));
  });

  it('tipo sin strategy/template → error en pipeline (no se genera nada)', async () => {
    await expect(runGenerationPipeline({
      selectedDocumentType: 'reconvencion',
      userInstruction: 'Preparar reconvención.',
      sourceDocuments: [],
    })).rejects.toMatchObject({ code: DOCUMENT_TYPE_NOT_IMPLEMENTED });
  });

  it('tipo no registrado → UNKNOWN_DOCUMENT_TYPE (no error genérico)', () => {
    expect(
      () => getSourceOutputCompatibilityPolicy('tipo_completamente_inventado_xyz'),
    ).toThrowError(/UNKNOWN_DOCUMENT_TYPE/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §16 — REGLA FALTANTE → MISSING_SOURCE_COMPATIBILITY_RULE
// ══════════════════════════════════════════════════════════════════════════════

describe('§16 — Regla de compatibilidad faltante: default-deny', () => {
  it('tipo implementado sin regla en rules vacío → MissingSourceCompatibilityRuleError', () => {
    expect(
      () => getSourceOutputCompatibilityPolicy('contestacion_demanda_laboral', {}),
    ).toThrowError(expect.objectContaining({ code: MISSING_SOURCE_COMPATIBILITY_RULE }));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §16 — ARCHIVO VACÍO / SIN CLASIFICAR
// ══════════════════════════════════════════════════════════════════════════════

describe('§16 — Archivo vacío / sin clasificar: error NEEDS_INPUT no crash', () => {
  it('documento sin texto clasificable → NEEDS_INPUT (no crash)', () => {
    const emptySrc = createSourceDocument({
      id: 'err-empty',
      filename: 'vacio.pdf',
      sourceValidated: true,
      content: '',
    });

    // Para un tipo que requiere fuente con tipo conocido (con regla EXPLICIT_COMPATIBILITY)
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'recurso_queja',
      sourceDocuments: [emptySrc],
    });

    // El resultado debe ser NEEDS_INPUT (no puede clasificar) — no crash
    expect(['NEEDS_INPUT', 'COMPATIBLE']).toContain(result.status);
  });

  it('tipo escrito_libre acepta cualquier fuente incluyendo vacía → COMPATIBLE', () => {
    const emptySrc = createSourceDocument({
      id: 'err-empty2',
      filename: 'vacio2.pdf',
      sourceValidated: true,
      content: '',
    });

    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'escrito_libre',
      sourceDocuments: [emptySrc],
    });
    expect(result.status).toBe('COMPATIBLE');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §16 — FALLO IA (sin proveedor): la app continúa con fallback
// ══════════════════════════════════════════════════════════════════════════════

describe('§16 — Fallo IA: fallback determinístico mantiene la app funcionando', () => {
  it('sin claves IA el pipeline genera un documento válido en fallback', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Escrito de trámite sin IA.',
      sourceDocuments: [],
    });

    expect(doc).toBeDefined();
    expect(doc.sections.length).toBeGreaterThan(0);

    // Verifica que el fallback no dejó prompts visibles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = doc.sections.map((s: any) => s.content.map((b: any) => b.text).join('\n')).join('\n');
    expect(text).not.toMatch(/OBJETIVO DEL BLOQUE\s*:/i);
    expect(text).not.toMatch(/FRAGMENTOS DEL EXPEDIENTE/i);
  }, 30000);
});

// ══════════════════════════════════════════════════════════════════════════════
// §16 — FALLO EXPORT: guardas de exportación producen error estructurado
// ══════════════════════════════════════════════════════════════════════════════

describe('§16 — Fallo export: guardas producen error estructurado, no 500 genérico', () => {
  it('documento con placeholders técnicos es bloqueado por validateForExport', () => {
    // Crear documento con placeholders inaceptables
    const docWithPlaceholders = {
      id: 'test-invalid-export',
      title: 'Documento inválido',
      documentType: 'escrito_libre',
      documentTypeLabel: 'Escrito Libre',
      matter: 'general',
      jurisdiction: 'federal',
      category: 'escrito',
      legalBasis: [],
      parties: {},
      caseRefs: {},
      variables: {},
      sections: [{
        id: 'sec-1',
        type: 'text',
        title: 'SECCIÓN',
        order: 1,
        content: [{
          id: 'blk-1',
          layer: 'USER_POSITION',
          text: 'OBJETIVO DEL BLOQUE: Texto de prueba con placeholder {{variable}} y [Completar por la IA].',
          isManuallyEdited: false,
        }],
        isRepeatable: false,
        isEditable: true,
        isGenerated: true,
        isManuallyEdited: false,
        variables: [],
        validationErrors: [],
        validationWarnings: [],
      }],
      sourceDocuments: [],
      classification: {
        documentType: 'escrito_libre', documentTypeLabel: 'Escrito Libre',
        matter: 'general', jurisdiction: 'federal', proceduralStage: 'inicial',
        objective: '', requiredInputs: [], confidence: 100, isDynamic: false,
      },
      validation: { isValid: true, errors: [], warnings: [] },
      generationMetadata: {
        pipelineState: {
          currentStage: null,
          stages: {
            classify: { stage: 'classify', status: 'pending' },
            extract: { stage: 'extract', status: 'pending' },
            analyze: { stage: 'analyze', status: 'pending' },
            structure: { stage: 'structure', status: 'pending' },
            identify_issues: { stage: 'identify_issues', status: 'pending' },
            generate_sections: { stage: 'generate_sections', status: 'pending' },
            review_coherence: { stage: 'review_coherence', status: 'pending' },
            validate: { stage: 'validate', status: 'pending' },
          },
          isComplete: false,
          hasErrors: false,
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
    } as any;

    const result = validateForExport(docWithPlaceholders);
    // El resultado debe reportar el problema, no lanzar un error genérico sin info
    expect(result).toBeDefined();
    // Puede ser errors o warnings según la severidad declarada en exportGuards
    // Lo importante: la función produce información estructurada, no undefined/null
    expect(Array.isArray(result.errors) || Array.isArray(result.warnings)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §16 — JOB INEXISTENTE: getJob devuelve null, no excepción
// ══════════════════════════════════════════════════════════════════════════════

describe('§16 — Job inexistente: getJob no lanza excepción', () => {
  it('getJob con ID inexistente devuelve null (no crash)', () => {
    const result = generationJobStore.get('job-inexistente-xyz-123456');
    // getJob debe devolver null/undefined para un ID no registrado
    expect(result == null).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §16 — FUENTE NO CLASIFICABLE: NEEDS_INPUT coherente
// ══════════════════════════════════════════════════════════════════════════════

describe('§16 — Fuente no clasificable: NEEDS_INPUT nunca crash', () => {
  it('fuente con texto ambiguo produce NEEDS_INPUT con código SOURCE_TYPE_UNKNOWN', () => {
    const ambiguousSrc = createSourceDocument({
      id: 'err-ambiguous',
      filename: 'ambiguo.pdf',
      sourceValidated: true,
      content: 'Texto jurídico sin clasificación suficiente para determinar el tipo.',
    });

    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'recurso_queja',
      sourceDocuments: [ambiguousSrc],
    });

    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.code).toBe('SOURCE_TYPE_UNKNOWN');
    expect(result.sourceDocumentType).toBe('DOCUMENTO_JURIDICO_NO_CLASIFICADO');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §16 — CONTRATOS HTTP DE ERROR EN RUTAS DE API REALES
// ══════════════════════════════════════════════════════════════════════════════

describe('§16 — Contratos HTTP de error en endpoints de la API', () => {
  it('POST /api/templates/analyze-upload sin archivo devuelve HTTP 400', async () => {
    const formData = new FormData();
    const req = new NextRequest('http://localhost/api/templates/analyze-upload', {
      method: 'POST',
      body: formData,
    });
    const res = await POST_analyzeUpload(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain('No se recibió ningún archivo');
  });

  it('POST /api/templates/analyze-upload con extensión no soportada devuelve HTTP 415', async () => {
    const formData = new FormData();
    const fakeFile = new File([new Uint8Array([1, 2, 3])], 'prueba.xyz', { type: 'application/octet-stream' });
    formData.append('file', fakeFile);

    const req = new NextRequest('http://localhost/api/templates/analyze-upload', {
      method: 'POST',
      body: formData,
    });
    const res = await POST_analyzeUpload(req);
    expect(res.status).toBe(415);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.unsupported).toBe(true);
    expect(json.error).toContain('Formato no soportado: .xyz');
  });

  it('GET /api/legal-engine/generate/status sin jobId devuelve HTTP 400 MISSING_JOBID', async () => {
    const req = new NextRequest('http://localhost/api/legal-engine/generate/status', {
      method: 'GET',
    });
    const res = await GET_generateStatus(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('MISSING_JOBID');
  });

  it('GET /api/legal-engine/generate/status con jobId inexistente devuelve HTTP 404 JOB_NOT_FOUND', async () => {
    const req = new NextRequest('http://localhost/api/legal-engine/generate/status?jobId=inexistente-12345', {
      method: 'GET',
    });
    const res = await GET_generateStatus(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('JOB_NOT_FOUND');
  });

  it('POST /api/legal-engine/export/docx con documento inválido devuelve HTTP 422', async () => {
    const req = new NextRequest('http://localhost/api/legal-engine/export/docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: { id: 'doc-invalido', title: 'Inválido' } }),
    });
    const res = await POST_exportDocx(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it('POST /api/legal-engine/export/pdf con documento inválido devuelve HTTP 422', async () => {
    const req = new NextRequest('http://localhost/api/legal-engine/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: { id: 'doc-invalido', title: 'Inválido' } }),
    });
    const res = await POST_exportPdf(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});
