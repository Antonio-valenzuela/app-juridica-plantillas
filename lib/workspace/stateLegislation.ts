import { withOfficialRetry, type FetchLike } from '@/lib/legal-engine/legal-research/officialFetch';

/**
 * Legislación estatal vigente desde la API pública de la SCJN (Sistema de Consulta de Ordenamientos).
 * MEDIDO 2026-10-13: POST `SCOW-API/api/SCOW/BusquedaFrase` → 200 JSON con `resultados` y facetas por estado.
 * La API no ofrece un enlace profundo estable al ordenamiento (`SCOW/DetalleOrdenamiento` → 404), así que
 * la ficha enlaza la fuente oficial del Congreso del estado para consultar el texto.
 */
export const SCOW_SEARCH_URL = 'https://legislacion.scjn.gob.mx/SCOW-API/api/SCOW/BusquedaFrase';

export const STATE_OFFICIAL_CATALOGS: Record<string, string> = {
  JALISCO: 'https://congresoweb.congresojal.gob.mx/BibliotecaVirtual/busquedasleyes/ListadoNvo.cfm',
};

export interface StateLegislationItem {
  id: string;
  title: string;
  state: string;
  validity: string;
  category?: string;
  matter?: string;
  /** Primera línea del último decreto de reforma reportado por la SCJN. */
  lastReformDecree?: string;
  /** Fecha de publicación de esa reforma (AAAA-MM-DD). */
  lastReformPublished?: string;
  officialUrl: string;
  source: 'SCJN_SCOW';
}

interface ScowResult {
  idOrdenamiento?: string | number;
  ordenamiento?: string;
  vigencia?: string;
  estado?: string;
  categoriaOrdenamiento?: string;
  materia?: string;
  reformaExtracto?: string;
  fechaPublicado?: string;
}

const clean = (value: unknown) => String(value ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function isoFromScow(value?: string): string | undefined {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}

/** El título llega en mayúsculas: se presenta en formato de oración, conservando siglas cortas. */
function sentenceCase(value: string): string {
  const lower = value.toLocaleLowerCase('es-MX');
  return lower.charAt(0).toLocaleUpperCase('es-MX') + lower.slice(1)
    .replace(/\b(estado de)\s+([a-záéíóúñ])/g, (_whole, prep: string, first: string) => `${prep} ${first.toLocaleUpperCase('es-MX')}`);
}

export function mapScowResults(payload: unknown, state: string): StateLegislationItem[] {
  const results = Array.isArray((payload as { resultados?: unknown })?.resultados) ? (payload as { resultados: ScowResult[] }).resultados : [];
  const officialUrl = STATE_OFFICIAL_CATALOGS[state] ?? 'https://legislacion.scjn.gob.mx/';
  return results
    .filter((item) => item.idOrdenamiento && clean(item.ordenamiento))
    .map((item) => ({
      id: String(item.idOrdenamiento),
      title: sentenceCase(clean(item.ordenamiento)),
      state: clean(item.estado) || state,
      validity: clean(item.vigencia) || 'NO INFORMADA',
      category: clean(item.categoriaOrdenamiento) || undefined,
      matter: clean(item.materia) || undefined,
      lastReformDecree: clean(item.reformaExtracto?.split(/\r?\n/)[0]) || undefined,
      lastReformPublished: isoFromScow(item.fechaPublicado),
      officialUrl,
      source: 'SCJN_SCOW' as const,
    }));
}

export async function searchStateLegislation(query: string, state = 'JALISCO', fetcher: FetchLike = fetch): Promise<{ items: StateLegislationItem[]; error?: string }> {
  const q = query.trim().slice(0, 120);
  if (q.length < 3) return { items: [] };
  const request = withOfficialRetry(fetcher);
  try {
    const response = await request(SCOW_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, */*', 'User-Agent': 'LexPlantillas/1.0' },
      body: JSON.stringify({
        q, tipoBusqueda: 1, tipoPublicacion: 1, ambitoF: '', categoriaF: '', vigenciaF: 'VIGENTE',
        entidadFederativaF: state, materiaF: '', municipioF: '', fechaPublicacionInicio: '', fechaPublicacionFin: '',
        numeroPagina: 1, tamanioPagina: 20, consultaArticulos: 0,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { items: [], error: `SCOW_HTTP_${response.status}` };
    return { items: mapScowResults(await response.json(), state) };
  } catch (error) {
    return { items: [], error: error instanceof Error ? error.message : 'SCOW_ERROR' };
  }
}
