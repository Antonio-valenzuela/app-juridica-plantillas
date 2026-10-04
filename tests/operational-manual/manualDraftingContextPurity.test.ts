import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { retrieveManualRules, formatManualTaskContext, type ManualIndex, type ManualMatter } from '@/lib/operational-manual/core';

/**
 * RED — auditoría de pureza del contexto metodológico.
 *
 * La Guía Operativa debe entrar en los prompts de redacción como METODOLOGÍA
 * (cómo estructurar y razonar). NO debe entrar:
 *   - la sección "11. Estilo y Conocimiento Operativo del Despacho"
 *     (práctica interna del despacho, no metodología transferible), ni
 *   - las secciones de "FORMATO DE RESPUESTA" / esquema de salida
 *     (contrato de la respuesta del asistente, no del escrito jurídico).
 *
 * Fallo observado en la auditoría: el fragmento de la p. 208
 *   "México. Se utilizan de manera habitual el Código Civil para el Estado de
 *    Jalisco y el Código de Procedimientos Civiles para el Estado de Jalisco."
 * entra en los prompts deapelación (AGRAVIOS, ANTECEDENTES) y demanda (HECHOS).
 */
const manualIndexPath = resolve(process.cwd(), 'data/documents/operational-manual/v1.0/index.json');
const available = existsSync(manualIndexPath);
if (!available) console.warn(`[SKIP] manualDraftingContextPurity: falta el índice del manual: ${manualIndexPath}`);

const manual = (available ? JSON.parse(readFileSync(manualIndexPath, 'utf8')) : { fragments: [] }) as ManualIndex;
const M = (value: string) => value as ManualMatter;

/** Práctica/estilo del despacho: conocimiento local, no metodología. */
const DESPACHO_STYLE = /Estilo\s+y\s+Conocimiento\s+Operativo|Conocimiento\s+Operativo\s+del\s+Despacho|se\s+utilizan\s+de\s+manera\s+habitual|como\s+es\s+habitual\s+en\s+el\s+despacho/i;
/** Contrato de respuesta del asistente: no pertenece al escrito jurídico. */
const RESPONSE_FORMAT = /FORMATO\s+DE\s+RESPUESTA|Conclusi[óo]n\s+ejecutiva|Salida\s+esperada|CATEGOR[ÍI]A\s*:?\s*Hallazgos|REGLA\s+OPERATIVA\s+DEL\s+ASISTENTE|PLAN\s+ESTRAT[ÉE]GICO|ACCI[ÓO]N\s+PROPUESTA|REGLAS\s+DE\s+LA\s+IA/i;

const TASKS: Array<{ name: string; matter: ManualMatter; stage: string; title: string; task: string }> = [
  { name: 'apelacion',    matter: 'CIVIL',   stage: 'argument',   title: 'AGRAVIOS',                task: 'AGRAVIOS metodologia del agravio silogismo premisa mayor premisa menor conclusion incongruencia' },
  { name: 'apelacion_bg', matter: 'CIVIL',   stage: 'background', title: 'ANTECEDENTES PROCESALES', task: 'ANTECEDENTES PROCESALES antecedentes cronologia sintesis verificacion' },
  { name: 'contestacion', matter: 'LABORAL', stage: 'argument',   title: 'AGREGADOS',               task: 'AGREGADOS contestacion laboral terminacion existencia preexisting payroll' },
  { name: 'demanda',      matter: 'CIVIL',   stage: 'argument',   title: 'HECHOS',                  task: 'HECHOS demanda hecho prestacion legitima interest configuracion' },
  { name: 'amparo',       matter: 'AMPARO',  stage: 'argument',   title: 'CONCEPTOS DE VIOLACIÓN',   task: 'CONCEPTOS DE VIOLACION concepto de violacion premisa mayor premisa menor conclusion' },
];

describe.skipIf(!available)('el contexto metodológico del Manual no arrastra estilo del despacho ni formato de respuesta', () => {
  for (const task of TASKS) {
    it(`${task.name} (${task.matter}/${task.stage}/${task.title}) no incluye "Estilo y Conocimiento Operativo del Despacho"`, () => {
      const selection = retrieveManualRules(manual, {
        matter: task.matter, caseType: task.name, stage: task.stage, task: task.task,
        budgetChars: 4500, measureContext: rules => formatManualTaskContext(rules).length,
      });
      const leaked = selection.selected.filter(fragment => DESPACHO_STYLE.test(fragment.originalText));
      expect(leaked.map(f => `p${f.physicalPage}: ${f.originalText.trim().slice(0, 80)}`)).toEqual([]);
    });

    it(`${task.name} (${task.matter}/${task.stage}/${task.title}) no incluye secciones de FORMATO DE RESPUESTA`, () => {
      const selection = retrieveManualRules(manual, {
        matter: task.matter, caseType: task.name, stage: task.stage, task: task.task,
        budgetChars: 4500, measureContext: rules => formatManualTaskContext(rules).length,
      });
      const leaked = selection.selected.filter(fragment => RESPONSE_FORMAT.test(fragment.originalText));
      expect(leaked.map(f => `p${f.physicalPage}: ${f.originalText.trim().slice(0, 80)}`)).toEqual([]);
    });
  }

  it('el Manual sigue recovery metodología de agravio (el filtro no vacía el contexto)', () => {
    const selection = retrieveManualRules(manual, {
      matter: M('CIVIL'), caseType: 'apelacion', stage: 'argument',
      task: 'AGRAVIOS metodologia del agravio silogismo premisa mayor premisa menor conclusion',
      budgetChars: 4500, measureContext: rules => formatManualTaskContext(rules).length,
    });
    expect(selection.selected.length).toBeGreaterThan(5);
    expect(selection.selected.some(f => /agravio/i.test(f.originalText))).toBe(true);
  });
});