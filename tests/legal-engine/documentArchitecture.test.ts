import { describe, it, expect, beforeAll } from 'vitest';
import { runGenerationPipeline } from '../../lib/legal-engine/pipeline';
import { createSourceDocument } from '../../lib/legal-engine/context';
import { buildDocumentPlan, ensureCanonicalSections, inferSectionType } from '../../lib/legal-engine/documentPlan';
import { DocumentTemplates, getDocumentTemplate, construirTaxonomia, buildReferenceOnlyDirective } from '../../lib/legal-engine/documentTemplates';
import { validateForExport } from '../../lib/legal-engine/exportGuards';
import { createEmptyDocument } from '../../lib/legal-engine/types';

/**
 * FASE 17 — PRUEBAS DOCUMENTALES DE ARQUITECTURA
 * Un tipo documental genera EXCLUSIVAMENTE el documento que corresponde a su
 * rol, procedimiento y estructura; la fuente es referencia y nunca plantilla.
 *
 * Estas pruebas corren en modo DETERMINÍSTICO (sin proveedores IA) para que
 * la estructura/roles/prohibiciones no dependan del capricho del modelo.
 */

// Asegurar ruta determinística: sin llaves IA el pipeline usa generadores locales.
beforeAll(() => {
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) {
    delete process.env[k];
  }
});

/** Fuente deliberadamente CONTAMINANTE: sentencia con rúbricas judiciales,
 *  firma electrónica y metadata — jamás debe moldear la salida. */
const fuenteContaminante = createSourceDocument({
  id: 'sentencia-ref-only',
  filename: 'sentencia_AD_800.pdf',
  sourceValidated: true,
  pages: [
    { page: 1, text: 'V I S T O. RESULTANDO: PRIMERO. La demanda se presentó ante el Instituto de Pensiones del Estado de Jalisco, por ***** ******* ********* *****, trabajador.', chars: 160 },
    { page: 2, text: 'C O N S I D E R A N D O: PUNTOS RESOLUTIVOS. La Justicia de la Unión ampara.', chars: 90 },
    { page: 3, text: 'FIRMANTE\nNo. Serie: 70.6a.66.20\nOCSP\nTSP\nRevocación: http://ocsp\nDatos estampillados: XIWmAIi8zT9ex5kYlBKmVlqD2is=', chars: 130 },
  ],
});

const RUBRICAS_JUDICIALES = [/^V I S T O$/im, /^RESULTANDO/m, /^C O N S I D E R A N D O/m, /^CONSIDERANDO:/m, /^PUNTOS RESOLUTIVOS/m];

function fullText(doc: any): string {
  return doc.sections.map((s: any) => s.content.map((b: any) => b.text).join('\n')).join('\n');
}
function titlesOf(doc: any): string[] {
  return doc.sections.map((s: any) => s.title);
}

describe('FASE 3 — Taxonomía derivada del catálogo', () => {
  it('cada familia activa tiene jurisdicción, vías y tipos con rolAutor', () => {
    const tax = construirTaxonomia();
    expect(tax.length).toBeGreaterThanOrEqual(5);
    for (const fam of tax) {
      expect(fam.tipos.length).toBeGreaterThan(0);
      for (const t of fam.tipos) {
        expect(t.rolAutor).toBeTruthy();
        expect(t.via).toBeTruthy();
      }
    }
    const familias = tax.map((f) => f.familia);
    expect(familias).toContain('LABORAL');
    expect(familias).toContain('AMPARO');
    expect(familias).toContain('GENERAL');
  });
});

describe('FASE 5/6 — DocumentTemplate como única fuente de verdad', () => {
  it('todo template declara rolAutor, destinatario, objetivo y prohibiciones', () => {
    for (const tpl of Object.values(DocumentTemplates)) {
      expect(tpl.rolAutor, tpl.tipo).toBeTruthy();
      expect(tpl.destinatario, tpl.tipo).toBeTruthy();
      expect(tpl.objetivoProcesal, tpl.tipo).toBeTruthy();
      expect(tpl.prohibiciones.length, tpl.tipo).toBeGreaterThan(0);
      expect(tpl.estructura.length, tpl.tipo).toBeGreaterThanOrEqual(5);
      // Títulos canónicos únicos dentro del propio template
      const keys = tpl.estructura.map((t) => t.toLowerCase().trim());
      expect(new Set(keys).size, tpl.tipo).toBe(keys.length);
    }
  });

  it('la directiva REFERENCE_ONLY contiene tipo, rol, destinatario y estructura del template', () => {
    const tpl = getDocumentTemplate('contestacion_demanda_laboral');
    const d = buildReferenceOnlyDirective(tpl);
    expect(d).toContain('SOLO LECTURA');
    expect(d).toContain(tpl.tipo);
    expect(d).toContain(tpl.rolAutor);
    expect(d).toContain(tpl.destinatario.split(' ').slice(0, 2).join(' '));
    expect(d).toContain(tpl.estructura[0]);
  });
});

describe('FASE 7 — Separación resolutivos vs escritos de parte', () => {
  it('el catálogo solo genera escritos de parte (ningún rolAutor es juzgador)', () => {
    const judgeRoles = ['juez', 'magistrado', 'secretario', 'juzgador', 'tribunal', 'autoridad_jurisdiccional'];
    for (const tpl of Object.values(DocumentTemplates)) {
      expect(judgeRoles).not.toContain(tpl.rolAutor);
    }
  });

  it('inferSectionType no clasifica rubros judiciales como secciones de parte', () => {
    expect(inferSectionType('PUNTOS PETITORIOS')).toBe('petition');
    expect(inferSectionType('AGRAVIOS')).toBe('argument');
    expect(inferSectionType('ANTECEDENTES')).toBe('background');
    expect(inferSectionType('PRUEBAS')).toBe('evidence');
    expect(inferSectionType('FIRMA')).toBe('signature');
  });
});

describe('FASE 10/11 — Identidad única y canonicidad en el plan', () => {
  it('ensureCanonicalSections fusiona duplicados estructurales a UNA sección por función', () => {
    const mk = (id: string, title: string, text: string): any => ({
      id,
      type: 'custom',
      title,
      order: 0,
      content: [{ id: `b-${id}`, layer: 'USER_POSITION', trustLevel: 'VERIFIED', text, isManuallyEdited: false }],
      isRepeatable: false,
      isEditable: true,
      isGenerated: false,
      isManuallyEdited: false,
      variables: [],
      validationErrors: [],
      validationWarnings: [],
    });
    const merged = ensureCanonicalSections([
      mk('a', 'PRUEBAS', 'Confesional.'),
      mk('b', 'PRUEBAS', 'Documental pública.'),
      mk('c', 'PETITORIOS', 'Primero.'),
      mk('d', 'pruebas ', 'Testimonial.'), // título equivalente normalizado
    ]);
    expect(merged.map((s) => s.title.toUpperCase())).toEqual(['PRUEBAS', 'PETITORIOS']);
    const joined = merged[0].content.map((b: any) => b.text).join(' ');
    expect(joined).toContain('Confesional');
    expect(joined).toContain('Documental');
    expect(joined).toContain('Testimonial');
  });

  it('regeneración sobre existingDocument conserva UNA sola identidad (templateId)', async () => {
    const doc1 = await runGenerationPipeline({ userInstruction: 'Escrito de pruebas' });
    expect(doc1.templateId).toBe('escrito_libre');
    const ids = new Set(doc1.sections.map((s: any) => s._templateId));
    expect(ids.size).toBe(1);

    const doc2 = await runGenerationPipeline({
      existingDocument: doc1,
      userInstruction: 'Regenerar todo el escrito',
    });
    expect(doc2.templateId).toBe('escrito_libre');
    const ids2 = new Set(doc2.sections.map((s: any) => s._templateId));
    expect(ids2.size).toBe(1);
    // generationId distinto por generación, templateId estable
    expect(doc2.generationMetadata.generationId).toBeDefined();
  });
});

describe('FASE 4 — Fuente REFERENCE_ONLY contra los cinco tipos documentales', () => {
  const CASOS = [
    { label: 'Contestación de Demanda', instrucción: 'Contestar la demanda laboral oponiendo prescripción', tipo: 'contestacion_demanda_laboral' },
    { label: 'Demanda', instrucción: 'Demanda ordinaria laboral por despido injustificado', tipo: 'demanda_laboral' },
    { label: 'Alegatos/Agravios', instrucción: 'Expresión de agravios en apelación', tipo: 'escrito_agravios' },
    { label: 'Recurso', instrucción: 'Interponer recurso de revisión en amparo directo ante la SCJN', tipo: 'recurso_revision_amparo_directo' },
    { label: 'Escrito / promoción', instrucción: 'Promoción libre para solicitar copias certificadas', tipo: 'escrito_libre' },
  ];

  for (const caso of CASOS) {
    it(`[${caso.label}] estructura propia + sin contaminación de la sentencia fuente`, async () => {
      const doc = await runGenerationPipeline({
        userInstruction: caso.instrucción,
        sourceDocuments: [fuenteContaminante],
      });

      // Identidad documental única
      expect(doc.documentType).toBe(caso.tipo);
      expect(doc.templateId).toBe(caso.tipo);
      const tplIds = new Set(doc.sections.map((s: any) => s._templateId));
      expect(tplIds.size).toBe(1);
      expect([...tplIds][0]).toBe(caso.tipo);

      // Sin bloques SOURCE provenientes del expediente
      expect(doc.sections.some((s: any) => s._provenance === 'SOURCE')).toBe(false);

      // La estructura NO adopta las rúbricas de la sentencia como títulos
      for (const t of titlesOf(doc)) {
        for (const rx of RUBRICAS_JUDICIALES) {
          expect(rx.test(t), `título contaminado: ${t}`).toBe(false);
        }
      }

      // Sin firma electrónica ni metadata interna impresa
      const text = fullText(doc);
      expect(text).not.toMatch(/No\. Serie|Datos estampillados|OCSP|TSP\b|FIRMANTE/i);
      expect(text).not.toMatch(/OBJETIVO DEL BLOQUE|TEXTO ORIGINAL DEL BLOQUE|FRAGMENTOS DEL EXPEDIENTE/i);

      // Sin duplicación de títulos (canonicidad en plan)
      const keys = titlesOf(doc).map((t) => t.toLowerCase().trim());
      expect(new Set(keys).size).toBe(keys.length);

      // Guardas de exportación en verde
      const guard = validateForExport(doc);
      expect(guard.errors.filter((e: string) => /IDENTIDAD|CONTAMINACIÓN/.test(e))).toEqual([]);
    }, 30000);

    it(`[${caso.label}] voz correcta según rol (contestación firma demandado; recursos firman recurrente)`, async () => {
      const doc = await runGenerationPipeline({
        userInstruction: caso.instrucción,
        sourceDocuments: [fuenteContaminante],
      });
      const firma = doc.sections.find((s: any) => s.type === 'signature');
      expect(firma).toBeDefined();
      const firmaText = (firma?.content || []).map((b: any) => b.text).join('\n');
      if (caso.tipo === 'contestacion_demanda_laboral') {
        // Quien contesta es el demandado [PENDIENTE]; JAMÁS la autoridad de la fuente
        expect(firmaText).toMatch(/DATO PENDIENTE DE EXPEDIENTE: Nombre del demandado/);
        expect(firmaText).not.toMatch(/Instituto de Pensiones del Estado de Jalisco/);
      } else {
        const tpl = getDocumentTemplate(caso.tipo);
        expect(tpl.rolAutor).toBeTruthy();
        expect(firmaText.toLowerCase()).toContain('dato pendiente');
      }
    }, 30000);
  }

  it('la fuente conserva sus redacciones ***** intactas (REFERENCE_ONLY, sin limpieza)', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Promoción libre de prueba',
      sourceDocuments: [fuenteContaminante],
    });
    const src = doc.sourceDocuments[0];
    expect((src.pages || []).some((p) => p.text.includes('*'))).toBe(true);
  });
});
