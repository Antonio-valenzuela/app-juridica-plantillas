// Backend HTTP verification only, not browser automation and not generation.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const baseUrl = 'http://localhost:3200';
const source = resolve('audit/final-contestaciones-validation/run-2026-10-02T21-56-42-990Z/laboral/generated-document.json');
const output = resolve('audit/draft-export-recovery/http');
await mkdir(output, { recursive: true });
const original = await readFile(source);
const document = JSON.parse(original);
const marker = 'EDICION ACTUAL DEL ABOGADO: copia de prueba para revision, no presentar.';
document.sections[0].content.push({ id: 'draft-http-manual-edit', text: marker, layer: 'GENERATED_ARGUMENT', trustLevel: 'UNVERIFIED', generatedBy: 'USER', isManuallyEdited: true });
await writeFile(join(output, 'editor-document.json'), JSON.stringify(document, null, 2));
const report = { source, sourceSha256: createHash('sha256').update(original).digest('hex'), browserE2E: 'BLOCKED_BY_SAVED_BROWSER_PERMISSION', generation: 'NOT_REPEATED', exports: [] };
try {
  for (const format of ['docx', 'pdf']) {
    const response = await fetch(`${baseUrl}/api/legal-engine/export/${format}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl, 'x-unsaved-draft-export': 'true' },
      body: JSON.stringify({ document, exportMode: 'DRAFT' }), signal: AbortSignal.timeout(90000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const record = { format, status: response.status, contentType: response.headers.get('content-type'), exportMode: response.headers.get('x-export-mode'), persistence: response.headers.get('x-export-persistence'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    report.exports.push(record);
    if (!response.ok) { record.error = bytes.toString(); throw new Error(`HTTP_${format}_${response.status}`); }
    assert.equal(bytes.subarray(0, format === 'docx' ? 2 : 4).toString(), format === 'docx' ? 'PK' : '%PDF');
    assert.equal(record.exportMode, 'DRAFT');
    assert.equal(record.persistence, 'UNSAVED_LOCAL_DRAFT');
    await writeFile(join(output, `current-editor-draft.${format}`), bytes);
  }
  report.status = 'PASS_HTTP_BINARY_ONLY';
} catch (error) { report.status = 'FAIL'; report.error = error.message; process.exitCode = 1; }
finally {
  report.sourceUnchanged = createHash('sha256').update(await readFile(source)).digest('hex') === report.sourceSha256;
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
