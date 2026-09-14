'use client';
import React from 'react';
import { CUSTOM_VALUE_MAX_LENGTH } from '@/lib/legal-taxonomy';

interface TaxonomyOption {
  value: string;
  label: string;
}

interface TaxonomySelectProps {
  label: string;
  value: string;
  options: TaxonomyOption[];
  onChange: (value: string) => void;
  customValue?: string;
  onCustomChange?: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}

export function TaxonomySelect({
  label,
  value,
  options,
  onChange,
  customValue,
  onCustomChange,
  placeholder,
  required,
}: TaxonomySelectProps) {
  const isOtro = value === 'otro' || value === 'otra';
  return (
    <div className="space-y-1.5">
      <label className="font-bold text-slate-700 block text-[13px]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-[#0B2545] transition"
        aria-label={label}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {isOtro && onCustomChange && (
        <div className="pt-1">
          <label className="text-[11px] font-bold text-amber-700 block mb-1">Especifica *</label>
          <input
            type="text"
            value={customValue || ''}
            onChange={(e) => onCustomChange(e.target.value.slice(0, CUSTOM_VALUE_MAX_LENGTH))}
            placeholder="Ej. Derecho energético"
            maxLength={CUSTOM_VALUE_MAX_LENGTH}
            className="w-full px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm font-medium focus:outline-none focus:border-amber-400 transition"
            aria-label={`${label} - Especifica`}
          />
          <p className="text-[10px] text-slate-400 mt-1 text-right">{(customValue || '').length}/{CUSTOM_VALUE_MAX_LENGTH}</p>
        </div>
      )}
    </div>
  );
}
