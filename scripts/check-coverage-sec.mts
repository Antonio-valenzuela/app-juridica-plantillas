import fs from 'node:fs';
import { buildCoverageMatrix } from '../lib/legal-engine/coverageMatrix';
import { getDocumentTemplate } from '../lib/legal-engine/documentTemplates';

const upload = JSON.parse(fs.readFileSync('audit/autonomous-legal-drafting-phase4/attempt-02/cases/01/source/analyze-upload-response.json', 'utf8'));
const analysis = upload.analysis;
const template = getDocumentTemplate('contestacion_demanda_laboral');
console.log('Template section IDs:', template?.sections.map(s => `${s.id} (${s.title})`));

const sections = (template?.sections || []).map((sec, idx) => ({ id: sec.id, type: sec.type, title: sec.title, order: idx + 1, content: [] }));
const doc = { id: 'test', documentType: 'contestacion_demanda_laboral', sections } as any;
const cov = buildCoverageMatrix(analysis, doc, sections as any);

console.log('Sample coverage items targetSectionIds:');
for (const it of cov.items.slice(0, 15)) {
  console.log(`- ${it.id} [${it.category}]: targets=${JSON.stringify(it.targetSectionIds)}`);
}
