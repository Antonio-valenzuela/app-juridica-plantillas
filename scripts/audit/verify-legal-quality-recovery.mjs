import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const directory = resolve('audit/legal-generation-quality-recovery');
await mkdir(directory, { recursive: true });
const stage = process.argv[2] || 'focused';
const commands = {
  red: 'npx vitest run tests/legal-engine/legacySectionContinuation.test.ts --reporter=verbose',
  'red-expansion': 'npx vitest run tests/legal-engine/generationExtension.test.ts --reporter=verbose',
  'red-petition': 'npx vitest run tests/legal-engine/generatedLegalAdmission.test.ts --reporter=verbose',
  'red-full-continuation': 'npx vitest run tests/legal-engine/legacySectionContinuation.test.ts --reporter=verbose',
  'red-pending-marker': 'npx vitest run tests/legal-engine/generatedLegalAdmission.test.ts --reporter=verbose',
  'red-embedded-petition': 'npx vitest run tests/legal-engine/generatedLegalAdmission.test.ts --reporter=verbose',
  'red-fallback': 'npx vitest run tests/legal-engine/legacySectionContinuation.test.ts --reporter=verbose',
  focused: 'npx vitest run tests/audit/legalQualityOfflineReplay.test.ts tests/legal-engine/generatedLegalAdmission.test.ts tests/legal-engine/legacySectionContinuation.test.ts tests/legal-engine/richGenerationTasks.test.ts tests/legal-engine/generationExtension.test.ts tests/legal-engine/generationExpansionPhase3.red.test.ts tests/legal-engine/generationRequestContract.test.ts tests/legal-engine/draftExportRecovery.test.ts tests/security/draftExportRealRoutes.test.ts --reporter=verbose',
  regression: 'npx vitest run tests/legal-engine/generationExtension.test.ts tests/legal-engine/sectionGeneration.test.ts tests/legal-engine/sectionContextAssembly.test.ts tests/legal-engine/issueScopedGeneration.test.ts tests/legal-engine/authorityPropositionGate.test.ts tests/legal-engine/authorityVerificationGate.test.ts tests/legal-engine/factualClaimGate.test.ts tests/legal-engine/documentAssemblyIntegration.test.ts tests/legal-engine/finalDocumentMaterializationGate.test.ts tests/ui --reporter=dot --silent',
  typecheck: 'npm run typecheck',
  ui: 'npx vitest run tests/ui --reporter=dot --silent',
  build: 'npm run build',
  'lock-inspection': 'powershell -NoProfile -File scripts/audit/inspect-prisma-lock.ps1',
  'stop-app': 'powershell -NoProfile -File scripts/audit/inspect-prisma-lock.ps1 -StopVerifiedServer',
};
if (!commands[stage]) throw new Error('Unknown verification stage');
const startedAt = new Date().toISOString();
const start = Date.now();
const child = spawn(commands[stage], { shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NVIDIA_API_KEY: '', NVIDIA_REAL_TEST: 'false' } });
let log = '';
child.stdout.on('data', data => { log += data; });
child.stderr.on('data', data => { log += data; });
const exitCode = await new Promise((done, reject) => { child.once('error', reject); child.once('close', done); });
await writeFile(join(directory, `${stage}.log`), log);
let results = {};
try { results = JSON.parse(await readFile(join(directory, 'results.json'), 'utf8')); } catch {}
results[stage] = { command: commands[stage], startedAt, durationMs: Date.now() - start, exitCode, tests: log.match(/^\s*Tests\s+([^\n]+)/m)?.[1]?.trim() || null };
await writeFile(join(directory, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results[stage]));
if (exitCode !== 0) { console.log(log.slice(-16000)); process.exitCode = 1; }
