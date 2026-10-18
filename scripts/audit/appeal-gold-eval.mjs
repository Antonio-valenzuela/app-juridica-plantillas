#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function argumentsMap(args) {
  const values = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) values[args[i].slice(2)] = args[++i];
  }
  return values;
}

const args = argumentsMap(process.argv.slice(2));
const goldPath = args.gold || process.env.APPEAL_GOLD_FILE || 'audit/apelaciones-fase-2b/appeal-gold.local.json';
const actualPath = args.actual;
if (!actualPath || !goldPath) {
  console.error('Uso: node scripts/audit/appeal-gold-eval.mjs --actual <clasificacion.json> [--gold <gold.local.json>]');
  process.exit(2);
}

const readJson = async file => JSON.parse(await readFile(path.resolve(file), 'utf8'));
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es-MX');
const aliases = {
  adverse: ['adverse', 'adversas', 'adversa'],
  favorable: ['favorable', 'favorables'],
  neutral: ['neutral', 'neutrales'],
};
const pickCategory = (source, keys) => {
  for (const key of keys) if (Array.isArray(source?.[key])) return source[key];
  return [];
};

try {
  const [gold, actual] = await Promise.all([readJson(goldPath), readJson(actualPath)]);
  const goldSections = gold.sections || gold;
  const goldByCategory = Object.fromEntries(Object.entries(aliases).map(([category, keys]) => [
    category,
    new Set(pickCategory(goldSections, keys).map(item => normalize(typeof item === 'string' ? item : item.section)).filter(Boolean)),
  ]));
  const actualRows = Array.isArray(actual.classifications) ? actual.classifications : Array.isArray(actual.blocks) ? actual.blocks : [];
  if (!actualRows.length) throw new Error('El archivo --actual no contiene classifications[] ni blocks[].');
  const predictedAdverse = new Map();
  for (const row of actualRows) {
    if (String(row.impact || row.afectacion).toUpperCase() !== 'ADVERSE') continue;
    const key = normalize(row.section);
    if (!key) continue;
    if (!predictedAdverse.has(key)) predictedAdverse.set(key, row.section);
  }
  const goldAdverse = goldByCategory.adverse;
  const truePositives = [...predictedAdverse.keys()].filter(section => goldAdverse.has(section));
  const falsePositives = [...predictedAdverse.keys()].filter(section => !goldAdverse.has(section)).map(section => ({
    section: predictedAdverse.get(section),
    goldCategory: goldByCategory.favorable.has(section) ? 'favorable' : goldByCategory.neutral.has(section) ? 'neutral' : 'not-listed',
  }));
  const falseNegatives = [...goldAdverse].filter(section => !predictedAdverse.has(section));
  const precisionDenominator = truePositives.length + falsePositives.length;
  const recallDenominator = truePositives.length + falseNegatives.length;
  const result = {
    goldFile: path.resolve(goldPath),
    actualFile: path.resolve(actualPath),
    counts: { actualBlocks: actualRows.length, goldAdverseSections: goldAdverse.size, truePositives: truePositives.length, falsePositives: falsePositives.length, falseNegatives: falseNegatives.length },
    adversePrecision: precisionDenominator ? truePositives.length / precisionDenominator : null,
    adverseRecall: recallDenominator ? truePositives.length / recallDenominator : null,
    falsePositiveSections: falsePositives,
    falseNegativeSections: falseNegatives,
    note: 'Evaluación comparativa; no verifica autoridades, evidencia ni corrección jurídica del gold. Secciones comparadas sin distinguir acentos ni espacios repetidos.',
  };
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`No se pudo evaluar el gold: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
