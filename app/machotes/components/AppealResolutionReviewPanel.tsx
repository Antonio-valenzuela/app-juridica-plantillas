'use client';
import React, { useState } from 'react';
import { validateAppealConfirmation, type AppealConfirmation, type AppealResolutionReview } from '@/lib/legal-engine/case-extraction/appealResolutionReview';

export function AppealResolutionReviewPanel({ review, onChange, disabled }: { review: AppealResolutionReview; onChange: (confirmation?: AppealConfirmation) => void; disabled?: boolean }) {
  const [selection, setSelection] = useState('');
  const [partyText, setPartyText] = useState('');
  const [representedNames, setRepresented] = useState<string[]>([]);
  const [recipient, setRecipient] = useState('');
  const [notificationDate, setNotificationDate] = useState('');
  const [bulletin, setBulletin] = useState('');
  const [resolutionDate, setResolutionDate] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const resolution = review.resolutions.find(r => r.id === selection);
  const parties = partyText.split('\n').flatMap(line => {
    const m = line.match(/^(actor|demandado):\s*(.+)$/i);
    return m && resolution ? [{ role: m[1].toLowerCase() as 'actor' | 'demandado', name: m[2].trim(), origin: resolution.parties.find(p => p.name === m[2].trim())?.origin || { sourceId: resolution.sourceId, page: resolution.startPage, excerpt: 'APORTADO_POR_ABOGADO', start: -1, end: -1 } }] : [];
  });
  // La notificación se acredita con la FECHA. El boletín/folio es un dato
  // opcional: exigirlo dejaba el happy path bloqueado para toda resolución
  // notified por un medio sin boletín (casi la mayoría).
  const notification = notificationDate.trim()
    ? [notificationDate.trim(), bulletin.trim() ? `Boletín ${bulletin.trim()}` : 'Medio y fecha confirmados por el abogado'].join(' · ')
    : '';
  const confirmation: AppealConfirmation = { sourceFingerprint: review.sourceFingerprint, resolutionId: selection, parties, representedNames, recipient, notification, resolutionDate, confirmed: true };
  const canConfirm = validateAppealConfirmation(review, confirmation).eligible;
  const invalidate = () => { setConfirmed(false); onChange(undefined); };
  return <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3" aria-label="Confirmación de apelación">
    <h3 className="font-semibold">Resoluciones detectadas</h3>
    <p className="text-sm text-slate-600">Selecciona la resolución que vas a impugnar y confirma partes, destinatario y notificación para continuar.</p>
    {!review.resolutions.length && <p role="status">No hay encabezados con páginas verificables; revisa la extracción del documento.</p>}
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="sr-only">Resolución que se impugna</legend>
      {review.resolutions.map(r => <label key={r.id} className="block text-sm"><input type="radio" name="appeal-resolution" checked={selection === r.id} onChange={() => {
        invalidate(); setSelection(r.id); setPartyText(r.parties.map(p => `${p.role}: ${p.name}`).join('\n')); setRepresented([]);
        setRecipient(r.court.startsWith('[') ? '' : r.court);
        setNotificationDate(r.notification?.date || ''); setBulletin(r.notification?.bulletin || ''); setResolutionDate('');
      }} /> {r.type} · {r.date} · {r.court} · Página {r.startPage}</label>)}
    </fieldset>
    {resolution && <fieldset disabled={disabled} className="space-y-3">
      {resolution.dateStatus === 'CONFIRM_DATE' && <div className="text-sm text-amber-800"><p>Confirmar fecha: el OCR contiene números y letras incompatibles. No se corrigió la fuente.</p><pre className="whitespace-pre-wrap">{resolution.dateOrigin?.excerpt}</pre><label>Fecha confirmada por el abogado<input aria-label="Fecha de resolución confirmada" className="block w-full border rounded p-2" value={resolutionDate} onChange={e => { invalidate(); setResolutionDate(e.target.value); }} /></label></div>}
      <label className="block text-sm">Partes (actor: nombre / demandado: nombre)<textarea aria-label="Partes de la resolución" className="block w-full border rounded p-2" rows={5} value={partyText} onChange={e => { invalidate(); setRepresented([]); setPartyText(e.target.value); }} /></label>
      <div className="text-sm">Representamos a:
        {parties.map((p, i) => <label className="block" key={`${p.name}-${i}`}><input type="checkbox" checked={representedNames.includes(p.name)} onChange={e => { invalidate(); setRepresented(e.target.checked ? [...representedNames, p.name] : representedNames.filter(n => n !== p.name)); }} /> {p.name} ({p.role})</label>)}
      </div>
      <label className="block text-sm">Autoridad destinataria propuesta — confirmar competencia<input aria-label="Autoridad destinataria" className="block w-full border rounded p-2" value={recipient} onChange={e => { invalidate(); setRecipient(e.target.value); }} /></label>
      <label className="block text-sm">Fecha de notificación — lectura legible o dato del abogado<input aria-label="Fecha de notificación" className="block w-full border rounded p-2" value={notificationDate} onChange={e => { invalidate(); setNotificationDate(e.target.value); }} /></label>
      <label className="block text-sm">Boletín o folio de notificación (opcional si la notificación se acreditó por otro medio)<input aria-label="Boletín de notificación" className="block w-full border rounded p-2" value={bulletin} onChange={e => { invalidate(); setBulletin(e.target.value); }} /></label>
      <p className="text-sm text-amber-800">Oportunidad/plazo: [A VERIFICAR]. Confirmar datos no verifica la regla legal ni acredita oportunidad.</p>
      <label className="block text-sm"><input type="checkbox" aria-label="Confirmar partes, resolución, destinatario y notificación" disabled={!canConfirm} checked={confirmed} onChange={e => { setConfirmed(e.target.checked); onChange(e.target.checked ? confirmation : undefined); }} /> Confirmo estos datos y la parte representada.</label>
    </fieldset>}
    <p role="status" className="text-xs">{confirmed ? 'Datos confirmados por el abogado' : 'Pendiente de confirmar los datos del paso 1'}</p>
  </section>;
}
