import type { DocumentNode, UniversalLegalDocument, ValidationResult } from './types';
import { DocumentTemplates, isContestacionRevisionAmparoDirectoType } from './documentTemplates';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { sanitizeLegalDocument, type SanitizeReport } from './legalDocumentSanitizer';
import { validateDocument } from './validator';
import { readDocumentExportReadiness, readDocumentLifecycle } from './documentLifecycle';
import type { QualityGateResult } from './qualityGate';
import { CIVIL_DEMAND_REQUIRED_SECTION_IDS, COMMERCIAL_ENFORCEMENT_REQUIRED_SECTION_IDS } from './documentStrategies';
import { isCivilMercantileResponseDocumentType } from './responseContext';
import { isCivilMercantileEvidenceArgumentDocumentType } from './evidenceArgumentContext';
import { hasSeedMarkers, hasUnresolvedFactualDependencies } from './seedMarkers';
import { DRAFT_EXPORT_NOTICE, resolveExportMode, type ExportMode } from './exportModes';

/**
 * exportGuards.ts
 *
 * Validación PRE-EXPORTACIÓN del documento jurídico final.
 *
 * ERRORES (bloquean la exportación con 422 controlado):
 *  - Markdown crudo real (**texto**, *texto*, ### título)
 *  - Etiquetas internas del pipeline impresas
 *  - Placeholders técnicos ({{ }}, undefined, null, [object Object])
 *  - Títulos consecutivos duplicados
 *  - Bloques SOURCE del expediente dentro de una CONTESTACIÓN
 *
 * ADVERTENCIAS (calidad jurídica; se reportan, no bloquean):
 *  - Consistencia de roles procesales en contestaciones
 *  - Cobertura de pretensiones / pruebas / petitorios
 */

const INTERNAL_LABELS: RegExp[] = [
  /^\s*OBJETIVO DEL BLOQUE\s*:/gim,
  /^\s*TIPO DE BLOQUE\s*:/gim,
  /^\s*CONTEXTO ANTERIOR\s*:/gim,
  /^\s*CONTEXTO POSTERIOR\s*:/gim,
  /^\s*HECHOS RELEVANTES PARA ESTE BLOQUE\s*:/gim,
  /^\s*CONTENIDO ORIGINAL DEL BLOQUE/gim,
  /^\s*TEXTO ORIGINAL DEL BLOQUE\s*:/gim,
  /^\s*FRAGMENTOS DEL EXPEDIENTE RECUPERADOS/gim,
  /^\s*TEORÍA DEL CASO\s*:/gim,
  /^\s*APORTACIONES DEL ABOGADO\s*:/gim,
  /^\s*INSTRUCCIONES DE DEFENSA DEL ABOGADO\s*:/gim,
  /^\s*BASE DEL ANÁLISIS JURÍDICO/gim,
  /^\s*REGLAS OBLIGATORIAS\s*:/gim,
  /^\s*INSTRUCCIÓN ADICIONAL\s*:/gim,
];

function normalizeSectionId(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const SPECIALIZED_SECTION_IDS: Record<string, string> = {
  objeto_del_ofrecimiento: 'objeto_del_ofrecimiento',
  pruebas_ofrecidas: 'pruebas_ofrecidas',
  hechos_que_se_pretenden_acreditar: 'hechos_que_se_pretenden_acreditar',
  objeto_de_la_objecion: 'objeto_de_la_objecion',
  pruebas_objetadas: 'pruebas_objetadas',
  motivos_de_objecion: 'motivos_de_objecion',
  objeto_de_la_vista: 'objeto_de_la_vista',
  manifestaciones_sobre_pruebas: 'manifestaciones_sobre_pruebas',
  hechos_relacionados: 'hechos_relacionados',
  antecedentes_y_hechos_probados: 'antecedentes_y_hechos_probados',
  valoracion_de_pruebas: 'valoracion_de_pruebas',
  // Especialidades procesales familiares
  hechos_supervenientes: 'hechos_supervenientes',
  modificacion_solicitada: 'modificacion_solicitada',
  situacion_menores: 'situacion_menores',
  situacion_de_los_menores: 'situacion_menores',
  necesidades_y_capacidad: 'necesidades_y_capacidad',
  necesidades_y_capacidad_economica: 'necesidades_y_capacidad',
  acuerdos: 'acuerdos',
  acuerdos_patrimoniales: 'acuerdos',
  regimen_alimentos: 'regimen_alimentos',
  regimen_de_alimentos: 'regimen_alimentos',
  regimen_convivencia: 'regimen_convivencia',
  regimen_de_convivencia: 'regimen_convivencia',
  incumplimiento: 'incumplimiento',
  incumplimiento_acreditado: 'incumplimiento',
  // Especialidades procesales laborales
  condiciones_generales_de_trabajo: 'condiciones_trabajo',
  condiciones_de_trabajo: 'condiciones_trabajo',
  objecion_de_pruebas_de_la_contraparte: 'objecion_pruebas',
  motivos_de_inadmisibilidad_y_falta_de_alcance_probatorio: 'motivos_objecion',
  acuerdo_o_requerimiento_notificado: 'acuerdo_notificado',
  desahogo_puntual_de_la_prevencion: 'desahogo_prevencion',
  aclaraciones_y_complementaciones: 'aclaraciones',
  valoracion_de_las_pruebas_desahogadas: 'valoracion_pruebas',
  resolucion_o_laudo_de_referencia: 'resolucion_referencia',
  manifestacion_de_cumplimiento: 'manifestacion_cumplimiento',
  constancias_y_liquidacion: 'liquidacion',
  laudo_o_sentencia_definitiva_firme: 'resolucion_firme',
  incumplimiento_de_la_condena: 'incumplimiento',
  solicitud_de_requerimiento_de_pago_y_embargo: 'requerimiento_pago',
  quejoso_y_personalidad: 'quejoso_personalidad',
  tercero_interesado: 'tercero_interesado',
  autoridad_responsable: 'autoridad_responsable',
  laudo_o_sentencia_definitiva_reclamada: 'acto_reclamado',
  fecha_de_notificacion: 'fecha_notificacion',
  preceptos_constitucionales_violados: 'preceptos_violados',
  conceptos_de_violacion: 'conceptos_violacion',
  suspension_del_acto_reclamado: 'suspension',
  // Especialidades procesales administrativo y fiscal
  resolucion_administrativa_impugnada: 'resolucion_impugnada',
  resolucion_fiscal_o_credito_impugnado: 'resolucion_impugnada',
  autoridad_demandada: 'autoridad_demandada',
  autoridad_fiscal_demandada: 'autoridad_demandada',
  conceptos_de_impugnacion: 'conceptos_impugnacion',
  conceptos_de_impugnacion_fiscal: 'conceptos_impugnacion',
  contestacion_a_los_hechos: 'contestacion_hechos',
  contestacion_a_los_nuevos_hechos: 'contestacion_hechos',
  contestacion_a_los_nuevos_hechos_fiscales: 'contestacion_hechos',
  refutacion_a_conceptos_de_impugnacion: 'refutacion_conceptos',
  refutacion_a_conceptos_de_impugnacion_fiscal: 'refutacion_conceptos',
  defensas_y_refutacion_de_la_ampliacion: 'refutacion_conceptos',
  pruebas_de_la_autoridad: 'pruebas',
  pruebas_de_la_autoridad_fiscal: 'pruebas',
  oportunidad_y_procedencia_de_la_ampliacion: 'oportunidad_procesal',
  oportunidad_y_procedencia_de_la_ampliacion_fiscal: 'oportunidad_procesal',
  nuevos_hechos_o_actos_conocidos: 'nuevos_hechos',
  nuevos_hechos_o_documentos_conocidos: 'nuevos_hechos',
  ampliacion_de_conceptos_de_impugnacion: 'ampliacion_conceptos',
  ampliacion_de_conceptos_de_impugnacion_fiscal: 'ampliacion_conceptos',
  pruebas_adicionales: 'pruebas',
  analisis_de_la_litis_y_pruebas_desahogadas: 'valoracion_pruebas',
  analisis_de_la_litis_y_valoracion_de_pruebas_fiscales: 'valoracion_pruebas',
  alegatos_de_bien_probado: 'alegatos_cierre',
  alegatos_de_bien_probado_fiscales: 'alegatos_cierre',
  sentencia_definitiva_o_resolucion_a_cumplimentar: 'resolucion_firme',
  sentencia_fiscal_definitiva_a_cumplimentar: 'resolucion_firme',
  actos_de_cumplimiento_efectuados: 'manifestacion_cumplimiento',
  actos_de_cumplimiento_y_liquidacion: 'manifestacion_cumplimiento',
  constancias_exhibidas: 'constancias_exhibidas',
  agravios_o_motivos_de_inconformidad: 'motivos_inconformidad',
  resolucion_o_sentencia_recurrida: 'resolucion_recurrida',
  resolucion_o_credito_fiscal_recurrido: 'resolucion_impugnada',
  sentencia_recurrida_y_procedencia: 'resolucion_recurrida',
  oportunidad_y_procedencia: 'oportunidad_procesal',
  agravios_en_revision: 'agravios_revision',
  agravios_fiscales: 'agravios_fiscales',
  agravios_de_revision_fiscal: 'agravios_revision',
  acto_administrativo_cuya_suspension_se_solicita: 'acto_impugnado_suspension',
  credito_o_acto_fiscal_cuya_suspension_se_solicita: 'acto_impugnado_suspension',
  procedencia_y_apariencia_del_buen_derecho: 'procedencia_suspension',
  procedencia_y_garantia_del_interes_fiscal: 'garantia_interes_fiscal',
  ofrecimiento_de_garantia: 'garantia_ofrecida',
  medida_cautelar_solicitada: 'medida_cautelar',
  materia_del_incidente_y_procedencia: 'materia_incidental',
  hechos_y_motivos_del_incidente: 'hechos',
  pruebas_del_incidente: 'pruebas',
  planteamiento_o_peticion_concreta: 'solicitud_fiscal',
  antecedentes_y_fundamento_legal: 'antecedentes',
  pruebas_o_documentos_anexos: 'pruebas',
  // Especialidades procesales penal (CNPP y LNEP)
  narracion_circunstanciada_de_los_hechos_delictivos: 'hechos',
  relacion_de_hechos_querellados: 'hechos',
  nuevos_hechos_y_circunstancias_supervenientes: 'hechos',
  ampliacion_circunstanciada_de_hechos_querellados: 'hechos',
  imputacion_e_individualizacion_de_personas_senaladas: 'individualizacion_imputados',
  senalamiento_de_personas_imputadas: 'individualizacion_imputados',
  individualizacion_de_imputados: 'individualizacion_imputados',
  individualizacion_imputados: 'individualizacion_imputados',
  datos_de_prueba_aportados: 'pruebas',
  datos_y_medios_de_prueba_iniciales: 'pruebas',
  nuevos_datos_de_prueba_y_diligencias_solicitadas: 'pruebas',
  aportacion_de_nuevos_datos_de_prueba: 'pruebas',
  peticiones_concretas_e_inicio_de_carpeta: 'petitorios',
  solicitud_expresa_de_ejercicio_de_accion_penal_y_peticiones: 'petitorios',
  solicitud_ministerial_y_peticiones_concretas: 'petitorios',
  ratificacion_de_querella_y_peticiones_ministeriales: 'petitorios',
  planteamiento_y_derechos_de_la_victima_representada: 'derechos_victima',
  derechos_de_la_victima: 'derechos_victima',
  derechos_victima: 'derechos_victima',
  proposiciones_facticas_y_diligencias_requeridas: 'argumentos',
  peticiones_de_intervencion_y_proteccion: 'petitorios',
  planteamiento_defensivo_y_teoria_del_caso: 'teoria_caso_defensiva',
  teoria_del_caso_defensiva: 'teoria_caso_defensiva',
  teoria_caso_defensiva: 'teoria_caso_defensiva',
  actos_y_diligencias_de_descargo_propuestas: 'pruebas',
  petitorios_de_reconocimiento_y_garantias_procesales: 'petitorios',
  justificacion_procesal_y_pertinencia_de_los_actos: 'pertinencia_actos_investigacion',
  pertinencia_de_actos_de_investigacion: 'pertinencia_actos_investigacion',
  pertinencia_actos_investigacion: 'pertinencia_actos_investigacion',
  especificacion_detallada_de_los_actos_de_investigacion_solicitados: 'actos_investigacion_solicitados',
  actos_de_investigacion_solicitados: 'actos_investigacion_solicitados',
  actos_investigacion_solicitados: 'actos_investigacion_solicitados',
  petitorios_ministeriales_de_desahogo_inmediato: 'petitorios',
  fundamento_legal_y_derecho_de_acceso_a_los_registros: 'fundamento_acceso_carpeta',
  derecho_de_acceso_a_carpeta: 'fundamento_acceso_carpeta',
  fundamento_acceso_carpeta: 'fundamento_acceso_carpeta',
  senalamiento_de_profesionistas_autorizados: 'autorizados_acceso',
  profesionistas_autorizados: 'autorizados_acceso',
  autorizados_acceso: 'autorizados_acceso',
  petitorios_de_acceso_y_consulta_inmediata: 'petitorios',
  registro_y_constancias_especificas_requeridas: 'constancias_solicitadas',
  constancias_de_carpeta_solicitadas: 'constancias_solicitadas',
  constancias_solicitadas: 'constancias_solicitadas',
  justificacion_y_fundamento_juridico: 'fundamento_copias',
  fundamento_de_copias: 'fundamento_copias',
  fundamento_copias: 'fundamento_copias',
  petitorios_de_expedicion_y_autorizados_para_recibir: 'petitorios',
  situacion_de_riesgo_y_justificacion_de_urgencia: 'situacion_riesgo',
  situacion_de_riesgo_procesal: 'situacion_riesgo',
  situacion_riesgo: 'situacion_riesgo',
  medidas_de_proteccion_especificas_solicitadas: 'medidas_proteccion_solicitadas',
  medidas_proteccion_solicitadas: 'medidas_proteccion_solicitadas',
  petitorios_de_aplicacion_y_notificacion_policial_inmediata: 'petitorios',
  manifestaciones_y_adhesion_factica_a_la_acusacion: 'manifestaciones_coadyuvancia',
  manifestaciones_coadyuvancia: 'manifestaciones_coadyuvancia',
  aportacion_de_medios_de_prueba_y_reparacion_del_dano: 'pruebas',
  petitorios_concretos_de_coadyuvancia: 'petitorios',
  oportunidad_procesal_y_procedencia_de_la_apelacion: 'oportunidad_procesal',
  expresion_de_agravios_penales_y_preceptos_vulnerados: 'agravios_penales',
  agravios_penales_expresados: 'agravios_penales',
  agravios_penales: 'agravios_penales',
  peticiones_de_revocacion_o_modificacion: 'petitorios',
  oportunidad_procesal_y_procedencia_de_la_revocacion: 'oportunidad_procesal',
  motivos_de_disconformidad_y_agravio_procesal: 'motivos_inconformidad',
  petitorios_de_revocacion_inmediata: 'petitorios',
  planteamiento_juridico_y_estado_de_cumplimiento_de_pena: 'planteamiento_ejecucion',
  planteamiento_de_ejecucion_penal: 'planteamiento_ejecucion',
  planteamiento_ejecucion: 'planteamiento_ejecucion',
  justificacion_de_derechos_o_beneficio_penitenciario: 'justificacion_beneficio',
  beneficio_penitenciario_solicitado: 'justificacion_beneficio',
  justificacion_beneficio: 'justificacion_beneficio',
  petitorios_concretos_ante_el_juez_de_ejecucion: 'petitorios',
  // Especialidades procesales agrarias (Ley Agraria)
  proemio_y_designacion_del_tribunal_unitario_agrario: 'proemio',
  prestaciones_agrarias_reclamadas: 'prestaciones_agrarias',
  prestaciones_agrarias: 'prestaciones_agrarias',
  hechos_circunstanciados_de_la_accion_agraria: 'hechos',
  fundamentos_de_derecho_agrario: 'derecho',
  medios_de_prueba_ofrecidos: 'pruebas',
  cierre_y_firma_del_actor_agrario: 'firma',
  proemio_y_acreditacion_de_personalidad_agraria: 'proemio',
  contestacion_a_las_prestaciones_reclamadas: 'contestacion_prestaciones',
  contestacion_prestaciones: 'contestacion_prestaciones',
  respuesta_puntual_a_los_hechos_de_la_demanda_agraria: 'contestacion_hechos',
  contestacion_hechos: 'contestacion_hechos',
  excepciones_y_defensas_agrarias: 'excepciones_defensas',
  excepciones_defensas: 'excepciones_defensas',
  pruebas_del_demandado: 'pruebas',
  cierre_y_firma_del_demandado: 'firma',
  proemio_y_demanda_reconvencional_agraria: 'proemio',
  prestaciones_reconvencionales_reclamadas: 'prestaciones_reconvencionales',
  prestaciones_reconvencionales: 'prestaciones_reconvencionales',
  hechos_de_la_reconvencion_agraria: 'hechos',
  fundamentos_de_derecho_de_la_reconvencion: 'derecho',
  pruebas_de_la_reconvencion: 'pruebas',
  cierre_y_firma_del_reconveniente: 'firma',
  proemio_y_expediente_agrario: 'proemio',
  resumen_de_la_controversia_y_fijacion_de_la_litis: 'resumen_litis',
  resumen_litis: 'resumen_litis',
  valoracion_de_pruebas_desahogadas_en_audiencia_agraria: 'valoracion_pruebas',
  conclusiones_y_solicitud_de_sentencia_favorable: 'conclusiones',
  conclusiones: 'conclusiones',
  proemio_e_identificacion_de_la_sentencia_agraria: 'proemio',
  antecedentes_y_firmeza_de_la_sentencia_agraria: 'antecedentes_sentencia',
  antecedentes_sentencia: 'antecedentes_sentencia',
  actos_de_ejecucion_y_requerimientos_solicitados: 'solicitud_ejecucion',
  solicitud_ejecucion: 'solicitud_ejecucion',
  medidas_de_apremio_y_auxilio_de_la_fuerza_publica: 'medidas_apremio',
  medidas_apremio: 'medidas_apremio',
  proemio_y_designacion_del_tribunal_superior_agrario: 'proemio',
  oportunidad_procesal_y_procedencia_del_recurso_agrario: 'oportunidad_procesal',
  expresion_de_agravios_agrarios: 'agravios_agrarios',
  agravios_agrarios: 'agravios_agrarios',
  pruebas_ofrecidas_en_el_recurso: 'pruebas',
  cierre_y_firma_del_recurrente: 'firma',
  // Especialidades inmobiliarias y contractuales de arrendamiento
  proemio_y_comparecencia_de_las_partes: 'proemio',
  declaraciones_sobre_el_inmueble_y_capacidad: 'declaraciones',
  declaraciones: 'declaraciones',
  clausulas_de_la_promesa_de_compraventa: 'clausulas',
  clausulas: 'clausulas',
  penas_convencionales_y_jurisdiccion: 'cierre',
  cierre_y_firmas: 'firmas',
  firmas: 'firmas',
  proemio_del_contrato_de_compraventa: 'proemio',
  declaraciones_de_propiedad_y_antecedentes_registrales: 'declaraciones',
  clausulas_traslativas_de_dominio_y_precio: 'clausulas',
  eviccion_gastos_y_jurisdiccion: 'cierre',
  cierre_y_firmas_de_conformidad: 'firmas',
  proemio_del_contrato_de_arrendamiento: 'proemio',
  declaraciones_de_las_partes_y_destino_del_inmueble: 'declaraciones',
  clausulas_de_arrendamiento_renta_y_vigencia: 'clausulas',
  garantias_rescision_y_jurisdiccion: 'cierre',
  cierre_y_firmas_de_las_partes_y_fiador: 'firmas',
  proemio_del_convenio_de_terminacion_de_arrendamiento: 'proemio',
  declaraciones_del_contrato_base_de_arrendamiento: 'declaraciones',
  clausulas_de_terminacion_y_desocupacion: 'clausulas_terminacion',
  clausulas_terminacion: 'clausulas_terminacion',
  finiquito_mutuo_servicios_y_deposito: 'finiquito_entrega',
  finiquito_entrega: 'finiquito_entrega',
  destinatario_y_rubro_de_requerimiento: 'destinatario_rubro',
  destinatario_rubro: 'destinatario_rubro',
  antecedentes_del_contrato_de_arrendamiento: 'antecedentes_arrendamiento',
  antecedentes_arrendamiento: 'antecedentes_arrendamiento',
  liquidacion_circunstanciada_de_rentas_adeudadas: 'liquidacion_adeudos',
  liquidacion_adeudos: 'liquidacion_adeudos',
  apercibimiento_de_rescision_y_accion_judicial: 'apercibimiento_legal',
  apercibimiento_legal: 'apercibimiento_legal',
  plazo_de_pago_y_lugar_de_cumplimiento: 'plazo_pago',
  plazo_pago: 'plazo_pago',
  cierre_y_firma_del_arrendador: 'cierre_firma',
  cierre_firma: 'cierre_firma',
  destinatario_y_datos_del_inmueble: 'destinatario_rubro',
  antecedentes_del_arrendamiento_y_vencimiento: 'antecedentes_contrato',
  antecedentes_contrato: 'antecedentes_contrato',
  notificacion_de_no_renovacion_de_contrato: 'notificacion_no_renovacion',
  notificacion_no_renovacion: 'notificacion_no_renovacion',
  plazo_y_condiciones_de_entrega_de_llaves_y_posesion: 'plazo_entrega_inmueble',
  plazo_entrega_inmueble: 'plazo_entrega_inmueble',
  cierre_y_firma_de_la_parte_arrendadora: 'cierre_firma',
  proemio_del_convenio_transaccional_de_desocupacion: 'proemio',
  declaraciones_sobre_la_ocupacion_del_inmueble: 'declaraciones',
  clausulas_de_entrega_fisica_y_desocupacion_voluntaria: 'clausulas_transaccionales',
  clausulas_transaccionales: 'clausulas_transaccionales',
  pena_por_mora_y_ratificacion_judicial: 'pena_mora_desocupacion',
  pena_mora_desocupacion: 'pena_mora_desocupacion',
  proemio_del_reconocimiento_de_adeudo: 'proemio',
  declaraciones_del_arrendamiento_y_saldo_pendiente: 'declaraciones',
  clausula_de_reconocimiento_expreso_del_adeudo: 'reconocimiento_deuda',
  reconocimiento_deuda: 'reconocimiento_deuda',
  calendario_y_forma_de_pago_en_parcialidades: 'calendario_pagos',
  calendario_pagos: 'calendario_pagos',
  penas_por_incumplimiento_y_ejecucion_inmediata: 'consecuencias_incumplimiento',
  consecuencias_incumplimiento: 'consecuencias_incumplimiento',
  cierre_y_firmas_de_los_otorgantes: 'firmas',
  proemio_y_juzgado_competente_en_materia_de_arrendamiento: 'proemio',
  prestaciones_de_rescision_desahucio_y_pago_de_rentas: 'prestaciones_desocupacion',
  prestaciones_desocupacion: 'prestaciones_desocupacion',
  hechos_demostrativos_del_arrendamiento_y_la_mora: 'hechos',
  fundamentos_de_derecho_y_procedencia_de_la_via: 'derecho',
  puntos_petitorios_y_orden_de_desahucio: 'petitorios',
  // LOOP 8I: Corporativo / Societario
  denominacion_objeto: 'denominacion_objeto',
  capital_social: 'capital_social',
  administracion_vigilancia: 'administracion_vigilancia',
  disolucion_liquidacion: 'disolucion_liquidacion',
  estatutos: 'estatutos',
  lista_asistencia: 'lista_asistencia',
  orden_dia: 'orden_dia',
  desarrollo_acuerdos: 'desarrollo_acuerdos',
  delegacion_facultades: 'delegacion_facultades',
  antecedentes_capital: 'antecedentes_capital',
  acuerdos_transmision: 'acuerdos_transmision',
  precio_contraprestacion: 'precio_contraprestacion',
  antecedentes_sociedad: 'antecedentes_sociedad',
  otorgamiento_facultades: 'otorgamiento_facultades',
  limitaciones_vigencia: 'limitaciones_vigencia',
  protocolizacion_registro: 'protocolizacion_registro',
  compromisos_confidencialidad: 'compromisos_confidencialidad',
  exclusividad_vigencia: 'exclusividad_vigencia',
  ley_jurisdiccion: 'ley_jurisdiccion',
  // LOOP 8I: Contractual
  clausulas_modificatorias: 'clausulas_modificatorias',
  subsistencia_estipulaciones: 'subsistencia_estipulaciones',
  reconocimiento_obligacion: 'reconocimiento_obligacion',
  forma_pago: 'forma_pago',
  consecuencias_mora: 'consecuencias_mora',
  pena_convencional: 'pena_convencional',
  jurisdiccion: 'jurisdiccion',
  // LOOP 8I: Propiedad Intelectual
  objeto_licencia_cesion: 'objeto_licencia_cesion',
  regalias_contraprestacion: 'regalias_contraprestacion',
  garantias_titularidad: 'garantias_titularidad',
  hechos_infraccion: 'hechos_infraccion',
  derechos_propiedad_industrial: 'derechos_propiedad_industrial',
  pruebas_periciales_documentales: 'pruebas_periciales_documentales',
  destinatario_impi: 'destinatario_impi',
  datos_solicitante: 'datos_solicitante',
  signo_distintivo_clase: 'signo_distintivo_clase',
  manifestaciones_impedimento: 'manifestaciones_impedimento',
  anexos_tarifas: 'anexos_tarifas',
  // Phrase aliases for LOOP 8I
  denominacion_objeto_y_domicilio_social: 'denominacion_objeto',
  capital_social_y_acciones: 'capital_social',
  organo_de_administracion_y_vigilancia: 'administracion_vigilancia',
  disolucion_y_liquidacion: 'disolucion_liquidacion',
  estatutos_sociales: 'estatutos',
  lista_de_asistencia_y_quorum: 'lista_asistencia',
  orden_del_dia: 'orden_dia',
  desarrollo_de_los_acuerdos: 'desarrollo_acuerdos',
  desarrollo_de_acuerdos_y_votacion: 'desarrollo_acuerdos',
  desarrollo_de_acuerdos_por_unanimidad: 'desarrollo_acuerdos',
  desarrollo_de_acuerdos_del_consejo: 'desarrollo_acuerdos',
  delegacion_de_facultades_y_formalizacion: 'delegacion_facultades',
  delegacion_de_facultades_y_protocolizacion: 'delegacion_facultades',
  delegacion_de_facultades_y_ejecucion: 'delegacion_facultades',
  antecedentes_de_la_sociedad: 'antecedentes_sociedad',
  antecedentes_del_capital_social: 'antecedentes_capital',
  acuerdos_de_transmision_y_suscripcion: 'acuerdos_transmision',
  acuerdos_de_transmision_y_amortizacion: 'acuerdos_transmision',
  acuerdos_de_transmision_de_partes_sociales: 'acuerdos_transmision',
  acuerdos_de_transmision_de_acciones: 'acuerdos_transmision',
  precio_y_contraprestacion: 'precio_contraprestacion',
  garantias_y_declaraciones_de_salud_corporativa: 'garantias',
  otorgamiento_de_facultades_y_mandato: 'otorgamiento_facultades',
  otorgamiento_de_facultades_y_revocacion_expresa: 'otorgamiento_facultades',
  limitaciones_y_vigencia_del_poder: 'limitaciones_vigencia',
  protocolizacion_y_registro_publico: 'protocolizacion_registro',
  clausulas_de_gobierno_y_derechos_preferentes: 'clausulas',
  ley_aplicable_y_jurisdiccion: 'ley_jurisdiccion',
  compromisos_de_confidencialidad_y_no_divulgacion: 'compromisos_confidencialidad',
  exclusividad_y_vigencia: 'exclusividad_vigencia',
  clausulas_y_terminos_principales: 'clausulas',
  jurisdiccion_y_competencia: 'jurisdiccion',
  reconocimiento_de_la_obligacion_y_monto: 'reconocimiento_obligacion',
  forma_y_calendario_de_pago: 'forma_pago',
  consecuencias_de_la_mora: 'consecuencias_mora',
  clausulas_modificatorias_o_de_terminacion: 'clausulas_modificatorias',
  subsistencia_de_las_demas_estipulaciones: 'subsistencia_estipulaciones',
  declaraciones_preliminares: 'declaraciones',
  clausulas_y_puntos_de_acuerdo: 'clausulas',
  declaraciones_de_titularidad_y_capacidad: 'declaraciones',
  objeto_de_licencia_o_cesion: 'objeto_licencia_cesion',
  regalias_y_contraprestacion: 'regalias_contraprestacion',
  garantias_de_titularidad_y_paz: 'garantias_titularidad',
  hechos_de_la_infraccion_administrativa: 'hechos_infraccion',
  derechos_de_propiedad_industrial_vulnerados: 'derechos_propiedad_industrial',
  derechos_de_propiedad_industrial_y_agravios: 'derechos_propiedad_industrial',
  derechos_de_propiedad_industrial_invocados: 'derechos_propiedad_industrial',
  derechos_de_propiedad_industrial_conculcados: 'derechos_propiedad_industrial',
  derechos_de_propiedad_industrial_y_aplicacion_de_ley: 'derechos_propiedad_industrial',
  pruebas_periciales_y_documentales: 'pruebas_periciales_documentales',
  destinatario_ante_el_impi: 'destinatario_impi',
  destinatario_y_rubro_impi: 'destinatario_rubro',
  destinatario_y_rubro_del_recurso: 'destinatario_rubro',
  datos_del_solicitante_y_apoderado: 'datos_solicitante',
  datos_del_solicitante_y_expediente: 'datos_solicitante',
  signo_distintivo_y_clasificacion_internacional: 'signo_distintivo_clase',
  anexos_y_tarifas_oficiales: 'anexos_tarifas',
  manifestaciones_respecto_del_impedimento_legal: 'manifestaciones_impedimento',
  hechos_de_la_oposicion_y_antecedentes: 'hechos_infraccion',
  hechos_y_causales_de_nulidad_registral: 'hechos_infraccion',
  hechos_y_causales_de_caducidad_por_falta_de_uso: 'hechos_infraccion',
  personalidad_y_comparecencia: 'comparecencia',
  declaraciones_de_las_partes: 'declaraciones',
  declaraciones_de_intencion: 'declaraciones',
  declaraciones_de_las_partes_contratantes: 'declaraciones',
  firmas_de_los_socios_fundadores: 'firmas',
  firmas_de_los_accionistas: 'firmas',
  firmas_de_los_consejeros: 'firmas',
  firmas_de_conformidad: 'firmas',
  firmas_de_las_partes: 'firma',
  firmas_de_los_contratantes: 'firmas',
  firmas_de_los_otorgantes: 'firmas',
  // Trámites Generales de Juzgado (LOOP 8J)
  rubro_y_expediente: 'destinatario_rubro',
  proveido_de_prevencion_notificado: 'proveido_referencia',
  requerimiento_judicial_notificado: 'requerimiento_notificado',
  cumplimiento_puntual_del_requerimiento: 'manifestacion_cumplimiento',
  cumplimiento_y_subsanacion_de_la_prevencion: 'desahogo_prevencion',
  desahogo_de_prevencion: 'desahogo_prevencion',
  peticion_o_manifestaciones_de_tramite: 'manifestaciones',
  manifestaciones_en_derecho: 'manifestaciones',
  motivo_de_la_comparecencia_en_autos: 'motivo_comparecencia',
  manifestaciones_y_declaraciones_procesales: 'manifestaciones',
  escrito_o_actuacion_materia_de_ratificacion: 'escrito_referencia',
  ratificacion_expresa_de_contenido_y_firma: 'declaracion_ratificacion',
  constancias_o_actuaciones_solicitadas_en_copia_simple: 'constancias_solicitadas',
  constancias_especificas_requeridas_en_copia_certificada: 'constancias_solicitadas',
  personas_autorizadas_para_recibirlas: 'personas_autorizadas',
  solicitud_de_acceso_consulta_y_uso_de_medios_electronicos: 'acceso_solicitado',
  profesionistas_y_pasantes_autorizados: 'profesionistas_autorizados',
  actuacion_o_estado_procesal_a_certificar: 'materia_certificacion',
  designacion_de_abogados_patronos_y_pasantes_autorizados: 'designacion_abogados',
  facultades_y_alcance_de_la_autorizacion_procesal: 'alcance_facultades',
  revocacion_expresa_de_nombramientos_y_autorizaciones: 'revocacion_expresa',
  nuevas_designaciones_y_domicilio_procesal: 'nuevos_autorizados',
  senalamiento_de_nuevo_domicilio_procesal: 'nuevo_domicilio',
  personas_autorizadas_para_oir_y_recibir_notificaciones: 'personas_autorizadas',
  senalamiento_de_correo_electronico_y_usuario_del_tribunal: 'medios_electronicos',
  conformidad_y_autorizacion_para_notificaciones_electronicas: 'manifestacion_conformidad',
  estado_procesal_de_los_autos_y_certificacion_de_terminos: 'estado_procesal',
  solicitud_de_continuacion_y_paso_a_la_siguiente_etapa: 'solicitud_impulso',
  expedientes_y_juicios_materia_de_acumulacion: 'expedientes_acumular',
  conexidad_de_la_causa_y_litispendencia: 'causa_acumulacion',
  conclusion_del_juicio_o_caducidad_de_la_instancia: 'causa_archivo',
  solicitud_de_remision_al_archivo_judicial_definitivo: 'solicitud_remision_archivo',
  datos_de_identificacion_y_ubicacion_en_el_archivo_judicial: 'datos_archivo',
  motivo_y_necesidad_de_la_devolucion_a_juzgado: 'motivo_desarchivo',
  desistimiento_expreso_de_la_instancia_o_de_la_accion: 'declaracion_desistimiento',
  efectos_y_ratificacion_ante_la_autoridad: 'alcance_y_efectos',
  allanamiento_incondicional_a_las_pretensiones_del_actor: 'declaracion_allanamiento',
  solicitud_de_no_imposicion_de_costas_o_condiciones_de_pago: 'manifestaciones_condena',
  comparecencia_conjunta_de_las_partes: 'comparecencia_partes',
  antecedentes_del_litigio: 'antecedentes_litigio',
  clausulas_y_estipulaciones_del_convenio_de_transaccion: 'clausulas_convenio',
  solicitud_de_aprobacion_y_elevacion_a_cosa_juzgada: 'ratificacion_elevacion_cosa_juzgada',
  auto_o_proveido_cuya_aclaracion_se_solicita: 'resolucion_a_aclarar',
  puntos_obscuros_omisiones_o_contradicciones_a_precisar: 'puntos_obscuros',
  actuacion_judicial_que_contiene_error_material_o_numerico: 'actuacion_con_error',
  precision_del_error_y_forma_correcta_que_debe_regir: 'precision_del_error',
  relacion_de_documentos_originales_a_devolver: 'documentos_solicitados',
  ofrecimiento_de_copias_para_cotejo_y_personas_autorizadas: 'copias_cotejo_y_autorizados',
  fundamento_juridico: 'fundamentos_de_derecho',
  protesto_lo_necesario_y_firma: 'firma',
  proveido_de_referencia: 'proveido_referencia',
  motivo_de_comparecencia: 'motivo_comparecencia',
  escrito_de_referencia: 'escrito_referencia',
  declaracion_de_ratificacion: 'declaracion_ratificacion',
  materia_de_certificacion: 'materia_certificacion',
  designacion_de_abogados: 'designacion_abogados',
  alcance_de_facultades: 'alcance_facultades',
  manifestacion_de_conformidad: 'manifestacion_conformidad',
  solicitud_de_impulso: 'solicitud_impulso',
  expedientes_a_acumular: 'expedientes_acumular',
  causa_de_acumulacion: 'causa_acumulacion',
  causa_de_archivo: 'causa_archivo',
  solicitud_de_remision_al_archivo: 'solicitud_remision_archivo',
  datos_de_archivo: 'datos_archivo',
  motivo_de_desarchivo: 'motivo_desarchivo',
  declaracion_de_desistimiento: 'declaracion_desistimiento',
  declaracion_de_allanamiento: 'declaracion_allanamiento',
  manifestaciones_sobre_condena: 'manifestaciones_condena',
  comparecencia_de_las_partes: 'comparecencia_partes',
  clausulas_del_convenio: 'clausulas_convenio',
  solicitud_de_aprobacion_y_cosa_juzgada: 'ratificacion_elevacion_cosa_juzgada',
  resolucion_a_aclarar: 'resolucion_a_aclarar',
  actuacion_con_error: 'actuacion_con_error',
  copias_para_cotejo_y_autorizados: 'copias_cotejo_y_autorizados',
};

/** Convierte IDs y títulos históricos al mismo identificador semántico. */
export function getCanonicalSectionId(value: string): string {
  let normalized = normalizeSectionId(value);
  normalized = normalized.replace(/^sec_(?:con|crad)_/, '');
  if (SPECIALIZED_SECTION_IDS[normalized]) return SPECIALIZED_SECTION_IDS[normalized];
  if (normalized === 'asunto') return 'identificacion_asunto';
  if (normalized === 'cierre') return 'firma';
  if (/proemio/.test(normalized)) return 'proemio';
  if (/comparecencia|personalidad/.test(normalized)) return 'comparecencia';

  if (/petitorio/.test(normalized)) return 'petitorios';
  if (/(?:^|_)firma(?:_|$)/.test(normalized)) return 'firma';
  if (/prueba|evidencia/.test(normalized)) return 'pruebas';
  if (/hecho/.test(normalized)) return 'hechos';
  if (/prestacion|pretension/.test(normalized)) return 'prestaciones';
  if (/excepcion|defensa/.test(normalized)) return 'excepciones_defensas';
  if (/alegato|agravio|argument|concepto/.test(normalized)) return 'argumentos';
  if (/antecedente/.test(normalized)) return 'antecedentes';
  if (/sentencia/.test(normalized)) return 'sentencia_impugnada';
  if (/fundamento/.test(normalized)) return 'fundamentos';
  if (/identificacion/.test(normalized)) return 'identificacion_asunto';
  if (/objeto/.test(normalized)) return 'objeto';
  if (/destinatari|autoridad|tribunal|juzgado|junta/.test(normalized)) return 'destinatario';
  if (/resolucion/.test(normalized)) return 'resolucion';
  if (/acto_reclamado/.test(normalized)) return 'acto_reclamado';
  if (/suspension/.test(normalized)) return 'suspension';
  return normalized;
}

/** Secciones obligatorias derivadas del template canónico, no de la fuente. */
export function getRequiredSectionIds(documentType?: string): string[] {
  const catalogEntry = documentType ? getCatalogDocument(documentType) : undefined;
  const canonicalDocumentType = catalogEntry?.kind === 'DOCUMENT_TYPE'
    ? catalogEntry.id
    : catalogEntry?.kind === 'LEGACY_ALIAS'
      ? catalogEntry.targetId
      : documentType;
  if (canonicalDocumentType === 'escrito_libre') return [];
  if (canonicalDocumentType === 'demanda_ordinaria_civil') {
    return [...CIVIL_DEMAND_REQUIRED_SECTION_IDS];
  }
  if (canonicalDocumentType === 'demanda_ejecutiva_mercantil') {
    return [...COMMERCIAL_ENFORCEMENT_REQUIRED_SECTION_IDS];
  }
  const template = canonicalDocumentType ? DocumentTemplates[canonicalDocumentType] : undefined;
  return Array.from(new Set((template?.estructura || []).map(getCanonicalSectionId).filter(Boolean)));
}

export function getMissingRequiredSectionIds(
  doc: Pick<UniversalLegalDocument, 'documentType' | 'templateId' | 'sections'>,
): string[] {
  const documentType = doc.documentType || doc.templateId;
  const catalogEntry = documentType ? getCatalogDocument(documentType) : undefined;
  const canonicalDocumentType = catalogEntry?.kind === 'DOCUMENT_TYPE'
    ? catalogEntry.id
    : catalogEntry?.kind === 'LEGACY_ALIAS'
      ? catalogEntry.targetId
      : documentType;
  const required = getRequiredSectionIds(documentType);
  if (required.length === 0) return [];

  // La demanda civil tiene dos IDs que los históricos normalizaban juntos
  // (personalidad/comparecencia e identificación/asunto). En este contrato
  // ambos son secciones distintas y deben permanecer distinguibles.
  if (canonicalDocumentType === 'demanda_ordinaria_civil') {
    const present = new Set(
      (doc.sections || []).flatMap((section: DocumentNode) => [section.id, section.title]
        .map(normalizeSectionId)
        .filter((id) => required.includes(id))),
    );
    return required.filter((id) => !present.has(id));
  }

  const present = new Set(
    canonicalDocumentType === 'demanda_ejecutiva_mercantil'
      ? (doc.sections || []).flatMap((section: DocumentNode) => [section.id, section.title].map(normalizeSectionId).filter((id) => required.includes(id)))
      : (doc.sections || []).flatMap((section: DocumentNode) => [
        getCanonicalSectionId(section.id),
        getCanonicalSectionId(section.title),
      ]),
  );
  return required.filter((id) => !present.has(id));
}

function canonicalDocumentTypeForExport(value: string | undefined): string | undefined {
  const entry = value ? getCatalogDocument(value) : undefined;
  if (entry?.kind === 'LEGACY_ALIAS') return entry.targetId;
  if (entry?.kind === 'DOCUMENT_TYPE') return entry.id;
  return value;
}

function collectText(doc: UniversalLegalDocument): string {
  return (Array.isArray(doc.sections) ? doc.sections : [])
    .map((s) => s.content.map((b) => b.text).join('\n\n')).join('\n\n');
}

export interface ExportValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export class ExportGuardError extends Error {
  readonly code = 'EXPORT_GUARD_FAILED';

  constructor(readonly result: ExportValidationResult) {
    super('El documento no cumple el contrato común de exportación');
    this.name = 'ExportGuardError';
  }
}

/**
 * The legacy renderer accepts a different DTO and therefore cannot produce a
 * UniversalLegalDocument. It must fail closed if a caller tries to route the
 * mercantile canonical through that old surface.
 */
export function assertLegacyRenderedDocumentExportable(value: { documentType?: string }): void {
  const canonicalType = canonicalDocumentTypeForExport(value.documentType);
  if (
    canonicalType === 'demanda_ejecutiva_mercantil'
    || (canonicalType && isCivilMercantileResponseDocumentType(canonicalType))
    || (canonicalType && isCivilMercantileEvidenceArgumentDocumentType(canonicalType))
  ) {
    throw new ExportGuardError({
      ok: false,
      errors: [`LEGACY_EXPORT_BLOCKED: ${canonicalType} solo puede exportarse mediante el guard universal.`],
      warnings: [],
    });
  }
}

export function isExportGuardError(error: unknown): error is ExportGuardError {
  return error instanceof ExportGuardError;
}

export function validateForExport(doc: UniversalLegalDocument): ExportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sections = Array.isArray(doc.sections) ? doc.sections : [];
  const allText = collectText(doc);
  const titles = sections.map((s) => (s.title || '').trim());

  const catalogEntry = doc.documentType ? getCatalogDocument(doc.documentType) : undefined;
  if (catalogEntry?.kind === 'FAMILY' || (catalogEntry?.kind === 'DOCUMENT_TYPE' && catalogEntry.status !== 'IMPLEMENTED')) {
    errors.push(`DOCUMENT_TYPE_NOT_IMPLEMENTED: "${doc.documentType}" no está disponible para generación/exportación final.`);
  }

  // ── Documento vacío ──
  if (sections.length === 0 || allText.trim().length === 0) {
    errors.push('DOCUMENTO_VACIO: El documento no contiene secciones ni texto para exportar.');
  }

  const missingRequiredSections = getMissingRequiredSectionIds(doc);
  for (const sectionId of missingRequiredSections) {
    errors.push(`MISSING_REQUIRED_SECTION: Falta la sección canónica "${sectionId}" para ${doc.documentType}.`);
  }

  const missingFields = Array.from(new Set([
    ...(doc.missingFields || []),
    ...(doc.caseContext?.missingFields || []),
  ].map((field) => field.trim()).filter(Boolean)));
  const anonymizedFields = Array.from(new Set([
    ...(doc.anonymizedFields || []),
    ...(doc.caseContext?.anonymizedFields || []),
  ].map((field) => field.trim()).filter(Boolean)));
  if (missingFields.length > 0) {
    errors.push(`INCOMPLETE_DOCUMENT: campos pendientes antes de exportar: ${missingFields.join(', ')}.`);
  }
  if (anonymizedFields.length > 0) {
    errors.push(`INCOMPLETE_DOCUMENT: datos anonimizados requieren confirmación: ${anonymizedFields.join(', ')}.`);
  }

  const preflight = (doc.generationMetadata as unknown as { preflight?: { status?: string; missingFields?: unknown[] } } | undefined)?.preflight;
  if (preflight && typeof preflight === 'object' && preflight !== null) {
    const preflightRecord = preflight as { status?: string; missingFields?: unknown[] };
    if (preflightRecord.status && preflightRecord.status !== 'READY') {
      errors.push(`PREFLIGHT_NOT_READY: el preflight está en estado ${preflightRecord.status}.`);
    }
    if (Array.isArray(preflightRecord.missingFields) && preflightRecord.missingFields.length > 0) {
      errors.push('PREFLIGHT_NOT_READY: existen campos requeridos sin confirmar.');
    }
  }

  const qualityGate = (doc as UniversalLegalDocument & { qualityGate?: { canMarkAsFinal?: boolean } }).qualityGate;
  if (qualityGate?.canMarkAsFinal === false) {
    errors.push('QUALITY_GATE_FAILED: el documento no está habilitado para marcarse como FINAL.');
  }
  if ((qualityGate as { passed?: boolean } | undefined)?.passed === false) {
    errors.push('QUALITY_GATE_FAILED: el documento requiere revisión antes de exportarse.');
  }

  if (canonicalDocumentTypeForExport(doc.documentType) === 'demanda_ejecutiva_mercantil') {
    const commercialContext = doc.caseContext?.commercialEnforcement;
    if (!commercialContext) errors.push('COMMERCIAL_CONTEXT_MISSING: se requiere contexto mercantil normalizado.');
    if (!preflight || preflight.status !== 'READY' || (Array.isArray(preflight?.missingFields) && preflight.missingFields.length > 0)) {
      errors.push('COMMERCIAL_PREFLIGHT_NOT_READY: el preflight mercantil debe existir y estar READY.');
    }
    if (!qualityGate || qualityGate.canMarkAsFinal !== true || (qualityGate as { passed?: boolean }).passed !== true) {
      errors.push('COMMERCIAL_QUALITY_GATE_NOT_READY: el quality gate mercantil debe existir y estar aprobado.');
    }
    const lifecycle = readDocumentLifecycle(doc);
    const lifecycleExportable = lifecycle?.entityKind === 'FINAL_DOCUMENT'
      || (lifecycle?.entityKind === 'DRAFT' && lifecycle.readiness === 'READY_TO_EXPORT');
    if (!lifecycleExportable) {
      errors.push('LIFECYCLE_NOT_EXPORTABLE: el documento no tiene una transición lifecycle explícita.');
    }
  }

  if (doc.documentType && isCivilMercantileResponseDocumentType(canonicalDocumentTypeForExport(doc.documentType) || '')) {
    const responseContext = doc.caseContext?.civilMercantileResponse;
    if (!responseContext || responseContext.documentType !== canonicalDocumentTypeForExport(doc.documentType)) {
      errors.push('RESPONSE_CONTEXT_MISSING: se requiere contexto tipado de contestación/reconvención.');
    }
    if (!preflight || preflight.status !== 'READY' || (Array.isArray(preflight?.missingFields) && preflight.missingFields.length > 0)) {
      errors.push('RESPONSE_PREFLIGHT_NOT_READY: el preflight de la subfamilia debe existir y estar READY.');
    }
    if (!qualityGate || qualityGate.canMarkAsFinal !== true || (qualityGate as { passed?: boolean }).passed !== true) {
      errors.push('RESPONSE_QUALITY_GATE_NOT_READY: el quality gate de la subfamilia debe existir y estar aprobado.');
    }
  }

  const exportReadiness = readDocumentExportReadiness(doc);
  if (exportReadiness !== 'READY_TO_EXPORT' && exportReadiness !== 'FINAL_DOCUMENT') {
    errors.push(`LIFECYCLE_NOT_EXPORTABLE: el documento está en estado ${exportReadiness || 'UNKNOWN'}; se requiere READY_TO_EXPORT o FINAL_DOCUMENT.`);
  }

  // ── Markdown crudo REAL (pares de énfasis; las corridas puras son redacción) ──
  const boldPairs = allText.match(/(?<!\*)\*\*[^*\n]+?\*\*(?!\*)/g) || [];
  if (boldPairs.length > 0) {
    const first = boldPairs[0] ?? '';
    errors.push(`Markdown crudo (**…**): ${boldPairs.length} aparición(es). Ej.: "${first.slice(0, 60)}"`);
  }
  const italicPairs = (allText.match(/(?<!\*)\*[^*\n]+?\*(?!\*)/g) || []).filter((m) => !/^\*{3,}$/.test(m));
  if (italicPairs.length > 0) errors.push(`Markdown crudo (*…*): ${italicPairs.length} aparición(es).`);
  if (/^#{1,6}\s+\S/m.test(allText)) errors.push('Encabezados Markdown (#) presentes.');

  // ── Etiquetas internas ──
  for (const rx of INTERNAL_LABELS) {
    rx.lastIndex = 0;
    if (rx.test(allText)) errors.push(`Etiqueta interna impresa: ${rx.source.replace(/[\^\$\\s\*]/g, '').replace(/\\b/g, '')}`);
  }

  // ── Placeholders técnicos ──
  if (/\{\{/.test(allText)) errors.push('Placeholder técnico {{…}} sin resolver.');
  if (/\bundefined\b/.test(allText)) errors.push('Token "undefined" presente.');
  if (/\bnull\b/.test(allText)) errors.push('Token "null" presente.');
  if (/\[object Object\]/.test(allText)) errors.push('Serialización "[object Object]" presente.');

  // ── Marcadores de semilla y generación pendiente ──
  if (hasSeedMarkers(allText)) {
    errors.push('SEED_MARKER_PRESENT: el documento contiene marcadores de semilla o placeholders de generación de IA ([Desarrollar por la IA...], etc.) y no está terminado.');
  }

  // ── Dependencias fácticas no resueltas ([DATO PENDIENTE DE EXPEDIENTE:...]) ──
  if (hasUnresolvedFactualDependencies(allText)) {
    errors.push('UNRESOLVED_FACTUAL_DEPENDENCY: el documento contiene dependencias fácticas no resueltas ([DATO PENDIENTE DE EXPEDIENTE: ...]) y no puede exportarse.');
  }



  // ── Bloques truncados o AI_REQUIRED vacíos ──
  for (const sec of sections) {
    if (sec.generation?.isTruncated || sec.generation?.finishReason === 'length' || (sec.content || []).some((b: any) => b.generationStatus === 'truncated')) {
      errors.push(`TRUNCATED_GENERATION: la sección "${sec.title}" fue truncada por límite de tokens (finish_reason: length).`);
    }
    for (const block of sec.content || []) {
      if (block.generationRequirement === 'AI_REQUIRED' && !block.text?.trim()) {
        errors.push(`EMPTY_AI_REQUIRED_BLOCK: el bloque "${block.id}" de la sección "${sec.title}" requiere generación de IA y está vacío.`);
      }
    }
  }

  // ── Títulos consecutivos duplicados ──
  for (let i = 1; i < titles.length; i++) {
    const a = titles[i - 1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const b = titles[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (a && a === b) {
      errors.push(`Títulos consecutivos duplicados: "${titles[i]}" (posición ${i + 1}).`);
    }
  }

  // ── Separación SOURCE / GENERATED para contestaciones ──
  const isContestacion = /contestaci/i.test(doc.documentTypeLabel || '') || /contestaci/i.test(doc.documentType || '');
  const isDemandContestacion = isContestacion && !isContestacionRevisionAmparoDirectoType(doc.documentType, doc.documentTypeLabel);
  if (isContestacion) {
    const sourceSections = sections.filter((s: any) => (s._provenance || s._blockMeta?.provenance) === 'SOURCE');
    if (sourceSections.length > 0) {
      errors.push(`La contestación contiene ${sourceSections.length} bloque(s) SOURCE del expediente que no deben imprimirse: ${sourceSections.slice(0, 3).map((s) => `"${s.title}"`).join(', ')}.`);
    }
  }

  if (isContestacionRevisionAmparoDirectoType(doc.documentType, doc.documentTypeLabel)
    && (/\bdemanda\s+de\s+amparo\s+(?:directo|indirecto)\b/i.test(allText)
      || /^\s*conceptos?\s+de\s+violaci[oó]n\s*$/im.test(allText)
      || /^\s*suspensi[oó]n(?:\s+del\s+acto\s+reclamado)?\s*$/im.test(allText))) {
    errors.push('CROSS_TEMPLATE_CONTENT: la estrategia post-sentencia contiene contenido propio de una demanda de amparo.');
  }

  // ── IDENTIDAD DOCUMENTAL ÚNICA (FASE 10) ──
  // UN DOCUMENTO → UN PLAN → UNA PLANTILLA. Todas las secciones deben
  // pertenecer al mismo templateId y coincidir con la identidad del documento.
  const sectionTemplateIds = Array.from(
    new Set(sections.map((s: any) => s._templateId).filter(Boolean))
  );
  if (sectionTemplateIds.length > 1) {
    errors.push(
      `IDENTIDAD DOCUMENTAL MIXTA: la generación contiene secciones de ${sectionTemplateIds.length} plantillas distintas (${sectionTemplateIds.join(', ')}). Un documento solo puede pertenecer a un plan.`
    );
  }
  if (doc.templateId && sectionTemplateIds.length === 1 && sectionTemplateIds[0] !== doc.templateId) {
    errors.push(
      `IDENTIDAD DOCUMENTAL INCONSISTENTE: doc.templateId="${doc.templateId}" pero hay secciones marcadas con "${sectionTemplateIds[0]}".`
    );
  }

  // ── PROCEDENCIA: bloques SOURCE prohibidos en escritos de parte ──
  // El expediente es REFERENCE_ONLY; solo un machote elegido expresamente
  // ('MACHOTE') puede moldear estructura. 'SOURCE' jamás debe llegar a export.
  if (!isContestacion) {
    const sourceSectionsAll = sections.filter((s: any) => s._provenance === 'SOURCE');
    if (sourceSectionsAll.length > 0) {
      errors.push(
        `CONTAMINACIÓN DE FUENTE: ${sourceSectionsAll.length} sección(es) provienen directamente del expediente (_provenance=SOURCE): ${sourceSectionsAll.slice(0, 3).map((s) => `"${s.title}"`).join(', ')}. La fuente es material de referencia, no estructura del escrito.`
      );
    }
  }

  // ── Calidad jurídica de la contestación (advertencias) ──
  if (isDemandContestacion) {
    const parties = doc.parties || {};
    const actor = (parties.actor || '').trim();
    const demandado = (parties.demandado || '').trim();
    if (!actor && !demandado) {
      warnings.push('Roles procesales no identificados: faltan actor y demandado.');
    } else if (actor && demandado && actor.toLowerCase() === demandado.toLowerCase()) {
      warnings.push(`INCONSISTENCIA DE ROLES: actor y demandado tienen el mismo nombre ("${actor}").`);
    }
    const comparecencia = sections.find((s) => /comparecencia|identity/i.test(s.title + ' ' + s.type));
    if (demandado && comparecencia) {
      const cmpText = comparecencia.content.map((b) => b.text).join(' ');
      if (!cmpText.toLowerCase().includes(demandado.toLowerCase()) && !demandado.startsWith('[DATO PENDIENTE')) {
        warnings.push(`La comparecencia no menciona al demandado ("${demandado}") como quien contesta.`);
      }
    }
    if (!sections.some((s) => /petitorio/i.test(s.title))) warnings.push('Falta sección de PETITORIOS.');
    if (!sections.some((s) => /prueba/i.test(s.title))) warnings.push('Falta sección de PRUEBAS.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

export interface PreparedExportDocument {
  document: UniversalLegalDocument;
  report: SanitizeReport;
  qualityGate: QualityGateResult;
  validation: ValidationResult;
  reviewOverrideApplied: boolean;
  reviewOverrideWarnings: string[];
}

export interface PrepareUniversalDocumentForExportOptions {
  /** Explicit export contract. DRAFT permits a review artifact; FINAL keeps all final gates. */
  exportMode?: ExportMode;
  /** Backward-compatible alias for older callers; true maps only to DRAFT. */
  allowReviewOverride?: boolean;
}

const REVIEW_OVERRIDE_ERROR_PATTERNS = [
  /^LIFECYCLE_NOT_EXPORTABLE:/,
  /^QUALITY_GATE_FAILED:/,
  /^INCOMPLETE_DOCUMENT:/,
  /^PREFLIGHT_NOT_READY:/,
  /^COMMERCIAL_PREFLIGHT_NOT_READY:/,
  /^COMMERCIAL_QUALITY_GATE_NOT_READY:/,
  /^RESPONSE_PREFLIGHT_NOT_READY:/,
  /^RESPONSE_QUALITY_GATE_NOT_READY:/,
];

function isReviewOverrideError(error: string): boolean {
  return REVIEW_OVERRIDE_ERROR_PATTERNS.some((pattern) => pattern.test(error));
}

function collectReviewOverrideErrors(
  errors: string[],
  warnings: string[],
  allowReviewOverride: boolean,
): string[] {
  if (!allowReviewOverride) {
    if (errors.length > 0) guardFailure(errors, warnings);
    return [];
  }

  const hardErrors = errors.filter((error) => !isReviewOverrideError(error));
  if (hardErrors.length > 0) guardFailure(hardErrors, warnings);
  return errors.length > 0
    ? ['REVIEW_EXPORT_OVERRIDE: exportación explícita de un borrador con pendientes: ' + errors.join(' | ')]
    : [];
}

function guardFailure(
  errors: string[],
  warnings: string[] = [],
): never {
  throw new ExportGuardError({ ok: false, errors, warnings });
}

/**
 * Single export contract shared by HTTP routes and low-level binary exporters.
 * It deliberately returns a sanitized clone and never mutates the caller's document.
 */
export async function prepareUniversalDocumentForExport(
  doc: UniversalLegalDocument,
  options: PrepareUniversalDocumentForExportOptions = {},
): Promise<PreparedExportDocument> {
  const exportMode = resolveExportMode(options.exportMode)
    || (options.allowReviewOverride === true ? 'DRAFT' : 'FINAL');
  const allowReviewOverride = exportMode === 'DRAFT';
  const reviewOverrideWarnings: string[] = [];
  const initial = validateForExport(doc);
  reviewOverrideWarnings.push(...collectReviewOverrideErrors(initial.errors, initial.warnings, allowReviewOverride));

  const auditTrace = doc.generationMetadata?.auditTrace;
  const { document: sanitized, report } = sanitizeLegalDocument(doc, { dedupeBlocks: false });
  // El trace es metadata transitoria de auditoría. Se conserva en el clon de
  // exportación para que el exporter pueda registrar DOCX sin tocar el texto.
  if (auditTrace && !sanitized.generationMetadata.auditTrace) {
    sanitized.generationMetadata = { ...sanitized.generationMetadata, auditTrace };
  }
  const metadataWithoutNotice = { ...sanitized.generationMetadata } as UniversalLegalDocument['generationMetadata'] & { exportNotice?: string };
  delete metadataWithoutNotice.exportNotice;
  const exportDocument = {
    ...sanitized,
    generationMetadata: {
      ...metadataWithoutNotice,
      exportMode,
      ...(exportMode === 'DRAFT' ? { exportNotice: DRAFT_EXPORT_NOTICE } : {}),
    },
  } as UniversalLegalDocument;
  const afterSanitize = validateForExport(exportDocument);
  reviewOverrideWarnings.push(...collectReviewOverrideErrors(afterSanitize.errors, afterSanitize.warnings, allowReviewOverride));

  // Dynamic import prevents the existing qualityGate -> exportGuards dependency
  // from becoming a module initialization cycle.
  const { runQualityGateCheck } = await import('./qualityGate');
  const qualityGate = runQualityGateCheck(exportDocument);
  if (!qualityGate.passed || !qualityGate.canMarkAsFinal) {
    const qualityErrors = [
      ...qualityGate.criticalErrors.map((issue) => issue.message),
      ...(!qualityGate.canMarkAsFinal ? ['QUALITY_GATE_FAILED: el documento no puede exportarse como FINAL.'] : []),
    ];
    if (allowReviewOverride) {
      reviewOverrideWarnings.push(`REVIEW_EXPORT_OVERRIDE: quality gate requiere revisión: ${qualityErrors.join(' | ')}`);
    } else {
      guardFailure(qualityErrors, qualityGate.warnings.map((issue) => issue.message));
    }
  }

  const validation = validateDocument(exportDocument);
  if (!validation.isValid || validation.errors.length > 0) {
    const validationErrors = validation.errors.map((issue) => issue.message);
    const reviewValidationErrors = allowReviewOverride
      ? validationErrors.filter((message) => /puntos petitorios/i.test(message))
      : [];
    const hardValidationErrors = validationErrors.filter((message) => !reviewValidationErrors.includes(message));
    if (hardValidationErrors.length > 0) {
      guardFailure(hardValidationErrors, validation.warnings.map((issue) => issue.message));
    }
    if (reviewValidationErrors.length > 0) {
      reviewOverrideWarnings.push(`REVIEW_EXPORT_OVERRIDE: validación requiere revisión: ${reviewValidationErrors.join(' | ')}`);
    }
  }

  const readiness = readDocumentExportReadiness(exportDocument);
  if (readiness !== 'READY_TO_EXPORT' && readiness !== 'FINAL_DOCUMENT') {
    const message = `LIFECYCLE_NOT_EXPORTABLE: el documento está en estado ${readiness || 'UNKNOWN'}; se requiere READY_TO_EXPORT o FINAL_DOCUMENT.`;
    if (allowReviewOverride) {
      reviewOverrideWarnings.push(`REVIEW_EXPORT_OVERRIDE: ${message}`);
    } else {
      guardFailure([message]);
    }
  }

  return {
    document: exportDocument,
    report,
    qualityGate,
    validation,
    reviewOverrideApplied: allowReviewOverride && reviewOverrideWarnings.length > 0,
    reviewOverrideWarnings,
  };
}

/** Returns the sanitized, fully validated document or throws ExportGuardError. */
export async function assertUniversalDocumentExportable(
  doc: UniversalLegalDocument,
): Promise<UniversalLegalDocument> {
  return (await prepareUniversalDocumentForExport(doc)).document;
}
