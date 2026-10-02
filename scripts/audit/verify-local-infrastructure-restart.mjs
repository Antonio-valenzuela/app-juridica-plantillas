import { launchDesktopLocal, assertPortAvailable } from '../desktop/local-launcher.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

const evidence = path.resolve('audit/final-pre-windows-readiness/local-infrastructure');
await mkdir(evidence, { recursive: true });
process.env.LEXPLANTILLAS_STORAGE_ROOT = path.join(evidence, `synthetic-store-${Date.now()}`);
process.env.LEGAL_CASES_USER_EMAIL = '';
process.env.LEGAL_CASES_ORG_SLUG = '';
process.env.DEMO_MODE_ENABLED = 'false';
const report = { scope: 'REAL_HTTP_STORAGE_RESTART_ONLY', externalProviderCalls: 0, storageRoot: process.env.LEXPLANTILLAS_STORAGE_ROOT,
  startedAt: new Date().toISOString(), steps: [], status: 'FAIL' };
const logs = [];
const protectedFiles = ['lib/ai/providerChain.ts', 'lib/ai/providerRouter.ts', 'lib/legal-engine/qualityGate.ts',
  'lib/legal-engine/documentCoverage.ts', 'lib/legal-engine/coverageMatrix.ts', 'lib/security/lawyerAuth.ts', 'lib/cases/access.ts'];
const hashes = async () => Object.fromEntries(await Promise.all(protectedFiles.map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
let session;
async function api(endpoint, method = 'GET', body, expected = 200) {
  const response = await fetch(`${session.baseUrl}${endpoint}`, { method,
    headers: { 'x-lex-desktop-capability': session.capability, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, expected, `${method} ${endpoint}`);
  return response.json();
}
const record = (name, result) => report.steps.push({ name, ...result });
report.protectedBefore = await hashes();
try {
  session = await launchDesktopLocal({ projectDir: process.cwd(), port: 3200, onOutput: line => logs.push(line) });
  const listeners = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' }).split(/\r?\n/).filter(line => /:3200\s/.test(line) && /LISTENING/.test(line));
  assert.ok(listeners.length && listeners.every(line => /127\.0\.0\.1:3200/.test(line)));
  record('listener', { listeners });
  const initial = await api('/api/workspace/lawyer-profile');
  assert.equal(initial.configurationRequired, true);
  await api('/api/workspace/lawyer-profile', 'PUT', { lawyerName: 'ABOGADO SINTETICO SOLO PRUEBA', firmName: 'PRUEBA AISLADA', email: 'fixture@example.invalid', professionalLicense: 'SINTETICA' });
  const document = JSON.parse(await readFile('audit/final-pre-windows-readiness/legal-propagation/cases/contestacion/produced-document.json', 'utf8'));
  document.title = 'DOCUMENTO CONTROLADO SOLO RESTART';
  const { draft } = await api('/api/legal-drafts', 'POST', { title: document.title, documentType: document.documentType,
    matter: 'Civil', structuredDoc: document, formData: { synthetic: true }, generationMetadata: document.generationMetadata }, 201);
  const { case: item } = await api('/api/workspace/cases', 'POST', { title: 'CASO SINTETICO', expediente: 'SINTETICO-RESTART', matter: 'Civil', draftIds: [draft.id], notes: 'No es expediente real' }, 201);
  const { template } = await api('/api/templates/custom', 'POST', { entityKind: 'TEMPLATE', creationIntent: 'EXPLICIT_TEMPLATE', title: 'MACHOTE SINTETICO', category: 'Civil', content: 'C. JUEZ COMPETENTE\nComparece {{PROMOVENTE}} a solicitar {{PETICION}}.' }, 201);
  await api(`/api/templates/custom/${template.id}`, 'PATCH', { title: 'MACHOTE EDITADO' });
  const { event } = await api('/api/workspace/agenda', 'POST', { title: 'AUDIENCIA SINTETICA', dueDate: '2026-10-05', time: '16:30', priority: 'HIGH', caseId: item.id, notes: 'PRUEBA', eventType: 'AUDIENCIA' }, 201);
  await api('/api/workspace/agenda', 'PATCH', { id: event.id, title: 'AUDIENCIA EDITADA', dueDate: '2026-10-06' });
  await api('/api/legal-engine/parties', 'POST', { caseKey: 'SINTETICO-RESTART', role: 'actor', name: 'PERSONA SINTETICA', source: 'manual' });
  const before = await api('/api/workspace/analytics?rangeDays=30');
  record('records-created', { ownerId: initial.ownerId, draftId: draft.id, caseId: item.id, templateId: template.id, eventId: event.id, analyticsTotal: before.totals.total });
  const oldCapability = session.capability;
  await session.close(); session = undefined;
  await assertPortAvailable(3200);
  session = await launchDesktopLocal({ projectDir: process.cwd(), port: 3200, onOutput: line => logs.push(line) });
  assert.notEqual(session.capability, oldCapability);
  assert.equal((await fetch(`${session.baseUrl}/api/workspace/lawyer-profile`, { headers: { 'x-lex-desktop-capability': oldCapability } })).status, 403);
  const profile = await api('/api/workspace/lawyer-profile');
  assert.equal(profile.ownerId, initial.ownerId);
  assert.equal(profile.profile.professionalLicense, 'SINTETICA');
  assert.equal(profile.profile.email, 'fixture@example.invalid');
  assert.equal((await api(`/api/legal-drafts/${draft.id}`)).draft.structuredDoc.id, document.id);
  assert.equal((await api(`/api/legal-engine/documents/${document.id}`)).document.id, document.id);
  const storedCase = (await api('/api/workspace/cases')).cases.find(value => value.id === item.id);
  assert.ok(storedCase.draftIds.includes(draft.id));
  assert.equal((await api(`/api/templates/custom/${template.id}`)).template.title, 'MACHOTE EDITADO');
  const storedEvent = (await api('/api/workspace/agenda')).events.find(value => value.id === event.id);
  assert.equal(storedEvent.title, 'AUDIENCIA EDITADA');
  assert.equal(storedEvent.time, '16:30');
  assert.equal(storedEvent.caseId, item.id);
  assert.equal((await api('/api/legal-engine/parties?caseKey=SINTETICO-RESTART')).parties[0].name, 'PERSONA SINTETICA');
  assert.equal((await api('/api/workspace/analytics?rangeDays=30')).totals.total, before.totals.total);
  assert.ok(logs.every(line => !line.includes(oldCapability) && !line.includes(session.capability)));
  record('real-backend-restart', { profile: 'PASS', draft: 'PASS', documentEndpoint: 'PASS', cases: 'PASS', templates: 'PASS', agenda: 'PASS', parties: 'PASS', analytics: 'PASS', capabilityRotated: true, oldCapabilityStatus: 403 });
  report.status = 'PASS_SCOPED_NOT_GENERATION_OR_UI_CERTIFICATION';
} catch (error) {
  report.error = String(error.message).replaceAll(session?.capability || 'NO_SECRET', '[REDACTED]');
  process.exitCode = 1;
} finally {
  if (session) await session.close();
  report.protectedAfter = await hashes();
  report.protectedUnchanged = JSON.stringify(report.protectedBefore) === JSON.stringify(report.protectedAfter);
  if (!report.protectedUnchanged) { report.status = 'FAIL'; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(evidence, 'restart-runtime.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(evidence, 'restart-runtime.log'), logs.join('\n'));
  console.log(JSON.stringify(report, null, 2));
}
