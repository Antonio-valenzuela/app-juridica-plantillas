"use client";

import React, { useState } from "react";
import { PdfUploader } from "./PdfUploader";
import { FieldReviewPanel, DetectedFieldItem } from "./FieldReviewPanel";

interface AiFillModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateName: string;
  templateSections: Array<{ id: string; title: string; required?: boolean }>;
  currentFields: Record<string, any>;
  onApplyFields: (fields: Record<string, string>) => void;
}

export function AiFillModal({
  isOpen,
  onClose,
  templateName,
  templateSections,
  currentFields,
  onApplyFields,
}: AiFillModalProps) {
  const [activeTab, setActiveTab] = useState<"text" | "pdf">("text");
  const [textDescription, setTextDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Review step state
  const [reviewData, setReviewData] = useState<{
    detectedFields: Record<string, DetectedFieldItem>;
    missingFields: string[];
    warnings: string[];
  } | null>(null);

  if (!isOpen) return null;

  const handleProcess = async () => {
    setError(null);
    setLoading(true);
    setLoadingStep("Validando entrada...");

    try {
      const formData = new FormData();
      formData.append("templateName", templateName);

      if (activeTab === "pdf") {
        if (!selectedFile) {
          throw new Error("Por favor selecciona un archivo PDF.");
        }
        setLoadingStep("Extrayendo texto del PDF...");
        formData.append("file", selectedFile);
        formData.append("mode", "pdf");
      } else {
        if (!textDescription.trim()) {
          throw new Error("Por favor describe el asunto o pega los hechos.");
        }
        setLoadingStep("Analizando texto con IA...");
        formData.append("text", textDescription);
        formData.append("mode", "text");
      }

      setLoadingStep("Ejecutando análisis estructurado y verificando evidencias...");
      const res = await fetch("/api/templates/ai-fill", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "No se pudo procesar el autollenado.");
      }

      setLoadingStep("Preparando propuestas de campos...");

      const rawFields = json.data?.fields || {};
      const detectedFields: Record<string, DetectedFieldItem> = {};

      for (const section of templateSections) {
        const aiField = rawFields[section.id] || rawFields[section.title.toLowerCase()];
        if (aiField && aiField.value) {
          detectedFields[section.id] = {
            key: section.id,
            label: section.title,
            currentValue: String(currentFields[section.id] || ""),
            detectedValue: String(aiField.value),
            confidence: Number(aiField.confidence || 0.85),
            evidence: aiField.evidence,
          };
        }
      }

      // If no exact match found, map generic fields
      if (Object.keys(detectedFields).length === 0) {
        for (const [k, v] of Object.entries(rawFields)) {
          const valObj = v as any;
          if (valObj && valObj.value) {
            detectedFields[k] = {
              key: k,
              label: k.replace(/_/g, " "),
              currentValue: String(currentFields[k] || ""),
              detectedValue: String(valObj.value),
              confidence: Number(valObj.confidence || 0.8),
              evidence: valObj.evidence,
            };
          }
        }
      }

      setReviewData({
        detectedFields,
        missingFields: json.data?.missingFields || [],
        warnings: json.data?.warnings || [],
      });
    } catch (err: any) {
      setError(err.message || "Error al procesar la solicitud.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  const handleApplySelected = (fields: Record<string, string>) => {
    onApplyFields(fields);
    setReviewData(null);
    onClose();
  };

  return (
    <div className="machote-modal-backdrop" onClick={onClose}>
      <div className="machote-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="machote-modal-header">
          <div>
            <h2>✨ Autollenado Inteligente del Machote</h2>
            <p>
              Plantilla seleccionada: <strong>{templateName}</strong>
            </p>
          </div>
          <button onClick={onClose} className="machote-modal-close">
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="machote-modal-body">
          {reviewData ? (
            <FieldReviewPanel
              detectedFields={reviewData.detectedFields}
              missingFields={reviewData.missingFields}
              warnings={reviewData.warnings}
              onApplySelected={handleApplySelected}
              onCancel={() => setReviewData(null)}
            />
          ) : (
            <>
              {/* Mode Tabs */}
              <div className="machote-modal-tabs">
                <button
                  type="button"
                  onClick={() => setActiveTab("text")}
                  className={`machote-modal-tab ${activeTab === "text" ? "active" : ""}`}
                >
                  1. Describir el asunto
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("pdf")}
                  className={`machote-modal-tab ${activeTab === "pdf" ? "active" : ""}`}
                >
                  2. Subir formato anterior en PDF
                </button>
              </div>

              {/* Tab 1: Text Description */}
              {activeTab === "text" && (
                <div className="machote-input-group">
                  <label>
                    Describe los hechos, partes, fechas, juzgado y acto reclamado:
                  </label>
                  <textarea
                    value={textDescription}
                    onChange={(e) => setTextDescription(e.target.value)}
                    disabled={loading}
                    rows={8}
                    placeholder="Ejemplo: El Sr. Juan Pérez López fue notificado el 15 de julio de una orden emitida por el Juzgado Segundo Civil de Guadalajara en el expediente 452/2026..."
                    className="machote-input-control"
                  />
                </div>
              )}

              {/* Tab 2: PDF Upload */}
              {activeTab === "pdf" && (
                <div className="machote-input-group">
                  <label>
                    Selecciona un archivo PDF previo (demanda, contestación o formato anterior):
                  </label>
                  <PdfUploader
                    disabled={loading}
                    onFileSelected={(file) => setSelectedFile(file)}
                  />
                </div>
              )}

              {error && (
                <div className="legal-warning" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                  {error}
                </div>
              )}

              {loading && (
                <div className="info-block">
                  <strong>⏳ {loadingStep}</strong>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!reviewData && (
          <div className="machote-modal-footer">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="machote-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleProcess}
              disabled={loading || (activeTab === "text" && !textDescription.trim()) || (activeTab === "pdf" && !selectedFile)}
              className="machote-btn-primary"
            >
              {loading ? "Analizando..." : "Analizar y rellenar machote"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
