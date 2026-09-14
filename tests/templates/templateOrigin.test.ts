import { describe, expect, it } from 'vitest';
import * as templateOrigin from '@/lib/templates/templateOrigin';

const origin = templateOrigin as any;
const classifyTemplateOrigin = (template: unknown) =>
  typeof origin.classifyTemplateOrigin === 'function'
    ? origin.classifyTemplateOrigin(template)
    : undefined;
const markTemplateAsUserOwned = (structureJson: unknown) =>
  origin.markTemplateAsUserOwned(structureJson);
const markTemplateAsSystem = (structureJson: unknown) =>
  typeof origin.markTemplateAsSystem === 'function' ? origin.markTemplateAsSystem(structureJson) : null;
const markTemplateAsTestDemo = (structureJson: unknown) =>
  typeof origin.markTemplateAsTestDemo === 'function' ? origin.markTemplateAsTestDemo(structureJson) : null;
const filterVisibleTemplates = origin.filterVisibleTemplates;
const isLegacyDemoTemplate = origin.isLegacyDemoTemplate;
const CANARY_EXPEDIENTE = 'EXP_CANARIO_55441';

describe('Aislamiento de plantillas demo', () => {
  const unmarkedCanary = {
    id: 'unmarked',
    title: 'Recurso histórico',
    content: `EXPEDIENTE: ${CANARY_EXPEDIENTE}`,
    structureJson: null,
  };

  const userTemplate = {
    id: 'user',
    title: 'Plantilla del despacho',
    content: 'Contenido propio',
    structureJson: markTemplateAsUserOwned({}),
  };

  const systemTemplate = {
    id: 'system',
    title: 'Plantilla del sistema',
    content: 'Contenido base',
    structureJson: {
      __juridicoRadar: {
        entityKind: 'TEMPLATE',
        originClass: 'system',
        creationIntent: 'EXPLICIT_TEMPLATE',
      },
    },
  };

  const testTemplate = {
    id: 'test',
    title: 'Plantilla de prueba',
    content: 'Contenido de prueba',
    structureJson: {
      __juridicoRadar: {
        entityKind: 'TEMPLATE',
        originClass: 'test_demo',
        creationIntent: 'EXPLICIT_TEMPLATE',
      },
    },
  };

  it('clasifica exclusivamente por metadata __juridicoRadar y trata lo no marcado como legacy', () => {
    expect(classifyTemplateOrigin(unmarkedCanary)).toBe('legacy');
    expect(classifyTemplateOrigin(userTemplate)).toBe('user');
    expect(classifyTemplateOrigin(systemTemplate)).toBe('system');
    expect(classifyTemplateOrigin(testTemplate)).toBe('test_demo');
  });

  it('trata un originClass desconocido como legacy', () => {
    expect(classifyTemplateOrigin({
      id: 'unknown-origin',
      structureJson: {
        __juridicoRadar: {
          entityKind: 'TEMPLATE',
          originClass: 'future_origin',
          creationIntent: 'EXPLICIT_TEMPLATE',
        },
      },
    })).toBe('legacy');
  });

  it('escribe el contrato de ciclo de vida completo para cada origen explícito', () => {
    expect((userTemplate.structureJson as any).__juridicoRadar).toMatchObject({
      entityKind: 'TEMPLATE',
      originClass: 'user',
      creationIntent: 'EXPLICIT_TEMPLATE',
    });
    expect(typeof origin.markTemplateAsSystem).toBe('function');
    expect(typeof origin.markTemplateAsTestDemo).toBe('function');
    const markedSystem = markTemplateAsSystem({});
    const markedTest = markTemplateAsTestDemo({});
    expect(markedSystem?.__juridicoRadar).toMatchObject({
      entityKind: 'TEMPLATE',
      originClass: 'system',
      creationIntent: 'EXPLICIT_TEMPLATE',
    });
    expect(markedTest?.__juridicoRadar).toMatchObject({
      entityKind: 'TEMPLATE',
      originClass: 'test_demo',
      creationIntent: 'EXPLICIT_TEMPLATE',
    });
  });

  it('identifica una plantilla heredada del workspace demo sin clasificarla por su texto', () => {
    expect(isLegacyDemoTemplate(unmarkedCanary, { defaultDemoWorkspace: true })).toBe(true);
    expect(isLegacyDemoTemplate(unmarkedCanary, { defaultDemoWorkspace: false })).toBe(false);
  });

  it('marca las nuevas plantillas como propiedad del abogado y las deja visibles', () => {
    const structure = markTemplateAsUserOwned({ pageCount: 1 });
    const markedTemplate = { ...unmarkedCanary, id: 'user-template', structureJson: structure };

    expect(isLegacyDemoTemplate(markedTemplate, { defaultDemoWorkspace: true })).toBe(false);
    expect((structure as any).__juridicoRadar.originClass).toBe('user');
  });

  it('por defecto sólo deja seleccionables plantillas user y system', () => {
    const visible = filterVisibleTemplates(
      [unmarkedCanary, userTemplate, systemTemplate, testTemplate],
    );

    expect(visible.map((template: any) => template.id)).toEqual(['user', 'system']);
    expect(JSON.stringify(visible)).not.toContain(CANARY_EXPEDIENTE);
  });

  it('incluye legacy cuando se solicita explícitamente', () => {
    const visible = filterVisibleTemplates(
      [unmarkedCanary, userTemplate, systemTemplate, testTemplate],
      { includeLegacy: true },
    );

    expect(visible.map((template: any) => template.id)).toEqual(['unmarked', 'user', 'system']);
    expect(classifyTemplateOrigin(visible[0])).toBe('legacy');
  });

  it('incluye test_demo cuando se solicita explícitamente', () => {
    const visible = filterVisibleTemplates(
      [unmarkedCanary, userTemplate, systemTemplate, testTemplate],
      { includeTestDemo: true },
    );

    expect(visible.map((template: any) => template.id)).toEqual(['user', 'system', 'test']);
    expect(classifyTemplateOrigin(visible[2])).toBe('test_demo');
  });

  it('mantiene includeDemo como alias diagnóstico de ambos orígenes no normales', () => {
    const visible = filterVisibleTemplates(
      [unmarkedCanary, userTemplate, systemTemplate, testTemplate],
      { includeDemo: true },
    );

    expect(visible.map((template: any) => template.id)).toEqual(['unmarked', 'user', 'system', 'test']);
    expect(classifyTemplateOrigin(visible[0])).toBe('legacy');
  });
});
