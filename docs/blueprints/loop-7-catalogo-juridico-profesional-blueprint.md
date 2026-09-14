# APP Plantillas — Blueprint de LOOP 7

> Generado por The Architect el 2026-09-01  
> Arquetipo: aplicación web local-first de workspace jurídico (Next.js App Router + TypeScript)

## 1. Decisión ejecutiva

LOOP 7 introduce un catálogo jerárquico profesional sin convertir el catálogo en una lista plana ni fingir que cada entrada es generable. La única fuente declarativa será un registry de áreas, procedimientos, familias y tipos documentales. `DocumentTemplates`, `documentTypes`, `matters`, `procedures` y `sourceOutputCompatibility` quedarán como adaptadores o consumidores del registry, no como catálogos paralelos.

El alcance de esta entrega es catálogo, contratos, navegación y pruebas estructurales. No se crean cientos de estrategias ni plantillas nuevas. Los tipos nuevos empiezan como `CATALOG_ONLY`, `REQUIRES_OFFICIAL_FORM` o `ASSISTED_DRAFT`; únicamente los 17 outputs que ya funcionan conservan `IMPLEMENTED`.

### Conteo de diseño

- Áreas jurídicas canónicas: **20**.
- IDs propuestos únicos: **278**; la especificación contiene 279 viñetas, el duplicado `carta_intencion` se registra una sola vez y `señalamiento_correo` se normaliza a ASCII.
- IDs legacy actuales: **33**; 7 coinciden con la propuesta.
- Unión después de deduplicar y normalizar: **304 IDs** (278 propuestos + 33 legacy − 7 coincidencias).
- Normalización: `señalamiento_correo` → `senalamiento_correo` sin conservar un ID con acento; la normalización no agrega un segundo nodo.
- Registry final previsto: **304 identificadores únicos**, contando tipos, familias legacy y aliases de compatibilidad. El conteo de documentos generables se deriva de `kind === 'DOCUMENT_TYPE'`, nunca de una constante manual.
- Implementados inicialmente: **17**.
- `PARTIAL` iniciales: **0**; no se etiquetan como parciales implementaciones que no existen.
- Nuevos no generables inicialmente: catálogo, formulario oficial o borrador asistido según la clasificación documentada abajo.

## 2. Modelo de datos

El modelo distingue nodos de navegación de outputs. Una familia puede tener hijos y nunca entra al pipeline como `selectedDocumentType`. Un alias conserva compatibilidad de entrada, pero se normaliza antes de resolver strategy/template.

```ts
export type CatalogNodeKind = 'AREA' | 'PROCEDURE' | 'FAMILY' | 'DOCUMENT_TYPE' | 'LEGACY_ALIAS';

export type CatalogStatus =
  | 'IMPLEMENTED'
  | 'PARTIAL'
  | 'CATALOG_ONLY'
  | 'REQUIRES_OFFICIAL_FORM'
  | 'ASSISTED_DRAFT'
  | 'NOT_APPLICABLE';

export type UiVisibility = 'VISIBLE' | 'HIDDEN' | 'LEGACY_ONLY';

export interface LegalArea {
  id: string;
  label: string;
  description: string;
  aliases: readonly string[];
  uiVisibility: UiVisibility;
}

export interface LegalProcedure {
  id: string;
  areaId: string;
  label: string;
  description: string;
  aliases: readonly string[];
  uiVisibility: UiVisibility;
}

export interface DocumentFamily {
  id: string;
  areaId: string;
  procedureId: string;
  label: string;
  description: string;
  uiVisibility: UiVisibility;
  status: 'NOT_APPLICABLE';
}

export interface SourceCompatibilityDeclaration {
  sourceRequired: boolean;
  acceptedSourceTypes: readonly string[];
  incompatibleSourceTypes?: readonly string[];
  incompatibleMatterIds?: readonly string[];
}

export interface CanonicalDocumentType {
  kind: 'DOCUMENT_TYPE';
  id: string;
  label: string;
  description: string;
  areaId: string;
  procedureId: string;
  familyId: string;
  aliases: readonly string[];
  strategyId: string | null;
  templateId: string | null;
  implemented: boolean;
  sourceCompatibility: SourceCompatibilityDeclaration | null;
  requiredFields: readonly string[];
  requiredSections: readonly string[];
  outputFilename: string | null;
  jurisdiction: string;
  legalStage: string;
  partyRole: string;
  uiVisibility: UiVisibility;
  status: CatalogStatus;
}

export interface LegacyAlias {
  kind: 'LEGACY_ALIAS';
  id: string;
  label: string;
  targetId: string;
  reason: string;
  uiVisibility: 'LEGACY_ONLY';
  status: 'NOT_APPLICABLE';
}

export interface LegalCatalogRegistry {
  areas: readonly LegalArea[];
  procedures: readonly LegalProcedure[];
  families: readonly DocumentFamily[];
  documents: readonly CanonicalDocumentType[];
  aliases: readonly LegacyAlias[];
}

export interface LegalCatalogStats {
  areaCount: number;
  procedureCount: number;
  familyCount: number;
  documentTypeCount: number;
  aliasCount: number;
  coveredDocumentIdentifierCount: number;
  legacyDocumentIdentifierCount: number;
  proposedDocumentIdentifierCount: number;
}
```

### Contratos derivados

- `implemented === true` exige `status === IMPLEMENTED`, `strategyId`, `templateId` y una declaración de source compatibility.
- `status === CATALOG_ONLY`, `REQUIRES_OFFICIAL_FORM` o `ASSISTED_DRAFT` no puede tener strategy/template generable.
- `status === NOT_APPLICABLE` se usa para familias y aliases, nunca para un output final.
- `outputFilename` es patrón semántico, por ejemplo `{label} - {date}.docx`; no contiene expedientes, personas o PDFs.
- `requiredFields`, `requiredSections`, materia, jurisdicción, etapa y rol son metadata de validación; no sustituyen las reglas jurídicas de la strategy.
- `acceptedSourceTypes` solo es obligatorio para `IMPLEMENTED`. Para otros estados permanece vacío y no crea compatibilidad implícita.

## 3. Jerarquía canónica

```text
LegalArea
└── LegalProcedure
    └── DocumentFamily
        └── CanonicalDocumentType
```

La UI usa una cuarta pregunta de intención entre familia y documento:

```text
Materia → Procedimiento → Qué quieres hacer → Documento
```

`AREA`, `PROCEDURE` y `FAMILY` son navegación. Solo `DOCUMENT_TYPE` con estado `IMPLEMENTED` puede llegar a generación. Un nodo sin hijo generable se muestra como contexto o “próximamente”, nunca como un output válido.

## 4. Las 20 materias canónicas

| ID | Etiqueta | Nota de alcance |
|---|---|---|
| `civil` | Civil | Obligaciones, responsabilidad, acciones y procesos civiles |
| `mercantil` | Mercantil | Juicios y actuaciones regidas por legislación mercantil |
| `familiar` | Familiar | Estado familiar, alimentos, custodia y convivencia |
| `laboral` | Laboral | Litigio laboral; no se mezcla con civil |
| `administrativo` | Administrativo | Actos, nulidad y responsabilidad administrativa |
| `fiscal` | Fiscal | Defensa y procedimientos fiscales |
| `constitucional_amparo` | Constitucional / Amparo | Amparo y control constitucional |
| `penal` | Penal | Investigación, juicio y ejecución penal |
| `agrario` | Agrario | Justicia agraria |
| `corporativo_societario` | Corporativo / Societario | Actos societarios y gobierno corporativo |
| `contractual` | Contractual | Contratos y convenios no litigiosos |
| `inmobiliario` | Inmobiliario | Operaciones y controversias inmobiliarias |
| `sucesorio` | Sucesorio | Sucesiones y partición hereditaria |
| `propiedad_intelectual` | Propiedad Intelectual | Marcas, patentes y derechos de autor |
| `proteccion_consumidor` | Protección al consumidor | PROFECO y conciliación de consumo |
| `seguridad_social` | Seguridad Social | Pensiones y prestaciones sociales |
| `electoral` | Electoral | Medios de impugnación político-electorales aislados |
| `migratorio` | Migratorio | Estancia, regularización y defensa migratoria |
| `transparencia_datos_personales` | Transparencia / Datos personales | Acceso, ARCO y recursos |
| `escritos_generales` | Escritos generales de trámite | Promociones y solicitudes transversales |

### Aliases de materia existentes

Los valores actuales `amparo`, `constitucional`, `corporativo`, `transparencia`, `procesal`, `otro`, `ambiental`, `energia`, `salud`, `financiero`, `aduanero`, `contratacion_publica`, `responsabilidad_patrimonial`, `notarial` y `derechos_humanos` no se eliminan. Se resuelven como aliases de área o como subáreas futuras:

- `amparo`, `constitucional` → `constitucional_amparo`.
- `corporativo` → `corporativo_societario`.
- `transparencia` → `transparencia_datos_personales`.
- `procesal`, `otro` → `escritos_generales` solo para navegación/compatibilidad.
- `ambiental`, `energia`, `salud`, `aduanero`, `contratacion_publica`, `responsabilidad_patrimonial` → `administrativo` con alias de especialidad.
- `financiero` → `mercantil` o `corporativo_societario` según el procedimiento elegido; no se adivina desde el texto.
- `notarial` → `contractual`/`corporativo_societario` como especialidad, no como generador litigioso.
- `derechos_humanos` → `constitucional_amparo` como contexto, sin convertir automáticamente el escrito en amparo.

## 5. Árbol completo previsto

El siguiente árbol es el inventario de la primera carga. Los IDs que contienen una descripción de “familia” se registran como `FAMILY` o alias; los demás son tipos documentales. Los documentos sin strategy/template se crean con estado de catálogo y no entran a generación.

El conteo de 304 se refiere únicamente a identificadores documentales cubiertos por la unión propuesta + legacy (`DOCUMENT_TYPE`, `FAMILY` y `LEGACY_ALIAS`), no a la suma de nodos estructurales de áreas, procedimientos y familias. El registry expondrá `getCatalogStats()` y los tests calcularán todos los conteos desde los arrays; no habrá un número hardcodeado que pueda divergir del inventario machine-readable.

### CIVIL

```text
CIVIL
├── JUICIOS DECLARATIVOS Y ORALES
│   ├── demandas: demanda_ordinaria_civil, demanda_oral_civil, demanda_responsabilidad_civil
│   ├── acciones: demanda_cumplimiento_contrato, demanda_rescision_contrato, demanda_pago_pesos,
│   │              demanda_danos_perjuicios, demanda_prescripcion, demanda_usucapion,
│   │              demanda_accion_reivindicatoria, demanda_interdicto, demanda_arrendamiento
│   └── contestaciones: contestacion_demanda_civil, contestacion_demanda_oral_civil,
│                       contestacion_demanda_arrendamiento
├── RECONVENCIÓN
│   ├── reconvencion_civil
│   └── contestacion_reconvencion_civil
├── PRUEBA Y CIERRE
│   ├── ofrecimiento_pruebas_civil, objecion_pruebas_civil, desahogo_vista_civil
│   ├── alegatos_civil
│   └── conclusiones_civil [ASSISTED_DRAFT]
├── INCIDENTES
│   ├── incidente_nulidad_actuaciones, incidente_liquidacion, incidente_costas
│   ├── incidente_ejecucion, incidente_cumplimiento, incidente_personalidad
│   └── incidente_competencia, incidente_acumulacion
├── CAUTELARES
│   ├── solicitud_medida_cautelar_civil, providencia_precautoria
│   └── solicitud_embargo_precautorio
├── RECURSOS
│   ├── apelacion_civil, revocacion_civil, queja_civil
│   └── aclaracion_sentencia_civil
└── EJECUCIÓN
    ├── solicitud_ejecucion_sentencia_civil
    ├── liquidacion_sentencia_civil
    └── requerimiento_cumplimiento_sentencia
```

### MERCANTIL

```text
MERCANTIL
├── JUICIOS
│   ├── demanda_ordinaria_mercantil, demanda_ejecutiva_mercantil, demanda_oral_mercantil
│   └── contestacion_demanda_mercantil [CATALOG_ONLY inicialmente]
├── RECONVENCIÓN Y DEFENSAS
│   ├── reconvencion_mercantil, contestacion_reconvencion_mercantil
│   └── excepciones_mercantiles
├── PRUEBA Y ARGUMENTACIÓN
│   ├── ofrecimiento_pruebas_mercantil, objecion_documentos_mercantil
│   └── alegatos_mercantil
├── RECURSOS
│   ├── apelacion_mercantil, revocacion_mercantil
│   └── aclaracion_sentencia_mercantil
├── EJECUCIÓN
│   ├── ejecucion_sentencia_mercantil, liquidacion_mercantil
│   └── embargo_mercantil
└── CAUTELARES
    └── providencias_precautorias_mercantiles
```

`contestacion_demanda_civil` conserva su output y puede aceptar fuente mercantil. `contestacion_demanda_mercantil` se normaliza como alias de catálogo hacia `contestacion_demanda_civil`, por lo que no crea una rama huérfana de strategy/template.

### FAMILIAR

```text
FAMILIAR
├── DIVORCIO: demanda_divorcio, convenio_divorcio, contestacion_divorcio
├── ALIMENTOS: demanda_alimentos, contestacion_alimentos, solicitud_alimentos_provisionales
├── GUARDA Y CONVIVENCIA: demanda_guarda_custodia, contestacion_guarda_custodia,
│   demanda_regimen_convivencias, modificacion_convivencias
├── FILIACIÓN Y FAMILIA: perdida_patria_potestad, reconocimiento_paternidad,
│   desconocimiento_paternidad, adopcion, convenio_familiar, medidas_proteccion_familiar
├── NO CONTENCIOSO: jurisdiccion_voluntaria_familiar, liquidacion_sociedad_conyugal
├── INCIDENTES: incidente_modificacion_pension, incidente_reduccion_pension,
│   incidente_incremento_pension
├── EJECUCIÓN Y RECURSOS: ejecucion_convenio_familiar, apelacion_familiar
└── ARGUMENTACIÓN: alegatos_familiar
```

### LABORAL

```text
LABORAL
├── LITIGIO: demanda_laboral, contestacion_demanda_laboral,
│   reconvencion_laboral, contestacion_reconvencion_laboral, ampliacion_demanda_laboral
├── PRUEBA Y PREVENCIÓN: ofrecimiento_pruebas_laboral, objecion_pruebas_laboral,
│   desahogo_prevencion_laboral
├── CIERRE: alegatos_laborales
├── INCIDENTES: incidente_laboral [FAMILY/GENERIC]
├── EJECUCIÓN: cumplimiento_laudo_sentencia_laboral, ejecucion_sentencia_laboral
├── RECURSOS: recurso_laboral [FAMILY/GENERIC]
└── AMPARO CONTEXTUAL: amparo_directo_laboral [FAMILY], demanda_amparo_directo_laboral,
    demanda_amparo_indirecto_laboral
```

### CONSTITUCIONAL / AMPARO

```text
CONSTITUCIONAL_AMPARO
├── FAMILIAS: amparo_directo, amparo_indirecto
├── DEMANDAS: demanda_amparo_indirecto, demanda_amparo_directo, ampliacion_demanda_amparo
├── ADHESIVO Y SUSPENSIÓN: amparo_adhesivo, solicitud_suspension_provisional,
│   solicitud_suspension_definitiva
├── ARGUMENTACIÓN: alegatos_amparo
├── RECURSOS: recurso_revision_amparo, recurso_queja_amparo,
│   recurso_reclamacion_amparo, recurso_inconformidad_amparo
├── CUMPLIMIENTO: cumplimiento_ejecutoria_amparo, promocion_cumplimiento_amparo,
│   manifestaciones_cumplimiento_amparo
└── POST-SENTENCIA: contestacion_revision_extraordinaria_amparo_directo
```

### ADMINISTRATIVO Y FISCAL

```text
ADMINISTRATIVO
├── NULIDAD: demanda_nulidad_administrativa, contestacion_nulidad_administrativa,
│   ampliacion_demanda_nulidad, contestacion_ampliacion_nulidad
├── CIERRE: alegatos_administrativos, cumplimiento_sentencia_administrativa
├── RECURSOS: recurso_administrativo, recurso_revision_administrativa
├── INCIDENTES: incidente_administrativo [FAMILY/GENERIC]
└── CAUTELAR: solicitud_suspension_acto_administrativo

FISCAL
├── NULIDAD: demanda_nulidad_fiscal, contestacion_nulidad_fiscal,
│   ampliacion_demanda_fiscal, contestacion_ampliacion_fiscal
├── RECURSOS: recurso_revocacion_fiscal, recurso_revision_fiscal
├── CIERRE: alegatos_fiscales, cumplimiento_sentencia_fiscal
├── CAUTELAR: solicitud_suspension_fiscal
└── AUTORIDAD: escritos_ante_autoridad_fiscal
```

### PENAL

```text
PENAL
├── INVESTIGACIÓN: denuncia, querella, ampliacion_denuncia, ampliacion_querella,
│   escrito_asesor_juridico, escrito_defensa, solicitud_actos_investigacion,
│   solicitud_acceso_carpeta, solicitud_copias_carpeta, solicitud_medida_proteccion
├── MEDIDAS Y AUDIENCIA: oposicion_medida_cautelar [ASSISTED_DRAFT],
│   solicitud_revision_medida_cautelar [ASSISTED_DRAFT],
│   acuerdo_reparatorio_propuesta [ASSISTED_DRAFT]
├── INTERVENCIÓN: escrito_coadyuvancia
├── RECURSOS: apelacion_penal, revocacion_penal
├── AMPARO CONTEXTUAL: amparo_indirecto_penal [FAMILY], amparo_directo_penal [FAMILY]
└── EJECUCIÓN: escrito_ejecucion_penal
```

### AGRARIO Y SUCESORIO

```text
AGRARIO
├── JUICIO: demanda_agraria, contestacion_demanda_agraria, reconvencion_agraria
├── CIERRE: alegatos_agrarios, cumplimiento_sentencia_agraria
├── INCIDENTES: incidente_agrario [FAMILY/GENERIC]
├── RECURSOS: recurso_agrario
└── AMPARO CONTEXTUAL: amparo_agrario [FAMILY]

SUCESORIO
├── APERTURA: denuncia_sucesion_testamentaria, denuncia_sucesion_intestamentaria
├── HERENCIA Y ALBACEA: aceptacion_herencia, repudiacion_herencia, nombramiento_albacea
├── MASA Y PARTICIÓN: inventario_avaluo, proyecto_particion, adjudicacion
├── CONTROVERSIA: oposicion_sucesoria, incidente_sucesorio [FAMILY/GENERIC]
└── ACUERDO: convenio_herederos
```

### CORPORATIVO, CONTRACTUAL E INMOBILIARIO

```text
CORPORATIVO_SOCIETARIO
├── CONSTITUCIÓN Y ESTATUTOS: constitucion_sociedad, modificacion_estatutos
├── ASAMBLEAS Y CONSEJO: acta_asamblea_ordinaria, acta_asamblea_extraordinaria,
│   resoluciones_unanimidad, acta_consejo
├── CAPITAL: aumento_capital, reduccion_capital
├── PARTICIPACIÓN: cesion_partes_sociales, compraventa_acciones
├── PODERES: poderes, revocacion_poder
└── ACUERDOS: convenio_accionistas, acuerdo_confidencialidad, carta_intencion

CONTRACTUAL
├── CONTRATOS: contrato_compraventa, contrato_arrendamiento, contrato_prestacion_servicios,
│   contrato_obra, contrato_mutuo, contrato_comodato, contrato_mandato, contrato_comision,
│   contrato_distribucion, contrato_suministro, contrato_confidencialidad, contrato_licencia
├── CONVENIOS: convenio_transaccional, convenio_reconocimiento_adeudo,
│   convenio_terminacion, convenio_modificatorio
└── PRECONTRACTUAL: carta_intencion [ID ÚNICO], memorando_entendimiento

INMOBILIARIO
├── OPERACIONES: promesa_compraventa_inmueble, compraventa_inmueble, arrendamiento_inmueble
├── TERMINACIÓN Y COBRO: terminacion_arrendamiento, requerimiento_pago_rentas,
│   aviso_terminacion, convenio_desocupacion, reconocimiento_adeudo_arrendamiento
└── LITIGIO: demanda_desocupacion
```

### PROPIEDAD INTELECTUAL, CONSUMIDOR, SEGURIDAD SOCIAL

```text
PROPIEDAD_INTELECTUAL
├── MARCAS Y REGISTRO OFICIAL: solicitud_registro_marca [REQUIRES_OFFICIAL_FORM],
│   contestacion_impedimento [REQUIRES_OFFICIAL_FORM], oposicion_marca [REQUIRES_OFFICIAL_FORM],
│   nulidad_registro [REQUIRES_OFFICIAL_FORM], caducidad_registro [REQUIRES_OFFICIAL_FORM]
├── INFRACCIÓN Y RECURSOS: infraccion_propiedad_industrial [REQUIRES_OFFICIAL_FORM],
│   recurso_propiedad_intelectual [REQUIRES_OFFICIAL_FORM]
└── CONTRATOS: contrato_licencia_marca, cesion_derechos_marca, licencia_derechos_autor,
    cesion_derechos_autor

PROTECCION_CONSUMIDOR
├── RECLAMACIÓN: reclamacion_consumidor, queja_consumidor
├── PROVEEDOR: contestacion_proveedor
├── CONCILIACIÓN: convenio_conciliatorio
├── PROCEDIMIENTO: escrito_procedimiento_infracciones
└── RECURSO: recurso_consumidor

SEGURIDAD_SOCIAL
├── CONTROVERSIA: inconformidad_seguridad_social, demanda_seguridad_social,
│   contestacion_seguridad_social, recurso_seguridad_social
├── AMPARO CONTEXTUAL: amparo_seguridad_social [FAMILY]
└── PENSIONES: solicitud_pension [CATALOG_ONLY], impugnacion_pension
```

### ELECTORAL, MIGRATORIO, TRANSPARENCIA Y ESCRITOS GENERALES

```text
ELECTORAL
├── MEDIOS: juicio_proteccion_derechos_politico_electorales, juicio_inconformidad,
│   recurso_apelacion_electoral, recurso_revision_electoral
└── PARTES: escrito_tercero_interesado_electoral, alegatos_electorales

MIGRATORIO
├── ADMINISTRATIVO: solicitud_regularizacion, recurso_revision_migratoria,
│   escrito_autoridad_migratoria, alegatos_migratorios
└── AMPARO CONTEXTUAL: amparo_migratorio [FAMILY]

TRANSPARENCIA_DATOS_PERSONALES
├── INFORMACIÓN: solicitud_acceso_informacion, recurso_revision_transparencia
├── ARCO: solicitud_derechos_arco [REQUIRES_OFFICIAL_FORM], recurso_datos_personales
└── CUMPLIMIENTO: escrito_cumplimiento_transparencia

ESCRITOS_GENERALES
├── FAMILIA LEGACY: promocion_simple, solicitud, promocion
├── PREVENCIONES: desahogo_prevencion, cumplimiento_requerimiento, cumplimiento_prevencion
├── MANIFESTACIONES: manifestaciones, comparecencia, ratificacion
├── COPIAS Y EXPEDIENTE: solicitud_copias, solicitud_copias_certificadas,
│   solicitud_acceso_expediente, solicitud_certificacion
├── REPRESENTACIÓN: autorizacion_abogados, revocacion_autorizados,
│   cambio_domicilio_procesal, senalamiento_correo
├── IMPULSO: impulso_procesal, solicitud_acumulacion, solicitud_archivo, solicitud_desarchivo
└── TERMINACIÓN: desistimiento, allanamiento, convenio_judicial, aclaracion,
    correccion_error, solicitud_devolucion_documentos, escrito_libre
```

## 6. Revisión de la propuesta: duplicados y clasificación

### Duplicados o solapamientos resueltos

- `carta_intencion` aparece en corporativo y contractual: queda un único ID bajo `contractual/precontractual`; corporativo lo referencia por alias/contexto.
- `escrito_libre` ya existe: se conserva una sola entrada implementada y `otro` se registra formalmente como `LEGACY_ALIAS → escrito_libre` con `uiVisibility: LEGACY_ONLY`. El alias solo se resuelve cuando no hay `selectedDocumentType` explícito; una selección explícita de `otro` no habilita fallback silencioso.
- `demanda_amparo_directo`, `demanda_amparo_indirecto`, `contestacion_demanda_laboral`, `contestacion_demanda_civil`, `recurso_administrativo` y `contestacion_revision_extraordinaria_amparo_directo` ya existen: no se duplican.
- `recurso_revision_amparo` es el nombre profesional de catálogo; `recurso_revision_amparo_directo` se conserva como canonical legacy implementado hasta una migración explícita.
- `recurso_queja_amparo` y `recurso_reclamacion_amparo` son IDs específicos de amparo; no sustituyen los IDs legacy generales.
- `contrato_confidencialidad` y `acuerdo_confidencialidad` no son duplicados exactos: el primero es contrato bilateral; el segundo, acuerdo societario o intercompañía, y ambos quedan `CATALOG_ONLY`.
- `arrendamiento` civil y `arrendamiento_inmueble` se distinguen por alcance; no se fusionan automáticamente.
- `solicitud_acumulacion` es trámite general; `incidente_acumulacion` es incidente civil específico.

### Nombres demasiado genéricos

`demanda`, `contestacion_demanda`, `reconvencion`, `ampliacion`, `incidente`, `recurso`, `recurso_revision`, `apelacion`, `revocacion`, `queja`, `reclamacion`, `agravios`, `alegatos`, `promocion`, `solicitud`, `amparo_directo`, `amparo_indirecto` y `otro` no se usan para inventar una strategy. Los actuales se conservan como outputs solo donde ya están implementados; los demás son familias, aliases o sentinels `NOT_APPLICABLE`.

### Familias que no son outputs

Además de los 15 IDs genéricos legacy anteriores, se modelan como familias/contexto `amparo_directo_laboral`, `amparo_directo_penal`, `amparo_indirecto_penal`, `amparo_agrario`, `amparo_migratorio` y `amparo_seguridad_social`. Los outputs concretos deben llevar la acción documental (`demanda_...`, `recurso_...`, etc.).

### Formularios oficiales

Se marca `REQUIRES_OFFICIAL_FORM` para trámites dependientes de portal o formato oficial, inicialmente: `solicitud_registro_marca`, `contestacion_impedimento`, `oposicion_marca`, `nulidad_registro`, `caducidad_registro`, `infraccion_propiedad_industrial`, `recurso_propiedad_intelectual` y `solicitud_derechos_arco`. El catálogo puede ayudar a reunir datos, pero no genera un escrito libre fingiendo que reemplaza el formulario.

### ASSISTED_DRAFT

Se marcan inicialmente `conclusiones_civil`, `oposicion_medida_cautelar`, `solicitud_revision_medida_cautelar` y `acuerdo_reparatorio_propuesta`. Su función futura será preparar guion, checklist, hechos confirmados y puntos para audiencia; no simular una actuación oral como demanda.

### Correcciones de materia/procedimiento

- Laboral y seguridad social quedan separados; pensiones no se enrutan a juicio laboral por coincidencia textual.
- Contratos y actos societarios no entran al renderer litigioso por defecto.
- Electoral es módulo jurisdiccionalmente aislado.
- Amparo es constitucional; “amparo penal/agrario/migratorio” es contexto de materia, no un output genérico.
- Sucesorio es área propia; no se oculta dentro de familiar aunque la UI pueda ofrecer “familia”.
- Inmobiliario contiene operaciones y litigio; contractual contiene el instrumento, no la demanda derivada.

## 7. Migración exacta de los 33 IDs actuales

| ID actual | Tratamiento | Estado final |
|---|---|---|
| `demanda` | Se conserva como output general actual | `IMPLEMENTED` |
| `contestacion_demanda` | Se conserva como contestación general actual | `IMPLEMENTED` |
| `reconvencion` | Familia legacy de reconvenciones | `NOT_APPLICABLE` |
| `ampliacion` | Familia legacy de ampliaciones | `NOT_APPLICABLE` |
| `replica` | Se conserva | `IMPLEMENTED` |
| `duplica` | Se conserva | `IMPLEMENTED` |
| `incidente` | Familia legacy de incidentes | `NOT_APPLICABLE` |
| `recurso` | Familia legacy de recursos | `NOT_APPLICABLE` |
| `apelacion` | Familia legacy de apelaciones | `NOT_APPLICABLE` |
| `revocacion` | Familia legacy de revocaciones | `NOT_APPLICABLE` |
| `queja` | Familia legacy de quejas | `NOT_APPLICABLE` |
| `reclamacion` | Familia legacy de reclamaciones | `NOT_APPLICABLE` |
| `amparo_directo` | Familia constitucional, no output directo | `NOT_APPLICABLE` |
| `amparo_indirecto` | Familia constitucional, no output directo | `NOT_APPLICABLE` |
| `agravios` | Familia de argumentación | `NOT_APPLICABLE` |
| `alegatos` | Familia de argumentación | `NOT_APPLICABLE` |
| `promocion` | Familia de escritos de trámite | `NOT_APPLICABLE` |
| `solicitud` | Familia de solicitudes | `NOT_APPLICABLE` |
| `escrito_libre` | Output seguro existente | `IMPLEMENTED` |
| `recurso_queja` | Se conserva como output existente | `IMPLEMENTED` |
| `recurso_reclamacion` | Se conserva como output existente | `IMPLEMENTED` |
| `recurso_revision` | Familia/recurso genérico legacy | `NOT_APPLICABLE` |
| `recurso_administrativo` | Se conserva como output existente | `IMPLEMENTED` |
| `recurso_revision_amparo_directo` | Se conserva; alias de catálogo profesional | `IMPLEMENTED` |
| `demanda_amparo_indirecto` | Se conserva | `IMPLEMENTED` |
| `demanda_amparo_directo` | Se conserva | `IMPLEMENTED` |
| `contestacion_demanda_laboral` | Se conserva | `IMPLEMENTED` |
| `contestacion_demanda_civil` | Se conserva; acepta fuente mercantil | `IMPLEMENTED` |
| `escrito_cumplimiento_sentencia` | Se conserva | `IMPLEMENTED` |
| `contestacion_revision_extraordinaria_amparo_directo` | Se conserva con preflight de procedencia | `IMPLEMENTED` |
| `escrito_agravios` | Se conserva | `IMPLEMENTED` |
| `incidente_procesal` | Se conserva como incidente concreto | `IMPLEMENTED` |
| `otro` | `LEGACY_ALIAS → escrito_libre`; fallback solo sin selección explícita | `NOT_APPLICABLE` |

La migración nunca cambia silenciosamente un ID seleccionado por otro de otra familia. `otro` no se convierte en un nuevo documento; conserva únicamente el contrato legacy ya probado y queda fuera de los outputs canónicos.

## 8. Convención de nombres

- ASCII, minúsculas, `snake_case`, sin acentos, sin abreviaturas ambiguas.
- Patrón preferido: `{acto}_{objeto}_{materia}` o `{acto}_{procedimiento}_{materia}`.
- La materia específica se incluye cuando evita ambigüedad: `contestacion_demanda_civil`, `apelacion_mercantil`.
- Acciones de amparo usan `demanda_amparo_directo`/`indirecto`, nunca `amparo_directo` como output.
- Un ID no cambia de significado; nuevos nombres se agregan con alias explícito y periodo de compatibilidad.
- `señalamiento_correo` no es canonical; su forma normalizada es `senalamiento_correo`.
- No usar números de expediente, nombres de personas, nombres de archivos, municipios o fechas en IDs.

## 9. Registry único y relación con el motor

Archivo propuesto: `lib/catalog/legalCatalog.ts` como registry central. La migración no agrega otro catálogo paralelo.

```text
lib/catalog/legalCatalog.ts
  ├── LEGAL_CATALOG_REGISTRY
  ├── LEGAL_AREAS
  ├── LEGAL_PROCEDURES
  ├── DOCUMENT_FAMILIES
  ├── CANONICAL_DOCUMENT_TYPES
  ├── LEGACY_ALIASES
  ├── getCatalogDocument(idOrAlias)
  ├── getCatalogChildren(areaId, procedureId, familyId)
  └── searchCatalog(query)

lib/legal-taxonomy/documentTypes.ts  → proyección legacy de 33 entradas
lib/legal-taxonomy/matters.ts        → proyección de áreas + aliases de materia
lib/legal-taxonomy/procedures.ts     → proyección de procedimientos compatibles
lib/legal-engine/documentSupportMatrix.ts → vista de soporte del registry
lib/legal-engine/sourceOutputCompatibility.ts → políticas derivadas para IMPLEMENTED
lib/legal-engine/documentRouting.ts   → resuelve solo DOCUMENT_TYPE generable
```

### Contrato de derivación sin duplicación

`LEGAL_CATALOG_REGISTRY` se construye una sola vez desde seeds declarativos del mismo archivo. Las proyecciones no contienen listas documentales propias:

```ts
export const DOCUMENT_TYPES = getLegacyDocumentTypes(LEGAL_CATALOG_REGISTRY);
export const MATTERS = getLegacyMatters(LEGAL_CATALOG_REGISTRY);
export const PROCEDURES = getLegacyProcedures(LEGAL_CATALOG_REGISTRY);
export const SOURCE_OUTPUT_COMPATIBILITY_RULES =
  buildSourceCompatibilityRules(LEGAL_CATALOG_REGISTRY);
```

`DocumentTemplates` sigue siendo el inventario de implementación de templates existentes, pero el estado y la identidad canónica viven en el registry. El adaptador verifica que cada `IMPLEMENTED` coincida con una clave real de `DocumentTemplates`; no se copia el catálogo de templates a otro array. El único manifiesto esperado en tests será la lista de los 33 IDs legacy para detectar regresiones, nunca una segunda fuente productiva.

El registry exporta `getCatalogStats()` y `getCatalogInventory()`; ambos recorren el mismo registro que consume la UI y sirven como inventario machine-readable auditable. La prueba de conteo compara `proposedDocumentIdentifierCount + legacyDocumentIdentifierCount - overlapCount` con `coveredDocumentIdentifierCount` y valida que la normalización de `señalamiento_correo` no cree un duplicado.

`strategyId` y `templateId` se comparan con los identificadores reales de `DocumentTemplates`. La regla es fail-closed:

1. Resolver ID o alias.
2. Rechazar `FAMILY`, `AREA`, `PROCEDURE` y `NOT_APPLICABLE`.
3. Rechazar `CATALOG_ONLY`, `REQUIRES_OFFICIAL_FORM` y `ASSISTED_DRAFT` con `DOCUMENT_TYPE_NOT_IMPLEMENTED` o error específico de formulario/asistencia.
4. Para `IMPLEMENTED`, verificar strategy, template y source compatibility.
5. Ejecutar routing canónico y conservar `selectedDocumentType`.

## 10. Source → output y default-deny

Cada `IMPLEMENTED` tiene una declaración explícita. `sourceOutputCompatibility` construye su política desde esa declaración y conserva los códigos actuales (`SOURCE_DOCUMENT_INCOMPATIBLE`, `EXTRACTION_INCOMPLETE`, `MISSING_SOURCE_COMPATIBILITY_RULE`).

- Sin regla para un `IMPLEMENTED`: `MISSING_SOURCE_COMPATIBILITY_RULE`.
- Fuente incompatible: error explícito; nunca se intenta otra plantilla.
- Fuente no clasificada: `NEEDS_INPUT`, no compatibilidad.
- `CATALOG_ONLY` no llega a esta evaluación porque se bloquea antes.
- `sourceDocumentType` aporta contexto, no sustituye `selectedDocumentType`.
- Las familias `amparo_directo`/`amparo_indirecto` jamás se convierten en `demanda_...`.
- La compatibilidad mercantil existente permanece en `contestacion_demanda_civil`; `contestacion_demanda_mercantil` se resuelve como alias al output civil compartido.

## 11. Diseño de UI

La UI existente sigue funcionando durante la migración. Se añade progresivamente un navegador de catálogo que no muestra 304 botones.

```text
Catálogo jurídico
├── búsqueda global [nombre, alias, descripción]
├── Materia
│   └── Procedimiento
│       └── Qué quieres hacer / Familia
│           └── Documento
│               ├── descripción
│               ├── fuente requerida y datos faltantes
│               ├── estado: Disponible / En desarrollo / Requiere formato oficial
│               └── acción Generar solo si IMPLEMENTED
```

Decisiones UX:

- Navegación progresiva con breadcrumb y botón Atrás.
- Búsqueda con debounce, resultados agrupados por materia y familia.
- Alias y plural/singular apuntan al mismo canonical ID.
- Estados comunicados con texto e icono, nunca solo color.
- `CATALOG_ONLY` muestra “En desarrollo”; no tiene CTA de generación.
- `REQUIRES_OFFICIAL_FORM` muestra “Requiere formato oficial” y requisitos.
- `ASSISTED_DRAFT` muestra “Borrador asistido / preparación de audiencia”.
- Sin emojis estructurales; usar iconos SVG existentes o tokens de iconos.
- Contraste AA, foco visible, teclado completo, targets de al menos 44px, `aria-current` en breadcrumb y `aria-live` para resultados.
- Diseño mobile-first; el listado largo se virtualiza solo si la búsqueda devuelve más de 50 elementos.
- Mantener tokens visuales existentes: navy `#0B2545`, fondo cálido `#FBF9F5`, superficies blancas y estados semánticos; en implementación se centralizan como tokens, no como hex sueltos por componente.

## 12. Plan de migración sin romper funcionalidades

1. Crear contratos y registry central sin cambiar exports legacy.
2. Cargar las 20 áreas y procedimientos/familias con validación de IDs únicos.
3. Insertar los 304 identificadores documentales deduplicados y normalizar `senalamiento_correo`.
4. Marcar los 17 actuales como `IMPLEMENTED` derivando strategy/template reales.
5. Registrar familias y aliases legacy; mantener `DOCUMENT_TYPES` con sus 33 valores.
6. Adaptar `MATTERS`, `PROCEDURES` y `LEGAL_MATTERS_CATALOG` para proyectar el registry.
7. Adaptar support matrix y source compatibility sin tocar la semántica cerrada de Loop 6.
8. Añadir navegación y búsqueda como componente aislado; conservar selects legacy hasta migrar cada flujo.
9. Bloquear server-side todos los estados no generables y agregar mensajes recuperables.
10. Añadir tests estructurales y de migración antes de cambiar cada consumidor.
11. Ejecutar focos, suite completa, typecheck, lint y build.
12. Revisar diff para confirmar que no hubo cambios en estrategias/templates existentes ni datos reales.

No hay migración de base de datos, Neon, infraestructura remota ni cambios de Prisma.

## 13. Tests estructurales

Archivo previsto: `tests/legal-taxonomy/legalCatalogRegistry.test.ts`.

Debe probar:

1. IDs únicos dentro y entre áreas, procedimientos, familias, documentos y aliases.
2. Exactamente 20 áreas canónicas.
3. Cada procedimiento referencia un área existente.
4. Cada familia referencia área y procedimiento existentes.
5. Cada documento referencia área, procedimiento y familia existentes.
6. Canonical IDs ASCII, `snake_case`, sin rutas, fechas, expedientes, PDFs o nombres personales.
7. Todos los documentos tienen estado, descripción, jurisdicción, etapa, rol y visibilidad.
8. `IMPLEMENTED` exige strategy/template y source compatibility.
9. No implementados no tienen strategy/template generable.
10. Familias no pueden entrar a `resolveDocumentRoute`.
11. Ningún tipo usa fallback cross-family.
12. Los 33 IDs legacy siguen resolviendo o se bloquean con error explícito.
13. `otro` mantiene únicamente el fallback legacy seguro a `escrito_libre` sin selección explícita.
14. `contestacion_demanda_mercantil` no crea una rama ejecutable duplicada.
15. Búsqueda por label, alias e ID devuelve el canonical ID una sola vez.
16. Source compatibility existe para cada `IMPLEMENTED` y no para catálogo puro.
17. Estados oficiales y asistidos no se exportan como FINAL.

Fixtures 100% sintéticos. No se incorporan expedientes, PDFs, nombres ni números reales.

## 14. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Romper consumidores que esperan exactamente 33 `DOCUMENT_TYPES` | Mantener una proyección legacy derivada y tests de longitud/IDs |
| Crear un segundo registry accidental | Prohibir literales documentales fuera de `legalCatalog.ts`; tests de paridad |
| Un alias termina generando otro documento | Resolver alias antes del routing y bloquear familias server-side |
| Un tipo catalog-only llega al pipeline | Guard en API, pipeline y routing; test directo y de integración |
| Mezclar civil, mercantil, laboral o seguridad social | `areaId`, `procedureId` y source compatibility explícitos |
| Formularios oficiales tratados como escritos libres | Estado `REQUIRES_OFFICIAL_FORM` y CTA no generable |
| UI saturada | Navegación progresiva, búsqueda y resultados agrupados |
| IDs jurídicamente ambiguos | Convención de nombres y revisión de alias antes de promover a IMPLEMENTED |
| Regresión en Loop 6 | No modificar reglas cerradas salvo test rojo reproducible |

## 15. Orden exacto de implementación

1. **Baseline**: ejecutar focos actuales, typecheck, lint y build; revisar archivos modificados.
2. **Contratos**: introducir tipos de registry, estados, nodos y validadores puros.
3. **Datos canónicos**: cargar 20 áreas, procedimientos, familias y 304 IDs deduplicados.
4. **Legacy adapters**: derivar `DOCUMENT_TYPES`, `MATTERS`, `PROCEDURES` y catálogo de biblioteca.
5. **Implemented bridge**: enlazar los 17 templates existentes y verificar metadata/compatibility.
6. **Default-deny**: rechazar familias, aliases no generables, catálogo puro, formularios y assisted drafts.
7. **Search/navigation API**: exponer `getCatalogChildren` y `searchCatalog` sin usar datos remotos.
8. **UI navigator**: añadir componente de navegación progresiva y mantener el selector legacy funcional.
9. **Structural tests**: agregar tests rojos primero, implementar y confirmar verde.
10. **Regression suite**: routing, source compatibility, pipeline, templates, export guards y UI contracts.
11. **Verification**: suite completa, typecheck, lint y `next build --webpack`.
12. **Final review**: diff, búsqueda de hardcodes prohibidos, estado de Loop 6 y reporte de conteos.

## 16. Stack y directorios

Se conserva el stack actual: Next.js 16 App Router, React 19, TypeScript estricto, Tailwind 4, Prisma local existente y Vitest. No se añade base de datos para el catálogo en LOOP 7.

```text
lib/catalog/legalCatalog.ts                 # registry único y consultas puras
lib/legal-taxonomy/documentTypes.ts         # adapter legacy de 33 IDs
lib/legal-taxonomy/matters.ts               # adapter de áreas y aliases
lib/legal-taxonomy/procedures.ts            # adapter de procedimientos
lib/legal-taxonomy/index.ts                 # API pública de taxonomía
lib/legal-engine/documentSupportMatrix.ts   # vista de disponibilidad
lib/legal-engine/documentRouting.ts         # guard de generación
lib/legal-engine/sourceOutputCompatibility.ts # políticas source → output
components/legal-taxonomy/LegalCatalogNavigator.tsx # UI progresiva
app/machotes/hooks/useLegalCatalog.ts       # acceso cliente al catálogo
tests/legal-taxonomy/legalCatalogRegistry.test.ts
tests/legal-taxonomy/legalCatalogSearch.test.ts
docs/blueprints/loop-7-catalogo-juridico-profesional-blueprint.md
```

## 17. AGENTS.md recomendado para la implementación

```md
# APP Plantillas — reglas de LOOP 7

- El único registry declarativo del catálogo es `lib/catalog/legalCatalog.ts`.
- No agregar listas de tipos, materias o familias en JSX, rutas API o strategies.
- `AREA`, `PROCEDURE` y `FAMILY` son navegación y nunca outputs generables.
- `CATALOG_ONLY`, `REQUIRES_OFFICIAL_FORM` y `ASSISTED_DRAFT` deben bloquearse server-side.
- `IMPLEMENTED` exige strategyId, templateId, source compatibility y tests.
- Resolver aliases antes de routing; jamás usar fallback cross-family.
- Mantener los 33 IDs legacy y sus contratos existentes.
- No cambiar Loop 6 sin una prueba que demuestre regresión.
- No inventar hechos, personas, expedientes, PDFs, jurisprudencia ni casos.
- Tests con fixtures sintéticos; no usar valores reales ni `800/2024`.
- No introducir Neon, infraestructura remota ni migraciones para este loop.
- Usar TypeScript estricto y funciones puras para validación/búsqueda.
- Ejecutar focos antes de la suite completa; cerrar con typecheck, lint y build.
- No afirmar éxito sin evidencia de comandos ejecutados.
```

## 18. Criterios de cierre

LOOP 7 puede marcarse cerrado únicamente cuando:

- el registry contiene el conteo calculado y no hay IDs duplicados;
- las 20 áreas y la jerarquía completa son navegables;
- los 33 IDs actuales siguen funcionando o fallan explícitamente de forma segura;
- solo los 17 outputs existentes permanecen `IMPLEMENTED`;
- catálogo, formularios y actuaciones asistidas no generan documentos finales;
- cada `IMPLEMENTED` tiene compatibilidad source → output explícita;
- búsqueda por ID, label y alias es determinista;
- no existe fallback cross-family;
- tests, suite completa, typecheck, lint y build pasan;
- no se añadieron documentos reales, hardcodes ni infraestructura remota.

**CATÁLOGO JURÍDICO PROFESIONAL — CERRADO: SÍ/NO**
