"use client";

import React, { useState } from "react";

interface PdfUploaderProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function PdfUploader({ onFileSelected, disabled = false }: PdfUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Solo se admiten archivos en formato PDF.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("El archivo supera el tamaño máximo permitido (15 MB).");
      return;
    }
    setFileName(file.name);
    onFileSelected(file);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
          }
        }}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
          dragOver ? "border-blue-600 bg-blue-50/50" : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
        } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      >
        <input
          type="file"
          accept=".pdf,application/pdf"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFile(e.target.files[0]);
            }
          }}
          className="hidden"
          id="pdf-file-input"
        />
        <label htmlFor="pdf-file-input" className="cursor-pointer space-y-2 block">
          <div className="text-3xl">📄</div>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {fileName ? `Archivo seleccionado: ${fileName}` : "Haz clic o arrastra un PDF aquí"}
            </p>
            <p className="text-xs text-slate-500 mt-1">Formato anterior, demanda previa o contestación (Máx. 15MB)</p>
          </div>
        </label>
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  );
}
