import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
const audit = path.join(root, 'audit/generator-master');
for (const name of ['FAILURES.md', 'STATUS.md']) {
  const previous = path.join(audit, `PRE_V5_${name}`);
  if (!fs.existsSync(previous)) fs.copyFileSync(path.join(audit, name), previous);
}
const read = name => JSON.parse(fs.readFileSync(path.join(audit, name), 'utf8'));
const replay = read('v5-replay/results.json').records;
const matrix = read('writing-coverage.json');
const runFiles = ['v5-global-tests.json', 'v5-global-offline-final.json', 'v5-affected-final.json', 'v5-appeal-ui-fixture-final.json', 'v5-global-current.json'];
const runs = runFiles.filter(name => fs.existsSync(path.join(audit, name))).map(name => ({ file: name, ...read(name) }));
const currentGlobal = read('v5-global-current.json');
const byFile = new Map();
for (const run of runs) for (const file of run.testResults) byFile.set(file.name, file);
const latest = [...byFile.values()].flatMap(file => file.assertionResults.map(test => ({ file: file.name.replace(/^.*\/tests\//, 'tests/'),
  name: test.fullName, status: test.status, error: test.status === 'failed' ? (test.failureMessages?.[0] || '').split('\n')[0] : undefined })));
const count = status => latest.filter(test => test.status === status).length;
const failures = latest.filter(test => test.status === 'failed');
const families = [...new Set(replay.map(record => record.family))].sort().map(family => {
  const records = replay.filter(record => record.family === family);
  return { family, types: records.length, mechanicalPass: records.filter(r => r.mechanicalReplay === 'PASS').length,
    substantivePass: records.filter(r => r.scorecard?.substantivePass === true).length,
    finalAllowed: records.filter(r => r.finalAllowed === true).length, functionalPass: 0,
    status: 'NOT_CLOSED', humanReview: 'PENDING' };
});
for (const row of matrix.rows) {
  const evidence = replay.find(record => record.id === row.id);
  row.v5Evidence = evidence ? { mechanicalReplay: evidence.mechanicalReplay, scorecard: evidence.scorecard,
    docx: evidence.exports?.docx, pdf: evidence.exports?.pdf, pdfPages: evidence.pdfPages,
    finalAllowed: evidence.finalAllowed, full40Criteria: 'NOT_DEMONSTRATED',
    evidencePath: `audit/generator-master/v5-replay/${row.id}.json`,
    uiE2E: 'BLOCKED_EXTERNAL_EACCES', realProvider: 'NOT_CALLED' }
    : { mechanicalReplay: 'NOT_RUN', full40Criteria: 'NOT_DEMONSTRATED' };
  // Evidence never promotes a status automatically.
}
matrix.v5 = { updatedAt: new Date().toISOString(), families, mechanicalPass: replay.filter(r => r.mechanicalReplay === 'PASS').length,
  certifiedFunctionalTypes: 0, full40Criteria: 'NOT_DEMONSTRATED' };
fs.writeFileSync(path.join(audit, 'writing-coverage.json'), JSON.stringify(matrix, null, 2));
let markdown = fs.readFileSync(path.join(audit, 'WRITING_COVERAGE_MATRIX.md'), 'utf8').split('\n## V5 replay evidence\n')[0];
markdown += '\n## V5 replay evidence\n\nNo functional status or human approval is inferred from structural export. Full 40 criteria remain unproven.\n\n';
markdown += '| Family | Replayed types | Structural export PASS | Scorecard without findings | Functional certification |\n|---|---:|---:|---:|---|\n';
markdown += families.map(f => `| ${f.family} | ${f.types} | ${f.mechanicalPass} | ${f.substantivePass} | NOT_CLOSED |`).join('\n') + '\n';
fs.writeFileSync(path.join(audit, 'WRITING_COVERAGE_MATRIX.md'), markdown);
const summary = { updatedAt: new Date().toISOString(), branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), canonical: matrix.summary.canonicalDocumentCount,
  implemented: matrix.summary.currentImplementedCount, functionalPass: 0, families,
  tests: { exactCurrentGlobal: { total: currentGlobal.numTotalTests, pass: currentGlobal.numPassedTests,
      fail: currentGlobal.numFailedTests, skipped: currentGlobal.numPendingTests,
      failedFiles: currentGlobal.testResults.filter(file => file.status === 'failed').length },
    mode: 'LATEST_RESULT_PER_FILE_NOT_A_SINGLE_FRESH_GLOBAL_RUN', pass: count('passed'), fail: count('failed'),
    skipped: count('pending') + count('skipped') + count('todo'), sourceRuns: runs.map(run => ({ file: run.file,
      total: run.numTotalTests, pass: run.numPassedTests, fail: run.numFailedTests, skipped: run.numPendingTests })) }, failures,
  ui: read('v5-e2e-ui/result.json'), generatorFunctional100: false };
fs.writeFileSync(path.join(audit, 'V5_EVIDENCE_SUMMARY.json'), JSON.stringify(summary, null, 2));
const familyMd = '# V5 estado de todas las familias\n\nSe recorrieron los 214 tipos implementados sin llamar proveedores reales. El replay valida ruta, ensamblado y exportación estructural DRAFT. No demuestra contenido profesional ni los 40 criterios completos.\n\n' + markdown.split('## V5 replay evidence')[1] +
  '\nLas restantes áreas y tipos de catálogo no implementados no se completaron ni se rebajaron para mejorar estadísticas. Las 14 áreas con implementación se recorrieron; eso no acredita todas las familias jurídicas del catálogo. Civil tiene 27 replays físicos, no 27 certificaciones.\n';
fs.writeFileSync(path.join(audit, 'FAMILY_CLOSURE.md'), familyMd);
const failureMd = '# V5 fallos pendientes\n\nEste archivo no oculta fallos ni los convierte en saltos. Los resultados externos de la primera suite no se consideran llamadas jurídicas exitosas.\n\n' +
  '| Archivo | Tests fallidos en el último resultado disponible |\n|---|---:|\n' + [...new Set(failures.map(test => test.file))].map(file => `| ${file} | ${failures.filter(t => t.file === file).length} |`).join('\n') +
  '\n\nDetalle y mensajes originales: V5_EVIDENCE_SUMMARY.json y JSON de cada suite. Los tests de UI de apelación anteriores a la política funcional requieren reconciliar su fixture con la disponibilidad actual; no se habilitó producción para satisfacerlos. Los tests de markers antiguos esperan etiquetas anteriores a la normalización. Los fallos de extracción, postura y admisión pendientes no se declaran obsoletos sin investigación individual.\n';
fs.writeFileSync(path.join(audit, 'FAILURES.md'), failureMd);
fs.writeFileSync(path.join(audit, 'V5_CURRENT_CHANGES.patch'), execFileSync('git', ['diff', '--no-ext-diff'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
console.log(JSON.stringify({ families: families.length, replayed: replay.length, tests: summary.tests, functionalPass: 0 }, null, 2));
