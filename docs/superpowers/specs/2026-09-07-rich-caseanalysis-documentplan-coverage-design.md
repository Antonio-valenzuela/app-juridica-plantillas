# FASE 2 — RichCaseAnalysis, DocumentPlan y CoverageMatrix rich-first

**Fecha:** 2026-09-07  
**Proyecto:** `C:\Users\yahir\Desktop\APP-plantillas`  
**Fase:** 2 — planificación documental y cobertura basada en el análisis rico  
**Estado:** diseño aprobado en conversación; pendiente de revisión humana del spec antes de `writing-plans`

## 1. Problema y resultado esperado

FASE 1 dejó `RichCaseAnalysis` como representación estructurada, trazable y conservadora de las fuentes. El plan documental y la matriz de cobertura todavía se construyen principalmente desde `CaseAnalysis` legacy. Esa ruta puede perder el vínculo entre una entidad rica y la obligación documental, sintetizar una postura que la fuente no confirma y tratar un bloque formal determinístico como si resolviera una controversia jurídica.

El resultado de esta fase será una integración aditiva rich-first que permita construir, para cada documento, una explicación verificable de:

```text
RichCaseAnalysis
  → CoverageBuilder rich-first
  → CoverageMatrix canónica
  → DocumentPlanSection
  → GenerationTask
  → DraftBlock
  → SemanticEvaluation
  → QualityGate
  → GenerationTrace
```

Cuando `caseAnalysis.richCaseAnalysis` exista, ninguna semántica nueva se reconstruirá leyendo `claims[]`, `facts[]`, `evidence[]` o `claimResponses[]` legacy. Esos campos se usarán únicamente como fallback de compatibilidad cuando la representación rica esté ausente.

## 2. Alcance aprobado

Esta fase cubre:

- construcción de `CoverageMatrix` a partir de `RichCaseAnalysis`;
- selección rich-first y fallback legacy explícito;
- enlaces tipados entre entidades ricas, CoverageItems y secciones;
- cobertura individual de claims, hechos, menciones de evidencia, ofertas explícitas, argumentos fuente, conflictos y datos faltantes relevantes;
- distinción `SUBSTANTIVE` frente a `FORMAL`;
- políticas `REQUIRES_SEMANTIC_RESPONSE`, `FORMAL_DETERMINISTIC_ALLOWED` y `REFERENCE_ONLY`;
- conservación de `SOURCE_ASSERTION`, `ESTABLISHED_FACT`, `SOURCE_MENTIONED`, `SOURCE_CITED`, `SOURCE_POSITION` y `CLIENT_POSITION` sin aumentar certeza;
- sección `coverageItemIds` y `requiredCoverageItemIds` explicables desde Coverage y entidades ricas;
- asociación atómica de CoverageItems con `GenerationTask`;
- incorporación mínima del `QualityGate` y de la evaluación semántica para estados de cobertura ricos;
- ampliación aditiva de `GenerationTrace` para poder reconstruir la cadena de provenance;
- fixture sintético F de contestación completa y métricas de fixtures A–F;
- tests TDD de los contratos indicados en esta especificación;
- validación focalizada, suite existente, suite completa, typecheck, lint y clasificación del bloqueo ambiental de build.

## 3. Fuera de alcance

No se hará lo siguiente:

- reestructurar por completo `DocumentPlan`, `CoverageMatrix` o `GenerationTask`;
- crear `LegalIssueMatrix`;
- generar defensas, excepciones, agravios, pruebas, normas, jurisprudencia o posturas procesales nuevas;
- inferir la posición del cliente a partir de similitud textual, rol aparente o silencios de la fuente;
- convertir una `EvidenceMention` en `EvidenceOffer`;
- seleccionar automáticamente pruebas para ofrecer;
- resolver conflictos de fecha, monto, identidad, rol o versión de los hechos;
- verificar online artículos, tesis, jurisprudencia o precedentes;
- crear múltiples llamadas de IA por controversia como objetivo de esta fase;
- aumentar artificialmente palabras, párrafos o páginas;
- cambiar visualmente el DOCX o refactorizar completamente el renderer;
- introducir persistencia nueva o migraciones de base de datos;
- modificar `.env`, iniciar Git o detener procesos Next;
- hacer que la extracción, cobertura o planificación dependan de NVIDIA;
- usar un regex monolítico como sustituto de la representación rica.

## 4. Baseline y límites de ejecución

El baseline aceptado para esta fase es:

- 135 archivos de tests;
- 1,983 tests aprobados;
- 2 tests omitidos;
- 0 fallos;
- typecheck correcto;
- lint con 0 errores y 973 warnings preexistentes;
- build bloqueado antes de Next por el `EPERM` conocido de `prisma generate` al renombrar `query_engine-windows.dll.node` mientras procesos Next mantienen la DLL en uso;
- ausencia aceptada de `.git`.

El `EPERM` solo se considerará regresión si nueva evidencia demuestra que fue causado por los cambios de FASE 2. No se detendrán procesos para ocultar el bloqueo y no se modificará código para evitarlo.

## 5. Arquitectura elegida

Se adopta una extensión aditiva rich-first. Las APIs públicas existentes se conservan siempre que sea posible. La matriz y el plan se enriquecen sin crear un planificador paralelo permanente.

### 5.1. Flujo canónico

1. `reconstructCaseAnalysis` produce `CaseAnalysis` y, cuando hay fuentes, `richCaseAnalysis`.
2. `buildDocumentPlan` elige el esqueleto del template y, en el branch rich-first de contestaciones, consume entidades ricas directamente para identificar unidades de trabajo neutrales.
3. `buildCoverageMatrix` despacha a un builder rico si existe `caseAnalysis.richCaseAnalysis`; de lo contrario conserva el builder legacy actual.
4. Un binder asigna cada CoverageItem a las secciones que realmente lo pueden tratar y conserva `coverageItemIds` y `requiredCoverageItemIds`.
5. `buildDraftingPlan` consume la misma matriz y construye `IssuePlan`, `ClaimPlan` y `FactResponsePlan` sin inventar posturas en el branch rico.
6. `buildGenerationTasksForSection` reutiliza sus tipos existentes y crea una tarea `COVERAGE_ITEM` solo para un CoverageItem que no pueda representarse con los tipos actuales.
7. La evaluación semántica actualiza estados únicamente mediante bloques vinculados y reglas de satisfacción explícitas.
8. `runQualityGateCheck` impide `FINAL_READY` ante defectos estructurales y de cobertura demostrables, sin convertirse en motor jurídico.
9. `GenerationTraceContext` registra las relaciones y transiciones con snapshots sanitizados.

### 5.2. Módulos afectados

Los nombres exactos podrán ajustarse durante `writing-plans` sin cambiar responsabilidades:

- `lib/legal-engine/coverageMatrix.ts`: tipos canónicos extendidos, dispatch rich-first, builder legacy conservado, resumen y validación.
- `lib/legal-engine/richCoverage.ts`: construcción pura de CoverageItems desde `RichCaseAnalysis`, reglas por entidad y asignación inicial a secciones.
- `lib/legal-engine/documentPlan.ts`: enlace opcional de cobertura en `DocumentNode` y coordinación del resultado de plan.
- `lib/legal-engine/contestacionStructure.ts`: branch rich-first que usa IDs y entidades ricas sin pasar por arrays legacy.
- `lib/legal-engine/pipeline.ts`: reutilización de una misma matriz entre plan, tareas, evaluación y trace.
- `lib/legal-engine/generationTasks.ts`: mapeo exacto de CoverageItem a tareas y tipo `COVERAGE_ITEM` únicamente cuando sea necesario.
- `lib/legal-engine/semanticEvaluator.ts`: helper de satisfacción consciente de `scope` y `satisfactionPolicy`.
- `lib/legal-engine/qualityGate.ts`: gates mínimos para Coverage rico y datos críticos.
- `lib/legal-engine/generationTrace.ts`: campos ricos en snapshots, tareas, transiciones y bloques.
- `lib/legal-engine/types.ts`: metadatos opcionales de cobertura en `DocumentNode` sin cambiar el renderer.
- `tests/fixtures/caseAnalysisExtractionFixtures.ts` o un fixture F asociado: caso sintético reproducible.
- nuevos tests bajo `tests/legal-engine/` para contratos rich-first, fallback, cobertura, evaluación, QualityGate y trace.

No se crearán módulos de persistencia ni adaptadores que vuelvan a convertir el análisis rico a legacy antes de planificar.

## 6. Modelo canónico de Coverage

`DocumentCoverageItem` conservará los campos públicos actuales (`id`, `category`, `description`, `required`, `status`, `sourceReferences`, `related*`, `targetSectionIds`, `generatedBlockIds`, `metadata`) para no romper consumidores. Se añadirán campos opcionales canónicos para la ruta rica:

```ts
type CoverageScope = 'SUBSTANTIVE' | 'FORMAL';

type CoverageSatisfactionPolicy =
  | 'REQUIRES_SEMANTIC_RESPONSE'
  | 'FORMAL_DETERMINISTIC_ALLOWED'
  | 'REFERENCE_ONLY';

type CoverageEntityType =
  | 'CLAIM'
  | 'FACT'
  | 'DOCUMENT'
  | 'EVIDENCE_MENTION'
  | 'EVIDENCE_OFFER'
  | 'ARGUMENT'
  | 'AUTHORITY_MENTION'
  | 'CONFLICT'
  | 'MISSING_DATA'
  | 'PROCEDURAL_REQUIREMENT'
  | 'FORMAL_REQUIREMENT';

interface RichCoverageLinks {
  sourceEntityType?: CoverageEntityType;
  sourceEntityIds?: string[];
  claimIds?: string[];
  factIds?: string[];
  evidenceMentionIds?: string[];
  evidenceOfferIds?: string[];
  argumentIds?: string[];
  authorityMentionIds?: string[];
  conflictIds?: string[];
  missingDataIds?: string[];
}

interface RichCoverageMetadata extends RichCoverageLinks {
  scope: CoverageScope;
  satisfactionPolicy: CoverageSatisfactionPolicy;
  blocking: boolean;
  requiresClientPosition: boolean;
  statusReason?: string;
  relationStatus?: 'EXPLICIT' | 'UNLINKED' | 'UNKNOWN';
}
```

La implementación puede mantener estos datos como campos tipados o como una estructura equivalente, pero el resultado observable debe exponer la misma información. `provenance` será un array de `SourceProvenance` y conservará todas las fuentes de los objetos fusionados.

### 6.1. Categorías

Se conservarán las categorías existentes (`FACT`, `CLAIM`, `EVIDENCE`, `LEGAL_ISSUE`, `CONSTITUTIONAL_ISSUE`, `CHALLENGED_REASONING`, `PROCEDURAL_REQUIREMENT`, entre otras) y se añadirán solo las necesarias para expresar el modelo rico:

- `CLAIM_RESPONSE`;
- `FACT_RESPONSE`;
- `EVIDENCE_TREATMENT`;
- `EVIDENCE_OFFER`;
- `SOURCE_ARGUMENT_RESPONSE`;
- `AUTHORITY_MENTION`;
- `MISSING_CLIENT_POSITION`;
- `CONFLICT_REVIEW`;
- `PETITION_SUPPORT`;
- `FORMAL_REQUIREMENT`.

Los consumidores que solo conocen categorías legacy podrán seguir leyendo `category`; la ruta rica también expondrá `sourceEntityType` y sus IDs.

### 6.2. Estados

Se mantendrán `pending`, `drafting`, `generated`, `covered`, `weak`, `unsupported` y `not_applicable`. Se añadirán estados aditivos cuando la información no pueda representarse correctamente con esos valores:

- `needs_client_position`;
- `blocked`;
- `contradictory`;
- `insufficient`.

`covered` solo se asigna conforme a la política de satisfacción. La presencia de texto fuente, un heading, un bloque no evaluado o una tarea técnicamente exitosa no cambia por sí sola el estado.

## 7. Construcción rich-first por entidad

El builder rico leerá directamente `RichCaseAnalysis` y utilizará IDs estables de FASE 1. No volverá a analizar páginas, tablas ni strings legacy.

### 7.1. Claims

Cada `ClaimItem` material produce un Coverage independiente de tipo `CLAIM_RESPONSE` o la categoría compatible existente `CLAIM`.

- `claimIds` contiene exactamente el ID del claim.
- `factualBasisIds` y `evidenceMentionIds` solo se copian si están explícitos.
- `scope` es `SUBSTANTIVE` cuando requiere contestar la pretensión.
- Una pretensión detectada no implica improcedencia, admisión, negativa ni defensa.
- Si la posición del cliente es desconocida, el claim puede tener además un `MISSING_CLIENT_POSITION` vinculado y permanecer `needs_client_position` o `blocked` según `MissingDataItem.blocking`.

### 7.2. Hechos

Cada `FactItem` material produce un Coverage individual de respuesta o fijación de postura.

- `assertionStatus = SOURCE_ASSERTION` permanece explícitamente como alegación de fuente.
- `assertionStatus = ESTABLISHED_FACT` se utiliza solo si FASE 1 lo determinó por una base explícita.
- Nunca se convierte una afirmación de fuente en hecho establecido durante la planificación.
- La postura del cliente se enlaza solo desde `ClientPosition` explícito.
- Si la postura es `UNKNOWN`, el Coverage exige información del cliente y no rellena `CIERTO`, `FALSO`, `SE_IGNORA`, `NO_ES_HECHO_PROPIO` ni una postura equivalente.

### 7.3. Documentos, EvidenceMention y EvidenceOffer

Una `DocumentItem` describe un documento mencionado o adjunto. Una `EvidenceMention` describe el tratamiento o vínculo de una mención probatoria. Un `EvidenceOffer` representa únicamente un ofrecimiento explícito.

- `EvidenceMention` crea `EVIDENCE_TREATMENT` cuando requiere análisis, relación o respuesta.
- `EvidenceMention` nunca crea automáticamente `EVIDENCE_OFFER`.
- Solo un `EvidenceOffer` explícito crea `EVIDENCE_OFFER`.
- `DocumentItem` nunca se convierte automáticamente en prueba ofrecible.
- `SOURCE_MENTIONED` no se proyecta a `CLIENT_CONFIRMED`.

### 7.4. Argumentos y autoridades

Cada `ArgumentItem` que deba responderse crea `SOURCE_ARGUMENT_RESPONSE` individual, con `argumentIds`, hechos explícitos y autoridades explícitamente citadas.

Cada `SourceAuthorityMention` conserva `verificationStatus = SOURCE_CITED` hasta que exista verificación fuera de esta fase. El plan puede referenciar la cita de fuente, pero no la presenta como `LEGALLY_VERIFIED`.

### 7.5. Conflictos

Cada `CaseConflict` material produce `CONFLICT_REVIEW` con:

- `conflictIds` y `itemIds` vinculados;
- `blocking = true` cuando el conflicto afecta un requisito necesario;
- `status = blocked` o `contradictory`;
- `statusReason` que explica que la decisión está pendiente de revisión.

No se elige automáticamente una fecha, cantidad, identidad, rol o versión narrativa.

### 7.6. MissingData y postura

Cada `MissingDataItem` relevante puede producir un Coverage de `MISSING_CLIENT_POSITION` o de requisito faltante, conservando:

- `blocking`;
- `requiresClientInput`;
- `importance`;
- `sectionAffected`;
- `sourceSearched`.

Un faltante secundario puede permanecer informativo. Un faltante crítico de postura puede bloquear solo el Coverage afectado o el `FINAL_READY` completo, según su relación explícita con un requisito requerido.

### 7.7. Relaciones

Los vínculos `Claim → Fact → Evidence → Argument` se copian únicamente de arrays de IDs explícitos de `RichCaseAnalysis`. Si no existen, `relationStatus` será `UNLINKED` o `UNKNOWN`.

No se crearán enlaces por similitud de texto, proximidad de párrafos, coincidencia de nombres, coocurrencia o inferencia semántica. Un Coverage con relación ausente puede permanecer planificado, pero su estado debe explicar la falta de vínculo.

## 8. Política SUBSTANTIVE frente a FORMAL

La política es parte del contrato de Coverage y de la evaluación semántica.

### 8.1. Requisitos sustantivos

Un Coverage `SUBSTANTIVE` con `REQUIRES_SEMANTIC_RESPONSE` solo puede pasar a `covered` cuando:

1. existe al menos un `DraftBlock` cuyo `coverageItemIds` incluye el ID;
2. el bloque no es placeholder, `LOCAL_PLACEHOLDER`, fallback genérico ni determinístico sin razonamiento sustantivo;
3. la evaluación semántica del bloque está vinculada a los mismos IDs;
4. la evaluación aprueba la respuesta y no declara dependencia fáctica crítica sin resolver;
5. sus fuentes y relaciones son compatibles con el Coverage.

No satisfacen un requisito sustantivo:

- la existencia de un párrafo;
- la presencia de un heading;
- la longitud del texto;
- el éxito técnico de una tarea;
- un bloque `LOCAL_PLACEHOLDER`;
- un fallback genérico;
- un bloque determinístico sin razonamiento sustantivo;
- una mención de fuente sin respuesta.

### 8.2. Requisitos formales

Un Coverage `FORMAL` con `FORMAL_DETERMINISTIC_ALLOWED` puede pasar a `covered` por un bloque determinístico permitido que corresponda al componente estructural. Ejemplos: rubro, encabezado, cierre, firma y estructuras procesales formales declaradas por el template.

Un bloque formal no satisface de forma transversal un Coverage sustantivo aunque comparta sección o palabras.

### 8.3. Reference-only

`REFERENCE_ONLY` permite conservar una referencia de fuente para contexto o provenance sin convertirla en obligación de redacción. No puede marcar un Coverage sustantivo como cubierto.

## 9. DocumentPlan y Section ↔ Coverage

El catálogo y el orden de secciones seguirán dependiendo del template, tipo documental, contexto y Coverage disponible. No se agregarán secciones universales de `ALEGATOS`, `DERECHO`, `EXCEPCIONES` o `PRUEBAS` cuando el documento no las requiera.

`DocumentNode` incorporará metadatos opcionales equivalentes a:

```ts
coverageItemIds?: string[];
requiredCoverageItemIds?: string[];
coverageReason?: string;
```

El binder de secciones debe cumplir:

- cada ID enlazado existe en la matriz;
- `requiredCoverageItemIds` es subconjunto de `coverageItemIds`;
- una sección material puede explicar su existencia mediante categorías, IDs de entidades y `coverageReason`;
- un Coverage sustantivo sin sección apta se marca `blocked`/`insufficient` y se reporta como orphan;
- la asignación rich-first se basa en `DocumentNode.type` y en los IDs canónicos declarados por el template; la coincidencia textual del título solo puede permanecer en el fallback legacy;
- los componentes formales del template pueden existir aunque no tengan Coverage sustantivo.

`PROEMIO` seguirá siendo un concepto interno de planificación cuando el template lo necesite y no se convertirá en heading visible por efecto de esta fase.

El branch rich-first de `buildContestacionSkeleton` usará claims, facts, evidence mentions y posiciones mediante IDs ricos. Los textos de seed serán neutrales y no expresarán improcedencia, admisión, negación, excepción o defensa sin respaldo explícito.

## 10. DocumentPlan ↔ GenerationTask

`buildDraftingPlan` recibirá la matriz canónica construida para las mismas secciones. En la ruta rica:

- `IssuePlan` se deriva de issues/challenged reasoning ricos solo cuando existen en la fuente;
- `ClaimPlan` conserva `claimId`, texto fuente y enlaces, pero deja `contestedStatus`, `proposedResponse` y estrategias de defensa sin valor cuando no hay postura explícita;
- `FactResponsePlan` conserva `factId`, número, texto, evidencia explícita y `relatedCoverageItemIds`, pero no sintetiza `responseKind` cuando `ClientPosition` es `UNKNOWN`;
- los planes formales pueden conservar objetivos estructurales sin convertirse en argumentos sustantivos;
- no se crean planes monolíticos para resolver toda una sección de Derecho.

La ruta legacy solo se activa si `richCaseAnalysis` no existe y conserva la compatibilidad con los consumidores actuales.

## 11. Coverage ↔ GenerationTask

Se conservarán los tipos existentes `ISSUE`, `CLAIM`, `FACT_RESPONSE`, `EVIDENCE`, `SECTION_SUPPORT` y `PROCEDURAL_GROUNDS` siempre que expresen correctamente el requisito.

Se podrá añadir `COVERAGE_ITEM` únicamente para estos casos:

- `MISSING_CLIENT_POSITION` que requiere una solicitud o bloqueo específico;
- `CONFLICT_REVIEW` sin un `IssuePlan`, `ClaimPlan` o `FactResponsePlan` natural;
- `SOURCE_ARGUMENT_RESPONSE`, `PETITION_SUPPORT` o una formalidad que no tiene constructor existente;
- un requisito rico individual que quedaría agrupado de forma ambigua por una tarea de sección.

`COVERAGE_ITEM` reutilizará el camino genérico de contexto y generación; no creará una segunda arquitectura de ejecución.

Invariantes:

- cada CoverageItem requerido tiene al menos una tarea cuando su sección es generable;
- una tarea contiene el ID exacto del Coverage que pretende satisfacer;
- no se agrupan dos claims o hechos materiales en una tarea si esa agrupación impide evaluación individual;
- `factIds`, `claimIds`, `evidenceIds`, `authorityIds`, `challengedReasoningIds` y enlaces ricos se copian solo cuando existen;
- un Coverage bloqueado por postura o conflicto no se convierte en una instrucción para inventar la respuesta.

## 12. Evaluación semántica y QualityGate

### 12.1. Evaluación semántica

Se añadirá una función de decisión reutilizable equivalente a:

```ts
isCoverageSatisfied(
  item: DocumentCoverageItem,
  blocks: ContentBlock[],
  evaluations: BlockQualityEvaluation[],
): { satisfied: boolean; reason: string };
```

La función aplicará `scope`, `satisfactionPolicy`, origen del bloque, IDs de Coverage, evaluación semántica, placeholders y dependencias pendientes. El evaluador global conservará sus métricas y actualizará `CoverageMatrix` con razones auditables.

### 12.2. QualityGate mínimo

`runQualityGateCheck` añadirá únicamente validaciones estructurales:

- claim requerido sin respuesta sustantiva;
- hecho obligatorio sin respuesta;
- postura crítica ausente;
- conflicto bloqueante abierto;
- Coverage sustantivo requerido no resuelto;
- petición sin Coverage de soporte;
- `EvidenceOffer` requerido sin tratamiento vinculado;
- Coverage huérfano o sección requerida sin relación válida.

El gate no utilizará cantidad de palabras ni número de páginas para decidir cobertura y no determinará la procedencia jurídica de una pretensión.

Los requisitos formales determinísticos permitidos no producirán errores por el solo hecho de no contener razonamiento jurídico.

## 13. GenerationTrace y provenance

`GenerationTraceContext` ya cuenta con snapshots sanitizados y relaciones de tareas, bloques, evaluaciones, ensamblado y exportación. FASE 2 añadirá los datos mínimos para reconstruir:

```text
RichEntity
  → CoverageItem
  → DocumentPlanSection
  → GenerationTask
  → DraftBlock
  → CoverageTransition
```

Cada enlace conservará, cuando aplique:

- `generationId` común;
- IDs de entidad y Coverage;
- `sectionId`;
- `taskId`;
- `draftBlockId`;
- `scope`;
- `satisfactionPolicy`;
- estado anterior y posterior;
- razón de transición;
- provenance y source IDs.

Se extenderá `CoverageTraceItem` y/o `CoverageTransitionTrace` de forma aditiva. El trace no almacenará documentos fuente completos. Los excerpts serán limitados y sanitizados; los hashes podrán representar texto sin exponerlo. API keys, tokens, secretos, credenciales y valores de `.env` están prohibidos en snapshots, context packs y reportes.

## 14. Compatibilidad legacy

La dirección de compatibilidad será únicamente:

```text
RichCaseAnalysis → Coverage/Plan canónico → vistas legacy existentes
```

Cuando exista la representación rica:

- ningún builder nuevo leerá arrays legacy equivalentes para recuperar semántica;
- no se convertirán estados ricos a estados más fuertes;
- la ausencia de expresividad en un campo legacy se documentará en metadata o trace;
- los consumidores que solo esperan `relatedFactIds`, `relatedClaimIds` o `relatedEvidenceIds` recibirán aliases seguros derivados de IDs ricos;
- los consumidores legacy no podrán cambiar el estado canónico de Coverage.

Cuando `richCaseAnalysis` esté ausente:

- `buildCoverageMatrix` y `buildDraftingPlan` utilizarán el camino legacy existente;
- se conservarán los contratos previos y sus tests;
- el trace identificará `legacy-fallback` como origen de planificación cuando esa metadata sea observable.

La ruta rica nunca pasará por `claims[]`, `facts[]`, `evidence[]` o `claimResponses[]` para volver a construir la semántica.

## 15. Fixture F y métricas

Se añadirá un fixture sintético reproducible de contestación con:

- dos `ClaimItem`;
- cuatro `FactItem`;
- menciones de evidencia relacionadas explícitamente con algunos hechos;
- al menos un `EvidenceOffer` explícito;
- algunas posiciones del cliente confirmadas;
- al menos una postura desconocida;
- un conflicto abierto;
- un `MissingDataItem` bloqueante y uno informativo;
- un argumento fuente;
- una autoridad en estado `SOURCE_CITED`;
- fechas y cantidades con provenance.

Las métricas por fixtures A–F deberán poder reportar:

- counts ricos por entidad;
- Coverage total, requerido y bloqueado;
- distribución por categoría y por `scope`;
- secciones planificadas;
- Coverage por sección;
- Coverage huérfano;
- secciones sin Coverage;
- elegibilidad `FINAL_READY`;
- candidatos aceptados, fusionados, rechazados y en revisión cuando la traza de FASE 1 esté disponible;
- pérdidas de proyección legacy.

## 16. Contratos de prueba

La implementación seguirá TDD. La lista mínima se agrupa así:

### Rich-first y fallback

1. Con `richCaseAnalysis`, el builder usa IDs ricos aunque los arrays legacy contengan valores distintos.
2. Sin `richCaseAnalysis`, el camino legacy conserva su resultado.
3. No existe lectura semántica `rich → legacy → plan`.
4. La misma entrada rica produce la misma matriz y plan en ejecuciones repetidas.

### Coverage individual y estados

5. Cada claim material produce Coverage individual.
6. Cada hecho material produce Coverage individual.
7. `SOURCE_ASSERTION` no se convierte en `ESTABLISHED_FACT`.
8. Postura desconocida crea `MISSING_CLIENT_POSITION` y no inventa respuesta.
9. Posición confirmada se enlaza únicamente desde `ClientPosition` explícito.
10. Cada `EvidenceMention` produce tratamiento cuando corresponde.
11. `EvidenceMention` nunca produce `EvidenceOffer`.
12. Solo `EvidenceOffer` explícito produce Coverage de ofrecimiento.
13. `SOURCE_CITED` no se convierte en `LEGALLY_VERIFIED`.
14. Argumentos fuente conservan sus IDs y provenance.
15. Relaciones ausentes quedan `UNLINKED`/`UNKNOWN`.
16. Conflictos permanecen abiertos y bloqueantes.
17. MissingData conserva blocking, importancia y requiresClientInput.
18. Los nombres o vínculos parecidos no crean fusiones nuevas.

### Scope, secciones y tareas

19. Un requisito formal puede satisfacerse con un bloque determinístico permitido.
20. Un bloque determinístico sin razonamiento no satisface un requisito sustantivo.
21. Placeholder, local fallback y fallback genérico no satisfacen cobertura sustantiva.
22. Heading, longitud y éxito técnico no satisfacen cobertura sustantiva.
23. Cada sección material expone `coverageItemIds`.
24. `requiredCoverageItemIds` es subconjunto válido.
25. Coverage sin sección apta se reporta como orphan/bloqueado.
26. No se crean secciones universales por defecto.
27. Cada claim requerido se enlaza con una tarea.
28. Cada hecho requerido se enlaza con una tarea.
29. `COVERAGE_ITEM` solo aparece para categorías que los tipos existentes no representan correctamente.
30. Los enlaces de tarea conservan IDs explícitos de hechos, claims y evidencia.

### Evaluación, QualityGate y trace

31. QualityGate bloquea claim, hecho, postura, conflicto, petition support o EvidenceOffer requerido no resuelto.
32. Un missing data informativo no bloquea el documento completo por sí solo.
33. La evaluación actualiza Coverage con razón y score.
34. El trace reconstruye entidad rica → Coverage → sección → tarea → bloque → transición.
35. Snapshots y reportes no contienen API keys, secretos, tokens, credenciales ni documentos fuente completos.

Los tests existentes de `phase3CoverageMatrix`, arquitectura documental, pipeline, tareas, evaluación, calidad y trace deberán seguir pasando. Los nuevos tests aumentarán naturalmente el número de tests aprobados.

## 17. Validación y entrega de la fase

La ejecución posterior al plan deberá validar, en este orden:

1. tests focalizados de cada tarea;
2. typecheck;
3. tests existentes de Coverage, DocumentPlan, pipeline, tareas, evaluación, QualityGate y trace;
4. suite completa;
5. lint, reportando 0 errores y separando warnings preexistentes de los nuevos;
6. build, registrando el `EPERM` ambiental conocido si vuelve a ocurrir;
7. fixture F, trace JSON y reporte Markdown reales.

El reporte final A–W deberá incluir como mínimo:

- conteo final de archivos de tests, aprobados, omitidos y fallos;
- typecheck, lint, warnings y build;
- archivos creados y modificados;
- métricas A–F;
- Coverage por categoría, scope, estado y sección;
- orphan Coverage y secciones sin Coverage;
- tareas `COVERAGE_ITEM`, si existen, con justificación;
- ejemplos de provenance completa y de estados ricos conservados;
- falsos Coverage bloqueados;
- conflictos y missing data;
- trazas JSON/Markdown;
- regresiones descubiertas y correcciones TDD;
- problemas que permanezcan;
- límites y trabajo de la siguiente fase para mejorar la generación jurídica real.

## 18. Decisiones cerradas y criterios de aceptación

La fase se considerará correctamente diseñada cuando se cumpla todo lo siguiente:

- `RichCaseAnalysis` es la fuente canónica de planificación cuando existe;
- la ruta legacy se usa solo cuando falta la representación rica;
- no hay `rich → legacy → plan`;
- ninguna postura, defensa, excepción, prueba ofrecible, verificación jurídica o hecho establecido se inventa;
- cada entidad material tiene Coverage individual cuando corresponde;
- EvidenceMention y EvidenceOffer siguen siendo tipos y coberturas distintas;
- conflictos y faltantes críticos pueden impedir `FINAL_READY` sin impedirlo todo para faltantes informativos;
- un requisito formal determinístico no se rompe por carecer de razonamiento sustantivo;
- un bloque no sustantivo no obtiene Coverage sustantivo por conteo, heading, longitud o éxito técnico;
- toda sección y tarea material puede explicar su relación con Coverage;
- `GenerationTrace` conserva IDs, estados, razones, scope, satisfaction policy y provenance;
- snapshots y reportes permanecen sanitizados;
- no se requieren migraciones, persistencia nueva ni cambios de formato DOCX.

Este spec no autoriza todavía la implementación. El siguiente paso, después de la revisión humana y aprobación de este documento, será invocar exclusivamente `writing-plans` para producir el plan de implementación TDD.

## 19. Auto-revisión del spec

La revisión interna se realizó después de escribir el documento completo.

- **Placeholders y pasos incompletos:** no hay `TODO`, `TBD`, instrucciones abiertas ni decisiones delegadas sin contrato. Las menciones a placeholder, fallback y `DATO PENDIENTE` describen explícitamente las barreras de cobertura.
- **Contradicciones:** no se encontró contradicción entre rich-first, compatibilidad legacy, separación `SUBSTANTIVE`/`FORMAL`, preservación de provenance y prohibición de posturas inventadas. La excepción formal determinística está limitada por `scope` y `satisfactionPolicy`.
- **Alcance:** se mantienen fuera la reestructuración completa de `DocumentPlan`, la generación jurídica nueva, la verificación online, la persistencia, las migraciones, el renderer DOCX y cualquier cambio de `.env` o procesos.
- **Ambigüedades resueltas:** la ruta rich-first se activa únicamente por la presencia de `caseAnalysis.richCaseAnalysis`; la ruta legacy se usa únicamente cuando falta. La relación de sección se resuelve por tipo e IDs del template. `COVERAGE_ITEM` es condicional y requiere justificar por qué los tipos existentes no bastan.
- **Compatibilidad y provenance:** los campos legacy permanecen como vistas derivadas; no pueden aumentar certeza ni cambiar el estado canónico. Las fusiones conservan todas las provenance y la traza incluye IDs, estados, razones, scope y policy.
- **Cobertura de requisitos:** la lista de 35 contratos cubre rich-first/fallback, entidades individuales, posturas, evidencia, relaciones, conflictos, missing data, formalidad determinística, secciones, tareas, evaluación, QualityGate, trace, determinismo y secretos.
