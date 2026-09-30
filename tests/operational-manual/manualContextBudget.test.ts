import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { retrieveManualRules, type ManualIndex } from '../../lib/operational-manual/core';

it('counts IDs and page labels inside the effective manual context budget', () => {
  const index = JSON.parse(readFileSync('data/documents/operational-manual/v1.0/index.json', 'utf8')) as ManualIndex;
  const measure = (rules: typeof index.fragments) => ('\n\nGUÍA OPERATIVA INTERNA LEX PLANTILLAS (NO ES AUTORIDAD JURÍDICA NI FUENTE DE HECHOS):\n' + rules.map(rule => `[${rule.stableRuleId} | página física ${rule.physicalPage}] ${rule.originalText.trim()}`).join('\n')).length;
  const selection = retrieveManualRules(index, {
    matter: 'PENAL', task: 'análisis y redacción de escrito', budgetChars: 4500,
    measureContext: measure,
  });
  expect(measure(selection.selected)).toBeLessThanOrEqual(4500);
  expect(selection.selected.some(rule => rule.alwaysActive)).toBe(true);
});
