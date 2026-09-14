import { afterEach, describe, expect, it, vi } from 'vitest';
import { markDocumentAsFinal, markDocumentEntity } from '@/lib/legal-engine/documentLifecycle';
import { markTemplateAsUserOwned } from '@/lib/templates/templateOrigin';
import type { ProfessionalTemplate } from '@/lib/templates/templateTypes';
import { readLocalCustomTemplates, saveTemplateWithPersistenceStatus } from '@/lib/templates/customTemplateStore';

const STORAGE_KEY = 'juridico_custom_templates';

type MemoryStorage = Storage;

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>();
  return {
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
    },
  };
}

function installBrowserStorage() {
  const storage = createMemoryStorage();
  Object.assign(globalThis, { localStorage: storage, window: { localStorage: storage } });
  return storage;
}

function explicitTemplate(id = 'explicit-template'): ProfessionalTemplate {
  return {
    id,
    title: 'Plantilla explícita',
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

describe('persistencia de plantillas cuando el destino no está disponible', () => {
  it('devuelve GUARDADO del servidor ante una respuesta 201 exitosa', async () => {
    installBrowserStorage();
    const serverTemplate = explicitTemplate('server-template');
    const post = vi.fn(async () => new Response(
      JSON.stringify({ ok: true, template: serverTemplate }),
      { status: 201 },
    ));

    const result = await saveTemplateWithPersistenceStatus(explicitTemplate('local-template'), { post });

    expect(result).toMatchObject({
      ok: true,
      status: 'GUARDADO',
      persistence: 'server',
      retryable: false,
      template: serverTemplate,
    });
    expect(result.template).toEqual(serverTemplate);
    expect(post).toHaveBeenCalledOnce();
  });

  it('no informa GUARDADO si el servidor combina ok falso con success verdadero', async () => {
    installBrowserStorage();
    const post = vi.fn(async () => new Response(
      JSON.stringify({ ok: false, success: true, error: 'WORKSPACE_UNAVAILABLE' }),
      { status: 200 },
    ));

    const result = await saveTemplateWithPersistenceStatus(explicitTemplate('ambiguous-response'), { post });

    expect(result.status).toBe('CONSERVADO TEMPORALMENTE');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(readLocalCustomTemplates().map((template) => template.id)).toEqual(['ambiguous-response']);
  });

  it('devuelve conservación temporal ante 503 y guarda solo la plantilla explícita en caché', async () => {
    installBrowserStorage();
    const post = vi.fn(async () => new Response(
      JSON.stringify({ ok: false, error: 'SERVICE_UNAVAILABLE' }),
      { status: 503 },
    ));

    const result = await saveTemplateWithPersistenceStatus(explicitTemplate(), { post });

    expect(result).toMatchObject({
      ok: false,
      status: 'CONSERVADO TEMPORALMENTE',
      persistence: 'local_cache',
      retryable: true,
    });
    expect(result.message.toLowerCase()).toContain('reintentar');
    expect(post).toHaveBeenCalledOnce();
    expect(readLocalCustomTemplates().map((template) => template.id)).toEqual(['explicit-template']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).toHaveLength(1);
  });

  it('devuelve NO GUARDADO y permite reintentar si el destino y el persist adapter fallan', async () => {
    installBrowserStorage();
    const post = vi.fn(async () => new Response(
      JSON.stringify({ ok: false, error: 'SERVICE_UNAVAILABLE' }),
      { status: 503 },
    ));
    const persistLocally = vi.fn(() => false);

    const result = await saveTemplateWithPersistenceStatus(explicitTemplate('not-saved'), {
      post,
      persistLocally,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'NO GUARDADO',
      persistence: 'not_persisted',
      retryable: true,
    });
    expect(result.message.toLowerCase()).toContain('reintentar');
    expect(post).toHaveBeenCalledOnce();
    expect(persistLocally).toHaveBeenCalledOnce();
    expect(readLocalCustomTemplates()).toEqual([]);
  });

  it('permite un reintento real que pasa de conservación temporal a GUARDADO', async () => {
    installBrowserStorage();
    const template = explicitTemplate('retry-template');
    let attempts = 0;
    const post = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response(JSON.stringify({ ok: false, error: 'SERVICE_UNAVAILABLE' }), { status: 503 });
      }
      return new Response(JSON.stringify({ ok: true, template }), { status: 201 });
    });

    const first = await saveTemplateWithPersistenceStatus(template, { post });
    const second = await saveTemplateWithPersistenceStatus(template, { post });

    expect(first.status).toBe('CONSERVADO TEMPORALMENTE');
    expect(first.retryable).toBe(true);
    expect(second).toMatchObject({
      ok: true,
      status: 'GUARDADO',
      persistence: 'server',
      retryable: false,
      template,
    });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('conserva la plantilla explícita previa y sigue filtrando documentos no-template al fallar una nueva', async () => {
    installBrowserStorage();
    const previousTemplate = explicitTemplate('previous-template');
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      previousTemplate,
      markDocumentEntity({ id: 'source' }, 'SOURCE_DOCUMENT'),
      markDocumentEntity({ id: 'draft' }, 'DRAFT'),
      markDocumentAsFinal(markDocumentEntity({ id: 'final' }, 'DRAFT'), { explicit: true }),
      markDocumentEntity({ id: 'reference' }, 'REFERENCE_DOCUMENT'),
    ]));
    const post = vi.fn(async () => new Response(
      JSON.stringify({ ok: false, error: 'SERVICE_UNAVAILABLE' }),
      { status: 503 },
    ));

    const result = await saveTemplateWithPersistenceStatus(explicitTemplate('new-template'), { post });

    expect(result.status).toBe('CONSERVADO TEMPORALMENTE');
    expect(readLocalCustomTemplates().map((template) => template.id)).toEqual([
      'new-template',
      'previous-template',
    ]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').map((template: { id: string }) => template.id)).toEqual([
      'new-template',
      'previous-template',
    ]);
  });

  it('descarta metadata de plantilla con versión inválida sin normalizarla', () => {
    installBrowserStorage();
    const invalidVersion = explicitTemplate('invalid-version');
    invalidVersion.structureJson = {
      ...(invalidVersion.structureJson as unknown as Record<string, unknown>),
      __juridicoRadar: {
        entityKind: 'TEMPLATE',
        originClass: 'user',
        creationIntent: 'EXPLICIT_TEMPLATE',
        version: 0,
      },
    } as unknown as ProfessionalTemplate['structureJson'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify([invalidVersion]));

    expect(readLocalCustomTemplates()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).toEqual([]);
  });

  it('reemplaza la copia temporal cuando el servidor confirma con otro id', async () => {
    installBrowserStorage();
    const temporary = explicitTemplate('temporary-id');
    const serverTemplate = explicitTemplate('server-id');
    const post = vi.fn(async () => new Response(
      JSON.stringify({ ok: true, template: serverTemplate }),
      { status: 201 },
    ));

    await saveTemplateWithPersistenceStatus(temporary, { post });

    expect(readLocalCustomTemplates().map((template) => template.id)).toEqual(['server-id']);
  });

  it.each(['SOURCE_DOCUMENT', 'DRAFT', 'FINAL_DOCUMENT', 'REFERENCE_DOCUMENT'] as const)(
    'rechaza %s sin escribir en el caché de plantillas', async (entityKind) => {
      installBrowserStorage();
      const post = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }));
      const base = {
        ...explicitTemplate(`non-template-${entityKind}`),
      };
      const nonTemplate = entityKind === 'FINAL_DOCUMENT'
        ? markDocumentAsFinal(markDocumentEntity(base, 'DRAFT'), { explicit: true })
        : markDocumentEntity(base, entityKind);

      const result = await saveTemplateWithPersistenceStatus(nonTemplate as ProfessionalTemplate, { post });

      expect(result).toMatchObject({
        ok: false,
        status: 'NO GUARDADO',
        persistence: 'not_persisted',
        retryable: false,
      });
      expect(result.message).toContain('TEMPLATE');
      expect(post).not.toHaveBeenCalled();
      expect(readLocalCustomTemplates()).toEqual([]);
    },
  );
});
