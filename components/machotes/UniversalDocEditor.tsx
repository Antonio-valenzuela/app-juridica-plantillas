'use client';

import React, { useState } from 'react';
import type { UniversalLegalDocument, DocumentNode, ContentBlock } from '@/lib/legal-engine/types';
import { addRepeatableSection, removeSection, moveSection } from '@/lib/legal-engine/structureBuilder';

interface UniversalDocEditorProps {
  document: UniversalLegalDocument;
  onUpdateDocument: (updated: UniversalLegalDocument) => void;
  onRegenerateSection: (sectionId: string, instruction?: string) => Promise<void>;
}

export const UniversalDocEditor: React.FC<UniversalDocEditorProps> = ({
  document: doc,
  onUpdateDocument,
  onRegenerateSection,
}) => {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [regeneratingSectionId, setRegeneratingSectionId] = useState<string | null>(null);
  const [customInstruction, setCustomInstruction] = useState<Record<string, string>>({});
  const [showSourceForBlock, setShowSourceForBlock] = useState<ContentBlock | null>(null);

  // Section manipulation
  const handleAddSection = (afterSectionId: string) => {
    const updatedSections = addRepeatableSection(doc.sections, afterSectionId);
    onUpdateDocument({ ...doc, sections: updatedSections, updatedAt: new Date().toISOString() });
  };

  const handleRemoveSection = (sectionId: string) => {
    const updatedSections = removeSection(doc.sections, sectionId);
    onUpdateDocument({ ...doc, sections: updatedSections, updatedAt: new Date().toISOString() });
  };

  const handleMoveSection = (sectionId: string, direction: 'up' | 'down') => {
    const updatedSections = moveSection(doc.sections, sectionId, direction);
    onUpdateDocument({ ...doc, sections: updatedSections, updatedAt: new Date().toISOString() });
  };

  // Block editing (Manual lawyer edit -> set isManuallyEdited: true so AI never overwrites automatically)
  const handleStartEditBlock = (block: ContentBlock) => {
    setEditingBlockId(block.id);
    setEditingText(block.text);
  };

  const handleSaveBlockEdit = (sectionId: string, blockId: string) => {
    const updatedSections = doc.sections.map((section) => {
      if (section.id !== sectionId) return section;
      return {
        ...section,
        content: section.content.map((block) => {
          if (block.id !== blockId) return block;
          return {
            ...block,
            text: editingText,
            isManuallyEdited: true, // Preserve lawyer's manual edit
            trustLevel: 'VERIFIED' as const,
          };
        }),
        isManuallyEdited: true,
      };
    });

    onUpdateDocument({ ...doc, sections: updatedSections, updatedAt: new Date().toISOString() });
    setEditingBlockId(null);
  };

  const handleRegenerateSingle = async (sectionId: string) => {
    setRegeneratingSectionId(sectionId);
    try {
      await onRegenerateSection(sectionId, customInstruction[sectionId]);
    } finally {
      setRegeneratingSectionId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Info */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '1.25rem 1.5rem', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
            {doc.title}
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Vía: <strong>{doc.documentTypeLabel}</strong> | Materia: <strong>{doc.matter.toUpperCase()}</strong> | Secciones: <strong>{doc.sections.length}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => handleAddSection(doc.sections[doc.sections.length - 1]?.id ?? '')}
            style={{
              padding: '0.5rem 0.9rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--surface-muted)',
              color: 'var(--text-main)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ➕ Agregar Sección
          </button>
        </div>
      </div>

      {/* Sections Tree */}
      {doc.sections.map((section, idx) => {
        const isRegenerating = regeneratingSectionId === section.id;

        return (
          <div
            key={section.id}
            style={{
              background: 'var(--surface)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
              border: '1px solid var(--border)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            {/* Section Header Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-muted)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                  #{idx + 1}
                </span>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                  {section.title}
                </h3>
                {section.isManuallyEdited && (
                  <span style={{ fontSize: '0.7rem', background: 'rgba(37, 99, 235, 0.12)', color: '#2563eb', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                    ✏️ Editado por Abogado
                  </span>
                )}
              </div>

              {/* Action Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <button
                  type="button"
                  title="Mover arriba"
                  onClick={() => handleMoveSection(section.id, 'up')}
                  disabled={idx === 0}
                  style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.25rem 0.4rem', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.3 : 1 }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  title="Mover abajo"
                  onClick={() => handleMoveSection(section.id, 'down')}
                  disabled={idx === doc.sections.length - 1}
                  style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.25rem 0.4rem', cursor: idx === doc.sections.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === doc.sections.length - 1 ? 0.3 : 1 }}
                >
                  ▼
                </button>

                {section.isRepeatable && (
                  <button
                    type="button"
                    title="Duplicar sección"
                    onClick={() => handleAddSection(section.id)}
                    style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.78rem', cursor: 'pointer' }}
                  >
                    ➕ Duplicar
                  </button>
                )}

                <button
                  type="button"
                  title="Eliminar sección"
                  onClick={() => handleRemoveSection(section.id)}
                  style={{ background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  🗑️
                </button>

                <button
                  type="button"
                  onClick={() => handleRegenerateSingle(section.id)}
                  disabled={isRegenerating}
                  style={{
                    background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.3rem 0.75rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: isRegenerating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isRegenerating ? '🔄 Generando...' : '✨ Regenerar Sección'}
                </button>
              </div>
            </div>

            {/* Custom Instruction Box for single section */}
            <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Instrucción específica para esta sección (opcional)..."
                value={customInstruction[section.id] || ''}
                onChange={(e) => setCustomInstruction({ ...customInstruction, [section.id]: e.target.value })}
                style={{
                  flex: 1,
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-muted)',
                  color: 'var(--text-main)',
                }}
              />
            </div>

            {/* Content Blocks */}
            {section.content.length === 0 ? (
              <div style={{ padding: '1rem', background: 'var(--surface-muted)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', textAlign: 'center' }}>
                Sección vacía. Haz clic en &quot;Regenerar Sección&quot; o edita manualmente.
              </div>
            ) : (
              section.content.map((block) => {
                const isEditing = editingBlockId === block.id;

                return (
                  <div key={block.id} style={{ marginBottom: '0.75rem' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          rows={6}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1.5px solid var(--primary)',
                            background: 'var(--surface)',
                            color: 'var(--text-main)',
                            fontSize: '0.9rem',
                            lineHeight: 1.6,
                            boxSizing: 'border-box',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => setEditingBlockId(null)}
                            style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveBlockEdit(section.id, block.id)}
                            style={{ padding: '0.35rem 0.9rem', fontSize: '0.8rem', borderRadius: '4px', border: 'none', background: 'var(--primary)', color: '#FFF', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Guardar Cambios
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: '0.85rem 1rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface-muted)',
                          border: '1px solid var(--border)',
                          fontSize: '0.9rem',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          position: 'relative',
                        }}
                      >
                        {/* Trust markers badges */}
                        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                          {block.text.includes('[DATO PENDIENTE') && (
                            <span style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#92400e', padding: '0.1rem 0.4rem', borderRadius: '3px', fontWeight: 700 }}>
                              ⚠️ DATO PENDIENTE
                            </span>
                          )}
                          {block.text.includes('[NO VERIFICADO') && (
                            <span style={{ fontSize: '0.7rem', background: '#fee2e2', color: '#991b1b', padding: '0.1rem 0.4rem', borderRadius: '3px', fontWeight: 700 }}>
                              🔴 NO VERIFICADO
                            </span>
                          )}
                          {block.sourceRef && (
                            <button
                              type="button"
                              onClick={() => setShowSourceForBlock(block)}
                              style={{ fontSize: '0.7rem', background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.4rem', borderRadius: '3px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                            >
                              📌 Ver Fuente ({block.sourceRef.sourceDocumentName})
                            </button>
                          )}
                        </div>

                        {block.text}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
                          <button
                            type="button"
                            onClick={() => handleStartEditBlock(block)}
                            style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                          >
                            ✏️ Editar párrafo
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
      })}

      {/* Traceability Modal */}
      {showSourceForBlock && showSourceForBlock.sourceRef && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', maxWidth: '600px', width: '100%', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>
              📌 Trazabilidad — Fuente del Planteamiento
            </h3>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Documento: <strong>{showSourceForBlock.sourceRef.sourceDocumentName}</strong>
              {showSourceForBlock.sourceRef.page && ` | Página ${showSourceForBlock.sourceRef.page}`}
            </div>

            <div style={{ background: 'var(--surface-muted)', padding: '1rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--text-main)', maxHeight: '200px', overflowY: 'auto' }}>
              &quot;{showSourceForBlock.sourceRef.excerpt || 'Extracto no especificado.'}&quot;
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => setShowSourceForBlock(null)}
                style={{ padding: '0.4rem 1rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: '#FFF', fontWeight: 600, cursor: 'pointer' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
