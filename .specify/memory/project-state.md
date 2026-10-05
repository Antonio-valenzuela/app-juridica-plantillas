# Estado persistente — LexPlantillas

Actualizado: 2026-10-05. Bug activo: `.specify/bugs/contestaciones-ui-generation-closure` (PARTIAL).

## Objetivo

Motor legal de escritorio (Next.js 16 App Router + Prisma/Neon + Vitest) que redacta
escritos jurídicos con metodología de la Guía Operativa LEX PLANTILLAS, gates de
calidad fail-closed y ciclo DRAFT/FINAL.

## Decisiones ya tomadas (no revertir sin demostrar regresión)

- **Admisión por proposición**, nunca por sección. Commit `1b530c7` introdujo el gate
  que rechazaba la sección completa; corregido con taxonomía A–H y remediación
  `SPAN` / `EXPAND_TO_SENTENCE_END` / `SENTENCE`.
- **Guía Operativa = metodología interna**, no autoridad. 212 págs, v1.0, hash `b3910bb8…`.
- **Motor de familias**: los tipos sin plantilla propia se materializan desde el
  blueprint de su familia (`lib/legal-engine/documentFamilyBlueprints.ts`, 22 blueprints /
  7 engines). 56 variantes dejaron de lanzar `UNKNOWN_DOCUMENT_TYPE`.
- **`functionalStatus` por evidencia**, no por lista. `FUNCTIONAL_STATUS_OVERRIDES` vacío.
  Evidencia: `tests/catalog/writingTypeEvidence.test.ts` → `lib/catalog/writingTypeEvidence.generated.ts`.
- **FINAL fail-closed**: `canExportDocumentFinal` exige PASS **y** `humanReview === 'APPROVED'`.
  PASS técnico habilita DRAFT, nunca FINAL.
- **CONTRATO FORMULARIO OFICIAL (restaurado)**: `REQUIRES_OFFICIAL_FORM` y
  `ASSISTED_DRAFT` **no** son generables aunque tengan plantilla
  (`buildDocumentIdentifier` corta por `status !== 'IMPLEMENTED'`; `documentRouting`
  bloquea). Violarlo fue una regresión ya revertida.

## Estado de los 277 tipos

```
TIPOS VISIBLES: 277   CANÓNICOS: 221   VARIANTES: 56   ALIASES: 3
IMPLEMENTED: 265      IMPLEMENTED_BUT_UNCERTIFIED: 12   NOT_IMPLEMENTED: 0
DRAFT CAPABLE: 277    FUNCTIONAL PASS: 277   FAIL: 0   BLOCKED_EXTERNAL: 0
HUMAN REVIEW PENDING: 277
0 huérfanos · 0 IDs duplicados · 0 blueprints/strategies faltantes
0 fallbacks genéricos incorrectos · 0 secciones vacías
```

Los 12 `IMPLEMENTED_BUT_UNCERTIFIED` son `REQUIRES_OFFICIAL_FORM` /
`ASSISTED_DRAFT`: no generables por contrato de producto.

## Política DRAFT/FINAL

```
DRAFT  → permitido si el pipeline técnico es válido
FINAL  → PASS técnico + aprobación humana + gates del documento concreto
         (pendingFields, authorities, provenance, coverage, qualityGate, preflight, lifecycle)
```

## Bugs cerrados

- Regresión de generación (admisión por sección) → granular.
- Proemio duplicado en apelación (secciones `identity` indistinguibles).
- Contaminación amparo/federal en apelación civil.
- Profundidad `Extensa` sin efecto en secciones `custom`.
- Retrieval del Manual que excluía la metodología de agravio.

## Bugs abiertos

- `contestaciones-ui-generation-closure` — PARTIAL:
  - ✅ contrato de formulario oficial (11 tests)
  - ✅ UI PASS+PENDING no se muestra como FAIL (6 tests)
  - ✅ acoplamiento Apelación/Contestación (13 tests)
  - ✅ única fuente `generationBlockers[]`
  - ❌ doble scrollbar vertical
  - ❌ selector de 277 sin búsqueda/agrupación
  - ❌ `contestacionesCatalogCapabilities` (3), `sourceOutputCompatibilityMatrix` (2),
    `loop8bPhase2a/2b` (2) siguen con expectativas del estado previo

## Tests de referencia

| Suite | Resultado |
|---|---|
| `tests/catalog/writingTypeContract.test.ts` | 281/281 |
| `tests/catalog/writingTypeFamilyGeneration.test.ts` | 10/10 |
| `tests/catalog/writingTypeMaterialization.test.ts` | 16/16 |
| `tests/catalog/writingTypeEvidence.test.ts` | 277/277 |
| `tests/security/unsavedDraftExport.test.ts` + `draftExportRealRoutes.test.ts` | 13/13 |

## Notas de entorno

- **Neon**: el proyecto devolvió `ERROR: Your account or project has exceeded the quota`.
  Sin identidad de workspace no hay generación por API. Es bloqueo **ambiental**:
  no se sortea parcheando auth ni persistencia.
- Identidad local: `npm run dev` con `DEMO_MODE_ENABLED=true` (escape documentado en
  `lib/security/lawyerAuth.ts`, limitado a desarrollo). El standalone de producción
  fuerza `NODE_ENV=production` y no lo aplica.
- `providerRouter` exige `externalProviderOptIn` (consentimiento explícito del usuario,
  `window.confirm` en la UI). Sin ese flag no hay llamadas a providers.
- La extensión `agent-context` de Spec Kit busca `python3`; en Windows sólo existe
  `python`. Ejecutar el script Python directamente.

## Spec Kit

- Integración: `opencode` (`.opencode/commands/`, multi-install safe).
- Extensions: `agent-context`, `bug`.
- Constitución: `.specify/memory/constitution.md` (v1.0.0).
- Comandos: `/speckit.specify|plan|tasks|implement|converge`,
  `/speckit.bug-assess|bug-fix|bug-test`, `/speckit.agent-context.update`.
---

## ACTUALIZACIÓN 2026-10-05 — generator-quality-evidence-closure (PARTIAL)

### P0-A: fuga de UI del LocalProvider a escritos jurídicos

`lib/ai/providers/local.ts` es a la vez asistente de chat y fallback de generación.
`isPageQuery` marcaba `message.includes("sección")` como consulta de pantalla y
devolvía ayuda de UI dentro de prompts jurídicos.

**Reproducido**: un prompt con "sección" filtraba 6/6 patrones
("Resumen de la pantalla actual", "Panel Principal", "Jurídico Radar",
"Te encuentras en", "Dashboard", "Inteligencia Regulatoria").

**Corregido**: `AIRequest.purpose: 'UI_ASSISTANT' | 'LEGAL_GENERATION'`.
Con `LEGAL_GENERATION` el LocalProvider NUNCA devuelve UI: devuelve
`PROVIDER_UNAVAILABLE` (`success:false`, `origin:'PROVIDER_UNAVAILABLE'`) con el
marcador seed
`[REQUIERE DESARROLLO JURÍDICO: PENDIENTE DE GENERACIÓN — proveedor de IA no disponible (PROVIDER_UNAVAILABLE)]`.
Marcado con `purpose` en `pipeline.ts:1549`, `generationTasks.ts:1440/1510/1661`,
`issueScopedGeneration.ts:1453`. Sin `purpose` el chat conserva su comportamiento.
Tests: `tests/ai/localProviderLegalIsolation.test.ts` 5/5.

### PASS honesto: 265 PASS + 12 FAIL (antes 277 PASS falsos)

`computeFunctionalStatus(id, productStatus)` devuelve FAIL para
`REQUIRES_OFFICIAL_FORM` y `ASSISTED_DRAFT`: un tipo no generable por routing no
puede ser PASS de generación. `capabilities.draft` deriva de
`canGenerateDocumentDraft()`.

```
VISIBLE 277 · CANONICAL 221 · VARIANTES 56 · ALIASES 3
IMPLEMENTED 265 · IMPLEMENTED_BUT_UNCERTIFIED 12 · NOT_IMPLEMENTED 0
FUNCTIONAL PASS 265 · FUNCTIONAL FAIL 12 · DRAFT CAPABLE 265
INCONSISTENTES (draftable && !PASS) = 0
ORPHANS 0 · DUP IDS 0 · FALLBACKS INCORRECTOS 0 · SECTIONS VACÍAS 0
```

### ADVERTENCIA — el snapshot ya NO es evidencia

`lib/catalog/writingTypeEvidence.generated.ts` sigue marcando 277/277.
**No usarlo** hasta que exista el generador único (§8) y el test
`LIVE EVIDENCE === SNAPSHOT`.

### Pendiente de esta fase

§4 admission guard `UI_ASSISTANT_CONTENT_LEAK` · §5 redefinir PASS (hechos,
prestaciones, derecho, excepciones, anti-boilerplate) · §6 DOCX body real vía
mammoth · §7 texto PDF con pdf-parse · §8 snapshot reproducible ·
§10 ACCEPTS_ANY + default deny · §11 Apelación end-to-end · §12 `npm ci` limpio ·
§13 fixtures versionados · §23 build/E2E.

FINAL HUMAN APPROVAL WORKFLOW = FOLLOW-UP. FINAL sigue fail-closed.