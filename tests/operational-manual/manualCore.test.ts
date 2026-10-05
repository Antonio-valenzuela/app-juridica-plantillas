import { describe, expect, it } from 'vitest';
import { buildManualIndex, retrieveManualRules, formatManualTaskContext, auditOperationalManual } from '../../lib/operational-manual/core';
import { createEmptyDocument } from '../../lib/legal-engine/types';
import { createGenerationTraceContext } from '../../lib/legal-engine/generationTrace';

const pages = Array.from({ length: 212 }, (_, index) => ({
  physicalPage: index + 1,
  text: index === 0 ? 'No inventar hechos ni jurisprudencia. Mantener trazabilidad.'
    : index === 1 ? 'En materia civil analizar pretensiones y pruebas civiles.'
    : index === 2 ? 'En materia penal analizar imputación, defensa y pruebas penales.'
    : index === 3 ? 'En amparo analizar acto reclamado y conceptos de violación.'
    : `Página ${index + 1}. Contenido general de auditoría.`,
}));

describe('manual operativo', () => {
  const manual = buildManualIndex(pages, { manualId: 'lex-operativo', version: '1.0', sourceHash: 'abc' });
  it('conserva las 212 páginas, incluso contenido no clasificado, con páginas físicas válidas', () => {
    expect(manual.manifest.detectedPages).toBe(212);
    expect(manual.manifest.processedPages).toBe(212);
    expect(new Set(manual.fragments.map((item) => item.physicalPage)).size).toBe(212);
    expect(manual.fragments.every((item) => item.physicalPage >= 1 && item.physicalPage <= 212)).toBe(true);
    expect(manual.fragments.every((item) => item.originalText.length > 0)).toBe(true);
  });
  it('recupera PENAL sin inyectar contenido civil indiscriminadamente', () => {
    const result = retrieveManualRules(manual, { matter: 'PENAL', task: 'defensa penal', budgetChars: 1500 });
    expect(result.selected.some((item) => item.originalText.includes('imputación'))).toBe(true);
    expect(result.selected.some((item) => item.originalText.includes('pruebas civiles'))).toBe(false);
    expect(result.selected.some((item) => item.originalText.includes('No inventar'))).toBe(true);
  });
  it('recupera CIVIL y AMPARO según contexto', () => {
    expect(retrieveManualRules(manual, { matter: 'CIVIL', task: 'pretensiones', budgetChars: 1500 }).selected.some((item) => item.originalText.includes('pretensiones'))).toBe(true);
    expect(retrieveManualRules(manual, { matter: 'AMPARO', task: 'acto reclamado', budgetChars: 1500 }).selected.some((item) => item.originalText.includes('acto reclamado'))).toBe(true);
  });
  it('auditoría puede requerir revisión pero no declarar FINAL', () => {
    const findings = auditOperationalManual(manual, 'Se citó jurisprudencia sin fuente oficial.', { matter: 'GENERAL' });
    expect(findings.some((item) => item.status === 'REVIEW_REQUIRED')).toBe(true);
    expect(findings.every((item) => !('final' in item))).toBe(true);
  });
  it('una página vacía se registra y bloquea la activación, sin desaparecer', () => {
    const broken = buildManualIndex(pages.map((page) => page.physicalPage === 40 ? { ...page, text: '' } : page), { manualId: 'lex-operativo', version: '1.0', sourceHash: 'abc' });
    expect(broken.manifest.processedPages).toBe(212);
    expect(broken.manifest.emptyPages).toEqual([40]);
    expect(broken.manifest.active).toBe(false);
  });
  it('avisa si el índice interno referencia paginación lógica mayor que las páginas físicas', () => {
    const withLogicalToc = pages.map((page, index) => index === 0
      ? { ...page, text: 'ÍNDICE\n11. Estilo y Conocimiento Operativo del Despacho ........ 219–223\n' }
      : page);
    const indexed = buildManualIndex(withLogicalToc, { manualId: 'lex-operativo', version: '1.0', sourceHash: 'toc' });
    expect(indexed.manifest.warnings).toContain('LOGICAL_PAGE_REFERENCE_OUT_OF_RANGE:223>212');
    expect(indexed.manifest.active).toBe(true);
  });
  it('excluye perfil interno y formato del asistente antes de seleccionar y al formatear', () => {
    const sectionPages = pages.map((page, index) => {
      if (index === 0) return { ...page, text: 'ÍNDICE\n11. Estilo y Conocimiento Operativo del Despacho\n12. Formato de respuesta del asistente\n13. Metodología de agravios\n' };
      if (index === 207) return { ...page, text: '11. Estilo y Conocimiento Operativo del Despacho\npráctica interna del despacho para asuntos civiles\n' };
      if (index === 208) return { ...page, text: 'continuación de criterios internos del despacho\n' };
      if (index === 209) return { ...page, text: '12. Formato de respuesta del asistente\nSalida esperada en JSON para el asistente\n' };
      if (index === 210) return { ...page, text: '13. Metodología de agravios\nAnalizar el agravio con premisa y conclusión verificables\n' };
      return page;
    });
    const index = buildManualIndex(sectionPages, { manualId: 'lex-operativo', version: '1.0', sourceHash: 'scope' });
    const result = retrieveManualRules(index, { matter: 'CIVIL', task: 'agravios metodología interna despacho JSON', budgetChars: 4000 });
    const excluded = index.fragments.filter(fragment => fragment.physicalPage >= 208 && fragment.physicalPage <= 210);
    expect(excluded.some(fragment => fragment.scope === 'INTERNAL_PROFILE_ONLY')).toBe(true);
    expect(excluded.some(fragment => fragment.scope === 'ASSISTANT_OUTPUT_FORMAT')).toBe(true);
    expect(result.selected.every(fragment => fragment.scope === 'DRAFTING')).toBe(true);
    expect(formatManualTaskContext(excluded)).not.toMatch(/práctica interna|Salida esperada en JSON/i);
  });
  it('GenerationTrace conserva versión, regla, página y hallazgo sin alterar el gate', () => {
    const trace = createGenerationTraceContext({ doc: createEmptyDocument(), options: { enabled: true } });
    trace.trace.operationalManual = {
      manualVersion: '1.0', manualHash: 'abc', selectedRuleIds: [manual.fragments[0].stableRuleId],
      selectedPages: [1], selectedSections: [manual.fragments[0].section],
      retrievals: [{ taskId: 'task-1', retrievalStage: 'GENERATION_TASK', selectedRuleIds: [manual.fragments[0].stableRuleId], selectedPages: [1], discardedRulesByContextLimit: [] }],
      auditRuleIds: [manual.fragments[0].stableRuleId],
      auditFindings: [{ ruleId: manual.fragments[0].stableRuleId, physicalPage: 1, status: 'REVIEW_REQUIRED', code: 'SOURCE_CHECK_REQUIRED' }],
    };
    expect(trace.close().operationalManual?.selectedPages).toEqual([1]);
    expect(trace.trace.qualityGateResult).toBeUndefined();
  });
});
