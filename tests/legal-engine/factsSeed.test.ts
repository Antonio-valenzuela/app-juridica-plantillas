import { describe, expect, it } from 'vitest';
import { injectNarrativeFacts, pickFactsSectionIndex, renderFactsSeed } from '@/lib/legal-engine/factsSeed';
import { FACT_TOKENS, generateWithFixture } from '../helpers/evidenceFixture';

const fact = (over: Record<string, unknown> = {}) => ({ id: 'f', number: '1', text: 'Se celebró un contrato el 5 de enero', confidence: 1, ...over }) as any;

describe('renderFactsSeed — procedencia honesta', () => {
  it('una afirmación de parte nunca se presenta como hecho que consta', () => {
    const text = renderFactsSeed([fact({ actor: 'la parte actora' })]);
    expect(text).toContain('Afirma la parte actora');
    expect(text).not.toContain('Consta en la fuente');
  });

  it('un hecho contestado se marca como afirmación aunque no traiga actor', () => {
    expect(renderFactsSeed([fact({ contestedStatus: 'CONTESTED' })])).toContain('Afirma una de las partes');
  });

  it('un hecho con fuente concreta cita el expediente y la página, sin el identificador interno', () => {
    const text = renderFactsSeed([fact({ sourceReference: { documentId: 'pending-upload-1791991502775-0', page: 3 } })]);
    expect(text).toContain('Consta en el expediente, página 3');
    expect(text).not.toMatch(/pending-upload/);
  });

  it('sin procedencia verificable queda "por confirmar", jamás como probado', () => {
    const text = renderFactsSeed([fact()]);
    expect(text).toContain('Referido en el expediente, por confirmar');
    expect(text.toLowerCase()).not.toContain('probado');
  });

  it('baja confianza se marca como por verificar', () => {
    expect(renderFactsSeed([fact({ confidence: 0.3 })])).toContain('(por verificar)');
  });

  it('sin hechos utilizables no produce texto', () => {
    expect(renderFactsSeed([])).toBe('');
    expect(renderFactsSeed(undefined)).toBe('');
    expect(renderFactsSeed([fact({ text: '   ' })])).toBe('');
  });

  it('conserva la redacción literal de la fuente (sourceFact) frente al texto normalizado', () => {
    expect(renderFactsSeed([fact({ sourceFact: 'REDACCIÓN LITERAL', text: 'resumen' })])).toContain('REDACCIÓN LITERAL');
  });

  it('rota la muletilla de procedencia en listas largas sin perder hechos, páginas ni procedencia', () => {
    const text = renderFactsSeed([
      fact({ id: 'a', text: 'Hecho A', sourceReference: { documentId: 'doc-1', page: 1 } }),
      fact({ id: 'b', text: 'Hecho B', sourceReference: { documentId: 'doc-1', page: 2 } }),
      fact({ id: 'c', text: 'Hecho C', sourceReference: { documentId: 'doc-1', page: 3 } }),
      fact({ id: 'd', text: 'Hecho D', sourceReference: { documentId: 'doc-1', page: 4 } }),
    ]);

    expect(text).toContain('Consta en el expediente, página 1');
    expect(text).toContain('Obra en el expediente, página 2');
    expect(text).toContain('Está documentado en el expediente, página 3');
    expect(text).toContain('Se acredita en el expediente, página 4');
    for (const hecho of ['Hecho A', 'Hecho B', 'Hecho C', 'Hecho D']) expect(text).toContain(hecho);
    const openers = text.split('\n').map((line) => line.replace(/^\d+\.\s*/, '').split(':')[0]);
    expect(new Set(openers).size).toBe(openers.length);
  });

  it('rota también la procedencia pendiente cuando no hay fuente verificable', () => {
    const text = renderFactsSeed([
      fact({ id: 'a', text: 'Hecho A' }),
      fact({ id: 'b', text: 'Hecho B' }),
      fact({ id: 'c', text: 'Hecho C' }),
    ]);

    expect(text).toContain('Referido en el expediente, por confirmar');
    expect(text).toContain('Mencionado en el expediente, por confirmar');
    expect(text).toContain('Aludido en el expediente, por confirmar');
    expect(text.toLowerCase()).not.toContain('probado');
  });

  it('cada clase rota por su cuenta: la primera afirmación no reinicia la procedencia documental', () => {
    const text = renderFactsSeed([
      fact({ id: 'a', actor: 'la parte actora', text: 'Hecho de parte' }),
      fact({ id: 'b', text: 'Hecho documental', sourceReference: { documentId: 'doc-1', page: 7 } }),
    ]);

    expect(text).toContain('Afirma la parte actora');
    expect(text).toContain('Consta en el expediente, página 7');
  });
});

describe('pickFactsSectionIndex', () => {
  it('prefiere una sección tipada como antecedentes', () => {
    expect(pickFactsSectionIndex([
      { title: 'PROEMIO', type: 'header' }, { title: 'OBJETO', type: 'custom' }, { title: 'HECHOS', type: 'background' },
    ])).toBe(2);
  });

  it('si no hay antecedentes, usa una sección cuyo título los anuncia', () => {
    expect(pickFactsSectionIndex([
      { title: 'PROEMIO', type: 'header' }, { title: 'AUTO RECURRIDO', type: 'custom' }, { title: 'MOTIVOS DE OBJECIÓN', type: 'argument' },
    ])).toBe(2);
  });

  it('nunca elige cabecera, identidad, pruebas, petitorios ni firma', () => {
    expect(pickFactsSectionIndex([
      { title: 'PROEMIO', type: 'header' }, { title: 'COMPARECENCIA', type: 'identity' }, { title: 'PRUEBAS', type: 'evidence' },
      { title: 'PETITORIOS', type: 'petition' }, { title: 'FIRMA', type: 'signature' },
    ])).toBe(-1);
  });
});

describe('injectNarrativeFacts', () => {
  const sections = (text: string) => [
    { title: 'PROEMIO', type: 'header', content: [{ text: 'JUZGADO' }] },
    { title: 'HECHOS DE LA RECONVENCIÓN', type: 'background', content: [{ text }] },
  ];

  it('sustituye una semilla puramente pendiente', () => {
    const out = injectNarrativeFacts(sections('[DATO PENDIENTE: hechos con respaldo verificable]'), [fact()]);
    expect(out[1].content![0].text).toContain('Referido en el expediente');
    expect(out[1].content![0].text).not.toContain('PENDIENTE');
  });

  it('ignora el encabezado repetido de la sección al decidir si es solo pendiente', () => {
    const out = injectNarrativeFacts(sections('HECHOS DE LA RECONVENCIÓN:\n[PENDIENTE: hechos de la pretensión].'), [fact()]);
    expect(out[1].content![0].text).toContain('1. ');
  });

  it('NUNCA pisa contenido real existente', () => {
    const original = sections('El actor reclama el pago del contrato celebrado.');
    const out = injectNarrativeFacts(original, [fact()]);
    expect(out).toBe(original);
  });

  it('no modifica el documento si no hay hechos', () => {
    const original = sections('[DATO PENDIENTE: hechos]');
    expect(injectNarrativeFacts(original, [])).toBe(original);
  });

  it('no muta el arreglo original', () => {
    const original = sections('[DATO PENDIENTE: hechos]');
    injectNarrativeFacts(original, [fact()]);
    expect(original[1].content![0].text).toBe('[DATO PENDIENTE: hechos]');
  });
});

describe('integración con el pipeline real: los hechos no se pierden en escritos sustantivos', () => {
  it.each([
    'alegatos_civil', 'ofrecimiento_pruebas_civil', 'objecion_pruebas_civil', 'desahogo_vista_civil',
    'reconvencion_civil', 'reconvencion_mercantil', 'excepciones_mercantiles', 'alegatos_mercantil',
    'recurso_queja_amparo', 'alegatos_amparo', 'replica',
  ])('%s conserva los hechos del análisis', async (id) => {
    const { body } = await generateWithFixture(id);
    for (const token of FACT_TOKENS) expect(body, `${id} perdió ${token}`).toContain(token);
  }, 120_000);

  it('un trámite NO recibe una narración de hechos que no le corresponde', async () => {
    const { body } = await generateWithFixture('solicitud_copias_certificadas');
    expect(body).not.toContain('Referido en el expediente, por confirmar');
  }, 120_000);
});
