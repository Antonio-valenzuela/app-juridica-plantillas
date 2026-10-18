'use client';

import React from 'react';
import type { ActuacionProposal } from '@/lib/legal-engine/actuacionProposal';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';

interface ActuacionProposalCardProps {
  proposal: ActuacionProposal;
  selectedDocumentType: string;
  /** El abogado ya eligió o confirmó expresamente la actuación seleccionada. */
  confirmed: boolean;
  onSelect: (documentType: string) => void;
  onConfirm: () => void;
  disabled?: boolean;
}

const MATTER_LABEL: Record<string, string> = {
  CIVIL: 'civil', FAMILIAR: 'familiar', MERCANTIL: 'mercantil', LABORAL: 'laboral', PENAL: 'penal',
  ADMINISTRATIVA: 'administrativa', FISCAL: 'fiscal', AGRARIA: 'agraria', AMPARO: 'amparo',
};

/**
 * Lo que LexPlantillas detectó en el documento y las actuaciones posibles. La propuesta orienta; la
 * elección final es del abogado: cuando la procedencia no es evidente, Generar exige su confirmación.
 */
export function ActuacionProposalCard({ proposal, selectedDocumentType, confirmed, onSelect, onConfirm, disabled = false }: ActuacionProposalCardProps) {
  const { detected, candidates, extraction } = proposal;
  const selected = candidates.find((item) => item.documentType === selectedDocumentType);
  // El abogado puede haber elegido un tipo que no figura entre las vías propuestas (la decisión sobre la vía es suya):
  // sin este caso no había forma de confirmarlo y Generar quedaba bloqueado sin salida.
  const outsideProposal = !selected && Boolean(selectedDocumentType);
  const outsideLabel = getCatalogDocument(selectedDocumentType)?.label || selectedDocumentType;
  const matter = MATTER_LABEL[detected.matter];
  const pages = detected.pages ? (detected.pages.start === detected.pages.end ? `p. ${detected.pages.start}` : `pp. ${detected.pages.start}–${detected.pages.end}`) : null;

  return (
    <section className="lex-card" data-testid="actuacion-proposal" aria-labelledby="actuacion-proposal-title">
      <div className="lex-card-header">
        <h2 id="actuacion-proposal-title" className="lex-card-title">Actuación propuesta</h2>
      </div>
      <p className="text-sm" data-testid="actuacion-detected">
        Documento detectado: <strong>{detected.label}</strong>
        {matter ? <> · materia {matter}</> : null}
        {pages ? <> · {pages}</> : null}
      </p>
      {detected.otherActs.length > 0 && (
        <p className="lex-help">
          También contiene: {detected.otherActs.map((act) => `${act.label} (pp. ${act.start}–${act.end})`).join('; ')}.
        </p>
      )}
      {!extraction.complete && extraction.notice && (
        <p role="alert" data-testid="actuacion-extraction-notice" className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {extraction.notice}
        </p>
      )}
      <p className="mt-2 text-sm">
        {proposal.requiresConfirmation
          ? 'La actuación no puede determinarse con certeza. Elige la que corresponda: la decisión sobre la vía es tuya.'
          : 'Por el tipo de documento, esta es la actuación que corresponde. Puedes cambiarla.'}
      </p>
      <ul className="mt-2 space-y-1.5" role="list" aria-label="Actuaciones posibles">
        {candidates.map((item) => {
          const isSelected = item.documentType === selectedDocumentType;
          return (
            <li key={item.documentType}>
              <button
                type="button"
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${isSelected ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white'}`}
                aria-pressed={isSelected}
                disabled={disabled}
                onClick={() => onSelect(item.documentType)}
                data-testid={`actuacion-candidate-${item.documentType}`}
              >
                <span className="font-semibold">{item.label}</span>{' '}
                <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${item.status === 'CORRESPONDE' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>
                  {item.status === 'CORRESPONDE' ? 'Corresponde' : 'Posible'}
                </span>
                <span className="mt-0.5 block text-slate-600">{item.rationale}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {selected && selected.toConfirm.length > 0 && (
        <div className="mt-3" data-testid="actuacion-to-confirm">
          <p className="text-sm font-semibold">Antes de generar, verifica:</p>
          <ul className="ml-4 list-disc text-sm">
            {selected.toConfirm.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {proposal.requiresConfirmation && selected && !confirmed && (
        <button type="button" className="lex-button lex-button-primary mt-3" onClick={onConfirm} disabled={disabled} data-testid="actuacion-confirm">
          Confirmar «{selected.label}»
        </button>
      )}
      {proposal.requiresConfirmation && outsideProposal && (
        <div className="mt-3" data-testid="actuacion-outside-proposal">
          <p className="text-sm">«{outsideLabel}» no está entre las actuaciones propuestas para este documento. Confírmala solo si es la vía que corresponde.</p>
          {!confirmed && (
            <button type="button" className="lex-button lex-button-primary mt-2" onClick={onConfirm} disabled={disabled} data-testid="actuacion-confirm">
              Confirmar «{outsideLabel}»
            </button>
          )}
          {confirmed && <p className="mt-2 text-sm text-emerald-800" data-testid="actuacion-confirmed">Actuación confirmada por el abogado.</p>}
        </div>
      )}
      {proposal.requiresConfirmation && confirmed && selected && (
        <p className="mt-2 text-sm text-emerald-800" data-testid="actuacion-confirmed">Actuación confirmada por el abogado.</p>
      )}
    </section>
  );
}
