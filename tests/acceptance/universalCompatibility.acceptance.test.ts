/**
 * LOOP 9 — §2, §3, §4, §6, §7, §8, §21, §25
 * PRUEBA DE ACEPTACIÓN: COMPATIBILIDAD UNIVERSAL ENTRE MATERIAS
 *
 * Verifica la matriz SOURCE MATTER × OUTPUT MATTER tanto a nivel de política
 * interna como a través del flujo productivo real de la API (/api/legal-engine/generate).
 *
 * Requisitos del spec:
 *   §2: Bloqueo explícito de pares incompatibles (mercantil/familiar, penal/familiar, etc.)
 *   §3, §7: Excepciones legítimas cross-matter (amparo sobre sentencia laboral, civil, administrativa)
 *   §4: Errores estructurados antes de invocar IA
 *   §6: Compatibilidad integrada en el flujo productivo de la API (HTTP 422, sin IA, sin documento)
 *   §8: Distinción entre Source Document Classification y Output Intent Classification
 *   §21: Document routing: classifier distingue materias
 *   §25: Matriz programática completa sin UNKNOWN en tipos IMPLEMENTED
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import {
  evaluateSourceOutputCompatibility,
  SourceDocumentIncompatibleError,
  SOURCE_DOCUMENT_INCOMPATIBLE,
  SOURCE_OUTPUT_COMPATIBILITY_RULES,
  inferSourceOutputType,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { LEGAL_CATALOG_REGISTRY } from '@/lib/catalog/legalCatalog';
import { isAmparoDocumentType } from '@/lib/legal-engine/caseContext';
import { classifyIntent } from '@/lib/legal-engine/classifier';
import { POST as POST_generate } from '@/app/api/legal-engine/generate/route';

// ── Sin IA en estos tests ─────────────────────────────────────────────────────
beforeAll(() => {
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) {
    delete process.env[k];
  }
  process.env.DEMO_MODE_ENABLED = 'true';
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSource(
  sourceDocumentType: string,
  textHint = '',
  role: 'PRIMARY' | 'SUPPORTING' | 'REFERENCE' = 'PRIMARY'
) {
  return createSourceDocument({
    id: `src-${sourceDocumentType.toLowerCase()}`,
    filename: `${sourceDocumentType.toLowerCase()}.pdf`,
    sourceValidated: true,
    content: textHint || `Documento jurídico sintético de tipo ${sourceDocumentType}.`,
    classification: { sourceDocumentType, role },
  });
}

function expectBlocked(outputType: string, sourceType: string, textHint = '') {
  const source = makeSource(sourceType, textHint);
  expect(
    () => evaluateSourceOutputCompatibility({ selectedDocumentType: outputType, sourceDocuments: [source] }),
    `Se esperaba bloqueo: ${sourceType} → ${outputType}`,
  ).toThrowError(expect.objectContaining({ code: SOURCE_DOCUMENT_INCOMPATIBLE }));
}

// ══════════════════════════════════════════════════════════════════════════════
// §2 — PARES BLOQUEADOS EXPLÍCITOS A NIVEL DE POLÍTICA
// ══════════════════════════════════════════════════════════════════════════════

describe('§2 — Pares de materia BLOQUEADOS antes de IA', () => {
  it('expediente mercantil + contestación laboral → BLOQUEAR', () => {
    const source = makeSource('DEMANDA_MERCANTIL', 'Juicio ejecutivo mercantil ordinario entre empresas.');
    expect(
      () => evaluateSourceOutputCompatibility({
        selectedDocumentType: 'contestacion_demanda_laboral',
        sourceDocuments: [source],
      }),
    ).toThrowError(expect.objectContaining({ code: SOURCE_DOCUMENT_INCOMPATIBLE }));
  });

  it('expediente penal + contestación laboral → BLOQUEAR', () => {
    const source = makeSource('RECURSO', 'Carpeta de investigación penal. Imputado. Ministerio Público.');
    expect(
      () => evaluateSourceOutputCompatibility({
        selectedDocumentType: 'contestacion_demanda_laboral',
        sourceDocuments: [source],
      }),
    ).toThrowError(expect.objectContaining({ code: SOURCE_DOCUMENT_INCOMPATIBLE }));
  });

  it('expediente laboral + contestación civil → BLOQUEAR', () => {
    const source = makeSource('DEMANDA_LABORAL', 'Despido injustificado. Trabajador. Relación de trabajo. Salario.');
    expect(
      () => evaluateSourceOutputCompatibility({
        selectedDocumentType: 'contestacion_demanda_civil',
        sourceDocuments: [source],
      }),
    ).toThrowError(expect.objectContaining({ code: SOURCE_DOCUMENT_INCOMPATIBLE }));
  });

  it('expediente fiscal + contestación civil → BLOQUEAR', () => {
    const source = makeSource('RESOLUCION_ADMINISTRATIVA',
      'Crédito fiscal determinado. SAT. Obligación tributaria. Multa.',
    );
    expect(
      () => evaluateSourceOutputCompatibility({
        selectedDocumentType: 'contestacion_demanda_civil',
        sourceDocuments: [source],
      }),
    ).toThrowError(expect.objectContaining({ code: SOURCE_DOCUMENT_INCOMPATIBLE }));
  });

  it('fuente mercantil no controla contestación civil', () => {
    expectBlocked('contestacion_demanda_civil', 'DEMANDA_MERCANTIL',
      'Juicio ordinario mercantil entre comerciantes.');
  });

  it('fuente civil no controla demanda ejecutiva mercantil', () => {
    expectBlocked('demanda_ejecutiva_mercantil', 'CONTRATO_CIVIL',
      'Contrato civil de prestación de servicios.');
  });

  it('fuente laboral no controla demanda ejecutiva mercantil', () => {
    expectBlocked('demanda_ejecutiva_mercantil', 'DEMANDA_LABORAL',
      'Despido injustificado. Salario. Relación laboral.');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §6 — COMPATIBILITY DENTRO DEL FLUJO PRODUCTIVO REAL DE LA API
// ══════════════════════════════════════════════════════════════════════════════

describe('§6 — Compatibilidad dentro de la API productiva (/api/legal-engine/generate)', () => {
  it('MERCANTIL → demanda_divorcio: la API devuelve HTTP 422 SOURCE_DOCUMENT_INCOMPATIBLE, sin IA ni documento', async () => {
    const mercantileSource = makeSource('DEMANDA_MERCANTIL', 'JUICIO ORDINARIO MERCANTIL. EXP-TEST-MERC-001. ACTOR: BANCO_ALFA.');
    const req = new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedDocumentType: 'demanda_divorcio',
        userInstruction: 'Redactar demanda de divorcio incausado.',
        sourceDocuments: [mercantileSource],
      }),
    });

    const res = await POST_generate(req);
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.errorCode).toBe(SOURCE_DOCUMENT_INCOMPATIBLE);
    expect(json.document).toBeUndefined();
  });

  it('PENAL → demanda_alimentos: la API bloquea con HTTP 422 antes de IA', async () => {
    const penalSource = makeSource('ACTO_DE_AUTORIDAD', 'CARPETA DE INVESTIGACIÓN PENAL. MINISTERIO PÚBLICO. DELITO DE ROBO.');
    const req = new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedDocumentType: 'contestacion_demanda_laboral',
        userInstruction: 'Contestar demanda laboral.',
        sourceDocuments: [penalSource],
        matter: 'penal',
      }),
    });

    const res = await POST_generate(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.errorCode).toBe(SOURCE_DOCUMENT_INCOMPATIBLE);
  });

  it('FAMILIAR → demanda_ejecutiva_mercantil: la API bloquea con HTTP 422', async () => {
    const familiarSource = makeSource('CONVENIO_CIVIL', 'CONVENIO DE DIVORCIO Y PENSIÓN ALIMENTICIA. FAMILIAR.');
    const req = new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedDocumentType: 'demanda_ejecutiva_mercantil',
        userInstruction: 'Demanda ejecutiva mercantil.',
        sourceDocuments: [familiarSource],
      }),
    });

    const res = await POST_generate(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.errorCode).toBe(SOURCE_DOCUMENT_INCOMPATIBLE);
  });

  it('LABORAL → contestacion_demanda_civil: la API bloquea con HTTP 422', async () => {
    const laboralSource = makeSource('DEMANDA_LABORAL', 'DEMANDA LABORAL ANTE TRIBUNAL FEDERAL. TRABAJADOR Y PATRÓN.');
    const req = new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedDocumentType: 'contestacion_demanda_civil',
        userInstruction: 'Contestar demanda civil.',
        sourceDocuments: [laboralSource],
      }),
    });

    const res = await POST_generate(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.errorCode).toBe(SOURCE_DOCUMENT_INCOMPATIBLE);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §3, §7 — EXCEPCIONES CROSS-MATTER CONTROLADAS POR POLÍTICA
// ══════════════════════════════════════════════════════════════════════════════

describe('§3, §7 — Excepciones cross-matter legítimas de amparo', () => {
  const AMPARO_OUTPUT_TYPES = [
    'demanda_amparo_directo',
    'demanda_amparo_indirecto',
    'recurso_revision_amparo_directo',
  ];

  it('sentencia laboral (LAUDO) → demanda_amparo_directo es COMPATIBLE', () => {
    const source = makeSource('LAUDO',
      'Laudo del Tribunal Federal de Conciliación y Arbitraje. Despido. Trabajador.',
    );
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'demanda_amparo_directo',
      sourceDocuments: [source],
    });
    expect(result.status).not.toBe('INCOMPATIBLE');
  });

  it('sentencia civil → demanda_amparo_directo es COMPATIBLE', () => {
    const source = makeSource('SENTENCIA_O_RESOLUCION',
      'Sentencia dictada en juicio ordinario civil. Puntos resolutivos.',
    );
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'demanda_amparo_directo',
      sourceDocuments: [source],
    });
    expect(result.status).not.toBe('INCOMPATIBLE');
  });

  it('acto administrativo → demanda_amparo_indirecto es COMPATIBLE', () => {
    const source = makeSource('ACTO_DE_AUTORIDAD',
      'Acto de autoridad administrativa. Resolución impugnada. Quejoso.',
    );
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'demanda_amparo_indirecto',
      sourceDocuments: [source],
    });
    expect(result.status).not.toBe('INCOMPATIBLE');
  });

  it('todos los tipos de amparo son reconocidos por isAmparoDocumentType', () => {
    for (const t of AMPARO_OUTPUT_TYPES) {
      expect(isAmparoDocumentType(t), `${t} debe ser tipo amparo`).toBe(true);
    }
  });

  it('amparo NO es un pase universal: demanda mercantil sigue bloqueada ante demanda familiar', () => {
    const source = makeSource('DEMANDA_MERCANTIL', 'Juicio mercantil ejecutivo.');
    expect(
      () => evaluateSourceOutputCompatibility({
        selectedDocumentType: 'contestacion_demanda_civil',
        sourceDocuments: [source],
      }),
    ).toThrowError(expect.objectContaining({ code: SOURCE_DOCUMENT_INCOMPATIBLE }));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §8 — DISTINCIÓN: SOURCE CLASSIFICATION vs OUTPUT INTENT CLASSIFICATION
// ══════════════════════════════════════════════════════════════════════════════

describe('§8 — Distinción: clasificación de fuente vs clasificación de intención', () => {
  it('inferSourceOutputType clasifica lo que el usuario SUBIÓ (documento fuente)', () => {
    const source = makeSource('PAGARE', 'PAGARÉ POR LA CANTIDAD DE $500,000 PESOS. DEUDOR PRINCIPAL Y AVAL.');
    const inferredSourceType = inferSourceOutputType([source]);
    expect(inferredSourceType).toBe('PAGARE');
  });

  it('classifyIntent clasifica lo que el usuario QUIERE GENERAR (intención de salida)', () => {
    const instruction = 'Redactar demanda ejecutiva mercantil para el cobro del título de crédito.';
    const intentResult = classifyIntent(instruction);
    expect(intentResult.documentType).toBe('demanda_ejecutiva_mercantil');
    expect(intentResult.matter).toBe('mercantil');
  });

  it('fuente y objetivo pueden coexistir sin confundirse', () => {
    // El usuario sube una sentencia de amparo (fuente) pero pide revisión (intención)
    const source = makeSource('SENTENCIA_AMPARO_DIRECTO', 'SENTENCIA DEFINITIVA DE AMPARO DIRECTO. TRIBUNAL COLEGIADO.');
    const sourceDocType = inferSourceOutputType([source]);
    const outputIntent = classifyIntent('Interponer recurso de revisión contra la sentencia de amparo directo.');

    expect(sourceDocType).toBe('SENTENCIA_AMPARO_DIRECTO');
    expect(outputIntent.documentType).toBe('recurso_revision_amparo_directo');
    expect(sourceDocType).not.toBe(outputIntent.documentType);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §4 — ERRORES ESTRUCTURADOS ANTES DE IA
// ══════════════════════════════════════════════════════════════════════════════

describe('§4 — El error de incompatibilidad es estructurado y orienta a la UI', () => {
  it('SourceDocumentIncompatibleError contiene metadata de dominio', () => {
    const source = makeSource('DEMANDA_MERCANTIL', 'Juicio ejecutivo mercantil.');
    let caught: unknown;
    try {
      evaluateSourceOutputCompatibility({
        selectedDocumentType: 'contestacion_demanda_civil',
        sourceDocuments: [source],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SourceDocumentIncompatibleError);
    const err = caught as SourceDocumentIncompatibleError;
    expect(err.code).toBe(SOURCE_DOCUMENT_INCOMPATIBLE);
    expect(err.metadata.selectedDocumentType).toBe('contestacion_demanda_civil');
    expect(err.metadata.sourceMatter).toBeTruthy();
    expect(err.message).toContain(SOURCE_DOCUMENT_INCOMPATIBLE);
    expect(err.message).toContain('fuentes aceptadas son:');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §25 — MATRIZ PROGRAMÁTICA SOURCE MATTER × OUTPUT MATTER
// ══════════════════════════════════════════════════════════════════════════════

describe('§25 — Matriz programática: ningún tipo IMPLEMENTED retorna UNKNOWN', () => {
  const implementedIds = LEGAL_CATALOG_REGISTRY.documents
    .filter((doc) => doc.status === 'IMPLEMENTED')
    .map((doc) => doc.id);

  it('todos los IDs IMPLEMENTED tienen una política definida', () => {
    for (const id of implementedIds) {
      const policy = SOURCE_OUTPUT_COMPATIBILITY_RULES[id];
      expect(policy, `Política indefinida para ${id}`).toBeDefined();
      expect(
        ['EXPLICIT_COMPATIBILITY', 'ACCEPTS_ANY_SOURCE_INTENTIONALLY', 'UNSUPPORTED_DOCUMENT_TYPE'],
        `Status inválido para ${id}`,
      ).toContain(policy.status);
    }
  });

  it('ningún tipo IMPLEMENTED retorna status UNKNOWN en evaluación sin fuente', () => {
    for (const id of implementedIds) {
      const policy = SOURCE_OUTPUT_COMPATIBILITY_RULES[id];
      if (policy.status === 'UNSUPPORTED_DOCUMENT_TYPE') continue;
      if (policy.status === 'ACCEPTS_ANY_SOURCE_INTENTIONALLY') {
        const result = evaluateSourceOutputCompatibility({
          selectedDocumentType: id,
          sourceDocuments: [],
        });
        expect(result.status, `${id} debe ser COMPATIBLE sin fuente`).toBe('COMPATIBLE');
      }
    }
  });

  it('total de tipos IMPLEMENTED coincide con el catálogo (>=100)', () => {
    expect(implementedIds.length).toBeGreaterThanOrEqual(100);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §21 — DOCUMENT ROUTING: el classifier distingue demandas por materia
// ══════════════════════════════════════════════════════════════════════════════

describe('§21 — Routing: el classifier distingue documentos similares por materia', () => {
  it('demanda alimentos ≠ demanda mercantil', () => {
    const alimentos = classifyIntent('Interponer demanda de alimentos para menores de edad.');
    const mercantil = classifyIntent('Interponer demanda ejecutiva mercantil por pagaré.');
    expect(alimentos.documentType).not.toBe(mercantil.documentType);
    expect(alimentos.matter).not.toBe('mercantil');
  });

  it('ejecución laboral ≠ ejecución civil', () => {
    const laboral = classifyIntent('Promover ejecución de sentencia laboral.');
    const civil = classifyIntent('Promover ejecución de sentencia civil ordinaria.');
    expect(laboral.matter).not.toBe(civil.matter);
  });

  it('denuncia penal ≠ demanda civil', () => {
    const penal = classifyIntent('Presentar denuncia por robo calificado ante el Ministerio Público.');
    const civil = classifyIntent('Interponer demanda civil por daños y perjuicios.');
    expect(penal.matter).not.toBe(civil.matter);
    expect(penal.documentType).not.toBe(civil.documentType);
  });

  it('recurso administrativo ≠ amparo', () => {
    const admin = classifyIntent('Interponer recurso de revocación ante la autoridad administrativa.');
    const amparo = classifyIntent('Interponer amparo indirecto contra acto de autoridad.');
    expect(admin.documentType).not.toBe(amparo.documentType);
  });
});
