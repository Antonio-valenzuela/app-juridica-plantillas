import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = 'audit/final-pre-windows-readiness/legal-quality-causal';
const files = ['lib/ai/providerChain.ts', 'lib/ai/providerRouter.ts', 'lib/legal-engine/qualityGate.ts', 'lib/legal-engine/documentCoverage.ts'];
const hashes = {};
for (const file of files) hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
await mkdir(root, { recursive: true });
const mode = process.argv[2] || 'before';
if (mode === 'before') {
  // Exclusive creation prevents a rerun from destroying the baseline.
  await writeFile(`${root}/before-hashes.json`, JSON.stringify(hashes, null, 2), { flag: 'wx' });
  await cp('audit/final-pre-windows-readiness/controlled-cases', `${root}/before-cases`, { recursive: true, force: false, errorOnExist: true });
} else {
  const baseline = JSON.parse(await readFile(`${root}/before-hashes.json`, 'utf8'));
  const changed = files.filter(file => hashes[file] !== baseline[file]);
  await writeFile(`${root}/after-hashes.json`, JSON.stringify({ hashes, changed }, null, 2));
  if (changed.length) throw new Error(`FROZEN_BOUNDARY_CHANGED:${changed.join(',')}`);
}
console.log(JSON.stringify({ mode, hashes }));
