/**
 * Traza OFFLINE de la generación de contestaciones con demandas SINTÉTICAS.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/trace/contestacionTrace.mts [salida]
 *
 * Recorre el mismo camino que la aplicación: PDF → extractor real → ficha y
 * análisis del caso → pipeline (profundidad EXTENSIVE_40) → DOCX y PDF en modo
 * BORRADOR. Antes de empezar elimina del proceso las claves de proveedores, así
 * que nunca se envía contenido a un servicio externo.
 *
 * Deja en la carpeta de salida, por demanda: el PDF fuente, el DOCX y el PDF
 * generados, y trace.json con métricas (páginas, estructura, formato, hechos
 * atendidos, marcadores de revisión y textos internos filtrados).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Misma guarda que la suite offline: sin claves de proveedores y sin fetch a hosts externos.
await import('../../tests/setup/offlineNetworkGuard');

const { extractDocument } = await import('@/lib/pdf/documentExtractor');
const { createSourceDocument } = await import('@/lib/legal-engine/context');
const { reconstructCaseAnalysis } = await import('@/lib/legal-engine/caseAnalysis');
const { detectCaseFicha } = await import('@/lib/legal-engine/caseFichaDetection');
const { runGenerationPipeline } = await import('@/lib/legal-engine/pipeline');
const { resolveDraftDepthProfile } = await import('@/lib/legal-engine/draftDepth');
const { generationExtensionForDraftDepth } = await import('@/lib/legal-engine/generationExtension');
const { exportUniversalToDocx } = await import('@/lib/legal-engine/exportDocxUniversal');
const { exportUniversalToPdf } = await import('@/lib/legal-engine/exportPdfUniversal');
const { getCatalogDocument } = await import('@/lib/catalog/legalCatalog');
const { PDFParse } = await import('pdf-parse');
const JSZip = (await import('jszip')).default;
const { SYNTHETIC_DEMANDS, demandToPdf } = await import('../../tests/helpers/syntheticDemandPdf');

const outputRoot = path.resolve(process.argv[2] || 'audit/contestaciones-sinteticas-2026-10-12');
mkdirSync(outputRoot, { recursive: true });

/** Textos internos que nunca deben llegar al escrito del abogado. */
const INTERNAL_SCAFFOLDING = [
  /DESARROLLO DE BLOQUE/i,
  /La funci[oó]n de este apartado/i,
  /\bBLOQUE\s+\d+\b/,
  /\b(?:TODO|FIXME|lorem ipsum)\b/i,
  /\bundefined\b|\bnull\b|\[object Object\]/,
  /pending-upload|NEEDS_USER_INPUT|LEGAL_ADMISSION_/,
];
const REVIEW_MARKER = /\[(?:DATO PENDIENTE|REQUIERE[^\]:]*|A CONFIRMAR POR EL ABOGADO|PENDIENTE)[^\]]*\]/g;

const summary: any[] = [];
for (const demand of SYNTHETIC_DEMANDS) {
  const started = Date.now();
  const stages: Array<{ stage: string; at: number; detail?: string }> = [];
  const dir = path.join(outputRoot, demand.id);
  mkdirSync(dir, { recursive: true });
  const pdf = demandToPdf(demand);
  writeFileSync(path.join(dir, 'demanda-sintetica.pdf'), pdf);

  const extraction = await extractDocument({ buffer: pdf, fileName: `${demand.id}.pdf`, mimeType: 'application/pdf' });
  stages.push({ stage: 'extraccion', at: Date.now() - started, detail: `${extraction.pageCount} págs, método ${extraction.method}` });
  const source = createSourceDocument({
    id: demand.id, filename: `${demand.id}.pdf`, type: 'application/pdf',
    pages: extraction.pages, sourceValidated: extraction.sourceValidated, fileSizeBytes: extraction.fileSizeBytes,
  } as any);
  const ficha = detectCaseFicha([extraction.text]);
  const analysis = reconstructCaseAnalysis([source], 'Contestar la demanda');
  stages.push({ stage: 'analisis', at: Date.now() - started, detail: `${analysis.facts.length} hechos, ${analysis.claims.length} prestaciones` });

  const catalog = getCatalogDocument(demand.contestacionType) as any;
  const label = catalog?.label || demand.contestacionType;
  // Misma instrucción que arma la UI (buildContestacionInstruction) sin postura adicional del abogado.
  const instruction = [
    analysis.claims.length ? `PRESTACIONES IDENTIFICADAS EN LA DEMANDA:\n${analysis.claims.join('\n')}` : '',
    analysis.facts.length ? `HECHOS IDENTIFICADOS EN LA DEMANDA:\n${analysis.facts.map((fact: any) => `${fact.number}. ${fact.text}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n') || `Redactar el escrito seleccionado (${label}) de forma formal y exhaustiva, con base en el documento fuente.`;

  const profile = resolveDraftDepthProfile('EXTENSIVE_40');
  let document: any;
  let pipelineError: string | undefined;
  try {
    document = await runGenerationPipeline({
      selectedDocumentType: demand.contestacionType, documentTypeLabel: label,
      matter: ficha.materia, jurisdiction: 'Local', userInstruction: instruction,
      sourceDocuments: [source], caseAnalysis: analysis,
      draftDepth: profile.draftDepth, generationExtension: generationExtensionForDraftDepth(profile),
      externalProviderOptIn: false,
      workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
    } as any, {
      onStageChange: (stage: string) => stages.push({ stage: `pipeline:${stage}`, at: Date.now() - started }),
    } as any);
  } catch (error) {
    pipelineError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  stages.push({ stage: 'pipeline-fin', at: Date.now() - started, detail: pipelineError });

  const record: any = { id: demand.id, matter: demand.matter, type: demand.contestacionType, ficha, stages, pipelineError };
  if (document) {
    const sections = document.sections.map((section: any) => ({ title: section.title, type: section.type, chars: section.content.map((block: any) => block.text || '').join('\n').length }));
    const body = document.sections.flatMap((section: any) => section.content.map((block: any) => block.text || '')).join('\n');
    record.documentType = document.documentType;
    record.status = document.status;
    record.readiness = document.generationMetadata?.readiness;
    record.provider = document.generationMetadata?.aiProvider;
    record.sections = sections;
    record.bodyChars = body.length;
    record.reviewMarkers = (body.match(REVIEW_MARKER) || []).length;
    record.scaffolding = INTERNAL_SCAFFOLDING.filter((pattern) => pattern.test(body)).map(String);
    record.factsAnswered = demand.facts.map((_fact, index) => new RegExp(`(?:hecho|HECHO)\\s+(?:n[uú]mero\\s+)?${index + 1}\\b|^\\s*${index + 1}\\.`, 'm').test(body));
    record.partiesInBody = { actor: body.includes(demand.actor), demandado: body.includes(demand.demandado) };
    record.courtInBody = body.toUpperCase().includes(demand.court);
    writeFileSync(path.join(dir, 'borrador.txt'), body);
    // Documento completo: permite reproducir en la interfaz el mismo borrador sin volver a generar.
    writeFileSync(path.join(dir, 'document.json'), JSON.stringify(document));
    try {
      const docx = await exportUniversalToDocx(document, undefined, undefined, { exportMode: 'DRAFT' });
      writeFileSync(path.join(dir, 'contestacion-borrador.docx'), docx);
      const zip = await JSZip.loadAsync(docx);
      const xml = await zip.file('word/document.xml')!.async('string');
      record.docx = {
        bytes: docx.length,
        paragraphs: (xml.match(/<w:p[ >]/g) || []).length,
        boldRuns: (xml.match(/<w:b\/>|<w:b w:val="(?:1|true)"\/>/g) || []).length,
        firstLineIndents: (xml.match(/w:firstLine="\d+"/g) || []).length,
        justified: (xml.match(/<w:jc w:val="both"\/>/g) || []).length,
        headings: (xml.match(/<w:pStyle w:val="Heading\d"\/>|<w:pStyle w:val="Ttulo\d"\/>/g) || []).length,
      };
    } catch (error) {
      record.docxError = error instanceof Error ? error.message : String(error);
    }
    try {
      const pdfOut = await exportUniversalToPdf(document, undefined, { exportMode: 'DRAFT' });
      writeFileSync(path.join(dir, 'contestacion-borrador.pdf'), pdfOut);
      const parsed = await new PDFParse({ data: new Uint8Array(pdfOut) }).getText();
      record.pdf = { bytes: pdfOut.length, pages: parsed.total ?? parsed.pages?.length };
    } catch (error) {
      record.pdfError = error instanceof Error ? error.message : String(error);
    }
  }
  record.ms = Date.now() - started;
  writeFileSync(path.join(dir, 'trace.json'), JSON.stringify(record, null, 2));
  summary.push({
    id: record.id, type: record.type, ficha: `${ficha.actor} vs ${ficha.demandado} · ${ficha.materia} · ${ficha.autoridad}`,
    error: pipelineError || record.docxError || record.pdfError, readiness: record.readiness, provider: record.provider,
    sections: record.sections?.length, bodyChars: record.bodyChars, pdfPages: record.pdf?.pages,
    facts: record.factsAnswered ? `${record.factsAnswered.filter(Boolean).length}/${record.factsAnswered.length}` : undefined,
    reviewMarkers: record.reviewMarkers, scaffolding: record.scaffolding, docx: record.docx, ms: record.ms,
  });
}
writeFileSync(path.join(outputRoot, 'resumen.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
