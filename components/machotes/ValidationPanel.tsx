'use client';

import React from 'react';
import type { ValidationResult } from '@/lib/legal-engine/types';

interface ValidationPanelProps {
  validation?: ValidationResult;
  onExport: () => void;
  isExporting?: boolean;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({
  validation,
  onExport,
  isExporting = false,
}) => {
  if (!validation) return null;

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', border: '1px solid var(--border)', marginTop: '1.5rem' }}>
      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>📋</span> Validación Pre-Exportación
      </h3>

      {/* Checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
        {(validation.checks || []).map((check) => {
          const isPass = check.status === 'pass';
          const isFail = check.status === 'fail';
          const isWarn = check.status === 'warning';

          return (
            <div
              key={check.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.6rem',
                padding: '0.6rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                background: isPass
                  ? 'rgba(16, 185, 129, 0.06)'
                  : isFail
                  ? 'rgba(239, 68, 68, 0.06)'
                  : isWarn
                  ? 'rgba(245, 158, 11, 0.06)'
                  : 'var(--surface-muted)',
                fontSize: '0.85rem',
              }}
            >
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>
                {isPass ? '✅' : isFail ? '❌' : isWarn ? '⚠️' : '⚪'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{check.label}</div>
                {check.message && (
                  <div style={{ fontSize: '0.78rem', color: isFail ? '#dc2626' : isWarn ? '#d97706' : 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    {check.message}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Export Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
        <div>
          {!validation.canExport ? (
            <span style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}>
              ❌ Corrige los errores críticos marcados antes de exportar.
            </span>
          ) : validation.warnings.length > 0 ? (
            <span style={{ color: '#d97706', fontSize: '0.85rem', fontWeight: 600 }}>
              ⚠️ El documento tiene advertencias pero puede ser exportado.
            </span>
          ) : (
            <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
              ✅ Documento 100% validado y listo para presentación.
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onExport}
          disabled={!validation.canExport || isExporting}
          style={{
            padding: '0.75rem 1.75rem',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: !validation.canExport || isExporting ? 'var(--text-muted)' : 'var(--primary)',
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: '0.92rem',
            cursor: !validation.canExport || isExporting ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {isExporting ? 'Generando DOCX...' : '📄 Exportar a Word (.docx)'}
        </button>
      </div>
    </div>
  );
};
