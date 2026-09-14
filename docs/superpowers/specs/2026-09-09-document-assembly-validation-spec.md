# FASE 6 — Ensamblado y validación documental jurídica

**Fecha:** 2026-09-09  
**Estado:** propuesta lista para revisión; no implementada  
**Dependencia:** salida aceptada de FASE 5B  
**Alcance:** ensamblado determinista, validación cross-block, reconciliación final de Coverage, gate documental, readiness y trazabilidad  
**Destino:** ejecución local de la aplicación Windows; sin DOCX/PDF en esta fase

## 1. Problem

FASE 5B produce unidades jurídicas individualmente evaluadas: `IssueDraftResult`, `ContentBlock` con vínculos a `LegalIssue`, `CoverageItem`, hechos, evidencia y autoridades, además de `BlockQualityEvaluation`. Esa validez es issue-scoped. No demuestra que la colección completa forme un escrito coherente.

El estado actual contiene tres niveles de ensamblado parcial:

- `ensureCanonicalSections` normaliza secciones en el plan, pero fusiona contenido mutando los objetos recibidos.
- `assembleIssueDraftBlocks` ordena resultados de issue y deduplica por issue y texto, aunque incluye `VALID_NON_FINAL` y `FALLBACK` como candidatos.
- `assembleSectionBlocks` ordena bloques dentro de una sección por la tarea, conserva bloques humanos al frente y limpia marcadores, pero no define una identidad ni una política documental global.

También existe `runQualityGateCheck`, `evaluateDocumentSemantics`, `isCoverageSatisfied`, `validateDocument`, `getMissingRequiredSectionIds` y `GenerationTrace`. Son reutilizables, pero sus contratos actuales no modelan conjuntamente contradicciones entre bloques, evidencia mention versus evidence offer, autoridades nuevas durante assembly, cobertura perdida, orden global, trazabilidad de documento final o inmutabilidad de todas las entradas.

La pregunta de FASE 6 es, por tanto:

```text
¿Los bloques jurídicos aceptados, junto con la estructura formal permitida,
forman un escrito completo, coherente, no contradictorio, trazable y listo
para una futura etapa de renderizado?
```

## 2. Architecture gap analysis

La inspección fue limitada a los contratos y puntos de ensamblado necesarios: `types.ts`, `documentPlan.ts`, `generationTasks.ts`, `issueDraftResult.ts`, `issueScopedGeneration.ts`, `coverageMatrix.ts`, `coveragePolicy.ts`, `legalIssueMatrix.ts`, `semanticEvaluator.ts`, `qualityGate.ts`, `documentLifecycle.ts`, `exportGuards.ts`, `legalDocumentSanitizer.ts`, `generationTrace.ts`, `pipeline.ts`, los esqueletos de contestación y sus pruebas focales.

| Capacidad | Existe | Parcial | Falta | Archivo/función |
|---|:---:|:---:|:---:|---|
| Assembly documental completo |  | ✓ | ✓ | `generationTasks.ts:1494` `assembleSectionBlocks`; `issueScopedGeneration.ts:609` `assembleIssueDraftBlocks`; `pipeline.ts:3440+` itera secciones |
| Orden de secciones | ✓ | ✓ |  | `documentPlan.ts:60` `ensureCanonicalSections`; `DocumentTemplate.estructura`; `DocumentNode.order` |
| Orden de subsecciones |  | ✓ | ✓ | `DocumentNode.children` existe, pero no hay reconciliación documental recursiva con contrato de orden |
| Orden de bloques |  | ✓ | ✓ | tareas usan `order`/`orderInParent`; no existe una secuencia global ni rechazo tipado de placements faltantes |
| Independencia frente al completion order del provider | ✓ | ✓ |  | los ensambladores ordenan por tarea/issue, pero el documento final no calcula fingerprint estable ni protege todas las rutas |
| Deduplicación consciente de issue/Coverage |  | ✓ | ✓ | assembler de issue deduplica por issue+texto; sanitizer deduplica párrafos/secciones sin ledger documental completo |
| Cross-block consistency |  | ✓ | ✓ | `QualityGate` tiene heurísticas de posiciones, fechas y voz; no existe ledger de proposiciones comparables |
| Contradicción entre hechos |  | ✓ | ✓ | `CaseConflict` y `CONTRADICTORY_POSITION` existen; falta comparar hechos/valores/stances de bloques aceptados |
| Admitido versus negado |  | ✓ | ✓ | `FactPosition` y marcadores de contestación existen; falta regla documental por proposition y scope procesal |
| Consistencia de postura procesal |  | ✓ | ✓ | `enforceContestacionRoleIntegrity` y gates de contestación existen; falta validación general de postura, defensas y petitorios |
| Evidence mention versus evidence offer | ✓ | ✓ | ✓ | `EvidenceMention` y `EvidenceOffer` están separados; falta verificar cada referencia de bloque y su relación con issue/sección |
| Consistencia de evidencia |  | ✓ | ✓ | `qualityGate.ts` detecta oferta no confirmada de forma gruesa; falta vínculo tipado, alcance y sección |
| Consistencia de autoridad |  | ✓ | ✓ | allowlists y estados están en `IssueDraftResult`/research; falta rechazar autoridades nuevas durante assembly |
| No introducir hechos nuevos |  | ✓ | ✓ | `QualityGate` revisa fechas no autorizadas; falta política cerrada para hechos concretos, importes, identidades y case refs |
| Coverage final documental |  | ✓ | ✓ | `isCoverageSatisfied`, `applySemanticEvaluationToCoverageMatrix` y `evaluateDocumentSemantics` existen; mutan la matriz y no detectan toda pérdida/duplicación durante assembly |
| Detección de Coverage faltante | ✓ | ✓ |  | `runQualityGateCheck` y `evaluateDocumentSemantics` detectan required no cubierto; falta distinguir bloque inválido, bloque perdido y sección incompatible |
| Document readiness |  | ✓ | ✓ | ciclo de vida: `DRAFT`, `REVIEW_REQUIRED`, `READY_TO_EXPORT`; pipeline calcula `isDocumentTrulyComplete`; falta decisión FASE 6 tipada y separada |
| Document QualityGate | ✓ | ✓ | ✓ | `runQualityGateCheck` y reglas registrables son estructurales; falta gate compuesto específico de assembly |
| Document-level semantic evaluation |  | ✓ | ✓ | `evaluateDocumentSemantics` agrega resultados de bloques; no valida relaciones cross-block |
| Trace de generación | ✓ | ✓ | ✓ | `GenerationTrace` conserva tasks, attempts, Coverage, evaluations, blocks, assembly paragraphs y gate; falta registrar el resultado global de assembly y su fingerprint |
| Cadena FinalDocument→IssueDraftResult |  | ✓ | ✓ | `ContentBlock.issueDraftResultHash`, `generationTaskId`, issue/Coverage IDs y `GenerationTrace` permiten parte de la cadena; falta un índice documental explícito |
| Inmutabilidad |  | ✓ | ✓ | sanitizer clona superficialmente, pero `ensureCanonicalSections` y updates de Coverage mutan entradas; falta contrato de snapshots y deep structural equality |
| Modelo final ensamblado | ✓ |  | ✓ | `UniversalLegalDocument` + `DocumentNode` + `ContentBlock` son el envelope; no existe un resultado transitorio tipado de assembly/validation |

### 2.1 Reutilización obligatoria

FASE 6 reutilizará, sin duplicar sus responsabilidades:

1. `DocumentPlanResult.sections`, `DocumentTemplate.estructura`, `DocumentNode.order` y `children` como fuente canónica de orden.
2. `GenerationTask.order`, `orderInParent`, `legalIssueIds` y `coverageItemIds` como vínculo de placement; los timestamps no participan en el orden.
3. `ContentBlock` como representación runtime de lo que el proyecto llama semánticamente `DraftBlock`. No existe una interfaz `DraftBlock` independiente.
4. `IssueDraftValidationStatus`, `BlockQualityEvaluation` y `evaluateDocumentSemantics` para distinguir aceptación, no-finalidad y fallo; FASE 6 no recalifica la issue.
5. `isCoverageSatisfied` y `getCoverageResolutionBlockReason` para no redefinir la política de satisfacción ni permitir que fallback, `VALID_NON_FINAL`, `DETERMINISTIC` sustantivo o `SOURCE_CITED` satisfagan Coverage sustantivo.
6. `getMissingRequiredSectionIds`, `validateDocument`, `runQualityGateCheck` y las reglas de `DocumentTemplate` como checks base.
7. `EvidenceMention`, `EvidenceOffer`, `SourceAuthorityMention`, `CaseConflict`, `FactItem`, `SourceAssertion`, `ClientPosition` y `RichCaseAnalysis` como grafo autorizado.
8. `GenerationTrace.assemblyMetadata`, `recordAssembly`, `recordQualityGate`, `snapshotCoverageBefore` y `snapshotCoverageAfter`, ampliándolos aditivamente.

### 2.2 Límites de FASE 5B

FASE 6 consume la salida de FASE 5B. No cambia:

- `resolveEffectiveIssueGenerationEligibility` ni ningún estado de elegibilidad;
- `IssueDraftResult`, su validación o su hash, salvo imports de tipos si fueran indispensables;
- `executeReadyIssueTasks`, retries, concurrencia, adapters, providers o research;
- `BlockQualityEvaluation`, sus umbrales y su evaluación issue-scoped;
- `LegalIssueMatrix`, `CoverageMatrix` de entrada o `LegalResearchBundle`;
- las reglas de recuperación, SCJN, DOF, Cámara, NVIDIA, LocalProvider, RAG o persistencia.

Una adaptación de lectura en `pipeline.ts` puede construir `DocumentAssemblyInput` desde los resultados ya producidos. Eso no reabre FASE 5B ni recalcula sus decisiones.

## 3. Goals

FASE 6 debe:

1. Producir un resultado documental nuevo a partir de bloques candidatos y del plan canónico.
2. Incluir únicamente bloques issue-scoped `VALID_ACCEPTED` con evaluación semántica `PASS` y sin hard fail para Coverage sustantivo.
3. Permitir bloques deterministas solo cuando el contrato de sección los autorice y el Coverage sea formal.
4. Preservar bloques humanos manuales sin reescribirlos ni convertirlos automáticamente en Coverage sustantivo.
5. Determinar el mismo orden y fingerprint con la misma entrada semántica, aunque cambie el orden de finalización del provider.
6. Detectar contradicciones materiales, posturas incompatibles, evidencia mal vinculada, autoridades nuevas, hechos nuevos, Coverage perdido y petitorios sin soporte.
7. Distinguir repetición innecesaria de reiteración funcionalmente necesaria sin borrar bloques automáticamente.
8. Separar `Coverage` final, `DocumentReadiness` documental y `QualityGate` de la evaluación issue-scoped.
9. Extender la trazabilidad hasta el bloque y sus IDs de issue, tarea, Coverage y research, sin copiar bundles completos.
10. Ser ejecutable localmente en Windows sin dependencias cloud nuevas.

## 4. Non-goals

FASE 6 no hará:

- research legal ni verificación de autoridades;
- clasificación o análisis inicial del caso;
- effective eligibility o generación issue-scoped;
- recuperación web, RAG, embeddings o adapters;
- cambios de DB, Prisma, Neon o persistencia nueva;
- UI o cambios de editor;
- renderizado DOCX/PDF;
- llamadas a cualquier provider para assembly, consistency, Coverage o readiness;
- resolución silenciosa de conflictos;
- elección de una versión fáctica cuando existen dos versiones incompatibles;
- generación de hechos, pruebas, autoridades, remedios o texto jurídico nuevo.

## 5. Inputs

El contrato de entrada se modelará en `documentAssemblyTypes.ts` como una vista de solo lectura:

```ts
interface DocumentAssemblyInput {
  document: UniversalLegalDocument;
  documentPlan: DocumentPlanResult;
  draftingPlan?: DraftingPlan;
  candidateSections: readonly DocumentNode[];
  candidateBlocks: readonly {
    sectionId: string;
    block: ContentBlock;
  }[];
  generationTasks: readonly GenerationTask[];
  coverageMatrix?: CoverageMatrix;
  legalIssueMatrix?: LegalIssueMatrix;
  richCaseAnalysis?: RichCaseAnalysis;
  baseSemanticEvaluation?: DocumentSemanticEvaluation;
  baseQualityGate?: QualityGateResult;
  generationTrace?: Pick<GenerationTrace, 'generationId' | 'issueGenerationAttempts' | 'draftBlocks'>;
}
```

Reglas de entrada:

- `documentPlan.sections` es la fuente canónica de las secciones; `candidateSections` solo aporta contenido existente y bloques humanos.
- `candidateSections` y `candidateBlocks` se capturan desde una copia no destructiva de la salida aceptada de FASE 5B **antes** de cualquier sanitizer o deduplicación. La captura conserva bloques manuales, IDs de `LegalIssue`/`Coverage` y dos bloques con el mismo texto cuando su alcance es distinto.
- Un `ContentBlock` se identifica por `id`; su `sectionId` se toma del wrapper, nunca de un timestamp o de la posición de llegada.
- `generationTaskId`, `legalIssueIds`, `coverageItemIds`, `issueDraftValidationStatus`, `semanticEvaluation`, `generatedBy`, `generationRequirement`, `fallbackStatus` y `issueDraftResultHash` se leen como metadata de FASE 5B.
- La matriz rica se usa solo si existe `richCaseAnalysis`/`LegalIssueMatrix.sourceMode === 'RICH'`; no se fabrica una matriz rica desde la proyección legacy.
- `baseSemanticEvaluation` y `baseQualityGate` son evidencia ya calculada. FASE 6 puede recomponer el gate sobre el documento clonado, pero no llama al provider.
- `generationTrace` se referencia por IDs y hashes; no se copia el cuerpo de `LegalResearchBundle`.

## 6. Outputs

La abstracción nueva recomendada es `DocumentAssemblyResult`, equivalente funcional a `AssembledLegalDraft` pero sin crear un segundo envelope persistente paralelo a `UniversalLegalDocument`.

```ts
type AssemblyStatus = 'ASSEMBLED' | 'BLOCKED';
type AssemblyValidationStatus = 'NOT_VALIDATED' | 'VALID' | 'REQUIRES_REVIEW' | 'INVALID';
type DocumentAssemblyReadiness = 'READY' | 'INCOMPLETE' | 'BLOCKED' | 'REQUIRES_REVIEW' | 'INVALID';

interface DocumentAssemblySection {
  sectionId: string;
  sectionPath: readonly string[];
  title: string;
  type: DocumentNode['type'];
  order: number;
  blockIds: readonly string[];
  blocks: readonly ContentBlock[];
}

interface DocumentAssemblyFinding {
  code: string;
  severity: 'INFO' | 'WARNING' | 'REVIEW' | 'BLOCKER';
  message: string;
  reason: string;
  blockIds: readonly string[];
  legalIssueIds: readonly string[];
  coverageItemIds: readonly string[];
  sectionIds: readonly string[];
}

interface DocumentAssemblyTraceMetadata {
  assemblyId: string;
  inputFingerprint: string;
  outputFingerprint: string;
  generationId?: string;
  orderedSectionIds: readonly string[];
  orderedBlockIds: readonly string[];
  sourceDraftBlockIds: readonly string[];
  excludedDraftBlockIds: readonly string[];
  findingCodes: readonly string[];
  blockLinks: readonly {
    blockId: string;
    generationTaskId?: string;
    issueDraftResultHash?: string;
    legalIssueIds: readonly string[];
    coverageItemIds: readonly string[];
  }[];
}

interface DocumentAssemblyResult {
  documentId: string;
  documentType: string;
  document: UniversalLegalDocument;
  sections: readonly DocumentAssemblySection[];
  orderedBlocks: readonly ContentBlock[];
  sourceDraftBlockIds: readonly string[];
  excludedDraftBlockIds: readonly string[];
  linkedLegalIssueIds: readonly string[];
  linkedCoverageItemIds: readonly string[];
  assemblyStatus: AssemblyStatus;
  validationStatus: AssemblyValidationStatus;
  readiness: DocumentAssemblyReadiness;
  coverageReconciliation?: CoverageReconciliation;
  findings: readonly DocumentAssemblyFinding[];
  trace: DocumentAssemblyTraceMetadata;
}
```

`document` y cada sección/bloque del resultado son copias nuevas. El `document` resultante es un candidato listo para una futura etapa de renderizado, no una autorización automática para `READY_TO_EXPORT` o `FINAL_DOCUMENT`.

## 7. Architecture

```text
FASE 5B output
  accepted ContentBlocks + IssueDraftResult metadata
  deterministic formal blocks + preserved human blocks
           │
           ▼
non-destructive assembly input snapshot (pre-sanitizer)
           │
           ▼
assembleLegalDraft (pure, no provider)
  DocumentPlan / DraftingPlan canonical ordering
           │
           ├─ accepted-block filter and placement
           ├─ section/subsection contract validation
           └─ stable document identity
           │
           ▼
cross-block consistency
  facts · stances · procedural posture · evidence · authorities · petition
           │
           ▼
redundancy findings (never silent deletion)
          │
           ▼
final Coverage reconciliation
           │
           ▼
petition compatibility
           │
           ▼
sanitizer on the authorized assembly copy
  dedupeBlocks: false; preserve IDs, scope and manual text
           │
           ▼
base structural validation + QualityGate on that copy
            │
            ▼
FASE 6 check statuses
            │
            ▼
decideDocumentAssemblyReadiness
            │
            ▼
final DocumentAssemblyQualityGateResult
            │
            ▼
pipeline final completeness
  only when the final FASE 6 gate passes; never an automatic lifecycle transition
```

La función pública será:

```ts
function assembleLegalDraft(input: DocumentAssemblyInput): DocumentAssemblyResult;
function validateDocumentAssembly(
  input: DocumentAssemblyInput,
  assembly: DocumentAssemblyResult,
): DocumentAssemblyResult;
```

La primera función solo ordena, filtra y copia la captura pre-sanitizer. La segunda compone los validadores deterministas, Coverage y petition compatibility; después sanitiza exclusivamente la copia autorizada, ejecuta el gate estructural base, calcula los estados de checks, decide readiness y compone el gate documental final. Ninguna función recibe `IssueProviderInvoker` ni una dependencia de research adapter.

## 8. Data model and acceptance policy

### 8.1 Blocks admitted to final assembly

| Entrada | Entra a `orderedBlocks` | Puede satisfacer Coverage sustantivo |
|---|:---:|:---:|
| `issueDraftValidationStatus = VALID_ACCEPTED`, semantic `PASS`, hard fails vacíos | Sí | Sí, mediante `isCoverageSatisfied` |
| `VALID_NON_FINAL` | No | No |
| `INVALID_FATAL` / `INVALID_RETRYABLE` | No | No |
| `FALLBACK` o `fallbackStatus` | No para contenido sustantivo | No |
| `generatedBy = DETERMINISTIC` con contrato formal explícito | Sí | Solo `FORMAL_DETERMINISTIC_ALLOWED` |
| bloque humano manual existente | Sí, preservado | No automáticamente en Coverage sustantivo rich |
| bloque vacío, seed, truncado o con dependencia fáctica pendiente | No | No |

Los bloques excluidos permanecen en `excludedDraftBlockIds` y originan findings cuando su exclusión deja Coverage obligatorio sin resolver. FASE 6 no destruye los bloques de entrada.

### 8.2 Placement key

El placement se calcula desde datos canónicos, en este orden:

```text
documentPlan.sections index
→ section.order
→ recursive child path/order
→ draftingPlan.sections index
→ issue/claim/fact plan index
→ GenerationTask.order
→ GenerationTask.orderInParent
→ block class rank (formal/preserved/accepted según contrato)
→ block.id como tie-break estable
```

La implementación debe rechazar con `MISSING_CANONICAL_PLACEMENT` cualquier bloque sustantivo aceptado que no pueda asociarse a una sección del plan y a una tarea/plan position verificable. `block.id` solo es tie-break; nunca reemplaza una posición semántica ausente.

No se usan `createdAt`, `generatedAt`, `retrievedAt`, completion timestamp, provider order, `generationId` ni índices de arrays derivados de `Promise.all`.

### 8.3 Stable identity

`assemblyId`, `inputFingerprint` y `outputFingerprint` reutilizan `stableResearchId` de `legal-research/canonical.ts`, que es un helper puro sin imports de Node y ya elimina metadata transitoria. Sus payloads deben ordenar explícitamente todas las colecciones semánticamente no ordenadas bajo claves `*Ids`/`*IDs` o mediante registros canónicos equivalentes; solo se conserva el orden de arrays cuyo orden sea semántico para el documento. No se usa `node:crypto`, `crypto`, `node:fs`, `node:path` ni otro builtin de Node en el camino compartido nuevo.

El fingerprint incluye document ID/tipo, plan section IDs y órdenes, bloque ID, text hash, status aceptado, task ID, issue IDs, Coverage IDs y findings deterministas. No incluye el texto completo de un research bundle. Dos ejecuciones con la misma entrada semántica tienen el mismo fingerprint aunque tengan distintos timestamps externos, completion order o llegada accidental de arrays no ordenados; entradas materialmente distintas deben producir fingerprints distintos en el contrato focal.

## 9. Assembly rules

1. El plan documental existente se lee; no se llama a `ensureCanonicalSections`, porque su implementación actual fusiona y muta contenido.
2. La captura de `candidateSections`/`candidateBlocks` ocurre antes del sanitizer y de cualquier deduplicación destructiva.
3. Se verifica unicidad de section IDs, identidad de `templateId`, orden canónico y correspondencia de cada sección del plan.
4. Se copian secciones y bloques antes de cualquier limpieza o metadata de resultado.
5. Se filtran bloques por la tabla de admisión anterior.
6. Se preservan bloques manuales; si una modificación manual impide una normalización determinista, se registra `MANUAL_EDIT_PRESERVED` y no se sobreescribe.
7. Se coloca cada bloque con la `placement key`; si hay empate semántico no resoluble se registra `AMBIGUOUS_BLOCK_ORDER` y readiness no puede ser `READY`.
8. Se conservan bloques de issues distintas aunque tengan texto idéntico. La identidad de issue y Coverage tiene precedencia sobre similitud textual.
9. Se produce un `UniversalLegalDocument` nuevo con las secciones resultantes; la matriz de entrada, el plan, el análisis y los bloques de entrada permanecen byte/structurally unchanged.
10. Solo después de completar la validación FASE 6 se puede sanitizar la copia autorizada, con `dedupeBlocks: false`. El sanitizer no decide identidad jurídica, satisfacción de Coverage ni descarte de bloques; debe conservar IDs, vínculos issue/Coverage y texto manual. Si no puede hacerlo, el resultado es `INVALID` y no es completo.
11. Se calcula `assemblyId` determinista después del orden y antes de la validación documental.

## 10. Section contracts

El contrato de sección se deriva de `DocumentTemplate.estructura`, `DocumentNode.type`, `getRequiredSectionIds`, `DocumentPlanResult`, `SectionPlan` y las categorías de Coverage. No contiene escritos completos, hechos concretos ni jurisprudencia.

```ts
interface SectionContract {
  sectionId: string;
  sectionPath: readonly string[];
  type: DocumentNode['type'];
  required: boolean;
  contentRole: 'FORMAL' | 'FACT_RESPONSE' | 'ISSUE_ARGUMENT' | 'EVIDENCE' | 'PETITION' | 'CLOSING' | 'CUSTOM';
  allowedCoverageCategories: readonly CoverageCategory[];
  deterministicAllowed: boolean;
  requiresAcceptedSubstantiveBlock: boolean;
}
```

Reglas genéricas:

- `header`, `identity`, `closing`, `signature`: estructura formal; los bloques deterministas son admisibles según el template.
- `background`/`facts`: respuestas o antecedentes basados en hechos vinculados; una proposición de la contraparte conserva su `SOURCE_ASSERTION` y no se transforma automáticamente en hecho propio.
- `argument`/`legal_grounds`: defensas, cuestiones o aplicaciones derivadas de `LegalIssue`/Coverage y sus autoridades ya existentes.
- `evidence`: solo referencias y ofertas con IDs válidos y propósito/relación verificables.
- `petition`: solo solicitudes soportadas por `REQUESTED_RELIEF`, `PETITION_SUPPORT`, claims o issues expresamente relacionados.
- `custom`: no se presume contenido; requiere Coverage/placement explícito o queda en revisión.

Para contestaciones ordinarias, el orden real derivado del skeleton canónico es:

```text
PROEMIO
→ COMPARECENCIA Y PERSONALIDAD
→ OBJETO DEL ESCRITO
→ CONTESTACIÓN DE HECHOS
→ CONTESTACIÓN DE PRESTACIONES
→ EXCEPCIONES Y DEFENSAS
→ PRUEBAS
→ ALEGATOS
→ PETITORIOS
→ FIRMA
```

Para `contestacion_revision_extraordinaria_amparo_directo`, el skeleton real contiene identificación, comparecencia, sentencia impugnada, antecedentes, cuestión constitucional, agravios/argumentos, fundamentos, petitorios y cierre/firma. FASE 6 valida la estructura declarada y su orden; no hardcodea el contenido de ningún escrito.

## 11. Consistency rules

### 11.1 Proposition ledger

`documentConsistency.ts` construirá un ledger determinista desde los IDs enlazados y el grafo rico:

```ts
interface DocumentProposition {
  propositionId: string;
  kind: 'FACT' | 'CLAIM' | 'RELIEF' | 'POSITION' | 'LEGAL_CONCLUSION';
  scope: 'SOURCE_ASSERTION' | 'CLIENT_POSITION' | 'DOCUMENT_ASSERTION';
  valueFingerprint: string;
  stance?: 'ADMIT' | 'DENY' | 'PARTIAL' | 'NOT_KNOWN' | 'ASSERT' | 'OPPOSE' | 'UNKNOWN';
  blockId: string;
  sourceEntityIds: readonly string[];
  explicitConflictIds: readonly string[];
}
```

El ledger no adjudica hechos. Si el texto no contiene una forma controlada o una relación estructurada suficiente, la proposición queda `UNKNOWN`; FASE 6 no la convierte en una afirmación segura.

### 11.2 Facts

- Un `FactItem` o `AnalyzedFact` enlazado es una fuente autorizada, no una autorización para cambiar su `assertionStatus`.
- Se comparan solo propositions con el mismo `propositionId`/fact ID y el mismo `scope`.
- Una fecha, importe, identidad, parte, número de expediente o evento concreto encontrado en un bloque debe estar en el conjunto autorizado por entidades enlazadas, intake confirmado o variables formales de la sección.
- Una fecha/importe/identidad concreta no autorizada produce `NEW_FACT_DURING_ASSEMBLY` con `BLOCKER`, salvo que sea un marcador formal permitido como fecha de presentación.
- Dos valores incompatibles para la misma proposition producen `MATERIAL_FACT_CONTRADICTION`. Con `CaseConflict` explícito y lenguaje de controversia, el resultado es `REVIEW` y conserva ambos lados; sin conflicto explícito, es `BLOCKER`.
- No se comparan como contradicción una alegación de la contraparte (`SOURCE_ASSERTION`) y una negativa del cliente (`CLIENT_POSITION`); sus scopes son distintos.

### 11.3 Admitido versus negado

Para una misma proposition de cliente:

```text
ADMIT + DENY
ADMIT + NOT_KNOWN
DENY + PARTIAL incompatible
```

produce `CONFLICTING_CLIENT_POSITION`. Una postura `UNKNOWN` solo se conserva como unknown; nunca se usa para fabricar una admisión o negativa. Un `CaseConflict` explícito permite `REQUIRES_REVIEW`, no `READY`.

### 11.4 Procedural position

El ledger de postura cruza:

- `DocumentTemplate.rolAutor`, `proceduralIdentity` y partes confirmadas;
- `AnalyzedFact.lawyerPosition`, `ClaimItem`/claim response y `ClientPosition`;
- defensas y `LegalIssueItem` enlazadas;
- `REQUESTED_RELIEF` y `PETITION_SUPPORT`.

Una postura no puede aparecer afirmada, negada y desconocida para la misma proposition sin `conflictId` explícito. La identidad formal de una contestación conserva que quien contesta es el demandado; la regla existente de firma/roles se reutiliza y no se reimplementa como generación.

### 11.5 Legal conclusion versus fact

Frases como improcedencia, prescripción, absolución, revocación o fundabilidad se registran como `LEGAL_CONCLUSION`, nunca como `FACT`. No pueden autorizar por sí mismas una fecha, una prueba, una autoridad o un remedio.

## 12. Evidence rules

`EvidenceMention` y `EvidenceOffer` permanecen entidades distintas.

Una mención puede sostener una frase de referencia, pero no una frase de oferta. Para que una frase de oferta sea admisible:

1. el bloque debe tener un `evidenceOfferId` directo o por un `CoverageItem` enlazado;
2. el `EvidenceOffer.evidenceMentionId` debe existir;
3. el offer debe estar en `PARTY_OFFERED` o `CLIENT_CONFIRMED`, no en `NEEDS_REVIEW`;
4. el mention debe relacionarse con el fact/claim/issue o Coverage del bloque;
5. la sección debe permitir evidencia u ofrecer explícitamente ese tipo de soporte;
6. el texto no puede afirmar admisión, eficacia o valor definitivo si esas conclusiones no están en un resultado autorizado;
7. una prueba de otra issue requiere una relación explícita de Coverage/issue; no se infiere por similitud.

Findings mínimos:

- `EVIDENCE_MENTION_WITHOUT_OFFER`: la frase usa una mención como si fuera oferta;
- `EVIDENCE_OFFER_NOT_LINKED`: oferta sin bloque/Coverage/issue vinculados;
- `EVIDENCE_OFFER_NEEDS_REVIEW`: oferta no confirmada;
- `EVIDENCE_WRONG_ISSUE`: soporte perteneciente a otra issue sin enlace explícito;
- `EVIDENCE_WRONG_SECTION`: referencia/oferta incompatible con el contrato de sección.

Los tres primeros son `BLOCKER` cuando afectan una requirement obligatoria; el último puede ser `REVIEW` solo si el Coverage no es obligatorio, de otro modo es `BLOCKER`.

## 13. Authority rules

FASE 6 construye una allowlist cerrada con:

- `SourceAuthorityMention.id` y `citationText` de la `RichCaseAnalysis` enlazada;
- `LegalIssueItem.authorityMentionIds`;
- authorities permitidas por `CoverageItem`/`IssueDraftResult`;
- `verifiedAuthorityIds` de research ya verificado, conservando su hash y status.

Assembly no agrega autoridades. `SOURCE_CITED` sigue siendo citado por la fuente, pero no es `LEGALLY_VERIFIED`. La salida produce:

- `NEW_AUTHORITY_DURING_ASSEMBLY` si un ID o citation text no está en la allowlist;
- `UNVERIFIED_AUTHORITY_USED_AS_VERIFIED` si un bloque presenta `SOURCE_CITED` como verificado;
- `AUTHORITY_WRONG_ISSUE` si la autoridad existe pero no pertenece a la issue/Coverage sin enlace explícito.

Una cita concreta del texto que no pueda resolverse a un `SourceAuthorityMention` permitido es `BLOCKER`. No se intenta investigar, normalizar hacia otra cita ni adivinar el ID correcto.

## 14. Redundancy / duplication

La política es detectar, clasificar y no borrar silenciosamente.

`duplicateKey` se calcula con:

```text
sectionId
| function role
| sorted legalIssueIds
| sorted coverageItemIds
| proposition IDs
| sorted evidence linkage IDs
| normalized text fingerprint
```

Dos bloques solo pueden considerarse duplicado eliminable en una futura operación explícita si tienen el mismo `duplicateKey`, no son manuales y ocupan el mismo slot funcional. FASE 6 no elimina; registra `DUPLICATE_BLOCK_SAME_FUNCTION`.

Si el texto es igual pero cambia issue, Coverage, section, función, proposition o evidence linkage, ambos bloques se conservan y se registra `REPEATED_TEXT_DIFFERENT_SCOPE` como `WARNING` o `REVIEW`. No se deduplica un bloque de dos issues distintas solo por similitud textual.

El sanitizer existente no se usa como política de assembly; si una ruta futura lo invoca, deberá hacerlo sobre la copia de salida con `dedupeBlocks: false` para no perder contenido legítimo.

## 15. Final Coverage reconciliation

Se crea una reconciliación nueva; no se muta la `CoverageMatrix` de entrada.

Para cada `CoverageItem` se conserva:

```ts
interface CoverageReconciliationItem {
  coverageItemId: string;
  finalBlockIds: readonly string[];
  finalSectionIds: readonly string[];
  satisfied: boolean;
  reason: string;
  duplicated: boolean;
  lostDuringAssembly: boolean;
}

interface CoverageReconciliation {
  items: readonly CoverageReconciliationItem[];
  requiredMissingIds: readonly string[];
  duplicatedIds: readonly string[];
  lostIds: readonly string[];
  allRequiredSatisfied: boolean;
}
```

Reglas:

1. `isCoverageSatisfied` sigue siendo la decisión base.
2. Solo `VALID_ACCEPTED` + semantic `PASS` satisface Coverage sustantivo.
3. `VALID_NON_FINAL`, fallback, invalid, vacío, seed, truncado y `generated` sin aceptación no satisfacen.
4. `FORMAL_DETERMINISTIC_ALLOWED` puede satisfacerse con bloque determinista no-placeholder.
5. Un item requerido sin bloque final es `REQUIRED_COVERAGE_MISSING` y `BLOCKER`.
6. Si existía un bloque aceptado enlazado al item pero no aparece en salida, es `COVERAGE_LOST_DURING_ASSEMBLY` y `BLOCKER`.
7. Un bloque referencia un Coverage inexistente: `ORPHAN_COVERAGE_LINK` y `BLOCKER`.
8. Un bloque cubre un item desde una sección incompatible con `targetSectionIds`: `COVERAGE_INCOMPATIBLE_SECTION` y `BLOCKER` si es requerido.
9. Varias coberturas del mismo item solo son duplicación si comparten función/proposition; una cobertura distribuida entre hecho, prueba y argumento puede ser jurídicamente necesaria.
10. Un Coverage duplicado se informa; nunca se resuelve escogiendo arbitrariamente un bloque.

`research suficiente != Coverage` y `DraftBlock existente != Coverage final` siguen siendo invariantes explícitos.

## 16. Document completeness and readiness

Se introduce `DocumentAssemblyReadiness`, separado del lifecycle existente:

| Estado FASE 6 | Significado |
|---|---|
| `READY` | todos los checks documentales pasan; el documento es elegible para la transición explícita del abogado, no se exporta automáticamente |
| `INCOMPLETE` | faltan elementos no resueltos sin contradicción material; no es un escrito completo |
| `BLOCKED` | existe blocker material o una contradicción que no puede resolverse automáticamente |
| `REQUIRES_REVIEW` | hay findings profesionales/legacy/manuales que requieren revisión, aunque no haya un blocker fatal |
| `INVALID` | el resultado viola schema, IDs, identidad, inmutabilidad o trace; no es un candidato documental válido |

`READY` exige simultáneamente:

- secciones obligatorias presentes, únicas y en orden canónico;
- todos los bloques sustantivos finales aceptados y no inválidos;
- Coverage requerido satisfecho en la salida;
- cero contradicciones materiales no resueltas;
- evidencia y authorities consistentes;
- cero hechos/authorities nuevas;
- petitorios soportados;
- fingerprint/placement determinista;
- trace completo e íntegro;
- gate base y gate FASE 6 aprobados.

La dependencia entre readiness y gate es unidireccional y acíclica:

```text
assembly + validators + Coverage + petition compatibility
  → base structural QualityGate
  → FASE 6 check statuses
  → decideDocumentAssemblyReadiness
  → final DocumentAssemblyQualityGateResult
```

`decideDocumentAssemblyReadiness` no consume `DocumentAssemblyQualityGateResult`. El resultado final consume la readiness ya decidida y deriva una sola vez `canMarkAsReady`; no existe una dependencia readiness ↔ gate. Un blocker material o un resultado `INVALID` tiene precedencia sobre cualquier score; `REQUIRES_REVIEW`/`REVIEW` nunca es `READY`.

Mapeo con lifecycle:

```text
DocumentAssemblyReadiness.READY
  → permite solicitar markDocumentAsReadyToExport({ explicit: true })
  → no ejecuta la transición por sí mismo

INCOMPLETE/BLOCKED/REQUIRES_REVIEW/INVALID
  → permanece DRAFT o REVIEW_REQUIRED según la capa existente
```

No se amplía ni se confunde `DocumentReadiness = DRAFT | REVIEW_REQUIRED | READY_TO_EXPORT` del lifecycle.

## 17. Document-level QualityGate

La capa separada `documentAssemblyQualityGate.ts` compone el gate existente en vez de sobrecargar `runQualityGateCheck` con entradas que hoy no conoce. La composición ocurre al final de una cadena lineal y no llama de vuelta a readiness.

```ts
interface DocumentAssemblyQualityGateResult {
  passed: boolean;
  canMarkAsReady: boolean;
  readiness: DocumentAssemblyReadiness;
  baseQualityGate: QualityGateResult;
  findings: readonly DocumentAssemblyFinding[];
  checks: readonly {
    checkId: string;
    status: 'PASS' | 'FAIL' | 'REVIEW' | 'NOT_APPLICABLE';
    findingCodes: readonly string[];
  }[];
}
```

El contrato interno de la cadena es:

```ts
interface DocumentAssemblyCheckSet {
  checks: readonly DocumentAssemblyQualityGateResult['checks'][number][];
  findings: readonly DocumentAssemblyFinding[];
  hasMaterialBlocker: boolean;
  hasInvalidity: boolean;
}

function evaluateDocumentAssemblyChecks(input): DocumentAssemblyCheckSet;
function decideDocumentAssemblyReadiness(input: {
  checks: DocumentAssemblyCheckSet;
  baseQualityGate: QualityGateResult;
  coverage: CoverageReconciliation;
  trace: DocumentAssemblyTraceMetadata;
}): DocumentAssemblyReadiness;
function runDocumentAssemblyQualityGate(input: {
  checks: DocumentAssemblyCheckSet;
  readiness: DocumentAssemblyReadiness;
  baseQualityGate: QualityGateResult;
}): DocumentAssemblyQualityGateResult;
```

`runDocumentAssemblyQualityGate` calcula `passed` a partir de los estados/checks y del gate base, con precedencia `INVALID` → `BLOCKED` → `INCOMPLETE` → `REQUIRES_REVIEW` → `READY`; `qualityScore` no puede convertir un blocker en PASS. `canMarkAsReady` se deriva una sola vez como resultado del gate aprobado y `readiness === 'READY'`. Ningún paso posterior vuelve a llamar a `decideDocumentAssemblyReadiness`.

Checks mínimos:

1. `STRUCTURAL_COMPLETENESS`: secciones requeridas, únicos IDs, orden, placements.
2. `COVERAGE_COMPLETENESS`: reconciliación final, required, duplicated/lost/incompatible.
3. `CROSS_BLOCK_CONSISTENCY`: facts, stances, posture y legal conclusions.
4. `EVIDENCE_CONSISTENCY`: mention/offer, issue, section y status.
5. `AUTHORITY_CONSISTENCY`: allowlist, status y issue linkage.
6. `NO_NEW_FACTS`: concretos no autorizados.
7. `NO_NEW_AUTHORITIES`: IDs/citations fuera de allowlist.
8. `DETERMINISTIC_ASSEMBLY`: orden, tie-breaks y fingerprints.
9. `TRACE_INTEGRITY`: cadena final y hashes.
10. `BASE_DOCUMENT_GATE`: `runQualityGateCheck`/`validateDocument` reutilizados sobre la copia.

`QualityGate` issue-scoped y `DocumentSemanticEvaluation` siguen siendo entradas/evidencia, no se fusionan en una única evaluación semántica ni se usa un score numérico para ocultar un blocker. La validación estructural base se ejecuta sobre la copia autorizada ya sanitizada; el sanitizer está fuera de la política de identidad y nunca recibe el control para decidir qué bloque jurídico sobrevive.

## 18. Document-level AI

FASE 6 no necesita llamadas adicionales al provider. El assembly y todas las validaciones propuestas son deterministas. No habrá `customGenerator`, `IssueProviderInvoker`, `runFastMode` ni adapter en los módulos nuevos.

La mejora editorial opcional, si se desea en el futuro, debe ser otra fase explícita. No podrá cambiar secciones, hechos, posturas, autoridades, evidence linkage, Coverage obligatorio o petitorios. FASE 6 no la implementa ni la deja como fallback implícito.

## 19. Trace

Se amplía aditivamente `GenerationTrace` con `documentAssembly?: DocumentAssemblyTraceMetadata` y `GenerationTraceContext` con `recordDocumentAssembly(result)`.

La traza debe permitir:

```text
FinalDocument/documentId
→ assemblyId
→ sectionId + sectionPath + order
→ blockId + textHash
→ issueDraftResultHash
→ generationTaskId
→ legalIssueIds
→ coverageItemIds
→ Coverage reconciliation reason
→ research requestId/researchHash/verifiedAuthorityIds cuando exista
```

No se duplican bundles completos. Se conservan IDs, hashes, statuses y reasons ligeros. Los párrafos existentes de `assemblyMetadata.paragraphs` siguen siendo válidos y se relacionan con el nuevo índice.

Un trace se considera roto si falta un block link, si un ID final no aparece en la salida, si el hash de texto no coincide o si una referencia de issue/Coverage/research no resuelve en el input autorizado.

## 20. Immutability

La función de assembly y validación son puras respecto de sus inputs.

Se comprobará por deep structural equality que no cambian:

- `RichCaseAnalysis`;
- `LegalIssueMatrix`;
- `CoverageMatrix` original;
- `LegalResearchBundle`;
- `IssueDraftResult`/outcomes disponibles;
- `ContentBlock` candidatos;
- `DocumentPlanResult` y sus `DocumentNode`;
- `GenerationTask`.

No se llama a `ensureCanonicalSections` sobre referencias de entrada. Las actualizaciones de status se escriben en `CoverageReconciliation`, no en la matriz original. Las copias de salida no comparten arrays mutables con las entradas.

## 21. Failure semantics

Cada finding tiene `code`, `severity`, `message`, `reason`, `blockIds`, `legalIssueIds`, `coverageItemIds` y `sectionIds`.

Ante inconsistencia material:

```text
finding + BLOCKER
→ assemblyStatus BLOCKED o validationStatus INVALID
→ readiness BLOCKED/INVALID
→ no silently fix
→ no elegir una versión
→ no provider para adivinar
```

Un fallo aislado de una issue no descarta las demás: sus bloques aceptados permanecen ensamblables, mientras la issue fallida aparece en `excludedDraftBlockIds`, findings y Coverage faltante si corresponde.

## 22. Compatibility

- El camino rich-first consume `LegalIssueMatrix.sourceMode === 'RICH'` y aplica el contrato completo.
- El camino `LEGACY_FALLBACK` no lanza por la ausencia de IDs rich; conserva el documento y sus bloques, aplica checks estructurales seguros y devuelve `REQUIRES_REVIEW` cuando no puede probar Coverage/trace rich. No se etiqueta como documentalmente completo por inferencia.
- Los tipos de documento no laborales, contestaciones, amparo post-sentencia, civil, mercantil y formal-only usan los contratos declarativos existentes; no reciben un proveedor especial.
- Headers, labels, firma, fecha y estructura formal siguen siendo deterministas. FASE 6 no genera texto.
- No se requiere DB, Prisma, Neon, servicio externo, navegador ni empaquetado Windows.
- DOCX/PDF leerán el resultado en una fase posterior; no se toca ningún renderer en FASE 6.

## 23. Test contracts

Se proponen **42 contratos permanentes**: los 37 contratos base ya definidos y cinco contratos añadidos por esta corrección para cerrar runtime safety, preservación pre-sanitizer, gating final e invariancia de completion order en integración.

### Assembly and determinism

1. El orden de secciones usa `DocumentPlan` y no el orden de entrada.
2. Cambiar el orden de completion del provider no cambia secciones, bloques ni fingerprint.
3. Bloques con texto igual de issues distintas no se deduplican.
4. Un placement sustantivo sin task/plan order produce finding bloqueante.
5. Una sección duplicada o con orden ambiguo no se fusiona silenciosamente.
6. La identidad determinista ignora `createdAt`, `generatedAt`, `retrievedAt` y provider completion order.

### Cross-block consistency and facts

7. Dos fechas incompatibles del mismo hecho producen contradicción material.
8. `ADMIT` frente a `DENY` del mismo hecho produce conflicto de postura.
9. Una postura aparece afirmada, negada y desconocida sin conflicto explícito: readiness bloqueado.
10. Un conflicto de fuente explícitamente marcado conserva ambos lados y queda en `REQUIRES_REVIEW`.
11. Una fecha, importe, identidad o expediente concreto no autorizado produce `NEW_FACT_DURING_ASSEMBLY`.
12. Una conclusión jurídica no se registra como hecho autorizado.

### Evidence and authority

13. `EvidenceMention` usada como oferta sin `EvidenceOffer` válida es inválida.
14. `EvidenceOffer` confirmada, enlazada al fact/claim/issue y en sección compatible es válida.
15. Evidence de otra issue sin enlace explícito bloquea el documento.
16. Una autoridad o citation nueva durante assembly es rechazada.
17. `SOURCE_CITED` no se presenta como `LEGALLY_VERIFIED`.
18. Una autoridad permitida pero vinculada a otra issue produce finding de alcance.

### Coverage and completeness

19. Un Coverage obligatorio faltante bloquea readiness.
20. Coverage aceptado se conserva después del assembly y aparece en reconciliación.
21. Fallback no satisface Coverage sustantivo.
22. Bloque `INVALID_*` no entra en `orderedBlocks` finales.
23. `VALID_NON_FINAL` no vuelve listo al documento.
24. Coverage duplicado se detecta sin borrar bloques.
25. Sección obligatoria ausente bloquea readiness.
26. Un petitorio incompatible con la defensa/relief soportado bloquea readiness.

### Trace, isolation and no-provider boundaries

27. La traza reconstruye FinalDocument→Section→Block→IssueDraftResult hash→Task→LegalIssue→Coverage.
28. La entrada completa permanece inmutable.
29. FASE 6 no importa ni invoca research adapters.
30. Assembly puramente determinista no llama provider final.
31. El fallo de una issue no corrompe bloques aceptados de otras issues.
32. El camino legacy no lanza y conserva su salida.
33. Un documento non-laboral sigue el contrato genérico sin markers de otra familia.
34. Un documento formal-only no llama provider.
35. La traza no copia el cuerpo completo de un research bundle.
36. Un trace con enlace/hashes rotos no permite readiness.
37. Un bloque manual se conserva y un conflicto manual queda explicitado como finding, nunca sobrescrito.

### Runtime and pipeline integration

38. Ningún módulo compartido nuevo de FASE 6 importa `node:crypto`, `crypto`, `node:fs`, `fs`, `node:path`, `path` ni otro builtin de Node; la identidad usa el helper browser/runtime-safe existente o un helper local equivalente sin dependencia nueva.
39. La integración focal captura antes del sanitizer dos bloques con el mismo texto y `legalIssueIds` distintos; ambos llegan a `DocumentAssemblyResult` y el sanitizer posterior con `dedupeBlocks: false` no elimina ninguno.
40. Un blocker material de FASE 6 produce `readiness !== READY`, `pipelineState.isComplete !== true` y no produce `READY_TO_EXPORT`.
41. Un resultado FASE 6 `INVALID` no produce completitud final del pipeline ni `READY_TO_EXPORT`.
42. Cuando el fixture de integración puede variar el orden de completion, permutarlo no cambia el resultado de assembly, bloques, orden ni fingerprints.

## 24. Acceptance criteria

FASE 6 podrá considerarse implementada solo si una prueba focal reproducible demuestra:

```text
accepted DraftBlocks
+ deterministic assembly
+ cross-block consistency PASS
+ evidence consistency PASS
+ authority consistency PASS
+ required Coverage complete
+ document QualityGate PASS
→ DocumentAssemblyReadiness.READY
```

Y además:

- cualquier finding `BLOCKER` impide `READY`;
- `READY` no ejecuta automáticamente la transición de lifecycle;
- un `BLOCKED` o `INVALID` de FASE 6 impide `pipelineState.isComplete === true` y no produce `READY_TO_EXPORT`;
- no se realizan llamadas provider/research durante assembly/validation;
- la salida es estable ante permutación de completion order;
- FASE 6 recibe la captura pre-sanitizer y el sanitizer posterior opera solo sobre la copia autorizada con deduplicación desactivada;
- los módulos compartidos nuevos de FASE 6 tienen cero imports de builtins de Node;
- las entradas de FASE 5B permanecen sin mutación;
- los caminos legacy, non-labor y formal-only no se rompen;
- el resultado queda listo para que una futura etapa de renderizado lo consuma sin volver a interpretar hechos, authorities o Coverage.

## 25. Riesgos reales y deuda no bloqueante

### Riesgos

1. `ContentBlock` actual no tiene un ledger estructurado completo de propositions. El detector será deliberadamente conservador: solo marcará hechos/stances concretos reconocibles y enviará lo ambiguo a revisión; no simulará comprensión semántica de un LLM.
2. `generateSection` actualmente oculta parte de los outcomes dentro del flujo de sección. La integración debe capturar únicamente metadata ya producida y no reescribir el executor de FASE 5B.
3. El sanitizer y `ensureCanonicalSections` tienen deduplicación/mutación histórica; la integración debe capturar antes del sanitizer y, después de FASE 6, operar solo sobre una copia autorizada con deduplicación desactivada.
4. El lifecycle actual distingue `READY_TO_EXPORT` de la decisión documental. El mapeo debe conservar la acción explícita del abogado.

### Deuda no bloqueante

1. Una futura evolución puede persistir un `DocumentProposition` estructurado en el resultado issue-scoped para reducir heurísticas deterministas.
2. La adaptación a DOCX/PDF requerirá mapear `DocumentAssemblySection` a estilos/render nodes en una fase posterior.
3. Un reporte visual de findings puede añadirse después; el contrato actual ya es suficiente para auditoría técnica.

**Resultado de este documento:** arquitectura FASE 6 especificada sin implementación de producción.
