import type { CaseAnalysis } from './caseAnalysis';
import type { DocumentParties, ProvenanceKind, UploadedSourceDocument } from './types';
import {
  inferSourceOutputType,
} from './sourceOutputCompatibility';
import {
  sourceDocumentMatter,
  type SourceDocumentTypeValue,
} from './sourceDocumentTypes';
import type {
  CommercialEnforcementContext,
  CommercialEnforcementManualInput,
} from './commercialEnforcement';
import { buildCommercialEnforcementContext } from './commercialEnforcement';
import {
  buildCivilMercantileResponseContext,
  isCivilMercantileResponseDocumentType,
  type CivilMercantileResponseContext,
} from './responseContext';
import {
  buildCivilMercantileEvidenceArgumentContext,
  isCivilMercantileEvidenceArgumentDocumentType,
  type CivilMercantileEvidenceArgumentContext,
} from './evidenceArgumentContext';

export type CaseFieldStatus = 'CONFIRMED' | 'ANONYMIZED' | 'MISSING';
export type CaseFieldResolution = 'CONFIRMED' | 'INFERRED' | 'REQUIRES_LAWYER_DECISION';

export interface CaseContextField {
  key: string;
  label: string;
  status: CaseFieldStatus;
  value?: string;
  provenance?: ProvenanceKind;
  resolution?: CaseFieldResolution;
  confirmedByLawyer?: boolean;
}

export type CivilSourceRole = 'PRIMARY' | 'SUPPORTING' | 'REFERENCE' | 'UNSPECIFIED';
export type CivilSourceStatus = 'VALIDATED' | 'UNVALIDATED' | 'ANALYSIS_PENDING' | 'INCOMPATIBLE';
export type CivilSourceProvenance = 'KNOWN_PROVENANCE' | 'PARTIAL_PROVENANCE' | 'MANUAL_INPUT';

export interface ProvenanceRef {
  documentId?: string;
  page?: number;
  fragmentId?: string;
  excerpt?: string;
  confirmedByLawyer?: boolean;
  kind: CivilSourceProvenance;
}

export interface CivilSourceDescriptor {
  id: string;
  sourceType: SourceDocumentTypeValue;
  matter?: string;
  role: CivilSourceRole;
  status: CivilSourceStatus;
  provenance: CivilSourceProvenance;
}

export interface CivilFact {
  id: string;
  order: number;
  text: string;
  status: CaseFieldStatus;
  sources: ProvenanceRef[];
}

export interface CivilClaim {
  id: string;
  description: string;
  amount?: CaseContextField;
  basis?: CaseContextField;
  relatedFacts: string[];
  sources: ProvenanceRef[];
  status: CaseFieldStatus;
}

export interface CivilEvidence {
  id: string;
  type: string;
  description: string;
  purpose?: string;
  relatedFacts: string[];
  source?: ProvenanceRef;
  status: CaseFieldStatus;
}

export interface CivilRequest {
  id: string;
  description: string;
  relatedClaims: string[];
  status: CaseFieldStatus;
  sources: ProvenanceRef[];
}

export interface LegalBasisItem {
  id: string;
  text: string;
  status: CaseFieldStatus;
  sources: ProvenanceRef[];
}

export interface CivilFieldInput {
  value?: string;
  confirmedByLawyer?: boolean;
  resolution?: CaseFieldResolution;
  provenance?: ProvenanceKind;
}

export interface CivilManualItemInput extends CivilFieldInput {
  id?: string;
  order?: number;
  relatedFacts?: string[];
  relatedClaims?: string[];
  type?: string;
  purpose?: string;
}

export interface CivilDemandManualInput {
  parties?: {
    actor?: CivilFieldInput;
    demandado?: CivilFieldInput;
  };
  personality?: CivilFieldInput;
  procedural?: {
    court?: CivilFieldInput;
    jurisdiction?: CivilFieldInput;
    procedure?: CivilFieldInput;
    action?: CivilFieldInput;
  };
  facts?: CivilManualItemInput[];
  claims?: CivilManualItemInput[];
  evidence?: CivilManualItemInput[];
  requests?: Array<CivilFieldInput & { id?: string; relatedClaims?: string[] }>;
  signature?: CivilFieldInput;
}

export interface CivilDemandContext {
  documentType: 'demanda_ordinaria_civil';
  sources: CivilSourceDescriptor[];
  parties: {
    actor: CaseContextField;
    demandado: CaseContextField;
    representatives: CaseContextField[];
    addresses: CaseContextField[];
  };
  personality: CaseContextField;
  procedural: {
    court: CaseContextField;
    jurisdiction: CaseContextField;
    procedure: CaseContextField;
    action: CaseContextField;
  };
  claims: CivilClaim[];
  facts: CivilFact[];
  evidence: CivilEvidence[];
  contracts: CaseContextField[];
  obligations: CaseContextField[];
  amounts: CaseContextField[];
  dates: CaseContextField[];
  requests: CivilRequest[];
  legalBasis: LegalBasisItem[];
  signature: CaseContextField;
}

export interface MinorChildInfo {
  name: CaseContextField;
  birthDate?: CaseContextField;
  age?: CaseContextField;
}

export interface FamiliarContext {
  documentType: string;
  promovente: CaseContextField;
  contraparte: CaseContextField;
  conyuge?: CaseContextField;
  progenitor?: CaseContextField;
  acreedorAlimentario?: CaseContextField;
  deudorAlimentario?: CaseContextField;
  menores: MinorChildInfo[];
  representanteLegal?: CaseContextField;
  parentesco?: CaseContextField;
  guardaCustodia?: CaseContextField;
  regimenConvivencia?: CaseContextField;
  pensionAlimentos?: CaseContextField;
  sociedadConyugal?: CaseContextField;
  convenio?: CaseContextField;
  resolucionFamiliar?: CaseContextField;
}

export const FAMILIAR_DOCUMENT_TYPES = [
  'demanda_divorcio',
  'convenio_divorcio',
  'contestacion_divorcio',
  'demanda_alimentos',
  'contestacion_alimentos',
  'solicitud_alimentos_provisionales',
  'demanda_guarda_custodia',
  'contestacion_guarda_custodia',
  'demanda_regimen_convivencias',
  'modificacion_convivencias',
  'perdida_patria_potestad',
  'reconocimiento_paternidad',
  'desconocimiento_paternidad',
  'adopcion',
  'medidas_proteccion_familiar',
  'convenio_familiar',
  'jurisdiccion_voluntaria_familiar',
  'liquidacion_sociedad_conyugal',
  'incidente_modificacion_pension',
  'incidente_reduccion_pension',
  'incidente_incremento_pension',
  'ejecucion_convenio_familiar',
  'apelacion_familiar',
  'alegatos_familiar',
] as const;

export type FamiliarDocumentType = (typeof FAMILIAR_DOCUMENT_TYPES)[number];

export function isFamiliarDocumentType(documentType?: string): boolean {
  if (!documentType) return false;
  const canonical = documentType.trim().toLowerCase().replace(/-/g, '_');
  return (FAMILIAR_DOCUMENT_TYPES as readonly string[]).includes(canonical);
}

export interface LaborBenefitItem {
  name: string;
  amount?: CaseContextField;
  period?: string;
  status: CaseFieldStatus;
}

export interface LaborContext {
  documentType: string;
  trabajador: CaseContextField;
  patron: CaseContextField;
  empresa?: CaseContextField;
  representantePatronal?: CaseContextField;
  puesto?: CaseContextField;
  salario?: CaseContextField;
  salarioDiario?: CaseContextField;
  fechaIngreso?: CaseContextField;
  fechaDespido?: CaseContextField;
  antiguedad?: CaseContextField;
  jornada?: CaseContextField;
  horario?: CaseContextField;
  centroTrabajo?: CaseContextField;
  prestaciones: LaborBenefitItem[];
  accionPrincipal?: CaseContextField;
  rescision?: CaseContextField;
  convenio?: CaseContextField;
  laudoResolucion?: CaseContextField;
  autoridadLaboral?: CaseContextField;
}

export const LABORAL_DOCUMENT_TYPES = [
  'demanda_laboral',
  'contestacion_demanda_laboral',
  'reconvencion_laboral',
  'contestacion_reconvencion_laboral',
  'ampliacion_demanda_laboral',
  'ofrecimiento_pruebas_laboral',
  'objecion_pruebas_laboral',
  'desahogo_prevencion_laboral',
  'alegatos_laborales',
  'cumplimiento_laudo_sentencia_laboral',
  'ejecucion_sentencia_laboral',
  'demanda_amparo_directo_laboral',
  'demanda_amparo_indirecto_laboral',
] as const;

export type LaboralDocumentType = (typeof LABORAL_DOCUMENT_TYPES)[number];

export function isLaboralDocumentType(documentType?: string): boolean {
  if (!documentType) return false;
  const canonical = documentType.trim().toLowerCase().replace(/-/g, '_');
  return (LABORAL_DOCUMENT_TYPES as readonly string[]).includes(canonical);
}

export const AMPARO_DOCUMENT_TYPES = [
  'demanda_amparo_indirecto',
  'demanda_amparo_directo',
  'contestacion_revision_extraordinaria_amparo_directo',
  'recurso_revision_amparo_directo',
  'ampliacion_demanda_amparo',
  'amparo_adhesivo',
  'solicitud_suspension_provisional',
  'solicitud_suspension_definitiva',
  'alegatos_amparo',
  'recurso_revision_amparo',
  'recurso_queja_amparo',
  'recurso_reclamacion_amparo',
  'recurso_inconformidad_amparo',
  'cumplimiento_ejecutoria_amparo',
  'promocion_cumplimiento_amparo',
  'manifestaciones_cumplimiento_amparo',
] as const;

export type AmparoDocumentType = (typeof AMPARO_DOCUMENT_TYPES)[number];

export function isAmparoDocumentType(documentType?: string): boolean {
  if (!documentType) return false;
  const canonical = documentType.trim().toLowerCase().replace(/-/g, '_');
  return (AMPARO_DOCUMENT_TYPES as readonly string[]).includes(canonical);
}

export interface AmparoContext {
  documentType: string;
  quejoso: CaseContextField;
  autoridadResponsable: CaseContextField;
  terceroInteresado?: CaseContextField;
  actoReclamado?: CaseContextField;
  fechaNotificacionActo?: CaseContextField;
  preceptosViolados: string[];
  conceptosViolacion: string[];
  suspensionSolicitada?: boolean;
  tipoAmparo?: 'DIRECTO' | 'INDIRECTO';
  resolucionRecurrida?: CaseContextField;
  ejecutoriaCumplimiento?: CaseContextField;
}

export const ADMINISTRATIVO_DOCUMENT_TYPES = [
  'demanda_nulidad_administrativa',
  'contestacion_nulidad_administrativa',
  'ampliacion_demanda_nulidad',
  'contestacion_ampliacion_nulidad',
  'alegatos_administrativos',
  'cumplimiento_sentencia_administrativa',
  'recurso_administrativo',
  'recurso_revision_administrativa',
  'solicitud_suspension_acto_administrativo',
  'incidente_administrativo',
] as const;

export type AdministrativoDocumentType = (typeof ADMINISTRATIVO_DOCUMENT_TYPES)[number];

export function isAdministrativoDocumentType(documentType?: string): boolean {
  if (!documentType) return false;
  const canonical = documentType.trim().toLowerCase().replace(/-/g, '_');
  return (ADMINISTRATIVO_DOCUMENT_TYPES as readonly string[]).includes(canonical);
}

export interface AdministrativoContext {
  documentType: string;
  actor: CaseContextField;
  autoridadDemandada: CaseContextField;
  resolucionImpugnada?: CaseContextField;
  fechaNotificacionResolucion?: CaseContextField;
  autoridadEmisora?: CaseContextField;
  conceptosImpugnacion: string[];
  suspensionSolicitada?: boolean;
  terceroPerjudicado?: CaseContextField;
  sentenciaCumplimiento?: CaseContextField;
}

export const FISCAL_DOCUMENT_TYPES = [
  'demanda_nulidad_fiscal',
  'contestacion_nulidad_fiscal',
  'ampliacion_demanda_fiscal',
  'contestacion_ampliacion_fiscal',
  'recurso_revocacion_fiscal',
  'recurso_revision_fiscal',
  'alegatos_fiscales',
  'cumplimiento_sentencia_fiscal',
  'solicitud_suspension_fiscal',
  'escritos_ante_autoridad_fiscal',
] as const;

export type FiscalDocumentType = (typeof FISCAL_DOCUMENT_TYPES)[number];

export function isFiscalDocumentType(documentType?: string): boolean {
  if (!documentType) return false;
  const canonical = documentType.trim().toLowerCase().replace(/-/g, '_');
  return (FISCAL_DOCUMENT_TYPES as readonly string[]).includes(canonical);
}

export interface FiscalContext {
  documentType: string;
  contribuyente: CaseContextField;
  autoridadFiscalDemandada: CaseContextField;
  resolucionDeterminativa?: CaseContextField;
  creditoFiscal?: CaseContextField;
  fechaNotificacion?: CaseContextField;
  conceptosImpugnacion: string[];
  suspensionSolicitada?: boolean;
  garantiaInteresFiscal?: CaseContextField;
  recursoSedeAdministrativa?: boolean;
  sentenciaCumplimiento?: CaseContextField;
}

export const PENAL_DOCUMENT_TYPES = [
  'denuncia',
  'querella',
  'ampliacion_denuncia',
  'ampliacion_querella',
  'escrito_asesor_juridico',
  'escrito_defensa',
  'solicitud_actos_investigacion',
  'solicitud_acceso_carpeta',
  'solicitud_copias_carpeta',
  'solicitud_medida_proteccion',
  'escrito_coadyuvancia',
  'apelacion_penal',
  'revocacion_penal',
  'escrito_ejecucion_penal',
] as const;

export type PenalDocumentType = (typeof PENAL_DOCUMENT_TYPES)[number];

export function isPenalDocumentType(documentType?: string): boolean {
  if (!documentType) return false;
  const canonical = documentType.trim().toLowerCase().replace(/-/g, '_');
  return (PENAL_DOCUMENT_TYPES as readonly string[]).includes(canonical);
}

export interface PenalContext {
  documentType: string;
  victimaUOfendido: CaseContextField;
  imputado: CaseContextField;
  denuncianteOQuerellante?: CaseContextField;
  defensor?: CaseContextField;
  asesorJuridico?: CaseContextField;
  ministerioPublico?: CaseContextField;
  juezControl?: CaseContextField;
  tribunalEnjuiciamiento?: CaseContextField;
  juezEjecucion?: CaseContextField;
  carpetaInvestigacion?: CaseContextField;
  causaPenal?: CaseContextField;
  delitoImputado?: CaseContextField;
  medidaCautelar?: CaseContextField;
  medidaProteccion?: CaseContextField;
  actosInvestigacion?: string[];
  agraviosPenales?: string[];
}

export const AGRARIO_DOCUMENT_TYPES = [
  'demanda_agraria',
  'contestacion_demanda_agraria',
  'reconvencion_agraria',
  'alegatos_agrarios',
  'cumplimiento_sentencia_agraria',
  'recurso_agrario',
] as const;

export type AgrarioDocumentType = (typeof AGRARIO_DOCUMENT_TYPES)[number];

export function isAgrarioDocumentType(documentType?: string): boolean {
  if (!documentType) return false;
  const canonical = documentType.trim().toLowerCase().replace(/-/g, '_');
  return (AGRARIO_DOCUMENT_TYPES as readonly string[]).includes(canonical);
}

export interface AgrarioContext {
  documentType: string;
  actorAgrario: CaseContextField;
  demandadoAgrario: CaseContextField;
  ejidoOComunidad?: CaseContextField;
  parcelaOTierras?: CaseContextField;
  tribunalUnitarioAgrario?: CaseContextField;
  expedienteAgrario?: CaseContextField;
  prestacionesAgrarias: string[];
  hechosAgrarios: string[];
}

export const INMOBILIARIO_DOCUMENT_TYPES = [
  'promesa_compraventa_inmueble',
  'compraventa_inmueble',
  'arrendamiento_inmueble',
  'terminacion_arrendamiento',
  'requerimiento_pago_rentas',
  'aviso_terminacion',
  'convenio_desocupacion',
  'reconocimiento_adeudo_arrendamiento',
  'demanda_desocupacion',
] as const;

export type InmobiliarioDocumentType = (typeof INMOBILIARIO_DOCUMENT_TYPES)[number];

export function isInmobiliarioDocumentType(documentType?: string): boolean {
  if (!documentType) return false;
  const canonical = documentType.trim().toLowerCase().replace(/-/g, '_');
  return (INMOBILIARIO_DOCUMENT_TYPES as readonly string[]).includes(canonical);
}

export interface InmobiliarioContext {
  documentType: string;
  arrendadorOVendedor: CaseContextField;
  arrendatarioOComprador: CaseContextField;
  fiador?: CaseContextField;
  inmuebleUbicacion?: CaseContextField;
  folioReal?: CaseContextField;
  rentaOPrecio?: CaseContextField;
  adeudoRentas?: CaseContextField;
  vigencia?: CaseContextField;
}


export const CORPORATIVO_DOCUMENT_TYPES = [
  'constitucion_sociedad',
  'modificacion_estatutos',
  'acta_asamblea_ordinaria',
  'acta_asamblea_extraordinaria',
  'resoluciones_unanimidad',
  'acta_consejo',
  'aumento_capital',
  'reduccion_capital',
  'cesion_partes_sociales',
  'compraventa_acciones',
  'poderes',
  'revocacion_poder',
  'convenio_accionistas',
  'acuerdo_confidencialidad',
  'carta_intencion',
] as const;

export type CorporativoDocumentType = (typeof CORPORATIVO_DOCUMENT_TYPES)[number];

export function isCorporativoDocumentType(documentType?: string): boolean {
  if (!documentType) return false;
  const canonical = documentType.trim().toLowerCase().replace(/-/g, '_');
  return (CORPORATIVO_DOCUMENT_TYPES as readonly string[]).includes(canonical);
}

export interface CorporativoContext {
  documentType: string;
  sociedad: CaseContextField;
  objetoSocial?: CaseContextField;
  capitalSocial?: CaseContextField;
  accionistasOSocios: CaseContextField[];
  representanteOApoderado?: CaseContextField;
  tipoPoderes?: CaseContextField;
  acuerdosAsamblea: string[];
}

export const CONTRACTUAL_DOCUMENT_TYPES = [
  'contrato_compraventa',
  'contrato_arrendamiento',
  'contrato_prestacion_servicios',
  'contrato_obra',
  'contrato_mutuo',
  'contrato_comodato',
  'contrato_mandato',
  'contrato_comision',
  'contrato_distribucion',
  'contrato_suministro',
  'contrato_confidencialidad',
  'contrato_licencia',
  'convenio_transaccional',
  'convenio_reconocimiento_adeudo',
  'convenio_terminacion',
  'convenio_modificatorio',
  'memorando_entendimiento',
] as const;

export type ContractualDocumentType = (typeof CONTRACTUAL_DOCUMENT_TYPES)[number];

export function isContractualDocumentType(documentType?: string): boolean {
  if (!documentType) return false;
  const canonical = documentType.trim().toLowerCase().replace(/-/g, '_');
  return (CONTRACTUAL_DOCUMENT_TYPES as readonly string[]).includes(canonical);
}

export interface ContractualContext {
  documentType: string;
  parteA: CaseContextField;
  parteB: CaseContextField;
  objetoContrato?: CaseContextField;
  contraprestacionOPrecio?: CaseContextField;
  vigenciaOPlazo?: CaseContextField;
  penaConvencional?: CaseContextField;
  clausulasPrincipales: string[];
}

export const PROPIEDAD_INTELECTUAL_DOCUMENT_TYPES = [
  'contrato_licencia_marca',
  'cesion_derechos_marca',
  'licencia_derechos_autor',
  'cesion_derechos_autor',
  'infraccion_propiedad_industrial',
  'recurso_propiedad_intelectual',
  'solicitud_registro_marca',
  'contestacion_impedimento',
  'oposicion_marca',
  'nulidad_registro',
  'caducidad_registro',
] as const;

export type PropiedadIntelectualDocumentType = (typeof PROPIEDAD_INTELECTUAL_DOCUMENT_TYPES)[number];

export function isPropiedadIntelectualDocumentType(documentType?: string): boolean {
  if (!documentType) return false;
  const canonical = documentType.trim().toLowerCase().replace(/-/g, '_');
  return (PROPIEDAD_INTELECTUAL_DOCUMENT_TYPES as readonly string[]).includes(canonical);
}

export interface PropiedadIntelectualContext {
  documentType: string;
  titularOSolicitante: CaseContextField;
  contraparteOAutoridad: CaseContextField;
  signoDistintivoUObra?: CaseContextField;
  numeroRegistroOExpediente?: CaseContextField;
  claseNiza?: CaseContextField;
  hechosInfraccionOImpedimento: string[];
  fundamentosOPreceptos: string[];
}

export const TRAMITE_GENERAL_DOCUMENT_TYPES = [
  'promocion_simple',
  'desahogo_prevencion',
  'cumplimiento_requerimiento',
  'cumplimiento_prevencion',
  'manifestaciones',
  'comparecencia',
  'ratificacion',
  'solicitud_copias',
  'solicitud_copias_certificadas',
  'solicitud_acceso_expediente',
  'solicitud_certificacion',
  'autorizacion_abogados',
  'revocacion_autorizados',
  'cambio_domicilio_procesal',
  'senalamiento_correo',
  'impulso_procesal',
  'solicitud_acumulacion',
  'solicitud_archivo',
  'solicitud_desarchivo',
  'desistimiento',
  'allanamiento',
  'convenio_judicial',
  'aclaracion',
  'correccion_error',
  'solicitud_devolucion_documentos',
] as const;

export type TramiteGeneralDocumentType = (typeof TRAMITE_GENERAL_DOCUMENT_TYPES)[number];

export function isTramiteGeneralDocumentType(documentType?: string): boolean {
  if (!documentType) return false;
  const canonical = documentType.trim().toLowerCase().replace(/-/g, '_');
  return (TRAMITE_GENERAL_DOCUMENT_TYPES as readonly string[]).includes(canonical);
}

export interface TramiteGeneralContext {
  documentType: string;
  promovente: CaseContextField;
  autoridadODestinatario: CaseContextField;
  juzgadoOTribunal?: CaseContextField;
  expedienteOActo?: CaseContextField;
  numeroExpediente?: CaseContextField;
  peticionOObjeto: CaseContextField;
  hechosOAntecedentes: string[];
  fundamentos: string[];
}

export interface CaseContext {
  fields: Record<string, CaseContextField>;
  /** Referencias procesales normalizadas; no se mezclan con nombres de partes. */
  caseReferences: Record<string, CaseContextField>;
  /** Colecciones extraídas que conservan su identidad y proveniencia. */
  facts: CaseContextField[];
  claims: CaseContextField[];
  evidence: CaseContextField[];
  authorities: CaseContextField[];
  provenance: Record<string, ProvenanceKind>;
  missingFields: string[];
  anonymizedFields: string[];
  sourceDocumentIds: string[];
  analysis: CaseAnalysis;
  civil?: CivilDemandContext;
  commercialEnforcement?: CommercialEnforcementContext;
  /** Contexto tipado de contestaciones/reconvenciones Civil y Mercantil. */
  civilMercantileResponse?: CivilMercantileResponseContext;
  /** Contexto tipado de pruebas y argumentos Civil/Mercantil. */
  civilMercantileEvidenceArgument?: CivilMercantileEvidenceArgumentContext;
  /** Contexto tipado para materia Familiar (LOOP 8C). */
  familiar?: FamiliarContext;
  /** Contexto tipado para materia Laboral (LOOP 8D). */
  laboral?: LaborContext;
  /** Contexto tipado para materia Constitucional / Amparo (LOOP 8E). */
  amparo?: AmparoContext;
  /** Contexto tipado para materia Administrativa (LOOP 8F). */
  administrativo?: AdministrativoContext;
  /** Contexto tipado para materia Fiscal (LOOP 8F). */
  fiscal?: FiscalContext;
  /** Contexto tipado para materia Penal (LOOP 8G). */
  penal?: PenalContext;
  /** Contexto tipado para materia Agraria (LOOP 8H). */
  agrario?: AgrarioContext;
  /** Contexto tipado para materia Inmobiliaria (LOOP 8H). */
  inmobiliario?: InmobiliarioContext;
  /** Contexto tipado para materia Corporativa y Societaria (LOOP 8I). */
  corporativo?: CorporativoContext;
  /** Contexto tipado para materia Contractual (LOOP 8I). */
  contractual?: ContractualContext;
  /** Contexto tipado para materia de Propiedad Intelectual (LOOP 8I). */
  propiedadIntelectual?: PropiedadIntelectualContext;
  /** Contexto tipado para materia Trámites Generales de Juzgado (LOOP 8J). */
  tramiteGeneral?: TramiteGeneralContext;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function containsLabel(values: string[], aliases: string[]): boolean {
  return values.some((value) => {
    const normalized = value.toLocaleLowerCase('es-MX');
    return aliases.some((alias) => normalized.includes(alias));
  });
}

function field(
  key: string,
  label: string,
  value: string | undefined,
  anonymized: boolean,
  provenance?: ProvenanceKind,
): CaseContextField {
  if (value?.trim()) {
    const resolution: CaseFieldResolution = provenance === 'INFERRED' ? 'INFERRED' : 'CONFIRMED';
    return {
      key,
      label,
      status: resolution === 'INFERRED' ? 'MISSING' : 'CONFIRMED',
      value: value.trim(),
      ...(provenance ? { provenance } : {}),
      resolution,
    };
  }
  return {
    key,
    label,
    status: anonymized ? 'ANONYMIZED' : 'MISSING',
    ...(anonymized ? { provenance: 'SOURCE_EXTRACTED' as const } : {}),
    resolution: 'REQUIRES_LAWYER_DECISION',
  };
}

function civilStatusFor(value: string | undefined, provenance: ProvenanceKind | undefined): CaseFieldStatus {
  if (!value?.trim()) return 'MISSING';
  return provenance === 'INFERRED' ? 'MISSING' : 'CONFIRMED';
}

function civilFieldFromInput(
  key: string,
  label: string,
  input: CivilFieldInput | undefined,
  fallback: CaseContextField,
): CaseContextField {
  if (!input) return fallback;
  const value = input.value?.trim();
  if (!value) return { ...fallback, key, label };

  if (input.confirmedByLawyer === true) {
    return {
      key,
      label,
      value,
      status: 'CONFIRMED',
      provenance: 'LAWYER_CONFIRMED',
      resolution: 'CONFIRMED',
      confirmedByLawyer: true,
    };
  }

  const provenance = input.resolution === 'INFERRED' ? 'INFERRED' : (input.provenance || 'LAWYER_INPUT');
  const resolution = input.resolution || (provenance === 'INFERRED' ? 'INFERRED' : 'REQUIRES_LAWYER_DECISION');
  return {
    key,
    label,
    value,
    status: provenance === 'INFERRED' ? 'MISSING' : 'MISSING',
    provenance,
    resolution,
    ...(input.confirmedByLawyer === false ? { confirmedByLawyer: false } : {}),
  };
}

function sourceRoleFor(source: UploadedSourceDocument): CivilSourceRole {
  const candidate = source.classification?.role || source.classification?.sourceRole || (source as { role?: string }).role;
  return candidate === 'PRIMARY' || candidate === 'SUPPORTING' || candidate === 'REFERENCE' ? candidate : 'UNSPECIFIED';
}

function sourceProvenanceFor(source: UploadedSourceDocument): CivilSourceProvenance {
  const candidate = source.classification?.provenance || (source as { provenance?: string }).provenance;
  if (candidate === 'MANUAL_INPUT') return 'MANUAL_INPUT';
  if (candidate === 'KNOWN_PROVENANCE') return 'KNOWN_PROVENANCE';
  if (candidate === 'PARTIAL_PROVENANCE') return 'PARTIAL_PROVENANCE';
  return source.filename || source.name ? 'KNOWN_PROVENANCE' : 'PARTIAL_PROVENANCE';
}

function civilSourceDescriptor(source: UploadedSourceDocument): CivilSourceDescriptor {
  const sourceType = inferSourceOutputType([source]);
  const role = sourceRoleFor(source);
  const status: CivilSourceStatus = source.sourceValidated === false
    ? 'UNVALIDATED'
    : sourceType === 'DOCUMENTO_JURIDICO_NO_CLASIFICADO'
      ? 'ANALYSIS_PENDING'
      : sourceDocumentMatter(sourceType as Exclude<SourceDocumentTypeValue, 'NO_SOURCE_DOCUMENT' | 'DOCUMENTO_JURIDICO_NO_CLASIFICADO'>) !== 'CIVIL'
        ? 'INCOMPATIBLE'
        : 'VALIDATED';
  return {
    id: source.id,
    sourceType,
    matter: sourceType === 'DOCUMENTO_JURIDICO_NO_CLASIFICADO'
      ? undefined
      : sourceDocumentMatter(sourceType as Exclude<SourceDocumentTypeValue, 'NO_SOURCE_DOCUMENT' | 'DOCUMENTO_JURIDICO_NO_CLASIFICADO'>),
    role,
    status,
    provenance: sourceProvenanceFor(source),
  };
}

function provenanceRefFrom(value: {
  documentId?: string;
  page?: number;
  paragraph?: number;
  textSnippet?: string;
  fragmentId?: string;
  excerpt?: string;
} | undefined, kind: CivilSourceProvenance = 'PARTIAL_PROVENANCE'): ProvenanceRef | undefined {
  if (!value?.documentId && value?.page === undefined && !value?.textSnippet && !value?.excerpt) return undefined;
  return {
    ...(value.documentId ? { documentId: value.documentId } : {}),
    ...(value.page !== undefined ? { page: value.page } : {}),
    ...(value.fragmentId ? { fragmentId: value.fragmentId } : {}),
    ...((value.excerpt || value.textSnippet) ? { excerpt: value.excerpt || value.textSnippet } : {}),
    kind,
  };
}

function civilFieldFromExisting(fieldValue: CaseContextField, key: string, label: string): CaseContextField {
  return { ...fieldValue, key, label };
}

function buildCivilDemandContext(
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  baseFields: Record<string, CaseContextField>,
  anonymizedData: string[],
  manual?: CivilDemandManualInput,
): CivilDemandContext {
  const inferredProvenance: ProvenanceKind | undefined = sources.length > 0 ? 'SOURCE_EXTRACTED' : 'INFERRED';
  const anonymized = (aliases: string[]) => containsLabel(anonymizedData, aliases);
  const missingField = (key: string, label: string, aliases: string[]): CaseContextField => ({
    key,
    label,
    status: anonymized(aliases) ? 'ANONYMIZED' : 'MISSING',
    ...(anonymized(aliases) ? { provenance: 'SOURCE_EXTRACTED' as const } : {}),
    resolution: 'REQUIRES_LAWYER_DECISION',
  });
  const fallbackField = (key: string, label: string, aliases: string[], existingKey = key) =>
    baseFields[existingKey]
      ? civilFieldFromExisting(baseFields[existingKey], key, label)
      : missingField(key, label, aliases);
  const extractedCivilFacts: CivilFact[] = (analysis.facts || []).map((item, index) => {
    const provenance = item.provenance || inferredProvenance;
    const ref = provenanceRefFrom(item.sourceReference, provenance === 'SOURCE_EXTRACTED' ? 'KNOWN_PROVENANCE' : 'PARTIAL_PROVENANCE');
    const supporting = (item.supportingSources || [])
      .map((value) => provenanceRefFrom(value, 'PARTIAL_PROVENANCE'))
      .filter((value): value is ProvenanceRef => Boolean(value));
    return {
      id: item.id,
      order: index + 1,
      text: item.text,
      status: civilStatusFor(item.text, provenance),
      sources: [...(ref ? [ref] : []), ...supporting],
    };
  });
  const manualCivilFacts: CivilFact[] = (manual?.facts || []).flatMap((item, index) => {
    if (!item.value?.trim()) return [];
    const itemField = civilFieldFromInput(
      item.id || 'manual_fact_' + (index + 1),
      'Hecho ' + (index + 1),
      item,
      missingField(item.id || 'manual_fact_' + (index + 1), 'Hecho ' + (index + 1), ['hecho']),
    );
    return [{
      id: item.id || 'manual-fact-' + (index + 1),
      order: item.order || extractedCivilFacts.length + index + 1,
      text: item.value.trim(),
      status: itemField.status,
      sources: [{
        kind: 'MANUAL_INPUT' as const,
        ...(itemField.confirmedByLawyer !== undefined ? { confirmedByLawyer: itemField.confirmedByLawyer } : {}),
      }],
    }];
  });
  const civilFacts = [...extractedCivilFacts, ...manualCivilFacts];
  const claimEntries = analysis.claimResponses?.length
    ? analysis.claimResponses
    : (analysis.claims || []).map((text, index) => ({ id: `claim-${index + 1}`, number: String(index + 1), text, position: 'UNDEFINED' as const }));
  const extractedCivilClaims: CivilClaim[] = claimEntries.map((item) => {
    const claim = item as { provenance?: ProvenanceKind; sourceReference?: { documentId?: string; page?: number; textSnippet?: string } };
    const provenance = claim.provenance || inferredProvenance;
    const ref = provenanceRefFrom(claim.sourceReference, provenance === 'SOURCE_EXTRACTED' ? 'KNOWN_PROVENANCE' : 'PARTIAL_PROVENANCE');
    return {
      id: item.id,
      description: item.text,
      relatedFacts: [],
      sources: ref ? [ref] : [],
      status: civilStatusFor(item.text, provenance),
    };
  });
  const manualCivilClaims: CivilClaim[] = (manual?.claims || []).flatMap((item, index) => {
    if (!item.value?.trim()) return [];
    const itemField = civilFieldFromInput(
      item.id || 'manual_claim_' + (index + 1),
      'Prestación ' + (index + 1),
      item,
      missingField(item.id || 'manual_claim_' + (index + 1), 'Prestación ' + (index + 1), ['prestación', 'pretensión']),
    );
    return [{
      id: item.id || 'manual-claim-' + (index + 1),
      description: item.value.trim(),
      relatedFacts: item.relatedFacts || [],
      sources: [{
        kind: 'MANUAL_INPUT' as const,
        ...(itemField.confirmedByLawyer !== undefined ? { confirmedByLawyer: itemField.confirmedByLawyer } : {}),
      }],
      status: itemField.status,
    }];
  });
  const civilClaims = [...extractedCivilClaims, ...manualCivilClaims];
  const civilEvidence: CivilEvidence[] = (analysis.evidence || []).map((item, index) => {
    const provenance = item.provenance || inferredProvenance;
    const source = provenanceRefFrom(item.sourceReference, provenance === 'SOURCE_EXTRACTED' ? 'KNOWN_PROVENANCE' : 'PARTIAL_PROVENANCE');
    return {
      id: item.id || `evidence-${index + 1}`,
      type: item.type,
      description: item.description,
      relatedFacts: [],
      ...(source ? { source } : {}),
      status: civilStatusFor(item.description, provenance),
    };
  });
  const civilRequests: CivilRequest[] = (manual?.requests || []).flatMap((item, index) => {
    if (!item.value?.trim()) return [];
    const fieldValue = civilFieldFromInput(`request_${index + 1}`, `Petición ${index + 1}`, item, missingField(`request_${index + 1}`, `Petición ${index + 1}`, ['petición', 'petitorio']));
    return [{
      id: item.id || `request-${index + 1}`,
      description: item.value.trim(),
      relatedClaims: item.relatedClaims || [],
      status: fieldValue.status,
      sources: [{ kind: fieldValue.provenance === 'LAWYER_CONFIRMED' ? 'KNOWN_PROVENANCE' : 'MANUAL_INPUT', confirmedByLawyer: fieldValue.confirmedByLawyer }],
    }];
  });
  const legalBasis: LegalBasisItem[] = (analysis.citations || []).flatMap((citation, index) => {
    const text = citation.texto || citation.rubro || citation.registro;
    return text?.trim() ? [{ id: `legal-basis-${index + 1}`, text: text.trim(), status: 'CONFIRMED' as const, sources: [] }] : [];
  });

  return {
    documentType: 'demanda_ordinaria_civil',
    sources: sources.map(civilSourceDescriptor),
    parties: {
      actor: civilFieldFromInput('actor', 'Actor', manual?.parties?.actor, fallbackField('actor', 'Actor', ['actor', 'demandante'], 'actor')),
      demandado: civilFieldFromInput('demandado', 'Demandado', manual?.parties?.demandado, fallbackField('demandado', 'Demandado', ['demandado'])),
      representatives: [],
      addresses: [],
    },
    personality: civilFieldFromInput('personality', 'Personalidad', manual?.personality, missingField('personality', 'Personalidad', ['personalidad', 'representación'])),
    procedural: {
      court: civilFieldFromInput('court', 'Órgano jurisdiccional', manual?.procedural?.court, missingField('court', 'Órgano jurisdiccional', ['juzgado', 'tribunal', 'órgano'])),
      jurisdiction: civilFieldFromInput('jurisdiction', 'Competencia', manual?.procedural?.jurisdiction, missingField('jurisdiction', 'Competencia', ['competencia'])),
      procedure: civilFieldFromInput('procedure', 'Procedimiento', manual?.procedural?.procedure, missingField('procedure', 'Procedimiento', ['procedimiento', 'vía'])),
      action: civilFieldFromInput('action', 'Acción', manual?.procedural?.action, missingField('action', 'Acción', ['acción'])),
    },
    claims: civilClaims,
    facts: civilFacts,
    evidence: civilEvidence,
    contracts: [],
    obligations: [],
    amounts: [],
    dates: [],
    requests: civilRequests,
    legalBasis,
    signature: civilFieldFromInput('signature', 'Firma', manual?.signature, missingField('signature', 'Firma', ['firma'])),
  };
}

function contextKeyForLabel(value: string): string | undefined {
  const normalized = value.toLocaleLowerCase('es-MX');
  if (/promovente|quejoso|actor/.test(normalized)) return 'promovente';
  if (/demandado/.test(normalized)) return 'demandado';
  if (/autoridad/.test(normalized)) return 'autoridadResponsable';
  if (/tercero/.test(normalized)) return 'terceroInteresado';
  return undefined;
}

/**
 * Construye el contexto de caso sin perder la diferencia entre un dato que no
 * aparece y un dato que la fuente pública sustituyó deliberadamente.
 */
export function buildCaseContext(
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  confirmedParties?: DocumentParties,
  civilManualInput?: CivilDemandManualInput | CommercialEnforcementManualInput,
  commercialManualInput?: CommercialEnforcementManualInput,
  responseDocumentType?: string,
): CaseContext {
  const looksCommercial = (value: CivilDemandManualInput | CommercialEnforcementManualInput | undefined): value is CommercialEnforcementManualInput => Boolean(
    value && typeof value === 'object' && ('instrument' in value || 'obligations' in value || ('parties' in value && Boolean((value.parties as { creditor?: unknown }).creditor))),
  );
  const effectiveCommercialManualInput = commercialManualInput || (looksCommercial(civilManualInput) ? civilManualInput : undefined);
  const effectiveCivilManualInput = looksCommercial(civilManualInput) ? undefined : civilManualInput;
  const anonymizedData = unique(analysis.anonymizedData || []);
  const missingData = unique(analysis.missingData || []);
  const isAnonymized = (aliases: string[]) => containsLabel(anonymizedData, aliases);
  const parties = { ...analysis.parties };
  const confirmedKeys = new Set<string>();
  const supportedPartyKeys = new Set<keyof DocumentParties>([
    'actor',
    'demandado',
    'terceroInteresado',
    'autoridadResponsable',
    'quejoso',
    'representanteLegal',
  ]);
  Object.entries(confirmedParties || {}).forEach(([key, value]) => {
    if (
      typeof value === 'string' &&
      value.trim() &&
      supportedPartyKeys.has(key as keyof DocumentParties)
    ) {
      (parties as Record<string, string>)[key] = value.trim();
      confirmedKeys.add(key);
    }
  });
  const inferredProvenance: ProvenanceKind | undefined = sources.length > 0 ? 'SOURCE_EXTRACTED' : 'INFERRED';
  const provenanceFor = (...keys: string[]): ProvenanceKind | undefined =>
    keys.some((key) => confirmedKeys.has(key)) ? 'LAWYER_CONFIRMED' : inferredProvenance;

  const fields: Record<string, CaseContextField> = {
    promovente: field(
      'promovente',
      'Nombre del promovente',
      parties.actor || parties.quejoso,
      isAnonymized(['promovente', 'quejoso', 'actor']),
      provenanceFor('actor', 'quejoso', 'promovente'),
    ),
    actor: field(
      'actor',
      'Nombre del actor',
      parties.actor,
      isAnonymized(['actor', 'promovente', 'quejoso']),
      provenanceFor('actor'),
    ),
    quejoso: field(
      'quejoso',
      'Nombre del quejoso',
      parties.quejoso,
      isAnonymized(['quejoso', 'promovente']),
      provenanceFor('quejoso', 'promovente'),
    ),
    demandado: field(
      'demandado',
      'Nombre del demandado',
      parties.demandado,
      isAnonymized(['demandado']),
      provenanceFor('demandado'),
    ),
    autoridadResponsable: field(
      'autoridadResponsable',
      'Autoridad responsable',
      parties.autoridadResponsable,
      isAnonymized(['autoridad responsable']),
      provenanceFor('autoridadResponsable'),
    ),
    terceroInteresado: field(
      'terceroInteresado',
      'Tercero interesado',
      parties.terceroInteresado,
      isAnonymized(['tercero interesado']),
      provenanceFor('terceroInteresado'),
    ),
  };

  const extractedField = (key: string, label: string, value: string | undefined): CaseContextField =>
    field(key, label, value, false, value?.trim() ? inferredProvenance : undefined);
  const caseReferences: Record<string, CaseContextField> = {
    expediente: extractedField('expediente', 'Número de expediente', analysis.caseNumbers?.principal),
    amparoDirecto: extractedField('amparoDirecto', 'Número de amparo directo', analysis.caseNumbers?.amparoDirecto),
    amparoIndirecto: extractedField('amparoIndirecto', 'Número de amparo indirecto', analysis.caseNumbers?.amparoIndirecto),
    toca: extractedField('toca', 'Número de toca', analysis.caseNumbers?.toca),
    juzgado: extractedField('juzgado', 'Juzgado competente', undefined),
    tribunal: extractedField('tribunal', 'Tribunal competente', analysis.authorities?.[0]),
  };
  const facts = (analysis.facts || []).map((item) => ({
    key: `fact_${item.id}`,
    label: `Hecho ${item.number}`,
    status: item.text?.trim() ? 'CONFIRMED' as const : 'MISSING' as const,
    ...(item.text?.trim() ? { value: item.text.trim(), provenance: (item as { provenance?: ProvenanceKind }).provenance || inferredProvenance } : {}),
  }));
  const normalizedClaims = analysis.claimResponses?.length
    ? analysis.claimResponses
    : (analysis.claims || []).map((value, index) => ({
      id: `claim-${index + 1}`,
      number: String(index + 1),
      text: value,
      position: 'REQUIRE_LAWYER_INPUT' as const,
    }));
  const claims = normalizedClaims.map((item) => ({
    key: `claim_${item.id}`,
    label: `Prestación ${item.number}`,
    status: item.text?.trim() ? 'CONFIRMED' as const : 'MISSING' as const,
    ...(item.text?.trim() ? { value: item.text.trim(), provenance: (item as { provenance?: ProvenanceKind }).provenance || inferredProvenance } : {}),
  }));
  const evidence = (analysis.evidence || []).map((item, index) => ({
    key: `evidence_${item.id || index + 1}`,
    label: item.type || `Prueba ${index + 1}`,
    status: item.description?.trim() ? 'CONFIRMED' as const : 'MISSING' as const,
    ...(item.description?.trim() ? { value: item.description.trim(), provenance: item.provenance || inferredProvenance } : {}),
  }));
  const authorities = (analysis.authorities || []).map((value, index) => ({
    key: `authority_${index + 1}`,
    label: 'Autoridad u órgano',
    status: value.trim() ? 'CONFIRMED' as const : 'MISSING' as const,
    ...(value.trim() ? { value: value.trim(), provenance: inferredProvenance } : {}),
  }));
  const provenance: Record<string, ProvenanceKind> = {};
  Object.entries(fields).forEach(([key, value]) => {
    if (value.provenance) provenance[key] = value.provenance;
  });
  Object.entries(caseReferences).forEach(([key, value]) => {
    if (value.provenance) provenance[key] = value.provenance;
  });

  const anonymizedFields = unique(anonymizedData);
  const missingFields = missingData.filter(
    (missing) => {
      const key = contextKeyForLabel(missing);
      if (key && fields[key]?.status !== 'MISSING') return false;
      return !containsLabel(anonymizedFields, [missing.toLocaleLowerCase('es-MX')]);
    },
  );

  const responseContext = responseDocumentType && isCivilMercantileResponseDocumentType(responseDocumentType)
    ? buildCivilMercantileResponseContext(responseDocumentType, sources, analysis)
    : undefined;
  const evidenceArgumentContext = responseDocumentType && isCivilMercantileEvidenceArgumentDocumentType(responseDocumentType)
    ? buildCivilMercantileEvidenceArgumentContext(responseDocumentType, sources, analysis)
    : undefined;
  const familiarContext = responseDocumentType && isFamiliarDocumentType(responseDocumentType)
    ? buildFamiliarContext(responseDocumentType, sources, analysis, fields)
    : undefined;
  const laborContext = responseDocumentType && isLaboralDocumentType(responseDocumentType)
    ? buildLaborContext(responseDocumentType, sources, analysis, fields)
    : undefined;
  const amparoContext = responseDocumentType && isAmparoDocumentType(responseDocumentType)
    ? buildAmparoContext(responseDocumentType, sources, analysis, fields)
    : undefined;
  const administrativoContext = responseDocumentType && isAdministrativoDocumentType(responseDocumentType)
    ? buildAdministrativoContext(responseDocumentType, sources, analysis, fields)
    : undefined;
  const fiscalContext = responseDocumentType && isFiscalDocumentType(responseDocumentType)
    ? buildFiscalContext(responseDocumentType, sources, analysis, fields)
    : undefined;
  const penalContext = responseDocumentType && isPenalDocumentType(responseDocumentType)
    ? buildPenalContext(responseDocumentType, sources, analysis, fields)
    : undefined;
  const agrarioContext = responseDocumentType && isAgrarioDocumentType(responseDocumentType)
    ? buildAgrarioContext(responseDocumentType, sources, analysis, fields)
    : undefined;
  const inmobiliarioContext = responseDocumentType && isInmobiliarioDocumentType(responseDocumentType)
    ? buildInmobiliarioContext(responseDocumentType, sources, analysis, fields)
    : undefined;
  const corporativoContext = responseDocumentType && isCorporativoDocumentType(responseDocumentType)
    ? buildCorporativoContext(responseDocumentType, sources, analysis, fields)
    : undefined;
  const contractualContext = responseDocumentType && isContractualDocumentType(responseDocumentType)
    ? buildContractualContext(responseDocumentType, sources, analysis, fields)
    : undefined;
  const piContext = responseDocumentType && isPropiedadIntelectualDocumentType(responseDocumentType)
    ? buildPropiedadIntelectualContext(responseDocumentType, sources, analysis, fields)
    : undefined;
  const tramiteGeneralContext = responseDocumentType && isTramiteGeneralDocumentType(responseDocumentType)
    ? buildTramiteGeneralContext(responseDocumentType, sources, analysis, fields)
    : undefined;

  return {
    fields,
    caseReferences,
    facts,
    claims,
    evidence,
    authorities,
    provenance,
    missingFields,
    anonymizedFields,
    sourceDocumentIds: unique(sources.map((source) => source.id)),
    analysis,
    civil: buildCivilDemandContext(sources, analysis, fields, anonymizedFields, effectiveCivilManualInput),
    ...(effectiveCommercialManualInput !== undefined
      ? { commercialEnforcement: buildCommercialEnforcementContext(sources, analysis, effectiveCommercialManualInput) }
      : {}),
    ...(responseContext ? { civilMercantileResponse: responseContext } : {}),
    ...(evidenceArgumentContext ? { civilMercantileEvidenceArgument: evidenceArgumentContext } : {}),
    ...(familiarContext ? { familiar: familiarContext } : {}),
    ...(laborContext ? { laboral: laborContext } : {}),
    ...(amparoContext ? { amparo: amparoContext } : {}),
    ...(administrativoContext ? { administrativo: administrativoContext } : {}),
    ...(fiscalContext ? { fiscal: fiscalContext } : {}),
    ...(penalContext ? { penal: penalContext } : {}),
    ...(agrarioContext ? { agrario: agrarioContext } : {}),
    ...(inmobiliarioContext ? { inmobiliario: inmobiliarioContext } : {}),
    ...(corporativoContext ? { corporativo: corporativoContext } : {}),
    ...(contractualContext ? { contractual: contractualContext } : {}),
    ...(piContext ? { propiedadIntelectual: piContext } : {}),
    ...(tramiteGeneralContext ? { tramiteGeneral: tramiteGeneralContext } : {}),
  };
}

function extractArgText(a: any): string {
  if (!a) return '';
  if (typeof a === 'string') return a;
  return a.thesis || a.synthesis || '';
}

export function buildFamiliarContext(
  documentType: string,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  baseFields: Record<string, CaseContextField>,
): FamiliarContext {
  const isDivorcio = /divorcio/i.test(documentType);
  const isAlimentos = /alimentos|pension/i.test(documentType);
  const isCustodia = /custodia|convivencia/i.test(documentType);
  const isAdopcion = /adopcion/i.test(documentType);
  const isVoluntario = /voluntaria|no_contencioso/i.test(documentType);

  const promovente = baseFields.promovente || baseFields.actor || field('promovente', 'Promovente', undefined, false);
  const contraparte = (isVoluntario || isAdopcion)
    ? field('contraparte', 'Contraparte', undefined, false)
    : (baseFields.demandado || field('contraparte', 'Contraparte', undefined, false));

  // Menores: NO inventar datos. Extraer únicamente si constan expresamente en los hechos del análisis.
  const menores: MinorChildInfo[] = [];
  const textToScan = (analysis.facts || []).map((f) => f.text).join(' ');
  const minorMatches = textToScan.matchAll(/(?:el|la)\s+menor\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/gi);
  for (const match of minorMatches) {
    const nombre = match[1].trim();
    if (nombre && !menores.some((m) => m.name.value === nombre)) {
      menores.push({ name: field('nombreMenor', 'Nombre del menor', nombre, false) });
    }
  }

  return {
    documentType,
    promovente,
    contraparte,
    conyuge: isDivorcio ? (baseFields.demandado?.value ? baseFields.demandado : field('conyuge', 'Cónyuge', undefined, false)) : undefined,
    progenitor: isCustodia ? promovente : undefined,
    acreedorAlimentario: isAlimentos ? promovente : undefined,
    deudorAlimentario: isAlimentos ? contraparte : undefined,
    menores,
    representanteLegal: (analysis.parties as any)?.representanteLegal
      ? field('representanteLegal', 'Representante legal', (analysis.parties as any).representanteLegal, false)
      : undefined,
    parentesco: field('parentesco', 'Parentesco', undefined, false),
    guardaCustodia: field('guardaCustodia', 'Guarda y custodia', undefined, false),
    regimenConvivencia: field('regimenConvivencia', 'Régimen de convivencia', undefined, false),
    pensionAlimentos: field('pensionAlimentos', 'Pensión alimenticia', undefined, false),
    sociedadConyugal: /conyugal/i.test(documentType) ? field('sociedadConyugal', 'Sociedad conyugal', undefined, false) : undefined,
    convenio: /convenio/i.test(documentType) ? field('convenio', 'Convenio familiar', undefined, false) : undefined,
    resolucionFamiliar: /resolucion|sentencia|apelacion|ejecucion/i.test(documentType)
      ? field('resolucionFamiliar', 'Resolución familiar de origen', undefined, false)
      : undefined,
  };
}

export function buildLaborContext(
  documentType: string,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  baseFields: Record<string, CaseContextField>,
): LaborContext {
  const isContestacion = /contestacion/i.test(documentType);
  const isDemanda = /demanda_laboral/i.test(documentType);
  const isReconvencion = /reconvencion/i.test(documentType);
  const isAmparo = /amparo/i.test(documentType);

  const trabajador = baseFields.trabajador || baseFields.actor || field('trabajador', 'Trabajador', undefined, false);
  const patron = baseFields.patron || baseFields.empresa || baseFields.demandado || field('patron', 'Patrón o empresa', undefined, false);

  const textToScan = [...(analysis.facts || []).map((f) => f.text), ...(analysis.claims || [])].join(' ');

  let salarioVal: string | undefined = undefined;
  let salarioDiarioVal: string | undefined = undefined;
  const salarioDiarioMatch = textToScan.match(/(?:salario|sueldo)\s+diario(?:\s+de)?\s+(\$[\d,]+(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?)/i);
  if (salarioDiarioMatch) {
    salarioDiarioVal = salarioDiarioMatch[1].replace(/^\$/, '').trim();
    salarioVal = salarioDiarioMatch[1];
  }
  const salarioMatch = textToScan.match(/(?:salario|sueldo)(?:\s+(?:mensual|quincenal|diario|semanal))?(?:\s+de)?\s+(\$[\d,]+(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?\s*pesos)/i);
  if (salarioMatch) {
    if (!salarioVal) salarioVal = salarioMatch[1];
    if (!salarioDiarioVal && /diario/i.test(salarioMatch[0])) {
      salarioDiarioVal = salarioMatch[1].replace(/^\$/, '').replace(/\s*pesos/i, '').trim();
    }
  }

  let puestoVal: string | undefined = undefined;
  const puestoMatch = textToScan.match(/(?:puesto|cargo|funciones)\s+de\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){0,3})/i);
  if (puestoMatch) {
    puestoVal = puestoMatch[1].replace(/\s+(?:y|con|percibiendo|ganando)\s+.*$/i, '').trim();
  }

  let fechaIngresoVal: string | undefined = undefined;
  const ingresoMatch = textToScan.match(/(?:ingres[oó](?:\s+a\s+laborar)?|comenz[oó](?:\s+a\s+laborar)?|fecha de ingreso|inici[oó](?:\s+a\s+laborar)?)(?:\s+el)?\s+(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|\d{2}\/\d{2}\/\d{4})/i);
  if (ingresoMatch) {
    fechaIngresoVal = ingresoMatch[1];
  }

  let fechaDespidoVal: string | undefined = undefined;
  const despidoMatch =
    textToScan.match(/(?:despidi[oó]|despido|rescisi[oó]n)(?:\s+(?:injustificado|injustificada))?(?:\s+el)?\s+(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|\d{2}\/\d{2}\/\d{4})/i) ||
    textToScan.match(/(?:con\s+fecha\s+|el\s+)?(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|\d{2}\/\d{2}\/\d{4})\s+fue\s+(?:despedido|rescindido)/i);
  if (despidoMatch) {
    fechaDespidoVal = despidoMatch[1];
  }

  const prestaciones: LaborBenefitItem[] = [];
  if (/aguinaldo/i.test(textToScan)) prestaciones.push({ name: 'Aguinaldo', status: 'CONFIRMED' });
  if (/vacacion/i.test(textToScan)) prestaciones.push({ name: 'Vacaciones', status: 'CONFIRMED' });
  if (/prima vacacional/i.test(textToScan)) prestaciones.push({ name: 'Prima vacacional', status: 'CONFIRMED' });
  if (/horas extras|jornada extraordinaria/i.test(textToScan)) prestaciones.push({ name: 'Horas extraordinarias', status: 'CONFIRMED' });
  if (/indemnizaci[oó]n constitucional/i.test(textToScan)) prestaciones.push({ name: 'Indemnización constitucional', status: 'CONFIRMED' });
  if (/reinstalaci[oó]n/i.test(textToScan)) prestaciones.push({ name: 'Reinstalación', status: 'CONFIRMED' });
  if (/salarios ca[ií]dos/i.test(textToScan)) prestaciones.push({ name: 'Salarios caídos', status: 'CONFIRMED' });
  if (/prima de antig[uü]edad/i.test(textToScan)) prestaciones.push({ name: 'Prima de antigüedad', status: 'CONFIRMED' });

  return {
    documentType,
    trabajador,
    patron,
    empresa: baseFields.empresa || patron,
    representantePatronal: (analysis.parties as any)?.representantePatronal
      ? field('representantePatronal', 'Representante patronal', (analysis.parties as any).representantePatronal, false)
      : undefined,
    puesto: field('puesto', 'Puesto o categoría', puestoVal, Boolean(puestoVal)),
    salario: field('salario', 'Salario', salarioVal, Boolean(salarioVal)),
    salarioDiario: field('salarioDiario', 'Salario diario', salarioDiarioVal, Boolean(salarioDiarioVal)),
    fechaIngreso: field('fechaIngreso', 'Fecha de ingreso', fechaIngresoVal, Boolean(fechaIngresoVal)),
    fechaDespido: field('fechaDespido', 'Fecha de despido', fechaDespidoVal, Boolean(fechaDespidoVal)),
    antiguedad: field('antiguedad', 'Antigüedad', undefined, false),
    jornada: field('jornada', 'Jornada laboral', undefined, false),
    horario: field('horario', 'Horario de trabajo', undefined, false),
    centroTrabajo: field('centroTrabajo', 'Centro de trabajo', undefined, false),
    prestaciones,
    accionPrincipal: /reinstalaci[oó]n/i.test(textToScan)
      ? field('accionPrincipal', 'Acción principal', 'REINSTALACION', true)
      : /indemnizaci[oó]n/i.test(textToScan)
        ? field('accionPrincipal', 'Acción principal', 'INDEMNIZACION_CONSTITUCIONAL', true)
        : undefined,
    rescision: /rescisi/i.test(documentType) ? field('rescision', 'Rescisión laboral', undefined, false) : undefined,
    convenio: /convenio/i.test(documentType) ? field('convenio', 'Convenio laboral', undefined, false) : undefined,
    laudoResolucion: /laudo|resolucion|sentencia|ejecucion|amparo/i.test(documentType)
      ? field('laudoResolucion', 'Laudo o resolución laboral de origen', undefined, false)
      : undefined,
    autoridadLaboral: field('autoridadLaboral', 'Tribunal o autoridad laboral', undefined, false),
  };
}

export function buildAmparoContext(
  documentType: string,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  baseFields: Record<string, CaseContextField>,
): AmparoContext {
  const isDirecto = /directo/i.test(documentType) && !/indirecto/i.test(documentType);
  const isRecurso = /recurso|queja|reclamacion|inconformidad/i.test(documentType);
  const isCumplimiento = /cumplimiento/i.test(documentType);
  const isSuspension = /suspension/i.test(documentType);

  const quejoso = baseFields.quejoso || baseFields.actor || baseFields.promovente || field('quejoso', 'Parte Quejosa / Promovente', undefined, false);
  const autoridadResponsable = baseFields.autoridadResponsable || baseFields.autoridad || field('autoridadResponsable', 'Autoridad Responsable', undefined, false);
  const terceroInteresado = baseFields.terceroInteresado || baseFields.demandado;

  const textToScan = [...(analysis.facts || []).map((f) => f.text), ...(analysis.claims || [])].join(' ');

  let actoReclamadoVal: string | undefined = undefined;
  const actoMatch = textToScan.match(/(?:acto\s+reclamado|resoluci[oó]n\s+impugnada|acuerdo\s+recurrido|determinaci[oó]n\s+reclamada)(?:\s+consistente\s+en|\s+que)?\s+([^.\n]+)/i);
  if (actoMatch) {
    actoReclamadoVal = actoMatch[1].trim();
  }

  let fechaNotifVal: string | undefined = undefined;
  const notifMatch = textToScan.match(/(?:notificad[ao]|notificaci[oó]n|tuvo\s+conocimiento)(?:\s+el|\s+en\s+fecha)?\s+(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|\d{2}\/\d{2}\/\d{4})/i);
  if (notifMatch) {
    fechaNotifVal = notifMatch[1];
  }

  const preceptosViolados: string[] = [];
  if (/art[ií]culo\s+1o?\.?/i.test(textToScan) || /derechos\s+humanos/i.test(textToScan)) preceptosViolados.push('Artículo 1° Constitucional (Derechos Humanos y Pro Persona)');
  if (/art[ií]culo\s+14/i.test(textToScan) || /debido\s+proceso|audiencia|retroactividad/i.test(textToScan)) preceptosViolados.push('Artículo 14 Constitucional (Debido Proceso y Garantía de Audiencia)');
  if (/art[ií]culo\s+16/i.test(textToScan) || /fundamentaci[oó]n|motivaci[oó]n|legalidad/i.test(textToScan)) preceptosViolados.push('Artículo 16 Constitucional (Legalidad, Fundamentación y Motivación)');
  if (/art[ií]culo\s+17/i.test(textToScan) || /acceso\s+a\s+la\s+justicia|tutela\s+judicial/i.test(textToScan)) preceptosViolados.push('Artículo 17 Constitucional (Tutela Judicial Efectiva y Justicia Pronta)');
  if (preceptosViolados.length === 0) {
    preceptosViolados.push('Artículos 1°, 14 y 16 de la Constitución Política de los Estados Unidos Mexicanos');
  }

  const conceptosViolacion: string[] = (analysis.arguments || [])
    .map(extractArgText)
    .filter(Boolean);

  return {
    documentType,
    quejoso,
    autoridadResponsable,
    terceroInteresado,
    actoReclamado: field('actoReclamado', 'Acto reclamado', actoReclamadoVal, Boolean(actoReclamadoVal)),
    fechaNotificacionActo: field('fechaNotificacionActo', 'Fecha de notificación', fechaNotifVal, Boolean(fechaNotifVal)),
    preceptosViolados,
    conceptosViolacion,
    suspensionSolicitada: isSuspension || !isRecurso && !isCumplimiento,
    tipoAmparo: isDirecto ? 'DIRECTO' : 'INDIRECTO',
    resolucionRecurrida: isRecurso ? field('resolucionRecurrida', 'Resolución o acuerdo recurrido', undefined, false) : undefined,
    ejecutoriaCumplimiento: isCumplimiento ? field('ejecutoriaCumplimiento', 'Ejecutoria de amparo por cumplir', undefined, false) : undefined,
  };
}

export function buildAdministrativoContext(
  documentType: string,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  baseFields: Record<string, CaseContextField>,
): AdministrativoContext {
  const actor = baseFields.actor || baseFields.promovente || field('actor', 'Actor / Promovente', undefined, false);
  const autoridadDemandada = baseFields.autoridadDemandada || baseFields.autoridadResponsable || baseFields.demandado || baseFields.autoridad || field('autoridadDemandada', 'Autoridad demandada', undefined, false);
  const terceroPerjudicado = baseFields.terceroPerjudicado || baseFields.terceroInteresado;

  const textToScan = [...(analysis.facts || []).map((f) => f.text), ...(analysis.claims || [])].join(' ');

  let resolucionVal: string | undefined = undefined;
  const resolucionMatch = textToScan.match(/(?:resoluci[oó]n|oficio|determinaci[oó]n|acuerdo|boleta|sanci[oó]n)(?:\s+(?:impugnada|recurrida|n[uú]mero|administrativa|de\s+fecha))?(?:\s+consistente\s+en|\s+n[uú]m(?:\.|ero)?)?\s+([A-Z0-9_\-\.\/]+)/i);
  if (resolucionMatch) {
    resolucionVal = resolucionMatch[1].trim();
  }

  let fechaNotifVal: string | undefined = undefined;
  const notifMatch = textToScan.match(/(?:notificad[ao]|notificaci[oó]n|surti[oó]\s+efectos)(?:\s+(?:el|en\s+fecha|con\s+fecha))?\s+(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|\d{2}\/\d{2}\/\d{4})/i);
  if (notifMatch) {
    fechaNotifVal = notifMatch[1];
  }

  const conceptosImpugnacion: string[] = (analysis.arguments || [])
    .map(extractArgText)
    .filter(Boolean);

  const isSuspension = /suspension/i.test(documentType);
  const isCumplimiento = /cumplimiento/i.test(documentType);

  return {
    documentType,
    actor,
    autoridadDemandada,
    resolucionImpugnada: field('resolucionImpugnada', 'Resolución administrativa impugnada', resolucionVal, Boolean(resolucionVal)),
    fechaNotificacionResolucion: field('fechaNotificacionResolucion', 'Fecha de notificación de la resolución', fechaNotifVal, Boolean(fechaNotifVal)),
    autoridadEmisora: baseFields.autoridadEmisora || autoridadDemandada,
    conceptosImpugnacion,
    suspensionSolicitada: isSuspension || /demanda_nulidad/i.test(documentType),
    terceroPerjudicado,
    sentenciaCumplimiento: isCumplimiento ? field('sentenciaCumplimiento', 'Sentencia de nulidad por cumplir', undefined, false) : undefined,
  };
}

export function buildFiscalContext(
  documentType: string,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  baseFields: Record<string, CaseContextField>,
): FiscalContext {
  const contribuyente = baseFields.contribuyente || baseFields.actor || baseFields.promovente || field('contribuyente', 'Contribuyente / Actor', undefined, false);
  const autoridadFiscalDemandada = baseFields.autoridadFiscalDemandada || baseFields.autoridadResponsable || baseFields.demandado || baseFields.autoridadDemandada || baseFields.autoridad || field('autoridadFiscalDemandada', 'Autoridad fiscal demandada', undefined, false);

  const textToScan = [...(analysis.facts || []).map((f) => f.text), ...(analysis.claims || [])].join(' ');

  let resolucionVal: string | undefined = undefined;
  const resMatch =
    textToScan.match(/(?:resoluci[oó]n(?:\s+determinante|\s+determinativa)?|liquidaci[oó]n|oficio)(?:\s+(?:impugnada|recurrida|de\s+fecha|n[uú]mero|liquidaci[oó]n))?(?:\s+n[uú]m(?:\.|ero)?)?\s+([A-Z0-9_\-\.\/]*\d[A-Z0-9_\-\.\/]*)/i) ||
    textToScan.match(/(?:resoluci[oó]n(?:\s+determinativa)?|liquidaci[oó]n|oficio|cr[eé]dito).*?\b([A-Z0-9]+-[A-Z0-9_\-\.\/]+)\b/i);
  if (resMatch) {
    resolucionVal = resMatch[1].trim();
  }

  let creditoVal: string | undefined = undefined;
  const creditoMatch = textToScan.match(/(?:cr[eé]dito\s+fiscal|importe|adeudo)(?:\s+n[uú]mero|\s+por\s+la\s+cantidad\s+de)?\s+(\$[\d,]+(?:\.\d{2})?|[A-Z0-9_\-\.\/]+)/i);
  if (creditoMatch) {
    creditoVal = creditoMatch[1].trim();
  }

  let fechaNotifVal: string | undefined = undefined;
  const notifMatch = textToScan.match(/(?:notificad[ao]|notificaci[oó]n|surti[oó]\s+efectos)(?:\s+(?:el|en\s+fecha|con\s+fecha))?\s+(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|\d{2}\/\d{2}\/\d{4})/i);
  if (notifMatch) {
    fechaNotifVal = notifMatch[1];
  }

  const conceptosImpugnacion: string[] = (analysis.arguments || [])
    .map(extractArgText)
    .filter(Boolean);

  const isSuspension = /suspension/i.test(documentType);
  const isCumplimiento = /cumplimiento/i.test(documentType);
  const isRecurso = /revocacion|recurso/i.test(documentType);

  return {
    documentType,
    contribuyente,
    autoridadFiscalDemandada,
    resolucionDeterminativa: field('resolucionDeterminativa', 'Resolución determinativa o liquidación', resolucionVal, Boolean(resolucionVal)),
    creditoFiscal: field('creditoFiscal', 'Crédito fiscal o importe impugnado', creditoVal, Boolean(creditoVal)),
    fechaNotificacion: field('fechaNotificacion', 'Fecha de notificación', fechaNotifVal, Boolean(fechaNotifVal)),
    conceptosImpugnacion,
    suspensionSolicitada: isSuspension || /demanda_nulidad/i.test(documentType),
    garantiaInteresFiscal: field('garantiaInteresFiscal', 'Garantía del interés fiscal', undefined, false),
    recursoSedeAdministrativa: isRecurso,
    sentenciaCumplimiento: isCumplimiento ? field('sentenciaCumplimiento', 'Sentencia fiscal por cumplir', undefined, false) : undefined,
  };
}

export function buildPenalContext(
  documentType: string,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  baseFields: Record<string, CaseContextField>,
): PenalContext {
  const victimaUOfendido = baseFields.victima || baseFields.ofendido || baseFields.victimaUOfendido || baseFields.actor || field('victimaUOfendido', 'Víctima u ofendido', undefined, false);
  const imputado = baseFields.imputado || baseFields.acusado || baseFields.demandado || field('imputado', 'Imputado / Persona investigada', undefined, false);
  const denuncianteOQuerellante = baseFields.denunciante || baseFields.querellante || baseFields.promovente || victimaUOfendido;
  const defensor = baseFields.defensor || baseFields.abogadoDefensor;
  const asesorJuridico = baseFields.asesorJuridico;
  const ministerioPublico = baseFields.ministerioPublico || baseFields.fiscalia || baseFields.agenteMP;
  const juezControl = baseFields.juezControl || baseFields.juez;
  const juezEjecucion = baseFields.juezEjecucion;

  const textToScan = [
    ...sources.map((s) => s.content || ''),
    ...(analysis.facts || []).map((f) => f.text),
    ...(analysis.claims || []),
  ].join(' ');

  let carpetaVal: string | undefined = undefined;
  const carpetaMatch = textToScan.match(/\b(?:carpeta(?:\s+de\s+investigaci[oó]n)?|nuc|c\.?i\b|averiguaci[oó]n\s+previa)(?:\s+(?:n[uú]mero|n[uú]m\.?))?\s*[:\s]?\s*([A-Z0-9_\-\.\/]+)/i);
  if (carpetaMatch) {
    carpetaVal = carpetaMatch[1].trim().replace(/[\.\,\;\:]+$/, '');
  }

  let causaVal: string | undefined = undefined;
  const causaMatch = textToScan.match(/(?:causa\s+penal|toca(?:\s+penal)?|expediente)(?:\s+(?:n[uú]mero|n[uú]m\.?))?\s*[:\s]?\s*([A-Z0-9_\-\.\/]+)/i);
  if (causaMatch) {
    causaVal = causaMatch[1].trim().replace(/[\.\,\;\:]+$/, '');
  }

  let delitoVal: string | undefined = undefined;
  const delitoMatch = textToScan.match(/(?:delito(?:\s+de)?|hechos?\s+con\s+apariencia\s+de\s+delito\s+de)\s+([a-záéíóúñ\s]{3,40})(?=[,\.\;\n]|$)/i);
  if (delitoMatch) {
    delitoVal = delitoMatch[1].trim().replace(/[\.\,\;\:]+$/, '');
  }

  const agraviosPenales: string[] = (analysis.arguments || [])
    .map(extractArgText)
    .filter(Boolean);

  return {
    documentType,
    victimaUOfendido,
    imputado,
    denuncianteOQuerellante,
    defensor,
    asesorJuridico,
    ministerioPublico,
    juezControl,
    juezEjecucion,
    carpetaInvestigacion: field('carpetaInvestigacion', 'Carpeta de investigación', carpetaVal, Boolean(carpetaVal)),
    causaPenal: field('causaPenal', 'Causa penal', causaVal, Boolean(causaVal)),
    delitoImputado: field('delitoImputado', 'Delito investigado / imputado', delitoVal, Boolean(delitoVal)),
    medidaCautelar: field('medidaCautelar', 'Medida cautelar', undefined, false),
    medidaProteccion: field('medidaProteccion', 'Medida de protección', undefined, false),
    actosInvestigacion: [],
    agraviosPenales,
  };
}

export function buildAgrarioContext(
  documentType: string,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  baseFields: Record<string, CaseContextField>,
): AgrarioContext {
  const actorAgrario = baseFields.actor || baseFields.promovente || baseFields.quejoso || field('actorAgrario', 'Actor / Ejidatario / Comunero', undefined, false);
  const demandadoAgrario = baseFields.demandado || baseFields.autoridadResponsable || field('demandadoAgrario', 'Demandado / Órgano ejidal', undefined, false);

  const textToScan = [
    ...sources.map((s) => s.content || ''),
    ...(analysis.facts || []).map((f) => f.text),
    ...(analysis.claims || []),
  ].join(' ');

  let ejidoVal: string | undefined = undefined;
  const ejidoMatch = textToScan.match(/(?:ejido|comunidad|poblado(?:\s+ejidal)?)\s+(?:denominado\s+)?["“']?([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,40}?)(?=["”',\.\;\n]|\s+(?:ubicado|municipio|estado|distrito)|$)/i);
  if (ejidoMatch) {
    ejidoVal = ejidoMatch[1].trim().replace(/[\.\,\;\:]+$/, '');
  }

  let parcelaVal: string | undefined = undefined;
  const parcelaMatch = textToScan.match(/(?:parcela|solar(?:\s+urbano)?|unidad\s+de\s+dotaci[oó]n)(?:\s+(?:n[uú]mero|n[uú]m\.?))?\s*[:\s]?\s*([A-Z0-9_\-\.\/]+)/i);
  if (parcelaMatch) {
    parcelaVal = parcelaMatch[1].trim().replace(/[\.\,\;\:]+$/, '');
  }

  let expedienteVal: string | undefined = undefined;
  const expMatch = textToScan.match(/(?:expediente(?:\s+agrario)?|juicio\s+agrario)(?:\s+(?:n[uú]mero|n[uú]m\.?))?\s*[:\s]?\s*([A-Z0-9_\-\.\/]+)/i);
  if (expMatch) {
    expedienteVal = expMatch[1].trim().replace(/[\.\,\;\:]+$/, '');
  }

  let tribunalVal: string | undefined = undefined;
  const tribunalMatch = textToScan.match(/(?:tribunal\s+unitario\s+agrario|distrito\s+agrario)(?:\s+(?:n[uú]mero|n[uú]m\.?|\bdel\s+distrito\b))?\s*[:\s]?\s*([A-Z0-9_\-\.\/\s]{2,30}?)(?=[,\.\;\n]|$)/i);
  if (tribunalMatch) {
    tribunalVal = tribunalMatch[0].trim().replace(/[\.\,\;\:]+$/, '');
  }

  const prestacionesAgrarias = (analysis.claims || []).length > 0
    ? analysis.claims
    : ['Reconocimiento y tutela de derechos agrarios'];
  const hechosAgrarios = (analysis.facts || []).map((f) => f.text).filter(Boolean);

  return {
    documentType,
    actorAgrario,
    demandadoAgrario,
    ejidoOComunidad: field('ejidoOComunidad', 'Ejido o Comunidad agraria', ejidoVal, Boolean(ejidoVal)),
    parcelaOTierras: field('parcelaOTierras', 'Parcela o tierras ejidales/comunales', parcelaVal, Boolean(parcelaVal)),
    tribunalUnitarioAgrario: field('tribunalUnitarioAgrario', 'Tribunal Unitario Agrario competente', tribunalVal, Boolean(tribunalVal)),
    expedienteAgrario: field('expedienteAgrario', 'Expediente agrario', expedienteVal, Boolean(expedienteVal)),
    prestacionesAgrarias,
    hechosAgrarios,
  };
}

export function buildInmobiliarioContext(
  documentType: string,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  baseFields: Record<string, CaseContextField>,
): InmobiliarioContext {
  const arrendadorOVendedor = baseFields.arrendador || baseFields.vendedor || baseFields.actor || baseFields.promovente || field('arrendadorOVendedor', 'Arrendador / Vendedor / Propietario', undefined, false);
  const arrendatarioOComprador = baseFields.arrendatario || baseFields.comprador || baseFields.demandado || field('arrendatarioOComprador', 'Arrendatario / Comprador / Inquilino', undefined, false);
  const fiador = baseFields.fiador || baseFields.obligadoSolidario;

  const textToScan = [
    ...sources.map((s) => s.content || ''),
    ...(analysis.facts || []).map((f) => f.text),
    ...(analysis.claims || []),
  ].join(' ');

  let inmuebleVal: string | undefined = undefined;
  const inmuebleMatch = textToScan.match(/(?:inmueble|finca|predio|departamento|casa|local(?:\s+comercial)?|propiedad)\s+(?:ubicad[oa]\s+en|sito\s+en|\ben\b)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s,\.\#\-]{5,150}?)(?=[;\n]|\.\s+[A-Z]|,\s*(?:con\s+folio|folio|renta|saldo|vigencia|pact[aá]ndose)|$)/i);
  if (inmuebleMatch) {
    inmuebleVal = inmuebleMatch[1].trim().replace(/[\.\,\;\:]+$/, '');
  }

  let folioVal: string | undefined = undefined;
  const folioMatch = textToScan.match(/(?:folio\s+real|partida|registro\s+p[uú]blico)(?:\s+(?:n[uú]mero|n[uú]m\.?))?\s*[:\s]?\s*([A-Z0-9_\-\.\/]+)/i);
  if (folioMatch) {
    folioVal = folioMatch[1].trim().replace(/[\.\,\;\:]+$/, '');
  }

  let rentaVal: string | undefined = undefined;
  const rentaMatch = textToScan.match(/(?:renta|precio|pago\s+mensual)(?:\s+de|\s+por\s+la\s+cantidad\s+de)?\s*[:\s]?\s*(\$?\s*[\d,]+(?:\.\d{2})?\s*(?:pesos|m\.n\.|moneda\s+nacional|mxn)?)/i);
  if (rentaMatch) {
    rentaVal = rentaMatch[1].trim().replace(/[\.\,\;\:]+$/, '');
  }

  let adeudoVal: string | undefined = undefined;
  const adeudoMatch = textToScan.match(/(?:adeudo|saldo\s+insoluto|rentas\s+vencidas)(?:\s+por\s+la\s+cantidad\s+de)?\s*[:\s]?\s*(\$?\s*[\d,]+(?:\.\d{2})?\s*(?:pesos|m\.n\.|moneda\s+nacional|mxn)?)/i);
  if (adeudoMatch) {
    adeudoVal = adeudoMatch[1].trim().replace(/[\.\,\;\:]+$/, '');
  }

  let vigenciaVal: string | undefined = undefined;
  const vigenciaMatch = textToScan.match(/(?:vigencia|plazo|duraci[oó]n)(?:\s+del\s+contrato)?(?:\s+de)?\s*[:\s]?\s*(\d+\s*(?:meses|a[ñn]os)|del\s+\d+.*al\s+\d+.*)/i);
  if (vigenciaMatch) {
    vigenciaVal = vigenciaMatch[1].trim().replace(/[\.\,\;\:]+$/, '');
  }

  return {
    documentType,
    arrendadorOVendedor,
    arrendatarioOComprador,
    fiador,
    inmuebleUbicacion: field('inmuebleUbicacion', 'Ubicación del inmueble', inmuebleVal, Boolean(inmuebleVal)),
    folioReal: field('folioReal', 'Folio Real / Registro Público', folioVal, Boolean(folioVal)),
    rentaOPrecio: field('rentaOPrecio', 'Renta pactada o precio de compraventa', rentaVal, Boolean(rentaVal)),
    adeudoRentas: field('adeudoRentas', 'Adeudo por concepto de rentas', adeudoVal, Boolean(adeudoVal)),
    vigencia: field('vigencia', 'Plazo de vigencia del contrato', vigenciaVal, Boolean(vigenciaVal)),
  };
}

export function buildCorporativoContext(
  documentType: string,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  baseFields: Record<string, CaseContextField>,
): CorporativoContext {
  const textToScan = [
    ...sources.map((s) => s.content || ''),
    ...(analysis.facts || []).map((f) => f.text),
    ...(analysis.claims || []),
  ].join(' ');

  let sociedadVal: string | undefined = undefined;
  const socMatch = textToScan.match(/(?:sociedad|empresa|denominada|raz[oó]n\s+social|denominaci[oó]n)\s+(?:de\s+)?["“']?([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s,\.\-]{3,60}?(?:S\.?A\.?\s+DE\s+C\.?V\.?|S\.?R\.?L\.?\s+DE\s+C\.?V\.?|S\.?A\.?P\.?I\.?\s+DE\s+C\.?V\.?|S\.?A\.?S\.?|S\.?C\.?))["”']?/i) ||
    textToScan.match(/["“']([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s,\.\-]{3,50}?(?:S\.?A\.?\s+DE\s+C\.?V\.?|S\.?R\.?L\.?|S\.?A\.?P\.?I\.?))["”']/i);
  if (socMatch) {
    sociedadVal = socMatch[1].trim();
  }

  let capitalVal: string | undefined = undefined;
  const capMatch = textToScan.match(/(?:capital\s+social|importe\s+del\s+capital)(?:\s+(?:fijo|variable|suscrito))?(?:\s+de|\s+por\s+la\s+cantidad\s+de)?\s*[:\s]?\s*(\$?\s*[\d,]+(?:\.\d{2})?\s*(?:pesos|m\.n\.|moneda\s+nacional|mxn)?)/i);
  if (capMatch) {
    capitalVal = capMatch[1].trim();
  }

  let objetoVal: string | undefined = undefined;
  const objMatch = textToScan.match(/(?:objeto\s+social|giro\s+comercial|actividad\s+preponderante)\s*[:\s]\s*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s,\.\;]{10,120}?)(?=[;\n]|\.\s+[A-Z]|$)/i);
  if (objMatch) {
    objetoVal = objMatch[1].trim();
  }

  const sociedad = field('sociedad', 'Denominación o Razón Social', sociedadVal || baseFields.actor?.value, Boolean(sociedadVal || baseFields.actor?.value));
  const objetoSocial = field('objetoSocial', 'Objeto social preponderante', objetoVal, Boolean(objetoVal));
  const capitalSocial = field('capitalSocial', 'Capital social suscrito y pagado', capitalVal, Boolean(capitalVal));

  const accionistasOSocios: CaseContextField[] = [];
  if (baseFields.actor?.value) accionistasOSocios.push(baseFields.actor);
  if (baseFields.demandado?.value) accionistasOSocios.push(baseFields.demandado);

  const acuerdosAsamblea = (analysis.claims || []).length > 0
    ? analysis.claims
    : (analysis.facts || []).map((f) => f.text).filter(Boolean);

  return {
    documentType,
    sociedad,
    objetoSocial,
    capitalSocial,
    accionistasOSocios,
    representanteOApoderado: baseFields.promovente || baseFields.actor,
    tipoPoderes: field('tipoPoderes', 'Tipo de poderes otorgados o revocados', undefined, false),
    acuerdosAsamblea: acuerdosAsamblea.length > 0 ? acuerdosAsamblea : ['Acuerdos y resoluciones corporativas adoptadas'],
  };
}

export function buildContractualContext(
  documentType: string,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  baseFields: Record<string, CaseContextField>,
): ContractualContext {
  const parteA = baseFields.actor || baseFields.promovente || field('parteA', 'Parte contratante A (Vendedor/Arrendador/Prestador)', undefined, false);
  const parteB = baseFields.demandado || field('parteB', 'Parte contratante B (Comprador/Arrendatario/Cliente)', undefined, false);

  const textToScan = [
    ...sources.map((s) => s.content || ''),
    ...(analysis.facts || []).map((f) => f.text),
    ...(analysis.claims || []),
  ].join(' ');

  let precioVal: string | undefined = undefined;
  const precioMatch = textToScan.match(/(?:precio|contraprestaci[oó]n|honorarios|renta|monto|importe)(?:\s+(?:pactad[oa]|total|convenid[oa]))?(?:\s+de|\s+por\s+la\s+cantidad\s+de)?\s*[:\s]?\s*(\$?\s*[\d,]+(?:\.\d{2})?\s*(?:pesos|m\.n\.|moneda\s+nacional|mxn)?)/i);
  if (precioMatch) {
    precioVal = precioMatch[1].trim();
  }

  let vigenciaVal: string | undefined = undefined;
  const vigMatch = textToScan.match(/(?:vigencia|plazo|duraci[oó]n)(?:\s+del\s+contrato)?(?:\s+de)?\s*[:\s]?\s*(\d+\s*(?:d[ií]as|meses|a[ñn]os)|del\s+\d+.*al\s+\d+.*)/i);
  if (vigMatch) {
    vigenciaVal = vigMatch[1].trim();
  }

  let penaVal: string | undefined = undefined;
  const penaMatch = textToScan.match(/(?:pena\s+convencional|penalizaci[oó]n|cl[aá]usula\s+penal)(?:\s+de|\s+por)?\s*[:\s]?\s*(\$?\s*[\d,]+(?:\.\d{2})?\s*(?:pesos|m\.n\.|%)?)/i);
  if (penaMatch) {
    penaVal = penaMatch[1].trim();
  }

  const clausulasPrincipales = (analysis.claims || []).length > 0
    ? analysis.claims
    : (analysis.facts || []).map((f) => f.text).filter(Boolean);

  return {
    documentType,
    parteA,
    parteB,
    objetoContrato: field('objetoContrato', 'Objeto del contrato', undefined, false),
    contraprestacionOPrecio: field('contraprestacionOPrecio', 'Precio o contraprestación pactada', precioVal, Boolean(precioVal)),
    vigenciaOPlazo: field('vigenciaOPlazo', 'Vigencia o plazo convenido', vigenciaVal, Boolean(vigenciaVal)),
    penaConvencional: field('penaConvencional', 'Pena convencional pactada', penaVal, Boolean(penaVal)),
    clausulasPrincipales: clausulasPrincipales.length > 0 ? clausulasPrincipales : ['Estipulaciones contractuales convenidas entre las partes'],
  };
}

export function buildPropiedadIntelectualContext(
  documentType: string,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  baseFields: Record<string, CaseContextField>,
): PropiedadIntelectualContext {
  const titularOSolicitante = baseFields.actor || baseFields.promovente || field('titularOSolicitante', 'Titular o Solicitante', undefined, false);
  const contraparteOAutoridad = baseFields.demandado || baseFields.autoridadResponsable || field('contraparteOAutoridad', 'Contraparte o Autoridad (IMPI/INDAUTOR)', undefined, false);

  const textToScan = [
    ...sources.map((s) => s.content || ''),
    ...(analysis.facts || []).map((f) => f.text),
    ...(analysis.claims || []),
  ].join(' ');

  let signoVal: string | undefined = undefined;
  const signoMatch = textToScan.match(/(?:marca|signo\s+distintivo|dise[nñ]o|denominaci[oó]n|obra)(?:\s+(?:denominada|consistente\s+en|mixta|nominativa))?\s+["“']?([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s,\.\-]{2,40}?)["”']?(?=[,\.\;\n]|\s+(?:clase|registro)|$)/i);
  if (signoMatch) {
    signoVal = signoMatch[1].trim();
  }

  let regVal: string | undefined = undefined;
  const regMatch = textToScan.match(/(?:registro|t[ií]tulo|expediente|solicitud)(?:[^\d\n]*?(?:n[uú]mero|n[uú]m\.?|del\s+impi))?\s*[:\s]?\s*([0-9]{4,15}|[A-Z0-9_\-\.\/]{5,25})/i);
  if (regMatch) {
    regVal = regMatch[1].trim();
  }

  let claseVal: string | undefined = undefined;
  const claseMatch = textToScan.match(/(?:clase|clasificaci[oó]n(?:\s+internacional)?)(?:\s+(?:n[uú]mero|n[uú]m\.?))?\s*[:\s]?\s*(\d{1,2})/i);
  if (claseMatch) {
    claseVal = claseMatch[1].trim();
  }

  const hechosInfraccionOImpedimento = (analysis.facts || []).map((f) => f.text).filter(Boolean);
  const fundamentosOPreceptos = (analysis.arguments || []).map(extractArgText).filter(Boolean);

  return {
    documentType,
    titularOSolicitante,
    contraparteOAutoridad,
    signoDistintivoUObra: field('signoDistintivoUObra', 'Signo distintivo, marca u obra', signoVal, Boolean(signoVal)),
    numeroRegistroOExpediente: field('numeroRegistroOExpediente', 'Número de registro marcario o expediente IMPI', regVal, Boolean(regVal)),
    claseNiza: field('claseNiza', 'Clase de Niza', claseVal, Boolean(claseVal)),
    hechosInfraccionOImpedimento: hechosInfraccionOImpedimento.length > 0 ? hechosInfraccionOImpedimento : ['Hechos constitutivos de infracción, impedimento o antecedentes'],
    fundamentosOPreceptos: fundamentosOPreceptos.length > 0 ? fundamentosOPreceptos : ['Disposiciones de la Ley Federal de Protección a la Propiedad Industrial o LFDA'],
  };
}

export function buildTramiteGeneralContext(
  documentType: string,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  baseFields: Record<string, CaseContextField>,
): TramiteGeneralContext {
  const promoventeVal = analysis.parties?.actor || analysis.parties?.demandado || baseFields.promovente?.value || baseFields.actor?.value;
  const promovente = baseFields.promovente || (promoventeVal ? field('promovente', 'Promovente del trámite', promoventeVal, true) : (baseFields.actor || baseFields.demandado || field('promovente', 'Promovente del trámite', undefined, false)));

  const autoridadVal = analysis.parties?.autoridadResponsable || baseFields.autoridadResponsable?.value || baseFields.juzgado?.value || baseFields.tribunal?.value;
  const juzgadoField = autoridadVal ? field('juzgadoOTribunal', 'Juzgado o Tribunal de conocimiento', autoridadVal, true) : (baseFields.juzgado || baseFields.autoridadResponsable || baseFields.tribunal || field('juzgadoOTribunal', 'Juzgado o Tribunal de conocimiento', undefined, false));

  const expedienteVal = analysis.caseNumbers?.principal || baseFields.expediente?.value || baseFields.numeroExpediente?.value;
  const expedienteField = expedienteVal ? field('numeroExpediente', 'Número de expediente o toca', expedienteVal, true) : (baseFields.expediente || baseFields.numeroExpediente || field('numeroExpediente', 'Número de expediente o toca', undefined, false));

  const textToScan = [
    ...sources.map((s) => s.content || ''),
    ...(analysis.facts || []).map((f) => f.text),
    ...(analysis.claims || []),
  ].join(' ');

  let peticionVal: string | undefined = undefined;
  const petMatch = textToScan.match(/(?:solicito|peticion|se solicita|solicita|viene a|comparece a)(?:\s+(?:que|atentamente|por medio de|se sirva))?\s*[:\s]?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s,\.\-]{5,80}?)(?=[,\.\;\n]|$)/i);
  if (petMatch) {
    peticionVal = petMatch[1].trim();
  } else if (analysis.claims?.length) {
    peticionVal = analysis.claims[0].trim();
  }

  const hechosOAntecedentes = (analysis.facts || []).map((f) => f.text).filter(Boolean);
  const fundamentos = (analysis.arguments || []).map(extractArgText).filter(Boolean);

  return {
    documentType,
    promovente,
    autoridadODestinatario: juzgadoField,
    juzgadoOTribunal: juzgadoField,
    expedienteOActo: expedienteField,
    numeroExpediente: expedienteField,
    peticionOObjeto: field('peticionOObjeto', 'Petición u objeto de la promoción', peticionVal, Boolean(peticionVal)),
    hechosOAntecedentes: hechosOAntecedentes.length > 0 ? hechosOAntecedentes : ['Antecedentes procesales que obran agregados en los autos del expediente'],
    fundamentos: fundamentos.length > 0 ? fundamentos : ['Artículo 8vo y 17 Constitucional y disposiciones procesales aplicables'],
  };
}

export function formatCaseContextField(
  context: CaseContext | undefined,
  key: string,
  fallback: string,
): string {
  const item = context?.fields[key];
  if (item?.status === 'CONFIRMED' && item.value) return item.value;
  if (item?.status === 'ANONYMIZED') return `[DATO ANONIMIZADO: ${item.label}]`;
  return fallback;
}
