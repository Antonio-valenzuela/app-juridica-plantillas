'use client';

import React, { useEffect, useState } from 'react';
import { LawyerProfile, DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

const TONE_OPTIONS = ['formal_academico', 'combativo_tecnico', 'directo_conciso', 'jurisprudencial'];
const CITATION_OPTIONS = ['completo_con_registro', 'sintetico', 'pie_de_pagina', 'transcripcion_marcada'];
const SECTION_LENGTH_OPTIONS = ['breve', 'medio', 'extenso'];
const DOC_LENGTH_OPTIONS = ['conciso', 'estandar', 'extenso_exhaustivo'];

type ArrayFieldKey =
  | 'preferredStructure'
  | 'preferredSectionOrdering'
  | 'recurringFormulas'
  | 'openingPatterns'
  | 'closingPatterns'
  | 'argumentPatterns'
  | 'legalTerminology'
  | 'preferredDefenses'
  | 'preferredWayToContestFacts'
  | 'preferredWayToContestBenefits'
  | 'preferredWayToAttackEvidence'
  | 'preferredWayToDevelopConstitutionalArguments'
  | 'preferredWayToWritePetition';

const ARRAY_FIELDS: Array<{ key: ArrayFieldKey; label: string }> = [
  { key: 'preferredStructure', label: 'Estructura preferida' },
  { key: 'preferredSectionOrdering', label: 'Orden de secciones' },
  { key: 'recurringFormulas', label: 'Fórmulas recurrentes' },
  { key: 'openingPatterns', label: 'Aperturas típicas' },
  { key: 'closingPatterns', label: 'Cierres típicos' },
  { key: 'argumentPatterns', label: 'Patrones de argumentación' },
  { key: 'legalTerminology', label: 'Terminología jurídica' },
  { key: 'preferredDefenses', label: 'Defensas preferidas' },
  { key: 'preferredWayToContestFacts', label: 'Forma de contestar hechos' },
  { key: 'preferredWayToContestBenefits', label: 'Forma de contestar prestaciones' },
  { key: 'preferredWayToAttackEvidence', label: 'Forma de objetar pruebas' },
  { key: 'preferredWayToDevelopConstitutionalArguments', label: 'Argumentos constitucionales' },
  { key: 'preferredWayToWritePetition', label: 'Forma de petitorios' },
];

interface LawyerStyleProfileCardProps {
  uploadedSourceDocs: UploadedSourceDocument[];
  onRequestFiles: () => void;
}

export function LawyerStyleProfileCard({ uploadedSourceDocs, onRequestFiles }: LawyerStyleProfileCardProps) {
  const [form, setForm] = useState<LawyerProfile>({ ...DEFAULT_LAWYER_PROFILE });
  const [isDefault, setIsDefault] = useState(true);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<'idle' | 'loading' | 'extracting' | 'saving'>('idle');
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy('loading');
      try {
        const res = await fetch('/api/workspace/lawyer-profile');
        const data = await res.json();
        if (!cancelled && data?.ok && data.profile) {
          setForm({ ...DEFAULT_LAWYER_PROFILE, ...data.profile });
          setIsDefault(Boolean(data.isDefault));
        }
      } catch {
        if (!cancelled) setStatus('No se pudo cargar el perfil guardado.');
      } finally {
        if (!cancelled) setBusy('idle');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleExtract = async () => {
    // Reutiliza el input de archivos YA existente del workspace cuando no hay documentos.
    if (!uploadedSourceDocs || uploadedSourceDocs.length === 0) {
      setStatus('Primero carga un escrito de muestra con el botón "Agregar" del workspace.');
      onRequestFiles();
      return;
    }
    setBusy('extracting');
    setStatus(`Analizando ${uploadedSourceDocs.length} escrito(s) con IA…`);
    try {
      const res = await fetch('/api/workspace/lawyer-profile/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocuments: uploadedSourceDocs }),
      });
      const data = await res.json();
      if (data?.ok && data.proposed) {
        setForm((prev) => ({ ...prev, ...(data.proposed as Partial<LawyerProfile>) }));
        setIsDefault(false);
        setStatus('Perfil propuesto por la IA. Revísalo y presiona "Guardar perfil".');
      } else {
        const messages: Record<string, string> = {
          MISSING_SOURCE_DOCUMENTS: 'No hay documentos para analizar.',
          NO_TEXT_CONTENT: 'Los documentos no tienen suficiente texto extraído.',
          AI_UNAVAILABLE: 'El proveedor de IA no está disponible.',
          AI_INVALID_RESPONSE: 'La IA devolvió una respuesta no válida.',
          AI_TIMEOUT: 'El análisis tardó demasiado. Intenta de nuevo.',
        };
        setStatus(messages[data?.error] || `No se pudo analizar: ${data?.error || 'error desconocido'}`);
      }
    } catch (err: any) {
      setStatus(`Error al analizar: ${err?.message || err}`);
    } finally {
      setBusy('idle');
    }
  };

  const handleSave = async () => {
    setBusy('saving');
    setStatus('Guardando perfil…');
    try {
      const payload: LawyerProfile = { ...form, lawyerId: '', createdAt: undefined, updatedAt: undefined };
      const res = await fetch('/api/workspace/lawyer-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.ok && data.profile) {
        setForm({ ...DEFAULT_LAWYER_PROFILE, ...data.profile });
        setIsDefault(false);
        setStatus('✓ Perfil guardado correctamente.');
        setIsExpanded(false);
      } else {
        setStatus(data?.error === 'PROFILE_SAVE_FAILED' ? 'No se pudo guardar el perfil.' : `Error: ${data?.error}`);
      }
    } catch (err: any) {
      setStatus(`Error al guardar: ${err?.message || err}`);
    } finally {
      setBusy('idle');
    }
  };

  const inputClass = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#0B2545] transition';
  const selectClass = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-[#0B2545] transition';
  const textareaClass = 'w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#0B2545]';
  const labelClass = 'text-[11px] font-bold text-slate-600 block mb-1';
  const isBusy = busy !== 'idle';

  // ── Compact card (default) ──
  if (!isExpanded) {
    return (
      <div className="bg-white p-5 rounded-2xl border border-[#E7DFD2] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5" style={{ filter: 'sepia(1) saturate(2.4) hue-rotate(-18deg)' }}>🖋️</span>
            <div>
              <h2 className="text-sm font-black text-[#0B2545]">Perfil del abogado</h2>
              {!isDefault ? (
                <>
                  <p className="text-xs font-bold text-emerald-700">✓ Perfil configurado</p>
                  <p className="text-xs text-slate-600 font-medium">{form.lawyerName} {form.firmName ? `· ${form.firmName}` : ''}</p>
                </>
              ) : (
                <p className="text-xs text-slate-500">Personaliza los documentos con tu estilo profesional.</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            className="px-4 py-2 bg-[#0B2545] hover:bg-[#081d39] text-white text-xs font-bold rounded-xl transition whitespace-nowrap"
            aria-label={isDefault ? 'Agregar perfil del abogado' : 'Editar perfil del abogado'}
          >
            {isDefault ? '+ Agregar perfil' : 'Editar perfil'}
          </button>
        </div>
        {status && <p className="text-xs text-slate-500 font-semibold text-center mt-3">{status}</p>}
        {isDefault && <p className="text-[11px] text-slate-400 text-center mt-2">La IA aprende tu estilo a partir de tus escritos y lo aplica a cada documento generado.</p>}
      </div>
    );
  }

  // ── Expanded form ──
  return (
    <div className="bg-white p-6 rounded-2xl border border-[#E7DFD2] shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl" style={{ filter: 'sepia(1) saturate(2.4) hue-rotate(-18deg)' }}>🖋️</span>
          <h2 className="text-lg font-black text-[#0B2545]">Perfil de estilo del abogado</h2>
          <span
            className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap"
            style={{
              background: isDefault ? '#F1F5F9' : '#F7F1E8',
              color: isDefault ? '#475569' : '#8F6745',
              borderColor: isDefault ? '#E2E8F0' : '#D6B887',
            }}
          >
            {isDefault ? 'perfil por defecto' : 'perfil personalizado'}
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-xs font-bold text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg border border-slate-200"
          aria-label="Cerrar perfil"
        >
          ✕ Cerrar
        </button>
      </div>
      <p className="text-xs text-slate-500 text-center">La IA aprende tu estilo a partir de tus escritos y lo aplica a cada documento generado.</p>
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={handleExtract}
          disabled={isBusy}
          className="px-4 py-2 bg-[#0B2545] hover:bg-[#081d39] disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
        >
          🔍 Analizar mis escritos
        </button>
        <button
          onClick={handleSave}
          disabled={isBusy}
          className="px-4 py-2 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition"
          style={{ background: 'linear-gradient(135deg,#B58A5A,#8F6745)' }}
        >
          Guardar perfil
        </button>
        <button
          onClick={() => setIsExpanded(false)}
          disabled={isBusy}
          className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition"
        >
          Cancelar
        </button>
      </div>

      {/* Campos en una sola columna, full-width */}
      <div className="grid grid-cols-1 gap-3 pt-1">
        <div>
          <label className={labelClass}>Nombre del abogado</label>
          <input
            type="text"
            value={form.lawyerName}
            onChange={(e) => setForm((prev) => ({ ...prev, lawyerName: e.target.value }))}
            placeholder="Abogado Titular"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Despacho</label>
          <input
            type="text"
            value={form.firmName || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, firmName: e.target.value }))}
            placeholder="Despacho Jurídico Radar"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Tono preferido</label>
          <select
            value={form.preferredTone}
            onChange={(e) => setForm((prev) => ({ ...prev, preferredTone: e.target.value as LawyerProfile['preferredTone'] }))}
            className={selectClass}
          >
            {TONE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Estilo de citas</label>
          <select
            value={form.citationStyle}
            onChange={(e) => setForm((prev) => ({ ...prev, citationStyle: e.target.value as LawyerProfile['citationStyle'] }))}
            className={selectClass}
          >
            {CITATION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Extensión por sección</label>
          <select
            value={form.averageSectionLength}
            onChange={(e) => setForm((prev) => ({ ...prev, averageSectionLength: e.target.value as LawyerProfile['averageSectionLength'] }))}
            className={selectClass}
          >
            {SECTION_LENGTH_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Longitud del documento</label>
          <select
            value={form.preferredDocumentLength}
            onChange={(e) => setForm((prev) => ({ ...prev, preferredDocumentLength: e.target.value as LawyerProfile['preferredDocumentLength'] }))}
            className={selectClass}
          >
            {DOC_LENGTH_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* Línea dorada decorativa antes de Patrones de redacción */}
      <div
        aria-hidden="true"
        className="h-[3px] w-full rounded-full"
        style={{ background: 'linear-gradient(90deg,#D6B887 0%,#B58A5A 45%,rgba(222,216,201,.25) 100%)' }}
      />

      <details className="pt-0">
        <summary className="text-xs font-bold text-slate-700 cursor-pointer select-none">
          Patrones de redacción ({ARRAY_FIELDS.length} categorías)
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {ARRAY_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className={labelClass}>{label}</label>
              <textarea
                rows={3}
                value={(form[key] as string[]).join('\n')}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value.split('\n') }))}
                placeholder={'Una entrada por línea…'}
                className={textareaClass}
              />
            </div>
          ))}
        </div>
      </details>

      {status && (
        <p className="text-xs text-slate-500 font-semibold text-center">{status}</p>
      )}
    </div>
  );
}
