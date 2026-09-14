# FASE 5B — Verified Research Reentry into Issue-Scoped Generation

Estado: diseño focalizado. FASE 5A permanece cerrada; este documento no implementa la reentrada ni crea un plan de implementación.

## Objetivo y límites

Permitir que una `LegalIssue` cuyo estado canónico sea `NEEDS_RESEARCH` use el executor existente de FASE 4 únicamente cuando exista investigación previamente producida, suficiente, íntegra y scoped a esa issue. La salida efectiva será derivada:

```text
LegalIssue(NEEDS_RESEARCH)
  + LegalResearchBundle(VERIFIED_SUFFICIENT)
  + DerivedIssueReadiness(READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH)
  -> effective eligibility
  -> IssueContextPack con verifiedResearch scoped
  -> IssueDraftResult validado
  -> evaluación semántica
  -> DraftBlock y trace reconstruibles
```

El estado `LegalIssue.status` nunca se modifica. FASE 5B consume `LegalResearchBundle` y `DerivedIssueReadiness`; no ejecuta retrieval, verificación, adapters, web, RAG, DB, persistencia, UI, DOCX, Prisma, Neon ni aprobaciones humanas. No se investigan ni limpian warnings. El único registro de deuda técnica es `TECH_DEBT_LINT_DELTA_PHASE5A` por el cambio de 1030 a 1036 warnings.

## Inspección acotada y seams actuales

La inspección se limitó a los archivos indicados y a las pruebas directamente relacionadas. El diseño parte de estos seams existentes:

* `legal-research/types.ts` ya define `LegalResearchBundle`, `DerivedIssueReadiness` y `VerifiedAuthority`, incluyendo `researchHash`, estado temporal, jurisdicción, proposición y `supportsLegalIssueIds`.
* `legal-research/readiness.ts` deriva readiness sin mutar la issue, pero el resultado todavía no participa en la elegibilidad del executor.
* `issueScopedGeneration.ts` tiene el único executor, el allowlist de `IssueContextPack`, `buildVerifiedResearchContext`, el prompt, la validación post-provider y la ejecución concurrente. Hoy `resolveIssueEligibility` solo admite el estado canónico `READY_FOR_GENERATION`; el contexto aún hashea solo el caso scoped.
* `issueDraftResult.ts` separa `authorityMentionIds`, pero todavía no tiene una relación para autoridades verificadas ni un guard de citas textuales contra ese allowlist.
* `generationTrace.ts` ya tiene trazas separadas de investigación y generación, pero los nodos de attempt, task y `draftBlocks` aún no conservan el vínculo `requestId`/`researchHash`/`verifiedAuthorityIds`.
* `coveragePolicy.ts` exige un bloque vinculado, validación final y `PASS` para Coverage sustantiva; research por sí solo no debe cambiar esa política.
* `pipeline.ts` filtra elegibilidad antes de invocar `executeReadyIssueTasks`; ese filtro y el executor deben consultar la misma resolución efectiva para evitar divergencia.

## Alternativas consideradas

### A. Adaptación aditiva del executor existente — recomendada

Añadir una resolución pura de elegibilidad efectiva, un mapa opcional de artefactos de research y campos aditivos en pack, resultado, block y trace. El pipeline y `IssueScopedGenerationExecutor` comparten la misma decisión; el executor sigue siendo único y la ruta normal `READY_FOR_GENERATION` no requiere bundle.

Ventajas: conserva orden, concurrencia, retry, evaluación y ensamblado de FASE 4; reduce el riesgo de dos políticas de autorización; hace explícito el fail-closed antes del provider. Es la opción compatible con la preferencia de esta fase.

### B. Segundo executor para issues desbloqueadas — descartada

Crear un executor separado para research reentry duplicaría prompt, validación, retries, cobertura y trace. También facilitaría que una ruta admita una autoridad o un estado que la otra rechace. No se adopta.

## Arquitectura recomendada

### Resolución única de eligibility

Introducir, de forma pura y sin mutaciones, una función equivalente a:

```ts
resolveEffectiveIssueGenerationEligibility({
  issue,
  derivedReadiness,
  researchBundle,
  formal,
  taskType,
})
```

La salida debe conservar la forma compatible con `IssueEligibility` y añadir información auditable:

```ts
{
  eligible: boolean;
  legalIssueId: string;
  canonicalStatus: LegalIssueStatus;
  effectiveStatus:
    | 'READY_FOR_GENERATION'
    | 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH'
    | 'BLOCKED';
  reason: string;
  requestId?: string;
  researchHash?: string;
  verifiedAuthorityIds: string[];
}
```

`resolveIssueEligibility` puede permanecer como wrapper compatible para consumidores existentes, pero pipeline y executor deben depender de la resolución efectiva cuando reciben artefactos de research. No se permite que un booleano local alternativo decida el provider.

Para una issue normal, el resultado actual `READY_FOR_GENERATION` sigue siendo válido sin bundle cuando la issue es `EXPLICIT`, no es formal, no es `LEGAL_RESEARCH`, y su estado canónico es `READY_FOR_GENERATION`.

Para reentrada de research, todos estos predicados son obligatorios:

1. `issue.status === 'NEEDS_RESEARCH'`.
2. `derivedReadiness.legalIssueId === issue.id`.
3. `derivedReadiness.researchReadiness === 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH'`.
4. `researchBundle.researchStatus === 'VERIFIED_SUFFICIENT'`.
5. `researchBundle.legalIssueId === issue.id`.
6. `researchBundle.researchHash` coincide con `derivedReadiness.researchBundleHash` y es no vacío.
7. El régimen del bundle está resuelto, sin campos no resueltos que bloqueen su uso.
8. El request del bundle pertenece a la misma issue y tiene `requestId` no vacío.
9. La proyección de authorities deja al menos una `VerifiedAuthority` usable para esa issue.
10. No existen blockers canónicos ni derivados, y la tarea no es formal ni `LEGAL_RESEARCH`.

La función rechaza, sin intentar reparar, un bundle ausente, mismatch de issue, mismatch de hash, status insuficiente, readiness incompatible, bundle malformado o conjunto de authorities vacío después del filtro. La salida bloqueada debe explicar la primera razón estable de la política, por ejemplo `RESEARCH_BUNDLE_REQUIRED`, `RESEARCH_BUNDLE_ISSUE_MISMATCH`, `RESEARCH_HASH_MISMATCH`, `RESEARCH_STATUS_NOT_SUFFICIENT`, `RESEARCH_READINESS_NOT_EFFECTIVE` o `VERIFIED_AUTHORITY_SCOPE_EMPTY`.

### Precedencia de blockers

Los blockers se evalúan antes de cualquier autorización por research y nunca son eliminados por el bundle:

| Condición | Resultado |
| --- | --- |
| `BLOCKED_BY_CONFLICT` o conflictos vinculados | cero provider; `BLOCKING_CONFLICT_REQUIRES_REVIEW` |
| `NEEDS_CLIENT_POSITION` o posición desconocida | cero provider; `MISSING_CLIENT_POSITION_REQUIRED` |
| `UNLINKED` | cero provider; `UNLINKED_COVERAGE_REQUIRES_REVIEW` |
| `UNKNOWN` | cero provider; `UNKNOWN_ISSUE_STATUS_REQUIRES_REVIEW` |
| `VERIFIED_PARTIAL`, `NO_AUTHORITY_FOUND`, `REGIME_UNRESOLVED` o `REQUIRES_HUMAN_REVIEW` | cero provider; readiness/status no desbloqueante |
| `NEEDS_RESEARCH` sin bundle válido | cero provider; dependencia de research pendiente |
| `NEEDS_RESEARCH` con todos los predicados válidos | provider permitido, solo con authorities scoped |

La presencia de research solo elimina la dependencia de research. No convierte una issue en `READY_FOR_GENERATION` canónica, no resuelve conflictos, no crea `ClientPosition`, no enlaza Coverage y no altera `LegalIssueMatrix`.

### Flujo de datos

El pipeline recibirá o construirá un mapa efímero `legalIssueId -> { bundle, derivedReadiness }` a partir de artefactos ya producidos por FASE 5A. Ese mapa se entrega como opción al executor existente. No se hace retrieval desde `executeIssueScopedGeneration`.

El filtro previo de `pipeline.ts` llamará a la misma función `resolveEffectiveIssueGenerationEligibility` que el executor. El executor vuelve a resolver antes de construir el prompt como defensa de frontera; si las dos llamadas difieren por artefactos inválidos, el provider no se invoca. Las issues normales siguen transitando por la misma ruta sin necesidad de map.

## `IssueContextPack` y prompt

La ampliación es aditiva. Se conserva el campo actual `authorities` para las `SourceAuthorityMention` expresamente vinculadas y se añade una relación separada:

```ts
verifiedResearch?: {
  requestId: string;
  researchHash: string;
  authorities: Array<{
    id: string;
    identity: VerifiedAuthority['identity'];
    source: VerifiedAuthority['source'];
    temporalValidity: VerifiedAuthority['temporalValidity'];
    jurisdictionValidity: VerifiedAuthority['jurisdictionValidity'];
    proposition: VerifiedAuthority['proposition'];
  }>;
}
```

La proyección debe ser pura, copiar arrays anidados y filtrar únicamente authorities que cumplan simultáneamente:

* `verificationStatus === 'VERIFIED'`;
* el bundle y la authority corresponden a `issue.id`;
* `supportsLegalIssueIds` contiene `issue.id`;
* `source.sourceTier === 'OFFICIAL_PRIMARY'`;
* `regimeResolution.status === 'RESOLVED'` y su metadata no está incompleta para la cuestión;
* `temporalValidity.status` es `CURRENT_AND_APPLICABLE` o `HISTORICALLY_APPLICABLE`;
* `jurisdictionValidity.status === 'APPLICABLE'`.

Se excluyen siempre `AuthorityCandidate`, `RejectedAuthorityCandidate`, authorities secundarias, errores de adapter, otras issues, otros bundles, corpus recuperado y excerpts no allowlisted. `WRONG_JURISDICTION`, `UNKNOWN`, `REVIEW_REQUIRED`, `REPEALED`, `SUPERSEDED`, `CURRENT_BUT_TEMPORAL_REVIEW_REQUIRED` y `UNKNOWN_EFFECTIVE_DATE` no entran como autoridad usable. FASE 5B no corrige esos estados.

`sourceAuthorityMentions`/`authorities` continúa significando citas observadas en documentos fuente, normalmente `SOURCE_CITED`; `verifiedResearch.authorities` significa autoridad comprobada por FASE 5A. Las dos relaciones no se fusionan aunque una authority verificada tenga `sourceAuthorityMentionIds`.

El `contextHash` se calcula sobre el contexto scoped existente más una representación estable de `verifiedResearch.requestId`, `verifiedResearch.researchHash` y los campos allowlisted de las authorities. Debe ordenar colecciones de IDs donde la semántica sea de conjunto, no depender de `retrievedAt` o del orden accidental de authorities y conservar el helper de hashing existente. Por tanto:

```text
same issue context + different researchHash => different contextHash
equivalent scoped research with reordered arrays => stable contextHash
```

El prompt añade una sección explícita `VERIFIED AUTHORITIES AVAILABLE` con, por cada authority, identidad/cita canónica, proposición, nivel de soporte, estado temporal, jurisdicción, carácter vinculante si existe, locator y limitaciones. La instrucción exige aplicar la proposición solo junto con facts/evidence allowlisted, conservar las limitaciones y no afirmar obligatoriedad que la metadata no soporte. El request enviado al provider contiene el `IssueContextPack` scoped; nunca contiene candidates, rejections ni un corpus monolítico.

## `IssueDraftResult`, validación y `DraftBlock`

Añadir de forma aditiva al resultado:

```ts
verifiedAuthorityIds?: string[];
researchHash?: string;
```

La entrada de validación tendrá allowlist y expectativa separadas, conceptualmente:

```ts
allowedVerifiedAuthorityIds?: string[];
expectedResearchHash?: string;
researchUnlocked?: boolean;
```

Reglas:

* `authorityMentionIds` solo referencia `SourceAuthorityMention` y conserva la guarda actual de alcance/estado `SOURCE_CITED`.
* `verifiedAuthorityIds` solo puede contener IDs del `verifiedResearch.authorities` de la issue actual; un ID desconocido produce `INVALID_FATAL`.
* En una generación desbloqueada, `researchHash` debe estar presente y ser exactamente el hash del pack/bundle; un hash ausente o viejo falla antes de evaluación semántica. En la ruta normal, los campos siguen siendo opcionales.
* El esquema de salida, el issue ID, Coverage IDs, source IDs, placeholders, requirements y metadata existente siguen siendo obligatorios y fail-closed.
* Un resultado `VALID_NON_FINAL` o fallback nunca se transforma en cobertura válida ni se usa para saltar el gate de investigación.

La validación post-provider también debe revisar las citas explícitas de los campos textuales (`thesis`, desarrollos, aplicación y conclusión). El guard determinista resolverá citas contra los IDs de `authorityMentionIds` y `verifiedAuthorityIds` permitidos; una cita jurídica explícita que no pueda resolverse a una de esas relaciones produce `AUTHORITY_CITATION_OUT_OF_SCOPE`. Una identidad de `VerifiedAuthority` usada en el texto exige además su ID en `verifiedAuthorityIds`; no basta con que exista en el prompt. Las referencias genéricas no identificables se mantienen sujetas a la evaluación semántica y a la prohibición de inventar derecho. La evaluación debe marcar como insuficiente una aplicación que convierta una proposición verificada en un hecho no presente, elimine una limitación o afirme un alcance temporal/jurisdiccional no autorizado.

`draftBlockFromIssueResult` conserva la distinción y copia:

```ts
verifiedAuthorityIds?: string[];
researchHash?: string;
```

También conserva `authorityMentionIds`/`authorityIds` legacy, `legalIssueIds`, Coverage IDs, facts, evidence, `generationTaskId`, provider/model, estado de validación y evaluación. El block no puede quedar con `researchHash` sin authorities permitidas ni con authorities verificadas sin el hash esperado cuando provenga de reentrada.

## Coverage

No se modifica la semántica de `isCoverageSatisfied` para interpretar bundles. La transición a Coverage sustantiva sigue necesitando un bloque exactamente vinculado, `VALID_ACCEPTED`, evaluación `PASS` sin hard fails y la política existente. Para un bloque de research reentry, el pipeline solo permite llegar a esa transición si la resolución efectiva fue válida, el bundle fue `VERIFIED_SUFFICIENT` y no hubo blocker.

Así, research suficiente por sí solo no cubre nada; una issue puede cerrarse conforme a la política únicamente después de draft aceptado y `PASS`. `VALID_NON_FINAL`, fallback, conflicto, posición de cliente faltante y cualquier marcador pendiente siguen sin cubrir. Las authorities verificadas no crean facts, evidence offers, client positions ni Coverage items.

## Trace y reconstrucción

La traza se extiende sin duplicar `LegalResearchTrace`. Los vínculos deben ser por IDs y hashes:

```text
Coverage item
  -> legalIssueId
  -> requestId + researchHash
  -> derivedReadiness
  -> GenerationTask
  -> IssueGenerationAttempt
  -> IssueDraftResult
  -> DraftBlock
```

Añadir, donde corresponda, `requestId`, `researchHash`, `verifiedAuthorityIds`, `derivedReadiness` y `effectiveEligibilityReason` a los registros de task/attempt/result/block. El mínimo reconstructivo por issue debe permitir responder: qué bundle y request fueron usados, qué authorities verificadas entraron, por qué la issue fue efectivamente elegible, qué hash recibió el provider, qué resultado fue aceptado y qué block quedó vinculado. La traza no copia `rejectedCandidates`, candidates ni todo el `LegalResearchTrace` dentro de cada attempt.

El `GenerationTrace.legalResearch` existente continúa siendo el registro agregado de FASE 5A cuando esté disponible; los nuevos campos de generación son referencias ligeras al bundle, no una segunda copia de su contenido. `recordDraftBlock` y `recordIssueGenerationAttempt` deben conservar los nuevos campos después de sanitización.

## Compatibilidad y aislamiento

* Las cuatro issues normales `READY_FOR_GENERATION` de Fixture F se mantienen generables sin bundle; no se codifica el número seis.
* Las dos issues `NEEDS_RESEARCH` solo se desbloquean en pruebas que entreguen bundles suficientes y readiness correspondiente para cada issue; cada issue se filtra de forma independiente.
* `VERIFIED_PARTIAL`, `NO_AUTHORITY_FOUND`, `REGIME_UNRESOLVED` y `REQUIRES_HUMAN_REVIEW` producen cero llamadas finales.
* La ejecución de generación no llama adapters de investigación, aunque el prompt no tenga derecho suficiente.
* Se conserva el comportamiento rich-first; la ruta legacy no sintetiza authorities verificadas y permanece sin cambios sustantivos. Formal, non-labor y los fallbacks existentes siguen sus gates actuales.
* El executor no muta `LegalResearchBundle`, `DerivedIssueReadiness`, `LegalIssue`, `LegalIssueMatrix`, Coverage matrix ni el contexto de análisis. La proyección usa copias.
* Un error o fallo de una issue solo bloquea esa issue; no cancela ni contamina las demás.

## Archivos afectados por una futura implementación

Estos son los archivos de código que el plan posterior deberá evaluar, sin modificar en esta fase:

* `lib/legal-engine/issueScopedGeneration.ts`: resolver efectiva única, artefactos opcionales, pack scoped, prompt, validación de entrada al provider y propagación a outcome/trace.
* `lib/legal-engine/issueDraftResult.ts`: campos verificados, validación de hash/IDs, guard de citas explícitas y proyección a block.
* `lib/legal-engine/types.ts`: campos aditivos en `ContentBlock` si la forma actual del block no permite conservar metadata.
* `lib/legal-engine/generationTrace.ts`: metadata de research en task/attempt/draft block y sanitización correspondiente.
* `lib/legal-engine/pipeline.ts`: pasar artefactos ya producidos y usar la misma resolución en el filtro previo, sin retrieval.
* `lib/legal-engine/coveragePolicy.ts`: preferentemente solo verificación de que no se introduce una ruta de satisfacción por research; no añadir lógica de retrieval ni convertir research en cobertura.
* `lib/legal-engine/legal-research/readiness.ts` y `legal-research/types.ts`: solo si el contrato final necesita una adaptación mínima de tipos; no cambiar la producción de bundles ni la semántica canónica de FASE 5A.

Pruebas directamente relacionadas para la futura fase: `tests/legal-engine/issueScopedGeneration.test.ts`, `legalResearchReentryTypes.test.ts`, `legalResearchReadiness.test.ts`, `legalResearchPipeline.test.ts`, `legalResearchBundle.test.ts`, `richCoveragePolicy.test.ts` y `generationTraceContext.test.ts`. Se recomienda añadir una suite focal separada para reentry, no esconder los 50 contratos nuevos dentro de regresiones no relacionadas.

## Contratos TDD mínimos

La suite futura debe implementar estos 50 contratos, sin hardcodear el resultado “6”:

| Grupo | Contratos |
| --- | --- |
| Elegibilidad y blockers | 1. `NEEDS_RESEARCH` sin bundle no llama provider; 2. `VERIFIED_PARTIAL` no llama; 3. `NO_AUTHORITY_FOUND` no llama; 4. `REGIME_UNRESOLVED` no llama; 5. bundle `VERIFIED_SUFFICIENT` + readiness correcta sí permite provider; 6. el estado canónico permanece `NEEDS_RESEARCH`; 7. conflicto sigue bloqueando; 8. posición de cliente sigue bloqueando; 9. `UNLINKED` sigue bloqueando; 10. bundle de otra issue se rechaza. |
| Integridad del research y contexto | 11. hash distinto se rechaza; 12. authority cross-issue se rechaza; 13. el contexto solo contiene authorities de la issue; 14. candidates rechazados no aparecen en prompt; 15. candidate secundario no aparece; 16. `SOURCE_CITED` sigue separado; 17. `authorityMentionIds` sigue separado; 18. `verifiedAuthorityIds` se registra; 19. ID verificado desconocido falla; 20. el provider no puede inventar una authority verificada. |
| Prompt, proposición y hash | 21. proposición aparece en prompt; 22. limitaciones aparecen; 23. temporalidad aparece; 24. jurisdicción aparece; 25. cambiar `researchHash` cambia `contextHash`; 26. research equivalente mantiene hash estable; 27. DraftBlock conserva `researchHash`; 28. DraftBlock conserva IDs verificados; 29. trace conserva `researchHash`; 30. trace conserva IDs verificados. |
| Coverage y regresión funcional | 31. se traza la razón de eligibility efectiva; 32. research solo no cubre; 33. draft aceptado + `PASS` puede cubrir conforme a policy; 34. `VALID_NON_FINAL` no cubre; 35. fallback no cubre; 36. `READY_FOR_GENERATION` normal funciona sin bundle; 37. no hay regresión en las cuatro READY de Fixture F; 38. las dos research se desbloquean con bundles fixture suficientes; 39. research-only conserva cero generación; 40. generación no invoca adapters de research. |
| Aislamiento, compatibilidad y trace chain | 41. no hay adapter/network real; 42. legacy no cambia; 43. non-labor no cambia; 44. formal no cambia; 45. bundle no se muta; 46. matrix no se muta; 47. ensamblado research-unlocked es determinista; 48. fallo de una issue queda aislado; 49. el request no contiene corpus monolítico; 50. existe cadena `Coverage -> Issue -> Research -> Task -> Block`. |

## Riesgos y mitigaciones

* **Bypass de eligibility:** el filtro del pipeline y el executor podrían divergir. Mitigación: una resolución pura compartida y una segunda comprobación de frontera antes del provider.
* **Research stale:** un block podría reutilizarse tras cambiar el bundle. Mitigación: `researchHash` en pack, resultado, block, attempt y trace; hash de contexto derivado.
* **Contaminación cross-issue:** un bundle o authority podría filtrarse a otra issue. Mitigación: validar issue en bundle, readiness, authority y supports-list; fail-closed con autoridad scoped vacía.
* **Sobreafirmación jurídica:** una proposición limitada podría convertirse en una conclusión fáctica o vinculante. Mitigación: prompt con limitaciones y metadata, facts/evidence allowlisted, guard de citas y hard fails semánticos.
* **Conflación de relaciones:** `SOURCE_CITED` podría marcarse como verificada. Mitigación: campos e IDs separados y validación independiente.
* **Falsa cobertura:** research suficiente podría promover Coverage sin texto aceptado. Mitigación: ningún bundle modifica Coverage; se conserva `VALID_ACCEPTED` + `PASS` + policy.
* **Trace incompleto o excesivo:** faltar el vínculo o copiar toda la investigación. Mitigación: IDs/hashes ligeros en generación y `LegalResearchTrace` agregado separado.
* **Regresión de READY normal:** exigir bundle global rompería FASE 4. Mitigación: la rama canónica normal permanece explícita y no requiere artefactos.

## Decisiones pendientes para el plan posterior

1. Elegir la forma final del mapa de artefactos (`Map`, record inmutable u objeto de ejecución) sin exponer bundles completos a tareas no scoped.
2. Confirmar si `requestId` se conserva solo dentro de `verifiedResearch` y trace, o también en una metadata mínima del `DraftBlock`; el hash sí es obligatorio en block de reentrada.
3. Fijar la ubicación definitiva de `ContentBlock.verifiedAuthorityIds` y `ContentBlock.researchHash` si el tipo canónico no vive únicamente en `types.ts`.
4. Definir el parser determinista de citas explícitas y su tabla de alias; el principio ya queda fijado: cita no resoluble o authority inventada falla, mientras una referencia genérica queda sujeta a evaluación semántica.
5. Precisar qué campos de `LegalRegimeResolution` cuentan como insuficientes para la policy de reentrada, sin reabrir la resolución de régimen de FASE 5A.
6. Confirmar el código de reason estable para un conjunto de authorities vacío después del filtro; la decisión funcional ya es cero provider.

## Auto-revisión limitada

* La propuesta usa un solo executor y no crea una ruta paralela.
* No muta estado canónico, bundle, readiness, matrices ni inicia investigación durante generación.
* Mantiene separadas `SOURCE_CITED` y `VerifiedAuthority`.
* Incluye hash, IDs y request para reconstrucción sin duplicar `LegalResearchTrace`.
* Mantiene el gate de Coverage existente y exige aceptación/semántica antes de cualquier satisfacción.
* Incluye los 50 contratos solicitados y cubre las regresiones normal, legacy, non-labor y formal.
* El alcance no incluye adapters reales, web, persistencia, UI, warnings, NVIDIA, subagentes, implementación ni pruebas ejecutadas.

No quedan placeholders de implementación en este spec; las seis decisiones pendientes están delimitadas para el plan posterior. Esta fase termina aquí y no inicia la siguiente etapa.
