# GenerationTrace y observabilidad end-to-end

**Fecha:** 2026-09-07  
**Proyecto:** `C:\Users\yahir\Desktop\APP-plantillas`  
**Fase:** 0 — baseline, observabilidad, provenance y prevención de falso Coverage  
**Estado:** diseño aprobado por el usuario; el spec requiere revisión antes de planificar la implementación

## 1. Problema y resultado esperado

El pipeline puede producir un DOCX válido sin conservar evidencia suficiente para explicar por qué un párrafo terminó en el documento, qué insumo lo originó, qué tarea lo pidió, qué proveedor respondió, qué evaluación recibió y qué decisión de ensamblado lo hizo visible. La auditoría actual debe pasar de inferencias posteriores a una cadena de evidencia registrada durante la ejecución.

El resultado de esta fase será un trace por generación que permita resolver, para cada párrafo visible del DOCX:

`SOURCE → CaseAnalysis → DocumentPlan → CoverageItem → GenerationTask → ContextPack → Provider → AIResponse/Fallback → SemanticEvaluation → DraftBlock → Assembly → QualityGate → DOCX`

La trazabilidad será descriptiva y verificable. No convertirá un resultado local genérico en contenido jurídico IA, no inventará hechos o posturas y no usará el número de palabras como criterio de calidad.

## 2. Alcance aprobado

La fase cubre:

- un `GenerationTraceContext` explícito por ejecución;
- un `generationId` común, único y estable durante toda la ejecución;
- snapshots sanitizados de la entrada real, `CaseAnalysis`, `DocumentPlan` y `CoverageMatrix` antes y después;
- registro por `GenerationTask`, respuesta del proveedor, evaluación, reintentos, fallback y bloque final;
- provenance de cada `DraftBlock` y su relación con tareas y cobertura;
- metadatos de ensamblado y exportación DOCX, incluido el orden de párrafos visibles;
- artefactos JSON y Markdown de desarrollo/auditoría;
- prevención del falso Coverage causado por placeholders, bloques vacíos y fallback local genérico;
- fixture jurídico sintético y dos ejecuciones controladas (NVIDIA real cuando exista clave y fallback sin NVIDIA);
- los 20 grupos de pruebas solicitados por el usuario.

## 3. Fuera de alcance

No se modificará en esta fase:

- la arquitectura completa de `DocumentPlan`;
- la taxonomía jurídica para agregar excepciones, defensas, pruebas, hechos o posturas no presentes;
- agregar automáticamente excepciones, defensas, pruebas, hechos o posturas;
- artículos, jurisprudencia o Derecho material;
- la longitud objetivo, el número de páginas o el contenido para inflar métricas;
- la generación artificial de 25 tareas;
- formatos de terceros;
- el renderer DOCX completo;
- la persistencia de traces en base de datos;
- migraciones Prisma o cambios de esquema, salvo una necesidad técnica indispensable que tendría que justificarse antes de implementarse.

El fixture será sintético y permanecerá en tests/fixtures o en el área temporal de pruebas. No se incorporarán documentos privados reales.

## 4. Evidencia del flujo existente

El flujo actual identificado es:

1. `runGenerationPipeline` prepara la ejecución.
2. `generateSection` coordina una sección.
3. `executeGenerationTask` crea el bloque y ejecuta la tarea.
4. `runFastMode` elige NVIDIA o fallback local.
5. `evaluateBlockQuality` evalúa el bloque.
6. La cobertura se actualiza desde la generación de sección.
7. `exportUniversalToDocx` convierte las secciones y bloques a párrafos DOCX.

El diseño conservará esas funciones y sus usos existentes. Las nuevas capacidades se añadirán mediante un contexto opcional y tipos compatibles, evitando una reescritura del pipeline.

### 4.1. Baseline aceptado

El baseline previo a cualquier implementación de esta fase queda fijado como evidencia de referencia:

- `npm test -- --run`: 106 archivos; 1,886 tests aprobados; 1 omitido; 0 fallos.
- `npm run typecheck`: correcto.
- `npm run lint`: 0 errores y 973 warnings preexistentes.
- `npm run build`: bloqueado antes de `next build` por `prisma generate`, con `EPERM` al renombrar `node_modules/.prisma/client/query_engine-windows.dll.node` mientras procesos Next del proyecto estaban activos.

El `EPERM` se clasifica como bloqueo ambiental/preexistente mientras la evidencia confirme que la DLL está siendo utilizada. No se detendrán procesos, no se cambiará `.env` y no se alterará código para ocultar o maquillar este resultado.

## 5. Arquitectura elegida

Se adopta un contexto explícito, frente a un bus global de eventos o una reconstrucción posterior desde el DOCX.

`GenerationTraceContext` será la única instancia mutable de auditoría de una generación. Contendrá el `GenerationTrace` acumulado, opciones de emisión y operaciones de registro. Las funciones que ya conocen la etapa recibirán el contexto como parámetro opcional o a través de una extensión de sus parámetros existentes. Cuando no se proporcione contexto, las funciones conservarán su comportamiento de compatibilidad; cuando el modo de auditoría esté activo, todas las etapas deberán registrar sus eventos.

El contexto no será global y no se guardará en base de datos. Esto evita mezclar ejecuciones concurrentes y mantiene el costo de producción bajo. El trace se materializará al cerrar la ejecución o al registrar un error terminal.

## 6. Modelo de datos del trace

El tipo `GenerationTrace` tendrá como mínimo:

- `generationId`;
- `startedAt` y `completedAt` en ISO-8601;
- `documentType`, `matter` y `workflow`;
- `providerRequested`, `providerActuallyUsed`, `model` y `providerFallbackReason`;
- `sourceIds`;
- `caseAnalysisSnapshot`;
- `documentPlanSnapshot`;
- `coverageMatrixBeforeGeneration`;
- `generationTasks[]`;
- `taskExecutions[]`;
- `coverageMatrixAfterGeneration`;
- `semanticEvaluations[]`;
- `qualityGateResult`;
- `assemblyMetadata`;
- `exportMetadata`;
- `warnings[]` y `errors[]`.

Los snapshots serán serializables, versionables y sanitizados. Cada registro que relacione objetos usará IDs estables del documento; el contenido duplicado se limitará a hashes y a excerpts sanitizados definidos por el writer del reporte.

### 6.1. GenerationTraceContext

El contexto expondrá operaciones conceptuales equivalentes a:

- iniciar y cerrar la generación;
- registrar un warning o error sin perder el estado parcial;
- registrar la tarea planificada y su ejecución;
- registrar la respuesta del proveedor y su clasificación semántica;
- registrar un cambio de Coverage con estado anterior, posterior y razón;
- registrar un `DraftBlock` y su relación con la tarea;
- registrar el ensamblado y la posición de cada párrafo visible;
- registrar el resultado del quality gate y la exportación;
- producir el snapshot final para JSON y Markdown.

Los tiempos de etapa se calcularán con `performance.now()` para duración y timestamps ISO-8601 para calendario; si la API monotónica no estuviera disponible, se usará la diferencia de `Date.now()` y se registrará una advertencia. Un error al escribir el artefacto no podrá borrar del trace el error original de generación.

### 6.2. Registro de GenerationTask

Cada entrada de `generationTasks[]`/`taskExecutions[]` conservará:

- `taskId`, `taskType`, `sectionId` y título/etiqueta;
- `coverageItemIds[]`, `legalIssueIds[]`, `evidenceIds[]`, `factIds[]` y `claimIds[]`;
- `contextPack` auditado, con IDs, objetivos, longitudes y excerpts sanitizados de un máximo de 2,000 caracteres por elemento;
- proveedor solicitado, proveedor real y modelo;
- `startedAt`, `completedAt` y duración;
- `tokenBudget`, tamaño aproximado de entrada y tamaño de salida;
- `continuationCount`, `retryCount` y estado de respuesta;
- hash del output crudo, sin guardar credenciales ni secretos;
- texto normalizado cuando sea necesario para explicar el bloque;
- resultado de evaluación semántica;
- `fallbackUsed`, `fallbackReason` y clasificación de origen;
- `finalBlockId`.

El output crudo se conservará únicamente como hash y métricas. La representación normalizada estará sanitizada y limitada al contenido que el reporte necesita para explicar el bloque.

## 7. Proveedores y semántica de origen

La solicitud y el resultado serán dos hechos distintos:

- `providerRequested`: proveedor que el flujo intentó usar, por ejemplo `NVIDIA`;
- `providerActuallyUsed`: motor que produjo el resultado aceptado por esa etapa: `NVIDIA`, `LOCAL` o `NONE` cuando el bloque fue determinístico y no hubo proveedor;
- `providerFallbackReason`: razón normalizada y sanitizada.

`runFastMode` registrará razones como `NVIDIA_NO_API_KEY`, timeout, error HTTP, rate limit, respuesta inválida, proveedor indisponible o fallback intencional. Los mensajes de error se truncarán y limpiarán de patrones que puedan contener claves, tokens o identificadores de autenticación.

`LocalProvider` podrá seguir siendo útil para orientación de interfaz o una respuesta local controlada, pero su clasificación semántica será `LOCAL_PLACEHOLDER`. El fallback sin proveedor tendrá `providerActuallyUsed = NONE` y clasificación `DETERMINISTIC_FALLBACK`. Ninguno se marcará como `AI_GENERATED_LEGAL_CONTENT` ni como bloque AI por el solo hecho de devolver `success: true`.

Las categorías mínimas de `generatedBy` serán `AI`, `DETERMINISTIC`, `USER`, `FALLBACK` y `SOURCE_DIRECT`. La categoría se derivará del proveedor real, del estado de fallback y del origen del bloque, no de la longitud o del texto superficial.

## 8. Snapshot de CaseAnalysis y DocumentPlan

Antes de generar se capturará la estructura real recibida por el pipeline. `caseAnalysisSnapshot` conservará, cuando existan, parties, facts, claims, claimResponses, evidence, authorities, arguments, missingData y provenance, además de IDs, conteos y hashes útiles para comparar ejecuciones.

`documentPlanSnapshot` conservará las secciones planificadas, IDs, tipos, orden, visibilidad, required/optional, seeds, expected coverage y si cada sección estaba prevista para generación. La ausencia de un nodo planificado no se transformará en un nodo generado para “completar” el documento.

El trace permitirá comparar tres estados distintos:

- `PLANIFICADO`: existe en el plan;
- `GENERADO`: produjo un `DraftBlock` o una salida de tarea;
- `RENDERIZADO`: quedó representado en el ensamblado/exportación DOCX.

## 9. Coverage y prevención de falso Coverage

Se registrarán dos snapshots completos, antes y después. Cada `CoverageItem` tendrá:

- `id`, `type`, `requirement` y fuentes relacionadas;
- estado anterior;
- `taskIds[]` y `draftBlockIds[]` relacionados;
- estado posterior;
- score de evaluación cuando exista;
- razón explícita del cambio o de la permanencia del estado.

Un guard común impedirá que un item sustantivo pase automáticamente a cubierto cuando el bloque asociado sea vacío, placeholder, `[REQUIERE...]`, `[DATO PENDIENTE...]`, fallback determinístico vacío, `LOCAL_PLACEHOLDER` o fallback local genérico. El estado podrá quedar pendiente, parcial o fallido según el modelo existente, pero nunca se afirmará cobertura completa sin evidencia sustantiva.

La razón será un valor legible y estable, por ejemplo `VALID_SUBSTANTIVE_BLOCK`, `PLACEHOLDER_NOT_COVERAGE`, `LOCAL_FALLBACK_NOT_COVERAGE`, `EMPTY_OUTPUT_NOT_COVERAGE`, `SEMANTIC_SCORE_BELOW_THRESHOLD` o `NO_GENERATED_BLOCK`.

## 10. DraftBlock y provenance

Cada `DraftBlock` generado durante una ejecución observable conservará, cuando aplique:

- `generatedBy`;
- `provider` y `model`;
- `generationTaskId`;
- `coverageItemIds[]`;
- `provenance`;
- `fallbackStatus` y razón;
- `semanticScore` y `genericityClass`;
- `createdAt`.

Los bloques de usuario y de fuente directa mantendrán su origen propio. Los bloques históricos que no tengan IDs de trace no se reinterpretarán retroactivamente como AI o fallback.

## 11. Ensamblado y enlace con DOCX

El exportador no insertará marcas técnicas visibles en el escrito. En su lugar, `assemblyMetadata` registrará, para cada párrafo exportable:

- índice de párrafo y `sectionId`;
- `blockId`, `generationTaskId` y `coverageItemIds[]`;
- hash del texto visible normalizado;
- estilo aplicado y si fue título/lista/cuerpo;
- si el párrafo fue omitido y la razón.

`exportMetadata` registrará formato, tamaño, hash del buffer final, conteo de párrafos, estilos observados y estado de exportación. El trace sobrevivirá hasta el final de la exportación y el reporte resolverá la pregunta “¿de dónde salió este párrafo?” mediante el hash y el índice del párrafo, sin depender de texto oculto o de marcas jurídicas.

## 12. Artefactos JSON y Markdown

En desarrollo o modo auditoría se escribirá:

- `generation-trace-{generationId}.json`;
- `generation-report-{generationId}.md`.

El directorio será configurable e inyectable para tests. En producción permanecerá desactivado salvo una opción explícita de auditoría. El writer escribirá primero un archivo temporal en el mismo directorio y después hará rename; si cualquiera de esos pasos falla, no publicará un artefacto parcial y añadirá el error a `errors[]` sin reemplazar el resultado del pipeline.

El Markdown tendrá las secciones `SOURCE`, `CASE ANALYSIS`, `DOCUMENT PLAN`, `COVERAGE BEFORE`, `GENERATION TASKS`, `PROVIDERS USED`, `FALLBACKS`, `SEMANTIC EVALUATIONS`, `COVERAGE AFTER`, `QUALITY GATE`, `DOCX EXPORT`, `WARNINGS` y `ERRORS`.

## 13. Sanitización y privacidad

La sanitización se aplicará antes de serializar cualquier trace o reporte:

- nunca se guardarán `NVIDIA_API_KEY`, tokens, contraseñas, cookies, cabeceras de autorización ni credenciales;
- se redactarán patrones de claves, bearer tokens, URLs con credenciales y errores que los contengan;
- se excluirán variables privadas irrelevantes para explicar la generación;
- se conservarán los campos jurídicos necesarios para reconstruir la entrada, respetando sus IDs, provenance y estructura;
- los outputs crudos se representarán por hash y tamaños, no por credenciales ni prompts completos sin control;
- el reporte declarará advertencias de redacción cuando se haya removido información.

## 14. Fixture y ejecuciones controladas

Se agregará un fixture completamente sintético con partes explícitas, número de expediente, cuatro o más hechos, dos o más pretensiones, tres o más elementos documentales y posturas procesales explícitas. El fixture no contendrá solución jurídica hardcodeada en el pipeline; solo datos de entrada para activar el flujo existente.

Se ejecutará el mismo caso en dos condiciones:

1. **NVIDIA real:** si `NVIDIA_API_KEY` existe y la llamada responde, el trace deberá probar `providerActuallyUsed = NVIDIA`. Si la clave no existe o el proveedor está bloqueado, se registrará el bloqueo exacto y no se simulará una llamada real.
2. **Fallback controlado:** se eliminará la clave únicamente en el entorno del proceso de prueba. El trace deberá probar `providerActuallyUsed = LOCAL` cuando responda `LocalProvider`, o `NONE` cuando se use fallback determinístico, con sus bloques clasificados fuera de contenido jurídico AI y sin falsa cobertura.

La comparación mostrará tareas, llamadas reales, bloques AI/determinísticos/fallback, coverage antes/después, bloques genéricos, placeholders, warnings, quality gate y palabras DOCX como dato descriptivo; las palabras no serán criterio de calidad.

## 15. Pruebas requeridas

Las pruebas cubrirán estos 20 contratos:

1. `generationId` presente.
2. `providerRequested` presente.
3. `providerActuallyUsed` presente.
4. `model` presente o explícitamente nulo cuando no exista.
5. ausencia de API keys y secretos.
6. trace por `GenerationTask`.
7. `DraftBlock` enlazado a tarea.
8. `DraftBlock` con origen AI/fallback.
9. `LocalProvider` no clasificado como AI legal completo.
10. fallback genérico no cubre un item sustantivo.
11. `[REQUIERE...]` no cubre.
12. `[DATO PENDIENTE...]` no cubre.
13. razón de cambio de Coverage conservada.
14. reconstrucción planificado/generado.
15. reconstrucción generado/renderizado.
16. trace disponible después de exportar.
17. mismo `generationId` en todas las etapas.
18. secretos ausentes del JSON y Markdown.
19. reporte JSON generable.
20. reporte Markdown generable.

Las pruebas nuevas se añadirán sin alterar las existentes para fabricar un baseline verde. La validación final repetirá pruebas focalizadas, typecheck, lint y build; el bloqueo `EPERM` se volverá a reportar si persiste, sin modificar código para ocultarlo.

## 16. Validación y criterios de aceptación

La fase estará lista cuando:

- una ejecución observable produzca un trace JSON válido con `generationId` común y timestamps completos;
- cada tarea y bloque generado tenga enlaces verificables;
- cada cambio de Coverage tenga razón y evidencia asociada;
- NVIDIA real se marque como NVIDIA solo cuando se haya ejecutado realmente;
- LOCAL/fallback quede separado semánticamente de contenido AI jurídico;
- ningún placeholder o fallback genérico satisfaga cobertura sustantiva;
- el reporte enlace párrafos DOCX con bloque, tarea, coverage y proveedor;
- JSON y Markdown no contengan secretos;
- el fixture sea sintético y reproducible;
- las pruebas nuevas pasen sin eliminar ni debilitar las existentes;
- la validación documente exactamente tests, typecheck, lint, build, warnings, errores y bloqueos ambientales.

## 17. Riesgos y decisiones explícitas

- **Riesgo de fuga:** se mitiga con allowlist estructural, redacción y hashes.
- **Riesgo de concurrencia:** se mitiga evitando estado global y usando un contexto por ejecución.
- **Riesgo de compatibilidad:** se mitiga con parámetros opcionales y tipos aditivos.
- **Riesgo de confundir éxito técnico con contenido jurídico:** se mitiga con `generatedBy`, clasificación de proveedor y guard de Coverage.
- **Riesgo de exportación sin trazabilidad:** se mitiga registrando el orden y hash de cada párrafo durante el ensamblado.
- **Riesgo ambiental de build:** el `EPERM` de `prisma generate` queda documentado como bloqueo observado mientras la DLL esté siendo utilizada por procesos activos; esta fase no detendrá ni reiniciará esos procesos ni alterará código para evitarlo.

## 18. Siguiente paso del proceso Architectural

Este documento es el diseño formal de la Fase 0. Debe revisarse antes de crear el plan de implementación. Tras la aprobación del spec se invocará `writing-plans` para descomponer las tareas, aplicar TDD y definir los puntos de verificación. Hasta entonces no se implementarán tipos, funciones, tests ni cambios de comportamiento.
