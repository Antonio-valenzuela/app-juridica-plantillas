import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeLegalDocumentFormatting, buildFallbackAnalysis } from '@/lib/legal-engine/legalFormatAnalyzer';
import { buildFormattedDocument, validateFormattingIntegrity } from '@/lib/legal-engine/legalFormatter';
import { UniversalLegalDocument } from '@/lib/legal-engine/types';

const CANARY_EXPEDIENTE = 'EXP_CANARIO_55441';
const CANARY_CASE_NUMBER = `AMPARO DIRECTO ${CANARY_EXPEDIENTE}`;
const CANARY_CLIENTE = 'CLIENTE_CANARIO_92831';
const CANARY_DOMICILIO = 'DOMICILIO_CANARIO_77812';

vi.mock('@/lib/ai/orchestrator', () => ({
  runFastMode: vi.fn(),
}));

import { runFastMode } from '@/lib/ai/orchestrator';
const mockedRunFastMode = vi.mocked(runFastMode);

const ORIGINAL_TEXT = `SUPREMA CORTE DE JUSTICIA DE LA NACIÓN
P R E S E N T E

${CANARY_CLIENTE}
por mi propio derecho, señalo como domicilio ${CANARY_DOMICILIO}...

EXPEDIENTE: ${CANARY_CASE_NUMBER}

RECURSO DE REVISIÓN EN AMPARO DIRECTO

I. OPORTUNIDAD DEL RECURSO

Notificado el 12 de marzo de 2024, el presente recurso se interpone dentro del plazo legal conforme al artículo 107, fracción IX, de la Constitución Política de los Estados Unidos Mexicanos.

II. AGRAVIO PRIMERO

Causa agravio la resolución impugnada toda vez que viola los artículos 14 y 16 constitucionales, en relación con la jurisprudencia 1a./J. 43/2014 de la Primera Sala.

"La sentencia reclamada omitió valorar la prueba documental ofrecida por la parte quejosa."

XVI. AGRAVIO SEGUNDO

El juzgador de origen inaplicó el precedente aplicable al caso concreto.

PETITORIOS

PRIMERO. Tenerme por presentado oportunamente.
SEGUNDO. Declarar fundados los agravios hechos valer.
TERCERO. Condenar en costas a la responsable.

PROTESTO LO NECESARIO.

Ciudad de México, a 15 de marzo de 2024.

${CANARY_CLIENTE}
QUEJOSO / RECURRENTE

Nota de elaboración, a suprimir antes de la presentación definitiva: verificar anexos.`;

function makeSources(text: string) {
  return [
    {
      id: 'src-test-1',
      name: 'escrito_prueba.pdf',
      type: 'pdf',
      extractedText: text,
      pages: [{ page: 1, text, chars: text.length }],
      sourceValidated: true,
    },
  ];
}

const AI_STRUCTURE_JSON = JSON.stringify({
  documentType: 'recurso_revision_amparo_directo',
  title: 'RECURSO DE REVISIÓN EN AMPARO DIRECTO',
  header: { authority: 'SUPREMA CORTE DE JUSTICIA DE LA NACIÓN', caseNumber: CANARY_CASE_NUMBER, matter: 'RECURSO DE REVISIÓN EN AMPARO DIRECTO' },
  parties: [
    { role: 'quejoso', name: CANARY_CLIENTE },
    { role: 'autoridad', name: 'SUPREMA CORTE DE JUSTICIA DE LA NACIÓN' },
  ],
  sections: ORIGINAL_TEXT.split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      if (/^I\.|II\.|XVI\./.test(p)) {
        const m = p.match(/^([IVX]+\.)\s+(.+)$/);
        return { type: 'section', number: m?.[1] || '', heading: m?.[2]?.split('\n')[0], level: 1 };
      }
      if (/^PETITORIOS$/.test(p)) return { type: 'petition', heading: 'PETITORIOS', level: 1 };
      if (p.startsWith('"')) return { type: 'quote', text: p, level: 0 };
      if (/^PRIMERO\.|^SEGUNDO\.|^TERCERO\./m.test(p)) return { type: 'enumeration', items: p.split('\n').map((s) => s.trim()) };
      if (/PROTESTO LO NECESARIO/.test(p)) return { type: 'signature', text: `${p}\n\nCiudad de México, a 15 de marzo de 2024.\n\n${CANARY_CLIENTE}\nQUEJOSO / RECURRENTE`, level: 0 };
      if (/^Nota de elaboración/.test(p)) return { type: 'internal_note', text: p, level: 0 };
      if (/^RECURSO DE REVISIÓN/.test(p)) return { type: 'title', text: p, level: 1 };
      return { type: 'paragraph', text: p, level: 0 };
    }),
});

describe('Formateo jurídico profesional (CAPA 1 IA + CAPA 2 determinística)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('CAPA1→CAPA2 con NVIDIA devolviendo JSON estructural: analyze → format → integrity OK y contenido íntegro', async () => {
    mockedRunFastMode.mockResolvedValue({
      provider: 'nvidia',
      model: 'glm-4-9b-chat',
      success: true,
      content: AI_STRUCTURE_JSON,
      latencyMs: 10,
      warnings: [],
    });

    const { analysis, aiUsed } = await analyzeLegalDocumentFormatting(ORIGINAL_TEXT);
    expect(aiUsed).toBe(true);
    expect(analysis.source).toBe('ai');
    expect(analysis.header.caseNumber).toBe(CANARY_CASE_NUMBER);

    const doc = buildFormattedDocument(analysis, makeSources(ORIGINAL_TEXT), { aiUsed: true, aiProvider: 'nvidia' });
    const report = validateFormattingIntegrity(ORIGINAL_TEXT, doc);

    expect(report.sequentialOk).toBe(true);
    expect(report.missingTokens).toHaveLength(0);
    expect(report.coveragePct).toBe(100);
    expect(report.ok).toBe(true);

    const allText = doc.sections.map((s) => s.content.map((b) => b.text).join('\n')).join('\n');
    // Conservación literal obligatoria
    expect(allText).toContain(CANARY_CASE_NUMBER);
    expect(allText).toContain(CANARY_CLIENTE);
    expect(allText).toContain('12 de marzo de 2024');
    expect(allText).toContain('artículo 107, fracción IX, de la Constitución');
    expect(allText).toContain('jurisprudencia 1a./J. 43/2014');
    expect(allText).toContain('XVI. AGRAVIO SEGUNDO');
    expect(allText).toContain('PRIMERO. Tenerme por presentado oportunamente.');
    expect(allText).toContain('PROTESTO LO NECESARIO.');
    expect(allText).toContain('Nota de elaboración, a suprimir antes de la presentación definitiva');

    // Datos estructurados mapeados
    expect(doc.caseRefs.expediente).toBe(CANARY_CASE_NUMBER);
    expect(doc.parties.quejoso).toBe(CANARY_CLIENTE);

    // Nota editorial marcada como advertencia, no como parte del escrito
    const noteWarnings = doc.validation.warnings.filter((w) => w.checkId === 'format_internal_note');
    expect(noteWarnings.length).toBeGreaterThan(0);

    // Estilos determinísticos
    const allBlocks = doc.sections.flatMap((s) => s.content);
    const titleBlock = allBlocks.find((b) => b.text === 'RECURSO DE REVISIÓN EN AMPARO DIRECTO');
    expect(titleBlock).toBeDefined();
    expect(titleBlock!.style?.textAlign).toBe('center');
    expect(titleBlock!.style?.fontWeight).toBe('700');
    expect(titleBlock!.style?.fontSize).toBe('14pt');

    const quoteBlock = doc.sections.flatMap((s) => s.content).find((b) => b.text.startsWith('"'));
    expect(quoteBlock?.style?.indent).toBe('3em');
    expect(quoteBlock?.style?.fontSize).toBe('11pt');

    const paraBlock = doc.sections.flatMap((s) => s.content).find((b) => b.text.includes('plazo legal'));
    expect(paraBlock?.style?.textAlign).toBe('justify');
    expect(paraBlock?.style?.fontSize).toBe('12pt');

    const noteBlock = doc.sections.flatMap((s) => s.content).find((b) => b.text.startsWith('Nota de elaboración'));
    expect(noteBlock?.style?.fontSize).toBe('9pt');
    expect(noteBlock?.style?.fontStyle).toBe('italic');
  });

  it('Fallo de IA → fallback determinístico preserva 100% del contenido e integridad OK', async () => {
    mockedRunFastMode.mockRejectedValue(new Error('Timeout de análisis estructural'));

    const { analysis, aiUsed } = await analyzeLegalDocumentFormatting(ORIGINAL_TEXT);
    expect(aiUsed).toBe(false);
    expect(analysis.source).toBe('fallback');
    expect(analysis.sections.length).toBeGreaterThan(5);

    const doc = buildFormattedDocument(analysis, makeSources(ORIGINAL_TEXT));
    const report = validateFormattingIntegrity(ORIGINAL_TEXT, doc);
    expect(report.ok).toBe(true);
    expect(report.coveragePct).toBe(100);
  });

  it('Documento alterado → validateFormattingIntegrity ok:false (dispara LEGAL_CONTENT_CHANGED)', () => {
    const analysis = buildFallbackAnalysis(ORIGINAL_TEXT);
    const doc = buildFormattedDocument(analysis, makeSources(ORIGINAL_TEXT));

    // Simular pérdida/alteración de contenido: eliminar el bloque del primer petitorio
    const tampered: UniversalLegalDocument = {
      ...doc,
      sections: doc.sections.map((s) => ({
        ...s,
        content: s.content.filter((b) => !/Tenerme por presentado oportunamente/.test(b.text)),
      })),
    };

    const report = validateFormattingIntegrity(ORIGINAL_TEXT, tampered);
    expect(report.ok).toBe(false);
    expect(report.missingTokens.length).toBeGreaterThan(0);
    expect(report.missingTokens).toEqual(expect.arrayContaining(['presentado', 'oportunamente']));
  });
});
