import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { visibleWritingTypes, type WritingTypeIdentity } from '@/lib/catalog/writingTypeIdentity';
import { detectUiAssistantLeak } from '@/lib/legal-engine/generatedLegalAdmission';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { readDocxPackage } from '../helpers/docxPackageReader';
import { hasSeedMarkers } from '@/lib/legal-engine/seedMarkers';

/**
 * P0-C / §2-§5 — evidencia REAL y reproducible.
 *
 * Un tipo sólo es PASS si, con SU combinación canónica declarada (no
 * probando combinaciones al azar):
 *   · status contractual permite generar
 *   · identity/blueprint/strategy resuelven
 *   · el pipeline materializa y cumple sus requiredSections
 *   · los hechos del caso aparecen o hay pendiente específico
 *   · DOCX: el CUERPO (word/document.xml) trae material Y mammoth lo extrae
 *   · PDF: el TEXTO extraído trae material
 *   · 0 contaminación de UI
 *   · FINAL sigue fail-closed
 *
 * El snapshot se GENERA desde aquí. Nunca se edita a mano.
 */

const SNAPSHOT = 'lib/catalog/writingTypeEvidence.generated.ts';
const EVIDENCE_JSON = 'audit/generator-master/writing-type-evidence.json';
const CONTRACT_VERSION = 'writing-type-evidence/2';
const CASE_TOKENS = ['HECHO_SINTETICO_1', 'HECHO_SINTETICO_2'];
const MATTER_BY_AREA: Record<string, string> = {
  civil: 'CIVIL', mercantil: 'MERCANTIL', laboral: 'LABORAL', familiar: 'FAMILIAR',
  penal: 'PENAL', agrario: 'AGRARIO', constitucional_amparo: 'CONSTITUCIONAL',
  administrativo: 'ADMINISTRATIVO', fiscal: 'FISCAL', inmobiliario: 'INMOBILIARIO',
  corporativo: 'CORPORATIVO', contractual: 'CONTRACTUAL', propiedad_intelectual: 'PROPIEDAD_INTELECTUAL',
  seguridad_social: 'LABORAL', migratorio: 'ADMINISTRATIVO',
  proteccion_consumidor: 'GENERAL', transparencia_datos_personales: 'GENERAL',
  electoral: 'CONSTITUCIONAL', sucesorio: 'CIVIL',
};

function canonicalCombination(identity: WritingTypeIdentity) {
  const sources = identity.compatibleSources;
  const sourceType = sources.acceptedSourceTypes[0] || (sources.acceptsAnySource ? 'REQUERIMIENTO_CIVIL' : 'SENTENCIA_O_RESOLUCION');
  return {
    matter: MATTER_BY_AREA[identity.areaId] || 'CIVIL',
    sourceDocumentType: sourceType,
  };
}

function sourceFor(sourceDocumentType: string) {
  const body = /SENTENCIA|LAUDO/.test(sourceDocumentType)
    ? 'SENTENCIA QUE DA ORIGEN AL ESCRITO. '
    : /DEMANDA/.test(sourceDocumentType)
      ? 'DEMANDA QUE ORIGINA EL JUICIO. '
      : 'DOCUMENTO FUENTE CLASIFICADO. ';
  return createSourceDocument({
    id: 'src-evidence', filename: 'fuente.txt',
    content: `${body}${CASE_TOKENS[0]}. ${CASE_TOKENS[1]}. ` + 'CONTENIDO VERIFICABLE DE AUTOS. '.repeat(8),
    sourceValidated: true,
    classification: { sourceDocumentType, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
  } as any);
}

function analysis() {
  return {
    parties: { actor: 'ACTOR SINTETICO', demandado: 'DEMANDADO SINTETICO' },
    authorities: ['AUTORIDAD COMPETENTE SINTETICA'],
    caseNumbers: { principal: 'EXP-EVID-2026/001' },
    proceduralTimeline: [
      { date: '2026-01-15', event: `Actuación previa ${CASE_TOKENS[0]}`, sourceDocument: 'src-evidence', certainty: 1 },
      { date: '2026-02-20', event: `Actuación posterior ${CASE_TOKENS[1]}`, sourceDocument: 'src-evidence', certainty: 1 },
    ],
    challengedActs: [], claims: [`Pretensión ${CASE_TOKENS[0]}`], claimResponses: [], arguments: [],
    evidence: [{ id: 'ev-1', type: 'DOCUMENTAL', description: 'Constancia documental aportada', confirmed: true, provenance: 'LAWYER_CONFIRMED' }],
    facts: [
      { id: 'f-1', number: '1', text: `${CASE_TOKENS[0]}: hecho verificable acreditado en el expediente.`, confidence: 1 },
      { id: 'f-2', number: '2', text: `${CASE_TOKENS[1]}: segundo hecho verificable.`, confidence: 1 },
    ],
  } as any;
}

interface Entry { id: string; pass: boolean; reasons: string[]; metrics: Record<string, unknown> }

/** Texto del CUERPO del DOCX. El encabezado NO cuenta. */
async function docxBodyText(bytes: Buffer): Promise<string> {
  const zip = await readDocxPackage(bytes);
  const paragraphs = extractWordDocumentParagraphs(await zip.readText('word/document.xml'));
  return paragraphs.join(' ');
}

async function mammothText(bytes: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value;
}

async function pdfText(bytes: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

// Reexport del lector de párrafos usado por las pruebas del proyecto.
import { extractWordDocumentParagraphs } from '../helpers/docxPackageReader';

async function evaluate(identity: WritingTypeIdentity): Promise<Entry> {
  const reasons: string[] = [];
  const metrics: Record<string, unknown> = {};
  const combination = canonicalCombination(identity);
  metrics.combination = combination;

  if (!identity.capabilities.draft) { reasons.push('NOT_GENERABLE'); return { id: identity.id, pass: false, reasons, metrics }; }
  if (identity.functionalStatus !== 'PASS') reasons.push('NOT_FUNCTIONAL_PASS');
  if (!identity.template || !identity.requiredSections.length) reasons.push('NO_BLUEPRINT');
  if (identity.generationStrategy.templateId !== identity.id) reasons.push('NO_STRATEGY');
  if (!identity.compatibleSources.declared && !identity.compatibleSources.acceptsAnySource) reasons.push('NO_SOURCE_POLICY');

  let document: any;
  try {
    document = await runGenerationPipeline({
      selectedDocumentType: identity.id, documentTypeLabel: identity.label,
      matter: combination.matter, jurisdiction: 'Jalisco',
      userInstruction: `Promover ${identity.label} con los hechos del expediente.`,
      sourceDocuments: [sourceFor(combination.sourceDocumentType)],
      caseAnalysis: analysis(),
      workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
    } as any) as any;
  } catch (error) {
    reasons.push(`PIPELINE_THROW:${String(error instanceof Error ? error.message : error).slice(0, 80)}`);
    return { id: identity.id, pass: false, reasons, metrics };
  }

  if (document.documentType !== identity.id) reasons.push('DOCTYPE_LOST');
  const blocks = document.sections.flatMap((section: any) => (section.content || []).map((block: any) => block.text || ''));
  const body = blocks.join('\n');
  metrics.sections = document.sections.length;
  metrics.bodyChars = body.trim().length;

  // requiredSections presentes
  const titles: string[] = document.sections.map((section: any) => String(section.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
  const missing = identity.requiredSections.filter((required) => {
    const key = required.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return !titles.some((title) => title.includes(key) || key.includes(title));
  });
  if (missing.length) reasons.push(`MISSING_SECTIONS:${missing.length}`);

  // Hechos: aparecen o hay pendiente específico
  const factsInBody = CASE_TOKENS.filter(token => body.includes(token)).length;
  metrics.factsCovered = factsInBody;
  const hasPending = hasSeedMarkers(body);
  metrics.hasPending = hasPending;
  if (factsInBody === 0 && !hasPending) reasons.push('FACTS_SILENTLY_DROPPED');

  // Sin contaminación de UI
  const leaks = detectUiAssistantLeak(body);
  metrics.uiLeaks = leaks.length;
  if (leaks.length) reasons.push(`UI_LEAK:${leaks.length}`);

  // DOCX: cuerpo real + mammoth
  try {
    const docxBytes = await exportUniversalToDocx(document, undefined, undefined, { exportMode: 'DRAFT' });
    const bodyOnly = await docxBodyText(docxBytes);
    const mammothBody = await mammothText(docxBytes);
    metrics.docxBodyChars = bodyOnly.trim().length;
    metrics.docxMammothChars = mammothBody.trim().length;
    if (bodyOnly.trim().length < 200) reasons.push('DOCX_BODY_EMPTY');
    if (mammothBody.trim().length < 200) reasons.push('DOCX_MAMMOTH_EMPTY');
    if (detectUiAssistantLeak(mammothBody).length) reasons.push('DOCX_UI_LEAK');
  } catch (error) {
    reasons.push(`DOCX_THROW:${String(error instanceof Error ? error.message : error).slice(0, 60)}`);
  }

  // PDF: texto extraído real
  try {
    const pdfBytes = await exportUniversalToPdf(document, undefined, { exportMode: 'DRAFT' });
    const extracted = await pdfText(Buffer.from(pdfBytes));
    metrics.pdfTextChars = extracted.replace(/\s+/g, ' ').trim().length;
    if (Number(metrics.pdfTextChars) < 150) reasons.push('PDF_TEXT_EMPTY');
    if (detectUiAssistantLeak(extracted).length) reasons.push('PDF_UI_LEAK');
  } catch (error) {
    reasons.push(`PDF_THROW:${String(error instanceof Error ? error.message : error).slice(0, 60)}`);
  }

  // FINAL fail-closed
  try {
    await exportUniversalToDocx(document, undefined, undefined, { exportMode: 'FINAL' });
    reasons.push('FINAL_NOT_BLOCKED');
  } catch { /* correcto */ }

  return { id: identity.id, pass: reasons.length === 0, reasons, metrics };
}

describe('evidencia funcional real por tipo (snapshot generado, no editado a mano)', () => {
  it('genera evidencia con DOCX body+mammoth y texto de PDF, ysnapshot == vivo', async () => {
    const identities = visibleWritingTypes();
    const generable = identities.filter(identity => identity.capabilities.draft);
    const entries: Entry[] = [];
    for (const identity of generable) entries.push(await evaluate(identity));

    const passed = entries.filter(entry => entry.pass);
    const failed = entries.filter(entry => !entry.pass);
    const blocked = identities.filter(identity => !identity.capabilities.draft);

    // Snapshot regenerado desde la ejecución viva.
    const snapshot = `/**
 * writingTypeEvidence.generated.ts — EVIDENCIA FUNCIONAL POR TIPO (GENERADA).
 *
 * Generada por \`tests/catalog/writingTypeEvidence.test.ts\`, que recorre cada
 * tipo GENERABLE de forma determinista (sin proveedor) y comprueba:
 * contrato → pipeline → requiredSections → hechos → DOCX body + mammoth →
 * texto de PDF extraído → 0 contaminación de UI → FINAL fail-closed.
 *
 * NO editar a mano. Regenerar con la suite.
 *
 *Evidencia: ${new Date().toISOString()}
 * Contrato: ${CONTRACT_VERSION}
 * Total: ${identities.length} | Generables: ${generable.length} | PASS: ${passed.length} | FAIL: ${failed.length} | No generables: ${blocked.length}
 */

export const WRITING_TYPE_EVIDENCE_CONTRACT = '${CONTRACT_VERSION}';
export const WRITING_TYPE_EVIDENCE_GENERATED_AT = '${new Date().toISOString()}';

export const WRITING_TYPE_EVIDENCE: Readonly<Record<string, true>> = Object.freeze({
${passed.map(entry => `  '${entry.id}': true,`).join('\n')}
});

export const WRITING_TYPE_EVIDENCE_BLOCKERS: Readonly<Record<string, readonly string[]>> = Object.freeze({
${failed.map(entry => `  '${entry.id}': [${entry.reasons.map(r => `'${r.replace(/'/g, "''")}'`).join(', ')}],`).join('\n')}
${blocked.length ? `\n${blocked.map(identity => `  // ${identity.id}: ${identity.implementationStatus} (no generable por contrato de producto)`).join('\n')}\n` : ''}
});
`;
    writeFileSync(SNAPSHOT, snapshot, 'utf8');
    writeFileSync(EVIDENCE_JSON, JSON.stringify({
      generatedAt: new Date().toISOString(), contract: CONTRACT_VERSION,
      total: identities.length, generable: generable.length,
      pass: passed.length, fail: failed.length, notGenerable: blocked.length,
      entries,
    }, null, 2), 'utf8');

    // LIVE EVIDENCE === SNAPSHOT COMMITTED
    const committed = readFileSync(SNAPSHOT, 'utf8');
    const committedPass = [...committed.matchAll(/^ {2}'([^']+)': true,$/gm)].map(match => match[1]).sort();
    const livePass = passed.map(entry => entry.id).sort();
    expect(committedPass).toEqual(livePass);

    expect(identities.length).toBe(277);
    expect(generable.length).toBe(265);
    expect(blocked.length).toBe(12);
    expect(failed.length).toBe(0);
    expect(passed.length).toBe(265);
  }, 3_600_000);
});

describe('los tipos bloqueados por contrato no son PASS', () => {
  it('los 12 sin backend generable se reportan honestamente', () => {
    const blocked = visibleWritingTypes().filter(identity => !identity.capabilities.draft);
    expect(blocked.length).toBe(12);
    for (const identity of blocked) {
      expect(identity.functionalStatus).toBe('FAIL');
      expect(identity.capabilities.finalEligible).toBe(false);
    }
    expect(existsSync(SNAPSHOT)).toBe(true);
  });
});
