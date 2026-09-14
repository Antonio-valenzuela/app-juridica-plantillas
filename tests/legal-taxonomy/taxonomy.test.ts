import { describe, it, expect } from 'vitest';
import {
  MATTERS,
  JURISDICTIONS,
  DOCUMENT_TYPES,
  CUSTOM_VALUE_MAX_LENGTH,
  sanitizeCustomValue,
  validateCustomTaxonomyValue,
  resolveEffectiveLabel,
  serializeTaxonomyForPipeline,
} from '@/lib/legal-taxonomy';

describe('BLOCK C - Taxonomía centralizada', () => {
  it('matters contiene al menos 15 materias requeridas + Otro', () => {
    const required = ['amparo', 'constitucional', 'civil', 'familiar', 'mercantil', 'laboral', 'penal', 'administrativo', 'fiscal', 'agrario', 'electoral', 'seguridad_social', 'propiedad_intelectual', 'corporativo', 'otro'];
    for (const r of required) {
      expect(MATTERS.some((m) => m.value === r), `falta materia ${r}`).toBe(true);
    }
    expect(MATTERS.length).toBeGreaterThanOrEqual(15);
  });

  it('jurisdictions contiene 8 valores requeridos sin hardcode CDMX', () => {
    const required = ['federal', 'estatal', 'local', 'municipal', 'administrativa', 'electoral', 'militar', 'otra'];
    for (const r of required) {
      expect(JURISDICTIONS.some((j) => j.value === r), `falta jurisdicción ${r}`).toBe(true);
    }
    // No debe contener CDMX como valor hardcodeado
    expect(JURISDICTIONS.some((j) => j.value.toLowerCase().includes('cdmx') || j.label.includes('CDMX'))).toBe(false);
  });

  it('documentTypes contiene catálogo amplio + extensible', () => {
    const required = ['demanda', 'contestacion_demanda', 'reconvencion', 'ampliacion', 'replica', 'duplica', 'incidente', 'apelacion', 'revocacion', 'queja', 'reclamacion', 'amparo_directo', 'amparo_indirecto', 'agravios', 'alegatos', 'promocion', 'solicitud', 'escrito_libre', 'recurso', 'otro'];
    for (const r of required) {
      expect(DOCUMENT_TYPES.some((d) => d.value === r), `falta tipo ${r}`).toBe(true);
    }
    expect(DOCUMENT_TYPES.length).toBeGreaterThanOrEqual(20);
  });

  it('Otro con customValue válida (trim + max 80)', () => {
    expect(sanitizeCustomValue('  Derecho energético  ')).toBe('Derecho energético');
    expect(sanitizeCustomValue('a'.repeat(100))?.length).toBe(CUSTOM_VALUE_MAX_LENGTH);
    expect(sanitizeCustomValue('')).toBeNull();
    expect(sanitizeCustomValue(' x ')).toBeNull(); // <2 chars
  });

  it('validateCustomTaxonomyValue rechaza entradas inválidas', () => {
    expect(validateCustomTaxonomyValue({ value: 'otro', label: 'Otro', customValue: 'Derecho energético' }).ok).toBe(true);
    expect(validateCustomTaxonomyValue({ value: 'otro', customValue: '' }).ok).toBe(false);
    expect(validateCustomTaxonomyValue({ value: 'civil', customValue: 'algo' }).ok).toBe(false);
    expect(validateCustomTaxonomyValue({ value: 'otro', customValue: 'x' }).ok).toBe(false); // <2 chars
    // Long input se trunca a 80 y sigue siendo válida
    const long = 'b'.repeat(100);
    const res = validateCustomTaxonomyValue({ value: 'otro', customValue: long });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.customValue.length).toBe(80);
  });

  it('resolveEffectiveLabel usa customValue cuando es otro', () => {
    const sel = { value: 'otro', label: 'Otro', customValue: 'Derecho energético' };
    expect(resolveEffectiveLabel('otro', sel, MATTERS)).toBe('Derecho energético');
    expect(resolveEffectiveLabel('civil', null, MATTERS)).toBe('Civil');
  });

  it('serializeTaxonomyForPipeline incluye labels efectivos y custom', () => {
    const sel = {
      matter: 'otro',
      matterCustom: { value: 'otro', label: 'Otro', customValue: 'Derecho energético' },
      jurisdiction: 'federal',
      jurisdictionCustom: null,
      documentType: 'otro',
      documentTypeCustom: { value: 'otro', label: 'Otro', customValue: 'Escrito de prueba' },
    };
    const ser = serializeTaxonomyForPipeline(sel as any);
    expect(ser.matterLabel).toBe('Derecho energético');
    expect(ser.jurisdictionLabel).toBe('Federal');
    expect(ser.documentTypeLabel).toBe('Escrito de prueba');
    expect(ser.matterCustom).toEqual(sel.matterCustom);
  });

  it('las 4 pestañas deben poder importar la misma taxonomía sin duplicar listas', async () => {
    // Simula que todos los tabs importan del mismo índice
    const taxIndex = await import('@/lib/legal-taxonomy');
    expect(taxIndex.MATTERS).toBe(MATTERS);
    expect(taxIndex.JURISDICTIONS).toBe(JURISDICTIONS);
    expect(taxIndex.DOCUMENT_TYPES).toBe(DOCUMENT_TYPES);
  });
});
