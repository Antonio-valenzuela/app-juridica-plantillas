# FASE 4 — Issue-Scoped Multi-Call Legal Generation

**Fecha:** 2026-09-08  
**Estado:** propuesta de diseño para aprobación  
**Dependencia:** FASE 3 cerrada y aceptada  
**Alcance:** generación sustantiva por `LegalIssue` elegible, sin investigación jurídica real

## A. Estado actual relevante

La inspección se limita a `generationTasks.ts`, `pipeline.ts`, `semanticEvaluator.ts`, `coveragePolicy.ts`, `legalIssueMatrix.ts`, `generationTrace.ts`, los tipos de `ContentBlock` y el provider/orchestrator vigente.

1. `RichCaseAnalysis`, `CoverageMatrix` y `LegalIssueMatrix` son los modelos canónicos de entrada.
2. `LegalIssueMatrix` es rich-first y `legalIssueIds[]` es la relación canónica; los aliases singulares son únicamente legacy.
3. `buildGenerationTasksForSection` ya puede producir tareas `ISSUE`, `CLAIM`, `FACT_RESPONSE`, `EVIDENCE`, `SECTION_SUPPORT`, `COVERAGE_ITEM` y `LEGAL_RESEARCH`.
4. Las tareas rich conservan `legalIssueIds[]`, `coverageItemIds[]`, IDs de hechos, evidencia y autoridades.
5. `LEGAL_RESEARCH` ya es una tarea plan-only y no debe llegar al provider.
6. `buildTaskContextPack` filtra hechos, evidencia y autoridades mediante relaciones explícitas, pero su salida actual sigue siendo un prompt textual y no un contexto tipado de issue.
7. El pipeline todavía parte de una iteración por sección; dentro de ella ejecuta tareas y agrega bloques, por lo que el límite natural continúa siendo la sección.
8. `executeGenerationTask` admite un `customGenerator` de texto o llama a `runFastMode`; no exige actualmente un `IssueDraftResult` estructurado.
9. `runFastMode` conserva la cadena NVIDIA → `LocalProvider`; el provider no debe reescribirse en FASE 4.
10. El resultado del provider tiene `content`, `structuredOutput` opcional, metadatos de provider/modelo, `usage` opcional y origen/fallback.
11. Un éxito del provider no equivale todavía a un draft legal aceptado: la aceptación debe quedar detrás de validación y evaluación.
12. `evaluateBlockQuality` ya valora factual grounding, evidencia, especificidad, respuesta a la issue, soporte legal, repetición y completitud sobre un `ContentBlock`.
13. La evaluación existente no recibe un resultado estructurado por componentes antes de crear el bloque.
14. `ContentBlock` conserva `coverageItemIds`, `factIds`, `evidenceIds`, `generationTaskId`, provider, modelo y evaluación, pero requiere `legalIssueIds` y `authorityIds` para completar la trazabilidad rich-first.
15. Los límites existentes son `MAX_CONCURRENT_GENERATIONS = 3`, `MAX_TASK_RETRIES = 2`, `MAX_CONTINUATIONS_PER_TASK = 2` y un presupuesto máximo de 7000 tokens por tarea.
16. El executor actual tiene fallback local/determinista; ese fallback no puede satisfacer Coverage sustantivo.
17. `GenerationTrace` conserva tareas, ejecuciones, transiciones de Coverage, evaluaciones y bloques, pero requiere un registro explícito por intento de issue.
18. `QualityGate` ya es estructural y FASE 4 no debe convertir `NEEDS_RESEARCH` en una investigación real ni ocultar fallos de validación.
19. Los encabezados, labels, firma, fecha, autoridad formal y demás estructura formal deben continuar siendo determinísticos.
20. Fixture F ya representa 13 issues: 4 `READY_FOR_GENERATION`, 5 `NEEDS_CLIENT_POSITION`, 2 `BLOCKED_BY_CONFLICT` y 2 `NEEDS_RESEARCH`.

## B. Arquitectura propuesta

Se agrega una capa de coordinación issue-scoped encima del flujo existente, sin crear otra matriz ni sustituir `runFastMode`.

```text
RichCaseAnalysis
    ↓
CoverageMatrix
    ↓
LegalIssueMatrix
    ↓
buildGenerationTasksForSection
    ↓
Issue eligibility
    ├─ blocker → plan/placeholder, 0 provider calls
    └─ READY_FOR_GENERATION
          ↓
IssueScopedGenerationExecutor
    ├─ scoped context pack
    ├─ prompt strategy/version
    ├─ runFastMode existente
    ├─ parse + IssueDraftResult validation
    ├─ issue semantic evaluation
    ├─ un retry dirigido como máximo
    └─ IssueDraftResult → DraftBlock
          ↓
deterministic section assembly
          ↓
Coverage update + GenerationTrace + QualityGate
```

La frontera principal será:

- `lib/legal-engine/issueDraftResult.ts`: tipos, normalización, validación estructural, hashes de resultado y conversión segura a `ContentBlock`.
- `lib/legal-engine/issueScopedGeneration.ts`: elegibilidad, context pack, estrategias de prompt, executor con concurrencia acotada, retries y coordinación con `runFastMode`.

`executeGenerationTask` conservará su firma pública y el camino legacy. Cuando exista una `LegalIssueMatrix` rich y la tarea represente una issue material, delegará en la capa issue-scoped. El camino legacy seguirá produciendo el comportamiento compatible existente, sin inventar una `LegalIssueMatrix` adicional.

El resultado de cada issue será independiente. El fallo de una issue se convierte en un resultado aislado y no cancela resultados ya completados ni tareas independientes.

## C. Alternativas

### Alternativa 1 — Capa issue-scoped sobre el executor actual (recomendada)

Mantiene `executeGenerationTask` como facade compatible, introduce `IssueDraftResult` antes de crear el bloque y utiliza `runFastMode` sin cambios. Solo el camino rich elegible adopta el resultado estructurado; el camino legacy y los bloques formales continúan por sus rutas existentes.

**Ventajas:** menor superficie de regresión, provider sin cambios, migración gradual, preservación directa de fallbacks y trazas actuales.  
**Costo:** el executor deberá mantener dos rutas durante la transición.

### Alternativa 2 — Reescritura de todas las tareas en un executor universal

Todas las tareas, incluidas legacy, formales y de sección, pasarían por un protocolo único estructurado.

**Ventajas:** una sola abstracción a largo plazo.  
**Costo:** mayor riesgo de romper compatibilidad, formal deterministic, fallbacks y regresiones no laborales; no aporta valor necesario para esta fase.

## D. Recomendación

Adoptar la Alternativa 1. La nueva capa debe aplicarse solo a tareas rich materialmente vinculadas a una issue y con elegibilidad confirmada. La compatibilidad legacy, el provider y las rutas formales quedan fuera de la migración estructural.

La unidad de ejecución por defecto será:

```text
1 READY_FOR_GENERATION LegalIssue
→ 1 GenerationTask issue-scoped
→ 1 llamada especializada
→ 1 IssueDraftResult
→ 1 evaluación
→ 1 DraftBlock
```

Solo se permitirá agrupación explícita si todas las issues están en la misma sección, comparten relaciones explícitas y el plan documenta una razón de agrupación. La implementación inicial no necesita agrupación: Fixture F debe probar una llamada independiente por cada issue elegible.

## E. Modelo `IssueDraftResult`

El modelo será tipado y validado antes de construir el bloque:

```ts
interface IssueDraftResult {
  legalIssueId: string;
  coverageItemIds: string[];
  issueType: LegalIssueType;

  thesis: string;
  factualDevelopment: string[];
  evidentiaryDevelopment: string[];
  legalDevelopment: string[];
  counterPosition?: string;
  application: string;
  conclusion: string;

  sourceEntityIds: string[];
  authorityMentionIds: string[];
  unresolvedRequirements: string[];

  generationMetadata: {
    promptVersion: string;
    contextHash: string;
    providerRequested: string;
    providerActuallyUsed: string;
    model?: string | null;
    attemptCount: number;
    usage?: {
      promptTokens: number | null;
      completionTokens: number | null;
      totalTokens: number | null;
      estimated?: boolean;
    };
  };
}
```

Decisiones del modelo:

- `legalIssueId` debe ser exactamente el ID esperado; no se aceptan múltiples issues en el resultado inicial.
- `coverageItemIds` debe ser un subconjunto de los Coverage de la issue.
- `sourceEntityIds` debe ser un subconjunto de las relaciones permitidas por el context pack.
- `authorityMentionIds` solo puede contener authorities explícitas, conservando `SOURCE_CITED` o cualquier otro estado existente.
- `factualDevelopment`, `evidentiaryDevelopment` y `legalDevelopment` son componentes evaluables, no un párrafo opaco.
- `legalDevelopment` puede quedar vacío únicamente cuando `unresolvedRequirements` contiene `REQUIRES_LEGAL_RESEARCH`; el resultado queda no finalizable y no puede declarar una regla inexistente.
- `unresolvedRequirements` usa códigos controlados, entre ellos `REQUIRES_LEGAL_RESEARCH`, `MISSING_CLIENT_POSITION`, `MISSING_EVIDENCE_LINK` y `UNSUPPORTED_REQUIRED_ELEMENT`.
- `generationMetadata.usage` usa `null` cuando el provider no entrega tokens; nunca presenta una estimación como uso real.
- El resultado estructurado no reemplaza la `LegalIssueMatrix`; solo representa el desarrollo de una issue ya identificada.

Estados de validación separados:

```text
INVALID_FATAL
INVALID_RETRYABLE
VALID_NON_FINAL
VALID_ACCEPTED
```

`VALID_NON_FINAL` permite registrar una salida estructuralmente segura con requisitos pendientes, pero no permite marcar la respuesta jurídica como final ni satisfacer Coverage sustantivo por sí sola.

## F. Issue eligibility

La elegibilidad se resuelve contra la `LegalIssueMatrix` canónica, nunca contra un título textual ni contra un alias singular.

| Estado | Provider | Resultado permitido |
|---|---:|---|
| `READY_FOR_GENERATION` | Sí | Desarrollo issue-scoped, sujeto a validación/evaluación |
| `NEEDS_CLIENT_POSITION` | 0 | Plan, blocker y placeholder local auditable |
| `BLOCKED_BY_CONFLICT` | 0 | Plan, blocker y placeholder local auditable |
| `NEEDS_RESEARCH` | 0 para final-generation | Tarea `LEGAL_RESEARCH` plan-only, nunca respuesta jurídica final |
| `UNLINKED` | 0 | Plan y relación pendiente |
| `UNKNOWN` | 0 | Error estructural y revisión |
| `NOT_APPLICABLE` | 0 | No se crea tarea sustantiva |

La precondición de una llamada es que todos los IDs canónicos de la tarea resuelvan una issue, que la issue sea `READY_FOR_GENERATION`, que no sea formal y que la tarea no sea `LEGAL_RESEARCH`. Si falla una precondición, el executor termina localmente con `providerActuallyUsed = NONE`.

El contrato crítico es:

```text
blocked issue → 0 provider calls
```

Una tarea bloqueada puede existir para planificación y trazabilidad, pero no debe entrar en `runFastMode`, `customGenerator` de generación final ni un retry de provider.

## G. Prompt architecture

Cada prompt se compone de cuatro capas versionadas:

1. **Contrato base:** salida JSON estricta, uso exclusivo del contexto, prohibición de inventar derecho, hechos, evidencia, autoridades o datos.
2. **Contexto de issue:** cuestión, relaciones explícitas, estados y provenance bounded.
3. **Estrategia por tipo:** instrucciones específicas para claim, fact, evidence, source argument o petitorio.
4. **Contrato de salida:** esquema de `IssueDraftResult`, códigos de requisitos pendientes y regla de no afirmación si falta autoridad.

Versiones iniciales propuestas:

```text
ISSUE_DRAFT_V1
CLAIM_ELEMENT_V1
FACT_DISPUTE_V1
EVIDENCE_RELEVANCE_V1
EVIDENCE_SUFFICIENCY_V1
SOURCE_ARGUMENT_V1
PETITION_SUPPORT_V1
```

La estrategia no enviará una instrucción como “redacta toda la contestación” ni “genera toda la sección Derecho”. El eje será siempre la pregunta de una única issue.

Secuencia conceptual exigida al modelo:

```text
QUESTION
→ FACTS AVAILABLE
→ EVIDENCE AVAILABLE
→ RULE/AUTHORITY AVAILABLE
→ APPLICATION
→ RESPONSE
→ CONCLUSION
```

Si no hay regla o autoridad disponible, el modelo debe conservar el vacío jurídico como `REQUIRES_LEGAL_RESEARCH`. No puede rellenarlo con artículos, leyes, tesis, precedentes, registros ni fechas de memoria.

Las instrucciones distinguirán expresamente:

- `SOURCE_ASSERTION`: “la parte actora sostiene…”, no “quedó acreditado…”.
- `EvidenceMention`: evidencia referida y su relación explícita, sin convertirla en oferta.
- `EvidenceOffer`: oferta identificada, sin afirmar admisión, eficacia o valor probatorio definitivo.
- `ClientPosition`: solo puede utilizarse si está confirmada y vinculada a la proposition correspondiente.

El provider podrá recibir `outputSchema` si el adapter actual lo admite, pero la aceptación siempre dependerá del parseo y validación local del resultado.

## H. Context pack

El context pack será un objeto interno tipado antes de serializarse al prompt. Para `issue-001` contendrá únicamente:

- la issue canónica: ID, tipo, question, estado elegible, `relationStatus`, required y statusReason;
- Coverage explícitamente enlazada;
- `claimIds` explícitos y sus contenidos;
- `factIds` explícitos y sus proposiciones/estados;
- `evidenceMentionIds` y `evidenceOfferIds` en colecciones separadas;
- `argumentIds` explícitos;
- `authorityMentionIds` explícitos con citation text y estado de verificación;
- `clientPosition` solo si la issue tiene relación relevante y está confirmada;
- provenance acotada a las entidades seleccionadas;
- metadata formal mínima de sección, sin pedir a la IA encabezados ni labels.

No incluirá automáticamente:

- todos los claims, hechos, pruebas o authorities del expediente;
- todas las issues de la matriz;
- las 27 páginas completas del corpus;
- fuentes no enlazadas explícitamente;
- `EvidenceOffer` derivadas de una `EvidenceMention`;
- prompts completos en el trace.

Los snippets de provenance tendrán límites configurables por entidad. El pack conservará IDs y origen; no se hará truncamiento silencioso que rompa la relación documento → página → fragmento → entidad.

El `contextHash` se calculará sobre la representación canónica ordenada del pack, sin secretos ni timestamps variables. Servirá para idempotencia diagnóstica y trace, no para saltarse la generación automáticamente.

## I. Token budgets

Se reutilizará `calculateTaskTokenBudget` y los límites actuales, añadiendo perfiles por tipo de issue en lugar de un presupuesto universal.

Rangos iniciales propuestos, sujetos a la configuración vigente:

| Issue type | Rango inicial | Criterio |
|---|---:|---|
| `FACT_DISPUTE` | 1200–1800 | postura y soporte factual explícito |
| `EVIDENCE_RELEVANCE` | 1200–2000 | relación hecho-evidencia y limitaciones |
| `EVIDENCE_SUFFICIENCY` | 1400–2200 | oferta explícita y suficiencia limitada |
| `PETITION_SUPPORT` | 1200–2000 | conclusión sustentada y enlace al petitorio |
| `CLAIM_ELEMENT` | 2200–3400 | pretensión, hechos, evidencia y aplicación |
| `SOURCE_ARGUMENT` | 2600–4400 | argumento fuente y relaciones explícitas |
| `PROCEDURAL_ISSUE` | 1400–2400 | requisito procedural disponible |

`AUTHORITY_RESEARCH`, blockers y tareas formales no consumen presupuesto de generación sustantiva. El presupuesto final se ajusta por complejidad y cantidad de relaciones, respetando `MIN_TASK_BUDGET = 800` y `MAX_TASK_BUDGET = 7000`.

El presupuesto no es garantía de calidad ni límite rígido de páginas. Si el provider devuelve uso real, se registra por issue; si no, se conserva `null`.

## J. Concurrency

Se implementará un executor con pool de workers acotado, no `Promise.all` irrestricto.

- default: `MAX_CONCURRENT_GENERATIONS = 3`, reutilizando el límite existente;
- configurable dentro de un rango conservador de 1 a 4;
- solo tasks `READY_FOR_GENERATION` entran al pool;
- blockers y `LEGAL_RESEARCH` se resuelven localmente sin ocupar una llamada provider;
- orden de despacho: sección, `order`, `orderInParent`, `legalIssueId`, `task.id`;
- orden de ensamblaje: el mismo orden determinístico, independientemente de qué llamada termine primero;
- cada worker captura su propio error y devuelve un `IssueGenerationOutcome` aislado.

Para Fixture F, el máximo inicial de llamadas de generación final será 4, una por cada issue `READY_FOR_GENERATION`; nunca 13. El máximo concurrente será 3.

## K. Retry policy

Habrá como máximo un retry semántico dirigido por issue:

```text
attempt 1
→ validación/evaluación
→ deficiency concreta reparable
→ attempt 2 con instrucción específica
```

El retry conserva:

- `legalIssueId`;
- `task.id`;
- `contextHash`;
- `promptVersion` base;
- Coverage y relaciones explícitas.

Solo cambia el fragmento de corrección, por ejemplo: “refuerza la conexión entre `FACT-X` y `EVIDENCE-Y`; no agregues hechos ni authorities”.

No se reintentará cuando:

- la issue esté bloqueada o no sea elegible;
- el provider haya caído a `LOCAL_PLACEHOLDER`;
- exista autoridad o hecho inventado;
- haya contradicción con `ClientPosition`;
- el segundo resultado vuelva a ser inválido;
- el fallo sea fatal y no reparable mediante una instrucción local.

Las continuaciones por truncamiento existentes siguen siendo una preocupación separada del retry semántico y no se usarán para evadir el límite de un retry dirigido.

## L. Output validation

La validación local ocurrirá después de cada respuesta del provider y antes de crear un bloque.

Validaciones estructurales:

- JSON parseable o `structuredOutput` compatible;
- `legalIssueId` exacto;
- `issueType` coincidente;
- `coverageItemIds` subset del contexto;
- `sourceEntityIds`, `authorityMentionIds` y todos los IDs usados dentro del scope permitido;
- ausencia de IDs de otras issues;
- strings obligatorios no vacíos;
- `legalDevelopment` vacío solo con `REQUIRES_LEGAL_RESEARCH` explícito;
- `unresolvedRequirements` compuesto por códigos permitidos;
- `attemptCount`, provider y model coherentes con metadata local;
- ausencia de placeholders residuales, Markdown de control o texto JSON incompleto.

Validaciones de grounding:

- los hechos utilizados deben pertenecer a `factIds` del pack;
- la evidencia mencionada debe pertenecer a `evidenceMentionIds` o `evidenceOfferIds` permitidos;
- una `EvidenceMention` no puede producir una oferta nueva;
- las authorities deben corresponder a `authorityMentionIds` presentes y conservar su estado;
- no pueden aparecer artículos, leyes, tesis, precedentes, registros, fechas jurídicas o autoridades nuevas;
- la salida no puede contradecir una postura de cliente confirmada;
- no se puede transformar una alegación `SOURCE_ASSERTION` en un hecho acreditado;
- no se aceptan outputs genéricos que no respondan a la question de la issue.

La validación estructural no pretende resolver la corrección jurídica sustantiva. Marca la frontera entre `provider success` y `valid legal draft`.

## M. Semantic evaluation

Se añadirá una evaluación de issue que reutilice las funciones existentes cuando sea posible y que opere sobre el resultado estructurado antes de la conversión final.

Dimensiones mínimas:

| Dimensión | Pregunta |
|---|---|
| `specificity` | ¿Responde esta issue y no una sección genérica? |
| `factualGrounding` | ¿Usa únicamente facts permitidos? |
| `evidenceGrounding` | ¿Usa únicamente evidencia y vínculos permitidos? |
| `positionConsistency` | ¿Respeta `ClientPosition` y `SOURCE_ASSERTION`? |
| `authorityDiscipline` | ¿Evita authorities nuevas y conserva `SOURCE_CITED`? |
| `application` | ¿Conecta elementos disponibles con la conclusión? |
| `completeness` | ¿Contesta question, response y conclusion sin huecos indebidos? |

El evaluador no determina aún si la norma es jurídicamente correcta ni realiza investigación externa. Puede producir `PASS`, `WEAK` o `FAIL`, con deficiencies y hard-fail reasons.

Regla de aceptación:

- `VALID_ACCEPTED` requiere estructura válida y evaluación suficiente;
- `WEAK` reparable puede activar un solo retry;
- `FAIL` por invención, contradicción, IDs fuera de scope o placeholder no se convierte en contenido jurídico válido;
- después del retry fallido se crea fallback/placeholder auditable y Coverage sustantivo permanece abierto.

La evaluación de `DraftBlock` existente seguirá ejecutándose después de la conversión como segunda frontera de seguridad, sin reemplazar la evaluación por componentes.

## N. DraftBlock conversion

Solo un resultado validado se convierte a `DraftBlock`. El bloque conservará:

- `legalIssueIds`;
- `coverageItemIds`;
- `generationTaskId`;
- `factIds`;
- `evidenceIds`;
- `authorityIds`;
- provider requested/actually used, model y fallback metadata;
- `generationId`;
- evaluación issue y evaluación de bloque;
- `revisionNumber` y referencia al bloque previo cuando exista retry.

El texto visible se ensamblará en un orden fijo a partir de los componentes aprobados:

```text
thesis
→ factualDevelopment
→ evidentiaryDevelopment
→ legalDevelopment
→ counterPosition
→ application
→ conclusion
```

La estructura intermedia se conservará en el resultado de la tarea y en el trace sanitizado; el `ContentBlock` conservará los IDs y metadatos necesarios para no perder auditabilidad. No se añadirá valor legal fuera del resultado.

Un fallback tendrá `LOCAL_PLACEHOLDER` o `DETERMINISTIC_FALLBACK`, `generationStatus = partial` o `failed`, y nunca `VALID_ACCEPTED`.

## O. Section assembly

Una sección podrá recibir varios bloques issue-scoped. La asamblea:

1. conserva los bloques formales determinísticos;
2. inserta DraftBlocks sustantivos por orden de plan;
3. mantiene un bloque separado por `legalIssueId`;
4. no fusiona los textos antes de registrar IDs y evaluaciones;
5. actualiza `generatedBlockIds` de Coverage con los enlaces correspondientes;
6. permite que QualityGate vea bloques parciales, fallidos y accepted por separado.

Política mínima de duplicación:

- hash/text normalization para duplicados exactos dentro de la misma sección;
- si dos bloques de la misma issue son idénticos, se conserva el primero y el segundo se registra como duplicado no aceptado;
- si son de issues distintas, ambos se conservan y se emite warning de redundancia para no perder una controversia;
- similitud alta pero no idéntica reutiliza la penalización de repetición existente;
- no se crea un sistema editorial global ni se reescribe contenido automáticamente.

No se pedirá a la IA redactar rubros, encabezados, firma, fecha, labels o autoridad formal. Esos elementos permanecen en el camino determinístico.

## P. GenerationTrace

`GenerationTrace` incorporará una colección por intento issue-scoped, conceptualmente:

```ts
interface IssueGenerationAttemptTrace {
  legalIssueId: string;
  taskId: string;
  attempt: number;
  promptVersion: string;
  contextHash: string;
  providerRequested: string;
  providerActuallyUsed: string;
  model?: string | null;
  outcome: 'PROVIDER_SUCCESS' | 'VALIDATION_FAILED' | 'SEMANTIC_FAILED' | 'ACCEPTED' | 'FALLBACK' | 'BLOCKED';
  validationStatus?: string;
  evaluation?: unknown;
  resultHash?: string;
  usage?: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    estimated?: boolean;
  };
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}
```

El trace debe poder mostrar:

```text
LegalIssue
→ GenerationTask
→ provider attempt 1
→ provider result
→ validation
→ SemanticEvaluation
→ retry, si aplica
→ accepted DraftBlock o fallback
```

También se conservarán los enlaces existentes Coverage → Issue → Task. No se guardarán secrets ni prompts completos si la política actual los excluye; el context pack se representará mediante IDs, versión y `contextHash`, con resúmenes bounded.

Si el provider no entrega tokens, los campos permanecerán `null`. Una métrica aproximada, si posteriormente se desea, deberá distinguirse explícitamente con `estimated = true`.

## Q. Provider y fallback semantics

FASE 4 reutiliza `runFastMode` y no modifica `NVIDIAProvider`, `LocalProvider` ni introduce SDK/proveedor adicional.

Semántica:

1. La elegibilidad se comprueba antes de llamar al provider.
2. Una issue bloqueada nunca llega a NVIDIA ni a generación final local.
3. Una issue `NEEDS_RESEARCH` puede producir `LEGAL_RESEARCH` plan-only, pero no una respuesta jurídica final.
4. `runFastMode` conserva `providerRequested`, `providerActuallyUsed`, model, origin y fallbackReason.
5. `LOCAL_PLACEHOLDER` no se parsea como `IssueDraftResult` aceptado.
6. Un `success: true` con `isLegalAiContent = false`, contenido vacío o JSON inválido no se acepta.
7. Si NVIDIA falla, el fallback se conserva como placeholder y Coverage sustantivo queda no satisfecho.
8. Un resultado parcial o con investigación pendiente puede quedar trazado como `VALID_NON_FINAL`, nunca como respuesta final.
9. `QualityGate` decidirá la finalización; FASE 4 no oculta warnings, blockers ni Coverage pendiente.

## R. Fixtures

Se reutiliza exclusivamente Fixture F mediante `makeFixtureFCaseAnalysis`, `makeFixtureDocument` y overrides inmutables.

Expectativas base:

- 13 LegalIssues observables;
- 4 `READY_FOR_GENERATION` como máximo 4 llamadas iniciales de generación final;
- 5 `NEEDS_CLIENT_POSITION` con 0 provider calls;
- 2 `BLOCKED_BY_CONFLICT` con 0 provider calls;
- 2 `NEEDS_RESEARCH` con 0 final-generation provider calls y, si se planifican, tareas `LEGAL_RESEARCH` sin provider;
- no crear Fixture H;
- si un contrato necesita una combinación ausente, derivarla mediante override inmutable de F.

Los tests deben probar llamadas por ID de issue, no únicamente contar bloques o secciones. Un test con provider spy debe verificar que la lista de llamadas es exactamente el subconjunto elegible y que el orden de resultados ensamblados es determinístico aunque las promesas terminen en orden distinto.

## S. Contratos TDD

El futuro plan de implementación deberá preparar, como mínimo, estos 38 contratos:

1. `READY` issue crea tarea IA.
2. `NEEDS_CLIENT_POSITION` produce 0 provider calls.
3. `BLOCKED_BY_CONFLICT` produce 0 provider calls.
4. `NEEDS_RESEARCH` produce 0 final-generation provider calls.
5. `UNLINKED` produce 0 provider calls.
6. El context pack contiene solo los `legalIssueIds` seleccionados.
7. El scope de claim permanece aislado.
8. El scope de fact permanece aislado.
9. El scope de evidence permanece aislado.
10. El scope de authority permanece aislado.
11. `EvidenceMention` no crea `EvidenceOffer`.
12. No se aceptan hechos inventados.
13. No se aceptan authorities inventadas.
14. `SOURCE_CITED` no se convierte en `VERIFIED`.
15. `provider success` no implica accepted draft.
16. `IssueDraftResult` se valida estructuralmente.
17. Semantic evaluation detecta especificidad.
18. Semantic evaluation detecta factual grounding.
19. Semantic evaluation detecta evidence grounding.
20. Semantic evaluation detecta consistencia con client position.
21. Semantic evaluation detecta discipline de authorities.
22. Semantic evaluation detecta application.
23. Se ejecuta un solo retry dirigido.
24. El retry conserva el mismo issue ID.
25. El fallback no satisface Coverage sustantivo.
26. El fallo de una issue no destruye resultados independientes.
27. La concurrencia permanece bounded.
28. El ensamblaje es determinístico.
29. `DraftBlock` conserva `legalIssueIds`.
30. Coverage conserva sus enlaces y estados.
31. GenerationTrace registra cada intento.
32. GenerationTrace registra token usage cuando existe.
33. GenerationTrace registra prompt version.
34. No existen provider calls para estructura formal.
35. Fixture F solo invoca generación final para issues READY.
36. El comportamiento legacy permanece disponible.
37. La regresión no laboral permanece protegida.
38. No existe prompt monolítico de todo el expediente/documento.

Los contratos se implementarán después de aprobar este spec; este documento no agrega tests ni modifica el harness.

## T. Archivos afectados

### Nuevos propuestos

- `lib/legal-engine/issueDraftResult.ts` — modelo, validator, estados de aceptación, hash y conversión a bloque.
- `lib/legal-engine/issueScopedGeneration.ts` — eligibility, context pack, prompts versionados, executor bounded, retries y outcomes aislados.
- `tests/legal-engine/issueScopedGeneration.test.ts` — contratos TDD de FASE 4 usando Fixture F y overrides inmutables.

### Existentes a modificar de forma focalizada

- `lib/legal-engine/generationTasks.ts` — metadata de issue, selección eligible, integración del executor y resultados por intento.
- `lib/legal-engine/pipeline.ts` — ejecución bounded y ensamblaje de varios DraftBlocks por sección.
- `lib/legal-engine/semanticEvaluator.ts` — evaluación por componentes de `IssueDraftResult` y redundancia mínima.
- `lib/legal-engine/types.ts` — `ContentBlock.legalIssueIds`, `authorityIds` y metadata estructurada estrictamente necesaria.
- `lib/legal-engine/generationTrace.ts` — trace de attempts, prompt version, context hash y usage.
- `lib/legal-engine/coveragePolicy.ts` — únicamente para asegurar que resultados no accepted/fallback no satisfagan Coverage.

### No modificar en FASE 4

- `lib/ai/orchestrator.ts`.
- `lib/ai/providers/nvidia.ts`.
- `lib/ai/providers/local.ts`.
- `lib/legal-engine/legalIssueMatrix.ts`, salvo imports de tipos estrictamente necesarios; no crear otra matriz.
- `tests/fixtures/richCoverageFixtures.ts`, salvo que una regresión demuestre que un override inmutable de F no basta.

## U. Riesgos

1. **Compatibilidad del executor:** introducir una ruta rich nueva dentro de `executeGenerationTask` puede afectar callers legacy; se mitiga conservando la facade y pruebas de regresión.
2. **Fuga de contexto:** filtrar por IDs no basta si se serializan arrays completos en otra capa; el context pack debe construirse desde relaciones canónicas y validarse antes del prompt.
3. **Aceptación prematura:** `success: true` o JSON parseable no deben marcar un bloque como accepted; se mitiga con validación y evaluación separadas.
4. **Alucinación jurídica:** el modelo puede producir una regla plausible no presente en el pack; se mitiga con authority allow-list, `REQUIRES_LEGAL_RESEARCH` y hard fail de disciplina.
5. **Confusión evidence mention/offer:** se mitiga con colecciones separadas y validación de IDs.
6. **Carrera de ensamblaje:** resultados concurrentes pueden llegar en orden distinto; se mitiga ordenando por plan y ID antes de mutar la sección.
7. **Reintentos costosos:** se limita a un retry semántico por issue y al pool máximo 3.
8. **Pérdida de trazabilidad:** convertir a texto demasiado pronto puede eliminar componentes; se mitiga conservando result metadata, IDs y trace por attempt.
9. **Tokens no observables:** no debe inventarse usage; se mitiga usando `null` y un flag separado para estimaciones futuras.
10. **Research leakage:** `NEEDS_RESEARCH` podría terminar en un path de generación si la elegibilidad se basa en la tarea y no en la matriz; se mitiga resolviendo siempre contra la issue canónica.
11. **Redundancia entre issues:** varios bloques pueden repetir boilerplate; se mitiga con detección mínima y warnings sin fusionar opacamente.
12. **Harness externo:** no se ejecutará suite completa ni se incorporará NVIDIA real en la implementación inicial.

## V. Fuera de alcance

FASE 4 no implementa:

- investigación jurídica web;
- SCJN o verificación jurisprudencial;
- LegalResearch real;
- RAG, embeddings o vector DB;
- búsqueda de normas;
- generación DOCX profesional;
- estilización o UI;
- persistence, Prisma, Neon o migraciones;
- empaquetado Windows;
- nuevas defensas o excepciones;
- argumentación jurídica profunda basada en fuentes externas;
- cambios al provider base o un segundo proveedor.

## Decisiones que requieren aprobación

1. Aprobar la Alternativa 1: capa `IssueScopedGenerationExecutor` sobre el executor actual, preservando legacy y provider.
2. Aprobar `IssueDraftResult` como frontera obligatoria entre respuesta del provider y `DraftBlock`.
3. Aprobar `MAX_CONCURRENT_GENERATIONS = 3` como default, configurable de forma conservadora entre 1 y 4.
4. Aprobar un máximo de un retry semántico dirigido por issue, separado de continuaciones por truncamiento.
5. Aprobar que `VALID_NON_FINAL` pueda trazarse y producir placeholder/bloque parcial, pero nunca respuesta final ni Coverage sustantivo cubierto.
6. Aprobar los tres archivos nuevos propuestos y la lista de modificaciones focalizadas.
7. Aprobar Fixture F como único fixture base y overrides inmutables para los 38 contratos.

## Criterio de cierre de diseño

El spec queda listo para pasar a `writing-plans` después de la aprobación explícita de las decisiones anteriores. Hasta entonces no se implementan código, tests, provider calls ni cambios de arquitectura adicionales.
