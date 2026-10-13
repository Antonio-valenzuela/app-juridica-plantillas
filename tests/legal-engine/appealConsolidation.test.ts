import { describe, expect, it } from 'vitest';
import {
  consolidateAppealResolutions, deriveProvisionalAppealConfirmation, extractAppealResolutionReview,
  resolveAppealGeneration, selectAppealSources, selectPrimaryAppealResolution, validateAppealConfirmation,
  type AppealConfirmation,
} from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

const COURT = 'JUZGADO QUINTO EN MATERIA FAMILIAR';
const page = (n: number, lines: string[]) => ({ page: n, chars: 0, text: lines.join('\n') });
const filler = (n: number) => page(n, [`Continuación de las actuaciones. Foja ${n}.`, 'Texto de relleno sintético sin encabezado resolutivo.']);
const sentenciaHeader = (date: string, expediente = 'ANON-01') => [
  'PODER JUDICIAL DEL ESTADO', COURT, 'SE DICTA SENTENCIA DEFINITIVA', `EXPEDIENTE: ${expediente}`,
  'ACTORES: ALFA UNO; BETA UNO.', 'DEMANDADOS: PARTE DEMANDADA UNO.', `ZAPOPAN, JALISCO A ${date}`,
];
const autoPage = (n: number) => page(n, [COURT, 'AUTO: SE DESECHA INCIDENTE.', 'ZAPOPAN, JALISCO A 12 DOCE DE AGOSTO DEL AÑO 2026', 'NOTIFICACIÓN: BOLETÍN 120, 13 de agosto de 2026.']);
const source = (pages: ReturnType<typeof page>[], id = 'scan'): UploadedSourceDocument =>
  ({ id, filename: 'scan.pdf', sourceValidated: true, pages } as UploadedSourceDocument);

/** PDF sintético de 44 páginas: un auto en la 1, una sentencia desde la 5 y notificación en la 44. */
function pdf44(): UploadedSourceDocument {
  const pages = Array.from({ length: 44 }, (_, i) => filler(i + 1));
  pages[0] = autoPage(1);
  pages[4] = page(5, sentenciaHeader('24 VEINTICUATRO DE AGOSTO DE 2026'));
  pages[43] = page(44, ['RESOLUTIVOS', 'Notifíquese personalmente.', 'NOTIFICACIÓN: BOLETÍN 139, 25 de agosto de 2026.']);
  return source(pages);
}

describe('PDF de 44 páginas como una única fuente de trabajo', () => {
  const review = extractAppealResolutionReview([pdf44()]);

  it('detecta el auto y la sentencia; la sentencia abarca hasta la última página', () => {
    expect(review.resolutions.map(r => [r.type, r.startPage, r.endPage])).toEqual([['AUTO', 1, 4], ['SENTENCIA_DEFINITIVA', 5, 44]]);
  });

  it('elige la sentencia como principal y el auto como antecedente, sin pedir otra selección', () => {
    const { primary, antecedents } = selectPrimaryAppealResolution(review.resolutions);
    expect(primary?.type).toBe('SENTENCIA_DEFINITIVA');
    expect(antecedents.map(r => r.type)).toEqual(['AUTO']);
  });

  it('conserva las 44 páginas: la principal controla el escrito y el resto viaja como contexto REFERENCE', () => {
    const { primary } = selectPrimaryAppealResolution(review.resolutions);
    const scoped = selectAppealSources([pdf44()], primary!);
    expect(scoped).toHaveLength(2);
    expect(scoped[0].pages!.map(p => p.page)).toEqual(Array.from({ length: 40 }, (_, i) => i + 5));
    expect(scoped[1].classification.role).toBe('REFERENCE');
    expect(scoped[1].pages!.map(p => p.page)).toEqual([1, 2, 3, 4]);
    const all = scoped.flatMap(s => s.pages!.map(p => p.page)).sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 44 }, (_, i) => i + 1));
  });

  it('la fuente de antecedentes no se hace pasar por la principal ni comparte su identidad', () => {
    const { primary } = selectPrimaryAppealResolution(review.resolutions);
    const [main, context] = selectAppealSources([pdf44()], primary!);
    expect(context.id).not.toBe(main.id);
    expect(main.classification?.role).not.toBe('REFERENCE');
  });
});

describe('consolidación de detecciones del mismo documento', () => {
  it('fusiona repeticiones con la misma identidad y fragmentos sin ficha propia en una sola resolución', () => {
    const s = source([
      page(1, sentenciaHeader('24 VEINTICUATRO DE AGOSTO DE 2026')),
      filler(2),
      // Repetición del encabezado con la misma ficha (el OCR duplica la cabecera).
      page(3, sentenciaHeader('24 VEINTICUATRO DE AGOSTO DE 2026')),
      // Página que empieza con el mismo encabezado pero sin ficha: fragmento.
      page(4, ['SE DICTA SENTENCIA DEFINITIVA', 'Continúa la parte considerativa.']),
      filler(5),
    ]);
    const review = extractAppealResolutionReview([s]);
    expect(review.resolutions).toHaveLength(1);
    expect(review.resolutions[0]).toMatchObject({ type: 'SENTENCIA_DEFINITIVA', startPage: 1, endPage: 5, court: COURT });
    expect(review.resolutions[0].parties.map(p => p.name)).toEqual(expect.arrayContaining(['ALFA UNO', 'BETA UNO']));
  });

  it('el fragmento complementa la información del documento sin duplicar partes', () => {
    const s = source([
      page(1, ['SE DICTA SENTENCIA DEFINITIVA', 'Texto sin ficha en la primera página.']),
      page(2, sentenciaHeader('24 VEINTICUATRO DE AGOSTO DE 2026')),
    ]);
    const [only] = extractAppealResolutionReview([s]).resolutions;
    expect(only.startPage).toBe(1);
    expect(only.court).toBe(COURT);
    expect(only.parties.filter(p => p.name === 'ALFA UNO')).toHaveLength(1);
  });

  it('NO fusiona dos sentencias auténticamente distintas (fecha explícita diferente)', () => {
    const s = source([
      page(1, sentenciaHeader('10 DIEZ DE JUNIO DE 2026')), filler(2),
      page(3, sentenciaHeader('24 VEINTICUATRO DE AGOSTO DE 2026')), filler(4),
    ]);
    const review = extractAppealResolutionReview([s]);
    expect(review.resolutions.map(r => [r.startPage, r.endPage])).toEqual([[1, 2], [3, 4]]);
  });

  it('NO fusiona resoluciones de órganos distintos aunque coincida el tipo', () => {
    const other = sentenciaHeader('24 VEINTICUATRO DE AGOSTO DE 2026').map(l => l === COURT ? 'JUZGADO SEXTO EN MATERIA FAMILIAR' : l);
    const s = source([page(1, sentenciaHeader('24 VEINTICUATRO DE AGOSTO DE 2026')), page(2, other)]);
    expect(extractAppealResolutionReview([s]).resolutions).toHaveLength(2);
  });

  it('NO fusiona un auto con una sentencia', () => {
    const s = source([autoPage(1), page(2, sentenciaHeader('24 VEINTICUATRO DE AGOSTO DE 2026'))]);
    expect(extractAppealResolutionReview([s]).resolutions.map(r => r.type)).toEqual(['AUTO', 'SENTENCIA_DEFINITIVA']);
  });

  it('el rango fusionado cubre todas las páginas: no se pierde contenido sustantivo', () => {
    const s = source([page(1, sentenciaHeader('24 VEINTICUATRO DE AGOSTO DE 2026')), page(2, ['SE DICTA SENTENCIA DEFINITIVA', 'Fragmento.']), filler(3)]);
    const [merged] = extractAppealResolutionReview([s]).resolutions;
    const scoped = selectAppealSources([s], merged);
    expect(scoped.flatMap(x => x.pages!.map(p => p.page))).toEqual([1, 2, 3]);
  });

  it('es idempotente', () => {
    const review = extractAppealResolutionReview([pdf44()]);
    expect(consolidateAppealResolutions(review.resolutions)).toEqual(review.resolutions);
  });
});

describe('selección de la resolución principal', () => {
  it('entre dos sentencias elige la de fecha más reciente', () => {
    const s = source([page(1, sentenciaHeader('24 VEINTICUATRO DE AGOSTO DE 2026')), page(3, sentenciaHeader('10 DIEZ DE JUNIO DE 2026'))]);
    const { primary } = selectPrimaryAppealResolution(extractAppealResolutionReview([s]).resolutions);
    expect(primary?.startPage).toBe(1);
  });

  it('sin resoluciones no hay principal', () => {
    expect(selectPrimaryAppealResolution([])).toEqual({ antecedents: [] });
  });
});

describe('compuerta de generación: provisional sin formulario, bloqueada sin confirmación', () => {
  const review = extractAppealResolutionReview([pdf44()]);

  it('una petición sin ninguna confirmación sigue bloqueada', () => {
    expect(resolveAppealGeneration(review, undefined)).toMatchObject({ canGenerate: false, mode: 'BLOCKED' });
  });

  it('la confirmación provisional derivada permite generar el borrador con la sentencia', () => {
    const decision = resolveAppealGeneration(review, deriveProvisionalAppealConfirmation(review, { expediente: 'ANON-01' }));
    expect(decision).toMatchObject({ canGenerate: true, mode: 'PROVISIONAL' });
    expect(decision.selected?.type).toBe('SENTENCIA_DEFINITIVA');
  });

  it('lo no verificable queda marcado como pendiente, nunca presentado como confirmado', () => {
    const provisional = deriveProvisionalAppealConfirmation(review);
    expect(provisional.confirmed).toBe(false);
    expect(provisional.provisional).toBe(true);
    expect(provisional.representedNames).toEqual([]);
    // El expediente consta en el encabezado de la sentencia: se usa; la parte representada, no.
    expect(provisional.expediente).toBe('ANON-01');
    const decision = resolveAppealGeneration(review, provisional);
    expect(decision.pendingFields).toContain('parte que representa');
    expect(decision.pendingFields).not.toContain('número de expediente');
    // La validación estricta NO la acepta como confirmación del abogado.
    expect(validateAppealConfirmation(review, provisional).eligible).toBe(false);
  });

  it('una confirmación provisional de otra revisión de la fuente se rechaza', () => {
    const provisional = deriveProvisionalAppealConfirmation(review);
    expect(resolveAppealGeneration(review, { ...provisional, sourceFingerprint: 'otra-huella' }).canGenerate).toBe(false);
  });

  it('una resolución inexistente o un indicador provisional ausente no habilitan la generación', () => {
    const provisional = deriveProvisionalAppealConfirmation(review);
    expect(resolveAppealGeneration(review, { ...provisional, resolutionId: 'inventada' }).canGenerate).toBe(false);
    expect(resolveAppealGeneration(review, { ...provisional, provisional: false }).canGenerate).toBe(false);
  });

  it('la confirmación explícita completa conserva su contrato estricto', () => {
    const { primary } = selectPrimaryAppealResolution(review.resolutions);
    const full: AppealConfirmation = {
      sourceFingerprint: review.sourceFingerprint, resolutionId: primary!.id, parties: primary!.parties,
      representedNames: primary!.parties.filter(p => p.role === 'actor').map(p => p.name),
      recipient: primary!.court, notification: '25 de agosto de 2026 · Boletín 139', expediente: 'ANON-01', confirmed: true,
    };
    expect(resolveAppealGeneration(review, full)).toMatchObject({ canGenerate: true, mode: 'CONFIRMED', pendingFields: [] });
  });

  it('sin encabezados detectables el borrador no se bloquea: la resolución queda pendiente', () => {
    const empty = extractAppealResolutionReview([source([filler(1), filler(2)])]);
    expect(empty.resolutions).toEqual([]);
    const decision = resolveAppealGeneration(empty, deriveProvisionalAppealConfirmation(empty));
    expect(decision).toMatchObject({ canGenerate: true, mode: 'PROVISIONAL' });
    expect(decision.pendingFields).toContain('resolución impugnada');
  });
});

describe('expediente tomado de la propia resolución', () => {
  it('se extrae del encabezado de la sentencia', () => {
    const [, sentencia] = extractAppealResolutionReview([pdf44()]).resolutions;
    expect(sentencia.expediente).toBe('ANON-01');
  });

  it('un expediente ajeno del estado de la página NO sustituye al del documento', () => {
    const review = extractAppealResolutionReview([pdf44()]);
    expect(deriveProvisionalAppealConfirmation(review, { expediente: 'EXPEDIENTE-DE-OTRO-CASO' }).expediente).toBe('ANON-01');
  });

  it('si el documento no trae expediente se usa la pista de la página y, sin ella, queda pendiente', () => {
    const noExp = source([page(1, sentenciaHeader('24 VEINTICUATRO DE AGOSTO DE 2026').filter(l => !l.startsWith('EXPEDIENTE')))]);
    const review = extractAppealResolutionReview([noExp]);
    expect(review.resolutions[0].expediente).toBeUndefined();
    expect(deriveProvisionalAppealConfirmation(review, { expediente: 'PISTA-1' }).expediente).toBe('PISTA-1');
    const bare = deriveProvisionalAppealConfirmation(review);
    expect(bare.expediente).toBe('[A CONFIRMAR POR EL ABOGADO]');
    expect(resolveAppealGeneration(review, bare).pendingFields).toContain('número de expediente');
  });

  it('dos sentencias con expedientes explícitamente distintos no se fusionan', () => {
    const s = source([
      page(1, sentenciaHeader('24 VEINTICUATRO DE AGOSTO DE 2026', 'EXP-A')),
      page(2, sentenciaHeader('24 VEINTICUATRO DE AGOSTO DE 2026', 'EXP-B')),
    ]);
    expect(extractAppealResolutionReview([s]).resolutions.map(r => r.expediente)).toEqual(['EXP-A', 'EXP-B']);
  });
});
