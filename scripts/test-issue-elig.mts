import fs from 'node:fs';
import path from 'node:path';
import { buildCoverageMatrix } from '../lib/legal-engine/coverageMatrix';
import { buildLegalIssueMatrix } from '../lib/legal-engine/legalIssueMatrix';
import { resolveEffectiveIssueGenerationEligibility } from '../lib/legal-engine/issueScopedGeneration';
import { getDocumentTemplate } from '../lib/legal-engine/documentTemplates';

const uploadPath = path.resolve('audit/autonomous-legal-drafting-phase4/attempt-02/cases/01/source/analyze-upload-response.json');
const upload = JSON.parse(fs.readFileSync(uploadPath, 'utf8'));
const analysis = upload.analysis;
const template = getDocumentTemplate('contestacion_demanda_laboral');

const sections = (template?.sections || []).map((sec, idx) => ({
  id: sec.id,
  type: sec.type,
  title: sec.title,
  order: idx + 1,
  content: [],
  isRepeatable: false,
  isEditable: true,
  isGenerated: false,
  isManuallyEdited: false,
  variables: [],
  validationErrors: [],
  validationWarnings: [],
}));

const doc = {
  id: 'test-case-01',
  documentType: 'contestacion_demanda_laboral',
  documentTypeLabel: 'Contestación de Demanda Laboral',
  sections,
} as any;

const coverageMatrix = buildCoverageMatrix(analysis, doc, doc.sections);
const legalIssueMatrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix });

console.log('Matrix summary:', legalIssueMatrix.summary);
for (const iss of legalIssueMatrix.issues) {
  const elig = resolveEffectiveIssueGenerationEligibility({
    issue: iss,
    formal: false,
    taskType: 'ISSUE',
  });
  console.log(`Issue ${iss.id}: status=${iss.status}, blocking=${iss.blocking}, eligible=${elig.eligible}, reason=${elig.reason}`);
}
