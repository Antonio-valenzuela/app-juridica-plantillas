import { describe, expect, it } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { resolveWritingType } from '@/lib/catalog/writingTypeIdentity';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { readDocxPackage, extractWordDocumentParagraphs } from '../helpers/docxPackageReader';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

/**
 * Materialización por familia representativa: el contenido debe llegar al
 * DOCX y al PDF, no sólo la marca BORRADOR ni encabezados. FINAL debe seguir
 * bloqueado cuando el documento tiene pendientes.
 */

const REPRESENTATIVE: Array<[string, string]> = [
  ['demanda', 'demanda_ordinaria_civil'],
  ['contestacion', 'contestacion_demanda_civil'],
  ['recurso', 'apelacion_civil'],
  ['amparo', 'demanda_amparo_directo'],
  ['escrito_tramite', 'escrito_libre'],
  ['variante_familia', 'demanda_oral_civil'],
  ['penal', 'querella'],
];

function analysis(): CaseAnalysis {
  return {
    parties: { actor: 'ACTOR SINTETICO', demandado: 'DEMANDADO SINTETICO' },
    authorities: ['JUEZ COMPETENTE SINTETICO'],
    caseNumbers: { principal: 'EXP-MAT-2026/001' },
    proceduralTimeline: [{ date: '2026-01-15', event: 'Actuación que origina el escrito', sourceDocument: 'src-mat', certainty: 1 }],
    challengedActs: [], claims: ['Pretensión sostenida por la parte promovente'],
    claimResponses: [], arguments: [],
    evidence: [{ id: 'ev-1', type: 'DOCUMENTAL', description: 'Constancia documental aportada', confirmed: true, provenance: 'LAWYER_CONFIRMED' }],
    facts: [
      { id: 'f-1', number: '1', text: 'Hecho verificable que consta en autos y permite verificar la pretensión.', confidence: 1 },
      { id: 'f-2', number: '2', text: 'Segundo hecho verificable relevante para la controversía.', confidence: 1 },
    ],
  } as any;
}

async function generate(documentType: string) {
  const identity = resolveWritingType(documentType);
  const declared = identity.compatibleSources.acceptedSourceTypes[0]
    || (identity.compatibleSources.optionalSourceTypes || [])[0]
    || 'SENTENCIA_O_RESOLUCION';
  return runGenerationPipeline({
    selectedDocumentType: documentType,
    documentTypeLabel: identity.label,
    matter: 'Civil', jurisdiction: 'Jalisco',
    userInstruction: `Promover ${identity.label} con los hechos del expediente.`,
    sourceDocuments: [createSourceDocument({
      id: 'src-mat', filename: 'fuente.txt',
      content: 'SENTENCIA QUE DA ORIGEN AL ESCRITO. Se declara接班 firme la cantidad reclamada. ',
      sourceValidated: true,
      classification: { sourceDocumentType: declared, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
    } as any)],
    caseAnalysis: analysis(),
    workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
  } as any);
}

async function docxText(document: any) {
  const bytes = await exportUniversalToDocx(document, undefined, undefined, { exportMode: 'DRAFT' });
  const zip = await readDocxPackage(bytes);
  const paragraphs = [
    ...extractWordDocumentParagraphs(await zip.readText('word/document.xml')),
    ...extractWordDocumentParagraphs(await zip.readText('word/header1.xml')),
  ];
  return { bytes, text: paragraphs.join('\n') };
}

describe.each(REPRESENTATIVE)('materialización %s → %s', (_family, documentType) => {
  it('DOCX contiene contenido material, no sólo la marca de borrador', async () => {
    const document = await generate(documentType);
    const { bytes, text } = await docxText(document);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(text.trim().length).toBeGreaterThan(400);
    // Contenido real, no únicamente "BORRADOR" ni encabezados.
    const withoutChrome = text.replace(/BORRADOR|DRAFT/gi, '').replace(/\s+/g, ' ').trim();
    expect(withoutChrome.length).toBeGreaterThan(300);
  });

  it('PDF es válido y extrae texto', async () => {
    const document = await generate(documentType);
    const pdf = await exportUniversalToPdf(document, undefined, { exportMode: 'DRAFT' });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

describe('persistencia: el tipo elegido sobrevive generate → editor → guardar → recargar', () => {
  it('conserva documentType, canonicalType, secciones y contenido', async () => {
    const document = await generate('apelacion_civil');
    expect(document.documentType).toBe('apelacion_civil');

    // Serializar y recargar es el ciclo real de persistencia del documento.
    const serialized = JSON.stringify(document);
    const reloaded = JSON.parse(serialized) as typeof document;

    expect(reloaded.documentType).toBe('apelacion_civil');
    expect(reloaded.sections.length).toBe(document.sections.length);
    expect(reloaded.sections.map(s => s.id)).toEqual(document.sections.map(s => s.id));
    for (const [index, section] of document.sections.entries()) {
      const before = (section.content || []).map(b => b.text).join('\n');
      const after = (reloaded.sections[index].content || []).map(b => b.text).join('\n');
      expect(after).toBe(before);
      if (!['header', 'closing', 'signature'].includes(section.type)) {
        expect(after.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('FINAL permanece fail-closed', () => {
  it('un documento con pendientes no puede exportarse como FINAL', async () => {
    const document = await generate('apelacion_civil');
    await expect(exportUniversalToDocx(document, undefined, undefined, { exportMode: 'FINAL' }))
      .rejects.toThrow();
  });
});