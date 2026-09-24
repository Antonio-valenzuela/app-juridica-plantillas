import { describe, expect, it } from 'vitest';
import { createScjnSoapClient } from '@/lib/legal-engine/legal-research/adapters/scjnSoap';

const xml = (body: string) => new Response(`<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`, { status: 200, headers: { 'content-type': 'text/xml' } });

describe('SCJN Semanario SOAP adapter', () => {
  it('calls ObtenerEpocas and parses official catalog fields', async () => {
    let request = '';
    const client = createScjnSoapClient({ fetch: async (_url, init) => { request = String(init?.body); return xml('<ObtenerEpocasResponse><ObtenerEpocasResult><Catalogo><Id>11</Id><Descripcion>Décima Primera</Descripcion></Catalogo></ObtenerEpocasResult></ObtenerEpocasResponse>'); } });
    await expect(client.getEpocas()).resolves.toEqual([{ id: '11', description: 'Décima Primera' }]);
    expect(request).toContain('<ObtenerEpocas');
    expect(request).toContain('http://schemas.xmlsoap.org/soap/envelope/');
  });

  it('parses only fields actually returned by ObtenerTesisSemana', async () => {
    const client = createScjnSoapClient({ fetch: async () => xml('<ObtenerTesisSemanaResponse><ObtenerTesisSemanaResult><Tesis><IUS>2023456</IUS><Rubro>Rubro real</Rubro><Epoca>11a</Epoca><Instancia>Pleno</Instancia><FechaPublicacion>2026-09-20</FechaPublicacion><MateriasTesis>Común</MateriasTesis></Tesis></ObtenerTesisSemanaResult></ObtenerTesisSemanaResponse>') });
    await expect(client.getTesisSemana({ tipo_doc: 1 })).resolves.toEqual([{ registroDigital: '2023456', rubro: 'Rubro real', epoca: '11a', instancia: 'Pleno', publicacion: '2026-09-20', materia: 'Común', officialSourceUrl: undefined }]);
  });
});
