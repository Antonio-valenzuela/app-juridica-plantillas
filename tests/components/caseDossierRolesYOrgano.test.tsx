// @vitest-environment jsdom
// FASE A (lote 2): estas pruebas FIJAN el comportamiento deseado y fallan hoy a propósito (ver las marcadas «REGRESIÓN»,
// que ya pasan y deben seguir pasando).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CaseDossierPanel, type CaseDossierState } from '@/app/machotes/components/CaseDossierPanel';
import { OFFICIAL_DOCUMENT_MATRIX } from '../fixtures/documentosOficialesSinteticos';
import { ISSUING_COURT, SOURCE_AUTHORITY, sentenciaDisenoReal } from '../fixtures/sentenciaAmparoDirectoDisenoRealSintetica';

afterEach(cleanup);

const last = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)![0] as CaseDossierState;
const select = () => screen.getByLabelText('Parte que representas') as HTMLSelectElement;
const confirmBox = () => screen.getByLabelText('Confirmar ficha del caso') as HTMLInputElement;
const nameInput = () => screen.getByLabelText('Nombre de la parte representada') as HTMLInputElement;
const optionByLabel = (pattern: RegExp) => screen.getAllByRole('option').find((option) => pattern.test(option.textContent || '')) as HTMLOptionElement | undefined;
/** Texto del <dd> que acompaña a un <dt> de la ficha. */
const factOf = (label: string) => {
  const term = within(screen.getByTestId('case-dossier-panel')).queryByText(label, { selector: 'dt' });
  return term?.nextElementSibling?.textContent ?? undefined;
};

function renderAmparoDirecto() {
  const onChange = vi.fn();
  render(<CaseDossierPanel sources={[sentenciaDisenoReal()]} documentType="recurso_revision_amparo_directo" onChange={onChange} />);
  return onChange;
}

const ROLE_OPTIONS: Array<[string, RegExp, string]> = [
  ['quejoso', /Quejoso.*nombre testado/i, 'quejoso'],
  ['tercero interesado', /Tercero interesado.*nombre no consta/i, 'tercero_interesado'],
  ['Ayuntamiento demandado', /Ayuntamiento.*demandado.*nombre testado|demandado.*Ayuntamiento.*nombre testado/i, 'demandado'],
];

describe('(a) roles detectados aunque el nombre esté testado', () => {
  it('no preselecciona nada y ofrece un rol por cada parte mencionada sin nombre legible', () => {
    renderAmparoDirecto();
    expect(select().value).toBe('');
    for (const [, pattern] of ROLE_OPTIONS) expect(optionByLabel(pattern), String(pattern)).toBeDefined();
  });

  it.each(ROLE_OPTIONS)('al elegir «%s» el nombre queda vacío y es obligatorio; el rol queda en la ficha', (_name, pattern, role) => {
    const onChange = renderAmparoDirecto();
    fireEvent.change(select(), { target: { value: optionByLabel(pattern)!.value } });
    expect(nameInput().value).toBe('');
    expect(nameInput().required || nameInput().getAttribute('aria-required') === 'true').toBe(true);
    // Sin nombre no hay ficha confirmada, aunque el rol esté elegido.
    expect(confirmBox().disabled).toBe(true);
    expect(last(onChange).dossier).toBeUndefined();

    fireEvent.change(nameInput(), { target: { value: 'Persona Ficticia Ejemplo' } });
    expect(confirmBox().disabled).toBe(false);
    fireEvent.click(confirmBox());
    // El rol no infiere el lado actor/demandado: sigue siendo «otro».
    expect(last(onChange).dossier).toMatchObject({ confirmed: true, representedName: 'Persona Ficticia Ejemplo', representedRole: role, representedSide: 'otro' });
  });

  it('no introduce nombres inventados: los roles testados no aparecen como «partes detectadas»', () => {
    renderAmparoDirecto();
    expect(factOf('Partes')).toBe('No constan');
  });
});

describe('(c) etiquetas del órgano y aviso no bloqueante', () => {
  it('muestra de dónde sale cada órgano', () => {
    renderAmparoDirecto();
    expect(factOf('Órgano que dictó la resolución fuente')).toBe(ISSUING_COURT);
    expect(factOf('Autoridad responsable citada')).toBe(SOURCE_AUTHORITY);
  });

  it('avisa, sin bloquear, cuando el órgano elegido coincide con la autoridad responsable detectada', () => {
    const onChange = renderAmparoDirecto();
    expect(screen.getByText(/coincide con la autoridad responsable/i)).toBeTruthy();
    fireEvent.change(select(), { target: { value: '__otra__' } });
    fireEvent.change(nameInput(), { target: { value: 'Persona Ficticia Ejemplo' } });
    expect(confirmBox().disabled).toBe(false);
    fireEvent.click(confirmBox());
    expect(last(onChange).dossier).toMatchObject({ confirmed: true });
  });

  it('el aviso desaparece al elegir otro órgano', () => {
    renderAmparoDirecto();
    expect(screen.getByText(/coincide con la autoridad responsable/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Órgano jurisdiccional'), { target: { value: ISSUING_COURT } });
    expect(screen.queryByText(/coincide con la autoridad responsable/i)).toBeNull();
  });
});

describe('(d) REGRESIÓN: lo que no es el recurso contra una resolución no cambia en el diálogo', () => {
  it('la contestación a la revisión extraordinaria (sin presentacionPor) no muestra roles, etiquetas ni aviso nuevos', () => {
    render(<CaseDossierPanel sources={[sentenciaDisenoReal()]} documentType="contestacion_revision_extraordinaria_amparo_directo" onChange={vi.fn()} />);
    expect(factOf('Órgano')).toBe(SOURCE_AUTHORITY);
    expect(factOf('Órgano que dictó la resolución fuente')).toBeUndefined();
    expect(factOf('Autoridad responsable citada')).toBeUndefined();
    expect(screen.queryByText(/coincide con la autoridad responsable/i)).toBeNull();
    expect(screen.queryAllByRole('option').some((option) => /nombre testado|nombre no consta/i.test(option.textContent || ''))).toBe(false);
  });

  it('conserva la fila «Órgano» y no muestra etiquetas ni avisos nuevos', () => {
    const source = OFFICIAL_DOCUMENT_MATRIX.find((item) => item.id === 'demanda-civil')!.source;
    render(<CaseDossierPanel sources={[source]} documentType="contestacion_demanda_civil" onChange={vi.fn()} />);
    expect(factOf('Órgano')).toBe('JUEZ SEGUNDO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL');
    expect(factOf('Órgano que dictó la resolución fuente')).toBeUndefined();
    expect(factOf('Autoridad responsable citada')).toBeUndefined();
    expect(screen.queryByText(/coincide con la autoridad responsable/i)).toBeNull();
    expect(screen.queryAllByRole('option').some((option) => /nombre testado|nombre no consta/i.test(option.textContent || ''))).toBe(false);
  });
});
