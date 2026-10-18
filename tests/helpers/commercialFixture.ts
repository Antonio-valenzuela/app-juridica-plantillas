import type { CommercialEnforcementManualInput } from '@/lib/legal-engine/commercialEnforcement';

/** Contexto mercantil sintético CONFIRMADO por el abogado para la evidencia de la demanda ejecutiva mercantil. */
export const COMMERCIAL_FACT = 'Hecho mercantil sintético confirmado';
const confirmed = (value: string) => ({ value, confirmedByLawyer: true as const });

export const COMMERCIAL_MANUAL: CommercialEnforcementManualInput = {
  personality: confirmed('Personalidad procesal confirmada'),
  parties: { creditor: confirmed('Acreedor sintético'), debtor: confirmed('Deudor sintético') },
  procedural: {
    court: confirmed('Juzgado mercantil competente'), jurisdiction: confirmed('Competencia por confirmar en forma'),
    procedure: confirmed('Juicio ejecutivo mercantil'), action: confirmed('Acción ejecutiva confirmada'),
    enforceabilityDecision: confirmed('Procedencia confirmada por el abogado'),
  },
  instrument: {
    id: 'instrument-synthetic', instrumentType: 'PAGARE',
    formalCompleteness: confirmed('Integridad formal confirmada'),
    enforceabilityAssessment: confirmed('Ejecutividad confirmada'),
    maturityAndExigibility: confirmed('Vencimiento y exigibilidad confirmados'),
    lawyerDecision: confirmed('Decisión profesional confirmada'),
    amount: { amount: '1000.00', currency: confirmed('MXN'), confirmedByLawyer: true },
    dueDate: confirmed('2026-03-10'),
  },
  obligations: [{ id: 'obligation-synthetic', concept: confirmed('Obligación sintética'), principalAmount: { amount: '1000.00', currency: confirmed('MXN'), confirmedByLawyer: true } }],
  facts: [{ id: 'fact-synthetic', value: COMMERCIAL_FACT, confirmedByLawyer: true }],
  claims: [{ id: 'claim-synthetic', value: 'Pago del saldo confirmado', confirmedByLawyer: true, relatedFacts: ['fact-synthetic'], relatedObligations: ['obligation-synthetic'] }],
  evidence: [{ id: 'evidence-synthetic', value: 'Pagaré sintético aportado', confirmedByLawyer: true, relatedFacts: ['fact-synthetic'] }],
  requests: [{ id: 'request-synthetic', value: 'Petición congruente sintética', confirmedByLawyer: true, relatedClaims: ['claim-synthetic'] }],
  legalBasis: [{ id: 'legal-basis-synthetic', value: 'Fundamento sintético confirmado', confirmedByLawyer: true }],
  signature: confirmed('Firma confirmada'),
};
