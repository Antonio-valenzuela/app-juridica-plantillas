import { launchDesktopLocal, assertPortAvailable } from '../desktop/local-launcher.mjs';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = path.resolve('audit/final-pre-windows-readiness/inflight', `run-${new Date().toISOString().replaceAll(':', '-')}`);
await mkdir(root, { recursive: true });
process.env.LEXPLANTILLAS_STORAGE_ROOT = path.join(root, 'synthetic-store');
process.env.LEGAL_CASES_USER_EMAIL = ''; process.env.LEGAL_CASES_ORG_SLUG = ''; process.env.DEMO_MODE_ENABLED = 'false';
let session;
const logs = [], report = { status: 'PARTIAL', scope: 'ONE_REAL_GENERATION_STOPPED_WHILE_ACTIVE', root };
const save = (name, value) => writeFile(path.join(root, name), JSON.stringify(value, null, 2));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function api(url, method = 'GET', body) {
  const response = await fetch(`${session.baseUrl}${url}`, { method, headers: { 'x-lex-desktop-capability': session.capability, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json(); assert.equal(response.status, 200, `${url}: ${JSON.stringify(value)}`); return value;
}
try {
  session = await launchDesktopLocal({ projectDir: process.cwd(), port: 3200, onOutput: line => logs.push(line) });
  await api('/api/workspace/lawyer-profile', 'PUT', { lawyerName: 'ABOGADO SINTETICO INTERRUPCION', firmName: 'ENSAYO AISLADO' });
  const text = (await readFile('tests/fixtures/controlledLegalQuality.ts', 'utf8')).match(/contestacion: '([^']+)'/)[1];
  const instruction = (await readFile('tests/fixtures/draftingInstructions.ts', 'utf8')).match(/contestacion: '([^']+)'/)[1];
  const form = new FormData(); form.append('file', new Blob([text], { type: 'text/plain' }), 'interrupcion-sintetica.txt');
  const upload = await fetch(`${session.baseUrl}/api/templates/analyze-upload`, { method: 'POST', headers: { 'x-lex-desktop-capability': session.capability }, body: form });
  const analysis = await upload.json(); await save('analysis.json', analysis);
  assert.equal(upload.status, 200); assert.equal(analysis.sourceValidated, true);
  const admission = await api('/api/legal-engine/generate', 'POST', { userInstruction: instruction, matter: 'civil', jurisdiction: 'local', selectedDocumentType: 'contestacion_demanda_civil', expediente: 'SYN-INT-001', externalProviderOptIn: true, idempotencyKey: path.basename(root),
    sourceDocuments: [{ id: 'inflight-source', filename: analysis.sourceFileName, content: analysis.extractedText, extractedText: analysis.extractedText, sourceValidated: analysis.sourceValidated, pages: analysis.pages, sourceGrounding: analysis.sourceGrounding, sourceQualityStatus: analysis.sourceQualityStatus }] });
  await save('admission.json', admission);
  const directory = path.join(process.env.LEXPLANTILLAS_STORAGE_ROOT, 'data', 'legal-workspace', 'desktop-jobs-v1');
  let before;
  const started = Date.now();
  while (Date.now() - started < 600000) {
    const status = await api(`/api/legal-engine/generate/status?jobId=${admission.jobId}`);
    assert.equal(status.status, 'processing', 'JOB_TERMINATED_BEFORE_CHECKPOINT: no false inflight proof');
    try { before = JSON.parse(await readFile(path.join(directory, `${admission.jobId}.json`), 'utf8')).record; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (before?.status === 'processing' && before.checkpointDocument && before.completed > 0) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(before?.checkpointDocument && before.completed > 0, 'NO_PERSISTED_NONEMPTY_CHECKPOINT');
  assert.equal(before.status, 'processing'); await save('checkpoint-before-stop.json', before);
  report.before = { jobId: before.jobId, documentId: before.documentId, ownerId: before.desktopOwnerId, completed: before.completed, checkpointHash: hash(before.checkpointDocument) };
  await session.close(); session = undefined; await assertPortAvailable(3200);
  const atStop = JSON.parse(await readFile(path.join(directory, `${admission.jobId}.json`), 'utf8')).record;
  await save('checkpoint-after-stop.json', atStop); assert.equal(atStop.status, 'processing');
  session = await launchDesktopLocal({ projectDir: process.cwd(), port: 3200, onOutput: line => logs.push(line) });
  const recovered = await api(`/api/legal-engine/generate/status?jobId=${admission.jobId}`); await save('status-after-restart.json', recovered);
  const stored = JSON.parse(await readFile(path.join(directory, `${admission.jobId}.json`), 'utf8')).record;
  await save('checkpoint-after-recovery.json', stored);
  assert.equal(stored.jobId, atStop.jobId); assert.equal(stored.desktopOwnerId, atStop.desktopOwnerId); assert.equal(stored.documentId, atStop.documentId);
  assert.equal(hash(stored.checkpointDocument), hash(atStop.checkpointDocument)); assert.equal(stored.completed, atStop.completed);
  assert.equal(recovered.status, 'failed'); assert.equal(recovered.errorCode, 'DESKTOP_BACKEND_RESTARTED'); assert.notEqual(recovered.terminalStatus, 'COMPLETED');
  assert.equal((await readdir(directory)).filter(name => name.endsWith('.json')).length, 1);
  await save('drafts-after-restart.json', await api('/api/legal-drafts'));
  report.status = 'PASS_CHECKPOINT_PRESERVATION_ONLY'; report.behavior = 'FAILED / DESKTOP_BACKEND_RESTARTED; no automatic resume demonstrated';
  report.after = { jobId: stored.jobId, documentId: stored.documentId, ownerId: stored.desktopOwnerId, completed: stored.completed, checkpointHash: hash(stored.checkpointDocument), terminalStatus: stored.terminalStatus };
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  if (session) await session.close();
  report.providerRequests = logs.filter(line => /\[(GROQ|GEMINI|NVIDIA)\] REQUEST/.test(line)).length;
  report.providerSuccesses = logs.filter(line => /\[ProviderRouter\] SUCCESS/.test(line) && !/"provider":"local"/.test(line)).length;
  await save('report.json', report); await writeFile(path.join(root, 'backend.log'), logs.join('\n')); console.log(JSON.stringify(report));
}
