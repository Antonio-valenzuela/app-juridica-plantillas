import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createDocumentNode, createEmptyDocument, type UniversalLegalDocument } from '@/lib/legal-engine/types';
import {
  markDocumentEntity,
  markDocumentAsFinal,
  markDocumentAsReviewRequired,
  markDocumentAsReadyToExport,
  readDocumentExportReadiness,
  readDocumentEntityKind,
} from '@/lib/legal-engine/documentLifecycle';
import { validateForExport } from '@/lib/legal-engine/exportGuards';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { CIVIL_DEMAND_REQUIRED_SECTION_IDS } from '@/lib/legal-engine/documentStrategies';
import { evaluateSourceOutputCompatibility } from '@/lib/legal-engine/sourceOutputCompatibility';

vi.mock('@/lib/security/lawyerAuth', () => ({
  requireLawyerAccess: vi.fn(async () => ({
    ok: true,
    context: {
      organizationId: 'org-synthetic',
      userId: 'user-synthetic',
      lawyerId: 'user-synthetic',
      role: 'lawyer',
    },
  })),
}));

const SYNTHETIC_TEXT = 'Contenido jurídico sintético verificable para prueba de exportación. '.repeat(12);

function makeReadyCivilDemandDocument(): UniversalLegalDocument {
  const document = createEmptyDocument({
    id: 'civil-demand-export-synthetic',
    title: 'Demanda Ordinaria Civil',
    documentType: 'demanda_ordinaria_civil',
    templateId: 'demanda_ordinaria_civil',
    documentTypeLabel: 'Demanda Ordinaria Civil',
    matter: 'Civil',
    jurisdiction: 'Jurisdicción civil sintética por confirmar por el abogado.',
    legalBasis: ['Fundamentación jurídica civil sintética confirmada para prueba.'],
    parties: { actor: 'Parte actora sintética', demandado: 'Parte demandada sintética' },
    sections: CIVIL_DEMAND_REQUIRED_SECTION_IDS.map((id, index) => createDocumentNode({
      id,
      title: id,
      type: id === 'petitorios' ? 'petition' : id === 'firma' ? 'signature' : 'custom',
      order: index,
      content: [{
        id: `${id}-block`,
        layer: 'GENERATED_ARGUMENT',
        trustLevel: 'VERIFIED',
        text: id === 'petitorios'
          ? `PRIMERO. ${SYNTHETIC_TEXT}`
          : SYNTHETIC_TEXT,
      }],
    })),
    generationMetadata: {
      ...createEmptyDocument().generationMetadata,
      preflight: { status: 'READY', missingFields: [] },
      sourceOutputCompatibility: evaluateSourceOutputCompatibility({
        selectedDocumentType: 'demanda_ordinaria_civil',
        sourceDocuments: [],
      }),
    } as never,
  });
  (document as any).qualityGate = { passed: true, canMarkAsFinal: true };
  return markDocumentAsReadyToExport(document, { explicit: true });
}

function makeSyntheticDocument(): UniversalLegalDocument {
  const document = createEmptyDocument({
    id: 'doc-export-synthetic',
    title: 'Documento sintético de prueba',
    documentType: 'escrito_libre',
    documentTypeLabel: 'Escrito libre sintético',
    matter: 'General',
    jurisdiction: 'Por definir',
    sections: [
      createDocumentNode({
        id: 'destinatario',
        title: 'DESTINATARIO',
        type: 'header',
        content: [{ id: 'destinatario-block', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text: SYNTHETIC_TEXT }],
      }),
      createDocumentNode({
        id: 'cuerpo',
        title: 'CUERPO',
        type: 'facts',
        content: [{ id: 'cuerpo-block', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text: SYNTHETIC_TEXT }],
      }),
      createDocumentNode({
        id: 'petitorios',
        title: 'PETITORIOS',
        type: 'petition',
        content: [{ id: 'petitorios-block', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text: `PRIMERO. ${SYNTHETIC_TEXT}` }],
      }),
      createDocumentNode({
        id: 'firma',
        title: 'FIRMA',
        type: 'signature',
        content: [{ id: 'firma-block', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text: SYNTHETIC_TEXT }],
      }),
    ],
    generationMetadata: {
      ...createEmptyDocument().generationMetadata,
      preflight: { status: 'READY', missingFields: [] },
    } as never,
  });
  (document as any).qualityGate = { passed: true, canMarkAsFinal: true };
  return document;
}

function markDocumentEntityWithReadinessForTest() {
  return markDocumentEntity({ id: 'source-with-readiness' }, 'SOURCE_DOCUMENT', {
    readiness: 'READY_TO_EXPORT',
  } as any);
}

describe('LOOP 8B FASE 2A — guard común y lifecycle de exportación', () => {
  it('rechaza un documento DRAFT antes de permitir cualquier exportación', () => {
    const draft = makeSyntheticDocument();

    const result = validateForExport(draft);

    expect(readDocumentEntityKind(draft)).toBe('DRAFT');
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('LIFECYCLE_NOT_EXPORTABLE'),
    ]));
  });

  it('no acepta READY_TO_EXPORT falsificado únicamente en generationMetadata', () => {
    const forged = makeSyntheticDocument();
    (forged.generationMetadata as any).readiness = 'READY_TO_EXPORT';

    const result = validateForExport(forged);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('LIFECYCLE_NOT_EXPORTABLE'),
    ]));
  });

  it('no permite readiness de exportación en entidades que no son DRAFT', () => {
    expect(() => markDocumentEntityWithReadinessForTest()).toThrow(/readiness|DRAFT/i);
  });

  it('bloquea el exporter DOCX de bajo nivel cuando recibe DRAFT', async () => {
    await expect(exportUniversalToDocx(makeSyntheticDocument()))
      .rejects.toThrow(/LIFECYCLE_NOT_EXPORTABLE|READY_TO_EXPORT|export/i);
  });

  it('bloquea el exporter PDF de bajo nivel cuando recibe DRAFT', async () => {
    await expect(exportUniversalToPdf(makeSyntheticDocument()))
      .rejects.toThrow(/LIFECYCLE_NOT_EXPORTABLE|READY_TO_EXPORT|export/i);
  });

  it('expone una transición explícita a READY_TO_EXPORT solo para un documento válido', () => {
    const ready = markDocumentAsReadyToExport(makeSyntheticDocument(), { explicit: true });

    expect(readDocumentExportReadiness(ready)).toBe('READY_TO_EXPORT');
    expect(readDocumentEntityKind(ready)).toBe('DRAFT');
    expect((ready as any).generationMetadata.readiness).toBe('READY_TO_EXPORT');
  });

  it('convierte un quality gate fallido en REVIEW_REQUIRED y no permite FINAL_DOCUMENT', () => {
    const failed = makeSyntheticDocument() as any;
    failed.qualityGate = { passed: false, canMarkAsFinal: false };

    const review = markDocumentAsReviewRequired(failed);

    expect(readDocumentExportReadiness(review)).toBe('REVIEW_REQUIRED');
    expect(review.status).toBe('draft');
    expect(() => markDocumentAsFinal(review, { explicit: true }))
      .toThrow(/quality|REVIEW_REQUIRED|pendiente|final/i);
    expect(readDocumentEntityKind(review)).toBe('DRAFT');
  });

  it('permite DOCX y PDF únicamente después de READY_TO_EXPORT', async () => {
    const ready = markDocumentAsReadyToExport(makeSyntheticDocument(), { explicit: true });

    const [docx, pdf] = await Promise.all([
      exportUniversalToDocx(ready),
      exportUniversalToPdf(ready),
    ]);

    expect(docx.subarray(0, 2).toString()).toBe('PK');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('exporta la demanda civil canónica únicamente después de su transición explícita', async () => {
    const ready = makeReadyCivilDemandDocument();

    const [docx, pdf] = await Promise.all([
      exportUniversalToDocx(ready),
      exportUniversalToPdf(ready),
    ]);

    expect(docx.subarray(0, 2).toString()).toBe('PK');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('revalida el resultado del sanitizer y bloquea si la limpieza deja el documento vacío', async () => {
    const document = makeSyntheticDocument();
    for (const section of document.sections) {
      for (const block of section.content) block.text = `Fuente: ${SYNTHETIC_TEXT}`;
    }
    const ready = markDocumentAsReadyToExport(document, { explicit: true });

    await expect(exportUniversalToPdf(ready)).rejects.toThrow(/DOCUMENTO_VACIO|QUALITY_GATE|export/i);
  });

  it('rechaza el payload PDF legacy sin UniversalLegalDocument', async () => {
    const { POST } = await import('@/app/api/legal-engine/export/pdf/route');
    const request = new NextRequest('http://localhost/api/legal-engine/export/pdf', {
      method: 'POST',
      body: JSON.stringify({
        documentTitle: 'Documento sintético',
        renderedSections: [{ title: 'SECCIÓN', content: SYNTHETIC_TEXT }],
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error).toBe('PDF_LEGACY_PAYLOAD_REJECTED');
  });

  it('ignora renderedSections cuando existe un documento universal y no cae a HTML legacy', async () => {
    const { POST } = await import('@/app/api/legal-engine/export/pdf/route');
    const document = markDocumentAsReadyToExport(makeSyntheticDocument(), { explicit: true });
    const request = new NextRequest('http://localhost/api/legal-engine/export/pdf', {
      method: 'POST',
      body: JSON.stringify({
        document,
        renderedSections: [{ title: 'LEGACY QUE NO DEBE USARSE', content: 'Contenido legacy no autorizado.' }],
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-export-method')).toBe('pdf');
  });

  it('no permite regenerar una sección después de READY_TO_EXPORT o FINAL_DOCUMENT', async () => {
    const { POST } = await import('@/app/api/legal-engine/generate-section/route');
    const document = markDocumentAsReadyToExport(makeSyntheticDocument(), { explicit: true });
    const request = new NextRequest('http://localhost/api/legal-engine/generate-section', {
      method: 'POST',
      body: JSON.stringify({ document, sectionId: 'cuerpo', instruction: 'Regeneración sintética.' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('DOCUMENT_NOT_EDITABLE');
  });
});
