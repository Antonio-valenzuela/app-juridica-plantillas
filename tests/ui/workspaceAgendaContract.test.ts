import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const modulesView = readFileSync(resolve(root, 'app/machotes/components/WorkspaceModulesView.tsx'), 'utf8');
const page = readFileSync(resolve(root, 'app/machotes/page.tsx'), 'utf8');

describe('workspace agenda contract', () => {
  it('exposes a calendar with automatic priority and review states', () => {
    expect(modulesView).toContain('Agenda del expediente');
    expect(modulesView).toContain('Alta');
    expect(modulesView).toContain('Media');
    expect(modulesView).toContain('Baja');
    expect(modulesView).toContain('Marcar como atendido');
    expect(modulesView).toContain('needsReview');
  });

  it('synchronizes the generated document into the agenda', () => {
    expect(page).toContain('extractAgendaEvents');
    expect(page).toContain('synchronizeDocumentAgenda');
    expect(page).toContain('writeAgendaEvents');
  });

  it('mantiene el calendario compacto y abre el detalle del día seleccionado', () => {
    expect(modulesView).toContain('selectedAgendaDate');
    expect(modulesView).toContain('selectedDayEvents');
    expect(modulesView).toContain('Seleccionar eventos del');
    expect(modulesView).toContain('Día seleccionado');
    expect(modulesView).toContain('Círculos de prioridad');
    expect(modulesView).toContain('min-h-[34px]');
  });

  it('aísla el calendario mensual del estilo global .grid para mantener siete columnas compactas', () => {
    expect(modulesView).toContain('!grid-cols-7');
    expect(modulesView).toContain('!mb-0');
    expect(modulesView).toContain('min-h-[34px]');
    expect(modulesView).toContain('self-start');
  });
});
