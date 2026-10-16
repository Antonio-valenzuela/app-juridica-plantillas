import { describe, expect, it } from 'vitest';
import { sanitizeLegalDocument, stripInternalPromptMetadata } from '@/lib/legal-engine/legalDocumentSanitizer';
import { createDocumentNode, createEmptyDocument, type ContentBlock } from '@/lib/legal-engine/types';

function docWith(text: string) {
  return createEmptyDocument({
    id: 'section-echo-doc',
    title: 'Prueba de ecos internos',
    documentType: 'escrito_libre',
    documentTypeLabel: 'Escrito Libre',
    sections: [
      createDocumentNode({
        id: 'body',
        type: 'argument',
        title: 'ARGUMENTOS',
        content: [{ id: 'body-block', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text }],
      }),
    ],
  });
}

function sanitizeBody(text: string) {
  const { document, report } = sanitizeLegalDocument(docWith(text));
  const block = document.sections[0].content[0] as ContentBlock;
  const joined = document.sections.flatMap((section) => section.content.map((b) => b.text)).join('\n');
  return { text: joined, block, report };
}

describe('eco del encabezado interno «SECCIÓN: …»', () => {
  it('si al retirar «… porque SECCIÓN: X» la oración queda incompleta, marca el bloque para regeneración (sin inventar la continuación)', () => {
    const { text, block, report } = sanitizeBody(
      'La demandada se opone a la vía intentada porque SECCIÓN: CONTESTACIÓN DE PRESTACIONES',
    );

    expect(text).not.toMatch(/SECCIÓN\s*:/);
    expect(text).toContain('se opone a la vía intentada');
    // No se inventa la continuación causal ni se recorta silenciosamente: el conector queda visible…
    expect(text).toMatch(/porque\s*$/);
    // …y el bloque se marca truncado (bloquea export/FINAL como texto "correcto").
    expect(block.generationStatus).toBe('truncated');
    expect(report.truncatedWarnings.some((w) => w.checkId === 'section_echo_left_incomplete_sentence')).toBe(true);
  });

  it('una etiqueta al final de una oración completa se elimina sin marcar nada', () => {
    const { text, block } = sanitizeBody('El actor reclama el pago del contrato. SECCIÓN: PRESTACIONES');

    expect(text).not.toMatch(/SECCIÓN\s*:/);
    expect(text).toContain('El actor reclama el pago del contrato.');
    expect(block.generationStatus).not.toBe('truncated');
  });

  it('una etiqueta interna entre párrafos se elimina sin comerse los textos vecinos', () => {
    const { text, block } = sanitizeBody(
      'Antecedentes del caso.\n\nSECCIÓN: HECHOS\n\nEl documento se dirige al juzgado de origen.',
    );

    expect(text).not.toMatch(/SECCIÓN\s*:/);
    expect(text).toContain('Antecedentes del caso.');
    expect(text).toContain('El documento se dirige al juzgado de origen.');
    expect(block.generationStatus).not.toBe('truncated');
  });

  it('nunca toca prosa jurídica legítima ni subsecciones', () => {
    const original =
      'El artículo 3 de la sección: tercera parte regula la procedencia, porque el actor no acreditó la relación causal. La SUBSECCIÓN: A no resulta aplicable.';
    const { text, block } = sanitizeBody(original);

    expect(text).toContain('sección: tercera');
    expect(text).toContain('porque el actor no acreditó la relación causal');
    expect(text).toContain('SUBSECCIÓN: A');
    expect(block.generationStatus).not.toBe('truncated');
  });

  it('el fallback de emergencia aplica la misma barrera', () => {
    const out = stripInternalPromptMetadata('Conforme a lo expuesto SECCIÓN: HECHOS');

    expect(out).not.toMatch(/SECCIÓN\s*:/);
    expect(out).toContain('Conforme a lo expuesto');
  });
});
