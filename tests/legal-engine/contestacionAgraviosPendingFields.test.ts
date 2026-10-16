import { describe, expect, it } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { buildCaseDossier, confirmDossier } from '@/lib/legal-engine/caseDossier';
import { emptyReviewAnnex, separateReviewMaterialFromText } from '@/lib/legal-engine/reviewAnnex';
import { hasUnresolvedFieldMarkers } from '@/lib/legal-engine/pendingFields';
import { evaluateFactsCriterion } from '@/lib/legal-engine/factsPolicy';
import { expedienteApelacion } from '../fixtures/apelacionContrariaSintetica';
import { visibleWritingTypes } from '@/lib/catalog/writingTypeIdentity';
import { factsPolicyFor } from '@/lib/legal-engine/factsPolicy';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { syntheticSourceBody } from '../helpers/evidenceFixture';

/**
 * Regresión: un dato que falta (nombre, fecha, órgano) NO se inventa ni se retira del cuerpo dejando una frase rota
 * («, en su carácter de parte apelada…», «ocurrida el .»). Queda un marcador [PENDIENTE: …] delimitado, en la
 * misma frase que lo necesita, y el anexo no lo declara retirado. Fixtures sintéticos, sin red ni proveedores.
 */
const APELADA = 'CONSTRUCTORA LOS OLIVOS FICTICIA, S.A. DE C.V.';
const workflow = () => ({ flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() });
const body = (doc: any) => doc.sections.flatMap((section: any) => (section.content || []).map((block: any) => block.text || '')).join('\n');
const section = (doc: any, title: RegExp) => doc.sections.find((item: any) => title.test(item.title)).content.map((block: any) => block.text).join('\n');

async function generate(dossier?: unknown) {
  return runGenerationPipeline({
    selectedDocumentType: 'contestacion_agravios', documentTypeLabel: 'Contestación de agravios (parte apelada)', matter: 'Civil', jurisdiction: 'Jalisco',
    userInstruction: 'Contestar los agravios del apelante.', sourceDocuments: [expedienteApelacion()], workflow: workflow(),
    separateReviewAnnex: true, ...(dossier ? { caseDossier: dossier, requireCaseDossier: true } : {}),
  } as never) as Promise<any>;
}

const BROKEN_FRAGMENTS = [/^\s*,\s*en su carácter/m, /ocurrida el \s*\./, /\bel\s*\./, /,\s*,/, /\(\s*\)/];

describe('separación del anexo: un marcador dentro de una frase no la rompe', () => {
  const run = (text: string, sectionType = 'body') => {
    const annex = emptyReviewAnnex();
    const result = separateReviewMaterialFromText(text, annex, { sectionTitles: ['PROEMIO'], sectionType, sectionTitle: 'PROEMIO' });
    return { text: result.text, annex };
  };

  it('conserva el marcador de campo incrustado (formas DATO PENDIENTE y PENDIENTE) y no lo duplica en el anexo', () => {
    const canonical = run('[PENDIENTE: nombre de la parte apelada], en su carácter de parte apelada, comparece.');
    expect(canonical.text).toBe('[PENDIENTE: nombre de la parte apelada], en su carácter de parte apelada, comparece.');
    expect(canonical.annex.pendingItems).toEqual([]);
    const { text, annex } = run('[DATO PENDIENTE: nombre de la parte apelada], en su carácter de parte apelada, comparece a contestar los agravios.');
    expect(text).toBe('[DATO PENDIENTE: nombre de la parte apelada], en su carácter de parte apelada, comparece a contestar los agravios.');
    expect(annex.pendingItems).toEqual([]);
  });

  it('conserva un marcador de fecha en mitad de la oración', () => {
    const { text } = run('La contestación se presenta en plazo, ocurrida la notificación el [DATO PENDIENTE: fecha de notificación del traslado].');
    expect(text).toContain('[DATO PENDIENTE: fecha de notificación del traslado]');
    for (const broken of BROKEN_FRAGMENTS) expect(text).not.toMatch(broken);
  });

  it('un marcador de petición al abogado incrustado también se conserva; uno que ocupa toda la oración se lista y se retira', () => {
    const embedded = run('El apelante sostiene que [REQUIERE POSTURA DEL ABOGADO] respecto del pago.');
    expect(embedded.text).toContain('[REQUIERE POSTURA DEL ABOGADO]');
    expect(embedded.annex.pendingItems).toEqual([]);
    const alone = run('El agravio carece de sustento. [REQUIERE POSTURA DEL ABOGADO].');
    expect(alone.text).toBe('El agravio carece de sustento.');
    expect(alone.annex.pendingItems.map((item) => item.text)).toEqual(['REQUIERE POSTURA DEL ABOGADO']);
  });
});

describe('contestación de agravios: datos completos, incompletos y ausentes', () => {
  it('completos: ninguna frase rota ni marcador de nombre/expediente en el proemio', async () => {
    const source = expedienteApelacion();
    const dossier = confirmDossier(buildCaseDossier([source]), { representedName: APELADA, representedSide: 'demandado' });
    const doc = await generate(dossier);
    const proemio = section(doc, /^PROEMIO/);
    expect(proemio).toContain(`${APELADA}, en su carácter de parte apelada`);
    expect(proemio).not.toMatch(/\[DATO PENDIENTE: nombre de la parte apelada\]/);
    for (const broken of BROKEN_FRAGMENTS) expect(body(doc)).not.toMatch(broken);
  }, 120_000);

  it('incompletos: sin la fecha de notificación, el pendiente queda en la frase de oportunidad y no hay huecos', async () => {
    const source = expedienteApelacion();
    const dossier = confirmDossier(buildCaseDossier([source]), { representedName: APELADA, representedSide: 'demandado' });
    const doc = await generate({ ...dossier, notifications: [] });
    const text = body(doc);
    for (const broken of BROKEN_FRAGMENTS) expect(text).not.toMatch(broken);
    expect(section(doc, /^OPORTUNIDAD/)).toMatch(/ocurrida el \[PENDIENTE: fecha de notificación del traslado de los agravios\]\./);
  }, 120_000);

  it('ausentes: sin ficha el nombre no se inventa, queda delimitado en la misma frase y cumple el criterio de partes', async () => {
    const doc = await generate();
    const text = body(doc);
    const proemio = section(doc, /^PROEMIO/);
    expect(proemio).toMatch(/^\[PENDIENTE: nombre de la parte apelada\], en su carácter de parte apelada/);
    for (const broken of BROKEN_FRAGMENTS) expect(text).not.toMatch(broken);
    // Cuerpo y anexo coherentes: los campos pendientes están en el cuerpo (y bloquean FINAL), no en el anexo.
    expect(hasUnresolvedFieldMarkers(text)).toBe(true);
    const annexed = (doc.generationMetadata.reviewAnnex?.pendingItems || []).map((item: { text: string }) => item.text).join(' ');
    expect(annexed).not.toMatch(/nombre de la parte apelada|fecha de notificación del traslado/i);
    // Criterio de la evidencia técnica (mismo que writingTypeEvidence): marcador de parte delimitado en el cuerpo.
    expect(evaluateFactsCriterion({
      policy: 'PROCEDURAL_CONTEXT', body: text, factTokens: [], expedienteToken: '5521/2024', partyTokens: ['ACTOR SINTETICO'],
    })).not.toContain('PARTY_CONTEXT_MISSING');
  }, 120_000);
});

describe('contestación de agravios: criterio de la evidencia técnica (sin tocar el snapshot)', () => {
  // Misma combinación y mismo criterio que tests/catalog/writingTypeEvidence.test.ts para este tipo; no escribe el snapshot.
  it('con el insumo de la evidencia (sin ficha) el cuerpo cumple el criterio de su clase', async () => {
    const identity = visibleWritingTypes().find((entry) => entry.id === 'contestacion_agravios')!;
    const sourceType = identity.compatibleSources.acceptedSourceTypes[0] || 'SENTENCIA_O_RESOLUCION';
    const source = createSourceDocument({
      id: 'src-evidence', filename: 'fuente.txt',
      content: `${syntheticSourceBody(sourceType)}FUENTE_SINTETICA_A. ` + 'CONTENIDO VERIFICABLE DE AUTOS. '.repeat(8),
      sourceValidated: true, classification: { sourceDocumentType: sourceType, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
    } as never);
    const doc: any = await runGenerationPipeline({
      selectedDocumentType: identity.id, documentTypeLabel: identity.label, matter: 'CIVIL', jurisdiction: 'Jalisco',
      userInstruction: 'Promover contestación de agravios con los hechos del expediente.', sourceDocuments: [source],
      caseAnalysis: { parties: { actor: 'ACTOR SINTETICO', demandado: 'DEMANDADO SINTETICO' }, authorities: ['AUTORIDAD COMPETENTE SINTETICA'], caseNumbers: { principal: 'EXP-EVID-2026/001' },
        proceduralTimeline: [{ date: '2026-01-15', event: 'Actuación previa ACTUACION_SINTETICA_1', sourceDocument: 'src-evidence', certainty: 1 }], challengedActs: [], claims: [], claimResponses: [], arguments: [], evidence: [],
        facts: [{ id: 'f-1', number: '1', text: 'HECHO_SINTETICO_1: hecho verificable.', confidence: 1 }] },
      workflow: workflow(),
    } as never);
    const text = body(doc);
    for (const broken of BROKEN_FRAGMENTS) expect(text).not.toMatch(broken);
    const decision = factsPolicyFor(identity);
    expect(evaluateFactsCriterion({
      policy: decision.policy, body: text, factTokens: ['HECHO_SINTETICO_1', 'HECHO_SINTETICO_2'], expedienteToken: 'EXP-EVID-2026/001',
      partyTokens: ['ACTOR SINTETICO', 'DEMANDADO SINTETICO'], timelineTokens: ['ACTUACION_SINTETICA_1', 'ACTUACION_SINTETICA_2'],
    })).toEqual([]);
  }, 120_000);
});
