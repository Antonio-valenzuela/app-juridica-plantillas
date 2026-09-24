# Real Appeal Deliverable Implementation Plan

> **For agentic workers:** Execute inline on the current working tree. Do not commit or push.

**Goal:** Llevar la apelación real desde `NEEDS_REVIEW` a exportación DOCX/PDF entregable únicamente con material soportado.

**Architecture:** Conservar el pipeline actual de 17 secciones, sus checkpoints y `ensureTerminalJobState`. Corregir únicamente las fronteras de proyección, cobertura, extensión, verificación, polish y exportación demostradas por la corrida real.

**Tech Stack:** Next.js/TypeScript, Vitest, generación jurídica existente, exportadores DOCX/PDF actuales.

**Spec:** `C:/Users/yahir/.codex/attachments/c805d0e6-148d-46b7-a20b-12c999e7ccd3/Texto pegado.txt`

## Global Constraints

- No commit, no push, no Prisma, no migraciones, no OCR, no routing, no rediseño.
- No inventar personalidad, petitorios, agravios, hechos, pruebas, fechas, autoridades ni jurisprudencia.
- Mantener gates, 422, compatibilidad de status/polling/jobs y lifecycle existente.
- Después de cada fix: `npx tsc --noEmit`, `git diff --check` y rerun del mismo caso.
- No suite global ni build completo.

### Task 1: Trace pending fields and legal issue projections

**Files:** `lib/legal-engine/caseAnalysis.ts`, `lib/legal-engine/documentPreflight.ts`, existing focused tests.

- [ ] Add failing tests for source/instruction-supported personality and requested effects.
- [ ] Trace `MatterKnowledgeBase → case analysis → canonical fields → preflight` and `AgravioPlan → requestedEffect → petitorios`.
- [ ] Implement only safe projection fixes; preserve unresolved human fields.
- [ ] Run focused tests and one real rerun.

### Task 2: Add non-sensitive generation diagnostics

**Files:** `lib/legal-engine/generationExpansion.ts`, existing metrics tests.

- [ ] Add failing tests for issue/effect/source counts and duplicate metrics.
- [ ] Record counts and provider call metadata without prompts or legal content.
- [ ] Confirm `SectionContextPacket` bounds provider input.
- [ ] Run focused tests and one real rerun.

### Task 3: Correct supported extension and duplicate handling

**Files:** `lib/legal-engine/generationExpansion.ts`, `lib/legal-engine/generationExtension.ts`, `lib/legal-engine/qualityGate.ts` only where causal.

- [ ] Use unused supported material and explicit continuation tasks.
- [ ] Reject or reorient repeated continuation content without weakening duplicate thresholds.
- [ ] Expand only substantive sections and remeasure rendered pages.
- [ ] Run focused tests and one real rerun.

### Task 4: Verify, polish, and export the real document

**Files:** existing VERIFY/POLISH/materialization/export paths only if evidence requires.

- [ ] Run real VERIFY and POLISH after extension.
- [ ] Re-measure actual rendered PDF pages after polish.
- [ ] Export DOCX then PDF only when real readiness is deliverable.
- [ ] Inspect files, headings, sections, placeholders, duplicate ratio, and page count.

### Final verification

- [ ] `npx tsc --noEmit`
- [ ] `git diff --check`
- [ ] Focused tests only
- [ ] One real run using `DOC092126-09212026150739,papa.pdf`, `recurso_apelacion_civil`, `minPages=40`
