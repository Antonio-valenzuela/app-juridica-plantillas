import type { UniversalLegalDocument } from './types';

export interface ReviewRequestItem {
  id: string;
  rootDecisionKey: string;
  type: 'PERSONALITY' | 'CLIENT_POSITION' | 'REQUESTED_EFFECT' | 'FILING_METADATA';
  question: string;
  whyRequired: string;
  affectedSections: string[];
  neutralContext?: string;
  sourcePage?: number;
  sourceExcerpt?: string;
  allowedAnswers?: string[];
  sourceRefs?: Array<{ documentId: string; page?: number }>;
}

export interface ReviewRequest {
  documentId: string;
  pendingItems: ReviewRequestItem[];
  pendingBefore: number;
  uniqueHumanDecisions: number;
  duplicatesRemoved: number;
  automaticallyResolved: number;
  createdAt: string;
}

type MatrixDocument = UniversalLegalDocument & {
  legalIssueMatrix?: { issues?: Array<Record<string, unknown>> };
  coverageMatrix?: { items?: Array<Record<string, unknown>> };
  caseAnalysis?: Record<string, any>;
  sourceDocuments?: Array<{ id?: string }>;
};

function sectionIds(document: UniversalLegalDocument, sectionId?: string): string[] {
  if (sectionId) return [sectionId];
  return document.sections.filter((section) => /personalidad|petitorio|efecto|lugar|fecha|agravio/i.test(section.title)).map((section) => section.id);
}

function compactExcerpt(value: unknown, maxLength = 320): string | undefined {
  if (typeof value !== 'string') return undefined;
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return undefined;
  const attributionStart = compact.search(/La parte\s+(?:demandada|actora)\s+sostiene/i);
  const selected = attributionStart >= 0 ? compact.slice(attributionStart) : compact;
  const legalBoundary = selected.search(/\b(?:El Código Civil|El argumento es)\b/i);
  return (legalBoundary > 0 ? selected.slice(0, legalBoundary) : selected).slice(0, maxLength).trim();
}

function sourceDocumentId(document: MatrixDocument, sourceId?: unknown): string | undefined {
  if (typeof sourceId === 'string' && sourceId.trim()) return sourceId;
  const first = document.sourceDocuments?.[0]?.id;
  return typeof first === 'string' && first.trim() ? first : undefined;
}

function firstProvenance(document: MatrixDocument, fact: any): { page?: number; sourceId?: string; excerpt?: string } {
  const provenance = Array.isArray(fact?.provenance) ? fact.provenance : [];
  const first = provenance.find((entry: any) => entry && (entry.page !== undefined || entry.excerpt || entry.sourceId));
  return {
    page: typeof first?.page === 'number' ? first.page : undefined,
    sourceId: sourceDocumentId(document, first?.sourceId),
    excerpt: compactExcerpt(first?.excerpt),
  };
}

function matrixSectionIds(document: MatrixDocument, kind: 'fact' | 'general', value?: string): string[] | undefined {
  const issues = document.legalIssueMatrix?.issues;
  const coverageItems = document.coverageMatrix?.items;
  const hasValidMatrices = Array.isArray(issues) && Array.isArray(coverageItems);
  if (!hasValidMatrices) return undefined;

  const relatedIssues = issues.filter((issue) => {
    const factIds = Array.isArray(issue.factIds) ? issue.factIds : [];
    const missingDataIds = Array.isArray(issue.missingDataIds) ? issue.missingDataIds : [];
    if (kind === 'fact') return typeof value === 'string' && factIds.includes(value);
    if (kind === 'general' && factIds.length > 0) return false;
    return issue.clientPositionStatus === 'UNKNOWN'
      || missingDataIds.some((id) => typeof id === 'string' && /clientposition/i.test(id));
  });

  const relatedCoverageIds = new Set<string>();
  const relatedMissingDataIds = new Set<string>();
  const relatedFactIds = new Set<string>();
  for (const issue of relatedIssues) {
    for (const id of Array.isArray(issue.coverageItemIds) ? issue.coverageItemIds : []) {
      if (typeof id === 'string') relatedCoverageIds.add(id);
    }
    for (const id of Array.isArray(issue.missingDataIds) ? issue.missingDataIds : []) {
      if (typeof id === 'string') relatedMissingDataIds.add(id);
    }
    for (const id of Array.isArray(issue.factIds) ? issue.factIds : []) {
      if (typeof id === 'string') relatedFactIds.add(id);
    }
  }

  const relatedCoverage = coverageItems.filter((item) => {
    const id = typeof item.id === 'string' ? item.id : undefined;
    const factIds = Array.isArray(item.factIds) ? item.factIds : [];
    const missingDataIds = Array.isArray(item.missingDataIds) ? item.missingDataIds : [];
    return (id && relatedCoverageIds.has(id))
      || (kind === 'fact' && factIds.some((factId) => relatedFactIds.has(factId)))
      || (kind === 'general' && missingDataIds.some((missingId) => relatedMissingDataIds.has(missingId)));
  });

  const targetIds = new Set<string>();
  for (const item of relatedCoverage) {
    for (const target of Array.isArray(item.targetSectionIds) ? item.targetSectionIds : []) {
      if (typeof target === 'string') targetIds.add(target);
    }
  }
  const coverageIds = new Set(relatedCoverage.map((item) => item.id).filter((id): id is string => typeof id === 'string'));
  for (const section of document.sections) {
    const sectionCoverage = Array.isArray((section as any).coverageItemIds) ? (section as any).coverageItemIds : [];
    if (sectionCoverage.some((id: unknown) => typeof id === 'string' && coverageIds.has(id))) targetIds.add(section.id);
  }

  return document.sections.filter((section) => targetIds.has(section.id)).map((section) => section.id);
}

function affectedSectionIds(document: MatrixDocument, kind: 'fact' | 'general', value: string | undefined, fallbackSectionId?: string): string[] {
  return matrixSectionIds(document, kind, value) ?? sectionIds(document, fallbackSectionId);
}

function sourceRefs(document: MatrixDocument, sourceId?: string, page?: number): Array<{ documentId: string; page?: number }> | undefined {
  if (!sourceId) return undefined;
  return [{ documentId: sourceId, ...(page === undefined ? {} : { page }) }];
}

function factItem(document: MatrixDocument, factId: string, errorSectionId?: string): ReviewRequestItem {
  const richFacts = document.caseAnalysis?.richCaseAnalysis?.facts;
  const fact = Array.isArray(richFacts) ? richFacts.find((candidate: any) => candidate?.id === factId) : undefined;
  const provenance = firstProvenance(document, fact);
  const sourceExcerpt = provenance.excerpt;
  const neutralContext = sourceExcerpt || (typeof fact?.proposition === 'string' ? fact.proposition.trim() : undefined);
  return {
    id: `position-${factId}`,
    rootDecisionKey: `CLIENT_POSITION:FACT:${factId}`,
    type: 'CLIENT_POSITION',
    question: 'Respecto del siguiente hecho, ¿qué postura debe asumir el recurso?',
    neutralContext,
    whyRequired: 'La instrucción no autoriza negar o admitir el hecho sin una decisión expresa.',
    affectedSections: affectedSectionIds(document, 'fact', factId, errorSectionId),
    sourcePage: provenance.page,
    sourceExcerpt,
    allowedAnswers: ['ADMITIR', 'NEGAR', 'NO_CONTROVERTIR', 'PRECISAR'],
    sourceRefs: sourceRefs(document, provenance.sourceId, provenance.page),
  };
}

function generalClientPositionItem(document: MatrixDocument, errorSectionId?: string): ReviewRequestItem {
  const challengedAct = document.caseAnalysis?.challengedActs?.[0];
  const actDescription = typeof challengedAct?.actDescription === 'string' && challengedAct.actDescription.trim()
    ? challengedAct.actDescription.trim().toLowerCase()
    : 'resolución';
  const persistedWrit = typeof document.caseAnalysis?.proceduralPosture?.proceduralWrit === 'string'
    ? document.caseAnalysis.proceduralPosture.proceduralWrit.trim()
    : '';
  const objective = typeof (document as any).proceduralIdentity?.objective === 'string'
    ? (document as any).proceduralIdentity.objective
    : '';
  const writ = /recurso\s+de\s+apelación/i.test(objective) || document.documentType === 'apelacion_civil'
    ? 'recurso de apelación civil'
    : persistedWrit || 'recurso';
  const sourceId = sourceDocumentId(document, (challengedAct as any)?.sourceId);
  const sourcePage = typeof challengedAct?.page === 'number' ? challengedAct.page : undefined;
  const sourceExcerpt = compactExcerpt(challengedAct?.excerpt);
  const target = actDescription.includes('sentencia') ? 'la sentencia impugnada' : 'la resolución impugnada';
  return {
    id: 'client-position',
    rootDecisionKey: 'CLIENT_POSITION:GENERAL:SOURCE_DECISION',
    type: 'CLIENT_POSITION',
    question: `¿Qué postura general debe sostener el recurso frente a ${target}?`,
    neutralContext: `El expediente se analiza como un ${writ} contra una ${actDescription}; la postura general de la parte representada frente a ese acto no está confirmada.`,
    whyRequired: 'La fuente no contiene una postura expresa de la parte representada frente a la resolución impugnada.',
    affectedSections: affectedSectionIds(document, 'general', undefined, errorSectionId),
    sourcePage,
    sourceExcerpt,
    allowedAnswers: ['Impugnar la sentencia', 'No controvertir la sentencia', 'Precisar la postura'],
    sourceRefs: sourceRefs(document, sourceId, sourcePage),
  };
}

export function deduplicateReviewItems(items: ReviewRequestItem[]): { items: ReviewRequestItem[]; duplicatesRemoved: number } {
  const seen = new Set<string>();
  const unique: ReviewRequestItem[] = [];
  for (const item of items) {
    if (seen.has(item.rootDecisionKey)) continue;
    seen.add(item.rootDecisionKey);
    unique.push(item);
  }
  return { items: unique, duplicatesRemoved: items.length - unique.length };
}

export function buildReviewRequest(document: UniversalLegalDocument): ReviewRequest {
  const typedDocument = document as MatrixDocument;
  const errors = [...(document.validation?.errors || []), ...(document.validation?.warnings || [])];
  const items: ReviewRequestItem[] = [];
  const add = (item: ReviewRequestItem) => { if (!items.some((current) => current.id === item.id)) items.push(item); };

  for (const error of errors) {
    const text = `${error.checkId} ${error.message}`;
    if (/personalidad/i.test(text)) {
      add({ id: 'personality', rootDecisionKey: 'PERSONALITY:REPRESENTATION', type: 'PERSONALITY', question: '¿Quién comparece y con qué personalidad firma este recurso?', whyRequired: 'El expediente no contiene evidencia inequívoca de la representación.', affectedSections: sectionIds(document, error.sectionId), allowedAnswers: ['Parte directamente interesada', 'Abogado autorizado', 'Apoderado con facultades', 'Otro'] });
    } else if (/clientPosition|postura|fact-\d+/i.test(text)) {
      const factId = text.match(/fact-\d+/i)?.[0];
      add(factId ? factItem(typedDocument, factId, error.sectionId) : generalClientPositionItem(typedDocument, error.sectionId));
    } else if (/petitorio|requestedEffect|efecto/i.test(text)) {
      add({ id: 'requested-effect', rootDecisionKey: 'REQUESTED_EFFECT:PROCEDURAL_EFFECT', type: 'REQUESTED_EFFECT', question: '¿Qué efecto procesal debe solicitarse frente a la resolución impugnada?', whyRequired: 'No es posible elegir entre revocar, modificar, reponer u otro efecto sin decisión jurídica humana.', affectedSections: sectionIds(document, error.sectionId), allowedAnswers: ['Revocar', 'Modificar', 'Reponer', 'Nuevo pronunciamiento', 'Otro'] });
    } else if (/lugar|fecha/i.test(text)) {
      add({ id: 'filing-metadata', rootDecisionKey: 'FILING_METADATA:PLACE_AND_DATE', type: 'FILING_METADATA', question: '¿Qué lugar y fecha de presentación deben aparecer en el escrito?', whyRequired: 'La fuente sólo contiene fechas históricas y no acredita los datos de presentación.', affectedSections: sectionIds(document, error.sectionId) });
    }
  }

  const pendingBefore = items.length;
  const deduplicated = deduplicateReviewItems(items);
  return {
    documentId: document.id,
    pendingItems: deduplicated.items,
    pendingBefore,
    uniqueHumanDecisions: deduplicated.items.length,
    duplicatesRemoved: deduplicated.duplicatesRemoved,
    automaticallyResolved: 0,
    createdAt: new Date().toISOString(),
  };
}
