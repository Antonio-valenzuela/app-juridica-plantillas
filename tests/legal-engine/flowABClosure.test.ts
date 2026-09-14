import { describe, expect, it } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { buildCaseWorkflow } from '@/lib/legal-engine/caseWorkflow';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import {
  analyzeWritingRequest,
  assessWritingReadiness,
  buildWritingWorkflow,
  getDynamicIntakeFields,
} from '@/lib/legal-engine/writingIntake';

const source = createSourceDocument({
  id: 'a-12-2026',
  filename: 'demanda.txt',
  sourceValidated: true,
  pages: [{
    page: 1,
    text: [
      'ACTOR: Ana Pérez. DEMANDADO: Juan López. EXPEDIENTE: 12/2026.',
      'HECHO PRIMERO: La actora entregó el bien el 2 de enero de 2026.',
      'HECHO SEGUNDO: La demandada recibió el pago.',
      'HECHO TERCERO: Existió retraso en la entrega.',
      'HECHO CUARTO: Se realizó un requerimiento.',
      'PRESTACIONES: El cumplimiento del contrato.',
    ].join('\n'),
    chars: 400,
  }],
});

describe('Cierre contractual de Flujo A', () => {
  it('mantiene una postura canónica UNDEFINED sin resolver hechos ni inventar pruebas o alegatos', async () => {
    const workflow = buildCaseWorkflow({
      sourceDocuments: [source],
      analysis: { facts: [], missingData: [] },
      generationMode: 'automatic',
    });
    const doc = await runGenerationPipeline({
      sourceDocuments: [source],
      documentTypeLabel: 'Contestación de Demanda Civil',
      matter: 'Civil',
      jurisdiction: 'Local',
      userInstruction: 'Contestar la demanda civil.',
      workflow,
    });
    const text = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');
    const factText = doc.sections.find((section) => section.title === 'CONTESTACIÓN DE HECHOS')?.content[0]?.text || '';
    const evidenceText = doc.sections.find((section) => section.type === 'evidence')?.content[0]?.text || '';
    expect(doc.caseAnalysis?.facts).toHaveLength(4);
    expect(doc.caseAnalysis?.facts.every((fact) => fact.lawyerPosition === 'UNDEFINED')).toBe(true);
    expect(factText).not.toMatch(/SE ADMITE|SE NIEGA|SE ADMITE PARCIALMENTE|improcedente/i);
    expect(evidenceText).toContain('[REQUIERE DEFINIR PRUEBAS A OFRECER]');
    expect(evidenceText).not.toMatch(/DOCUMENTAL PÚBLICA|INSTRUMENTAL DE ACTUACIONES|PRESUNCIONAL/i);
    expect(text).not.toMatch(/\bALEGATOS\b/i);
    expect((doc as any).qualityGate.criticalErrors.map((error: { checkId: string }) => error.checkId)).not.toContain('CONTRADICTORY_POSITION');
  });

  it('no permite usar el Flujo A sin expediente fuente', async () => {
    await expect(runGenerationPipeline({
      sourceDocuments: [],
      userInstruction: 'Contestar demanda civil',
      workflow: {
        sourceDocuments: [],
        analysis: { facts: [], missingData: [] },
        selection: { mode: 'automatic' },
        flow: 'DOCUMENT_ANALYSIS',
        updatedAt: new Date().toISOString(),
      } as any,
    })).rejects.toThrow(/FLUJO_A_SOURCE_REQUIRED/);
  });

  it('respeta ADMIT, DENY, PARTIAL y NOT_KNOWN, incluida la observación del abogado', async () => {
    const facts = ['ADMIT', 'DENY', 'PARTIAL', 'NOT_KNOWN'].map((lawyerPosition, index) => ({
      id: `fact-${index + 1}`,
      number: ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO'][index],
      text: `Hecho ${index + 1}`,
      sourceFact: `Hecho ${index + 1}`,
      confidence: 1,
      lawyerPosition: lawyerPosition as 'ADMIT' | 'DENY' | 'PARTIAL' | 'NOT_KNOWN',
      lawyerObservation: index === 1 ? 'No se recibió dicho pago.' : index === 2 ? 'Existió retraso, pero la fecha indicada no corresponde.' : undefined,
    }));
    const workflow = buildCaseWorkflow({
      sourceDocuments: [source],
      analysis: { facts, missingData: [] },
      generationMode: 'automatic',
    });
    expect(workflow.analysis.facts.map((fact) => fact.lawyerPosition)).toEqual(['ADMIT', 'DENY', 'PARTIAL', 'NOT_KNOWN']);
    expect(workflow.analysis.facts.map((fact) => fact.provenance)).toEqual(['LAWYER_CONFIRMED', 'LAWYER_CONFIRMED', 'LAWYER_CONFIRMED', 'LAWYER_CONFIRMED']);
    const doc = await runGenerationPipeline({
      sourceDocuments: [source],
      documentTypeLabel: 'Contestación de Demanda Civil',
      matter: 'Civil',
      jurisdiction: 'Local',
      userInstruction: 'Contestar la demanda civil.',
      workflow,
    });
    const text = doc.sections.find((section) => section.title === 'CONTESTACIÓN DE HECHOS')?.content[0]?.text || '';
    expect(text).toContain('SE ADMITE');
    expect(text).toContain('SE NIEGA');
    expect(text).toContain('No se recibió dicho pago.');
    expect(text).toContain('SE ADMITE PARCIALMENTE');
    expect(text).toContain('Existió retraso, pero la fecha indicada no corresponde.');
    expect(text).toContain('NO SE TIENE POR CONFIRMADO');
    expect((doc as any).qualityGate.metrics.factsWithResponse).toBe(4);
  });

  it('preserva la firma manual frente a la integridad determinística de roles y deja traza del conflicto', async () => {
    const workflow = buildCaseWorkflow({
      sourceDocuments: [source],
      analysis: { facts: [], missingData: [] },
      generationMode: 'automatic',
    });
    const first = await runGenerationPipeline({
      sourceDocuments: [source],
      documentTypeLabel: 'Contestación de Demanda Civil',
      matter: 'Civil',
      jurisdiction: 'Local',
      userInstruction: 'Contestar la demanda civil.',
      workflow,
      generateSection: async ({ section }) => `Contenido generado de ${section.title}.`,
    });
    const firma = first.sections.find((section) => section.type === 'signature')!;
    const manualSignature = 'Firma manual confirmada por el abogado: Juan López.';
    firma.isManuallyEdited = true;
    firma.content[0].isManuallyEdited = true;
    firma.content[0].provenance = 'USER_EDITED';
    firma.content[0].text = manualSignature;

    const regenerated = await runGenerationPipeline({
      existingDocument: structuredClone(first),
      sourceDocuments: [source],
      userInstruction: 'Continuar la contestación.',
      targetSection: firma.id,
      generateSection: async () => 'Firma generada que no debe sustituir la edición.',
    });
    const regeneratedFirma = regenerated.sections.find((section) => section.id === firma.id)!;
    const conflictWarnings = regenerated.validation.warnings.filter((warning) => warning.checkId === 'MANUAL_EDIT_PRESERVED_ROLE_INTEGRITY');

    expect(regeneratedFirma.content[0].text).toBe(manualSignature);
    expect(regeneratedFirma.content[0].provenance).toBe('USER_EDITED');
    expect(conflictWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ sectionId: firma.id }),
    ]));
    expect(regenerated.generationMetadata.trace?.some((step) =>
      step.stage === 'role_integrity' && step.note.includes(firma.id) && step.note.includes('manual')
    )).toBe(true);
  });
});

describe('Flujo B — redacción sin documentos fuente', () => {
  it('identifica guarda y custodia, deriva intake dinámico y conserva procedencia de entrada', () => {
    const intake = analyzeWritingRequest('Quiero preparar una demanda de guarda y custodia. La madre solicita cuidado provisional del menor.');
    expect(intake.flow).toBe('NEW_WRITING');
    expect(intake.sourceDocuments).toEqual([]);
    expect(intake.matter).toBe('familiar');
    expect(intake.documentType).toBe('demanda');
    expect(intake.facts[0].provenance).toBe('LAWYER_INPUT');
    expect(getDynamicIntakeFields(intake).map((field) => field.id)).toContain('representedParty');
    expect(getDynamicIntakeFields(intake).map((field) => field.id)).toContain('counterparty');
  });

  it('bloquea una petición insuficiente y permite una redacción parcial con pendientes explícitos', () => {
    expect(assessWritingReadiness(analyzeWritingRequest('Hazme una demanda.')).status).toBe('BLOCKED');
    const partial = assessWritingReadiness(analyzeWritingRequest('Demanda de guarda y custodia para solicitar convivencia con mi hija.'));
    expect(partial.status).toBe('READY_WITH_PENDING');
    expect(partial.pending.length).toBeGreaterThan(0);
  });

  it('construye el mismo CaseWorkflow y no mezcla el texto de una referencia como hechos', () => {
    const intake = analyzeWritingRequest('Demanda de guarda y custodia. La parte actora solicita cuidado provisional.');
    const workflow = buildWritingWorkflow(intake, { mode: 'reference_document', referenceDocumentId: 'ref-style-1' });
    expect(workflow.sourceDocuments).toEqual([]);
    expect(workflow.flow).toBe('NEW_WRITING');
    expect(workflow.selection).toEqual({ mode: 'reference_document', templateId: undefined, referenceDocumentId: 'ref-style-1' });
    expect(workflow.analysis.facts.every((fact) => fact.provenance === 'LAWYER_INPUT')).toBe(true);
    expect(workflow.analysis.facts.some((fact) => /hist[oó]rico|referencia/i.test(fact.text))).toBe(false);
  });

  it('genera desde cero con el mismo pipeline sin inventar artículos, partes ni pruebas', async () => {
    const intake = analyzeWritingRequest('Demanda de guarda y custodia para solicitar cuidado provisional del menor.');
    const workflow = buildWritingWorkflow(intake);
    const doc = await runGenerationPipeline({
      sourceDocuments: [],
      userInstruction: intake.request,
      matter: 'Familiar',
      documentTypeLabel: 'Demanda Inicial',
      workflow,
    });
    const text = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');
    expect(doc.sourceDocuments).toEqual([]);
    expect(doc.flow).toBe('NEW_WRITING');
    expect(text).toContain('cuidado provisional del menor');
    expect(text).toContain('[REQUIERE DEFINIR PRUEBAS A OFRECER]');
    expect(text).not.toMatch(/art[íi]culo\s+\d+|María|Juan|Ciudad de México/i);
    expect(doc.sections.every((section) => section.generation)).toBe(true);
  });

  it('B6-B8 conserva edición manual, permite reabrir el intake serializado y bloquea exportación del DRAFT', async () => {
    const intake = analyzeWritingRequest('Demanda de guarda y custodia para solicitar convivencia con mi hija.');
    const workflow = buildWritingWorkflow(intake);
    const first = await runGenerationPipeline({ sourceDocuments: [], userInstruction: intake.request, matter: 'Familiar', documentTypeLabel: 'Demanda Inicial', workflow, generateSection: async ({ section }) => `Contenido inicial de ${section.title}.` });
    const editable = first.sections.find((section) => section.content?.length > 0)!;
    editable.isManuallyEdited = true;
    editable.content[0].isManuallyEdited = true;
    editable.content[0].text = 'Edición manual del abogado que no debe perderse.';
    const reopened = JSON.parse(JSON.stringify(first));
    expect(reopened.intake.request).toContain('guarda y custodia');
    const regenerated = await runGenerationPipeline({ existingDocument: reopened, sourceDocuments: [], userInstruction: 'Continuar borrador', targetSection: editable.id, generateSection: async () => 'Texto que no debe sustituir la edición.' });
    expect(regenerated.sections.find((section) => section.id === editable.id)?.content[0].text).toBe('Edición manual del abogado que no debe perderse.');
    expect(regenerated.sections.find((section) => section.id === editable.id)?.content[0].provenance).toBe('USER_EDITED');
    await expect(exportUniversalToDocx(regenerated)).rejects.toThrow(/LIFECYCLE_NOT_EXPORTABLE|READY_TO_EXPORT|export/i);
  });
});
