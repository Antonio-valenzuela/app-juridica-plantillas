import { describe, expect, it } from 'vitest';
import { DOCUMENT_TYPES } from '@/lib/legal-taxonomy';
import { buildDocumentSupportMatrix } from '@/lib/legal-engine/documentSupportMatrix';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import {
  DOCUMENT_TYPE_NOT_IMPLEMENTED,
  MISSING_SOURCE_COMPATIBILITY_RULE,
  SOURCE_OUTPUT_COMPATIBILITY_RULES,
  evaluateSourceOutputCompatibility,
  getSourceOutputCompatibilityPolicy,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';

import { LEGAL_CATALOG_REGISTRY } from '@/lib/catalog/legalCatalog';

const EXPECTED_STATUS: Record<string, string> = {
  demanda: 'EXPLICIT_COMPATIBILITY',
  contestacion_demanda: 'EXPLICIT_COMPATIBILITY',
  reconvencion: 'UNSUPPORTED_DOCUMENT_TYPE',
  ampliacion: 'UNSUPPORTED_DOCUMENT_TYPE',
  replica: 'EXPLICIT_COMPATIBILITY',
  duplica: 'EXPLICIT_COMPATIBILITY',
  incidente: 'UNSUPPORTED_DOCUMENT_TYPE',
  recurso: 'UNSUPPORTED_DOCUMENT_TYPE',
  apelacion: 'UNSUPPORTED_DOCUMENT_TYPE',
  revocacion: 'UNSUPPORTED_DOCUMENT_TYPE',
  queja: 'UNSUPPORTED_DOCUMENT_TYPE',
  reclamacion: 'UNSUPPORTED_DOCUMENT_TYPE',
  amparo_directo: 'UNSUPPORTED_DOCUMENT_TYPE',
  amparo_indirecto: 'UNSUPPORTED_DOCUMENT_TYPE',
  agravios: 'UNSUPPORTED_DOCUMENT_TYPE',
  alegatos: 'UNSUPPORTED_DOCUMENT_TYPE',
  promocion: 'UNSUPPORTED_DOCUMENT_TYPE',
  solicitud: 'UNSUPPORTED_DOCUMENT_TYPE',
  escrito_libre: 'ACCEPTS_ANY_SOURCE_INTENTIONALLY',
  recurso_queja: 'EXPLICIT_COMPATIBILITY',
  recurso_reclamacion: 'EXPLICIT_COMPATIBILITY',
  recurso_revision: 'UNSUPPORTED_DOCUMENT_TYPE',
  recurso_administrativo: 'EXPLICIT_COMPATIBILITY',
  recurso_revision_amparo_directo: 'EXPLICIT_COMPATIBILITY',
  demanda_amparo_indirecto: 'EXPLICIT_COMPATIBILITY',
  demanda_amparo_directo: 'EXPLICIT_COMPATIBILITY',
  contestacion_demanda_laboral: 'EXPLICIT_COMPATIBILITY',
  contestacion_demanda_civil: 'EXPLICIT_COMPATIBILITY',
  contestacion_demanda_mercantil: 'EXPLICIT_COMPATIBILITY',
  escrito_cumplimiento_sentencia: 'EXPLICIT_COMPATIBILITY',
  contestacion_revision_extraordinaria_amparo_directo: 'EXPLICIT_COMPATIBILITY',
  escrito_agravios: 'EXPLICIT_COMPATIBILITY',
  incidente_procesal: 'EXPLICIT_COMPATIBILITY',
  demanda_ejecutiva_mercantil: 'EXPLICIT_COMPATIBILITY',
  otro: 'ACCEPTS_ANY_SOURCE_INTENTIONALLY',
};

function syntheticSource(sourceDocumentType: string, text = 'Fuente jurídica sintética.') {
  return createSourceDocument({
    id: `synthetic-${sourceDocumentType.toLowerCase()}`,
    filename: `${sourceDocumentType.toLowerCase()}.pdf`,
    sourceValidated: true,
    content: text,
    classification: { sourceDocumentType },
  });
}

describe('registry source → output para los 33 tipos canónicos', () => {
  const implementedCanonicalIds = LEGAL_CATALOG_REGISTRY.documents
    .filter((entry) => entry.status === 'IMPLEMENTED')
    .map((entry) => entry.id);

  const compatibilityIds = Array.from(new Set([
    ...DOCUMENT_TYPES.map((definition) => definition.value),
    ...implementedCanonicalIds,
  ]));

  it('clasifica exactamente cada ID una sola vez y no deja MISSING_COMPATIBILITY_RULE', () => {
    expect(DOCUMENT_TYPES).toHaveLength(33);
    expect(Object.keys(SOURCE_OUTPUT_COMPATIBILITY_RULES)).toHaveLength(compatibilityIds.length);
    expect(new Set(Object.keys(SOURCE_OUTPUT_COMPATIBILITY_RULES)).size).toBe(compatibilityIds.length);
    expect(new Set(Object.keys(SOURCE_OUTPUT_COMPATIBILITY_RULES))).toEqual(
      new Set(compatibilityIds),
    );

    for (const definition of DOCUMENT_TYPES) {
      expect(SOURCE_OUTPUT_COMPATIBILITY_RULES[definition.value]?.status).toBe(EXPECTED_STATUS[definition.value]);
    }

    expect((Object.values(SOURCE_OUTPUT_COMPATIBILITY_RULES) as Array<{ status: string }>)
      .some((rule) => rule.status === 'MISSING_COMPATIBILITY_RULE')).toBe(false);

    const counts = Object.values(SOURCE_OUTPUT_COMPATIBILITY_RULES).reduce<Record<string, number>>((acc, rule) => {
      acc[rule.status] = (acc[rule.status] || 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({
      EXPLICIT_COMPATIBILITY: compatibilityIds.length - 20,
      ACCEPTS_ANY_SOURCE_INTENTIONALLY: 5,
      UNSUPPORTED_DOCUMENT_TYPE: 15,
    });
  });

  it('coincide con el registry real de strategy/template y no inventa soporte', () => {
    const support = new Map(buildDocumentSupportMatrix().map((row) => [row.canonicalId, row]));

    for (const definition of DOCUMENT_TYPES) {
      const policy = SOURCE_OUTPUT_COMPATIBILITY_RULES[definition.value];
      const row = support.get(definition.value)!;
      if (row.status === 'SUPPORTED' || row.status === 'LEGACY_SAFE_FALLBACK') {
        expect(policy).toBeDefined();
      } else {
        expect(policy.status).toBe('UNSUPPORTED_DOCUMENT_TYPE');
      }
    }
  });

  it('aplica default-deny si un tipo generable pierde su regla', () => {
    expect(() => getSourceOutputCompatibilityPolicy('contestacion_demanda_laboral', {})).toThrowError(
      expect.objectContaining({ code: MISSING_SOURCE_COMPATIBILITY_RULE }),
    );
  });

  it('bloquea un tipo canónico sin strategy/template con DOCUMENT_TYPE_NOT_IMPLEMENTED', async () => {
    expect(() => evaluateSourceOutputCompatibility({
      selectedDocumentType: 'reconvencion',
      sourceDocuments: [],
    })).toThrowError(expect.objectContaining({ code: DOCUMENT_TYPE_NOT_IMPLEMENTED }));

    await expect(runGenerationPipeline({
      selectedDocumentType: 'reconvencion',
      userInstruction: 'Preparar una reconvención sintética.',
      sourceDocuments: [],
    })).rejects.toMatchObject({ code: DOCUMENT_TYPE_NOT_IMPLEMENTED });
  });

  it('declara compatibilidad explícita para una contestación laboral', () => {
    const policy = getSourceOutputCompatibilityPolicy('contestacion_demanda_laboral');
    expect(policy.status).toBe('EXPLICIT_COMPATIBILITY');
    expect(policy.sourceRequired).toBe(true);
    expect(policy.acceptedSourceTypes).toEqual(expect.arrayContaining([
      'DEMANDA_LABORAL',
      'ESCRITO_INICIAL_LABORAL',
    ]));

    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_laboral',
      sourceDocuments: [syntheticSource('DEMANDA_LABORAL')],
    });
    expect(result.status).toBe('COMPATIBLE');
    expect(result.compatibilityStatus).toBe('EXPLICIT_COMPATIBILITY');
  });

  it('trata una fuente no clasificada como pendiente, no como compatibilidad ni incompatibilidad inventada', () => {
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'recurso_queja',
      sourceDocuments: [createSourceDocument({
        id: 'synthetic-unclassified-source',
        filename: 'source-sintetica.pdf',
        sourceValidated: true,
        content: 'Texto jurídico sin clasificación suficiente.',
      })],
    });

    expect(result).toMatchObject({
      status: 'NEEDS_INPUT',
      code: 'SOURCE_TYPE_UNKNOWN',
      sourceDocumentType: 'DOCUMENTO_JURIDICO_NO_CLASIFICADO',
    });
  });

  it('mantiene escrito_libre y otro como rutas genéricas intencionales', () => {
    expect(getSourceOutputCompatibilityPolicy('escrito_libre').status).toBe('ACCEPTS_ANY_SOURCE_INTENTIONALLY');
    expect(getSourceOutputCompatibilityPolicy('otro').status).toBe('ACCEPTS_ANY_SOURCE_INTENTIONALLY');
    expect(SOURCE_OUTPUT_COMPATIBILITY_RULES).toHaveProperty('contestacion_demanda_mercantil');
    expect(getSourceOutputCompatibilityPolicy('contestacion_demanda_mercantil').acceptedSourceTypes)
      .toEqual(expect.arrayContaining(['DEMANDA_MERCANTIL']));
    expect(resolveDocumentRouting({ documentTypeLabel: 'Solicitud sintética' }).resolvedTemplate).toBe('escrito_libre');
  });
});
