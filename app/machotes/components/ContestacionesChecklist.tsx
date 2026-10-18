'use client';

import React from 'react';

interface ContestacionesChecklistProps {
  appealMode?: boolean;
  hasDocument: boolean;
  analysisCompleted: boolean;
  configDefined: boolean;
  isGenerating: boolean;
  generationJob?: {
    total: number;
    completed: number;
    percentage: number;
    currentBlock: string | null;
    status: string;
    stage?: string;
    documentReadiness?: string | null;
  } | null;
  blockReason?: string | null;
  isIncompatible?: boolean;
  onReviewRequirements?: () => void;
  onGenerate: () => void;
  onOpenEditor?: () => void;
  /** Rótulo de la acción según el escrito elegido ("Generar recurso", "Generar escrito"…). */
  actionLabel?: string;
}

export interface ContestacionesGenerationSignals {
  hasDocument: boolean;
  analysisAvailable: boolean;
  analysisRequiresReview?: boolean;
  configDefined: boolean;
  isIncompatible?: boolean;
  isGenerating: boolean;
  blockReason?: string | null;
}

export function canStartContestacionGeneration(signals: ContestacionesGenerationSignals) {
  return Boolean(
    signals.hasDocument &&
      signals.analysisAvailable &&
      signals.configDefined &&
      !signals.isIncompatible &&
      !signals.blockReason &&
      !signals.isGenerating
  );
}

export function ContestacionesChecklist({
  appealMode = false,
  hasDocument,
  analysisCompleted,
  configDefined,
  isGenerating,
  blockReason,
  isIncompatible,
  onReviewRequirements,
  onGenerate,
  onOpenEditor,
  actionLabel: actionLabelOverride,
}: ContestacionesChecklistProps) {
  const isAllReady = canStartContestacionGeneration({
    hasDocument,
    analysisAvailable: analysisCompleted,
    configDefined,
    isIncompatible,
    isGenerating,
    blockReason,
  });
  // Contrato de la feature de apelación (appealPhase1b 1.2): la fila se
  // mantiene VISIBLE en Apelación y sin marcar, como recordatorio de que el
  // análisis de la demanda no está revisado. Se conserva el rótulo histórico
  // para no romper ese contrato; redefinirlo requiere decisión de producto.
  const checklistItems = [
    { label: 'Documento fuente cargado y legible', completed: hasDocument },
    { label: 'Resumen del expediente completado', completed: hasDocument },
    {
      label: 'Análisis de la demanda revisado',
      completed: !appealMode && analysisCompleted,
    },
    { label: appealMode ? 'Configuración de la apelación definida' : 'Configuración de la contestación definida', completed: configDefined },
  ];
  const actionLabel = actionLabelOverride || (appealMode ? 'Generar apelación' : 'Generar contestación');

  // Barra de acción del área de trabajo: el estado de preparación en una línea
  // y una sola acción principal. El motivo de bloqueo se explica en lenguaje
  // llano con un acceso directo al dato pendiente.
  return (
    <section className="lex-actionbar" aria-label="Preparación y generación">
      <div className="lex-actionbar-status">
        <ul className="lex-steps-inline">
          {checklistItems.map((item) => (
            <li key={item.label} className={item.completed ? 'is-done' : undefined}>
              <span className="lex-step-mark" aria-hidden="true">
                {item.completed && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
        {blockReason && !isGenerating && (
          <p className="lex-actionbar-blocker" role="status">
            <strong>Antes de generar:</strong> {blockReason}
          </p>
        )}
      </div>

      <div className="lex-actionbar-actions">
        {blockReason && onReviewRequirements && !isGenerating && (
          <button type="button" onClick={onReviewRequirements} className="lex-button lex-button-ghost">
            Revisar datos para continuar
          </button>
        )}
        {onOpenEditor && (
          <button type="button" onClick={onOpenEditor} className="lex-button lex-button-ghost">
            Continuar en editor jurídico
          </button>
        )}
        <button
          type="button"
          onClick={onGenerate}
          disabled={!isAllReady || isGenerating}
          aria-busy={isGenerating || undefined}
          className="lex-button lex-button-primary"
        >
          {isGenerating ? (
            <>
              <span className="lex-spinner" aria-hidden="true" />
              <span>{actionLabel.replace(/^Generar/, 'Generando')}…</span>
            </>
          ) : (
            <>
              <span>{actionLabel}</span>
              <span aria-hidden="true">→</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}
