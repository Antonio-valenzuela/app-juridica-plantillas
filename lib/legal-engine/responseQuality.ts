import type { UniversalLegalDocument, ValidationIssue } from './types';
import { CIVIL_MERCANTILE_RESPONSE_DOCUMENT_TYPES } from './responseContext';
import { getCanonicalSectionId } from './exportGuards';
import { getDocumentStrategy } from './documentStrategies';

const RESPONSE_TYPES = new Set<string>(CIVIL_MERCANTILE_RESPONSE_DOCUMENT_TYPES);

function normalized(value: string): string {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function presentSectionIds(document: UniversalLegalDocument): Set<string> {
  return new Set((document.sections || []).flatMap((section) => [
    getCanonicalSectionId(section.id),
    getCanonicalSectionId(section.title),
  ]));
}

/** Quality gates específicos de la subfamilia de respuestas Civil/Mercantil. */
export function evaluateCivilMercantileResponseQuality(document: UniversalLegalDocument): ValidationIssue[] {
  if (!RESPONSE_TYPES.has(document.documentType)) return [];

  const issues: ValidationIssue[] = [];
  const response = document.caseContext?.civilMercantileResponse;
  const requiredSections = getDocumentStrategy(document.documentType)?.requiredSectionIds ?? [];
  const present = presentSectionIds(document);
  for (const required of requiredSections) {
    if (!present.has(required)) {
      issues.push({
        checkId: 'RESPONSE_REQUIRED_SECTION',
        sectionId: required,
        message: `Falta la sección requerida para ${document.documentType}: "${required}".`,
      });
    }
  }

  if (!response || response.documentType !== document.documentType) {
    issues.push({
      checkId: 'RESPONSE_CONTEXT_MISSING',
      message: 'La salida de contestación/reconvención carece del contexto tipado de su subfamilia.',
    });
    return issues;
  }
  if (Array.isArray(response.facts) && response.facts.some((fact) => fact.posture === 'REQUIERE_POSTURA_ABOGADO')) {
    issues.push({
      checkId: 'RESPONSE_FACT_POSTURE_PENDING',
      sectionId: 'hechos',
      message: 'Hay hechos sin postura expresa del abogado; no pueden presentarse como admitidos o negados.',
    });
  }
  if (Array.isArray(response.claims) && response.claims.some((claim) => claim.posture === 'REQUIERE_POSTURA_ABOGADO')) {
    issues.push({
      checkId: 'RESPONSE_CLAIM_POSTURE_PENDING',
      sectionId: 'prestaciones',
      message: 'Hay prestaciones sin postura expresa del abogado; no pueden presentarse como aceptadas u opuestas.',
    });
  }
  if (Array.isArray(response.defenses) && response.defenses.some((defense) => defense.requiresLawyerConfirmation && !defense.source)) {
    issues.push({
      checkId: 'RESPONSE_DEFENSE_CONFIRMATION',
      sectionId: 'excepciones_defensas',
      message: 'Una excepción o defensa requiere confirmación del abogado y referencia de respaldo.',
    });
  }

  const allText = normalized(document.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n'));
  const cleanedText = allText.replace(/\b(?:abogado\s+)?patrono\b/g, '');
  const foreignFamily = /\b(?:amparo|autoridad\s+responsable|acto\s+reclamado|laboral|trabajador|patron|patronal)\b/.test(cleanedText);
  if (foreignFamily) {
    issues.push({
      checkId: 'RESPONSE_CROSS_FAMILY_CONTENT',
      message: `La salida ${document.documentType} contiene lenguaje de una familia documental incompatible.`,
    });
  }
  return issues;
}
