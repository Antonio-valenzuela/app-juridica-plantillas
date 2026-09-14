# Real Strategic Challenge Analyzer Implementation Plan

> For agentic workers: execute this plan task-by-task and verify each checkpoint before proceeding.

**Goal:** Ejecutar un analizador estratégico real, determinista en sus límites, que reciba un único `DecisionReasoningItem`, valide estrictamente propuestas 0..N y sólo materialice `StrategicChallengeCandidate`/`LegalResearchPlan` cuando la hipótesis sea específica, no conclusiva y esté anclada en la fuente.

**Architecture:** Reutilizar `StrategicChallengeProposal`, `validateStrategicChallengeProposal`, `createStrategicChallengeCandidate` y `buildStrategicChallengeResearchPlan`. Añadir un adaptador NVIDIA explícito, sin `routeStructuredAnalysis` ni fallback, con prompt acotado al razonamiento seleccionado y parser de JSON cerrado. La salida del modelo seguirá siendo propuesta; el sistema conservará identidad, estado, alcance, provenance, relaciones allowlisted y bloqueos.

**Tech Stack:** TypeScript, Vitest, `generateNVIDIACompletion`, contratos existentes de extracción/rich analysis/legal research.

## Global Constraints

- No reabrir contratos cerrados de extracción, cobertura, generación, NVIDIA transport, research verification, assembly ni editor.
- No web ni investigación jurídica real.
- Una sola llamada NVIDIA real, únicamente después de GREEN; sin retries ni fallback local.
- El modelo no puede producir estado, provenance, IDs de sistema, autoridad verificada, posición del cliente ni `legalIssueId`.
- Cero propuestas seguras es un resultado válido.
- No inferir relaciones por proximidad; los IDs deben pertenecer a allowlists estructurales.

## Checkpoints

### 1. Contract audit and RED

- Documentar el límite del adaptador respecto al transporte existente y la ausencia de `ultrareview.yml`.
- Añadir pruebas para parser estricto, salida 0..N, campos desconocidos/prohibidos, allowlists, semántica, no mutación y ausencia de fallback.
- Ejecutar únicamente el nuevo archivo y demostrar fallos RED antes de tocar producción.

### 2. Minimal analyzer implementation

- Implementar parser/normalizador de respuesta real y auditoría raw-shape.
- Construir prompt con sólo razonamiento, provenance acotada, contexto explícitamente allowlisted y scope; nunca el PDF/corpus completo.
- Conectar `generateNVIDIACompletion` mediante una dependencia inyectable en pruebas y una sola ruta real sin LLM adicional.
- Materializar candidatos y plan sólo tras schema + allowlist + semantic validation; preservar `RESEARCH_REQUIRED` y client adoption `0`.

### 3. Controlled GREEN and regressions

- Ejecutar tests focales, regresiones de strategic challenge/research, typecheck y lint focal.
- Confirmar que authority-only sigue verification-only y que no aparecen relaciones falsas.
- No avanzar al proveedor real mientras haya fallos nuevos.

### 4. One real reasoning execution

- Resolver dinámicamente un `DecisionReasoningItem` actual con provenance y attribution `RESOLUTOR`, prefiriendo el razonamiento de página 19 sólo si continúa presente.
- Hacer exactamente una llamada NVIDIA y capturar HTTP disponible, duración, parseo, cantidad de propuestas, tamaños, gaps, relaciones source y campos desconocidos/prohibidos.
- Crear como máximo los candidatos/planes que sobrevivan al contrato; no ejecutar research real.

### 5. Final verification and handoff

- Medir el PDF real antes/después, baseline global `2518 PASS / 6 FAIL / 2 skipped`, nuevas regresiones `0`.
- Revisar false relations, proximity contamination, authority seed promotion, client bypass, provenance e identity.
- Actualizar roadmap sólo con los hallazgos de este checkpoint y reportar el siguiente root cause sin saltar de fase.

## Definition of Done

- Analyzer audited, RED demonstrated, controlled GREEN passed.
- Exactly one real reasoning selected and one real NVIDIA attempt executed after GREEN.
- Raw shape and strict rejection evidence captured.
- Candidate/plan created only for a valid hypothesis; otherwise safe zero.
- No research real, no client mutation, no authority promotion, no fabricated relation, no new regression.
