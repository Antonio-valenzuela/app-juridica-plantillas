import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { importCanonicalManual, loadActiveManual } from '../../lib/operational-manual/store';
import { retrieveManualRules, auditOperationalManual } from '../../lib/operational-manual/core';

const source = 'C:\\Users\\yahir\\Downloads\\LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf';
describe.skipIf(!existsSync(source))('importación PDF canónico local', () => {
  it('procesa todas las páginas sin alterar el original', async () => {
    const before = createHash('sha256').update(readFileSync(source)).digest('hex');
    const index = await importCanonicalManual(source, 'C:\\Users\\yahir\\Desktop\\APP-plantillas\\data\\documents');
    expect(index.manifest.detectedPages).toBe(212);
    expect(index.manifest.processedPages).toBe(212);
    expect(index.manifest.errors).toEqual([]);
    expect(index.manifest.sourceHash).toBe(before);
    expect(createHash('sha256').update(readFileSync(source)).digest('hex')).toBe(before);
  }, 120_000);
  it('recupera reglas reales de penal y civil sin traer indiscriminadamente la otra materia', async () => {
    const index = await loadActiveManual('C:\\Users\\yahir\\Desktop\\APP-plantillas\\data\\documents');
    expect(index).not.toBeNull();
    const penal = retrieveManualRules(index!, { matter: 'PENAL', task: 'actuación penal', budgetChars: 4500 });
    const civil = retrieveManualRules(index!, { matter: 'CIVIL', task: 'litigio civil', budgetChars: 4500 });
    expect(penal.selected.some((fragment) => /penal/i.test(fragment.originalText))).toBe(true);
    expect(penal.selected.some((fragment) => /● hechos;/i.test(fragment.originalText))).toBe(true);
    expect(penal.selected.some((fragment) => /● jurisprudencia;/i.test(fragment.originalText))).toBe(true);
    expect(civil.selected.some((fragment) => /civil/i.test(fragment.originalText))).toBe(true);
    expect(penal.selected.some((fragment) => /pruebas civiles/i.test(fragment.originalText))).toBe(false);
    expect([...penal.selected, ...civil.selected].some((fragment) => /PB\s+JUR[IÍ]DICO|EDGARDO\s+PALACIOS/i.test(fragment.originalText))).toBe(false);
    expect(penal.usedChars).toBeLessThanOrEqual(4500);
    expect(civil.usedChars).toBeLessThanOrEqual(4500);
  });
  it('audita con reglas reales y exige revisión sin producir FINAL', async () => {
    const index = await loadActiveManual('C:\\Users\\yahir\\Desktop\\APP-plantillas\\data\\documents');
    const findings = auditOperationalManual(index!, 'Se citó jurisprudencia sin fuente oficial.', { matter: 'AMPARO' });
    expect(findings.some((finding) => finding.status === 'REVIEW_REQUIRED')).toBe(true);
    expect(findings.every((finding) => finding.physicalPage >= 1 && finding.physicalPage <= 212)).toBe(true);
  });
});
