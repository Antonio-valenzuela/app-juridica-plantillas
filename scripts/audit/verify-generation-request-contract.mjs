import { launchDesktopLocal } from '../desktop/local-launcher.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const fixture = await readFile('scripts/audit/verify-desktop-eligible-draft-journey.mjs', 'utf8');
const text = fixture.match(/const text = '([^']+)';/)[1];
const instruction = fixture.match(/const instruction = '([^']+)';/)[1];
const root = path.resolve('audit/final-pre-windows-readiness/request-contract', `run-${new Date().toISOString().replaceAll(':', '-')}`);
await mkdir(root, { recursive: true });
process.env.LEXPLANTILLAS_STORAGE_ROOT = path.join(root, 'synthetic-store');
process.env.LEGAL_CASES_USER_EMAIL = ''; process.env.LEGAL_CASES_ORG_SLUG = ''; process.env.DEMO_MODE_ENABLED = 'false';
let session;
const logs = [];
const report = { status: 'PARTIAL', fixture: 'EXACT_PRIOR_FIXTURE', generationRuns: 0, exports: [] };
const artifact = (name, value) => writeFile(path.join(root, name), JSON.stringify(value, null, 2));
async function api(endpoint, method = 'GET', body) {
  const response = await fetch(`${session.baseUrl}${endpoint}`, { method, headers: { 'x-lex-desktop-capability': session.capability, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json();
  assert.ok(response.ok, `${endpoint}: ${response.status} ${value.errorCode || value.error || ''}`);
  return value;
}
try {
  session = await launchDesktopLocal({ projectDir: process.cwd(), port: 3200, onOutput: line => logs.push(line) });
  await api('/api/workspace/lawyer-profile', 'PUT', { lawyerName: 'ABOGADO SINTETICO SOLO ENSAYO', firmName: 'PRUEBA AISLADA' });
  const form = new FormData(); form.append('file', new Blob([text], { type: 'text/plain' }), 'contestacion-synthetic.txt');
  const upload = await fetch(`${session.baseUrl}/api/templates/analyze-upload`, { method: 'POST', headers: { 'x-lex-desktop-capability': session.capability }, body: form });
  const analysis = await upload.json(); await artifact('analysis.json', analysis);
  assert.equal(upload.status, 200); assert.equal(analysis.sourceValidated, true);
  const source = { id: 'synthetic-http-source', filename: analysis.sourceFileName, content: analysis.extractedText, extractedText: analysis.extractedText, sourceValidated: true, pages: analysis.pages, sourceGrounding: analysis.sourceGrounding, sourceQualityStatus: analysis.sourceQualityStatus };
  report.generationRuns++;
  const admission = await api('/api/legal-engine/generate', 'POST', { userInstruction: instruction, sourceDocuments: [source], matter: 'civil', jurisdiction: 'local', selectedDocumentType: 'escrito_libre', documentTypeLabel: 'Escrito libre de incorporación documental', expediente: 'SYN-LIBRE-001', caseParties: [{ role: 'promovente', name: 'PERSONA SINTETICA A', source: 'SOURCE' }], externalProviderOptIn: true, idempotencyKey: path.basename(root) });
  await artifact('admission.json', admission); report.jobId = admission.jobId;
  const started = Date.now(); let status;
  while (Date.now() - started < 20 * 60 * 1000) {
    status = await api(`/api/legal-engine/generate/status?jobId=${admission.jobId}`);
    await artifact('status.json', status);
    if (status.status !== 'processing') break;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  report.elapsedMs = Date.now() - started; report.terminalStatus = status.terminalStatus;
  assert.equal(status.status, 'completed');
  const drafts = (await api('/api/legal-drafts')).drafts;
  assert.equal(drafts.length, 1);
  const doc = drafts[0].structuredDoc; await artifact('generated-document.json', doc);
  report.documentId = doc.id;
  const sectionText = type => doc.sections.filter(section => section.type === type).flatMap(section => section.content.map(block => block.text)).join('\n');
  report.contractErrors = doc.validation.errors.filter(issue => issue.checkId.startsWith('REQUEST_CONTRACT_'));
  report.validationErrors = doc.validation.errors;
  report.requestContract = doc.generationMetadata.requestContract;
  report.proemio = sectionText('identity'); report.petitions = sectionText('petition');
  report.body = doc.sections.filter(section => ['argument', 'legal_grounds', 'background'].includes(section.type)).flatMap(section => section.content.map(block => block.text)).join('\n');
  assert.equal(doc.parties.actor, 'PERSONA SINTETICA A');
  assert.match(report.proemio, /PERSONA SINTETICA A/); assert.match(report.proemio, /por (?:su |mi )?propio derecho/i);
  assert.match(report.petitions, /tener por presentada la constancia e incorporarla/i);
  assert.doesNotMatch(report.petitions, /medio de defensa|resolución favorable|fundadas las pretensiones/i);
  assert.equal(report.contractErrors.length, 0);
  assert.notEqual(doc.status, 'final');
  report.formalData = 'PASS'; report.petitionsCongruence = 'PASS';
  for (const format of ['docx', 'pdf']) {
    const response = await fetch(`${session.baseUrl}/api/legal-engine/export/${format}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lex-desktop-capability': session.capability }, body: JSON.stringify({ document: doc, exportMode: 'DRAFT' }) });
    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length > 500);
      await writeFile(path.join(root, `draft.${format}`), bytes); report.exports.push({ format, status: response.status, bytes: bytes.length });
    } else report.exports.push({ format, status: response.status, detail: await response.json() });
  }
  report.status = report.exports.every(result => result.status === 200) ? 'PASS_REQUEST_CONTRACT_DRAFT_EXPORT' : 'PARTIAL_EXPORT_BLOCKED';
} catch (error) { report.error = error.message.replaceAll(session?.capability || 'NO_SECRET', '[REDACTED]'); process.exitCode = 1; }
finally {
  if (session) await session.close();
  report.externalRequests = logs.filter(line => /\[(GROQ|GEMINI|NVIDIA)\] REQUEST/.test(line)).length;
  report.externalSuccesses = logs.filter(line => /\[ProviderRouter\] SUCCESS/.test(line) && !/"provider":"local"/.test(line)).length;
  await artifact('report.json', report); await writeFile(path.join(root, 'backend.log'), logs.join('\n'));
  console.log(JSON.stringify({ root, ...report }, null, 2));
}
