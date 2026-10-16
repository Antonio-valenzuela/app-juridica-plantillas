'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';
import { getWritingContract } from '@/lib/legal-engine/writingContract';
import { inferSourceOutputType } from '@/lib/legal-engine/sourceOutputCompatibility';
import {
  buildCaseDossier, confirmDossier, validateDossierForContract,
  type CaseDossier, type ProcessSide,
} from '@/lib/legal-engine/caseDossier';
import { validateRepresentedName } from '@/lib/legal-engine/representedName';
import { presentsThroughIssuingCourt } from '@/lib/legal-engine/documentTemplates';

export interface CaseDossierState {
  /** Ficha confirmada y vigente; undefined mientras falte algo. */
  dossier?: CaseDossier;
  /** Lo que impide generar, en lenguaje del abogado. */
  problems: string[];
}

const SIDE_LABEL: Record<ProcessSide, string> = { actor: 'actora', demandado: 'demandada', otro: 'otra' };
const OTHER = '__otra__';
/** Prefijo de las opciones de rol detectado cuyo nombre no consta o está testado. */
const ROLE_PREFIX = '__role:';
const sameOrgan = (a: string, b: string) => {
  const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return Boolean(fold(a)) && fold(a) === fold(b);
};

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
  const [nameTouched, setNameTouched] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // Lo detectado puede llegar después de abrir el diálogo (el análisis termina de forma asíncrona): mientras el abogado no
  // haya editado un campo, este sigue lo detectado; una vez editado, su valor manda.
  const touched = useRef({ court: false, city: false, expediente: false });
  useEffect(() => { if (!touched.current.court) setCourt(detected.court); }, [detected.court]);
  useEffect(() => { if (!touched.current.city) setCity(detected.city); }, [detected.city]);
  useEffect(() => { if (!touched.current.expediente) setExpediente(detected.expediente); }, [detected.expediente]);

  // Solo los escritos que se presentan por conducto del órgano que dictó la resolución separan órgano, autoridad y roles.
  const separated = presentsThroughIssuingCourt(documentType);
  const detectedRoles = separated ? detected.detectedRoles ?? [] : [];
  const selectedRole = represented.startsWith(ROLE_PREFIX) ? detectedRoles.find((item) => `${ROLE_PREFIX}${item.role}__` === represented) : undefined;
  // El nombre se escribe a mano al elegir «Otra parte» o un rol cuyo nombre no consta: nunca se infiere.
  const typedName = represented === OTHER || Boolean(selectedRole);
  const courtMatchesAuthority = separated && Boolean(detected.sourceAuthority) && sameOrgan(court, detected.sourceAuthority!);
  const chosenName = typedName ? otherName.trim() : represented;
  const chosenParty = detected.parties.find((party) => party.name === represented);
  const chosenSide: ProcessSide | undefined = typedName ? (otherName.trim() ? 'otro' : undefined) : chosenParty?.role;
  // Nombre escrito a mano: bloquea lo que no puede ser el nombre de una parte; avisa (sin bloquear) si no coincide con las detectadas.
  const nameCheck = typedName ? validateRepresentedName(otherName, detected.parties.map((party) => party.name)) : undefined;
  const nameError = nameCheck && !nameCheck.ok && nameTouched ? nameCheck.message : undefined;
  const nameWarning = nameCheck?.ok ? nameCheck.warning?.message : undefined;

  const sourceTypeOf = (source: UploadedSourceDocument) => String(inferSourceOutputType([source]));
  const candidate = useMemo<CaseDossier>(() => (chosenName && chosenSide
    ? confirmDossier(detected, { representedName: chosenName, representedSide: chosenSide, representedRole: selectedRole?.role, edits: { court: court.trim(), city: city.trim(), expediente: expediente.trim() } })
    : { ...detected, court: court.trim(), city: city.trim(), expediente: expediente.trim(), confirmed: false }),
  [detected, chosenName, chosenSide, selectedRole, court, city, expediente]);
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
  const ready = blocking.length === 0 && Boolean(chosenName) && (nameCheck?.ok ?? true);
  // Con el nombre escrito a mano, su error se muestra junto al campo y no se repite en la lista.
  const listed = blocking.filter((problem) => !(typedName && problem.code === 'REPRESENTATION_NAME_INVALID'));
  const isConfirmed = confirmed && ready;

  useEffect(() => {
    if (isConfirmed) onChange({ dossier: candidate, problems: [] });
    else onChange({ problems: blocking.length ? blocking.map((problem) => problem.message) : ['Confirma la ficha del caso antes de generar.'] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, candidate, blocking.map((problem) => problem.message).join('|')]);

  const edit = <T,>(setter: (value: T) => void) => (value: T) => { setConfirmed(false); setter(value); };

  return <section className="lex-dossier" aria-label="Ficha del caso" data-testid="case-dossier-panel">
    <dl className="lex-dossier-facts">
      <dt>Órgano</dt><dd>{detected.court || 'No consta'}</dd>
      <dt>Lugar</dt><dd>{detected.city || 'No consta'}</dd>
      <dt>Expediente</dt><dd>{detected.expediente || 'No consta'}</dd>
      {separated && detected.issuingCourt && <><dt>Órgano que dictó la resolución fuente</dt><dd>{detected.issuingCourt}</dd></>}
      {separated && detected.sourceAuthority && <><dt>Autoridad responsable citada</dt><dd>{detected.sourceAuthority}</dd></>}
      {detected.resolution && <><dt>Resolución</dt><dd>{detected.resolution.kind === 'AUTO' ? 'Auto' : 'Sentencia definitiva'}{detected.resolution.date ? ` · ${detected.resolution.date}` : ''}</dd></>}
      {detected.notifications.length > 0 && <><dt>Notificación</dt><dd>{detected.notifications.map((item) => item.date).join('; ')}</dd></>}
      {detected.agravios.length > 0 && <><dt>Agravios</dt><dd>{detected.agravios.length} numerados</dd></>}
      <dt>Partes</dt>
      <dd>{detected.parties.length ? detected.parties.map((party) => `${party.name} (${SIDE_LABEL[party.role]})`).join('; ') : 'No constan'}</dd>
    </dl>
    {courtMatchesAuthority && <p className="lex-help" data-testid="dossier-court-warning">El órgano de la ficha coincide con la autoridad responsable citada, no con el órgano que dictó la resolución fuente. Verifica a cuál debe dirigirse el escrito.</p>}
    <fieldset disabled={disabled} className="lex-dossier-fields">
      <div>
        <label className="lex-field-label" htmlFor="dossier-represented">A quién representas (firma como {contract.signerLabel})</label>
        <select id="dossier-represented" aria-label="Parte que representas" className="lex-select" value={represented} onChange={(e) => { setConfirmed(false); setRepresented(e.target.value); if (e.target.value.startsWith(ROLE_PREFIX)) { setOtherName(''); setNameTouched(false); } }}>
          <option value="">Elige la parte…</option>
          {detected.parties.map((party, i) => <option key={`${party.name}-${i}`} value={party.name}>{party.name} ({SIDE_LABEL[party.role]})</option>)}
          {detectedRoles.map((item) => <option key={item.role} value={`${ROLE_PREFIX}${item.role}__`}>{item.label}</option>)}
          <option value={OTHER}>Otra parte (escribir)…</option>
        </select>
      </div>
      {typedName && <div>
        <label className="lex-field-label" htmlFor="dossier-other">Nombre de la parte que representas</label>
        <input id="dossier-other" aria-label="Nombre de la parte representada" required aria-invalid={nameError ? true : undefined} aria-describedby={nameError || nameWarning ? 'dossier-other-message' : undefined} className="lex-input" value={otherName} onChange={(e) => { setNameTouched(true); edit(setOtherName)(e.target.value); }} onBlur={() => setNameTouched(true)} />
        {nameError && <p id="dossier-other-message" role="alert" className="lex-help" data-testid="dossier-name-error">{nameError}</p>}
        {nameWarning && <p id="dossier-other-message" className="lex-help" data-testid="dossier-name-warning">{nameWarning}</p>}
      </div>}
      <details className="lex-dossier-more" open={!detected.court || !detected.city || !detected.expediente || undefined}>
        <summary>Corregir órgano, lugar o expediente</summary>
        <div>
          <label className="lex-field-label" htmlFor="dossier-court">Órgano jurisdiccional</label>
          <input id="dossier-court" aria-label="Órgano jurisdiccional" className="lex-input" value={court} onChange={(e) => { touched.current.court = true; edit(setCourt)(e.target.value); }} />
        </div>
        <div>
          <label className="lex-field-label" htmlFor="dossier-city">Lugar de presentación</label>
          <input id="dossier-city" aria-label="Lugar de presentación" className="lex-input" value={city} onChange={(e) => { touched.current.city = true; edit(setCity)(e.target.value); }} />
        </div>
        <div>
          <label className="lex-field-label" htmlFor="dossier-expediente">Número de expediente</label>
          <input id="dossier-expediente" aria-label="Número de expediente de la ficha" className="lex-input" value={expediente} onChange={(e) => { touched.current.expediente = true; edit(setExpediente)(e.target.value); }} />
        </div>
      </details>
    </fieldset>
    {listed.length > 0 && <ul role="status" className="lex-dossier-problems">{listed.map((problem, i) => <li key={i}>{problem.message}</li>)}</ul>}
    <label className="lex-dossier-confirm"><input type="checkbox" aria-label="Confirmar ficha del caso" disabled={!ready || disabled} checked={isConfirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Confirmo la ficha y que represento a la parte indicada.</label>
  </section>;
}

/** Resumen en el inspector: estado de la ficha y acceso al diálogo donde se completa. */
export function CaseDossierSummaryCard({ state, onOpen, disabled }: { state: CaseDossierState; onOpen: () => void; disabled?: boolean }) {
  const dossier = state.dossier;
  return <section className="lex-card" aria-label="Resumen de la ficha del caso" data-testid="case-dossier-summary">
    <div className="lex-card-header"><h2 className="lex-card-title">Ficha del caso</h2></div>
    {dossier
      ? <p className="lex-help">Confirmada · representas a <strong>{dossier.representedName}</strong>{dossier.expediente ? ` · expediente ${dossier.expediente}` : ''}.</p>
      : <p className="lex-help" role="status">Pendiente: {state.problems[0] || 'confirma la ficha y elige a quién representas.'}</p>}
    <button type="button" className="lex-button lex-button-ghost" onClick={onOpen} disabled={disabled}>{dossier ? 'Revisar ficha' : 'Completar ficha'}</button>
  </section>;
}

