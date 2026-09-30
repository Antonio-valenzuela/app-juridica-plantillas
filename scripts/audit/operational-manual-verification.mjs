import fs from 'node:fs';
import crypto from 'node:crypto';
const root = 'audit/operational-manual-verification-2026-09-29';
const index = JSON.parse(fs.readFileSync('data/documents/operational-manual/v1.0/index.json', 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const active = JSON.parse(fs.readFileSync(`${root}/legal-engine.json`, 'utf8'));
const ablated = JSON.parse(fs.readFileSync(`${root}/ablation.json`, 'utf8'));
const failures = report => report.testResults.flatMap(file => file.assertionResults.filter(t => t.status === 'failed').map(t => ({file:file.name,name:t.fullName,messages:t.failureMessages})));
const controlFailures = failures(ablated);
const rows = failures(active).map(f => ({ ...f,
  reproducedWithoutManual: controlFailures.some(t => t.name === f.name && t.file === f.file),
  classification: 'D. INDETERMINADO: ablation proves independence from retrieval/audit effects, not complete historical causality',
}));
const unclassified = index.fragments.filter(f => f.category === 'UNCLASSIFIED');
// Deterministic stratified sample across all pages, retained verbatim for human review.
const sample = index.pages.flatMap(p => {
  const fragments = unclassified.filter(f => f.physicalPage === p.physicalPage);
  return fragments.length ? [fragments[0],fragments[Math.floor(fragments.length/2)],fragments.at(-1)] : [];
}).filter((f,i,a) => a.findIndex(v => v.stableRuleId === f.stableRuleId) === i);
const evidence = {manifest:index.manifest,
  hashes:{original:sha('C:/Users/yahir/Downloads/LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf'),copy:sha('data/documents/operational-manual/v1.0/LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf')},
  reconstructedPages:index.pages.filter(p => index.fragments.filter(f=>f.physicalPage===p.physicalPage).map(f=>f.originalText).join('')===p.text).length,
  totalFragments:index.fragments.length, unclassifiedCount:unclassified.length,
  sampleCount:sample.length,sample,
  sampleIndicators:{shortLines:sample.filter(f=>f.originalText.trim().length<35).length,
    blank:sample.filter(f=>!f.originalText.trim()).length,
    legalTerms:sample.filter(f=>/hechos|derecho|jurídic|demanda|recurso|plazo|sentencia|defensa|artículo/i.test(f.originalText)).length},
  classificationLimit:'Indicators overlap; not a validated semantic classification. No relabeling performed.',
  tests:{active:{pass:active.numPassedTests,fail:active.numFailedTests,skip:active.numPendingTests}, ablated:{pass:ablated.numPassedTests,fail:ablated.numFailedTests,skip:ablated.numPendingTests}},failures:rows};
fs.writeFileSync(`${root}/isolation-and-integrity.json`,JSON.stringify(evidence,null,2));
console.log(JSON.stringify({hashes:evidence.hashes,reconstructedPages:evidence.reconstructedPages,sampleCount:sample.length,tests:evidence.tests,failures:rows.length},null,2));
