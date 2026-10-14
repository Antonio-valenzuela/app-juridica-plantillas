import { describe, expect, it } from 'vitest';
import { emptyReviewAnnex, formatReviewAnnex, reviewAnnexHasItems, separateReviewMaterialFromText, splitSentences } from '@/lib/legal-engine/reviewAnnex';

const TITLES = ['PROEMIO', 'OPORTUNIDAD', 'CONTESTACIÓN AL AGRAVIO PRIMERO', 'PUNTOS PETITORIOS', 'LUGAR Y FECHA', 'FIRMA'];
const ctx = (sectionTitle = 'CONTESTACIÓN AL AGRAVIO PRIMERO', sectionType = 'argument') => ({ sectionTitles: TITLES, sectionType, sectionTitle });
const run = (text: string, sectionTitle?: string, sectionType?: string) => {
  const annex = emptyReviewAnnex();
  const result = separateReviewMaterialFromText(text, annex, ctx(sectionTitle, sectionType));
  return { ...result, annex };
};

describe('anexo de revisión: el cuerpo solo contiene el escrito', () => {
  it('retira el meta-texto del cuerpo y lo manda al anexo', () => {
    const { text, annex } = run('El recibo de liquidación consta en autos y fue valorado por el juzgador. Podría argumentarse que la parte actora aprovechará una laguna probatoria. La presente ampliación se centra en delimitar el objeto de la controversia. El agravio no combate esa valoración.');
    expect(text).toBe('El recibo de liquidación consta en autos y fue valorado por el juzgador. El agravio no combate esa valoración.');
    expect(annex.notes.map((note) => note.text).join(' ')).toMatch(/Podría argumentarse/);
    expect(annex.notes.map((note) => note.text).join(' ')).toMatch(/La presente ampliación/);
  });

  it('una cita no verificada se omite del cuerpo y se lista; nunca queda marcada en el texto', () => {
    const { text, annex } = run('La sentencia valoró la prueba. Además, la tesis invocada con [NO VERIFICADO: registro digital 180728] no resulta suficiente para demostrar la nulidad. El agravio es genérico.');
    expect(text).not.toMatch(/NO VERIFICADO|180728/);
    expect(text).toBe('La sentencia valoró la prueba. El agravio es genérico.');
    expect(annex.unverifiedCitations).toHaveLength(1);
    expect(annex.unverifiedCitations[0].citation).toBe('registro digital 180728');
  });

  it('retira los marcadores de desarrollo pendiente y conserva el resto de la oración', () => {
    const { text, annex } = run('[PENDIENTE DE DESARROLLO / FUNDAMENTO NORMATIVO ESPECÍFICO PENDIENTE DE VERIFICAR: incorporar sólo después de verificar el texto vigente] La carga de la prueba corresponde a quien afirma.');
    expect(text).toBe('La carga de la prueba corresponde a quien afirma.');
    expect(annex.pendingItems).toHaveLength(1);
  });

  it('conserva los marcadores de dato pendiente: son campos por completar, no verificación', () => {
    const { text } = run('Comparece [DATO PENDIENTE: nombre de la parte] ante este juzgado.');
    expect(text).toBe('Comparece [DATO PENDIENTE: nombre de la parte] ante este juzgado.');
  });

  it('retira encabezados, firmas y «lugar y fecha» escritos dentro de otra sección, y lo que sigue al reinicio del escrito', () => {
    const body = [
      'El agravio carece de sustento.',
      'PUNTOS PETITORIOS',
      'PRIMERO. Se confirme.',
      'FIRMA',
      '[DATO PENDIENTE DE EXPEDIENTE]',
      'Abogado postulante de la parte actora.',
      'En la Ciudad de México, a veinte de octubre de dos mil veintiséis, los suscritos comparecimos.',
    ].join('\n');
    const { text, annex } = run(body);
    expect(text).toBe('El agravio carece de sustento.');
    expect(annex.removedStructure.map((item) => item.kind)).toContain('HEADING');
    expect(annex.removedStructure.map((item) => item.excerpt).join(' ')).toMatch(/Texto posterior retirado: .*Se confirme/);
  });

  it('una firma o un «lugar y fecha» sueltos dentro de una sección se retiran', () => {
    const { text, annex } = run('El agravio carece de sustento.\nAbogado postulante de la parte actora.\nEn la Ciudad de México, a veinte de octubre de dos mil veintiséis, los suscritos comparecimos.');
    expect(text).toBe('El agravio carece de sustento.');
    expect(annex.removedStructure.map((item) => item.kind)).toEqual(expect.arrayContaining(['SIGNATURE', 'PLACE_DATE']));
  });

  it('el aviso interno «pendiente de redacción» va al anexo', () => {
    const { text, annex } = run('[DATO PENDIENTE / GENERACIÓN PENDIENTE DE REVISIÓN]\nApartado «CONTESTACIÓN AL AGRAVIO PRIMERO» pendiente de redacción: desarróllelo únicamente con información respaldada.');
    expect(text).toBe('');
    expect(annex.pendingItems[0].text).toMatch(/pendiente de redacción/);
  });

  it('el rubro del destinatario conserva «EXPEDIENTE: n» (los fragmentos cortos solo se descartan si un marcador los dejó)', () => {
    const { text, changed } = run('H. JUZGADO QUINTO EN MATERIA CIVIL\nPRESENTE.\n\nEXPEDIENTE: 5521/2024', 'RUBRO Y DESTINATARIO', 'header');
    expect(changed).toBe(false);
    expect(text).toContain('EXPEDIENTE: 5521/2024');
  });

  it('el título de la propia sección repetido al inicio sobra', () => {
    const { text } = run('CONTESTACIÓN AL AGRAVIO PRIMERO\n\nEl agravio no se sostiene.');
    expect(text).toBe('El agravio no se sostiene.');
  });

  it('las secciones de cierre y firma no se tocan', () => {
    const { text, changed } = run('PROTESTO LO NECESARIO\n\nZapopan, Jalisco, a ____ de ______ de ______.', 'LUGAR Y FECHA', 'closing');
    expect(changed).toBe(false);
    expect(text).toContain('PROTESTO LO NECESARIO');
  });

  it('es idempotente', () => {
    const first = run('Podría argumentarse algo. Hecho cierto del expediente.');
    const second = separateReviewMaterialFromText(first.text, first.annex, ctx());
    expect(second.changed).toBe(false);
    expect(second.text).toBe(first.text);
  });

  it('divide oraciones sin romper abreviaturas', () => {
    expect(splitSentences('Conforme al art. 14 del Código aplicable, procede. Siguiente oración.')).toEqual(['Conforme al art. 14 del Código aplicable, procede.', 'Siguiente oración.']);
  });

  it('el anexo se presenta aparte del escrito y declara que no forma parte de él', () => {
    const { annex } = run('Podría argumentarse algo. La tesis [NO VERIFICADO: tesis 50/2010] lo respalda. Hecho cierto.');
    expect(reviewAnnexHasItems(annex)).toBe(true);
    const text = formatReviewAnnex(annex);
    expect(text).toMatch(/No forma parte del escrito/);
    expect(text).toMatch(/tesis 50\/2010/);
    expect(formatReviewAnnex(emptyReviewAnnex())).toMatch(/Sin elementos pendientes/);
  });
});

describe('citas sin respaldo en las fuentes', () => {
  const support = 'La sentencia aplicó el artículo 1295 del Código Civil del Estado de Jalisco para valorar el recibo.';
  const withSupport = (text: string) => {
    const annex = emptyReviewAnnex();
    const result = separateReviewMaterialFromText(text, annex, { ...ctx(), supportText: support });
    return { ...result, annex };
  };

  it('omite una cita de artículo o tesis que no consta en las fuentes', () => {
    const { text, annex } = withSupport('El recibo fue valorado. De acuerdo con el artículo 2847 del Código Civil del Estado de Jalisco, las solemnidades son íntegras. La tesis 50/2010 lo confirma. El agravio es genérico.');
    expect(text).toBe('El recibo fue valorado. El agravio es genérico.');
    expect(annex.unverifiedCitations.length).toBeGreaterThanOrEqual(2);
  });

  it('conserva una cita que sí consta en la sentencia o en las fuentes', () => {
    const { text, annex } = withSupport('La sentencia aplicó el artículo 1295 del Código Civil del Estado de Jalisco.');
    expect(text).toBe('La sentencia aplicó el artículo 1295 del Código Civil del Estado de Jalisco.');
    expect(annex.unverifiedCitations).toHaveLength(0);
  });
});
