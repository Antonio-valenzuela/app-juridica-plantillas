'use client';
import React, { useState } from 'react';
import type { WorkspaceCaseSummary } from '@/lib/workspace/cases';
import type { AgendaEvent } from '@/lib/workspace/agenda';
const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const button = 'rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-[#0B2545] disabled:opacity-50';
async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'No fue posible guardar.');
  return payload;
}
type InputDefinition = { key: string; label: string; type?: string; required?: boolean; options?: Array<{ value: string; label: string }> };
function Fields({ definitions, form, onChange }: { definitions: InputDefinition[]; form: Record<string, string>; onChange: (key: string, value: string) => void }) {
  return <>{definitions.map(item => <label key={item.key} className="text-xs font-bold text-slate-600">{item.label}
    {item.options ? <select className={field} value={form[item.key] || ''} onChange={event => onChange(item.key, event.target.value)}>{item.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      : <input className={field} type={item.type || 'text'} required={item.required} value={form[item.key] || ''} onChange={event => onChange(item.key, event.target.value)} />}
  </label>)}</>;
}
export function DesktopCaseManager({ selected, onSaved }: { selected: WorkspaceCaseSummary | null; onSaved: () => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Array<{ id: string; title: string }>>([]);
  const [id, setId] = useState<string | null>(null);
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  function begin(edit: boolean) {
    setId(edit ? selected!.id : null);
    setForm(edit ? { title: selected!.title, expediente: selected!.expediente || '', matter: selected!.matter || '', jurisdiction: selected!.jurisdiction || '',
      actor: selected!.actor || '', counterparty: selected!.counterparty || '', notes: selected!.notes || '' } : {});
    setDraftIds(edit ? selected!.draftIds || [] : []); setEditing(true); setError('');
    void fetch('/api/legal-drafts').then(async response => { if (!response.ok) throw new Error('No se pudieron cargar los borradores.');
      setDrafts((await response.json()).drafts || []); }).catch(error => setError(error.message));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try { await send('/api/workspace/cases', id ? 'PATCH' : 'POST', { ...form, ...(id ? { id } : {}), draftIds }); setEditing(false); await onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : 'No se pudo guardar el expediente.'); }
    finally { setSaving(false); }
  }
  return <div className="mb-4 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap gap-2">
    <button type="button" className={button} onClick={() => begin(false)}>Nuevo expediente local</button>
    {selected?.kind === 'LOCAL_CASE' && <button type="button" className={button} onClick={() => begin(true)}>Editar expediente y asociar documentos</button>}</div>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {editing && <form onSubmit={save} className="mt-4 grid gap-3 md:grid-cols-2">
      <Fields form={form} onChange={(key, value) => setForm(current => ({ ...current, [key]: value }))} definitions={[
        { key: 'title', label: 'Título del expediente', required: true }, { key: 'expediente', label: 'Número de expediente' },
        { key: 'matter', label: 'Materia del expediente' }, { key: 'jurisdiction', label: 'Jurisdicción del expediente' },
        { key: 'actor', label: 'Parte promovente' }, { key: 'counterparty', label: 'Contraparte' }, { key: 'notes', label: 'Notas del expediente' }]} />
      <label className="text-xs font-bold text-slate-600">Borradores asociados<select multiple className={field} value={draftIds}
        onChange={event => setDraftIds(Array.from(event.target.selectedOptions, option => option.value))}>{drafts.map(draft => <option key={draft.id} value={draft.id}>{draft.title}</option>)}</select></label>
      <div className="flex gap-2 md:col-span-2"><button className={button} disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar expediente'}</button>
        <button className={button} type="button" onClick={() => setEditing(false)}>Cancelar</button></div></form>}</div>;
}
export function DesktopAgendaManager({ events, onSaved }: { events: AgendaEvent[]; onSaved: () => void | Promise<void> }) {
  const [editing, setEditing] = useState(false); const [id, setId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({}); const [cases, setCases] = useState<WorkspaceCaseSummary[]>([]);
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  function begin(event?: AgendaEvent) {
    setId(event?.id || null); setForm(event ? { title: event.title, dueDate: event.dueDate, time: event.time || '', priority: event.priority,
      notes: event.notes || '', eventType: event.eventType || '', caseId: event.caseId || '' } : { priority: 'MEDIUM' }); setEditing(true); setError('');
    void fetch('/api/workspace/cases').then(async response => { if (!response.ok) throw new Error('No se pudieron cargar los expedientes.');
      setCases(((await response.json()).cases || []).filter((item: WorkspaceCaseSummary) => item.kind === 'LOCAL_CASE')); }).catch(error => setError(error.message));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try { await send('/api/workspace/agenda', id ? 'PATCH' : 'POST', { ...form, caseId: form.caseId || null, ...(id ? { id } : {}) }); setEditing(false); await onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : 'No se pudo guardar el evento.'); }
    finally { setSaving(false); }
  }
  async function remove(event: AgendaEvent) {
    if (!window.confirm(`¿Eliminar el evento “${event.title}”?`)) return;
    try { await send('/api/workspace/agenda', 'DELETE', { id: event.id }); await onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : 'No se pudo eliminar.'); }
  }
  return <div className="mt-4 rounded-xl border border-slate-200 p-3"><button type="button" className={button} onClick={() => begin()}>Nuevo evento</button>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    {editing && <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2">
      <Fields form={form} onChange={(key, value) => setForm(current => ({ ...current, [key]: value }))} definitions={[
        { key: 'title', label: 'Título del evento', required: true }, { key: 'dueDate', label: 'Fecha del evento', type: 'date', required: true },
        { key: 'time', label: 'Hora del evento', type: 'time' }, { key: 'priority', label: 'Prioridad del evento', options: [{ value: 'HIGH', label: 'Alta' }, { value: 'MEDIUM', label: 'Media' }, { value: 'LOW', label: 'Baja' }] },
        { key: 'caseId', label: 'Expediente del evento', options: [{ value: '', label: 'Agenda general' }, ...cases.map(item => ({ value: item.id, label: item.title }))] },
        { key: 'eventType', label: 'Tipo de evento' }, { key: 'notes', label: 'Notas del evento' }]} />
      <div className="flex gap-2 sm:col-span-2"><button className={button} type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar evento'}</button><button className={button} type="button" onClick={() => setEditing(false)}>Cancelar</button></div></form>}
    <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{events.map(event => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs">
      <span>{event.title} · {event.dueDate || 'Fecha pendiente de revisión'} {event.time || ''}</span><div className="flex gap-2"><button className={button} type="button" onClick={() => begin(event)}>Editar evento</button><button className={button} type="button" onClick={() => void remove(event)}>Eliminar evento</button></div>
    </div>)}</div></div>;
}
