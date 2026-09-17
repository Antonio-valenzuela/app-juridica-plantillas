import { describe, expect, it } from 'vitest';
import {
  evaluateSourceOutputCompatibility,
  getSourceOutputCompatibilityPolicy,
  inferSourceOutputType,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';
import { createSourceDocument } from '@/lib/legal-engine/context';

function source(text: string, id: string, role?: 'PRIMARY' | 'SUPPORTING' | 'REFERENCE'): UploadedSourceDocument {
  const document = createSourceDocument({
    id,
    filename: `${id}.docx`,
    name: `${id}.docx`,
    type: 'docx',
    fileUrl: `blob:${id}`,
    extractedText: text,
    pages: [{ page: 1, text, chars: text.length }],
    sourceValidated: true,
    fileSizeBytes: text.length,
  } as any);
  return role ? { ...document, classification: { ...(document.classification || {}), role } } : document;
}

function inferredMatter(document: UploadedSourceDocument): string {
  return evaluateSourceOutputCompatibility({ sourceDocuments: [document] }).sourceMatter;
}

describe('source document classifier precedence and matter context', () => {
  it('keeps a nullity demand as DEMANDA despite cited amparo jurisprudence', () => {
    const document = source([
      'DEMANDA DE NULIDAD CONTENCIOSA ADMINISTRATIVA',
      'H. TRIBUNAL DE JUSTICIA ADMINISTRATIVA',
      'Vengo a demandar la nulidad del acto administrativo.',
      'Sirve de apoyo el criterio del SEGUNDO TRIBUNAL COLEGIADO.',
      'Amparo directo 194/88.',
      'Amparo directo 367/90.',
      'Ponente. Secretario.',
    ].join('\n'), 'nullity-demand-cited-amparo');

    expect(inferSourceOutputType([document])).toBe('DEMANDA');
    expect(inferredMatter(document)).toBe('ADMINISTRATIVA');
  });

  it('preserves a real amparo-direct judgment as SENTENCIA_AMPARO_DIRECTO', () => {
    const document = source([
      'AMPARO DIRECTO 800/2024',
      'VISTOS para resolver.',
      'RESULTANDO',
      'CONSIDERANDO',
      'RESUELVE',
      'SEGUNDO TRIBUNAL COLEGIADO DE CIRCUITO.',
    ].join('\n'), 'real-amparo-judgment');

    expect(inferSourceOutputType([document])).toBe('SENTENCIA_AMPARO_DIRECTO');
  });

  it('keeps a civil responsibility demand civil despite abogado patrono', () => {
    const document = source([
      'DEMANDA ORDINARIA CIVIL',
      'JUEZ DE LO CIVIL',
      'Vengo a demandar responsabilidad civil extracontractual y daño moral.',
      'Designo como mi abogado patrono al Lic. Carlos Pérez.',
    ].join('\n'), 'civil-responsibility-patrono');

    expect(inferSourceOutputType([document])).toBe('DEMANDA_CIVIL');
    expect(inferredMatter(document)).toBe('CIVIL');
  });

  it('does not classify incidental trabajo or trabajos as labor', () => {
    const document = source([
      'DEMANDA ORDINARIA CIVIL',
      'JUEZ DE LO CIVIL',
      'El actor se dirigía a su trabajo cuando ocurrió el accidente.',
      'Se realizaron trabajos de reparación en el inmueble.',
    ].join('\n'), 'civil-incidental-work');

    expect(inferSourceOutputType([document])).toBe('DEMANDA_CIVIL');
    expect(inferredMatter(document)).toBe('CIVIL');
  });

  it('preserves a substantive labor demand as DEMANDA_LABORAL', () => {
    const document = source([
      'DEMANDA LABORAL',
      'El trabajador fue despedido por el patrón.',
      'Reclamo salario y prestaciones laborales.',
    ].join('\n'), 'real-labor-demand');

    expect(inferSourceOutputType([document])).toBe('DEMANDA_LABORAL');
    expect(inferredMatter(document)).toBe('LABORAL');
  });

  it('keeps a real ordinary judgment as SENTENCIA_O_RESOLUCION', () => {
    const document = source([
      'SENTENCIA DEFINITIVA',
      'VISTOS para resolver.',
      'CONSIDERANDO',
      'RESUELVE',
      'Se dicta la resolución correspondiente.',
    ].join('\n'), 'ordinary-judgment');

    expect(inferSourceOutputType([document])).toBe('SENTENCIA_O_RESOLUCION');
  });

  it('keeps a civil demand as demand when its petition asks for a sentence', () => {
    const document = source([
      'DEMANDA ORDINARIA CIVIL',
      'JUEZ DE LO CIVIL',
      'HECHOS',
      'El demandado incumplió la obligación.',
      'PUNTOS PETITORIOS',
      'En su oportunidad procesal se dicte sentencia condenatoria.',
      'Sentencia ejecutoria.',
    ].join('\n'), 'civil-demand-petition-sentence');

    expect(inferSourceOutputType([document])).toBe('DEMANDA_CIVIL');
  });

  it('routes the corrected civil demand into the compatible civil response flow', () => {
    const document = source([
      'DEMANDA ORDINARIA CIVIL',
      'JUEZ DE LO CIVIL',
      'Vengo a demandar responsabilidad civil y daño moral.',
      'PUNTOS PETITORIOS: se dicte sentencia condenatoria.',
    ].join('\n'), 'civil-demand-compatibility-e2e');

    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_civil',
      sourceDocuments: [document],
    });

    expect(result.status).toBe('COMPATIBLE');
    expect(result.sourceDocumentType).toBe('DEMANDA_CIVIL');
    expect(result.sourceMatter).toBe('CIVIL');
  });

  it('lets the PRIMARY demand control classification when a REFERENCE judgment is listed first', () => {
    const referenceJudgment = source([
      'SENTENCIA DEFINITIVA',
      'VISTOS para resolver.',
      'CONSIDERANDO',
      'RESUELVE',
    ].join('\n'), 'reference-judgment', 'REFERENCE');
    const primaryDemand = source([
      'DEMANDA ORDINARIA CIVIL',
      'JUEZ DE LO CIVIL',
      'Vengo a demandar responsabilidad civil.',
      'HECHOS',
      'PUNTOS PETITORIOS',
    ].join('\n'), 'primary-demand', 'PRIMARY');

    expect(inferSourceOutputType([referenceJudgment, primaryDemand])).toBe('DEMANDA_CIVIL');
    expect(inferSourceOutputType([primaryDemand, referenceJudgment])).toBe('DEMANDA_CIVIL');
  });

  it('does not let incidental labor vocabulary override an explicitly civil primary demand', () => {
    const document = source([
      'DEMANDA ORDINARIA CIVIL',
      'JUEZ DE LO CIVIL',
      'Vengo a demandar responsabilidad civil por daños.',
      'El trabajador de la constructora recibió salario y fue despedido.',
      'Se reclaman daños y perjuicios, no prestaciones laborales.',
    ].join('\n'), 'civil-with-incidental-labor');

    expect(inferSourceOutputType([document])).toBe('DEMANDA_CIVIL');
    expect(inferredMatter(document)).toBe('CIVIL');
  });

  it('classifies an amparo demand as an amparo source instead of a generic demand', () => {
    const document = source([
      'DEMANDA DE AMPARO DIRECTO',
      'H. TRIBUNAL COLEGIADO DE CIRCUITO',
      'Vengo a promover juicio de amparo directo contra la sentencia definitiva.',
      'ACTO RECLAMADO: la sentencia definitiva.',
    ].join('\n'), 'amparo-direct-demand');

    expect(inferSourceOutputType([document])).toBe('DEMANDA_AMPARO_DIRECTO');
    expect(inferredMatter(document)).toBe('AMPARO');
  });

  it('keeps amparo source types declared by the catalog instead of silently dropping them', () => {
    const policy = getSourceOutputCompatibilityPolicy('ampliacion_demanda_amparo');

    expect(policy.acceptedSourceTypes).toEqual(expect.arrayContaining(['DEMANDA_AMPARO', 'INFORME_JUSTIFICADO']));
  });
});
