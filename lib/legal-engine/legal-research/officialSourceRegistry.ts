/**
 * Registro de fuentes jurídicas: qué se consulta de forma automatizada, con qué adaptador y qué
 * queda como consulta manual. El estado se MIDIÓ con peticiones anónimas el 2026-10-13
 * (ver audit/fase4/fuentes-oficiales.md); vuelve a medir antes de cambiar `access`.
 *
 * Regla: una fuente protegida por controles anti-bot, sesión o CAPTCHA es `MANUAL_ONLY` aunque
 * técnicamente se pudiera automatizar. Las fuentes no oficiales nunca verifican una cita.
 */

export type OfficialSourceAccess =
  /** Endpoint público de la propia institución, consultado con límites y caché. */
  | 'OFFICIAL_PUBLIC_ENDPOINT'
  /** Página o archivo público estático de la institución. */
  | 'OFFICIAL_PUBLIC_DOCUMENT'
  /** Sin mecanismo automatizable autorizado: enlace para consulta humana. */
  | 'MANUAL_ONLY'
  /** Fuente no oficial: solo apoyo secundario, nunca verifica. */
  | 'SECONDARY_UNOFFICIAL';

export interface OfficialSourceEntry {
  sourceId: string;
  institution: string;
  jurisdiction: 'federal' | 'jalisco' | 'otra';
  resourceTypes: string[];
  access: OfficialSourceAccess;
  /** Id del adaptador en `legal-research/adapters`, si existe. */
  adapterId: string | null;
  manualUrl: string;
  measured: { at: string; result: string };
  limitations: string[];
}

export const OFFICIAL_SOURCES_MEASURED_AT = '2026-10-13';

export const OFFICIAL_SOURCE_REGISTRY: readonly OfficialSourceEntry[] = [
  {
    sourceId: 'DOF_SIDOF',
    institution: 'Diario Oficial de la Federación (SEGOB)',
    jurisdiction: 'federal',
    resourceTypes: ['decreto', 'reforma', 'acuerdo', 'publicación diaria'],
    access: 'OFFICIAL_PUBLIC_ENDPOINT',
    adapterId: 'DOF',
    manualUrl: 'https://dof.gob.mx/',
    measured: { at: OFFICIAL_SOURCES_MEASURED_AT, result: 'GET /dof/sidof/notas/{dd-mm-aaaa} → 200 JSON con notas del día; robots.txt solo excluye notas específicas.' },
    limitations: ['Endpoint público no documentado como API: el esquema se valida en cada respuesta.'],
  },
  {
    sourceId: 'DIPUTADOS_LEYES_FEDERALES',
    institution: 'Cámara de Diputados — Leyes Federales Vigentes',
    jurisdiction: 'federal',
    resourceTypes: ['ley', 'código', 'reglamento', 'última reforma'],
    access: 'OFFICIAL_PUBLIC_DOCUMENT',
    adapterId: 'FEDERAL_LEGISLATION',
    manualUrl: 'https://www.diputados.gob.mx/LeyesBiblio/index.htm',
    measured: { at: OFFICIAL_SOURCES_MEASURED_AT, result: 'index.htm → 200 HTML; PDF de Ley de Amparo y LFT descargados y cotejados (portada con «Última reforma»).' },
    limitations: ['El texto vigente hoy puede no ser el aplicable a la fecha del acto: se registra la fecha de última reforma.'],
  },
  {
    sourceId: 'SCJN_LEGISLACION_SCOW',
    institution: 'SCJN — Sistema de Consulta de Ordenamientos',
    jurisdiction: 'federal',
    resourceTypes: ['ley', 'código', 'ordenamiento estatal'],
    access: 'OFFICIAL_PUBLIC_ENDPOINT',
    adapterId: 'SCJN',
    manualUrl: 'https://legislacion.scjn.gob.mx/',
    measured: { at: OFFICIAL_SOURCES_MEASURED_AT, result: 'SCOW-API BusquedaFrase → 405 a GET (el servicio existe y espera POST); contrato POST no revalidado en esta medición.' },
    limitations: ['Revalidar el contrato POST antes de depender de él.'],
  },
  {
    sourceId: 'SCJN_SJF_TESIS',
    institution: 'SCJN — Semanario Judicial de la Federación (tesis y jurisprudencia)',
    jurisdiction: 'federal',
    resourceTypes: ['tesis aislada', 'jurisprudencia', 'precedente'],
    access: 'MANUAL_ONLY',
    adapterId: null,
    manualUrl: 'https://sjf2.scjn.gob.mx/busqueda-principal-tesis',
    measured: { at: OFFICIAL_SOURCES_MEASURED_AT, result: 'sjf2 responde con desafío Incapsula (robots noindex,nofollow); servicio SOAP wsTesis.asmx → 302 en bucle hacia sí mismo.' },
    limitations: [
      'Protegido por control anti-bot: no se automatiza ni se elude.',
      'Toda tesis citada debe verificarse manualmente (registro digital, órgano, época, tipo y vigencia).',
      'El adaptador SOAP existente queda inutilizable mientras persista la protección.',
    ],
  },
  {
    sourceId: 'SCJN_BUSCADOR_JURIDICO',
    institution: 'SCJN — Buscador Jurídico',
    jurisdiction: 'federal',
    resourceTypes: ['sentencia', 'tesis', 'legislación'],
    access: 'MANUAL_ONLY',
    adapterId: null,
    manualUrl: 'https://bj.scjn.gob.mx/',
    measured: { at: OFFICIAL_SOURCES_MEASURED_AT, result: '302 en bucle hacia sí mismo para clientes sin sesión de navegador.' },
    limitations: ['Requiere navegador con sesión: solo consulta manual.'],
  },
  {
    sourceId: 'TEPJF_IUS_ELECTORAL',
    institution: 'Tribunal Electoral del PJF — IUS Electoral',
    jurisdiction: 'federal',
    resourceTypes: ['jurisprudencia electoral', 'tesis electoral'],
    access: 'MANUAL_ONLY',
    adapterId: null,
    manualUrl: 'https://www.te.gob.mx/iuse/',
    measured: { at: OFFICIAL_SOURCES_MEASURED_AT, result: '301 → validate.perfdrive.com (Radware Bot Manager).' },
    limitations: ['Protegido por control anti-bot: no se automatiza ni se elude.'],
  },
  {
    sourceId: 'JALISCO_CONGRESO_LEGISLACION',
    institution: 'Congreso del Estado de Jalisco — Biblioteca Virtual',
    jurisdiction: 'jalisco',
    resourceTypes: ['ley', 'código', 'reforma'],
    access: 'OFFICIAL_PUBLIC_DOCUMENT',
    adapterId: 'STATE_OFFICIAL',
    manualUrl: 'https://congresoweb.congresojal.gob.mx/BibliotecaVirtual/busquedasleyes/ListadoNvo.cfm',
    measured: { at: OFFICIAL_SOURCES_MEASURED_AT, result: 'ListadoNvo.cfm → 200 HTML.' },
    limitations: ['Confirmar si el asunto se rige por el CPC de Jalisco o por el Código Nacional de Procedimientos Civiles y Familiares.'],
  },
  {
    sourceId: 'JALISCO_PERIODICO_OFICIAL',
    institution: 'Periódico Oficial «El Estado de Jalisco»',
    jurisdiction: 'jalisco',
    resourceTypes: ['publicación oficial', 'reforma', 'acuerdo'],
    access: 'OFFICIAL_PUBLIC_ENDPOINT',
    adapterId: 'STATE_OFFICIAL',
    manualUrl: 'https://periodicooficial.jalisco.gob.mx/',
    measured: { at: OFFICIAL_SOURCES_MEASURED_AT, result: 'apiperiodico …/api/newspaper/public → 422 sin parámetros (el servicio existe y valida la consulta).' },
    limitations: ['Contrato de parámetros no revalidado en esta medición.'],
  },
  {
    sourceId: 'CORPUS_IURIS',
    institution: 'Corpus Iuris (no oficial)',
    jurisdiction: 'otra',
    resourceTypes: ['búsqueda secundaria'],
    access: 'SECONDARY_UNOFFICIAL',
    adapterId: 'CORPUS_IURIS',
    manualUrl: 'https://corpusiuris.mx/',
    measured: { at: OFFICIAL_SOURCES_MEASURED_AT, result: 'No medido: fuente no oficial.' },
    limitations: ['Solo SECONDARY_SUPPORT: nunca verifica una cita ni sustituye al texto oficial.'],
  },
  {
    sourceId: 'LEX_MX',
    institution: 'LexMX — catálogo local de leyes (no oficial)',
    jurisdiction: 'otra',
    resourceTypes: ['búsqueda secundaria'],
    access: 'SECONDARY_UNOFFICIAL',
    adapterId: 'LEX_MX',
    manualUrl: 'https://www.diputados.gob.mx/LeyesBiblio/index.htm',
    measured: { at: OFFICIAL_SOURCES_MEASURED_AT, result: 'No medido: catálogo local en disco; la consulta manual remite al texto oficial.' },
    limitations: ['Solo SECONDARY_SUPPORT: nunca verifica una cita ni sustituye al texto oficial.'],
  },
];

export function manualConsultationSources(): OfficialSourceEntry[] {
  return OFFICIAL_SOURCE_REGISTRY.filter((entry) => entry.access === 'MANUAL_ONLY');
}
