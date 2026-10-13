/**
 * Fase 3 · Parte 3 — exportación DOCX/PDF validada por familia documental.
 *
 * Se generan borradores (sin proveedor) de cinco familias —incluidas una contestación y una
 * apelación—, se exportan con las rutas reales (DRAFT, borrador no guardado) y se verifica:
 * apertura/parseo, contenido íntegro respecto del borrador, sin andamiaje (validador de la
 * Fase 2), secciones requeridas, encabezado del escrito no repetido, estilos coherentes,
 * correspondencia DOCX↔PDF↔borrador por texto extraído y número de páginas del PDF renderizado.
 *
 * LIMITACIÓN MEDIDA: LibreOffice/Word no están instalados, así que el DOCX no se pagina aquí;
 * sus páginas se ESTIMAN desde el PDF (estimateDocxPages) y se rotulan como tales.
 */
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { resolveWritingType } from '@/lib/catalog/writingTypeIdentity';
import { countPdfPages, estimateDocxPages } from '@/lib/legal-engine/documentPageMetrics';
import { contextFromDocument, validateGeneratedText } from '@/lib/legal-engine/generatedOutputValidator';
import { normalizeForComparison } from '@/lib/legal-engine/textRedundancy';
import { extractWordDocumentParagraphs, parseXml, readDocxPackage } from '../helpers/docxPackageReader';
import { DEMANDA_CIVIL_ARRENDAMIENTO, sourceFromText } from '../helpers/syntheticCaseDocuments';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), owner: vi.fn() }));
vi.mock('@/lib/security/lawyerAuth', () => ({ requireLawyerAccess: mocks.auth }));
vi.mock('@/lib/legal-engine/documentOwnership', () => ({ documentBelongsToPrincipal: mocks.owner }));
vi.mock('@/lib/workspace/desktopDraftRepository', () => ({ desktopDraftRepository: () => null }));
import { POST as exportDocx } from '@/app/api/legal-engine/export/docx/route';
import { POST as exportPdf } from '@/app/api/legal-engine/export/pdf/route';

const analysis = () => ({
  parties: { actor: 'ACTOR SINTETICO', demandado: 'DEMANDADO SINTETICO' }, authorities: ['JUZGADO COMPETENTE SINTETICO'],
  caseNumbers: { principal: 'EXP-SINT-2026/001' },
  proceduralTimeline: [{ date: '2026-01-15', event: 'Actuación inicial que origina el escrito', sourceDocument: 'src', certainty: 1 }],
  challengedActs: [], claims: ['Pretensión que la parte promovente sostiene'], claimResponses: [], arguments: [],
  evidence: [{ id: 'ev-1', type: 'DOCUMENTAL', description: 'Constancia documental aportada', confirmed: true, provenance: 'LAWYER_CONFIRMED' }],
  facts: [
    { id: 'f-1', number: '1', text: 'HECHO-VERIFICABLE-UNO consta en el expediente.', confidence: 1 },
    { id: 'f-2', number: '2', text: 'HECHO-VERIFICABLE-DOS consta en el expediente.', confidence: 1 },
  ],
}) as never;

async function draftFor(documentType: string, matter: string, sources?: ReturnType<typeof sourceFromText>[]) {
  const identity = resolveWritingType(documentType);
  const declared = identity.compatibleSources.acceptedSourceTypes[0] || (identity.compatibleSources.optionalSourceTypes || [])[0] || 'SENTENCIA_O_RESOLUCION';
  const instruction = `Promover ${documentType}.`;
  const doc = await runGenerationPipeline({
    selectedDocumentType: documentType, documentTypeLabel: identity.label, matter, jurisdiction: 'Jalisco', userInstruction: instruction,
    sourceDocuments: sources || [createSourceDocument({ id: 'src', filename: 'f.txt', content: 'ACUERDO Y RESOLUCIÓN QUE DA ORIGEN AL ESCRITO. HECHO-VERIFICABLE-UNO. HECHO-VERIFICABLE-DOS.', sourceValidated: true, classification: { sourceDocumentType: declared, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' } } as never)],
    caseAnalysis: analysis(),
    workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
  } as never) as any;
  return { doc, instruction };
}

function exportRequest(format: 'docx' | 'pdf', document: unknown) {
  return new NextRequest(`http://localhost/api/legal-engine/export/${format}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'x-unsaved-draft-export': 'true' },
    body: JSON.stringify({ document, exportMode: 'DRAFT' }),
  });
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { PDFParse } = await import('pdf-parse') as any;
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  return String((await parser.getText())?.text || '');
}

const words = (text: string) => normalizeForComparison(text).split(' ').filter(Boolean);

const FAMILIES: Array<{ id: string; matter: string; label: string; sources?: () => ReturnType<typeof sourceFromText>[] }> = [
  { id: 'contestacion_demanda_civil', matter: 'Civil', label: 'contestación', sources: () => {
    const source = sourceFromText(DEMANDA_CIVIL_ARRENDAMIENTO, 'demanda-civil');
    (source as { classification?: unknown }).classification = { role: 'PRIMARY', sourceDocumentType: 'DEMANDA_CIVIL' };
    return [source];
  } },
  { id: 'apelacion_civil', matter: 'Civil', label: 'apelación' },
  { id: 'demanda_laboral', matter: 'Laboral', label: 'demanda laboral' },
  { id: 'denuncia', matter: 'Penal', label: 'denuncia penal' },
  { id: 'recurso_revision_amparo', matter: 'Amparo', label: 'recurso de amparo' },
];

describe('exportación por familia documental', () => {
  const table: string[] = [];

  for (const family of FAMILIES) {
    it(`${family.label} (${family.id}): DOCX y PDF íntegros, coherentes y sin andamiaje`, async () => {
      mocks.auth.mockResolvedValue({ ok: true, context: { organizationId: 'org', userId: 'user' } });
      mocks.owner.mockResolvedValue(true);
      const { doc, instruction } = await draftFor(family.id, family.matter, family.sources?.());
      const modelText = doc.sections.flatMap((section: any) => section.content.map((block: any) => block.text)).join('\n');

      // ── DOCX ──
      const docxResponse = await exportDocx(exportRequest('docx', doc));
      expect(docxResponse.status, 'DOCX').toBe(200);
      const docxBytes = new Uint8Array(await docxResponse.arrayBuffer());
      expect(Buffer.from(docxBytes.subarray(0, 2)).toString()).toBe('PK');
      const pkg = await readDocxPackage(docxBytes);
      for (const entry of ['word/document.xml', '[Content_Types].xml']) expect(pkg.entryNames).toContain(entry);
      const documentXml = await pkg.readText('word/document.xml');
      parseXml(documentXml); // se parsea sin errores
      // Los saltos de línea (w:br) dentro de un párrafo cuentan como renglones distintos.
      const withBreaks = (xml: string) => xml.replace(/<w:br[^>]*\/>/g, '<w:r><w:t>\n</w:t></w:r>');
      const paragraphs = extractWordDocumentParagraphs(withBreaks(documentXml)).flatMap((paragraph) => paragraph.split(/\n+/));
      const docxText = paragraphs.join('\n');

      // Hechos, partes y peticiones del borrador llegan sin alteraciones.
      const sampleFacts = modelText.match(/HECHO-[A-Z]+-(?:UNO|DOS)|AL HECHO \d+|PRESTACI[ÓO]N \d+|PRIMERO\./g) || [];
      for (const marker of new Set(sampleFacts)) expect(docxText, `DOCX conserva «${marker}»`).toContain(marker);
      for (const section of doc.sections.filter((s: any) => !['header', 'signature'].includes(s.type) && s.title && s.content.some((b: any) => (b.text || '').trim().length > 40))) {
        const heading = String(section.title).replace(/\s+/g, ' ').trim();
        expect(normalizeForComparison(docxText), `sección «${heading}»`).toContain(normalizeForComparison(heading).slice(0, 18));
      }

      // Sin andamiaje ni citas sin respaldo (validador de la Fase 2).
      const findings = validateGeneratedText(docxText, contextFromDocument(doc, { instruction, confirmedFacts: ['EXP-SINT-2026/001', '2026-01-15'] }))
        .filter((finding) => finding.severity === 'BLOCKER');
      expect(findings.map((finding) => `${finding.code}:${finding.excerpt.slice(0, 50)}`)).toEqual([]);

      // El rótulo de borrador vive en el encabezado (repetido por página a propósito) y el encabezado del
      // escrito (juzgado/expediente) no se repite en el cuerpo ni en el encabezado de página.
      const headerEntries = pkg.entryNames.filter((name) => /^word\/header\d*\.xml$/.test(name));
      const headerText = (await Promise.all(headerEntries.map((name) => pkg.readText(name)))).join(' ');
      expect(headerText).toMatch(/BORRADOR/);
      const firstLine = String(doc.sections[0].content[0]?.text || '').split('\n').find((line: string) => line.trim().length > 12) || '';
      if (firstLine) {
        const occurrences = paragraphs.filter((paragraph) => paragraph.includes(firstLine.trim())).length;
        expect(occurrences, `encabezado «${firstLine.slice(0, 40)}»`).toBeLessThanOrEqual(1);
        expect(headerText.includes(firstLine.trim()), 'el encabezado del escrito no va en el encabezado de página').toBe(false);
      }

      // Estilos coherentes: pocas familias tipográficas y sin tablas irregulares.
      const fonts = new Set((documentXml.match(/w:ascii="([^"]+)"/g) || []).map((value) => value));
      expect(fonts.size, `tipografías ${[...fonts].join(',')}`).toBeLessThanOrEqual(3);
      const tableRows = parseXml(documentXml).getElementsByTagName('w:tbl');
      for (let t = 0; t < tableRows.length; t++) {
        const rows = Array.from(tableRows[t].getElementsByTagName('w:tr'));
        const widths = new Set(rows.map((row) => row.getElementsByTagName('w:tc').length));
        expect(widths.size, 'tabla con filas de distinto número de celdas').toBeLessThanOrEqual(1);
      }

      // ── PDF ──
      const pdfResponse = await exportPdf(exportRequest('pdf', doc));
      expect(pdfResponse.status, 'PDF').toBe(200);
      const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
      expect(Buffer.from(pdfBytes.subarray(0, 4)).toString()).toBe('%PDF');
      const pages = countPdfPages(pdfBytes);
      expect(pages).toBeGreaterThan(0);
      const pdfContent = await pdfText(pdfBytes);
      expect(pdfContent.length).toBeGreaterThan(200);

      // DOCX ↔ PDF ↔ borrador. El DOCX conserva cada renglón del borrador (solo añade los títulos de sección) y el
      // PDF contiene las mismas palabras que el DOCX (más rótulos de página).
      const squash = (value: string) => value.replace(/\s+/g, ' ').trim();
      const docxLines = paragraphs.map(squash).filter(Boolean);
      const modelLines = doc.sections.flatMap((section: any) => section.content.flatMap((block: any) => String(block.text || '').split(/\n+/))).map(squash).filter(Boolean);
      const headerLines = (await Promise.all(headerEntries.map((name) => pkg.readText(name)))).flatMap((xml) => extractWordDocumentParagraphs(withBreaks(xml))).map(squash).filter(Boolean);
      const lost = modelLines.filter((line: string) => ![...docxLines, ...headerLines].some((paragraph) => paragraph.includes(line)));
      expect(lost.map((line: string) => line.slice(0, 80)), 'renglones del borrador que no llegaron al DOCX').toEqual([]);
      const titles = new Set(doc.sections.map((section: any) => squash(String(section.title)).toUpperCase()));
      const added = docxLines.filter((line) => !modelLines.some((modelLine: string) => modelLine.includes(line)));
      expect(added.filter((line) => !titles.has(line.toUpperCase()) && line === line.toUpperCase() ? false : !titles.has(line.toUpperCase())).slice(0, 5), 'texto en el DOCX que no está en el borrador').toEqual([]);

      const overlap = (from: string, into: string) => {
        const target = new Map<string, number>();
        for (const word of words(into)) target.set(word, (target.get(word) || 0) + 1);
        const source = words(from);
        let found = 0;
        for (const word of source) {
          const left = target.get(word) || 0;
          if (left > 0) { found += 1; target.set(word, left - 1); }
        }
        return found / Math.max(1, source.length);
      };
      const docxInPdf = overlap(docxText, pdfContent);
      const pdfInDocx = overlap(pdfContent, docxText);
      expect(docxInPdf, 'palabras del DOCX presentes en el PDF').toBeGreaterThanOrEqual(0.95);
      // El PDF añade el rótulo de borrador y el folio en cada hoja, de ahí que sea algo menor que en sentido inverso.
      expect(pdfInDocx, 'palabras del PDF presentes en el DOCX').toBeGreaterThanOrEqual(0.85);
      const docxVsPdf = docxInPdf;
      const pdfVsModel = overlap(modelText, pdfContent);
      expect(pdfVsModel, 'palabras del borrador presentes en el PDF').toBeGreaterThanOrEqual(0.95);

      table.push(`${family.id.padEnd(30)} PDF=${String(pages).padStart(2)} págs (medido) · DOCX≈${String(estimateDocxPages(pages)).padStart(2)} págs (estimado) · DOCX→PDF ${docxVsPdf.toFixed(2)} · borrador→PDF ${pdfVsModel.toFixed(2)}`);
    }, 180000);
  }

  it('resumen', () => {
    process.stderr.write(`\nEXPORT-TABLA\n${table.join('\n')}\n`);
    expect(table.length).toBe(FAMILIES.length);
  });
});
