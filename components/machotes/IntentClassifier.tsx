'use client';

import React, { useState } from 'react';
import type { ClassificationResult } from '@/lib/legal-engine/types';
import { classifyIntent } from '@/lib/legal-engine/classifier';

interface IntentClassifierProps {
  onConfirmClassification: (classification: ClassificationResult, text: string) => void;
  isProcessing?: boolean;
}

export const IntentClassifier: React.FC<IntentClassifierProps> = ({
  onConfirmClassification,
  isProcessing = false,
}) => {
  const [inputText, setInputText] = useState('');

  const classification: ClassificationResult | null = inputText.trim().length > 5 ? classifyIntent(inputText) : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const finalClassification = classification ?? classifyIntent(inputText);
    onConfirmClassification(finalClassification, inputText);
  };

  const samplePrompts = [
    '“Necesito contestar esta demanda laboral de despido injustificado”',
    '“Quiero interponer un Recurso de Revisión en Amparo Directo ante la SCJN por inoperancia en cosa juzgada”',
    '“Necesito preparar una demanda de amparo indirecto contra una orden de visita del SAT”',
    '“Requiero un escrito para solicitar el cumplimiento de una sentencia civil”',
    '“Necesito elaborar agravios contra una resolución administrativa de clausura”',
  ];

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', border: '1px solid var(--border)' }}>
      <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>✨</span> ¿Qué documento jurídico necesitas elaborar?
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Escribe en lenguaje natural lo que necesitas. El motor analizará tu intención, identificará la materia, la vía y construirá la estructura adecuada.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ejemplo: Necesito redactar un Recurso de Revisión contra una sentencia de amparo..."
            rows={4}
            style={{
              width: '100%',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)',
              background: 'var(--surface-muted)',
              color: 'var(--text-main)',
              fontSize: '0.95rem',
              lineHeight: 1.5,
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Dynamic Classification Card */}
        {classification && (
          <div style={{
            background: 'rgba(37, 99, 235, 0.06)',
            border: '1px solid rgba(37, 99, 235, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary)' }}>
                Detección Automática
              </span>
              <span style={{ fontSize: '0.78rem', background: 'rgba(37, 99, 235, 0.12)', color: 'var(--primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                {Math.round(classification.confidence * 100)}% Confianza
              </span>
            </div>

            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
              {classification.documentTypeLabel}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.82rem' }}>
              <span style={{ background: 'var(--surface)', padding: '0.25rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                Materia: <strong style={{ color: 'var(--text-main)' }}>{classification.matter.toUpperCase()}</strong>
              </span>
              <span style={{ background: 'var(--surface)', padding: '0.25rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                Jurisdicción: <strong style={{ color: 'var(--text-main)' }}>{classification.jurisdiction.toUpperCase()}</strong>
              </span>
              <span style={{ background: 'var(--surface)', padding: '0.25rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                Etapa: <strong style={{ color: 'var(--text-main)' }}>{classification.proceduralStage}</strong>
              </span>
              {classification.authority && (
                <span style={{ background: 'var(--surface)', padding: '0.25rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  Autoridad: <strong style={{ color: 'var(--text-main)' }}>{classification.authority}</strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Sample Prompts Chips */}
        {!inputText && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
              O selecciona un caso de uso frecuente:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {samplePrompts.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setInputText(sample.replace(/^[“”]/g, '').replace(/[“”]$/g, ''))}
                  style={{
                    textAlign: 'left',
                    background: 'transparent',
                    border: '1px border var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.82rem',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(11, 37, 69, 0.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!inputText.trim() || isProcessing}
          style={{
            width: '100%',
            padding: '0.85rem 1.5rem',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: !inputText.trim() || isProcessing ? 'var(--text-muted)' : 'var(--primary)',
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: !inputText.trim() || isProcessing ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          {isProcessing ? 'Procesando e iniciando motor...' : '🚀 Iniciar Estructuración del Escrito'}
        </button>
      </form>
    </div>
  );
};
