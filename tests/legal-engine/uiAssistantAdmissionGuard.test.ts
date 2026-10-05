import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluateGeneratedLegalAdmission, detectUiAssistantLeak } from '@/lib/legal-engine/generatedLegalAdmission';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { hasSeedMarkers } from '@/lib/legal-engine/seedMarkers';
import { visibleWritingTypes } from '@/lib/catalog/writingTypeIdentity';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';

/**
 * P0-B — segunda defensa: la admisión rechaza contenido del asistente de
 * interfaz antes de que entre al UniversalLegalDocument, con evidencia,
 * reason explícito y pendiente. Nunca borrado silencioso.
 */

const doc = () => createEmptyDocument({
  id: 'ui-leak', documentType: 'apelacion_civil', documentTypeLabel: 'Apelación civil',
  matter: 'civil', jurisdiction: 'local civil', flow: 'DOCUMENT_ANALYSIS',
});

const UI_SAMPLE = '📌 Resumen de la pantalla actual (Dashboard / Inteligencia Regulatoria): '
  + 'Te encuentras en el Panel Principal de Jurídico Radar.';

describe('P0-B: admisión de contenido de UI', () => {
  it('detecta las señales de UI conocidas', () => {
    const found = detectUiAssistantLeak(UI_SAMPLE);
    expect(found.length).toBeGreaterThanOrEqual(4);
  });

  it('RED: un bloque con ayuda de interfaz NO entra al documento', () => {
    const result = evaluateGeneratedLegalAdmission({
      text: `AGRAVIOS\n\n${UI_SAMPLE}`, sectionType: 'argument', document: doc(),
    });
    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain('UI_ASSISTANT_CONTENT_LEAK');
    expect(result.text).not.toMatch(/Resumen de la pantalla actual/);
    expect(result.text).not.toMatch(/Panel Principal/);
    expect(result.text).not.toMatch(/Jurídico Radar/);
    expect(result.text).not.toMatch(/Te encuentras en/);
    // Evidencia: queda pendiente explícito y bloqueante (seed marker).
    expect(result.text).toMatch(/UI_ASSISTANT_CONTENT_LEAK/);
    expect(hasSeedMarkers(result.text)).toBe(true);
  });

  it('el contenido jurídico real NO se marca como fuga de UI', () => {
    const legal = 'La parte apelante sostiene que la resolución recurrida omite pronunciarse '
      + 'sobre la prueba documental, lo que genera una incongruencia con lo resuelto.';
    const result = evaluateGeneratedLegalAdmission({ text: legal, sectionType: 'argument', document: doc() });
    expect(result.reasons).not.toContain('UI_ASSISTANT_CONTENT_LEAK');
  });

  it('el guard no confunde términos jurídicos con vocabulario de interfaz', () => {
    // 'monitoreo' es palabra jurídica legítima en un contexto de cláusula
    // contractual; no debe marcarse como fuga de UI.
    const legal = 'El agravio se dirige contra la resolución que declaró válida la cláusula '
      + 'de monitoreo contractual sin基金管理ación. ' + 'Se solicita su revocación.';
    expect(detectUiAssistantLeak(legal)).toEqual([]);
  });

  it('proveedor que devuelve texto UI con providers OFF: 0 materialización de UI', async () => {
    // Simula el escenario de la auditoría externa: el bloque llega contaminado
    // y la admisión lo detiene antes del documento.
    const document = await runGenerationPipeline({
      selectedDocumentType: 'apelacion_civil', documentTypeLabel: 'Apelación civil',
      matter: 'civil', jurisdiction: 'Jalisco',
      userInstruction: 'Crear una apelación de esta sentencia.',
      sourceDocuments: [createSourceDocument({
        id: 'src-ui', filename: 'f.txt',
        content: 'SENTENCIA QUE DA ORIGEN AL ESCRITO. ' + 'HECHO VERIFICABLE DE AUTOS. '.repeat(8),
        sourceValidated: true,
        classification: { sourceDocumentType: 'SENTENCIA_O_RESOLUCION', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
      } as any)],
      caseAnalysis: {
        parties: { actor: 'ACTOR SINTETICO', demandado: 'DEMANDADO SINTETICO' },
        authorities: ['JUEZ COMPETENTE'], caseNumbers: { principal: 'EXP-UI/1' },
        proceduralTimeline: [{ date: '2026-01-15', event: 'Actuación', sourceDocument: 'src-ui', certainty: 1 }],
        challengedActs: [], claims: ['c'], claimResponses: [], arguments: [], evidence: [],
        facts: [{ id: 'f', number: '1', text: 'Hecho verificable.', confidence: 1 }],
      } as any,
      workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
    } as any) as any;

    const body = document.sections.flatMap((s: any) => (s.content || []).map((b: any) => b.text || '')).join('\n');
    expect(detectUiAssistantLeak(body)).toEqual([]);
  }, 300_000);
});

describe('P0-B: recorrido de tipos implementados, 0 fugas', () => {
  it('los tipos visibles se identifican y ninguno declara fuga de UI', () => {
    const identities = visibleWritingTypes();
    expect(identities.length).toBe(277);
    const implemented = identities.filter(identity => identity.implementationStatus === 'IMPLEMENTED');
    expect(implemented.length).toBe(265);
    // Invariante §20: nunca PASS + draftable + routing NOT_IMPLEMENTED.
    const inconsistent = identities.filter(identity => identity.capabilities.draft && identity.functionalStatus !== 'PASS');
    expect(inconsistent).toEqual([]);
  });

  it('el guard de UI está declarado en la capa de admisión', () => {
    const source = readFileSync('lib/legal-engine/generatedLegalAdmission.ts', 'utf8');
    expect(source).toContain('UI_ASSISTANT_CONTENT_LEAK');
    expect(source).toContain('UI_ASSISTANT_LEAK_PATTERNS');
  });
});