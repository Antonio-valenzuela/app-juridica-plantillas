'use client';

import React from 'react';
import { TaxonomySelect } from '@/components/legal-taxonomy/TaxonomySelect';
import type { TemplateItem } from './TemplateLibraryManager';

interface ContestacionesConfigPanelProps {
  selectedDocumentType: string;
  onDocumentTypeChange: (value: string) => void;
  documentTypeOptions: Array<{ value: string; label: string }>;
  generationMode: 'automatic' | 'personal_template' | 'reference_document';
  onGenerationModeChange: (mode: 'automatic' | 'personal_template' | 'reference_document') => void;
  extensionMode: 'standard' | 'extended-legal';
  onExtensionModeChange: (mode: 'standard' | 'extended-legal') => void;
  customTemplates?: TemplateItem[];
  selectedTemplateId?: string;
  onSelectTemplateId?: (id: string) => void;
  userInstructions: string;
  onUserInstructionsChange: (val: string) => void;
  disabled?: boolean;
}

const GENERATION_METHODS = [
  { value: 'automatic', label: 'Estándar', description: 'Redacción guiada por IA' },
  { value: 'personal_template', label: 'Plantilla', description: 'Usar tu machote' },
  { value: 'reference_document', label: 'Referencia', description: 'Basado en otro documento' },
] as const;

export function ContestacionesConfigPanel({
  selectedDocumentType,
  onDocumentTypeChange,
  documentTypeOptions,
  generationMode,
  onGenerationModeChange,
  extensionMode,
  onExtensionModeChange,
  customTemplates = [],
  selectedTemplateId,
  onSelectTemplateId,
  userInstructions,
  onUserInstructionsChange,
  disabled = false,
}: ContestacionesConfigPanelProps) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition hover:border-slate-300/80">
      <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Configuración de la contestación
          </h2>
        </div>
      </div>

      <div className="contestaciones-config-grid">
        {/* Row 1, Col 1: Tipo de escrito */}
        <div>
          <TaxonomySelect
            label="Tipo de escrito"
            value={selectedDocumentType}
            options={documentTypeOptions}
            onChange={onDocumentTypeChange}
            required
          />
        </div>

        {/* Row 1, Col 2: Modo de generación */}
        <div>
          <label className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-600">
            <span>Modo de generación</span>
            <span className="text-slate-400 cursor-help" title="Selecciona el estilo y base para redactar la respuesta">ⓘ</span>
          </label>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {GENERATION_METHODS.map((method) => {
              const active = generationMode === method.value;
              return (
                <label
                  key={method.value}
                  className={`inline-flex cursor-pointer select-none items-center gap-2 text-sm font-semibold ${
                    active ? 'text-[#0B2545]' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <input
                    type="radio"
                    name="generationMode"
                    value={method.value}
                    checked={active}
                    disabled={disabled}
                    onChange={() => onGenerationModeChange(method.value)}
                    className="h-4 w-4 text-[#0B2545] focus:ring-[#0B2545] border-slate-300"
                  />
                  <span>{method.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Row 1, Col 3: Extensión jurídica opt-in */}
        <div>
          <label className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-600">
            <span>Extensión del escrito</span>
            <span className="text-slate-400 cursor-help" title="La opción extensa busca aproximadamente 40 páginas reales en el PDF final">ⓘ</span>
          </label>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {([
              { value: 'standard', label: 'Normal' },
              { value: 'extended-legal', label: 'Extensa (~40 páginas)' },
            ] as const).map((option) => (
              <label
                key={option.value}
                className={`inline-flex cursor-pointer select-none items-center gap-2 text-sm font-semibold ${extensionMode === option.value ? 'text-[#0B2545]' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <input
                  type="radio"
                  name="generationExtension"
                  value={option.value}
                  checked={extensionMode === option.value}
                  disabled={disabled}
                  onChange={() => onExtensionModeChange(option.value)}
                  className="h-4 w-4 border-slate-300 text-[#0B2545] focus:ring-[#0B2545]"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Row 2, Col 1: Machote / plantilla */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">
            Machote / plantilla (opcional)
          </label>

          <select
            value={selectedTemplateId || ''}
            onChange={(e) => onSelectTemplateId?.(e.target.value)}
            disabled={disabled}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-[#0B2545]"
          >
            <option value="">Seleccionar plantilla…</option>
            {customTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name} {tpl.category ? `(${tpl.category})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Row 2, Col 2: Instrucción directa */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-sm font-bold text-[#0B2545]">
              Instrucción directa — ¿Qué quieres generar? <span className="font-normal text-slate-500">(opcional)</span>
            </label>
            <span className="text-[11px] font-mono text-slate-400">
              {userInstructions.length}/2000
            </span>
          </div>

          <textarea
            value={userInstructions}
            onChange={(e) => onUserInstructionsChange(e.target.value.slice(0, 2000))}
            placeholder="Ej. Elabora recurso de apelación contra el Auto de 12/ago/2026 que desecha incidente y cita a sentencia en Exp. 1152/2013 BIS. Argumenta falta de fundamentación y..."
            maxLength={2000}
            rows={3}
            disabled={disabled}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-[#0B2545] resize-y min-h-[84px]"
          />
          <p className="mt-1 text-[11px] text-slate-500">Escribe directamente tu petición. Si llenas este campo, podrás generar aunque la fuente no sea 100% compatible (ej. sentencia → apelación).</p>
        </div>
      </div>
    </section>
  );
}
