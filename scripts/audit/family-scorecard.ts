/** Offline evidence only. This module cannot grant readiness or alter legal gates. */
export interface FamilyVerificationDefinition {
  familyId: string;
  kind: 'appeal' | 'response' | 'initial' | 'incident' | 'promotion' | 'other';
  requiredSections: readonly string[];
  forbiddenTerms: readonly string[];
  requestedRelief?: string;
}

interface AuditedDocument {
  documentType: string;
  sections: Array<{ title: string; content: Array<{ text: string }> }>;
  reasoningLinks?: Array<{ resolutionId: string; sourceQuote: string; page: number; grievance: string }>;
}

export function scoreFamilyDocument(definition: FamilyVerificationDefinition, document: AuditedDocument) {
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const findings: string[] = [];
  const paragraphs = document.sections.flatMap(section => section.content.flatMap(block => block.text.split(/\n\s*\n/))).filter(text => text.trim());
  const fullText = normalize(document.sections.map(section => `${section.title}\n${section.content.map(block => block.text).join('\n')}`).join('\n'));
  const pending = /\[(?:dato pendiente|pendiente|no verificado|requiere confirmacion|a confirmar|a verificar)|dato no localizado en los documentos|dato pendiente de verificacion/i;
  for (const title of definition.requiredSections) {
    const section = document.sections.find(candidate => normalize(candidate.title) === normalize(title));
    const body = section?.content.map(block => block.text).join('\n') || '';
    if (!body.trim()) findings.push(`REQUIRED_SECTION_EMPTY:${title}`);
    else if (pending.test(normalize(body))) findings.push(`REQUIRED_SECTION_PENDING:${title}`);
  }
  if (definition.forbiddenTerms.some(term => fullText.includes(normalize(term)))) findings.push('CROSS_MATTER_CONTAMINATION');
  const meaningful = paragraphs.map(normalize).filter(text => text.split(' ').length >= 6);
  if (new Set(meaningful).size !== meaningful.length) findings.push('EXACT_DUPLICATE_PARAGRAPH');
  if (definition.kind === 'appeal' && !document.reasoningLinks?.some(link =>
    link.resolutionId && link.page > 0 && link.sourceQuote && link.grievance)) findings.push('APPEAL_REASONING_LINK_MISSING');
  const petitions = normalize(document.sections.filter(section => /petitorio|solicitud|peticion/i.test(normalize(section.title)))
    .flatMap(section => section.content.map(block => block.text)).join('\n'));
  const affirmativeRequest = normalize(definition.requestedRelief || '').replace(/\b(?:sin|no)\b[^.;\n]*/g, '');
  if (definition.kind === 'promotion' && /medio de defensa|resolucion favorable|sentencia favorable|revocacion|absolucion/.test(petitions)
    && !/medio de defensa|resolucion favorable|sentencia favorable|revocacion|absolucion/.test(affirmativeRequest)) findings.push('UNREQUESTED_DEFENSIVE_PETITION');
  const words = paragraphs.join(' ').trim().split(/\s+/).filter(Boolean).length;
  if (!words) findings.push('EMPTY_DOCUMENT');
  return { substantivePass: findings.length === 0, findings: [...new Set(findings)], words };
}
