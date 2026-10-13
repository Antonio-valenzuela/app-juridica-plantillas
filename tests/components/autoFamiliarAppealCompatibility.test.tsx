// @vitest-environment jsdom
import React from 'react';
// Mismo doble de catálogo que appealPhase1b: la disponibilidad productiva se prueba aparte.
vi.mock('@/lib/catalog/legalCatalog', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/catalog/legalCatalog')>();
  const approved = new Set(['apelacion_civil', 'apelacion_familiar', 'contestacion_demanda_civil']);
  return { ...actual,
    getContestacionesDocumentOptions: () => [
      ...actual.getContestacionesDeclaredDocumentTypes().filter(item => approved.has(item.id)).map(item => ({ value: item.id, label: item.label })),
      { value: 'redaccion_libre', label: 'Redacción libre' },
    ],
    getFunctionalDocumentStatus: (id: string) => approved.has(id) ? 'PASS' : actual.getFunctionalDocumentStatus(id),
  };
});
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CaseDocumentsReader } from '@/app/machotes/components/CaseDocumentsReader';
import { autoFamiliarLargo } from '../fixtures/autoFamiliarSintetico';

afterEach(cleanup);

/**
 * Fase 2 · Parte 1 — caso reportado: PDF de 44 páginas de un juzgado FAMILIAR cuyo acto es un
 * auto que desecha un incidente y cita para sentencia, con «Apelación Civil» elegida.
 */
const pdf = autoFamiliarLargo('auto-familiar-ui', 44);
const documentRow = { id: 'auto-familiar-ui', name: 'auto-familiar.pdf', type: 'pdf', status: 'READY', pages: pdf.pages } as never;

function choose(value: string) {
  const select = screen.getAllByRole('combobox').find(element => element.querySelector('option[value="apelacion_civil"]'))!;
  fireEvent.change(select, { target: { value } });
}

it('no bloquea con el mensaje de «contestación requiere la demanda» ni cambia la actuación elegida', () => {
  render(<CaseDocumentsReader documents={[documentRow]} sourceDocs={[pdf]} onSelectDocument={vi.fn()} />);
  choose('apelacion_civil');
  const select = screen.getAllByRole('combobox').find(element => element.querySelector('option[value="apelacion_civil"]')) as HTMLSelectElement;
  expect(select.value).toBe('apelacion_civil');
  const text = document.body.textContent || '';
  expect(text).not.toMatch(/una contestaci[oó]n requiere la demanda/i);
  expect(text).not.toMatch(/SOURCE_DOCUMENT_INCOMPATIBLE/);
  expect(screen.queryByTestId('source-incompatible-notice')).toBeNull();
});

const advisories = () => screen.queryAllByTestId('compatibility-advisory').map((element) => element.textContent || '');

it('muestra el aviso de materia (familiar con tipo civil) sin pedir elegir de nuevo lo ya elegido', () => {
  render(<CaseDocumentsReader documents={[documentRow]} sourceDocs={[pdf]} onSelectDocument={vi.fn()} />);
  choose('apelacion_civil');
  const matter = advisories().find((text) => /materia familiar/i.test(text));
  expect(matter, advisories().join(' | ')).toBeTruthy();
  expect(matter).toMatch(/c[oó]digo procesal aplicable sea el civil/i);
  // El auto que resuelve un incidente pide confirmar la procedencia del recurso, con sus páginas.
  expect(advisories().some((text) => /auto que resuelve un incidente/i.test(text) && /pp\. 1-/.test(text))).toBe(true);
  // Los avisos son informativos: no se le pide al abogado volver a seleccionar la actuación.
  expect(document.body.textContent || '').not.toMatch(/selecciona (?:el )?tipo de escrito/i);
});

it('con Apelación Familiar el mismo PDF no muestra aviso de materia', () => {
  render(<CaseDocumentsReader documents={[documentRow]} sourceDocs={[pdf]} onSelectDocument={vi.fn()} />);
  choose('apelacion_familiar');
  expect(advisories().some((text) => /materia familiar|materia civil/i.test(text))).toBe(false);
});
