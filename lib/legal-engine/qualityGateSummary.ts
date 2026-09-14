import type { ValidationIssue } from './types';
import type { QualityGateResult } from './qualityGate';

export interface QualityGateSummaryGroup {
  key: string;
  label: string;
  count: number;
  criticalCount: number;
  warningCount: number;
  uniqueDetails: string[];
}

export interface QualityGateSummary {
  totalIssueCount: number;
  groups: QualityGateSummaryGroup[];
}

type QualityGateSummaryInput = Pick<QualityGateResult, 'criticalErrors' | 'warnings' | 'suggestions'>;

const GROUP_LABELS: Record<string, string> = {
  comparecencia: 'Comparecencia',
  objeto: 'Objeto',
  hechos: 'Hechos',
  pruebas: 'Pruebas',
  petitorios: 'Petitorios',
  firma: 'Firma',
  general: 'Revisión general',
};

function normalized(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function groupKey(issue: ValidationIssue): string {
  const context = normalized(`${issue.sectionId || ''} ${issue.message}`);
  if (/comparec|personalidad|proemio/.test(context)) return 'comparecencia';
  if (/objeto/.test(context)) return 'objeto';
  if (/hecho|fact/.test(context)) return 'hechos';
  if (/prueba|evidencia/.test(context)) return 'pruebas';
  if (/petitorio|peticion|peticiones/.test(context)) return 'petitorios';
  if (/firma/.test(context)) return 'firma';
  return 'general';
}

export function buildQualityGateSummary(input: QualityGateSummaryInput): QualityGateSummary {
  const grouped = new Map<string, QualityGateSummaryGroup>();
  const add = (issue: ValidationIssue, severity: 'critical' | 'warning') => {
    const key = groupKey(issue);
    const current = grouped.get(key) || {
      key,
      label: GROUP_LABELS[key],
      count: 0,
      criticalCount: 0,
      warningCount: 0,
      uniqueDetails: [],
    };
    current.count += 1;
    if (severity === 'critical') current.criticalCount += 1;
    else current.warningCount += 1;
    if (!current.uniqueDetails.includes(issue.message)) current.uniqueDetails.push(issue.message);
    grouped.set(key, current);
  };

  input.criticalErrors.forEach((issue) => add(issue, 'critical'));
  input.warnings.forEach((issue) => add(issue, 'warning'));
  const uniqueSuggestions = Array.from(new Set(input.suggestions.filter(Boolean)));
  if (uniqueSuggestions.length > 0) {
    const general = grouped.get('general') || {
      key: 'general',
      label: GROUP_LABELS.general,
      count: 0,
      criticalCount: 0,
      warningCount: 0,
      uniqueDetails: [],
    };
    general.count += uniqueSuggestions.length;
    general.warningCount += uniqueSuggestions.length;
    general.uniqueDetails.push(...uniqueSuggestions.filter((suggestion) => !general.uniqueDetails.includes(suggestion)));
    grouped.set('general', general);
  }

  const groups = Array.from(grouped.values()).sort((a, b) => {
    if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
    return b.count - a.count;
  });
  return {
    totalIssueCount: input.criticalErrors.length + input.warnings.length + uniqueSuggestions.length,
    groups,
  };
}
