import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const stage = process.argv[2];
if (stage === 'checkpoint') {
  const files = ['app/machotes/components/AppealResolutionReviewPanel.tsx', 'lib/legal-engine/case-extraction/appealResolutionReview.ts', 'scripts/audit/replay-appeal-resolution.ts', 'scripts/audit/verify-appeal-phase.mjs', 'tests/components/appealResolutionReview.test.tsx', 'tests/fixtures/appealResolutionSource.ts', 'tests/legal-engine/appealResolutionReview.test.ts', 'tests/audit/realAppealResolutionSource.test.ts', 'tests/fixtures/appealOcrMarginSource.ts', 'tests/legal-engine/appealOcrMargin.test.ts', 'tests/components/appealPhase1b.test.tsx', 'tests/components/generationErrorPresentation.test.tsx', 'tests/audit/civilResponseSourceDiagnosis.test.ts', 'tests/api/appealConfirmationIsolation.test.ts'];
  const diffs = files.map(file => {
    const result = spawnSync('git', ['diff', '--no-index', '--', '/dev/null', file], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 1 || !result.stdout?.startsWith('diff --git')) throw new Error(`Cannot checkpoint ${file}: ${result.stderr}`);
    return result.stdout;
  });
  mkdirSync('audit/apelaciones-fase-1', { recursive: true });
  writeFileSync('audit/apelaciones-fase-1/fase-1-new-files.patch', diffs.join(''));
  console.log(`Checkpoint: ${files.length} new files, no Git writes.`);
  process.exit(0);
}
const focused = 'tests/legal-engine/legalAdmissionRecoverySafety.test.ts tests/legal-engine/generatedLegalAdmissionGranular.test.ts tests/legal-engine/generatedLegalAdmission.test.ts tests/legal-engine/legacySectionContinuation.test.ts tests/legal-engine/generationExtension.test.ts tests/audit/appealGenerationRegressionReplay.test.ts tests/legal-engine/appealIdentitySections.test.ts tests/legal-engine/appealRealRunRegressions.test.ts tests/legal-engine/appealViaIsolation.test.ts tests/legal-engine/appealDepthProfile.test.ts tests/legal-engine/manualMethodologyContext.test.ts tests/legal-engine/unverifiedAuthorityAssertion.test.ts tests/audit/legalQualityOfflineReplay.test.ts';
const broad = 'tests/legal-engine/generationExtension.test.ts tests/legal-engine/sectionGeneration.test.ts tests/legal-engine/sectionContextAssembly.test.ts tests/legal-engine/issueScopedGeneration.test.ts tests/legal-engine/authorityPropositionGate.test.ts tests/legal-engine/authorityVerificationGate.test.ts tests/legal-engine/factualClaimGate.test.ts tests/legal-engine/documentAssemblyIntegration.test.ts tests/legal-engine/finalDocumentMaterializationGate.test.ts tests/ui';
const isolation = 'tests/legal-engine/contestacionStructure.test.ts tests/legal-engine/contestacionSignatureAssembly.test.ts tests/legal-engine/contestacionPlanContract.test.ts tests/legal-engine/amparoDirectoClassification.test.ts tests/legal-engine/penalSourceContract.test.ts tests/legal-engine/penalFallbackContract.test.ts tests/legal-engine/fallbackE2E.test.ts';
const commands = { focused: `npx vitest run ${focused} --reporter=dot --silent`, broad: `npx vitest run ${broad} --reporter=dot --silent`, isolation: `npx vitest run ${isolation} --reporter=verbose --silent`, phase: 'npx vitest run tests/legal-engine/appealResolutionReview.test.ts tests/components/appealResolutionReview.test.tsx --reporter=verbose', typecheck: 'npm run typecheck' };
const kind = stage?.split('-').at(-1);
commands.ocr = 'npx vitest run tests/legal-engine/appealOcrMargin.test.ts tests/legal-engine/appealResolutionReview.test.ts tests/components/appealResolutionReview.test.tsx --reporter=verbose';
commands.real = 'npx vitest run tests/audit/realAppealResolutionSource.test.ts --reporter=verbose';
commands.local = `npx vitest run ${focused} tests/legal-engine/appealOcrMargin.test.ts tests/legal-engine/appealResolutionReview.test.ts tests/components/appealResolutionReview.test.tsx tests/components/appealPhase1b.test.tsx tests/components/generationErrorPresentation.test.tsx tests/audit/civilResponseSourceDiagnosis.test.ts tests/api/appealConfirmationIsolation.test.ts --reporter=verbose`;
if (!commands[kind]) throw new Error('Unknown stage');
const outputDirectory = stage.startsWith('phase1b-') ? 'audit/apelaciones-fase-1b' : 'audit/apelaciones-fase-1';
mkdirSync(outputDirectory, { recursive: true });
const result = spawnSync(commands[kind], { shell: true, windowsHide: true, encoding: 'utf8', env: { ...process.env, NVIDIA_API_KEY: '', NVIDIA_REAL_TEST: 'false' } });
const log = (result.stdout || '') + (result.stderr || '');
writeFileSync(`${outputDirectory}/${stage}.log`, log);
const summary = { command: commands[kind], exitCode: result.status, tests: log.match(/^\s*Tests\s+([^\n]+)/m)?.[1]?.trim() || null };
writeFileSync(`${outputDirectory}/${stage}.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
if (result.status !== 0) console.log(log.slice(-6500));
process.exitCode = result.status ?? 1;
