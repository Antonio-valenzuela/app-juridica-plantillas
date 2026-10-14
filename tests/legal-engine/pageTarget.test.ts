/**
 * Fase 3 · Parte 1 — selector de extensión como parámetro real del pipeline.
 * Redactor y proveedor de ampliación SIMULADOS y deterministas (sin red ni proveedores reales).
 */
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { measureRenderedDocumentPages, estimateDocxPages } from '@/lib/legal-engine/documentPageMetrics';
import {
  CUSTOM_PAGE_TARGET_RANGE,
  MAX_REDUNDANCY_RATIO,
  PAGE_TARGET_PRESETS,
  PageTargetValidationError,
  describePageTargetResult,
  evaluatePageTarget,
  pageTargetToGenerationExtension,
  pageTolerance,
  parsePageTarget,
  tryParsePageTarget,
} from '@/lib/legal-engine/pageTarget';
import { resolveGenerationExtensionContract } from '@/lib/legal-engine/generationExtension';
import { contextFromDocument, validateGeneratedOutput } from '@/lib/legal-engine/generatedOutputValidator';
import { redundancyRatio, splitParagraphs } from '@/lib/legal-engine/textRedundancy';
import { sourceFromText } from '../helpers/syntheticCaseDocuments';
import { createSimulatedWriter, syntheticCase, syntheticDemandText } from '../helpers/simulatedLegalWriter';

const { requireLawyerAccessMock, rateLimitMock, generationAdmissionMock } = vi.hoisted(() => ({
  requireLawyerAccessMock: vi.fn(),
  rateLimitMock: vi.fn(),
  generationAdmissionMock: vi.fn(),
}));
vi.mock('@/lib/security/lawyerAuth', () => ({ requireLawyerAccess: requireLawyerAccessMock }));
vi.mock('@/lib/security/rateLimit', () => ({ checkRequestRateLimit: rateLimitMock }));
vi.mock('@/lib/security/aiCostControls', () => ({
  checkGenerationAdmission: generationAdmissionMock,
  maxGenerationInputChars: () => 1_000_000,
}));
import { POST as generateRoute } from '@/app/api/legal-engine/generate/route';

describe('parámetro tipado y validado', () => {
  it('acepta los cuatro presets y valores personalizados dentro del rango', () => {
    expect(PAGE_TARGET_PRESETS.map((preset) => preset.pages)).toEqual([5, 10, 20, 40]);
    for (const preset of PAGE_TARGET_PRESETS) expect(parsePageTarget({ preset: preset.id, pages: preset.pages })).toEqual({ preset: preset.id, pages: preset.pages });
    expect(parsePageTarget('EXTENSO')).toEqual({ preset: 'EXTENSO', pages: 40 });
    expect(parsePageTarget(20)).toEqual({ preset: 'DETALLADO', pages: 20 });
    expect(parsePageTarget({ pages: 33 })).toEqual({ preset: 'PERSONALIZADO', pages: 33 });
    expect(parsePageTarget({ preset: 'PERSONALIZADO', pages: '12' })).toEqual({ preset: 'PERSONALIZADO', pages: 12 });
    expect(parsePageTarget(CUSTOM_PAGE_TARGET_RANGE.min).pages).toBe(2);
    expect(parsePageTarget(CUSTOM_PAGE_TARGET_RANGE.max).pages).toBe(60);
  });

  it('rechaza lo que no es un entero dentro del rango', () => {
    for (const bad of [1, 61, 0, -5, 2.5, '2.5', 'abc', '', null, undefined, NaN, Infinity, { pages: 100 }, { preset: 'GIGANTE', pages: 999 }, { pages: '7; DROP' }]) {
      expect(() => parsePageTarget(bad), String(JSON.stringify(bad))).toThrow(PageTargetValidationError);
      expect(tryParsePageTarget(bad)).toBeNull();
    }
  });

  // Contrato cambiado (2026-10-14, a petición del titular): la extensión es un MÁXIMO, no una meta. Antes se
  // traducía a un rango [meta−tolerancia, meta+tolerancia] y el motor ampliaba hasta alcanzarlo; ahora es un techo
  // y no hay ampliación para llenar páginas.
  it('se traduce al contrato de extensión como máximo, con presupuesto de palabras como techo y límites seguros', () => {
    const contracts = [5, 10, 20, 40].map((pages) => resolveGenerationExtensionContract(pageTargetToGenerationExtension(parsePageTarget(pages))));
    expect(contracts.map((contract) => contract.generationMode)).toEqual(Array(4).fill('extended-legal'));
    expect(contracts.map((contract) => contract.targetPages)).toEqual([5, 10, 20, 40]);
    for (const contract of contracts) {
      expect(contract.lengthIsCeiling).toBe(true);
      expect(contract.minPages).toBe(1);
      expect(contract.maxPages).toBe(contract.targetPages);
      expect(contract.maxExpansionPasses).toBe(1);
      expect(contract.maxCallsPerDocument).toBeLessThanOrEqual(100);
    }
    void pageTolerance;
    const words = contracts.map((contract) => contract.targetWords);
    expect([...words].sort((a, b) => a - b)).toEqual(words); // monótono
    expect(resolveGenerationExtensionContract(pageTargetToGenerationExtension(parsePageTarget(2))).targetWords).toBeGreaterThanOrEqual(1000);
  });

  it('evalúa el resultado medido contra el máximo: ser más corto nunca es una falla; superarlo se avisa', () => {
    const target = parsePageTarget(40);
    expect(evaluatePageTarget(target, 40).outcome).toBe('WITHIN_MAX');
    const shorter = evaluatePageTarget(target, 22);
    expect(shorter.outcome).toBe('WITHIN_MAX');
    expect(shorter.notice).toBeUndefined();
    const above = evaluatePageTarget(parsePageTarget(5), 11);
    expect(above.outcome).toBe('ABOVE_MAX');
    expect(above.notice).toMatch(/supera el máximo/);
    expect(above.notice).toMatch(/estructura obligatoria/);
    expect(describePageTargetResult(shorter)).toBe('Máximo: 40 páginas · Resultado: 22 páginas');
  });
});

describe('API: la meta se valida en el servidor', () => {
  it('rechaza una meta manipulada antes de iniciar la generación', async () => {
    requireLawyerAccessMock.mockResolvedValue({ ok: true, context: { organizationId: 'org', userId: 'user', lawyerId: 'user' } });
    rateLimitMock.mockReturnValue({ ok: true });
    generationAdmissionMock.mockResolvedValue({ ok: true });
    for (const bad of [{ pages: 500 }, { pages: -1 }, 'enorme']) {
      const response = await generateRoute(new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pageTarget: bad, sync: true }),
      }));
      expect(response.status, JSON.stringify(bad)).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, errorCode: 'INVALID_PAGE_TARGET' });
    }
  });
});

// ───────────────────────── pipeline con redactor simulado ─────────────────────────

async function generate(pageTarget: unknown, c = syntheticCase(4, 3, 2), material = 400) {
  const source = sourceFromText(syntheticDemandText(c), 'demanda');
  (source as { classification?: unknown }).classification = { role: 'PRIMARY', sourceDocumentType: 'DEMANDA_CIVIL' };
  const writer = createSimulatedWriter(c, material);
  const instruction = 'Contestar la demanda.';
  const doc = await runGenerationPipeline({
    selectedDocumentType: 'contestacion_demanda_civil', documentTypeLabel: 'Contestación de demanda civil', matter: 'Civil', jurisdiction: 'Jalisco',
    userInstruction: instruction, sourceDocuments: [source], pageTarget, generateSection: writer, expansionProvider: writer.expansionProvider,
    workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
  } as never) as any;
  return { doc, instruction, writer, c };
}

const bodyOf = (doc: any) => doc.sections.flatMap((section: any) => (section.content || []).map((block: any) => block.text || '')).join('\n');

describe('mismo caso sintético con metas 5, 10, 20 y 40', () => {
  const results = new Map<number, Awaited<ReturnType<typeof generate>>>();

  for (const pages of [5, 10, 20, 40]) {
    it(`meta ${pages}: parámetro registrado, contenido obligatorio íntegro, páginas medidas, sin redundancia ni hallazgos`, async () => {
      const run = await generate(pages);
      results.set(pages, run);
      const { doc, instruction, c } = run;
      const metadata = doc.generationMetadata;

      // El parámetro llegó tipado al borrador y al contrato de extensión.
      expect(metadata.pageTarget).toEqual(parsePageTarget(pages));
      expect(metadata.generationExtension.targetPages).toBe(pages);

      // Todos los hechos y pretensiones requeridos, en cada meta.
      const text = bodyOf(doc);
      c.facts.forEach((_, index) => expect(text, `AL HECHO ${index + 1}`).toMatch(new RegExp(`AL HECHO ${index + 1}\\b`)));
      c.claims.forEach((_, index) => expect(text, `PRESTACIÓN ${index + 1}`).toMatch(new RegExp(`PRESTACI[ÓO]N ${index + 1}\\b`)));
      // Secciones propias de la materia (contestación civil) y petitorios.
      const titles = doc.sections.map((section: any) => String(section.title)).join('|');
      expect(titles).toMatch(/CONTESTACI[ÓO]N DE HECHOS/);
      expect(titles).toMatch(/CONTESTACI[ÓO]N DE PRESTACIONES/);
      expect(titles).toMatch(/OBJECI[ÓO]N DE PRUEBAS/);
      expect(titles).toMatch(/PETITORIOS/);
      expect(doc.status).not.toBe('final');

      // Páginas: «Resultado» se mide sobre el documento renderizado, no se estima.
      const result = metadata.pageTargetResult;
      const remeasured = await measureRenderedDocumentPages(doc);
      expect(result.actualPages).toBe(remeasured.actualPages);
      expect(result.measuredWith).toBe('PDF_RENDERER');
      expect(estimateDocxPages(result.actualPages)).toBeGreaterThanOrEqual(result.actualPages);

      // Sin relleno: ningún párrafo repetido ni casi repetido.
      const paragraphs = doc.sections.flatMap((section: any) => section.content.flatMap((block: any) =>
        splitParagraphs(block.text || '').map((paragraph: string, index: number) => ({ id: `${section.id}/${block.id}#${index}`, text: paragraph }))));
      expect(redundancyRatio(paragraphs, 0.85).ratio).toBeLessThanOrEqual(MAX_REDUNDANCY_RATIO);
      expect(result.redundancyRatio ?? 0).toBeLessThanOrEqual(MAX_REDUNDANCY_RATIO);

      // Validador de la Fase 2 sin hallazgos bloqueantes.
      const validation = validateGeneratedOutput(doc, contextFromDocument(doc, { instruction }));
      expect(validation.blockers.map((finding) => `${finding.code}:${finding.excerpt.slice(0, 50)}`)).toEqual([]);
    }, 120000);
  }

  it('el máximo no se rebasa: las páginas crecen con él sin pasarse, y si la estructura obligatoria lo supera se informa', () => {
    const pages = [5, 10, 20, 40].map((target) => results.get(target)!.doc.generationMetadata.pageTargetResult.actualPages as number);
    expect(pages.length).toBe(4);
    expect([...pages].sort((a, b) => a - b)).toEqual(pages);
    for (const target of [10, 20, 40]) {
      const result = results.get(target)!.doc.generationMetadata.pageTargetResult;
      expect(result.outcome, `máximo ${target}`).toBe('WITHIN_MAX');
      expect(result.actualPages, `máximo ${target}`).toBeLessThanOrEqual(target);
    }
    // El máximo de 5 es menor que el piso estructural de este escrito: se informa, no se recortan respuestas.
    const brief = results.get(5)!.doc.generationMetadata.pageTargetResult;
    expect(['WITHIN_MAX', 'ABOVE_MAX']).toContain(brief.outcome);
    if (brief.outcome === 'ABOVE_MAX') expect(brief.notice).toMatch(/estructura obligatoria/);
    process.stderr.write(`\nTABLA META→PÁGINAS ${JSON.stringify(Object.fromEntries([5, 10, 20, 40].map((t) => [t, results.get(t)!.doc.generationMetadata.pageTargetResult.actualPages])))}\n`);
  });
});

describe('caso con poca información y máximo 40', () => {
  it('el escrito es más corto, no hay aviso de «no alcanzada» y no se rellena ni se amplía', async () => {
    const poor = syntheticCase(2, 1, 1);
    const { doc, writer } = await generate(40, poor, 8);
    const result = doc.generationMetadata.pageTargetResult;
    expect(result.outcome).toBe('WITHIN_MAX');
    expect(result.actualPages).toBeLessThan(30);
    expect(result.notice).toBeUndefined();
    expect(describePageTargetResult(result)).toMatch(/^Máximo: 40 páginas · Resultado: \d+ páginas$/);
    // Sin etapa de ampliación: ninguna llamada de expansión para llenar páginas.
    expect(writer.calls.some((call: { sectionId: string }) => call.sectionId.startsWith('expansion:'))).toBe(false);
    expect(doc.generationMetadata.generationExtension.metrics.expansionCalls).toBe(0);
    expect(writer.calls.every((call: { words: number }) => call.words >= 0)).toBe(true);
    const paragraphs = doc.sections.flatMap((section: any) => section.content.flatMap((block: any) =>
      splitParagraphs(block.text || '').map((paragraph: string, index: number) => ({ id: `${section.id}/${block.id}#${index}`, text: paragraph }))));
    expect(redundancyRatio(paragraphs, 0.85).ratio).toBeLessThanOrEqual(MAX_REDUNDANCY_RATIO);
    expect(doc.validation.warnings.some((warning: { checkId: string }) => warning.checkId === 'PAGE_TARGET_EXCEEDED')).toBe(false);
    expect(doc.generationMetadata.generationExtension.extensionTargetUnmet).toBe(false);
  }, 120000);
});
