# FASE 3 — LegalIssueMatrix

**Fecha:** 2026-09-08  
**Estado:** diseño, sin implementación  
**Alcance:** nueva capa jurídica intermedia entre `CoverageMatrix` y `DocumentPlan`/`GenerationTask`.

## 1. Decisiones heredadas de FASE 2

FASE 2 se considera cerrada. Este diseño no reabre ni reinterpreta sus contratos:

- `RichCaseAnalysis` es la representación canónica cuando existe.
- `CoverageMatrix` sigue siendo la lista canónica de obligaciones documentales.
- La ruta legacy solo se usa cuando `richCaseAnalysis` está ausente.
- `SUBSTANTIVE` y `FORMAL` permanecen separados.
- `EvidenceMention` y `EvidenceOffer` permanecen separados.
- Las relaciones se copian únicamente cuando están expresamente identificadas.
- Los conflictos permanecen abiertos.
- La postura del cliente no se sintetiza.
- `CONFLICT_REVIEW` y `MISSING_CLIENT_POSITION` no se resuelven mediante Semantic PASS.
- Quality Gate continúa siendo estructural.
- GenerationTrace conserva trazabilidad por identificadores, estados, hashes y razones, no corpus fuente completo.

FASE 3 tampoco consulta fuentes jurídicas externas ni valida normas, tesis, jurisprudencia o precedentes.

## 2. Estado actual observado

1. `LegalIssue` existe en `lib/legal-engine/caseAnalysis.ts` y es un contrato legacy de agravios/ilegalidad. Tiene `id`, `type`, `title`, `parameter`, `challengedAct`, `contradiction`, `affectation`, `consequence`, referencias de fuente y relaciones opcionales con hechos, claims, evidencia y consideraciones combatidas.
2. El contrato legacy no contiene una pregunta jurídica neutral ni `SourceProvenance[]`; contiene campos que ya expresan parámetros, refutaciones y consecuencias.
3. `extractDynamicLegalIssues` en `caseAnalysis.ts` crea esos objetos. Genera cuestiones desde consideraciones combatidas, actos impugnados o claims según la familia documental.
4. Ese constructor rellena texto jurídico no derivado literalmente de una relación rica: por ejemplo, parámetros constitucionales fijos, inexistencia de supuestos, indebida fundamentación, absolución o revocación.
5. Por ello, la `LegalIssue` legacy no puede ser la fuente canónica de la nueva matriz sin arrastrar riesgo de invención.
6. `reconstructCaseAnalysis` ejecuta `extractRichCaseAnalysis`, construye también la vista legacy y finalmente agrega `richCaseAnalysis` al resultado mediante `projectRichCaseAnalysis`.
7. `RichCaseAnalysis` ya contiene las entidades necesarias: claims, facts, `EvidenceMention`, `EvidenceOffer`, argumentos, autoridades citadas, conflictos, datos faltantes, posiciones y provenance.
8. `buildCoverageMatrix` en `coverageMatrix.ts` selecciona rich-first: si existe `caseAnalysis.richCaseAnalysis`, llama exclusivamente a `buildRichCoverageMatrix`; de lo contrario llama a `buildLegacyCoverageMatrix`.
9. `buildRichCoverageMatrix` deriva Coverage para facts, claims, menciones/ofertas de evidencia, argumentos, apoyo al petitorio, conflictos y datos faltantes. Actualmente no construye una `LegalIssueMatrix`.
10. La Coverage rica ya conserva arrays explícitos como `claimIds`, `factIds`, `evidenceMentionIds`, `evidenceOfferIds`, `argumentIds`, `authorityMentionIds`, `conflictIds` y `missingDataIds`.
11. La Coverage rica también conserva `scope`, `satisfactionPolicy`, `blocking`, `requiresClientPosition`, `relationStatus`, `provenance` y `statusReason`.
12. `EvidenceMention` puede producir `EVIDENCE_TREATMENT` sin producir `EVIDENCE_OFFER`; un `EVIDENCE_OFFER` solo aparece a partir de un `EvidenceOffer` explícito.
13. Las autoridades ricas conservan `verificationStatus`; una cita de fuente permanece `SOURCE_CITED`, no `LEGALLY_VERIFIED`.
14. `DocumentPlanResult` actualmente expone opcionalmente `coverageMatrix` y `orphanCoverageItemIds`, pero no una matriz de cuestiones jurídicas.
15. `buildDraftingPlan` usa argumentos ricos como pseudo-issues (`issueId = argument.id`) cuando hay argumentos; en la ruta legacy usa `CaseAnalysis.proceduralPosture` y `CaseAnalysis.legalIssues`.
16. `IssuePlan` tiene `issueId` singular, títulos, estrategias, bases legales y listas de hechos/evidencia/autoridades. No tiene una relación canonical plural con `LegalIssueMatrix`.
17. `GenerationTask` tiene `targetIssueId` singular y ya tiene `coverageItemIds`, `factIds`, `evidenceIds`, `authorityIds` y `claimIds`.
18. `GenerationTaskTrace.legalIssueIds[]` ya existe, pero actualmente se llena solo desde `targetIssueId`; `CoverageTraceSnapshot` no registra el salto Coverage → Issue.
19. `buildTaskContextPack` utiliza el `IssuePlan` legacy para redactar títulos de agravios, parámetro y estrategia. No recibe todavía una pregunta canonical ni una matriz de issues.
20. `coveragePolicy.ts`, `semanticEvaluator.ts` y `qualityGate.ts` ya impiden que un bloque semánticamente aprobado cierre por sí solo un conflicto o una postura faltante.
21. Fixture F ya contiene los casos ricos combinados requeridos: dos claims, cuatro facts, menciones y oferta de evidencia, argumento, autoridad `SOURCE_CITED`, posición confirmada, posición faltante y conflicto.
22. No existe actualmente `LegalIssueMatrix`, `LegalIssueItem`, `LegalIssueType` ni un builder canonical equivalente.

## 3. Alternativas arquitectónicas

### Opción A — Evolución aditiva sobre los contratos existentes (recomendada)

Crear un único módulo nuevo `lib/legal-engine/legalIssueMatrix.ts` para el modelo y el builder canonical, reutilizando `CoverageMatrix`, `RichCaseAnalysis`, `SourceProvenance`, `IssuePlan`, `GenerationTask` y GenerationTrace. Se agregan campos opcionales de compatibilidad (`legalIssueMatrix`, `legalIssueIds[]`) y se mantiene `LegalIssue` como DTO legacy congelado.

La rama rich construye la matriz exclusivamente desde `CoverageMatrix` y resuelve sus IDs contra `RichCaseAnalysis`. La rama sin rich usa un adaptador explícito `LEGACY_FALLBACK`, sin hacer pasar sus textos legacy por la ruta rich.

**Ventajas:**

- Respeta que Coverage siga siendo canónica.
- Reutiliza los identificadores y relaciones explícitas ya implementados.
- Permite que `DocumentPlan`, `GenerationTask` y Trace transporten la nueva relación sin una reescritura transversal.
- Mantiene regresión controlable: la ruta legacy no cambia de semántica por la mera presencia del extractor rich.
- Evita que `LegalIssue` legacy tenga que aceptar campos canónicos incompatibles con sus consumidores actuales.

**Riesgos:**

- Durante la transición coexistirán `LegalIssue` legacy y `LegalIssueItem` canonical.
- Será necesario impedir explícitamente que la ruta rich vuelva a leer `proceduralPosture.*Issues`.
- Algunos consumidores podrán confundir temporalmente `issueId` con `legalIssueIds[]`.

**Archivos afectados:** `legalIssueMatrix.ts` nuevo; `types.ts`; `documentPlan.ts`; `pipeline.ts`; `generationTasks.ts`; `generationTrace.ts`; `qualityGate.ts`; `coveragePolicy.ts`; fixtures y tests. `caseAnalysis.ts` solo quedará documentado como origen legacy y no será sustituido.

**Compatibilidad:** completa para callers que no envían `legalIssueMatrix` ni `legalIssueIds[]`; rich-first para callers que sí tienen `richCaseAnalysis`; fallback explícito para callers legacy.

### Opción B — Subsistema aislado con adaptación posterior

Crear un subsistema independiente que reciba snapshots de `RichCaseAnalysis` y `CoverageMatrix`, mantenga sus propios tipos y no modifique inicialmente `DocumentPlan`, `GenerationTask` ni Trace. Una fase posterior añadiría adaptadores hacia los contratos existentes.

**Ventajas:** aislamiento fuerte, menor riesgo inmediato para los consumidores de generación y posibilidad de versionar la matriz de forma independiente.

**Riesgos:** duplica temporalmente contratos de enlace, retrasa la trazabilidad completa `Coverage → Issue → Task`, obliga a mantener dos rutas de planificación y hace más probable que el generador continúe usando argumentos como pseudo-issues.

**Archivos afectados:** módulo y tests nuevos inicialmente; posteriormente los mismos adaptadores en `documentPlan.ts`, `pipeline.ts`, `generationTasks.ts` y `generationTrace.ts`.

**Compatibilidad:** alta a corto plazo, pero sin relación operativa completa hasta una segunda integración.

### Recomendación

Elegir **Opción A**. La arquitectura actual ya tiene una Coverage rica y una trazabilidad por IDs; el hueco es una capa derivada, no un segundo motor de extracción. `LegalIssue` legacy debe conservarse como contrato de compatibilidad, mientras `LegalIssueItem` representa deliberadamente otra cosa: una pregunta neutral, source-grounded y todavía no resuelta.

## 4. Arquitectura objetivo

```text
RichCaseAnalysis (inmutable, canónico)
        │ solo IDs y relaciones explícitas
        ▼
CoverageMatrix (obligaciones canónicas)
        │ buildLegalIssueMatrix()
        ▼
LegalIssueMatrix (preguntas resolubles, derivada)
        │ legalIssueIds[]
        ▼
DocumentPlan / DraftingPlan
        │ legalIssueIds[] + coverageItemIds[]
        ▼
GenerationTask
        │ legalIssueIds[]
        ▼
DraftBlock / GenerationTrace
```

La ruta sin rich queda aislada:

```text
CaseAnalysis legacy → Coverage legacy → LegalIssueMatrix(sourceMode=LEGACY_FALLBACK)
                                              │
                                              └─ adaptación limitada; no alimenta la rama rich
```

`CoverageMatrix` continúa siendo el inventario de obligaciones. `LegalIssueMatrix` no reemplaza Coverage, no cambia su estado y no escribe inferencias en `RichCaseAnalysis`, `CoverageMatrix` ni las entidades fuente.

## 5. Modelo canonical propuesto

Los tipos vivirán en `lib/legal-engine/legalIssueMatrix.ts` para evitar introducir campos canónicos en la interfaz legacy de `caseAnalysis.ts`.

```ts
export type LegalIssueType =
  | 'CLAIM_ELEMENT'
  | 'FACT_DISPUTE'
  | 'EVIDENCE_RELEVANCE'
  | 'EVIDENCE_SUFFICIENCY'
  | 'SOURCE_ARGUMENT'
  | 'PROCEDURAL_ISSUE'
  | 'PETITION_SUPPORT'
  | 'AUTHORITY_RESEARCH'
  | 'CONFLICT_DEPENDENCY';

export type LegalIssueStatus =
  | 'READY_FOR_GENERATION'
  | 'BLOCKED_BY_CONFLICT'
  | 'NEEDS_CLIENT_POSITION'
  | 'NEEDS_RESEARCH'
  | 'UNLINKED'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export type LegalResearchStatus =
  | 'NOT_REQUIRED'
  | 'NEEDS_RESEARCH'
  | 'SOURCE_CITED_UNVERIFIED';

export type ClientPositionStatus = 'NOT_REQUIRED' | 'CONFIRMED' | 'UNKNOWN';

export interface LegalIssueSource {
  mode: 'RICH_COVERAGE' | 'LEGACY_FALLBACK';
  coverageItemId: string;
  coverageCategory: CoverageCategory;
  sourceEntityType?: CoverageEntityType;
  sourceEntityIds: string[];
}

export interface LegalIssueItem {
  id: string;
  issueType: LegalIssueType;
  question: string;
  source: LegalIssueSource;

  coverageItemIds: string[];
  claimIds: string[];
  factIds: string[];
  evidenceMentionIds: string[];
  evidenceOfferIds: string[];
  argumentIds: string[];
  authorityMentionIds: string[];
  conflictIds: string[];
  missingDataIds: string[];

  clientPositionStatus: ClientPositionStatus;
  required: boolean;
  blocking: boolean;
  status: LegalIssueStatus;
  researchStatus: LegalResearchStatus;
  provenance: SourceProvenance[];
  relationStatus: CoverageRelationStatus;
  statusReason?: string;
}

export interface LegalIssueMatrix {
  documentId: string;
  documentType: string;
  sourceMode: 'RICH' | 'LEGACY_FALLBACK';
  issues: LegalIssueItem[];
  summary: {
    total: number;
    required: number;
    blocked: number;
    readyForGeneration: number;
    needsLegalResearch: number;
    needsClientPosition: number;
    unresolvedConflict: number;
    unlinked: number;
  };
}
```

Campos deliberadamente excluidos de `LegalIssueItem`: `parameter`, `challengedAct`, `contradiction`, `affectation`, `consequence`, `legalBasis`, `counterargumentStrategy`, artículos, tesis, jurisprudencia y cualquier postura sustantiva. Esos valores podrían ser respuestas o conclusiones, no identificadores neutrales de una cuestión.

`LegalIssueSource` identifica la obligación de Coverage que originó la issue. La provenance se copia de la Coverage y de las entidades que ya están enlazadas por IDs explícitos; no se crea provenance nueva por cercanía textual.

La matriz se construye con una función pura conceptualmente equivalente a:

```ts
buildLegalIssueMatrix({
  caseAnalysis,
  coverageMatrix,
}): LegalIssueMatrix
```

El builder debe aceptar un `CaseAnalysis` para resolver entidades y seleccionar fallback, pero en la rama rich no debe leer sus arrays legacy para crear issues.

### Adaptador legacy explícito

Cuando `richCaseAnalysis` está ausente, el adaptador puede proyectar los objetos de `proceduralPosture.*Issues` y `legalIssues` a `LegalIssueItem` únicamente para compatibilidad. Debe conservar el ID y título legacy, tomar provenance solo de `sourceDoc`/`page`/`excerpt` disponibles, no copiar `parameter`/`contradiction`/`affectation`/`consequence`, marcar `sourceMode = LEGACY_FALLBACK`, `relationStatus = UNLINKED` salvo vínculos legacy explícitos verificables y usar `statusReason = LEGACY_ISSUE_REQUIRES_REVIEW`. La pregunta será una reformulación neutral del título, marcada por el modo legacy; no se considera una extracción canonical ni habilita la rama rich.

## 6. Reglas de creación desde Coverage

Cada Coverage material produce como máximo una issue primaria del tipo indicado. No hay producto cartesiano entre claim, fact, evidence y authority. Una Coverage puede producir cero issues cuando es formal, reference-only, no aplicable o carece de una justificación material.

| Coverage | Issue | Regla canonical |
|---|---|---|
| `CLAIM_RESPONSE` | `CLAIM_ELEMENT` | Una pregunta sobre si los hechos y elementos probatorios explícitamente ligados permiten analizar la existencia y exigibilidad de la prestación. No crea defensa, excepción, pago, cumplimiento ni improcedencia. |
| `FACT_RESPONSE` | `FACT_DISPUTE` | Una pregunta sobre qué postura procesal debe fijarse respecto de la proposición fáctica y su efecto en las coberturas explícitamente vinculadas. Nunca afirma que el hecho sea falso o verdadero. |
| `EVIDENCE_TREATMENT` | `EVIDENCE_RELEVANCE` | Una pregunta sobre la función o relevancia de la `EvidenceMention` respecto de sus facts/claims explícitos. No agrega `EvidenceOffer`. |
| `EVIDENCE_OFFER` | `EVIDENCE_SUFFICIENCY` | Una pregunta sobre el alcance y suficiencia que deberá analizarse respecto del `EvidenceOffer` explícito. Conserva por separado la mención y la oferta. |
| `SOURCE_ARGUMENT_RESPONSE` | `SOURCE_ARGUMENT` | Una pregunta sobre la proposición expresamente formulada por la fuente. El argumento se atribuye, no se transforma en postura del cliente. |
| `PETITION_SUPPORT` | `PETITION_SUPPORT` | Una pregunta sobre el apoyo explícito de facts/authorities a la sección de petitorio indicada por la fuente. |
| `AUTHORITY_MENTION` | `AUTHORITY_RESEARCH` | Una pregunta que identifica la investigación necesaria antes de usar la autoridad citada. Nunca afirma aplicabilidad, validez, vigencia o carácter controlador. |
| `CONFLICT_REVIEW` | `CONFLICT_DEPENDENCY` | Una pregunta que registra qué contradicción debe resolverse antes de continuar. Permanece bloqueada y no selecciona ningún valor. |
| `PROCEDURAL_REQUIREMENT` | `PROCEDURAL_ISSUE` | Solo si la Coverage contiene una relación y provenance procesal explícitas. No se crea por tipo documental, costumbre o patrón de materia. |
| `MISSING_CLIENT_POSITION` | ninguna primaria por defecto | Se adjunta como `missingDataIds` a la issue primaria que comparte explícitamente `factIds` o `claimIds`. Si no hay entidad compartida, queda como Coverage sin issue y se reporta estructuralmente. |
| `FORMAL_REQUIREMENT`, `REQUESTED_RELIEF`, `AUTHORITY` aislada y aliases de compatibilidad | ninguna | No crean issue salvo una relación sustantiva explícita que caiga en una regla anterior. |

En la rama rich se ignoran los CoverageItems con `metadata.compatibilityAlias === true` para evitar duplicar una issue canónica con un alias histórico.

Las preguntas deben construirse a partir del texto de la entidad ya enlazada y formularse como interrogantes, sin añadir una respuesta, una norma o una teoría de defensa. Por ejemplo, una claim puede producir: `¿Los hechos y elementos probatorios explícitamente vinculados permiten analizar la existencia y exigibilidad de la prestación reclamada «...»?`.

## 7. Relaciones explícitas y estados de enlace

Relaciones que el builder sí puede copiar:

- `Claim.factualBasisIds` → `factIds` de la issue de claim.
- `Claim.evidenceMentionIds` → `evidenceMentionIds` de la issue de claim.
- `EvidenceMention.relatedFactIds` y `relatedClaimIds` → issue de relevancia.
- `EvidenceOffer.evidenceMentionId` → issue de suficiencia.
- `ArgumentItem.supportingFactIds` y `citedAuthorityIds` → issue de argumento o apoyo al petitorio.
- `CoverageItem.conflictIds` → issue de conflicto.
- `CoverageItem.missingDataIds` y la relación explícita de la Coverage primaria → dependencias faltantes.
- `SourceAuthorityMention` se enlaza solo mediante `citedAuthorityIds` explícitos del argumento o el `authorityMentionIds` de su propia Coverage.

No se permite usar para crear relaciones: similitud semántica, proximidad, keyword matching, coaparición en página, orden del array, nombre parecido, tipo documental o heurísticas de título.

`relationStatus` se calcula así:

- `EXPLICIT`: todos los IDs copiados están presentes en el snapshot rich y provienen de campos de enlace explícitos.
- `UNLINKED`: la issue existe y tiene Coverage, pero falta una relación material que la fuente no proporcionó, por ejemplo una claim sin base fáctica o una evidencia sin fact/claim relacionado.
- `UNKNOWN`: la relación declarada no puede resolverse porque la entidad o la forma del vínculo no existe en el snapshot. No se sustituye por una relación inferida.

Un ID inexistente no se elimina silenciosamente: la validación lo reporta como error estructural y la issue no puede quedar `READY_FOR_GENERATION`.

La deduplicación semántica de `deduplicateLegalIssues` no se usa en el builder canonical. Dos CoverageItems no se fusionan por título parecido. La identidad se determina por su Coverage y sus IDs explícitos.

## 8. Postura del cliente, conflictos, evidencia y autoridades

### Postura del cliente

La issue recibe `CONFIRMED` únicamente cuando `RichCaseAnalysis.clientPosition` está en `CONFIRMED` y contiene explícitamente el ID de la proposición correspondiente. En cualquier otro caso en que la Coverage requiera postura, recibe `UNKNOWN`, `status = NEEDS_CLIENT_POSITION` y `blocking = true`.

Una issue nunca convierte `UNKNOWN` en `DENY`, `ADMIT`, `FALSO`, `CIERTO`, `IMPROCEDENTE` ni en una estrategia defensiva. La postura confirmada tampoco se sintetiza fuera de los IDs que el cliente confirmó.

### Conflictos

Una issue con `conflictIds` queda `BLOCKED_BY_CONFLICT` y `blocking = true`. El builder conserva `conflictIds`, provenance y razón, pero no elige monto, fecha, identidad, rol ni aserción. Si un conflicto solo tiene IDs que no intersectan explícitamente la Coverage de una issue, se crea su `CONFLICT_DEPENDENCY` independiente; no se inventa una dependencia transversal.

### Evidencia

Una issue `EVIDENCE_RELEVANCE` puede tener `evidenceMentionIds` sin `evidenceOfferIds`. Una issue `EVIDENCE_SUFFICIENCY` exige un `evidenceOfferId` explícito y conserva también el ID de la mención si la oferta lo proporciona. Ninguna etapa convierte una mención en oferta.

### Autoridades

`SOURCE_CITED` permanece `SOURCE_CITED`. Una `AUTHORITY_RESEARCH` recibe `researchStatus = NEEDS_RESEARCH`; un `SOURCE_ARGUMENT` que depende de una autoridad cuya `verificationStatus` sea `SOURCE_CITED` recibe `SOURCE_CITED_UNVERIFIED` y no puede marcarse como validado. FASE 3 no consulta ni verifica la autoridad.

## 9. Readiness y estados

La readiness de una issue no equivale a `CoverageItem.status === 'covered'`.

| Estado | Significado | `blocking` | Puede pasar a generación profunda |
|---|---|---:|---:|
| `READY_FOR_GENERATION` | Coverage válida, enlaces suficientes, postura necesaria disponible, sin conflicto y sin investigación pendiente. | No | Sí, en una fase posterior |
| `BLOCKED_BY_CONFLICT` | Depende de un `CaseConflict` aún abierto. | Sí | No; solo revisión |
| `NEEDS_CLIENT_POSITION` | Falta una postura explícita necesaria. | Sí | No; solo solicitud/revisión |
| `NEEDS_RESEARCH` | La pregunta está definida, pero necesita fundamento jurídico externo o verificación de autoridad. | Sí para respuesta jurídica final | No hasta la fase de investigación |
| `UNLINKED` | Falta una relación material que la fuente no explicitó. | Sí si la issue es required | No como issue cerrada |
| `UNKNOWN` | No puede resolverse la entidad o vínculo declarado. | Sí | No |
| `NOT_APPLICABLE` | Issue no material o Coverage no aplicable; normalmente no se materializa en `issues`. | No | No |

Precedencia de cálculo: conflicto, postura faltante, relación desconocida/no enlazada, investigación pendiente y, finalmente, lista para generación. La razón final se guarda en `statusReason`; no se sustituye una razón humana por un PASS semántico.

`summary` cuenta issues, no bloques ni CoverageItems:

- `required`: `required === true`.
- `blocked`: `blocking === true`.
- `readyForGeneration`: `status === READY_FOR_GENERATION`.
- `needsLegalResearch`: `researchStatus === NEEDS_RESEARCH` o `researchStatus === SOURCE_CITED_UNVERIFIED`.
- `needsClientPosition`: `status === NEEDS_CLIENT_POSITION`.
- `unresolvedConflict`: `status === BLOCKED_BY_CONFLICT`.
- `unlinked`: `relationStatus !== EXPLICIT`.

## 10. Determinismo e inmutabilidad

El ID canonical debe derivarse de una clave estable, sin UUID aleatorio, reloj ni índice como identidad:

```text
documentId
| coverageItemId
| issueType
| sorted(sourceEntityIds)
| sorted(claimIds, factIds, evidenceMentionIds, evidenceOfferIds,
        argumentIds, authorityMentionIds, conflictIds, missingDataIds)
```

La clave se normaliza y se convierte a un slug/hash estable. Los arrays de relaciones se ordenan antes de calcular la clave y antes de comparar resultados. El orden de salida será Coverage canonical seguida por `issueType` e ID estable, de modo que el mismo input produzca los mismos IDs y la misma secuencia.

El builder debe ser puro: devuelve objetos nuevos, no muta `RichCaseAnalysis`, `CaseAnalysis`, `CoverageMatrix`, `DocumentCoverageItem` ni entidades fuente. Los cambios de estados de Coverage posteriores a generación siguen siendo responsabilidad de la política existente, no de la construcción de la matriz.

## 11. Propagación a DocumentPlan, GenerationTask y Trace

### Planes

Agregar de forma opcional:

```ts
interface DocumentPlanResult {
  // existentes...
  legalIssueMatrix?: LegalIssueMatrix;
}

interface DraftingPlan {
  // existentes...
  legalIssueMatrix?: LegalIssueMatrix;
}

interface IssuePlan {
  // Compatibilidad legacy; no se elimina todavía.
  issueId?: string;
  // Canonical rich-first.
  legalIssueIds?: string[];
  relatedCoverageItemIds?: string[];
}
```

En la ruta rich, `IssuePlan.legalIssueIds` contiene los IDs de la matriz y `relatedCoverageItemIds` los CoverageItems que los originaron. `issueId` solo se mantiene como alias de compatibilidad para callers legacy; no es la fuente de verdad de la matriz.

### GenerationTask

Agregar:

```ts
interface GenerationTask {
  // existentes...
  legalIssueIds?: string[];
  // targetIssueId permanece para la ruta legacy.
  targetIssueId?: string;
}
```

El constructor canonical debe copiar a la tarea únicamente los IDs y campos scoped de la issue: `coverageItemIds`, `claimIds`, `factIds`, `evidenceMentionIds`, `evidenceOfferIds`, `argumentIds` y `authorityMentionIds`. El objetivo de la tarea debe mencionar la `question`, no convertirla en una instrucción de defensa ni rellenar `parameter` o `counterargumentStrategy`.

`buildTaskContextPack` tendrá una rama canonical que resuelva `legalIssueIds` contra `doc.legalIssueMatrix` y construya un paquete limitado a esas issues y sus relaciones explícitas. La rama legacy conserva su comportamiento actual.

### GenerationTrace

`GenerationTaskTrace.legalIssueIds[]` ya existe y debe llenarse desde `task.legalIssueIds`, usando `targetIssueId` solo como fallback. Para completar `CoverageItem → LegalIssue → GenerationTask → DraftBlock`, agregar campos opcionales:

```ts
interface CoverageTraceItem {
  // existentes...
  legalIssueIds?: string[];
}

interface CoverageTransitionTrace {
  // existentes...
  legalIssueIds?: string[];
}
```

No se agrega texto fuente completo ni prompt crudo a la matriz o al trace. Los excerpts siguen sujetos a la política de truncamiento existente. La adición es backward-compatible para lectores de traces 1.0; no se introduce persistencia ni una migración.

## 12. Flujo de construcción

1. `reconstructCaseAnalysis` conserva su comportamiento: retorna `RichCaseAnalysis` y su proyección legacy.
2. `buildCoverageMatrix` mantiene el dispatch rich-first y produce la Coverage canonical. La matriz de issues no lee la proyección legacy cuando rich está presente.
3. Después de que Coverage y sus bindings estructurales estén disponibles, `buildLegalIssueMatrix` materializa las preguntas aplicables.
4. El builder valida IDs contra el snapshot rich, calcula provenance, relación, posture, research y estado sin mutar entradas.
5. `DocumentPlanResult`/`DraftingPlan` conservan `coverageMatrix` y `legalIssueMatrix`; Coverage sigue siendo la obligación canónica y la matriz de issues la capa explicativa/resoluble.
6. Cada `IssuePlan` rich-first viaja con `legalIssueIds[]` y `relatedCoverageItemIds[]`.
7. `buildGenerationTasksForSection` crea tareas con `legalIssueIds[]` y copia solo el contexto de esas issues. No se implementa generación multi-IA nueva en FASE 3.
8. Trace relaciona Coverage e Issue por IDs, Issue y Task por `legalIssueIds[]`, y Task y DraftBlock por `generationTaskId`/`coverageItemIds` existentes.
9. Quality Gate ejecuta validaciones estructurales de orfandad, blockers y enlaces. Semantic Evaluator no resuelve la issue.

## 13. Validación y Quality Gate

El nuevo módulo debe exponer una validación estructural conceptual:

```ts
validateLegalIssueMatrix(
  matrix: LegalIssueMatrix,
  coverageMatrix: CoverageMatrix,
  caseAnalysis?: CaseAnalysis,
): {
  ok: boolean;
  errors: string[];
  warnings: string[];
  orphanIssueIds: string[];
  coverageWithoutIssueIds: string[];
}
```

Gates mínimos:

- required Coverage sustantiva sin issue required asociada → error estructural, salvo categorías explícitamente issueless.
- required issue sin Coverage → error de issue huérfana.
- `coverageItemIds` con ID inexistente → error.
- relaciones ricas con IDs inexistentes → error.
- issue `BLOCKED_BY_CONFLICT` requerida → error crítico de readiness, no de corrección jurídica.
- issue `NEEDS_CLIENT_POSITION` requerida → error crítico de readiness.
- issue `NEEDS_RESEARCH` → warning o bloqueo de generación profunda, nunca validación de la norma.
- `relationStatus !== EXPLICIT` → warning para issue no requerida y error para issue required no generable.
- Coverage formal con cero issues → condición esperada, no error.

`runQualityGateCheck` puede incorporar los resultados como `ValidationIssue` y métricas estructurales. No debe evaluar si una issue es jurídicamente correcta, si una defensa es conveniente ni si una autoridad es aplicable.

## 14. Fixtures

No se requiere Fixture G. Fixture F ya cubre la combinación que FASE 3 necesita y debe reutilizarse mediante copias/overrides inmutables de prueba:

- dos claims con bases fácticas y evidencia explícitas o ausentes;
- cuatro facts, uno con postura del cliente confirmada y otros sin confirmación;
- dos `EvidenceMention`;
- un `EvidenceOffer` explícito;
- un argumento de fuente con fact y autoridad citados;
- una autoridad `SOURCE_CITED` no verificada;
- un conflicto abierto;
- un dato faltante bloqueante y uno informativo;
- provenance en las entidades.

Fixtures A–E se reutilizan para fallback legacy, conflictos, datos incompletos y regresión de extracción. Las pruebas de relaciones no enlazadas pueden usar overrides locales de Fixture F; no se agrega un fixture permanente solo para cambiar un array.

## 15. Contratos TDD obligatorios

La implementación futura debe cubrir como mínimo **32 contratos TDD**:

1. **Rich-first:** con `richCaseAnalysis` presente, la matriz usa Coverage rica.
2. **Legacy fallback:** sin rich, se usa el adaptador legacy explícito.
3. **IDs deterministas:** un input produce IDs estables.
4. **Repetibilidad:** dos construcciones del mismo input producen exactamente los mismos IDs.
5. **No mutación de RichCaseAnalysis:** el snapshot deep-equal permanece sin cambios.
6. **No mutación de CoverageMatrix:** Coverage y sus items permanecen sin cambios.
7. **Claim Coverage → issue:** `CLAIM_RESPONSE` produce `CLAIM_ELEMENT` con su claim ID.
8. **Fact Coverage → issue:** `FACT_RESPONSE` produce `FACT_DISPUTE` con su fact ID.
9. **EvidenceMention aislada:** una mención produce issue de relevancia sin `evidenceOfferIds`.
10. **EvidenceOffer explícito:** solo una oferta explícita produce `EVIDENCE_SUFFICIENCY`.
11. **SourceArgument:** argumento de fuente produce `SOURCE_ARGUMENT` con sus enlaces explícitos.
12. **SOURCE_CITED no verificado:** una autoridad citada conserva estado no verificado y genera research pendiente.
13. **Postura faltante:** una issue que depende de postura queda `NEEDS_CLIENT_POSITION` y bloqueada.
14. **Postura confirmada:** una issue con ID confirmado no se bloquea por postura desconocida.
15. **Dependencia de conflicto:** conflicto explícito produce `CONFLICT_DEPENDENCY` bloqueada.
16. **Relación no enlazada:** ausencia de relación explícita produce `UNLINKED`.
17. **Sin similitud:** textos parecidos sin IDs explícitos no crean relación.
18. **Coverage formal:** `FORMAL_DETERMINISTIC_ALLOWED` produce cero issues.
19. **Coverage ↔ Issue:** cada issue material tiene al menos un Coverage ID existente.
20. **Issue ↔ GenerationTask:** los IDs de la issue llegan a `legalIssueIds[]` de la tarea.
21. **Issue huérfana:** una issue sin Coverage es detectada por la validación.
22. **Issue bloqueada:** una issue bloqueada no queda `READY_FOR_GENERATION`.
23. **Issue lista:** una issue con enlaces, postura y sin blockers queda `READY_FOR_GENERATION`.
24. **Needs research:** una issue de autoridad o con autoridad citada no verificada queda `NEEDS_RESEARCH` o research-equivalente, nunca validada.
25. **Trace:** Coverage, issue, task y block quedan relacionados solo por IDs.
26. **Quality Gate:** required Coverage con issue bloqueada produce gate estructural fallido.
27. **No defensa inventada:** no aparecen defensas derivadas de una claim sin fuente explícita.
28. **No excepción inventada:** no aparecen excepciones derivadas de categoría o materia.
29. **No estatuto inventado:** no se agregan artículos, leyes o normas al construir la issue.
30. **No jurisprudencia inventada:** no se agregan tesis, jurisprudencia o precedentes.
31. **Regresión legacy:** la ausencia de rich conserva el comportamiento legacy existente.
32. **Regresión no laboral:** un template no laboral no recibe issues por heurística de materia laboral.

## 16. Riesgos y controles

| Riesgo | Control de diseño |
|---|---|
| Confundir `LegalIssue` legacy con issue canonical | Mantener interfaces separadas y marcar `sourceMode`. |
| Volver a inventar defensas desde claims | Pregunta neutral obligatoria; no copiar campos de respuesta legacy. |
| Crear relaciones por similitud | Builder basado exclusivamente en arrays de IDs y validación de orfandad. |
| Duplicar issues por aliases de Coverage | Ignorar `compatibilityAlias` en rich canonical. |
| Convertir mención en oferta | Constructores separados y prueba específica. |
| Resolver conflictos mediante IA | Estados bloqueantes y reutilización de `coveragePolicy`. |
| Convertir source citation en autoridad verificada | `researchStatus` explícito y preservación de `SOURCE_CITED`. |
| Romper consumers que esperan `targetIssueId` | Mantenerlo como alias legacy y añadir `legalIssueIds[]`. |
| Inflar la matriz con una issue por cada campo | Mapeo uno-a-uno por Coverage y ausencia de cross-product. |
| Perder trazabilidad en Trace | Añadir `legalIssueIds` a snapshots/transiciones sin incluir corpus completo. |
| Usar una issue como juez jurídico | Quality Gate solo estructural; no se evalúa corrección sustantiva. |

## 17. Fuera de alcance de FASE 3

No se implementa en esta fase:

- generación multi-agente o multi-call;
- NVIDIA real;
- recuperación de jurisprudencia, SCJN API/search o legal research engine;
- RAG jurídico, embeddings o vector DB;
- validación de artículos, normas, tesis, precedentes o aplicabilidad;
- argumentación jurídica extensa;
- renderer o estilos DOCX;
- UI extensa;
- persistencia, Prisma, Neon o migraciones;
- packaging de Windows;
- E2E externo.

## 18. Decisiones para aprobar antes de implementar

El diseño queda listo para revisión. Antes de cualquier cambio de código deben confirmarse explícitamente:

1. **Opción A:** mantener `LegalIssue` legacy como DTO de compatibilidad y usar `LegalIssueItem` como modelo canonical rich-first.
2. **Bloqueo de research:** tratar `NEEDS_RESEARCH` como no generable para la respuesta jurídica final hasta una fase posterior.
3. **Compatibilidad plural:** añadir `legalIssueIds[]` y conservar `issueId`/`targetIssueId` solo como aliases legacy.
4. **Fixtures:** reutilizar Fixture F y no crear Fixture G salvo que una prueba concreta demuestre que F no cubre un contrato.

No hay decisiones de investigación jurídica ni de persistencia incluidas en esta aprobación.
