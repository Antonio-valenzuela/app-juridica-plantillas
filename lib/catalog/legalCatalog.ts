import { DocumentTemplates } from '@/lib/legal-engine/documentTemplates';

export type CatalogNodeKind = 'AREA' | 'PROCEDURE' | 'FAMILY' | 'DOCUMENT_TYPE' | 'LEGACY_ALIAS';
export type CatalogStatus =
  | 'IMPLEMENTED'
  | 'PARTIAL'
  | 'CATALOG_ONLY'
  | 'REQUIRES_OFFICIAL_FORM'
  | 'ASSISTED_DRAFT'
  | 'NOT_APPLICABLE';
export type UiVisibility = 'VISIBLE' | 'HIDDEN' | 'LEGACY_ONLY';

export interface LegalArea { id: string; label: string; description: string; aliases: readonly string[]; uiVisibility: UiVisibility; }
export interface LegalProcedure { id: string; areaId: string; label: string; description: string; aliases: readonly string[]; uiVisibility: UiVisibility; }
export interface DocumentFamily { id: string; areaId: string; procedureId: string; label: string; description: string; uiVisibility: UiVisibility; status: 'NOT_APPLICABLE'; }

export interface SourceCompatibilityDeclaration {
  sourceRequired: boolean;
  acceptsAnySource?: boolean;
  acceptedSourceTypes: readonly string[];
  optionalSourceTypes?: readonly string[];
  incompatibleSourceTypes?: readonly string[];
  incompatibleMatterIds?: readonly string[];
  requiresFactAndClaimExtraction?: boolean;
}

export interface CatalogDocumentBase {
  id: string; label: string; description: string; areaId: string; procedureId: string; familyId: string;
  aliases: readonly string[]; strategyId: string | null; templateId: string | null; implemented: boolean;
  sourceCompatibility: SourceCompatibilityDeclaration | null; requiredFields: readonly string[];
  requiredSections: readonly string[]; outputFilename: string | null; jurisdiction: string;
  legalStage: string; partyRole: string; uiVisibility: UiVisibility; status: CatalogStatus;
}
export interface CanonicalDocumentType extends CatalogDocumentBase { kind: 'DOCUMENT_TYPE'; }
export interface CatalogFamilyIdentifier extends CatalogDocumentBase {
  kind: 'FAMILY'; implemented: false; strategyId: null; templateId: null;
  sourceCompatibility: null; status: 'NOT_APPLICABLE'; uiVisibility: 'VISIBLE';
}
export interface LegacyAlias { kind: 'LEGACY_ALIAS'; id: string; label: string; targetId: string; reason: string; uiVisibility: 'LEGACY_ONLY'; status: 'NOT_APPLICABLE'; }
export type CatalogDocumentIdentifier = CanonicalDocumentType | CatalogFamilyIdentifier | LegacyAlias;

export interface LegalCatalogRegistry {
  areas: readonly LegalArea[]; procedures: readonly LegalProcedure[]; families: readonly DocumentFamily[];
  documents: readonly CanonicalDocumentType[]; aliases: readonly LegacyAlias[];
  documentIdentifiers: readonly CatalogDocumentIdentifier[];
}
export interface LegalCatalogStats {
  areaCount: number; procedureCount: number; familyCount: number; documentTypeCount: number;
  aliasCount: number; familyIdentifierCount: number; coveredDocumentIdentifierCount: number;
  legacyDocumentIdentifierCount: number; proposedDocumentIdentifierCount: number; overlapCount: number;
}
export interface CatalogSearchResult {
  id: string; label: string; description: string; kind: CatalogNodeKind; status: CatalogStatus;
  areaId?: string; procedureId?: string; familyId?: string; targetId?: string;
}

export const LEGAL_AREAS: readonly LegalArea[] = [
  { id: 'civil', label: 'Civil', description: 'Obligaciones, responsabilidad y procesos civiles.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'mercantil', label: 'Mercantil', description: 'Juicios y actuaciones regidos por legislación mercantil.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'familiar', label: 'Familiar', description: 'Estado familiar, alimentos, custodia y convivencia.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'laboral', label: 'Laboral', description: 'Litigio laboral y relaciones de trabajo.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'administrativo', label: 'Administrativo', description: 'Actos, nulidad y responsabilidad administrativa.', aliases: ['ambiental', 'energia', 'salud', 'aduanero', 'contratacion_publica', 'responsabilidad_patrimonial'], uiVisibility: 'VISIBLE' },
  { id: 'fiscal', label: 'Fiscal', description: 'Defensa y procedimientos fiscales.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'constitucional_amparo', label: 'Constitucional / Amparo', description: 'Amparo y control constitucional.', aliases: ['amparo', 'constitucional', 'derechos_humanos'], uiVisibility: 'VISIBLE' },
  { id: 'penal', label: 'Penal', description: 'Investigación, juicio y ejecución penal.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'agrario', label: 'Agrario', description: 'Justicia agraria.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'corporativo_societario', label: 'Corporativo / Societario', description: 'Actos societarios y gobierno corporativo.', aliases: ['corporativo', 'financiero'], uiVisibility: 'VISIBLE' },
  { id: 'contractual', label: 'Contractual', description: 'Contratos y convenios no litigiosos.', aliases: ['notarial'], uiVisibility: 'VISIBLE' },
  { id: 'inmobiliario', label: 'Inmobiliario', description: 'Operaciones y controversias inmobiliarias.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'sucesorio', label: 'Sucesorio', description: 'Sucesiones y partición hereditaria.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'propiedad_intelectual', label: 'Propiedad Intelectual', description: 'Marcas, patentes y derechos de autor.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'proteccion_consumidor', label: 'Protección al consumidor', description: 'Reclamaciones, conciliación y procedimientos de consumo.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'seguridad_social', label: 'Seguridad Social', description: 'Pensiones y prestaciones sociales.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'electoral', label: 'Electoral', description: 'Medios de impugnación político-electorales.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'migratorio', label: 'Migratorio', description: 'Estancia, regularización y defensa migratoria.', aliases: [], uiVisibility: 'VISIBLE' },
  { id: 'transparencia_datos_personales', label: 'Transparencia / Datos personales', description: 'Acceso, derechos ARCO y recursos.', aliases: ['transparencia'], uiVisibility: 'VISIBLE' },
  { id: 'escritos_generales', label: 'Escritos generales de trámite', description: 'Promociones y solicitudes transversales.', aliases: ['procesal', 'otro'], uiVisibility: 'VISIBLE' },
];

type CatalogDocumentSeed = { id: string; sourceCompatibility?: SourceCompatibilityDeclaration };
type CatalogGroup = { areaId: string; procedureId: string; procedureLabel: string; familyId: string; familyLabel: string; ids: readonly CatalogDocumentSeed[]; };
const document = (id: string, sourceCompatibility?: SourceCompatibilityDeclaration): CatalogDocumentSeed => ({ id, sourceCompatibility });
const group = (areaId: string, procedureId: string, procedureLabel: string, familyId: string, familyLabel: string, ids: readonly (string | CatalogDocumentSeed)[]): CatalogGroup => ({ areaId, procedureId, procedureLabel, familyId, familyLabel, ids: ids.map((entry) => typeof entry === 'string' ? document(entry) : entry) });

const PROPOSED_GROUPS: readonly CatalogGroup[] = [
  group('civil', 'civil_declarativo', 'Juicios declarativos y orales', 'civil_demandas', 'Demandas y contestaciones civiles', [document('demanda_ordinaria_civil', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONVENIO_CIVIL', 'REQUERIMIENTO_CIVIL', 'COMUNICACION_CIVIL', 'PRUEBA_DOCUMENTAL_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], optionalSourceTypes: [], incompatibleMatterIds: ['mercantil', 'laboral', 'amparo', 'penal'], }), 'demanda_oral_civil', 'demanda_ejecutiva_civil', 'demanda_responsabilidad_civil', 'demanda_cumplimiento_contrato', 'demanda_rescision_contrato', 'demanda_pago_pesos', 'demanda_danos_perjuicios', 'demanda_prescripcion', 'demanda_usucapion', 'demanda_accion_reivindicatoria', 'demanda_interdicto', 'demanda_arrendamiento']),
  group('civil', 'civil_declarativo', 'Juicios declarativos y orales', 'civil_demandas', 'Demandas y contestaciones civiles', [document('contestacion_demanda_civil', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL'], incompatibleMatterIds: ['laboral', 'mercantil'], requiresFactAndClaimExtraction: true }), document('contestacion_demanda_oral_civil', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL'], incompatibleMatterIds: ['laboral', 'mercantil'], requiresFactAndClaimExtraction: true }), document('contestacion_demanda_arrendamiento', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL'], optionalSourceTypes: ['CONTRATO_CIVIL', 'CONVENIO_CIVIL'], incompatibleMatterIds: ['laboral', 'mercantil'], requiresFactAndClaimExtraction: true })]),
  group('civil', 'civil_reconvencion', 'Reconvención civil', 'civil_reconvencion', 'Reconvenciones civiles', [document('reconvencion_civil', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL', 'CONTESTACION_DEMANDA', 'CONTESTACION_DEMANDA_CIVIL'], incompatibleMatterIds: ['laboral', 'mercantil'] }), document('contestacion_reconvencion_civil', { sourceRequired: true, acceptedSourceTypes: ['RECONVENCION_CIVIL'], incompatibleMatterIds: ['laboral', 'mercantil'], requiresFactAndClaimExtraction: true })]),
  group('civil', 'civil_prueba_cierre', 'Prueba y cierre civil', 'civil_prueba', 'Prueba y argumentación civil', [
    document('ofrecimiento_pruebas_civil', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL', 'PRUEBA_DOCUMENTAL_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('objecion_pruebas_civil', { sourceRequired: true, acceptedSourceTypes: ['PRUEBA_DOCUMENTAL_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR', 'DEMANDA_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('desahogo_vista_civil', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'PRUEBA_DOCUMENTAL_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('alegatos_civil', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL', 'PRUEBA_DOCUMENTAL_CIVIL', 'ACUERDO', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    'conclusiones_civil',
  ]),
  group('civil', 'civil_incidental', 'Incidentes civiles', 'civil_incidentes', 'Incidentes civiles', [
    document('incidente_nulidad_actuaciones', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'SENTENCIA_O_RESOLUCION', 'DEMANDA_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('incidente_liquidacion', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('incidente_costas', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('incidente_ejecucion', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('incidente_cumplimiento', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('incidente_personalidad', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('incidente_competencia', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('incidente_acumulacion', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
  ]),
  group('civil', 'civil_cautelar', 'Medidas cautelares civiles', 'civil_cautelares', 'Cautelares civiles', [
    document('solicitud_medida_cautelar_civil', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('providencia_precautoria', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('solicitud_embargo_precautorio', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
  ]),
  group('civil', 'civil_recurso', 'Recursos civiles', 'civil_recursos', 'Recursos civiles', [
    document('apelacion_civil', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('revocacion_civil', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'SENTENCIA_O_RESOLUCION'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    'queja_civil',
    document('aclaracion_sentencia_civil', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
  ]),
  group('civil', 'civil_ejecucion', 'Ejecución civil', 'civil_ejecucion', 'Ejecución civil', [
    document('solicitud_ejecucion_sentencia_civil', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('liquidacion_sentencia_civil', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('requerimiento_cumplimiento_sentencia', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
  ]),
  group('mercantil', 'mercantil_juicio', 'Juicios mercantiles', 'mercantil_demandas', 'Demandas mercantiles', [document('contestacion_demanda_mercantil', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_MERCANTIL', 'ESCRITO_INICIAL_MERCANTIL'], incompatibleMatterIds: ['civil', 'laboral'], requiresFactAndClaimExtraction: true }), 'demanda_ordinaria_mercantil', document('demanda_ejecutiva_mercantil', { sourceRequired: true, acceptedSourceTypes: ['PAGARE', 'TITULO_CREDITO', 'CONVENIO_MERCANTIL', 'DOCUMENTO_MERCANTIL_BASE', 'REQUERIMIENTO_MERCANTIL', 'ESTADO_CUENTA_MERCANTIL', 'COMUNICACION_MERCANTIL', 'PAGO_MERCANTIL', 'DOCUMENTO_MERCANTIL_AUXILIAR'], optionalSourceTypes: [], incompatibleMatterIds: ['civil', 'laboral', 'penal', 'amparo', 'administrativo'] }), 'demanda_oral_mercantil']),
  group('mercantil', 'mercantil_defensas', 'Reconvención y defensas mercantiles', 'mercantil_defensas', 'Defensas mercantiles', [document('reconvencion_mercantil', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_MERCANTIL', 'ESCRITO_INICIAL_MERCANTIL', 'CONTESTACION_DEMANDA', 'CONTESTACION_DEMANDA_MERCANTIL'], incompatibleMatterIds: ['civil', 'laboral'] }), document('contestacion_reconvencion_mercantil', { sourceRequired: true, acceptedSourceTypes: ['RECONVENCION_MERCANTIL'], incompatibleMatterIds: ['civil', 'laboral'], requiresFactAndClaimExtraction: true }), document('excepciones_mercantiles', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_MERCANTIL', 'ESCRITO_INICIAL_MERCANTIL', 'CONTESTACION_DEMANDA_MERCANTIL', 'RECONVENCION_MERCANTIL'], incompatibleMatterIds: ['civil', 'laboral'], requiresFactAndClaimExtraction: true })]),
  group('mercantil', 'mercantil_prueba', 'Prueba y argumentación mercantil', 'mercantil_prueba', 'Prueba mercantil', [
    document('ofrecimiento_pruebas_mercantil', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_MERCANTIL', 'ESCRITO_INICIAL_MERCANTIL', 'DOCUMENTO_MERCANTIL_BASE', 'DOCUMENTO_MERCANTIL_AUXILIAR'], incompatibleMatterIds: ['civil', 'laboral'] }),
    document('objecion_documentos_mercantil', { sourceRequired: true, acceptedSourceTypes: ['DOCUMENTO_MERCANTIL_BASE', 'DOCUMENTO_MERCANTIL_AUXILIAR', 'DEMANDA_MERCANTIL'], incompatibleMatterIds: ['civil', 'laboral'] }),
    document('alegatos_mercantil', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_MERCANTIL', 'ESCRITO_INICIAL_MERCANTIL', 'DOCUMENTO_MERCANTIL_BASE', 'DOCUMENTO_MERCANTIL_AUXILIAR', 'ACUERDO'], incompatibleMatterIds: ['civil', 'laboral'] }),
  ]),
  group('mercantil', 'mercantil_recurso', 'Recursos mercantiles', 'mercantil_recursos', 'Recursos mercantiles', [
    document('apelacion_mercantil', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['civil', 'laboral'] }),
    document('revocacion_mercantil', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'SENTENCIA_O_RESOLUCION'], incompatibleMatterIds: ['civil', 'laboral'] }),
    document('aclaracion_sentencia_mercantil', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['civil', 'laboral'] }),
  ]),
  group('mercantil', 'mercantil_ejecucion', 'Ejecución mercantil', 'mercantil_ejecucion', 'Ejecución mercantil', [
    document('ejecucion_sentencia_mercantil', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['civil', 'laboral'] }),
    document('liquidacion_mercantil', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['civil', 'laboral'] }),
    document('embargo_mercantil', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'SENTENCIA_O_RESOLUCION'], incompatibleMatterIds: ['civil', 'laboral'] }),
  ]),
  group('mercantil', 'mercantil_cautelar', 'Providencias precautorias mercantiles', 'mercantil_cautelares', 'Cautelares mercantiles', [
    document('providencias_precautorias_mercantiles', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'DEMANDA_MERCANTIL', 'ESCRITO_INICIAL_MERCANTIL'], incompatibleMatterIds: ['civil', 'laboral'] }),
  ]),
  group('familiar', 'familiar_divorcio', 'Divorcio', 'familiar_divorcio', 'Divorcio', [
    document('demanda_divorcio', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'CONVENIO_CIVIL', 'DEMANDA_CIVIL', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('convenio_divorcio', { sourceRequired: false, acceptedSourceTypes: ['CONVENIO_CIVIL', 'ACUERDO', 'DEMANDA_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('contestacion_divorcio', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL', 'DEMANDA'], incompatibleMatterIds: ['mercantil', 'laboral'], requiresFactAndClaimExtraction: true }),
  ]),
  group('familiar', 'familiar_alimentos', 'Alimentos', 'familiar_alimentos', 'Alimentos', [
    document('demanda_alimentos', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'CONVENIO_CIVIL', 'DEMANDA_CIVIL', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('contestacion_alimentos', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL', 'DEMANDA'], incompatibleMatterIds: ['mercantil', 'laboral'], requiresFactAndClaimExtraction: true }),
    document('solicitud_alimentos_provisionales', { sourceRequired: false, acceptedSourceTypes: ['DEMANDA_CIVIL', 'ACUERDO', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
  ]),
  group('familiar', 'familiar_convivencia', 'Guarda y convivencia', 'familiar_convivencia', 'Guarda, custodia y convivencia', [
    document('demanda_guarda_custodia', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'CONVENIO_CIVIL', 'DEMANDA_CIVIL', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('contestacion_guarda_custodia', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL', 'DEMANDA'], incompatibleMatterIds: ['mercantil', 'laboral'], requiresFactAndClaimExtraction: true }),
    document('demanda_regimen_convivencias', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'CONVENIO_CIVIL', 'DEMANDA_CIVIL', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('modificacion_convivencias', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'CONVENIO_CIVIL', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
  ]),
  group('familiar', 'familiar_filiacion', 'Filiación y familia', 'familiar_filiacion', 'Filiación y familia', [
    document('perdida_patria_potestad', { sourceRequired: false, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO', 'ACTO_DE_AUTORIDAD', 'DEMANDA_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('reconocimiento_paternidad', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'ACTO_DE_AUTORIDAD', 'DEMANDA_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('desconocimiento_paternidad', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'ACTO_DE_AUTORIDAD', 'DEMANDA_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('adopcion', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('medidas_proteccion_familiar', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'ACTO_DE_AUTORIDAD', 'DEMANDA_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('convenio_familiar', { sourceRequired: false, acceptedSourceTypes: ['CONVENIO_CIVIL', 'ACUERDO', 'DEMANDA_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
  ]),
  group('familiar', 'familiar_no_contencioso', 'Jurisdicción voluntaria familiar', 'familiar_no_contencioso', 'Actos familiares no contenciosos', [
    document('jurisdiccion_voluntaria_familiar', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'ACTO_DE_AUTORIDAD', 'PRUEBA_DOCUMENTAL_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('liquidacion_sociedad_conyugal', { sourceRequired: false, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'CONVENIO_CIVIL', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
  ]),
  group('familiar', 'familiar_incidental', 'Incidentes familiares', 'familiar_incidentes', 'Incidentes familiares', [
    document('incidente_modificacion_pension', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'CONVENIO_CIVIL', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('incidente_reduccion_pension', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'CONVENIO_CIVIL', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('incidente_incremento_pension', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'CONVENIO_CIVIL', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
  ]),
  group('familiar', 'familiar_ejecucion', 'Ejecución y recursos familiares', 'familiar_ejecucion', 'Ejecución familiar', [
    document('ejecucion_convenio_familiar', { sourceRequired: true, acceptedSourceTypes: ['CONVENIO_CIVIL', 'SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('apelacion_familiar', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
    document('alegatos_familiar', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_CIVIL', 'ACUERDO', 'SENTENCIA_O_RESOLUCION'], incompatibleMatterIds: ['mercantil', 'laboral'] }),
  ]),
  group('laboral', 'laboral_litigio', 'Litigio laboral', 'laboral_demanda', 'Demandas laborales', [
    document('demanda_laboral', { sourceRequired: false, acceptedSourceTypes: ['DEMANDA_LABORAL', 'ESCRITO_INICIAL_LABORAL', 'ACTO_DE_AUTORIDAD', 'ACUERDO'], optionalSourceTypes: [], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'penal', 'fiscal'] }),
    document('contestacion_demanda_laboral', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_LABORAL', 'ESCRITO_INICIAL_LABORAL', 'DEMANDA'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'], requiresFactAndClaimExtraction: true }),
    document('reconvencion_laboral', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_LABORAL', 'ESCRITO_INICIAL_LABORAL', 'CONTESTACION_DEMANDA', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'] }),
    document('contestacion_reconvencion_laboral', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_LABORAL', 'CONTESTACION_DEMANDA', 'RECONVENCION_CIVIL'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'], requiresFactAndClaimExtraction: true }),
    document('ampliacion_demanda_laboral', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_LABORAL', 'ESCRITO_INICIAL_LABORAL', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'] }),
  ]),
  group('laboral', 'laboral_prueba', 'Prueba y prevención laboral', 'laboral_prueba', 'Prueba laboral', [
    document('ofrecimiento_pruebas_laboral', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_LABORAL', 'ESCRITO_INICIAL_LABORAL', 'CONTESTACION_DEMANDA', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'] }),
    document('objecion_pruebas_laboral', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_LABORAL', 'CONTESTACION_DEMANDA', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'] }),
    document('desahogo_prevencion_laboral', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'DEMANDA_LABORAL', 'ESCRITO_INICIAL_LABORAL'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'] }),
  ]),
  group('laboral', 'laboral_cierre', 'Cierre laboral', 'laboral_argumentacion', 'Alegatos laborales', [
    document('alegatos_laborales', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_LABORAL', 'CONTESTACION_DEMANDA', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'] }),
  ]),
  group('laboral', 'laboral_incidental', 'Incidentes laborales', 'incidente_laboral', 'Incidentes laborales', [
    document('incidente_laboral', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_LABORAL', 'CONTESTACION_DEMANDA', 'ACUERDO', 'SENTENCIA_O_RESOLUCION'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'] })
  ]),
  group('laboral', 'laboral_ejecucion', 'Ejecución laboral', 'laboral_ejecucion', 'Ejecución laboral', [
    document('cumplimiento_laudo_sentencia_laboral', { sourceRequired: true, acceptedSourceTypes: ['LAUDO', 'SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'] }),
    document('ejecucion_sentencia_laboral', { sourceRequired: true, acceptedSourceTypes: ['LAUDO', 'SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'] }),
  ]),
  group('laboral', 'laboral_recurso', 'Recursos laborales', 'recurso_laboral', 'Recursos laborales', [
    document('recurso_laboral', { sourceRequired: true, acceptedSourceTypes: ['LAUDO', 'SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'] })
  ]),
  group('laboral', 'laboral_amparo_contextual', 'Amparo laboral contextual', 'amparo_directo_laboral', 'Amparo directo laboral', [
    document('amparo_directo_laboral', { sourceRequired: true, acceptedSourceTypes: ['LAUDO', 'SENTENCIA_O_RESOLUCION'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'] }),
    document('demanda_amparo_directo_laboral', { sourceRequired: true, acceptedSourceTypes: ['LAUDO', 'SENTENCIA_O_RESOLUCION'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'] }),
    document('demanda_amparo_indirecto_laboral', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'ACTO_DE_AUTORIDAD', 'LAUDO', 'SENTENCIA_O_RESOLUCION'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar'] }),
  ]),
  group('constitucional_amparo', 'amparo_demanda', 'Demandas de amparo', 'amparo_demandas', 'Demandas de amparo', [
    document('demanda_amparo_indirecto', { sourceRequired: false, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO', 'RESOLUCION_ADMINISTRATIVA', 'SENTENCIA_O_RESOLUCION'], optionalSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO', 'SENTENCIA_O_RESOLUCION'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
    document('demanda_amparo_directo', { sourceRequired: false, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'SENTENCIA_AMPARO_DIRECTO', 'LAUDO'], optionalSourceTypes: ['SENTENCIA_O_RESOLUCION', 'SENTENCIA_AMPARO_DIRECTO', 'LAUDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
    document('ampliacion_demanda_amparo', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_AMPARO', 'ACTO_DE_AUTORIDAD', 'ACUERDO', 'INFORME_JUSTIFICADO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
    document('amparo_adhesivo', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA_AMPARO_DIRECTO', 'SENTENCIA_O_RESOLUCION', 'LAUDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
    document('solicitud_suspension_provisional', { sourceRequired: false, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO', 'DEMANDA_AMPARO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
    document('solicitud_suspension_definitiva', { sourceRequired: false, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO', 'INFORME_PREVIO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
  ]),
  group('constitucional_amparo', 'amparo_argumentacion', 'Argumentación en amparo', 'amparo_argumentacion', 'Alegatos de amparo', [
    document('alegatos_amparo', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'INFORME_JUSTIFICADO', 'DEMANDA_AMPARO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
  ]),
  group('constitucional_amparo', 'amparo_recurso', 'Recursos de amparo', 'amparo_recursos', 'Recursos de amparo', [
    document('recurso_revision_amparo', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'SENTENCIA_AMPARO', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
    document('recurso_queja_amparo', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
    document('recurso_reclamacion_amparo', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
    document('recurso_inconformidad_amparo', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'SENTENCIA_AMPARO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
  ]),
  group('constitucional_amparo', 'amparo_cumplimiento', 'Cumplimiento de ejecutoria', 'amparo_cumplimiento', 'Cumplimiento de amparo', [
    document('cumplimiento_ejecutoria_amparo', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_AMPARO', 'SENTENCIA_AMPARO_DIRECTO', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
    document('promocion_cumplimiento_amparo', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_AMPARO', 'SENTENCIA_AMPARO_DIRECTO', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
    document('manifestaciones_cumplimiento_amparo', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'INFORME_CUMPLIMIENTO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
  ]),
  group('constitucional_amparo', 'amparo_post_sentencia', 'Actuaciones post-sentencia', 'amparo_post_sentencia', 'Post-sentencia de amparo', [
    document('contestacion_revision_extraordinaria_amparo_directo', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_AMPARO_DIRECTO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] }),
  ]),
  group('administrativo', 'administrativo_nulidad', 'Juicio de nulidad administrativo', 'administrativo_nulidad', 'Nulidad administrativa', [
    document('demanda_nulidad_administrativa', { sourceRequired: false, acceptedSourceTypes: ['RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD', 'ACUERDO', 'SENTENCIA_O_RESOLUCION'], optionalSourceTypes: ['RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
    document('contestacion_nulidad_administrativa', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA', 'RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'], requiresFactAndClaimExtraction: true }),
    document('ampliacion_demanda_nulidad', { sourceRequired: true, acceptedSourceTypes: ['CONTESTACION_DEMANDA', 'RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
    document('contestacion_ampliacion_nulidad', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA', 'CONTESTACION_DEMANDA', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'], requiresFactAndClaimExtraction: true }),
  ]),
  group('administrativo', 'administrativo_cierre', 'Cierre administrativo', 'administrativo_cierre', 'Cierre administrativo', [
    document('alegatos_administrativos', { sourceRequired: true, acceptedSourceTypes: ['RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD', 'ACUERDO', 'DEMANDA', 'CONTESTACION_DEMANDA'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
    document('cumplimiento_sentencia_administrativa', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
  ]),
  group('administrativo', 'administrativo_recurso', 'Recursos administrativos', 'administrativo_recursos', 'Recursos administrativos', [
    document('recurso_administrativo', { sourceRequired: true, acceptedSourceTypes: ['RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
    document('recurso_revision_administrativa', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'RESOLUCION_ADMINISTRATIVA', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
  ]),
  group('administrativo', 'administrativo_incidental', 'Incidentes administrativos', 'incidente_administrativo', 'Incidentes administrativos', [
    document('incidente_administrativo', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA', 'RESOLUCION_ADMINISTRATIVA', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
  ]),
  group('administrativo', 'administrativo_cautelar', 'Suspensión administrativa', 'administrativo_cautelar', 'Suspensión administrativa', [
    document('solicitud_suspension_acto_administrativo', { sourceRequired: false, acceptedSourceTypes: ['RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
  ]),
  group('fiscal', 'fiscal_nulidad', 'Nulidad fiscal', 'fiscal_nulidad', 'Nulidad fiscal', [
    document('demanda_nulidad_fiscal', { sourceRequired: false, acceptedSourceTypes: ['RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD', 'ACUERDO', 'SENTENCIA_O_RESOLUCION'], optionalSourceTypes: ['RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
    document('contestacion_nulidad_fiscal', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA', 'RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'], requiresFactAndClaimExtraction: true }),
    document('ampliacion_demanda_fiscal', { sourceRequired: true, acceptedSourceTypes: ['CONTESTACION_DEMANDA', 'RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
    document('contestacion_ampliacion_fiscal', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA', 'CONTESTACION_DEMANDA', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'], requiresFactAndClaimExtraction: true }),
  ]),
  group('fiscal', 'fiscal_recurso', 'Recursos fiscales', 'fiscal_recursos', 'Recursos fiscales', [
    document('recurso_revocacion_fiscal', { sourceRequired: true, acceptedSourceTypes: ['RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
    document('recurso_revision_fiscal', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'RESOLUCION_ADMINISTRATIVA', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
  ]),
  group('fiscal', 'fiscal_cierre', 'Cierre fiscal', 'fiscal_cierre', 'Cierre fiscal', [
    document('alegatos_fiscales', { sourceRequired: true, acceptedSourceTypes: ['RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD', 'ACUERDO', 'DEMANDA', 'CONTESTACION_DEMANDA'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
    document('cumplimiento_sentencia_fiscal', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
  ]),
  group('fiscal', 'fiscal_cautelar', 'Suspensión fiscal', 'fiscal_cautelar', 'Suspensión fiscal', [
    document('solicitud_suspension_fiscal', { sourceRequired: false, acceptedSourceTypes: ['RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
  ]),
  group('fiscal', 'fiscal_autoridad', 'Escritos ante autoridad fiscal', 'fiscal_autoridad', 'Autoridad fiscal', [
    document('escritos_ante_autoridad_fiscal', { sourceRequired: false, acceptedSourceTypes: ['RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral', 'penal'] }),
  ]),
  group('penal', 'penal_investigacion', 'Investigación penal', 'penal_investigacion', 'Investigación penal', [
    document('denuncia', { sourceRequired: false, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO', 'RESOLUCION_ADMINISTRATIVA'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
    document('querella', { sourceRequired: false, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO', 'RESOLUCION_ADMINISTRATIVA'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
    document('ampliacion_denuncia', { sourceRequired: true, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
    document('ampliacion_querella', { sourceRequired: true, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
    document('escrito_asesor_juridico', { sourceRequired: true, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
    document('escrito_defensa', { sourceRequired: true, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
    document('solicitud_actos_investigacion', { sourceRequired: true, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
    document('solicitud_acceso_carpeta', { sourceRequired: true, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
    document('solicitud_copias_carpeta', { sourceRequired: true, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
    document('solicitud_medida_proteccion', { sourceRequired: false, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
  ]),
  group('penal', 'penal_audiencia', 'Medidas y audiencia penal', 'penal_audiencia', 'Preparación de audiencia penal', ['oposicion_medida_cautelar', 'solicitud_revision_medida_cautelar', 'acuerdo_reparatorio_propuesta']),
  group('penal', 'penal_intervencion', 'Intervención penal', 'penal_intervencion', 'Intervención penal', [
    document('escrito_coadyuvancia', { sourceRequired: true, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
  ]),
  group('penal', 'penal_recurso', 'Recursos penales', 'penal_recursos', 'Recursos penales', [
    document('apelacion_penal', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
    document('revocacion_penal', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
  ]),
  group('penal', 'penal_amparo_contextual', 'Amparo penal contextual', 'amparo_penal_contextual', 'Amparo penal', ['amparo_indirecto_penal', 'amparo_directo_penal']),
  group('penal', 'penal_ejecucion', 'Ejecución penal', 'penal_ejecucion', 'Ejecución penal', [
    document('escrito_ejecucion_penal', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
  ]),
  group('agrario', 'agrario_juicio', 'Juicio agrario', 'agrario_juicio', 'Juicio agrario', [
    document('demanda_agraria', { sourceRequired: false, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'ACUERDO', 'CONVENIO_CIVIL', 'PRUEBA_DOCUMENTAL_CIVIL'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
    document('contestacion_demanda_agraria', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA', 'DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'], requiresFactAndClaimExtraction: true }),
    document('reconvencion_agraria', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA', 'DEMANDA_CIVIL', 'ESCRITO_INICIAL_CIVIL', 'CONTESTACION_DEMANDA'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
  ]),
  group('agrario', 'agrario_cierre', 'Cierre agrario', 'agrario_cierre', 'Cierre agrario', [
    document('alegatos_agrarios', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA', 'DEMANDA_CIVIL', 'ACUERDO', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
    document('cumplimiento_sentencia_agraria', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO', 'ACTO_DE_AUTORIDAD'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
  ]),
  group('agrario', 'agrario_incidental', 'Incidentes agrarios', 'incidente_agrario', 'Incidentes agrarios', ['incidente_agrario']),
  group('agrario', 'agrario_recurso', 'Recursos agrarios', 'agrario_recursos', 'Recursos agrarios', [
    document('recurso_agrario', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO'], incompatibleMatterIds: ['mercantil', 'laboral', 'fiscal'] }),
  ]),
  group('agrario', 'agrario_amparo_contextual', 'Amparo agrario contextual', 'amparo_agrario', 'Amparo agrario', ['amparo_agrario']),
  group('sucesorio', 'sucesorio_apertura', 'Apertura sucesoria', 'sucesorio_apertura', 'Apertura de sucesión', ['denuncia_sucesion_testamentaria', 'denuncia_sucesion_intestamentaria']),
  group('sucesorio', 'sucesorio_herencia', 'Herencia y albacea', 'sucesorio_herencia', 'Herencia y albacea', ['aceptacion_herencia', 'repudiacion_herencia', 'nombramiento_albacea']),
  group('sucesorio', 'sucesorio_particion', 'Masa y partición', 'sucesorio_particion', 'Inventario y partición', ['inventario_avaluo', 'proyecto_particion', 'adjudicacion']),
  group('sucesorio', 'sucesorio_controversia', 'Controversia sucesoria', 'incidente_sucesorio', 'Incidentes sucesorios', ['oposicion_sucesoria', 'incidente_sucesorio']),
  group('sucesorio', 'sucesorio_convenio', 'Convenios sucesorios', 'sucesorio_convenios', 'Convenios sucesorios', ['convenio_herederos']),
  group('corporativo_societario', 'corporativo_constitucion', 'Constitución y estatutos', 'corporativo_constitucion', 'Constitución societaria', [
    document('constitucion_sociedad', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'CONVENIO_CIVIL', 'PRUEBA_DOCUMENTAL_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('modificacion_estatutos', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
  ]),
  group('corporativo_societario', 'corporativo_gobierno', 'Asambleas y consejo', 'corporativo_gobierno', 'Gobierno corporativo', [
    document('acta_asamblea_ordinaria', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('acta_asamblea_extraordinaria', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('resoluciones_unanimidad', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('acta_consejo', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
  ]),
  group('corporativo_societario', 'corporativo_capital', 'Capital social', 'corporativo_capital', 'Capital social', [
    document('aumento_capital', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR', 'ESTADO_CUENTA_MERCANTIL'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('reduccion_capital', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR', 'ESTADO_CUENTA_MERCANTIL'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
  ]),
  group('corporativo_societario', 'corporativo_participacion', 'Participación societaria', 'corporativo_participacion', 'Participación societaria', [
    document('cesion_partes_sociales', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('compraventa_acciones', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
  ]),
  group('corporativo_societario', 'corporativo_poderes', 'Poderes', 'corporativo_poderes', 'Poderes y representación', [
    document('poderes', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('revocacion_poder', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
  ]),
  group('corporativo_societario', 'corporativo_acuerdos', 'Acuerdos corporativos', 'corporativo_acuerdos', 'Acuerdos corporativos', [
    document('convenio_accionistas', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('acuerdo_confidencialidad', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'CONTRATO_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('carta_intencion', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
  ]),
  group('contractual', 'contractual_contratos', 'Contratos', 'contractual_contratos', 'Contratos', [
    document('contrato_compraventa', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('contrato_arrendamiento', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('contrato_prestacion_servicios', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('contrato_obra', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('contrato_mutuo', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'PAGARE', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('contrato_comodato', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('contrato_mandato', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('contrato_comision', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'CONTRATO_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('contrato_distribucion', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'CONTRATO_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('contrato_suministro', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'CONTRATO_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('contrato_confidencialidad', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('contrato_licencia', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
  ]),
  group('contractual', 'contractual_convenios', 'Convenios', 'contractual_convenios', 'Convenios', [
    document('convenio_transaccional', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'CONVENIO_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('convenio_reconocimiento_adeudo', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'PAGARE', 'ESTADO_CUENTA_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('convenio_terminacion', { sourceRequired: true, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'CONVENIO_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('convenio_modificatorio', { sourceRequired: true, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'CONVENIO_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
  ]),
  group('contractual', 'contractual_precontractual', 'Etapa precontractual', 'contractual_precontractual', 'Instrumentos precontractuales', [
    document('memorando_entendimiento', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONTRATO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
  ]),
  group('inmobiliario', 'inmobiliario_operacion', 'Operaciones inmobiliarias', 'inmobiliario_operaciones', 'Operaciones inmobiliarias', [
    document('promesa_compraventa_inmueble', { sourceRequired: false, acceptsAnySource: true, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONVENIO_CIVIL', 'PRUEBA_DOCUMENTAL_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'fiscal'] }),
    document('compraventa_inmueble', { sourceRequired: false, acceptsAnySource: true, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONVENIO_CIVIL', 'PRUEBA_DOCUMENTAL_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'fiscal'] }),
    document('arrendamiento_inmueble', { sourceRequired: false, acceptsAnySource: true, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONVENIO_CIVIL', 'PRUEBA_DOCUMENTAL_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'fiscal'] }),
  ]),
  group('inmobiliario', 'inmobiliario_terminacion', 'Terminación y cobro de rentas', 'inmobiliario_rentas', 'Rentas y terminación', [
    document('terminacion_arrendamiento', { sourceRequired: true, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONVENIO_CIVIL', 'COMUNICACION_CIVIL'], incompatibleMatterIds: ['penal', 'laboral', 'fiscal'] }),
    document('requerimiento_pago_rentas', { sourceRequired: true, acceptedSourceTypes: ['CONTRATO_CIVIL', 'ESTADO_CUENTA_MERCANTIL', 'COMUNICACION_CIVIL'], incompatibleMatterIds: ['penal', 'laboral', 'fiscal'] }),
    document('aviso_terminacion', { sourceRequired: true, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONVENIO_CIVIL', 'COMUNICACION_CIVIL'], incompatibleMatterIds: ['penal', 'laboral', 'fiscal'] }),
    document('convenio_desocupacion', { sourceRequired: true, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONVENIO_CIVIL'], incompatibleMatterIds: ['penal', 'laboral', 'fiscal'] }),
    document('reconocimiento_adeudo_arrendamiento', { sourceRequired: true, acceptedSourceTypes: ['CONTRATO_CIVIL', 'CONVENIO_CIVIL', 'ESTADO_CUENTA_MERCANTIL'], incompatibleMatterIds: ['penal', 'laboral', 'fiscal'] }),
  ]),
  group('inmobiliario', 'inmobiliario_litigio', 'Litigio inmobiliario', 'inmobiliario_litigio', 'Litigio inmobiliario', [
    document('demanda_desocupacion', { sourceRequired: true, acceptedSourceTypes: ['CONTRATO_CIVIL', 'REQUERIMIENTO_CIVIL', 'COMUNICACION_CIVIL', 'PRUEBA_DOCUMENTAL_CIVIL'], incompatibleMatterIds: ['penal', 'laboral', 'fiscal'] }),
  ]),
  group('propiedad_intelectual', 'pi_marcas_oficial', 'Marcas y registro oficial', 'pi_marcas_oficial', 'Trámites oficiales de marcas', [
    document('solicitud_registro_marca', { sourceRequired: false, acceptedSourceTypes: ['PRUEBA_DOCUMENTAL_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('contestacion_impedimento', { sourceRequired: true, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'RESOLUCION_ADMINISTRATIVA', 'ACUERDO'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('oposicion_marca', { sourceRequired: true, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'RESOLUCION_ADMINISTRATIVA', 'ACUERDO'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('nulidad_registro', { sourceRequired: true, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'RESOLUCION_ADMINISTRATIVA', 'PRUEBA_DOCUMENTAL_CIVIL'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('caducidad_registro', { sourceRequired: true, acceptedSourceTypes: ['ACTO_DE_AUTORIDAD', 'RESOLUCION_ADMINISTRATIVA', 'PRUEBA_DOCUMENTAL_CIVIL'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
  ]),
  group('propiedad_intelectual', 'pi_infraccion_recurso', 'Infracción y recursos', 'pi_infraccion_recurso', 'Infracción y recursos de PI', [
    document('infraccion_propiedad_industrial', { sourceRequired: true, acceptedSourceTypes: ['PRUEBA_DOCUMENTAL_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR', 'ACTO_DE_AUTORIDAD', 'RESOLUCION_ADMINISTRATIVA'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('recurso_propiedad_intelectual', { sourceRequired: true, acceptedSourceTypes: ['RESOLUCION_ADMINISTRATIVA', 'ACTO_DE_AUTORIDAD', 'ACUERDO'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
  ]),
  group('propiedad_intelectual', 'pi_contratos', 'Contratos de propiedad intelectual', 'pi_contratos', 'Licencias y cesiones de PI', [
    document('contrato_licencia_marca', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'CONTRATO_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('cesion_derechos_marca', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'CONTRATO_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('licencia_derechos_autor', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'CONTRATO_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
    document('cesion_derechos_autor', { sourceRequired: false, acceptedSourceTypes: ['CONTRATO_MERCANTIL', 'CONTRATO_CIVIL', 'DOCUMENTO_CIVIL_AUXILIAR'], incompatibleMatterIds: ['penal', 'laboral', 'familiar'] }),
  ]),
  group('proteccion_consumidor', 'consumidor_reclamacion', 'Reclamación y queja', 'consumidor_reclamacion', 'Reclamaciones de consumo', ['reclamacion_consumidor', 'queja_consumidor']),
  group('proteccion_consumidor', 'consumidor_conciliacion', 'Proveedor y conciliación', 'consumidor_conciliacion', 'Conciliación de consumo', ['contestacion_proveedor', 'convenio_conciliatorio']),
  group('proteccion_consumidor', 'consumidor_procedimiento', 'Procedimiento de consumo', 'consumidor_procedimiento', 'Procedimiento de consumo', ['escrito_procedimiento_infracciones', 'recurso_consumidor']),
  group('seguridad_social', 'seguridad_social_controversia', 'Controversia de seguridad social', 'seguridad_social_controversia', 'Controversias de seguridad social', ['inconformidad_seguridad_social', 'demanda_seguridad_social', 'contestacion_seguridad_social', 'recurso_seguridad_social']),
  group('seguridad_social', 'seguridad_social_pensiones', 'Pensiones', 'seguridad_social_pensiones', 'Pensiones', ['solicitud_pension', 'impugnacion_pension']),
  group('seguridad_social', 'seguridad_social_amparo_contextual', 'Amparo de seguridad social contextual', 'amparo_seguridad_social', 'Amparo de seguridad social', ['amparo_seguridad_social']),
  group('electoral', 'electoral_medios', 'Medios de impugnación electoral', 'electoral_medios', 'Medios electorales', ['juicio_proteccion_derechos_politico_electorales', 'juicio_inconformidad', 'recurso_apelacion_electoral', 'recurso_revision_electoral']),
  group('electoral', 'electoral_partes', 'Intervención de partes electorales', 'electoral_partes', 'Partes y alegatos electorales', ['escrito_tercero_interesado_electoral', 'alegatos_electorales']),
  group('migratorio', 'migratorio_administrativo', 'Procedimientos migratorios', 'migratorio_administrativo', 'Procedimientos migratorios', ['solicitud_regularizacion', 'recurso_revision_migratoria', 'escrito_autoridad_migratoria', 'alegatos_migratorios']),
  group('migratorio', 'migratorio_amparo_contextual', 'Amparo migratorio contextual', 'amparo_migratorio', 'Amparo migratorio', ['amparo_migratorio']),
  group('transparencia_datos_personales', 'transparencia_informacion', 'Acceso a información', 'transparencia_informacion', 'Acceso a información', ['solicitud_acceso_informacion', 'recurso_revision_transparencia']),
  group('transparencia_datos_personales', 'transparencia_arco', 'Derechos ARCO', 'transparencia_arco', 'Derechos ARCO', ['solicitud_derechos_arco', 'recurso_datos_personales']),
  group('transparencia_datos_personales', 'transparencia_cumplimiento', 'Cumplimiento de transparencia', 'transparencia_cumplimiento', 'Cumplimiento de transparencia', ['escrito_cumplimiento_transparencia']),
  group('escritos_generales', 'tramite_prevenciones', 'Prevenciones y requerimientos', 'tramite_prevenciones', 'Prevenciones y requerimientos', [
    document('promocion_simple', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'ACTO_DE_AUTORIDAD', 'DEMANDA', 'CONTESTACION_DEMANDA', 'SENTENCIA_O_RESOLUCION', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('desahogo_prevencion', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'ACTO_DE_AUTORIDAD', 'DEMANDA', 'CONTESTACION_DEMANDA', 'RESOLUCION_ADMINISTRATIVA', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('cumplimiento_requerimiento', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'ACTO_DE_AUTORIDAD', 'SENTENCIA_O_RESOLUCION', 'RESOLUCION_ADMINISTRATIVA', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('cumplimiento_prevencion', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'ACTO_DE_AUTORIDAD', 'DEMANDA', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
  ]),
  group('escritos_generales', 'tramite_manifestaciones', 'Manifestaciones', 'tramite_manifestaciones', 'Manifestaciones y comparecencias', [
    document('manifestaciones', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'ACTO_DE_AUTORIDAD', 'DEMANDA', 'CONTESTACION_DEMANDA', 'SENTENCIA_O_RESOLUCION', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('comparecencia', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'DEMANDA', 'CONTESTACION_DEMANDA', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('ratificacion', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'CONVENIO_CIVIL', 'CONVENIO_MERCANTIL', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
  ]),
  group('escritos_generales', 'tramite_copias_expediente', 'Copias y expediente', 'tramite_copias_expediente', 'Copias y acceso al expediente', [
    document('solicitud_copias', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'SENTENCIA_O_RESOLUCION', 'DEMANDA', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('solicitud_copias_certificadas', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'SENTENCIA_O_RESOLUCION', 'DEMANDA', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('solicitud_acceso_expediente', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'DEMANDA', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('solicitud_certificacion', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'SENTENCIA_O_RESOLUCION', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
  ]),
  group('escritos_generales', 'tramite_representacion', 'Representación procesal', 'tramite_representacion', 'Representación procesal', [
    document('autorizacion_abogados', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'DEMANDA', 'CONTESTACION_DEMANDA', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('revocacion_autorizados', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'DEMANDA', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('cambio_domicilio_procesal', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'DEMANDA', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('senalamiento_correo', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'DEMANDA', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
  ]),
  group('escritos_generales', 'tramite_impulso', 'Impulso procesal', 'tramite_impulso', 'Impulso y archivo', [
    document('impulso_procesal', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'SENTENCIA_O_RESOLUCION', 'DEMANDA', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('solicitud_acumulacion', { sourceRequired: false, acceptedSourceTypes: ['DEMANDA', 'ACUERDO', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('solicitud_archivo', { sourceRequired: false, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'ACUERDO', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('solicitud_desarchivo', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'SENTENCIA_O_RESOLUCION', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
  ]),
  group('escritos_generales', 'tramite_terminacion', 'Terminación y corrección', 'tramite_terminacion', 'Terminación de actuaciones', [
    document('desistimiento', { sourceRequired: false, acceptedSourceTypes: ['DEMANDA', 'ACUERDO', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('allanamiento', { sourceRequired: false, acceptedSourceTypes: ['DEMANDA', 'ACUERDO', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('convenio_judicial', { sourceRequired: false, acceptedSourceTypes: ['DEMANDA', 'CONTESTACION_DEMANDA', 'CONVENIO_CIVIL', 'CONVENIO_MERCANTIL', 'ACUERDO', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('aclaracion', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'SENTENCIA_O_RESOLUCION', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('correccion_error', { sourceRequired: false, acceptedSourceTypes: ['ACUERDO', 'SENTENCIA_O_RESOLUCION', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
    document('solicitud_devolucion_documentos', { sourceRequired: false, acceptedSourceTypes: ['DEMANDA', 'ACUERDO', 'SENTENCIA_O_RESOLUCION', 'DOCUMENTO_CIVIL_AUXILIAR'] }),
  ]),
  group('escritos_generales', 'tramite_libre', 'Escrito libre', 'tramite_libre', 'Escrito libre', [document('escrito_libre', { sourceRequired: false, acceptsAnySource: true, acceptedSourceTypes: [] })]),
];

export const LEGACY_DOCUMENT_IDENTIFIER_IDS = [
  'demanda', 'contestacion_demanda', 'reconvencion', 'ampliacion', 'replica', 'duplica', 'incidente', 'recurso', 'apelacion', 'revocacion', 'queja', 'reclamacion', 'amparo_directo', 'amparo_indirecto', 'agravios', 'alegatos', 'promocion', 'solicitud', 'escrito_libre', 'recurso_queja', 'recurso_reclamacion', 'recurso_revision', 'recurso_administrativo', 'recurso_revision_amparo_directo', 'demanda_amparo_indirecto', 'demanda_amparo_directo', 'contestacion_demanda_laboral', 'contestacion_demanda_civil', 'escrito_cumplimiento_sentencia', 'contestacion_revision_extraordinaria_amparo_directo', 'escrito_agravios', 'incidente_procesal', 'otro',
] as const;

const LEGACY_ONLY_GROUPS: readonly CatalogGroup[] = [
  group('escritos_generales', 'tramite_inicial', 'Trámite inicial', 'legacy_demandas', 'Tipos generales legacy', [document('demanda', { sourceRequired: false, acceptedSourceTypes: [], optionalSourceTypes: ['DEMANDA', 'DEMANDA_CIVIL', 'DEMANDA_MERCANTIL', 'DEMANDA_LABORAL', 'ESCRITO_INICIAL_CIVIL', 'ESCRITO_INICIAL_MERCANTIL', 'ESCRITO_INICIAL_LABORAL', 'SENTENCIA_O_RESOLUCION', 'SENTENCIA_AMPARO', 'SENTENCIA_AMPARO_DIRECTO', 'LAUDO', 'ACTO_DE_AUTORIDAD', 'ACUERDO', 'RESOLUCION_ADMINISTRATIVA', 'CONTESTACION_DEMANDA'] }), document('contestacion_demanda', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA', 'DEMANDA_CIVIL', 'DEMANDA_MERCANTIL', 'DEMANDA_LABORAL', 'ESCRITO_INICIAL_CIVIL', 'ESCRITO_INICIAL_MERCANTIL', 'ESCRITO_INICIAL_LABORAL'], requiresFactAndClaimExtraction: true })]),
  group('escritos_generales', 'tramite_reconvencion', 'Reconvención', 'reconvencion', 'Reconvención', ['reconvencion']),
  group('escritos_generales', 'tramite_ampliacion', 'Ampliación', 'ampliacion', 'Ampliación', ['ampliacion']),
  group('escritos_generales', 'tramite_contestacion', 'Réplica y dúplica', 'legacy_respuestas', 'Réplica y dúplica', [document('replica', { sourceRequired: true, acceptedSourceTypes: ['CONTESTACION_DEMANDA'] }), document('duplica', { sourceRequired: true, acceptedSourceTypes: ['REPLICA'] })]),
  group('escritos_generales', 'tramite_incidente', 'Incidentes', 'incidente', 'Incidentes', ['incidente']),
  group('escritos_generales', 'tramite_recurso', 'Recursos', 'recurso', 'Recursos', ['recurso', 'apelacion', 'revocacion', 'queja', 'reclamacion', 'recurso_revision']),
  group('constitucional_amparo', 'amparo_contextual', 'Amparo contextual', 'amparo_directo', 'Amparo directo', ['amparo_directo']),
  group('constitucional_amparo', 'amparo_contextual', 'Amparo contextual', 'amparo_indirecto', 'Amparo indirecto', ['amparo_indirecto']),
  group('escritos_generales', 'tramite_argumentacion', 'Argumentación', 'argumentacion', 'Argumentación', ['agravios', 'alegatos']),
  group('escritos_generales', 'tramite_promocion', 'Promociones y solicitudes', 'promocion', 'Promociones', ['promocion', 'solicitud']),
  group('escritos_generales', 'tramite_recurso', 'Recursos', 'recurso', 'Recursos', [document('recurso_queja', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO', 'SENTENCIA_O_RESOLUCION'] }), document('recurso_reclamacion', { sourceRequired: true, acceptedSourceTypes: ['ACUERDO'] })]),
  group('administrativo', 'administrativo_recurso', 'Recursos administrativos', 'administrativo_recursos', 'Recursos administrativos', ['recurso_administrativo']),
  group('constitucional_amparo', 'amparo_recurso', 'Recursos de amparo', 'amparo_recursos', 'Recursos de amparo', [document('recurso_revision_amparo_directo', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_AMPARO_DIRECTO'], incompatibleMatterIds: ['civil', 'mercantil', 'familiar', 'laboral'] })]),
  group('constitucional_amparo', 'amparo_demanda', 'Demandas de amparo', 'amparo_demandas', 'Demandas de amparo', ['demanda_amparo_indirecto', 'demanda_amparo_directo']),
  group('laboral', 'laboral_litigio', 'Litigio laboral', 'laboral_demanda', 'Demandas laborales', ['contestacion_demanda_laboral']),
  group('civil', 'civil_declarativo', 'Juicios declarativos', 'civil_demandas', 'Demandas civiles', ['contestacion_demanda_civil']),
  group('escritos_generales', 'tramite_cumplimiento', 'Cumplimiento', 'tramite_cumplimiento', 'Cumplimiento', [document('escrito_cumplimiento_sentencia', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'SENTENCIA_AMPARO', 'SENTENCIA_AMPARO_DIRECTO', 'LAUDO', 'ACUERDO'] })]),
  group('constitucional_amparo', 'amparo_post_sentencia', 'Actuaciones post-sentencia', 'amparo_post_sentencia', 'Post-sentencia de amparo', ['contestacion_revision_extraordinaria_amparo_directo']),
  group('escritos_generales', 'tramite_argumentacion', 'Argumentación', 'argumentacion', 'Argumentación', [document('escrito_agravios', { sourceRequired: true, acceptedSourceTypes: ['SENTENCIA_O_RESOLUCION', 'LAUDO', 'ACUERDO'] })]),
  group('escritos_generales', 'tramite_incidente', 'Incidentes procesales', 'incidente_procesal', 'Incidentes procesales', [document('incidente_procesal', { sourceRequired: true, acceptedSourceTypes: ['DEMANDA', 'CONTESTACION_DEMANDA', 'REPLICA', 'DUPLICA', 'SENTENCIA_O_RESOLUCION', 'LAUDO', 'ACUERDO'] })]),
];

const FAMILY_IDENTIFIER_IDS = new Set([
  'reconvencion', 'ampliacion', 'incidente', 'recurso', 'apelacion', 'revocacion', 'queja', 'reclamacion', 'amparo_directo', 'amparo_indirecto', 'agravios', 'alegatos', 'promocion', 'solicitud', 'recurso_revision',
  'amparo_directo_laboral', 'amparo_indirecto_penal', 'amparo_directo_penal', 'amparo_agrario', 'amparo_migratorio', 'amparo_seguridad_social', 'recurso_laboral', 'incidente_laboral', 'incidente_administrativo', 'incidente_sucesorio', 'incidente_agrario',
]);
const OFFICIAL_FORM_IDS = new Set(['solicitud_registro_marca', 'contestacion_impedimento', 'oposicion_marca', 'nulidad_registro', 'caducidad_registro', 'infraccion_propiedad_industrial', 'recurso_propiedad_intelectual', 'solicitud_derechos_arco']);
const ASSISTED_DRAFT_IDS = new Set(['conclusiones_civil', 'oposicion_medida_cautelar', 'solicitud_revision_medida_cautelar', 'acuerdo_reparatorio_propuesta']);

const LEGACY_LABELS: Record<string, string> = {
  demanda: 'Demanda', contestacion_demanda: 'Contestación de demanda', reconvencion: 'Reconvención', ampliacion: 'Ampliación', replica: 'Réplica', duplica: 'Dúplica', incidente: 'Incidente', recurso: 'Recurso', apelacion: 'Apelación', revocacion: 'Revocación', queja: 'Queja', reclamacion: 'Reclamación', amparo_directo: 'Amparo directo', amparo_indirecto: 'Amparo indirecto', agravios: 'Agravios', alegatos: 'Alegatos', promocion: 'Promoción', solicitud: 'Solicitud', escrito_libre: 'Escrito libre', recurso_queja: 'Recurso de Queja', recurso_reclamacion: 'Recurso de Reclamación', recurso_revision: 'Recurso de Revisión', recurso_administrativo: 'Recurso Administrativo', recurso_revision_amparo_directo: 'Recurso de Revisión en Amparo Directo', demanda_amparo_indirecto: 'Demanda de Amparo Indirecto', demanda_amparo_directo: 'Demanda de Amparo Directo', contestacion_demanda_laboral: 'Contestación de Demanda Laboral', contestacion_demanda_civil: 'Contestación de Demanda Civil', contestacion_demanda_mercantil: 'Contestación de Demanda Mercantil', escrito_cumplimiento_sentencia: 'Escrito sobre Cumplimiento de Sentencia', contestacion_revision_extraordinaria_amparo_directo: 'Contestación / Revisión extraordinaria ante sentencia de amparo directo', escrito_agravios: 'Escrito de Agravios', incidente_procesal: 'Incidente Procesal', otro: 'Otro',
};

function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }
function labelFromId(id: string): string { return id.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' '); }
function normalizeCatalogId(value: string): string { return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

const proposedIds = unique(PROPOSED_GROUPS.flatMap((entry) => entry.ids.map((seed) => seed.id)));
export const PROPOSED_DOCUMENT_IDENTIFIER_IDS: readonly string[] = proposedIds;
const allGroups = [...PROPOSED_GROUPS, ...LEGACY_ONLY_GROUPS];
const rowsById = new Map<string, CatalogGroup>();
const sourceCompatibilityById = new Map<string, SourceCompatibilityDeclaration>();
for (const entry of allGroups) for (const seed of entry.ids) {
  if (seed.sourceCompatibility) sourceCompatibilityById.set(seed.id, seed.sourceCompatibility);
  if (!rowsById.has(seed.id)) rowsById.set(seed.id, entry);
}
const templateKeys = new Set(Object.keys(DocumentTemplates));
const implementedIds = new Set([...templateKeys]);

function buildDocumentIdentifier(id: string): CatalogDocumentIdentifier {
  const source = rowsById.get(id);
  if (!source) throw new Error(`Catalog document identifier without hierarchy: ${id}`);
  const template = DocumentTemplates[id];
  const isFamily = FAMILY_IDENTIFIER_IDS.has(id);
  const label = LEGACY_LABELS[id] || labelFromId(id);
  const base: CatalogDocumentBase = {
    id, label, description: template?.objetivoProcesal || `Tipo documental catalogado: ${label}.`, areaId: source.areaId, procedureId: source.procedureId, familyId: source.familyId,
    aliases: id === 'contestacion_demanda_mercantil' ? ['contestación mercantil'] : [], strategyId: template?.tipo || null, templateId: template?.tipo || null,
    implemented: implementedIds.has(id), sourceCompatibility: sourceCompatibilityById.get(id) || null, requiredFields: template?.camposObligatorios || [], requiredSections: template?.estructura || [],
    outputFilename: template ? `${label} - {date}.docx` : null, jurisdiction: template?.jurisdiccion || 'según autoridad competente', legalStage: template?.procedimiento || source.procedureLabel,
    partyRole: template?.rolAutor || 'por definir', uiVisibility: 'VISIBLE', status: implementedIds.has(id) ? 'IMPLEMENTED' : OFFICIAL_FORM_IDS.has(id) ? 'REQUIRES_OFFICIAL_FORM' : ASSISTED_DRAFT_IDS.has(id) ? 'ASSISTED_DRAFT' : 'CATALOG_ONLY',
  };
  if (isFamily) return { ...base, kind: 'FAMILY', implemented: false, strategyId: null, templateId: null, sourceCompatibility: null, status: 'NOT_APPLICABLE', uiVisibility: 'VISIBLE' };
  if (base.status !== 'IMPLEMENTED') return { ...base, kind: 'DOCUMENT_TYPE', implemented: false, strategyId: null, templateId: null, sourceCompatibility: null };
  if (!base.sourceCompatibility) throw new Error(`Implemented catalog document without source compatibility: ${id}`);
  return { ...base, kind: 'DOCUMENT_TYPE' };
}

const aliasIdentifiers: readonly LegacyAlias[] = [
  { kind: 'LEGACY_ALIAS', id: 'demanda-ordinaria-civil', label: 'Demanda Ordinaria Civil (alias)', targetId: 'demanda_ordinaria_civil', reason: 'Alias histórico de entrada; nunca es un output documental separado.', uiVisibility: 'LEGACY_ONLY', status: 'NOT_APPLICABLE' },
  { kind: 'LEGACY_ALIAS', id: 'otro', label: 'Otro', targetId: 'escrito_libre', reason: 'Sentinel UI legacy; solo activa el fallback seguro cuando no existe selectedDocumentType explícito.', uiVisibility: 'LEGACY_ONLY', status: 'NOT_APPLICABLE' },
];
const aliasIds = new Set(aliasIdentifiers.map((alias) => alias.id));
const documentIdentifiers: readonly CatalogDocumentIdentifier[] = [...rowsById.keys()].filter((id) => !aliasIds.has(id)).map(buildDocumentIdentifier).concat(aliasIdentifiers);
const canonicalDocuments = documentIdentifiers.filter((entry): entry is CanonicalDocumentType => entry.kind === 'DOCUMENT_TYPE');
const familyIdentifiers = documentIdentifiers.filter((entry): entry is CatalogFamilyIdentifier => entry.kind === 'FAMILY');

const procedureMap = new Map<string, LegalProcedure>();
const familyMap = new Map<string, DocumentFamily>();
for (const entry of allGroups) {
  if (!procedureMap.has(entry.procedureId)) procedureMap.set(entry.procedureId, { id: entry.procedureId, areaId: entry.areaId, label: entry.procedureLabel, description: `Procedimiento de ${entry.procedureLabel.toLowerCase()}.`, aliases: [], uiVisibility: 'VISIBLE' });
  if (!familyMap.has(entry.familyId)) familyMap.set(entry.familyId, { id: entry.familyId, areaId: entry.areaId, procedureId: entry.procedureId, label: entry.familyLabel, description: `Familia documental de ${entry.familyLabel.toLowerCase()}.`, uiVisibility: 'VISIBLE', status: 'NOT_APPLICABLE' });
}
export const LEGAL_PROCEDURES: readonly LegalProcedure[] = [...procedureMap.values()];
export const DOCUMENT_FAMILIES: readonly DocumentFamily[] = [...familyMap.values()];
export const CANONICAL_DOCUMENT_TYPES: readonly CanonicalDocumentType[] = canonicalDocuments;
export const LEGACY_ALIASES: readonly LegacyAlias[] = aliasIdentifiers;
export const LEGAL_CATALOG_REGISTRY: LegalCatalogRegistry = Object.freeze({ areas: LEGAL_AREAS, procedures: LEGAL_PROCEDURES, families: DOCUMENT_FAMILIES, documents: CANONICAL_DOCUMENT_TYPES, aliases: LEGACY_ALIASES, documentIdentifiers });

const identifierById = new Map<string, CatalogDocumentIdentifier>();
for (const entry of documentIdentifiers) {
  // Un alias con guion puede normalizarse al mismo token que su destino. El
  // índice normalizado debe conservar el documento canónico; el alias se
  // resuelve por su forma cruda en getCatalogDocument.
  if (entry.kind === 'LEGACY_ALIAS' && normalizeCatalogId(entry.id) === normalizeCatalogId(entry.targetId)) continue;
  identifierById.set(normalizeCatalogId(entry.id), entry);
}
const rawIdentifierById = new Map(documentIdentifiers.map((entry) => [entry.id.trim().toLowerCase(), entry]));
const identifierByIdWithAliases = new Map(identifierById);
identifierByIdWithAliases.set('señalamiento_correo', identifierById.get('senalamiento_correo')!);
for (const entry of documentIdentifiers) {
  if (entry.kind === 'DOCUMENT_TYPE') {
    for (const alias of entry.aliases) identifierByIdWithAliases.set(normalizeCatalogId(alias), entry);
  }
}

export function getCatalogDocument(idOrAlias: string): CatalogDocumentIdentifier | undefined {
  const raw = String(idOrAlias || '').trim().toLowerCase();
  const exact = rawIdentifierById.get(raw);
  if (exact?.kind === 'LEGACY_ALIAS') return exact;
  return identifierByIdWithAliases.get(normalizeCatalogId(raw));
}
export function getCatalogChildren(areaId?: string, procedureId?: string, familyId?: string): readonly CatalogDocumentIdentifier[] {
  return documentIdentifiers.filter((entry) => entry.kind !== 'LEGACY_ALIAS' && (!areaId || entry.areaId === areaId) && (!procedureId || entry.procedureId === procedureId) && (!familyId || entry.familyId === familyId));
}
export function searchCatalog(query: string): CatalogSearchResult[] {
  const normalizedQuery = normalizeCatalogId(query).replace(/_/g, ' ');
  if (!normalizedQuery) return [];
  const searchableEntries = [
    ...documentIdentifiers.map((entry) => {
      const aliasTarget = entry.kind === 'LEGACY_ALIAS' && entry.id !== 'otro'
        ? identifierById.get(normalizeCatalogId(entry.targetId))
        : undefined;
      const target = aliasTarget && aliasTarget.kind !== 'LEGACY_ALIAS' ? aliasTarget : undefined;
      return {
        id: entry.kind === 'LEGACY_ALIAS' ? entry.targetId : entry.id,
        label: entry.label,
        description: entry.kind === 'LEGACY_ALIAS' ? entry.reason : entry.description,
        kind: entry.kind,
        status: target?.status || entry.status,
        fields: entry.kind === 'LEGACY_ALIAS' ? [entry.id, entry.label, entry.targetId, entry.reason] : [entry.id, entry.label, entry.description, ...entry.aliases],
        areaId: target?.areaId || (entry.kind === 'LEGACY_ALIAS' ? undefined : entry.areaId),
        procedureId: target?.procedureId || (entry.kind === 'LEGACY_ALIAS' ? undefined : entry.procedureId),
        familyId: target?.familyId || (entry.kind === 'LEGACY_ALIAS' ? undefined : entry.familyId),
        targetId: entry.kind === 'LEGACY_ALIAS' ? entry.targetId : undefined,
      };
    }),
    ...DOCUMENT_FAMILIES.map((family) => ({ id: family.id, label: family.label, description: family.description, kind: 'FAMILY' as const, status: family.status, fields: [family.id, family.label, family.description], areaId: family.areaId, procedureId: family.procedureId, familyId: family.id, targetId: undefined })),
    ...LEGAL_PROCEDURES.map((procedure) => ({ id: procedure.id, label: procedure.label, description: procedure.description, kind: 'PROCEDURE' as const, status: 'NOT_APPLICABLE' as const, fields: [procedure.id, procedure.label, procedure.description], areaId: procedure.areaId, procedureId: procedure.id, familyId: undefined, targetId: undefined })),
    ...LEGAL_AREAS.map((area) => ({ id: area.id, label: area.label, description: area.description, kind: 'AREA' as const, status: 'NOT_APPLICABLE' as const, fields: [area.id, area.label, area.description, ...area.aliases], areaId: area.id, procedureId: undefined, familyId: undefined, targetId: undefined })),
  ];
  const results = searchableEntries.filter((entry) => {
    const haystack = entry.fields.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ' ');
    const normalizedHaystack = normalizeCatalogId(haystack).replace(/_/g, ' ');
    return normalizedQuery.split(' ').filter(Boolean).every((token) => normalizedHaystack.includes(token));
  });
  const seen = new Set<string>();
  return results.flatMap((entry) => {
    if (seen.has(entry.id)) return [];
    seen.add(entry.id);
    return [{ id: entry.id, label: entry.label, description: entry.description, kind: entry.kind, status: entry.status, areaId: entry.areaId, procedureId: entry.procedureId, familyId: entry.familyId, targetId: entry.targetId }];
  });
}
export function getCatalogStats(): LegalCatalogStats {
  const covered = new Set(documentIdentifiers.map((entry) => entry.id));
  const overlap = proposedIds.filter((id) => LEGACY_DOCUMENT_IDENTIFIER_IDS.includes(id as typeof LEGACY_DOCUMENT_IDENTIFIER_IDS[number])).length;
  return { areaCount: LEGAL_AREAS.length, procedureCount: LEGAL_PROCEDURES.length, familyCount: DOCUMENT_FAMILIES.length, documentTypeCount: CANONICAL_DOCUMENT_TYPES.length, aliasCount: LEGACY_ALIASES.length, familyIdentifierCount: familyIdentifiers.length, coveredDocumentIdentifierCount: covered.size, legacyDocumentIdentifierCount: LEGACY_DOCUMENT_IDENTIFIER_IDS.length, proposedDocumentIdentifierCount: proposedIds.length, overlapCount: overlap };
}
export function getCatalogInventory(): readonly CatalogDocumentIdentifier[] { return documentIdentifiers; }
export interface LegacyDocumentTypeProjection { value: string; label: string; category?: string; description?: string; }
const LEGACY_DOCUMENT_CATEGORIES: Record<string, string> = {
  demanda: 'inicial', contestacion_demanda: 'contestacion', reconvencion: 'contestacion', ampliacion: 'inicial', replica: 'contestacion', duplica: 'contestacion',
  incidente: 'incidental', recurso: 'recurso', apelacion: 'recurso', revocacion: 'recurso', queja: 'recurso', reclamacion: 'recurso',
  amparo_directo: 'amparo', amparo_indirecto: 'amparo', agravios: 'recurso', alegatos: 'argumentacion', promocion: 'promocion', solicitud: 'promocion', escrito_libre: 'promocion',
  recurso_queja: 'recurso', recurso_reclamacion: 'recurso', recurso_revision: 'recurso', recurso_administrativo: 'recurso', recurso_revision_amparo_directo: 'recurso',
  demanda_amparo_indirecto: 'amparo', demanda_amparo_directo: 'amparo', contestacion_demanda_laboral: 'contestacion', contestacion_demanda_civil: 'contestacion',
  escrito_cumplimiento_sentencia: 'promocion', contestacion_revision_extraordinaria_amparo_directo: 'contestacion', escrito_agravios: 'recurso', incidente_procesal: 'incidental', otro: 'otro',
};
export function getLegacyDocumentTypes(): LegacyDocumentTypeProjection[] {
  return LEGACY_DOCUMENT_IDENTIFIER_IDS.map((id) => { const entry = getCatalogDocument(id); return { value: id, label: LEGACY_LABELS[id] || entry?.label || labelFromId(id), category: entry?.kind === 'FAMILY' ? 'familia' : LEGACY_DOCUMENT_CATEGORIES[id] || 'documento', description: entry?.kind === 'LEGACY_ALIAS' ? entry.reason : entry?.description }; });
}
const LEGACY_MATTER_LABELS: Record<string, string> = {
  amparo: 'Amparo', constitucional: 'Constitucional', civil: 'Civil', familiar: 'Familiar', mercantil: 'Mercantil', laboral: 'Laboral', penal: 'Penal', administrativo: 'Administrativo', fiscal: 'Fiscal', agrario: 'Agrario', electoral: 'Electoral', seguridad_social: 'Seguridad Social', propiedad_intelectual: 'Propiedad Intelectual', corporativo: 'Corporativo', ambiental: 'Ambiental', energia: 'Energía', salud: 'Salud', financiero: 'Financiero', aduanero: 'Aduanero', migratorio: 'Migratorio', inmobiliario: 'Inmobiliario', contratacion_publica: 'Contratación Pública', responsabilidad_patrimonial: 'Responsabilidad Patrimonial', transparencia: 'Transparencia y Datos Personales', notarial: 'Notarial', derechos_humanos: 'Derechos Humanos', procesal: 'Procesal General', otro: 'Otro',
};
export function getLegacyMatters(): Array<{ value: string; label: string; description?: string; canonicalValue?: string }> {
  const canonical = LEGAL_AREAS.map((area) => ({ value: area.id, label: LEGACY_MATTER_LABELS[area.id] || area.label, description: area.description }));
  const aliases = LEGAL_AREAS.flatMap((area) => area.aliases.map((alias) => ({ value: alias, label: LEGACY_MATTER_LABELS[alias] || area.label, description: area.description, canonicalValue: area.id })));
  const projected: Array<{ value: string; label: string; description?: string; canonicalValue?: string }> = [...canonical];
  const seen = new Set(projected.map((matter) => matter.value));
  for (const alias of aliases) {
    if (seen.has(alias.value)) continue;
    projected.push(alias);
    seen.add(alias.value);
  }
  if (!seen.has('otro')) projected.push({ value: 'otro', label: 'Otro', description: 'Materia no listada (requiere especificar)', canonicalValue: 'escritos_generales' });
  return projected;
}
export function getLegacyProcedures(): Array<{ value: string; label: string; description?: string }> {
  return [
    { value: 'ordinario', label: 'Ordinario' }, { value: 'ejecutivo', label: 'Ejecutivo' }, { value: 'oral', label: 'Oral' }, { value: 'sumario', label: 'Sumario' },
    { value: 'especial', label: 'Especial' }, { value: 'incidental', label: 'Incidental' }, { value: 'ejecucion', label: 'Ejecución' }, { value: 'otro', label: 'Otro' },
  ];
}
export const CATALOG_DOCUMENT_IDENTIFIER_COUNT = getCatalogStats().coveredDocumentIdentifierCount;

// El catálogo legado de la biblioteca se deriva del mismo registry; no mantiene datos documentales propios.
export interface LegalSubcategory { id: string; name: string; description?: string; }
export interface LegalMatter { id: string; name: string; icon?: string; subcategories: LegalSubcategory[]; }
export interface LegalDocumentType { id: string; matterId: string; subcategoryId?: string; name: string; description: string; }
export const LEGAL_MATTERS_CATALOG: LegalMatter[] = LEGAL_AREAS.map((area) => ({ id: area.id, name: area.label, subcategories: LEGAL_PROCEDURES.filter((procedure) => procedure.areaId === area.id).map((procedure) => ({ id: procedure.id, name: procedure.label, description: procedure.description })) }));
export function getLegalMatterById(id: string): LegalMatter { return LEGAL_MATTERS_CATALOG.find((matter) => matter.id === id) || LEGAL_MATTERS_CATALOG[LEGAL_MATTERS_CATALOG.length - 1]; }
export function getAllLegalSubcategories(): Array<{ matterId: string; subcategory: LegalSubcategory }> { return LEGAL_MATTERS_CATALOG.flatMap((matter) => matter.subcategories.map((subcategory) => ({ matterId: matter.id, subcategory }))); }
