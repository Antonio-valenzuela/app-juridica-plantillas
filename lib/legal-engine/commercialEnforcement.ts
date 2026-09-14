import type { CaseAnalysis } from './caseAnalysis';
import type {
  CaseContextField,
  CaseFieldResolution,
  CaseFieldStatus,
  LegalBasisItem,
  ProvenanceRef,
} from './caseContext';
import type { DocumentPreflightMissingField, DocumentPreflightResult } from './documentPreflight';
import type { UniversalLegalDocument, UploadedSourceDocument, ValidationIssue } from './types';
import {
  NO_SOURCE_DOCUMENT,
  UNKNOWN_SOURCE_DOCUMENT_TYPE,
  normalizeSourceDocumentType,
  sourceDocumentMatter,
  type SourceDocumentTypeValue,
} from './sourceDocumentTypes';
import { COMMERCIAL_ENFORCEMENT_SOURCE_TYPES, inferSourceOutputType } from './sourceOutputCompatibility';

export { COMMERCIAL_ENFORCEMENT_SOURCE_TYPES };

export const COMMERCIAL_ENFORCEMENT_DOCUMENT_TYPE = 'demanda_ejecutiva_mercantil' as const;

export type CommercialEnforcementSourceType = (typeof COMMERCIAL_ENFORCEMENT_SOURCE_TYPES)[number];
export type CommercialSourceRole = 'PRIMARY' | 'SUPPORTING' | 'REFERENCE' | 'UNSPECIFIED';
export type CommercialSourceStatus = 'VALIDATED' | 'UNVALIDATED' | 'ANALYSIS_PENDING' | 'INCOMPATIBLE';

export type EnforcementInstrumentType =
  | 'PAGARE'
  | 'LETRA_DE_CAMBIO'
  | 'CHEQUE'
  | 'TITULO_CREDITO'
  | 'CONVENIO_MERCANTIL'
  | 'DOCUMENTO_MERCANTIL_BASE'
  | 'UNKNOWN';

export type EnforcementInstrumentStatus =
  | 'CONFIRMED_EXECUTABLE'
  | 'REQUIERE_DEFINICION_ABOGADO'
  | 'INCOMPLETE'
  | 'NOT_ESTABLISHED';

export interface CommercialSourceDescriptor {
  id: string;
  sourceType: SourceDocumentTypeValue;
  matter?: string;
  role: CommercialSourceRole;
  status: CommercialSourceStatus;
  provenance: 'KNOWN_PROVENANCE' | 'PARTIAL_PROVENANCE' | 'MANUAL_INPUT';
}

export interface CommercialFieldInput {
  value?: string;
  confirmedByLawyer?: boolean;
  resolution?: CaseFieldResolution;
  provenance?: CaseContextField['provenance'];
}

export interface CommercialMonetaryInput extends CommercialFieldInput {
  amount: string;
  currency: CommercialFieldInput;
}

export interface MonetaryValue {
  amount: string;
  currency: CaseContextField;
  status: CaseFieldStatus;
  resolution: CaseFieldResolution;
  sources: ProvenanceRef[];
}

export interface PaymentRecord {
  id: string;
  amount: MonetaryValue;
  date?: CaseContextField;
  allocation?: CaseContextField;
  source: ProvenanceRef[];
  status: CaseFieldStatus;
}

export interface BalanceCalculation {
  id: string;
  cutoffDate?: CaseContextField;
  originalAmount: MonetaryValue;
  payments: string[];
  allocationMethod: CaseContextField;
  formula: CaseContextField;
  rounding: CaseContextField;
  confirmedBalance: MonetaryValue;
  sources: ProvenanceRef[];
}

export interface CommercialObligation {
  id: string;
  concept: CaseContextField;
  principalAmount: MonetaryValue;
  currency?: CaseContextField;
  issueDate?: CaseContextField;
  dueDate?: CaseContextField;
  paymentStatus?: CaseContextField;
  payments: PaymentRecord[];
  balanceCalculation?: BalanceCalculation;
  interests: InterestSpec[];
  sources: ProvenanceRef[];
  status: CaseFieldStatus;
}

export type InterestType = 'ORDINARY' | 'MORATORY' | 'LEGAL' | 'CONVENTIONAL' | 'UNKNOWN';

export interface InterestSpec {
  id: string;
  type: InterestType;
  rate: CaseContextField;
  period: CaseContextField;
  basis: CaseContextField;
  source: ProvenanceRef[];
  status: CaseFieldStatus;
}

export interface EnforcementInstrument {
  id: string;
  sourceDocumentId: string;
  instrumentType: EnforcementInstrumentType;
  status: EnforcementInstrumentStatus;
  formalCompleteness: CaseContextField;
  enforceabilityAssessment: CaseContextField;
  maturityAndExigibility: CaseContextField;
  lawyerDecision: CaseContextField;
  provenance: ProvenanceRef[];
  parties: { creditor: CaseContextField; debtor: CaseContextField };
  amount?: MonetaryValue;
  currency?: CaseContextField;
  issueDate?: CaseContextField;
  dueDate?: CaseContextField;
  paymentStatus?: CaseContextField;
  signatures?: CaseContextField[];
  endorsements?: CaseContextField[];
  obligations: string[];
}

export interface CommercialFact {
  id: string;
  text: CaseContextField;
  relatedSources: string[];
  sources: ProvenanceRef[];
  status: CaseFieldStatus;
}

export interface CommercialClaim {
  id: string;
  description: CaseContextField;
  relatedObligations: string[];
  relatedFacts: string[];
  sources: ProvenanceRef[];
  status: CaseFieldStatus;
}

export interface CommercialEvidence {
  id: string;
  description: CaseContextField;
  relatedFacts: string[];
  source: ProvenanceRef[];
  status: CaseFieldStatus;
}

export interface CommercialRequest {
  id: string;
  description: CaseContextField;
  relatedClaims: string[];
  sources: ProvenanceRef[];
  status: CaseFieldStatus;
}

export interface CommercialEnforcementContext {
  documentType: typeof COMMERCIAL_ENFORCEMENT_DOCUMENT_TYPE;
  sources: CommercialSourceDescriptor[];
  parties: {
    creditor: CaseContextField;
    debtor: CaseContextField;
    representatives: CaseContextField[];
    addresses: CaseContextField[];
  };
  personality: CaseContextField;
  procedural: {
    court: CaseContextField;
    jurisdiction: CaseContextField;
    procedure: CaseContextField;
    action: CaseContextField;
    enforceabilityDecision: CaseContextField;
  };
  instrument?: EnforcementInstrument;
  obligations: CommercialObligation[];
  payments: PaymentRecord[];
  balanceCalculation?: BalanceCalculation;
  interests: InterestSpec[];
  claims: CommercialClaim[];
  facts: CommercialFact[];
  evidence: CommercialEvidence[];
  requests: CommercialRequest[];
  legalBasis: LegalBasisItem[];
  signature: CaseContextField;
  provenance: ProvenanceRef[];
  missingFields: string[];
  anonymizedFields: string[];
}

export interface CommercialInstrumentInput {
  id?: string;
  instrumentType?: EnforcementInstrumentType;
  formalCompleteness?: CommercialFieldInput;
  enforceabilityAssessment?: CommercialFieldInput;
  maturityAndExigibility?: CommercialFieldInput;
  lawyerDecision?: CommercialFieldInput;
  amount?: CommercialMonetaryInput;
  currency?: CommercialFieldInput;
  issueDate?: CommercialFieldInput;
  dueDate?: CommercialFieldInput;
  paymentStatus?: CommercialFieldInput;
  signatures?: CommercialFieldInput[];
  endorsements?: CommercialFieldInput[];
  sourceDocumentId?: string;
}

export interface CommercialPaymentInput {
  id: string;
  amount: CommercialMonetaryInput;
  date?: CommercialFieldInput;
  allocation?: CommercialFieldInput;
  sourceDocumentId?: string;
}

export interface CommercialObligationInput {
  id: string;
  concept: CommercialFieldInput;
  principalAmount: CommercialMonetaryInput;
  currency?: CommercialFieldInput;
  issueDate?: CommercialFieldInput;
  dueDate?: CommercialFieldInput;
  paymentStatus?: CommercialFieldInput;
  payments?: CommercialPaymentInput[];
  interests?: CommercialInterestInput[];
  sourceDocumentId?: string;
}

export interface CommercialInterestInput {
  id: string;
  type: InterestType;
  rate: CommercialFieldInput;
  period: CommercialFieldInput;
  basis: CommercialFieldInput;
  sourceDocumentId?: string;
}

export interface CommercialItemInput {
  id: string;
  value?: string;
  confirmedByLawyer?: boolean;
  relatedObligations?: string[];
  relatedFacts?: string[];
  relatedClaims?: string[];
  sourceDocumentId?: string;
}

export interface CommercialEnforcementManualInput {
  parties?: {
    creditor?: CommercialFieldInput;
    debtor?: CommercialFieldInput;
    representatives?: CommercialFieldInput[];
    addresses?: CommercialFieldInput[];
  };
  personality?: CommercialFieldInput;
  procedural?: {
    court?: CommercialFieldInput;
    jurisdiction?: CommercialFieldInput;
    procedure?: CommercialFieldInput;
    action?: CommercialFieldInput;
    enforceabilityDecision?: CommercialFieldInput;
  };
  instrument?: CommercialInstrumentInput;
  obligations?: CommercialObligationInput[];
  payments?: CommercialPaymentInput[];
  claims?: CommercialItemInput[];
  facts?: CommercialItemInput[];
  evidence?: CommercialItemInput[];
  requests?: CommercialItemInput[];
  legalBasis?: Array<CommercialItemInput & { text?: string }>;
  signature?: CommercialFieldInput;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function refFor(documentId?: string, excerpt?: string): ProvenanceRef[] {
  return documentId ? [{ documentId, ...(excerpt ? { excerpt } : {}), kind: 'KNOWN_PROVENANCE' }] : [];
}

function inputField(key: string, label: string, input?: CommercialFieldInput, anonymized = false): CaseContextField {
  const value = clean(input?.value);
  if (input?.confirmedByLawyer === true && value) {
    return { key, label, value, status: 'CONFIRMED', provenance: 'LAWYER_CONFIRMED', resolution: 'CONFIRMED', confirmedByLawyer: true };
  }
  if (value) {
    return {
      key,
      label,
      value,
      status: anonymized ? 'ANONYMIZED' : 'MISSING',
      provenance: input?.provenance || 'LAWYER_INPUT',
      resolution: input?.resolution || 'REQUIRES_LAWYER_DECISION',
      ...(input?.confirmedByLawyer === false ? { confirmedByLawyer: false } : {}),
    };
  }
  return {
    key,
    label,
    status: anonymized ? 'ANONYMIZED' : 'MISSING',
    ...(anonymized ? { provenance: 'SOURCE_EXTRACTED' as const } : {}),
    resolution: 'REQUIRES_LAWYER_DECISION',
  };
}

function isConfirmed(field: CaseContextField | undefined): boolean {
  return Boolean(field?.status === 'CONFIRMED' && field.resolution === 'CONFIRMED' && field.value?.trim());
}

function sourceRoleFor(source: UploadedSourceDocument): CommercialSourceRole {
  const candidate = source.classification?.role || source.classification?.sourceRole || (source as { role?: string }).role;
  return candidate === 'PRIMARY' || candidate === 'SUPPORTING' || candidate === 'REFERENCE' ? candidate : 'UNSPECIFIED';
}

function sourceProvenanceFor(source: UploadedSourceDocument): CommercialSourceDescriptor['provenance'] {
  const candidate = source.classification?.provenance || (source as { provenance?: string }).provenance;
  if (candidate === 'MANUAL_INPUT') return 'MANUAL_INPUT';
  if (candidate === 'KNOWN_PROVENANCE') return 'KNOWN_PROVENANCE';
  return source.filename || source.name ? 'KNOWN_PROVENANCE' : 'PARTIAL_PROVENANCE';
}

function sourceTypeFor(source: UploadedSourceDocument): SourceDocumentTypeValue {
  const explicit = source.classification?.sourceDocumentType || source.classification?.documentType || source.type;
  return normalizeSourceDocumentType(explicit) || inferSourceOutputType([source]);
}

function sourceDescriptor(source: UploadedSourceDocument): CommercialSourceDescriptor {
  const sourceType = sourceTypeFor(source);
  const role = sourceRoleFor(source);
  const matter = sourceType === UNKNOWN_SOURCE_DOCUMENT_TYPE || sourceType === NO_SOURCE_DOCUMENT
    ? undefined
    : sourceDocumentMatter(sourceType);
  const incompatible = role !== 'REFERENCE' && matter !== 'MERCANTIL';
  return {
    id: source.id,
    sourceType,
    ...(matter ? { matter } : {}),
    role,
    status: source.sourceValidated === false
      ? 'UNVALIDATED'
      : sourceType === UNKNOWN_SOURCE_DOCUMENT_TYPE
        ? 'ANALYSIS_PENDING'
        : incompatible
          ? 'INCOMPATIBLE'
          : 'VALIDATED',
    provenance: sourceProvenanceFor(source),
  };
}

function monetaryValue(
  key: string,
  amount: CommercialMonetaryInput | undefined,
  fallbackSourceId?: string,
): MonetaryValue {
  const amountField = inputField(`${key}.amount`, 'Cantidad', amount ? { value: amount.amount, confirmedByLawyer: amount.confirmedByLawyer, resolution: amount.resolution, provenance: amount.provenance } : undefined);
  const currency = inputField(`${key}.currency`, 'Moneda', amount?.currency);
  return {
    amount: amountField.value || '',
    currency,
    status: isConfirmed(amountField) && isConfirmed(currency) ? 'CONFIRMED' : 'MISSING',
    resolution: isConfirmed(amountField) && isConfirmed(currency) ? 'CONFIRMED' : 'REQUIRES_LAWYER_DECISION',
    sources: refFor(fallbackSourceId),
  };
}

function paymentRecord(input: CommercialPaymentInput, defaultSourceId?: string): PaymentRecord {
  const amount = monetaryValue(`payment.${input.id}`, input.amount, input.sourceDocumentId || defaultSourceId);
  const date = input.date ? inputField(`payment.${input.id}.date`, 'Fecha del pago', input.date) : undefined;
  const allocation = input.allocation ? inputField(`payment.${input.id}.allocation`, 'Aplicación del pago', input.allocation) : undefined;
  return {
    id: input.id,
    amount,
    ...(date ? { date } : {}),
    ...(allocation ? { allocation } : {}),
    source: refFor(input.sourceDocumentId || defaultSourceId),
    status: amount.status,
  };
}

function cents(value: string): number | undefined {
  const normalized = value.trim().replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const [whole, fraction = ''] = normalized.split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}

function moneyString(value: number): string {
  return (value / 100).toFixed(2);
}

export function calculateCommercialBalance(input: {
  originalAmount: MonetaryValue;
  payments: PaymentRecord[];
  cutoffDate?: CaseContextField;
  sourceDocumentId?: string;
}): BalanceCalculation | undefined {
  if (input.originalAmount.status !== 'CONFIRMED' || !isConfirmed(input.originalAmount.currency)) return undefined;
  const original = cents(input.originalAmount.amount);
  if (original === undefined) return undefined;
  const seen = new Set<string>();
  const usable = input.payments.filter((payment) => {
    if (seen.has(payment.id) || payment.status !== 'CONFIRMED') return false;
    if (input.cutoffDate?.value && payment.date?.value && payment.date.value > input.cutoffDate.value) return false;
    seen.add(payment.id);
    return cents(payment.amount.amount) !== undefined;
  });
  const totalPayments = usable.reduce((sum, payment) => sum + (cents(payment.amount.amount) || 0), 0);
  const confirmedBalance: MonetaryValue = {
    amount: moneyString(original - totalPayments),
    currency: input.originalAmount.currency,
    status: 'CONFIRMED',
    resolution: 'CONFIRMED',
    sources: [...input.originalAmount.sources, ...usable.flatMap((payment) => payment.source)],
  };
  const allocationMethod = inputField('balance.allocationMethod', 'Aplicación de pagos', { value: 'Aplicación simple al principal en orden confirmado', confirmedByLawyer: true });
  const formula = inputField('balance.formula', 'Fórmula del saldo', { value: 'principal confirmado - pagos confirmados', confirmedByLawyer: true });
  const rounding = inputField('balance.rounding', 'Redondeo', { value: 'Dos decimales de moneda', confirmedByLawyer: true });
  return {
    id: 'balance-calculation-1',
    ...(input.cutoffDate ? { cutoffDate: input.cutoffDate } : {}),
    originalAmount: input.originalAmount,
    payments: usable.map((payment) => payment.id),
    allocationMethod,
    formula,
    rounding,
    confirmedBalance,
    sources: confirmedBalance.sources.length ? confirmedBalance.sources : refFor(input.sourceDocumentId),
  };
}

function instrumentStatus(instrument: EnforcementInstrument): EnforcementInstrumentStatus {
  if (instrument.instrumentType === 'UNKNOWN') return 'NOT_ESTABLISHED';
  const mandatory = [
    instrument.formalCompleteness,
    instrument.enforceabilityAssessment,
    instrument.maturityAndExigibility,
    instrument.lawyerDecision,
    instrument.parties.creditor,
    instrument.parties.debtor,
    instrument.amount?.currency,
    instrument.dueDate,
  ];
  const amountConfirmed = Boolean(instrument.amount?.status === 'CONFIRMED'
    && isConfirmed(instrument.amount.currency)
    && cents(instrument.amount.amount) !== undefined);
  return mandatory.every((field) => field && isConfirmed(field as CaseContextField))
    && amountConfirmed
    ? 'CONFIRMED_EXECUTABLE'
    : mandatory.some((field) => field && (field as CaseContextField).value)
      ? 'REQUIERE_DEFINICION_ABOGADO'
      : 'INCOMPLETE';
}

function itemField(id: string, label: string, item?: CommercialItemInput): CaseContextField {
  return inputField(id, label, item ? { value: item.value, confirmedByLawyer: item.confirmedByLawyer } : undefined);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function buildCommercialEnforcementContext(
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
  manual: CommercialEnforcementManualInput = {},
): CommercialEnforcementContext {
  const descriptors = sources.map(sourceDescriptor);
  const primary = descriptors.find((source) => source.role === 'PRIMARY');
  const defaultSourceId = primary?.id;
  const sourceRefs = descriptors.map((source) => ({ documentId: source.id, kind: source.provenance }));
  const anonymizedHints = (analysis.anonymizedData || []).map((value) => value.toLocaleLowerCase('es-MX'));
  const isAnonymized = (aliases: string[]) => anonymizedHints.some((hint) => aliases.some((alias) => hint.includes(alias)));
  const anonymized = new Set<string>();
  const partyInput = manual.parties || {};
  const creditor = inputField('creditor', 'Acreedor', partyInput.creditor, isAnonymized(['acreedor', 'promovente', 'actor']));
  const debtor = inputField('debtor', 'Deudor', partyInput.debtor, isAnonymized(['deudor', 'demandado']));
  if (creditor.status === 'ANONYMIZED') anonymized.add('creditor');
  if (debtor.status === 'ANONYMIZED') anonymized.add('debtor');

  const instrumentInput = manual.instrument;
  let instrument: EnforcementInstrument | undefined;
  if (instrumentInput || defaultSourceId) {
    const instrumentSourceId = instrumentInput?.sourceDocumentId || defaultSourceId || '';
    const instrumentType = instrumentInput?.instrumentType || (
      descriptors.find((source) => source.role === 'PRIMARY' && source.sourceType === 'PAGARE') ? 'PAGARE' : 'UNKNOWN'
    );
    const formalCompleteness = inputField('instrument.formalCompleteness', 'Integridad formal', instrumentInput?.formalCompleteness);
    const enforceabilityAssessment = inputField('instrument.enforceabilityAssessment', 'Evaluación de ejecutividad', instrumentInput?.enforceabilityAssessment);
    const maturityAndExigibility = inputField('instrument.maturityAndExigibility', 'Vencimiento y exigibilidad', instrumentInput?.maturityAndExigibility);
    const lawyerDecision = inputField('instrument.lawyerDecision', 'Decisión profesional', instrumentInput?.lawyerDecision);
    const amount = instrumentInput?.amount ? monetaryValue('instrument', instrumentInput.amount, instrumentSourceId) : undefined;
    instrument = {
      id: instrumentInput?.id || 'instrument-1',
      sourceDocumentId: instrumentSourceId,
      instrumentType,
      status: 'INCOMPLETE',
      formalCompleteness,
      enforceabilityAssessment,
      maturityAndExigibility,
      lawyerDecision,
      provenance: refFor(instrumentSourceId),
      parties: { creditor, debtor },
      ...(amount ? { amount } : {}),
      ...(instrumentInput?.currency ? { currency: inputField('instrument.currency', 'Moneda', instrumentInput.currency) } : amount ? { currency: amount.currency } : {}),
      ...(instrumentInput?.issueDate ? { issueDate: inputField('instrument.issueDate', 'Fecha de emisión', instrumentInput.issueDate) } : {}),
      ...(instrumentInput?.dueDate ? { dueDate: inputField('instrument.dueDate', 'Fecha de vencimiento', instrumentInput.dueDate) } : {}),
      ...(instrumentInput?.paymentStatus ? { paymentStatus: inputField('instrument.paymentStatus', 'Estado de pago', instrumentInput.paymentStatus) } : {}),
      ...(instrumentInput?.signatures ? { signatures: instrumentInput.signatures.map((value, index) => inputField(`instrument.signature.${index + 1}`, 'Firma', value)) } : {}),
      ...(instrumentInput?.endorsements ? { endorsements: instrumentInput.endorsements.map((value, index) => inputField(`instrument.endorsement.${index + 1}`, 'Endoso', value)) } : {}),
      obligations: (manual.obligations || []).map((obligation) => obligation.id),
    };
    instrument.status = instrumentStatus(instrument);
  }

  const manualPayments = (manual.payments || []).map((payment) => paymentRecord(payment, defaultSourceId));
  const obligations: CommercialObligation[] = (manual.obligations || []).map((obligation) => {
    const obligationPayments = (obligation.payments || []).map((payment) => paymentRecord(payment, obligation.sourceDocumentId || defaultSourceId));
    const payments = [...obligationPayments, ...manualPayments].filter((payment, index, all) => all.findIndex((candidate) => candidate.id === payment.id) === index);
    const principalAmount = monetaryValue(`obligation.${obligation.id}`, obligation.principalAmount, obligation.sourceDocumentId || defaultSourceId);
    const interests: InterestSpec[] = (obligation.interests || []).map((interest) => {
      const rate = inputField(`interest.${interest.id}.rate`, 'Tasa', interest.rate);
      const period = inputField(`interest.${interest.id}.period`, 'Periodo', interest.period);
      const basis = inputField(`interest.${interest.id}.basis`, 'Base', interest.basis);
      return {
        id: interest.id,
        type: interest.type,
        rate,
        period,
        basis,
        source: refFor(interest.sourceDocumentId || obligation.sourceDocumentId || defaultSourceId),
        status: isConfirmed(rate) && isConfirmed(period) && isConfirmed(basis) ? 'CONFIRMED' : 'MISSING',
      };
    });
    const balanceCalculation = calculateCommercialBalance({ originalAmount: principalAmount, payments, sourceDocumentId: obligation.sourceDocumentId || defaultSourceId });
    return {
      id: obligation.id,
      concept: inputField(`obligation.${obligation.id}.concept`, 'Concepto de obligación', obligation.concept),
      principalAmount,
      ...(obligation.currency ? { currency: inputField(`obligation.${obligation.id}.currency`, 'Moneda', obligation.currency) } : { currency: principalAmount.currency }),
      ...(obligation.issueDate ? { issueDate: inputField(`obligation.${obligation.id}.issueDate`, 'Fecha de emisión', obligation.issueDate) } : {}),
      ...(obligation.dueDate ? { dueDate: inputField(`obligation.${obligation.id}.dueDate`, 'Vencimiento', obligation.dueDate) } : {}),
      ...(obligation.paymentStatus ? { paymentStatus: inputField(`obligation.${obligation.id}.paymentStatus`, 'Estado de pago', obligation.paymentStatus) } : {}),
      payments,
      ...(balanceCalculation ? { balanceCalculation } : {}),
      interests,
      sources: refFor(obligation.sourceDocumentId || defaultSourceId),
      status: isConfirmed(inputField(`obligation.${obligation.id}.concept`, 'Concepto', obligation.concept)) && principalAmount.status === 'CONFIRMED' ? 'CONFIRMED' : 'MISSING',
    };
  });
  const balanceCalculation = obligations.find((obligation) => obligation.balanceCalculation)?.balanceCalculation;
  const facts: CommercialFact[] = (manual.facts || []).map((item) => {
    const text = itemField(item.id, 'Hecho', item);
    const sources = refFor(item.sourceDocumentId || defaultSourceId, text.value);
    return { id: item.id, text, relatedSources: item.sourceDocumentId ? [item.sourceDocumentId] : defaultSourceId ? [defaultSourceId] : [], sources, status: text.status };
  });
  const claims: CommercialClaim[] = (manual.claims || []).map((item) => {
    const description = itemField(item.id, 'Pretensión', item);
    const sources = refFor(item.sourceDocumentId || defaultSourceId, description.value);
    return {
      id: item.id,
      description,
      relatedObligations: item.relatedObligations || [],
      relatedFacts: item.relatedFacts || [],
      sources,
      status: description.status,
    };
  });
  const evidence: CommercialEvidence[] = (manual.evidence || []).map((item) => {
    const description = itemField(item.id, 'Prueba', item);
    const source = refFor(item.sourceDocumentId || defaultSourceId, description.value);
    return { id: item.id, description, relatedFacts: item.relatedFacts || [], source, status: description.status };
  });
  const requests: CommercialRequest[] = (manual.requests || []).map((item) => {
    const description = itemField(item.id, 'Petición', item);
    const sources = refFor(item.sourceDocumentId || defaultSourceId, description.value);
    return { id: item.id, description, relatedClaims: item.relatedClaims || [], sources, status: description.status };
  });
  const interests = obligations.flatMap((obligation) => obligation.interests);
  const context: CommercialEnforcementContext = {
    documentType: COMMERCIAL_ENFORCEMENT_DOCUMENT_TYPE,
    sources: descriptors,
    parties: {
      creditor,
      debtor,
      representatives: (partyInput.representatives || []).map((input, index) => inputField(`representative.${index + 1}`, 'Representante', input)),
      addresses: (partyInput.addresses || []).map((input, index) => inputField(`address.${index + 1}`, 'Domicilio', input)),
    },
    personality: inputField('personality', 'Personalidad', manual.personality),
    procedural: {
      court: inputField('court', 'Órgano jurisdiccional', manual.procedural?.court),
      jurisdiction: inputField('jurisdiction', 'Competencia', manual.procedural?.jurisdiction),
      procedure: inputField('procedure', 'Procedimiento', manual.procedural?.procedure),
      action: inputField('action', 'Acción', manual.procedural?.action),
      enforceabilityDecision: inputField('enforceabilityDecision', 'Decisión sobre procedencia de la vía', manual.procedural?.enforceabilityDecision),
    },
    ...(instrument ? { instrument } : {}),
    obligations,
    payments: [...new Map(obligations.flatMap((obligation) => obligation.payments).map((payment) => [payment.id, payment])).values(), ...manualPayments]
      .filter((payment, index, all) => all.findIndex((candidate) => candidate.id === payment.id) === index),
    ...(balanceCalculation ? { balanceCalculation } : {}),
    interests,
    claims,
    facts,
    evidence,
    requests,
    legalBasis: (manual.legalBasis || []).flatMap((item, index) => {
      const text = clean(item.text || item.value);
      return text ? [{ id: item.id || `legal-basis-${index + 1}`, text, status: item.confirmedByLawyer ? 'CONFIRMED' as const : 'MISSING' as const, sources: refFor(item.sourceDocumentId || defaultSourceId) }] : [];
    }),
    signature: inputField('signature', 'Firma', manual.signature),
    provenance: sourceRefs,
    missingFields: [],
    anonymizedFields: [...anonymized],
  };
  const required: Array<[string, CaseContextField | undefined]> = [
    ['creditor', context.parties.creditor],
    ['debtor', context.parties.debtor],
    ['personality', context.personality],
    ['court', context.procedural.court],
    ['jurisdiction', context.procedural.jurisdiction],
    ['procedure', context.procedural.procedure],
    ['action', context.procedural.action],
    ['instrument', context.instrument && { key: 'instrument', label: 'Instrumento', value: context.instrument.status, status: context.instrument.status === 'CONFIRMED_EXECUTABLE' ? 'CONFIRMED' : 'MISSING', resolution: context.instrument.status === 'CONFIRMED_EXECUTABLE' ? 'CONFIRMED' : 'REQUIRES_LAWYER_DECISION' }],
    ['enforceability', context.instrument?.enforceabilityAssessment],
    ['maturity', context.instrument?.maturityAndExigibility],
    ['original_amount', context.instrument?.amount && { key: 'original_amount', label: 'Monto original', value: context.instrument.amount.amount, status: context.instrument.amount.status, resolution: context.instrument.amount.resolution }],
    ['payments', context.balanceCalculation ? { key: 'payments', label: 'Pagos', value: 'confirmed', status: 'CONFIRMED', resolution: 'CONFIRMED' } : undefined],
    ['confirmed_balance', context.balanceCalculation?.confirmedBalance && { key: 'confirmed_balance', label: 'Saldo confirmado', value: context.balanceCalculation.confirmedBalance.amount, status: context.balanceCalculation.confirmedBalance.status, resolution: context.balanceCalculation.confirmedBalance.resolution }],
    ['facts', context.facts.some((fact) => fact.status === 'CONFIRMED') ? { key: 'facts', label: 'Hechos', value: 'confirmed', status: 'CONFIRMED', resolution: 'CONFIRMED' } : undefined],
    ['claims', context.claims.some((claim) => claim.status === 'CONFIRMED') ? { key: 'claims', label: 'Pretensiones', value: 'confirmed', status: 'CONFIRMED', resolution: 'CONFIRMED' } : undefined],
    ['evidence', context.evidence.some((item) => item.status === 'CONFIRMED') ? { key: 'evidence', label: 'Pruebas', value: 'confirmed', status: 'CONFIRMED', resolution: 'CONFIRMED' } : undefined],
    ['requests', context.requests.some((item) => item.status === 'CONFIRMED') ? { key: 'requests', label: 'Peticiones', value: 'confirmed', status: 'CONFIRMED', resolution: 'CONFIRMED' } : undefined],
    ['legal_basis', context.legalBasis.some((item) => item.status === 'CONFIRMED') ? { key: 'legal_basis', label: 'Fundamentación', value: 'confirmed', status: 'CONFIRMED', resolution: 'CONFIRMED' } : undefined],
    ['signature', context.signature],
  ];
  context.missingFields = unique(required.filter(([, value]) => !value || !isConfirmed(value)).map(([key]) => key));
  return context;
}

function missing(id: string, label: string, reason: string, status: DocumentPreflightMissingField['status'] = 'MISSING'): DocumentPreflightMissingField {
  return { id, label, reason, status };
}

export function evaluateCommercialEnforcementPreflight(
  context: CommercialEnforcementContext,
): DocumentPreflightResult {
  const missingFields: DocumentPreflightMissingField[] = [];
  if (context.sources.length === 0) missingFields.push(missing('source_document', 'Documento base mercantil', 'La vía ejecutiva requiere una fuente mercantil identificada y validada.'));
  const productiveSources = context.sources.filter((source) => source.role !== 'REFERENCE');
  const incompatible = productiveSources.find((source) => source.status === 'INCOMPATIBLE' || !COMMERCIAL_ENFORCEMENT_SOURCE_TYPES.includes(source.sourceType as CommercialEnforcementSourceType));
  if (incompatible) return { status: 'SOURCE_DOCUMENT_INCOMPATIBLE', code: 'SOURCE_DOCUMENT_INCOMPATIBLE', missingFields: [], warnings: [`La fuente ${incompatible.id} no es compatible con la demanda ejecutiva mercantil.`] };
  const unvalidated = productiveSources.find((source) => source.status !== 'VALIDATED');
  if (unvalidated) {
    return {
      status: 'EXTRACTION_INCOMPLETE',
      code: 'EXTRACTION_INCOMPLETE',
      missingFields: [missing('source_validation', 'Validación de la fuente', `La fuente ${unvalidated.id} debe quedar validada antes de controlar una vía ejecutiva.`, 'REQUIRES_CONFIRMATION')],
      warnings: ['La fuente productiva no está validada; el documento no puede considerarse listo.'],
    };
  }
  const primary = context.sources.find((source) => source.role === 'PRIMARY');
  if (!primary) missingFields.push(missing('source_role', 'Fuente principal', 'La fuente debe tener role PRIMARY confirmado; un role omitido no controla la salida.', 'REQUIRES_CONFIRMATION'));
  if (context.sources.some((source) => source.role === 'UNSPECIFIED')) missingFields.push(missing('source_role', 'Función de la fuente', 'La función de cada fuente debe confirmarse antes de usarla.', 'REQUIRES_CONFIRMATION'));
  if (!context.instrument || context.instrument.status !== 'CONFIRMED_EXECUTABLE') {
    missingFields.push(missing('instrument', 'Instrumento ejecutivo', 'No existe un instrumento completo con evaluación de ejecutividad y decisión profesional confirmadas.', 'REQUIRES_CONFIRMATION'));
  }
  if (!context.parties.creditor.value || !isConfirmed(context.parties.creditor)) missingFields.push(missing('creditor', 'Acreedor', 'El acreedor debe confirmarse por el abogado o fuente válida.', context.parties.creditor.status === 'ANONYMIZED' ? 'ANONYMIZED' : 'REQUIRES_CONFIRMATION'));
  if (!context.parties.debtor.value || !isConfirmed(context.parties.debtor)) missingFields.push(missing('debtor', 'Deudor', 'El deudor debe confirmarse por el abogado o fuente válida.', context.parties.debtor.status === 'ANONYMIZED' ? 'ANONYMIZED' : 'REQUIRES_CONFIRMATION'));
  if (!isConfirmed(context.procedural.enforceabilityDecision)) missingFields.push(missing('enforceability_decision', 'Decisión sobre procedencia', 'La procedencia de la vía no se presume por la etiqueta del documento.', 'REQUIRES_CONFIRMATION'));
  const proceduralRequirements: Array<[string, CaseContextField, string, string]> = [
    ['personality', context.personality, 'Personalidad', 'La personalidad de quien promueve debe confirmarse.'],
    ['court', context.procedural.court, 'Órgano jurisdiccional', 'El órgano jurisdiccional destinatario debe confirmarse.'],
    ['jurisdiction', context.procedural.jurisdiction, 'Competencia', 'La competencia debe confirmarse; no se presume por la materia.'],
    ['procedure', context.procedural.procedure, 'Procedimiento', 'El procedimiento debe confirmarse.'],
    ['action', context.procedural.action, 'Acción', 'La acción ejercida debe confirmarse.'],
  ];
  for (const [id, field, label, reason] of proceduralRequirements) {
    if (!isConfirmed(field)) missingFields.push(missing(id, label, reason, 'REQUIRES_CONFIRMATION'));
  }
  if (!context.obligations.length) missingFields.push(missing('obligations', 'Obligación', 'Debe identificarse y confirmarse la obligación reclamada.', 'REQUIRES_CONFIRMATION'));
  if (!context.balanceCalculation?.confirmedBalance || context.balanceCalculation.confirmedBalance.status !== 'CONFIRMED') missingFields.push(missing('confirmed_balance', 'Saldo confirmado', 'El saldo debe calcularse con principal, pagos, corte y provenance verificables.', 'REQUIRES_CONFIRMATION'));
  if (!context.facts.some((fact) => fact.status === 'CONFIRMED')) missingFields.push(missing('facts', 'Hechos', 'Los hechos deben ser aportados o confirmados; no se inventan por inferencia.', 'REQUIRES_CONFIRMATION'));
  if (!context.claims.some((claim) => claim.status === 'CONFIRMED')) missingFields.push(missing('claims', 'Pretensiones', 'Las pretensiones deben ser aportadas o confirmadas por el abogado.', 'REQUIRES_CONFIRMATION'));
  if (!context.evidence.some((item) => item.status === 'CONFIRMED')) missingFields.push(missing('evidence', 'Pruebas', 'Las pruebas deben relacionarse con hechos confirmados.', 'REQUIRES_CONFIRMATION'));
  if (!context.requests.some((item) => item.status === 'CONFIRMED')) missingFields.push(missing('requests', 'Petitorios', 'Los petitorios deben ser congruentes con pretensiones y saldo confirmados.', 'REQUIRES_CONFIRMATION'));
  if (!context.legalBasis.some((item) => item.status === 'CONFIRMED')) missingFields.push(missing('legal_basis', 'Fundamentación', 'La fundamentación debe ser aportada o confirmada por el abogado; no se inventan artículos.', 'REQUIRES_CONFIRMATION'));
  const deduped = missingFields.filter((field, index, all) => all.findIndex((candidate) => candidate.id === field.id) === index);
  return {
    status: deduped.length ? 'NEEDS_INPUT' : 'READY',
    missingFields: deduped,
    warnings: context.anonymizedFields.length ? ['Existen datos anonimizados que requieren confirmación profesional.'] : [],
  };
}

export function evaluateCommercialEnforcementQuality(doc: UniversalLegalDocument): ValidationIssue[] {
  if (doc.documentType !== COMMERCIAL_ENFORCEMENT_DOCUMENT_TYPE) return [];
  const issues: ValidationIssue[] = [];
  const context = doc.caseContext?.commercialEnforcement;
  const preflight = (doc.generationMetadata as unknown as { preflight?: { status?: string; missingFields?: unknown[] } }).preflight;
  if (!context) {
    issues.push({ checkId: 'COMMERCIAL_CONTEXT_MISSING', message: 'La demanda ejecutiva mercantil requiere CommercialEnforcementContext.' });
    return issues;
  }
  if (!preflight || preflight.status !== 'READY' || (Array.isArray(preflight.missingFields) && preflight.missingFields.length > 0)) {
    issues.push({ checkId: 'COMMERCIAL_PREFLIGHT_NOT_READY', message: 'El preflight mercantil debe existir, ejecutarse y quedar READY antes de cerrar el documento.' });
  }
  if (!context.instrument || context.instrument.status !== 'CONFIRMED_EXECUTABLE') {
    issues.push({ checkId: 'COMMERCIAL_INSTRUMENT_NOT_EXECUTABLE', message: 'El instrumento mercantil no está confirmado como ejecutable.' });
  }
  for (const field of context.missingFields) {
    issues.push({ checkId: 'COMMERCIAL_REQUIRED_FIELD', message: 'Falta confirmar el campo mercantil "' + field + '".' });
  }
  for (const obligation of context.obligations) {
    if (obligation.status !== 'CONFIRMED') issues.push({ checkId: 'COMMERCIAL_OBLIGATION_NOT_CONFIRMED', message: 'La obligación "' + obligation.id + '" no está confirmada.' });
    if (!obligation.balanceCalculation?.confirmedBalance || obligation.balanceCalculation.confirmedBalance.status !== 'CONFIRMED') {
      issues.push({ checkId: 'COMMERCIAL_BALANCE_NOT_CONFIRMED', message: 'El saldo de la obligación "' + obligation.id + '" no está calculado y confirmado.' });
    }
    for (const interest of obligation.interests) {
      if (interest.status !== 'CONFIRMED') issues.push({ checkId: 'COMMERCIAL_INTEREST_NOT_CONFIRMED', message: 'El interés "' + interest.id + '" carece de tasa, periodo o base confirmados.' });
    }
  }
  const allText = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');
  if (/\[\s*(?:DATO PENDIENTE|DATO ANONIMIZADO|NO VERIFICADO)|\{\{|\bundefined\b|\bnull\b/i.test(allText)) {
    issues.push({ checkId: 'COMMERCIAL_UNRESOLVED_DATA', message: 'La salida mercantil conserva datos pendientes, anonimizados o tokens técnicos.' });
  }
  if (/\b(?:acto reclamado|conceptos? de violaci[oó]n|demanda de amparo|autoridad responsable|despido injustificado)\b/i.test(allText)) {
    issues.push({ checkId: 'COMMERCIAL_CROSS_FAMILY_CONTENT', message: 'La demanda ejecutiva mercantil contiene lenguaje estructural de otra familia documental.' });
  }
  const obligationIds = new Set(context.obligations.map((obligation) => obligation.id));
  for (const claim of context.claims) {
    if (claim.status === 'CONFIRMED') {
      if (claim.relatedObligations.length === 0 || claim.relatedObligations.some((obligationId) => !obligationIds.has(obligationId))) {
        issues.push({ checkId: 'COMMERCIAL_GRAPH_BROKEN', message: 'La pretensión "' + claim.id + '" debe relacionarse con obligaciones existentes.' });
      }
      if (claim.relatedFacts.length === 0 || claim.relatedFacts.some((factId) => !context.facts.some((fact) => fact.id === factId))) {
        issues.push({ checkId: 'COMMERCIAL_GRAPH_BROKEN', message: 'La pretensión "' + claim.id + '" debe relacionarse con hechos existentes.' });
      }
    }
  }
  if (context.instrument && context.instrument.obligations.some((obligationId) => !obligationIds.has(obligationId))) {
    issues.push({ checkId: 'COMMERCIAL_GRAPH_BROKEN', message: 'El instrumento referencia una obligación que no está en el contexto.' });
  }
  const provenanceRefs = [
    ...context.provenance,
    ...(context.instrument?.provenance || []),
    ...context.obligations.flatMap((obligation) => [
      ...obligation.sources,
      ...obligation.payments.flatMap((payment) => payment.source),
      ...obligation.interests.flatMap((interest) => interest.source),
    ]),
    ...context.facts.flatMap((fact) => fact.sources),
    ...context.claims.flatMap((claim) => claim.sources),
    ...context.evidence.flatMap((item) => item.source),
    ...context.requests.flatMap((item) => item.sources),
    ...context.legalBasis.flatMap((item) => item.sources),
  ];
  const sourceIds = new Set(context.sources.map((source) => source.id));
  if (provenanceRefs.some((ref) => !ref.documentId || !sourceIds.has(ref.documentId))) {
    issues.push({ checkId: 'COMMERCIAL_PROVENANCE_INVALID', message: 'Existe provenance mercantil que referencia una fuente inexistente.' });
  }
  return issues;
}
