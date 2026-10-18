// FASE A (lote 2): estas pruebas FIJAN el comportamiento deseado y fallan hoy a propósito. Las marcadas «REGRESIÓN»
// ya pasan y deben seguir pasando después del cambio.
import { describe, expect, it } from 'vitest';
import { buildCaseDossier, confirmDossier, dossierSummaryText, parseCaseDossier } from '@/lib/legal-engine/caseDossier';
import { applyDossierToDocument, prepareWritingContract } from '@/lib/legal-engine/writingContractStage';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { OFFICIAL_DOCUMENT_MATRIX } from '../fixtures/documentosOficialesSinteticos';
import { expedienteApelacion } from '../fixtures/apelacionContrariaSintetica';
import { ISSUING_COURT, SOURCE_AUTHORITY, sentenciaDisenoReal } from '../fixtures/sentenciaAmparoDirectoDisenoRealSintetica';

/** Lectura de campos que aún no existen en el tipo CaseDossier (mantiene `tsc` en verde mientras la prueba está en rojo). */
const field = (value: unknown, key: string) => (value as Record<string, unknown>)[key];
const sourceOf = (id: string) => OFFICIAL_DOCUMENT_MATRIX.find((item) => item.id === id)!.source;

describe('(b) la ficha separa el órgano que dictó la resolución de la autoridad responsable citada', () => {
  it('guarda issuingCourt y sourceAuthority', () => {
    const dossier = buildCaseDossier([sentenciaDisenoReal()]);
    expect(field(dossier, 'issuingCourt')).toBe(ISSUING_COURT);
    expect(field(dossier, 'sourceAuthority')).toBe(SOURCE_AUTHORITY);
  });

  it('REGRESIÓN: court conserva el valor que usa hoy el resto del código', () => {
    expect(buildCaseDossier([sentenciaDisenoReal()]).court).toBe(SOURCE_AUTHORITY);
  });

  it('el resumen para el redactor etiqueta cada órgano por separado (solo en los tipos con presentacionPor)', () => {
    const dossier = confirmDossier(buildCaseDossier([sentenciaDisenoReal()]), { representedName: 'Persona Ficticia Ejemplo', representedSide: 'otro' });
    const summary = (dossierSummaryText as (d: unknown, options?: { documentType?: string }) => string)(dossier, { documentType: 'recurso_revision_amparo_directo' });
    expect(summary).toContain(`Órgano que dictó la resolución fuente: ${ISSUING_COURT}`);
    expect(summary).toContain(`Autoridad responsable citada: ${SOURCE_AUTHORITY}`);
  });

  it('REGRESIÓN: fuera de esa lista (p. ej. la contestación a la revisión extraordinaria) el resumen no cambia', () => {
    const dossier = confirmDossier(buildCaseDossier([sentenciaDisenoReal()]), { representedName: 'Persona Ficticia Ejemplo', representedSide: 'otro' });
    for (const documentType of [undefined, 'contestacion_revision_extraordinaria_amparo_directo', 'contestacion_demanda_civil']) {
      const summary = (dossierSummaryText as (d: unknown, options?: { documentType?: string }) => string)(dossier, documentType ? { documentType } : undefined);
      expect(summary, String(documentType)).not.toMatch(/dictó la resolución fuente|Autoridad responsable citada/);
      expect(summary, String(documentType)).toContain('- Órgano jurisdiccional: H. PLENO DEL TRIBUNAL DE ARBITRAJE');
    }
  });

  it('parseCaseDossier conserva issuingCourt, sourceAuthority y representedRole, y sigue aceptando fichas sin ellos', () => {
    const base = buildCaseDossier([sentenciaDisenoReal()]);
    const confirmed = confirmDossier(base, { representedName: 'Persona Ficticia Ejemplo', representedSide: 'otro', representedRole: 'quejoso' } as never);
    const parsed = parseCaseDossier(JSON.parse(JSON.stringify(confirmed)));
    expect(parsed && field(parsed, 'issuingCourt')).toBe(ISSUING_COURT);
    expect(parsed && field(parsed, 'sourceAuthority')).toBe(SOURCE_AUTHORITY);
    expect(parsed && field(parsed, 'representedRole')).toBe('quejoso');
    // Ficha antigua (sin los campos nuevos): sigue siendo válida.
    const legacy = JSON.parse(JSON.stringify(confirmDossier(buildCaseDossier([sourceOf('demanda-civil')]), { representedName: 'Persona Ficticia Ejemplo', representedSide: 'actor' })));
    expect(parseCaseDossier(legacy)).not.toBeNull();
  });
});

// Valores medidos con el código actual (probe de la fase A). El «court» de las demandas, contestaciones y demás
// escritos NO debe cambiar con el lote 2.
const GOLDEN_COURT: Array<[string, string]> = [
  ['demanda-civil', 'JUEZ SEGUNDO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL'],
  ['demanda-divorcio', 'JUEZ TERCERO DE LO FAMILIAR DEL PRIMER PARTIDO JUDICIAL'],
  ['demanda-laboral', 'JUEZ DEL TRIBUNAL LABORAL FICTICIO'],
  ['demanda-mercantil', 'JUEZ PRIMERO DE LO MERCANTIL'],
  ['demanda-alimentos', 'JUEZ CUARTO DE LO FAMILIAR DEL PRIMER PARTIDO JUDICIAL'],
  ['contestacion-reconvencion', 'JUEZ TERCERO DE LO FAMILIAR DEL PRIMER PARTIDO JUDICIAL'],
  ['contestacion-reconvencion-mercantil', 'JUEZ PRIMERO DE LO MERCANTIL'],
  ['sentencia-amparo-indirecto', 'JUZGADO QUINTO DE DISTRITO EN MATERIA CIVIL FICTICIO'],
];

describe('(d) REGRESIÓN: contestaciones y demandas resuelven el órgano exactamente como hoy', () => {
  it.each(GOLDEN_COURT)('«%s»: court sin cambios', (id, court) => {
    expect(buildCaseDossier([sourceOf(id)]).court).toBe(court);
  });

  it('la apelación del contrario conserva su court', () => {
    expect(buildCaseDossier([expedienteApelacion()]).court).toBe('JUZGADO QUINTO EN MATERIA CIVIL DEL PRIMER PARTIDO JUDICIAL');
  });

  it.each(GOLDEN_COURT.map(([id]) => id))('«%s»: no aparecen issuingCourt, sourceAuthority ni líneas nuevas en el resumen', (id) => {
    const dossier = buildCaseDossier([sourceOf(id)]);
    expect(field(dossier, 'issuingCourt') || '').toBe('');
    expect(field(dossier, 'sourceAuthority') || '').toBe('');
    const summary = dossierSummaryText(confirmDossier(dossier, { representedName: 'Persona Ficticia Ejemplo', representedSide: 'otro' }));
    expect(summary).not.toMatch(/dictó la resolución fuente|Autoridad responsable citada/);
  });

  it.each([
    ['contestacion_demanda_civil', 'demanda-civil', 'demandado'],
    ['demanda_ordinaria_civil', 'demanda-civil', 'actor'],
  ] as const)('«%s»: applyDossierToDocument sigue copiando court al destinatario', (documentType, sourceId, side) => {
    const source = sourceOf(sourceId);
    const dossier = confirmDossier(buildCaseDossier([source]), { representedName: 'Persona Ficticia Ejemplo', representedSide: side });
    const prepared = prepareWritingContract({ documentType, flags: { caseDossier: dossier, requireCaseDossier: true }, suppliedSources: [source] })!;
    const doc = createEmptyDocument({ documentType });
    applyDossierToDocument(doc, prepared);
    expect(doc.parties.autoridadDestinataria).toBe(dossier.court);
  });
});
