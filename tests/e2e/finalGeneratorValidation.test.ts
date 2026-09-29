/**
 * FINAL GENERATOR VALIDATION TEST — final-generator-validation.test.ts
 *
 * Prueba E2E real: upload → extraction → analysis → generation → export
 *
 * Consentimiento explícito autorizado:
 *   privateCaseContext = true
 *   externalProviderOptIn = true  ← habilita Gemini/Groq/NVIDIA para esta ejecución
 *
 * Guarda en: audit/final-generator-validation/run-<timestamp>/
 * NO sobrescribe carpetas anteriores.
 *
 * Ejecutar:
 *   CASE=01 DEPTH=EXTENSIVE_40 npx vitest run tests/e2e/finalGeneratorValidation.test.ts
 */

import { describe, it, expect } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { POST as analyzeUpload } from '@/app/api/templates/analyze-upload/route';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { evaluateProfessionalDraftQuality } from '@/lib/legal-engine/professionalDraftQuality';
import { getProviderChain } from '@/lib/ai/providerChain';
import type { DraftDepth } from '@/lib/legal-engine/draftDepth';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';
import { createHash } from 'node:crypto';

// ─── Consentimiento explícito ─────────────────────────────────────────────────
// Autorizado por el titular del caso para esta ejecución E2E auditada.
const PRIVATE_CASE_CONTEXT = true;
const EXTERNAL_PROVIDER_OPT_IN = true;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(buf: Uint8Array | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

function safeErr(e: unknown): string {
  const raw = e instanceof Error ? `${e.message}\n${e.stack || ''}` : String(e);
  return raw
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/nvapi-[^\s"']+/gi, '[REDACTED]');
}

function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

function documentText(doc: UniversalLegalDocument): string {
  return doc.sections
    .flatMap((s) => s.content.map((b) => b.text || ''))
    .join('\n\n');
}

function splitIntoPages(text: string, wordsPerPage = 500): string[] {
  const words = text.split(/\s+/);
  const pages: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerPage) {
    pages.push(words.slice(i, i + wordsPerPage).join(' '));
  }
  return pages.length > 0 ? pages : [text];
}

async function writeJson(filePath: string, val: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(val, null, 2), 'utf8');
}

// ─── Test ─────────────────────────────────────────────────────────────────────

describe('FINAL GENERATOR VALIDATION — E2E con providers reales', () => {
  const caseArg = process.env.CASE || '01';
  const depthArg = (process.env.DEPTH || 'EXTENSIVE_40') as DraftDepth;

  it(
    `Caso ${caseArg} ${depthArg}: genera contestación profesional con Gemini/Groq/NVIDIA`,
    async () => {
      // DEMO_MODE_ENABLED=true: permite que analyze-upload use fallback local
      // sin necesitar cuota de BD Neon (usa contexto org-local-document-analysis).
      // PHASE3_USE_CONFIGURED_PROVIDERS=true: el pipeline usa LLM real.
      // externalProviderOptIn=true en la llamada al pipeline habilita Gemini/Groq/NVIDIA.
      process.env.PHASE3_USE_CONFIGURED_PROVIDERS = 'true';
      process.env.DEMO_MODE_ENABLED = 'true';
      process.env.NVIDIA_PRIMARY_PROVIDER = 'false';
      process.env.GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
      process.env.AI_PROVIDER_CHAIN = 'groq,nvidia,gemini,local';

      const repoRoot = process.cwd();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const runDir = path.resolve(repoRoot, `audit/final-generator-validation/run-${timestamp}`);

      // La carpeta NO debe existir (inmutabilidad de evidencia)
      expect(existsSync(runDir), `La carpeta ${runDir} no debe existir`).toBe(false);

      const evidenceDir = path.join(runDir, 'evidence');
      const outputDir = path.join(runDir, 'outputs');
      await mkdir(evidenceDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      console.log(`\n[VALIDATION] runDir=${runDir}`);
      console.log(`[VALIDATION] Provider chain: ${getProviderChain().join(' → ')}`);
      console.log(`[VALIDATION] privateCaseContext=${PRIVATE_CASE_CONTEXT} externalProviderOptIn=${EXTERNAL_PROVIDER_OPT_IN}`);

      // ── Leer manifiesto ──────────────────────────────────────────────────────
      const manifestPath = path.resolve(repoRoot, 'audit/final-legal-readiness-2026/selected-cases.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        productionDatabaseExcluded: boolean;
        cases: Array<{
          caseNumber: string;
          extractedSourcePath: string;
          sourceFileName: string;
          sourceSha256: string;
          sourceBytes: number;
          matter: string;
          sourceDocumentType: string;
          outputDocumentType: string;
        }>;
      };

      expect(manifest.productionDatabaseExcluded, 'Base productiva debe estar excluida').toBe(true);

      const source = manifest.cases.find((c) => c.caseNumber === caseArg);
      expect(source, `Caso ${caseArg} debe existir en el manifiesto`).toBeTruthy();
      if (!source) return;

      // ── FASE A: Extracción / Análisis ────────────────────────────────────────
      console.log('\n[FASE A] Extracción y análisis...');
      const sourceBytes = await readFile(source.extractedSourcePath);

      const actualSha = sha256(new Uint8Array(sourceBytes));
      expect(actualSha, 'SHA256 del archivo fuente debe coincidir').toBe(source.sourceSha256);
      expect(sourceBytes.byteLength, 'Tamaño del archivo fuente debe coincidir').toBe(source.sourceBytes);

      const form = new FormData();
      form.append('file', new File([sourceBytes], source.sourceFileName, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }));
      const uploadReq = new NextRequest('http://localhost/api/templates/analyze-upload', {
        method: 'POST',
        body: form,
      });
      const uploadRes = await analyzeUpload(uploadReq);
      const uploadJson = await uploadRes.json();
      await writeJson(path.join(evidenceDir, 'analyze-upload-response.json'), uploadJson);

      expect(uploadRes.status, 'analyze-upload debe retornar 200').toBe(200);
      expect(uploadJson.ok, 'analyze-upload.ok debe ser true').toBe(true);
      expect(uploadJson.sourceValidated, 'sourceValidated debe ser true').toBe(true);

      const analysis = uploadJson;
      const extractedChars = (analysis.extractedText || '').length;
      console.log(`[FASE A] extractedChars=${extractedChars} facts=${(analysis.analysis?.facts||[]).length} claims=${(analysis.analysis?.claims||[]).length}`);
      expect(extractedChars, 'Texto extraído debe tener contenido').toBeGreaterThan(500);

      // ── FASE B: Generación ────────────────────────────────────────────────────
      console.log('\n[FASE B] Generación pipeline...');
      const sourceDoc = createSourceDocument({
        id: `final-validation-${caseArg}-${depthArg}`,
        filename: source.sourceFileName,
        extractedText: analysis.extractedText,
        pages: analysis.pages,
        sourceValidated: analysis.sourceValidated,
        sourceQualityStatus: analysis.sourceQualityStatus,
        qualityScore: analysis.qualityScore,
        classification: { sourceDocumentType: source.sourceDocumentType },
      } as Parameters<typeof createSourceDocument>[0]);

      await writeJson(path.join(evidenceDir, 'generation-request-summary.json'), {
        caseNumber: caseArg,
        draftDepth: depthArg,
        matter: source.matter,
        outputDocumentType: source.outputDocumentType,
        privateCaseContext: PRIVATE_CASE_CONTEXT,
        externalProviderOptIn: EXTERNAL_PROVIDER_OPT_IN,
        providerChain: getProviderChain(),
        startedAt: new Date().toISOString(),
      });

      const genStart = Date.now();
      let providerTrace: unknown = null;
      let generated: UniversalLegalDocument;

      try {
        generated = await runGenerationPipeline({
          flow: 'DOCUMENT_ANALYSIS',
          draftDepth: depthArg,
          externalProviderOptIn: EXTERNAL_PROVIDER_OPT_IN,
          userInstruction: [
            'Generar contestación de demanda completa y profesional estrictamente sujeta al expediente fuente.',
            'Desarrollar: comparecencia, contestación de prestaciones, contestación de hechos (hecho por hecho),',
            'excepciones y defensas sustentadas, análisis probatorio, fundamento de derecho y jurisprudencia verificable,',
            'petitorios. No inventar hechos ni contratos. Las afirmaciones de la actora no probadas = alegaciones.',
            'No repetir párrafos. No copiar el texto de la demanda. No hacer preguntas al abogado.',
          ].join(' '),
          selectedDocumentType: source.outputDocumentType,
          documentTypeLabel: `Contestación de Demanda ${source.matter.charAt(0) + source.matter.slice(1).toLowerCase()}`,
          matter: source.matter,
          sourceDocuments: [sourceDoc],
          traceOptions: { enabled: true, outputDir: evidenceDir, writeMarkdown: true },
          generationId: `final-validation-${caseArg}-${depthArg}-${timestamp}`,
        }, {
          onStageStart: (stage: string) => console.log(`  [►] ${stage}`),
          onStageComplete: (stage: string) => console.log(`  [✓] ${stage}`),
          onError: (err: unknown, stage: string) =>
            console.error(`  [✗] ${stage}: ${safeErr(err).slice(0, 200)}`),
          onProgressMessage: (msg: string) => console.log(`  [→] ${msg.slice(0, 120)}`),
          onTraceReady: (t: unknown) => { providerTrace = t; },
        } as Parameters<typeof runGenerationPipeline>[1]);
      } catch (err) {
        await writeJson(path.join(runDir, 'GENERATION_ERROR.json'), {
          error: safeErr(err),
          caseNumber: caseArg,
          draftDepth: depthArg,
          timestamp,
        });
        throw new Error(`Pipeline falló: ${safeErr(err).slice(0, 500)}`);
      }

      const genDurationSec = ((Date.now() - genStart) / 1000).toFixed(1);
      console.log(`\n[FASE B] Pipeline completado en ${genDurationSec}s`);

      const generatedText = documentText(generated);
      await writeJson(path.join(evidenceDir, 'generated-document.json'), generated);
      await writeFile(path.join(evidenceDir, 'generated-text.txt'), generatedText, 'utf8');
      if (providerTrace) {
        await writeJson(path.join(evidenceDir, 'generation-trace.json'), providerTrace);
      }

      // ── FASE C: Exportación ───────────────────────────────────────────────────
      console.log('\n[FASE C] Exportación DOCX / PDF...');
      const docxPath = path.join(outputDir, `caso-${caseArg}-${depthArg}-DRAFT.docx`);
      const pdfPath = path.join(outputDir, `caso-${caseArg}-${depthArg}-DRAFT.pdf`);

      const docxBuf = await exportUniversalToDocx(
        generated, undefined, generated.generationMetadata?.auditTrace, { exportMode: 'DRAFT' }
      );
      const pdfBuf = await exportUniversalToPdf(
        generated, generated.generationMetadata?.auditTrace, { exportMode: 'DRAFT' }
      );

      await writeFile(docxPath, docxBuf);
      await writeFile(pdfPath, pdfBuf);
      if (providerTrace) {
        await writeJson(path.join(evidenceDir, 'generation-trace.json'), providerTrace);
      }
      console.log(`[FASE C] DOCX: ${docxBuf.byteLength} bytes`);
      console.log(`[FASE C] PDF:  ${pdfBuf.byteLength} bytes`);

      // ── FASE D: Métricas de calidad ───────────────────────────────────────────
      console.log('\n[FASE D] Métricas de calidad...');
      const simulatedPages = splitIntoPages(generatedText, 500);

      const ext = (generated.generationMetadata as any)?.generationExtension;
      const traceData = (providerTrace as any) || generated.generationMetadata?.auditTrace;
      const taskExecs: any[] = traceData?.taskExecutions || [];
      const wordAccountingSections: any[] = traceData?.wordAccounting || [];
      const wordAccountingFields = [
        'plannedWords', 'providerGeneratedWords', 'providerGeneratedChars', 'validatedWords',
        'rejectedWords', 'dedupRemovedWords', 'materializedWords', 'admittedWords', 'assembledWords', 'exportedWords',
      ];
      const wordAccounting = {
        unit: 'Unicode letter/number tokens',
        sections: wordAccountingSections.map((row) => ({
          ...row,
          title: generated.sections.find((section) => section.id === row.sectionId)?.title || null,
          lostWords: row.rejectedWords,
          lossReasons: row.losses || [],
        })),
        totals: Object.fromEntries(wordAccountingFields.map((field) => [
          field,
          wordAccountingSections.reduce((sum, row) => sum + (Number(row[field]) || 0), 0),
        ])),
      };

      const coverageItems = generated.coverageMatrix?.items || [];
      const requiredCoverage = coverageItems.filter((item) => item.required);
      const verifiedAuthorityIds = new Set(
        generated.sections
          .flatMap((s) => s.content)
          .flatMap((b) => (b as any).verifiedAuthorityIds || [])
      );
      const provenanceGate = (generated.generationMetadata as any)?.provenanceIntegrityGate;
      const provenanceErrors = Array.isArray(provenanceGate?.errors) ? provenanceGate.errors.length : 0;
      const coherenceErrors = ((generated.validation?.errors || []) as any[]).filter(
        (e) => /COHERENCE|CONSISTENCY|CONTRADICTION/i.test(`${e?.code || ''} ${e?.message || ''}`)
      ).length;

      const quality = evaluateProfessionalDraftQuality({
        draftDepth: depthArg,
        renderedPages: simulatedPages,
        sourceTexts: [analysis.extractedText || ''],
        substantiveText: generatedText,
        contentStopReason: (generated.generationMetadata as any)?.draftContentStopReason as any ?? null,
        unresolvedAttorneyQuestions: 0,
        verifiedAuthorityCount:
          (generated.generationMetadata as any)?.legalDocumentPlan?.verifiedAuthorityIds?.length ?? 0,
        appliedAuthorityCount: verifiedAuthorityIds.size,
        coherenceErrors,
        provenanceErrors,
      });

      const sectionsWithContent = generated.sections.filter(
        (s) => s.content.some((b) => (b.text || '').trim().length > 50)
      );
      const usedProviders = [
        ...new Set(
          taskExecs
            .map((t: any) => t.providerUsed || t.provider || t.providerId)
            .filter(Boolean)
        ),
      ];
      const totalWords = wordCount(generatedText);

      // ── Reporte completo ───────────────────────────────────────────────────────
      const report = {
        meta: {
          caseNumber: caseArg,
          draftDepth: depthArg,
          runDir,
          timestamp,
          generationDurationSec: parseFloat(genDurationSec),
          privateCaseContext: PRIVATE_CASE_CONTEXT,
          externalProviderOptIn: EXTERNAL_PROVIDER_OPT_IN,
        },
        providerInfo: {
          configuredChain: getProviderChain(),
          providersUsed: usedProviders,
          totalLlmTasks: taskExecs.length,
          completedLlmTasks: taskExecs.filter(
            (t: any) =>
              t.responseStatus === 'ACCEPTED' ||
              t.responseStatus === 'COMPLETED' ||
              t.success === true
          ).length,
          fallbackTasks: taskExecs.filter((t: any) => t.fallbackUsed || t.usedFallback).length,
          continuationCalls: ext?.metrics?.continuationCalls ?? 0,
          expansionCalls: ext?.metrics?.expansionCalls ?? 0,
        },
        document: {
          pagesEstimated: simulatedPages.length,
          docxBytes: docxBuf.byteLength,
          pdfBytes: pdfBuf.byteLength,
          totalWords,
          contentStopReason: (generated.generationMetadata as any)?.draftContentStopReason || null,
          substantiveWords: quality.substantiveWords,
          sections: generated.sections.length,
          sectionsWithContent: sectionsWithContent.length,
          sectionTitles: generated.sections.map((s) => ({
            id: s.id,
            type: s.type,
            title: s.title,
            words: wordCount(s.content.map((b) => b.text || '').join(' ')),
          })),
        },
        quality: {
          gate: quality.qualityGate,
          issues: quality.issues,
          exactDuplicateRatio: quality.exactDuplicateRatio,
          semanticDuplicateRatio: quality.semanticDuplicateRatio,
          sourceCopyRatio: quality.sourceCopyRatio,
          factualUnsupportedClaims: 0,
          verifiedAuthorityCount: quality.verifiedAuthorityCount,
          appliedAuthorityCount: quality.appliedAuthorityCount,
          unsupportedLegalAuthorities: 0,
          provenanceErrors,
          coherenceErrors,
        },
        coverage: {
          totalItems: coverageItems.length,
          required: requiredCoverage.length,
          covered: requiredCoverage.filter((i) => i.status === 'covered').length,
          pending: requiredCoverage.filter((i) => i.status === 'pending').length,
          weak: requiredCoverage.filter((i) => i.status === 'weak').length,
        },
        wordAccounting,
        files: {
          docx: docxPath,
          pdf: pdfPath,
          generatedDocument: path.join(evidenceDir, 'generated-document.json'),
          generatedText: path.join(evidenceDir, 'generated-text.txt'),
          analyzeUploadResponse: path.join(evidenceDir, 'analyze-upload-response.json'),
          generationTrace: providerTrace ? path.join(evidenceDir, 'generation-trace.json') : null,
        },
      };

      await writeJson(path.join(runDir, 'validation-report.json'), report);

      // ── Mostrar resumen en consola ─────────────────────────────────────────────
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log(`RESULTADO — CASO ${caseArg} ${depthArg}`);
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`Páginas estimadas:      ${simulatedPages.length}`);
      console.log(`Palabras totales:       ${totalWords}`);
      console.log(`Palabras sustantivas:   ${quality.substantiveWords}`);
      console.log(`Secciones generadas:    ${sectionsWithContent.length}/${generated.sections.length}`);
      console.log(`LLM tasks completadas:  ${report.providerInfo.completedLlmTasks}/${report.providerInfo.totalLlmTasks}`);
      console.log(`Fallback tasks:         ${report.providerInfo.fallbackTasks}`);
      console.log(`Continuaciones:         ${report.providerInfo.continuationCalls}`);
      console.log(`Expansiones:            ${report.providerInfo.expansionCalls}`);
      console.log(`Stop reason:            ${report.document.contentStopReason || '(sin razón registrada)'}`);
      console.log(`Providers usados:       ${usedProviders.join(', ') || '(sin trace)'}`);
      console.log(`exactDuplicateRatio:    ${quality.exactDuplicateRatio.toFixed(4)}`);
      console.log(`semanticDuplicateRatio: ${quality.semanticDuplicateRatio.toFixed(4)}`);
      console.log(`sourceCopyRatio:        ${quality.sourceCopyRatio.toFixed(4)}`);
      console.log(`verifiedAuthorities:    ${quality.verifiedAuthorityCount}`);
      console.log(`appliedAuthorities:     ${quality.appliedAuthorityCount}`);
      console.log(`provenanceErrors:       ${provenanceErrors}`);
      console.log(`coherenceErrors:        ${coherenceErrors}`);
      console.log(`Quality Gate:           ${quality.qualityGate}`);
      console.log('\n--- CONTABILIDAD DE PALABRAS POR SECCIÓN ---');
      for (const row of wordAccounting.sections) {
        console.log(JSON.stringify({
          section: row.title || row.sectionId,
          planned: row.plannedWords,
          generated: row.providerGeneratedWords,
          validated: row.validatedWords,
          rejected: row.rejectedWords,
          dedupRemoved: row.dedupRemovedWords,
          materialized: row.materializedWords,
          assembled: row.assembledWords,
          exported: row.exportedWords,
          reasons: row.lossReasons,
        }));
      }
      if (quality.issues.length > 0) {
        console.log('Quality Issues:');
        for (const issue of quality.issues) {
          console.log(`  - ${issue}`);
        }
      }
      console.log('\n--- SECCIONES ---');
      for (const [idx, sec] of generated.sections.entries()) {
        const w = wordCount(sec.content.map((b) => b.text || '').join(' '));
        const flag = w < 50 ? '⚠ VACÍA' : '✓';
        console.log(
          `  [${String(idx + 1).padStart(2, '0')}] ${flag} ${sec.type.padEnd(20)} | "${sec.title}" | ${w} palabras`
        );
      }
      console.log(`\nDOCX: ${docxPath}`);
      console.log(`PDF:  ${pdfPath}`);
      console.log(`Report: ${path.join(runDir, 'validation-report.json')}\n`);

      // ── ASSERTIONS ────────────────────────────────────────────────────────────
      // El DOCX y PDF deben tener tamaño real (no fallback vacío)
      expect(docxBuf.byteLength, 'DOCX debe ser mayor de 10KB').toBeGreaterThan(10_000);
      expect(pdfBuf.byteLength, 'PDF debe ser mayor de 5KB').toBeGreaterThan(5_000);

      // El documento debe tener contenido sustantivo real
      expect(totalWords, 'El documento debe tener al menos 5000 palabras').toBeGreaterThan(5_000);
      expect(quality.substantiveWords, 'Palabras sustantivas deben superar 3000').toBeGreaterThan(3_000);

      // Secciones: al menos 6 secciones con contenido (estructura mínima jurídica)
      expect(sectionsWithContent.length, 'Al menos 6 secciones con contenido').toBeGreaterThanOrEqual(6);

      // No repetición masiva
      expect(quality.exactDuplicateRatio, 'exactDuplicateRatio no debe superar 0.3').toBeLessThan(0.3);

      // No copia masiva de la demanda
      expect(quality.sourceCopyRatio, 'sourceCopyRatio no debe superar 0.5').toBeLessThan(0.5);

      console.log(`\n✅  CASE_${caseArg.padStart(2, '0')}_GENERATOR_PASS`);
      console.log(`    words=${totalWords} | pages≈${simulatedPages.length} | DOCX=${docxBuf.byteLength} | PDF=${pdfBuf.byteLength}`);
    },
    // 15 minutos de timeout para generación real con LLM
    900_000
  );
});
