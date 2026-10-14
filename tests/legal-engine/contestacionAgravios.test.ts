import { describe, expect, it } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { buildCaseDossier, confirmDossier } from '@/lib/legal-engine/caseDossier';
import { formatReviewAnnex } from '@/lib/legal-engine/reviewAnnex';
import { countInlineMarkers, validateWritingContract } from '@/lib/legal-engine/writingContractValidator';
import { getWritingContract } from '@/lib/legal-engine/writingContract';
import { expedienteApelacion, soloSentenciaApelada } from '../fixtures/apelacionContrariaSintetica';

/**
 * Contestación de agravios (parte apelada) con un expediente SINTÉTICO de segunda instancia y redactores
 * simulados (sin red ni proveedores). Quien contesta es la parte demandada, apelada.
 */
const APELADA = 'CONSTRUCTORA LOS OLIVOS FICTICIA, S.A. DE C.V.';
const workflow = () => ({ flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() });

function confirmedDossier(source = expedienteApelacion()) {
  return confirmDossier(buildCaseDossier([source]), { representedName: APELADA, representedSide: 'demandado' });
}

async function generate(options: Record<string, unknown> = {}, source = expedienteApelacion(), dossier = confirmedDossier(source)) {
  return runGenerationPipeline({
    selectedDocumentType: 'contestacion_agravios', documentTypeLabel: 'Contestación de agravios (parte apelada)', matter: 'Civil', jurisdiction: 'Jalisco',
    userInstruction: 'Contestar los agravios del apelante.', sourceDocuments: [source], workflow: workflow(),
    caseDossier: dossier, requireCaseDossier: true, separateReviewAnnex: true, ...options,
  } as never) as Promise<any>;
}

const body = (doc: any) => doc.sections.flatMap((section: any) => (section.content || []).map((block: any) => block.text || '')).join('\n');
const titles = (doc: any) => doc.sections.map((section: any) => section.title);

describe('contestación de agravios: contrato y ficha', () => {
  it('estructura fija y en orden, un bloque por agravio, con datos solo de la ficha', async () => {
    const doc = await generate();
    expect(doc.documentType).toBe('contestacion_agravios');
    expect(titles(doc)).toEqual([
      'RUBRO Y DESTINATARIO', 'PROEMIO', 'OPORTUNIDAD', 'SÍNTESIS DE LA SENTENCIA APELADA',
      'CONTESTACIÓN AL AGRAVIO PRIMERO', 'CONTESTACIÓN AL AGRAVIO SEGUNDO', 'CONTESTACIÓN AL AGRAVIO TERCERO',
      'CONSTANCIAS INVOCADAS', 'PUNTOS PETITORIOS', 'LUGAR Y FECHA', 'FIRMA',
    ]);
    const text = body(doc);
    // Órgano, expediente, partes y lugar de la ficha; la parte apelada firma, no el apelante.
    expect(text).toMatch(/JUZGADO QUINTO EN MATERIA CIVIL DEL PRIMER PARTIDO JUDICIAL/);
    expect(text).toMatch(/EXPEDIENTE: 5521\/2024/);
    expect(text).toContain(`${APELADA}, en su carácter de parte apelada`);
    expect(text).toMatch(/agravios que hizo valer LAURA MENDOZA FICTICIA/);
    const signature = doc.sections.find((section: any) => section.type === 'signature');
    expect(signature.content[0].text).toContain(APELADA);
    expect(signature.content[0].text).toMatch(/Parte apelada/);
    expect(signature.content[0].text).not.toMatch(/LAURA MENDOZA|actora/i);
    // Lugar de la ficha; fecha en blanco solo en el cierre, nunca en la narrativa.
    const closing = doc.sections.find((section: any) => section.type === 'closing').content[0].text;
    expect(closing).toMatch(/Zapopan, Jalisco, a _+ de _+ de _+\./);
    const narrative = doc.sections.filter((section: any) => !['closing', 'signature'].includes(section.type)).flatMap((section: any) => section.content.map((block: any) => block.text)).join('\n');
    expect(narrative).not.toMatch(/Ciudad de México/);
    const dates = [...narrative.matchAll(/\b\d{1,2}\s+de\s+\p{L}+\s+de\s+\d{4}\b/giu)].map((match) => match[0].toLowerCase());
    for (const date of dates) expect(['24 de agosto de 2026', '25 de agosto de 2026'], date).toContain(date);
  }, 120_000);

  it('cada agravio se contesta aparte y la solicitud final es confirmar la sentencia', async () => {
    const doc = await generate();
    for (const ordinal of ['PRIMERO', 'SEGUNDO', 'TERCERO']) expect(titles(doc)).toContain(`CONTESTACIÓN AL AGRAVIO ${ordinal}`);
    const first = doc.sections.find((section: any) => section.title === 'CONTESTACIÓN AL AGRAVIO PRIMERO').content[0].text;
    expect(first).toMatch(/recibo de liquidación/);
    const petitions = doc.sections.find((section: any) => section.type === 'petition').content[0].text;
    expect(petitions).toMatch(/Confirmar la sentencia apelada/);
    expect(petitions).not.toMatch(/revoc|interpon/i);
  }, 120_000);

  it('sin redactor no hay encabezados repetidos, meta-texto ni marcadores de verificación en el cuerpo', async () => {
    const doc = await generate();
    const contract = getWritingContract('contestacion_agravios');
    const findings = validateWritingContract(doc, { contract, dossier: confirmedDossier(), sourceText: body(doc) });
    expect(findings.filter((finding) => finding.severity === 'ERROR').map((finding) => finding.code)).toEqual([]);
    expect(body(doc)).not.toMatch(/NO VERIFICADO|PENDIENTE DE DESARROLLO|podr[ií]a argumentarse/i);
    expect(countInlineMarkers(body(doc))).toBeLessThanOrEqual(contract.maxInlineMarkers);
  }, 120_000);

  it('sin la apelación del contrario el sistema la pide y no genera ni inventa agravios', async () => {
    const only = soloSentenciaApelada();
    const dossier = confirmDossier(buildCaseDossier([only]), { representedName: APELADA, representedSide: 'demandado' });
    await expect(generate({}, only, dossier)).rejects.toMatchObject({ code: 'REQUIRED_SOURCE_MISSING' });
    await expect(generate({}, only, dossier)).rejects.toThrow(/apelación \(escrito de agravios\)/);
  }, 120_000);

  it('sin ficha confirmada, o sin elegir a quién se representa, no se redacta', async () => {
    const source = expedienteApelacion();
    const unconfirmed = buildCaseDossier([source]);
    await expect(generate({}, source, unconfirmed)).rejects.toMatchObject({ code: 'CASE_DOSSIER_REQUIRED' });
    await expect(generate({}, source, { ...unconfirmed, confirmed: true })).rejects.toThrow(/a quién representas/);
  }, 120_000);

  it('representar al apelante como parte apelada se rechaza (el rol sale del expediente, no del abogado)', async () => {
    const source = expedienteApelacion();
    const wrong = confirmDossier(buildCaseDossier([source]), { representedName: 'LAURA MENDOZA FICTICIA', representedSide: 'actor' });
    await expect(generate({}, source, wrong)).rejects.toMatchObject({ code: 'CASE_DOSSIER_REQUIRED' });
  }, 120_000);

  it('una ficha hecha sobre otro documento no sirve', async () => {
    const stale = confirmedDossier(soloSentenciaApelada());
    await expect(generate({}, expedienteApelacion(), stale)).rejects.toMatchObject({ code: 'CASE_DOSSIER_REQUIRED' });
  }, 120_000);
});

/* ── redactores simulados que se portan mal ───────────────────────────────── */

const HOSTILE_AGRAVIO = [
  'CONTESTACIÓN AL AGRAVIO PRIMERO',
  'El agravio es infundado porque la sentencia sí valoró el recibo de liquidación que obra en autos.',
  'Podría argumentarse que la parte actora aprovechará una laguna probatoria. La presente ampliación se centra en delimitar la controversia.',
  'Además, la tesis invocada con [NO VERIFICADO: registro digital 180728] no basta para acreditar lo contrario.',
  'De acuerdo con el artículo 2847 del Código Civil del Estado de Jalisco, las solemnidades son íntegras.',
  'PUNTOS PETITORIOS',
  'PRIMERO. Se confirme.',
  'FIRMA',
  'Abogado postulante de la parte actora.',
  'En la Ciudad de México, a veinte de octubre de dos mil veintiséis, los suscritos comparecimos ante el Consejo Judicial del Estado de Jalisco.',
].join('\n');

const CLEAN_AGRAVIO = 'El agravio es infundado: la sentencia valoró el recibo de liquidación exhibido por la demandada y el apelante no combate esa valoración.';
const OPPOSITE = 'Interponemos el presente recurso de apelación para que se revoque la sentencia, pues la sentencia incurre en error.';

describe('contestación de agravios: el redactor se porta mal', () => {
  it('limpia el cuerpo, manda lo retirado al anexo y no deja citas ni fechas inventadas', async () => {
    const doc = await generate({ generateSection: async ({ section }: any) => (/AGRAVIO/.test(section.title) ? HOSTILE_AGRAVIO : section.content?.[0]?.text || '') });
    const first = doc.sections.find((section: any) => section.title === 'CONTESTACIÓN AL AGRAVIO PRIMERO').content[0].text;
    expect(first).toContain('El agravio es infundado porque la sentencia sí valoró el recibo');
    expect(first).not.toMatch(/Podría argumentarse|presente ampliación|NO VERIFICADO|2847|Ciudad de México|Abogado postulante|PUNTOS PETITORIOS|FIRMA|Consejo Judicial/);
    const annex = doc.generationMetadata.reviewAnnex;
    expect(annex.notes.length).toBeGreaterThanOrEqual(2);
    expect(annex.unverifiedCitations.map((item: any) => item.citation).join(' ')).toMatch(/180728|2847/);
    expect(annex.removedStructure.length).toBeGreaterThanOrEqual(2);
    expect(formatReviewAnnex(annex)).toMatch(/No forma parte del escrito/);
    // Fail-closed: con elementos pendientes en el anexo el documento no es final.
    expect(doc.generationMetadata.pipelineState.isComplete).toBe(false);
  }, 180_000);

  it('regenera una vez la sección que defiende la postura contraria y deja la versión correcta', async () => {
    const calls: string[] = [];
    const doc = await generate({
      generateSection: async ({ section }: any) => {
        if (!/^CONTESTACIÓN AL AGRAVIO PRIMERO$/.test(section.title)) return /AGRAVIO/.test(section.title) ? CLEAN_AGRAVIO : section.content?.[0]?.text || '';
        calls.push(section.title);
        return calls.length === 1 ? OPPOSITE : CLEAN_AGRAVIO;
      },
    });
    expect(calls).toHaveLength(2);
    expect(doc.generationMetadata.writingContractValidation.regenerated).toContain('sec-contestacion_agravios-agravio-1');
    expect(body(doc)).not.toMatch(/Interponemos|se revoque/);
    expect(doc.generationMetadata.reviewAnnex.unresolvedFindings.filter((item: any) => item.code === 'OPPOSITE_STANCE')).toEqual([]);
  }, 180_000);

  it('si la regeneración no corrige la postura contraria, el hallazgo queda registrado y el documento no es válido', async () => {
    const doc = await generate({ generateSection: async ({ section }: any) => (/^CONTESTACIÓN AL AGRAVIO PRIMERO$/.test(section.title) ? OPPOSITE : /AGRAVIO/.test(section.title) ? CLEAN_AGRAVIO : section.content?.[0]?.text || '') });
    expect(doc.generationMetadata.reviewAnnex.unresolvedFindings.some((item: any) => item.code === 'OPPOSITE_STANCE')).toBe(true);
    expect(doc.validation.isValid).toBe(false);
    expect(doc.generationMetadata.pipelineState.isComplete).toBe(false);
  }, 180_000);

  it('la firma incoherente con el rol se repara con los datos de la ficha', async () => {
    const doc = await generate({
      generateSection: async ({ section }: any) => (/^FIRMA$/.test(section.title) ? 'Abogados postulantes de la parte actora\nLAURA MENDOZA FICTICIA' : /AGRAVIO/.test(section.title) ? CLEAN_AGRAVIO : section.content?.[0]?.text || ''),
    });
    const signature = doc.sections.find((section: any) => section.type === 'signature').content[0].text;
    expect(signature).toContain(APELADA);
    expect(signature).not.toMatch(/LAURA MENDOZA|actora/i);
  }, 180_000);
});
