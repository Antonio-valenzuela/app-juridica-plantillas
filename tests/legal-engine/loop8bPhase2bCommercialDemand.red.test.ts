import { describe, expect, it } from 'vitest';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import {
  COMMERCIAL_ENFORCEMENT_REQUIRED_FIELD_IDS,
  COMMERCIAL_ENFORCEMENT_REQUIRED_SECTION_IDS,
  COMMERCIAL_ENFORCEMENT_STRATEGY,
  getDocumentStrategy,
} from '@/lib/legal-engine/documentStrategies';
import { DocumentTemplates } from '@/lib/legal-engine/documentTemplates';
import {
  COMMERCIAL_ENFORCEMENT_SOURCE_TYPES,
  evaluateSourceOutputCompatibility,
  getCommercialEnforcementSourceCompatibilityPolicy,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import { normalizeSourceDocumentType } from '@/lib/legal-engine/sourceDocumentTypes';
import {
  buildCommercialEnforcementContext,
  calculateCommercialBalance,
  type CommercialEnforcementManualInput,
  evaluateCommercialEnforcementPreflight,
} from '@/lib/legal-engine/commercialEnforcement';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

const TARGET_ID = 'demanda_ejecutiva_mercantil';

function analysis(overrides: Partial<CaseAnalysis> = {}): CaseAnalysis {
  return {
    parties: {},
    authorities: [],
    caseNumbers: {},
    proceduralTimeline: [],
    challengedActs: [],
    claims: [],
    arguments: [],
    evidence: [],
    facts: [],
    rulings: [],
    citations: [],
    proceduralPosture: {
      proceduralWrit: '',
      isExtraordinary: false,
      constitutionalIssues: [],
      legalityIssues: [],
      exceptionalInterest: null,
    },
    caseTheory: {
      factualTheory: '',
      legalTheory: '',
      constitutionalTheory: '',
      proceduralTheory: '',
      opposingTheory: '',
      vulnerabilities: [],
      strengths: [],
    },
    argumentAxes: [],
    missingData: [],
    anonymizedData: [],
    unsupportedClaims: [],
    ...overrides,
  };
}

function source(
  id: string,
  sourceDocumentType: string,
  role?: 'PRIMARY' | 'SUPPORTING' | 'REFERENCE',
): UploadedSourceDocument {
  return {
    id,
    filename: `${id}.txt`,
    content: `Contenido mercantil sintético de ${id}.`,
    sourceValidated: true,
    classification: {
      sourceDocumentType,
      ...(role ? { role } : {}),
      provenance: 'KNOWN_PROVENANCE',
    },
  };
}

const confirmed = (value: string) => ({ value, confirmedByLawyer: true as const });

const fullManualInput: CommercialEnforcementManualInput = {
  personality: confirmed('Personalidad procesal confirmada'),
  parties: {
    creditor: confirmed('Acreedor sintético'),
    debtor: confirmed('Deudor sintético'),
  },
  procedural: {
    court: confirmed('Órgano jurisdiccional mercantil competente'),
    jurisdiction: confirmed('Competencia mercantil por confirmar en forma'),
    procedure: confirmed('Juicio ejecutivo mercantil'),
    action: confirmed('Acción cambiaria o ejecutiva que determine el abogado'),
    enforceabilityDecision: confirmed('Procede analizar la vía ejecutiva con el instrumento confirmado'),
  },
  instrument: {
    id: 'instrument-synthetic',
    instrumentType: 'PAGARE',
    formalCompleteness: confirmed('Requisitos formales confirmados por el abogado'),
    enforceabilityAssessment: confirmed('Documento base susceptible de ejecución según revisión profesional'),
    maturityAndExigibility: confirmed('Obligación vencida y exigible según constancia revisada'),
    lawyerDecision: confirmed('Confirmado para preparación del escrito'),
    amount: { amount: '1000.00', currency: confirmed('MXN'), confirmedByLawyer: true },
    issueDate: confirmed('2026-01-10'),
    dueDate: confirmed('2026-03-10'),
    paymentStatus: confirmed('Pagos parciales identificados'),
    signatures: [confirmed('Firma del suscriptor confirmada')],
  },
  payments: [
    { id: 'payment-1', amount: { amount: '200.00', currency: confirmed('MXN'), confirmedByLawyer: true }, date: confirmed('2026-03-20') },
    { id: 'payment-2', amount: { amount: '100.00', currency: confirmed('MXN'), confirmedByLawyer: true }, date: confirmed('2026-04-20') },
    { id: 'payment-2', amount: { amount: '100.00', currency: confirmed('MXN'), confirmedByLawyer: true }, date: confirmed('2026-04-20') },
  ],
  obligations: [{
    id: 'obligation-synthetic',
    concept: confirmed('Obligación mercantil sintética'),
    principalAmount: { amount: '1000.00', currency: confirmed('MXN'), confirmedByLawyer: true },
  }],
  claims: [{ id: 'claim-synthetic', value: 'Pago del saldo confirmado', confirmedByLawyer: true, relatedFacts: ['fact-synthetic'], relatedObligations: ['obligation-synthetic'] }],
  facts: [{ id: 'fact-synthetic', value: 'Hecho mercantil sintético verificable', confirmedByLawyer: true, relatedSources: ['commercial-primary'] } as never],
  evidence: [{ id: 'evidence-synthetic', value: 'Documento base mercantil sintético', confirmedByLawyer: true, relatedFacts: ['fact-synthetic'] }],
  requests: [{ id: 'request-synthetic', value: 'Petición congruente con el saldo confirmado', confirmedByLawyer: true, relatedClaims: ['claim-synthetic'] }],
  legalBasis: [{ id: 'legal-basis-synthetic', value: 'Fundamento sintético confirmado', confirmedByLawyer: true }],
  signature: confirmed('Firma pendiente de colocación final'),
};

describe('LOOP 8B FASE 2B — strategy, template y catálogo mercantil', () => {
  it('registra strategy/template dedicados y cambia únicamente el target a IMPLEMENTED', () => {
    expect(getDocumentStrategy(TARGET_ID)).toBe(COMMERCIAL_ENFORCEMENT_STRATEGY);
    expect(DocumentTemplates[TARGET_ID]).toMatchObject({
      tipo: TARGET_ID,
      materia: 'MERCANTIL',
      esqueletoDedicado: true,
    });
    expect(DocumentTemplates[TARGET_ID]?.estructura).toEqual([...COMMERCIAL_ENFORCEMENT_REQUIRED_SECTION_IDS]);
    expect(getCatalogDocument(TARGET_ID)).toMatchObject({
      kind: 'DOCUMENT_TYPE',
      status: 'IMPLEMENTED',
      strategyId: TARGET_ID,
      templateId: TARGET_ID,
    });
    expect(getCatalogDocument('demanda_oral_mercantil')).toMatchObject({ status: 'CATALOG_ONLY' });
  });

  it('conserva un contrato estructural exacto de 13 secciones y campos mercantiles', () => {
    expect(COMMERCIAL_ENFORCEMENT_REQUIRED_SECTION_IDS).toHaveLength(13);
    expect(new Set(COMMERCIAL_ENFORCEMENT_REQUIRED_SECTION_IDS).size).toBe(13);
    expect(COMMERCIAL_ENFORCEMENT_REQUIRED_FIELD_IDS).toEqual(expect.arrayContaining([
      'creditor', 'debtor', 'instrument', 'enforceability', 'maturity',
      'original_amount', 'payments', 'confirmed_balance', 'interest',
      'facts', 'claims', 'evidence', 'requests', 'signature',
    ]));
  });

  it('nunca sustituye el canonical por una demanda genérica o una familia incompatible', () => {
    const routing = resolveDocumentRouting({ selectedDocumentType: TARGET_ID, sourceDocumentType: 'DEMANDA_MERCANTIL' });
    expect(routing.resolvedTemplate).toBe(TARGET_ID);
    expect(routing.resolvedStrategy).toBe(TARGET_ID);
    expect(routing.fallbackUsed).toBe(false);
  });
});

describe('LOOP 8B FASE 2B — fuentes, roles y compatibilidad', () => {
  it('normaliza únicamente tipos mercantiles conocidos y no inventa tipos', () => {
    expect(normalizeSourceDocumentType('pagaré')).toBe('PAGARE');
    expect(normalizeSourceDocumentType('titulo de credito')).toBe('TITULO_CREDITO');
    expect(normalizeSourceDocumentType('tipo mercantil inexistente')).toBeUndefined();
    expect(COMMERCIAL_ENFORCEMENT_SOURCE_TYPES).toEqual(expect.arrayContaining([
      'PAGARE', 'TITULO_CREDITO', 'CONVENIO_MERCANTIL', 'DOCUMENTO_MERCANTIL_BASE',
    ]));
  });

  it('evalúa las fuentes individualmente y deja REFERENCE sin control de salida', () => {
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: TARGET_ID,
      sourceDocuments: [
        source('commercial-primary', 'PAGARE', 'PRIMARY'),
        source('commercial-support', 'PAGO_MERCANTIL', 'SUPPORTING'),
        source('commercial-reference', 'DOCUMENTO_MERCANTIL_AUXILIAR', 'REFERENCE'),
      ],
    });

    expect(result.status).toBe('COMPATIBLE');
    expect(result.sources).toEqual([
      expect.objectContaining({ id: 'commercial-primary', role: 'PRIMARY', controlsOutput: true, status: 'COMPATIBLE' }),
      expect.objectContaining({ id: 'commercial-support', role: 'SUPPORTING', controlsOutput: true, status: 'COMPATIBLE' }),
      expect.objectContaining({ id: 'commercial-reference', role: 'REFERENCE', controlsOutput: false, status: 'REFERENCE_ONLY' }),
    ]);
    expect(getCommercialEnforcementSourceCompatibilityPolicy().sourceRequired).toBe(true);
  });

  it('no convierte un role omitido en PRIMARY y bloquea fuentes civiles/laborales productivas', () => {
    expect(evaluateSourceOutputCompatibility({
      selectedDocumentType: TARGET_ID,
      sourceDocuments: [source('role-pending', 'PAGARE')],
    })).toMatchObject({ status: 'NEEDS_INPUT' });

    expect(() => evaluateSourceOutputCompatibility({
      selectedDocumentType: TARGET_ID,
      sourceDocuments: [source('labor-source', 'DEMANDA_LABORAL', 'PRIMARY')],
    })).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
  });
});

describe('LOOP 8B FASE 2B — contexto, ejecutividad, pagos y preflight', () => {
  it('conserva instrumento, obligación, provenance y saldo determinista sin intereses implícitos', () => {
    const context = buildCommercialEnforcementContext(
      [source('commercial-primary', 'PAGARE', 'PRIMARY'), source('commercial-support', 'PAGO_MERCANTIL', 'SUPPORTING')],
      analysis(),
      fullManualInput,
    );

    expect(context.instrument).toMatchObject({
      instrumentType: 'PAGARE',
      status: 'CONFIRMED_EXECUTABLE',
      sourceDocumentId: 'commercial-primary',
    });
    expect(context.obligations[0]?.principalAmount.amount).toBe('1000.00');
    expect(context.balanceCalculation?.confirmedBalance.amount).toBe('700.00');
    expect(context.balanceCalculation?.payments).toEqual(['payment-1', 'payment-2']);
    expect(calculateCommercialBalance({ originalAmount: context.obligations[0].principalAmount, payments: context.payments })?.confirmedBalance.amount).toBe('700.00');
    expect(context.interests).toEqual([]);
    expect(context.provenance.some((ref) => ref.documentId === 'commercial-primary')).toBe(true);
  });

  it('no marca entradas manuales como confirmadas sin confirmedByLawyer', () => {
    const context = buildCommercialEnforcementContext(
      [source('commercial-primary', 'PAGARE', 'PRIMARY')],
      analysis(),
      { ...fullManualInput, parties: { creditor: { value: 'Acreedor pendiente' }, debtor: confirmed('Deudor sintético') } },
    );

    expect(context.parties.creditor).toMatchObject({ status: 'MISSING', resolution: 'REQUIRES_LAWYER_DECISION' });
    expect(context.missingFields).toContain('creditor');
  });

  it('un documento base sin decisión profesional no se vuelve ejecutable automáticamente', () => {
    const context = buildCommercialEnforcementContext(
      [source('commercial-base', 'DOCUMENTO_MERCANTIL_BASE', 'PRIMARY')],
      analysis(),
      { instrument: { instrumentType: 'UNKNOWN', lawyerDecision: { value: 'Revisión pendiente' } } },
    );

    expect(context.instrument?.status).not.toBe('CONFIRMED_EXECUTABLE');
    expect(evaluateCommercialEnforcementPreflight(context).status).toBe('NEEDS_INPUT');
  });

  it('requiere fuente y no permite READY sin preflight completo', () => {
    const noSource = buildCommercialEnforcementContext([], analysis(), fullManualInput);
    expect(evaluateCommercialEnforcementPreflight(noSource)).toMatchObject({ status: 'NEEDS_INPUT' });

    const complete = buildCommercialEnforcementContext(
      [source('commercial-primary', 'PAGARE', 'PRIMARY')],
      analysis(),
      fullManualInput,
    );
    expect(evaluateCommercialEnforcementPreflight(complete)).toMatchObject({ status: 'READY', missingFields: [] });
  });

  it('cierra los campos profesionales mínimos y no acepta una fuente productiva no validada', () => {
    const incompleteClosure = buildCommercialEnforcementContext(
      [source('commercial-primary', 'PAGARE', 'PRIMARY')],
      analysis(),
      { ...fullManualInput, personality: undefined, legalBasis: undefined },
    );
    expect(incompleteClosure.missingFields).toEqual(expect.arrayContaining(['personality', 'legal_basis']));
    expect(evaluateCommercialEnforcementPreflight(incompleteClosure).missingFields.map((field) => field.id))
      .toEqual(expect.arrayContaining(['personality', 'legal_basis']));

    const unvalidated = buildCommercialEnforcementContext(
      [{ ...source('commercial-primary', 'PAGARE', 'PRIMARY'), sourceValidated: false }],
      analysis(),
      fullManualInput,
    );
    expect(evaluateCommercialEnforcementPreflight(unvalidated)).toMatchObject({
      status: 'EXTRACTION_INCOMPLETE',
      code: 'EXTRACTION_INCOMPLETE',
    });
  });

  it('conserva el vínculo estructural entre pretensión y obligación', () => {
    const context = buildCommercialEnforcementContext(
      [source('commercial-primary', 'PAGARE', 'PRIMARY')],
      analysis(),
      fullManualInput,
    );
    expect(context.claims[0]?.relatedObligations).toEqual(['obligation-synthetic']);
  });
});
