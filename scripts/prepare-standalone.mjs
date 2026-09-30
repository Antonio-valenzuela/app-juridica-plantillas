import { access, cp, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const output = path.join(root, '.next', 'standalone');
try {
  await access(path.join(output, 'server.js'));
  await access(path.join(root, '.next', 'static'));
  const manual = path.join(root, 'data', 'documents', 'operational-manual', 'v1.0');
  const index = JSON.parse(await readFile(path.join(manual, 'index.json'), 'utf8'));
  const original = await readFile(path.join(manual, 'LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf'));
  if (createHash('sha256').update(original).digest('hex') !== index.manifest.sourceHash) throw new Error('MANUAL_SOURCE_HASH_MISMATCH');
  await mkdir(path.join(output, '.next'), {recursive:true});
  await cp(path.join(root, '.next', 'static'), path.join(output, '.next', 'static'), {recursive:true});
  await cp(manual, path.join(output, 'data', 'documents', 'operational-manual', 'v1.0'), {recursive:true});
  for (const relative of ['public', 'spa.traineddata', 'scripts/desktop/local-next-lifecycle.mjs']) {
    try { await access(path.join(root,relative)); } catch { continue; }
    await mkdir(path.dirname(path.join(output,relative)), {recursive:true});
    await cp(path.join(root,relative), path.join(output,relative), {recursive:true});
  }
  console.log('STANDALONE_PREPARED static+canonical-manual+available-runtime-assets');
} catch (error) {
  console.error(`STANDALONE_PREPARATION_FAILED:${error.code || error.message}`);
  process.exitCode = 1;
}
