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

  it('conserva los módulos activos y no reintroduce vistas ficticias', () => {
    const modules = fs.readFileSync(modulesPath, 'utf8');
    expect(modules).toContain('Métricas y actividad derivadas de datos persistidos');
    expect(modules).toContain('Cómputo de Términos');
    expect(modules).toContain('Jurisprudencia SCJN');
    expect(modules).toContain('Alertas DOF y Boletín');
    expect(modules).not.toMatch(/function (HomeView|ExpedientesView|TermsView|ResearchView|LibraryView|AlertsView|SettingsView|HelpView)\s*\(/);
  });

  it('declara la composición vertical + dos paneles simétricos del Motor Jurídico', () => {
    const page = fs.readFileSync(pagePath, 'utf8');
    expect(page).toContain('universal-analysis-layout');
    expect(page).toContain('universal-analysis-inspector');
  });

  it('mantiene estados explícitos para los módulos sin persistencia o fuente', () => {
    const modules = fs.readFileSync(modulesPath, 'utf8');
    expect(modules).toContain('No se muestran expedientes de demostración');
    expect(modules).toContain('resultado PROVISIONAL');
    expect(modules).toContain('Fechas excluidas configuradas');
  });
});
