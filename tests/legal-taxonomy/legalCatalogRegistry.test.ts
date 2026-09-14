import { describe, expect, it } from 'vitest';
import {
  CANONICAL_DOCUMENT_TYPES,
  DOCUMENT_FAMILIES,
  LEGACY_DOCUMENT_IDENTIFIER_IDS,
  LEGAL_AREAS,
  LEGAL_CATALOG_REGISTRY,
  getCatalogDocument,
  getCatalogStats,
  getLegacyMatters,
  searchCatalog,
} from '@/lib/catalog/legalCatalog';
import { DOCUMENT_TYPES } from '@/lib/legal-taxonomy';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { DocumentTemplates } from '@/lib/legal-engine/documentTemplates';
import { getSourceOutputCompatibilityPolicy } from '@/lib/legal-engine/sourceOutputCompatibility';

const EXPECTED_LEGACY_IDS = [
  'demanda',
  'contestacion_demanda',
  'reconvencion',
  'ampliacion',
  'replica',
  'duplica',
  'incidente',
  'recurso',
  'apelacion',
  'revocacion',
  'queja',
  'reclamacion',
  'amparo_directo',
  'amparo_indirecto',
  'agravios',
  'alegatos',
  'promocion',
  'solicitud',
  'escrito_libre',
  'recurso_queja',
  'recurso_reclamacion',
  'recurso_revision',
  'recurso_administrativo',
  'recurso_revision_amparo_directo',
  'demanda_amparo_indirecto',
  'demanda_amparo_directo',
  'contestacion_demanda_laboral',
  'contestacion_demanda_civil',
  'escrito_cumplimiento_sentencia',
  'contestacion_revision_extraordinaria_amparo_directo',
  'escrito_agravios',
  'incidente_procesal',
  'otro',
] as const;

describe('LOOP 7 — registry jurídico jerárquico', () => {
  it('declara exactamente 20 áreas canónicas', () => {
    expect(LEGAL_AREAS).toHaveLength(20);
    expect(new Set(LEGAL_AREAS.map((area) => area.id)).size).toBe(20);
  });

  it('mantiene un inventario documental único de 305 identificadores', () => {
    const stats = getCatalogStats();
    expect(stats.coveredDocumentIdentifierCount).toBe(305);
    expect(stats.proposedDocumentIdentifierCount).toBe(278);
    expect(stats.legacyDocumentIdentifierCount).toBe(33);
    expect(new Set(LEGACY_DOCUMENT_IDENTIFIER_IDS).size).toBe(33);
    expect(new Set(LEGAL_CATALOG_REGISTRY.documentIdentifiers.map((entry) => entry.id)).size).toBe(305);
  });

  it('proyecta los 33 IDs legacy sin eliminar ninguno', () => {
    expect(DOCUMENT_TYPES.map((definition) => definition.value)).toEqual([...EXPECTED_LEGACY_IDS]);
    expect(LEGACY_DOCUMENT_IDENTIFIER_IDS).toEqual([...EXPECTED_LEGACY_IDS]);
  });

  it('mantiene referencias válidas de área, procedimiento y familia', () => {
    const areas = new Set(LEGAL_AREAS.map((area) => area.id));
    const procedures = new Set(LEGAL_CATALOG_REGISTRY.procedures.map((procedure) => procedure.id));
    const families = new Set(DOCUMENT_FAMILIES.map((family) => family.id));

    for (const document of CANONICAL_DOCUMENT_TYPES) {
      expect(areas.has(document.areaId), document.id).toBe(true);
      expect(procedures.has(document.procedureId), document.id).toBe(true);
      expect(families.has(document.familyId), document.id).toBe(true);
      expect(document.description, document.id).toBeTruthy();
      expect(document.status, document.id).toBeTruthy();
      expect(document.jurisdiction, document.id).toBeTruthy();
      expect(document.legalStage, document.id).toBeTruthy();
      expect(document.partyRole, document.id).toBeTruthy();
    }
  });

  it('hace cumplir que IMPLEMENTED tenga strategy, template y source compatibility', () => {
    for (const document of CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.status === 'IMPLEMENTED')) {
      expect(document.implemented, document.id).toBe(true);
      expect(document.strategyId, document.id).toBeTruthy();
      expect(document.templateId, document.id).toBeTruthy();
      expect(document.sourceCompatibility, document.id).not.toBeNull();
    }
  });

  it('no asigna strategy/template generable a catálogo, formularios o borradores asistidos', () => {
    for (const document of CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.status !== 'IMPLEMENTED')) {
      expect(document.implemented, document.id).toBe(false);
      expect(document.strategyId, document.id).toBeNull();
      expect(document.templateId, document.id).toBeNull();
    }
  });

  it('conserva otro como alias legacy a escrito_libre y no como output nuevo', () => {
    const other = getCatalogDocument('otro');
    expect(other?.kind).toBe('LEGACY_ALIAS');
    if (other?.kind === 'LEGACY_ALIAS') expect(other.targetId).toBe('escrito_libre');
  });

  it('conserva contestación civil y mercantil como outputs canónicos separados', () => {
    const mercantile = getCatalogDocument('contestacion_demanda_mercantil');
    expect(mercantile?.kind).toBe('DOCUMENT_TYPE');
    expect(CANONICAL_DOCUMENT_TYPES.some((entry) => entry.id === 'contestacion_demanda_mercantil')).toBe(true);
    expect(resolveDocumentRouting({ selectedDocumentType: 'contestacion_demanda_mercantil' }).resolvedTemplate).toBe('contestacion_demanda_mercantil');
    expect(getSourceOutputCompatibilityPolicy('contestacion_demanda_mercantil').selectedDocumentType).toBe('contestacion_demanda_mercantil');
  });

  it('trata familias genéricas como no generables', () => {
    for (const id of ['recurso', 'incidente', 'amparo_directo', 'amparo_indirecto', 'promocion']) {
      expect(getCatalogDocument(id)?.kind, id).toBe('FAMILY');
      expect(getCatalogDocument(id)?.status, id).toBe('NOT_APPLICABLE');
    }
  });

  it('normaliza el ID con acento sin crear un duplicado', () => {
    expect(getCatalogDocument('señalamiento_correo')?.id).toBe('senalamiento_correo');
    expect(getCatalogDocument('senalamiento_correo')?.id).toBe('senalamiento_correo');
  });

  it('busca por nombre, alias o ID y devuelve cada canonical ID una sola vez', () => {
    const results = searchCatalog('contestación laboral');
    const ids = results.map((result) => result.id);
    expect(ids).toContain('contestacion_demanda_laboral');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('presenta el output mercantil una sola vez y no crea un alias duplicado', () => {
    const results = searchCatalog('contestacion_demanda_mercantil');
    const canonicalResult = results.find((result) => result.id === 'contestacion_demanda_mercantil');

    expect(canonicalResult?.kind).toBe('DOCUMENT_TYPE');
    expect(canonicalResult?.label).toBe('Contestación de Demanda Mercantil');
    expect(canonicalResult?.status).toBe('IMPLEMENTED');
    expect(canonicalResult?.areaId).toBe('mercantil');
    expect(canonicalResult?.procedureId).toBe('mercantil_juicio');
    expect(canonicalResult?.familyId).toBe('mercantil_demandas');
    expect(results.filter((result) => result.id === 'contestacion_demanda_mercantil')).toHaveLength(1);
  });

  it('proyecta la materia legacy Otro una sola vez', () => {
    const otherEntries = getLegacyMatters().filter((matter) => matter.value === 'otro');

    expect(otherEntries).toHaveLength(1);
  });

  it('clasifica resultados del catálogo como navegación, selección o bloqueo', async () => {
    const navigatorModule = await import('@/components/legal-taxonomy/LegalCatalogNavigator') as unknown as {
      getCatalogResultAction?: (entry: { id: string; kind: string; status: string }) => string;
    };

    expect(navigatorModule.getCatalogResultAction).toBeDefined();
    expect(navigatorModule.getCatalogResultAction?.({ id: 'civil_demandas', kind: 'FAMILY', status: 'NOT_APPLICABLE' })).toBe('NAVIGATE');
    expect(navigatorModule.getCatalogResultAction?.({ id: 'contestacion_demanda_civil', kind: 'DOCUMENT_TYPE', status: 'IMPLEMENTED' })).toBe('SELECT');
    expect(navigatorModule.getCatalogResultAction?.({ id: 'demanda_ordinaria_civil', kind: 'DOCUMENT_TYPE', status: 'IMPLEMENTED' })).toBe('SELECT');
  });

  it('mantiene contratos estructurales y IDs canónicos seguros', () => {
    const areaIds = new Set(LEGAL_AREAS.map((area) => area.id));
    const procedureIds = new Set(LEGAL_CATALOG_REGISTRY.procedures.map((procedure) => procedure.id));
    const familyIds = new Set(DOCUMENT_FAMILIES.map((family) => family.id));
    const idPattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

    expect(new Set(LEGAL_CATALOG_REGISTRY.procedures.map((procedure) => procedure.id)).size).toBe(LEGAL_CATALOG_REGISTRY.procedures.length);
    expect(new Set(DOCUMENT_FAMILIES.map((family) => family.id)).size).toBe(DOCUMENT_FAMILIES.length);
    expect(new Set(CANONICAL_DOCUMENT_TYPES.map((document) => document.id)).size).toBe(CANONICAL_DOCUMENT_TYPES.length);
    for (const procedure of LEGAL_CATALOG_REGISTRY.procedures) expect(areaIds.has(procedure.areaId), procedure.id).toBe(true);
    for (const family of DOCUMENT_FAMILIES) {
      expect(areaIds.has(family.areaId), family.id).toBe(true);
      expect(procedureIds.has(family.procedureId), family.id).toBe(true);
    }
    for (const document of CANONICAL_DOCUMENT_TYPES) {
      expect(idPattern.test(document.id), document.id).toBe(true);
      expect(familyIds.has(document.familyId), document.id).toBe(true);
    }
  });

  it('bloquea familias no generables y tipos de catálogo antes de generar', () => {
    for (const family of LEGAL_CATALOG_REGISTRY.documentIdentifiers.filter((entry) => entry.kind === 'FAMILY')) {
      if (!DocumentTemplates[family.id]) {
        expect(() => resolveDocumentRouting({ selectedDocumentType: family.id }), family.id).toThrow();
      } else {
        expect(resolveDocumentRouting({ selectedDocumentType: family.id }).resolvedTemplate, family.id).toBe(family.id);
      }
    }
    for (const document of CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.status !== 'IMPLEMENTED')) {
      expect(() => resolveDocumentRouting({ selectedDocumentType: document.id }), document.id).toThrow(/DOCUMENT_TYPE_NOT_IMPLEMENTED/);
    }
  });
});
