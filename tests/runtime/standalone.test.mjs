import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const script = path.resolve('scripts/prepare-standalone.mjs');
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lex-standalone-'));
  for (const dir of ['.next/standalone', '.next/static/css', 'data/documents/operational-manual/v1.0']) await mkdir(path.join(root, dir), { recursive: true });
  await writeFile(path.join(root, '.next/standalone/server.js'), '// synthetic runtime');
  await writeFile(path.join(root, '.next/static/css/app.css'), 'body{color:navy}');
  const bytes = Buffer.from('synthetic canonical manual');
  await writeFile(path.join(root, 'data/documents/operational-manual/v1.0/LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf'), bytes);
  await writeFile(path.join(root, 'data/documents/operational-manual/v1.0/index.json'), JSON.stringify({manifest:{sourceHash:createHash('sha256').update(bytes).digest('hex')}}));
  return root;
}
test('build preparation includes static files and canonical manual byte-for-byte without user documents', async () => {
  const root = await fixture();
  await mkdir(path.join(root, 'data/documents/private-cases'), {recursive:true});
  await writeFile(path.join(root, 'data/documents/private-cases/private.txt'), 'must not ship');
  const run = spawnSync(process.execPath, [script, root], {encoding:'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(await readFile(path.join(root,'.next/standalone/.next/static/css/app.css'),'utf8'), 'body{color:navy}');
  assert.deepEqual(await readFile(path.join(root,'.next/standalone/data/documents/operational-manual/v1.0/LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf')), Buffer.from('synthetic canonical manual'));
  await assert.rejects(readFile(path.join(root,'.next/standalone/data/documents/private-cases/private.txt')));
});
test('preparation rejects an incomplete manual rather than shipping a broken runtime', async () => {
  const root = await fixture();
  await writeFile(path.join(root,'data/documents/operational-manual/v1.0/LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf'),'tampered');
  const run = spawnSync(process.execPath,[script,root],{encoding:'utf8'});
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/MANUAL_SOURCE_HASH_MISMATCH/);
});
