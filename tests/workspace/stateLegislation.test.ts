import { describe, expect, it } from 'vitest';
import { mapScowResults, searchStateLegislation, STATE_OFFICIAL_CATALOGS } from '@/lib/workspace/stateLegislation';

/** Forma real de la respuesta SCOW (medida 2026-10-13); contenido sintético. */
const payload = {
  codigo: 200,
  resultados: [
    {
      idOrdenamiento: '9999', ordenamiento: 'CODIGO DE <em>PRUEBA</em> SINTETICO DEL ESTADO DE JALISCO', vigencia: 'VIGENTE', estado: 'JALISCO',
      categoriaOrdenamiento: 'CODIGO', materia: 'CIVIL', reformaExtracto: 'DECRETO NO. 00000/SINTETICO\r\nARTICULO UNICO. …', fechaPublicado: '06/07/2021 00:00:00',
    },
    { idOrdenamiento: '', ordenamiento: 'SIN IDENTIFICADOR' },
  ],
};

describe('legislación estatal (SCJN SCOW)', () => {
  it('limpia el resaltado, normaliza fechas y enlaza la fuente oficial del Congreso', () => {
    const [item, ...rest] = mapScowResults(payload, 'JALISCO');
    expect(rest).toHaveLength(0);
    expect(item).toMatchObject({
      id: '9999', title: 'Codigo de prueba sintetico del estado de Jalisco', validity: 'VIGENTE', category: 'CODIGO', matter: 'CIVIL',
      lastReformDecree: 'DECRETO NO. 00000/SINTETICO', lastReformPublished: '2021-07-06', officialUrl: STATE_OFFICIAL_CATALOGS.JALISCO,
    });
    expect(item.title).not.toMatch(/<em>/);
  });

  it('consulta por POST con filtro de entidad y vigencia; sin red real', async () => {
    let body: Record<string, unknown> = {};
    const fetcher = async (_url: RequestInfo | URL, init?: RequestInit) => { body = JSON.parse(String(init?.body)); return new Response(JSON.stringify(payload)); };
    const result = await searchStateLegislation('prueba', 'JALISCO', fetcher);
    expect(body).toMatchObject({ q: 'prueba', entidadFederativaF: 'JALISCO', vigenciaF: 'VIGENTE' });
    expect(result.items).toHaveLength(1);
  });

  it('no consulta con menos de 3 caracteres y reporta errores HTTP', async () => {
    let calls = 0;
    expect((await searchStateLegislation('ab', 'JALISCO', async () => { calls += 1; return new Response('{}'); })).items).toEqual([]);
    expect(calls).toBe(0);
    const failed = await searchStateLegislation('codigo', 'JALISCO', async () => new Response('', { status: 404 }));
    expect(failed.error).toBe('SCOW_HTTP_404');
  });
});
