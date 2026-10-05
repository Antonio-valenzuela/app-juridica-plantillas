/**
 * documentFamilyBlueprints.ts — MOTOR DE FAMILIAS.
 *
 * Un tipo de escrito no necesita 250 plantillas copiadas: necesita una
 * FAMILIA con un comportamiento procesal y una configuración por tipo. Este
 * módulo declara el patrón estructural de cada familia y compone la
 * `estructura` a partir de BLOQUES reutilizables, de modo que:
 *
 *   FAMILY ENGINE → TYPE CONFIG → MATTER CONFIG → CASE CONTEXT → BLUEPRINT
 *
 * Las familias declaradas aquí son las que el catálogo expone como canónicas
 * pero que no tenían plantilla propia. Cada entrada produce una estructura
 * real (no una etiqueta) y campos coherentes con el tipo.
 */

export type StructuralBlock =
  | 'ENCABEZADO'
  | 'AUTORIDAD'
  | 'COMPARECENCIA'
  | 'PERSONALIDAD'
  | 'IDENTIFICACION_PARTES'
  | 'VIA_ACCION'
  | 'PRESTACIONES'
  | 'HECHOS'
  | 'ANTECEDENTES'
  | 'DERECHO'
  | 'PRUEBAS'
  | 'AGRAVIOS'
  | 'CONCEPTOS_VIOLACION'
  | 'CONSIDERACIONES_COMBATIDAS'
  | 'INTERES_EXCEPCIONAL'
  | 'SUSPENSION'
  | 'ACTO_RECLAMADO'
  | 'CONCLUYENTE'
  | 'ALEGATOS'
  | 'OBJETO'
  | 'EXPUESTO'
  | 'FUNDAMENTOS'
  | 'EFECTOS'
  | 'PETITORIOS'
  | 'PROTESTO'
  | 'LUGAR_FECHA'
  | 'FIRMA';

export interface FamilyBlueprint {
  familyId: string;
  /** Bloques que la familia siempre ejecuta, en orden. */
  blocks: readonly StructuralBlock[];
  /** Bloques opcionales: sólo se materializan si el tipo los declara. */
  optionalBlocks?: readonly StructuralBlock[];
  /** Palabras clave que activan bloques opcionales en un tipo concreto. */
  optionalTriggers?: Readonly<Record<string, readonly StructuralBlock[]>>;
  materia: string;
  via: string;
  procedimiento: string;
  objetivoProcesal: string;
  camposObligatorios: readonly string[];
  reglas: readonly string[];
  reglasArgumentacion?: readonly string[];
  reglasPrueba?: readonly string[];
  /** Familias de engine compartidas: agrupan variantes con el mismo patrón. */
  engine: 'demanda' | 'recurso' | 'escrito_tramite' | 'prueba_cierre' | 'convenio' | 'audiencia' | 'petitorio';
}

/* ── BLOQUES BASE reutilizables ─────────────────────────────────────────── */
const APERTURA_DEMANDA: StructuralBlock[] = ['ENCABEZADO', 'COMPARECENCIA', 'PERSONALIDAD', 'IDENTIFICACION_PARTES'];
const CIERRE: StructuralBlock[] = ['PETITORIOS', 'FIRMA'];
const APERTURA_RECURSO: StructuralBlock[] = ['AUTORIDAD', 'COMPARECENCIA', 'PERSONALIDAD'];

/**
 * Patrones por familia. La clave es la familia del catálogo; el valor es la
 * configuración de comportamiento. Los tipos dentro de la familia se
 * parametrizan con `optionalTriggers` (ver KEYWORD_TRIGGERS).
 */
export const FAMILY_BLUEPRINTS: Readonly<Record<string, FamilyBlueprint>> = Object.freeze({
  /* ── Civil: accionesIqbal declarativas ──────────────────────────────── */
  civil_demandas: {
    familyId: 'civil_demandas', engine: 'demanda',
    blocks: [...APERTURA_DEMANDA, 'VIA_ACCION', 'PRESTACIONES', 'HECHOS', 'DERECHO', 'PRUEBAS', ...CIERRE],
    optionalTriggers: {
     illery: ['DERECHO'],
      pago: ['PRESTACIONES'],
      arrendamiento: ['HECHOS'],
      usucapion: ['HECHOS', 'DERECHO'],
      interdicto: ['FUNDAMENTOS'],
      interdicatoria: ['FUNDAMENTOS'],
    },
    materia: 'CIVIL', via: 'proceso civil declarativo', procedimiento: 'JUICIO ORDINARIO CIVIL',
    objetivoProcesal: 'Obtener el reconocimiento judicial de un derecho o la pretensión exigible frente a la contraparte.',
    camposObligatorios: ['órgano jurisdiccional', 'expediente', 'demandante', 'demandado', 'prestaciones', 'hechos', 'pruebas'],
    reglas: ['Delimita la pretensión y su fundamento fáctico sin anticipar un resultado de fondo.'],
    reglasArgumentacion: ['Cada prestación se vincula con un hecho y con el fundamento que se verificará.'],
    reglasPrueba: ['Relaciona cada medio de prueba con la prestación que pretende acreditar.'],
  },
  /* ── Civil: prueba y cierre ────────────────────────────────────────── */
  civil_prueba: {
    familyId: 'civil_prueba', engine: 'prueba_cierre',
    blocks: ['ENCABEZADO', 'COMPARECENCIA', 'ANTECEDENTES', 'PRUEBAS', 'CONCLUYENTE', ...CIERRE],
    materia: 'CIVIL', via: 'proceso civil', procedimiento: 'CIERRE DE PRUEBA',
    objetivoProcesal: 'Cerrar la etapa probatoria y solicitar la valoraci\u00f3n de lo aportado.',
    camposObligatorios: ['expediente', 'partes', 'pruebas ofrecidas', 'conclusiones'],
    reglas: ['La conclusión sobre prueba se limita a lo efetivamente aportado.'],
  },
  /* ── Civil: recursos ────────────────────────────────────────────────── */
  civil_recursos: {
    familyId: 'civil_recursos', engine: 'recurso',
    blocks: [...APERTURA_RECURSO, 'ANTECEDENTES', 'CONSIDERACIONES_COMBATIDAS', 'AGRAVIOS', 'EFECTOS', ...CIERRE],
    materia: 'CIVIL', via: 'proceso civil', procedimiento: 'MEDIO DE IMPUGNACIÓN',
    objetivoProcesal: 'Impugnar una resolución judicial ante la autoridad que corresponda por grado.',
    camposObligatorios: ['autoridad', 'expediente', 'resolución recurrida', 'agravios', 'petitorios'],
    reglas: ['Identifica la resolución recurrida, la fecha y el término aplicable.'],
  },
  /* ── Protección al consumidor ─────────────────────────────────────── */
  consumidor_reclamacion: {
    familyId: 'consumidor_reclamacion', engine: 'escrito_tramite',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'HECHOS', 'DERECHO', ...CIERRE],
    materia: 'GENERAL', via: 'procedimiento de protección al consumidor', procedimiento: 'RECLAMACIÓN',
    objetivoProcesal: 'Presentar un reclamo o queja frente a un proveedor de bienes o servicios.',
    camposObligatorios: ['proveedor', 'autoridad', 'hechos', 'pretensión'],
    reglas: ['Identifica al proveedor y la relación de consumo sin suponer contratos no acreditados.'],
  },
  consumidor_conciliacion: {
    familyId: 'consumidor_conciliacion', engine: 'convenio',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'ANTECEDENTES', 'OBJETO', 'EXPUESTO', 'PETITORIOS', 'FIRMA'],
    materia: 'GENERAL', via: 'conciliación de consumo', procedimiento: 'CONCILIACIÓN',
    objetivoProcesal: 'Conciliar diferencias con el proveedor mediante acuerdo verificable.',
    camposObligatorios: ['proveedor', 'autoridad', 'objeto del convenio', 'acuerdos'],
    reglas: ['Cada acuerdo debe constar como aceptado por la parte correspondiente.'],
  },
  consumidor_procedimiento: {
    familyId: 'consumidor_procedimiento', engine: 'escrito_tramite',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'ANTECEDENTES', 'FUNDAMENTOS', 'ALEGATOS', ...CIERRE],
    materia: 'GENERAL', via: 'procedimiento de protección al consumidor', procedimiento: 'PROCEDIMIENTO ANPEC',
    objetivoProcesal: 'Defender derechos del consumidor en el procedimiento previsto por la ley.',
    camposObligatorios: ['autoridad', 'expediente', 'antecedentes', 'agravios'],
    reglas: ['No atribuyas al proveedor una conducta no acreditada en el expediente.'],
  },
  /* ── Electoral: medios de impugnación y partes ────────────────────── */
  electoral_medios: {
    familyId: 'electoral_medios', engine: 'recurso',
    blocks: [...APERTURA_RECURSO, 'ANTECEDENTES', 'CONSIDERACIONES_COMBATIDAS', 'AGRAVIOS', ...CIERRE],
    optionalTriggers: { proteccion: ['CONCEPTOS_VIOLACION'], inconformidad: ['AGRAVIOS'], apelacion: ['AGRAVIOS'], revision: ['AGRAVIOS'] },
    materia: 'CONSTITUCIONAL', via: 'medio de impugnación electoral', procedimiento: 'JUICIO / MEDIO DE IMPUGNACIÓN ELECTORAL',
    objetivoProcesal: 'Impugnar una determinación del aparato electoral ante el órgano competente.',
    camposObligatorios: ['órgano electoral', 'expediente', 'resolución impugnada', 'agravios', 'petitorios'],
    reglas: ['Verifica la competencia del órgano electoral antes de plantear agravios.'],
  },
  electoral_partes: {
    familyId: 'electoral_partes', engine: 'escrito_tramite',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'PERSONALIDAD', 'ANTECEDENTES', 'ALEGATOS', ...CIERRE],
    materia: 'CONSTITUCIONAL', via: 'procedimiento electoral', procedimiento: 'INTERVENCIÓN DE TERCERO / ALEGATOS',
    objetivoProcesal: 'Intervenir en el procedimiento electoral con la legitimación acreditada.',
    camposObligatorios: ['órgano electoral', 'identidad del interviniente', 'legitimación', 'petitorios'],
    reglas: ['La legitimación se acredita con la constancia que obre en autos.'],
  },
  /* ── Sucesorio ─────────────────────────────────────────────────────── */
  sucesorio_apertura: {
    familyId: 'sucesorio_apertura', engine: 'escrito_tramite',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'IDENTIFICACION_PARTES', 'HECHOS', 'DERECHO', ...CIERRE],
    materia: 'CIVIL', via: 'juicio sucesorio', procedimiento: 'DENUNCIA DE SUCESIÓN',
    objetivoProcesal: 'Denunciar el fallecimiento y solicitar la sucesión correspondiente.',
    camposObligatorios: ['juzgado', 'denunciante', 'fallecido', 'herederos', 'petitorios'],
    reglas: ['No completes datos del fallecimiento que no consten en la constancia aportada.'],
  },
  sucesorio_herencia: {
    familyId: 'sucesorio_herencia', engine: 'escrito_tramite',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'PERSONALIDAD', 'EXPUESTO', 'ANTECEDENTES', 'PETITORIOS', 'FIRMA'],
    materia: 'CIVIL', via: 'juicio sucesorio', procedimiento: 'ACEPTACIÓN / REPUDIACIÓN / NOMBRAMIENTO',
    objetivoProcesal: 'Manifestar la aceptación, repudiación o repudiación de la herencia.',
    camposObligatorios: ['juzgado', 'expediente', 'sucesorio', 'manifestación'],
    reglas: ['La aceptación y la repudiación tienen efectos distintos: no los confundas.'],
  },
  sucesorio_particion: {
    familyId: 'sucesorio_particion', engine: 'escrito_tramite',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'PERSONALIDAD', 'IDENTIFICACION_PARTES', 'HECHOS', 'EXPUESTO', 'PETITORIOS', 'FIRMA'],
    materia: 'CIVIL', via: 'juicio sucesorio', procedimiento: 'INVENTARIO / PARTICIÓN / ADJUDICACIÓN',
    objetivoProcesal: 'Presentar el inventario, la propuesta de partición o la adjudicación de bienes.',
    camposObligatorios: ['juzgado', 'expediente', 'bienes', 'herederos', 'petitorios'],
    reglas: ['Los bienes se relacionan con la constancia que los acredita.'],
  },
  sucesorio_convenios: {
    familyId: 'sucesorio_convenios', engine: 'convenio',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'ANTECEDENTES', 'OBJETO', 'EXPUESTO', 'PETITORIOS', 'FIRMA'],
    materia: 'CIVIL', via: 'juicio sucesorio', procedimiento: 'CONVENIO SUCESORIO',
    objetivoProcesal: 'Formalizar el acuerdo de los herederos sobre la sucesión.',
    camposObligatorios: ['juzgado', 'herederos', 'acuerdos'],
    reglas: ['Cada acuerdo se expresa como aceptado por las partes intervinientes.'],
  },
  incidente_sucesorio: {
    familyId: 'incidente_sucesorio', engine: 'escrito_tramite',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'ANTECEDENTES', 'OBJETO', 'CONSIDERACIONES_COMBATIDAS', 'AGRAVIOS', ...CIERRE],
    materia: 'CIVIL', via: 'juicio sucesorio', procedimiento: 'INCIDENTE',
    objetivoProcesal: 'Oponer o contestar una pretensi\u00f3n dentro del juicio sucesorio.',
    camposObligatorios: ['juzgado', 'expediente', 'objeto del incidente', 'agravios'],
    reglas: ['Delimita el objeto exacto del incidente.'],
  },
  /* ── mercantil ─────────────────────────────────────────────────────── */
  mercantil_demandas: {
    familyId: ' mercantil_demandas', engine: 'demanda',
    blocks: [...APERTURA_DEMANDA, 'VIA_ACCION', 'PRESTACIONES', 'HECHOS', 'DERECHO', 'PRUEBAS', ...CIERRE],
    materia: 'MERCANTIL', via: 'proceso mercantil', procedimiento: 'JUICIO MERCANTIL',
    objetivoProcesal: 'Reclamar una pretensión de naturaleza mercantil.',
    camposObligatorios: ['órgano mercantil', 'expediente', 'demandante', 'demandado', 'prestaciones', 'hechos'],
    reglas: ['Identifica la fuente mercantil de la obligación.'],
  },
  /* ── Migratorio ────────────────────────────────────────────────────── */
  migratorio_administrativo: {
    familyId: 'migratorio_administrativo', engine: 'escrito_tramite',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'ANTECEDENTES', 'HECHOS', 'FUNDAMENTOS', ...CIERRE],
    optionalTriggers: { revision: ['CONSIDERACIONES_COMBATIDAS', 'AGRAVIOS'], apelacion: ['CONSIDERACIONES_COMBATIDAS', 'AGRAVIOS'] },
    materia: 'ADMINISTRATIVO', via: 'procedimiento migratorio', procedimiento: 'TRÁMITE / RECURSO MIGRATORIO',
    objetivoProcesal: 'Tramitar la situación migratoria o impugnar la determinación correspondiente.',
    camposObligatorios: ['autoridad migratoria', 'expediente', 'situación migratoria', 'petitorios'],
    reglas: ['No expongas datos de la persona migrante que no consten en el expediente.'],
  },
  /* ── Penal ─────────────────────────────────────────────────────────── */
  penal_audiencia: {
    familyId: 'penal_audiencia', engine: 'audiencia',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'PERSONALIDAD', 'ANTECEDENTES', 'OBJETO', 'CONSIDERACIONES_COMBATIDAS', 'AGRAVIOS', ...CIERRE],
    optionalTriggers: { reparatorio: ['EXPUESTO', 'PRUEBAS'], cautel: ['FUNDAMENTOS'] },
    materia: 'PENAL', via: 'proceso penal', procedimiento: 'AUDIENCIA',
    objetivoProcesal: 'Intervenir en la audiencia con la incidencia que corresponda a la medida o acuerdo.',
    camposObligatorios: ['autoridad judicial', 'expediente', 'medida', 'petitorios'],
    reglas: ['No califiques刑事责任 no acreditada: describe la constancia.'],
  },
  /* ── Seguridad social ───────────────────────────────────────────────── */
  seguridad_social_controversia: {
    familyId: 'seguridad_social_controversia', engine: 'recurso',
    blocks: [...APERTURA_RECURSO, 'ANTECEDENTES', 'CONSIDERACIONES_COMBATIDAS', 'AGRAVIOS', ...CIERRE],
    optionalTriggers: { demanda: [...APERTURA_DEMANDA, 'VIA_ACCION', 'PRESTACIONES', 'HECHOS', 'DERECHO', 'PRUEBAS'], contestacion: ['CONSIDERACIONES_COMBATIDAS', 'AGRAVIOS'] },
    materia: 'LABORAL', via: 'procedimiento de seguridad social', procedimiento: 'CONTROVERVERSIA / RECURSO',
    objetivoProcesal: 'Impugnar o、定期 la determinación de seguridad social que le afecte.',
    camposObligatorios: ['autoridad', 'expediente', 'determinación impugnada', 'agravios', 'petitorios'],
    reglas: ['La determinación se identifica con su folio y fecha.'],
  },
  seguridad_social_pensiones: {
    familyId: 'seguridad_social_pensiones', engine: 'escrito_tramite',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'PERSONALIDAD', 'ANTECEDENTES', 'HECHOS', 'FUNDAMENTOS', ...CIERRE],
    optionalTriggers: { impugnacion: ['CONSIDERACIONES_COMBATIDAS', 'AGRAVIOS'] },
    materia: 'LABORAL', via: 'procedimiento de pensiones', procedimiento: 'SOLICITUD / IMPUGNACIÓN',
    objetivoProcesal: 'Gestionar el derecho de pensión o impugnar su resolución.',
    camposObligatorios: ['autoridad', 'expediente', 'derecho de pensión', 'petitorios'],
    reglas: ['Verifica el fundamento de la prestación antes de solicitar su otorgamiento.'],
  },
  /* ── Transparencia y datos personales ───────────────────────────────── */
  transparencia_informacion: {
    familyId: 'transparencia_informacion', engine: 'escrito_tramite',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'EXPUESTO', 'FUNDAMENTOS', ...CIERRE],
    optionalTriggers: { revision: ['CONSIDERACIONES_COMBATIDAS', 'AGRAVIOS'] },
    materia: 'GENERAL', via: 'procedimiento de transparencia', procedimiento: 'ACCESO A INFORMACIÓN',
    objetivoProcesal: 'Solicitar o impugnar el acceso a la información pública.',
    camposObligatorios: ['sujeto obligado', 'información solicitada', 'petitorios'],
    reglas: ['Describe con precisión la información que se solicita.'],
  },
  transparencia_arco: {
    familyId: 'transparencia_arco', engine: 'recurso',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'ANTECEDENTES', 'CONSIDERACIONES_COMBATIDAS', 'AGRAVIOS', ...CIERRE],
    materia: 'GENERAL', via: 'procedimiento de protección de datos', procedimiento: 'DERECHOS ARCO',
    objetivoProcesal: 'Ejercitar o impugnar los derechos de acceso, rectificación, cancelación u oposición.',
    camposObligatorios: ['responsable', 'datos personales', 'derecho ejercido', 'petitorios'],
    reglas: ['No reproduzcas datos personales distintos de los estrictamente necesarios.'],
  },
  transparencia_cumplimiento: {
    familyId: 'transparencia_cumplimiento', engine: 'escrito_tramite',
    blocks: ['AUTORIDAD', 'COMPARECENCIA', 'ANTECEDENTES', 'EXPUESTO', ...CIERRE],
    materia: 'GENERAL', via: 'procedimiento de transparencia', procedimiento: 'CUMPLIMIENTO',
    objetivoProcesal: 'Requerir o acreditar el cumplimiento de una obligación de transparencia.',
    camposObligatorios: ['sujeto obligado', 'obligación', 'petitorios'],
    reglas: ['La obligación se identifica con su fundamento y plazo.'],
  },
});

/** Rótulo legible de cada bloque, para la estructura del documento. */
const BLOCK_LABEL: Record<StructuralBlock, string> = {
  ENCABEZADO: 'AUTORIDAD DESTINATARIA',
  AUTORIDAD: 'ÓRGANO ANTE EL QUE SE PRESENTA',
  COMPARECENCIA: 'COMPARECENCIA',
  PERSONALIDAD: 'PERSONALIDAD',
  IDENTIFICACION_PARTES: 'IDENTIFICACIÓN DE PARTES',
  VIA_ACCION: 'VIA DE LA ACCIÓN O PROCEDIMIENTO',
  PRESTACIONES: 'PRESTACIONES RECLAMADAS',
  HECHOS: 'HECHOS',
  ANTECEDENTES: 'ANTECEDENTES',
  DERECHO: 'FUNDAMENTOS DE DERECHO',
  PRUEBAS: 'PRUEBAS',
  AGRAVIOS: 'AGRAVIOS',
  CONCEPTOS_VIOLACION: 'CONCEPTOS DE VIOLACIÓN',
  CONSIDERACIONES_COMBATIDAS: 'CONSIDERACIONES COMBATIDAS',
  INTERES_EXCEPCIONAL: 'INTERÉS EXCEPCIONAL',
  SUSPENSION: 'SOLICITUD DE SUSPENSIÓN',
  ACTO_RECLAMADO: 'ACTO RECLAMADO',
  CONCLUYENTE: 'CONCLUYENTE',
  ALEGATOS: 'ALEGATOS',
  OBJETO: 'OBJETO',
  EXPUESTO: 'EXPUESTO',
  FUNDAMENTOS: 'FUNDAMENTOS',
  EFECTOS: 'EFECTOS SOLICITADOS',
  PETITORIOS: 'PETITORIOS',
  PROTESTO: 'PROTESTO',
  LUGAR_FECHA: 'LUGAR Y FECHA',
  FIRMA: 'FIRMA',
};

/** Normaliza un id de tipo para emparejarlo con los triggers por palabra. */
export function typeTriggerTokens(tipo: string): string[] {
  return tipo
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[_\s-]+/).filter(token => token.length > 3);
}

/**
 * Compone la estructura de un tipo concreto a partir del blueprint de su
 * familia. Los bloques opcionales sólo se agregan cuando el ID del tipo
 * dispara su trigger, para que no se materialicen secciones que no aplican.
 */
export function composeFamilyStructure(familyId: string, tipo: string): string[] | null {
  const blueprint = FAMILY_BLUEPRINTS[familyId];
  if (!blueprint) return null;
  const blocks = new Set<StructuralBlock>(blueprint.blocks);
  const tokens = typeTriggerTokens(tipo);
  for (const [trigger, extra] of Object.entries(blueprint.optionalTriggers || {})) {
    if (tokens.some(token => token === trigger || token.startsWith(trigger))) {
      for (const block of extra) blocks.add(block);
    }
  }
  return [...blocks].map(block => BLOCK_LABEL[block]);
}

export function familyBlueprintFor(familyId: string): FamilyBlueprint | undefined {
  return FAMILY_BLUEPRINTS[familyId];
}

export function declaredFamilyIds(): string[] {
  return Object.keys(FAMILY_BLUEPRINTS).sort();
}