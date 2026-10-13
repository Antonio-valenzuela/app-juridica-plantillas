import { beforeAll, describe, expect, it } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import {
  appealAppearingParties, consolidatePartiesByRole, deriveProvisionalAppealConfirmation, extractAppealResolutionReview,
  renderAppealBackgroundSection, selectPrimaryAppealResolution, type AppealConfirmation, type AppealParty,
} from '@/lib/legal-engine/case-extraction/appealResolutionReview';

const COURT = 'JUZGADO QUINTO EN MATERIA FAMILIAR';
const page = (n: number, lines: string[]) => ({ page: n, chars: 0, text: lines.join('\n') });
const filler = (n: number) => page(n, [`Continuación de las actuaciones. Foja ${n}.`, 'Texto sintético sin encabezado.']);

/** PDF sintético de 44 páginas: un auto (p.1), una sentencia definitiva (p.5) y notificación (p.44). */
function pdf44(): any {
  const pages = Array.from({ length: 44 }, (_, i) => filler(i + 1));
  pages[0] = page(1, [COURT, 'AUTO: SE DESECHA INCIDENTE.', 'ZAPOPAN, JALISCO A 12 DOCE DE AGOSTO DEL AÑO 2026', 'NOTIFICACIÓN: BOLETÍN 120, 13 de agosto de 2026.']);
  pages[4] = page(5, ['PODER JUDICIAL DEL ESTADO', COURT, 'SE DICTA SENTENCIA DEFINITIVA', 'EXPEDIENTE: ANON-01', 'ACTORES: ALFA UNO; BETA UNO.', 'DEMANDADOS: PARTE DEMANDADA UNO.', 'ZAPOPAN, JALISCO A 24 VEINTICUATRO DE AGOSTO DE 2026', 'RESULTANDO. El actor reclamó el pago de una suma. CONSIDERANDO. Se condena a la demandada.']);
  pages[43] = page(44, ['RESOLUTIVOS', 'Notifíquese personalmente.', 'NOTIFICACIÓN: BOLETÍN 139, 25 de agosto de 2026.']);
  return { id: 'scan44', filename: 'scan44.pdf', sourceValidated: true, pages, classification: { sourceDocumentType: 'SENTENCIA_O_RESOLUCION', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' } };
}

async function generate(appealConfirmation: AppealConfirmation | undefined) {
  const doc: any = await runGenerationPipeline({
    selectedDocumentType: 'apelacion_civil', documentTypeLabel: 'Apelación civil', matter: 'FAMILIAR', jurisdiction: 'Jalisco',
    userInstruction: 'Preparar apelación contra la sentencia definitiva.', sourceDocuments: [pdf44()], requireAppealConfirmation: true,
    appealConfirmation,
    workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
  } as any);
  const bySection = new Map<string, string>(doc.sections.map((s: any) => [String(s.title), (s.content || []).map((b: any) => b.text || '').join('\n')]));
  return { doc, bySection, body: [...bySection.values()].join('\n') };
}

describe('apelación: del PDF de 44 páginas al borrador sin formulario intermedio', () => {
  const review = extractAppealResolutionReview([pdf44()]);
  let provisional: Awaited<ReturnType<typeof generate>>;
  beforeAll(async () => { provisional = await generate(deriveProvisionalAppealConfirmation(review, { expediente: 'ANON-01' })); }, 300_000);

  it('una petición sin ninguna confirmación sigue rechazada', async () => {
    await expect(generate(undefined)).rejects.toMatchObject({ code: 'NEEDS_USER_INPUT' });
  }, 300_000);

  it('la confirmación provisional produce el borrador y queda marcada como no confirmada', () => {
    const meta = provisional.doc.generationMetadata.appealResolutionConfirmation;
    expect(meta.confirmationMode).toBe('PROVISIONAL');
    expect(meta.pendingFields).toContain('parte que representa');
    expect(provisional.doc.sections.length).toBeGreaterThan(5);
  });

  it('la sentencia controla el escrito; el auto es antecedente y no se adopta como resolución impugnada', () => {
    const recurrida = provisional.bySection.get('RESOLUCIÓN RECURRIDA') || '';
    expect(recurrida).toMatch(/sentencia definitiva/);
    expect(recurrida).toContain(COURT);
    expect(recurrida).toContain('ANON-01');
    expect(recurrida).toMatch(/fojas 5 a 44/);
    expect(recurrida).not.toMatch(/\bauto\b/i);
  });

  it('los antecedentes proceden del documento completo (el auto de la foja 1)', () => {
    const antecedentes = provisional.bySection.get('ANTECEDENTES PROCESALES') || '';
    expect(antecedentes).toMatch(/Auto de fecha/);
    expect(antecedentes).toMatch(/fojas 1 a 4/);
  });

  it('NO elige arbitrariamente una parte que comparece: queda un marcador editable', () => {
    expect(provisional.body).toContain('[A CONFIRMAR POR EL ABOGADO: parte que representa]');
    expect(provisional.body).not.toMatch(/Comparece (ALFA|BETA) UNO/);
    expect(provisional.body).not.toMatch(/Comparece PARTE DEMANDADA UNO/);
  });

  it('no presenta como hechos ciertos los datos no verificados ni repite bloques idénticos', () => {
    expect(provisional.body).not.toContain('BAJO PROTESTA DE DECIR VERDAD');
    const paragraphs = provisional.body.split('\n').map(l => l.trim()).filter(l => l.length > 60);
    const duplicated = paragraphs.filter((l, i) => paragraphs.indexOf(l) !== i);
    expect(duplicated).toEqual([]);
  });

  it('con la parte representada confirmada, ésa es la que comparece', async () => {
    const [main] = [review.resolutions[review.resolutions.length - 1]];
    const confirmed: AppealConfirmation = {
      sourceFingerprint: review.sourceFingerprint, resolutionId: main.id, parties: main.parties,
      representedNames: ['PARTE DEMANDADA UNO'], recipient: main.court, notification: '25 de agosto de 2026 · Boletín 139',
      expediente: 'ANON-01', confirmed: true,
    };
    const generated = await generate(confirmed);
    expect(generated.doc.generationMetadata.appealResolutionConfirmation.confirmationMode).toBe('CONFIRMED');
    expect(generated.body).toMatch(/Comparece PARTE DEMANDADA UNO/);
  }, 300_000);
});

describe('partes de la apelación', () => {
  const party = (role: 'actor' | 'demandado', name: string): AppealParty => ({ role, name, origin: { sourceId: 's', page: 1, excerpt: name, start: 0, end: 1 } });
  const parties = [party('actor', 'ALFA'), party('actor', 'BETA'), party('demandado', 'GAMMA')];

  it('conserva TODAS las partes de cada rol', () => {
    expect(consolidatePartiesByRole(parties)).toEqual([
      { role: 'actor', name: 'ALFA; BETA', source: 'detected' }, { role: 'demandado', name: 'GAMMA', source: 'detected' },
    ]);
  });

  it('la parte representada comparece y la contraria es la del otro rol', () => {
    expect(appealAppearingParties({ parties, representedNames: ['GAMMA'] })).toEqual({ appellant: 'GAMMA', counterpart: 'ALFA; BETA' });
    expect(appealAppearingParties({ parties, representedNames: ['ALFA', 'BETA'] })).toEqual({ appellant: 'ALFA; BETA', counterpart: 'GAMMA' });
  });

  it('sin parte representada confirmada no inventa ninguna', () => {
    const result = appealAppearingParties({ parties, representedNames: [] });
    expect(result?.appellant).toContain('A CONFIRMAR POR EL ABOGADO');
    expect(result?.counterpart).toContain('A CONFIRMAR POR EL ABOGADO');
    expect(appealAppearingParties(undefined)).toBeUndefined();
  });
});

describe('secciones deterministas de la resolución', () => {
  const review = extractAppealResolutionReview([pdf44()]);
  const { primary, antecedents } = selectPrimaryAppealResolution(review.resolutions);

  it('lo que no consta queda como marcador, no como dato inventado', () => {
    const text = renderAppealBackgroundSection('RESOLUCIÓN RECURRIDA', { resolution: primary, antecedents });
    expect(text).toContain('[A CONFIRMAR POR EL ABOGADO: número de expediente]');
    expect(text).toContain('[A CONFIRMAR POR EL ABOGADO]');
  });

  it('una fecha ilegible en el documento se señala, no se corrige', () => {
    const conflicted = { ...primary!, dateStatus: 'CONFIRM_DATE' as const };
    expect(renderAppealBackgroundSection('RESOLUCIÓN RECURRIDA', { resolution: conflicted, expediente: 'X-1' }))
      .toContain('lectura de la fecha en el documento es inconsistente');
  });

  it('sin resolución detectada la sección queda pendiente', () => {
    expect(renderAppealBackgroundSection('RESOLUCIÓN RECURRIDA', {})).toContain('A CONFIRMAR POR EL ABOGADO');
    expect(renderAppealBackgroundSection('OTRA SECCIÓN', { resolution: primary })).toBeUndefined();
  });
});
