# Final Legal Readiness Audit Implementation Plan

> **For agentic workers:** execute this plan task-by-task in the current working tree. Do not commit or push unless the user explicitly authorizes it.

**Goal:** Run and, only where proven necessary, repair the existing APP-plantillas legal pipeline so six distinct real cases produce evidence-backed DOCX/PDF pairs and the final Markdown, DOCX, and PDF readiness reports.

**Architecture:** Extend the existing upload-analysis, generation-job, legal pipeline, validation, editor, and universal exporters. Keep the six ZIP inputs in an isolated audit tree and use one general PowerShell/TypeScript runner driven by manifests rather than case-specific logic.

**Tech Stack:** Next.js 16.3.4, React 19, TypeScript, Prisma/PostgreSQL, existing NVIDIA/local provider chain, Mammoth/PDF/OCR extraction, `docx`, Vitest, Testing Library, Playwright, PowerShell, bundled document/PDF tooling.

**Spec:** `docs/blueprints/final-legal-readiness-blueprint-2026-09-26.md`

## Global Constraints

- Preserve the current working tree and existing changes; no commit, push, reset, or destructive checkout.
- Do not add multi-user roles, billing, collaboration, Windows packaging, installers, or case-specific hardcodes.
- `Datos.zip` is test input only; it must not become production data.
- No invented names, dates, facts, parties, authorities, statutes, jurisprudence, procedural acts, or client positions.
- Keep `REQUIERE_REVISIÓN`, readiness, quality, provenance, manual-edit, and export guards fail-closed.
- Use PowerShell for the real run and retain exact commands, timings, warnings, errors, provider metadata, output hashes, and render evidence.
- Do not claim visual or full-flow success without fresh render and E2E evidence.

---

### Task 1: Baseline and working-tree evidence

**Files:**
- Read: `package.json`, `.env.example`, `prisma/schema.prisma`, `AGENTS.md`, `CLAUDE.md`
- Read: `scripts/trace-real-appeal.ps1`, `scripts/validate-e2e-real.mts`, `scripts/release-gate.mjs`
- Create: `audit/final-legal-readiness-2026/baseline/README.md`
- Create: `audit/final-legal-readiness-2026/baseline/environment.json`

**Interfaces:**
- Consumes: current checkout, package scripts, environment variable names only.
- Produces: timestamped baseline and a clean distinction between fresh evidence and historical reports.

- [ ] **Step 1: Record current Git and runtime state**

Run from PowerShell:

```powershell
Set-Location 'C:\Users\yahir\Desktop\APP-plantillas'
git status --short --branch
git log -5 --oneline --decorate
node --version
npm --version
Get-Command soffice.exe,winword.exe -ErrorAction SilentlyContinue | Select-Object Name,Source
```

Expected: current branch and dirty files are recorded; no secrets are printed.

- [ ] **Step 2: Run baseline compiler, lint, focused tests, and build**

Run each command separately and capture exit code and output:

```powershell
npm run typecheck
npm run lint
npm run test -- tests/acceptance/sourceGroundedContestacion.test.ts tests/acceptance/exportUniversal.acceptance.test.ts tests/integration/analyzeUploadAsyncRoute.test.ts tests/integration/uploadAnalysisCache.test.ts
npm run build
```

Expected: report the actual result of each command; do not use historical counts as current proof.

- [ ] **Step 3: Write baseline evidence**

Save command, timestamp, exit code, warning count, error count, and notes in `baseline/README.md`. Mark any known environmental failure, such as database quota or missing renderer, as a blocker to be investigated rather than as a code failure.

---

### Task 2: Select six distinct ZIP cases without contaminating production

**Files:**
- Create: `scripts/select-final-legal-readiness-cases.ps1`
- Create: `audit/final-legal-readiness-2026/selection-manifest.json`
- Create: `audit/final-legal-readiness-2026/cases/01..06/source/`
- Test: `tests/integration/finalLegalReadinessManifest.test.ts`

**Interfaces:**
- Consumes: `C:\Users\yahir\Desktop\Datos.zip` central directory.
- Produces: six source manifests with archive-relative paths, extensions, sizes, hashes after extraction, and selection rationale.

- [ ] **Step 1: Add a manifest-contract test**

Write a test that rejects a manifest unless it contains exactly six unique archive-relative paths, six unique case IDs, source SHA-256 values, and no path under `data/uploads`, `prisma`, or a production storage directory.

- [ ] **Step 2: Run the test before implementation**

Run:

```powershell
npm run test -- tests/integration/finalLegalReadinessManifest.test.ts
```

Expected: the new test fails because the production helper/manifest does not yet exist. If it passes immediately, inspect whether the test is accidentally testing only its fixture.

- [ ] **Step 3: Implement the smallest selection helper**

Use `[IO.Compression.ZipFile]::OpenRead()` to enumerate the central directory without extracting the 4.6 GB archive. Select candidates by real extension and archive path, then copy only the six selected entries into the audit tree. Do not infer legal type from filename alone; the filename is only a candidate signal.

- [ ] **Step 4: Run the manifest test green**

Run the same test and inspect the generated manifest. Confirm it contains six genuinely different cases and no duplicate backup copy of the same document.

- [ ] **Step 5: Perform read-only content inventory**

For each selected source, record format, page count, extracted text length, extraction method, and whether it is complete enough to enter generation. If a candidate is only a prior contestation and lacks a source case, replace it with a source-backed case rather than generating from its output.

---

### Task 3: Distill the two supplied DOCX references and unblock rendering

**Files:**
- Read: `C:\Users\yahir\Downloads\Recurso_Apelacion_Actualizado_2026_Galarza_Meza.docx`
- Read: `C:\Users\yahir\Downloads\Recurso_de_Apelacion_Galarza_Meza_actualizado.docx`
- Create: `audit/final-legal-readiness-2026/reference-comparison/`
- Create: `audit/final-legal-readiness-2026/reference-comparison/reference-style.md`

**Interfaces:**
- Consumes: reference DOCX files, bundled documents runtime, and a supported renderer.
- Produces: hashes, section/style audits, render paths, and an explicit list of visual features to compare.

- [ ] **Step 1: Preserve references and record hashes**

Run SHA-256 and document metadata without modifying the Downloads files. Record the current findings: sections, margins, fonts, paragraph counts, tables, headers, footers, placeholders, and review notes.

- [ ] **Step 2: Resolve the renderer blocker**

Search installed paths and PATH for `soffice.exe`. If not found, use the approved Windows installation route or an installed Word automation fallback only after documenting the renderer and keeping the reference files read-only. Do not mark visual QA passed while the renderer is unavailable.

- [ ] **Step 3: Render every reference page**

Run the bundled `render_docx.py`, inspect page PNGs at 100%, and record first/middle/final page observations. If rendering fails, preserve logs and diagnose the renderer before retrying.

- [ ] **Step 4: Write the comparison contract**

Document actual margins, typeface, title hierarchy, header/footer, numbering, paragraph rhythm, table treatment, signature block, page density, and intentional review markers. Do not copy their legal facts into test fixtures or production code.

---

### Task 4: Build one general real-run evidence runner

**Files:**
- Modify: `scripts/trace-real-appeal.ps1` only if the existing trace is generalizable; otherwise create `scripts/trace-final-legal-readiness.ps1`
- Create: `scripts/final-legal-readiness-run.mts` only if existing `validate-e2e-real.mts` cannot be parameterized safely
- Create: `audit/final-legal-readiness-2026/run-summary.json`
- Test: `tests/integration/finalLegalReadinessEvidence.test.ts`

**Interfaces:**
- Consumes: per-case manifest, running app at `http://localhost:3200`, existing API contracts.
- Produces: stage timeline, provider attempts, terminal state, validation, export paths, hashes, and case verdict.

- [ ] **Step 1: Define evidence assertions first**

Add a test that accepts a case evidence record only when it contains every required stage from `source` through `pdfExport`, monotonically increasing timestamps, a terminal status, and explicit values for readiness and quality gates.

- [ ] **Step 2: Run the evidence test RED**

Run:

```powershell
npm run test -- tests/integration/finalLegalReadinessEvidence.test.ts
```

Expected: fail because no general six-case evidence record exists yet.

- [ ] **Step 3: Implement parameterized orchestration**

Extend the existing PowerShell trace contract to accept a manifest path and output directory. Use the same upload, status polling, generation, review, DOCX export, and PDF export routes that the UI uses. Record request IDs and idempotency keys, but redact secrets and full source text from logs.

- [ ] **Step 4: Add timing boundaries**

Measure upload, extraction, OCR, classification, analysis, context, planning, generation, validation, assembly, DOCX export, PDF export, and render separately. Avoid arbitrary sleeps except for polling intervals; stop on terminal state.

- [ ] **Step 5: Run the evidence test GREEN**

Run the focused test and a dry-run manifest validation. Do not call the provider or database in the unit test; the real runner is verified in the E2E tasks.

---

### Task 5: Execute the six real E2E cases and classify failures

**Files:**
- Create: `audit/final-legal-readiness-2026/cases/01..06/analysis.json`
- Create: `audit/final-legal-readiness-2026/cases/01..06/logs/powershell.log`
- Create: `audit/final-legal-readiness-2026/cases/01..06/case-report.md`
- Read-only review: upload, generation, status, review, DOCX, and PDF routes.

**Interfaces:**
- Consumes: six selected source files and running app.
- Produces: fresh evidence for source extraction, classification, analysis, generation, validation, and terminal state.

- [ ] **Step 1: Start the app and verify health**

Run `npm run dev` in a controlled terminal, verify `/machotes` responds, and record startup output. If the database or provider is unavailable, preserve the exact error and continue only with safe deterministic paths.

- [ ] **Step 2: Run case 01 and inspect the full trace**

Do not launch all six until the first case proves the runner captures the required evidence. Record the causal boundary for any failure.

- [ ] **Step 3: Run cases 02 through 06**

Use separate output directories and request IDs. Never reuse a document ID, job ID, idempotency key, or stale analysis from another case.

- [ ] **Step 4: Review source-derived content**

For each case, compare detected parties, dates, authorities, claims, facts, requested relief, and source references to extracted source material. Any unsupported value becomes a validation failure or explicit pending marker.

- [ ] **Step 5: Classify failures before editing**

Group each issue as input/source quality, extraction/OCR, classification/routing, context/provenance, generation/provider, persistence/job lifecycle, semantic validation, assembly, export, rendering, or environment. Do not fix symptoms across groups.

---

### Task 6: Repair only proven causes with RED → GREEN

**Files:**
- Modify only files proven causal by Task 5.
- Test: the narrowest existing test file for the causal contract.

**Interfaces:**
- Consumes: one reproducible failure and its trace.
- Produces: focused regression test, minimal implementation change, and a repeatable green result.

- [ ] **Step 1: Trace the causal chain**

Use CodeGraph and exact source lines to trace source input → parser → state → validator → assembler/exporter. Preserve the failing case evidence before any edit.

- [ ] **Step 2: Write one failing regression test**

The test must express the missing behavior, use a controlled fixture or existing case-safe data, and fail for the identified reason. Run it and retain the RED output.

- [ ] **Step 3: Implement one minimal generalizable fix**

Do not add filename, name, expediente, or matter exceptions. Do not weaken a guard. Do not add a second engine.

- [ ] **Step 4: Run focused GREEN and adjacent regression**

Run the new test, its nearest suite, and the affected acceptance/integration suite. If the test fails for a new reason, return to root-cause investigation instead of layering another fix.

- [ ] **Step 5: Rerun the affected real case**

Confirm the real evidence changed at the causal boundary and that no source/provenance/readiness gate was bypassed.

---

### Task 7: Export, render, and inspect six DOCX/PDF pairs

**Files:**
- Create: `audit/final-legal-readiness-2026/cases/01..06/outputs/`
- Create: `audit/final-legal-readiness-2026/cases/01..06/renders/`
- Create: `audit/final-legal-readiness-2026/cases/01..06/validation.json`
- Test: existing export acceptance suites plus any focused regression from Task 6.

**Interfaces:**
- Consumes: validated assembled documents and export guard state.
- Produces: valid DOCX/PDF binaries, hashes, page counts, extracted text checks, renders, and visual observations.

- [ ] **Step 1: Export only when the mode permits it**

For `REQUIERE_REVISIÓN`, export only an explicitly marked draft if the existing contract allows it. Attempting FINAL must return the existing normalized guard error and must not create a misleading final artifact.

- [ ] **Step 2: Validate DOCX structure**

Check ZIP/OOXML validity, document XML presence, nonzero bytes, no technical markers, no accidental placeholders, and trace/export manifest consistency.

- [ ] **Step 3: Validate PDF structure**

Check `%PDF` signature, page count, extracted text, page markers, nonzero bytes, and absence of technical markers.

- [ ] **Step 4: Render every output**

Render DOCX and PDF pages with the bundled tools. Inspect first, middle, and final pages; inspect every page for short documents. Record clipping, broken tables, empty pages, orphan headings, bad margins, missing glyphs, and signature/footer problems.

- [ ] **Step 5: Rerun after every layout correction**

Keep the reference and final package inventories. Do not silently change page profile or shrink content to force a target page count.

---

### Task 8: Generate three final reports

**Files:**
- Create: `FINAL_LEGAL_READINESS_REPORT.md`
- Create: `FINAL_LEGAL_READINESS_REPORT.docx`
- Create: `FINAL_LEGAL_READINESS_REPORT.pdf`
- Create: `audit/final-legal-readiness-2026/report-source.md`
- Create: `audit/final-legal-readiness-2026/report-renders/`

**Interfaces:**
- Consumes: baseline, selection manifest, six case reports, reference comparison, tests, build output, and render observations.
- Produces: one full Markdown report and faithful DOCX/PDF review versions.

- [ ] **Step 1: Write the Markdown report from evidence**

Include all 23 requested report sections, exact paths, commands, timings, error/warning/retry counts, provider/model metadata, changes, tests, build result, no-invention evidence, risks, blockers, and Windows recommendation.

- [ ] **Step 2: Add the final case table**

Use only measured values:

```markdown
| Caso | Fuente | Tipo detectado | Generación | Fact-check | Legal-check | DOCX | PDF | Visual | Resultado |
|---|---|---|---|---|---|---|---|---|---|
```

- [ ] **Step 3: Create the report DOCX**

Use the documents skill, mark the artifact operation before authoring, apply a professional report hierarchy, preserve all material findings, render, inspect, and iterate.

- [ ] **Step 4: Create the report PDF**

Export the report DOCX or use the existing PDF path according to the verified document tooling. Render and inspect the PDF.

- [ ] **Step 5: Verify cross-format completeness**

Compare Markdown headings and case verdicts with DOCX/PDF extracted text. The review formats may reflow but must not omit blockers, failures, or important evidence.

---

### Task 9: Full regression and final readiness verdict

**Files:**
- Read: all generated reports and evidence.
- Modify: only if a regression is proven and repaired through Task 6.

- [ ] **Step 1: Run full required commands**

```powershell
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:e2e
npm run build
```

Also rerun the six-case PowerShell runner and verify every DOCX/PDF output still exists and hashes match its manifest.

- [ ] **Step 2: Attribute every failure**

Separate legal-flow failures from unrelated historical/provider/database/environment failures. A passing HTTP request or provider health check cannot close a semantic or export failure.

- [ ] **Step 3: Apply the completion table**

Mark a case `PASS` only if generation, fact-check, legal-check, DOCX, PDF, and visual gates all pass. A `REQUIERE_REVISIÓN` case remains a correct blocked result but does not count as one of six approved cases.

- [ ] **Step 4: Verify report artifacts**

Check the three report files, their hashes, readable rendering, and links to every case artifact. Confirm the working tree diff contains only intended audit/repair changes and existing user changes remain intact.

- [ ] **Step 5: Stop without Windows packaging**

Report the exact readiness state and the later Windows packaging recommendation. Do not add desktop wrapper code in this phase.
