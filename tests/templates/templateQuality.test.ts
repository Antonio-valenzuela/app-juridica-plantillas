import { describe, expect, it } from 'vitest';
import { DRAFT_WARNING, hasPendingMarkers } from '@/lib/templates/templateQuality';
import { templates } from '@/lib/templates/templateDefinitions';
import { renderToDocument, renderToText } from '@/lib/templates/templateRenderer';

describe('calidad de machotes', () => {
  it('detecta marcadores pendientes y permite documentos terminados', () => {
    expect(hasPendingMarkers('[PENDIENTE: verificar fundamento normativo]')).toBe(true);
    expect(hasPendingMarkers('Hechos acreditados y fundamento revisado.')).toBe(false);
  });

  it('incluye la advertencia exacta en el documento exportable si el fundamento sigue pendiente', () => {
    const template = templates[0];
    const values = Object.fromEntries(
      template.sections.map((section) => [
        section.id,
        section.type === 'repeatable' ? ['Dato revisado'] : 'Dato revisado',
      ])
    );

    const document = renderToDocument(template, values);
    const text = renderToText(template, values);

    expect(DRAFT_WARNING).toBe('BORRADOR — REQUIERE REVISIÓN PROFESIONAL');
    expect(document.sections[0]?.title).toBe(DRAFT_WARNING);
    expect(text).toContain(DRAFT_WARNING);
    expect(text).toContain('[PENDIENTE: verificar fundamento normativo');
  });
});
