import { launchDesktopLocal, assertPortAvailable } from '../desktop/local-launcher.mjs';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('audit/final-pre-windows-readiness/generation-journey', `run-${new Date().toISOString().replaceAll(':', '-')}`);
await mkdir(root, { recursive: true });
process.env.LEXPLANTILLAS_STORAGE_ROOT = path.join(root, 'synthetic-store');
process.env.LEGAL_CASES_USER_EMAIL = ''; process.env.LEGAL_CASES_ORG_SLUG = ''; process.env.DEMO_MODE_ENABLED = 'false';
const report = { startedAt: new Date().toISOString(), classification: 'SYNTHETIC_REAL_HTTP_REAL_PROVIDERS', stages: [], status: 'PARTIAL', provider: 'NOT_REACHED' };
let session;
const logs = [];
const artifact = async (name, data) => writeFile(path.join(root, name), JSON.stringify(data, null, 2));
async function stage(name, operation) {
  const started = Date.now();
  try { const result = await operation(); report.stages.push({ stage: name, status: 'PASS', latencyMs: Date.now() - started, ...result }); await artifact('report.json', report); return result; }
  catch (error) { report.stages.push({ stage: name, status: 'FAIL', latencyMs: Date.now() - started, error: error.message }); throw error; }
}
async function api(endpoint, method = 'GET', body, expected = 200) {
  const response = await fetch(`${session.baseUrl}${endpoint}`, { method, headers: { 'x-lex-desktop-capability': session.capability, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json();
  assert.equal(response.status, expected, `${endpoint}: ${value.errorCode || value.error || response.status}`);
  return value;
}
try {
  session = await launchDesktopLocal({ projectDir: process.cwd(), port: 3200, onOutput: line => logs.push(line) });
  const text = (await readFile('tests/fixtures/controlledLegalQuality.ts', 'utf8')).match(/contestacion: '([^']+)'/)[1];
  const instruction = (await readFile('tests/fixtures/draftingInstructions.ts', 'utf8')).match(/contestacion: '([^']+)'/)[1];
  const profile = await stage('CONFIGURACION', async () => { const value = await api('/api/workspace/lawyer-profile', 'PUT', { lawyerName: 'ABOGADO SINTETICO SOLO ENSAYO', firmName: 'PRUEBA AISLADA' }); return { artifact: 'profile.json', persistence: 'DISK', ownerId: value.ownerId }; });
  const form = new FormData(); form.append('file', new Blob([text], { type: 'text/plain' }), 'contestacion-synthetic.txt');
  let analysis;
  await stage('UPLOAD_EXTRACCION_ANALISIS', async () => {
    const response = await fetch(`${session.baseUrl}/api/templates/analyze-upload`, { method: 'POST', headers: { 'x-lex-desktop-capability': session.capability }, body: form });
    analysis = await response.json(); await artifact('upload-analysis.json', analysis);
    assert.equal(response.status, 200); assert.equal(analysis.ok, true);
    assert.equal(analysis.sourceValidated, true, 'SOURCE_REVIEW_REQUIRED: do not override extraction gate');
    return { artifact: 'upload-analysis.json', persistence: 'UPLOAD_ANALYSIS_CACHE', pages: analysis.pages.length, extractedCharacters: analysis.extractedText.length, eligibility: analysis.generationEligibility };
  });
  const source = { id: 'synthetic-http-source', filename: analysis.sourceFileName, content: analysis.extractedText, extractedText: analysis.extractedText,
    sourceValidated: analysis.sourceValidated, pages: analysis.pages, sourceGrounding: analysis.sourceGrounding, sourceQualityStatus: analysis.sourceQualityStatus };
  const admitted = await stage('GENERACION_ADMISION', async () => {
    const value = await api('/api/legal-engine/generate', 'POST', { userInstruction: instruction, sourceDocuments: [source],
      matter: 'civil', jurisdiction: 'local', selectedDocumentType: 'contestacion_demanda_civil', documentTypeLabel: 'Contestación de demanda civil',
      expediente: 'SYN-CIV-001', externalProviderOptIn: true, idempotencyKey: path.basename(root) });
    await artifact('generation-admission.json', value); assert.ok(value.jobId); return { jobId: value.jobId, artifact: 'generation-admission.json', persistence: 'JOB_DISK_PENDING' };
  });
  let status;
  const started = Date.now();
  while (Date.now() - started < 20 * 60 * 1000) {
    status = await api(`/api/legal-engine/generate/status?jobId=${admitted.jobId}`);
    await artifact('job-latest.json', status);
    if (status.status !== 'processing') break;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  await artifact('provider-log.json', logs.filter(line => /ProviderRouter|RESPONSE_OK|RESPONSE_ERROR|HTTP_ERROR|RATE_LIMIT|FALLBACK|SUCCESS|REQUEST/.test(line)));
  const providerSuccesses = logs.filter(line => /\[ProviderRouter\] SUCCESS/.test(line) && !/"provider":"local"/.test(line));
  const providerAttempts = logs.filter(line => /\[(GROQ|GEMINI|NVIDIA)\] REQUEST/.test(line));
  report.provider = providerSuccesses.length ? 'REAL_PROVIDER_SUCCESS' : providerAttempts.length ? 'EXTERNAL_PROVIDER_BLOCKED' : 'NOT_REACHED';
  report.providerSuccesses = providerSuccesses.length; report.providerAttempts = providerAttempts.length;
  const drafts = (await api('/api/legal-drafts')).drafts;
  await artifact('drafts-before-restart.json', drafts);
  const jobsDirectory = path.join(process.env.LEXPLANTILLAS_STORAGE_ROOT, 'data', 'legal-workspace', 'desktop-jobs-v1');
  report.jobDirectory = jobsDirectory;
  report.jobFiles = await readdir(jobsDirectory).catch(() => []);
  report.stages.push({ stage: 'GENERACION_TERMINAL', status: status.status === 'completed' && providerSuccesses.length ? 'PASS' : 'PARTIAL',
    latencyMs: Date.now() - started, terminalStatus: status.terminalStatus, error: status.errorCode, artifact: 'job-latest.json', persistence: 'JOB_AND_ARTIFACT_DISK', draftCount: drafts.length });
  const oldCapability = session.capability;
  await session.close(); session = undefined; await assertPortAvailable(3200);
  session = await launchDesktopLocal({ projectDir: process.cwd(), port: 3200, onOutput: line => logs.push(line) });
  await stage('REINICIO_RECUPERACION', async () => {
    assert.equal((await fetch(`${session.baseUrl}/api/legal-drafts`, { headers: { 'x-lex-desktop-capability': oldCapability } })).status, 403);
    const recovered = await api(`/api/legal-engine/generate/status?jobId=${admitted.jobId}`); await artifact('job-after-restart.json', recovered);
    assert.equal(recovered.jobId, admitted.jobId);
    const after = (await api('/api/legal-drafts')).drafts; assert.equal(after.length, drafts.length);
    assert.deepEqual(after.map(value => value.id).sort(), drafts.map(value => value.id).sort());
    for (const draft of after) { const reopened = await api(`/api/legal-drafts/${draft.id}`); assert.equal(reopened.draft.structuredDoc.id, draft.structuredDoc.id); }
    await artifact('analytics-after-restart.json', await api('/api/workspace/analytics?rangeDays=30'));
    return { artifact: 'job-after-restart.json', persistence: 'REAL_BACKEND_RESTART', draftCount: after.length, previousCapabilityStatus: 403 };
  });
  report.status = report.provider === 'REAL_PROVIDER_SUCCESS' && status.status === 'completed' && !status.warnings?.includes('DESKTOP_JOB_PERSISTENCE_FAILED') ? 'PASS_INFRA_AND_PROVIDER_REQUIRES_LEGAL_REVIEW' : 'PARTIAL';
} catch (error) {
  report.error = String(error.message).replaceAll(session?.capability || 'NO_SECRET', '[REDACTED]');
  process.exitCode = 1;
} finally {
  if (session) await session.close();
  report.finishedAt = new Date().toISOString();
  await artifact('report.json', report); await writeFile(path.join(root, 'backend.log'), logs.join('\n'));
  console.log(JSON.stringify({ root, ...report }, null, 2));
}
