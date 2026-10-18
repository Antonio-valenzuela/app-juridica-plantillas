'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  computeProceduralTerm,
  PROCEDURAL_TERM_RULES,
  type NotificationKind,
  type OfficialSuspension,
  type ProceduralTermInput,
  type ProceduralTermResult,
  type RecipientKind,
  type TermJurisdiction,
  type TermMatter,
} from '@/lib/legal-engine/procedural-terms';

const card = 'rounded-2xl border border-slate-200 bg-white shadow-[0_5px_18px_rgba(15,23,42,.045)]';
const field = 'h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-[#0B2545] focus:bg-white focus:ring-2 focus:ring-[#0B2545]/10';
const label = 'text-xs font-bold text-slate-600';

const MATTERS: Array<[TermMatter, string]> = [['civil', 'Civil'], ['familiar', 'Familiar'], ['mercantil', 'Mercantil'], ['laboral', 'Laboral'], ['administrativa', 'Administrativa'], ['amparo', 'Amparo'], ['penal', 'Penal']];
const NOTIFICATIONS: Array<[NotificationKind, string]> = [
  ['PERSONAL', 'Personal'],
  ['LISTA', 'Por lista'],
  ['BOLETIN_ESTRADOS', 'Boletín o estrados'],
  ['ELECTRONICA_CONSULTA', 'Electrónica (constancia de consulta)'],
  ['BUZON_ELECTRONICO', 'Buzón electrónico'],
  ['OFICIO_AUTORIDAD', 'Oficio a autoridad'],
  ['CONOCIMIENTO_DEL_ACTO', 'Conocimiento del acto'],
];

const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function proceduralTermStorageKey(caseId?: string): string {
  return `procedural-term:last:${caseId?.trim() || 'unassigned'}`;
}

/** Cómputo por regla procesal verificada: el motor determinista calcula y explica; la IA no interviene. */
export function ProceduralTermCalculator({ caseId }: { caseId?: string }) {
  const [ruleId, setRuleId] = useState(PROCEDURAL_TERM_RULES[0].id);
  const [jurisdiction, setJurisdiction] = useState<TermJurisdiction | ''>('');
  const [matter, setMatter] = useState<TermMatter | ''>('');
  const [recipient, setRecipient] = useState<RecipientKind | ''>('PARTICULAR');
  const [kind, setKind] = useState<NotificationKind | ''>('');
  const [notificationDate, setNotificationDate] = useState('');
  const [dateSource, setDateSource] = useState('');
  const [effectDate, setEffectDate] = useState('');
  const [suspensions, setSuspensions] = useState<OfficialSuspension[]>([]);
  const [suspensionDate, setSuspensionDate] = useState('');
  const [suspensionDescription, setSuspensionDescription] = useState('');
  const [calendarConfirmed, setCalendarConfirmed] = useState(false);
  const [result, setResult] = useState<ProceduralTermResult | null>(null);
  const storageKey = proceduralTermStorageKey(caseId);
  const rule = useMemo(() => PROCEDURAL_TERM_RULES.find((item) => item.id === ruleId), [ruleId]);
  const isAmparo = rule?.calendarId === 'LEY_DE_AMPARO_ART_19';

  /* eslint-disable react-hooks/set-state-in-effect -- restaura el último cómputo del expediente guardado en este equipo. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { input?: ProceduralTermInput };
      const input = saved.input;
      if (!input?.ruleId || !PROCEDURAL_TERM_RULES.some((item) => item.id === input.ruleId)) return;
      setRuleId(input.ruleId);
      setJurisdiction(input.jurisdiction || '');
      setMatter(input.matter || '');
      setRecipient(input.recipient || '');
      setKind(input.notification.kind || '');
      setNotificationDate(input.notification.date || '');
      setDateSource(input.notification.dateSource || '');
      setEffectDate(input.notification.effectDate || '');
      setSuspensions(input.calendar?.suspensions || []);
      setCalendarConfirmed(Boolean(input.calendar?.confirmedForPeriod));
      setResult(computeProceduralTerm(input));
    } catch { /* Un registro local inválido no impide un cómputo nuevo. */ }
  }, [storageKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function calculate() {
    const input: ProceduralTermInput = {
      ruleId,
      jurisdiction: jurisdiction || undefined,
      matter: matter || undefined,
      recipient: isAmparo ? recipient || undefined : undefined,
      notification: { kind: kind || undefined, date: notificationDate || undefined, dateSource: dateSource.trim() || undefined, effectDate: effectDate || undefined },
      calendar: { suspensions, confirmedForPeriod: calendarConfirmed },
    };
    const computed = computeProceduralTerm(input);
    setResult(computed);
    try { localStorage.setItem(storageKey, JSON.stringify({ input, computedAt: new Date().toISOString() })); } catch { /* El cómputo sigue disponible sin almacenamiento local. */ }
  }

  function addSuspension() {
    if (!suspensionDate || !suspensionDescription.trim() || suspensions.some((item) => item.date === suspensionDate)) return;
    setSuspensions((current) => [...current, { date: suspensionDate, description: suspensionDescription.trim() }].sort((a, b) => a.date.localeCompare(b.date)));
    setSuspensionDate('');
    setSuspensionDescription('');
  }

  return <section className={`${card} p-5`} aria-labelledby="procedural-term-title" data-testid="procedural-term-calculator">
    <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#B58A5A]">Regla procesal verificada</p>
    <h2 id="procedural-term-title" className="mt-1 !mb-0 !text-xl !leading-tight font-extrabold text-[#0B2545]">Cómputo conforme a la ley aplicable</h2>
    <p className="mt-1 text-xs text-slate-500">Aplica el plazo, el surtimiento de efectos y los días inhábiles de la ley elegida, y muestra el fundamento. Si falta un dato esencial no se entrega fecha límite.</p>

    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <label className={`${label} md:col-span-2`}>Actuación
        <select value={ruleId} onChange={(event) => { setRuleId(event.target.value); setResult(null); }} className={`${field} mt-1.5`}>
          {PROCEDURAL_TERM_RULES.map((item) => <option key={item.id} value={item.id}>{item.label}{item.verification.status !== 'VERIFIED_OFFICIAL_TEXT' ? ' — pendiente de cotejo' : ''}</option>)}
        </select>
      </label>
      <label className={label}>Jurisdicción
        <select value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value as TermJurisdiction | '')} className={`${field} mt-1.5`}>
          <option value="">Selecciona…</option><option value="federal">Federal</option><option value="local">Local</option>
        </select>
      </label>
      <label className={label}>Materia
        <select value={matter} onChange={(event) => setMatter(event.target.value as TermMatter | '')} className={`${field} mt-1.5`}>
          <option value="">Selecciona…</option>{MATTERS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </label>
      <label className={label}>Tipo de notificación
        <select value={kind} onChange={(event) => setKind(event.target.value as NotificationKind | '')} className={`${field} mt-1.5`}>
          <option value="">Selecciona…</option>{NOTIFICATIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </label>
      {isAmparo && <label className={label}>Quién recibe la notificación
        <select value={recipient} onChange={(event) => setRecipient(event.target.value as RecipientKind | '')} className={`${field} mt-1.5`}>
          <option value="PARTICULAR">Particular (quejoso o tercero)</option><option value="AUTORIDAD">Autoridad</option>
        </select>
      </label>}
      <label className={label}>Fecha de notificación<input type="date" value={notificationDate} onChange={(event) => setNotificationDate(event.target.value)} className={`${field} mt-1.5`} /></label>
      <label className={label}>Fuente de la fecha<input value={dateSource} onChange={(event) => setDateSource(event.target.value)} placeholder="Ej. cédula, lista, acuse" className={`${field} mt-1.5`} /></label>
      <label className={`${label} md:col-span-2`}>Fecha de surtimiento (opcional)<input type="date" value={effectDate} onChange={(event) => setEffectDate(event.target.value)} className={`${field} mt-1.5`} />
        <span className="mt-1 block font-normal text-[11px] text-slate-500">Llénala si ya conoces cuándo surtió efectos (obligatoria cuando depende de la ley del acto).</span>
      </label>
    </div>

    <div className="mt-4 rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-bold text-[#0B2545]">Suspensiones oficiales de labores del órgano</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
        <input type="date" aria-label="Fecha de suspensión" value={suspensionDate} onChange={(event) => setSuspensionDate(event.target.value)} className={field} />
        <input aria-label="Acuerdo o aviso oficial" value={suspensionDescription} onChange={(event) => setSuspensionDescription(event.target.value)} placeholder="Acuerdo o aviso oficial" className={field} />
        <button type="button" onClick={addSuspension} className="rounded-xl border border-slate-300 px-3 text-xs font-bold text-[#0B2545]">Agregar suspensión</button>
      </div>
      {suspensions.length > 0 && <ul className="mt-3 space-y-1 text-[11px] text-slate-700">{suspensions.map((item) => <li key={item.date} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1"><span>{item.date} · {item.description}</span><button type="button" aria-label={`Quitar suspensión del ${item.date}`} onClick={() => setSuspensions((current) => current.filter((entry) => entry.date !== item.date))} className="font-bold text-slate-500">×</button></li>)}</ul>}
      <label className="mt-3 flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={calendarConfirmed} onChange={(event) => setCalendarConfirmed(event.target.checked)} className="mt-0.5" /> Revisé el calendario oficial del órgano para todo el periodo del término.</label>
    </div>

    <button type="button" onClick={calculate} className="mt-5 rounded-xl bg-[#0B2545] px-4 py-3 text-xs font-bold text-white">Calcular conforme a la regla</button>

    {result && <ProceduralTermResultView result={result} />}
  </section>;
}

function ProceduralTermResultView({ result }: { result: ProceduralTermResult }) {
  const certaintyLabel = { ALTA: 'Certeza alta', MEDIA: 'Certeza media', REQUIERE_CONFIRMAR: 'Requiere confirmar' }[result.certainty];
  return <div className="mt-4 space-y-3 text-xs leading-relaxed" aria-live="polite" data-testid="procedural-term-result">
    {result.deadline
      ? <div className="rounded-xl bg-emerald-50 p-4 text-emerald-900"><p className="font-extrabold">Vence: {longDate(result.deadline)}</p><p className="mt-1">{certaintyLabel} · {result.ruleLabel} (regla v{result.ruleVersion})</p></div>
      : <div className="rounded-xl bg-amber-50 p-4 text-amber-900">
          <p className="font-extrabold">Requiere confirmar: no se entrega fecha límite.</p>
          {result.provisionalDeadline && <p className="mt-1">Fecha provisional, sujeta al calendario oficial: {longDate(result.provisionalDeadline)}.</p>}
          <ul className="mt-2 list-disc pl-4">{result.missing.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>}

    {result.steps.length > 0 && <div className="rounded-xl border border-slate-200 p-4"><p className="font-bold text-[#0B2545]">Operación del cálculo</p><ol className="mt-2 list-decimal space-y-1 pl-4 text-slate-700">{result.steps.map((step) => <li key={step.order}>{step.description}</li>)}</ol></div>}

    {result.legalBasis.length > 0 && <div className="rounded-xl border border-slate-200 p-4"><p className="font-bold text-[#0B2545]">Fundamento</p><ul className="mt-2 space-y-2 text-slate-700">{result.legalBasis.map((basis) => <li key={`${basis.law}-${basis.article}`}><span className="font-bold">Art. {basis.article} {basis.law}:</span> «{basis.excerpt}» <a href={basis.officialUrl} target="_blank" rel="noreferrer" className="font-bold text-[#0B2545] underline">Texto oficial</a> <span className="text-slate-500">(última reforma DOF {basis.lawLastReformDof})</span></li>)}</ul></div>}

    {result.calendarConsulted.label && <div className="rounded-xl border border-slate-200 p-4 text-slate-700"><p className="font-bold text-[#0B2545]">Calendario aplicado</p><p className="mt-1">{result.calendarConsulted.label}. {result.calendarConsulted.confirmedForPeriod ? 'Calendario del órgano confirmado por el abogado.' : 'Calendario del órgano sin confirmar.'}</p>{result.calendarConsulted.nonWorkingDaysInRange.length > 0 && <ul className="mt-1 list-disc pl-4">{result.calendarConsulted.nonWorkingDaysInRange.map((item) => <li key={item.date}>{item.date}: {item.reason}</li>)}</ul>}</div>}

    {result.warnings.length > 0 && <details className="rounded-xl border border-slate-200 p-4 text-slate-700"><summary className="cursor-pointer font-bold text-[#0B2545]">Advertencias ({result.warnings.length})</summary><ul className="mt-2 list-disc space-y-1 pl-4">{result.warnings.map((item) => <li key={item}>{item}</li>)}</ul></details>}

    <p className="text-[11px] text-slate-500">{result.disclaimer}</p>
  </div>;
}
