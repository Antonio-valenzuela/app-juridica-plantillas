/**
 * Strategies documentales dedicadas.
 *
 * La strategy describe el contrato estructural de una salida; no ejecuta un
 * pipeline alterno ni decide datos jurídicos que no estén confirmados.
 */

export const CIVIL_DEMAND_REQUIRED_SECTION_IDS = [
  'destinatario',
  'comparecencia',
  'personalidad',
  'identificacion_partes',
  'via_accion',
  'prestaciones',
  'hechos',
  'derecho',
  'pruebas',
  'petitorios',
  'firma',
] as const;

export type CivilDemandRequiredSectionId = (typeof CIVIL_DEMAND_REQUIRED_SECTION_IDS)[number];

export const CIVIL_DEMAND_REQUIRED_FIELD_IDS = [
  'actor',
  'demandado',
  'destinatario',
  'personalidad',
  'jurisdiccion',
  'procedimiento',
  'via',
  'accion',
  'prestaciones',
  'hechos',
  'fundamentacion',
  'pruebas',
  'petitorios',
  'firma',
] as const;

export type CivilDemandRequiredFieldId = (typeof CIVIL_DEMAND_REQUIRED_FIELD_IDS)[number];

export const COMMERCIAL_ENFORCEMENT_REQUIRED_SECTION_IDS = [
  'destinatario',
  'comparecencia',
  'personalidad',
  'identificacion_partes',
  'via_accion',
  'documento_base',
  'obligaciones_y_cantidades',
  'prestaciones',
  'hechos',
  'derecho',
  'pruebas',
  'petitorios',
  'firma',
] as const;

export type CommercialEnforcementRequiredSectionId = (typeof COMMERCIAL_ENFORCEMENT_REQUIRED_SECTION_IDS)[number];

export const COMMERCIAL_ENFORCEMENT_REQUIRED_FIELD_IDS = [
  'creditor',
  'debtor',
  'personality',
  'court',
  'jurisdiction',
  'procedure',
  'action',
  'instrument',
  'enforceability',
  'maturity',
  'original_amount',
  'payments',
  'confirmed_balance',
  'interest',
  'facts',
  'claims',
  'evidence',
  'requests',
  'legal_basis',
  'signature',
] as const;

export type CommercialEnforcementRequiredFieldId = (typeof COMMERCIAL_ENFORCEMENT_REQUIRED_FIELD_IDS)[number];

export interface DocumentStrategyDefinition {
  id: string;
  documentType: string;
  matter:
    | 'CIVIL'
    | 'MERCANTIL'
    | 'FAMILIAR'
    | 'LABORAL'
    | 'CONSTITUCIONAL'
    | 'AMPARO'
    | 'ADMINISTRATIVO'
    | 'FISCAL'
    | 'PENAL'
    | 'AGRARIO'
    | 'INMOBILIARIO'
    | 'CORPORATIVO'
    | 'CONTRACTUAL'
    | 'PROPIEDAD_INTELECTUAL'
    | 'GENERAL';
  procedure: string;
  role:
    | 'actor'
    | 'demandado'
    | 'parte_interesada'
    | 'quejoso'
    | 'recurrente'
    | 'promovente'
    | 'defensor'
    | 'imputado'
    | 'victima'
    | 'denunciante'
    | 'solicitante'
    | 'contribuyente'
    | 'ejidatario'
    | 'arrendador'
    | 'arrendatario'
    | (string & {});
  dedicated: true;
  requiredFieldIds: readonly string[];
  requiredSectionIds: readonly string[];
  allowsNewWriting: boolean;
}

export const DEMANDA_ORDINARIA_CIVIL_STRATEGY: DocumentStrategyDefinition = Object.freeze({
  id: 'demanda_ordinaria_civil',
  documentType: 'demanda_ordinaria_civil',
  matter: 'CIVIL',
  procedure: 'ORDINARIO_CIVIL',
  role: 'actor',
  dedicated: true,
  requiredFieldIds: CIVIL_DEMAND_REQUIRED_FIELD_IDS,
  requiredSectionIds: CIVIL_DEMAND_REQUIRED_SECTION_IDS,
  allowsNewWriting: true,
});

export const COMMERCIAL_ENFORCEMENT_STRATEGY: DocumentStrategyDefinition = Object.freeze({
  id: 'demanda_ejecutiva_mercantil',
  documentType: 'demanda_ejecutiva_mercantil',
  matter: 'MERCANTIL',
  procedure: 'EJECUTIVO_MERCANTIL',
  role: 'actor',
  dedicated: true,
  requiredFieldIds: COMMERCIAL_ENFORCEMENT_REQUIRED_FIELD_IDS,
  requiredSectionIds: COMMERCIAL_ENFORCEMENT_REQUIRED_SECTION_IDS,
  allowsNewWriting: false,
});

const RESPONSE_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'objeto',
  'hechos',
  'prestaciones',
  'excepciones_defensas',
  'pruebas',
  'argumentos',
  'petitorios',
  'firma',
] as const;

const RECONVENTION_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'objeto',
  'hechos',
  'prestaciones_reconvencionales',
  'derecho',
  'pruebas',
  'petitorios',
  'firma',
] as const;

const RECONVENTION_RESPONSE_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'objeto',
  'contestacion_de_la_reconvencion',
  'excepciones_defensas',
  'pruebas',
  'argumentos',
  'petitorios',
  'firma',
] as const;

const EXCEPTIONS_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'objeto',
  'excepciones_defensas',
  'hechos',
  'pruebas',
  'petitorios',
  'firma',
] as const;

const CIVIL_RESPONSE_FIELD_IDS = [
  'actor', 'demandado', 'destinatario', 'expediente', 'personalidad',
  'hechos', 'prestaciones', 'excepciones', 'pruebas', 'petitorios',
] as const;

const RECONVENTION_FIELD_IDS = [
  'parte_reconviniente', 'demandado_reconvencional', 'destinatario', 'expediente',
  'personalidad', 'conexidad', 'hechos_reconvencion', 'prestaciones_reconvencionales',
  'pruebas', 'petitorios',
] as const;

const RECONVENTION_RESPONSE_FIELD_IDS = [
  'demandado_reconvencional', 'actor_reconvencional', 'destinatario', 'expediente',
  'personalidad', 'hechos_reconvencion', 'excepciones', 'pruebas', 'petitorios',
] as const;

const EXCEPTIONS_FIELD_IDS = [
  'actor', 'demandado', 'destinatario', 'expediente', 'personalidad',
  'hechos', 'excepciones_mercantiles', 'pruebas', 'petitorios',
] as const;

const EVIDENCE_OFFERING_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'objeto_del_ofrecimiento', 'pruebas_ofrecidas', 'hechos_que_se_pretenden_acreditar', 'petitorios', 'firma',
] as const;
const EVIDENCE_OBJECTION_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'objeto_de_la_objecion', 'pruebas_objetadas', 'motivos_de_objecion', 'petitorios', 'firma',
] as const;
const EVIDENCE_HEARING_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'objeto_de_la_vista', 'manifestaciones_sobre_pruebas', 'hechos_relacionados', 'petitorios', 'firma',
] as const;
const ARGUMENT_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'antecedentes_y_hechos_probados', 'valoracion_de_pruebas', 'argumentos', 'petitorios', 'firma',
] as const;

const EVIDENCE_OFFERING_FIELD_IDS = [
  'actor', 'demandado', 'destinatario', 'expediente', 'personalidad', 'pruebas', 'hechos', 'petitorios',
] as const;
const EVIDENCE_OBJECTION_FIELD_IDS = [
  'actor', 'demandado', 'destinatario', 'expediente', 'personalidad', 'pruebas', 'motivos_objecion', 'petitorios',
] as const;
const EVIDENCE_HEARING_FIELD_IDS = [
  'actor', 'demandado', 'destinatario', 'expediente', 'personalidad', 'pruebas', 'hechos', 'petitorios',
] as const;
const ARGUMENT_FIELD_IDS = [
  'actor', 'demandado', 'destinatario', 'expediente', 'personalidad', 'hechos', 'pruebas', 'argumentos', 'petitorios',
] as const;

function responseStrategy(
  id: string,
  matter: DocumentStrategyDefinition['matter'],
  procedure: string,
  role: DocumentStrategyDefinition['role'],
  requiredFieldIds: readonly string[],
  requiredSectionIds: readonly string[],
  allowsNewWriting = false,
): DocumentStrategyDefinition {
  return Object.freeze({
    id,
    documentType: id,
    matter,
    procedure,
    role,
    dedicated: true as const,
    requiredFieldIds,
    requiredSectionIds,
    allowsNewWriting,
  });
}

export const CIVIL_CONTESTATION_STRATEGY = responseStrategy(
  'contestacion_demanda_civil', 'CIVIL', 'CONTESTACION_DEMANDA_CIVIL', 'demandado', CIVIL_RESPONSE_FIELD_IDS, RESPONSE_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_CONTESTATION_STRATEGY = responseStrategy(
  'contestacion_demanda_mercantil', 'MERCANTIL', 'CONTESTACION_DEMANDA_MERCANTIL', 'demandado', CIVIL_RESPONSE_FIELD_IDS, RESPONSE_REQUIRED_SECTION_IDS,
);

export const CIVIL_ORAL_CONTESTATION_STRATEGY = responseStrategy(
  'contestacion_demanda_oral_civil', 'CIVIL', 'CONTESTACION_ORAL_CIVIL', 'demandado', CIVIL_RESPONSE_FIELD_IDS, RESPONSE_REQUIRED_SECTION_IDS,
);
export const CIVIL_LEASE_CONTESTATION_STRATEGY = responseStrategy(
  'contestacion_demanda_arrendamiento', 'CIVIL', 'CONTESTACION_ARRENDAMIENTO', 'demandado', [...CIVIL_RESPONSE_FIELD_IDS, 'contrato_arrendamiento'], RESPONSE_REQUIRED_SECTION_IDS,
);
export const CIVIL_RECONVENTION_STRATEGY = responseStrategy(
  'reconvencion_civil', 'CIVIL', 'RECONVENCION_CIVIL', 'actor', RECONVENTION_FIELD_IDS, RECONVENTION_REQUIRED_SECTION_IDS,
);
export const CIVIL_RECONVENTION_RESPONSE_STRATEGY = responseStrategy(
  'contestacion_reconvencion_civil', 'CIVIL', 'CONTESTACION_RECONVENCION_CIVIL', 'demandado', RECONVENTION_RESPONSE_FIELD_IDS, RECONVENTION_RESPONSE_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_RECONVENTION_STRATEGY = responseStrategy(
  'reconvencion_mercantil', 'MERCANTIL', 'RECONVENCION_MERCANTIL', 'actor', RECONVENTION_FIELD_IDS, RECONVENTION_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_RECONVENTION_RESPONSE_STRATEGY = responseStrategy(
  'contestacion_reconvencion_mercantil', 'MERCANTIL', 'CONTESTACION_RECONVENCION_MERCANTIL', 'demandado', RECONVENTION_RESPONSE_FIELD_IDS, RECONVENTION_RESPONSE_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_EXCEPTIONS_STRATEGY = responseStrategy(
  'excepciones_mercantiles', 'MERCANTIL', 'EXCEPCIONES_MERCANTILES', 'demandado', EXCEPTIONS_FIELD_IDS, EXCEPTIONS_REQUIRED_SECTION_IDS,
);

export const CIVIL_EVIDENCE_OFFERING_STRATEGY = responseStrategy(
  'ofrecimiento_pruebas_civil', 'CIVIL', 'OFRECIMIENTO_PRUEBAS_CIVIL', 'parte_interesada', EVIDENCE_OFFERING_FIELD_IDS, EVIDENCE_OFFERING_REQUIRED_SECTION_IDS,
);
export const CIVIL_EVIDENCE_OBJECTION_STRATEGY = responseStrategy(
  'objecion_pruebas_civil', 'CIVIL', 'OBJECION_PRUEBAS_CIVIL', 'parte_interesada', EVIDENCE_OBJECTION_FIELD_IDS, EVIDENCE_OBJECTION_REQUIRED_SECTION_IDS,
);
export const CIVIL_EVIDENCE_HEARING_STRATEGY = responseStrategy(
  'desahogo_vista_civil', 'CIVIL', 'DESAHOGO_VISTA_CIVIL', 'parte_interesada', EVIDENCE_HEARING_FIELD_IDS, EVIDENCE_HEARING_REQUIRED_SECTION_IDS,
);
export const CIVIL_ARGUMENTS_STRATEGY = responseStrategy(
  'alegatos_civil', 'CIVIL', 'ALEGATOS_CIVIL', 'parte_interesada', ARGUMENT_FIELD_IDS, ARGUMENT_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_EVIDENCE_OFFERING_STRATEGY = responseStrategy(
  'ofrecimiento_pruebas_mercantil', 'MERCANTIL', 'OFRECIMIENTO_PRUEBAS_MERCANTIL', 'parte_interesada', EVIDENCE_OFFERING_FIELD_IDS, EVIDENCE_OFFERING_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_EVIDENCE_OBJECTION_STRATEGY = responseStrategy(
  'objecion_documentos_mercantil', 'MERCANTIL', 'OBJECION_DOCUMENTOS_MERCANTIL', 'parte_interesada', EVIDENCE_OBJECTION_FIELD_IDS, EVIDENCE_OBJECTION_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_ARGUMENTS_STRATEGY = responseStrategy(
  'alegatos_mercantil', 'MERCANTIL', 'ALEGATOS_MERCANTIL', 'parte_interesada', ARGUMENT_FIELD_IDS, ARGUMENT_REQUIRED_SECTION_IDS,
);

const INCIDENTE_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'objeto', 'hechos', 'pruebas', 'argumentos', 'petitorios', 'firma',
] as const;

const INCIDENTE_FIELD_IDS = [
  'actor', 'demandado', 'destinatario', 'expediente', 'personalidad', 'objeto', 'hechos', 'pruebas', 'argumentos', 'petitorios',
] as const;

export const CIVIL_INCIDENTE_NULIDAD_STRATEGY = responseStrategy(
  'incidente_nulidad_actuaciones', 'CIVIL', 'INCIDENTE_NULIDAD_ACTUACIONES', 'parte_interesada', INCIDENTE_FIELD_IDS, INCIDENTE_REQUIRED_SECTION_IDS,
);
export const CIVIL_INCIDENTE_LIQUIDACION_STRATEGY = responseStrategy(
  'incidente_liquidacion', 'CIVIL', 'INCIDENTE_LIQUIDACION', 'parte_interesada', INCIDENTE_FIELD_IDS, INCIDENTE_REQUIRED_SECTION_IDS,
);
export const CIVIL_INCIDENTE_COSTAS_STRATEGY = responseStrategy(
  'incidente_costas', 'CIVIL', 'INCIDENTE_COSTAS', 'parte_interesada', INCIDENTE_FIELD_IDS, INCIDENTE_REQUIRED_SECTION_IDS,
);
export const CIVIL_INCIDENTE_EJECUCION_STRATEGY = responseStrategy(
  'incidente_ejecucion', 'CIVIL', 'INCIDENTE_EJECUCION', 'parte_interesada', INCIDENTE_FIELD_IDS, INCIDENTE_REQUIRED_SECTION_IDS,
);
export const CIVIL_INCIDENTE_CUMPLIMIENTO_STRATEGY = responseStrategy(
  'incidente_cumplimiento', 'CIVIL', 'INCIDENTE_CUMPLIMIENTO', 'parte_interesada', INCIDENTE_FIELD_IDS, INCIDENTE_REQUIRED_SECTION_IDS,
);
export const CIVIL_INCIDENTE_PERSONALIDAD_STRATEGY = responseStrategy(
  'incidente_personalidad', 'CIVIL', 'INCIDENTE_PERSONALIDAD', 'parte_interesada', INCIDENTE_FIELD_IDS, INCIDENTE_REQUIRED_SECTION_IDS,
);
export const CIVIL_INCIDENTE_COMPETENCIA_STRATEGY = responseStrategy(
  'incidente_competencia', 'CIVIL', 'INCIDENTE_COMPETENCIA', 'parte_interesada', INCIDENTE_FIELD_IDS, INCIDENTE_REQUIRED_SECTION_IDS,
);
export const CIVIL_INCIDENTE_ACUMULACION_STRATEGY = responseStrategy(
  'incidente_acumulacion', 'CIVIL', 'INCIDENTE_ACUMULACION', 'parte_interesada', INCIDENTE_FIELD_IDS, INCIDENTE_REQUIRED_SECTION_IDS,
);

const CAUTELAR_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'objeto', 'hechos', 'pruebas', 'argumentos', 'petitorios', 'firma',
] as const;

const CAUTELAR_FIELD_IDS = [
  'actor', 'demandado', 'destinatario', 'expediente', 'personalidad', 'objeto', 'hechos', 'pruebas', 'argumentos', 'petitorios',
] as const;

export const CIVIL_SOLICITUD_MEDIDA_CAUTELAR_STRATEGY = responseStrategy(
  'solicitud_medida_cautelar_civil', 'CIVIL', 'SOLICITUD_MEDIDA_CAUTELAR_CIVIL', 'parte_interesada', CAUTELAR_FIELD_IDS, CAUTELAR_REQUIRED_SECTION_IDS,
);
export const CIVIL_PROVIDENCIA_PRECAUTORIA_STRATEGY = responseStrategy(
  'providencia_precautoria', 'CIVIL', 'PROVIDENCIA_PRECAUTORIA', 'parte_interesada', CAUTELAR_FIELD_IDS, CAUTELAR_REQUIRED_SECTION_IDS,
);
export const CIVIL_EMBARGO_PRECAUTORIO_STRATEGY = responseStrategy(
  'solicitud_embargo_precautorio', 'CIVIL', 'SOLICITUD_EMBARGO_PRECAUTORIO', 'parte_interesada', CAUTELAR_FIELD_IDS, CAUTELAR_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_PROVIDENCIAS_PRECAUTORIAS_STRATEGY = responseStrategy(
  'providencias_precautorias_mercantiles', 'MERCANTIL', 'PROVIDENCIAS_PRECAUTORIAS_MERCANTILES', 'parte_interesada', CAUTELAR_FIELD_IDS, CAUTELAR_REQUIRED_SECTION_IDS,
);

const RECURSO_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'resolucion', 'antecedentes', 'argumentos', 'petitorios', 'firma',
] as const;

const RECURSO_FIELD_IDS = [
  'actor', 'demandado', 'destinatario', 'expediente', 'personalidad', 'resolucion_recurrida', 'agravios', 'petitorios',
] as const;

export const CIVIL_APELACION_STRATEGY = responseStrategy(
  'apelacion_civil', 'CIVIL', 'APELACION_CIVIL', 'parte_interesada', RECURSO_FIELD_IDS, RECURSO_REQUIRED_SECTION_IDS,
);
export const CIVIL_REVOCACION_STRATEGY = responseStrategy(
  'revocacion_civil', 'CIVIL', 'REVOCACION_CIVIL', 'parte_interesada', RECURSO_FIELD_IDS, RECURSO_REQUIRED_SECTION_IDS,
);
export const CIVIL_ACLARACION_SENTENCIA_STRATEGY = responseStrategy(
  'aclaracion_sentencia_civil', 'CIVIL', 'ACLARACION_SENTENCIA_CIVIL', 'parte_interesada', RECURSO_FIELD_IDS, RECURSO_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_APELACION_STRATEGY = responseStrategy(
  'apelacion_mercantil', 'MERCANTIL', 'APELACION_MERCANTIL', 'parte_interesada', RECURSO_FIELD_IDS, RECURSO_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_REVOCACION_STRATEGY = responseStrategy(
  'revocacion_mercantil', 'MERCANTIL', 'REVOCACION_MERCANTIL', 'parte_interesada', RECURSO_FIELD_IDS, RECURSO_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_ACLARACION_SENTENCIA_STRATEGY = responseStrategy(
  'aclaracion_sentencia_mercantil', 'MERCANTIL', 'ACLARACION_SENTENCIA_MERCANTIL', 'parte_interesada', RECURSO_FIELD_IDS, RECURSO_REQUIRED_SECTION_IDS,
);

const EJECUCION_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'resolucion', 'antecedentes', 'argumentos', 'petitorios', 'firma',
] as const;

const EJECUCION_FIELD_IDS = [
  'actor', 'demandado', 'destinatario', 'expediente', 'personalidad', 'resolucion_base', 'antecedentes', 'argumentos', 'petitorios',
] as const;

export const CIVIL_SOLICITUD_EJECUCION_STRATEGY = responseStrategy(
  'solicitud_ejecucion_sentencia_civil', 'CIVIL', 'SOLICITUD_EJECUCION_SENTENCIA_CIVIL', 'parte_interesada', EJECUCION_FIELD_IDS, EJECUCION_REQUIRED_SECTION_IDS,
);
export const CIVIL_LIQUIDACION_SENTENCIA_STRATEGY = responseStrategy(
  'liquidacion_sentencia_civil', 'CIVIL', 'LIQUIDACION_SENTENCIA_CIVIL', 'parte_interesada', EJECUCION_FIELD_IDS, EJECUCION_REQUIRED_SECTION_IDS,
);
export const CIVIL_REQUERIMIENTO_CUMPLIMIENTO_STRATEGY = responseStrategy(
  'requerimiento_cumplimiento_sentencia', 'CIVIL', 'REQUERIMIENTO_CUMPLIMIENTO_SENTENCIA', 'parte_interesada', EJECUCION_FIELD_IDS, EJECUCION_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_EJECUCION_SENTENCIA_STRATEGY = responseStrategy(
  'ejecucion_sentencia_mercantil', 'MERCANTIL', 'EJECUCION_SENTENCIA_MERCANTIL', 'parte_interesada', EJECUCION_FIELD_IDS, EJECUCION_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_LIQUIDACION_STRATEGY = responseStrategy(
  'liquidacion_mercantil', 'MERCANTIL', 'LIQUIDACION_MERCANTIL', 'parte_interesada', EJECUCION_FIELD_IDS, EJECUCION_REQUIRED_SECTION_IDS,
);
export const MERCANTILE_EMBARGO_STRATEGY = responseStrategy(
  'embargo_mercantil', 'MERCANTIL', 'EMBARGO_MERCANTIL', 'parte_interesada', EJECUCION_FIELD_IDS, EJECUCION_REQUIRED_SECTION_IDS,
);

// ── MATERIA FAMILIAR — Familia A: Demandas Familiares ────────────────────────

/** Campo IDs comunes para demandas familiares. */
const FAMILIAR_DEMANDA_FIELD_IDS = [
  'promovente', 'contraparte', 'destinatario', 'expediente', 'personalidad',
  'parentesco', 'hechos', 'derecho', 'pruebas', 'petitorios',
] as const;

/** Secciones requeridas para demandas familiares contenciosas. */
const FAMILIAR_DEMANDA_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'objeto', 'hechos', 'derecho', 'pruebas', 'petitorios', 'firma',
] as const;

/** Campo IDs para alimentos. */
const FAMILIAR_ALIMENTOS_FIELD_IDS = [
  'acreedor_alimentario', 'deudor_alimentario', 'destinatario', 'expediente', 'personalidad',
  'necesidades', 'capacidad_economica', 'hechos', 'pruebas', 'petitorios',
] as const;

/** Secciones requeridas para alimentos. */
const FAMILIAR_ALIMENTOS_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'objeto', 'hechos', 'necesidades_y_capacidad', 'pruebas', 'petitorios', 'firma',
] as const;

/** Campo IDs para guarda y custodia / convivencia. */
const FAMILIAR_CUSTODIA_FIELD_IDS = [
  'promovente', 'contraparte', 'destinatario', 'expediente', 'personalidad',
  'menores', 'guarda_custodia', 'regimen_convivencia', 'hechos', 'pruebas', 'petitorios',
] as const;

/** Secciones requeridas para guarda, custodia y convivencia. */
const FAMILIAR_CUSTODIA_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'objeto', 'hechos', 'situacion_menores', 'pruebas', 'petitorios', 'firma',
] as const;

/** Campo IDs para filiación. */
const FAMILIAR_FILIACION_FIELD_IDS = [
  'promovente', 'contraparte', 'destinatario', 'expediente', 'personalidad',
  'parentesco', 'hechos', 'pruebas', 'petitorios',
] as const;

/** Secciones requeridas para filiación. */
const FAMILIAR_FILIACION_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'objeto', 'hechos', 'derecho', 'pruebas', 'petitorios', 'firma',
] as const;

/** Campo IDs para convenios familiares (no contenciosos). */
const FAMILIAR_CONVENIO_FIELD_IDS = [
  'promovente', 'coparticipe', 'destinatario', 'expediente', 'personalidad',
  'acuerdos', 'regimen_alimentos', 'regimen_convivencia', 'regimen_patrimonial', 'petitorios',
] as const;

/** Secciones requeridas para convenios familiares. */
const FAMILIAR_CONVENIO_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'objeto', 'acuerdos', 'regimen_alimentos', 'regimen_convivencia', 'petitorios', 'firma',
] as const;

/** Campo IDs para jurisdicción voluntaria / no contencioso. */
const FAMILIAR_VOLUNTARIO_FIELD_IDS = [
  'promovente', 'destinatario', 'expediente', 'personalidad',
  'objeto_solicitud', 'hechos', 'derecho', 'pruebas', 'petitorios',
] as const;

/** Secciones requeridas para actos no contenciosos. */
const FAMILIAR_VOLUNTARIO_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'objeto', 'hechos', 'derecho', 'pruebas', 'petitorios', 'firma',
] as const;

/** Campo IDs para incidentes de pensión alimenticia. */
const FAMILIAR_INCIDENTE_PENSION_FIELD_IDS = [
  'promovente', 'contraparte', 'destinatario', 'expediente', 'personalidad',
  'pension_actual', 'modificacion_solicitada', 'hechos_supervenientes', 'pruebas', 'petitorios',
] as const;

/** Secciones requeridas para incidentes de pensión. */
const FAMILIAR_INCIDENTE_PENSION_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'objeto', 'hechos_supervenientes', 'modificacion_solicitada', 'pruebas', 'petitorios', 'firma',
] as const;

/** Campo IDs para ejecución de convenio familiar. */
const FAMILIAR_EJECUCION_FIELD_IDS = [
  'promovente', 'obligado', 'destinatario', 'expediente', 'personalidad',
  'convenio_o_resolucion', 'incumplimiento', 'petitorios',
] as const;

/** Secciones requeridas para ejecución familiar. */
const FAMILIAR_EJECUCION_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'resolucion', 'antecedentes', 'incumplimiento', 'petitorios', 'firma',
] as const;

/** Campo IDs para recursos familiares (apelación). */
const FAMILIAR_RECURSO_FIELD_IDS = [
  'promovente', 'contraparte', 'destinatario', 'expediente', 'personalidad',
  'resolucion_recurrida', 'agravios', 'petitorios',
] as const;

/** Secciones requeridas para recursos familiares. */
const FAMILIAR_RECURSO_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'resolucion', 'antecedentes', 'argumentos', 'petitorios', 'firma',
] as const;

/** Campo IDs para alegatos familiares. */
const FAMILIAR_ALEGATOS_FIELD_IDS = [
  'promovente', 'contraparte', 'destinatario', 'expediente', 'personalidad',
  'hechos_probados', 'valoracion_pruebas', 'argumentos', 'petitorios',
] as const;

/** Secciones requeridas para alegatos familiares. */
const FAMILIAR_ALEGATOS_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'antecedentes_y_hechos_probados', 'valoracion_de_pruebas', 'argumentos', 'petitorios', 'firma',
] as const;

/** Campo IDs para contestaciones familiares. */
const FAMILIAR_CONTESTACION_FIELD_IDS = [
  'promovente', 'contraparte', 'destinatario', 'expediente', 'personalidad',
  'hechos_contestados', 'excepciones', 'pruebas', 'petitorios',
] as const;

/** Secciones requeridas para contestaciones familiares. */
const FAMILIAR_CONTESTACION_REQUIRED_SECTION_IDS = [
  'proemio', 'comparecencia', 'objeto', 'hechos', 'excepciones_defensas', 'pruebas', 'petitorios', 'firma',
] as const;

// ── FAMILIAR — Grupo Divorcio ────────────────────────────────────────────────
export const FAMILIAR_DEMANDA_DIVORCIO_STRATEGY = responseStrategy(
  'demanda_divorcio', 'FAMILIAR', 'DEMANDA_DIVORCIO', 'actor', FAMILIAR_DEMANDA_FIELD_IDS, FAMILIAR_DEMANDA_REQUIRED_SECTION_IDS, true,
);
export const FAMILIAR_CONVENIO_DIVORCIO_STRATEGY = responseStrategy(
  'convenio_divorcio', 'FAMILIAR', 'CONVENIO_DIVORCIO', 'parte_interesada', FAMILIAR_CONVENIO_FIELD_IDS, FAMILIAR_CONVENIO_REQUIRED_SECTION_IDS, true,
);
export const FAMILIAR_CONTESTACION_DIVORCIO_STRATEGY = responseStrategy(
  'contestacion_divorcio', 'FAMILIAR', 'CONTESTACION_DIVORCIO', 'demandado', FAMILIAR_CONTESTACION_FIELD_IDS, FAMILIAR_CONTESTACION_REQUIRED_SECTION_IDS,
);

// ── FAMILIAR — Grupo Alimentos ───────────────────────────────────────────────
export const FAMILIAR_DEMANDA_ALIMENTOS_STRATEGY = responseStrategy(
  'demanda_alimentos', 'FAMILIAR', 'DEMANDA_ALIMENTOS', 'actor', FAMILIAR_ALIMENTOS_FIELD_IDS, FAMILIAR_ALIMENTOS_REQUIRED_SECTION_IDS, true,
);
export const FAMILIAR_CONTESTACION_ALIMENTOS_STRATEGY = responseStrategy(
  'contestacion_alimentos', 'FAMILIAR', 'CONTESTACION_ALIMENTOS', 'demandado', FAMILIAR_CONTESTACION_FIELD_IDS, FAMILIAR_CONTESTACION_REQUIRED_SECTION_IDS,
);
export const FAMILIAR_SOLICITUD_ALIMENTOS_PROVISIONALES_STRATEGY = responseStrategy(
  'solicitud_alimentos_provisionales', 'FAMILIAR', 'SOLICITUD_ALIMENTOS_PROVISIONALES', 'parte_interesada', FAMILIAR_ALIMENTOS_FIELD_IDS, FAMILIAR_ALIMENTOS_REQUIRED_SECTION_IDS, true,
);

// ── FAMILIAR — Grupo Guarda y Convivencia ───────────────────────────────────
export const FAMILIAR_DEMANDA_GUARDA_CUSTODIA_STRATEGY = responseStrategy(
  'demanda_guarda_custodia', 'FAMILIAR', 'DEMANDA_GUARDA_CUSTODIA', 'actor', FAMILIAR_CUSTODIA_FIELD_IDS, FAMILIAR_CUSTODIA_REQUIRED_SECTION_IDS, true,
);
export const FAMILIAR_CONTESTACION_GUARDA_CUSTODIA_STRATEGY = responseStrategy(
  'contestacion_guarda_custodia', 'FAMILIAR', 'CONTESTACION_GUARDA_CUSTODIA', 'demandado', FAMILIAR_CONTESTACION_FIELD_IDS, FAMILIAR_CONTESTACION_REQUIRED_SECTION_IDS,
);
export const FAMILIAR_DEMANDA_REGIMEN_CONVIVENCIAS_STRATEGY = responseStrategy(
  'demanda_regimen_convivencias', 'FAMILIAR', 'DEMANDA_REGIMEN_CONVIVENCIAS', 'actor', FAMILIAR_CUSTODIA_FIELD_IDS, FAMILIAR_CUSTODIA_REQUIRED_SECTION_IDS, true,
);
export const FAMILIAR_MODIFICACION_CONVIVENCIAS_STRATEGY = responseStrategy(
  'modificacion_convivencias', 'FAMILIAR', 'MODIFICACION_CONVIVENCIAS', 'parte_interesada', FAMILIAR_CUSTODIA_FIELD_IDS, FAMILIAR_CUSTODIA_REQUIRED_SECTION_IDS, true,
);

// ── FAMILIAR — Grupo Filiación ───────────────────────────────────────────────
export const FAMILIAR_PERDIDA_PATRIA_POTESTAD_STRATEGY = responseStrategy(
  'perdida_patria_potestad', 'FAMILIAR', 'PERDIDA_PATRIA_POTESTAD', 'actor', FAMILIAR_FILIACION_FIELD_IDS, FAMILIAR_FILIACION_REQUIRED_SECTION_IDS, true,
);
export const FAMILIAR_RECONOCIMIENTO_PATERNIDAD_STRATEGY = responseStrategy(
  'reconocimiento_paternidad', 'FAMILIAR', 'RECONOCIMIENTO_PATERNIDAD', 'actor', FAMILIAR_FILIACION_FIELD_IDS, FAMILIAR_FILIACION_REQUIRED_SECTION_IDS, true,
);
export const FAMILIAR_DESCONOCIMIENTO_PATERNIDAD_STRATEGY = responseStrategy(
  'desconocimiento_paternidad', 'FAMILIAR', 'DESCONOCIMIENTO_PATERNIDAD', 'actor', FAMILIAR_FILIACION_FIELD_IDS, FAMILIAR_FILIACION_REQUIRED_SECTION_IDS, true,
);
export const FAMILIAR_ADOPCION_STRATEGY = responseStrategy(
  'adopcion', 'FAMILIAR', 'ADOPCION', 'actor', FAMILIAR_VOLUNTARIO_FIELD_IDS, FAMILIAR_VOLUNTARIO_REQUIRED_SECTION_IDS, true,
);
export const FAMILIAR_MEDIDAS_PROTECCION_STRATEGY = responseStrategy(
  'medidas_proteccion_familiar', 'FAMILIAR', 'MEDIDAS_PROTECCION_FAMILIAR', 'parte_interesada', FAMILIAR_DEMANDA_FIELD_IDS, FAMILIAR_DEMANDA_REQUIRED_SECTION_IDS, true,
);
export const FAMILIAR_CONVENIO_FAMILIAR_STRATEGY = responseStrategy(
  'convenio_familiar', 'FAMILIAR', 'CONVENIO_FAMILIAR', 'parte_interesada', FAMILIAR_CONVENIO_FIELD_IDS, FAMILIAR_CONVENIO_REQUIRED_SECTION_IDS, true,
);

// ── FAMILIAR — Grupo No Contencioso ─────────────────────────────────────────
export const FAMILIAR_JURISDICCION_VOLUNTARIA_STRATEGY = responseStrategy(
  'jurisdiccion_voluntaria_familiar', 'FAMILIAR', 'JURISDICCION_VOLUNTARIA_FAMILIAR', 'parte_interesada', FAMILIAR_VOLUNTARIO_FIELD_IDS, FAMILIAR_VOLUNTARIO_REQUIRED_SECTION_IDS, true,
);
export const FAMILIAR_LIQUIDACION_SOCIEDAD_CONYUGAL_STRATEGY = responseStrategy(
  'liquidacion_sociedad_conyugal', 'FAMILIAR', 'LIQUIDACION_SOCIEDAD_CONYUGAL', 'parte_interesada', FAMILIAR_CONVENIO_FIELD_IDS, FAMILIAR_CONVENIO_REQUIRED_SECTION_IDS, true,
);

// ── FAMILIAR — Grupo Incidentes Pensión ─────────────────────────────────────
export const FAMILIAR_INCIDENTE_MODIFICACION_PENSION_STRATEGY = responseStrategy(
  'incidente_modificacion_pension', 'FAMILIAR', 'INCIDENTE_MODIFICACION_PENSION', 'parte_interesada', FAMILIAR_INCIDENTE_PENSION_FIELD_IDS, FAMILIAR_INCIDENTE_PENSION_REQUIRED_SECTION_IDS, true,
);
export const FAMILIAR_INCIDENTE_REDUCCION_PENSION_STRATEGY = responseStrategy(
  'incidente_reduccion_pension', 'FAMILIAR', 'INCIDENTE_REDUCCION_PENSION', 'parte_interesada', FAMILIAR_INCIDENTE_PENSION_FIELD_IDS, FAMILIAR_INCIDENTE_PENSION_REQUIRED_SECTION_IDS, true,
);
export const FAMILIAR_INCIDENTE_INCREMENTO_PENSION_STRATEGY = responseStrategy(
  'incidente_incremento_pension', 'FAMILIAR', 'INCIDENTE_INCREMENTO_PENSION', 'parte_interesada', FAMILIAR_INCIDENTE_PENSION_FIELD_IDS, FAMILIAR_INCIDENTE_PENSION_REQUIRED_SECTION_IDS, true,
);

// ── FAMILIAR — Grupo Ejecución y Recursos ───────────────────────────────────
export const FAMILIAR_EJECUCION_CONVENIO_STRATEGY = responseStrategy(
  'ejecucion_convenio_familiar', 'FAMILIAR', 'EJECUCION_CONVENIO_FAMILIAR', 'parte_interesada', FAMILIAR_EJECUCION_FIELD_IDS, FAMILIAR_EJECUCION_REQUIRED_SECTION_IDS,
);
export const FAMILIAR_APELACION_STRATEGY = responseStrategy(
  'apelacion_familiar', 'FAMILIAR', 'APELACION_FAMILIAR', 'parte_interesada', FAMILIAR_RECURSO_FIELD_IDS, FAMILIAR_RECURSO_REQUIRED_SECTION_IDS,
);
export const FAMILIAR_ALEGATOS_STRATEGY = responseStrategy(
  'alegatos_familiar', 'FAMILIAR', 'ALEGATOS_FAMILIAR', 'parte_interesada', FAMILIAR_ALEGATOS_FIELD_IDS, FAMILIAR_ALEGATOS_REQUIRED_SECTION_IDS,
);

// ── MATERIA LABORAL — Constantes de campos y secciones ───────────────────────
const LABORAL_DEMANDA_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'condiciones_trabajo',
  'prestaciones',
  'hechos',
  'derecho',
  'pruebas',
  'petitorios',
  'firma',
] as const;
const LABORAL_DEMANDA_FIELD_IDS = [
  'trabajador',
  'patron',
  'puesto',
  'salario',
  'fecha_ingreso',
  'fecha_despido',
  'prestaciones',
  'hechos',
  'pruebas',
  'petitorios',
  'firma',
] as const;

const LABORAL_CONTESTACION_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'objeto',
  'hechos',
  'prestaciones',
  'excepciones_defensas',
  'pruebas',
  'argumentos',
  'petitorios',
  'firma',
] as const;
const LABORAL_CONTESTACION_FIELD_IDS = [
  'patron',
  'trabajador',
  'expediente',
  'hechos_contestados',
  'prestaciones_contestadas',
  'excepciones',
  'pruebas',
  'petitorios',
  'firma',
] as const;

const LABORAL_RECONVENCION_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'objeto',
  'prestaciones',
  'hechos',
  'derecho',
  'pruebas',
  'petitorios',
  'firma',
] as const;
const LABORAL_RECONVENCION_FIELD_IDS = [
  'patron',
  'trabajador',
  'prestaciones_reconvenidas',
  'hechos',
  'derecho',
  'pruebas',
  'petitorios',
  'firma',
] as const;

const LABORAL_CONTESTACION_RECONVENCION_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'objeto',
  'hechos',
  'excepciones_defensas',
  'pruebas',
  'petitorios',
  'firma',
] as const;
const LABORAL_CONTESTACION_RECONVENCION_FIELD_IDS = [
  'trabajador',
  'patron',
  'hechos_reconvencion',
  'defensas',
  'pruebas',
  'petitorios',
  'firma',
] as const;

const LABORAL_AMPLIACION_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'objeto',
  'hechos',
  'prestaciones',
  'derecho',
  'pruebas',
  'petitorios',
  'firma',
] as const;
const LABORAL_AMPLIACION_FIELD_IDS = [
  'trabajador',
  'patron',
  'hechos_nuevos',
  'prestaciones_adicionales',
  'pruebas',
  'petitorios',
  'firma',
] as const;

const LABORAL_PRUEBAS_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'objeto',
  'pruebas',
  'hechos',
  'petitorios',
  'firma',
] as const;
const LABORAL_PRUEBAS_FIELD_IDS = [
  'promovente',
  'contraparte',
  'pruebas_ofrecidas',
  'relacion_hechos',
  'petitorios',
  'firma',
] as const;

const LABORAL_OBJECION_PRUEBAS_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'objeto',
  'objecion_pruebas',
  'motivos_objecion',
  'petitorios',
  'firma',
] as const;
const LABORAL_OBJECION_PRUEBAS_FIELD_IDS = [
  'promovente',
  'contraparte',
  'pruebas_objetadas',
  'motivos_objecion',
  'petitorios',
  'firma',
] as const;

const LABORAL_DESAHOGO_PREVENCION_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'acuerdo_notificado',
  'desahogo_prevencion',
  'aclaraciones',
  'petitorios',
  'firma',
] as const;
const LABORAL_DESAHOGO_PREVENCION_FIELD_IDS = [
  'promovente',
  'autoridad',
  'acuerdo_prevencion',
  'aclaraciones',
  'petitorios',
  'firma',
] as const;

const LABORAL_ALEGATOS_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'antecedentes',
  'valoracion_pruebas',
  'argumentos',
  'petitorios',
  'firma',
] as const;
const LABORAL_ALEGATOS_FIELD_IDS = [
  'promovente',
  'contraparte',
  'pruebas_desahogadas',
  'conclusiones',
  'petitorios',
  'firma',
] as const;

const LABORAL_CUMPLIMIENTO_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'resolucion_referencia',
  'manifestacion_cumplimiento',
  'liquidacion',
  'petitorios',
  'firma',
] as const;
const LABORAL_CUMPLIMIENTO_FIELD_IDS = [
  'promovente',
  'resolucion_cumplida',
  'forma_cumplimiento',
  'petitorios',
  'firma',
] as const;

const LABORAL_EJECUCION_REQUIRED_SECTION_IDS = [
  'proemio',
  'comparecencia',
  'resolucion_firme',
  'incumplimiento',
  'requerimiento_pago',
  'petitorios',
  'firma',
] as const;
const LABORAL_EJECUCION_FIELD_IDS = [
  'actor',
  'demandado',
  'resolucion_firme',
  'monto_condena',
  'bienes_embargo',
  'petitorios',
  'firma',
] as const;

const LABORAL_AMPARO_DIRECTO_REQUIRED_SECTION_IDS = [
  'proemio',
  'quejoso_personalidad',
  'tercero_interesado',
  'autoridad_responsable',
  'acto_reclamado',
  'fecha_notificacion',
  'preceptos_violados',
  'conceptos_violacion',
  'petitorios',
  'firma',
] as const;
const LABORAL_AMPARO_DIRECTO_FIELD_IDS = [
  'quejoso',
  'tercero_interesado',
  'autoridad_responsable',
  'resolucion_reclamada',
  'conceptos_violacion',
  'petitorios',
  'firma',
] as const;

const LABORAL_AMPARO_INDIRECTO_REQUIRED_SECTION_IDS = [
  'proemio',
  'quejoso_personalidad',
  'tercero_interesado',
  'autoridad_responsable',
  'acto_reclamado',
  'antecedentes',
  'preceptos_violados',
  'conceptos_violacion',
  'suspension',
  'petitorios',
  'firma',
] as const;
const LABORAL_AMPARO_INDIRECTO_FIELD_IDS = [
  'quejoso',
  'tercero_interesado',
  'autoridad_responsable',
  'acto_reclamado',
  'conceptos_violacion',
  'suspension',
  'petitorios',
  'firma',
] as const;

// ── MATERIA LABORAL — Estrategias ───────────────────────────────────────────
export const LABORAL_DEMANDA_STRATEGY = responseStrategy(
  'demanda_laboral', 'LABORAL', 'ORDINARIO_LABORAL', 'actor', LABORAL_DEMANDA_FIELD_IDS, LABORAL_DEMANDA_REQUIRED_SECTION_IDS, true,
);
export const LABORAL_CONTESTACION_DEMANDA_STRATEGY = responseStrategy(
  'contestacion_demanda_laboral', 'LABORAL', 'ORDINARIO_LABORAL', 'demandado', LABORAL_CONTESTACION_FIELD_IDS, LABORAL_CONTESTACION_REQUIRED_SECTION_IDS,
);
export const LABORAL_RECONVENCION_STRATEGY = responseStrategy(
  'reconvencion_laboral', 'LABORAL', 'RECONVENCION_LABORAL', 'actor', LABORAL_RECONVENCION_FIELD_IDS, LABORAL_RECONVENCION_REQUIRED_SECTION_IDS, true,
);
export const LABORAL_CONTESTACION_RECONVENCION_STRATEGY = responseStrategy(
  'contestacion_reconvencion_laboral', 'LABORAL', 'CONTESTACION_RECONVENCION_LABORAL', 'demandado', LABORAL_CONTESTACION_RECONVENCION_FIELD_IDS, LABORAL_CONTESTACION_RECONVENCION_REQUIRED_SECTION_IDS,
);
export const LABORAL_AMPLIACION_DEMANDA_STRATEGY = responseStrategy(
  'ampliacion_demanda_laboral', 'LABORAL', 'AMPLIACION_LABORAL', 'actor', LABORAL_AMPLIACION_FIELD_IDS, LABORAL_AMPLIACION_REQUIRED_SECTION_IDS, true,
);
export const LABORAL_OFRECIMIENTO_PRUEBAS_STRATEGY = responseStrategy(
  'ofrecimiento_pruebas_laboral', 'LABORAL', 'PRUEBAS_LABORAL', 'parte_interesada', LABORAL_PRUEBAS_FIELD_IDS, LABORAL_PRUEBAS_REQUIRED_SECTION_IDS, true,
);
export const LABORAL_OBJECION_PRUEBAS_STRATEGY = responseStrategy(
  'objecion_pruebas_laboral', 'LABORAL', 'OBJECION_PRUEBAS_LABORAL', 'parte_interesada', LABORAL_OBJECION_PRUEBAS_FIELD_IDS, LABORAL_OBJECION_PRUEBAS_REQUIRED_SECTION_IDS,
);
export const LABORAL_DESAHOGO_PREVENCION_STRATEGY = responseStrategy(
  'desahogo_prevencion_laboral', 'LABORAL', 'PREVENCION_LABORAL', 'parte_interesada', LABORAL_DESAHOGO_PREVENCION_FIELD_IDS, LABORAL_DESAHOGO_PREVENCION_REQUIRED_SECTION_IDS, true,
);
export const LABORAL_ALEGATOS_STRATEGY = responseStrategy(
  'alegatos_laborales', 'LABORAL', 'ALEGATOS_LABORAL', 'parte_interesada', LABORAL_ALEGATOS_FIELD_IDS, LABORAL_ALEGATOS_REQUIRED_SECTION_IDS,
);
export const LABORAL_CUMPLIMIENTO_LAUDO_SENTENCIA_STRATEGY = responseStrategy(
  'cumplimiento_laudo_sentencia_laboral', 'LABORAL', 'CUMPLIMIENTO_LABORAL', 'parte_interesada', LABORAL_CUMPLIMIENTO_FIELD_IDS, LABORAL_CUMPLIMIENTO_REQUIRED_SECTION_IDS, true,
);
export const LABORAL_EJECUCION_SENTENCIA_STRATEGY = responseStrategy(
  'ejecucion_sentencia_laboral', 'LABORAL', 'EJECUCION_LABORAL', 'parte_interesada', LABORAL_EJECUCION_FIELD_IDS, LABORAL_EJECUCION_REQUIRED_SECTION_IDS, true,
);
export const LABORAL_DEMANDA_AMPARO_DIRECTO_STRATEGY = responseStrategy(
  'demanda_amparo_directo_laboral', 'LABORAL', 'AMPARO_DIRECTO_LABORAL', 'actor', LABORAL_AMPARO_DIRECTO_FIELD_IDS, LABORAL_AMPARO_DIRECTO_REQUIRED_SECTION_IDS, true,
);
export const LABORAL_DEMANDA_AMPARO_INDIRECTO_STRATEGY = responseStrategy(
  'demanda_amparo_indirecto_laboral', 'LABORAL', 'AMPARO_INDIRECTO_LABORAL', 'actor', LABORAL_AMPARO_INDIRECTO_FIELD_IDS, LABORAL_AMPARO_INDIRECTO_REQUIRED_SECTION_IDS, true,
);

// ── MATERIA CONSTITUCIONAL Y AMPARO ─────────────────────────────────────────
const AMPARO_BASE_FIELD_IDS = ['quejoso', 'autoridad_responsable', 'acto_reclamado', 'conceptos_violacion', 'petitorios', 'firma'] as const;

export const AMPARO_INDIRECTO_STRATEGY = responseStrategy(
  'demanda_amparo_indirecto', 'CONSTITUCIONAL', 'AMPARO_INDIRECTO', 'quejoso', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'acto_reclamado', 'antecedentes', 'conceptos_violacion', 'pruebas', 'suspension', 'petitorios', 'firma'], true,
);
export const AMPARO_DIRECTO_STRATEGY = responseStrategy(
  'demanda_amparo_directo', 'CONSTITUCIONAL', 'AMPARO_DIRECTO', 'quejoso', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'sentencia_impugnada', 'antecedentes', 'argumentos', 'pruebas', 'petitorios', 'firma'], true,
);
export const AMPARO_CONTESTACION_REVISION_EXTRAORDINARIA_STRATEGY = responseStrategy(
  'contestacion_revision_extraordinaria_amparo_directo', 'CONSTITUCIONAL', 'REVISION_EXTRAORDINARIA', 'impugnante', AMPARO_BASE_FIELD_IDS,
  ['identificacion_asunto', 'comparecencia', 'sentencia_impugnada', 'antecedentes', 'cuestion_constitucional_y_o_planteamiento_extraordinario', 'argumentos', 'fundamentos', 'petitorios', 'firma'], true,
);
export const AMPARO_RECURSO_REVISION_DIRECTO_STRATEGY = responseStrategy(
  'recurso_revision_amparo_directo', 'CONSTITUCIONAL', 'REVISION_AMPARO_DIRECTO', 'recurrente', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'sentencia_impugnada', 'antecedentes', 'excepciones_defensas', 'bloque_de_constitucionalidad', 'argumentos', 'pruebas', 'petitorios', 'firma'], true,
);
export const AMPARO_AMPLIACION_DEMANDA_STRATEGY = responseStrategy(
  'ampliacion_demanda_amparo', 'CONSTITUCIONAL', 'AMPLIACION_AMPARO', 'quejoso', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'oportunidad_procesal', 'nuevos_actos_reclamados', 'destinatario', 'hechos', 'conceptos_violacion', 'suspension', 'petitorios', 'firma'], true,
);
export const AMPARO_ADHESIVO_STRATEGY = responseStrategy(
  'amparo_adhesivo', 'CONSTITUCIONAL', 'AMPARO_ADHESIVO', 'promovente', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'oportunidad_procesal', 'adhesion_al_amparo_principal', 'argumentos', 'impugnacion_de_parte_perjudicial', 'petitorios', 'firma'], true,
);
export const AMPARO_SUSPENSION_PROVISIONAL_STRATEGY = responseStrategy(
  'solicitud_suspension_provisional', 'CONSTITUCIONAL', 'SUSPENSION_AMPARO', 'quejoso', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'acto_reclamado', 'procedencia_de_la_medida_cautelar', 'apariencia_del_buen_derecho', 'peligro_en_la_demora', 'garantia_ofrecida', 'petitorios', 'firma'], true,
);
export const AMPARO_SUSPENSION_DEFINITIVA_STRATEGY = responseStrategy(
  'solicitud_suspension_definitiva', 'CONSTITUCIONAL', 'SUSPENSION_AMPARO', 'quejoso', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'antecedentes', 'informes_previos_rendidos', 'argumentos', 'pruebas', 'petitorios', 'firma'], true,
);
export const AMPARO_ALEGATOS_STRATEGY = responseStrategy(
  'alegatos_amparo', 'CONSTITUCIONAL', 'ALEGATOS_AMPARO', 'quejoso', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'relacion_de_constancias', 'valoracion_de_informes_justificados', 'desvirtuacion_de_causales_de_improcedencia', 'argumentos', 'petitorios', 'firma'], true,
);
export const AMPARO_RECURSO_REVISION_STRATEGY = responseStrategy(
  'recurso_revision_amparo', 'CONSTITUCIONAL', 'RECURSO_REVISION', 'recurrente', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'resolucion', 'antecedentes', 'argumentos', 'petitorios', 'firma'], true,
);
export const AMPARO_RECURSO_QUEJA_STRATEGY = responseStrategy(
  'recurso_queja_amparo', 'CONSTITUCIONAL', 'RECURSO_QUEJA', 'recurrente', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'auto_recurrido_y_oportunidad', 'procedencia_del_recurso', 'argumentos', 'petitorios', 'firma'], true,
);
export const AMPARO_RECURSO_RECLAMACION_STRATEGY = responseStrategy(
  'recurso_reclamacion_amparo', 'CONSTITUCIONAL', 'RECURSO_RECLAMACION', 'recurrente', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'acuerdo_presidencial_recurrido', 'oportunidad_procesal', 'argumentos', 'petitorios', 'firma'], true,
);
export const AMPARO_RECURSO_INCONFORMIDAD_STRATEGY = responseStrategy(
  'recurso_inconformidad_amparo', 'CONSTITUCIONAL', 'RECURSO_INCONFORMIDAD', 'recurrente', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'auto_que_tiene_por_cumplida_la_ejecutoria', 'oportunidad_procesal', 'motivos_de_inconformidad_por_defecto_o_exceso', 'petitorios', 'firma'], true,
);
export const AMPARO_CUMPLIMIENTO_EJECUTORIA_STRATEGY = responseStrategy(
  'cumplimiento_ejecutoria_amparo', 'CONSTITUCIONAL', 'CUMPLIMIENTO_EJECUTORIA', 'promovente', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'ejecutoria_de_amparo_vinculante', 'actos_de_acatamiento_efectuados', 'constancias_exhibidas', 'petitorios', 'firma'], true,
);
export const AMPARO_PROMOCION_CUMPLIMIENTO_STRATEGY = responseStrategy(
  'promocion_cumplimiento_amparo', 'CONSTITUCIONAL', 'CUMPLIMIENTO_EJECUTORIA', 'quejoso', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'antecedentes', 'requerimientos_desatendidos_por_la_responsable', 'solicitud_de_medidas_de_apremio_y_multas', 'petitorios', 'firma'], true,
);
export const AMPARO_MANIFESTACIONES_CUMPLIMIENTO_STRATEGY = responseStrategy(
  'manifestaciones_cumplimiento_amparo', 'CONSTITUCIONAL', 'CUMPLIMIENTO_EJECUTORIA', 'quejoso', AMPARO_BASE_FIELD_IDS,
  ['proemio', 'acuerdo_que_da_vista_con_informe_de_cumplimiento', 'analisis_del_cumplimiento_defectuoso_o_incompleto', 'solicitud_de_no_tener_por_cumplida_la_ejecutoria', 'petitorios', 'firma'], true,
);

// ── MATERIA ADMINISTRATIVA Y FISCAL ─────────────────────────────────────────
const ADMINISTRATIVO_BASE_FIELD_IDS = ['actor', 'autoridad_demandada', 'resolucion_impugnada', 'conceptos_impugnacion', 'petitorios', 'firma'] as const;
const FISCAL_BASE_FIELD_IDS = ['contribuyente', 'autoridad_fiscal_demandada', 'resolucion_impugnada', 'credito_fiscal', 'conceptos_impugnacion', 'petitorios', 'firma'] as const;

export const ADMIN_DEMANDA_NULIDAD_STRATEGY = responseStrategy(
  'demanda_nulidad_administrativa', 'ADMINISTRATIVO', 'JUICIO_NULIDAD_ADMINISTRATIVO', 'actor', ADMINISTRATIVO_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'resolucion_impugnada', 'autoridad_demandada', 'hechos', 'conceptos_impugnacion', 'pruebas', 'petitorios', 'firma'], true,
);
export const ADMIN_CONTESTACION_NULIDAD_STRATEGY = responseStrategy(
  'contestacion_nulidad_administrativa', 'ADMINISTRATIVO', 'CONTESTACION_NULIDAD_ADMINISTRATIVA', 'demandado', ADMINISTRATIVO_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'excepciones_defensas', 'contestacion_hechos', 'refutacion_conceptos', 'pruebas', 'petitorios', 'firma'],
);
export const ADMIN_AMPLIACION_DEMANDA_STRATEGY = responseStrategy(
  'ampliacion_demanda_nulidad', 'ADMINISTRATIVO', 'AMPLIACION_NULIDAD_ADMINISTRATIVA', 'actor', ADMINISTRATIVO_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'oportunidad_procesal', 'nuevos_hechos', 'ampliacion_conceptos', 'pruebas', 'petitorios', 'firma'], true,
);
export const ADMIN_CONTESTACION_AMPLIACION_STRATEGY = responseStrategy(
  'contestacion_ampliacion_nulidad', 'ADMINISTRATIVO', 'CONTESTACION_AMPLIACION_NULIDAD', 'demandado', ADMINISTRATIVO_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'contestacion_hechos', 'refutacion_conceptos', 'pruebas', 'petitorios', 'firma'],
);
export const ADMIN_ALEGATOS_STRATEGY = responseStrategy(
  'alegatos_administrativos', 'ADMINISTRATIVO', 'ALEGATOS_ADMINISTRATIVOS', 'parte_interesada', ADMINISTRATIVO_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'valoracion_pruebas', 'alegatos_cierre', 'petitorios', 'firma'],
);
export const ADMIN_CUMPLIMIENTO_SENTENCIA_STRATEGY = responseStrategy(
  'cumplimiento_sentencia_administrativa', 'ADMINISTRATIVO', 'CUMPLIMIENTO_ADMINISTRATIVO', 'parte_interesada', ADMINISTRATIVO_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'resolucion_firme', 'manifestacion_cumplimiento', 'constancias_exhibidas', 'petitorios', 'firma'], true,
);
export const ADMIN_RECURSO_ADMINISTRATIVO_STRATEGY = responseStrategy(
  'recurso_administrativo', 'ADMINISTRATIVO', 'RECURSO_ADMINISTRATIVO', 'parte_interesada', ADMINISTRATIVO_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'resolucion_impugnada', 'antecedentes', 'motivos_inconformidad', 'pruebas', 'petitorios', 'firma'], true,
);
export const ADMIN_RECURSO_REVISION_STRATEGY = responseStrategy(
  'recurso_revision_administrativa', 'ADMINISTRATIVO', 'REVISION_ADMINISTRATIVA', 'recurrente', ADMINISTRATIVO_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'resolucion_recurrida', 'oportunidad_procesal', 'agravios_revision', 'petitorios', 'firma'], true,
);
export const ADMIN_SOLICITUD_SUSPENSION_STRATEGY = responseStrategy(
  'solicitud_suspension_acto_administrativo', 'ADMINISTRATIVO', 'SUSPENSION_ADMINISTRATIVA', 'solicitante', ADMINISTRATIVO_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'acto_impugnado_suspension', 'procedencia_suspension', 'garantia_ofrecida', 'petitorios', 'firma'], true,
);
export const ADMIN_INCIDENTE_STRATEGY = responseStrategy(
  'incidente_administrativo', 'ADMINISTRATIVO', 'INCIDENTE_ADMINISTRATIVO', 'incidentista', ADMINISTRATIVO_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'materia_incidental', 'hechos', 'pruebas', 'petitorios', 'firma'], true,
);

export const FISCAL_DEMANDA_NULIDAD_STRATEGY = responseStrategy(
  'demanda_nulidad_fiscal', 'FISCAL', 'JUICIO_NULIDAD_FISCAL', 'contribuyente', FISCAL_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'resolucion_impugnada', 'autoridad_demandada', 'hechos', 'conceptos_impugnacion', 'pruebas', 'petitorios', 'firma'], true,
);
export const FISCAL_CONTESTACION_NULIDAD_STRATEGY = responseStrategy(
  'contestacion_nulidad_fiscal', 'FISCAL', 'CONTESTACION_NULIDAD_FISCAL', 'demandado', FISCAL_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'excepciones_defensas', 'contestacion_hechos', 'refutacion_conceptos', 'pruebas', 'petitorios', 'firma'],
);
export const FISCAL_AMPLIACION_DEMANDA_STRATEGY = responseStrategy(
  'ampliacion_demanda_fiscal', 'FISCAL', 'AMPLIACION_NULIDAD_FISCAL', 'contribuyente', FISCAL_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'oportunidad_procesal', 'nuevos_hechos', 'ampliacion_conceptos', 'pruebas', 'petitorios', 'firma'], true,
);
export const FISCAL_CONTESTACION_AMPLIACION_STRATEGY = responseStrategy(
  'contestacion_ampliacion_fiscal', 'FISCAL', 'CONTESTACION_AMPLIACION_FISCAL', 'demandado', FISCAL_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'contestacion_hechos', 'refutacion_conceptos', 'pruebas', 'petitorios', 'firma'],
);
export const FISCAL_RECURSO_REVOCACION_STRATEGY = responseStrategy(
  'recurso_revocacion_fiscal', 'FISCAL', 'RECURSO_REVOCACION_FISCAL', 'recurrente', FISCAL_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'resolucion_impugnada', 'antecedentes', 'agravios_fiscales', 'pruebas', 'petitorios', 'firma'], true,
);
export const FISCAL_RECURSO_REVISION_STRATEGY = responseStrategy(
  'recurso_revision_fiscal', 'FISCAL', 'REVISION_FISCAL', 'recurrente', FISCAL_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'resolucion_recurrida', 'oportunidad_procesal', 'agravios_revision', 'petitorios', 'firma'], true,
);
export const FISCAL_ALEGATOS_STRATEGY = responseStrategy(
  'alegatos_fiscales', 'FISCAL', 'ALEGATOS_FISCALES', 'parte_interesada', FISCAL_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'valoracion_pruebas', 'alegatos_cierre', 'petitorios', 'firma'],
);
export const FISCAL_CUMPLIMIENTO_SENTENCIA_STRATEGY = responseStrategy(
  'cumplimiento_sentencia_fiscal', 'FISCAL', 'CUMPLIMIENTO_FISCAL', 'parte_interesada', FISCAL_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'resolucion_firme', 'manifestacion_cumplimiento', 'constancias_exhibidas', 'petitorios', 'firma'], true,
);
export const FISCAL_SOLICITUD_SUSPENSION_STRATEGY = responseStrategy(
  'solicitud_suspension_fiscal', 'FISCAL', 'SUSPENSION_FISCAL', 'solicitante', FISCAL_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'acto_impugnado_suspension', 'garantia_interes_fiscal', 'medida_cautelar', 'petitorios', 'firma'], true,
);
export const FISCAL_ESCRITOS_AUTORIDAD_STRATEGY = responseStrategy(
  'escritos_ante_autoridad_fiscal', 'FISCAL', 'ESCRITO_AUTORIDAD_FISCAL', 'contribuyente', FISCAL_BASE_FIELD_IDS,
  ['proemio', 'destinatario', 'solicitud_fiscal', 'antecedentes', 'pruebas', 'petitorios', 'firma'], true,
);

// ── MATERIA PENAL ───────────────────────────────────────────────────────────
const PENAL_BASE_FIELD_IDS = ['victima_ofendido', 'imputado', 'carpeta_investigacion', 'delito', 'petitorios', 'firma'] as const;

export const PENAL_DENUNCIA_STRATEGY = responseStrategy(
  'denuncia', 'PENAL', 'DENUNCIA_PENAL', 'denunciante', PENAL_BASE_FIELD_IDS,
  ['proemio', 'hechos', 'individualizacion_imputados', 'pruebas', 'petitorios', 'firma'], true,
);
export const PENAL_QUERELLA_STRATEGY = responseStrategy(
  'querella', 'PENAL', 'QUERELLA_PENAL', 'querellante', PENAL_BASE_FIELD_IDS,
  ['proemio', 'hechos', 'individualizacion_imputados', 'pruebas', 'petitorios', 'firma'], true,
);
export const PENAL_AMPLIACION_DENUNCIA_STRATEGY = responseStrategy(
  'ampliacion_denuncia', 'PENAL', 'AMPLIACION_DENUNCIA', 'denunciante', PENAL_BASE_FIELD_IDS,
  ['proemio', 'hechos', 'pruebas', 'petitorios', 'firma'], true,
);
export const PENAL_AMPLIACION_QUERELLA_STRATEGY = responseStrategy(
  'ampliacion_querella', 'PENAL', 'AMPLIACION_QUERELLA', 'querellante', PENAL_BASE_FIELD_IDS,
  ['proemio', 'hechos', 'pruebas', 'petitorios', 'firma'], true,
);
export const PENAL_ESCRITO_ASESOR_JURIDICO_STRATEGY = responseStrategy(
  'escrito_asesor_juridico', 'PENAL', 'INTERVENCION_ASESOR_JURIDICO', 'asesor_juridico', PENAL_BASE_FIELD_IDS,
  ['proemio', 'derechos_victima', 'argumentos', 'petitorios', 'firma'], true,
);
export const PENAL_ESCRITO_DEFENSA_STRATEGY = responseStrategy(
  'escrito_defensa', 'PENAL', 'DEFENSA_TECNICA', 'defensor', PENAL_BASE_FIELD_IDS,
  ['proemio', 'teoria_caso_defensiva', 'pruebas', 'petitorios', 'firma'],
);
export const PENAL_SOLICITUD_ACTOS_INVESTIGACION_STRATEGY = responseStrategy(
  'solicitud_actos_investigacion', 'PENAL', 'ACTOS_INVESTIGACION', 'parte_solicitante', PENAL_BASE_FIELD_IDS,
  ['proemio', 'pertinencia_actos_investigacion', 'actos_investigacion_solicitados', 'petitorios', 'firma'], true,
);
export const PENAL_SOLICITUD_ACCESO_CARPETA_STRATEGY = responseStrategy(
  'solicitud_acceso_carpeta', 'PENAL', 'ACCESO_CARPETA', 'parte_legitimada', PENAL_BASE_FIELD_IDS,
  ['proemio', 'fundamento_acceso_carpeta', 'autorizados_acceso', 'petitorios', 'firma'], true,
);
export const PENAL_SOLICITUD_COPIAS_CARPETA_STRATEGY = responseStrategy(
  'solicitud_copias_carpeta', 'PENAL', 'COPIAS_CARPETA', 'parte_legitimada', PENAL_BASE_FIELD_IDS,
  ['proemio', 'constancias_solicitadas', 'fundamento_copias', 'petitorios', 'firma'], true,
);
export const PENAL_SOLICITUD_MEDIDA_PROTECCION_STRATEGY = responseStrategy(
  'solicitud_medida_proteccion', 'PENAL', 'MEDIDA_PROTECCION', 'victima_ofendido', PENAL_BASE_FIELD_IDS,
  ['proemio', 'situacion_riesgo', 'medidas_proteccion_solicitadas', 'petitorios', 'firma'], true,
);
export const PENAL_ESCRITO_COADYUVANCIA_STRATEGY = responseStrategy(
  'escrito_coadyuvancia', 'PENAL', 'COADYUVANCIA_MINISTERIAL', 'coadyuvante', PENAL_BASE_FIELD_IDS,
  ['proemio', 'manifestaciones_coadyuvancia', 'pruebas', 'petitorios', 'firma'], true,
);
export const PENAL_APELACION_PENAL_STRATEGY = responseStrategy(
  'apelacion_penal', 'PENAL', 'APELACION_PENAL', 'recurrente', PENAL_BASE_FIELD_IDS,
  ['proemio', 'oportunidad_procesal', 'agravios_penales', 'petitorios', 'firma'], true,
);
export const PENAL_REVOCACION_PENAL_STRATEGY = responseStrategy(
  'revocacion_penal', 'PENAL', 'REVOCACION_PENAL', 'recurrente', PENAL_BASE_FIELD_IDS,
  ['proemio', 'oportunidad_procesal', 'motivos_inconformidad', 'petitorios', 'firma'], true,
);
export const PENAL_ESCRITO_EJECUCION_PENAL_STRATEGY = responseStrategy(
  'escrito_ejecucion_penal', 'PENAL', 'EJECUCION_PENAL', 'sentenciado_defensor', PENAL_BASE_FIELD_IDS,
  ['proemio', 'planteamiento_ejecucion', 'justificacion_beneficio', 'petitorios', 'firma'], true,
);

// ── MATERIA AGRARIA ─────────────────────────────────────────────────────────
const AGRARIO_BASE_FIELD_IDS = [
  'ejidatario_o_actor', 'demandado_agrario', 'tribunal_agrario', 'expediente_agrario',
  'ejido_o_comunidad', 'parcela_o_tierras', 'hechos', 'prestaciones', 'pruebas', 'petitorios',
] as const;

export const AGRARIO_DEMANDA_STRATEGY = responseStrategy(
  'demanda_agraria', 'AGRARIO', 'JUICIO_AGRARIO', 'actor', AGRARIO_BASE_FIELD_IDS,
  ['proemio', 'prestaciones_agrarias', 'hechos', 'derecho', 'pruebas', 'petitorios', 'firma'], true,
);
export const AGRARIO_CONTESTACION_DEMANDA_STRATEGY = responseStrategy(
  'contestacion_demanda_agraria', 'AGRARIO', 'CONTESTACION_AGRARIA', 'demandado', AGRARIO_BASE_FIELD_IDS,
  ['proemio', 'contestacion_prestaciones', 'contestacion_hechos', 'excepciones_defensas', 'pruebas', 'petitorios', 'firma'], true,
);
export const AGRARIO_RECONVENCION_STRATEGY = responseStrategy(
  'reconvencion_agraria', 'AGRARIO', 'RECONVENCION_AGRARIA', 'actor', AGRARIO_BASE_FIELD_IDS,
  ['proemio', 'prestaciones_reconvencionales', 'hechos', 'derecho', 'pruebas', 'petitorios', 'firma'], true,
);
export const AGRARIO_ALEGATOS_STRATEGY = responseStrategy(
  'alegatos_agrarios', 'AGRARIO', 'ALEGATOS_AGRARIOS', 'parte_interesada', AGRARIO_BASE_FIELD_IDS,
  ['proemio', 'resumen_litis', 'valoracion_pruebas', 'conclusiones', 'petitorios', 'firma'], true,
);
export const AGRARIO_CUMPLIMIENTO_SENTENCIA_STRATEGY = responseStrategy(
  'cumplimiento_sentencia_agraria', 'AGRARIO', 'EJECUCION_SENTENCIA_AGRARIA', 'parte_interesada', AGRARIO_BASE_FIELD_IDS,
  ['proemio', 'antecedentes_sentencia', 'solicitud_ejecucion', 'medidas_apremio', 'petitorios', 'firma'], true,
);
export const AGRARIO_RECURSO_STRATEGY = responseStrategy(
  'recurso_agrario', 'AGRARIO', 'REVISION_AGRARIA', 'recurrente', AGRARIO_BASE_FIELD_IDS,
  ['proemio', 'oportunidad_procesal', 'agravios_agrarios', 'pruebas', 'petitorios', 'firma'], true,
);

// ── MATERIA INMOBILIARIA Y ARRENDAMIENTO ────────────────────────────────────
const INMOBILIARIO_BASE_FIELD_IDS = [
  'arrendador_o_vendedor', 'arrendatario_o_comprador', 'inmueble_ubicacion', 'folio_real',
  'renta_o_precio', 'vigencia', 'declaraciones', 'clausulas', 'firmas',
] as const;

export const INMOBILIARIO_PROMESA_COMPRAVENTA_STRATEGY = responseStrategy(
  'promesa_compraventa_inmueble', 'INMOBILIARIO', 'PROMESA_COMPRAVENTA', 'promovente', INMOBILIARIO_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'cierre', 'firmas'], true,
);
export const INMOBILIARIO_COMPRAVENTA_STRATEGY = responseStrategy(
  'compraventa_inmueble', 'INMOBILIARIO', 'COMPRAVENTA_INMUEBLE', 'promovente', INMOBILIARIO_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'cierre', 'firmas'], true,
);
export const INMOBILIARIO_ARRENDAMIENTO_STRATEGY = responseStrategy(
  'arrendamiento_inmueble', 'INMOBILIARIO', 'ARRENDAMIENTO_INMUEBLE', 'arrendador', INMOBILIARIO_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'cierre', 'firmas'], true,
);
export const INMOBILIARIO_TERMINACION_ARRENDAMIENTO_STRATEGY = responseStrategy(
  'terminacion_arrendamiento', 'INMOBILIARIO', 'TERMINACION_ARRENDAMIENTO', 'arrendador', INMOBILIARIO_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas_terminacion', 'finiquito_entrega', 'firmas'], true,
);
export const INMOBILIARIO_REQUERIMIENTO_PAGO_RENTAS_STRATEGY = responseStrategy(
  'requerimiento_pago_rentas', 'INMOBILIARIO', 'REQUERIMIENTO_EXTRAJUDICIAL', 'arrendador', INMOBILIARIO_BASE_FIELD_IDS,
  ['destinatario_rubro', 'antecedentes_arrendamiento', 'liquidacion_adeudos', 'apercibimiento_legal', 'plazo_pago', 'cierre_firma'], true,
);
export const INMOBILIARIO_AVISO_TERMINACION_STRATEGY = responseStrategy(
  'aviso_terminacion', 'INMOBILIARIO', 'AVISO_TERMINACION_ARRENDAMIENTO', 'arrendador', INMOBILIARIO_BASE_FIELD_IDS,
  ['destinatario_rubro', 'antecedentes_contrato', 'notificacion_no_renovacion', 'plazo_entrega_inmueble', 'cierre_firma'], true,
);
export const INMOBILIARIO_CONVENIO_DESOCUPACION_STRATEGY = responseStrategy(
  'convenio_desocupacion', 'INMOBILIARIO', 'CONVENIO_DESOCUPACION', 'arrendador', INMOBILIARIO_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas_transaccionales', 'pena_mora_desocupacion', 'firmas'], true,
);
export const INMOBILIARIO_RECONOCIMIENTO_ADEUDO_STRATEGY = responseStrategy(
  'reconocimiento_adeudo_arrendamiento', 'INMOBILIARIO', 'RECONOCIMIENTO_ADEUDO', 'arrendador', INMOBILIARIO_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'reconocimiento_deuda', 'calendario_pagos', 'consecuencias_incumplimiento', 'firmas'], true,
);
export const INMOBILIARIO_DEMANDA_DESOCUPACION_STRATEGY = responseStrategy(
  'demanda_desocupacion', 'INMOBILIARIO', 'JUICIO_DESAHUCIO_ARRENDAMIENTO', 'actor', INMOBILIARIO_BASE_FIELD_IDS,
  ['proemio', 'prestaciones_desocupacion', 'hechos', 'derecho', 'pruebas', 'petitorios', 'cierre_firma'], true,
);

// ── MATERIA CORPORATIVO / SOCIETARIO (15 tipos) ──────────────────────────
const CORPORATIVO_BASE_FIELD_IDS = [
  'sociedad_denominacion', 'socios_o_accionistas', 'representante_o_delegado', 'capital_social',
  'objeto_social', 'domicilio_social', 'organo_administracion', 'clausulas', 'firmas',
] as const;

export const CORPORATIVO_CONSTITUCION_SOCIEDAD_STRATEGY = responseStrategy(
  'constitucion_sociedad', 'CORPORATIVO', 'CONSTITUCION_SOCIEDAD', 'accionistas', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'denominacion_objeto', 'capital_social', 'administracion_vigilancia', 'disolucion_liquidacion', 'estatutos', 'firmas'], true,
);
export const CORPORATIVO_MODIFICACION_ESTATUTOS_STRATEGY = responseStrategy(
  'modificacion_estatutos', 'CORPORATIVO', 'MODIFICACION_ESTATUTOS', 'accionistas', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'orden_dia', 'desarrollo_acuerdos', 'clausulas_modificatorias', 'delegacion_facultades', 'firmas'], true,
);
export const CORPORATIVO_ACTA_ASAMBLEA_ORDINARIA_STRATEGY = responseStrategy(
  'acta_asamblea_ordinaria', 'CORPORATIVO', 'ASAMBLEA_ORDINARIA', 'presidente_secretario', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'lista_asistencia', 'orden_dia', 'desarrollo_acuerdos', 'delegacion_facultades', 'firmas'], true,
);
export const CORPORATIVO_ACTA_ASAMBLEA_EXTRAORDINARIA_STRATEGY = responseStrategy(
  'acta_asamblea_extraordinaria', 'CORPORATIVO', 'ASAMBLEA_EXTRAORDINARIA', 'presidente_secretario', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'lista_asistencia', 'orden_dia', 'desarrollo_acuerdos', 'delegacion_facultades', 'firmas'], true,
);
export const CORPORATIVO_RESOLUCIONES_UNANIMIDAD_STRATEGY = responseStrategy(
  'resoluciones_unanimidad', 'CORPORATIVO', 'RESOLUCIONES_FUERA_ASAMBLEA', 'accionistas', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'antecedentes_sociedad', 'desarrollo_acuerdos', 'delegacion_facultades', 'firmas'], true,
);
export const CORPORATIVO_ACTA_CONSEJO_STRATEGY = responseStrategy(
  'acta_consejo', 'CORPORATIVO', 'SESION_CONSEJO_ADMINISTRACION', 'consejeros', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'lista_asistencia', 'orden_dia', 'desarrollo_acuerdos', 'delegacion_facultades', 'firmas'], true,
);
export const CORPORATIVO_AUMENTO_CAPITAL_STRATEGY = responseStrategy(
  'aumento_capital', 'CORPORATIVO', 'AUMENTO_CAPITAL_SOCIAL', 'accionistas', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'antecedentes_capital', 'acuerdos_transmision', 'delegacion_facultades', 'firmas'], true,
);
export const CORPORATIVO_REDUCCION_CAPITAL_STRATEGY = responseStrategy(
  'reduccion_capital', 'CORPORATIVO', 'REDUCCION_CAPITAL_SOCIAL', 'accionistas', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'antecedentes_capital', 'acuerdos_transmision', 'delegacion_facultades', 'firmas'], true,
);
export const CORPORATIVO_CESION_PARTES_SOCIALES_STRATEGY = responseStrategy(
  'cesion_partes_sociales', 'CORPORATIVO', 'CESION_PARTES_SOCIALES', 'cedente_cesionario', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'acuerdos_transmision', 'precio_contraprestacion', 'firmas'], true,
);
export const CORPORATIVO_COMPRAVENTA_ACCIONES_STRATEGY = responseStrategy(
  'compraventa_acciones', 'CORPORATIVO', 'COMPRAVENTA_ACCIONES', 'comprador_vendedor', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'acuerdos_transmision', 'precio_contraprestacion', 'garantias', 'firmas'], true,
);
export const CORPORATIVO_PODERES_STRATEGY = responseStrategy(
  'poderes', 'CORPORATIVO', 'OTORGAMIENTO_PODERES', 'poderdante', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'antecedentes_sociedad', 'otorgamiento_facultades', 'limitaciones_vigencia', 'protocolizacion_registro', 'firmas'], true,
);
export const CORPORATIVO_REVOCACION_PODER_STRATEGY = responseStrategy(
  'revocacion_poder', 'CORPORATIVO', 'REVOCACION_PODERES', 'poderdante', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'antecedentes_sociedad', 'otorgamiento_facultades', 'protocolizacion_registro', 'firmas'], true,
);
export const CORPORATIVO_CONVENIO_ACCIONISTAS_STRATEGY = responseStrategy(
  'convenio_accionistas', 'CORPORATIVO', 'CONVENIO_ACCIONISTAS', 'accionistas', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'ley_jurisdiccion', 'firmas'], true,
);
export const CORPORATIVO_ACUERDO_CONFIDENCIALIDAD_STRATEGY = responseStrategy(
  'acuerdo_confidencialidad', 'CORPORATIVO', 'NDA_CORPORATIVO', 'partes', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'compromisos_confidencialidad', 'exclusividad_vigencia', 'ley_jurisdiccion', 'firmas'], true,
);
export const CORPORATIVO_CARTA_INTENCION_STRATEGY = responseStrategy(
  'carta_intencion', 'CORPORATIVO', 'CARTA_INTENCION', 'partes', CORPORATIVO_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'exclusividad_vigencia', 'ley_jurisdiccion', 'firmas'], true,
);

// ── MATERIA CONTRACTUAL (17 tipos) ───────────────────────────────────────
const CONTRACTUAL_BASE_FIELD_IDS = [
  'partes_contratantes', 'objeto_contrato', 'contraprestacion_o_precio', 'vigencia_plazo',
  'declaraciones', 'clausulas', 'pena_convencional', 'jurisdiccion', 'firmas',
] as const;

export const CONTRACTUAL_COMPRAVENTA_STRATEGY = responseStrategy(
  'contrato_compraventa', 'CONTRACTUAL', 'CONTRATO_COMPRAVENTA', 'comprador_vendedor', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'pena_convencional', 'jurisdiccion', 'firmas'], true,
);
export const CONTRACTUAL_ARRENDAMIENTO_STRATEGY = responseStrategy(
  'contrato_arrendamiento', 'CONTRACTUAL', 'CONTRATO_ARRENDAMIENTO', 'arrendador_arrendatario', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'pena_convencional', 'jurisdiccion', 'firmas'], true,
);
export const CONTRACTUAL_PRESTACION_SERVICIOS_STRATEGY = responseStrategy(
  'contrato_prestacion_servicios', 'CONTRACTUAL', 'PRESTACION_SERVICIOS', 'prestador_cliente', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'pena_convencional', 'jurisdiccion', 'firmas'], true,
);
export const CONTRACTUAL_OBRA_STRATEGY = responseStrategy(
  'contrato_obra', 'CONTRACTUAL', 'CONTRATO_OBRA', 'contratista_dueno', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'pena_convencional', 'jurisdiccion', 'firmas'], true,
);
export const CONTRACTUAL_MUTUO_STRATEGY = responseStrategy(
  'contrato_mutuo', 'CONTRACTUAL', 'CONTRATO_MUTUO', 'mutuante_mutuario', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'pena_convencional', 'jurisdiccion', 'firmas'], true,
);
export const CONTRACTUAL_COMODATO_STRATEGY = responseStrategy(
  'contrato_comodato', 'CONTRACTUAL', 'CONTRATO_COMODATO', 'comodante_comodatario', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'pena_convencional', 'jurisdiccion', 'firmas'], true,
);
export const CONTRACTUAL_MANDATO_STRATEGY = responseStrategy(
  'contrato_mandato', 'CONTRACTUAL', 'CONTRATO_MANDATO', 'mandante_mandatario', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'jurisdiccion', 'firmas'], true,
);
export const CONTRACTUAL_COMISION_STRATEGY = responseStrategy(
  'contrato_comision', 'CONTRACTUAL', 'COMISION_MERCANTIL', 'comitente_comisionista', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'jurisdiccion', 'firmas'], true,
);
export const CONTRACTUAL_DISTRIBUCION_STRATEGY = responseStrategy(
  'contrato_distribucion', 'CONTRACTUAL', 'CONTRATO_DISTRIBUCION', 'fabricante_distribuidor', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'pena_convencional', 'jurisdiccion', 'firmas'], true,
);
export const CONTRACTUAL_SUMINISTRO_STRATEGY = responseStrategy(
  'contrato_suministro', 'CONTRACTUAL', 'CONTRATO_SUMINISTRO', 'suministrador_suministrado', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'pena_convencional', 'jurisdiccion', 'firmas'], true,
);
export const CONTRACTUAL_CONFIDENCIALIDAD_STRATEGY = responseStrategy(
  'contrato_confidencialidad', 'CONTRACTUAL', 'CONTRATO_CONFIDENCIALIDAD', 'partes', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'compromisos_confidencialidad', 'exclusividad_vigencia', 'jurisdiccion', 'firmas'], true,
);
export const CONTRACTUAL_LICENCIA_STRATEGY = responseStrategy(
  'contrato_licencia', 'CONTRACTUAL', 'CONTRATO_LICENCIA', 'licenciante_licenciatario', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'pena_convencional', 'jurisdiccion', 'firmas'], true,
);
export const CONTRACTUAL_CONVENIO_TRANSACCIONAL_STRATEGY = responseStrategy(
  'convenio_transaccional', 'CONTRACTUAL', 'CONVENIO_TRANSACCIONAL', 'partes', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'jurisdiccion', 'firmas'], true,
);
export const CONTRACTUAL_CONVENIO_RECONOCIMIENTO_ADEUDO_STRATEGY = responseStrategy(
  'convenio_reconocimiento_adeudo', 'CONTRACTUAL', 'RECONOCIMIENTO_ADEUDO_CONVENIO', 'acreedor_deudor', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'reconocimiento_obligacion', 'forma_pago', 'consecuencias_mora', 'firmas'], true,
);
export const CONTRACTUAL_CONVENIO_TERMINACION_STRATEGY = responseStrategy(
  'convenio_terminacion', 'CONTRACTUAL', 'CONVENIO_TERMINACION', 'partes', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas_modificatorias', 'subsistencia_estipulaciones', 'firmas'], true,
);
export const CONTRACTUAL_CONVENIO_MODIFICATORIO_STRATEGY = responseStrategy(
  'convenio_modificatorio', 'CONTRACTUAL', 'CONVENIO_MODIFICATORIO', 'partes', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas_modificatorias', 'subsistencia_estipulaciones', 'firmas'], true,
);
export const CONTRACTUAL_MEMORANDO_ENTENDIMIENTO_STRATEGY = responseStrategy(
  'memorando_entendimiento', 'CONTRACTUAL', 'MEMORANDO_ENTENDIMIENTO', 'partes', CONTRACTUAL_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'clausulas', 'exclusividad_vigencia', 'jurisdiccion', 'firmas'], true,
);

// ── MATERIA PROPIEDAD INTELECTUAL (11 tipos) ─────────────────────────────
const PI_BASE_FIELD_IDS = [
  'titular_o_solicitante', 'contraparte_o_autoridad', 'signo_distintivo_o_obra', 'registro_o_expediente_impi',
  'hechos_o_declaraciones', 'derechos_invocados', 'petitorios', 'firma',
] as const;

export const PI_CONTRATO_LICENCIA_MARCA_STRATEGY = responseStrategy(
  'contrato_licencia_marca', 'PROPIEDAD_INTELECTUAL', 'LICENCIA_MARCA', 'licenciante', PI_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'objeto_licencia_cesion', 'regalias_contraprestacion', 'garantias_titularidad', 'jurisdiccion', 'firmas'], true,
);
export const PI_CESION_DERECHOS_MARCA_STRATEGY = responseStrategy(
  'cesion_derechos_marca', 'PROPIEDAD_INTELECTUAL', 'CESION_MARCA', 'cedente', PI_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'objeto_licencia_cesion', 'regalias_contraprestacion', 'garantias_titularidad', 'jurisdiccion', 'firmas'], true,
);
export const PI_LICENCIA_DERECHOS_AUTOR_STRATEGY = responseStrategy(
  'licencia_derechos_autor', 'PROPIEDAD_INTELECTUAL', 'LICENCIA_DERECHOS_AUTOR', 'titular', PI_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'objeto_licencia_cesion', 'regalias_contraprestacion', 'garantias_titularidad', 'jurisdiccion', 'firmas'], true,
);
export const PI_CESION_DERECHOS_AUTOR_STRATEGY = responseStrategy(
  'cesion_derechos_autor', 'PROPIEDAD_INTELECTUAL', 'CESION_DERECHOS_AUTOR', 'cedente', PI_BASE_FIELD_IDS,
  ['proemio', 'declaraciones', 'objeto_licencia_cesion', 'regalias_contraprestacion', 'garantias_titularidad', 'jurisdiccion', 'firmas'], true,
);
export const PI_INFRACCION_PROPIEDAD_INDUSTRIAL_STRATEGY = responseStrategy(
  'infraccion_propiedad_industrial', 'PROPIEDAD_INTELECTUAL', 'INFRACCION_ADMINISTRATIVA_IMPI', 'afectado', PI_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'hechos_infraccion', 'derechos_propiedad_industrial', 'pruebas_periciales_documentales', 'petitorios', 'firma'], true,
);
export const PI_RECURSO_PROPIEDAD_INTELECTUAL_STRATEGY = responseStrategy(
  'recurso_propiedad_intelectual', 'PROPIEDAD_INTELECTUAL', 'RECURSO_REVISION_IMPI', 'recurrente', PI_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'hechos', 'derechos_propiedad_industrial', 'petitorios', 'firma'], true,
);
export const PI_SOLICITUD_REGISTRO_MARCA_STRATEGY = responseStrategy(
  'solicitud_registro_marca', 'PROPIEDAD_INTELECTUAL', 'SOLICITUD_REGISTRO_MARCA', 'solicitante', PI_BASE_FIELD_IDS,
  ['destinatario_impi', 'datos_solicitante', 'signo_distintivo_clase', 'anexos_tarifas', 'petitorios', 'firma'], true,
);
export const PI_CONTESTACION_IMPEDIMENTO_STRATEGY = responseStrategy(
  'contestacion_impedimento', 'PROPIEDAD_INTELECTUAL', 'CONTESTACION_IMPEDIMENTO_IMPI', 'solicitante', PI_BASE_FIELD_IDS,
  ['destinatario_impi', 'datos_solicitante', 'manifestaciones_impedimento', 'pruebas', 'petitorios', 'firma'], true,
);
export const PI_OPOSICION_MARCA_STRATEGY = responseStrategy(
  'oposicion_marca', 'PROPIEDAD_INTELECTUAL', 'OPOSICION_MARCA_IMPI', 'oponente', PI_BASE_FIELD_IDS,
  ['destinatario_impi', 'comparecencia', 'hechos_infraccion', 'derechos_propiedad_industrial', 'pruebas', 'petitorios', 'firma'], true,
);
export const PI_NULIDAD_REGISTRO_STRATEGY = responseStrategy(
  'nulidad_registro', 'PROPIEDAD_INTELECTUAL', 'NULIDAD_REGISTRO_MARCA', 'solicitante_nulidad', PI_BASE_FIELD_IDS,
  ['destinatario_impi', 'comparecencia', 'hechos_infraccion', 'derechos_propiedad_industrial', 'pruebas', 'petitorios', 'firma'], true,
);
export const PI_CADUCIDAD_REGISTRO_STRATEGY = responseStrategy(
  'caducidad_registro', 'PROPIEDAD_INTELECTUAL', 'CADUCIDAD_REGISTRO_MARCA', 'solicitante_caducidad', PI_BASE_FIELD_IDS,
  ['destinatario_impi', 'comparecencia', 'hechos_infraccion', 'derechos_propiedad_industrial', 'pruebas', 'petitorios', 'firma'], true,
);

// ── MATERIA TRÁMITES GENERALES DE JUZGADO (25 tipos) ───────────────────────
const TRAMITE_BASE_FIELD_IDS = ['organo_jurisdiccional', 'numero_expediente', 'promovente', 'personalidad', 'petitorios', 'firma'] as const;

export const TRAMITE_PROMOCION_SIMPLE_STRATEGY = responseStrategy(
  'promocion_simple', 'GENERAL', 'TRAMITE_JUDICIAL', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'antecedentes', 'manifestaciones', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_DESAHOGO_PREVENCION_STRATEGY = responseStrategy(
  'desahogo_prevencion', 'GENERAL', 'DESAHOGO_PREVENCION', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'proveido_referencia', 'desahogo_prevencion', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_CUMPLIMIENTO_REQUERIMIENTO_STRATEGY = responseStrategy(
  'cumplimiento_requerimiento', 'GENERAL', 'CUMPLIMIENTO_REQUERIMIENTO', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'requerimiento_notificado', 'manifestacion_cumplimiento', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_CUMPLIMIENTO_PREVENCION_STRATEGY = responseStrategy(
  'cumplimiento_prevencion', 'GENERAL', 'CUMPLIMIENTO_PREVENCION', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'proveido_referencia', 'desahogo_prevencion', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_MANIFESTACIONES_STRATEGY = responseStrategy(
  'manifestaciones', 'GENERAL', 'MANIFESTACIONES_PROCESALES', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'antecedentes', 'manifestaciones', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_COMPARECENCIA_STRATEGY = responseStrategy(
  'comparecencia', 'GENERAL', 'COMPARECENCIA_AUTOS', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'motivo_comparecencia', 'manifestaciones', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_RATIFICACION_STRATEGY = responseStrategy(
  'ratificacion', 'GENERAL', 'RATIFICACION_ESCRITO', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'escrito_referencia', 'declaracion_ratificacion', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_SOLICITUD_COPIAS_STRATEGY = responseStrategy(
  'solicitud_copias', 'GENERAL', 'COPIAS_SIMPLES', 'solicitante', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'constancias_solicitadas', 'personas_autorizadas', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_SOLICITUD_COPIAS_CERTIFICADAS_STRATEGY = responseStrategy(
  'solicitud_copias_certificadas', 'GENERAL', 'COPIAS_CERTIFICADAS', 'solicitante', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'constancias_solicitadas', 'personas_autorizadas', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_SOLICITUD_ACCESO_EXPEDIENTE_STRATEGY = responseStrategy(
  'solicitud_acceso_expediente', 'GENERAL', 'ACCESO_EXPEDIENTE', 'solicitante', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'acceso_solicitado', 'autorizados_acceso', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_SOLICITUD_CERTIFICACION_STRATEGY = responseStrategy(
  'solicitud_certificacion', 'GENERAL', 'CERTIFICACION_ACTUACIONES', 'solicitante', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'materia_certificacion', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_AUTORIZACION_ABOGADOS_STRATEGY = responseStrategy(
  'autorizacion_abogados', 'GENERAL', 'DESIGNACION_AUTORIZADOS', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'designacion_abogados', 'alcance_facultades', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_REVOCACION_AUTORIZADOS_STRATEGY = responseStrategy(
  'revocacion_autorizados', 'GENERAL', 'REVOCACION_AUTORIZADOS', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'revocacion_expresa', 'nuevos_autorizados', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_CAMBIO_DOMICILIO_PROCESAL_STRATEGY = responseStrategy(
  'cambio_domicilio_procesal', 'GENERAL', 'DOMICILIO_PROCESAL', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'nuevo_domicilio', 'personas_autorizadas', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_SENALAMIENTO_CORREO_STRATEGY = responseStrategy(
  'senalamiento_correo', 'GENERAL', 'NOTIFICACION_ELECTRONICA', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'medios_electronicos', 'manifestacion_conformidad', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_IMPULSO_PROCESAL_STRATEGY = responseStrategy(
  'impulso_procesal', 'GENERAL', 'IMPULSO_PROCESAL', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'estado_procesal', 'solicitud_impulso', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_SOLICITUD_ACUMULACION_STRATEGY = responseStrategy(
  'solicitud_acumulacion', 'GENERAL', 'ACUMULACION_AUTOS', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'expedientes_acumular', 'causa_acumulacion', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_SOLICITUD_ARCHIVO_STRATEGY = responseStrategy(
  'solicitud_archivo', 'GENERAL', 'ARCHIVO_EXPEDIENTE', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'causa_archivo', 'solicitud_remision_archivo', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_SOLICITUD_DESARCHIVO_STRATEGY = responseStrategy(
  'solicitud_desarchivo', 'GENERAL', 'DESARCHIVO_EXPEDIENTE', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'datos_archivo', 'motivo_desarchivo', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_DESISTIMIENTO_STRATEGY = responseStrategy(
  'desistimiento', 'GENERAL', 'DESISTIMIENTO_ACCION', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'declaracion_desistimiento', 'alcance_y_efectos', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_ALLANAMIENTO_STRATEGY = responseStrategy(
  'allanamiento', 'GENERAL', 'ALLANAMIENTO_DEMANDA', 'demandado', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'declaracion_allanamiento', 'manifestaciones_condena', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_CONVENIO_JUDICIAL_STRATEGY = responseStrategy(
  'convenio_judicial', 'GENERAL', 'CONVENIO_JUDICIAL', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia_partes', 'antecedentes_litigio', 'clausulas_convenio', 'ratificacion_elevacion_cosa_juzgada', 'petitorios', 'firma'], true,
);
export const TRAMITE_ACLARACION_STRATEGY = responseStrategy(
  'aclaracion', 'GENERAL', 'ACLARACION_PROVEIDO', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'resolucion_a_aclarar', 'puntos_obscuros', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_CORRECCION_ERROR_STRATEGY = responseStrategy(
  'correccion_error', 'GENERAL', 'CORRECCION_ERROR_MATERIAL', 'promovente', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'actuacion_con_error', 'precision_del_error', 'fundamentos', 'petitorios', 'firma'], true,
);
export const TRAMITE_SOLICITUD_DEVOLUCION_DOCUMENTOS_STRATEGY = responseStrategy(
  'solicitud_devolucion_documentos', 'GENERAL', 'DEVOLUCION_DOCUMENTOS', 'solicitante', TRAMITE_BASE_FIELD_IDS,
  ['destinatario_rubro', 'comparecencia', 'documentos_solicitados', 'copias_cotejo_y_autorizados', 'fundamentos', 'petitorios', 'firma'], true,
);

export const DOCUMENT_STRATEGIES: Readonly<Record<string, DocumentStrategyDefinition>> = Object.freeze({
  demanda_ordinaria_civil: DEMANDA_ORDINARIA_CIVIL_STRATEGY,
  demanda_ejecutiva_mercantil: COMMERCIAL_ENFORCEMENT_STRATEGY,
  contestacion_demanda_civil: CIVIL_CONTESTATION_STRATEGY,
  contestacion_demanda_mercantil: MERCANTILE_CONTESTATION_STRATEGY,
  contestacion_demanda_oral_civil: CIVIL_ORAL_CONTESTATION_STRATEGY,
  contestacion_demanda_arrendamiento: CIVIL_LEASE_CONTESTATION_STRATEGY,
  reconvencion_civil: CIVIL_RECONVENTION_STRATEGY,
  contestacion_reconvencion_civil: CIVIL_RECONVENTION_RESPONSE_STRATEGY,
  reconvencion_mercantil: MERCANTILE_RECONVENTION_STRATEGY,
  contestacion_reconvencion_mercantil: MERCANTILE_RECONVENTION_RESPONSE_STRATEGY,
  excepciones_mercantiles: MERCANTILE_EXCEPTIONS_STRATEGY,
  ofrecimiento_pruebas_civil: CIVIL_EVIDENCE_OFFERING_STRATEGY,
  objecion_pruebas_civil: CIVIL_EVIDENCE_OBJECTION_STRATEGY,
  desahogo_vista_civil: CIVIL_EVIDENCE_HEARING_STRATEGY,
  alegatos_civil: CIVIL_ARGUMENTS_STRATEGY,
  ofrecimiento_pruebas_mercantil: MERCANTILE_EVIDENCE_OFFERING_STRATEGY,
  objecion_documentos_mercantil: MERCANTILE_EVIDENCE_OBJECTION_STRATEGY,
  alegatos_mercantil: MERCANTILE_ARGUMENTS_STRATEGY,
  incidente_nulidad_actuaciones: CIVIL_INCIDENTE_NULIDAD_STRATEGY,
  incidente_liquidacion: CIVIL_INCIDENTE_LIQUIDACION_STRATEGY,
  incidente_costas: CIVIL_INCIDENTE_COSTAS_STRATEGY,
  incidente_ejecucion: CIVIL_INCIDENTE_EJECUCION_STRATEGY,
  incidente_cumplimiento: CIVIL_INCIDENTE_CUMPLIMIENTO_STRATEGY,
  incidente_personalidad: CIVIL_INCIDENTE_PERSONALIDAD_STRATEGY,
  incidente_competencia: CIVIL_INCIDENTE_COMPETENCIA_STRATEGY,
  incidente_acumulacion: CIVIL_INCIDENTE_ACUMULACION_STRATEGY,
  solicitud_medida_cautelar_civil: CIVIL_SOLICITUD_MEDIDA_CAUTELAR_STRATEGY,
  providencia_precautoria: CIVIL_PROVIDENCIA_PRECAUTORIA_STRATEGY,
  solicitud_embargo_precautorio: CIVIL_EMBARGO_PRECAUTORIO_STRATEGY,
  providencias_precautorias_mercantiles: MERCANTILE_PROVIDENCIAS_PRECAUTORIAS_STRATEGY,
  apelacion_civil: CIVIL_APELACION_STRATEGY,
  revocacion_civil: CIVIL_REVOCACION_STRATEGY,
  aclaracion_sentencia_civil: CIVIL_ACLARACION_SENTENCIA_STRATEGY,
  apelacion_mercantil: MERCANTILE_APELACION_STRATEGY,
  revocacion_mercantil: MERCANTILE_REVOCACION_STRATEGY,
  aclaracion_sentencia_mercantil: MERCANTILE_ACLARACION_SENTENCIA_STRATEGY,
  solicitud_ejecucion_sentencia_civil: CIVIL_SOLICITUD_EJECUCION_STRATEGY,
  liquidacion_sentencia_civil: CIVIL_LIQUIDACION_SENTENCIA_STRATEGY,
  requerimiento_cumplimiento_sentencia: CIVIL_REQUERIMIENTO_CUMPLIMIENTO_STRATEGY,
  ejecucion_sentencia_mercantil: MERCANTILE_EJECUCION_SENTENCIA_STRATEGY,
  liquidacion_mercantil: MERCANTILE_LIQUIDACION_STRATEGY,
  embargo_mercantil: MERCANTILE_EMBARGO_STRATEGY,
  // ── MATERIA FAMILIAR ──────────────────────────────────────────────────────
  demanda_divorcio: FAMILIAR_DEMANDA_DIVORCIO_STRATEGY,
  convenio_divorcio: FAMILIAR_CONVENIO_DIVORCIO_STRATEGY,
  contestacion_divorcio: FAMILIAR_CONTESTACION_DIVORCIO_STRATEGY,
  demanda_alimentos: FAMILIAR_DEMANDA_ALIMENTOS_STRATEGY,
  contestacion_alimentos: FAMILIAR_CONTESTACION_ALIMENTOS_STRATEGY,
  solicitud_alimentos_provisionales: FAMILIAR_SOLICITUD_ALIMENTOS_PROVISIONALES_STRATEGY,
  demanda_guarda_custodia: FAMILIAR_DEMANDA_GUARDA_CUSTODIA_STRATEGY,
  contestacion_guarda_custodia: FAMILIAR_CONTESTACION_GUARDA_CUSTODIA_STRATEGY,
  demanda_regimen_convivencias: FAMILIAR_DEMANDA_REGIMEN_CONVIVENCIAS_STRATEGY,
  modificacion_convivencias: FAMILIAR_MODIFICACION_CONVIVENCIAS_STRATEGY,
  perdida_patria_potestad: FAMILIAR_PERDIDA_PATRIA_POTESTAD_STRATEGY,
  reconocimiento_paternidad: FAMILIAR_RECONOCIMIENTO_PATERNIDAD_STRATEGY,
  desconocimiento_paternidad: FAMILIAR_DESCONOCIMIENTO_PATERNIDAD_STRATEGY,
  adopcion: FAMILIAR_ADOPCION_STRATEGY,
  medidas_proteccion_familiar: FAMILIAR_MEDIDAS_PROTECCION_STRATEGY,
  convenio_familiar: FAMILIAR_CONVENIO_FAMILIAR_STRATEGY,
  jurisdiccion_voluntaria_familiar: FAMILIAR_JURISDICCION_VOLUNTARIA_STRATEGY,
  liquidacion_sociedad_conyugal: FAMILIAR_LIQUIDACION_SOCIEDAD_CONYUGAL_STRATEGY,
  incidente_modificacion_pension: FAMILIAR_INCIDENTE_MODIFICACION_PENSION_STRATEGY,
  incidente_reduccion_pension: FAMILIAR_INCIDENTE_REDUCCION_PENSION_STRATEGY,
  incidente_incremento_pension: FAMILIAR_INCIDENTE_INCREMENTO_PENSION_STRATEGY,
  ejecucion_convenio_familiar: FAMILIAR_EJECUCION_CONVENIO_STRATEGY,
  apelacion_familiar: FAMILIAR_APELACION_STRATEGY,
  alegatos_familiar: FAMILIAR_ALEGATOS_STRATEGY,
  // ── MATERIA LABORAL ───────────────────────────────────────────────────────
  demanda_laboral: LABORAL_DEMANDA_STRATEGY,
  contestacion_demanda_laboral: LABORAL_CONTESTACION_DEMANDA_STRATEGY,
  reconvencion_laboral: LABORAL_RECONVENCION_STRATEGY,
  contestacion_reconvencion_laboral: LABORAL_CONTESTACION_RECONVENCION_STRATEGY,
  ampliacion_demanda_laboral: LABORAL_AMPLIACION_DEMANDA_STRATEGY,
  ofrecimiento_pruebas_laboral: LABORAL_OFRECIMIENTO_PRUEBAS_STRATEGY,
  objecion_pruebas_laboral: LABORAL_OBJECION_PRUEBAS_STRATEGY,
  desahogo_prevencion_laboral: LABORAL_DESAHOGO_PREVENCION_STRATEGY,
  alegatos_laborales: LABORAL_ALEGATOS_STRATEGY,
  cumplimiento_laudo_sentencia_laboral: LABORAL_CUMPLIMIENTO_LAUDO_SENTENCIA_STRATEGY,
  ejecucion_sentencia_laboral: LABORAL_EJECUCION_SENTENCIA_STRATEGY,
  demanda_amparo_directo_laboral: LABORAL_DEMANDA_AMPARO_DIRECTO_STRATEGY,
  demanda_amparo_indirecto_laboral: LABORAL_DEMANDA_AMPARO_INDIRECTO_STRATEGY,
  // ── MATERIA CONSTITUCIONAL Y AMPARO ─────────────────────────────────────────
  demanda_amparo_indirecto: AMPARO_INDIRECTO_STRATEGY,
  demanda_amparo_directo: AMPARO_DIRECTO_STRATEGY,
  contestacion_revision_extraordinaria_amparo_directo: AMPARO_CONTESTACION_REVISION_EXTRAORDINARIA_STRATEGY,
  recurso_revision_amparo_directo: AMPARO_RECURSO_REVISION_DIRECTO_STRATEGY,
  ampliacion_demanda_amparo: AMPARO_AMPLIACION_DEMANDA_STRATEGY,
  amparo_adhesivo: AMPARO_ADHESIVO_STRATEGY,
  solicitud_suspension_provisional: AMPARO_SUSPENSION_PROVISIONAL_STRATEGY,
  solicitud_suspension_definitiva: AMPARO_SUSPENSION_DEFINITIVA_STRATEGY,
  alegatos_amparo: AMPARO_ALEGATOS_STRATEGY,
  recurso_revision_amparo: AMPARO_RECURSO_REVISION_STRATEGY,
  recurso_queja_amparo: AMPARO_RECURSO_QUEJA_STRATEGY,
  recurso_reclamacion_amparo: AMPARO_RECURSO_RECLAMACION_STRATEGY,
  recurso_inconformidad_amparo: AMPARO_RECURSO_INCONFORMIDAD_STRATEGY,
  cumplimiento_ejecutoria_amparo: AMPARO_CUMPLIMIENTO_EJECUTORIA_STRATEGY,
  promocion_cumplimiento_amparo: AMPARO_PROMOCION_CUMPLIMIENTO_STRATEGY,
  manifestaciones_cumplimiento_amparo: AMPARO_MANIFESTACIONES_CUMPLIMIENTO_STRATEGY,
  // ── MATERIA ADMINISTRATIVA ──────────────────────────────────────────────────
  demanda_nulidad_administrativa: ADMIN_DEMANDA_NULIDAD_STRATEGY,
  contestacion_nulidad_administrativa: ADMIN_CONTESTACION_NULIDAD_STRATEGY,
  ampliacion_demanda_nulidad: ADMIN_AMPLIACION_DEMANDA_STRATEGY,
  contestacion_ampliacion_nulidad: ADMIN_CONTESTACION_AMPLIACION_STRATEGY,
  alegatos_administrativos: ADMIN_ALEGATOS_STRATEGY,
  cumplimiento_sentencia_administrativa: ADMIN_CUMPLIMIENTO_SENTENCIA_STRATEGY,
  recurso_administrativo: ADMIN_RECURSO_ADMINISTRATIVO_STRATEGY,
  recurso_revision_administrativa: ADMIN_RECURSO_REVISION_STRATEGY,
  solicitud_suspension_acto_administrativo: ADMIN_SOLICITUD_SUSPENSION_STRATEGY,
  incidente_administrativo: ADMIN_INCIDENTE_STRATEGY,
  // ── MATERIA FISCAL ──────────────────────────────────────────────────────────
  demanda_nulidad_fiscal: FISCAL_DEMANDA_NULIDAD_STRATEGY,
  contestacion_nulidad_fiscal: FISCAL_CONTESTACION_NULIDAD_STRATEGY,
  ampliacion_demanda_fiscal: FISCAL_AMPLIACION_DEMANDA_STRATEGY,
  contestacion_ampliacion_fiscal: FISCAL_CONTESTACION_AMPLIACION_STRATEGY,
  recurso_revocacion_fiscal: FISCAL_RECURSO_REVOCACION_STRATEGY,
  recurso_revision_fiscal: FISCAL_RECURSO_REVISION_STRATEGY,
  alegatos_fiscales: FISCAL_ALEGATOS_STRATEGY,
  cumplimiento_sentencia_fiscal: FISCAL_CUMPLIMIENTO_SENTENCIA_STRATEGY,
  solicitud_suspension_fiscal: FISCAL_SOLICITUD_SUSPENSION_STRATEGY,
  escritos_ante_autoridad_fiscal: FISCAL_ESCRITOS_AUTORIDAD_STRATEGY,
  // ── MATERIA PENAL ───────────────────────────────────────────────────────────
  denuncia: PENAL_DENUNCIA_STRATEGY,
  querella: PENAL_QUERELLA_STRATEGY,
  ampliacion_denuncia: PENAL_AMPLIACION_DENUNCIA_STRATEGY,
  ampliacion_querella: PENAL_AMPLIACION_QUERELLA_STRATEGY,
  escrito_asesor_juridico: PENAL_ESCRITO_ASESOR_JURIDICO_STRATEGY,
  escrito_defensa: PENAL_ESCRITO_DEFENSA_STRATEGY,
  solicitud_actos_investigacion: PENAL_SOLICITUD_ACTOS_INVESTIGACION_STRATEGY,
  solicitud_acceso_carpeta: PENAL_SOLICITUD_ACCESO_CARPETA_STRATEGY,
  solicitud_copias_carpeta: PENAL_SOLICITUD_COPIAS_CARPETA_STRATEGY,
  solicitud_medida_proteccion: PENAL_SOLICITUD_MEDIDA_PROTECCION_STRATEGY,
  escrito_coadyuvancia: PENAL_ESCRITO_COADYUVANCIA_STRATEGY,
  apelacion_penal: PENAL_APELACION_PENAL_STRATEGY,
  revocacion_penal: PENAL_REVOCACION_PENAL_STRATEGY,
  escrito_ejecucion_penal: PENAL_ESCRITO_EJECUCION_PENAL_STRATEGY,
  // ── MATERIA AGRARIA ─────────────────────────────────────────────────────────
  demanda_agraria: AGRARIO_DEMANDA_STRATEGY,
  contestacion_demanda_agraria: AGRARIO_CONTESTACION_DEMANDA_STRATEGY,
  reconvencion_agraria: AGRARIO_RECONVENCION_STRATEGY,
  alegatos_agrarios: AGRARIO_ALEGATOS_STRATEGY,
  cumplimiento_sentencia_agraria: AGRARIO_CUMPLIMIENTO_SENTENCIA_STRATEGY,
  recurso_agrario: AGRARIO_RECURSO_STRATEGY,
  // ── MATERIA INMOBILIARIA Y ARRENDAMIENTO ────────────────────────────────────
  promesa_compraventa_inmueble: INMOBILIARIO_PROMESA_COMPRAVENTA_STRATEGY,
  compraventa_inmueble: INMOBILIARIO_COMPRAVENTA_STRATEGY,
  arrendamiento_inmueble: INMOBILIARIO_ARRENDAMIENTO_STRATEGY,
  terminacion_arrendamiento: INMOBILIARIO_TERMINACION_ARRENDAMIENTO_STRATEGY,
  requerimiento_pago_rentas: INMOBILIARIO_REQUERIMIENTO_PAGO_RENTAS_STRATEGY,
  aviso_terminacion: INMOBILIARIO_AVISO_TERMINACION_STRATEGY,
  convenio_desocupacion: INMOBILIARIO_CONVENIO_DESOCUPACION_STRATEGY,
  reconocimiento_adeudo_arrendamiento: INMOBILIARIO_RECONOCIMIENTO_ADEUDO_STRATEGY,
  demanda_desocupacion: INMOBILIARIO_DEMANDA_DESOCUPACION_STRATEGY,
  // ── MATERIA CORPORATIVO / SOCIETARIO (15 tipos) ──────────────────────────
  constitucion_sociedad: CORPORATIVO_CONSTITUCION_SOCIEDAD_STRATEGY,
  modificacion_estatutos: CORPORATIVO_MODIFICACION_ESTATUTOS_STRATEGY,
  acta_asamblea_ordinaria: CORPORATIVO_ACTA_ASAMBLEA_ORDINARIA_STRATEGY,
  acta_asamblea_extraordinaria: CORPORATIVO_ACTA_ASAMBLEA_EXTRAORDINARIA_STRATEGY,
  resoluciones_unanimidad: CORPORATIVO_RESOLUCIONES_UNANIMIDAD_STRATEGY,
  acta_consejo: CORPORATIVO_ACTA_CONSEJO_STRATEGY,
  aumento_capital: CORPORATIVO_AUMENTO_CAPITAL_STRATEGY,
  reduccion_capital: CORPORATIVO_REDUCCION_CAPITAL_STRATEGY,
  cesion_partes_sociales: CORPORATIVO_CESION_PARTES_SOCIALES_STRATEGY,
  compraventa_acciones: CORPORATIVO_COMPRAVENTA_ACCIONES_STRATEGY,
  poderes: CORPORATIVO_PODERES_STRATEGY,
  revocacion_poder: CORPORATIVO_REVOCACION_PODER_STRATEGY,
  convenio_accionistas: CORPORATIVO_CONVENIO_ACCIONISTAS_STRATEGY,
  acuerdo_confidencialidad: CORPORATIVO_ACUERDO_CONFIDENCIALIDAD_STRATEGY,
  carta_intencion: CORPORATIVO_CARTA_INTENCION_STRATEGY,
  // ── MATERIA CONTRACTUAL (17 tipos) ───────────────────────────────────────
  contrato_compraventa: CONTRACTUAL_COMPRAVENTA_STRATEGY,
  contrato_arrendamiento: CONTRACTUAL_ARRENDAMIENTO_STRATEGY,
  contrato_prestacion_servicios: CONTRACTUAL_PRESTACION_SERVICIOS_STRATEGY,
  contrato_obra: CONTRACTUAL_OBRA_STRATEGY,
  contrato_mutuo: CONTRACTUAL_MUTUO_STRATEGY,
  contrato_comodato: CONTRACTUAL_COMODATO_STRATEGY,
  contrato_mandato: CONTRACTUAL_MANDATO_STRATEGY,
  contrato_comision: CONTRACTUAL_COMISION_STRATEGY,
  contrato_distribucion: CONTRACTUAL_DISTRIBUCION_STRATEGY,
  contrato_suministro: CONTRACTUAL_SUMINISTRO_STRATEGY,
  contrato_confidencialidad: CONTRACTUAL_CONFIDENCIALIDAD_STRATEGY,
  contrato_licencia: CONTRACTUAL_LICENCIA_STRATEGY,
  convenio_transaccional: CONTRACTUAL_CONVENIO_TRANSACCIONAL_STRATEGY,
  convenio_reconocimiento_adeudo: CONTRACTUAL_CONVENIO_RECONOCIMIENTO_ADEUDO_STRATEGY,
  convenio_terminacion: CONTRACTUAL_CONVENIO_TERMINACION_STRATEGY,
  convenio_modificatorio: CONTRACTUAL_CONVENIO_MODIFICATORIO_STRATEGY,
  memorando_entendimiento: CONTRACTUAL_MEMORANDO_ENTENDIMIENTO_STRATEGY,
  // ── MATERIA PROPIEDAD INTELECTUAL (11 tipos) ─────────────────────────────
  contrato_licencia_marca: PI_CONTRATO_LICENCIA_MARCA_STRATEGY,
  cesion_derechos_marca: PI_CESION_DERECHOS_MARCA_STRATEGY,
  licencia_derechos_autor: PI_LICENCIA_DERECHOS_AUTOR_STRATEGY,
  cesion_derechos_autor: PI_CESION_DERECHOS_AUTOR_STRATEGY,
  infraccion_propiedad_industrial: PI_INFRACCION_PROPIEDAD_INDUSTRIAL_STRATEGY,
  recurso_propiedad_intelectual: PI_RECURSO_PROPIEDAD_INTELECTUAL_STRATEGY,
  solicitud_registro_marca: PI_SOLICITUD_REGISTRO_MARCA_STRATEGY,
  contestacion_impedimento: PI_CONTESTACION_IMPEDIMENTO_STRATEGY,
  oposicion_marca: PI_OPOSICION_MARCA_STRATEGY,
  nulidad_registro: PI_NULIDAD_REGISTRO_STRATEGY,
  caducidad_registro: PI_CADUCIDAD_REGISTRO_STRATEGY,
  // ── MATERIA TRÁMITES GENERALES DE JUZGADO (25 tipos) ───────────────────────
  promocion_simple: TRAMITE_PROMOCION_SIMPLE_STRATEGY,
  desahogo_prevencion: TRAMITE_DESAHOGO_PREVENCION_STRATEGY,
  cumplimiento_requerimiento: TRAMITE_CUMPLIMIENTO_REQUERIMIENTO_STRATEGY,
  cumplimiento_prevencion: TRAMITE_CUMPLIMIENTO_PREVENCION_STRATEGY,
  manifestaciones: TRAMITE_MANIFESTACIONES_STRATEGY,
  comparecencia: TRAMITE_COMPARECENCIA_STRATEGY,
  ratificacion: TRAMITE_RATIFICACION_STRATEGY,
  solicitud_copias: TRAMITE_SOLICITUD_COPIAS_STRATEGY,
  solicitud_copias_certificadas: TRAMITE_SOLICITUD_COPIAS_CERTIFICADAS_STRATEGY,
  solicitud_acceso_expediente: TRAMITE_SOLICITUD_ACCESO_EXPEDIENTE_STRATEGY,
  solicitud_certificacion: TRAMITE_SOLICITUD_CERTIFICACION_STRATEGY,
  autorizacion_abogados: TRAMITE_AUTORIZACION_ABOGADOS_STRATEGY,
  revocacion_autorizados: TRAMITE_REVOCACION_AUTORIZADOS_STRATEGY,
  cambio_domicilio_procesal: TRAMITE_CAMBIO_DOMICILIO_PROCESAL_STRATEGY,
  senalamiento_correo: TRAMITE_SENALAMIENTO_CORREO_STRATEGY,
  impulso_procesal: TRAMITE_IMPULSO_PROCESAL_STRATEGY,
  solicitud_acumulacion: TRAMITE_SOLICITUD_ACUMULACION_STRATEGY,
  solicitud_archivo: TRAMITE_SOLICITUD_ARCHIVO_STRATEGY,
  solicitud_desarchivo: TRAMITE_SOLICITUD_DESARCHIVO_STRATEGY,
  desistimiento: TRAMITE_DESISTIMIENTO_STRATEGY,
  allanamiento: TRAMITE_ALLANAMIENTO_STRATEGY,
  convenio_judicial: TRAMITE_CONVENIO_JUDICIAL_STRATEGY,
  aclaracion: TRAMITE_ACLARACION_STRATEGY,
  correccion_error: TRAMITE_CORRECCION_ERROR_STRATEGY,
  solicitud_devolucion_documentos: TRAMITE_SOLICITUD_DEVOLUCION_DOCUMENTOS_STRATEGY,
});

function canonicalizeStrategyId(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/-/g, '_');
}

export function getDocumentStrategy(documentType: string): DocumentStrategyDefinition | undefined {
  return DOCUMENT_STRATEGIES[canonicalizeStrategyId(documentType)];
}
