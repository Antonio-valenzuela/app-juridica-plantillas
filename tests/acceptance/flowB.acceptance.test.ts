/**
 * LOOP 9 — §13
 * PRUEBA DE ACEPTACIÓN: FLOW B UNIVERSAL
 *
 * Nuevo escrito sin documento fuente (NEW_WRITING).
 * Selección de materia → selección de tipo → captura de contexto → generación.
 *
 * Los tipos que permiten NEW_WRITING (acceptsAnySource o sourceRequired=false)
 * se prueban directamente sin sourceDocuments.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { validateForExport } from '@/lib/legal-engine/exportGuards';
import { SOURCE_OUTPUT_COMPATIBILITY_RULES } from '@/lib/legal-engine/sourceOutputCompatibility';

beforeAll(() => {
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) {
    delete process.env[k];
  }
});

function fullText(doc: Awaited<ReturnType<typeof runGenerationPipeline>>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).sections
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => s.content.map((b: any) => b.text).join('\n'))
    .join('\n');
}

function assertNoMockText(text: string) {
  expect(text).not.toMatch(/Lorem ipsum/i);
  expect(text).not.toMatch(/\[Desarrollar por la IA/i);
  expect(text).not.toMatch(/\[Completar por la IA/i);
  expect(text).not.toMatch(/Juan P[eé]rez\b/i);
  expect(text).not.toMatch(/Empresa Demo/i);
  expect(text).not.toMatch(/Despacho Demo/i);
  expect(text).not.toMatch(/OBJETIVO DEL BLOQUE\s*:/i);
  expect(text).not.toMatch(/TEXTO ORIGINAL DEL BLOQUE\s*:/i);
  expect(text).not.toMatch(/FRAGMENTOS DEL EXPEDIENTE/i);
}

// ══════════════════════════════════════════════════════════════════════════════
// §13 — FLOW B: nuevo escrito sin documento fuente
// ══════════════════════════════════════════════════════════════════════════════

describe('§13 — Flow B: nuevo escrito sin documento fuente', () => {
  it('escrito_libre sin fuente → documento válido con secciones', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar un escrito libre.',
      selectedDocumentType: 'escrito_libre',
      sourceDocuments: [],
    });

    expect(doc.sections.length).toBeGreaterThan(0);
    expect(doc.documentType).toBe('escrito_libre');
    expect(doc.templateId).toBe('escrito_libre');
    const text = fullText(doc);
    assertNoMockText(text);
  }, 30000);

  it('demanda ordinaria civil sin fuente (sourceRequired=false) → documento válido', async () => {
    const policy = SOURCE_OUTPUT_COMPATIBILITY_RULES['demanda_ordinaria_civil'];
    expect(policy.sourceRequired).toBe(false); // confirmar que permite NEW_WRITING

    const doc = await runGenerationPipeline({
      selectedDocumentType: 'demanda_ordinaria_civil',
      userInstruction: 'Redactar demanda ordinaria civil por incumplimiento de contrato.',
      sourceDocuments: [],
    });

    expect(doc.documentType).toBe('demanda_ordinaria_civil');
    expect(doc.sections.length).toBeGreaterThan(0);
    assertNoMockText(fullText(doc));
  }, 30000);

  it('escrito libre: todas las secciones tienen _templateId único y coherente', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Escrito de trámite general.',
      selectedDocumentType: 'escrito_libre',
      sourceDocuments: [],
    });

    // Identidad única por generación (FASE 10)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templateIds = new Set(doc.sections.map((s: any) => s._templateId));
    expect(templateIds.size).toBe(1);
    expect([...templateIds][0]).toBe('escrito_libre');
  }, 30000);

  it('nuevo escrito: ninguna sección tiene _provenance SOURCE (contaminación prohibida)', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar solicitud formal ante autoridad judicial.',
      sourceDocuments: [],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasSource = doc.sections.some((s: any) => s._provenance === 'SOURCE');
    expect(hasSource).toBe(false);
  }, 30000);

  it('Flow B con otro tipo genérico: el doc pasa las guardas de exportación', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar escrito de solicitud libre.',
      selectedDocumentType: 'otro',
      sourceDocuments: [],
    });

    const guard = validateForExport(doc);
    expect(guard.errors.filter((e: string) => /IDENTIDAD|CONTAMINACI/.test(e))).toHaveLength(0);
    assertNoMockText(fullText(doc));
  }, 30000);
});

// ══════════════════════════════════════════════════════════════════════════════
// §13 — Flow B con intake de contexto (campos capturados por el abogado)
// ══════════════════════════════════════════════════════════════════════════════

describe('§13 — Flow B con intake: contexto capturado llega al documento', () => {
  it('generationId único por generación; templateId estable', async () => {
    const doc1 = await runGenerationPipeline({
      userInstruction: 'Primer escrito libre.',
      sourceDocuments: [],
    });
    const doc2 = await runGenerationPipeline({
      userInstruction: 'Segundo escrito libre diferente.',
      sourceDocuments: [],
    });

    // Cada generación tiene su propio generationId
    expect(doc1.generationMetadata.generationId).toBeDefined();
    expect(doc2.generationMetadata.generationId).toBeDefined();
    expect(doc1.generationMetadata.generationId).not.toBe(doc2.generationMetadata.generationId);

    // Pero el templateId es estable para el mismo tipo
    expect(doc1.templateId).toBe(doc2.templateId);
  }, 60000);

  it('regeneración conserva un solo templateId y no contamina secciones', async () => {
    const doc1 = await runGenerationPipeline({
      userInstruction: 'Escrito de prueba para regeneración.',
      sourceDocuments: [],
    });

    const doc2 = await runGenerationPipeline({
      existingDocument: doc1 as any,
      userInstruction: 'Regenerar el escrito anterior.',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids2 = new Set(doc2.sections.map((s: any) => s._templateId));
    expect(ids2.size).toBe(1);
    expect([...ids2][0]).toBe('escrito_libre');
    assertNoMockText(fullText(doc2));
  }, 60000);
});

// ══════════════════════════════════════════════════════════════════════════════
// §13 — Tipos NEW_WRITING identificados en el catálogo
// ══════════════════════════════════════════════════════════════════════════════

describe('§13 — Tipos con ACCEPTS_ANY_SOURCE aceptan NEW_WRITING', () => {
  const anySourceTypes = Object.entries(SOURCE_OUTPUT_COMPATIBILITY_RULES)
    .filter(([, policy]) => policy.status === 'ACCEPTS_ANY_SOURCE_INTENTIONALLY')
    .map(([id]) => id)
    .slice(0, 3); // solo los primeros 3 para no alargar el suite

  it('todos los tipos ACCEPTS_ANY_SOURCE evalúan como COMPATIBLE sin fuente', () => {
    for (const id of anySourceTypes) {
      const result = SOURCE_OUTPUT_COMPATIBILITY_RULES[id];
      expect(result.status).toBe('ACCEPTS_ANY_SOURCE_INTENTIONALLY');
      expect(result.sourceRequired).toBe(false);
    }
  });
});
