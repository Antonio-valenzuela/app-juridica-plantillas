# Contestaciones Upload Performance Implementation Plan

> **For agentic workers:** Execute this plan inline over the current working tree. Do not create commits, push, pull, or modify GitHub.

**Goal:** Make Contestaciones show the selected PDF immediately while OCR and legal analysis run as a real, cancellable, cache-aware background job without weakening source validation or generation gates.

**Architecture:** Preserve the existing synchronous `POST /api/templates/analyze-upload` contract for current callers and tests. Add an opt-in asynchronous analysis mode for Contestaciones backed by a small in-memory job store with real page progress, a versioned local SHA-256 cache, and a status endpoint. Extend the existing extractor rather than creating a second OCR engine: select pages from native extraction, render only selected ranges, use bounded Tesseract concurrency, and expose safe timing metadata without logging legal text.

**Tech Stack:** Next.js 16 App Router, TypeScript, React, Vitest, Playwright, `pdf-parse`, Poppler `pdftoppm`, `tesseract.js`, Node `crypto`, `%LOCALAPPDATA%` filesystem cache.

**Spec:** `Texto pegado.txt` supplied in the user request; source copy is the attached request, not a production instruction file.

## Global Constraints

- Continue exactly from the current local working tree.
- No GitHub, no commit, no push, no pull.
- Do not lower OCR quality, skip required OCR, mark `sourceValidated` early, invent progress, or bypass generation/readiness gates.
- Keep the existing synchronous upload response compatible with current callers.
- Never log extracted legal text, OCR text, or cache contents.
- Do not run the real appeal E2E automatically.
- Keep cache identity based on SHA-256 plus extractor/OCR configuration version, never filename alone.

### Task 1: Baseline and safe extraction telemetry

**Files:**
- Create: `tests/benchmarks/contestacionesUploadBaseline.ts` or an equivalent ignored local benchmark script.
- Modify: `lib/pdf/documentExtractor.ts`
- Modify: `lib/pdf/ocrProviders.ts`
- Test: `tests/acceptance/ocrAcceptance.test.ts`

- [ ] Record the real 44-page PDF baseline before production behavior changes: file receive, metadata, native extraction, OCR preparation, OCR, normalization, classification, validation, and total. Record only timings, page counts, character counts, status, and warnings count.
- [ ] Add a typed `analysisMetrics` object with `documentAnalysisDurationMs`, `nativeExtractionDurationMs`, `ocrPreparationDurationMs`, `ocrDurationMs`, `ocrPages`, `totalPages`, `cacheHit`, `extractionStatus`, and bounded concurrency.
- [ ] Measure stages with monotonic timers and preserve the current quality calculations and lifecycle fields.
- [ ] Add tests proving metrics contain no extracted text and that existing OCR results preserve `sourceValidated`, quality status, and warnings.

### Task 2: Versioned local extraction cache

**Files:**
- Create: `lib/upload-analysis/cache.ts`
- Modify: `app/api/templates/analyze-upload/route.ts`
- Modify: `lib/uploadAnalysisCache.ts`
- Test: `tests/integration/uploadAnalysisCache.test.ts`

- [ ] Compute SHA-256 from the received buffer before OCR.
- [ ] Store and read extraction/analysis results under `%LOCALAPPDATA%\\LexPlantillas\\upload-analysis-cache`, using a key containing SHA-256, extractor version, OCR configuration/version, and schema version.
- [ ] Write atomically and tolerate missing, corrupt, stale, or unreadable cache entries by treating them as cache misses.
- [ ] Reuse a valid result for the same hash/configuration in both synchronous and asynchronous flows; update only request-local filename/mime metadata on a hit.
- [ ] Add tests for same-hash hit, different-hash miss, version invalidation, filename independence, corrupt entry, and cache metadata without logs.

### Task 3: Selective OCR and bounded concurrency

**Files:**
- Modify: `lib/pdf/ocrProviders.ts`
- Modify: `lib/pdf/documentExtractor.ts`
- Test: `tests/acceptance/ocrAcceptance.test.ts`
- Test: `tests/integration/selectiveOcr.test.ts`

- [ ] Select pages requiring OCR from native per-page text using the existing density/quality thresholds; if page-level native data is unavailable, conservatively select all pages.
- [ ] Extend OCR input with selected page numbers and a progress callback while keeping existing callers valid.
- [ ] Render only selected page ranges with Poppler and preserve original page numbers.
- [ ] Recombine native-valid pages with OCR pages in document order; never mark a source valid unless the unchanged quality contract passes over the combined text.
- [ ] Add configurable `OCR_CONCURRENCY` with conservative default `2`, clamped to a safe range, and test concurrency selection without launching unbounded workers.
- [ ] Benchmark concurrency `2`, then `3`/`4` only if memory and quality measurements support it; retain the fastest stable configuration, otherwise retain `2`.
- [ ] Add a mixed-PDF test asserting Tesseract is called only for pages below the native threshold.

### Task 4: Asynchronous analysis job and status API

**Files:**
- Create: `lib/upload-analysis/jobs.ts`
- Create: `app/api/templates/analyze-upload/status/route.ts`
- Create: `app/api/templates/analyze-upload/cancel/route.ts`
- Modify: `app/api/templates/analyze-upload/route.ts`
- Test: `tests/integration/analyzeUploadJobs.test.ts`

- [ ] Add an opt-in async request mode that validates the file and returns `202` with `analysisJobId`, hash, cache status, and initial state before OCR.
- [ ] Run the existing analysis pipeline in the background job; update phase, processed pages, total pages, percentage, warnings count, and metrics from real work callbacks.
- [ ] Expose only safe status data and the final existing analysis payload when complete.
- [ ] Reuse a running job or completed cache entry for the same hash/configuration instead of starting duplicate OCR.
- [ ] Add cancellation/abandonment state and make late worker callbacks unable to move a terminal job backward.
- [ ] Keep the synchronous route path unchanged for current API tests and non-Contestaciones flows.
- [ ] Add integration tests for job creation, status progression, cache hit, duplicate request reuse, cancellation, OCR error, and final `sourceValidated` behavior.

### Task 5: Contestaciones immediate preview and real progress

**Files:**
- Modify: `app/machotes/page.tsx`
- Modify: `app/machotes/components/CaseDocumentsReader.tsx`
- Modify: `app/machotes/components/ContestacionesAnalysisPanel.tsx`
- Modify: `app/machotes/components/GenerationStatusBar.tsx` if the existing status component is the correct composition point.
- Test: `tests/components/contestacionesUploadAsync.test.tsx`
- Test: `tests/ui/contestacionesUploadRegression.test.ts`
- Test: `tests/browser/workspaceFlows.spec.ts`

- [ ] On local selection, validate extension/size, create an object URL, create a visible pending `CaseDocument`, and show the PDF viewer before starting analysis.
- [ ] Start async analysis and poll the status endpoint with cancellation on replacement/unmount; revoke object URLs when a document is replaced or removed.
- [ ] Render lawyer-facing states: Documento recibido, Reconociendo texto del documento, Analizando información, Validando contenido, Listo para trabajar, Requiere atención, and Error.
- [ ] Render real page progress such as `12 / 44 páginas` and disable generation until the final source validation contract is true.
- [ ] On completion, replace only the matching pending document by hash/request token; a late result for document A must not overwrite document B.
- [ ] On cache hit, resolve the same UI rapidly without starting OCR and preserve the same quality metadata.
- [ ] Add component tests for immediate preview, progress, blocked generation, ready generation, errors, replacement race, and cache hit.
- [ ] Add Playwright tests for preview-before-completion, progress, A→B replacement, and cache hit using deterministic mocked status APIs.

### Task 6: Final benchmark and regression gate

**Files:**
- Create: `docs/benchmarks/contestaciones-upload-2026-09-25.md`
- Modify: only files required by previous tasks.

- [ ] Run the exact real PDF once after implementation and record before/after preview latency, native extraction, OCR pages, OCR duration, analysis, total, memory, concurrency, cache miss, `sourceValidated`, quality score, and warnings count.
- [ ] Run the exact same PDF a second time and record cache hit latency with zero repeated OCR.
- [ ] Run `test:unit`, `test:components`, `test:integration`, `test:e2e`, `npm run typecheck`, `npm run build`, and `git diff --check`.
- [ ] Do not run `test:e2e:real-appeal` automatically.
- [ ] Review the final diff for unchanged 422/readiness/quality guards and report remaining risks without committing.
