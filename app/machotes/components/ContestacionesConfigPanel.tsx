'use client';

import React from 'react';
import { createPortal } from 'react-dom';
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
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const moreOptionsButtonRef = React.useRef<HTMLButtonElement>(null);
  const depthLabel = `máx. ${pageTarget.pages} pp.`;

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

      <button
        ref={moreOptionsButtonRef}
        type="button"
        className="lex-more-options-trigger"
        onClick={() => setOptionsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={optionsOpen}
        data-testid="contestaciones-more-options"
      >
        <span>Más opciones</span>
        <span className="lex-disclosure-hint">{userInstructions.trim() ? 'Con instrucción · ' : ''}{depthLabel}</span>
      </button>
      {optionsOpen && (
        <DraftingOptionsDialog
          onClose={() => { setOptionsOpen(false); moreOptionsButtonRef.current?.focus(); }}
          userInstructions={userInstructions}
          onUserInstructionsChange={onUserInstructionsChange}
          pageTarget={pageTarget}
          onPageTargetChange={onPageTargetChange}
          disabled={disabled}
          isAppeal={isAppeal}
        />
      )}
    </section>
  );
}

const INSTRUCTION_LIMIT = 2000;

/** Atajos que insertan una pauta para que el abogado la complete; no aportan hechos ni citas. */
const INSTRUCTION_SHORTCUTS: Array<{ label: string; text: string; appealOnly?: boolean; answerOnly?: boolean }> = [
  { label: 'Postura sobre los hechos', text: 'Postura sobre los hechos: ', answerOnly: true },
  { label: 'Excepciones a oponer', text: 'Excepciones y defensas a oponer: ', answerOnly: true },
  { label: 'Agravios a desarrollar', text: 'Agravios a desarrollar: ', appealOnly: true },
  { label: 'Pruebas a ofrecer', text: 'Pruebas a ofrecer o relacionar: ' },
  { label: 'Puntos petitorios', text: 'Puntos petitorios que debe incluir: ' },
  { label: 'Tono y estilo', text: 'Tono y estilo: ' },
];

function DraftingOptionsDialog({
  onClose, userInstructions, onUserInstructionsChange, pageTarget, onPageTargetChange, disabled, isAppeal,
}: {
  onClose: () => void;
  userInstructions: string;
  onUserInstructionsChange: (value: string) => void;
  pageTarget: PageTarget;
  onPageTargetChange: (target: PageTarget) => void;
  disabled: boolean;
  isAppeal: boolean;
}) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; };
  }, [onClose]);

  const insertShortcut = (text: string) => {
    const base = userInstructions.trimEnd();
    const next = `${base}${base ? '\n' : ''}${text}`.slice(0, INSTRUCTION_LIMIT);
    onUserInstructionsChange(next);
    requestAnimationFrame(() => {
      const area = textareaRef.current;
      if (!area) return;
      area.focus();
      area.setSelectionRange(next.length, next.length);
    });
  };

  const shortcuts = INSTRUCTION_SHORTCUTS.filter((item) => (isAppeal ? !item.answerOnly : !item.appealOnly));

  return createPortal(
    <div className="lex-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="drafting-options-title" aria-describedby="drafting-options-desc" className="lex-modal" data-testid="drafting-options-dialog">
        <header className="lex-modal-header">
          <div>
            <p className="lex-modal-eyebrow">Configuración del borrador</p>
            <h2 id="drafting-options-title" className="lex-modal-title">Opciones de redacción</h2>
            <p id="drafting-options-desc" className="lex-help">Los cambios se aplican al momento. El sistema no inventará hechos, pruebas ni citas: lo que no indiques quedará marcado para tu revisión.</p>
          </div>
          <button type="button" className="lex-modal-close" onClick={onClose} aria-label="Cerrar opciones de redacción">×</button>
        </header>

        <div className="lex-modal-body">
          <section>
            <div className="lex-field-label-row">
              <label htmlFor="contestaciones-instruction" className="lex-field-label">Instrucción directa (opcional)</label>
              <span className="lex-counter" aria-live="polite">{userInstructions.length}/{INSTRUCTION_LIMIT}</span>
            </div>
            <textarea
              ref={textareaRef}
              id="contestaciones-instruction"
              value={userInstructions}
              onChange={(e) => onUserInstructionsChange(e.target.value.slice(0, INSTRUCTION_LIMIT))}
              placeholder={isAppeal
                ? 'Ej. Elabora recurso de apelación contra el auto que desecha el incidente. Argumenta falta de fundamentación y motivación…'
                : 'Ej. Niega el hecho 3 porque el pago se realizó; opón la excepción de pago; relaciona el recibo de la foja 12…'}
              maxLength={INSTRUCTION_LIMIT}
              rows={10}
              disabled={disabled}
              className="lex-textarea lex-modal-textarea"
            />
            <p className="lex-help">Indica tu postura y los puntos que el escrito debe desarrollar. Usa un atajo para agregar una pauta y complétala.</p>
            <div className="lex-chip-row" role="group" aria-label="Atajos de instrucción">
              {shortcuts.map((item) => (
                <button key={item.label} type="button" className="lex-chip" onClick={() => insertShortcut(item.text)} disabled={disabled || userInstructions.length >= INSTRUCTION_LIMIT}>
                  + {item.label}
                </button>
              ))}
              {userInstructions && (
                <button type="button" className="lex-chip lex-chip-muted" onClick={() => onUserInstructionsChange('')} disabled={disabled}>Limpiar</button>
              )}
            </div>
          </section>

          <section className="lex-modal-section" aria-label="Extensión máxima del escrito">
            <PageTargetSelector value={pageTarget} onChange={onPageTargetChange} disabled={disabled} />
          </section>
        </div>

        <footer className="lex-modal-footer">
          <button type="button" className="lex-button lex-button-primary" onClick={onClose}>Listo</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
