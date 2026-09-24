import { DOMParser } from '@xmldom/xmldom';

export const SCJN_SEMANARIO_SOAP_URL = 'https://sjf.scjn.gob.mx/sjfsem/Servicios/Semanario.asmx';
export const SCJN_TESIS_SOAP_URL = 'https://sjf.scjn.gob.mx/sjfsem/Servicios/wsTesis.asmx';

export interface ScjnSoapConfig {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  semanarioUrl?: string;
  tesisUrl?: string;
  timeoutMs?: number;
}

export interface ScjnSoapCatalogItem {
  id?: string;
  description?: string;
}

export interface ScjnSoapThesis {
  registroDigital?: string;
  rubro?: string;
  epoca?: string;
  instancia?: string;
  publicacion?: string;
  materia?: string;
  officialSourceUrl?: string;
}

function text(node: Element, name: string): string | undefined {
  const value = node.getElementsByTagName(name)[0]?.textContent?.trim();
  return value || undefined;
}

function parseXml(xml: string): Document {
  const errors: string[] = [];
  const document = new DOMParser({ errorHandler: { error: (message: string) => errors.push(message) } }).parseFromString(xml, 'text/xml');
  if (errors.length || !document.documentElement) throw new Error('SCJN_SOAP_XML_INVALID');
  const fault = document.getElementsByTagName('faultstring')[0]?.textContent?.trim();
  if (fault) throw new Error(`SCJN_SOAP_FAULT:${fault}`);
  return document;
}

function envelope(operation: string, parameters: Record<string, string | number> = {}): string {
  const fields = Object.entries(parameters).map(([key, value]) => `<${key}>${String(value).replace(/[<>&"']/g, '')}</${key}>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${operation} xmlns="http://sjf.scjn.gob.mx/">${fields}</${operation}></soap:Body></soap:Envelope>`;
}

export function createScjnSoapClient(config: ScjnSoapConfig = {}) {
  const fetcher = config.fetch || fetch;
  const timeoutMs = config.timeoutMs || 15000;
  const semanarioUrl = config.semanarioUrl || SCJN_SEMANARIO_SOAP_URL;
  const tesisUrl = config.tesisUrl || SCJN_TESIS_SOAP_URL;

  async function call(url: string, operation: string, parameters?: Record<string, string | number>): Promise<Document> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, {
        method: 'POST',
        headers: {
          Accept: 'text/xml, application/xml',
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `"http://sjf.scjn.gob.mx/${operation}"`,
        },
        body: envelope(operation, parameters),
        redirect: 'manual',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`SCJN_SOAP_HTTP_${response.status}`);
      return parseXml(await response.text());
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error(`SCJN_SOAP_TIMEOUT_${timeoutMs}MS`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getEpocas(): Promise<ScjnSoapCatalogItem[]> {
      const document = await call(semanarioUrl, 'ObtenerEpocas');
      return Array.from(document.getElementsByTagName('Catalogo')).map((item) => ({ id: text(item, 'Id'), description: text(item, 'Descripcion') }));
    },
    async getTesisSemana(parameters: Record<string, string | number> = {}): Promise<ScjnSoapThesis[]> {
      const document = await call(semanarioUrl, 'ObtenerTesisSemana', parameters);
      return Array.from(document.getElementsByTagName('Tesis')).map((item) => ({
        registroDigital: text(item, 'IUS'),
        rubro: text(item, 'Rubro'),
        epoca: text(item, 'Epoca'),
        instancia: text(item, 'Instancia'),
        publicacion: text(item, 'Publicacion') || text(item, 'FechaPublicacion'),
        materia: text(item, 'MateriasTesis'),
        officialSourceUrl: text(item, 'RutaPdf'),
      }));
    },
    async getThesisDetail(parameters: Record<string, string | number>): Promise<ScjnSoapThesis[]> {
      const document = await call(tesisUrl, 'ObtenerDetalle', parameters);
      return Array.from(document.getElementsByTagName('Tesis')).map((item) => ({
        registroDigital: text(item, 'IUS'), rubro: text(item, 'Rubro'), epoca: text(item, 'Epoca'),
        instancia: text(item, 'Instancia'), publicacion: text(item, 'Publicacion') || text(item, 'FechaPublicacion'),
        materia: text(item, 'MateriasTesis'), officialSourceUrl: text(item, 'RutaPdf'),
      }));
    },
  };
}
