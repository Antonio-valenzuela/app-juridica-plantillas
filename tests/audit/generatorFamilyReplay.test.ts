import { afterAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANONICAL_DOCUMENT_TYPES } from '@/lib/catalog/legalCatalog';
import { DocumentTemplates } from '@/lib/legal-engine/documentTemplates';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';
import { extractAppealResolutionReview } from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import { readDocxPackage, extractWordDocumentParagraphs } from '../helpers/docxPackageReader';
import { scoreFamilyDocument, type FamilyVerificationDefinition } from '../../scripts/audit/family-scorecard';

// The only replaced boundary is the external provider. Production extraction,
// routing, planning, assembly, gates and exporters remain real.
vi.mock('@/lib/ai/fastMode', () => ({ runFastMode: async () => ({ success: false, text: '', error: 'OFFLINE_REPLAY_PROVIDER_UNAVAILABLE' }) }));

const output = join(process.cwd(), 'audit/generator-master/v5-replay');
mkdirSync(output, { recursive: true });
const records: Array<Record<string, unknown>> = [];
const targets = CANONICAL_DOCUMENT_TYPES.filter(type => type.status === 'IMPLEMENTED' && type.implemented
  && (!process.env.V5_FAMILY || type.areaId === process.env.V5_FAMILY));

function kindFor(id: string): FamilyVerificationDefinition['kind'] {
  if (/apelacion|recurso|revision|queja|reclamacion|inconformidad/.test(id)) return 'appeal';
  if (/contestacion|excepciones/.test(id)) return 'response';
  if (/demanda|denuncia|querella/.test(id)) return 'initial';
  if (/incidente/.test(id)) return 'incident';
  if (/solicitud|senalamiento|exhibicion|promocion|escrito_libre/.test(id)) return 'promotion';
  return 'other';
}

describe('V5 registry-driven family replay — evidence, not automatic accreditation', () => {
  it.each(targets)('$id routes, assembles and exports its current reviewed draft without external calls', async type => {
    const template = DocumentTemplates[type.id];
    const sourceType = type.sourceCompatibility!.acceptedSourceTypes[0] || 'DEMANDA_CIVIL';
    const isAppeal = ['apelacion_civil', 'apelacion_familiar'].includes(type.id);
    const sourceText = type.id === 'contestacion_revision_extraordinaria_amparo_directo'
      ? 'SENTENCIA DE AMPARO DIRECTO SINTÉTICA. TRIBUNAL COLEGIADO SINTÉTICO. Se niega el amparo respecto de la resolución identificada. La justificación y la existencia de una cuestión constitucional requieren revisión del abogado. No consta notificación ni fuente oficial.'
      : isAppeal
      ? 'SENTENCIA DEFINITIVA\nJUZGADO CIVIL SINTÉTICO\nEXPEDIENTE: SINTÉTICO/2026\nACTOR: PROMOVENTE SINTÉTICO\nDEMANDADO: CONTRAPARTE SINTÉTICA\nSEDE SINTÉTICA A 2 DE OCTUBRE DE 2026\nCONSIDERANDOS\nI. VALORACIÓN DE LA CONSTANCIA.\nLa parte actora no acreditó la entrega porque la constancia no contiene firma de recepción.\nPROPOSICIONES\nPRIMERA. Se declara improcedente la solicitud de la parte actora.'
      : `${sourceType}\nEXPEDIENTE: SINTÉTICO/2026\nACTOR: PROMOVENTE SINTÉTICO\nDEMANDADO: CONTRAPARTE SINTÉTICA\nHECHOS\n1. La parte promovente manifiesta que presentó una constancia documental el 2 de octubre de 2026.\nPRESTACIONES\n1. Se solicita el cumplimiento de la obligación descrita en la constancia documental.\nPRUEBAS\nDOCUMENTAL: constancia aportada, cuya autenticidad requiere revisión.`;
    const source = createSourceDocument({ id: `synthetic-${type.id}`, filename: `${type.id}.txt`, content: sourceText,
      sourceValidated: true, classification: { sourceDocumentType: sourceType, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' } });
    const review = isAppeal ? extractAppealResolutionReview([source]) : undefined;
    const resolution = review?.resolutions[0];
    const requestedRelief = kindFor(type.id) === 'promotion'
      ? 'Tener por exhibida la constancia documental identificada y agregarla al expediente, sin solicitar sentencia favorable.'
      : `Preparar ${type.label} con las alegaciones de la fuente. Toda postura o autoridad no confirmada debe quedar pendiente de revisión.`;
    const definition: FamilyVerificationDefinition = {
      familyId: type.areaId, kind: kindFor(type.id), requiredSections: template.estructura,
      forbiddenTerms: ['civil', 'familiar', 'mercantil'].includes(type.areaId)
        ? ['conceptos de violación', 'autoridad responsable', 'quejoso', 'Ley Federal del Trabajo'] : [],
      requestedRelief,
    };
    const record: Record<string, unknown> = { id: type.id, family: type.areaId, functionalStatus: 'FAIL', humanReview: 'PENDING',
      full40Criteria: 'NOT_DEMONSTRATED', testedWith: 'SYNTHETIC_OFFLINE', realProvider: false };
    records.push(record);
    try {
      const document = await runGenerationPipeline({ selectedDocumentType: type.id, matter: template.materia,
        userInstruction: requestedRelief, sourceDocuments: [source], externalProviderOptIn: false,
        savedParties: [{ role: 'actor', name: 'PROMOVENTE SINTÉTICO', source: 'manual' }, { role: 'demandado', name: 'CONTRAPARTE SINTÉTICA', source: 'manual' }],
        ...(isAppeal ? { requireAppealConfirmation: true, appealConfirmation: {
          sourceFingerprint: review!.sourceFingerprint, resolutionId: resolution!.id, parties: resolution!.parties,
          representedNames: ['PROMOVENTE SINTÉTICO'], recipient: 'JUZGADO CIVIL SINTÉTICO',
          notification: 'Fecha y boletín confirmados únicamente para este fixture sintético; plazo [A VERIFICAR].', confirmed: true,
        } } : {}),
        generateSection: ({ section }) => {
          if (/derecho|fundamento|norma/i.test(section.title)) return '[NO VERIFICADO: fundamento jurídico pendiente de fuente oficial aplicable a esta actuación]';
          if (/agravio/i.test(section.title)) return 'La resolución rechaza la pretensión porque no reconoce firma de recepción en la constancia. Se propone revisar si la valoración omitió otras constancias; sin soporte adicional y fundamento oficial este agravio permanece pendiente de decisión del abogado.';
          if (/prueba|evidencia/i.test(section.title)) return 'La constancia documental se menciona en la fuente. Su existencia en autos, autenticidad, disponibilidad y relación con el hecho controvertido deben comprobarse antes de ofrecerla. No se ofrece una confesional o testimonial sin instrucciones confirmadas.';
          if (/hecho|antecedente/i.test(section.title)) return 'La parte promovente manifiesta que presentó una constancia documental el 2 de octubre de 2026. Esta manifestación se atribuye a la fuente y no se tiene por acreditada. La contraparte debe confirmar su postura antes de admitir o negar el hecho.';
          return `En ${section.title}, el análisis se limita a la constancia documental identificada en la fuente. Debe distinguirse la alegación de la parte de un hecho acreditado; no hay soporte para una conclusión jurídica definitiva ni para nuevas pretensiones. [PENDIENTE: el abogado debe confirmar los datos y la postura correspondientes a esta sección].`;
        },
      });
      record.scorecard = scoreFamilyDocument(definition, document);
      record.sections = document.sections.map(section => ({ title: section.title, blocks: section.content.length }));
      record.routing = document.generationMetadata.routing;
      const runtimeMetadata = document.generationMetadata as typeof document.generationMetadata & { readiness?: string; qualityGate?: boolean };
      record.readiness = runtimeMetadata.readiness;
      record.qualityGate = runtimeMetadata.qualityGate;
      record.assembledWords = (record.scorecard as { words: number }).words;
      writeFileSync(join(output, `${type.id}.json`), JSON.stringify(document, null, 2));
      expect(document.documentType).toBe(type.id);
      expect(document.generationMetadata.routing?.fallbackUsed).toBe(false);
      expect(document.status).toBe('draft');
      const prepared = await prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' });
      record.finalAllowed = prepared.qualityGate.canMarkAsFinal;
      const docx = await exportUniversalToDocx(document, undefined, undefined, { exportMode: 'DRAFT' });
      const pdf = await exportUniversalToPdf(document, undefined, { exportMode: 'DRAFT' });
      writeFileSync(join(output, `${type.id}.docx`), docx);
      writeFileSync(join(output, `${type.id}.pdf`), pdf);
      const zip = await readDocxPackage(docx);
      const text = extractWordDocumentParagraphs(await zip.readText('word/document.xml')).join('\n');
      // The exporter intentionally labels DRAFT in the repeating header, not
      // in the legal body. Validate the package rather than a wrong body fixture.
      const header = extractWordDocumentParagraphs(await zip.readText('word/header1.xml')).join('\n');
      expect(header).toContain('BORRADOR');
      const currentText = document.sections.flatMap(section => section.content.map(block => block.text)).find(text => text.trim());
      expect(currentText).toBeDefined();
      // Formal blocks may materialize in the repeating header. A Word line
      // break is not a w:t node; compare one original line, not a concatenation
      // manufactured by the test XML decoder.
      const currentLine = currentText!.split(/\r?\n/).find(line => line.trim().length > 20)!;
      expect(`${text}\n${header}`).toContain(currentLine.trim().slice(0, 35));
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      expect(docx.length).toBeGreaterThan(500);
      expect(pdf.length).toBeGreaterThan(500);
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(pdf) });
      try {
        const parsed = await parser.getText();
        expect(parsed.pages.length).toBeGreaterThan(0);
        expect(parsed.pages.every(page => page.text.trim().length > 0)).toBe(true);
        expect(parsed.text).toContain('BORRADOR');
        record.pdfPages = parsed.pages.length;
      } finally { await parser.destroy(); }
      record.exports = { docx: { bytes: docx.length, path: join(output, `${type.id}.docx`) }, pdf: { bytes: pdf.length, path: join(output, `${type.id}.pdf`) } };
      record.mechanicalReplay = 'PASS';
      // A pending synthetic draft is explicitly NOT a professional document PASS.
    } catch (error) {
      record.mechanicalReplay = 'FAIL';
      record.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }, 30_000);
});

afterAll(() => writeFileSync(join(output, 'results.json'), JSON.stringify({
  mode: 'OFFLINE_REPLAY_NOT_FUNCTIONAL_CERTIFICATION', records,
}, null, 2)));
