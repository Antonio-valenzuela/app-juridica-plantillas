import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runLegalAI } from '../../lib/ai/orchestrator';
import { extractAppealReasoningCandidates } from '../../lib/legal-engine/case-extraction/appealReasoningCandidates';
import { extractAppealResolutionReview, isCivilFamilyAppeal } from '../../lib/legal-engine/case-extraction/appealResolutionReview';
import { classifyAppealReasoningBlocks } from '../../lib/legal-engine/case-extraction/appealReasoningAiClassification';
import type { UploadedSourceDocument } from '../../lib/legal-engine/types';

const requiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}; la prueba real no se ejecutó.`);
  return value;
};

async function main() {
  if (process.env.APPEAL_PROVIDER_REAL_AUTHORIZED !== 'YES') throw new Error('Falta autorización explícita: establece APPEAL_PROVIDER_REAL_AUTHORIZED=YES solo cuando el abogado autorice la llamada.');
  if (process.env.APPEAL_EXTERNAL_PROVIDER_OPT_IN !== 'YES') throw new Error('Falta consentimiento explícito de transferencia externa: establece APPEAL_EXTERNAL_PROVIDER_OPT_IN=YES solo cuando el abogado lo autorice.');

  const pdfPath = resolve(requiredEnv('APPEAL_SOURCE_PDF'));
  const cachePath = resolve(requiredEnv('APPEAL_OCR_CACHE'));
  const confirmationPath = resolve(requiredEnv('APPEAL_CONFIRMED_INPUT'));
  if (![pdfPath, cachePath, confirmationPath].every(existsSync)) throw new Error('Falta el PDF, la caché OCR o el archivo local de confirmación.');

  const pdfBytes = readFileSync(pdfPath);
  const cacheBytes = readFileSync(cachePath);
  const pdfSha256 = createHash('sha256').update(pdfBytes).digest('hex');
  const cacheSha256 = createHash('sha256').update(cacheBytes).digest('hex');
  if (!cachePath.toLowerCase().includes(pdfSha256.toLowerCase())) throw new Error('La caché OCR no está ligada al SHA-256 del PDF indicado.');

  const cache = JSON.parse(cacheBytes.toString('utf8'));
  const confirmed = JSON.parse(readFileSync(confirmationPath, 'utf8')) as {
    confirmed?: boolean; documentType?: string; resolutionStartPage?: number; resolutionType?: string; representedNames?: string[]; externalProviderOptIn?: boolean;
  };
  if (confirmed.confirmed !== true || confirmed.externalProviderOptIn !== true) throw new Error('El archivo local debe contener confirmed=true y externalProviderOptIn=true.');
  if (!isCivilFamilyAppeal(confirmed.documentType)) throw new Error('El tipo confirmado debe ser apelación civil o familiar.');
  if (!Number.isInteger(confirmed.resolutionStartPage) || !Array.isArray(confirmed.representedNames) || !confirmed.representedNames.length) throw new Error('Confirma en el archivo local la página inicial de la resolución y los nombres representados.');
  if (!Array.isArray(cache.value?.pages)) throw new Error('La caché OCR no contiene value.pages.');

  const source: UploadedSourceDocument = { id: 'appeal-provider-real-check', pages: cache.value.pages };
  const sourceReview = extractAppealResolutionReview([source]);
  const selected = sourceReview.resolutions.filter(resolution =>
    resolution.startPage === confirmed.resolutionStartPage && (!confirmed.resolutionType || resolution.type === confirmed.resolutionType));
  if (selected.length !== 1) throw new Error(`La selección confirmada coincide con ${selected.length} resoluciones; debe ser única.`);
  const resolution = selected[0];
  const parties = resolution.parties;
  const represented = confirmed.representedNames.map(name => parties.find(party => party.name === name));
  if (represented.some(party => !party) || new Set(represented.map(party => party!.role)).size !== 1) throw new Error('La parte representada no coincide exactamente con las partes extraídas de la resolución.');

  const review = extractAppealReasoningCandidates([source], {
    documentType: confirmed.documentType!, resolution, parties,
    representedNames: confirmed.representedNames, sourceFingerprint: sourceReview.sourceFingerprint,
  });
  if (!review.representedRole) throw new Error('No se pudo validar el rol de la representación confirmada.');
  const classifications = await classifyAppealReasoningBlocks(review.blocks.filter(block => block.kind === 'REASONING').map(block => ({
    id: block.id, resolutionId: block.resolutionId, section: block.section, kind: 'REASONING' as const,
    pages: block.pages, sourceText: block.sourceText, sourceSpans: block.sourceSpans,
    fallback: { impact: block.impact, appliedRule: block.appliedRule, classificationReason: block.classificationReason },
  })), {
    documentType: review.documentType,
    representedRole: review.representedRole,
    representedNames: review.representedNames,
    globalOutcome: review.globalOutcome,
  }, async request => {
    const response = await runLegalAI({
      externalProviderOptIn: true, privateCaseContext: true,
      taskType: 'appeal_reasoning_classification',
      systemPrompt: request.systemPrompt, userMessage: request.userMessage,
      outputSchema: request.outputSchema, maxTokens: request.maxTokens,
      maxProviderRetries: 0, temperature: 0,
      requestId: `appeal-real-check-${Date.now()}`,
    });
    return { success: response.success, provider: response.provider, content: response.content, errorCode: response.errorCode };
  }, { externalProviderOptIn: true });

  const outputPath = resolve('audit/apelaciones-fase-2b/appeal-provider-real-result.local.json');
  const report = {
    pdfSha256, cacheSha256, resolution: { type: resolution.type, startPage: resolution.startPage, endPage: resolution.endPage },
    representedPartyCount: confirmed.representedNames.length,
    counts: {
      reasoningBlocks: classifications.length,
      aiValidated: classifications.filter(result => result.status === 'AI_VALIDATED').length,
      deterministicFallback: classifications.filter(result => result.status === 'DETERMINISTIC_FALLBACK').length,
      indeterminate: classifications.filter(result => result.status === 'INDETERMINATE').length,
    },
    classifications: classifications.map(({ blockId, section, pages, impact, appliedRule, status, citationValidated, reasonCode, cacheKey }) => ({
      blockId, section, pages, impact, appliedRule, status, citationValidated, reasonCode, cacheKey,
    })),
    warning: 'Salida local sin nombres, citas literales ni razones textuales; provider real solo se invoca tras las dos autorizaciones explícitas.',
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  process.stdout.write(JSON.stringify({ outputPath, ...report }, null, 2) + '\n');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
