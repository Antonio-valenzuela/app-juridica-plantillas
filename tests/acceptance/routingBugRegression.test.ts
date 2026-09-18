/**
 * RED Regression Test — Routing Bug
 *
 * Demuestra que:
 *   escrito_libre + AMPARO + FEDERAL
 * NO debe resolverse como contestacion_demanda_civil / CIVIL.
 *
 * ESTADO INICIAL: Algunos de estos tests FALLAN si el bug persiste.
 * ESTADO ESPERADO: GREEN después del fix.
 */

import { describe, it, expect } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { resolveSelectedDocumentType } from '@/lib/legal-taxonomy/pipelineSelection';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { analyzeWritingRequest, buildWritingWorkflow } from '@/lib/legal-engine/writingIntake';

// -----------------------------------------------------------
// GRUPO 1: Routing a nivel de documentRouting + pipelineSelection
// -----------------------------------------------------------

describe('Routing Bug Regression — escrito_libre + amparo + federal', () => {

  // RED TEST 1: resolveDocumentRouting respeta escrito_libre
  it('resolveDocumentRouting con escrito_libre devuelve template escrito_libre', () => {
    const routing = resolveDocumentRouting({ selectedDocumentType: 'escrito_libre' });
    expect(routing.resolvedTemplate).toBe('escrito_libre');
    expect(routing.resolvedTemplate).not.toBe('contestacion_demanda_civil');
    expect(routing.fallbackUsed).toBe(false);
  });

  // RED TEST 2: resolveSelectedDocumentType conserva escrito_libre
  it('resolveSelectedDocumentType preserva escrito_libre desde taxonomy', () => {
    const resolved = resolveSelectedDocumentType(undefined, {
      documentType: 'escrito_libre',
    });
    expect(resolved).toBe('escrito_libre');
    expect(resolved).not.toBeUndefined();
  });

  // RED TEST 3: Pipeline — escrito_libre preserva documentType
  it('RED: pipeline con selectedDocumentType=escrito_libre preserva documentType=escrito_libre', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar solicitud de copias certificadas dirigida al municipio de Zapopan',
      selectedDocumentType: 'escrito_libre',
      matter: 'Amparo',
      sourceDocuments: [],
      allowUnvalidatedSource: true,
      workflow: {
        sourceDocuments: [],
        analysis: { facts: [], missingData: [] },
        selection: { mode: 'automatic' },
        updatedAt: new Date().toISOString(),
      } as any,
      taxonomy: {
        matter: 'amparo',
        jurisdiction: 'federal',
        documentType: 'escrito_libre',
      },
    });

    expect(doc.documentType).toBe('escrito_libre');
    expect(doc.documentType).not.toBe('contestacion_demanda_civil');
    expect((doc.matter || '').toLowerCase()).not.toMatch(/^civil$/);
  });

  // RED TEST 4: Pipeline — matter=Amparo preserva matter
  it('RED: pipeline con matter=Amparo no muta a Civil', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar solicitud de copias certificadas',
      selectedDocumentType: 'escrito_libre',
      matter: 'Amparo',
      sourceDocuments: [],
      allowUnvalidatedSource: true,
      workflow: {
        sourceDocuments: [],
        analysis: { facts: [], missingData: [] },
        selection: { mode: 'automatic' },
        updatedAt: new Date().toISOString(),
      } as any,
      taxonomy: {
        matter: 'amparo',
        jurisdiction: 'federal',
        documentType: 'escrito_libre',
      },
    });

    const matterLower = (doc.matter || '').toLowerCase();
    expect(matterLower).not.toMatch(/^civil$/);
    expect(matterLower).toMatch(/amparo/);
  });

  // RED TEST 7: reproduce el cambio de estado contra el pipeline real.
  it('RED: una selección NEW_WRITING no hereda contestación civil del documento anterior', async () => {
    const previousCivilDocument = createEmptyDocument({
      documentType: 'contestacion_demanda_civil',
      documentTypeLabel: 'Contestación de Demanda Civil',
      matter: 'Civil',
      jurisdiction: 'Local',
    });
    const analyzedIntake = analyzeWritingRequest('Solicitar copias certificadas al municipio de Zapopan.');
    const intake = {
      ...analyzedIntake,
      matter: 'Amparo',
      documentType: 'escrito_libre',
      documentTypeLabel: 'Escrito libre',
      jurisdiction: 'Federal',
    };
    const workflow = buildWritingWorkflow(intake);

    const doc = await runGenerationPipeline({
      userInstruction: intake.request,
      sourceDocuments: [],
      allowUnvalidatedSource: true,
      existingDocument: previousCivilDocument,
      matter: 'Amparo',
      jurisdiction: 'Federal',
      flow: 'NEW_WRITING',
      workflow,
      traceOptions: { enabled: true },
    });

    expect(doc.documentType).toBe('escrito_libre');
    expect(doc.documentType).not.toBe('contestacion_demanda_civil');
    expect(doc.matter).toBe('Amparo');
    expect(doc.jurisdiction).toBe('Federal');
    expect(doc.sections.map((section) => section.title).join(' ')).not.toMatch(/contestaci[oó]n|excepciones|prestaciones/i);
    expect((doc.generationMetadata as any).auditTrace).toMatchObject({
      requestedDocumentType: 'escrito_libre',
      resolvedDocumentType: 'escrito_libre',
      requestedMatter: 'Amparo',
      resolvedMatter: 'Amparo',
      requestedJurisdiction: 'Federal',
      resolvedJurisdiction: 'Federal',
      documentTypeResolutionSource: 'NEW_WRITING_INTAKE',
    });
  });

  // RED TEST 6: Sin expediente ni demanda, no se generan secciones de contestacion
  it('RED: escrito_libre sin fuente demanda no genera secciones de contestacion de hechos', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Solicitud de copias certificadas al municipio de Zapopan',
      selectedDocumentType: 'escrito_libre',
      matter: 'Amparo',
      sourceDocuments: [],
      allowUnvalidatedSource: true,
      workflow: {
        sourceDocuments: [],
        analysis: { facts: [], missingData: [] },
        selection: { mode: 'automatic' },
        updatedAt: new Date().toISOString(),
      } as any,
      taxonomy: {
        matter: 'amparo',
        jurisdiction: 'federal',
        documentType: 'escrito_libre',
      },
    });

    const sectionTitles = doc.sections.map((s) => s.title.toLowerCase());
    expect(sectionTitles.some((t) => t.includes('contestaci'))).toBe(false);
    expect(sectionTitles.some((t) => t.includes('prestaciones'))).toBe(false);
    expect(sectionTitles.some((t) => t.includes('excepciones'))).toBe(false);
  });

  // RED TEST 8: Trace — requested/resolved routing must be observable in the existing trace.
  it('RED: trace completo — conserva requested/resolved type, matter, jurisdiction y fuente de resolución', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Solicitud de copias certificadas',
      selectedDocumentType: 'escrito_libre',
      matter: 'Amparo',
      sourceDocuments: [],
      allowUnvalidatedSource: true,
      workflow: {
        sourceDocuments: [],
        analysis: { facts: [], missingData: [] },
        selection: { mode: 'automatic' },
        updatedAt: new Date().toISOString(),
      } as any,
      taxonomy: {
        matter: 'amparo',
        jurisdiction: 'federal',
        documentType: 'escrito_libre',
      },
      traceOptions: { enabled: true },
    });

    const trace = (doc.generationMetadata as any).auditTrace;
    console.log('[ROUTING_TRACE]', JSON.stringify(trace, null, 2));

    expect(doc.documentType).toBe('escrito_libre');
    expect((doc.matter || '').toLowerCase()).toMatch(/amparo/);
    expect(trace.requestedDocumentType).toBe('escrito_libre');
    expect(trace.resolvedDocumentType).toBe('escrito_libre');
    expect(trace.requestedMatter).toBe('Amparo');
    expect(trace.resolvedMatter).toBe('Amparo');
    expect(trace.requestedJurisdiction).toBe('Federal');
    expect(trace.resolvedJurisdiction).toBe('Federal');
    expect(trace.documentTypeResolutionSource).toBe('EXPLICIT_UI');
    expect(trace.matterResolutionSource).toBe('EXPLICIT_TAXONOMY');
    expect(trace.jurisdictionResolutionSource).toBe('EXPLICIT_TAXONOMY');

    // Sin fuente de demanda, NO se sintetizan partes inventadas
    const fullText = doc.sections.flatMap((s) => s.content).map((b) => b.text).join('');
    expect(fullText).not.toMatch(/YAHIR ANTONIO VALENZUELA/i);
    expect(fullText).not.toMatch(/parte demandada.*comparece para contestar/i);
  });
});
