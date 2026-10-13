'use client';
import React, { useEffect, useMemo, useState } from 'react';
import {
  selectPrimaryAppealResolution, validateAppealConfirmation,
  type AppealConfirmation, type AppealParty, type AppealResolution, type AppealResolutionReview,
} from '@/lib/legal-engine/case-extraction/appealResolutionReview';

const PENDING = '[A CONFIRMAR POR EL ABOGADO]';
const isPending = (value?: string) => !value || value.trim().startsWith('[');
const kindLabel = (r: AppealResolution) => (r.type === 'AUTO' ? 'Auto' : 'Sentencia definitiva');
const resolutionLabel = (r: AppealResolution) => [kindLabel(r), isPending(r.court) ? null : r.court, isPending(r.date) ? null : r.date].filter(Boolean).join(' · ');
const partyLines = (r?: AppealResolution) => r?.parties.map(p => `${p.role}: ${p.name}`).join('\n') || '';

/**
 * Resolución a impugnar. El abogado ya eligió el documento y la actuación: aquí se
 * muestra solo la resolución principal detectada. Los datos no verificados viajan como
 * confirmación PROVISIONAL (quedan marcados en el borrador) y se pueden corregir o
 * ratificar en el bloque plegado; nada se detiene ni se pierde al editarlos.
 */
export function AppealResolutionReviewPanel({ review, onChange, disabled, detectedExpediente }: { review: AppealResolutionReview; onChange: (confirmation?: AppealConfirmation) => void; disabled?: boolean; detectedExpediente?: string }) {
  const primary = useMemo(() => selectPrimaryAppealResolution(review.resolutions).primary, [review]);
  const [selection, setSelection] = useState(primary?.id || '');
  const [partyText, setPartyText] = useState(partyLines(primary));
  const [representedNames, setRepresented] = useState<string[]>([]);
  const [recipient, setRecipient] = useState(primary && !isPending(primary.court) ? primary.court : '');
  const [notificationDate, setNotificationDate] = useState(primary?.notification?.date || '');
  const [bulletin, setBulletin] = useState(primary?.notification?.bulletin || '');
  const [resolutionDate, setResolutionDate] = useState('');
  const [expediente, setExpediente] = useState(primary?.expediente || detectedExpediente || '');
  const [expedienteTouched, setExpedienteTouched] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (!expedienteTouched) setExpediente(primary?.expediente || detectedExpediente || '');
  }, [primary, detectedExpediente, expedienteTouched]);

  const resolution = review.resolutions.find(r => r.id === selection);
  const parties = useMemo<AppealParty[]>(() => partyText.split('\n').flatMap(line => {
    const m = line.match(/^(actor|demandado):\s*(.+)$/i);
    if (!m || !resolution) return [];
    const name = m[2].trim();
    return [{ role: m[1].toLowerCase() as 'actor' | 'demandado', name, origin: resolution.parties.find(p => p.name === name)?.origin || { sourceId: resolution.sourceId, page: resolution.startPage, excerpt: 'APORTADO_POR_ABOGADO', start: -1, end: -1 } }];
  }), [partyText, resolution]);

  // La notificación se acredita con la FECHA; el boletín/folio es opcional.
  const notification = notificationDate.trim()
    ? [notificationDate.trim(), bulletin.trim() ? `Boletín ${bulletin.trim()}` : 'Medio y fecha confirmados por el abogado'].join(' · ')
    : '';
  const draft = useMemo<AppealConfirmation>(() => ({
    sourceFingerprint: review.sourceFingerprint, resolutionId: selection, parties, representedNames,
    recipient: recipient.trim() || PENDING, notification: notification || PENDING, expediente: expediente.trim() || PENDING,
    resolutionDate: resolutionDate.trim() || undefined, confirmed: false, provisional: true,
  }), [review.sourceFingerprint, selection, parties, representedNames, recipient, notification, expediente, resolutionDate]);
  const canConfirm = validateAppealConfirmation(review, { ...draft, confirmed: true, provisional: false }).eligible;
  const isConfirmed = confirmed && canConfirm;

  // Siempre hay una confirmación vigente: provisional con lo editado, o estricta si el abogado la ratifica.
  useEffect(() => {
    onChange(isConfirmed ? { ...draft, confirmed: true, provisional: false } : draft);
  }, [draft, isConfirmed, onChange]);

  const select = (r: AppealResolution) => {
    setConfirmed(false); setSelection(r.id); setPartyText(partyLines(r)); setRepresented([]);
    setRecipient(isPending(r.court) ? '' : r.court);
    setNotificationDate(r.notification?.date || ''); setBulletin(r.notification?.bulletin || ''); setResolutionDate('');
  };
  const edit = <T,>(setter: (value: T) => void) => (value: T) => { setConfirmed(false); setter(value); };
  const dateNeedsReview = resolution?.dateStatus === 'CONFIRM_DATE';

  return <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2" aria-label="Resolución a impugnar">
    <h3 className="font-semibold">Resolución a impugnar</h3>
    {!review.resolutions.length ? (
      <p className="text-sm text-slate-700">No se identificó el encabezado de una resolución. El borrador dejará marcada la resolución impugnada para tu revisión.</p>
    ) : (
      <p className="text-sm text-slate-800" data-testid="appeal-primary-resolution">{resolution ? resolutionLabel(resolution) : 'Selecciona la resolución'}</p>
    )}
    <p className="text-xs text-slate-600">Expediente: {expediente.trim() || 'por confirmar'}</p>
    {dateNeedsReview && <p className="text-xs text-amber-800">La fecha de la resolución debe revisarse: el documento la expresa de forma inconsistente.</p>}
    <p role="status" className="text-xs text-slate-700">{isConfirmed ? 'Datos confirmados por el abogado.' : 'Se generará un borrador con estos datos. Lo no confirmado quedará marcado en el escrito para tu revisión.'}</p>
    <details className="text-sm" data-testid="appeal-review-details">
      <summary className="cursor-pointer font-medium text-blue-800">Revisar o corregir datos</summary>
      <fieldset disabled={disabled} className="mt-3 space-y-3">
        {review.resolutions.length > 1 && <label className="block text-sm">Resolución que se impugna
          <select aria-label="Resolución que se impugna" className="block w-full border rounded p-2" value={selection} onChange={e => { const next = review.resolutions.find(r => r.id === e.target.value); if (next) select(next); }}>
            {review.resolutions.map(r => <option key={r.id} value={r.id}>{resolutionLabel(r)}</option>)}
          </select>
        </label>}
        <label className="block text-sm">Número de expediente
          <input aria-label="Número de expediente detectado" className="block w-full border rounded p-2" value={expediente} onChange={e => { setExpedienteTouched(true); edit(setExpediente)(e.target.value); }} />
        </label>
        {dateNeedsReview && <label className="block text-sm text-amber-800">Fecha de la resolución (el documento dice: {resolution?.date})
          <input aria-label="Fecha de resolución confirmada" className="block w-full border rounded p-2" value={resolutionDate} onChange={e => edit(setResolutionDate)(e.target.value)} />
        </label>}
        <label className="block text-sm">Partes (actor: nombre / demandado: nombre)
          <textarea aria-label="Partes de la resolución" className="block w-full border rounded p-2" rows={5} value={partyText} onChange={e => { setConfirmed(false); setRepresented([]); setPartyText(e.target.value); }} />
        </label>
        <div className="text-sm">Representamos a:
          {parties.map((p, i) => <label className="block" key={`${p.name}-${i}`}><input type="checkbox" checked={representedNames.includes(p.name)} onChange={e => { setConfirmed(false); setRepresented(e.target.checked ? [...representedNames, p.name] : representedNames.filter(n => n !== p.name)); }} /> {p.name} ({p.role})</label>)}
        </div>
        <label className="block text-sm">Autoridad destinataria
          <input aria-label="Autoridad destinataria" className="block w-full border rounded p-2" value={recipient} onChange={e => edit(setRecipient)(e.target.value)} />
        </label>
        <label className="block text-sm">Fecha de notificación
          <input aria-label="Fecha de notificación" className="block w-full border rounded p-2" value={notificationDate} onChange={e => edit(setNotificationDate)(e.target.value)} />
        </label>
        <label className="block text-sm">Boletín o folio de notificación (opcional)
          <input aria-label="Boletín de notificación" className="block w-full border rounded p-2" value={bulletin} onChange={e => edit(setBulletin)(e.target.value)} />
        </label>
        <p className="text-sm text-amber-800">Oportunidad y plazo: por verificar. Confirmar estos datos no verifica la regla legal ni acredita oportunidad.</p>
        <label className="block text-sm"><input type="checkbox" aria-label="Confirmar partes, resolución, destinatario y notificación" disabled={!canConfirm} checked={isConfirmed} onChange={e => setConfirmed(e.target.checked)} /> Confirmo expediente, resolución, partes, destinatario y notificación; la materia y la oportunidad siguen sujetas a revisión.</label>
      </fieldset>
    </details>
  </section>;
}
