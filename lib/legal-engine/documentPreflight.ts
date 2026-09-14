import type { CaseAnalysis } from './caseAnalysis';
import { DocumentTemplates, type DocumentTemplate } from './documentTemplates';
import type { CaseContext } from './caseContext';
import type {
  CaseReferences,
  DocumentParties,
  UniversalLegalDocument,
  UploadedSourceDocument,
} from './types';
import {
  DOCUMENT_TYPE_NOT_IMPLEMENTED,
  EXTRACTION_INCOMPLETE,
  MISSING_SOURCE_COMPATIBILITY_RULE,
  SOURCE_DOCUMENT_INCOMPATIBLE,
  SOURCE_TYPE_UNKNOWN,
  evaluateSourceOutputCompatibility,
  CIVIL_DEMAND_SOURCE_COMPATIBILITY_RULES,
} from './sourceOutputCompatibility';
import { evaluateCommercialEnforcementPreflight } from './commercialEnforcement';
import { isCivilMercantileResponseDocumentType } from './responseContext';
import { isCivilMercantileEvidenceArgumentDocumentType } from './evidenceArgumentContext';

export type DocumentPreflightStatus =
  | 'READY'
  | 'NEEDS_INPUT'
  | 'NOT_APPLICABLE'
  | 'SOURCE_DOCUMENT_INCOMPATIBLE'
  | 'DOCUMENT_TYPE_NOT_IMPLEMENTED'
  | 'MISSING_SOURCE_COMPATIBILITY_RULE'
  | 'EXTRACTION_INCOMPLETE';

export interface DocumentPreflightMissingField {
  id: string;
  label: string;
  reason: string;
  status: 'MISSING' | 'ANONYMIZED' | 'REQUIRES_CONFIRMATION';
}

export interface DocumentPreflightResult {
  status: DocumentPreflightStatus;
  code?:
    | 'PROCEDURAL_VIABILITY_FAILED'
    | typeof SOURCE_DOCUMENT_INCOMPATIBLE
    | typeof DOCUMENT_TYPE_NOT_IMPLEMENTED
    | typeof MISSING_SOURCE_COMPATIBILITY_RULE
    | typeof EXTRACTION_INCOMPLETE
    | typeof SOURCE_TYPE_UNKNOWN;
  missingFields: DocumentPreflightMissingField[];
  warnings: string[];
}

export const CONTESTACION_REVISION_AMPARO_DIRECTO_ID =
  'contestacion_revision_extraordinaria_amparo_directo';

function normalizeSourceText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function hasSentenceAmparoDirectoSource(doc: UniversalLegalDocument): boolean {
  return (doc.sourceDocuments || []).some((source) => {
    const text = source.pages?.map((page) => page.text).join('\n') || source.extractedText || source.content || '';
    // En PDFs judiciales el encabezado y la mención de la sentencia pueden
    // estar en páginas distintas; ambos deben pertenecer al mismo documento.
    return /(?:sentencia|ejecutoria)/i.test(text) && /amparo\s+directo/i.test(text);
  });
}

function findSource(doc: UniversalLegalDocument, identifier: string) {
  return (doc.sourceDocuments || []).find((source) =>
    source.id === identifier || source.filename === identifier || source.name === identifier,
  );
}

function sourceReferenceIsValid(
  doc: UniversalLegalDocument,
  reference: { documentId?: string; page?: number; excerpt?: string },
): boolean {
  if (!reference.documentId) return false;
  const source = findSource(doc, reference.documentId);
  if (!source) return false;
  const pages = source.pages || [];
  const candidates = reference.page
    ? pages.filter((page) => page.page === reference.page)
    : pages;
  if (reference.page && candidates.length === 0) return false;
  if (!reference.excerpt?.trim()) return candidates.length > 0 || Boolean(source.extractedText || source.content);
  const excerpt = normalizeSourceText(reference.excerpt);
  return candidates.some((page) => normalizeSourceText(page.text).includes(excerpt))
    || (!reference.page && normalizeSourceText(source.extractedText || source.content || '').includes(excerpt));
}

function hasSourceBackedConstitutionalIssue(doc: UniversalLegalDocument, analysis?: CaseAnalysis): boolean {
  return Boolean(
    analysis?.proceduralPosture?.constitutionalIssues?.some((issue) =>
      sourceReferenceIsValid(doc, { documentId: issue.sourceDoc, page: issue.page, excerpt: issue.excerpt }),
    ),
  );
}

function hasSourceBackedArgument(doc: UniversalLegalDocument, analysis?: CaseAnalysis): boolean {
  return Boolean(
    analysis?.argumentAxes?.some((axis) =>
      axis.sources?.some((source) => sourceReferenceIsValid(doc, source)),
    ),
  );
}

function addMissing(
  fields: DocumentPreflightMissingField[],
  id: string,
  label: string,
  reason: string,
  status: DocumentPreflightMissingField['status'] = 'MISSING',
): void {
  if (!fields.some((field) => field.id === id)) fields.push({ id, label, reason, status });
}

/**
 * Preflight específico de la respuesta frente a una sentencia de amparo
 * directo. El borrador puede construirse con NEEDS_INPUT, pero solo se
 * considera procedimentalmente viable cuando la fuente es una sentencia y la
 * cuestión constitucional/argumentos fueron realmente aportados o citados.
 */
function runRevisionPreflight(
  doc: UniversalLegalDocument,
  template: DocumentTemplate,
  analysis: CaseAnalysis | undefined = doc.caseAnalysis,
): DocumentPreflightResult {
  if (template.tipo !== CONTESTACION_REVISION_AMPARO_DIRECTO_ID) {
    return { status: 'READY', missingFields: [], warnings: [] };
  }

  const missingFields: DocumentPreflightMissingField[] = [];
  const warnings: string[] = [];
  const party = doc.parties.quejoso || doc.parties.actor;
  const partyField = doc.caseContext?.fields.quejoso || doc.caseContext?.fields.promovente;

  if (!party) {
    addMissing(
      missingFields,
      'represented_party',
      'Parte promovente o recurrente',
      partyField?.status === 'ANONYMIZED'
        ? 'La fuente anonimiza el nombre; el abogado debe confirmar la identidad exacta antes de firmar.'
        : 'No aparece una parte promovente o recurrente confirmada en las fuentes.',
      partyField?.status === 'ANONYMIZED' ? 'ANONYMIZED' : 'MISSING',
    );
  }

  if (!doc.caseRefs.expediente && !analysis?.caseNumbers?.principal) {
    addMissing(
      missingFields,
      'case_number',
      'Número de expediente o amparo directo',
      'No se identificó un número de expediente, amparo directo o toca en la fuente.',
    );
  }

  if (!hasSentenceAmparoDirectoSource(doc)) {
    if ((doc.sourceDocuments || []).length > 0) {
      return {
        status: 'NOT_APPLICABLE',
        code: 'PROCEDURAL_VIABILITY_FAILED',
        missingFields: [],
        warnings: ['La estrategia requiere una sentencia o ejecutoria de amparo directo como fuente de referencia.'],
      };
    }
    addMissing(
      missingFields,
      'challenged_resolution',
      'Sentencia de amparo directo impugnada',
      'Carga la sentencia o ejecutoria de amparo directo que será objeto de la respuesta.',
    );
  }

  if (!hasSourceBackedConstitutionalIssue(doc, analysis)) {
    addMissing(
      missingFields,
      'constitutional_question',
      'Cuestión constitucional e interés excepcional',
      'Debe señalarse y respaldarse con la fuente o con una instrucción profesional verificable; no se presume por la sola etiqueta del escrito.',
      'REQUIRES_CONFIRMATION',
    );
  }

  if (!hasSourceBackedArgument(doc, analysis)) {
    addMissing(
      missingFields,
      'arguments',
      'Agravios o argumentos aportados/confirmados',
      'No se identificaron agravios o argumentos con referencia verificable; deben ser aportados o confirmados por el abogado.',
      'REQUIRES_CONFIRMATION',
    );
  }

  if (!doc.parties.autoridadResponsable && !(analysis?.authorities || []).length && !doc.caseRefs.tribunal) {
    addMissing(
      missingFields,
      'competent_authority',
      'Órgano competente o autoridad emisora',
      'La fuente no permite confirmar el órgano competente o la autoridad emisora de la resolución.',
    );
  }

  if (!(analysis?.proceduralTimeline?.length || analysis?.challengedActs?.length)) {
    addMissing(
      missingFields,
      'procedural_background',
      'Antecedentes procesales verificables',
      'No se identificaron antecedentes o actos de la sentencia con referencia suficiente en la fuente.',
    );
  }

  if (!(doc.legalBasis?.length || analysis?.citations?.length)) {
    addMissing(
      missingFields,
      'supported_grounds',
      'Fundamentos jurídicos sustentados',
      'No se aportaron fundamentos o referencias jurídicas verificables; no se agregan artículos por inferencia.',
      'REQUIRES_CONFIRMATION',
    );
  }

  if (missingFields.some((field) => field.status === 'ANONYMIZED')) {
    warnings.push('Hay datos anonimizados que requieren confirmación manual; no deben desanonimizarse por inferencia.');
  }

  return {
    status: missingFields.length > 0 ? 'NEEDS_INPUT' : 'READY',
    missingFields,
    warnings,
  };
}

interface ReusablePreflightSubject {
  documentType: string;
  template: DocumentTemplate;
  sources: UploadedSourceDocument[];
  caseContext: CaseContext;
  analysis: CaseAnalysis;
  parties: DocumentParties;
  caseRefs: CaseReferences;
  legalBasis: string[];
}

interface PreflightSeed {
  missingFields?: DocumentPreflightMissingField[];
  warnings?: string[];
  status?: DocumentPreflightStatus;
  code?: DocumentPreflightResult['code'];
}

function civilMissingStatus(field: import('./caseContext').CaseContextField | undefined): DocumentPreflightMissingField['status'] {
  if (field?.status === 'ANONYMIZED') return 'ANONYMIZED';
  if (field?.resolution === 'REQUIRES_LAWYER_DECISION' || field?.resolution === 'INFERRED') return 'REQUIRES_CONFIRMATION';
  return 'MISSING';
}

function addCivilMissing(
  fields: DocumentPreflightMissingField[],
  id: string,
  label: string,
  field: import('./caseContext').CaseContextField | undefined,
  reason: string,
): void {
  if (field?.status === 'CONFIRMED' && field.resolution === 'CONFIRMED' && field.value?.trim()) return;
  addMissing(fields, id, label, reason, civilMissingStatus(field));
}

/**
 * Preflight estructural de la demanda ordinaria civil. Es independiente del
 * template para permitir validar el contrato de datos antes de habilitarlo en
 * el catálogo productivo.
 */
export function runCivilDemandPreflight(
  caseContext: CaseContext,
  sourceDocuments: UploadedSourceDocument[] = [],
): DocumentPreflightResult {
  const civil = caseContext.civil;
  if (!civil) {
    return {
      status: 'NEEDS_INPUT',
      missingFields: [{
        id: 'case_context.civil',
        label: 'Contexto civil',
        reason: 'Se requiere un CivilDemandContext normalizado para esta salida.',
        status: 'REQUIRES_CONFIRMATION',
      }],
      warnings: [],
    };
  }

  try {
    const compatibility = evaluateSourceOutputCompatibility({
      selectedDocumentType: civil.documentType,
      sourceDocuments,
    }, CIVIL_DEMAND_SOURCE_COMPATIBILITY_RULES);
    if (compatibility.status === 'NEEDS_INPUT') {
      return {
        status: 'NEEDS_INPUT',
        code: compatibility.code,
        missingFields: compatibility.missingRequirements.map((requirement) => ({
          id: requirement,
          label: requirement.startsWith('source_role:')
            ? 'Función de la fuente'
            : 'Tipo de fuente',
          reason: 'La función o clasificación de la fuente debe confirmarse antes de usarla en la demanda.',
          status: 'REQUIRES_CONFIRMATION' as const,
        })),
        warnings: [],
      };
    }
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === SOURCE_DOCUMENT_INCOMPATIBLE) {
      return {
        status: 'SOURCE_DOCUMENT_INCOMPATIBLE',
        code,
        missingFields: [],
        warnings: [String((error as Error).message || error)],
      };
    }
    throw error;
  }

  const missingFields: DocumentPreflightMissingField[] = [];
  const warnings: string[] = [];
  addCivilMissing(
    missingFields,
    'actor',
    'Actor',
    civil.parties.actor,
    'El actor debe estar confirmado por fuente o por el abogado.',
  );
  addCivilMissing(
    missingFields,
    'demandado',
    'Demandado',
    civil.parties.demandado,
    'El demandado debe estar confirmado por fuente o por el abogado.',
  );
  if (!civil.facts.some((fact) => fact.status === 'CONFIRMED' && fact.text.trim())) {
    addMissing(missingFields, 'facts', 'Hechos', 'Debe existir al menos un hecho explícito y respaldado.', 'MISSING');
  }
  if (!civil.claims.some((claim) => claim.status === 'CONFIRMED' && claim.description.trim())) {
    addMissing(missingFields, 'claims', 'Prestaciones', 'Debe existir al menos una prestación explícita y respaldada.', 'MISSING');
  }
  addCivilMissing(missingFields, 'court', 'Órgano jurisdiccional', civil.procedural.court, 'El órgano jurisdiccional requiere confirmación profesional.');
  addCivilMissing(missingFields, 'jurisdiction', 'Competencia', civil.procedural.jurisdiction, 'La competencia requiere confirmación profesional.');
  addCivilMissing(missingFields, 'procedure', 'Vía o procedimiento', civil.procedural.procedure, 'La vía o procedimiento requiere confirmación profesional.');
  addCivilMissing(missingFields, 'action', 'Acción', civil.procedural.action, 'La acción no puede elegirse por inferencia.');
  addCivilMissing(missingFields, 'personality', 'Personalidad', civil.personality, 'La personalidad requiere confirmación profesional.');
  if (!civil.requests.some((request) => request.status === 'CONFIRMED' && request.description.trim())) {
    addMissing(missingFields, 'requests', 'Puntos petitorios', 'Las peticiones deben ser aportadas y confirmadas por el abogado.', 'REQUIRES_CONFIRMATION');
  }
  addCivilMissing(missingFields, 'signature', 'Firma', civil.signature, 'La firma requiere confirmación profesional.');
  if (civil.legalBasis.length === 0) {
    addMissing(missingFields, 'legalBasis', 'Fundamentación jurídica', 'No se agregan artículos o jurisprudencia por inferencia.', 'REQUIRES_CONFIRMATION');
  }
  if (missingFields.some((field) => field.status === 'ANONYMIZED')) {
    warnings.push('Hay datos anonimizados que requieren confirmación manual; no deben desanonimizarse por inferencia.');
  }
  return {
    status: missingFields.length > 0 ? 'NEEDS_INPUT' : 'READY',
    missingFields,
    warnings,
  };
}

function runCivilMercantileResponsePreflight(
  documentType: string,
  template: DocumentTemplate,
  sources: UploadedSourceDocument[],
  caseContext: CaseContext,
  analysis: CaseAnalysis,
): DocumentPreflightResult {
  const missingFields: DocumentPreflightMissingField[] = [];
  const warnings: string[] = [];
  let compatibility;
  try {
    compatibility = evaluateSourceOutputCompatibility({
      selectedDocumentType: documentType,
      sourceDocuments: sources,
      sourceAnalysis: {
        numberedFacts: analysis.facts,
        sourceClaims: analysis.claimResponses?.length ? analysis.claimResponses : analysis.claims,
      },
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === SOURCE_DOCUMENT_INCOMPATIBLE) {
      return { status: 'SOURCE_DOCUMENT_INCOMPATIBLE', code, missingFields: [], warnings: [String((error as Error).message || error)] };
    }
    throw error;
  }

  if (compatibility.status === 'NEEDS_INPUT') {
    for (const requirement of compatibility.missingRequirements) {
      addMissing(
        missingFields,
        requirement,
        requirement.startsWith('source_role:') ? 'Función de la fuente' : 'Extracción de hechos y prestaciones',
        'La fuente requiere clasificación, función o extracción confirmada antes de cerrar el escrito.',
        'REQUIRES_CONFIRMATION',
      );
    }
  }

  const responseContext = caseContext.civilMercantileResponse;
  if (!responseContext || responseContext.documentType !== documentType) {
    addMissing(
      missingFields,
      'case_context.civilMercantileResponse',
      'Contexto de contestación o reconvención',
      'Se requiere el contexto tipado de la subfamilia seleccionada.',
      'REQUIRES_CONFIRMATION',
    );
  } else {
    if (responseContext.facts.length === 0) {
      addMissing(missingFields, 'facts', 'Hechos controvertidos', 'No se identificaron hechos suficientes para fijar posturas.', 'MISSING');
    }
    if (responseContext.claims.length === 0 && !documentType.includes('excepciones')) {
      addMissing(missingFields, 'claims', 'Prestaciones o pretensiones', 'No se identificaron prestaciones o pretensiones confirmadas.', 'MISSING');
    }
    if (responseContext.facts.some((fact) => fact.posture === 'REQUIERE_POSTURA_ABOGADO')) {
      addMissing(missingFields, 'fact_postures', 'Posturas sobre hechos', 'Cada hecho requiere una postura expresa del abogado.', 'REQUIRES_CONFIRMATION');
    }
    if (responseContext.claims.some((claim) => claim.posture === 'REQUIERE_POSTURA_ABOGADO')) {
      addMissing(missingFields, 'claim_postures', 'Posturas sobre prestaciones', 'Cada prestación requiere una postura expresa del abogado.', 'REQUIRES_CONFIRMATION');
    }
  }

  const reusable = runReusablePreflight({
    documentType,
    template,
    sources,
    caseContext,
    analysis,
    parties: {
      actor: caseContext.fields.actor?.value,
      demandado: caseContext.fields.demandado?.value,
    },
    caseRefs: { expediente: caseContext.caseReferences.expediente?.value },
    legalBasis: [],
  });
  for (const field of reusable.missingFields) addMissing(missingFields, field.id, field.label, field.reason, field.status);
  warnings.push(...reusable.warnings);
  return {
    status: missingFields.length > 0 ? 'NEEDS_INPUT' : 'READY',
    code: missingFields.length > 0 ? (compatibility.code || 'EXTRACTION_INCOMPLETE') : undefined,
    missingFields,
    warnings: Array.from(new Set(warnings)),
  };
}

function runCivilMercantileEvidenceArgumentPreflight(
  documentType: string,
  template: DocumentTemplate,
  sources: UploadedSourceDocument[],
  caseContext: CaseContext,
  analysis: CaseAnalysis,
): DocumentPreflightResult {
  const missingFields: DocumentPreflightMissingField[] = [];
  const warnings: string[] = [];
  let compatibility;
  try {
    compatibility = evaluateSourceOutputCompatibility({
      selectedDocumentType: documentType,
      sourceDocuments: sources,
      sourceAnalysis: {
        numberedFacts: analysis.facts,
        sourceClaims: analysis.claimResponses?.length ? analysis.claimResponses : analysis.claims,
      },
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === SOURCE_DOCUMENT_INCOMPATIBLE) return { status: 'SOURCE_DOCUMENT_INCOMPATIBLE', code, missingFields: [], warnings: [String((error as Error).message || error)] };
    throw error;
  }
  if (compatibility.status === 'NEEDS_INPUT') {
    for (const requirement of compatibility.missingRequirements) {
      addMissing(missingFields, requirement, 'Fuente probatoria y rol', 'La fuente debe tener tipo y rol compatibles antes de cerrar la actuación.', 'REQUIRES_CONFIRMATION');
    }
  }
  const context = caseContext.civilMercantileEvidenceArgument;
  if (!context || context.documentType !== documentType) {
    addMissing(missingFields, 'evidence_argument_context', 'Contexto de evidencia y argumentos', 'Se requiere el contexto tipado de la actuación seleccionada.', 'REQUIRES_CONFIRMATION');
  } else {
    if (context.evidence.length === 0) addMissing(missingFields, 'evidence', 'Pruebas identificadas', 'No se identificaron pruebas.', 'MISSING');
    if (context.evidence.some((item) => item.status !== 'CONFIRMED')) addMissing(missingFields, 'evidence_confirmation', 'Confirmación de pruebas', 'Cada prueba debe ser confirmada por el abogado; una descripción extraída no basta.', 'REQUIRES_CONFIRMATION');
    if (context.evidence.some((item) => item.relatedFacts.length === 0)) addMissing(missingFields, 'evidence_fact_links', 'Relación prueba-hecho', 'Cada prueba debe vincularse con al menos un hecho identificado.', 'REQUIRES_CONFIRMATION');
    if (documentType.includes('alegatos') && context.arguments.some((item) => item.status !== 'CONFIRMED' || item.sources.length === 0)) addMissing(missingFields, 'argument_sources', 'Respaldo de argumentos', 'Cada argumento debe conservar una referencia verificable.', 'REQUIRES_CONFIRMATION');
  }
  const reusable = runReusablePreflight({
    documentType,
    template,
    sources,
    caseContext,
    analysis,
    parties: { actor: caseContext.fields.actor?.value, demandado: caseContext.fields.demandado?.value },
    caseRefs: { expediente: caseContext.caseReferences.expediente?.value },
    legalBasis: [],
  });
  for (const field of reusable.missingFields) addMissing(missingFields, field.id, field.label, field.reason, field.status);
  warnings.push(...reusable.warnings);
  return { status: missingFields.length > 0 ? 'NEEDS_INPUT' : 'READY', code: missingFields.length > 0 ? (compatibility.code || 'EXTRACTION_INCOMPLETE') : undefined, missingFields, warnings: Array.from(new Set(warnings)) };
}

function normalizeRequiredField(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function requiredFieldId(label: string): string {
  const value = normalizeRequiredField(label);
  if (/expediente|toca|amparo/.test(value)) return 'case_number';
  if (/demandado/.test(value)) return 'demandado';
  if (/actor|demandante/.test(value)) return 'actor';
  if (/quejoso|promovente|recurrente|incidentista|parte interesada/.test(value)) return 'represented_party';
  if (/autoridad|juzgado|tribunal|junta|scjn|destinatari|organo/.test(value)) return 'competent_authority';
  if (/personalidad|representacion/.test(value)) return 'personality';
  if (/hecho/.test(value)) return 'facts';
  if (/prestacion|pretension|accion/.test(value)) return 'claims';
  if (/excepcion|defensa/.test(value)) return 'defenses';
  if (/prueba|evidencia/.test(value)) return 'evidence';
  if (/petitorio|peticion/.test(value)) return 'petition';
  if (/fundamento|argument|agravio|concepto/.test(value)) return 'grounds';
  return `required_${value.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

function contextFieldFor(subject: ReusablePreflightSubject, id: string) {
  const fields = subject.caseContext.fields || {};
  const references = subject.caseContext.caseReferences || {};
  if (id === 'represented_party') return fields.promovente || fields.quejoso || fields.actor;
  if (id === 'competent_authority') return fields.autoridadResponsable || fields.autoridad || fields.juzgado || fields.tribunal;
  if (id === 'case_number') return references.expediente || fields.case_number;
  if (id === 'toca') return references.toca || fields.toca;
  if (id === 'amparo') return references.amparoDirecto || references.amparoIndirecto || fields.amparo;
  return fields[id];
}

function reusableFieldValue(subject: ReusablePreflightSubject, id: string): string | undefined {
  const contextField = contextFieldFor(subject, id);
  if (contextField?.status === 'CONFIRMED' && contextField.value?.trim()) return contextField.value.trim();
  if (id === 'case_number') return subject.caseRefs.expediente || subject.analysis.caseNumbers?.principal;
  if (id === 'actor') return subject.parties.actor;
  if (id === 'demandado') return subject.parties.demandado;
  if (id === 'represented_party') return subject.parties.actor || subject.parties.quejoso;
  if (id === 'competent_authority') return subject.parties.autoridadResponsable || subject.analysis.authorities?.[0];
  if (id === 'facts') return subject.analysis.facts?.length ? 'present' : undefined;
  if (id === 'claims') return (subject.analysis.claimResponses?.length || subject.analysis.claims?.length) ? 'present' : undefined;
  if (id === 'evidence') return subject.analysis.evidence?.length ? 'present' : undefined;
  if (id === 'grounds') return (subject.legalBasis.length || subject.analysis.arguments?.length || subject.analysis.citations?.length) ? 'present' : undefined;
  return undefined;
}

function runReusablePreflight(subject: ReusablePreflightSubject, seed: PreflightSeed = {}): DocumentPreflightResult {
  if (subject.template.tipo === CONTESTACION_REVISION_AMPARO_DIRECTO_ID) {
    const document = {
      documentType: subject.documentType,
      documentTypeLabel: subject.template.etiquetas[0] || subject.documentType,
      sourceDocuments: subject.sources,
      caseContext: subject.caseContext,
      parties: subject.parties,
      caseRefs: subject.caseRefs,
      legalBasis: subject.legalBasis,
    } as UniversalLegalDocument;
    return runRevisionPreflight(document, subject.template, subject.analysis);
  }

  const missingFields: DocumentPreflightMissingField[] = [...(seed.missingFields || [])];
  const warnings: string[] = [...(seed.warnings || [])];
  if (subject.sources.some((source) => source.sourceValidated === false)) {
    addMissing(
      missingFields,
      'source_validation',
      'Fuente validada',
      'La fuente debe completar la validación de extracción antes de alimentar el escrito.',
      'REQUIRES_CONFIRMATION',
    );
  }

  for (const label of subject.template.camposObligatorios || []) {
    const id = requiredFieldId(label);
    if (reusableFieldValue(subject, id)) continue;
    const contextField = contextFieldFor(subject, id);
    const anonymized = contextField?.status === 'ANONYMIZED';
    addMissing(
      missingFields,
      id,
      label,
      anonymized
        ? 'La fuente conserva este dato anonimizado; requiere confirmación profesional antes de cerrar el escrito.'
        : `No se confirmó el campo obligatorio "${label}" en la fuente, el análisis o el contexto del caso.`,
      anonymized ? 'ANONYMIZED' : 'MISSING',
    );
  }

  if (missingFields.some((field) => field.status === 'ANONYMIZED')) {
    warnings.push('Hay datos anonimizados que requieren confirmación manual; no deben desanonimizarse por inferencia.');
  }
  return {
    status: seed.status || (missingFields.length > 0 ? 'NEEDS_INPUT' : 'READY'),
    ...(seed.code ? { code: seed.code } : {}),
    missingFields,
    warnings,
  };
}

/** Compatibilidad histórica: el pipeline sigue pasando documento + template. */
export function runDocumentPreflight(
  doc: UniversalLegalDocument,
  template: DocumentTemplate,
  analysis?: CaseAnalysis,
): DocumentPreflightResult;
/** Preflight reusable por ID canónico, fuente(s) y CaseContext normalizado. */
export function runDocumentPreflight(
  selectedDocumentType: string,
  source: UploadedSourceDocument | UploadedSourceDocument[] | undefined,
  caseContext: CaseContext,
  analysis?: CaseAnalysis,
): DocumentPreflightResult;
export function runDocumentPreflight(
  first: UniversalLegalDocument | string,
  second: DocumentTemplate | UploadedSourceDocument | UploadedSourceDocument[] | undefined,
  third?: CaseAnalysis | CaseContext,
  fourth?: CaseAnalysis,
): DocumentPreflightResult {
  if (typeof first === 'string') {
    const selectedDocumentType = first.trim();
    const template = DocumentTemplates[selectedDocumentType];
    const caseContext = third as CaseContext;
    const sources = !second ? [] : Array.isArray(second) ? second : [second as UploadedSourceDocument];
    if (!template) {
      return {
        status: 'DOCUMENT_TYPE_NOT_IMPLEMENTED',
        code: DOCUMENT_TYPE_NOT_IMPLEMENTED,
        missingFields: [],
        warnings: [`No existe una estrategia canónica para "${selectedDocumentType}".`],
      };
    }
    if (!caseContext) {
      return {
        status: 'NEEDS_INPUT',
        missingFields: [{ id: 'case_context', label: 'Contexto del caso', reason: 'Se requiere un CaseContext normalizado.', status: 'REQUIRES_CONFIRMATION' }],
        warnings: [],
      };
    }
    if (selectedDocumentType === 'demanda_ordinaria_civil') {
      return runCivilDemandPreflight(caseContext, sources);
    }
    if (selectedDocumentType === 'demanda_ejecutiva_mercantil') {
      return caseContext.commercialEnforcement
        ? evaluateCommercialEnforcementPreflight(caseContext.commercialEnforcement)
        : {
          status: 'NEEDS_INPUT',
          missingFields: [{ id: 'case_context.commercialEnforcement', label: 'Contexto mercantil', reason: 'Se requiere un CommercialEnforcementContext normalizado para esta salida.', status: 'REQUIRES_CONFIRMATION' }],
          warnings: [],
        };
    }
    if (isCivilMercantileResponseDocumentType(selectedDocumentType)) {
      return runCivilMercantileResponsePreflight(selectedDocumentType, template, sources, caseContext, fourth || caseContext.analysis);
    }
    if (isCivilMercantileEvidenceArgumentDocumentType(selectedDocumentType)) {
      return runCivilMercantileEvidenceArgumentPreflight(selectedDocumentType, template, sources, caseContext, fourth || caseContext.analysis);
    }
    const sourceAnalysis = fourth || caseContext.analysis;
    const seed: PreflightSeed = {};
    try {
      const compatibility = evaluateSourceOutputCompatibility({
        selectedDocumentType,
        sourceDocuments: sources,
        sourceAnalysis: {
          numberedFacts: sourceAnalysis?.facts,
          sourceClaims: sourceAnalysis?.claimResponses?.length ? sourceAnalysis.claimResponses : sourceAnalysis?.claims,
        },
      });
      if (compatibility.status === 'NEEDS_INPUT' && compatibility.missingRequirements.length > 0) {
        seed.missingFields = compatibility.missingRequirements.map((label) => ({
          id: 'source_extraction',
          label,
          reason: 'La compatibilidad de la fuente requiere completar la extracción antes de cerrar el documento.',
          status: 'REQUIRES_CONFIRMATION' as const,
        }));
        seed.code = compatibility.code;
      }
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === SOURCE_DOCUMENT_INCOMPATIBLE || code === DOCUMENT_TYPE_NOT_IMPLEMENTED || code === MISSING_SOURCE_COMPATIBILITY_RULE) {
        return { status: code, code, missingFields: [], warnings: [String((error as Error).message || error)] } as DocumentPreflightResult;
      }
      throw error;
    }
    return runReusablePreflight({
      documentType: selectedDocumentType,
      template,
      sources,
      caseContext,
      analysis: sourceAnalysis,
      parties: {
        actor: caseContext.fields.actor?.value,
        quejoso: caseContext.fields.quejoso?.value || caseContext.fields.promovente?.value,
        demandado: caseContext.fields.demandado?.value,
        autoridadResponsable: caseContext.fields.autoridadResponsable?.value,
      },
      caseRefs: {
        expediente: caseContext.caseReferences.expediente?.value || caseContext.fields.case_number?.value,
        toca: caseContext.caseReferences.toca?.value || caseContext.fields.toca?.value,
        amparo: caseContext.caseReferences.amparoDirecto?.value
          || caseContext.caseReferences.amparoIndirecto?.value
          || caseContext.fields.amparo?.value,
      },
      legalBasis: [],
    }, seed);
  }

  if (isCivilMercantileResponseDocumentType(first.documentType)) {
    if (!first.caseContext) {
      return {
        status: 'NEEDS_INPUT',
        missingFields: [{
          id: 'case_context',
          label: 'Contexto del caso',
          reason: 'Se requiere un CaseContext normalizado para esta salida.',
          status: 'REQUIRES_CONFIRMATION',
        }],
        warnings: [],
      };
    }
    return runCivilMercantileResponsePreflight(
      first.documentType,
      second as DocumentTemplate,
      first.sourceDocuments || [],
      first.caseContext,
      (third as CaseAnalysis | undefined) || first.caseAnalysis || first.caseContext.analysis,
    );
  }

  if (isCivilMercantileEvidenceArgumentDocumentType(first.documentType)) {
    if (!first.caseContext) {
      return {
        status: 'NEEDS_INPUT',
        missingFields: [{ id: 'case_context', label: 'Contexto del caso', reason: 'Se requiere un CaseContext normalizado para esta salida.', status: 'REQUIRES_CONFIRMATION' }],
        warnings: [],
      };
    }
    return runCivilMercantileEvidenceArgumentPreflight(
      first.documentType,
      second as DocumentTemplate,
      first.sourceDocuments || [],
      first.caseContext,
      (third as CaseAnalysis | undefined) || first.caseAnalysis || first.caseContext.analysis,
    );
  }

  return runRevisionPreflight(
    first,
    second as DocumentTemplate,
    (third as CaseAnalysis | undefined) || first.caseAnalysis,
  );
}
