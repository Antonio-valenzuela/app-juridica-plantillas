// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CaseDocumentsReader } from '@/app/machotes/components/CaseDocumentsReader';
import { CANONICAL_DOCUMENT_TYPES, getCatalogDocument, getContestacionesDeclaredDocumentTypes } from '@/lib/catalog/legalCatalog';

// Política vigente: functionalStatus se calcula con evidencia por ID (hoy todo tipo IMPLEMENTED es PASS) y no equivale a
// certificación jurídica (humanReview PENDING, FINAL bloqueado). La vista del abogado no muestra conteos internos.
let restoreCatalogStatus: () => void = () => undefined;
afterEach(() => { cleanup(); restoreCatalogStatus(); restoreCatalogStatus = () => undefined; });

/** Simula, solo durante la prueba, la regresión de evidencia de un tipo IMPLEMENTED (pasa a FAIL). */
function regressEvidence(id: string) {
  const entry = CANONICAL_DOCUMENT_TYPES.find((item) => item.id === id)!;
  const previous = entry.functionalStatus;
  (entry as { functionalStatus: string }).functionalStatus = 'FAIL';
  restoreCatalogStatus = () => { (entry as { functionalStatus: string }).functionalStatus = previous; };
}

it('renders only the canonically declared Contestaciones options, not name-matched official forms', () => {
  const { container } = render(
    <CaseDocumentsReader documents={[]} onSelectDocument={vi.fn()} />,
  );
  const typeSelector = container.querySelector('select');
  expect(typeSelector).not.toBeNull();

  const ids = [...typeSelector!.options].map((option) => option.value);
  const declaredPass = getContestacionesDeclaredDocumentTypes().map((entry) => entry.id).filter((id) => {
    const type = getCatalogDocument(id);
    return type?.kind === 'DOCUMENT_TYPE' && type.functionalStatus === 'PASS' && type.implemented;
  });
  expect([...ids].sort()).toEqual([...declaredPass, 'redaccion_libre'].sort());
  expect(ids).not.toContain('contestacion_impedimento');
  expect(screen.queryByText(/Tipos en desarrollo \(\d+\)/i)).toBeNull();
  expect(screen.getByText(/Arrastra o selecciona el documento base/i)).toBeTruthy();
  const generateButton = screen.getByRole('button', { name: /Generar contestación/i }) as HTMLButtonElement;
  expect(generateButton.disabled).toBe(true);
  // El estilo ya no depende de clases utilitarias sueltas (migración intencional al sistema de diseño lex-*); lo que importa es que
  // el botón no se pueda accionar sin documento base.
});

it('allows an explicitly selected unaccredited response as an assisted draft when a demand is loaded', () => {
  // Hoy no hay tipos IMPLEMENTED sin evidencia: se simula la regresión de evidencia de uno solo durante la prueba.
  regressEvidence('contestacion_demanda_civil');
  const sourceText = 'DEMANDA CIVIL. PRESTACIONES. HECHOS. PUNTOS PETITORIOS.';
  const source = {
    id: 'synthetic-demand', name: 'demanda-sintetica.pdf', extractedText: sourceText,
    pages: [{ page: 1, text: sourceText }],
    classification: { sourceDocumentType: 'DEMANDA_CIVIL', matter: 'CIVIL', sourceRole: 'PRIMARY' },
  } as any;
  const generate = vi.fn();
  render(
    <CaseDocumentsReader
      documents={[{ id: source.id, name: source.name, type: 'pdf', status: 'READY', pages: source.pages } as any]}
      sourceDocs={[source]}
      onSelectDocument={vi.fn()}
      onGenerateResponse={generate}
    />,
  );

  fireEvent.click(screen.getByRole('checkbox', { name: 'En desarrollo (sin certificar)' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Tipo de escrito' }), { target: { value: 'contestacion_demanda_civil' } });

  // El tipo sin evidencia se rotula como en desarrollo en el propio selector.
  expect([...(screen.getByRole('combobox', { name: 'Tipo de escrito' }) as HTMLSelectElement).options].find((option) => option.value === 'contestacion_demanda_civil')?.text).toMatch(/En desarrollo \(sin certificar\)/);
  // La ficha del caso es un paso previo obligatorio (nada se infiere): el abogado elige a quién representa y la confirma.
  const generateButton = screen.getByRole('button', { name: /Generar contestación/i }) as HTMLButtonElement;
  expect(generateButton.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Parte que representas'), { target: { value: '__otra__' } });
  fireEvent.change(screen.getByLabelText('Nombre de la parte representada'), { target: { value: 'EMPRESA FICTICIA DEMANDADA, S.A. DE C.V.' } });
  fireEvent.change(screen.getByLabelText('Órgano jurisdiccional'), { target: { value: 'JUZGADO PRIMERO DE LO CIVIL SINTÉTICO' } });
  fireEvent.change(screen.getByLabelText('Lugar de presentación'), { target: { value: 'Zapopan, Jalisco' } });
  fireEvent.change(screen.getByLabelText('Número de expediente de la ficha'), { target: { value: '0001/2026' } });
  fireEvent.click(screen.getByLabelText('Confirmar ficha del caso'));
  expect(generateButton.disabled).toBe(false);
  fireEvent.click(generateButton);
  expect(generate).toHaveBeenCalledWith(expect.objectContaining({
    selectedDocumentType: 'contestacion_demanda_civil',
    uncertifiedDraftAcknowledged: true,
  }));
});

it('a type with evidence (PASS) is generated as a reviewable draft without the in-development notice', () => {
  const sourceText = 'DEMANDA CIVIL. PRESTACIONES. HECHOS. PUNTOS PETITORIOS.';
  const source = {
    id: 'synthetic-demand', name: 'demanda-sintetica.pdf', extractedText: sourceText,
    pages: [{ page: 1, text: sourceText }],
    classification: { sourceDocumentType: 'DEMANDA_CIVIL', matter: 'CIVIL', sourceRole: 'PRIMARY' },
  } as any;
  render(
    <CaseDocumentsReader
      documents={[{ id: source.id, name: source.name, type: 'pdf', status: 'READY', pages: source.pages } as any]}
      sourceDocs={[source]}
      onSelectDocument={vi.fn()}
      onGenerateResponse={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Tipo de escrito' }), { target: { value: 'contestacion_demanda_civil' } });
  expect(screen.queryByText(/Borrador asistido: revisión obligatoria/)).toBeNull();
});

it('a sentence loaded for a contestation is rejected as source and the appeal path is offered in Spanish', async () => {
  const sourceText = 'SENTENCIA DEFINITIVA EN MATERIA CIVIL. RESUELVE EL JUICIO.';
  const source = {
    id: 'synthetic-judgment', name: 'sentencia-sintetica.pdf', extractedText: sourceText,
    pages: [{ page: 1, text: sourceText }],
    classification: { sourceDocumentType: 'SENTENCIA_O_RESOLUCION', matter: 'CIVIL', sourceRole: 'PRIMARY' },
  } as any;
  render(
    <CaseDocumentsReader
      documents={[{ id: source.id, name: source.name, type: 'pdf', status: 'READY', pages: source.pages } as any]}
      sourceDocs={[source]}
      onSelectDocument={vi.fn()}
    />,
  );

  // Con una sentencia cargada el lector propone por sí mismo la vía de apelación y no permite generar sin confirmarla.
  const typeSelect = screen.getByRole('combobox', { name: 'Tipo de escrito' }) as HTMLSelectElement;
  expect(typeSelect.value).toBe('apelacion_civil');
  expect((screen.getByRole('button', { name: /Generar apelación/i }) as HTMLButtonElement).disabled).toBe(true);

  // Si el abogado elige a mano una contestación, la fuente se rechaza con un aviso claro y se ofrece volver a la apelación.
  fireEvent.change(typeSelect, { target: { value: 'contestacion_demanda_civil' } });
  const notice = await screen.findByTestId('source-incompatible-notice');
  expect(notice.textContent).toMatch(/resolución judicial, no una demanda/i);
  fireEvent.click(screen.getByRole('button', { name: /^Cambiar a /i }));
  const switched = (screen.getByRole('combobox', { name: 'Tipo de escrito' }) as HTMLSelectElement).value;
  expect(switched).not.toMatch(/^contestacion_/);
  expect(switched).toBe('apelacion_civil');
});
