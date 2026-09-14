import type { UniversalLegalDocument, ValidationIssue } from './types';
import { CIVIL_DEMAND_REQUIRED_SECTION_IDS } from './documentStrategies';

const TARGET_ID = 'demanda_ordinaria_civil';

function normalize(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function civilSectionId(value: string): string | undefined {
  const normalized = normalize(value);
  return CIVIL_DEMAND_REQUIRED_SECTION_IDS.find((id) =>
    normalized === id || normalized.endsWith(`_${id}`),
  );
}

function sectionText(document: UniversalLegalDocument, id: string): string {
  return document.sections
    .filter((section) => civilSectionId(section.id) === id || civilSectionId(section.title) === id)
    .flatMap((section) => section.content.map((block) => block.text))
    .join('\n')
    .trim();
}

/** Gates propios de la salida civil ordinaria; los universales siguen en qualityGate. */
export function evaluateCivilDemandQuality(document: UniversalLegalDocument): ValidationIssue[] {
  if (document.documentType !== TARGET_ID) return [];

  const issues: ValidationIssue[] = [];
  const counts = new Map<string, number>();
  for (const section of document.sections) {
    const id = civilSectionId(section.id) || civilSectionId(section.title);
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }

  for (const requiredId of CIVIL_DEMAND_REQUIRED_SECTION_IDS) {
    if (!counts.has(requiredId)) {
      issues.push({
        checkId: 'CIVIL_REQUIRED_SECTION',
        sectionId: requiredId,
        message: `Falta la sección civil ordinaria requerida "${requiredId}".`,
      });
    }
  }

  for (const [sectionId, count] of counts) {
    if (count > 1) {
      issues.push({
        checkId: 'CIVIL_DUPLICATE_SECTION',
        sectionId,
        message: `La sección civil ordinaria "${sectionId}" aparece ${count} veces.`,
      });
    }
  }

  const allText = document.sections
    .flatMap((section) => section.content.map((block) => block.text))
    .join('\n');
  if (/conceptos?\s+de\s+violaci[oó]n|acto\s+reclamado|autoridad\s+responsable|suspensi[oó]n\s+del\s+acto/i.test(allText)) {
    issues.push({
      checkId: 'CIVIL_CROSS_FAMILY_CONTENT',
      message: 'La demanda civil contiene lenguaje estructural propio de otra familia documental.',
    });
  }

  const legalBasis = sectionText(document, 'derecho');
  if (!legalBasis || /REQUIERE FUNDAMENTACI[ÓO]N JUR[ÍI]DICA DEL ABOGADO/i.test(legalBasis)) {
    issues.push({
      checkId: 'CIVIL_LEGAL_BASIS_PENDING',
      sectionId: 'derecho',
      message: 'La fundamentación jurídica de la demanda civil requiere revisión y confirmación del abogado.',
    });
  }

  return issues;
}

