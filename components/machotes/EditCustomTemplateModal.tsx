"use client";

import React, { useState } from 'react';
import { TemplateCategory, ProfessionalTemplate } from '@/lib/templates/templateTypes';
import { updateCustomTemplate } from '@/lib/templates/customTemplateStore';

interface EditCustomTemplateModalProps {
  template: ProfessionalTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onTemplateUpdated: (updatedTemplate: ProfessionalTemplate) => void;
}

export function EditCustomTemplateModal({
  template,
  isOpen,
  onClose,
  onTemplateUpdated,
}: EditCustomTemplateModalProps) {
  // El modal se monta condicionalmente ({isEditCustomOpen && ...}): cada apertura es un mount
  // fresco, así que los lazy initializers reproducen exactamente la sincronización que hacía el efecto.
  const [title, setTitle] = useState(() => template?.title || '');
  const [category, setCategory] = useState<TemplateCategory>(() => template?.category || 'General');
  const [legalBasis, setLegalBasis] = useState(() => template?.legalBasis || '');
  const [description, setDescription] = useState(() => template?.description || '');
  const [content, setContent] = useState(() => (template as any)?.content || template?.originalText || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !template) return null;

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Por favor ingresa un nombre para la plantilla.');
      return;
    }
    if (!content.trim()) {
      setError('El contenido de la plantilla no puede estar vacío.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const updated = await updateCustomTemplate(template.id, {
        title: title.trim(),
        category,
        legalBasis: legalBasis.trim(),
        description: description.trim(),
        content: content.trim(),
        originalText: content.trim(),
      });
      onTemplateUpdated(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Ocurrió un error al actualizar la plantilla.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="machote-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-label="Editar Plantilla Personalizada"
    >
      <div
        className="machote-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '800px', width: '90%' }}
      >
        <div className="machote-modal-header">
          <div>
            <h2>✏️ Editar Mi Plantilla Personalizada</h2>
            <p>Modifica los datos y contenido base de tu plantilla</p>
          </div>
          <button onClick={onClose} className="machote-modal-close">
            ✕
          </button>
        </div>

        <div className="machote-modal-body">
          <div className="machote-input-group">
            <label>Nombre de la plantilla *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Demanda de amparo indirecto procesal penal"
              className="machote-input-control"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="machote-input-group">
              <label>Materia / Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                className="machote-input-control"
              >
                <option value="Amparo">Amparo</option>
                <option value="Civil">Civil</option>
                <option value="Familiar">Familiar</option>
                <option value="Mercantil">Mercantil</option>
                <option value="Administrativo/Fiscal">Administrativo/Fiscal</option>
                <option value="General">General</option>
              </select>
            </div>

            <div className="machote-input-group">
              <label>Fundamento normativo (opcional)</label>
              <input
                type="text"
                value={legalBasis}
                onChange={(e) => setLegalBasis(e.target.value)}
                placeholder="Ej. Arts. 107 y 108 Ley de Amparo"
                className="machote-input-control"
              />
            </div>
          </div>

          <div className="machote-input-group">
            <label>Descripción / Notas de la plantilla</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Usar para amparos contra orden de aprehensión en Jalisco"
              className="machote-input-control"
            />
          </div>

          <div className="machote-input-group">
            <label>Contenido base de la plantilla (texto plano)</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              placeholder="Escribe o pega aquí el contenido completo del escrito..."
              className="machote-input-control"
              style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}
            />
          </div>

          {error && (
            <div className="legal-warning" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}
        </div>

        <div className="machote-modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="machote-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="machote-btn-primary"
          >
            {loading ? 'Guardando...' : '💾 Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
