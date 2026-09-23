import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const pagePath = path.resolve(process.cwd(), 'app/machotes/page.tsx');
const shellPath = path.resolve(process.cwd(), 'components/layout/AppShell.tsx');
const modulesPath = path.resolve(process.cwd(), 'app/machotes/components/WorkspaceModulesView.tsx');

describe('Workspace visual modules contract', () => {
  it('expone Inicio como entrada por defecto y registra las pestañas de trabajo', () => {
    const page = fs.readFileSync(pagePath, 'utf8');
    const shell = fs.readFileSync(shellPath, 'utf8');

    expect(page).toContain("|| 'inicio'");
    for (const tab of ['inicio', 'expedientes', 'terminos', 'jurisprudencia', 'biblioteca', 'alertas', 'configuracion', 'ayuda']) {
      expect(page).toContain(`'${tab}'`);
      expect(shell).toContain(`tab: '${tab}'`);
    }
  });

  it('conserva una composición de tres torres para Inicio y módulos de biblioteca', () => {
    const modules = fs.readFileSync(modulesPath, 'utf8');
    expect(modules).toContain('workspace-home-towers');
    expect(modules).toContain('Mis Plantillas');
    expect(modules).toContain('Cómputo de Términos');
    expect(modules).toContain('Jurisprudencia SCJN');
    expect(modules).toContain('Alertas DOF y Boletín');
  });

  it('declara la composición vertical + dos paneles simétricos del Motor Jurídico', () => {
    const page = fs.readFileSync(pagePath, 'utf8');
    expect(page).toContain('universal-analysis-layout');
    expect(page).toContain('universal-analysis-inspector');
  });

  it('usa claves únicas para los encabezados repetidos del calendario', () => {
    const modules = fs.readFileSync(modulesPath, 'utf8');
    expect(modules).toContain("map((day, index) => <span key={`${day}-${index}`}");
  });
});
