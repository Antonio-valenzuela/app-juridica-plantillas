# FASE 3 — LegalIssueMatrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una `LegalIssueMatrix` canonical rich-first, derivada de `CoverageMatrix` y `RichCaseAnalysis`, con fallback legacy explícito y trazabilidad hasta `GenerationTask` sin investigación jurídica real ni generación profunda nueva.

**Architecture:** `legalIssueMatrix.ts` será el único dueño del modelo canonical, del builder puro, del cálculo de IDs, de la readiness y de la validación estructural. `LegalIssue` de `caseAnalysis.ts` permanece como DTO legacy; los planes, tareas y traces incorporan `legalIssueIds[]` como relación canonical, manteniendo `issueId` y `targetIssueId` solo para compatibilidad.

**Tech Stack:** TypeScript, Next.js existente, Vitest, npm scripts existentes, `CoverageMatrix`, `RichCaseAnalysis`, `GenerationTask`, `GenerationTrace` y QualityGate estructural.

**Spec:** `docs/superpowers/specs/2026-09-08-legal-issue-matrix-design.md`

## Global Constraints

- `RichCaseAnalysis` es la fuente canonical cuando existe; la rama rich no lee `proceduralPosture.*Issues`, `legalIssues` ni otros arrays legacy para crear issues.
- `CoverageMatrix` sigue siendo la lista canonical de obligaciones; `LegalIssueMatrix` es una capa derivada y no muta Coverage, análisis ni entidades fuente.
- `LegalIssue` legacy permanece como DTO de compatibilidad; `LegalIssueItem` no copia `parameter`, `challengedAct`, `contradiction`, `affectation`, `consequence`, defensas, excepciones, normas ni jurisprudencia.
- `EvidenceMention` y `EvidenceOffer` permanecen separados; una mención nunca se convierte en oferta.
- Solo se copian relaciones explícitas por IDs; no se usa similitud, proximidad, keywords, coaparición, títulos, materia ni orden de arrays.
- `NEEDS_RESEARCH` impide una respuesta jurídica final de esa issue, pero permite construir matriz, planificar, trazar, identificar y crear una tarea de investigación planificada sin consultas externas.
- Conflictos y posturas faltantes son blockers estructurales; Semantic PASS nunca los resuelve.
- `FORMAL_DETERMINISTIC_ALLOWED` y requisitos formales producen cero issues salvo controversia jurídica explícita.
- Los IDs son reproducibles y no usan UUID aleatorio, `Date.now()` ni índice como identidad.
- Las preguntas son neutrales y source-grounded; la fase no determina la respuesta jurídica.
- Se reutiliza Fixture F mediante copias y overrides inmutables; no se crea Fixture G salvo evidencia de que un contrato no pueda expresarse con esos overrides.
- No se realiza investigación jurídica, web, SCJN, recuperación de jurisprudencia, generación multi-IA, renderer DOCX, persistencia, migraciones, cambios de `.env`, empaque ni E2E externo.
- No se ejecuta la suite completa; la validación final usa únicamente tests focalizados, regresiones relacionadas, `npm run typecheck`, `npm run lint` y `npm run build`.

## Mapa de archivos y responsabilidades

### Archivos nuevos

- `lib/legal-engine/legalIssueMatrix.ts`: tipos canonical, builder rich-first, adaptador legacy explícito, IDs determinísticos, estados, summary y validación estructural.
- `tests/legal-engine/legalIssueMatrix.test.ts`: los 32 contratos TDD de FASE 3, usando Fixture F y overrides inmutables.

### Archivos modificados

- `lib/legal-engine/types.ts`: campo opcional `legalIssueMatrix` en `UniversalLegalDocument` y exportación de tipos canonical.
- `lib/legal-engine/documentPlan.ts`: propagación de `legalIssueMatrix` junto con Coverage en `DocumentPlanResult`.
- `lib/legal-engine/pipeline.ts`: construcción de la matriz entre Coverage y `DraftingPlan`, uso de preguntas canonical y almacenamiento en el documento.
- `lib/legal-engine/generationTasks.ts`: `legalIssueIds[]`, tareas scoped, tarea planificada `LEGAL_RESEARCH` y guardas para no producir respuesta final cuando falta investigación.
- `lib/legal-engine/generationTrace.ts`: enlaces opcionales Coverage → Issue y uso plural de IDs de issue en task traces.
- `lib/legal-engine/qualityGate.ts`: validación estructural de la matriz y separación entre warnings de research y blockers de finalización.
- `lib/legal-engine/coveragePolicy.ts`: razón de bloqueo para research pendiente y reutilización de las reglas de conflicto/postura.

### Archivos de solo lectura durante el plan

- `lib/legal-engine/caseAnalysis.ts`: contrato y constructor legacy que no se reescriben.
- `lib/legal-engine/coverageMatrix.ts`: contratos existentes de Coverage que consume el builder; no se altera la precedencia rich-first.
- `lib/legal-engine/richCoverage.ts`: Coverage rica existente; no se añaden inferencias de issue allí.
- `lib/legal-engine/case-extraction/types.ts`: entidades y `SourceProvenance` existentes.
- `tests/fixtures/richCoverageFixtures.ts`: Fixture F existente, reutilizada sin mutación ni Fixture G.
- `lib/legal-engine/semanticEvaluator.ts`: no se convierte Semantic Evaluator en juez jurídico.

## Orden de dependencias

1. Tipos canonical y campo del documento.
2. Identidad determinística, provenance y validación de relaciones.
3. Builder rich-first y mapeo de Coverage a issues.
4. Estados, blockers, research y QualityGate estructural.
5. Fallback legacy explícito.
6. DocumentPlan/DraftingPlan y `IssuePlan.legalIssueIds[]`.
7. `GenerationTask.legalIssueIds[]`, contexto scoped y tarea de investigación planificada.
8. GenerationTrace y pipeline de validación.
9. Validación focalizada final.

## Task 1: Canonical types and public document shape

**Files:**

- Create: `tests/legal-engine/legalIssueMatrix.test.ts`
- Create: `lib/legal-engine/legalIssueMatrix.ts`
- Modify: `lib/legal-engine/types.ts`

**Interfaces:**

- Consumes: existing `CoverageCategory`, `CoverageEntityType`, `CoverageRelationStatus`, `SourceProvenance` and `CaseAnalysis` types.
- Produces: `LegalIssueType`, `LegalIssueStatus`, `LegalResearchStatus`, `ClientPositionStatus`, `LegalIssueSource`, `LegalIssueItem` and `LegalIssueMatrix` for all later tasks.

- [ ] **Step 1: Write the failing canonical type contract**

Add a type-only contract test at the top of `tests/legal-engine/legalIssueMatrix.test.ts` so the required fields are checked by TypeScript before any builder behavior exists:

```ts
import { describe, expect, it } from 'vitest';
import type {
  ClientPositionStatus,
  LegalIssueItem,
  LegalIssueMatrix,
  LegalResearchStatus,
  LegalIssueSource,
  LegalIssueStatus,
  LegalIssueType,
} from '@/lib/legal-engine/legalIssueMatrix';
import type { CoverageCategory, CoverageEntityType, CoverageRelationStatus } from '@/lib/legal-engine/coverageMatrix';
import type { SourceProvenance } from '@/lib/legal-engine/case-extraction/types';

const provenance: SourceProvenance[] = [];
const source: LegalIssueSource = {
  mode: 'RICH_COVERAGE',
  coverageItemId: 'cov-claim-fixture-f-claim-1',
  coverageCategory: 'CLAIM_RESPONSE' as CoverageCategory,
  sourceEntityType: 'CLAIM' as CoverageEntityType,
  sourceEntityIds: ['fixture-f-claim-1'],
};

const item: LegalIssueItem = {
  id: 'issue-fixture-f-claim-1',
  issueType: 'CLAIM_ELEMENT' as LegalIssueType,
  question: '¿La prestación cuenta con elementos explícitamente vinculados para su análisis?',
  source,
  coverageItemIds: ['cov-claim-fixture-f-claim-1'],
  claimIds: ['fixture-f-claim-1'],
  factIds: ['fixture-f-fact-1'],
  evidenceMentionIds: ['fixture-f-evidence-mention-1'],
  evidenceOfferIds: [],
  argumentIds: [],
  authorityMentionIds: [],
  conflictIds: [],
  missingDataIds: [],
  clientPositionStatus: 'NOT_REQUIRED' as ClientPositionStatus,
  required: true,
  blocking: false,
  status: 'READY_FOR_GENERATION' as LegalIssueStatus,
  researchStatus: 'NOT_REQUIRED' as LegalResearchStatus,
  provenance,
  relationStatus: 'EXPLICIT' as CoverageRelationStatus,
};

describe('LegalIssueMatrix canonical types', () => {
  it('accepts the complete canonical item and matrix shape', () => {
    const matrix: LegalIssueMatrix = {
      documentId: 'fixture-rich-document',
      documentType: 'contestacion_demanda_laboral',
      sourceMode: 'RICH',
      issues: [item],
      summary: {
        total: 1,
        required: 1,
        blocked: 0,
        readyForGeneration: 1,
        needsLegalResearch: 0,
        needsClientPosition: 0,
        unresolvedConflict: 0,
        unlinked: 0,
      },
    };
    expect(matrix.issues[0].id).toBe('issue-fixture-f-claim-1');
  });
});
```

- [ ] **Step 2: Run the type contract and verify it fails for the missing module**

Run: `npm run typecheck`

Expected: FAIL because `lib/legal-engine/legalIssueMatrix.ts` and its canonical exports do not exist yet.

- [ ] **Step 3: Add the canonical types and document field**

Create `lib/legal-engine/legalIssueMatrix.ts` with the exact unions and interfaces from the approved spec. Use type-only imports so the module does not create a runtime cycle:

```ts
import type { CaseAnalysis, LegalIssue } from './caseAnalysis';
import type {
  CoverageCategory,
  CoverageEntityType,
  CoverageMatrix,
  CoverageRelationStatus,
  DocumentCoverageItem,
} from './coverageMatrix';
import type {
  ClientPosition,
  RichCaseAnalysis,
  SourceAuthorityMention,
  SourceProvenance,
} from './case-extraction/types';

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

export type LegalResearchStatus = 'NOT_REQUIRED' | 'NEEDS_RESEARCH' | 'SOURCE_CITED_UNVERIFIED';
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

Add `legalIssueMatrix?: import('./legalIssueMatrix').LegalIssueMatrix;` to `UniversalLegalDocument` and re-export the canonical types from `lib/legal-engine/types.ts` without changing `createEmptyDocument` behavior.

- [ ] **Step 4: Run the canonical type contract and verify it passes**

Run: `npm run typecheck`

Expected: PASS with the new type-only contract compiling and no generated runtime behavior yet.

## Task 2: Deterministic identity, provenance and explicit relations

**Files:**

- Modify: `tests/legal-engine/legalIssueMatrix.test.ts`
- Modify: `lib/legal-engine/legalIssueMatrix.ts`

**Interfaces:**

- Consumes: canonical types from Task 1, `CoverageMatrix`, Fixture F and `RichCaseAnalysis`.
- Produces: `buildLegalIssueMatrix(input)` and `validateExplicitRelation(...)` internals with deterministic IDs and immutable outputs.

- [ ] **Step 1: Write failing tests for deterministic IDs, immutability and relation policy**

Add contracts 3, 4, 5, 6, 17 and 19 using immutable Fixture F copies. The tests must compare IDs from two independent builds, deep-clone both inputs before construction, and verify that similar text without explicit IDs does not link entities:

```ts
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { buildLegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import { makeFixtureDocument, makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function buildFixtureMatrix() {
  const analysis = makeFixtureFCaseAnalysis();
  const document = makeFixtureDocument();
  const coverage = buildCoverageMatrix(analysis, document, document.sections);
  return { analysis, document, coverage, matrix: buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage }) };
}

it('uses deterministic IDs independent of construction call', () => {
  const first = buildFixtureMatrix().matrix;
  const second = buildFixtureMatrix().matrix;
  expect(first.issues.map((issue) => issue.id)).toEqual(second.issues.map((issue) => issue.id));
});

it('does not use array index as identity', () => {
  const first = buildFixtureMatrix().matrix;
  const fixture = makeFixtureFCaseAnalysis();
  fixture.richCaseAnalysis!.claims = [...fixture.richCaseAnalysis!.claims].reverse();
  const document = makeFixtureDocument();
  const coverage = buildCoverageMatrix(fixture, document, document.sections);
  const second = buildLegalIssueMatrix({ caseAnalysis: fixture, coverageMatrix: coverage });
  const firstByClaim = new Map(first.issues.flatMap((issue) => issue.claimIds.map((id) => [id, issue.id] as const)));
  const secondByClaim = new Map(second.issues.flatMap((issue) => issue.claimIds.map((id) => [id, issue.id] as const)));
  expect(secondByClaim).toEqual(firstByClaim);
});

it('does not mutate rich analysis or coverage', () => {
  const { analysis, coverage } = buildFixtureMatrix();
  const analysisBefore = clone(analysis);
  const coverageBefore = clone(coverage);
  buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  expect(analysis).toEqual(analysisBefore);
  expect(coverage).toEqual(coverageBefore);
});

it('does not infer a relation from similar text', () => {
  const { matrix } = buildFixtureMatrix();
  const unrelated = matrix.issues.filter((issue) => issue.factIds.length === 0 && issue.claimIds.length === 0);
  expect(unrelated.every((issue) => issue.relationStatus !== 'EXPLICIT')).toBe(true);
});

it('keeps every material issue linked to an existing Coverage item', () => {
  const { coverage, matrix } = buildFixtureMatrix();
  const coverageIds = new Set(coverage.items.map((item) => item.id));
  expect(matrix.issues.every((issue) => issue.coverageItemIds.some((id) => coverageIds.has(id)))).toBe(true);
});
```

- [ ] **Step 2: Run the new focal tests and verify the builder is missing or failing**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts -t "deterministic|array index|mutate|similar text|Coverage item"`

Expected: FAIL because `buildLegalIssueMatrix` and its deterministic implementation do not exist.

- [ ] **Step 3: Implement the pure deterministic core**

Implement the canonical key and immutable relation helpers. The key must sort every relation array before hashing and include document ID, Coverage ID, issue type and explicit source IDs:

```ts
function stableIssueKey(input: {
  documentId: string;
  coverageItemId: string;
  issueType: LegalIssueType;
  claimIds: string[];
  factIds: string[];
  evidenceMentionIds: string[];
  evidenceOfferIds: string[];
  argumentIds: string[];
  authorityMentionIds: string[];
  conflictIds: string[];
  missingDataIds: string[];
}): string {
  const sorted = (values: string[]) => [...new Set(values)].sort();
  return [
    input.documentId,
    input.coverageItemId,
    input.issueType,
    sorted(input.claimIds).join(','),
    sorted(input.factIds).join(','),
    sorted(input.evidenceMentionIds).join(','),
    sorted(input.evidenceOfferIds).join(','),
    sorted(input.argumentIds).join(','),
    sorted(input.authorityMentionIds).join(','),
    sorted(input.conflictIds).join(','),
    sorted(input.missingDataIds).join(','),
  ].join('|');
}
```

Use a stable SHA-256 helper already available through Node’s crypto runtime or a deterministic local fallback; never use UUIDs, clock values or array indexes. Build new arrays and provenance objects rather than assigning to source arrays. Mark a relation `EXPLICIT` only when the source array explicitly contains the ID and the ID exists in the rich snapshot; mark missing material links `UNLINKED` and unresolved entity IDs `UNKNOWN`.

Add a minimal rich claim materialization path so this task can prove the identity core against Fixture F without reading legacy issues. Do not call `normalizeIssueSemanticKey` or `deduplicateLegalIssues` in this path.

- [ ] **Step 4: Run the deterministic and immutability tests**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts -t "deterministic|array index|mutate|similar text|Coverage item"`

Expected: PASS with stable per-claim IDs, no input mutation and no inferred relation.

- [ ] **Step 5: Recheck the type boundary**

Run: `npm run typecheck`

Expected: PASS; all new helpers remain internal unless explicitly required by the public builder contract.

## Task 3: Rich-first issue materialization by Coverage category

**Files:**

- Modify: `tests/legal-engine/legalIssueMatrix.test.ts`
- Modify: `lib/legal-engine/legalIssueMatrix.ts`

**Interfaces:**

- Consumes: deterministic builder core from Task 2 and explicit rich entity arrays.
- Produces: one canonical issue per materially justified Coverage item for claim, fact, evidence, source argument, petition support, authority research, procedural issue and conflict categories.

- [ ] **Step 1: Write failing mapping and no-invention contracts**

Add contracts 7–12, 18, 27, 28, 29 and 30. Use `makeFixtureFCaseAnalysis()` and immutable overrides. Assert exact category, IDs, neutral question and absence of invented legal fields:

```ts
it('maps claim, fact, evidence, argument and authority Coverage without cross-product expansion', () => {
  const { matrix } = buildFixtureMatrix();
  expect(matrix.issues.some((issue) => issue.issueType === 'CLAIM_ELEMENT' && issue.claimIds.includes('fixture-f-claim-1'))).toBe(true);
  expect(matrix.issues.some((issue) => issue.issueType === 'FACT_DISPUTE' && issue.factIds.includes('fixture-f-fact-2'))).toBe(true);
  expect(matrix.issues.some((issue) => issue.issueType === 'EVIDENCE_RELEVANCE' && issue.evidenceMentionIds.includes('fixture-f-evidence-mention-1'))).toBe(true);
  expect(matrix.issues.some((issue) => issue.issueType === 'SOURCE_ARGUMENT' && issue.argumentIds.includes('fixture-f-argument-1'))).toBe(true);
  expect(matrix.issues.some((issue) => issue.issueType === 'AUTHORITY_RESEARCH' && issue.authorityMentionIds.includes('fixture-f-authority-1'))).toBe(true);
  expect(matrix.issues.every((issue) => !issue.question.includes('IMPROCEDENTE'))).toBe(true);
});

it('does not make EvidenceOffer from an EvidenceMention', () => {
  const analysis = makeFixtureFCaseAnalysis();
  analysis.richCaseAnalysis = {
    ...analysis.richCaseAnalysis!,
    evidenceOffers: [],
  };
  const document = makeFixtureDocument();
  const coverage = buildCoverageMatrix(analysis, document, document.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  const mentionIssue = matrix.issues.find((issue) => issue.evidenceMentionIds.includes('fixture-f-evidence-mention-1'))!;
  expect(mentionIssue.issueType).toBe('EVIDENCE_RELEVANCE');
  expect(mentionIssue.evidenceOfferIds).toEqual([]);
  expect(matrix.issues.some((issue) => issue.issueType === 'EVIDENCE_SUFFICIENCY')).toBe(false);
});

it('creates EvidenceOffer issue only for an explicit offer', () => {
  const { matrix } = buildFixtureMatrix();
  const issue = matrix.issues.find((candidate) => candidate.evidenceOfferIds.includes('fixture-f-offer-1'))!;
  expect(issue.issueType).toBe('EVIDENCE_SUFFICIENCY');
  expect(issue.evidenceMentionIds).toContain('fixture-f-evidence-mention-1');
});

it('creates zero issues for formal deterministic Coverage', () => {
  const analysis = makeFixtureFCaseAnalysis();
  const document = makeFixtureDocument();
  const coverage = {
    documentId: document.id,
    documentType: document.documentType,
    items: [{
      id: 'cov-formal-signature',
      category: 'FORMAL_REQUIREMENT',
      description: 'Firma',
      required: true,
      status: 'pending',
      targetSectionIds: ['sec-firma'],
      scope: 'FORMAL',
      satisfactionPolicy: 'FORMAL_DETERMINISTIC_ALLOWED',
    }],
    summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
  } as const;
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  expect(matrix.issues).toEqual([]);
});
```

The source argument test must verify `argumentIds`, copied `supportingFactIds` and `citedAuthorityIds`, while the authority test must verify `authorityMentionIds` and no assertion that the citation applies. The no-invention assertions must verify that the matrix does not contain defense, exception, statute, jurisprudence or conclusion fields.

- [ ] **Step 2: Run the mapping tests and verify the missing category cases**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts -t "claim|fact|evidence|offer|argument|authority|formal|defense|exception|statute|jurisprudence"`

Expected: FAIL for categories not yet materialized, while the deterministic claim path from Task 2 remains green.

- [ ] **Step 3: Implement the explicit Coverage-to-issue mapping table**

Add a single mapping table in `legalIssueMatrix.ts`. It must skip `metadata.compatibilityAlias === true`, non-material/reference-only/formal items and unsupported categories. Use neutral question builders:

```ts
const ISSUE_TYPE_BY_CATEGORY: Partial<Record<CoverageCategory, LegalIssueType>> = {
  CLAIM_RESPONSE: 'CLAIM_ELEMENT',
  FACT_RESPONSE: 'FACT_DISPUTE',
  EVIDENCE_TREATMENT: 'EVIDENCE_RELEVANCE',
  EVIDENCE_OFFER: 'EVIDENCE_SUFFICIENCY',
  SOURCE_ARGUMENT_RESPONSE: 'SOURCE_ARGUMENT',
  PETITION_SUPPORT: 'PETITION_SUPPORT',
  AUTHORITY_MENTION: 'AUTHORITY_RESEARCH',
  PROCEDURAL_REQUIREMENT: 'PROCEDURAL_ISSUE',
  CONFLICT_REVIEW: 'CONFLICT_DEPENDENCY',
};
```

For each issue, copy only the corresponding arrays from `DocumentCoverageItem` and resolve them against rich entities. Use no cross-product. `MISSING_CLIENT_POSITION` is handled as a dependency in Task 4, not as a duplicate primary issue. Keep `LegalIssueItem` free of legacy answer-like fields.

- [ ] **Step 4: Run all materialization and no-invention contracts**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts -t "claim|fact|evidence|offer|argument|authority|formal|defense|exception|statute|jurisprudence"`

Expected: PASS; every material rich Coverage category has only its defined issue type, formal Coverage has zero issues, and no legal conclusion is introduced.

- [ ] **Step 5: Recheck types after the mapping table**

Run: `npm run typecheck`

Expected: PASS with exhaustive handling of `LegalIssueType` and no runtime import cycle.

## Task 4: Client position, conflicts, research, readiness and structural validation

**Files:**

- Modify: `tests/legal-engine/legalIssueMatrix.test.ts`
- Modify: `lib/legal-engine/legalIssueMatrix.ts`

**Interfaces:**

- Consumes: rich issue items and explicit relations from Tasks 2–3, `ClientPosition`, `CaseConflict`, `MissingDataItem` and authority verification status.
- Produces: final status/readiness calculation, summary counters and `validateLegalIssueMatrix(...)`.

- [ ] **Step 1: Write failing blocker, readiness and validation contracts**

Add contracts 13–16, 21–24 and the structural portion of 26. Cover confirmed and missing client positions, explicit and unrelated conflicts, unlinked relations, ready issues, research issues and orphan detection:

```ts
it('blocks an issue when the required client position is missing', () => {
  const { matrix } = buildFixtureMatrix();
  const factIssue = matrix.issues.find((issue) => issue.factIds.includes('fixture-f-fact-1'))!;
  expect(factIssue.clientPositionStatus).toBe('UNKNOWN');
  expect(factIssue.status).toBe('NEEDS_CLIENT_POSITION');
  expect(factIssue.blocking).toBe(true);
});

it('does not block confirmed client position for the explicitly confirmed proposition', () => {
  const { matrix } = buildFixtureMatrix();
  const factIssue = matrix.issues.find((issue) => issue.factIds.includes('fixture-f-fact-2'))!;
  expect(factIssue.clientPositionStatus).toBe('CONFIRMED');
  expect(factIssue.status).not.toBe('NEEDS_CLIENT_POSITION');
});

it('keeps an explicit conflict blocking without selecting a value', () => {
  const { matrix } = buildFixtureMatrix();
  const issue = matrix.issues.find((candidate) => candidate.conflictIds.includes('fixture-f-conflict-1'))!;
  expect(issue.status).toBe('BLOCKED_BY_CONFLICT');
  expect(issue.blocking).toBe(true);
  expect(issue.statusReason).toMatch(/conflict|conflicto/i);
});

it('marks source-cited authority work as research without legal verification', () => {
  const { matrix } = buildFixtureMatrix();
  const issue = matrix.issues.find((candidate) => candidate.issueType === 'AUTHORITY_RESEARCH')!;
  expect(issue.status).toBe('NEEDS_RESEARCH');
  expect(issue.researchStatus).not.toBe('NOT_REQUIRED');
});

it('detects orphan issues and Coverage without a required issue', () => {
  const { coverage, matrix } = buildFixtureMatrix();
  const invalid = {
    ...matrix,
    issues: [...matrix.issues, {
      ...matrix.issues[0],
      id: 'orphan-issue',
      coverageItemIds: ['coverage-does-not-exist'],
    }],
  };
  const result = validateLegalIssueMatrix(invalid, coverage, makeFixtureFCaseAnalysis());
  expect(result.ok).toBe(false);
  expect(result.orphanIssueIds).toContain('orphan-issue');
});
```

Also assert that a research issue is counted in `needsLegalResearch` but does not make `LegalIssueMatrix` construction throw or remove planning metadata. Assert that a conflict is attached to a primary issue only when its explicit `itemIds` intersect that issue’s explicit source IDs; otherwise it remains a standalone conflict dependency.

- [ ] **Step 2: Run the blocker and validation tests**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts -t "client position|confirmed|conflict|research|orphan|readiness"`

Expected: FAIL because the builder currently creates items but does not calculate final blockers, research status or structural diagnostics.

- [ ] **Step 3: Implement status precedence, dependency enrichment and validation**

Implement the following precedence in one pure function:

```ts
function resolveIssueStatus(input: {
  relationStatus: CoverageRelationStatus;
  conflictIds: string[];
  clientPositionStatus: ClientPositionStatus;
  researchStatus: LegalResearchStatus;
  required: boolean;
}): { status: LegalIssueStatus; blocking: boolean; statusReason: string } {
  if (input.conflictIds.length > 0) return { status: 'BLOCKED_BY_CONFLICT', blocking: true, statusReason: 'BLOCKING_CONFLICT_REQUIRES_REVIEW' };
  if (input.clientPositionStatus === 'UNKNOWN') return { status: 'NEEDS_CLIENT_POSITION', blocking: true, statusReason: 'MISSING_CLIENT_POSITION_REQUIRED' };
  if (input.relationStatus === 'UNKNOWN') return { status: 'UNKNOWN', blocking: true, statusReason: 'EXPLICIT_RELATION_CANNOT_BE_RESOLVED' };
  if (input.relationStatus === 'UNLINKED') return { status: 'UNLINKED', blocking: input.required, statusReason: 'MATERIAL_RELATION_NOT_EXPLICIT' };
  if (input.researchStatus !== 'NOT_REQUIRED') return { status: 'NEEDS_RESEARCH', blocking: true, statusReason: 'LEGAL_RESEARCH_OR_SOURCE_VERIFICATION_REQUIRED' };
  return { status: 'READY_FOR_GENERATION', blocking: false, statusReason: 'EXPLICIT_RELATIONS_READY' };
}
```

Use `clientPosition.propositionIds` for exact confirmation only. Attach `missingDataIds` from a related missing-position Coverage item to the primary issue sharing explicit `factIds` or `claimIds`. Never infer a missing relation from section title or text. Set `researchStatus = NEEDS_RESEARCH` for `AUTHORITY_RESEARCH`; set `SOURCE_CITED_UNVERIFIED` for a source argument with an explicitly cited authority whose rich status is `SOURCE_CITED`.

Implement `validateLegalIssueMatrix` with exact return shape:

```ts
export interface LegalIssueMatrixValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  orphanIssueIds: string[];
  coverageWithoutIssueIds: string[];
}

export function validateLegalIssueMatrix(
  matrix: LegalIssueMatrix,
  coverageMatrix: CoverageMatrix,
  caseAnalysis?: CaseAnalysis,
): LegalIssueMatrixValidation;
```

Validate coverage IDs, rich entity IDs, required issue links, explicit relation status and formal exceptions. Do not validate legal correctness.

- [ ] **Step 4: Run the complete matrix status and validation contracts**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts -t "client position|confirmed|conflict|research|orphan|readiness"`

Expected: PASS; the summary distinguishes blockers, research, client position, conflicts and unlinked relations, and research does not prevent matrix construction.

- [ ] **Step 5: Recheck the type boundary**

Run: `npm run typecheck`

Expected: PASS; no status helper writes to rich analysis or Coverage.

## Task 5: Explicit legacy fallback and rich-first dispatch

**Files:**

- Modify: `tests/legal-engine/legalIssueMatrix.test.ts`
- Modify: `lib/legal-engine/legalIssueMatrix.ts`

**Interfaces:**

- Consumes: canonical rich builder from Tasks 2–4 and existing legacy `LegalIssue` arrays.
- Produces: `sourceMode: 'RICH' | 'LEGACY_FALLBACK'`, with no semantic mixing between branches.

- [ ] **Step 1: Write failing rich-first and legacy regression contracts**

Add contracts 1, 2, 31 and 32:

```ts
it('ignores disagreeing legacy issues when rich analysis is present', () => {
  const analysis = makeFixtureFCaseAnalysis({
    claims: ['LEGACY CLAIM THAT MUST NOT DRIVE RICH PLANNING'],
    legalIssues: [{
      id: 'legacy-invented',
      type: 'LEGALITY',
      title: 'Legacy invented issue',
      parameter: 'Legacy parameter',
      challengedAct: 'Legacy act',
      contradiction: 'Legacy contradiction',
      affectation: 'Legacy affectation',
      consequence: 'Legacy consequence',
    }],
  });
  const document = makeFixtureDocument();
  const coverage = buildCoverageMatrix(analysis, document, document.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  expect(matrix.sourceMode).toBe('RICH');
  expect(matrix.issues.some((issue) => issue.id === 'legacy-invented')).toBe(false);
  expect(matrix.issues.some((issue) => issue.question.includes('LEGACY CLAIM'))).toBe(false);
});

it('uses an explicitly marked legacy adapter only when rich analysis is absent', () => {
  const analysis = makeFixtureFCaseAnalysis({ richCaseAnalysis: undefined });
  analysis.proceduralPosture.legalityIssues = [{
    id: 'legacy-issue-1',
    type: 'LEGALITY',
    title: 'Cuestión legacy de prueba',
    parameter: 'No debe copiarse',
    challengedAct: 'No debe copiarse',
    contradiction: 'No debe copiarse',
    affectation: 'No debe copiarse',
    consequence: 'No debe copiarse',
  }];
  const document = makeFixtureDocument();
  const coverage = buildCoverageMatrix(analysis, document, document.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  expect(matrix.sourceMode).toBe('LEGACY_FALLBACK');
  expect(matrix.issues[0].source.mode).toBe('LEGACY_FALLBACK');
  expect(matrix.issues[0].statusReason).toBe('LEGACY_ISSUE_REQUIRES_REVIEW');
});

it('keeps legacy generation behavior available for the fallback path', () => {
  const analysis = makeFixtureFCaseAnalysis({ richCaseAnalysis: undefined });
  const document = makeFixtureDocument();
  const coverage = buildCoverageMatrix(analysis, document, document.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  expect(matrix.sourceMode).toBe('LEGACY_FALLBACK');
});

it('does not create labor issues for a non-labor template from matter wording alone', () => {
  const analysis = makeFixtureFCaseAnalysis();
  const document = makeFixtureDocument();
  document.matter = 'civil';
  document.documentType = 'contestacion_demanda_civil';
  document.documentTypeLabel = 'Contestación de demanda civil';
  const coverage = buildCoverageMatrix(analysis, document, document.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  expect(matrix.issues.some((issue) => issue.question.toLocaleLowerCase().includes('laboral'))).toBe(false);
});
```

- [ ] **Step 2: Run the dispatch and regression tests**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts -t "rich analysis|legacy|labor"`

Expected: FAIL until the explicit source-mode dispatcher and adapter exist.

- [ ] **Step 3: Implement the two source modes**

Make `buildLegalIssueMatrix` branch only on `Boolean(caseAnalysis.richCaseAnalysis)`:

```ts
export function buildLegalIssueMatrix(input: {
  caseAnalysis: CaseAnalysis;
  coverageMatrix: CoverageMatrix;
}): LegalIssueMatrix {
  if (input.caseAnalysis.richCaseAnalysis) {
    return buildRichLegalIssueMatrix(input.caseAnalysis.richCaseAnalysis, input.coverageMatrix);
  }
  return buildLegacyFallbackLegalIssueMatrix(input.caseAnalysis, input.coverageMatrix);
}
```

The rich branch must never inspect `proceduralPosture.constitutionalIssues`, `proceduralPosture.legalityIssues` or `caseAnalysis.legalIssues`. The legacy adapter may project only legacy ID, title, explicit source reference and verified legacy relations. It must not copy answer-like fields; it marks the item `LEGACY_FALLBACK`, `UNLINKED`/review-required and never presents the fallback as rich canonical.

- [ ] **Step 4: Run the dispatch and regression contracts**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts -t "rich analysis|legacy|labor"`

Expected: PASS; rich data wins over disagreement, legacy fallback is explicit and non-labor output is not created by a matter heuristic.

- [ ] **Step 5: Recheck types**

Run: `npm run typecheck`

Expected: PASS with no change to the existing legacy `LegalIssue` interface.

## Task 6: DocumentPlan, DraftingPlan and IssuePlan propagation

**Files:**

- Modify: `tests/legal-engine/legalIssueMatrix.test.ts`
- Modify: `lib/legal-engine/documentPlan.ts`
- Modify: `lib/legal-engine/pipeline.ts`

**Interfaces:**

- Consumes: `LegalIssueMatrix` and structural validation from Tasks 1–5.
- Produces: `DocumentPlanResult.legalIssueMatrix`, `DraftingPlan.legalIssueMatrix`, `IssuePlan.legalIssueIds[]` and section plans based on canonical questions.

- [ ] **Step 1: Write failing plan-linkage contracts**

Add contract 19 at the plan layer and assert that rich issue plans use plural IDs and exact Coverage links:

```ts
import { buildDocumentPlan, buildDraftingPlan } from '@/lib/legal-engine/documentPlan';

it('propagates Coverage and canonical issue IDs through the document plan', () => {
  const analysis = makeFixtureFCaseAnalysis();
  const document = makeFixtureDocument();
  const template = {
    tipo: document.documentType,
    etiquetas: [document.documentTypeLabel],
    materia: document.matter,
    jurisdiccion: document.jurisdiction,
    procedimiento: 'contestación',
    rolAutor: 'demandado',
    objetivoProcesal: 'contestar',
  } as never;
  const result = buildDocumentPlan({ doc: document, template, caseAnalysis: analysis });
  expect(result.coverageMatrix).toBeDefined();
  expect(result.legalIssueMatrix?.sourceMode).toBe('RICH');
  const issueIds = new Set(result.legalIssueMatrix!.issues.map((issue) => issue.id));
  const plan = buildDraftingPlan(document, 0, analysis, result.coverageMatrix, result.legalIssueMatrix);
  const issuePlans = plan.sections.flatMap((section) => section.issuePlans || []);
  expect(issuePlans.some((issuePlan) => (issuePlan.legalIssueIds || []).some((id) => issueIds.has(id)))).toBe(true);
  expect(issuePlans.every((issuePlan) => !issuePlan.legalIssueIds || issuePlan.relatedCoverageItemIds?.every((id) => result.coverageMatrix!.items.some((item) => item.id === id)))).toBe(true);
});
```

- [ ] **Step 2: Run plan-linkage tests and verify the new fields are absent**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts -t "document plan|canonical issue IDs"`

Expected: FAIL because `DocumentPlanResult`, `IssuePlan` and `buildDraftingPlan` do not yet expose or consume the canonical matrix.

- [ ] **Step 3: Add plan fields and wire the layer order**

Extend the interfaces without removing legacy fields:

```ts
export interface IssuePlan {
  id?: string;
  issueId?: string;
  legalIssueIds?: string[];
  title?: string;
  factIds?: string[];
  evidenceIds?: string[];
  authorityIds?: string[];
  relatedCoverageItemIds?: string[];
}

export interface DraftingPlan {
  documentType: string;
  caseTitle: string;
  estimatedPages: number;
  estimatedWords: number;
  sections: SectionPlan[];
  caseTheory?: CaseTheory;
  argumentAxes?: ArgumentAxis[];
  coverageMatrix?: CoverageMatrix;
  legalIssueMatrix?: LegalIssueMatrix;
}
```

In `buildDocumentPlan`, construct Coverage first and call `buildLegalIssueMatrix` second. Return both in `DocumentPlanResult`. In `buildDraftingPlan`, accept an optional `legalIssueMatrixOverride` after the Coverage override; in the rich branch select issues by `targetSectionIds`, use `question` as the plan title/`legalIssues` value, and set `legalIssueIds: [issue.id]` plus the exact `relatedCoverageItemIds`. Do not create rich pseudo-issues from `ArgumentItem.id`. Preserve the existing legacy branch and its singular aliases.

- [ ] **Step 4: Run plan linkage and directly related regressions**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts tests/legal-engine/richDocumentPlan.test.ts tests/legal-engine/phase3CoverageMatrix.test.ts`

Expected: PASS for the new plural link and no regressions in existing rich document planning or Coverage behavior.

- [ ] **Step 5: Recheck type integration**

Run: `npm run typecheck`

Expected: PASS with the overload/optional parameter order consistent at every `buildDraftingPlan` caller.

## Task 7: GenerationTask plural IDs, scoped context and research planning

**Files:**

- Modify: `tests/legal-engine/legalIssueMatrix.test.ts`
- Modify: `lib/legal-engine/generationTasks.ts`
- Modify: `lib/legal-engine/coveragePolicy.ts`
- Modify: `lib/legal-engine/pipeline.ts`

**Interfaces:**

- Consumes: canonical issue plans and matrix from Task 6.
- Produces: `GenerationTask.legalIssueIds[]`, scoped context for only those issues and a plan-only `LEGAL_RESEARCH` task that never calls a provider.

- [ ] **Step 1: Write failing task and context contracts**

Add contract 20 and the research-specific continuation of contract 24:

```ts
import {
  buildGenerationTasksForSection,
  buildLegalResearchTaskForIssue,
  buildTaskContextPack,
  type GenerationTask,
} from '@/lib/legal-engine/generationTasks';

it('passes plural legal issue IDs from the plan to GenerationTask', () => {
  const { analysis, document, coverage, matrix } = buildFixtureMatrix();
  const issue = matrix.issues.find((candidate) => candidate.status === 'READY_FOR_GENERATION')!;
  const sectionPlan = {
    templateSectionId: issue.source.coverageItemId,
    title: 'ARGUMENTOS',
    objective: issue.question,
    sourceFacts: [],
    legalIssues: [issue.question],
    historicalReferences: [],
    expectedDepth: 'DEEP',
    expectedParagraphs: 2,
    coverageItemIds: issue.coverageItemIds,
    issuePlans: [{ id: `plan-${issue.id}`, legalIssueIds: [issue.id], title: issue.question, relatedCoverageItemIds: issue.coverageItemIds }],
  };
  const tasks = buildGenerationTasksForSection(sectionPlan, document, analysis, coverage);
  expect(tasks.some((task) => task.legalIssueIds?.includes(issue.id))).toBe(true);
  expect(tasks.every((task) => !task.legalIssueIds || task.legalIssueIds.every((id) => matrix.issues.some((candidate) => candidate.id === id)))).toBe(true);
});

it('builds scoped context from only the selected issue IDs', () => {
  const { analysis, document, coverage, matrix } = buildFixtureMatrix();
  const issue = matrix.issues.find((candidate) => candidate.issueType === 'CLAIM_ELEMENT')!;
  const task = {
    id: 'task-issue-scoped',
    documentId: document.id,
    sectionId: 'sec-argumentos',
    sectionTitle: 'ARGUMENTOS',
    taskType: 'ISSUE',
    type: 'ISSUE',
    legalIssueIds: [issue.id],
    coverageItemIds: issue.coverageItemIds,
    claimIds: issue.claimIds,
    factIds: issue.factIds,
    evidenceIds: issue.evidenceMentionIds,
    authorityIds: issue.authorityMentionIds,
    objective: issue.question,
    complexity: 'MEDIUM',
    tokenBudget: 1200,
    status: 'pending',
  } as GenerationTask;
  const context = buildTaskContextPack(task, document, analysis);
  expect(context.userMessage).toContain(issue.question);
  expect(context.userMessage).not.toContain('fixture-f-claim-2');
});

it('plans research without producing a final legal response', () => {
  const { matrix, document } = buildFixtureMatrix();
  const issue = matrix.issues.find((candidate) => candidate.status === 'NEEDS_RESEARCH')!;
  const researchTask = buildLegalResearchTaskForIssue(issue, document, 'sec-argumentos');
  expect(researchTask.taskType).toBe('LEGAL_RESEARCH');
  expect(researchTask.legalIssueIds).toEqual([issue.id]);
  expect(researchTask.status).toBe('pending');
});
```

- [ ] **Step 2: Run task/context tests and verify plural fields are missing**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts -t "plural legal issue|scoped context|research"`

Expected: FAIL because tasks currently use singular `targetIssueId`, context uses legacy `IssuePlan` fields and no research planning helper exists.

- [ ] **Step 3: Implement plural task linkage and the plan-only research task**

Add `legalIssueIds?: string[]` to `GenerationTask` and retain `targetIssueId?: string` as a legacy alias. Add `LEGAL_RESEARCH` to `GenerationTaskType` and implement:

```ts
export function buildLegalResearchTaskForIssue(
  issue: LegalIssueItem,
  doc: UniversalLegalDocument,
  sectionId: string,
): GenerationTask {
  return {
    id: `task-research-${issue.id}`,
    documentId: doc.id,
    sectionId,
    sectionTitle: doc.sections.find((section) => section.id === sectionId)?.title || 'Investigación jurídica',
    taskType: 'LEGAL_RESEARCH',
    type: 'LEGAL_RESEARCH',
    legalIssueIds: [issue.id],
    coverageItemIds: [...issue.coverageItemIds],
    factIds: [...issue.factIds],
    evidenceIds: [...issue.evidenceMentionIds, ...issue.evidenceOfferIds],
    authorityIds: [...issue.authorityMentionIds],
    objective: `Identificar los requisitos de investigación para la issue ${issue.id} sin resolverla ni afirmar aplicabilidad.`,
    complexity: 'MEDIUM',
    tokenBudget: 1200,
    status: 'pending',
  };
}
```

The rich task builder must resolve `legalIssueIds` against `doc.legalIssueMatrix`, copy only those issue relations and avoid the old `caseAnalysis` lookup. The canonical context pack must include the issue question, explicit entity IDs and research status only. For `LEGAL_RESEARCH`, `executeGenerationTask` must short-circuit before `runFastMode`, return a review/planning marker, and record the task; it must not browse, verify an authority or generate final legal prose. Extend `coveragePolicy.ts` with a reason such as `LEGAL_RESEARCH_REQUIRED` while retaining conflict and client-position blockers.

- [ ] **Step 4: Run task, scoped-context and no-provider research tests**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts tests/legal-engine/richGenerationTasks.test.ts -t "plural|scoped|research"`

Expected: PASS; ready issues receive plural IDs, context contains only selected relations, and research remains plan-only without a provider call.

- [ ] **Step 5: Recheck generation type integration**

Run: `npm run typecheck`

Expected: PASS with legacy `targetIssueId` callers still compiling and canonical callers using `legalIssueIds[]`.

## Task 8: GenerationTrace and structural QualityGate integration

**Files:**

- Modify: `tests/legal-engine/legalIssueMatrix.test.ts`
- Modify: `lib/legal-engine/generationTrace.ts`
- Modify: `lib/legal-engine/qualityGate.ts`
- Modify: `lib/legal-engine/pipeline.ts`

**Interfaces:**

- Consumes: matrix, plan and task contracts from Tasks 1–7.
- Produces: auditable Coverage → Issue → Task → Block ID links and structural finalization rules that distinguish research warnings from pipeline failure.

- [ ] **Step 1: Write failing trace and QualityGate contracts**

Add contracts 25 and 26:

```ts
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import type { GenerationTask } from '@/lib/legal-engine/generationTasks';

it('records Coverage-to-Issue-to-Task IDs without source corpus', () => {
  const { document, coverage, matrix } = buildFixtureMatrix();
  document.legalIssueMatrix = matrix;
  const trace = createGenerationTraceContext({ generationId: 'trace-fixture-f3', doc: document, options: { enabled: true, now: () => new Date(0) } });
  const issue = matrix.issues[0];
  const task = {
    id: 'task-trace-fixture',
    sectionId: issue.source.coverageItemId,
    sectionTitle: 'ARGUMENTOS',
    taskType: 'ISSUE',
    legalIssueIds: [issue.id],
    coverageItemIds: issue.coverageItemIds,
    complexity: 'MEDIUM',
    tokenBudget: 1200,
    status: 'pending',
  } as GenerationTask;
  trace.recordTaskPlanned(task);
  trace.snapshotCoverageBefore(coverage);
  const snapshot = trace.trace.coverageMatrixBeforeGeneration!;
  expect(snapshot.items.find((item) => item.id === issue.coverageItemIds[0])?.legalIssueIds).toContain(issue.id);
  expect(trace.trace.generationTasks[0].legalIssueIds).toEqual([issue.id]);
  expect(JSON.stringify(trace.trace)).not.toContain(issue.question);
});

it('keeps NEEDS_RESEARCH structural and non-final without stopping matrix planning', () => {
  const { document, matrix } = buildFixtureMatrix();
  document.legalIssueMatrix = matrix;
  const result = runQualityGateCheck(document);
  expect(result.warnings.some((warning) => warning.checkId.includes('LEGAL_RESEARCH'))).toBe(true);
  expect(result.canMarkAsFinal).toBe(false);
  expect(result.criticalErrors.some((error) => error.checkId.includes('LEGAL_RESEARCH'))).toBe(false);
});
```

- [ ] **Step 2: Run trace and QualityGate tests before integration**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts -t "Coverage-to-Issue|NEEDS_RESEARCH structural"`

Expected: FAIL because Coverage trace items do not expose issue IDs and QualityGate does not inspect the matrix.

- [ ] **Step 3: Add trace links and structural gate handling**

Add optional `legalIssueIds?: string[]` to Coverage trace items and coverage transitions. Populate `GenerationTaskTrace.legalIssueIds` from `task.legalIssueIds`, falling back to `[targetIssueId]` only for legacy tasks. In pipeline Stage 5, snapshot the matrix/plan before tasks; in Stage 8, call `validateLegalIssueMatrix` and merge its errors/warnings into QualityGate.

The QualityGate must:

- fail structurally for orphan issues, invalid IDs and required blockers caused by conflict or missing client position;
- emit a research warning and set `canMarkAsFinal = false` when a required issue remains `NEEDS_RESEARCH`;
- allow matrix construction, plan creation, trace creation and research-task planning to continue;
- never evaluate whether a legal proposition, norm or authority is correct.

Do not add issue questions or full source text to Trace. Store IDs, status, reasons, hashes and bounded existing excerpts only.

- [ ] **Step 4: Run trace and gate tests with existing trace regressions**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts tests/legal-engine/generationTaskTrace.test.ts tests/legal-engine/richCoverageQualityTrace.test.ts -t "Coverage-to-Issue|NEEDS_RESEARCH|trace|quality"`

Expected: PASS; traces contain the complete ID chain, research is non-final but non-terminal for planning, and existing trace behavior remains compatible.

- [ ] **Step 5: Recheck pipeline types**

Run: `npm run typecheck`

Expected: PASS with optional trace fields accepted by existing 1.0 trace consumers.

## Task 9: Focal validation and directly related regressions

**Files:**

- Modify: no additional source files; use the files produced by Tasks 1–8.

**Interfaces:**

- Consumes: all implemented FASE 3 contracts.
- Produces: fresh validation evidence for the focused matrix, related rich/legacy planning, task and trace paths.

- [ ] **Step 1: Run the complete FASE 3 contract file**

Run: `npx vitest run tests/legal-engine/legalIssueMatrix.test.ts`

Expected: PASS with all 32 contracts green.

- [ ] **Step 2: Run only directly related regressions**

Run:

```text
npx vitest run tests/legal-engine/richCoverageBuilder.test.ts tests/legal-engine/richCoverageLegacyRegression.test.ts tests/legal-engine/richDocumentPlan.test.ts tests/legal-engine/richGenerationTasks.test.ts tests/legal-engine/phase3CoverageMatrix.test.ts tests/legal-engine/generationTaskTrace.test.ts tests/legal-engine/richCoverageQualityTrace.test.ts
```

Expected: PASS with no change to rich-first dispatch, legacy fallback behavior, Coverage semantics, task tracing or QualityGate trace handling.

- [ ] **Step 3: Run the project typecheck**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 4: Run lint without treating pre-existing warnings as new failures**

Run: `npm run lint`

Expected: exit code 0 and no new lint errors attributable to FASE 3. Existing warnings may remain; do not broaden the scope to warning cleanup.

- [ ] **Step 5: Run the production build**

Run: `npm run build`

Expected: exit code 0, with no NVIDIA call, external E2E execution, database change or DOCX inspection.

## TDD contract index

The single new test file must contain exactly 32 named contracts, mapped as follows:

| Contract | Test location in plan |
|---:|---|
| 1 | Task 5, rich-first dispatch |
| 2 | Task 5, legacy fallback |
| 3 | Task 2, deterministic IDs |
| 4 | Task 2, repeated input |
| 5 | Task 2, no rich-analysis mutation |
| 6 | Task 2, no Coverage mutation |
| 7 | Task 3, claim Coverage |
| 8 | Task 3, fact Coverage |
| 9 | Task 3, EvidenceMention without offer |
| 10 | Task 3, explicit EvidenceOffer |
| 11 | Task 3, SourceArgument |
| 12 | Task 3, `SOURCE_CITED` remains unverified |
| 13 | Task 4, missing client position |
| 14 | Task 4, confirmed client position |
| 15 | Task 4, conflict dependency |
| 16 | Task 4, unlinked relation |
| 17 | Task 2, no similarity inference |
| 18 | Task 3, formal Coverage produces zero issues |
| 19 | Task 2 and Task 6, Coverage ↔ Issue |
| 20 | Task 7, Issue ↔ GenerationTask |
| 21 | Task 4, orphan issue detection |
| 22 | Task 4, blocked issue readiness |
| 23 | Task 4, ready issue readiness |
| 24 | Task 4 and Task 7, needs research |
| 25 | Task 8, trace chain |
| 26 | Task 8, structural QualityGate |
| 27 | Task 3, no defense invention |
| 28 | Task 3, no exception invention |
| 29 | Task 3, no statute invention |
| 30 | Task 3, no jurisprudence invention |
| 31 | Task 5, legacy regression |
| 32 | Task 5, non-labor template regression |

The final validation must report all 32 as one focused contract set; no full test harness is part of this plan.

## Scope stop condition

After Task 9 Step 5, stop. Do not add legal research calls, web access, SCJN access, new defenses/exceptions, argument expansion, renderer work, persistence, migrations, environment changes or unrelated refactors.
