import { describe, expect, it } from 'vitest';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { markDocumentAsReviewRequired, markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { ExportGuardError, prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';
import { DRAFT_EXPORT_NOTICE, resolveExportMode } from '@/lib/legal-engine/exportModes';
import { materializeDocumentForPageMeasurement } from '@/lib/legal-engine/finalDocumentMaterialization';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import { readDocxPackage } from '../helpers/docxPackageReader';

function reviewDocument() {
  const document = createEmptyDocument({
    id: 'export-mode-review',
    documentType: 'escrito_libre',
    sections: [createDocumentNode({
      id: 'body',
      title: 'Contenido',
      type: 'argument',
      content: [{ id: 'body-1', text: 'Contenido generado válido para revisión.' } as any],
    })],
  });
  return markDocumentAsReviewRequired({
    ...document,
    qualityGate: { passed: false, canMarkAsFinal: false, criticalErrors: [], warnings: [] },
  } as any);
}

function readyDocument() {
  const text = 'Contenido jurídico listo para exportación verificable. '.repeat(12);
  const document = createEmptyDocument({
    id: 'export-mode-ready',
    documentType: 'escrito_libre',
    sections: [
      createDocumentNode({ id: 'header', title: 'DESTINATARIO', type: 'header', content: [{ id: 'header-1', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text }] }),
      createDocumentNode({ id: 'body', title: 'CONTENIDO', type: 'facts', content: [{ id: 'body-1', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text }] }),
      createDocumentNode({ id: 'petition', title: 'PETITORIOS', type: 'petition', content: [{ id: 'petition-1', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text: `ÚNICO. ${text}` }] }),
      createDocumentNode({ id: 'signature', title: 'FIRMA', type: 'signature', content: [{ id: 'signature-1', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text }] }),
    ],
  });
  (document as any).qualityGate = { passed: true, canMarkAsFinal: true, criticalErrors: [], warnings: [] };
  (document.generationMetadata as any).preflight = { status: 'READY', missingFields: [] };
  document.missingFields = [];
  document.anonymizedFields = [];
  document.validation = { isValid: true, errors: [], warnings: [] };
  return markDocumentAsReadyToExport(document, { explicit: true });
}

describe('exportMode DRAFT | FINAL', () => {
  it('mantiene el aviso DRAFT en texto profesional sin separadores tipográficos raros', () => {
    expect(DRAFT_EXPORT_NOTICE).toMatch(/^[\p{L}\p{N}\s-]+$/u);
    expect(DRAFT_EXPORT_NOTICE).toContain(' - ');
  });

  it('permite DRAFT con NEEDS_REVIEW sin promover el documento', async () => {
    const prepared = await prepareUniversalDocumentForExport(reviewDocument(), { exportMode: 'DRAFT' });

    expect(prepared.document.generationMetadata.exportMode).toBe('DRAFT');
    expect(prepared.document.generationMetadata.exportNotice).toBe(DRAFT_EXPORT_NOTICE);
    expect(prepared.reviewOverrideApplied).toBe(true);
  });

  it('permite exportar DRAFT con expediente pendiente y conserva el marcador sin habilitar FINAL', async () => {
    const document = reviewDocument();
    const pendingExpediente = '[DATO PENDIENTE DE EXPEDIENTE: Número de expediente]';
    document.sections[0] = {
      ...document.sections[0],
      content: [
        ...document.sections[0].content,
        { id: 'pending-case-number', text: pendingExpediente } as any,
      ],
    };

    await expect(prepareUniversalDocumentForExport(document, { exportMode: 'FINAL' }))
      .rejects.toThrow(/UNRESOLVED_FACTUAL_DEPENDENCY/);

    const prepared = await prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' });

    expect(prepared.document.generationMetadata.exportMode).toBe('DRAFT');
    expect(prepared.qualityGate.canMarkAsFinal).toBe(false);
    expect(prepared.document.sections.flatMap((section) => section.content).some((block) => block.text?.includes(pendingExpediente))).toBe(true);
    expect(prepared.reviewOverrideWarnings.some((warning) => warning.includes('UNRESOLVED_FACTUAL_DEPENDENCY'))).toBe(true);
    expect(prepared.reviewOverrideApplied).toBe(true);
  });

  it('normaliza negritas Markdown inline en el clon DRAFT y conserva el texto original', async () => {
    const document = reviewDocument();
    const sourceText = 'La **cuestión probatoria** debe revisarse con las constancias.';
    document.sections[0].content[0] = {
      ...document.sections[0].content[0],
      generatedBy: 'AI',
      text: sourceText,
    };

    const prepared = await prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' });
    const exportedText = prepared.document.sections.flatMap((section) => section.content).map((block) => block.text).join('\n');

    expect(exportedText).toContain('La cuestión probatoria debe revisarse con las constancias.');
    expect(exportedText).not.toContain('**');
    expect(document.sections[0].content[0].text).toBe(sourceText);
    expect(prepared.reviewOverrideWarnings).toContain('INLINE_MARKDOWN_FORMATTING_NORMALIZED: 1 negrita(s)');
    expect(prepared.qualityGate.canMarkAsFinal).toBe(false);
  });

  it('normaliza etiquetas HTML inline seguras sin imprimirlas en el borrador', async () => {
    const document = reviewDocument();
    const sourceText = 'Hecho 3: jornada laboral.<br><b>b)</b> La parte actora sostiene su versión.';
    document.sections[0].content[0] = {
      ...document.sections[0].content[0],
      generatedBy: 'AI',
      text: sourceText,
    };

    const prepared = await prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' });
    const exportedText = prepared.document.sections.flatMap((section) => section.content).map((block) => block.text).join('\n');

    expect(exportedText).toContain('Hecho 3: jornada laboral.\nb) La parte actora sostiene su versión.');
    expect(exportedText).not.toMatch(/<\/?(?:br|b)>/i);
    expect(document.sections[0].content[0].text).toBe(sourceText);
    expect(prepared.reviewOverrideWarnings).toContain('INLINE_HTML_FORMATTING_NORMALIZED: 3 etiqueta(s)');
  });

  it('bloquea DRAFT cuando el control factual detecta una fecha concreta no respaldada', async () => {
    const document = readyDocument();
    document.generationMetadata.draftDepth = 'EXTENSIVE_40';
    const body = document.sections.find((section) => section.id === 'body')!;
    body.content[0] = {
      ...body.content[0],
      text: `${body.content[0].text}\nLa actora ingresó el 3 de diciembre de 2024.`,
    };

    await expect(prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' }))
      .rejects.toThrow(/UNSUPPORTED_FACTUAL_CLAIM/);
  });

  it('bloquea DRAFT cuando una autoridad material está aplicada a una proposición incorrecta', async () => {
    const document = readyDocument();
    document.matter = 'LABORAL';
    document.generationMetadata.draftDepth = 'EXTENSIVE_40';
    const body = document.sections.find((section) => section.id === 'body')!;
    body.content[0] = {
      ...body.content[0],
      text: `${body.content[0].text}\nEl artículo 39-A de la LFT permite terminar un contrato por tiempo determinado al llegar su vencimiento.`,
    };

    await expect(prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' }))
      .rejects.toThrow(/MISAPPLIED_AUTHORITY/);
  });

  it('omite en DRAFT las oraciones con autoridad no verificada y advierte la revisión', async () => {
    const document = readyDocument();
    document.generationMetadata.draftDepth = 'EXTENSIVE_40';
    const body = document.sections.find((section) => section.id === 'body')!;
    body.content[0] = {
      ...body.content[0],
      generatedBy: 'AI',
      text: 'La pretensión requiere revisión de las constancias. El artículo 47 de la LFT regula los efectos aplicables al caso concreto.',
    } as any;
    document.generationMetadata.factualClaims = [{
      blockId: 'body-1',
      claim: 'La pretensión requiere revisión de las constancias.',
      status: 'LEGAL_ARGUMENT',
      sourceSpans: [],
      reviewedBy: 'ATTORNEY',
    }];

    const prepared = await prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' });
    const exportedText = prepared.document.sections.flatMap((section) => section.content).map((block) => block.text).join('\n');
    const authorityNote = prepared.document.sections.flatMap((section) => section.content).find((block) => block.text.includes('CITA JURÍDICA OMITIDA'));

    expect(exportedText).toContain('La pretensión requiere revisión de las constancias.');
    expect(exportedText).not.toMatch(/artículo 47 de la LFT/i);
    expect(exportedText).toContain('CITA JURÍDICA OMITIDA');
    expect(authorityNote?.generatedBy).toBe('DETERMINISTIC');
    expect(prepared.qualityGate.canMarkAsFinal).toBe(false);
    expect(prepared.reviewOverrideWarnings.some((warning) => warning.includes('DRAFT_UNVERIFIED_AUTHORITY_CITATIONS_OMITTED'))).toBe(true);
  });

  it('deja una sola nota de autoridad omitida por sección aunque retire varias citas', async () => {
    const document = readyDocument();
    document.generationMetadata.draftDepth = 'EXTENSIVE_40';
    const body = document.sections.find((section) => section.id === 'body')!;
    body.content = [
      {
        ...body.content[0],
        id: 'authority-1',
        generatedBy: 'AI',
        text: 'La pretensión requiere revisión. El artículo 47 de la LFT regula los efectos aplicables al caso.',
      } as any,
      {
        ...body.content[0],
        id: 'authority-2',
        generatedBy: 'AI',
        text: 'El argumento requiere valoración. El artículo 48 de la LFT sustenta esta consecuencia.',
      } as any,
    ];
    document.generationMetadata.factualClaims = [
      {
        blockId: 'authority-1',
        claim: 'La pretensión requiere revisión.',
        status: 'LEGAL_ARGUMENT',
        sourceSpans: [],
        reviewedBy: 'ATTORNEY',
      },
      {
        blockId: 'authority-2',
        claim: 'El argumento requiere valoración.',
        status: 'LEGAL_ARGUMENT',
        sourceSpans: [],
        reviewedBy: 'ATTORNEY',
      },
    ];

    const prepared = await prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' });
    const exportedText = prepared.document.sections.flatMap((section) => section.content).map((block) => block.text).join('\n');
    const authorityNotes = prepared.document.sections.flatMap((section) => section.content).filter((block) => block.text.includes('CITA JURÍDICA OMITIDA'));

    expect(exportedText.match(/CITA JURÍDICA OMITIDA/g)).toHaveLength(1);
    expect(authorityNotes).toHaveLength(1);
    expect(authorityNotes[0]?.generatedBy).toBe('DETERMINISTIC');
    expect(exportedText).not.toMatch(/artículo (47|48) de la LFT/i);
    expect(prepared.reviewOverrideWarnings).toContain('DRAFT_UNVERIFIED_AUTHORITY_CITATIONS_OMITTED:2');
  });

  it('bloquea DRAFT cuando hay bloques de IA sin auditoría factual individual', async () => {
    const document = readyDocument();
    document.generationMetadata.draftDepth = 'EXTENSIVE_40';
    const body = document.sections.find((section) => section.id === 'body')!;
    body.content[0] = {
      ...body.content[0],
      generatedBy: 'AI',
      text: 'La parte actora sostiene una versión que requiere contraste con las constancias.',
    } as any;

    expect(runQualityGateCheck(document).criticalErrors.map((issue) => issue.checkId)).toContain('FACTUAL_CLAIM_AUDIT_MISSING');
    await expect(prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' }))
      .rejects.toThrow(/FACTUAL_CLAIM_AUDIT_MISSING/);
  });

  it('bloquea DRAFT cuando el abogado no confirmó la postura del hecho que la respuesta niega', async () => {
    const document = readyDocument();
    document.documentType = 'contestacion_laboral';
    document.documentTypeLabel = 'Contestación laboral';
    document.matter = 'laboral';
    document.generationMetadata.draftDepth = 'EXTENSIVE_40';
    document.sections.find((section) => section.id === 'body')!.title = 'CONTESTACIÓN DE HECHOS';
    document.sections.find((section) => section.id === 'body')!.content[0] = {
      ...document.sections.find((section) => section.id === 'body')!.content[0],
      generatedBy: 'AI',
      text: 'AL HECHO 1: Se niega el hecho afirmado por la actora.',
    } as any;
    (document as any).caseAnalysis = {
      facts: [{ number: 1, position: 'REQUIRE_LAWYER_INPUT', lawyerPosition: 'UNDEFINED', text: 'La actora afirma que fue despedida.' }],
      claims: [],
      evidence: [],
    };
    (document as any).coverageMatrix = {
      items: [{
        id: 'missing-position-fact-1', category: 'MISSING_CLIENT_POSITION', description: 'Falta confirmar postura del hecho 1',
        required: true, status: 'needs_client_position', targetSectionIds: ['body'], scope: 'SUBSTANTIVE', blocking: true,
      }],
      summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 },
    };
    const quality = runQualityGateCheck(document);
    expect(quality.criticalErrors.map((issue) => issue.checkId)).toContain('CONTRADICTORY_POSITION');

    await expect(prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' }))
      .rejects.toThrow(/CONTRADICTORY_POSITION/);
  });

  it('permite DRAFT si falta confirmar postura pero la redacción se limita a reservar revisión', async () => {
    const document = readyDocument();
    document.documentType = 'contestacion_laboral';
    document.documentTypeLabel = 'Contestación laboral';
    document.sections.find((section) => section.id === 'body')!.title = 'CONTESTACIÓN DE HECHOS';
    (document as any).coverageMatrix = {
      items: [{
        id: 'missing-position-only', category: 'MISSING_CLIENT_POSITION', description: 'Postura pendiente para revisión',
        required: true, status: 'needs_client_position', targetSectionIds: ['body'], scope: 'SUBSTANTIVE', blocking: true,
      }],
      summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 },
    };

    const prepared = await prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' });

    expect(prepared.qualityGate.criticalErrors.map((issue) => issue.checkId)).toContain('MISSING_CLIENT_POSITION');
    expect(prepared.reviewOverrideApplied).toBe(true);
  });

  it('bloquea FINAL mientras el documento requiere revisión', async () => {
    await expect(prepareUniversalDocumentForExport(reviewDocument(), { exportMode: 'FINAL' }))
      .rejects.toBeInstanceOf(ExportGuardError);
  });

  it('permite FINAL únicamente después de READY_TO_EXPORT', async () => {
    const ready = readyDocument();
    const prepared = await prepareUniversalDocumentForExport(ready, { exportMode: 'FINAL' });

    expect(prepared.document.generationMetadata.exportMode).toBe('FINAL');
    expect(prepared.document.generationMetadata.exportNotice).toBeUndefined();
  });

  it('resuelve solo los modos explícitos y rechaza valores desconocidos', () => {
    expect(resolveExportMode('DRAFT')).toBe('DRAFT');
    expect(resolveExportMode('FINAL')).toBe('FINAL');
    expect(resolveExportMode('anything')).toBeNull();
  });

  it('materializa el aviso profesional del borrador para los renderers comunes', async () => {
    const prepared = await prepareUniversalDocumentForExport(reviewDocument(), { exportMode: 'DRAFT' });
    const model = materializeDocumentForPageMeasurement(prepared.document);

    expect(model.header.map((paragraph) => paragraph.text)).toContain(DRAFT_EXPORT_NOTICE);
  });

  it('genera DOCX y PDF de borrador sin llamar al pipeline de IA', async () => {
    const document = reviewDocument();
    const providerBefore = document.generationMetadata.aiProvider;
    const [docx, pdf] = await Promise.all([
      exportUniversalToDocx(document, undefined, undefined, { exportMode: 'DRAFT' }),
      exportUniversalToPdf(document, undefined, { exportMode: 'DRAFT' }),
    ]);
    const packageReader = await readDocxPackage(docx);
    const header = await packageReader.readText('word/header1.xml');

    expect(docx.subarray(0, 2).toString()).toBe('PK');
    expect(docx.byteLength).toBeGreaterThan(500);
    expect(header).toContain('BORRADOR PARA REVISIÓN DEL ABOGADO');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(pdf.toString('latin1')).toContain('BORRADOR PARA REVISIÓN DEL ABOGADO');
    expect(document.generationMetadata.aiProvider).toBe(providerBefore);
  });
});
