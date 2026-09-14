import { describe, expect, it } from 'vitest';
import { DOCUMENT_TYPES } from '@/lib/legal-taxonomy';
import { resolveSelectedDocumentType } from '@/lib/legal-taxonomy/pipelineSelection';
import { buildDocumentSupportMatrix } from '@/lib/legal-engine/documentSupportMatrix';
import { classifyIntent } from '@/lib/legal-engine/classifier';
import { DocumentTemplates, resolveTemplateByExplicitLabel } from '@/lib/legal-engine/documentTemplates';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';

const VISIBLE_RESPONSE_IDS = [
  'contestacion_demanda_laboral',
  'contestacion_demanda_civil',
  'recurso_revision_amparo_directo',
  'contestacion_revision_extraordinaria_amparo_directo',
  'recurso_reclamacion',
  'incidente_procesal',
] as const;

const VISIBLE_MODAL_IDS = [
  'contestacion_demanda_laboral',
  'recurso_revision_amparo_directo',
  'recurso_queja',
  'demanda_amparo_directo',
  'demanda_amparo_indirecto',
  'escrito_cumplimiento_sentencia',
  'escrito_agravios',
] as const;

describe('Loop 4 — matriz universal de opciones visibles y routing', () => {
  it('clasifica todos los IDs del catálogo visible sin fallback jurídico silencioso', () => {
    const matrix = buildDocumentSupportMatrix();
    expect(matrix).toHaveLength(DOCUMENT_TYPES.length);
    expect(matrix.every((row) => row.canonicalId && row.label && row.status)).toBe(true);

    for (const row of matrix) {
      if (row.status === 'SUPPORTED') {
        expect(row.strategyId).toBe(row.canonicalId);
        expect(row.templateId).toBe(row.canonicalId);
        const routing = resolveDocumentRouting({ selectedDocumentType: row.canonicalId, sourceDocumentType: 'SENTENCIA_O_RESOLUCION' });
        expect(routing.resolvedStrategy).toBe(row.canonicalId);
        expect(routing.resolvedTemplate).toBe(row.canonicalId);
        expect(routing.fallbackUsed).toBe(false);
      }
      if (row.status === 'MISSING_TEMPLATE') {
        expect(() => resolveDocumentRouting({ selectedDocumentType: row.canonicalId })).toThrow(/MISSING_TEMPLATE_MAPPING/);
      }
      if (row.status === 'NOT_APPLICABLE') {
        expect(() => resolveDocumentRouting({ selectedDocumentType: row.canonicalId })).toThrow(/UNKNOWN_DOCUMENT_TYPE/);
      }
    }

    const free = matrix.find((row) => row.canonicalId === 'otro');
    expect(free?.status).toBe('LEGACY_SAFE_FALLBACK');
    expect(resolveDocumentRouting({ documentTypeLabel: 'Solicitud de concesión' }).resolvedTemplate).toBe('escrito_libre');
  });

  it('cubre las opciones reales de Contestaciones y del modal universal', () => {
    const rows = new Map(buildDocumentSupportMatrix().map((row) => [row.canonicalId, row]));
    for (const id of [...VISIBLE_RESPONSE_IDS, ...VISIBLE_MODAL_IDS]) {
      expect(rows.get(id), `ID visible sin inventario: ${id}`).toBeDefined();
      expect(rows.get(id)?.canonicalId).toBe(id);
    }
    expect(rows.get('contestacion_revision_extraordinaria_amparo_directo')).toMatchObject({
      strategyId: 'contestacion_revision_extraordinaria_amparo_directo',
      templateId: 'contestacion_revision_extraordinaria_amparo_directo',
      status: 'SUPPORTED',
    });
  });

  it('propaga el ID desde taxonomy a selectedDocumentType y deja Otro en fallback legacy', () => {
    expect(resolveSelectedDocumentType(undefined, { documentType: 'demanda_amparo_directo' })).toBe('demanda_amparo_directo');
    expect(resolveSelectedDocumentType('contestacion_revision_extraordinaria_amparo_directo', { documentType: 'demanda_amparo_directo' }))
      .toBe('contestacion_revision_extraordinaria_amparo_directo');
    expect(resolveSelectedDocumentType(undefined, { documentType: 'otro' })).toBeUndefined();
    expect(resolveSelectedDocumentType(undefined, { documentType: 'otra' })).toBeUndefined();
    expect(Object.keys(DocumentTemplates)).toContain('contestacion_revision_extraordinaria_amparo_directo');
  });

  it('clasifica y resuelve el alias visible de la estrategia post-sentencia sin caer en demanda', () => {
    const classification = classifyIntent('Preparar la Contestación / Revisión extraordinaria de Amparo Directo.');
    expect(classification.documentType).toBe('contestacion_revision_extraordinaria_amparo_directo');
    expect(resolveTemplateByExplicitLabel('Contestación / Revisión extraordinaria de Amparo Directo')?.tipo)
      .toBe('contestacion_revision_extraordinaria_amparo_directo');
  });
});
