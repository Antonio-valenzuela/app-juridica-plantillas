---
phase: 2026-09-13-legal-research-strategic-drafting-foundation
reviewed: 2026-09-13T20:01:01Z
depth: deep
files_reviewed: 5
files_reviewed_list:
  - lib/legal-engine/case-extraction/types.ts
  - lib/legal-engine/case-extraction/candidateSegmentation.ts
  - lib/legal-engine/case-extraction/arguments.ts
  - lib/legal-engine/case-extraction/orchestrator.ts
  - tests/legal-engine/richSourceIssueRelationships.test.ts
findings:
  critical: 2
  warning: 2
  info: 2
  total: 6
status: issues_found
---

# Phase 2026-09-13: Code Review Report

**Reviewed:** 2026-09-13T20:01:01Z  
**Depth:** deep  
**Files Reviewed:** 5  
**Status:** issues_found

## Summary

La prueba focalizada pasa (`4/4`), pero la implementación no satisface de forma segura el contrato source→legal issue. Una autoridad independiente puede convertirse en argumento por marcadores textuales; además, un párrafo con varios encabezados de agravios se conserva como un solo candidate y mezcla sus autoridades. Ambos defectos pueden fabricar relaciones jurídicas que no existen. También se aceptan candidatos rechazados o pendientes de revisión y se ignora la lista canónica `authorityIds`, lo que permite referencias huérfanas. No se encontró evidencia en el alcance revisado de que `SOURCE_CITED` se promocione directamente a `LEGALLY_VERIFIED`, pero la suite no cubre varios límites críticos.

## Critical Issues

### CR-01: Una autoridad independiente puede promocionarse a argumento

**Classification:** CRITICAL (BLOCKER)  
**File:** `lib/legal-engine/case-extraction/arguments.ts:22-25`

**Issue:** `argumentCandidate` devuelve `true` si el texto contiene cualquier marcador de argumento, sin excluir `candidate.kind === 'AUTHORITY'`. Por ejemplo, un candidato `AUTHORITY` con `Artículo 14 constitucional, por tanto es inconstitucional.` produce un `ArgumentItem` y queda enlazado con la autoridad del mismo candidate. Ese seed deja de ser verification-only y puede alimentar una relación estratégica inexistente, aunque la fuente sólo estuviera citando/verificando una autoridad.

**Fix:** Excluir explícitamente autoridades y exigir una señal estructural de argumento para candidatos no clasificados como argumento:

```ts
function argumentCandidate(candidate: ExtractionCandidate): boolean {
  if (candidate.kind === 'AUTHORITY') return false;
  const section = candidate.provenance.find((item) => item.section)?.section;
  return candidate.kind === 'ARGUMENT'
    || section === 'ARGUMENTOS'
    || ARGUMENT_SECTION_RE.test(candidate.rawText)
    || (candidate.kind === 'ASSERTION' && ARGUMENT_MARKER_RE.test(candidate.rawText));
}
```

### CR-02: Varios argumentos del mismo párrafo comparten un candidateId

**Classification:** CRITICAL (BLOCKER)  
**File:** `lib/legal-engine/case-extraction/candidateSegmentation.ts:51-64,136-144`

**Issue:** `wrappedArgumentBlocks` separa bloques con encabezados de conceptos/agravios, pero sólo se invoca para `TABLE` (línea 136). Para un `PARAGRAPH`, la condición `preservesWrappedLegalArgument` evita dividir por saltos de línea, y el párrafo completo recibe un único ID como `u:candidate:0`. En una prueba directa con dos encabezados `PRIMER CONCEPTO...` y `SEGUNDO CONCEPTO...`, se obtuvo un solo candidate. Como `extractAuthorityMentions` copia ese candidateId a todas las autoridades y `linkedAuthorities` relaciona por ese par exacto, la comprobación de identidad pasa mientras mezcla autoridades del primer argumento con el segundo. Es una relación falsa causada por una segmentación demasiado gruesa, no por proximidad explícita.

**Fix:** Aplicar el particionado de bloques a párrafos y tablas, conservando la provenance de cada bloque; o implementar un splitter equivalente para `PARAGRAPH` antes de la protección contra el split por líneas. Añadir una prueba con dos encabezados y una autoridad distinta por bloque que exija dos candidateIds y relaciones separadas.

## Warnings

### WR-01: Se extraen argumentos desde candidatos rechazados o pendientes de revisión

**Classification:** IMPORTANT (WARNING)  
**File:** `lib/legal-engine/case-extraction/arguments.ts:53-69`

**Issue:** `extractArguments` itera todos los candidatos y nunca consulta `candidate.decision`. Un candidato `REJECTED` o `REQUIRES_REVIEW` con `kind: 'ARGUMENT'` produce un `ArgumentItem` exactamente igual que uno `ACCEPTED`; la reproducción directa devolvió un argumento para ambas decisiones. Esto puede introducir relaciones no confiables y deja sin efecto el bloqueo que representa la decisión de clasificación.

**Fix:** Filtrar las decisiones permitidas en este límite, preferiblemente `ACCEPTED` y sólo cualquier estado representativo explícitamente definido para candidatos fusionados; conservar o propagar el estado de revisión si el contrato requiere materializarlo sin hacerlo elegible.

### WR-02: `authorityIds` no limita las referencias emitidas y permite IDs huérfanos

**Classification:** IMPORTANT (WARNING)  
**File:** `lib/legal-engine/case-extraction/arguments.ts:45-50`

**Issue:** `ArgumentExtractionContext` declara `authorityIds`, pero `linkedAuthorities` lo ignora y toma cualquier `authority.id` de `authorityMentions` que comparta provenance. Si `authorityMentions` contiene una mención stale, duplicada o eliminada por deduplicación pero `authorityIds` contiene el conjunto canónico, el argumento puede conservar un `citedAuthorityId` que no existe en el conjunto de autoridades materializado. También se pueden emitir IDs repetidos cuando la misma mención aparece dos veces en el contexto. El orquestador pasa actualmente listas alineadas, pero la función pública no protege el invariante “deduplicados y sin huérfanos”.

**Fix:** Intersectar con `new Set(context.authorityIds)` y deduplicar al final:

```ts
const allowedAuthorityIds = new Set(context.authorityIds);
return Array.from(new Set(
  (context.authorityMentions ?? [])
    .filter((authority) => allowedAuthorityIds.has(authority.id))
    .filter((authority) => authority.provenance.some((authorityProvenance) =>
      candidate.provenance.some((candidateProvenance) => sameCandidate(authorityProvenance, candidateProvenance)),
    ))
    .map((authority) => authority.id),
));
```

## Info

### IN-01: Los IDs de autoridad dependen del orden de entrada

**Classification:** MINOR (INFO)  
**File:** `lib/legal-engine/case-extraction/arguments.ts:100-110`

**Issue:** `authority-${authorities.length + 1}` hace que el mismo source candidate/citation reciba IDs distintos si cambia el orden de candidatos. Las relaciones del mismo run no quedan huérfanas, pero una reextracción, comparación o persistencia puede cambiar las claves de relación sin cambiar el contenido jurídico.

**Fix:** Derivar el ID de una identidad canónica que incluya `sourceId`, `candidateId` y una identidad determinista de la cita, con un sufijo estable sólo para citas realmente distintas.

### IN-02: La suite no cubre los invariantes de identidad y postura

**Classification:** MINOR (INFO)  
**File:** `tests/legal-engine/richSourceIssueRelationships.test.ts:72-135`

**Issue:** Las pruebas de propagación construyen manualmente `citedAuthorityIds` y usan `provenance: []`, por lo que no atraviesan la identidad `sourceId + candidateId` hasta la matriz. Tampoco cubren mismo `candidateId` con distinto `sourceId`, duplicados en `authorityMentions`, candidatos `REJECTED`/`REQUIRES_REVIEW`, párrafos con múltiples argumentos ni el bloqueo por postura del cliente. El test focalizado pasa aun con los fallos reproducidos arriba.

**Fix:** Añadir casos negativos y de integración que ejerzan la extracción real, verifiquen el par completo `sourceId + candidateId`, comprueben IDs únicos pertenecientes al conjunto canónico y aseguren que una postura desconocida no libera una relación para generación estratégica.

---

_Reviewed: 2026-09-13T20:01:01Z_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: deep_  

## Resolution follow-up — 2026-09-13

The findings above were recorded before the remediation pass. The current implementation addresses CR-01 and CR-02 by excluding citation-led authority-only candidates from argument materialization and by assigning separate candidate identities to multiple wrapped argument blocks while preserving any preamble. WR-01 is addressed by excluding `REJECTED` candidates; `REQUIRES_REVIEW` remains materialized as a conservative pending source candidate because that is the existing extraction contract. WR-02 is addressed by intersecting emitted authority IDs with the canonical `authorityIds` set and deduplicating them. New regression coverage exercises explicit same-candidate links, nearby-authority rejection, mixed argument-led candidates, rejected candidates, stale IDs, foreign source IDs, and wrapped-argument identity separation.

Verification after remediation: focused relationship/research suite `63/63` passed; typecheck passed; focal lint passed with `0` errors; full lint passed with `0` errors and `1178` existing warnings; full suite `2490 passed / 6 failed / 2 skipped`, with the same six historical failures and no new regression. IN-01 remains deferred because authority ID ordering is an existing identity contract outside this relationship slice.
