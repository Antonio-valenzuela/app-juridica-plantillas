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

  it('no mezcla el estado de error de investigación con el estado vacío', () => {
    const modules = fs.readFileSync(modulesPath, 'utf8');
    expect(modules).toContain('!hasError && !loading && query && results.length === 0');
    expect(modules).toContain('No encontramos criterios verificables para esta búsqueda.');
  });

  it('mantiene lenguaje de usuario en la vista normal de investigación', () => {
    const modules = fs.readFileSync(modulesPath, 'utf8').toLocaleLowerCase();
    for (const technicalLabel of ['fallback oficial', 'corpus iuris no conectado', 'api error', 'endpoint', 'http 500', 'token']) {
      expect(modules).not.toContain(technicalLabel);
    }
  });

  it('conecta selección de expediente con el contexto y reapertura del borrador real', () => {
    const page = fs.readFileSync(pagePath, 'utf8');
    const modules = fs.readFileSync(modulesPath, 'utf8');
    expect(modules).toContain('onCaseSelected?.(item)');
    expect(modules).toContain('onOpenCase(selected)');
    expect(page).toContain('handleReopenDraft(summary.id)');
    expect(page).toContain('caseId: summary.id');
  });

  it('distingue Biblioteca Jurídica y muestra actualización de publicaciones oficiales', () => {
    const modules = fs.readFileSync(modulesPath, 'utf8');
    expect(modules).toContain('Biblioteca Jurídica');
    expect(modules).toContain('Actualizar publicaciones');
    expect(modules).toContain('lastUpdated');
    expect(modules).toContain('Fuente oficial');
    expect(modules).toContain('Última consulta:');
  });

  it('expone una advertencia jurídica orientativa sin lenguaje alarmista', () => {
    const modules = fs.readFileSync(modulesPath, 'utf8');
    expect(modules).toContain('Cálculo orientativo. Verifica los días inhábiles y las reglas aplicables antes de utilizar la fecha.');
    expect(modules).toContain('no incorpora el calendario oficial de días inhábiles del Poder Judicial Federal');
    expect(modules).toContain('festivos oficiales, suspensiones de labores o acuerdos específicos pueden mover la fecha real');
  });

  it('muestra estado operativo legible para los cuatro servicios del despacho', () => {
    const modules = fs.readFileSync(modulesPath, 'utf8');
    for (const label of ['Base de datos', 'Investigación jurídica', 'Publicaciones oficiales', 'Generación documental']) {
      expect(modules).toContain(label);
    }
    for (const status of ['Operativo', 'Requiere atención', 'No disponible']) {
      expect(modules).toContain(status);
    }
    for (const technicalLabel of ['Prisma', 'Gemini', 'Groq', 'NVIDIA', 'HTTP 500']) {
      expect(modules).not.toContain(technicalLabel);
    }
  });
});
