import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guarda: ningún archivo versionado puede contener datos de clientes o de casos reales
 * (expedientes, nombres de partes, juzgados concretos, rutas personales o nombres de
 * bancos de prueba locales). Los patrones se arman por fragmentos para que esta prueba
 * no se marque a sí misma.
 *
 * Excluidos: package-lock.json y data/lex-mx/ (leyes públicas publicadas en el DOF).
 * Si aparece un falso positivo, corrige el dato o amplía la lista de exclusiones con motivo.
 */

const ROOT = join(__dirname, '..', '..');

const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: 'expediente real', pattern: /\b(800\/2024|1152\/2013|226\/2024|512\/2024|812\/2026|287\/2007|894\/2024|456\/2023)\b/ },
  { label: 'parte real', pattern: new RegExp(['Gal', 'arza'].join('') + '|' + ['Och', 'oa'].join('') + '|Meza González|Sebastiana|Chávez Lozano|Noé C4|NOE C4') },
  { label: 'juzgado de caso', pattern: /Juzg\. ?14|Juzg\. ?2do|Juzgado Quinto Familiar|Juzgado Segundo Civil de Zapopan/ },
  { label: 'hospital de caso', pattern: /HOSPITAL CIVIL|HOPITAL CIVIL/ },
  { label: 'ruta personal', pattern: new RegExp(['Users', 'yahir'].join('[\\\\/]')) },
  { label: 'banco de pruebas local', pattern: /Datos\.zip|audit\/final-legal-readiness/ },
];

const EXCLUDED = (path: string) =>
  path === 'package-lock.json' ||
  path.startsWith('data/lex-mx/') ||
  path === 'tests/security/noClientDataInRepo.test.ts';

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((path) => !EXCLUDED(path));
}

describe('repositorio sin datos de clientes', () => {
  it('ningún archivo versionado contiene expedientes, partes, juzgados ni rutas personales reales', () => {
    const findings: string[] = [];
    for (const path of trackedFiles()) {
      let text: string;
      try {
        text = readFileSync(join(ROOT, path), 'utf8');
      } catch {
        continue; // borrado en el árbol de trabajo pero aún listado
      }
      if (text.includes('\u0000')) continue; // binario
      text.split(/\r?\n/).forEach((line, index) => {
        for (const { label, pattern } of FORBIDDEN) {
          if (pattern.test(line)) findings.push(`${path}:${index + 1} [${label}]`);
        }
      });
    }
    expect(findings, `Datos de clientes detectados:\n${findings.join('\n')}`).toEqual([]);
  }, 180_000); // lee todo el árbol versionado; con la suite completa en paralelo supera 30 s
});
