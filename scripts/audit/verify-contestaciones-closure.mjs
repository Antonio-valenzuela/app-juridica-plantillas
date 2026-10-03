import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const run = resolve(process.argv[2]);
if (JSON.parse(readFileSync(resolve(run, 'status.json'), 'utf8')).status !== 'COMPLETED') throw new Error('MATRIX_NOT_COMPLETED');
const out = resolve(run, 'verification');
mkdirSync(out, { recursive: true });
const legal = name => `tests/legal-engine/${name}.test.ts`;
const suites = [
  ['contestaciones', ['contestacionStructure','contestacionPlanContract','contestacionSignatureAssembly','documentSectionContracts','generationRequestContract','sectionGeneration','sectionContextAssembly','issueScopedGeneration','legacySectionContinuation','documentAuthority','authorityVerificationGate','exportMode','generationTraceAccounting','verificationContinuation'].map(legal).concat(['tests/acceptance/sourceGroundedContestacion.test.ts','tests/acceptance/multiMatterIsolation.acceptance.test.ts','tests/ui/contestacionesUi.test.ts','tests/ui/contestacionesUploadRegression.test.ts','tests/ui/contestacionesRuntimeRegression.test.ts'])],
  ['legal-regression', ['claudeForLegalMxAdaptation','generationRequestContract','authorityPropositionGate','authorityVerificationGate','authorityVerification','documentAuthority','legalResearchCanonical','legalResearchPipeline','legalResearchReentryGeneration','sectionGeneration','sectionContextAssembly','issueScopedGeneration','legacySectionContinuation','documentSectionContracts','jaliscoOfficialResearch'].map(legal)],
  ['isolation', [legal('contextIsolation'),'tests/acceptance/multiMatterIsolation.acceptance.test.ts']],
  ['ui', ['tests/ui']],
];
const commands = suites.map(([name, files]) => [name, `npx vitest run ${files.join(' ')} --reporter=dot --silent`]);
commands.push(['typecheck','npm run typecheck'],['build','npm run build']);
const results = [];
for (const [name, command] of commands) {
  console.log('VERIFICATION_START', name);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const child = spawn(command, { shell: true, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data.toString(); });
  child.stderr.on('data', data => { output += data.toString(); });
  const exitCode = await new Promise((done, reject) => { child.on('error', reject); child.on('close', done); });
  writeFileSync(resolve(out, `${name}.log`), output);
  const result = { name, command, startedAt, durationMs: Date.now()-started, exitCode, count: output.match(/^\s*Tests\s+([^\n]+)/m)?.[1]?.trim() || null };
  results.push(result);
  writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));
  console.log('VERIFICATION_RESULT',JSON.stringify(result));
}
