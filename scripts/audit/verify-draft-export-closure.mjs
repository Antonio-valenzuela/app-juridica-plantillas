import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const output = resolve('audit/draft-export-recovery/verification');
await mkdir(output, { recursive: true });
const suites = [
  'tests/legal-engine/draftExportRecovery.test.ts', 'tests/security/draftExportRealRoutes.test.ts',
  'tests/legal-engine/draftSaveIsolation.test.ts', 'tests/legal-engine/reopenedDraftBinding.test.ts',
  'tests/legal-engine/exportMode.test.ts', 'tests/legal-engine/exportReviewOverride.test.ts',
  'tests/legal-engine/exportErrors.test.ts', 'tests/legal-engine/exportRouteContracts.test.ts',
  'tests/security/unsavedDraftExport.test.ts', 'tests/security/exportOwnership.test.ts',
  'tests/legal-engine/finalDocumentMaterializationGate.test.ts', 'tests/legal-engine/compatibilityMaterializationGate.test.ts',
  'tests/legal-engine/exportFormatParity.test.ts', 'tests/legal-engine/exportManifest.test.ts',
  'tests/legal-engine/exportDocxStructure.test.ts', 'tests/legal-engine/loop8bPhase2aExportGuards.test.ts', 'tests/ui',
];
const results = [];
for (const [name, command] of [
  ['focused-regression-ui', `npx vitest run ${suites.join(' ')} --reporter=dot --silent`],
  ['typecheck', 'npm run typecheck'],
]) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const child = spawn(command, { shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', data => { log += data.toString(); });
  child.stderr.on('data', data => { log += data.toString(); });
  const exitCode = await new Promise((done, reject) => { child.once('error', reject); child.once('close', done); });
  await writeFile(join(output, `${name}.log`), log);
  results.push({ name, command, startedAt, durationMs: Date.now()-start, exitCode, tests: log.match(/^\s*Tests\s+([^\n]+)/m)?.[1]?.trim() || null });
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
if (results.some(result => result.exitCode !== 0)) process.exitCode = 1;
