# Especificación — Generador universal de escritos jurídicos

**Fecha:** 2026-10-15  
**Estado:** propuesta para revisión humana; implementación no autorizada todavía  
**Blueprint aprobado:** `docs/blueprints/generador-universal-escritos-blueprint-2026-10-15.md`  
**Baseline:** `working-tree-baseline-2026-10-15.md` y `catalog-baseline-2026-10-15.json`

## 1. Propósito y alcance

Extender el flujo actual para generar documentos jurídicos con contratos de requisitos por familia y por tipo, preflight antes de generación sustantiva, provenance por afirmación, consistencia, gates conservados y una autorización de exportación separada para DRAFT y FINAL.

El alcance lógico son los 278 tipos canónicos visibles en el censo adjunto. Esta cifra identifica superficie de catálogo, no cobertura funcional ni aprobación legal. El censo actual registra 266 tipos DRAFT-capable/functional PASS y 12 IMPLEMENTED_BUT_UNCERTIFIED/functional FAIL; los 278 tienen `humanReview=PENDING`. Los 12 no generables por contrato no quedan habilitados por pertenecer al alcance del censo. El inventario por tipo y familia es la referencia inicial para planificar; se regenerará antes de implementación y no se tratará como una lista permanente.

La UI visual existente se conserva. No se cambian providers, configuración de providers, Prisma/schema, migraciones ni persistencia salvo que una decisión adicional lo autorice. No se relajan gates. Los cambios locales del baseline son ajenos a esta propuesta y deben permanecer intactos.

## 2. Evidencia disponible y límites

### Verificado en este turno

- Censo ejecutado directamente mediante `visibleWritingTypes()` y `writingTypeCensus()` de `lib/catalog/writingTypeIdentity.ts`, guardado íntegro en el JSON de baseline.
- Resultados del censo: 278 IDs visibles/canónicos; 222 con `kind=canonical`, 56 variantes; 3 aliases separados; 26 `familyIdentifiers` (IDs de nodos `FAMILY` de otro nivel); 91 valores distintos de `familyId` (agrupaciones de tipos); 20 áreas; 266 PASS/DRAFT-capable; 12 FAIL/no certificados; 0 huérfanos, duplicados, fallbacks incorrectos, blueprints/strategies faltantes o secciones requeridas vacías. No hay relación padre-hijo declarada entre `familyId` y `familyIdentifiers`.
- `humanReview` está pendiente para los 278 tipos y `finalEligible` no se deriva como habilitado por tipo.
- El working tree fue registrado antes de la especificación. Había 21 archivos rastreados modificados y los no rastreados enumerados en el baseline; no había entradas staged observadas. No se limpió, revirtió, reordenó ni sobrescribió ese trabajo.
- Existen rutas DOCX y PDF y una preparación común de exportación. DRAFT añade `exportNotice`; el aviso actual no coincide con la frase requerida. Hay distinción de materialización DRAFT/FINAL, autenticación/ownership en rutas y rechazo de payload PDF `renderedSections` legacy.
- `exportGuards` tiene override DRAFT que actualmente admite casi todos los errores de validación como warnings, excepto documento vacío y fuente no generada; varios checks de preflight/readiness/quality aparecen como errores generales. Hay que revisar código por código para separar impedimentos de seguridad/sustantivos de restricciones solo FINAL.
- `documentLifecycle` representa `DRAFT`, readiness y `FINAL_DOCUMENT`, pero el contrato observado no expone `approvedBy`/`approvedAt`. El catálogo tiene estado `humanReview` estático por tipo; eso no constituye aprobación por documento ni registro de quién/cuándo.
- La constitución y el estado de proyecto referencian artefactos con conteos históricos distintos (277). El estado actual de esta especificación usa exclusivamente el censo recién generado; las notas históricas no se actualizan ni se presentan como evidencia vigente.

### Pendiente de investigación antes de implementar

- Los contratos por familia se basarán en los 91 `familyId`, que son agrupaciones de tipos. Los 26 `familyIdentifiers` son IDs de nodos `FAMILY` de otro nivel; no hay relación padre-hijo declarada entre ambos y no se inferirá una. Blueprints y engines son registros separados que se contrastarán por cobertura, sin convertirlos en una taxonomía paralela ni fusionar tipos.
- Revalidar todos los diffs locales al inicio de implementación y detectar solapamientos de propiedad. El baseline es una captura temporal, no permiso para restaurar archivos.
- Encontrar si la persistencia documental ya disponible puede guardar un evento de aprobación inmutable/auditable vinculado a una revisión/hash y actor autenticado. No hay evidencia suficiente en esta etapa para afirmar que exista.
- Clasificar todos los códigos de `validateForExport`, quality gate, preflight, provenance, assembly y lifecycle como bloqueantes de ambos modos, FINAL-only, o warnings/pendientes admisibles en DRAFT limitado. La clasificación concreta debe fundamentarse en contratos y mantener el principio fail-closed.
- Validar fuentes oficiales, vigencias, transitorios y reglas jurisdiccionales tipo por tipo. Este trabajo no inventa ni adopta requisitos legales a partir del informe del usuario.

## 3. Usuarios y escenarios

### US1 — Configurar y prevalidar el escrito seleccionado (P1)

El abogado elige un tipo visible y aporta/adjunta los datos aplicables. La aplicación resuelve el tipo canónico, su familia y contexto jurídico; muestra campos, secciones, anexos y validaciones requeridas con explicación y provenance.

**Aceptación:** cada tipo visible resuelve a un contrato de tipo/familia identificable, o se bloquea con causa estable. Ningún tipo cae silenciosamente a `escrito_libre`/`generic`. `UNKNOWN` y conflicto permanecen explícitos y no se convierten en “no aplica”.

### US2 — Generar y exportar un DRAFT permitido (P1)

Sin aprobar, el abogado descarga DRAFT en DOCX y/o PDF cuando el formato esté soportado. Si el preflight es `READY_FOR_DRAFT` o `DRAFT_LIMITED`, la exportación conserva los límites y pendientes dentro del archivo y muestra `BORRADOR — PENDIENTE DE REVISIÓN`.

**Aceptación:** puede descargarse antes de aprobación; no cambia estado a FINAL. `BLOCKED_SUBSTANTIVE`, documento vacío, documento que solo contiene fuente subida, contenido inseguro/truncado o error fatal clasificado para ambos modos no puede exportarse mediante alias, override, renderer de bajo nivel ni ruta alternativa.

### US3 — Aprobar y exportar FINAL (P1)

Un actor humano autenticado aprueba expresamente la revisión exacta. FINAL vuelve a verificar aprobación, identidad, fecha de servidor, hash/revisión, ownership/authorization y todos los gates actuales y nuevos.

**Aceptación:** generación terminada, tipo PASS, transición técnica, `READY_TO_EXPORT` o respuesta HTTP exitosa no autoriza FINAL. Aprobación no elimina ni cubre findings pendientes. Si no hay registro auditable compatible disponible sin persistencia/migraciones nuevas, FINAL permanece bloqueado.

### US4 — Revisar contenido trazable y consistente (P2)

El abogado puede inspeccionar de dónde viene cada afirmación material y resolver hallazgos puntuales entre hechos, claims, pruebas, defensas, normas, petitorio y actuaciones.

**Aceptación:** una proposición no sustentada conserva su marcador/finding local y no borra contenido válido de toda la sección. Allegation, inferencia y hecho documentado conservan categorías diferentes.

## 4. Contratos de dominio

Los siguientes son contratos lógicos; antes de crear símbolos se reutilizan o amplían los existentes. Ninguno de los tipos propuestos obliga a crear una tabla ni un modelo Prisma.

### 4.1 Contrato por familia y tipo

Cada uno de los 278 IDs visibles resuelve por identidad canónica a un `WritingTypeContract` compuesto por un contrato de familia y una configuración explícita de tipo:

| Campo requerido | Contenido / regla |
|---|---|
| Identidad | `canonicalTypeId`, aliases, `familyId`, área/procedimiento, versión/hash del contrato. |
| Propósito | materia y uso procesal compatible; rol que promueve/contesta; tipo de acto fuente que habilita el escrito. |
| Generación | estrategia, blueprint de familia, template/plan, capabilities de DRAFT/DOCX/PDF y estado del catálogo con evidencia. |
| Estructura | secciones propias y orden, secciones opcionales opt-in, peticiones compatibles; prohibición explícita de importar secciones/petitorios incompatibles de otra familia. |
| Inputs | definición de campo, tipo/normalización, fuente admisible, required/conditional, predicado allowlisted de aplicabilidad, valor y confirmation/provenance. |
| Anexos/fuentes | requisito y compatibilidad de fuente; no transformar archivo de referencia en contenido generado o prueba ofrecida. |
| Validación | regla/version, alcance de aplicación, severidad, source/evidence ref, resultado esperado/error estable, responsable de resolución. |
| Completitud | estados separados: `REQUIRED`, `CONDITIONAL`, `NOT_APPLICABLE`, `UNKNOWN`; completitud `SATISFIED`, `MISSING`, `CONFLICT`, `UNVERIFIED`, `UNKNOWN`. `UNKNOWN` nunca es N/A. |

Las reglas se evalúan con predicados de dominio allowlisted, no con ejecución de código arbitrario o juicio de un LLM sobre aplicabilidad jurídica. Requisito legal necesita fuente autoritativa y temporalidad comprobable; estructura de producto puede declararse como tal y no etiquetarse como mandato legal. Cualquier tipo no configurado/ambiguo se bloquea o permanece explícitamente no certificable.

### 4.2 Inventario y agrupación inicial de familias

La partición visible por área del baseline es: civil 42; mercantil 17; familiar 24; laboral 13; constitucional/amparo 16; administrativo 9; fiscal 10; penal 17; agrario 6; sucesorio 10; corporativo/societario 15; contractual 17; inmobiliario 9; propiedad intelectual 11; consumidor 6; seguridad social 6; electoral 6; migratorio 4; transparencia/datos personales 5; escritos generales 35. Suma 278.

Los 91 `familyId` con cantidades y los 278 IDs, secciones/campos requeridos, capabilities y estados están en `catalog-baseline-2026-10-15.json`. `familyId` es la agrupación de tipos y será la base de los contratos por familia. Los 26 `familyIdentifiers` son IDs de nodos `FAMILY` de otro nivel; no hay relación padre-hijo declarada con los `familyId`. No se inferirá ni exigirá un mapeo entre ambas métricas. No se declara “cobertura por familia” contando áreas de catálogo. Los grupos funcionales a validar incluyen demandas, contestaciones/respuestas/reconvenciones, recursos, promociones/trámites, incidentes, pruebas, cautelares/ejecución/cumplimiento, alegatos/argumentación, amparo, instrumentos corporativos, contratos/convenios, operaciones/litigio inmobiliario, propiedad intelectual, reclamación/conciliación/consumo, transparencia/ARCO, electoral, migratorio y demás grupos presentes en el snapshot.

Antes de afirmar cobertura completa, la fase debe demostrar una relación uno-a-uno de cada ID visible a su configuración por tipo y a un contrato de familia compatible; tipos de una misma familia pueden tener inputs, estructura, anexos o petitorios diferentes.

### 4.3 Régimen jurídico y preflight

`LegalRegimeResolution` reutiliza el contrato existente y conserva provenance para jurisdicción/territorio, materia, órgano, procedimiento, etapa/instancia, actuación fuente, fechas relevantes, legislación/versiones, vigencia y regla transitoria aplicable. Campo irrelevante requiere una regla explícita de `NOT_APPLICABLE`; el nombre del tipo no completa datos.

`PreflightReport` devuelve versión de tipo/reglas, assessments por regla, referencias a fuentes, conflictos/faltantes, avisos, fecha de consulta y operaciones permitidas/bloqueadas. Distingue:

| Estado de preflight para DRAFT | Generación sustantiva | Exportación DRAFT |
|---|---|---|
| `READY_FOR_DRAFT` | Permitida bajo Coverage, provenance y gates. | Permitida sin aprobación con marca y avisos generales de revisión.
| `DRAFT_LIMITED` | Solo proposiciones/cláusulas que el contrato califica seguras; el resto se señala como pendiente. | Permitida sin aprobación si el artefacto limitado existe y pasa blockers fatales comunes; incorpora todos los avisos/pending.
| `BLOCKED_SUBSTANTIVE` | No permitida para el documento dependiente del blocker. | Prohibida; ningún override/renderizador/ruta lo convierte en DRAFT exportable.

La disponibilidad de FINAL es un eje aparte: `BLOCKED_FINAL` describe gates/aprobación pendientes y no cambia el permiso DRAFT cuando el estado DRAFT subyacente sea `READY_FOR_DRAFT` o `DRAFT_LIMITED`. El diseño debe representar ambas dimensiones sin un enum excluyente que haga que fallo FINAL bloquee DRAFT válido. Un DRAFT limitado no es `functionalStatus=PASS` ni satisface Coverage pendiente.

Los plazos requieren trigger y fecha fuente, norma y versión aplicables, vigencia/transitorio, unidad/calendario, cómputo y zona horaria. Si una premisa no se verifica, el plazo queda `UNKNOWN`/`UNVERIFIED`; no se imprime fecha límite afirmativa.

### 4.4 Provenance, consistencia y traza

Reutilizar entidades existentes de `RichCaseAnalysis`, `CoverageMatrix`, `LegalIssueMatrix`, `DocumentPlan`, `GenerationTask`, `DraftBlock`, `GenerationTrace`, `FactItem`, `ClaimItem`, `EvidenceMention`, `EvidenceOffer`, autoridades y posture. Cada afirmación material enlaza IDs de proposición/claim y evidencia fuente (documento, segmento/página/hash y limitaciones de extracción), clasificada como `DOCUMENTED_FACT`, `SOURCE_ALLEGATION`, `INFERENCE` o `PENDING_DATA`. No promover allegation/inference a hecho del cliente ni mención de evidencia a oferta.

Los findings de consistencia apuntan a IDs/alcance de hechos, defensa/issue, evidencia, autoridad, petición y actuación previa. Tipos: contradicción; falta de soporte; incompatibilidad de régimen/etapa; petición sin soporte; prueba no ofrecida; conflicto de fechas/roles. Hallazgos se admiten por proposición/cláusula, no por sección. Trace registra versiones/hashes, fuente y fecha de consulta, plazos/cómputo, inputs confirmados, findings, decisiones humanas y estados/resultados de gates, sanitizado según contratos existentes.

## 5. Estados y autorización de salida

### DRAFT

No requiere aprobación humana. Solo exporta el artefacto generado con preflight `READY_FOR_DRAFT` o `DRAFT_LIMITED`, contrato de tipo capaz de DRAFT y errores fatales comunes despejados. La marca visible exacta es `BORRADOR — PENDIENTE DE REVISIÓN`. Warnings y campos pendientes aplicables deben estar en el contenido legible de DOCX/PDF, no solo en headers/metadata. Exportar no muta lifecycle, no certifica tipo y no equivale a aprobación.

### FINAL / documento oficial

Requiere aprobación humana expresa, autenticada, server-side y enlazada a una revisión/hash inmutable del contenido y de la evidencia de gates. El evento debe capturar identidad del aprobador y timestamp del servidor; el cliente no decide su identidad ni fecha. En cada export FINAL se revalidan approval ownership/revision/hash y todos los gates actuales: preflight/regime, pending fields, Coverage, authorities/provenance, factual audit, consistency, assembly, `QualityGate`, lifecycle y certificación por evidencia. Approval no remedia ni suprime gate alguno.

La aprobación solo puede registrarse mediante almacenamiento auditable ya autorizado. Se investigará el mecanismo disponible antes de implementar. Si no cumple integridad, durabilidad, actor autenticado y vínculo de revisión, FINAL permanece cerrado. No migraciones ni nuevas tablas en este alcance; una alternativa que las requiera vuelve a autorización del titular.

### Tabla de formatos/modos

| Formato | DRAFT antes de aprobación | FINAL sin approval auditable | FINAL con approval pero gate pendiente | FINAL con approval + todos los gates |
|---|---|---|---|---|
| DOCX | Descarga si preflight permite READY/LIMITED; marca exacta y warnings/pending visibles. | Bloqueado server-side. | Bloqueado; aprobación no sustituye gates. | Permitido solo para la revisión/hash aprobada y tras revalidación.
| PDF | Igual que DOCX; el texto/aviso debe aparecer en el archivo PDF. | Bloqueado server-side. | Bloqueado; aprobación no sustituye gates. | Permitido solo para la revisión/hash aprobada y tras revalidación.

`BLOCKED_SUBSTANTIVE`, documento vacío, documento que solo sea fuente subida, contaminación SOURCE prohibida, salida truncada/seed no segura o contenido esencial sin soporte clasificado fatal se bloquea en ambas salidas. La clasificación final de cada finding se debe justificar; no se permite “warning” para esconder un blocker jurídico o de integridad.

## 6. Gates y compatibilidad

Conservar exactamente criterios y autoridad de los gates existentes. La integración nueva es aditiva; findings pueden impedir una operación, pero no fabricar PASS, reducir umbrales, deducir completitud de una lista, cubrir proposición por la sección entera ni convertir un estado técnico en aprobación humana.

Antes de editar se crea un mapa por finding-code con columnas: productor, evidencia requerida, efecto actual, efecto DRAFT, efecto FINAL, severidad/fatalidad, test propietario, decisión/evidencia. No se cambia provider ni configuración. La UI actual solo recibirá campos/resumen de preflight dentro de los componentes existentes; sin rediseño visual general.

## 7. Matriz de aceptación y regresión

| Caso | Preflight/approval/gate | Export DOCX | Export PDF | Resultado requerido |
|---|---|---|---|---|
| D1 | READY_FOR_DRAFT; no aprobación. | 200/binario válido. | 200/binario válido. | DRAFT descargable antes de aprobación, marca exacta y aviso visible.
| D2 | DRAFT_LIMITED; campos y avisos pendientes. | Archivo contiene aviso, campos/marcadores y advertencias. | Archivo contiene aviso, campos/marcadores y advertencias. | Ningún pendiente se sanitiza/omite; DRAFT no altera readiness.
| D3 | BLOCKED_SUBSTANTIVE. | Rechazo. | Rechazo. | Override, parámetro, renderer directo y legacy route no hacen bypass.
| D4 | Fuente cargada sin escrito generado o documento vacío. | Rechazo. | Rechazo. | Source-only guard se mantiene central para ambos formatos.
| F1 | Sin aprobación humana por documento. | Rechazo. | Rechazo. | Aprobación de tipo o éxito técnico no autoriza FINAL.
| F2 | Approval actor/time/hash válidos, cualquier gate pendiente o fallido. | Rechazo con gate/finding trazable. | Rechazo con gate/finding trazable. | Aprobar no salta gates.
| F3 | Aprobación de revisión A; documento modificado a revisión B. | Rechazo. | Rechazo. | Approval no se reutiliza después de cambio de hash/revisión.
| F4 | Aprobación válida de revisión exacta; todos los gates PASS. | Binario permitido. | Binario permitido. | Actor/fecha y vínculo de revisión auditables; sin marca DRAFT.
| X1 | Cita no verificada / source dependency / truncamiento según clasificación. | Retener warning DRAFT si es seguro, o rechazar si fatal; FINAL bloqueado. | Mismo resultado que DOCX. | Consistencia de contrato entre formatos.
| X2 | Tipo sin capability DRAFT o no certificado. | Según catalog capability: bloqueado si no generable. | Igual. | No elevar los 12 tipos no certificados por ser visibles.
| X3 | Payload legacy `renderedSections`. | Mantener barrera existente. | Rechazo. | Sin bypass de formato.

Umbrales globales:

1. 278 IDs del censo fresco se clasifican sin duplicidad/huérfanos; cada estado y excepción se explica por ID. El censo se regenera antes de ejecución y reporta delta, no sustituye evaluación.
2. Los 91 grupos `familyId` tienen contrato y prueba representativa; 100% de tipos visibles tiene configuración/estrategia/secciones/compatibilidad explícita o bloqueo documentado. No se declara cobertura jurídica por presencia en catálogo.
3. 0 hechos/autoridades/plazos/peticiones/ofertas inventadas superan gates en fixtures sintéticos.
4. Todos los D1–X3 se verifican en los formatos soportados; comparación antes/después muestra cero gates degradados.
5. Ningún FINAL se permite sin aprobación por revisión/hash, actor, timestamp server-side y todos los gates en el momento de exportar.
6. Si falta mecanismo auditable compatible, FINAL mantiene fail-closed y se reporta como decisión bloqueante, no como aceptación parcial.

## 8. Riesgos y decisiones de alcance

- **Niveles de familia distintos:** `familyId` (91) agrupa tipos; `familyIdentifiers` (26) son IDs de nodos `FAMILY` de otro nivel. No hay relación padre-hijo declarada. Los contratos usarán los 91 `familyId`; no se creará una relación inferida ni se modificará el catálogo.
- **Auditoría de aprobación inexistente/no confirmada:** puede requerir almacenamiento que está fuera del alcance. Resultado seguro: FINAL bloqueado; pedir autorización separada antes de cualquier ampliación persistente.
- **Overrides demasiado amplios:** DRAFT permitido no implica que todo error se vuelva warning. Clasificación y matriz de casos fatal/FINAL-only/warning son prerequisito.
- **Avisos perdidos en sanitización/render:** verificar contenido extraído de DOCX real y PDF binario, no solo metadatos/headers.
- **Working tree con cambios superpuestos:** `.env.example`, UI, `caseContext`, `caseDossier`, `pipeline` y `reviewAnnex` ya tienen cambios locales. El plan debe leer y respetar cada diff, evitar reemplazos amplios y detener modificaciones en esos archivos ante solapamiento no resoluble.
- **Fuentes jurídicas insuficientes:** no activar regla legal por intuición, plantilla o jurisdicción por default. Marcar UNKNOWN y limitar/bloquear la operación dependiente.

Decisiones que, si hacen falta, requieren autorización posterior: persistencia nueva o migration para auditoría; providers/adapter externos; cambiar estado de catálogo o capabilities de cualquiera de los 278; cambios visuales generales; exportación de tipos no DRAFT-capable; cambio de cualquier gate; activar fuentes/rules jurídicos que no tengan oficialidad/vigencia acreditada.

## 9. No objetivos

No se redacta el documento del padre del usuario ni se modifica el ejemplo real. No se implementa, no se cambian tests ni fixtures de producción durante esta entrega de especificación/plan. No se cambia provider ni DB; no se añade Prisma, migración, tabla o modelo persistente; no se rediseña UI; no se aprueba legalmente contenido; no se afirma que todos los 278 tipos estén funcionalmente cubiertos.
