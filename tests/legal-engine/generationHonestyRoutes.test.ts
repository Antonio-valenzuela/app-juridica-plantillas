/**
 * Fase 2 · Parte 3 — rutas de generación revisadas:
 *  - los trámites no reciben los hechos del litigio;
 *  - la contestación responde cada hecho/prestación con postura pendiente explícita;
 *  - ninguna materia hereda el vocabulario normativo de otra.
 */
import { describe, expect, it } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { resolveWritingType } from '@/lib/catalog/writingTypeIdentity';
import { DEMANDA_CIVIL_ARRENDAMIENTO, sourceFromText } from '../helpers/syntheticCaseDocuments';

const SENTINEL_1 = 'HECHO-SENTINELA-UNO consta en la demanda';
const SENTINEL_2 = 'HECHO-SENTINELA-DOS consta en la demanda';

const analysisWithFacts = () => ({
  parties: { actor: 'ACTOR SINTETICO', demandado: 'DEMANDADO SINTETICO' }, authorities: ['AUTORIDAD'], caseNumbers: { principal: 'EXP-1/2026' },
  proceduralTimeline: [], challengedActs: [], claims: ['Pretensión A'], claimResponses: [], arguments: [],
  evidence: [],
  facts: [
    { id: 'f-1', number: '1', text: `${SENTINEL_1}.`, confidence: 1 },
    { id: 'f-2', number: '2', text: `${SENTINEL_2}.`, confidence: 1 },
  ],
}) as never;

async function generateWithFacts(documentType: string, matter: string) {
  const identity = resolveWritingType(documentType);
  const declared = identity.compatibleSources.acceptedSourceTypes[0] || (identity.compatibleSources.optionalSourceTypes || [])[0] || 'SENTENCIA_O_RESOLUCION';
  return runGenerationPipeline({
    selectedDocumentType: documentType, documentTypeLabel: identity.label, matter, jurisdiction: 'Jalisco',
    userInstruction: `Promover ${documentType}.`,
    sourceDocuments: [createSourceDocument({
      id: 'src', filename: 'f.txt', content: `DEMANDA. HECHOS 1. ${SENTINEL_1} 2. ${SENTINEL_2}`, sourceValidated: true,
      classification: { sourceDocumentType: declared, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
    } as never)],
    caseAnalysis: analysisWithFacts(),
    workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
  } as never) as Promise<any>;
}

const bodyOf = (doc: any) => doc.sections.flatMap((section: any) => (section.content || []).map((block: any) => block.text || '')).join('\n');

describe('hechos: no se insertan en trámites donde no proceden', () => {
  for (const type of ['promocion_simple', 'manifestaciones', 'solicitud_copias', 'autorizacion_abogados', 'impulso_procesal', 'desistimiento']) {
    it(`${type} no vuelca los hechos numerados de la demanda`, async () => {
      const text = bodyOf(await generateWithFacts(type, 'Civil'));
      expect(text).not.toContain('HECHO-SENTINELA');
    }, 60000);
  }

  it('los escritos sustantivos sí conservan los hechos aportados', async () => {
    const text = bodyOf(await generateWithFacts('contestacion_demanda_civil', 'Civil'));
    expect(text).toContain('HECHO-SENTINELA-UNO');
    expect(text).toContain('HECHO-SENTINELA-DOS');
  }, 60000);
});

describe('contestación: cada hecho y prestación se responde individualmente', () => {
  it('lista cada hecho con postura pendiente explícita, sin numeración duplicada ni puntos dobles', async () => {
    const source = sourceFromText(DEMANDA_CIVIL_ARRENDAMIENTO, 'demanda-civil');
    (source as any).classification = { role: 'PRIMARY', sourceDocumentType: 'DEMANDA_CIVIL' };
    const doc = await runGenerationPipeline({
      selectedDocumentType: 'contestacion_demanda_civil', documentTypeLabel: 'Contestación de demanda civil', matter: 'Civil', jurisdiction: 'Jalisco',
      userInstruction: 'Contestar la demanda.', sourceDocuments: [source],
      workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
    } as never) as any;
    const hechos = doc.sections.find((section: any) => /CONTESTACIÓN DE HECHOS/i.test(section.title));
    const prestaciones = doc.sections.find((section: any) => /CONTESTACIÓN DE PRESTACIONES/i.test(section.title));
    const hechosText = (hechos.content || []).map((block: any) => block.text).join('\n');
    const prestacionesText = (prestaciones.content || []).map((block: any) => block.text).join('\n');

    for (const number of [1, 2, 3]) expect(hechosText, `hecho ${number}`).toMatch(new RegExp(`AL HECHO ${number}\\b`));
    expect((hechosText.match(/POSTURA PROCESAL: \[REQUIERE DEFINIR POSTURA DEL ABOGADO\]/g) || []).length).toBeGreaterThanOrEqual(3);
    // Nunca se inventa una respuesta: no se afirma ni se niega nada sin instrucción del abogado.
    expect(hechosText).not.toMatch(/se niega categ[oó]ricamente|es cierto|se admite\b/i);
    // Limpieza de la numeración original y de los puntos finales duplicados.
    expect(hechosText).not.toMatch(/AL HECHO (\d+)\.- \1\. /);
    expect(hechosText).not.toMatch(/\.\. /);
    expect(prestacionesText).toMatch(/PRESTACI[ÓO]N 1\./);
    expect(prestacionesText).toMatch(/\[REQUIERE (?:DEFINIR POSTURA|INSTRUCCI[ÓO]N) DEL ABOGADO/);
  }, 120000);
});

describe('materia: ninguna estructura hereda la normativa de otra', () => {
  const CIVIL = /c[oó]digo\s+civil|c[oó]digo\s+de\s+procedimientos\s+civiles|juicio\s+ordinario\s+civil/i;
  const COMERCIO = /c[oó]digo\s+de\s+comercio/i;
  const TRABAJO = /ley\s+federal\s+del\s+trabajo/i;

  it('laboral no cita normativa civil ni mercantil', async () => {
    const text = bodyOf(await generateWithFacts('contestacion_demanda_laboral', 'Laboral'));
    expect(text).not.toMatch(CIVIL);
    expect(text).not.toMatch(COMERCIO);
  }, 60000);

  it('mercantil no cita normativa civil ni laboral', async () => {
    const text = bodyOf(await generateWithFacts('contestacion_demanda_mercantil', 'Mercantil'));
    expect(text).not.toMatch(CIVIL);
    expect(text).not.toMatch(TRABAJO);
  }, 60000);

  it('apelación familiar y recurso de revisión en amparo no mezclan normativa laboral/mercantil', async () => {
    for (const [type, matter] of [['apelacion_familiar', 'Familiar'], ['recurso_revision_amparo', 'Amparo']] as const) {
      const text = bodyOf(await generateWithFacts(type, matter));
      expect(text, type).not.toMatch(TRABAJO);
      expect(text, type).not.toMatch(COMERCIO);
    }
  }, 60000);

  it('las contestaciones de materias distintas tienen secciones propias de su materia', async () => {
    const titles = async (type: string, matter: string) => (await generateWithFacts(type, matter)).sections.map((section: any) => String(section.title));
    const laboral = await titles('contestacion_demanda_laboral', 'Laboral');
    const civil = await titles('contestacion_demanda_civil', 'Civil');
    expect(laboral.join('|')).not.toMatch(/OBJECI[ÓO]N DE PRUEBAS DE LA PARTE ACTORA/);
    expect(civil.join('|')).toMatch(/OBJECI[ÓO]N DE PRUEBAS DE LA PARTE ACTORA/);
  }, 60000);
});
