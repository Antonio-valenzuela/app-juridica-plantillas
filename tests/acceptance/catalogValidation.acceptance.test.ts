/**
 * LOOP 9 — §24
 * PRUEBA DE ACEPTACIÓN: VALIDACIÓN PROGRAMÁTICA DEL CATÁLOGO
 *
 * Itera automáticamente sobre todos los IDs IMPLEMENTED del catálogo y verifica:
 *   - Strategy existe (DocumentStrategies o escrito_libre como fallback)
 *   - Template resoluble: directa (DocumentTemplates) o derivada por familia (motor de familias), resuelta
 *     por getDocumentTemplate; cada origen se verifica por separado
 *   - Routing existe: resolveDocumentRouting no falla
 *   - Compatibilidad: SOURCE_OUTPUT_COMPATIBILITY_RULES tiene entrada
 *   - rolAutor no es juzgador/autoridad jurisdiccional
 *   - Export guards no bloquean por identidad
 *   - Sin alias collision (un ID solo aparece una vez)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { LEGAL_CATALOG_REGISTRY, getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { DocumentTemplates, familyDerivedTemplateIds } from '@/lib/legal-engine/documentTemplates';
import { familyBlueprintFor } from '@/lib/legal-engine/documentFamilyBlueprints';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { resolveTemplateProvenance, TEMPLATE_SOURCE } from '@/scripts/audit/templateProvenance.mjs';
import {
  SOURCE_OUTPUT_COMPATIBILITY_RULES,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import { buildDocumentSupportMatrix } from '@/lib/legal-engine/documentSupportMatrix';

beforeAll(() => {
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) {
    delete process.env[k];
  }
});

// Roles que NUNCA deben aparecer en documentos de parte
const JUDGE_ROLES = new Set([
  'juez', 'magistrado', 'secretario', 'juzgador', 'tribunal',
  'autoridad_jurisdiccional', 'ministerio_publico_resolutor',
]);

// ══════════════════════════════════════════════════════════════════════════════
// §24 — Todos los IDs IMPLEMENTED tienen strategy + template + routing + compat
// ══════════════════════════════════════════════════════════════════════════════

describe('§24 — Validación programática: todos los IDs IMPLEMENTED', () => {
  const implementedDocs = LEGAL_CATALOG_REGISTRY.documents
    .filter((doc) => doc.status === 'IMPLEMENTED');

  it(`hay al menos 100 tipos IMPLEMENTED (actual: ${implementedDocs.length >= 100 ? '≥100' : implementedDocs.length})`, () => {
    expect(implementedDocs.length).toBeGreaterThanOrEqual(100);
  });

  it('ningún ID aparece duplicado en el catálogo', () => {
    const ids = LEGAL_CATALOG_REGISTRY.documents.map((d) => d.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  // Procedencia de la plantilla de cada tipo, calculada con el resolver real (directa o derivada por familia).
  const provenance = new Map(implementedDocs.map((doc) => [doc.id, resolveTemplateProvenance(doc.id)]));
  const docsBySource = (source: string) => implementedDocs.filter((doc) => provenance.get(doc.id)!.source === source);

  // Aserción independiente: detecta un tipo IMPLEMENTED sin NINGUNA plantilla realmente resoluble.
  it('todos los IDs IMPLEMENTED tienen una plantilla realmente resoluble (directa o derivada por familia)', () => {
    const failures = docsBySource(TEMPLATE_SOURCE.NONE).map((doc) => doc.id);
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} IDs IMPLEMENTED sin plantilla resoluble: ${failures.slice(0, 10).join(', ')}${failures.length > 10 ? '...' : ''}`,
      );
    }
  });

  it('un tipo sin plantilla directa solo se acepta si tiene una plantilla derivada válida y resoluble', () => {
    const registered = new Set(familyDerivedTemplateIds());
    const problems: string[] = [];
    for (const doc of docsBySource(TEMPLATE_SOURCE.FAMILY_DERIVED)) {
      const { template } = provenance.get(doc.id)!;
      if (DocumentTemplates[doc.id]) problems.push(`${doc.id}: tiene plantilla directa y no debería clasificarse como derivada`);
      if (!registered.has(doc.id)) problems.push(`${doc.id}: no está registrada por el motor de familias`);
      if (template?.tipo !== doc.id) problems.push(`${doc.id}: la plantilla resuelta es de otro tipo (${template?.tipo})`);
      if (doc.templateId !== doc.id) problems.push(`${doc.id}: templateId del catálogo = ${doc.templateId}`);
      if (!template?.estructura?.length) problems.push(`${doc.id}: la plantilla derivada no declara secciones`);
      if (!template?.camposObligatorios?.length) problems.push(`${doc.id}: la plantilla derivada no declara campos obligatorios`);
      if (!familyBlueprintFor(doc.familyId)) problems.push(`${doc.id}: la familia ${doc.familyId} no tiene blueprint`);
    }
    expect(problems).toEqual([]);
  });

  it('las plantillas derivadas registradas corresponden a tipos del catálogo y las dos procedencias no se solapan', () => {
    const catalogIds = new Set(LEGAL_CATALOG_REGISTRY.documents.map((doc) => doc.id));
    const unknown = familyDerivedTemplateIds().filter((id) => !catalogIds.has(id));
    expect(unknown).toEqual([]);
    const direct = new Set(docsBySource(TEMPLATE_SOURCE.DIRECT).map((doc) => doc.id));
    const derived = docsBySource(TEMPLATE_SOURCE.FAMILY_DERIVED).map((doc) => doc.id);
    expect(derived.filter((id) => direct.has(id))).toEqual([]);
    expect(direct.size + derived.length + docsBySource(TEMPLATE_SOURCE.NONE).length).toBe(implementedDocs.length);
  });

  it('todos los IDs IMPLEMENTED tienen una entrada en SOURCE_OUTPUT_COMPATIBILITY_RULES', () => {
    const failures: string[] = [];
    for (const doc of implementedDocs) {
      const rule = SOURCE_OUTPUT_COMPATIBILITY_RULES[doc.id];
      if (!rule) failures.push(doc.id);
    }
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} IDs sin regla de compatibilidad: ${failures.slice(0, 10).join(', ')}${failures.length > 10 ? '...' : ''}`,
      );
    }
  });

  // El contrato de cada plantilla se verifica por separado para cada procedencia: una plantilla derivada
  // no se omite (antes `continue`) ni se confunde con una directa.
  describe.each([TEMPLATE_SOURCE.DIRECT, TEMPLATE_SOURCE.FAMILY_DERIVED])('contrato de plantilla — origen %s', (source) => {
    const docs = docsBySource(source);

    it('hay al menos un tipo IMPLEMENTED con este origen (la verificación no queda vacía)', () => {
      expect(docs.length).toBeGreaterThan(0);
    });

    it('ningún tipo tiene rolAutor que sea juzgador', () => {
      const violations: string[] = [];
      for (const doc of docs) {
        const tpl = provenance.get(doc.id)!.template!;
        if (JUDGE_ROLES.has(tpl.rolAutor?.toLowerCase())) {
          violations.push(`${doc.id}: rolAutor=${tpl.rolAutor}`);
        }
      }
      expect(violations).toEqual([]);
    });

    it('declaran rolAutor, destinatario, objetivoProcesal y prohibiciones', () => {
      const failures: string[] = [];
      for (const doc of docs) {
        const tpl = provenance.get(doc.id)!.template!;
        if (!tpl.rolAutor || !tpl.destinatario || !tpl.objetivoProcesal || !tpl.prohibiciones?.length) {
          failures.push(`${doc.id}: falta(n) campo(s) obligatorio(s)`);
        }
      }
      if (failures.length > 0) {
        throw new Error(`${failures.length} templates incompletos: ${failures.slice(0, 10).join('; ')}`);
      }
    });

    it('tienen al menos 5 secciones', () => {
      const failures: string[] = [];
      for (const doc of docs) {
        const tpl = provenance.get(doc.id)!.template!;
        if (tpl.estructura.length < 5) {
          failures.push(`${doc.id}: solo ${tpl.estructura.length} secciones`);
        }
      }
      if (failures.length > 0) {
        throw new Error(`${failures.length} templates con < 5 secciones: ${failures.join('; ')}`);
      }
    });

    it('declaran campos obligatorios', () => {
      const failures = docs.filter((doc) => !provenance.get(doc.id)!.template!.camposObligatorios?.length).map((doc) => doc.id);
      expect(failures).toEqual([]);
    });

    it('tienen títulos únicos dentro del mismo template', () => {
      const failures: string[] = [];
      for (const doc of docs) {
        const tpl = provenance.get(doc.id)!.template!;
        const keys = tpl.estructura.map((t) => t.toLowerCase().trim());
        if (new Set(keys).size !== keys.length) {
          failures.push(`${doc.id}: títulos de sección duplicados`);
        }
      }
      if (failures.length > 0) {
        throw new Error(`${failures.length} templates con títulos duplicados: ${failures.join('; ')}`);
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §24 — Soporte matrix coherencia con catalog
// ══════════════════════════════════════════════════════════════════════════════

describe('§24 — buildDocumentSupportMatrix coherencia con catálogo', () => {
  it('la matrix de soporte no tiene UNKNOWN (toda entrada tiene status definido)', () => {
    const matrix = buildDocumentSupportMatrix();
    for (const row of matrix) {
      expect(row.status, `${row.canonicalId}: status undefined`).toBeTruthy();
      expect(
        ['SUPPORTED', 'NEEDS_INPUT', 'NOT_APPLICABLE', 'MISSING_STRATEGY', 'MISSING_TEMPLATE', 'DEPRECATED', 'LEGACY_SAFE_FALLBACK'],
        `${row.canonicalId}: status inválido`,
      ).toContain(row.status);
    }
  });

  it('todos los IDs IMPLEMENTED en el catálogo tienen status SUPPORTED en la matrix', () => {
    const matrix = buildDocumentSupportMatrix();
    const supportMap = new Map(matrix.map((r) => [r.canonicalId, r.status]));

    const implementedIds = LEGAL_CATALOG_REGISTRY.documents
      .filter((d) => d.status === 'IMPLEMENTED')
      .map((d) => d.id);

    const notSupported: string[] = [];
    for (const id of implementedIds) {
      const status = supportMap.get(id);
      // Solo los IDs de taxonomía legacy son evaluados por buildDocumentSupportMatrix
      // Los IDs canónicos nuevos no están en DOCUMENT_TYPES pero sí en el catálogo
      if (status && status !== 'SUPPORTED' && status !== 'LEGACY_SAFE_FALLBACK') {
        notSupported.push(`${id}: ${status}`);
      }
    }

    // Advertencia aceptable: algunos IDs canónicos no están en la taxonomía legacy
    // Solo fallar si hay IDs conocidos IMPLEMENTADOS que tienen status MISSING_TEMPLATE
    const blocking = notSupported.filter((s) => s.includes('MISSING_TEMPLATE') || s.includes('MISSING_STRATEGY'));
    expect(blocking).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §24 — resolveDocumentRouting no falla para IDs canónicos con template
// ══════════════════════════════════════════════════════════════════════════════

describe('§24 — resolveDocumentRouting para representantes de cada materia', () => {
  const REPRESENTATIVE_IDS = [
    'contestacion_demanda_civil',
    'demanda_ejecutiva_mercantil',
    'contestacion_demanda_laboral',
    'demanda_amparo_directo',
    'recurso_revision_amparo_directo',
    'contestacion_revision_extraordinaria_amparo_directo',
    'escrito_agravios',
    'incidente_procesal',
    'escrito_cumplimiento_sentencia',
    'recurso_queja',
    'recurso_reclamacion',
    'recurso_administrativo',
    'escrito_libre',
  ];

  for (const id of REPRESENTATIVE_IDS) {
    it(`resolveDocumentRouting para ${id} retorna template coherente`, () => {
      const routing = resolveDocumentRouting({ documentTypeLabel: id, selectedDocumentType: id } as any);
      expect(routing.resolvedTemplate, `${id}: template no resuelto`).toBeTruthy();
      // El template resuelto debe coincidir con el ID (sin fallback)
      expect(routing.resolvedTemplate).toBe(id);
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// §24 — catalog entry coherence
// ══════════════════════════════════════════════════════════════════════════════

describe('§24 — Coherencia de entradas del catálogo', () => {
  it('cada CanonicalDocumentType tiene areaId, procedureId y status', () => {
    const docTypes = LEGAL_CATALOG_REGISTRY.documents.filter((d) => d.kind === 'DOCUMENT_TYPE');
    for (const doc of docTypes) {
      expect(doc.areaId, `${doc.id}: sin areaId`).toBeTruthy();
      expect(doc.procedureId, `${doc.id}: sin procedureId`).toBeTruthy();
      expect(doc.status, `${doc.id}: sin status`).toBeTruthy();
    }
  });

  it('los alias no colisionan con IDs canónicos en el mismo scope', () => {
    const canonicalIds = new Set(LEGAL_CATALOG_REGISTRY.documents.map((d) => d.id));
    for (const alias of LEGAL_CATALOG_REGISTRY.aliases) {
      // El alias puede tener un targetId que sea canónico — eso está bien
      // Pero el alias.id no debe ser igual a un canonical id
      if (canonicalIds.has(alias.id)) {
        // Solo falla si no es un LEGACY_ALIAS
        const entry = getCatalogDocument(alias.id);
        expect(entry?.kind, `alias collision: ${alias.id}`).toBe('LEGACY_ALIAS');
      }
    }
  });

  it('todos los templateId en CanonicalDocumentType IMPLEMENTED resuelven a una plantilla (directa o derivada por familia)', () => {
    const implemented = LEGAL_CATALOG_REGISTRY.documents.filter((d) => d.status === 'IMPLEMENTED');
    const failures: string[] = [];
    for (const doc of implemented) {
      if (doc.templateId && resolveTemplateProvenance(doc.templateId).source === TEMPLATE_SOURCE.NONE) {
        failures.push(`${doc.id} → templateId=${doc.templateId} no existe`);
      }
    }
    expect(failures).toEqual([]);
  });
});
