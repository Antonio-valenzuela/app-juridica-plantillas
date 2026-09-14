import { afterEach, describe, expect, it, vi } from 'vitest';
import { markDocumentAsFinal, markDocumentEntity, readDocumentEntityKind } from '@/lib/legal-engine/documentLifecycle';
import {
  markTemplateAsSystem,
  markTemplateAsTestDemo,
  markTemplateAsUserOwned,
} from '@/lib/templates/templateOrigin';
import type { ProfessionalTemplate, TemplateStructure } from '@/lib/templates/templateTypes';
import * as store from '@/lib/templates/customTemplateStore';

const STORAGE_KEY = 'juridico_custom_templates';

type MemoryStorage = Storage & { writes: string[] };

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>();
  const storage = {
    writes: [],
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
      storage.writes.push(`${key}:${String(value)}`);
    },
  } as MemoryStorage;

  return storage;
}

function installBrowserStorage() {
  const storage = createMemoryStorage();
  Object.assign(globalThis, { localStorage: storage, window: { localStorage: storage } });
  return storage;
}

function template(id = 'template'): ProfessionalTemplate {
  return {
    id,
    title: `Plantilla ${id}`,
    category: 'General',
    description: 'Plantilla de prueba',
    legalBasis: 'Por definir',
    applicableLaws: [],
    warnings: [],
    disclaimer: 'Requiere revisión profesional.',
    exportFormats: ['docx'],
    structureJson: markTemplateAsUserOwned({ kind: 'personal-template' }) as ProfessionalTemplate['structureJson'],
    sections: [],
    originalText: '{{expediente}}',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('customTemplateStore: aislamiento del caché local', () => {
  it('las fábricas de plantilla devuelven una plantilla explícita reconocible', () => {
    const structure: TemplateStructure = {
      nombre: 'Plantilla de prueba',
      tipo_documento: 'documento_juridico',
      campos: [],
    };

    const fromStructure = store.buildTemplateFromStructure(
      'Plantilla estructurada',
      'General',
      'Por definir',
      structure,
      '{{expediente}}',
      'DOCUMENTO_TEST_001.pdf',
    );
    const fromText = store.createTemplateFromText(
      'Plantilla textual',
      'General',
      'Por definir',
      '{{expediente}}',
    );

    expect(readDocumentEntityKind(fromStructure)).toBe('TEMPLATE');
    expect(readDocumentEntityKind(fromStructure.structureJson)).toBe('TEMPLATE');
    expect(readDocumentEntityKind(fromText)).toBe('TEMPLATE');
    expect(readDocumentEntityKind(fromText.structureJson)).toBe('TEMPLATE');
  });

  it('conserva únicamente la plantilla explícita y reescribe una vez el storage filtrado', () => {
    const storage = installBrowserStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'source', lifecycle: { entityKind: 'SOURCE_DOCUMENT' } },
      { id: 'draft', lifecycle: { entityKind: 'DRAFT' } },
      { id: 'template', ...markTemplateAsUserOwned({}) },
    ]));
    storage.writes.length = 0;

    expect(store.readLocalCustomTemplates().map((item) => item.id)).toEqual(['template']);
    expect(JSON.parse(storage.getItem(STORAGE_KEY) || '[]').map((item: { id: string }) => item.id)).toEqual(['template']);
    expect(storage.writes).toHaveLength(1);
  });

  it('no convierte un objeto arbitrario cuando la API falla y reconoce una plantilla explícita como caché local', async () => {
    installBrowserStorage();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'WORKSPACE_UNAVAILABLE' }), { status: 503 })));

    const saved = await store.saveCustomTemplate(template());
    expect((saved as typeof saved & { persistence?: string }).persistence).toBe('local_cache');
    expect(store.readLocalCustomTemplates().map((item) => item.id)).toEqual(['template']);
    expect(JSON.stringify(store.readLocalCustomTemplates())).not.toContain('WORKSPACE_UNAVAILABLE');

    await expect(store.saveCustomTemplate({ id: 'arbitrary' } as ProfessionalTemplate)).rejects.toThrow();
    expect(store.readLocalCustomTemplates().map((item) => item.id)).toEqual(['template']);
  });

  it.each([
    ['source', markDocumentEntity({ id: 'source' }, 'SOURCE_DOCUMENT')],
    ['draft', markDocumentEntity({ id: 'draft' }, 'DRAFT')],
    ['final', markDocumentAsFinal(markDocumentEntity({ id: 'final' }, 'DRAFT'), { explicit: true })],
    ['reference', markDocumentEntity({ id: 'reference' }, 'REFERENCE_DOCUMENT')],
    ['unmarked', { id: 'unmarked' }],
  ])('rechaza guardar localmente %s como plantilla', (_label, value) => {
    installBrowserStorage();

    expect(store.saveCustomTemplateLocally(value as ProfessionalTemplate)).toBe(false);
    expect(store.readLocalCustomTemplates()).toEqual([]);
  });

  it('conserva system y test_demo, pero rechaza un origen inválido', () => {
    const storage = installBrowserStorage();
    const invalidOrigin = {
      id: 'invalid-origin',
      __juridicoRadar: {
        entityKind: 'TEMPLATE',
        originClass: 'external',
        creationIntent: 'EXPLICIT_TEMPLATE',
      },
    };
    storage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'system', ...markTemplateAsSystem({}) },
      { id: 'test-demo', ...markTemplateAsTestDemo({}) },
      invalidOrigin,
    ]));

    expect(store.readLocalCustomTemplates().map((item) => item.id)).toEqual(['system', 'test-demo']);
    expect(store.saveCustomTemplateLocally(invalidOrigin as unknown as ProfessionalTemplate)).toBe(false);
  });

  it('rechaza en modo fail-closed el conflicto entre lifecycle DRAFT y structureJson TEMPLATE', () => {
    const storage = installBrowserStorage();
    const conflict = {
      id: 'conflict',
      lifecycle: { entityKind: 'DRAFT' },
      structureJson: markTemplateAsUserOwned({}),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify([conflict]));

    expect(store.readLocalCustomTemplates()).toEqual([]);
    expect(store.saveCustomTemplateLocally(conflict as ProfessionalTemplate)).toBe(false);
  });

  it('filtra también una respuesta API defensiva antes de exponerla a la biblioteca', async () => {
    installBrowserStorage();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      templates: [template(), { id: 'legacy', title: 'Documento antiguo' }],
    }), { status: 200 })));

    const templates = await store.getCustomTemplates();
    expect(templates.map((item) => item.id)).toEqual(['template']);
  });

  it('actualiza y elimina usando únicamente el caché ya filtrado cuando la API falla', async () => {
    const storage = installBrowserStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify([
      template(),
      { id: 'draft', lifecycle: { entityKind: 'DRAFT' } },
    ]));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'WORKSPACE_UNAVAILABLE' }), { status: 503 })));

    const updated = await store.updateCustomTemplate('template', { title: 'Plantilla actualizada' });
    expect(updated.title).toBe('Plantilla actualizada');
    expect(updated.persistence).toBe('local_cache');
    expect(store.readLocalCustomTemplates().map((item) => item.id)).toEqual(['template']);

    const deleteResult = await store.deleteCustomTemplate('template');
    expect(deleteResult.persistence).toBe('not_persisted');
    expect(store.readLocalCustomTemplates().map((item) => item.id)).toEqual(['template']);
  });

  it('devuelve not_persisted en DELETE fallido y conserva el caché para reintentar', async () => {
    const storage = installBrowserStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify([template()]));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'WORKSPACE_UNAVAILABLE' }), { status: 503 })));

    const result = await store.deleteCustomTemplate('template');
    expect(result.persistence).toBe('not_persisted');
    expect(result.message).toContain('reintentar');
    expect(store.readLocalCustomTemplates().map((item) => item.id)).toEqual(['template']);
  });
});
