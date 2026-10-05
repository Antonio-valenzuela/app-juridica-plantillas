import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { visibleWritingTypes, resolveWritingType, type WritingTypeIdentity } from '@/lib/catalog/writingTypeIdentity';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { readDocxPackage, extractWordDocumentParagraphs } from '../helpers/docxPackageReader';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

/**
 * EVIDENCIA → EVALUADOR → functionalStatus.
 *
 * Este recorrido NO promueve tipos por fiat: comprueba, por tipo y de forma
 * determinista (sin proveedor), el contrato funcional completo. El resultado
 * se persiste y es lo que consume el evaluador del catálogo. Los overrides
 * quedan reservados a excepciones justificadas.
 */

const EVIDENCE_PATH = 'audit/generator-master/writing-type-evidence.json';

function analysis(): CaseAnalysis {
  return {
    parties: { actor: 'ACTOR SINTETICO', demandado: 'DEMANDADO SINTETICO' },
    authorities: ['JUEZ COMPETENTE SINTETICO'],
    caseNumbers: { principal: 'EXP-EVID-2026/001' },
    proceduralTimeline: [
      { date: '2026-01-15', event: 'Actuación inicial que origina el escrito', sourceDocument: 'src-evid', certainty: 1 },
      { date: '2026-02-20', event: 'Actuación posterior relevante', sourceDocument: 'src-evid', certainty: 1 },
    ],
    challengedActs: [], claims: ['Pretensión sostenida por la parte promovente'],
    claimResponses: [], arguments: [],
    evidence: [{ id: 'ev-1', type: 'DOCUMENTAL', description: 'Constancia documental aportada', confirmed: true, provenance: 'LAWYER_CONFIRMED' }],
    facts: [
      { id: 'f-1', number: '1', text: 'Hecho verificable que consta en autos.', confidence: 1 },
      { id: 'f-2', number: '2', text: 'Segundo hecho verificable relevante para la controversia.', confidence: 1 },
    ],
  } as any;
}

interface Evidence { id: string; family: string; contract: boolean; generation: boolean; sections: number; docx: boolean; pdf: boolean; finalBlocked: boolean; incorrectFallback: boolean; blockers: string[]; attempts?: string[] }

function sourceContent(sourceDocumentType: string): string {
  // El preflight exige que la fuente sea congruente con el tipo (p. ej. una
  // sentencia de amparo directo debe decirlo). El contenido del fixture
  // describe la clase de fuente que el propio tipo declara.
  if (/AMPARO_DIRECTO/i.test(sourceDocumentType)) {
    return 'SENTENCIA DE AMPARO DIRECTO QUE RESUELVE EL JUICIO. ' + 'CONTENIDO VERIFICABLE DE AUTOS. '.repeat(8);
  }
  if (/AMPARO/i.test(sourceDocumentType)) {
    return 'SENTENCIA DE AMPARO INDIRECTO QUE RESUELVE EL JUICIO. ' + 'CONTENIDO VERIFICABLE DE AUTOS. '.repeat(8);
  }
  if (/SENTENCIA|LAUDO/i.test(sourceDocumentType)) {
    return 'SENTENCIA QUE DA ORIGEN AL ESCRITO. ' + 'CONTENIDO VERIFICABLE DE AUTOS. '.repeat(8);
  }
  return 'DOCUMENTO DE LA FUENTE CLASIFICADO COMO ' + sourceDocumentType + '. ' + 'CONTENIDO VERIFICABLE DE AUTOS. '.repeat(8);
}

async function collect(identity: WritingTypeIdentity): Promise<Evidence> {
  const blockers: string[] = [];
  const contract = Boolean(identity.template) && identity.requiredSections.length > 0 && !identity.incorrectFallback;
  if (!contract) blockers.push('CONTRACT');

  // La fuente se toma de la compatibilidad REAL del tipo y la materia se prueba
  // contra la del tipo: el gate de fuente/materia debe seguir rechazando lo
  // incompatible, así que el recorrido prueba una combinación válida.
  const matterCandidates = [...new Set([
    (identity.template.materia as string) || '',
    identity.proceeding.includes('amparo') ? 'CONSTITUCIONAL' : '',
    'GENERAL',
  ].filter(Boolean))];
  const sourceCandidates = [
    ...identity.compatibleSources.acceptedSourceTypes,
    ...(identity.compatibleSources.optionalSourceTypes || []),
  ];
  const attempts: string[] = [];
  let document: any = null;
  let lastError = '';
  const sources = sourceCandidates.length ? sourceCandidates : ['SENTENCIA_O_RESOLUCION'];
  outer:
  for (const matter of matterCandidates) {
    for (const sourceDocumentType of sources) {
      try {
        document = await runGenerationPipeline({
          selectedDocumentType: identity.id,
          documentTypeLabel: identity.label,
          matter, jurisdiction: 'Jalisco',
          userInstruction: `Promover ${identity.label} con los hechos del expediente.`,
          sourceDocuments: [createSourceDocument({
            id: 'src-evid', filename: 'fuente.txt',
            content: sourceContent(sourceDocumentType),
            sourceValidated: true,
            classification: { sourceDocumentType, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
          } as any)],
          caseAnalysis: analysis(),
          workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
        } as any) as any;
        attempts.push(`OK:${matter}/${sourceDocumentType}`);
        break outer;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        attempts.push(`FAIL:${matter}/${sourceDocumentType}`);
      }
    }
  }

  try {
    if (!document) throw new Error(lastError || 'sin generación');
    const body = document.sections.flatMap((s: any) => (s.content || []).map((b: any) => b.text || '')).join('\n');
    const generation = document.documentType === identity.id && document.sections.length > 2 && body.trim().length > 300;
    if (!generation) blockers.push('GENERATION');

    let docxOk = false;
    try {
      const bytes = await exportUniversalToDocx(document, undefined, undefined, { exportMode: 'DRAFT' });
      const zip = await readDocxPackage(bytes);
      const text = [...extractWordDocumentParagraphs(await zip.readText('word/document.xml'))].join('\n');
      docxOk = bytes.subarray(0, 2).toString() === 'PK' && text.replace(/BORRADOR|DRAFT/gi, '').trim().length > 300;
    } catch { docxOk = false; }
    if (!docxOk) blockers.push('DOCX');

    let pdfOk = false;
    try {
      const pdf = await exportUniversalToPdf(document, undefined, { exportMode: 'DRAFT' });
      pdfOk = pdf.subarray(0, 4).toString() === '%PDF' && pdf.length > 1000;
    } catch { pdfOk = false; }
    if (!pdfOk) blockers.push('PDF');

    let finalBlocked = false;
    try {
      await exportUniversalToDocx(document, undefined, undefined, { exportMode: 'FINAL' });
    } catch { finalBlocked = true; }
    if (!finalBlocked) blockers.push('FINAL_NOT_FAIL_CLOSED');

    return {
      id: identity.id, family: identity.familyId,
      contract, generation, sections: document.sections.length,
      docx: docxOk, pdf: pdfOk, finalBlocked,
      incorrectFallback: identity.incorrectFallback,
      blockers,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    blockers.push(`THROWN:${message.slice(0, 120)}`);
    return { id: identity.id, family: identity.familyId, contract, generation: false, sections: 0, docx: false, pdf: false, finalBlocked: false, incorrectFallback: identity.incorrectFallback, blockers, attempts } as Evidence;
  }
}

describe('evidencia funcional por tipo (determinista, sin proveedor)', () => {
  it('produce evidencia completa para todos los tipos visibles', async () => {
    const identities = visibleWritingTypes();
    const evidence: Evidence[] = [];
    for (const identity of identities) evidence.push(await collect(identity));

    mkdirSync('audit/generator-master', { recursive: true });
    writeFileSync(EVIDENCE_PATH, JSON.stringify({
      generatedAt: new Date().toISOString(),
      scope: 'DETERMINISTIC_EVIDENCE_NO_PROVIDER',
      total: evidence.length,
      passing: evidence.filter(e => e.blockers.length === 0).length,
      evidence,
    }, null, 2));

    const failing = evidence.filter(entry => entry.blockers.length > 0);
    expect(failing.map(entry => `${entry.id}:${entry.blockers.join('+')}`)).toEqual([]);
    expect(evidence.filter(entry => entry.incorrectFallback)).toEqual([]);
    expect(evidence.every(entry => entry.finalBlocked)).toBe(true);
  }, 3_600_000);
});

describe('evaluador: la evidencia computa functionalStatus', () => {
  it('un tipo con evidencia completa es PASS técnico y sigue con revisión humana pendiente', () => {
    const identity = resolveWritingType('apelacion_civil');
    expect(identity.functionalStatus).toBe('PASS');
    // PASS técnico NO es FINAL: la revisión humana sigue pendiente y FINAL
    // depende de los gates del documento concreto.
    expect(identity.humanReview).toBe('PENDING');
  });

  it('PASS técnico no habilita FINAL automáticamente', async () => {
    const identity = resolveWritingType('apelacion_civil');
    // PASS técnico sin aprobación humana NO habilita FINAL.
    expect(identity.capabilities.finalEligible).toBe(false);
    expect(identity.humanReview).toBe('PENDING');
    const document = await runGenerationPipeline({
      selectedDocumentType: 'apelacion_civil',
      documentTypeLabel: identity.label,
      matter: 'CIVIL', jurisdiction: 'Jalisco',
      userInstruction: 'Crear una apelación de esta sentencia.',
      sourceDocuments: [createSourceDocument({
        id: 'src-final', filename: 'fuente.txt',
        content: 'SENTENCIA QUE DA ORIGEN AL ESCRITO. ' + 'CONTENIDO VERIFICABLE DE AUTOS. '.repeat(8),
        sourceValidated: true,
        classification: { sourceDocumentType: 'SENTENCIA_O_RESOLUCION', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
      } as any)],
      caseAnalysis: analysis(),
      workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
    } as any) as any;
    await expect(exportUniversalToDocx(document, undefined, undefined, { exportMode: 'FINAL' })).rejects.toThrow();
  });
});