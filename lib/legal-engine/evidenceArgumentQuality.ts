import type { UniversalLegalDocument, ValidationIssue } from './types';
import { isCivilMercantileEvidenceArgumentDocumentType } from './evidenceArgumentContext';
import { getCanonicalSectionId } from './exportGuards';

function normalized(value: string): string {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function sectionIds(document: UniversalLegalDocument): Set<string> {
  return new Set((document.sections || []).flatMap((section) => [
    getCanonicalSectionId(section.id),
    getCanonicalSectionId(section.title),
  ]));
}

/** Quality gates específicos de evidencia y argumentos 2D. */
export function evaluateCivilMercantileEvidenceArgumentQuality(document: UniversalLegalDocument): ValidationIssue[] {
  if (!isCivilMercantileEvidenceArgumentDocumentType(document.documentType)) return [];

  const issues: ValidationIssue[] = [];
  const context = document.caseContext?.civilMercantileEvidenceArgument;
  if (!context || context.documentType !== document.documentType) {
    issues.push({ checkId: 'EVIDENCE_ARGUMENT_CONTEXT_MISSING', message: 'La salida probatoria carece de contexto tipado de evidencia y argumentos.' });
    return issues;
  }

  const requiredSections = document.documentType.includes('alegatos')
    ? ['proemio', 'comparecencia', 'antecedentes_y_hechos_probados', 'valoracion_de_pruebas', 'argumentos', 'petitorios', 'firma']
    : document.documentType.includes('objecion')
      ? ['proemio', 'comparecencia', 'objeto_de_la_objecion', 'pruebas_objetadas', 'motivos_de_objecion', 'petitorios', 'firma']
      : document.documentType.includes('desahogo_vista')
        ? ['proemio', 'comparecencia', 'objeto_de_la_vista', 'manifestaciones_sobre_pruebas', 'hechos_relacionados', 'petitorios', 'firma']
        : ['proemio', 'comparecencia', 'objeto_del_ofrecimiento', 'pruebas_ofrecidas', 'hechos_que_se_pretenden_acreditar', 'petitorios', 'firma'];
  const present = sectionIds(document);
  for (const required of requiredSections) {
    if (!present.has(required)) issues.push({ checkId: 'EVIDENCE_ARGUMENT_REQUIRED_SECTION', sectionId: required, message: `Falta la sección probatoria requerida: ${required}.` });
  }

  if (context.evidence.length === 0) {
    issues.push({ checkId: 'EVIDENCE_MISSING', sectionId: 'pruebas', message: 'No hay pruebas identificadas para esta actuación.' });
  }
  const knownFactIds = new Set((document.caseAnalysis?.facts || []).map((fact) => fact.id).filter(Boolean));
  for (const item of context.evidence) {
    if (item.status !== 'CONFIRMED') {
      issues.push({ checkId: 'EVIDENCE_CONFIRMATION_REQUIRED', sectionId: 'pruebas', message: `La prueba ${item.id} no está confirmada por el abogado.` });
    }
    if (item.relatedFacts.length === 0 || item.relatedFacts.some((factId) => !knownFactIds.has(factId))) {
      issues.push({ checkId: 'EVIDENCE_FACT_LINK_REQUIRED', sectionId: 'hechos', message: `La prueba ${item.id} no está vinculada a un hecho identificado.` });
    }
  }

  if (document.documentType.includes('alegatos')) {
    if (context.arguments.length === 0) {
      issues.push({ checkId: 'ARGUMENT_MISSING', sectionId: 'argumentos', message: 'No hay argumentos estructurados para los alegatos.' });
    }
    for (const item of context.arguments) {
      if (item.status !== 'CONFIRMED' || item.sources.length === 0) {
        issues.push({ checkId: 'ARGUMENT_SOURCE_REQUIRED', sectionId: 'argumentos', message: `El argumento ${item.id} carece de respaldo verificable.` });
      }
      if (item.relatedFacts.length === 0 || item.relatedFacts.some((factId) => !knownFactIds.has(factId))) {
        issues.push({ checkId: 'ARGUMENT_FACT_LINK_REQUIRED', sectionId: 'argumentos', message: `El argumento ${item.id} no está vinculado a hechos identificados.` });
      }
    }
  }

  const allText = normalized(document.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n'));
  if (/amparo|autoridad responsable|acto reclamado|laboral|trabajador|patron/.test(allText)) {
    issues.push({ checkId: 'EVIDENCE_ARGUMENT_CROSS_FAMILY_CONTENT', message: `La salida ${document.documentType} contiene lenguaje de una familia incompatible.` });
  }
  return issues;
}
