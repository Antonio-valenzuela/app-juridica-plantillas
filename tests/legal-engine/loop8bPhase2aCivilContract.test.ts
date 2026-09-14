import { describe, expect, it } from 'vitest';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildCaseContext, type CivilDemandManualInput } from '@/lib/legal-engine/caseContext';
import { createSourceDocument } from '@/lib/legal-engine/context';
import {
  CIVIL_DEMAND_SOURCE_COMPATIBILITY_RULES,
  evaluateSourceOutputCompatibility,
  getCivilDemandSourceCompatibilityPolicy,
  SourceDocumentIncompatibleError,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import { runCivilDemandPreflight } from '@/lib/legal-engine/documentPreflight';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

const CIVIL_SOURCE_TYPES = [
  'CONTRATO_CIVIL',
  'CONVENIO_CIVIL',
  'REQUERIMIENTO_CIVIL',
  'COMUNICACION_CIVIL',
  'PRUEBA_DOCUMENTAL_CIVIL',
  'DOCUMENTO_CIVIL_AUXILIAR',
] as const;

function source(
  id: string,
  sourceDocumentType: string,
  role?: 'PRIMARY' | 'SUPPORTING' | 'REFERENCE',
  content = 'Contenido jurídico civil sintético.',
): UploadedSourceDocument {
  return createSourceDocument({
    id,
    filename: `${id}.txt`,
    content,
    sourceValidated: true,
    classification: {
      sourceDocumentType,
      ...(role ? { role } : {}),
      provenance: 'KNOWN_PROVENANCE',
    },
  });
}

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

describe('LOOP 8B FASE 2A — contrato CivilDemandContext', () => {
  it('expone el contexto civil tipado y no deriva actor desde quejoso', () => {
    const context = buildCaseContext(
      [source('civil-contract', 'CONTRATO_CIVIL', 'PRIMARY')],
      analysis({ parties: { quejoso: 'Rol constitucional sintético' } }),
    );

    expect(context.civil).toMatchObject({
      documentType: 'demanda_ordinaria_civil',
      personality: { status: 'MISSING', resolution: 'REQUIRES_LAWYER_DECISION' },
      signature: { status: 'MISSING', resolution: 'REQUIRES_LAWYER_DECISION' },
    });
    expect(context.civil?.parties.actor.status).toBe('MISSING');
    expect(context.civil?.parties.actor.value).toBeUndefined();
    expect(context.civil?.sources).toHaveLength(1);
    expect(context.civil?.sources[0]).toMatchObject({
      id: 'civil-contract',
      sourceType: 'CONTRATO_CIVIL',
      role: 'PRIMARY',
    });
  });

  it('mantiene inferencias como INFERRED y exige decisión para entrada manual no confirmada', () => {
    const manual: CivilDemandManualInput = {
      parties: {
        actor: { value: 'Actora manual sintética', confirmedByLawyer: false },
        demandado: { value: 'Demandada manual sintética', confirmedByLawyer: true },
      },
      procedural: {
        action: { value: 'Acción sugerida sintética', resolution: 'INFERRED' },
      },
    };

    const context = buildCaseContext([], analysis(), undefined, manual);

    expect(context.civil?.parties.actor).toMatchObject({
      value: 'Actora manual sintética',
      status: 'MISSING',
      provenance: 'LAWYER_INPUT',
      resolution: 'REQUIRES_LAWYER_DECISION',
      confirmedByLawyer: false,
    });
    expect(context.civil?.parties.demandado).toMatchObject({
      value: 'Demandada manual sintética',
      status: 'CONFIRMED',
      provenance: 'LAWYER_CONFIRMED',
      resolution: 'CONFIRMED',
      confirmedByLawyer: true,
    });
    expect(context.civil?.procedural.action).toMatchObject({
      value: 'Acción sugerida sintética',
      status: 'MISSING',
      provenance: 'INFERRED',
      resolution: 'INFERRED',
    });
  });

  it('no convierte hechos ni prestaciones manuales en confirmados sin confirmación del abogado', () => {
    const manual = {
      facts: [{ id: 'manual-fact-1', value: 'Hecho manual pendiente sintético', confirmedByLawyer: false }],
      claims: [{ id: 'manual-claim-1', value: 'Prestación manual pendiente sintética', confirmedByLawyer: false }],
    } as CivilDemandManualInput & {
      facts: Array<{ id: string; value: string; confirmedByLawyer: boolean }>;
      claims: Array<{ id: string; value: string; confirmedByLawyer: boolean }>;
    };

    const context = buildCaseContext([], analysis(), undefined, manual);

    expect(context.civil?.facts).toEqual([expect.objectContaining({
      id: 'manual-fact-1',
      text: 'Hecho manual pendiente sintético',
      status: 'MISSING',
    })]);
    expect(context.civil?.claims).toEqual([expect.objectContaining({
      id: 'manual-claim-1',
      description: 'Prestación manual pendiente sintética',
      status: 'MISSING',
    })]);
  });

  it('conserva provenance individual de hechos, claims y evidencia', () => {
    const primary = source('civil-primary', 'CONTRATO_CIVIL', 'PRIMARY');
    const support = source('civil-support', 'COMUNICACION_CIVIL', 'SUPPORTING');
    const context = buildCaseContext(
      [primary, support],
      analysis({
        facts: [{
          id: 'fact-synthetic-1',
          number: '1',
          text: 'Hecho contractual sintético.',
          confidence: 0.9,
          sourceReference: { documentId: primary.id, page: 1, textSnippet: 'Hecho contractual sintético.' },
        }],
        claims: ['Prestación contractual sintética.'],
        claimResponses: [{
          id: 'claim-synthetic-1',
          number: '1',
          text: 'Prestación contractual sintética.',
          position: 'UNDEFINED',
          sourceReference: { documentId: primary.id, page: 1, textSnippet: 'Prestación contractual sintética.' },
        }],
        evidence: [{
          id: 'evidence-synthetic-1',
          type: 'documental',
          description: 'Documento contractual sintético.',
          sourceReference: { documentId: support.id, page: 1, textSnippet: 'Documento contractual sintético.' },
        }],
      }),
    );

    expect(context.civil?.facts[0].sources).toEqual([expect.objectContaining({ documentId: primary.id, page: 1 })]);
    expect(context.civil?.claims[0].sources).toEqual([expect.objectContaining({ documentId: primary.id, page: 1 })]);
    expect(context.civil?.evidence[0].source).toEqual(expect.objectContaining({ documentId: support.id, page: 1 }));
  });
});

describe('LOOP 8B FASE 2A — source compatibility civil', () => {
  it('declara exactamente las seis fuentes civiles auxiliares y permite NEW_WRITING', () => {
    const policy = getCivilDemandSourceCompatibilityPolicy();

    expect(policy.selectedDocumentType).toBe('demanda_ordinaria_civil');
    expect(policy.sourceRequired).toBe(false);
    expect(policy.acceptedSourceTypes).toEqual(CIVIL_SOURCE_TYPES);
    expect(CIVIL_DEMAND_SOURCE_COMPATIBILITY_RULES.demanda_ordinaria_civil).toBe(policy);
    expect(evaluateSourceOutputCompatibility({
      selectedDocumentType: 'demanda_ordinaria_civil',
      sourceDocuments: [],
    }, CIVIL_DEMAND_SOURCE_COMPATIBILITY_RULES)).toMatchObject({
      status: 'COMPATIBLE',
      sourceDocumentType: 'NO_SOURCE_DOCUMENT',
      sourceRequired: false,
    });
  });

  it('evalúa cada fuente por separado y REFERENCE no controla el output', () => {
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'demanda_ordinaria_civil',
      sourceDocuments: [
        source('civil-primary', 'CONTRATO_CIVIL', 'PRIMARY'),
        source('civil-support', 'COMUNICACION_CIVIL', 'SUPPORTING'),
        source('reference-only', 'DOCUMENTO_CIVIL_AUXILIAR', 'REFERENCE'),
      ],
    }, CIVIL_DEMAND_SOURCE_COMPATIBILITY_RULES);

    expect(result.status).toBe('COMPATIBLE');
    expect(result.sourceDocumentType).toBe('CONTRATO_CIVIL');
    expect(result.sources).toEqual([
      expect.objectContaining({ id: 'civil-primary', role: 'PRIMARY', controlsOutput: true, status: 'COMPATIBLE' }),
      expect.objectContaining({ id: 'civil-support', role: 'SUPPORTING', controlsOutput: true, status: 'COMPATIBLE' }),
      expect.objectContaining({ id: 'reference-only', role: 'REFERENCE', controlsOutput: false, status: 'REFERENCE_ONLY' }),
    ]);
  });

  it('normaliza role omitido como UNSPECIFIED y deja la evaluación en NEEDS_INPUT', () => {
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'demanda_ordinaria_civil',
      sourceDocuments: [source('role-pending', 'CONTRATO_CIVIL')],
    }, CIVIL_DEMAND_SOURCE_COMPATIBILITY_RULES);

    expect(result).toMatchObject({ status: 'NEEDS_INPUT' });
    expect(result.sources).toEqual([
      expect.objectContaining({ id: 'role-pending', role: 'UNSPECIFIED', status: 'NEEDS_INPUT', controlsOutput: false }),
    ]);
    expect(result.missingRequirements).toContain('source_role:role-pending');
  });

  it.each([
    ['labor-source', 'DEMANDA_LABORAL'],
    ['mercantile-source', 'DEMANDA_MERCANTIL'],
  ])('bloquea fuente incompatible %s sin convertirla en fuente civil', (id, sourceDocumentType) => {
    expect(() => evaluateSourceOutputCompatibility({
      selectedDocumentType: 'demanda_ordinaria_civil',
      sourceDocuments: [source(id, sourceDocumentType, 'PRIMARY')],
    }, CIVIL_DEMAND_SOURCE_COMPATIBILITY_RULES)).toThrowError(SourceDocumentIncompatibleError);
  });
});

describe('LOOP 8B FASE 2A — preflight civil', () => {
  it('bloquea datos manuales no confirmados y permite conservarlos como pendientes', () => {
    const context = buildCaseContext([], analysis(), undefined, {
      parties: {
        actor: { value: 'Actora pendiente sintética', confirmedByLawyer: false },
        demandado: { value: 'Demandada confirmada sintética', confirmedByLawyer: true },
      },
    });

    const result = runCivilDemandPreflight(context);

    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.missingFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'actor', status: 'REQUIRES_CONFIRMATION' }),
      expect.objectContaining({ id: 'facts', status: 'MISSING' }),
      expect.objectContaining({ id: 'claims', status: 'MISSING' }),
    ]));
  });

  it('rechaza una fuente laboral antes de evaluar la suficiencia del contexto civil', () => {
    const context = buildCaseContext(
      [source('labor-primary', 'DEMANDA_LABORAL', 'PRIMARY')],
      analysis(),
    );

    expect(runCivilDemandPreflight(context, [source('labor-primary', 'DEMANDA_LABORAL', 'PRIMARY')]).status)
      .toBe('SOURCE_DOCUMENT_INCOMPATIBLE');
  });
});
