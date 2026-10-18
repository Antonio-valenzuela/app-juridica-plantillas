// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCaseWorkflow } from '@/lib/legal-engine/caseWorkflow';
import { buildTemplateSectionPreview, sanitizeSectionKinds, type SectionKindOverrides } from '@/lib/templates/templatePreview';
import { TemplateSectionPreview } from '@/components/machotes/TemplateSectionPreview';

const TEMPLATE = `ESCRITO DE CONTESTACIÓN
C. Juez de lo Civil. Presente.

HECHOS
Los hechos del caso se narran aquí con detalle suficiente para el modelo del despacho.

PRUEBAS
Documental pública.

PROTESTO LO NECESARIO
Atentamente.
`;

afterEach(cleanup);

describe('vista previa de secciones de la plantilla', () => {
  it('marca fórmulas y sustantivas y refleja las correcciones del abogado', () => {
    const base = buildTemplateSectionPreview(TEMPLATE);
    const kind = (rows: typeof base, title: string) => rows.find((row) => row.title === title)?.kind;
    expect(kind(base, 'HECHOS')).toBe('SUSTANTIVA');
    expect(kind(base, 'PRUEBAS')).toBe('SUSTANTIVA');
    expect(kind(base, 'PROTESTO LO NECESARIO')).toBe('FORMULA');

    const changed = buildTemplateSectionPreview(TEMPLATE, { hechos: 'FORMULA' });
    expect(changed.find((row) => row.title === 'HECHOS')).toMatchObject({ kind: 'FORMULA', autoKind: 'SUSTANTIVA', overridden: true });
  });

  it('el servidor solo acepta valores válidos y el flujo los conserva', () => {
    expect(sanitizeSectionKinds({ hechos: 'FORMULA', pruebas: 'otra', '': 'FORMULA', x: 3 })).toEqual({ hechos: 'FORMULA' });
    expect(sanitizeSectionKinds('no')).toBeUndefined();
    const workflow = buildCaseWorkflow({
      sourceDocuments: [],
      analysis: { facts: [], missingData: [] },
      generationMode: 'personal_template',
      templateId: 'tpl',
      sectionKinds: { hechos: 'FORMULA', basura: 'X' },
    } as never);
    expect(workflow.selection.sectionKinds).toEqual({ hechos: 'FORMULA' });
  });

  it('el componente permite cambiar el tratamiento de una sección', () => {
    let latest: SectionKindOverrides = {};
    function Harness() {
      const [overrides, setOverrides] = useState<SectionKindOverrides>({});
      latest = overrides;
      return <TemplateSectionPreview templateText={TEMPLATE} overrides={overrides} onChange={setOverrides} />;
    }
    render(<Harness />);
    const select = screen.getByLabelText('Tratamiento de HECHOS') as HTMLSelectElement;
    expect(select.value).toBe('SUSTANTIVA');
    fireEvent.change(select, { target: { value: 'FORMULA' } });
    expect(latest).toEqual({ hechos: 'FORMULA' });
    expect(screen.getByText(/cambiado por ti/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tratamiento de HECHOS'), { target: { value: 'SUSTANTIVA' } });
    expect(latest).toEqual({});
  });
});
