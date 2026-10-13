'use client';

import React from 'react';
import { isCivilFamilyAppeal } from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import { TaxonomySelect } from '@/components/legal-taxonomy/TaxonomySelect';
import type { PageTarget } from '@/lib/legal-engine/pageTarget';
import { PageTargetSelector } from './PageTargetSelector';
import type { TemplateItem } from './TemplateLibraryManager';

interface ContestacionesConfigPanelProps {
  selectedDocumentType: string;
  onDocumentTypeChange: (value: string) => void;
  documentTypeOptions: Array<{ value: string; label: string }>;
  generationMode: 'automatic' | 'personal_template' | 'reference_document';
  onGenerationModeChange: (mode: 'automatic' | 'personal_template' | 'reference_document') => void;
  pageTarget: PageTarget;
  onPageTargetChange: (target: PageTarget) => void;
  customTemplates?: TemplateItem[];
  selectedTemplateId?: string;
  onSelectTemplateId?: (id: string) => void;
  userInstructions: string;
  onUserInstructionsChange: (val: string) => void;
  disabled?: boolean;
  /** Muestra en el selector los tipos aún no certificados (solo como borrador asistido). */
  showUncertifiedDrafts?: boolean;
  onShowUncertifiedDraftsChange?: (value: boolean) => void;
  /** Abre el modal para subir y guardar una plantilla (machote) del abogado. */
  onUploadTemplate?: () => void;
}

/**
 * Configuración del escrito, primera tarjeta del inspector:
 *  1. Tipo de escrito.
 *  2. Cómo redactar: automáticamente o sobre la plantilla del abogado, cuya
 *     estructura y estilo se conservan y cuyo contenido se sustituye por el del caso.
 *  3. Opciones avanzadas (extensión e instrucción directa), plegadas.
 */
export function ContestacionesConfigPanel({
  selectedDocumentType,
  onDocumentTypeChange,
  documentTypeOptions,
  generationMode,
  onGenerationModeChange,
  pageTarget,
  onPageTargetChange,
  customTemplates = [],
  selectedTemplateId,
  onSelectTemplateId,
  userInstructions,
  onUserInstructionsChange,
  disabled = false,
  showUncertifiedDrafts,
  onShowUncertifiedDraftsChange,
  onUploadTemplate,
}: ContestacionesConfigPanelProps) {
  const isAppeal = isCivilFamilyAppeal(selectedDocumentType);
  const title = isAppeal
    ? 'Configuración de la apelación'
    : /^contestacion/.test(selectedDocumentType) ? 'Configuración de la contestación' : 'Configuración del escrito';
  const usesTemplate = generationMode === 'personal_template';
  const depthLabel = `≈ ${pageTarget.pages} pp.`;

  return (
    <section data-testid="contestaciones-config-panel" className="lex-card">
      <div className="lex-card-header">
        <h2 className="lex-card-title">{title}</h2>
      </div>

      <div className="lex-config-primary">
        <TaxonomySelect
          label="Tipo de escrito"
          value={selectedDocumentType}
          options={documentTypeOptions}
          onChange={onDocumentTypeChange}
          required
        />
        {onShowUncertifiedDraftsChange && (
          <label className="lex-checkbox" title="Muestra también tipos aún no certificados; se generan solo como borrador asistido y no admiten versión FINAL.">
            <input
              type="checkbox"
              checked={Boolean(showUncertifiedDrafts)}
              disabled={disabled}
              onChange={(event) => onShowUncertifiedDraftsChange(event.target.checked)}
            />
            <span>En desarrollo (sin certificar)</span>
          </label>
        )}

        <fieldset className="lex-fieldset">
          <legend>Cómo redactar</legend>
          <div className="lex-segmented lex-segmented-full" role="radiogroup" aria-label="Cómo redactar">
            {([
              { value: 'automatic', label: 'Automáticamente' },
              { value: 'personal_template', label: 'Con mi plantilla' },
            ] as const).map((option) => (
              <label key={option.value} className={generationMode === option.value ? 'is-active' : undefined}>
                <input
                  type="radio"
                  name="generationMode"
                  value={option.value}
                  checked={generationMode === option.value}
                  disabled={disabled}
                  onChange={() => onGenerationModeChange(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

          {usesTemplate && (
            <div className="lex-template-picker">
              <label htmlFor="contestaciones-template" className="lex-field-label">Plantilla (machote)</label>
              <select
                id="contestaciones-template"
                value={selectedTemplateId || ''}
                onChange={(e) => onSelectTemplateId?.(e.target.value)}
                disabled={disabled}
                className="lex-select"
              >
                <option value="">{customTemplates.length ? 'Elige una plantilla…' : 'Aún no tienes plantillas'}</option>
                {customTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} {tpl.category ? `(${tpl.category})` : ''}
                  </option>
                ))}
              </select>
              {onUploadTemplate && (
                <button type="button" className="lex-button lex-button-secondary lex-button-compact" onClick={onUploadTemplate} disabled={disabled}>
                  Subir plantilla
                </button>
              )}
              <p className="lex-help">
                El borrador conserva la estructura, encabezados y estilo de tu plantilla y sustituye su contenido por la contestación del caso.
              </p>
            </div>
          )}
        </fieldset>
      </div>

      <div className="lex-config-extension">
        <PageTargetSelector value={pageTarget} onChange={onPageTargetChange} disabled={disabled} />
      </div>

      <details className="lex-disclosure">
        <summary>
          <span>Más opciones</span>
          <span className="lex-disclosure-hint">{depthLabel}</span>
        </summary>
        <div className="lex-config-advanced">
          <div>
            <div className="lex-field-label-row">
              <label htmlFor="contestaciones-instruction" className="lex-field-label">Instrucción directa (opcional)</label>
              <span className="lex-counter">{userInstructions.length}/2000</span>
            </div>
            <textarea
              id="contestaciones-instruction"
              value={userInstructions}
              onChange={(e) => onUserInstructionsChange(e.target.value.slice(0, 2000))}
              placeholder="Ej. Elabora recurso de apelación contra el Auto de 12/ago/2026 que desecha incidente y cita a sentencia en Exp. 1152/2013 BIS. Argumenta falta de fundamentación y..."
              maxLength={2000}
              rows={3}
              disabled={disabled}
              className="lex-textarea"
            />
            <p className="lex-help">Indica la postura o los puntos que el escrito debe desarrollar.</p>
          </div>
        </div>
      </details>
    </section>
  );
}
