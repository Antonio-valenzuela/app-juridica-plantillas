'use client';
import React, { useEffect, useMemo, useState } from 'react';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';
import { getWritingContract } from '@/lib/legal-engine/writingContract';
import { inferSourceOutputType } from '@/lib/legal-engine/sourceOutputCompatibility';
import {
  buildCaseDossier, confirmDossier, validateDossierForContract,
  type CaseDossier, type ProcessSide,
} from '@/lib/legal-engine/caseDossier';

export interface CaseDossierState {
  /** Ficha confirmada y vigente; undefined mientras falte algo. */
  dossier?: CaseDossier;
  /** Lo que impide generar, en lenguaje del abogado. */
  problems: string[];
}

const SIDE_LABEL: Record<ProcessSide, string> = { actor: 'actora', demandado: 'demandada', otro: 'otra' };
const OTHER = '__otra__';

/**
 * Ficha del caso. Paso previo a redactar: muestra lo que el sistema extrajo del expediente (órgano, lugar,
 * expediente, partes con su rol, resolución, notificaciones y agravios), deja corregirlo y exige que el
 * abogado elija a quién representa. Nada se infiere: sin elección y sin confirmación no se genera.
 */
export function CaseDossierPanel({ sources, documentType, onChange, disabled }: {
  sources: UploadedSourceDocument[];
  documentType: string;
  onChange: (state: CaseDossierState) => void;
  disabled?: boolean;
}) {
  const contract = useMemo(() => getWritingContract(documentType), [documentType]);
  const detected = useMemo(() => buildCaseDossier(sources), [sources]);
  const [court, setCourt] = useState(detected.court);
  const [city, setCity] = useState(detected.city);
  const [expediente, setExpediente] = useState(detected.expediente);
  const [represented, setRepresented] = useState('');
  const [otherName, setOtherName] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const chosenName = represented === OTHER ? otherName.trim() : represented;
  const chosenParty = detected.parties.find((party) => party.name === represented);
  const chosenSide: ProcessSide | undefined = represented === OTHER ? (otherName.trim() ? 'otro' : undefined) : chosenParty?.role;

  const sourceTypeOf = (source: UploadedSourceDocument) => String(inferSourceOutputType([source]));
  const candidate = useMemo<CaseDossier>(() => (chosenName && chosenSide
    ? confirmDossier(detected, { representedName: chosenName, representedSide: chosenSide, edits: { court: court.trim(), city: city.trim(), expediente: expediente.trim() } })
    : { ...detected, court: court.trim(), city: city.trim(), expediente: expediente.trim(), confirmed: false }),
  [detected, chosenName, chosenSide, court, city, expediente]);
  const problems = useMemo(
    () => validateDossierForContract(candidate.representedName ? candidate : { ...candidate, confirmed: true }, contract, sources, { sourceTypeOf }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidate, contract, sources],
  );
  // La compatibilidad genérica fuente→escrito ya la bloquea el lector; aquí solo cuentan los documentos que el
  // contrato del tipo exige expresamente (p. ej. la apelación del contrario para contestar agravios).
  const specificInputs = new Set(contract.requiredInputs.filter((input) => input.dossierKey).map((input) => input.id));
  const blocking = problems.filter((problem) => problem.code !== 'DOSSIER_NOT_CONFIRMED'
    && (problem.code !== 'REQUIRED_INPUT_MISSING' || (problem.inputId && specificInputs.has(problem.inputId))));
  const ready = blocking.length === 0 && Boolean(chosenName);
  const isConfirmed = confirmed && ready;

  useEffect(() => {
    if (isConfirmed) onChange({ dossier: candidate, problems: [] });
    else onChange({ problems: blocking.length ? blocking.map((problem) => problem.message) : ['Confirma la ficha del caso antes de generar.'] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, candidate, blocking.map((problem) => problem.message).join('|')]);

  const edit = <T,>(setter: (value: T) => void) => (value: T) => { setConfirmed(false); setter(value); };

  return <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2" aria-label="Ficha del caso" data-testid="case-dossier-panel">
    <h3 className="font-semibold">Ficha del caso</h3>
    <p className="text-xs text-slate-600">El escrito solo usa los datos de esta ficha. Revísala, corrígela y elige a quién representas.</p>
    <dl className="text-sm grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
      <dt className="text-slate-600">Órgano</dt><dd>{detected.court || 'No consta'}</dd>
      <dt className="text-slate-600">Lugar</dt><dd>{detected.city || 'No consta'}</dd>
      <dt className="text-slate-600">Expediente</dt><dd>{detected.expediente || 'No consta'}</dd>
      {detected.resolution && <><dt className="text-slate-600">Resolución</dt><dd>{detected.resolution.kind === 'AUTO' ? 'Auto' : 'Sentencia definitiva'}{detected.resolution.date ? ` · ${detected.resolution.date}` : ''}</dd></>}
      {detected.notifications.length > 0 && <><dt className="text-slate-600">Notificación</dt><dd>{detected.notifications.map((item) => item.date).join('; ')}</dd></>}
      {detected.agravios.length > 0 && <><dt className="text-slate-600">Agravios</dt><dd>{detected.agravios.length} numerados</dd></>}
      <dt className="text-slate-600">Partes</dt>
      <dd>{detected.parties.length ? detected.parties.map((party) => `${party.name} (${SIDE_LABEL[party.role]})`).join('; ') : 'No constan'}</dd>
    </dl>
    <fieldset disabled={disabled} className="space-y-2">
      <label className="block text-sm">A quién representas (firma como {contract.signerLabel})
        <select aria-label="Parte que representas" className="block w-full border rounded p-2" value={represented} onChange={(e) => { setConfirmed(false); setRepresented(e.target.value); }}>
          <option value="">Elige la parte…</option>
          {detected.parties.map((party, i) => <option key={`${party.name}-${i}`} value={party.name}>{party.name} ({SIDE_LABEL[party.role]})</option>)}
          <option value={OTHER}>Otra parte (escribir)…</option>
        </select>
      </label>
      {represented === OTHER && <label className="block text-sm">Nombre de la parte que representas
        <input aria-label="Nombre de la parte representada" className="block w-full border rounded p-2" value={otherName} onChange={(e) => edit(setOtherName)(e.target.value)} />
      </label>}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-blue-800">Corregir órgano, lugar o expediente</summary>
        <label className="block text-sm mt-2">Órgano jurisdiccional
          <input aria-label="Órgano jurisdiccional" className="block w-full border rounded p-2" value={court} onChange={(e) => edit(setCourt)(e.target.value)} />
        </label>
        <label className="block text-sm">Lugar de presentación
          <input aria-label="Lugar de presentación" className="block w-full border rounded p-2" value={city} onChange={(e) => edit(setCity)(e.target.value)} />
        </label>
        <label className="block text-sm">Número de expediente
          <input aria-label="Número de expediente de la ficha" className="block w-full border rounded p-2" value={expediente} onChange={(e) => edit(setExpediente)(e.target.value)} />
        </label>
      </details>
    </fieldset>
    {blocking.length > 0 && <ul role="status" className="text-sm text-amber-800 list-disc pl-5">{blocking.map((problem, i) => <li key={i}>{problem.message}</li>)}</ul>}
    <label className="block text-sm"><input type="checkbox" aria-label="Confirmar ficha del caso" disabled={!ready || disabled} checked={isConfirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Confirmo la ficha y que represento a la parte indicada.</label>
  </section>;
}
