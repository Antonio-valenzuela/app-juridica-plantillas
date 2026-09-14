import { describe, it, expect } from 'vitest';
import { PROFESSIONAL_TEMPLATES } from '@/lib/templates/templateDefinitions';
import {
  renderToDocument,
  renderToText,
  validateTemplateValues,
} from '@/lib/templates/templateRenderer';

describe('Template Renderer', () => {
  const allTemplates = PROFESSIONAL_TEMPLATES;

  describe('Template catalog', () => {
    it('debe tener exactamente 15 plantillas', () => {
      expect(allTemplates.length).toBe(15);
    });

    it('debe cubrir todas las categorías requeridas', () => {
      const categories = new Set(allTemplates.map((t) => t.category));
      expect(categories.has('Amparo')).toBe(true);
      expect(categories.has('Civil')).toBe(true);
      expect(categories.has('Familiar')).toBe(true);
      expect(categories.has('Mercantil')).toBe(true);
      expect(categories.has('Administrativo/Fiscal')).toBe(true);
      expect(categories.has('General')).toBe(true);
    });

    it('cada plantilla debe tener id, título, categoría y disclaimer', () => {
      for (const template of allTemplates) {
        expect(template.id).toBeTruthy();
        expect(template.title).toBeTruthy();
        expect(template.category).toBeTruthy();
        expect(template.disclaimer).toBeTruthy();
        expect(template.disclaimer.length).toBeGreaterThan(20);
      }
    });

    it('cada plantilla debe tener fundamento legal', () => {
      for (const template of allTemplates) {
        expect(template.legalBasis).toBeTruthy();
        expect(template.legalBasis.length).toBeGreaterThan(5);
      }
    });

    it('no afirma fundamentos ni plazos que todavía no fueron verificados', () => {
      for (const template of allTemplates) {
        expect(template.legalBasis).toMatch(
          /^\[PENDIENTE: verificar fundamento normativo aplicable/
        );
        for (const law of template.applicableLaws) {
          expect(law).toMatch(/^\[PENDIENTE: verificar legislación aplicable/);
        }
        for (const warning of template.warnings) {
          expect(warning).not.toMatch(
            /\b(?:art(?:ículo|\.)?s?\.?\s*\d+|plazo (?:general )?de \d+|prescribe en \w+ años)\b/i
          );
        }
      }
    });

    it('cada plantilla debe tener al menos una sección', () => {
      for (const template of allTemplates) {
        expect(template.sections.length).toBeGreaterThan(0);
      }
    });

    it('cada plantilla debe tener al menos un formato de exportación', () => {
      for (const template of allTemplates) {
        expect(template.exportFormats.length).toBeGreaterThan(0);
      }
    });

    it('ninguna plantilla debe tener texto [Desarrollar...]', () => {
      for (const template of allTemplates) {
        const json = JSON.stringify(template);
        expect(json).not.toContain('[Desarrollar');
        expect(json).not.toContain('[Agregar');
        expect(json).not.toContain('[Relacionar');
      }
    });
  });

  describe('Plantillas específicas requeridas', () => {
    const expectedIds = [
      'amparo-indirecto',
      'suspension-amparo',
      'revision-amparo',
      'queja-amparo',
      'demanda-ordinaria-civil',
      'contestacion-civil',
      'demanda-alimentos',
      'convenio-alimentos',
      'guarda-custodia',
      'regimen-convivencia',
      'ejecutiva-mercantil',
      'contestacion-mercantil',
      'revocacion-fiscal',
      'autorizacion-abogados',
      'copias-certificadas',
    ];

    for (const id of expectedIds) {
      it(`debe incluir plantilla: ${id}`, () => {
        const found = allTemplates.find((t) => t.id === id);
        expect(found).toBeDefined();
      });
    }

    it('incluye los apartados procesales aplicables en cada tipo de escrito', () => {
      const expectedSections: Record<string, string[]> = {
        'amparo-indirecto': [
          'autoridades_responsables',
          'tercero_interesado',
          'acto_reclamado',
          'conceptos_violacion',
          'pruebas',
          'lista_anexos',
        ],
        'suspension-amparo': [
          'personalidad',
          'autoridades_responsables',
          'tercero_interesado',
          'acto_reclamado',
          'antecedentes',
          'pruebas',
          'lista_anexos',
        ],
        'revision-amparo': [
          'personalidad',
          'autoridades_responsables',
          'tercero_interesado',
          'agravios',
          'pruebas',
          'lista_anexos',
        ],
        'queja-amparo': [
          'personalidad',
          'autoridades_responsables',
          'tercero_interesado',
          'agravios',
          'pruebas',
          'lista_anexos',
        ],
        'contestacion-civil': [
          'personalidad',
          'contraparte',
          'contestacion_prestaciones',
          'contestacion_hechos',
          'excepciones',
          'pruebas',
          'lista_anexos',
        ],
        'convenio-alimentos': [
          'personalidad',
          'domicilio_procesal',
          'personas_autorizadas',
          'antecedentes',
          'clausulas',
          'lista_anexos',
        ],
        'contestacion-mercantil': [
          'personalidad',
          'contraparte',
          'contestacion_prestaciones',
          'contestacion_hechos',
          'excepciones',
          'pruebas',
          'lista_anexos',
        ],
        'autorizacion-abogados': [
          'tipo_procedimiento',
          'personalidad',
          'domicilio_procesal',
          'personas_autorizadas',
          'lista_anexos',
        ],
        'copias-certificadas': [
          'tipo_procedimiento',
          'personalidad',
          'domicilio_procesal',
          'personas_autorizadas',
          'lista_anexos',
        ],
      };

      for (const [templateId, sectionIds] of Object.entries(expectedSections)) {
        const template = allTemplates.find((item) => item.id === templateId);
        expect(template, templateId).toBeDefined();
        const actualIds = new Set(template?.sections.map((section) => section.id));
        for (const sectionId of sectionIds) {
          expect(actualIds.has(sectionId), `${templateId}: ${sectionId}`).toBe(true);
        }
      }
    });
  });

  describe('Generación de documentos', () => {
    it('debe generar documento con campos completos', () => {
      const template = allTemplates.find((t) => t.id === 'amparo-indirecto');
      expect(template).toBeDefined();
      if (!template) return;

      const values: Record<string, string | string[]> = {};
      for (const section of template.sections) {
        if (section.type === 'repeatable') {
          values[section.id] = ['Dato de prueba 1', 'Dato de prueba 2'];
        } else {
          values[section.id] = `Valor de ${section.title}`;
        }
      }

      const doc = renderToDocument(template, values);
      expect(doc.title).toBeTruthy();
      expect(doc.sections.length).toBeGreaterThan(0);
      expect(doc.disclaimer).toBeTruthy();
      expect(doc.generatedAt).toBeTruthy();
    });

    it('debe marcar campos vacíos como [PENDIENTE: ...]', () => {
      const template = allTemplates.find((t) => t.id === 'demanda-ordinaria-civil');
      expect(template).toBeDefined();
      if (!template) return;

      const doc = renderToDocument(template, {});
      const text = renderToText(template, {});

      expect(text).toContain('[PENDIENTE:');
      expect(text).not.toContain('[Desarrollar');
    });

    it('debe numerar hechos correctamente', () => {
      const template = allTemplates.find((t) => t.id === 'demanda-ordinaria-civil');
      if (!template) return;

      const hechosSection = template.sections.find((s) => s.id === 'hechos');
      if (!hechosSection) return;

      const values: Record<string, string | string[]> = {
        hechos: ['Primer hecho relevante', 'Segundo hecho relevante', 'Tercer hecho relevante'],
      };

      const text = renderToText(template, values);
      // Should contain ordinal numbering
      expect(text).toMatch(/PRIMERO|1\.|I\./i);
    });

    it('debe generar texto plano legible', () => {
      const template = allTemplates[0];
      const values: Record<string, string | string[]> = {};
      for (const section of template.sections) {
        if (section.type === 'repeatable') {
          values[section.id] = ['Ejemplo'];
        } else {
          values[section.id] = 'Ejemplo';
        }
      }

      const text = renderToText(template, values);
      expect(text.length).toBeGreaterThan(100);
      expect(text).toContain('Ejemplo');
      expect(text).toContain('Generado el:');
    });
  });

  describe('Sustitución de campos', () => {
    it('debe sustituir todos los campos proporcionados', () => {
      const template = allTemplates.find((t) => t.id === 'copias-certificadas');
      if (!template) return;

      const values: Record<string, string | string[]> = {};
      for (const section of template.sections) {
        if (section.type === 'repeatable') {
          values[section.id] = ['Valor repetible'];
        } else {
          values[section.id] = `FILLED_${section.id}`;
        }
      }

      const text = renderToText(template, values);
      for (const section of template.sections) {
        if (section.type !== 'repeatable') {
          expect(text).toContain(`FILLED_${section.id}`);
        }
      }
    });

    it('campos obligatorios vacíos deben mostrar [PENDIENTE]', () => {
      for (const template of allTemplates) {
        const requiredSections = template.sections.filter(
          (s) => s.required && s.type !== 'repeatable'
        );
        if (requiredSections.length === 0) continue;

        const text = renderToText(template, {});
        for (const section of requiredSections) {
          expect(text).toContain('[PENDIENTE:');
        }
      }
    });

    it('identifica por nombre cada campo obligatorio omitido', () => {
      const template = allTemplates.find((item) => item.id === 'amparo-indirecto');
      expect(template).toBeDefined();
      if (!template) return;

      const text = renderToText(template, {});
      for (const section of template.sections.filter((item) => item.required)) {
        expect(text).toContain(`[PENDIENTE: ${section.title}]`);
      }
    });
  });

  describe('Validación previa', () => {
    it('informa todos los campos obligatorios que faltan', () => {
      const template = allTemplates.find((t) => t.id === 'amparo-indirecto');
      expect(template).toBeDefined();
      if (!template) return;

      const result = validateTemplateValues(template, {});
      const requiredIds = template.sections
        .filter((section) => section.required)
        .map((section) => section.id);

      expect(result.valid).toBe(false);
      expect(result.missingFieldIds).toEqual(requiredIds);
    });

    it('considera vacíos los arreglos y cadenas con sólo espacios', () => {
      const template = allTemplates.find((t) => t.id === 'demanda-ordinaria-civil');
      expect(template).toBeDefined();
      if (!template) return;

      const values = Object.fromEntries(
        template.sections.map((section) => [
          section.id,
          section.type === 'repeatable' ? ['   '] : '   ',
        ])
      );

      expect(validateTemplateValues(template, values).valid).toBe(false);
    });
  });

  describe('Campos obligatorios', () => {
    it('cada plantilla debe tener al menos un campo obligatorio', () => {
      for (const template of allTemplates) {
        const requiredFields = template.sections.filter((s) => s.required);
        expect(requiredFields.length).toBeGreaterThan(0);
      }
    });

    it('autoridad/juzgado debe ser obligatorio en cada plantilla', () => {
      for (const template of allTemplates) {
        const authorityField = template.sections.find(
          (s) =>
            s.id === 'autoridad' ||
            s.id === 'juzgado' ||
            s.id === 'autoridadCompetente' ||
            s.id === 'autoridad_competente'
        );
        // At minimum, one of these should exist and be required
        // Some templates may use different field names
        const hasAuthority = template.sections.some(
          (s) =>
            (s.id.includes('autoridad') || s.id.includes('juzgado')) && s.required
        );
        expect(hasAuthority).toBe(true);
      }
    });
  });

  describe('Secciones repetibles', () => {
    it('hechos debe ser repetible en plantillas de demanda', () => {
      const demandaTemplates = allTemplates.filter(
        (t) =>
          t.id.includes('demanda') ||
          t.id.includes('amparo-indirecto') ||
          t.id.includes('ejecutiva')
      );
      for (const template of demandaTemplates) {
        const hechos = template.sections.find((s) => s.id === 'hechos');
        if (hechos) {
          expect(hechos.type).toBe('repeatable');
        }
      }
    });

    it('pruebas debe ser repetible', () => {
      const templatesWithPruebas = allTemplates.filter((t) =>
        t.sections.some((s) => s.id === 'pruebas')
      );
      for (const template of templatesWithPruebas) {
        const pruebas = template.sections.find((s) => s.id === 'pruebas');
        if (pruebas) {
          expect(pruebas.type).toBe('repeatable');
        }
      }
    });
  });
});
