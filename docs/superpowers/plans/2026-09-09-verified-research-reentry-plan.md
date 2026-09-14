# Verified Research Reentry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar bundles de investigación jurídica verificada con el único executor issue-scoped para habilitar únicamente la generación derivada de issues `NEEDS_RESEARCH`, sin mutar su estado canónico ni mezclar authorities de otras issues.

**Architecture:** Mantener `executeIssueScopedGeneration` como único executor. Añadir una resolución pura `resolveEffectiveIssueGenerationEligibility`, mapas readonly por `legalIssueId`, un `IssueContextPack.verifiedResearch` allowlisted y metadata aditiva en `IssueDraftResult`, `ContentBlock` y `GenerationTrace`. La rama canónica `READY_FOR_GENERATION` continuará sin bundle; la rama `NEEDS_RESEARCH` solo llegará al provider después de validar readiness, bundle, hash, régimen, authorities y blockers.

**Tech Stack:** TypeScript, Vitest, Next.js existente, `node:crypto` para hashing determinista, provider invocado por seam/mocks offline y los módulos actuales de FASE 4/5A.

**Spec:** `docs/superpowers/specs/2026-09-09-verified-research-reentry-design.md`

## Global Constraints

* Mantener un solo executor, una sola `LegalIssueMatrix` y una sola `CoverageMatrix`; no crear una ruta paralela de generación jurídica.
* `LegalIssue.status` permanece canónico; una issue `NEEDS_RESEARCH` solo obtiene `effectiveStatus` derivado.
* `researchBundlesByIssueId` y readiness se resuelven por `legalIssueId`, nunca por índice, texto, section ID o matter.
* Solo `VERIFIED_SUFFICIENT` con `READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH` desbloquea research reentry.
* `NEEDS_CLIENT_POSITION`, `BLOCKED_BY_CONFLICT`, `UNLINKED` y `UNKNOWN` tienen precedencia y producen cero llamadas al provider.
* Solo se serializan authorities `VERIFIED`, oficiales, same-issue, compatibles en régimen, temporalidad y jurisdicción.
* `authorityMentionIds` y `verifiedAuthorityIds` son relaciones distintas; `SOURCE_CITED` nunca se vuelve verificada por asociación.
* La generación recibe bundles ya producidos; no llama `adapter.search()`, `runLegalResearch()` ni ningún adapter de investigación.
* No se implementan adapters reales, web, SCJN, Cámara, DOF, estado real, RAG, embeddings, vector DB, DB, Prisma, Neon, UI, DOCX, packaging Windows ni aprobación humana.
* Provider real NVIDIA no se usa; las pruebas usan provider inyectado/mock.
* No se ejecuta `npm test`; la validación futura usa únicamente suites focales, regresiones relacionadas, `npm run typecheck`, `npm run lint` y `npm run build`.
* No se limpian warnings. Registrar únicamente `TECH_DEBT_LINT_DELTA_PHASE5A` por el cambio 1030 → 1036.
* Los tests principales son offline y cada Task sigue `RED → implementación mínima → GREEN → typecheck focal`.

---

## Mapa de archivos

### Archivos nuevos

* `tests/legal-engine/legalResearchReentryFixtures.ts`: factories offline inmutables para issues normales/research, bundles suficientes/insuficientes, authorities compatibles/incompatibles, tasks, documentos y respuestas estructuradas.
* `tests/legal-engine/legalResearchReentryGeneration.test.ts`: suite focal de los 50 contratos de FASE 5B, distribuida por describe y apoyada en las factories.
* `docs/superpowers/plans/2026-09-09-verified-research-reentry-plan.md`: este plan.

### Archivos modificados

* `lib/legal-engine/types.ts`: metadata opcional de research en `ContentBlock`.
* `lib/legal-engine/issueScopedGeneration.ts`: tipos de artefactos readonly, resolver efectiva, proyección scoped, hash V2, prompt, validación de entrada al provider y propagación a outcomes.
* `lib/legal-engine/issueDraftResult.ts`: IDs/hash de research y guardas post-provider.
* `lib/legal-engine/semanticEvaluator.ts`: uso de proposiciones/limitaciones verificadas dentro de la disciplina semántica de authorities, sin convertirlas en facts.
* `lib/legal-engine/generationTrace.ts`: referencias ligeras de request, hash, readiness, reason e IDs verificados.
* `lib/legal-engine/pipeline.ts`: entrada readonly, filtro previo y paso de artefactos a la misma ruta issue-scoped.
* `lib/legal-engine/coveragePolicy.ts`: no requiere cambio semántico; solo se tocará si el tipo de prueba exige una extensión aditiva, sin permitir que research por sí solo cubra.
* Tests existentes directamente relacionados: `tests/legal-engine/issueScopedGeneration.test.ts`, `tests/legal-engine/legalResearchReentryTypes.test.ts`, `tests/legal-engine/legalResearchReadiness.test.ts`, `tests/legal-engine/legalResearchPipeline.test.ts`, `tests/legal-engine/legalResearchBundle.test.ts`, `tests/legal-engine/richCoveragePolicy.test.ts` y `tests/legal-engine/generationTraceContext.test.ts`.

## Interfaces congeladas para la implementación

El plan usa estos nombres y formas. Si el código actual exige una variante sintáctica, debe conservar exactamente la semántica y los campos públicos.

```ts
export interface IssueResearchExecutionInputs {
  researchBundlesByIssueId?: ReadonlyMap<string, LegalResearchBundle>;
  derivedReadinessByIssueId?: ReadonlyMap<string, DerivedIssueReadiness>;
}

export interface EffectiveIssueGenerationEligibility extends IssueEligibility {
  canonicalStatus: LegalIssueStatus;
  effectiveStatus:
    | 'READY_FOR_GENERATION'
    | 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH'
    | 'BLOCKED';
  requestId?: string;
  researchHash?: string;
  verifiedAuthorityIds: string[];
  verifiedResearch?: VerifiedResearchContext;
}

export interface IssueExecutorOptions extends IssueResearchExecutionInputs {
  invokeProvider?: IssueProviderInvoker;
  maxConcurrency?: number;
  trace?: import('./generationTrace').GenerationTraceContext;
}
```

`resolveEffectiveIssueGenerationEligibility` recibe `{ issue, derivedReadiness, researchBundle, formal, taskType }`. `buildIssueContextPack` mantiene sus cuatro argumentos actuales y acepta un quinto objeto opcional `{ verifiedResearch?: VerifiedResearchContext }`, para no romper consumidores existentes.

---

### Task 1: Additive research metadata and offline fixtures

**Files:**
- Create: `tests/legal-engine/legalResearchReentryFixtures.ts`
- Create: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `lib/legal-engine/types.ts:228-270`
- Modify: `lib/legal-engine/issueDraftResult.ts:14-75,275-305`

**Interfaces:**
- Consumes: `LegalIssueItem`, `LegalResearchBundle`, `DerivedIssueReadiness`, `VerifiedAuthority`, `IssueDraftResult`, `ContentBlock` y `draftBlockFromIssueResult` actuales.
- Produces: `ContentBlock.verifiedAuthorityIds?: string[]`, `ContentBlock.researchHash?: string`, `IssueDraftResult.verifiedAuthorityIds?: string[]` e `IssueDraftResult.researchHash?: string`; factories `issueFixture`, `bundleFixture`, `readinessFixture`, `generationTaskFixture`, `draftResultFixture` y `providerResponseFixture` para Tasks posteriores.

- [ ] **Step 1: Write the failing test**

Crear el caso base con datos concretos y probar que los metadatos son parte del contrato de resultado y block:

```ts
it('preserves verified research metadata from result into DraftBlock', () => {
  const result = draftResultFixture({
    verifiedAuthorityIds: ['verified-authority-1'],
    researchHash: 'research-hash-1',
  });
  const block = draftBlockFromIssueResult(
    result,
    generationTaskFixture('issue-research-1'),
    passEvaluation('blk-generation-task-1'),
  );

  expect(block.verifiedAuthorityIds).toEqual(['verified-authority-1']);
  expect(block.researchHash).toBe('research-hash-1');
  expect(block.authorityIds).toEqual(['source-authority-1']);
});
```

Las factories deben devolver nuevos objetos por llamada y usar únicamente IDs `issue-research-1`, `source-authority-1`, `verified-authority-1`, `coverage-research-1`, `request-research-1` y `research-hash-1`. La authority fixture será oficial, `VERIFIED`, `CURRENT_AND_APPLICABLE`, `APPLICABLE`, con proposición directa y limitaciones explícitas.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts -t "preserves verified research metadata"`

Expected: FAIL de TypeScript porque `verifiedAuthorityIds` y `researchHash` aún no existen en `IssueDraftResult`/`ContentBlock` ni se proyectan al block.

- [ ] **Step 3: Write minimal implementation**

Añadir los campos opcionales junto a `authorityIds` y `authorityMentionIds`, sin modificar los campos existentes:

```ts
// ContentBlock
verifiedAuthorityIds?: string[];
researchHash?: string;

// IssueDraftResult
verifiedAuthorityIds?: string[];
researchHash?: string;
```

En `draftBlockFromIssueResult`, copiar arrays con `[...]` y copiar el hash sin recalcularlo ni derivarlo de `authorityMentionIds`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts -t "preserves verified research metadata"`

Expected: PASS.

- [ ] **Step 5: Run focused typecheck**

Run: `npm run typecheck`

Expected: PASS; no cambios en la semántica legacy.

---

### Task 2: Canonical effective eligibility resolver

**Files:**
- Modify: `lib/legal-engine/issueScopedGeneration.ts:25-95`
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `tests/legal-engine/issueScopedGeneration.test.ts:384-410`

**Interfaces:**
- Consumes: `LegalIssueItem`, `DerivedIssueReadiness`, `LegalResearchBundle`, `IssueResearchExecutionInputs`, blockers de `resolveIssueEligibility` y `isFormalIssueTask`.
- Produces: `resolveEffectiveIssueGenerationEligibility(input): EffectiveIssueGenerationEligibility`; `resolveIssueEligibility` queda como wrapper compatible y no como segunda política. La rama interna usa `resolveResearchEligibility({ issue, derivedReadiness, researchBundle, formal, taskType })` como helper privado de la misma política.

- [ ] **Step 1: Write the failing tests**

Cubrir rama normal, rama research y razones estables:

```ts
it('keeps canonical READY eligible without a research bundle', () => {
  const result = resolveEffectiveIssueGenerationEligibility({
    issue: issueFixture({ status: 'READY_FOR_GENERATION', researchStatus: 'NOT_REQUIRED' }),
    formal: false,
    taskType: 'ISSUE',
  });

  expect(result).toMatchObject({
    eligible: true,
    effectiveStatus: 'READY_FOR_GENERATION',
    reason: 'READY_CANONICAL',
  });
});

it('unlocks NEEDS_RESEARCH only with matching sufficient bundle and readiness', () => {
  const issue = issueFixture({ status: 'NEEDS_RESEARCH', researchStatus: 'NEEDS_RESEARCH' });
  const bundle = bundleFixture(issue.id);
  const readiness = readinessFixture(issue.id, bundle.researchHash);
  const result = resolveEffectiveIssueGenerationEligibility({
    issue,
    derivedReadiness: readiness,
    researchBundle: bundle,
    formal: false,
    taskType: 'ISSUE',
  });

  expect(result.eligible).toBe(true);
  expect(result.effectiveStatus).toBe('READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH');
  expect(result.reason).toBe('READY_WITH_VERIFIED_RESEARCH');
  expect(issue.status).toBe('NEEDS_RESEARCH');
});
```

Añadir casos para `RELATION_NOT_EXPLICIT`, formal, `LEGAL_RESEARCH`, status no soportado y missing issue.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "READY_CANONICAL|READY_WITH_VERIFIED_RESEARCH|RELATION_NOT_EXPLICIT"`

Expected: FAIL porque el resolver no existe y la ruta actual rechaza `NEEDS_RESEARCH`.

- [ ] **Step 3: Write minimal implementation**

Implementar la precedencia en este orden:

```ts
if (!issue) return blocked('ISSUE_NOT_RESOLVED');
if (issue.relationStatus !== 'EXPLICIT') return blocked('RELATION_NOT_EXPLICIT');
if (formal) return blocked('FORMAL_DETERMINISTIC_TASK');
if (taskType === 'LEGAL_RESEARCH') return blocked('LEGAL_RESEARCH_PLAN_ONLY');
if (hasCanonicalBlocker(issue)) return blocked(canonicalBlockerReason(issue));

if (issue.status === 'READY_FOR_GENERATION') {
  return ready('READY_CANONICAL');
}

if (issue.status !== 'NEEDS_RESEARCH') return blocked(`ISSUE_STATUS_${issue.status}`);
// La rama research completa se valida con los predicados de Task 3.
return resolveResearchEligibility({ issue, derivedReadiness, researchBundle, formal, taskType });
```

La salida bloqueada incluirá `canonicalStatus`, `effectiveStatus: 'BLOCKED'`, `verifiedAuthorityIds: []` y el reason code. No escribir en `issue`, `matrix` ni bundle. La rama `NEEDS_RESEARCH` sin artefactos debe devolver `RESEARCH_BUNDLE_MISSING` y no `READY_FOR_GENERATION`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "READY_CANONICAL|READY_WITH_VERIFIED_RESEARCH|RELATION_NOT_EXPLICIT|formal|LEGAL_RESEARCH"`

Expected: PASS; los tests FASE 4 de eligibility conservan sus razones/resultado.

---

### Task 3: Validate and project a consumable research bundle

**Files:**
- Modify: `lib/legal-engine/issueScopedGeneration.ts:111-145`
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `tests/legal-engine/legalResearchReentryTypes.test.ts`

**Interfaces:**
- Consumes: `LegalResearchBundle`, `VerifiedAuthority`, `LegalRegimeResolution`, issue ID y readiness.
- Produces: `VerifiedResearchContext` con `requestId`, `researchHash` y `ScopedVerifiedAuthority[]`; helper pura `buildVerifiedResearchContext(bundle, legalIssueId)`; razones fail-closed consumibles por Task 2.

Definir el allowlist de salida sin exponer timestamps o corpus:

```ts
export type ScopedVerifiedAuthority = Pick<
  VerifiedAuthority,
  'id' | 'identity' | 'temporalValidity' | 'jurisdictionValidity' | 'proposition'
> & {
  source: Pick<VerifiedAuthority['source'],
    'sourceUrl' | 'sourceDomain' | 'sourceTier' | 'locator' | 'sourceHash'>;
};

export interface VerifiedResearchContext {
  legalIssueId: string;
  requestId: string;
  researchHash: string;
  authorities: ScopedVerifiedAuthority[];
}
```

- [ ] **Step 1: Write the failing tests**

Cubrir filtrado y ausencia de leakage:

```ts
it('projects only consumable same-issue authorities', () => {
  const bundle = bundleFixture('issue-research-1', {
    verifiedAuthorities: [
      verifiedAuthorityFixture('verified-authority-1', 'issue-research-1'),
      verifiedAuthorityFixture('wrong-jurisdiction', 'issue-research-1', { jurisdictionStatus: 'WRONG_JURISDICTION' }),
      verifiedAuthorityFixture('other-issue-authority', 'issue-other'),
    ],
  });

  const context = buildVerifiedResearchContext(bundle, 'issue-research-1');

  expect(context.authorities.map((authority) => authority.id)).toEqual(['verified-authority-1']);
  expect(context).not.toHaveProperty('rejectedCandidates');
  expect(context).not.toHaveProperty('corpus');
});

it('rejects every non-consumable temporal status', () => {
  for (const status of ['CURRENT_BUT_TEMPORAL_REVIEW_REQUIRED', 'REPEALED', 'SUPERSEDED', 'UNKNOWN_EFFECTIVE_DATE'] as const) {
    const context = buildVerifiedResearchContext(
      bundleFixture('issue-research-1', { verifiedAuthorities: [verifiedAuthorityFixture(`authority-${status}`, 'issue-research-1', { temporalStatus: status })] }),
      'issue-research-1',
    );
    expect(context.authorities).toEqual([]);
  }
});
```

También probar `REQUIRES_HUMAN_REVIEW`, régimen no resuelto, bundle mismatch, `REVIEW_REQUIRED`, `UNKNOWN`, `WRONG_JURISDICTION`, authority no verificada y `supportsLegalIssueIds` sin la issue.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/legalResearchReentryTypes.test.ts -t "consumable|non-consumable|same-issue"`

Expected: FAIL porque el helper actual no incluye `requestId` y no filtra todos los estados de temporalidad/jurisdicción.

- [ ] **Step 3: Write minimal implementation**

Usar predicados explícitos y copias profundas de los arrays necesarios:

```ts
const temporalAllowed = new Set(['CURRENT_AND_APPLICABLE', 'HISTORICALLY_APPLICABLE']);
const jurisdictionAllowed = new Set(['APPLICABLE']);

const authorities = bundle.legalIssueId === legalIssueId
  && bundle.researchStatus === 'VERIFIED_SUFFICIENT'
  && bundle.regimeResolution.status === 'RESOLVED'
  ? bundle.verifiedAuthorities
      .filter((authority) => authority.verificationStatus === 'VERIFIED')
      .filter((authority) => authority.supportsLegalIssueIds.includes(legalIssueId))
      .filter((authority) => authority.source.sourceTier === 'OFFICIAL_PRIMARY')
      .filter((authority) => temporalAllowed.has(authority.temporalValidity.status))
      .filter((authority) => jurisdictionAllowed.has(authority.jurisdictionValidity.status))
      .map(cloneScopedVerifiedAuthority)
  : [];
```

La función no convierte un contexto vacío en elegible. Task 2 comparará `bundle.legalIssueId`, `bundle.requestId`, `bundle.researchHash`, `derivedReadiness.legalIssueId` y `derivedReadiness.researchBundleHash`, y exigirá al menos una authority proyectada.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/legalResearchReentryTypes.test.ts -t "consumable|non-consumable|same-issue"`

Expected: PASS con rejected candidates, secundarios y authorities incompatibles ausentes del contexto.

---

### Task 4: Readonly research maps and additive IssueContextPack wiring

**Files:**
- Modify: `lib/legal-engine/issueScopedGeneration.ts:100-145,219-282,342-346`
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `tests/legal-engine/legalResearchReentryTypes.test.ts`

**Interfaces:**
- Consumes: `VerifiedResearchContext` de Task 3 y tasks issue-scoped.
- Produces: `IssueResearchExecutionInputs`, campos opcionales de `IssueExecutorOptions`, y `buildIssueContextPack(task, doc, caseAnalysis, matrix, { verifiedResearch })` sin serializar el bundle completo.

- [ ] **Step 1: Write the failing tests**

Probar mapa por ID y separación de source authority:

```ts
it('uses only the bundle selected by legalIssueId', () => {
  const issue = issueFixture({ id: 'issue-research-1', status: 'NEEDS_RESEARCH' });
  const pack = buildPackWithResearch(issue, {
    verifiedResearch: contextFixture('issue-research-1'),
  });
  const serialized = JSON.stringify(pack);

  expect(pack.verifiedResearch?.requestId).toBe('request-research-1');
  expect(pack.verifiedResearch?.authorities.map((item) => item.id)).toEqual(['verified-authority-1']);
  expect(pack.authorities.map((item) => item.id)).toEqual(['source-authority-1']);
  expect(serialized).not.toContain('rejectedCandidates');
  expect(serialized).not.toContain('other-issue-authority');
});
```

Agregar un caso con `researchBundlesByIssueId.set('issue-other', bundleFixture('issue-other'))` y comprobar que la issue actual no lo consume.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/legalResearchReentryTypes.test.ts -t "selected by legalIssueId|source authority"`

Expected: FAIL de tipos/serialización porque `VerifiedResearchContext` actual no tiene la forma aprobada y el pack no recibe una entrada scoped.

- [ ] **Step 3: Write minimal implementation**

Añadir los mapas como referencias readonly; no copiar bundles dentro de `LegalIssueMatrix`:

```ts
export interface IssueResearchExecutionInputs {
  researchBundlesByIssueId?: ReadonlyMap<string, LegalResearchBundle>;
  derivedReadinessByIssueId?: ReadonlyMap<string, DerivedIssueReadiness>;
}

export interface IssueExecutorOptions extends IssueResearchExecutionInputs {
  invokeProvider?: IssueProviderInvoker;
  maxConcurrency?: number;
  trace?: import('./generationTrace').GenerationTraceContext;
}
```

Extender `IssueContextPack` con `verifiedResearch?: VerifiedResearchContext`. `buildIssueContextPack` solo acepta el contexto ya proyectado y mantiene `authorities` como source mentions. No añadir bundle, candidates, rejections o corpus al pack.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/legalResearchReentryTypes.test.ts -t "selected by legalIssueId|source authority"`

Expected: PASS y todos los tests FASE 4 de allowlist conservan sus campos actuales.

---

### Task 5: Deterministic contextHash V2

**Files:**
- Modify: `lib/legal-engine/issueScopedGeneration.ts:177-183,260-282`
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `tests/legal-engine/issueScopedGeneration.test.ts:442-507`

**Interfaces:**
- Consumes: `IssueContextPack` con research opcional de Task 4 y el helper de hash estable actual.
- Produces: serialización versionada de contexto; mismo contexto + research semánticamente equivalente produce el mismo hash y hash de research distinto produce hash distinto.

- [ ] **Step 1: Write the failing tests**

```ts
it('changes contextHash when only researchHash changes', () => {
  const first = buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), {
    verifiedResearch: contextFixture('issue-research-1', { researchHash: 'research-hash-1' }),
  });
  const second = buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), {
    verifiedResearch: contextFixture('issue-research-1', { researchHash: 'research-hash-2' }),
  });

  expect(first.contextHash).not.toBe(second.contextHash);
});

it('keeps contextHash stable when equivalent research arrays are reordered', () => {
  const first = buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), {
    verifiedResearch: contextFixture('issue-research-1', { authorityOrder: ['verified-authority-1', 'verified-authority-2'] }),
  });
  const second = buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), {
    verifiedResearch: contextFixture('issue-research-1', { authorityOrder: ['verified-authority-2', 'verified-authority-1'] }),
  });

  expect(first.contextHash).toBe(second.contextHash);
});
```

Probar que cambiar `retrievedAt`, `checkedAt` o `generatedAt` fuera del contexto consumible no cambia el hash.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "contextHash|context hash"`

Expected: FAIL porque el hash actual no incorpora research y depende del orden de authorities proyectadas.

- [ ] **Step 3: Write minimal implementation**

Añadir versión de serialización y canonicalización explícita:

```ts
const ISSUE_CONTEXT_SERIALIZATION_VERSION = 'ISSUE_CONTEXT_V2';

const hashInput = {
  serializationVersion: ISSUE_CONTEXT_SERIALIZATION_VERSION,
  issueContext: packWithoutHash,
  verifiedResearch: packWithoutHash.verifiedResearch
    ? {
        requestId: packWithoutHash.verifiedResearch.requestId,
        researchHash: packWithoutHash.verifiedResearch.researchHash,
        authorities: [...packWithoutHash.verifiedResearch.authorities]
          .sort((left, right) => left.id.localeCompare(right.id)),
      }
    : undefined,
};
return { ...packWithoutHash, contextHash: contextHash(hashInput) };
```

No incluir `retrievedAt`, `checkedAt` o `generatedAt`; mantener el orden semántico de facts/evidence y ordenar solo colecciones que representan conjunto, incluidos IDs de authorities.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "contextHash|context hash"`

Expected: PASS y sin regresión en el contrato de contexto allowlisted.

---

### Task 6: Verified-authority prompt serialization

**Files:**
- Modify: `lib/legal-engine/issueScopedGeneration.ts:284-332`
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `tests/legal-engine/issueScopedGeneration.test.ts:507-516`

**Interfaces:**
- Consumes: `IssueContextPack.verifiedResearch` y facts/evidence/source mentions ya scoped.
- Produces: prompt versionado con sección `VERIFIED AUTHORITIES AVAILABLE`, proposición, support level, temporalidad, jurisdicción, limitaciones, locator y binding character cuando esté disponible.

- [ ] **Step 1: Write the failing tests**

```ts
it('serializes verified authorities and their limits without research corpus', () => {
  const prompt = buildIssuePrompt(
    buildPackWithResearch(issueFixture({ id: 'issue-research-1' }), { verifiedResearch: contextFixture('issue-research-1') }),
    generationTaskFixture('issue-research-1'),
  );

  expect(prompt.systemPrompt).toContain('VERIFIED AUTHORITIES AVAILABLE');
  expect(prompt.userMessage).toContain('El requisito debe acreditarse');
  expect(prompt.userMessage).toContain('CURRENT_AND_APPLICABLE');
  expect(prompt.userMessage).toContain('APPLICABLE');
  expect(prompt.userMessage).toContain('limitations');
  expect(prompt.userMessage).not.toContain('rejectedCandidates');
  expect(prompt.userMessage).not.toContain('AuthorityCandidate');
});
```

Añadir assertions de que la instrucción exige `verified proposition + allowed facts/evidence`, prohíbe inventar obligatoriedad y conserva `SOURCE_CITED` como no verificado.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "verified authorities|prompt"`

Expected: FAIL porque el prompt actual no tiene la sección ni las reglas de límites.

- [ ] **Step 3: Write minimal implementation**

Agregar al `systemPrompt` instrucciones explícitas:

```ts
'Las VERIFIED AUTHORITIES AVAILABLE son las únicas autoridades verificadas utilizables.',
'Usa cada proposición únicamente con facts/evidence allowlisted del expediente.',
'Conserva temporalidad, jurisdicción, supportLevel y limitations.',
'No inventes autoridades ni afirmes obligatoriedad si bindingCharacter no la respalda.',
```

Mantener `issueContext.authorities` separado de `issueContext.verifiedResearch.authorities`. Añadir `verifiedAuthorityIds` y `researchHash` como properties opcionales del `outputSchema`, sin hacerlos obligatorios para la rama normal.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "verified authorities|prompt"`

Expected: PASS; el prompt sigue sin contener candidates, rejections, secundarios, errores ni corpus.

---

### Task 7: IssueDraftResult research validation

**Files:**
- Modify: `lib/legal-engine/issueDraftResult.ts:45-250`
- Modify: `lib/legal-engine/issueScopedGeneration.ts:730-738`
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `tests/legal-engine/issueScopedGeneration.test.ts:285-380,517-580`

**Interfaces:**
- Consumes: allowlists de source/verified authorities, `expectedResearchHash`, contexto V2 y flag `researchUnlocked`.
- Produces: `IssueDraftValidationInput` con `allowedVerifiedAuthorityIds?: string[]`, `expectedResearchHash?: string`, `researchUnlocked?: boolean`; errores fatales para IDs/hash inválidos.

- [ ] **Step 1: Write the failing tests**

```ts
it('rejects an unknown verified authority ID', () => {
  const validation = validateIssueDraftResult(
    draftResultFixture({ verifiedAuthorityIds: ['invented-verified-authority'] }),
    validationInputFixture({
      allowedVerifiedAuthorityIds: ['verified-authority-1'],
      expectedResearchHash: 'research-hash-1',
      researchUnlocked: true,
    }),
  );

  expect(validation.status).toBe('INVALID_FATAL');
  expect(validation.errors).toContain('VERIFIED_AUTHORITY_ID_OUT_OF_SCOPE');
});

it('requires the current researchHash for a research-unlocked result', () => {
  const validation = validateIssueDraftResult(
    draftResultFixture({ researchHash: 'old-research-hash' }),
    validationInputFixture({ expectedResearchHash: 'research-hash-1', researchUnlocked: true }),
  );

  expect(validation.errors).toContain('RESEARCH_HASH_MISMATCH');
});
```

Probar que `authorityMentionIds: ['source-authority-1']` sigue válido independientemente de `verifiedAuthorityIds`, y que la ruta normal acepta ausencia de research metadata.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "verified authority ID|researchHash|authorityMentionIds"`

Expected: FAIL porque el validator actual solo conoce `allowedAuthorityMentionIds`.

- [ ] **Step 3: Write minimal implementation**

Añadir validación condicional sin cambiar `authorityMentionIds`:

```ts
if (raw.verifiedAuthorityIds !== undefined && !asStringArray(raw.verifiedAuthorityIds)) {
  addUnique(errors, 'VERIFIED_AUTHORITY_IDS_INVALID');
}
if (asStringArray(raw.verifiedAuthorityIds)
  && outOfScopeIds(raw.verifiedAuthorityIds, input.allowedVerifiedAuthorityIds || [])) {
  addUnique(errors, 'VERIFIED_AUTHORITY_ID_OUT_OF_SCOPE');
}
if (input.researchUnlocked && raw.researchHash !== input.expectedResearchHash) {
  addUnique(errors, 'RESEARCH_HASH_MISMATCH');
}
```

Copiar los arrays y hash al resultado validado. En la rama normal, conservar los campos como opcionales. El `request` de `executeIssueScopedGeneration` pasará el allowlist derivado del pack, no del bundle completo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "verified authority ID|researchHash|authorityMentionIds"`

Expected: PASS y regresión FASE 4 intacta.

---

### Task 8: Propagate result metadata into DraftBlock

**Files:**
- Modify: `lib/legal-engine/issueDraftResult.ts:275-305`
- Modify: `lib/legal-engine/types.ts:244-270`
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `tests/legal-engine/issueScopedGeneration.test.ts:864-894`

**Interfaces:**
- Consumes: `IssueDraftResult` validado de Task 7.
- Produces: `ContentBlock` con `verifiedAuthorityIds`, `researchHash`, `authorityIds` legacy, legal issue/Coverage/facts/evidence/task/provider/model/evaluation.

- [ ] **Step 1: Write the failing test**

```ts
it('keeps source and verified authority relations distinct in the block', () => {
  const result = draftResultFixture({
    authorityMentionIds: ['source-authority-1'],
    verifiedAuthorityIds: ['verified-authority-1'],
    researchHash: 'research-hash-1',
  });
  const block = draftBlockFromIssueResult(result, generationTaskFixture('issue-research-1'), passEvaluation('blk-generation-task-1'));

  expect(block.authorityIds).toEqual(['source-authority-1']);
  expect(block.verifiedAuthorityIds).toEqual(['verified-authority-1']);
  expect(block.researchHash).toBe('research-hash-1');
  expect(block.legalIssueIds).toEqual(['issue-research-1']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts -t "source and verified authority relations"`

Expected: FAIL si la proyección aún pierde los nuevos campos.

- [ ] **Step 3: Write minimal implementation**

En `draftBlockFromIssueResult`, añadir exactamente:

```ts
verifiedAuthorityIds: result.verifiedAuthorityIds ? [...result.verifiedAuthorityIds] : undefined,
researchHash: result.researchHash,
```

No escribir `verifiedAuthorityIds` en `authorityIds`; mantener `authorityIds: [...result.authorityMentionIds]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts -t "source and verified authority relations"`

Expected: PASS.

---

### Task 9: Provider eligibility and zero-call fail-closed boundary

**Files:**
- Modify: `lib/legal-engine/issueScopedGeneration.ts:547-735`
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `tests/legal-engine/issueScopedGeneration.test.ts:771-864`

**Interfaces:**
- Consumes: resolver de Task 2, context projector de Task 3, maps/pack de Task 4, hash/prompt de Tasks 5–6 y validator de Task 7.
- Produces: `executeIssueScopedGeneration` y `executeReadyIssueTasks` capaces de recibir `IssueExecutorOptions.researchBundlesByIssueId`/`derivedReadinessByIssueId` sin iniciar research.

- [ ] **Step 1: Write the failing tests**

```ts
it('calls the final provider for a research-unlocked issue', async () => {
  const provider = vi.fn().mockResolvedValue(providerResponseFixture({ researchHash: 'research-hash-1' }));
  const issue = issueFixture({ id: 'issue-research-1', status: 'NEEDS_RESEARCH' });
  const doc = documentFixture([issue]);

  const outcome = await executeIssueScopedGeneration(generationTaskFixture(issue.id), doc, richAnalysisFixture(), {
    invokeProvider: provider,
    researchBundlesByIssueId: new Map([[issue.id, bundleFixture(issue.id)]]),
    derivedReadinessByIssueId: new Map([[issue.id, readinessFixture(issue.id, 'research-hash-1')]]),
  });

  expect(provider).toHaveBeenCalledTimes(1);
  expect(outcome.legalIssueId).toBe(issue.id);
});

it.each(['RESEARCH_BUNDLE_MISSING', 'RESEARCH_HASH_MISMATCH', 'RESEARCH_ISSUE_MISMATCH', 'RESEARCH_NOT_SUFFICIENT'])
  ('makes %s produce zero provider calls', async (reason) => {
    const provider = vi.fn();
    const outcome = await executeWithResearchReason(reason, provider);
    expect(provider).not.toHaveBeenCalled();
    expect(outcome.status).toBe('BLOCKED');
  });
```

Añadir casos de `NEEDS_CLIENT_POSITION`, conflicto, `UNLINKED`, `UNKNOWN`, `REQUIRES_HUMAN_REVIEW` y formal con bundle suficiente; todos deben producir cero calls.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "research-unlocked|zero provider|provider calls"`

Expected: FAIL porque el executor aplica únicamente `issue.status === 'READY_FOR_GENERATION'`.

- [ ] **Step 3: Write minimal implementation**

En `executeIssueScopedGeneration`, obtener el bundle/readiness por ID y resolver antes de construir el pack o seleccionar provider:

```ts
const issue = matrix?.issues.find((candidate) => candidate.id === issueIdOf(task));
const effectiveEligibility = resolveEffectiveIssueGenerationEligibility({
  issue,
  derivedReadiness: issue ? options.derivedReadinessByIssueId?.get(issue.id) : undefined,
  researchBundle: issue ? options.researchBundlesByIssueId?.get(issue.id) : undefined,
  formal: section ? isFormalIssueTask(task, section) : false,
  taskType: taskTypeOf(task),
});
if (!effectiveEligibility.eligible) {
  return traceOutcome(localIssueOutcome(task, effectiveEligibility.reason, 'BLOCKED'));
}

const pack = buildIssueContextPack(task, { ...doc, coverageMatrix }, caseAnalysis, matrix!, {
  verifiedResearch: effectiveEligibility.verifiedResearch,
});
```

Pasar a validator `allowedVerifiedAuthorityIds`, `expectedResearchHash` y `researchUnlocked` desde la decisión efectiva. No llamar `runLegalResearch`, `search`, `retrieve` ni otro adapter. Mantener retry y concurrencia existentes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "research-unlocked|zero provider|provider calls"`

Expected: PASS; cualquier invalidación ocurre antes del primer provider call.

---

### Task 10: Authority citation and proposition discipline

**Files:**
- Modify: `lib/legal-engine/issueDraftResult.ts:110-250`
- Modify: `lib/legal-engine/semanticEvaluator.ts` en la función `evaluateIssueDraftResult`
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `tests/legal-engine/issueScopedGeneration.test.ts:613-660`

**Interfaces:**
- Consumes: texto del result, `authorityMentionIds`, aliases de `SourceAuthorityMention`, `verifiedResearch.authorities`, proposiciones y limitaciones.
- Produces: guard determinista de citas explícitas y disciplina semántica que no permite authority inventada ni convertir una proposición en un fact no allowlisted.

- [ ] **Step 1: Write the failing tests**

```ts
it('fails when provider cites an authority absent from both allowlists', async () => {
  const outcome = await executeWithProviderText(
    'Conforme al artículo 999 del Código inventado, el requisito está cumplido.',
  );

  expect(outcome.status).toBe('FAILED');
  expect(outcome.validation?.errors).toContain('AUTHORITY_CITATION_OUT_OF_SCOPE');
});

it('requires the verified ID when provider uses its canonical citation', async () => {
  const outcome = await executeWithProviderResult({
    ...draftResultFixture({ verifiedAuthorityIds: [] }),
    legalDevelopment: ['ARTICULO FEDERAL FIXTURE 14 exige acreditar el requisito.'],
  });

  expect(outcome.status).toBe('FAILED');
  expect(outcome.validation?.errors).toContain('VERIFIED_AUTHORITY_ID_MISSING');
});

it('does not treat a verified proposition as an unprovided fact', async () => {
  const outcome = await executeWithProviderResult({
    ...draftResultFixture({ verifiedAuthorityIds: ['verified-authority-1'] }),
    legalDevelopment: ['La autoridad establece el requisito de acreditar A y B.'],
    application: 'La parte actora acreditó A y B en el expediente.',
  });

  expect(outcome.status).toBe('FAILED');
  expect(outcome.evaluation?.hardFailReasons).toContain('VERIFIED_PROPOSITION_OVERCLAIM');
});
```

El extractor debe reconocer citas explícitas con identidad canónica/alias permitido y patrones jurídicos numerados, no tratar una palabra genérica como citation suficiente. Las referencias no identificables quedan sujetas a evaluación semántica.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "cites an authority|canonical citation|verified proposition"`

Expected: FAIL porque actualmente se validan IDs JSON, pero no citas nuevas en texto ni el vínculo proposition/fact.

- [ ] **Step 3: Write minimal implementation**

Añadir una función pura en `issueDraftResult.ts`:

```ts
function validateAuthorityCitations(
  raw: Record<string, unknown>,
  input: IssueDraftValidationInput,
  sourceAliases: ReadonlyMap<string, string>,
  verifiedAliases: ReadonlyMap<string, string>,
): string[] {
  const text = ['thesis', 'factualDevelopment', 'evidentiaryDevelopment', 'legalDevelopment', 'counterPosition', 'application', 'conclusion']
    .flatMap((key) => typeof raw[key] === 'string' ? [raw[key]] : Array.isArray(raw[key]) ? raw[key].filter((item): item is string => typeof item === 'string') : [])
    .join('\n');
  // Resolver aliases allowlisted; detectar además citas numeradas explícitas no resolubles.
  // Un alias verificado presente exige su ID en raw.verifiedAuthorityIds.
  return authorityCitationErrors(text, sourceAliases, verifiedAliases, raw.verifiedAuthorityIds);
}
```

La función `authorityCitationErrors` debe devolver `AUTHORITY_CITATION_OUT_OF_SCOPE` para una cita explícita no resoluble y `VERIFIED_AUTHORITY_ID_MISSING` cuando la identidad verificada aparece sin su ID. En `semanticEvaluator.ts`, pasar las proposiciones/limitaciones verificadas al cálculo existente de `authorityDiscipline` y añadir el hard fail `VERIFIED_PROPOSITION_OVERCLAIM` únicamente cuando el fixture demuestra que se afirma un fact no presente como `FactItem`; no crear Facts desde research.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "cites an authority|canonical citation|verified proposition"`

Expected: PASS y los tests FASE 4 de authority discipline permanecen verdes.

---

### Task 11: Coverage remains downstream of accepted generation

**Files:**
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `tests/legal-engine/richCoveragePolicy.test.ts`
- Inspect only unless a type extension is required: `lib/legal-engine/coveragePolicy.ts`
- Inspect only for transition wiring: `lib/legal-engine/pipeline.ts:370-435`

**Interfaces:**
- Consumes: bundle/readiness/eligibility de Tasks 2–9, `VALID_ACCEPTED`, `BlockQualityEvaluation` `PASS` y `isCoverageSatisfied` existente.
- Produces: prueba de que research no muta ni satisface Coverage por sí solo; un block research-unlocked aceptado puede pasar la policy existente.

- [ ] **Step 1: Write the failing tests**

```ts
it('does not cover an item from a sufficient research bundle alone', () => {
  const item = coverageFixture('coverage-research-1');
  const decision = isCoverageSatisfied(item, [], []);

  expect(decision.satisfied).toBe(false);
});

it('allows accepted research-unlocked content only after PASS and policy checks', () => {
  const item = coverageFixture('coverage-research-1');
  const block = researchBlockFixture({
    coverageItemIds: [item.id],
    issueDraftValidationStatus: 'VALID_ACCEPTED',
    generatedBy: 'AI',
  });
  const decision = isCoverageSatisfied(item, [block], [{ blockId: block.id, verdict: 'PASS', hardFailReasons: [] }]);

  expect(decision.satisfied).toBe(true);
});
```

Añadir assertions de `VALID_NON_FINAL`, fallback, conflicto y posición de cliente siempre no cubiertos.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/richCoveragePolicy.test.ts -t "research bundle alone|accepted research|VALID_NON_FINAL|fallback"`

Expected: el test de bundle solo debe permanecer rojo si una integración intenta marcar Coverage antes del block; la policy aislada debe seguir devolviendo `NO_GENERATED_BLOCK`.

- [ ] **Step 3: Write minimal implementation**

No añadir una rama de Coverage para bundles. Si la integración necesita una defensa explícita, la condición debe vivir antes de llamar la policy y aceptar solo un outcome efectivo:

```ts
const mayEvaluateCoverage = outcome.status === 'ACCEPTED'
  && outcome.validation?.status === 'VALID_ACCEPTED'
  && outcome.evaluation?.verdict === 'PASS'
  && outcome.effectiveEligibility?.eligible === true;

if (mayEvaluateCoverage) applySectionCoverageTransition(doc, section, outcome.block, trace);
```

No cambiar `VERIFIED_SUFFICIENT` a estado Coverage ni escribir datos de research en matrices. Si la ruta actual ya garantiza esta precondición por ensamblado, dejar `coveragePolicy.ts` sin cambio de producción y documentar el contrato en el test.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/richCoveragePolicy.test.ts -t "research bundle alone|accepted research|VALID_NON_FINAL|fallback"`

Expected: PASS; research alone, non-final y fallback no cubren.

---

### Task 12: Additive generation trace links

**Files:**
- Modify: `lib/legal-engine/generationTrace.ts:108-170,244-289,510-548`
- Modify: `lib/legal-engine/issueScopedGeneration.ts:586-620,640-660`
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `tests/legal-engine/generationTraceContext.test.ts`

**Interfaces:**
- Consumes: `EffectiveIssueGenerationEligibility`, `IssueDraftResult`, `ContentBlock` y `LegalResearchTrace` agregado.
- Produces: metadata ligera y reconstruible, sin duplicar `LegalResearchTrace`:

```ts
export interface IssueResearchGenerationTrace {
  requestId?: string;
  researchHash?: string;
  verifiedAuthorityIds: string[];
  researchReadiness?: DerivedIssueReadiness['researchReadiness'];
  effectiveEligibilityReason: string;
}
```

Añadir `research?: IssueResearchGenerationTrace` a `TaskExecutionTrace`, `IssueGenerationAttemptTrace` y al elemento de `GenerationTrace.draftBlocks`.

- [ ] **Step 1: Write the failing tests**

```ts
it('records research links across attempt and DraftBlock without copying the bundle', async () => {
  const trace = createGenerationTraceContext({ doc: documentFixture(['issue-research-1']), options: { enabled: true } });
  await executeWithResearchGeneration({ trace });
  const closed = trace.close();

  expect(closed.issueGenerationAttempts[0].research).toMatchObject({
    requestId: 'request-research-1',
    researchHash: 'research-hash-1',
    verifiedAuthorityIds: ['verified-authority-1'],
    researchReadiness: 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH',
    effectiveEligibilityReason: 'READY_WITH_VERIFIED_RESEARCH',
  });
  expect(closed.draftBlocks[0].research?.researchHash).toBe('research-hash-1');
  expect(JSON.stringify(closed)).not.toContain('rejectedCandidates');
});
```

Probar que un bloqueo conserva reason y readiness sin provider attempt, y que `recordDraftBlock` no pierde los IDs.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/generationTraceContext.test.ts -t "records research links|blocked"`

Expected: FAIL porque los tipos/serializadores actuales no tienen la sección `research`.

- [ ] **Step 3: Write minimal implementation**

En cada registro, copiar y sanitizar únicamente la metadata:

```ts
research: entry.research
  ? {
      requestId: entry.research.requestId,
      researchHash: entry.research.researchHash,
      verifiedAuthorityIds: [...entry.research.verifiedAuthorityIds],
      researchReadiness: entry.research.researchReadiness,
      effectiveEligibilityReason: entry.research.effectiveEligibilityReason,
    }
  : undefined,
```

En `traceOutcome`, derivar esta metadata del resultado efectivo y del block. Mantener `legalResearch` como agregado de FASE 5A; no incrustar bundles, candidates, rejections ni corpus en attempts.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/generationTraceContext.test.ts -t "records research links|blocked"`

Expected: PASS con hash/IDs/request/readiness/reason reconstruibles.

---

### Task 13: Deterministic multi-issue assembly and isolation

**Files:**
- Modify: `lib/legal-engine/issueScopedGeneration.ts:386-427` únicamente si la propagación de metadata lo exige
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `tests/legal-engine/issueScopedGeneration.test.ts:896-954`

**Interfaces:**
- Consumes: outcomes `ACCEPTED`, blocks con IDs/hash de Tasks 8–12 y `compareIssueTasks` existente.
- Produces: ensamblado estable de issues normales y research-unlocked; deduplicación por issue + texto sin colapsar issues distintas.

- [ ] **Step 1: Write the failing tests**

```ts
it('assembles normal and research-unlocked blocks deterministically', () => {
  const section = sectionFixture('section-1');
  const research = acceptedOutcomeFixture('issue-research-1', { researchHash: 'research-hash-1' });
  const normal = acceptedOutcomeFixture('issue-ready-1');
  const first = assembleIssueDraftBlocks(section, [research, normal]);
  const second = assembleIssueDraftBlocks(section, [normal, research]);

  expect(first.blocks.map((block) => block.legalIssueIds)).toEqual(second.blocks.map((block) => block.legalIssueIds));
  expect(first.blocks.find((block) => block.legalIssueIds?.includes('issue-research-1'))?.researchHash).toBe('research-hash-1');
});

it('does not deduplicate identical text across different issues', () => {
  const result = assembleIssueDraftBlocks(sectionFixture('section-1'), [
    acceptedOutcomeFixture('issue-research-1', { text: 'Aplicación común' }),
    acceptedOutcomeFixture('issue-research-2', { text: 'Aplicación común' }),
  ]);

  expect(result.blocks).toHaveLength(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "assembles normal|deduplicate identical"`

Expected: FAIL solo si una modificación anterior pierde metadata o altera el orden; el contrato actual de issue+text debe permanecer verde.

- [ ] **Step 3: Write minimal implementation**

Conservar la clave actual `${legalIssueIds}|${normalizedText}`, ordenar por section order, parent order, issue ID y task ID, y no volver a ordenar por completion time. No introducir un array global de research authorities ni una deduplicación por texto sin issue.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts -t "assembles normal|deduplicate identical"`

Expected: PASS y metadata intacta.

---

### Task 14: Pipeline integration through readonly inputs

**Files:**
- Modify: `lib/legal-engine/pipeline.ts:717-765,2581-2591,2705-2718,3415-3425`
- Modify: `lib/legal-engine/issueScopedGeneration.ts:366-380,547-624`
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts`
- Modify: `tests/legal-engine/legalResearchPipeline.test.ts`
- Modify: `tests/legal-engine/legalResearchReadiness.test.ts`

**Interfaces:**
- Consumes: `LegalResearchOnlyResult.bundles`, `.readiness`, pipeline provider seam, resolver y executor de Tasks 2–9.
- Produces: `PipelineInput` con `researchBundlesByIssueId?: ReadonlyMap<string, LegalResearchBundle>` y `derivedReadinessByIssueId?: ReadonlyMap<string, DerivedIssueReadiness>`; el filtro y el executor usan la misma decisión efectiva.

- [ ] **Step 1: Write the failing tests**

```ts
it('allows both research issues only when each has its own sufficient artifact', async () => {
  const provider = vi.fn().mockResolvedValue(providerResponseFixture({ researchHash: 'research-hash-1' }));
  const issues = [
    issueFixture({ id: 'issue-research-1', status: 'NEEDS_RESEARCH' }),
    issueFixture({ id: 'issue-research-2', status: 'NEEDS_RESEARCH' }),
  ];
  const bundles = new Map(issues.map((issue) => [issue.id, bundleFixture(issue.id)]));
  const readiness = new Map(issues.map((issue) => [issue.id, readinessFixture(issue.id, bundles.get(issue.id)!.researchHash)]));

  const result = await runGenerationWithResearchArtifacts({ issues, bundles, readiness, provider });

  expect(result.providerCalls).toBe(2);
  expect(result.generatedIssueIds).toEqual(['issue-research-1', 'issue-research-2']);
});

it('does not invoke research-only generation automatically', async () => {
  const finalProvider = vi.fn();
  await runLegalResearchOnly({
    caseAnalysis: richAnalysisFixture(),
    issueMatrix: matrixFixture(['issue-research-1']),
    provider: fixtureResearchProvider(),
    invokeFinalProvider: finalProvider,
  });

  expect(finalProvider).not.toHaveBeenCalled();
});
```

Añadir deep-clone assertions antes/después para `LegalIssueMatrix`, bundles, `CoverageMatrix` y `RichCaseAnalysis`, además de un spy sobre todos los adapters de research durante generación.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/legalResearchPipeline.test.ts tests/legal-engine/legalResearchReadiness.test.ts -t "each has its own|research-only|deep-clone|adapters"`

Expected: FAIL porque `PipelineInput` no transporta mapas y el filtro actual excluye todas las issues `NEEDS_RESEARCH`.

- [ ] **Step 3: Write minimal implementation**

Añadir campos readonly a `PipelineInput` y propagarlos hasta `generateLegalBlock`, `executeReadyIssueTasks` y `buildBlockedIssueOutcome`. El filtro debe ser:

```ts
const eligibleTasks = tasks.filter((task) => {
  const issue = doc.legalIssueMatrix!.issues.find((candidate) => candidate.id === task.legalIssueIds?.[0]);
  return resolveEffectiveIssueGenerationEligibility({
    issue,
    derivedReadiness: issue ? input.derivedReadinessByIssueId?.get(issue.id) : undefined,
    researchBundle: issue ? input.researchBundlesByIssueId?.get(issue.id) : undefined,
    formal: isFormalIssueTask(task, sec),
    taskType: task.taskType || task.type,
  }).eligible;
});
```

Pasar los mismos mapas en `IssueExecutorOptions`. Para tasks excluidas, `buildBlockedIssueOutcome` debe resolver el mismo reason y nunca llamar provider. No crear bundle/readiness desde generation y no escribirlos en `doc.legalIssueMatrix`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts tests/legal-engine/legalResearchPipeline.test.ts tests/legal-engine/legalResearchReadiness.test.ts -t "each has its own|research-only|deep-clone|adapters"`

Expected: PASS; cada issue se resuelve por su ID, research-only sigue en cero calls finales y todas las entradas permanecen inmutables.

---

### Task 15: Focal regressions and final validation

**Files:**
- Modify: `tests/legal-engine/legalResearchReentryGeneration.test.ts` para cerrar cualquier contrato no cubierto
- Modify: tests relacionadas solo para assertions de regresión estrictamente necesarias
- No modificar: adapters reales, documentación de FASE 5A, UI, DB, Prisma, Neon, DOCX o warnings

**Interfaces:**
- Consumes: todos los contratos de Tasks 1–14.
- Produces: evidencia offline de FASE 5B, FASE 4/5A relacionadas, legacy, non-labor y formal, sin ejecutar suite completa.

- [ ] **Step 1: Run the focal FASE 5B suite**

Run: `npx vitest run tests/legal-engine/legalResearchReentryGeneration.test.ts`

Expected: PASS para los 50 contratos numerados y cero llamadas reales/network.

- [ ] **Step 2: Run directly related FASE 4 and FASE 5A suites**

Run: `npx vitest run tests/legal-engine/issueScopedGeneration.test.ts tests/legal-engine/legalResearchReentryTypes.test.ts tests/legal-engine/legalResearchReadiness.test.ts tests/legal-engine/legalResearchPipeline.test.ts tests/legal-engine/legalResearchBundle.test.ts tests/legal-engine/richCoveragePolicy.test.ts tests/legal-engine/generationTraceContext.test.ts`

Expected: PASS; cuatro READY normales de Fixture F permanecen generables, dos research issues solo se desbloquean con artefactos suficientes, research-only conserva cero final calls y las rutas legacy/non-labor/formal no cambian.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS sin añadir dependencias.

- [ ] **Step 4: Run lint and register only the accepted warning delta**

Run: `npm run lint`

Expected: cero errores; no limpiar warnings. La única entrada de deuda registrada es `TECH_DEBT_LINT_DELTA_PHASE5A` para 1030 → 1036.

- [ ] **Step 5: Run build**

Run: `npm run build`

Expected: PASS. Si aparece un problema de entorno ya conocido, reportar el output exacto sin modificar Prisma, Neon ni configuración fuera de alcance.

## Cobertura de los 50 contratos

| Contratos | Task | Evidencia esperada |
| --- | --- | --- |
| 1–5 | 2, 3, 9 | Sin bundle, parcial, sin autoridad, régimen no resuelto bloquean; bundle suficiente + readiness permite provider. |
| 6–10 | 2, 3, 9 | Estado canónico intacto; conflicto, posición, unlinked y unknown bloquean; mismatch de issue rechaza. |
| 11–15 | 3, 4, 6, 9 | Hash mismatch, cross-issue, contexto same-issue, rejected y secondary ausentes. |
| 16–20 | 1, 3, 6, 7, 10 | `SOURCE_CITED`, IDs separados, IDs verificados trazables, ID desconocido fatal y autoridad textual inventada rechazada. |
| 21–24 | 6, 10 | Proposición, limitaciones, temporalidad y jurisdicción aparecen y gobiernan el uso. |
| 25–30 | 5, 8, 12 | Hash cambia con research distinto, permanece estable con research equivalente, y hash/IDs llegan a block/trace. |
| 31–35 | 2, 11, 12 | Reason efectivo trazado; research solo, non-final y fallback no cubren; accepted + PASS puede cubrir por policy. |
| 36–40 | 9, 13, 14, 15 | READY normal sin bundle, cuatro READY sin regresión, dos research unlock, research-only cero calls y generación sin adapters. |
| 41–45 | 3, 9, 14, 15 | Sin red/adapters reales; legacy/non-labor/formal estables; no mutación de entradas. |
| 46–50 | 11–15 | Sin mutación de matrix, assembly determinista, aislamiento de fallos, request sin corpus y trace chain completa. |

## Orden de dependencias

```text
Task 1 tipos/fixtures
  -> Task 2 eligibility
  -> Task 3 bundle validation/projection
  -> Task 4 readonly maps/context
  -> Task 5 contextHash V2
  -> Task 6 prompt
  -> Task 7 result validation
  -> Task 8 DraftBlock
  -> Task 9 provider boundary
  -> Task 10 authority/proposition discipline
  -> Task 11 Coverage gate
  -> Task 12 trace
  -> Task 13 assembly
  -> Task 14 pipeline
  -> Task 15 regressions/final validation
```

## Self-review del plan

* Cada requisito del spec tiene al menos una Task y aparece en la tabla de contratos.
* El plan usa un único executor y una única fuente de eligibility efectiva.
* Los nombres públicos (`researchBundlesByIssueId`, `derivedReadinessByIssueId`, `resolveEffectiveIssueGenerationEligibility`, `verifiedAuthorityIds`, `researchHash`) son consistentes entre Tasks.
* No hay marcadores de incompletitud ni pasos de implementación sin comando, interfaz o resultado esperado.
* La rama normal `READY_FOR_GENERATION` no exige bundle y la rama research exige todos los gates congelados.
* Coverage permanece downstream de resultado aceptado + `PASS`; research no cambia matrices por sí mismo.
* No se incluyen adapters reales, NVIDIA, web, memoria, subagentes, suite completa ni limpieza de warnings.

El plan termina en validación focal; todavía no implementa ningún cambio de código.
