"use client";

import React, { useState } from "react";

export interface DetectedFieldItem {
  key: string;
  label?: string;
  currentValue: string;
  detectedValue: string;
  confidence: number;
  evidence?: {
    source?: string;
    page?: number;
    paragraph?: number;
    excerpt?: string;
  };
  conflict?: boolean;
}

interface FieldReviewPanelProps {
  detectedFields: Record<string, DetectedFieldItem>;
  missingFields: string[];
  warnings: string[];
  onApplySelected: (appliedFields: Record<string, string>) => void;
  onCancel: () => void;
}

export function FieldReviewPanel({
  detectedFields,
  missingFields,
  warnings,
  onApplySelected,
  onCancel,
}: FieldReviewPanelProps) {
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const [key, item] of Object.entries(detectedFields)) {
      initial[key] = item.confidence >= 0.75;
    }
    return initial;
  });

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAllHighConfidence = () => {
    const next: Record<string, boolean> = {};
    for (const [key, item] of Object.entries(detectedFields)) {
      next[key] = item.confidence >= 0.75;
    }
    setSelectedKeys(next);
  };

  const handleApply = () => {
    const result: Record<string, string> = {};
    for (const [key, item] of Object.entries(detectedFields)) {
      if (selectedKeys[key]) {
        result[key] = item.detectedValue;
      }
    }
    onApplySelected(result);
  };

  return (
    <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-lg space-y-4 text-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h3 className="font-semibold text-lg text-slate-900">Revisión de Campos Detectados por IA</h3>
          <p className="text-xs text-slate-500">
            Revisa y selecciona los datos detectados antes de aplicarlos a tu borrador.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={selectAllHighConfidence}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-3 py-1.5 rounded-lg transition"
          >
            Seleccionar alta confianza
          </button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 p-3 rounded-lg text-xs text-amber-900 space-y-1">
          <p className="font-bold flex items-center gap-1">⚠️ Advertencias jurídicas:</p>
          {warnings.map((w, i) => (
            <p key={i}>• {w}</p>
          ))}
        </div>
      )}

      {missingFields.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-900 space-y-1">
          <p className="font-bold">📋 Datos no encontrados en el documento:</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {missingFields.map((f, i) => (
              <span key={i} className="bg-white border border-blue-200 text-blue-800 px-2 py-0.5 rounded font-mono text-[11px]">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Fields List */}
      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {Object.keys(detectedFields).length === 0 ? (
          <p className="text-center py-6 text-slate-500 text-sm">No se detectaron campos específicos para mapear.</p>
        ) : (
          Object.entries(detectedFields).map(([key, item]) => {
            const isChecked = Boolean(selectedKeys[key]);
            const isHighConf = item.confidence >= 0.75;

            return (
              <div
                key={key}
                className={`p-3.5 rounded-xl border transition-all ${
                  isChecked
                    ? "border-blue-500 bg-blue-50/30 shadow-sm"
                    : "border-slate-200 bg-slate-50/50 opacity-75"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelect(key)}
                    className="mt-1 w-4 h-4 rounded text-blue-700 focus:ring-blue-600 cursor-pointer"
                  />
                  <div className="flex-1 space-y-1 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-slate-900 font-mono text-sm capitalize">{item.label || key}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isHighConf ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        Confianza: {Math.round(item.confidence * 100)}%
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-sans">
                      <div className="bg-white p-2 rounded border border-slate-200 text-slate-600">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Valor actual:</span>
                        <span className="truncate block">{item.currentValue || "(vacío)"}</span>
                      </div>
                      <div className="bg-emerald-50/70 p-2 rounded border border-emerald-200 text-emerald-950 font-medium">
                        <span className="text-[10px] font-bold text-emerald-700 block uppercase">Detectado por IA:</span>
                        <span>{item.detectedValue}</span>
                      </div>
                    </div>

                    {item.evidence?.excerpt && (
                      <p className="text-[11px] text-slate-500 italic bg-white p-2 rounded border border-slate-200 mt-1">
                        &quot;{item.evidence.excerpt}&quot;
                        {item.evidence.page && <span className="font-semibold text-slate-600"> (Pág. {item.evidence.page})</span>}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
        >
          Descartar todo
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="px-5 py-2 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg shadow-md transition flex items-center gap-1.5"
        >
          <span>Aplicar seleccionados</span>
        </button>
      </div>
    </div>
  );
}
