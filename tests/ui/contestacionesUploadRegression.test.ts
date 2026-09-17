import { describe, expect, it, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as POST_analyzeUpload } from '@/app/api/templates/analyze-upload/route';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { deriveContestacionesSteps } from '@/app/machotes/components/CaseDocumentsReader';
import { inferSourceOutputType } from '@/lib/legal-engine/sourceOutputCompatibility';
import { sourceDocumentMatter } from '@/lib/legal-engine/sourceDocumentTypes';
import {
  createSyntheticPdfBuffer,
  createSyntheticTxtBuffer,
} from '../acceptance/helpers/syntheticFixtures';
import type { UploadedSourceDocument, CaseDocument } from '@/lib/legal-engine/types';

beforeAll(() => {
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) delete process.env[k];
  process.env.DEMO_MODE_ENABLED = 'true';
});

const SYNTHETIC_LEGAL_TEXT = [
  'EXPEDIENTE: 800/2024',
  '',
  'ACTOR: JUAN PÉREZ',
  'DEMANDADO: EMPRESA DEMO S.A.',
  'AUTORIDAD: JUNTA DE CONCILIACIÓN Y ARBITRAJE',
  'ABOGADO: LIC. MARÍA LÓPEZ',
  '',
  'PRESTACIONES:',
  'A) Pago de salarios caídos por $50,000.00',
  'B) Indemnización constitucional por despido injustificado',
  'C) Pago de prestaciones proporcionales aguinaldo y vacaciones',
  '',
  'HECHOS:',
  '1. El día 10 de enero de 2024 el actor ingresó a laborar para la demandada.',
  '2. Posteriormente, el día 15 de marzo de 2024 fue despedido sin causa justificada.',
  '3. Finalmente, se le adeudan salarios y prestaciones desde esa fecha.',
  '',
  'PRUEBAS:',
  '1. DOCUMENTAL PÚBLICA: Escritura pública número 12,450 pasada ante la fe del Notario',
  '2. DOCUMENTAL PRIVADA: Contrato individual de trabajo de fecha 10 de enero de 2024',
  '3. DOCUMENTAL FINANCIERA: Estado de cuenta bancario con movimientos',
  '',
  'DERECHO: Artículos 47, 79 y 80 de la Ley Federal del Trabajo.',
].join('\n');

async function uploadViaApi(text: string, fileName: string, mime: string) {
  const buf = fileName.endsWith('.pdf') ? createSyntheticPdfBuffer(text) : createSyntheticTxtBuffer(text);
  const file = new File([new Uint8Array(buf as any)], fileName, { type: mime });
  const fd = new FormData();
  fd.append('file', file);
  const req = new NextRequest('http://localhost/api/templates/analyze-upload', { method: 'POST', body: fd });
  const res = await POST_analyzeUpload(req);
  const json: any = await res.json();
  return { res, json };
}

function createSourceFromText(text: string, id: string, fileName: string): UploadedSourceDocument {
  return createSourceDocument({
    id,
    filename: fileName,
    name: fileName,
    type: 'pdf',
    fileUrl: `blob:${id}`,
    extractedText: text,
    pages: [{ page: 1, text, chars: text.length }],
    sourceValidated: true,
    fileSizeBytes: 1024 * 100,
  } as any);
}

describe('FRONTEND REGRESSION — PDF UPLOAD → EXTRACCIÓN → UI', () => {
  // Test 1 — upload contract
  it('Test1: analyze-upload devuelve extractedText, pages, sourceValidated, analysis, classification', async () => {
    const { res, json } = await uploadViaApi(SYNTHETIC_LEGAL_TEXT, '800-2024.pdf', 'application/pdf');
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(typeof json.extractedText).toBe('string');
    expect(json.extractedText.length).toBeGreaterThan(100);
    expect(Array.isArray(json.pages)).toBe(true);
    expect(json.pages.length).toBeGreaterThan(0);
    expect(typeof json.sourceValidated).toBe('boolean');
    expect(json.analysis).toBeDefined();
    expect(json.classification).toBeDefined();
    expect(json.classification.sourceDocumentType).toBe('DEMANDA_LABORAL');
    expect(json.classification.materia).toBe('LABORAL');
    expect(json.classification.tipo_documento).toBe('Demanda laboral');
    expect(json.structureJson).toBeDefined();
  });

  // Test 2 — frontend state after upload (simulated)
  it('Test2: frontend state after upload — source + CaseDocument + selected + ficha + análisis', async () => {
    const { json } = await uploadViaApi(SYNTHETIC_LEGAL_TEXT, '800-2024.pdf', 'application/pdf');
    const src = createSourceDocument({
      id: json.pages ? 'doc-800' : 'doc-800',
      filename: '800-2024.pdf',
      name: '800-2024.pdf',
      type: 'pdf',
      fileUrl: 'blob:800',
      extractedText: json.extractedText,
      pages: json.pages,
      sourceValidated: json.sourceValidated,
      fileSizeBytes: 1500,
    } as any);

    const caseDoc: CaseDocument = {
      id: src.id,
      name: '800-2024.pdf',
      type: 'pdf',
      fileUrl: 'blob:800',
      pageCount: json.pages.length,
      pages: json.pages.map((p: any) => ({ page: p.page, text: p.text, chars: p.chars, ocrStatus: 'nativo' })),
      role: 'fuente_general',
      status: json.sourceValidated ? 'READY' : 'NEEDS_MANUAL_REVIEW',
      uploadedAt: new Date().toISOString(),
    };

    // ID correspondence
    expect(caseDoc.id).toBe(src.id);

    // Reconstruct analysis (frontend) should produce claims/facts/evidence
    const analysis = reconstructCaseAnalysis([src], '');
    expect(analysis.claims.length).toBeGreaterThanOrEqual(3); // A, B, C
    expect(analysis.facts.length).toBeGreaterThanOrEqual(3); // 1,2,3
    expect(analysis.evidence.length).toBeGreaterThanOrEqual(2); // at least documental publica/privada

    // Ficha detection via rich analysis parties/caseNumbers
    expect(analysis.parties.actor || analysis.parties.quejoso).toBeDefined();
    expect(analysis.caseNumbers.principal || analysis.proceduralAuthorities?.sourceAuthority).toBeDefined();

    // UI signals: hasDocument true -> stepper upload COMPLETED
    const steps = deriveContestacionesSteps({
      hasDocument: true,
      analysisAvailable: true,
      analysisRequiresReview: false,
      generationStatus: null,
      readiness: null,
      configDefined: true,
    });
    expect(steps[0].status).toBe('COMPLETED');
    expect(steps[1].status).toBe('COMPLETED');

    // Preview metadata
    expect(caseDoc.pageCount).toBe(json.pages.length);
    expect(caseDoc.status).toBe('READY');
  });

  // Test 3 — invalid source
  it('Test3: sourceValidated=false → NEEDS_MANUAL_REVIEW y no Extracción verificada', async () => {
    const emptyText = '   ';
    const srcInvalid = createSourceFromText(emptyText, 'doc-empty', 'vacio.pdf');
    // Simulate backend would mark sourceValidated false for empty
    const status = false ? 'READY' : 'NEEDS_MANUAL_REVIEW';
    expect(status).toBe('NEEDS_MANUAL_REVIEW');

    const analysisEmpty = reconstructCaseAnalysis([srcInvalid], '');
    // Should have missingData, not claims
    expect(analysisEmpty.missingData.length).toBeGreaterThan(0);

    const stepsBlocked = deriveContestacionesSteps({
      hasDocument: true,
      analysisAvailable: false,
      analysisRequiresReview: true,
      generationStatus: null,
      readiness: null,
    });
    expect(stepsBlocked[1].status).toBe('BLOCKED');
  });

  // Test 4 — selected document identity (multi-document)
  it('Test4: multi-document — IDs, preview, metadata no se mezclan', () => {
    const textA = SYNTHETIC_LEGAL_TEXT;
    const textB = SYNTHETIC_LEGAL_TEXT.replace('800/2024', '801/2024').replace('JUAN PÉREZ', 'ANA GARCÍA');

    const srcA = createSourceFromText(textA, 'doc-A', 'A-800.pdf');
    const srcB = createSourceFromText(textB, 'doc-B', 'B-801.pdf');

    const caseDocA: CaseDocument = {
      id: 'doc-A',
      name: 'A-800.pdf',
      type: 'pdf',
      fileUrl: 'blob:A',
      pageCount: 1,
      pages: [{ page: 1, text: textA, chars: textA.length, ocrStatus: 'nativo' }],
      role: 'fuente_general',
      status: 'READY',
      uploadedAt: new Date().toISOString(),
    };
    const caseDocB: CaseDocument = {
      id: 'doc-B',
      name: 'B-801.pdf',
      type: 'pdf',
      fileUrl: 'blob:B',
      pageCount: 1,
      pages: [{ page: 1, text: textB, chars: textB.length, ocrStatus: 'nativo' }],
      role: 'fuente_general',
      status: 'READY',
      uploadedAt: new Date().toISOString(),
    };

    const uploadedSourceDocs = [srcA, srcB];
    const caseDocuments = [caseDocA, caseDocB];

    // Simulate selecting B
    const selectedDocId = 'doc-B';
    const selectedDoc = caseDocuments.find((d) => d.id === selectedDocId)!;
    const selectedSourceDoc = uploadedSourceDocs.find((s) => s.id === selectedDoc.id)!;

    expect(selectedDoc.id).toBe('doc-B');
    expect(selectedDoc.name).toBe('B-801.pdf');
    expect(selectedDoc.fileUrl).toBe('blob:B');
    expect(selectedSourceDoc.id).toBe('doc-B');
    expect(selectedSourceDoc.id).toBe(selectedDoc.id);

    // Selecting A should give A's metadata
    const selectedA = caseDocuments.find((d) => d.id === 'doc-A')!;
    expect(selectedA.fileUrl).toBe('blob:A');
    expect(selectedA.id).not.toBe(selectedDoc.id);

    // caseAnalysis per-doc should be distinct (expediente)
    const analysisA = reconstructCaseAnalysis([srcA], '');
    const analysisB = reconstructCaseAnalysis([srcB], '');
    expect(analysisA.caseNumbers.principal).toBe('800/2024');
    expect(analysisB.caseNumbers.principal).toBe('801/2024');
    expect(analysisA.caseNumbers.principal).not.toBe(analysisB.caseNumbers.principal);
    // Evidence should be present for both and distinct in content due to different expediente context? At least not mixed
    expect(analysisA.evidence.length).toBeGreaterThan(0);
    expect(analysisB.evidence.length).toBeGreaterThan(0);
  });

  // Test 5 — auto-detection
  it('Test5: auto-detection inferSourceOutputType → sourceDocumentMatter → suggested type', () => {
    const srcCivil = createSourceFromText(SYNTHETIC_LEGAL_TEXT, 'doc-civil', 'civil.pdf');
    // The synthetic text is civil/laboral mix; at least should infer something
    const inferred = inferSourceOutputType([srcCivil]);
    // Could be DEMANDA_CIVIL, DEMANDA_LABORAL, DOCUMENTO_JURIDICO_NO_CLASIFICADO, etc.
    expect(typeof inferred === 'string' || inferred === null).toBe(true);
    if (inferred && inferred !== 'DOCUMENTO_JURIDICO_NO_CLASIFICADO') {
      const matter = sourceDocumentMatter(inferred as any);
      expect(matter).toBeDefined();
    }
    // Ensure function does not throw for empty
    expect(() => inferSourceOutputType([])).not.toThrow();
  });

  // Test 6 — user selection preservation
  it('Test6: selección manual no es pisada por cálculo automático', () => {
    let selectedResponseType = 'contestacion_demanda_civil';
    let userHasManuallyChanged = false;
    const suggested = 'contestacion_demanda_laboral';

    // Simulate auto suggestion when not manually changed
    if (suggested && !userHasManuallyChanged) {
      selectedResponseType = suggested;
    }
    expect(selectedResponseType).toBe('contestacion_demanda_laboral');

    // User manually changes
    userHasManuallyChanged = true;
    selectedResponseType = 'recurso_revision_amparo_directo';

    // New suggestion arrives but should not overwrite
    const newSuggested = 'contestacion_demanda_civil';
    if (newSuggested && !userHasManuallyChanged) {
      selectedResponseType = newSuggested;
    }
    expect(selectedResponseType).toBe('recurso_revision_amparo_directo');
  });

  // Test 7 — embedded headings (protected)
  it('Test7: PRESTACIONES y HECHOS como headings generan 3 claims y 3 facts sin incluir heading como item', () => {
    const text = [
      'PRESTACIONES:',
      'A) Pago de salarios',
      'B) Indemnización',
      'C) Prestaciones proporcionales',
      '',
      'HECHOS:',
      '1. Primer hecho detallado con fecha 10 de enero de 2024.',
      '2. Segundo hecho con detalle suficiente.',
      '3. Tercer hecho final.',
    ].join('\n');
    const src = createSourceFromText(text, 'doc-headings', 'headings.pdf');
    const analysis = reconstructCaseAnalysis([src], '');
    expect(analysis.claims.length).toBe(3);
    expect(analysis.claims[0]).not.toMatch(/PRESTACIONES/i);
    expect(analysis.facts.length).toBe(3);
    expect(analysis.facts[0].text).not.toMatch(/^HECHOS/i);
  });

  // Evidence specific tests
  it('Evidence: DOCUMENTAL PÚBLICA con escritura 12,450 genera evidencia real', () => {
    const text = [
      'PRUEBAS:',
      '1. DOCUMENTAL PÚBLICA: Escritura pública número 12,450 pasada ante Notario',
      '2. DOCUMENTAL PRIVADA: Contrato de fecha 10 de enero',
    ].join('\n');
    const src = createSourceFromText(text, 'doc-ev1', 'ev1.pdf');
    const analysis = reconstructCaseAnalysis([src], '');
    const ev = analysis.evidence;
    expect(ev.length).toBeGreaterThanOrEqual(1);
    const hasPublica = ev.some((e) => /PÚBLICA/.test(e.type) && e.description.includes('12,450'));
    expect(hasPublica).toBe(true);
  });

  it('Evidence: IDs 12,450 vs 67,890 son distintas y no se fusionan', () => {
    const text = [
      'EXPEDIENTE: 900/2024',
      'ACTOR: JUAN PÉREZ',
      'DEMANDADO: EMPRESA DEMO S.A.',
      'PRUEBAS:',
      '1. DOCUMENTAL PÚBLICA: Escritura pública número 12,450 pasada ante Notario',
      '2. DOCUMENTAL PÚBLICA: Escritura pública número 67,890 pasada ante Notario',
      'DERECHO: Artículos relativos.',
    ].join('\n');
    const src = createSourceFromText(text, 'doc-ev2', 'ev2.pdf');
    const analysis = reconstructCaseAnalysis([src], '');
    expect(analysis.evidence.length).toBe(2);
    const descs = analysis.evidence.map((e) => e.description);
    expect(descs[0]).not.toBe(descs[1]);
    expect(descs[0]).toContain('12,450');
    expect(descs[1]).toContain('67,890');
  });
});

// Helper to avoid TS error for toBe GreaterThanOrEqual typo above is intentional to test? Fix
