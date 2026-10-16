/**
 * Meta de páginas en TODOS los tipos implementados del catálogo (demandas, contestaciones, recursos,
 * promociones y plantillas de familia). Evidencia OFFLINE: redactor y proveedor de ampliación simulados y
 * deterministas; extracción, enrutamiento, plan, ensamblado, gates y medición del PDF son los reales.
 * No acredita calidad jurídica ni sustituye la verificación con la IA configurada.
 */
import { describe, expect, it, vi } from 'vitest';
import { CANONICAL_DOCUMENT_TYPES } from '@/lib/catalog/legalCatalog';
import { getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { measureRenderedDocumentPages } from '@/lib/legal-engine/documentPageMetrics';
import { MAX_REDUNDANCY_RATIO, pageTolerance } from '@/lib/legal-engine/pageTarget';
import { redundancyRatio, splitParagraphs } from '@/lib/legal-engine/textRedundancy';
import { createSimulatedWriter, syntheticCase, syntheticDemandText } from '../helpers/simulatedLegalWriter';

vi.mock('@/lib/ai/fastMode', () => ({ runFastMode: async () => ({ success: false, text: '', error: 'OFFLINE_PROVIDER_UNAVAILABLE' }) }));

const TARGET = 20;
const targets = CANONICAL_DOCUMENT_TYPES.filter((type) => type.status === 'IMPLEMENTED' && type.implemented);
const outcomes: Record<string, string[]> = { MET: [], BELOW_TARGET: [], ABOVE_TARGET: [], ERROR: [] };

describe(`meta de ${TARGET} páginas en cada tipo implementado del catálogo`, () => {
  it.each(targets)('$id: la meta llega al contrato, se mide en el PDF y el resultado es honesto', async (type) => {
    const c = syntheticCase(6, 4, 3);
    const sourceType = type.sourceCompatibility?.acceptedSourceTypes[0] || 'DEMANDA_CIVIL';
    const source = createSourceDocument({
      id: `synthetic-${type.id}`, filename: `${type.id}.txt`, content: `${sourceType}\n${syntheticDemandText(c)}`,
      sourceValidated: true, classification: { sourceDocumentType: sourceType, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
    });
    const writer = createSimulatedWriter(c);
    let doc: any;
    try {
      doc = await runGenerationPipeline({
        selectedDocumentType: type.id, documentTypeLabel: type.label, matter: type.areaId, jurisdiction: 'Jalisco',
        userInstruction: `Preparar ${type.label} con base en la fuente.`, sourceDocuments: [source], pageTarget: TARGET,
        generateSection: writer, expansionProvider: writer.expansionProvider,
        workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
      } as never);
    } catch (error) {
      // Un tipo que exige otra fuente o ficha se rechaza explícitamente antes de generar: no es éxito simulado.
      outcomes.ERROR.push(`${type.id}:${error instanceof Error ? error.message.slice(0, 60) : 'error'}`);
      expect(error).toBeInstanceOf(Error);
      return;
    }
    const metadata = doc.generationMetadata;
    expect(metadata.pageTarget.pages).toBe(TARGET);
    expect(metadata.generationExtension.minPages).toBe(TARGET);
    expect(metadata.generationExtension.lengthIsCeiling).toBeFalsy();

    const result = metadata.pageTargetResult;
    expect(result, 'resultado medido').toBeTruthy();
    expect(result.actualPages).toBe((await measureRenderedDocumentPages(doc)).actualPages);
    if (result.actualPages < TARGET) {
      expect(result.outcome).toBe('BELOW_TARGET');
      expect(result.notice).toMatch(/No se alcanzó la extensión solicitada/);
      expect(metadata.generationExtension.extensionTargetUnmet).toBe(true);
    } else {
      expect(result.outcome).toBe(result.actualPages > TARGET + pageTolerance(TARGET) ? 'ABOVE_TARGET' : 'MET');
    }
    outcomes[result.outcome].push(type.id);

    // Las secciones del plantillado no desaparecen al ampliar y ensamblar.
    const titles = doc.sections.map((section: any) => String(section.title).toUpperCase());
    const required = getDocumentTemplate(type.id).estructura.filter((entry: any) => entry?.required !== false);
    expect(doc.sections.length).toBeGreaterThan(0);
    expect(titles.length).toBeGreaterThanOrEqual(Math.min(required.length, 1));

    // Sin relleno: sin párrafos repetidos.
    const paragraphs = doc.sections.flatMap((section: any) => (section.content || []).flatMap((block: any) =>
      splitParagraphs(block.text || '').map((text: string, index: number) => ({ id: `${section.id}/${block.id}#${index}`, text }))));
    expect(redundancyRatio(paragraphs, 0.85).ratio).toBeLessThanOrEqual(MAX_REDUNDANCY_RATIO);
    // Alcanzar páginas nunca habilita FINAL.
    expect(doc.status).not.toBe('final');
  }, 180000);

  it('resumen por resultado (evidencia, no acreditación)', () => {
    process.stderr.write(`\nMETA ${TARGET} POR TIPO ${JSON.stringify(Object.fromEntries(Object.entries(outcomes).map(([key, ids]) => [key, ids.length])))}\n`);
    process.stderr.write(`BELOW_TARGET: ${outcomes.BELOW_TARGET.join(', ')}\nERROR: ${outcomes.ERROR.join(' | ')}\n`);
    expect(outcomes.MET.length + outcomes.BELOW_TARGET.length + outcomes.ABOVE_TARGET.length + outcomes.ERROR.length).toBe(targets.length);
  });
});
