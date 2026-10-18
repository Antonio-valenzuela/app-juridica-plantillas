import { describe, expect, it } from 'vitest';
import { createDofAdapter } from '@/lib/legal-engine/legal-research/adapters/dof';

/** Respuesta simulada con la forma real de SIDOF `/notas/{dd-mm-aaaa}` (medida 2026-10-13); contenido sintético. */
const payload = {
  messageCode: 200,
  response: 'OK',
  NotasMatutinas: [
    { codNota: 9000001, titulo: 'Acuerdo sintético por el que se da a conocer un calendario de prueba.', fecha: '12-10-2026', nombreCodOrgaUno: 'PODER JUDICIAL', codOrgaDos: 'ÓRGANO SINTÉTICO' },
    { codNota: 9000002, titulo: '', fecha: '12-10-2026' },
  ],
  NotasVespertinas: [{ codNota: 9000003, titulo: 'Decreto sintético vespertino.', fecha: '12-10-2026', nombreCodOrgaUno: 'PODER EJECUTIVO' }],
  NotasExtraordinarias: [],
};

const input = (relevantDate?: string, terms: string[] = []) => ({
  request: { id: 'req-dof', requestedAuthorityTypes: ['OFFICIAL_AGREEMENT'] },
  query: { normalizedQuery: terms.join(' '), explicitTerms: terms },
  regime: { status: 'RESOLVED', relevantDate },
}) as never;

function fakeFetch() {
  const calls: Array<{ url: string; accept: string | null }> = [];
  const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), accept: new Headers(init?.headers).get('accept') });
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json;charset=UTF-8' } });
  };
  return { fetcher, calls };
}

describe('DOF por fecha (SIDOF /notas)', () => {
  it('lee matutinas y vespertinas, descarta notas sin título y enlaza la nota pública con fecha', async () => {
    const { fetcher, calls } = fakeFetch();
    const adapter = createDofAdapter({ legacyNotesByDate: true, fetch: fetcher, retry: { minIntervalMs: 0 } });
    const result = await adapter.search(input('2026-10-12'));
    expect(result.status).toBe('PASS');
    expect(result.candidates.map((candidate) => candidate.title)).toEqual(['Acuerdo sintético por el que se da a conocer un calendario de prueba.', 'Decreto sintético vespertino.']);
    expect(result.candidates[0].sourceUrl).toBe('https://dof.gob.mx/nota_detalle.php?codigo=9000001&fecha=12/10/2026');
    expect(result.candidates[0].issuingAuthority).toBe('ÓRGANO SINTÉTICO');
    // Fecha civil: no se desplaza al día anterior por zona horaria.
    expect(calls[0].url).toMatch(/\/notas\/12-10-2026$/);
    // `Accept: application/json` exacto provoca 406 en SIDOF.
    expect(calls[0].accept).not.toBe('application/json');
  });

  it('filtra por los términos del abogado', async () => {
    const { fetcher } = fakeFetch();
    const adapter = createDofAdapter({ legacyNotesByDate: true, fetch: fetcher, retry: { minIntervalMs: 0 } });
    const result = await adapter.search(input('2026-10-12', ['decreto']));
    expect(result.candidates.map((candidate) => candidate.title)).toEqual(['Decreto sintético vespertino.']);
  });
});
