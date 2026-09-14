'use client';

import React from 'react';
import type { PipelineState, PipelineStage } from '@/lib/legal-engine/types';

interface PipelineProgressProps {
  state: PipelineState;
}

const STAGE_LABELS: Record<PipelineStage, { title: string; desc: string }> = {
  classify: { title: '1. Clasificación', desc: 'Identificación del tipo de documento y vía' },
  extract: { title: '2. Extracción', desc: 'Lectura de texto de documentos adjuntos' },
  analyze: { title: '3. Análisis del Expediente', desc: 'Extracción de hechos, partes y constancias' },
  structure: { title: '4. Estructuración', desc: 'Selección o construcción de secciones dinámicas' },
  identify_issues: { title: '5. Cuestiones Jurídicas', desc: 'Identificación de agravios y controversia' },
  generate_sections: { title: '6. Generación Multietapa', desc: 'Redacción sección por sección con IA' },
  review_coherence: { title: '7. Coherencia', desc: 'Revisión de consistencia procesal' },
  validate: { title: '8. Validación', desc: 'Verificación de requisitos y advertencias' },
};

export const PipelineProgress: React.FC<PipelineProgressProps> = ({ state }) => {
  const status = state.overallStatus || (state.isComplete ? 'complete' : state.currentStage ? 'running' : 'idle');

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
          Pipeline de Generación Multietapa
        </h3>
        <span style={{
          fontSize: '0.8rem',
          padding: '0.25rem 0.6rem',
          borderRadius: '4px',
          fontWeight: 600,
          background: status === 'running' ? 'rgba(37, 99, 235, 0.15)' : status === 'complete' ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface-muted)',
          color: status === 'running' ? '#2563eb' : status === 'complete' ? '#10b981' : 'var(--text-secondary)',
        }}>
          {status === 'running' ? '⚡ Ejecutando...' : status === 'complete' ? '✅ Generación Completa' : 'En pausa'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        {(Array.isArray(state.stages) ? state.stages : Object.values(state.stages || {})).map((stage: any) => {
          const info = STAGE_LABELS[stage.stage as PipelineStage] || { title: String(stage.stage), desc: '' };
          const isPending = stage.status === 'pending';
          const isRunning = stage.status === 'running';
          const isComplete = stage.status === 'complete';
          const isError = stage.status === 'error';

          return (
            <div
              key={stage.stage}
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid',
                borderColor: isRunning
                  ? '#2563eb'
                  : isComplete
                  ? '#10b981'
                  : isError
                  ? '#ef4444'
                  : 'var(--border)',
                background: isRunning
                  ? 'rgba(37, 99, 235, 0.08)'
                  : isComplete
                  ? 'rgba(16, 185, 129, 0.05)'
                  : isError
                  ? 'rgba(239, 68, 68, 0.08)'
                  : 'var(--surface-muted)',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isRunning ? '#2563eb' : isComplete ? '#065f46' : 'var(--text-main)' }}>
                  {info.title}
                </span>
                <span style={{ fontSize: '0.9rem' }}>
                  {isComplete ? '✅' : isRunning ? '⏳' : isError ? '❌' : '⚪'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                {info.desc}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
