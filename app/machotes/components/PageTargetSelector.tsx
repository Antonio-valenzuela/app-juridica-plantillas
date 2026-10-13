'use client';

import React, { useEffect, useId, useState } from 'react';
import {
  CUSTOM_PAGE_TARGET_RANGE,
  PAGE_TARGET_HELP_TEXT,
  PAGE_TARGET_PRESETS,
  parsePageTarget,
  type PageTarget,
} from '@/lib/legal-engine/pageTarget';

interface PageTargetSelectorProps {
  value: PageTarget;
  onChange: (value: PageTarget) => void;
  disabled?: boolean;
}

/**
 * Selector de extensión del escrito (5/10/20/40/personalizado).
 *
 * Radios nativos agrupados (`radiogroup`): navegables con flechas, anunciados por lectores de
 * pantalla con su etiqueta y la ayuda asociada (`aria-describedby`). El valor personalizado es
 * un entero validado en el rango del módulo `pageTarget`; un valor inválido no se propaga.
 */
export function PageTargetSelector({ value, onChange, disabled = false }: PageTargetSelectorProps) {
  const groupId = useId();
  const helpId = `${groupId}-help`;
  const errorId = `${groupId}-error`;
  const [customText, setCustomText] = useState(value.preset === 'PERSONALIZADO' ? String(value.pages) : '');
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    if (value.preset === 'PERSONALIZADO') setCustomText(String(value.pages));
  }, [value.preset, value.pages]);

  const choosePreset = (id: (typeof PAGE_TARGET_PRESETS)[number]['id']) => {
    const preset = PAGE_TARGET_PRESETS.find((item) => item.id === id)!;
    setCustomError(null);
    onChange({ preset: preset.id, pages: preset.pages });
  };

  const chooseCustom = () => {
    const seed = value.preset === 'PERSONALIZADO' ? value.pages : Math.min(CUSTOM_PAGE_TARGET_RANGE.max, Math.max(CUSTOM_PAGE_TARGET_RANGE.min, value.pages));
    setCustomText(String(seed));
    setCustomError(null);
    onChange({ preset: 'PERSONALIZADO', pages: seed });
  };

  const changeCustom = (text: string) => {
    setCustomText(text);
    try {
      const parsed = parsePageTarget({ preset: 'PERSONALIZADO', pages: text.trim() });
      setCustomError(null);
      onChange({ preset: 'PERSONALIZADO', pages: parsed.pages });
    } catch {
      setCustomError(`Escribe un número entero de ${CUSTOM_PAGE_TARGET_RANGE.min} a ${CUSTOM_PAGE_TARGET_RANGE.max} páginas.`);
    }
  };

  const customActive = value.preset === 'PERSONALIZADO';

  return (
    <div data-testid="page-target-selector">
      <p className="lex-field-label" id={`${groupId}-label`}>Extensión del escrito</p>
      <div
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        aria-describedby={`${helpId}${customError ? ` ${errorId}` : ''}`}
        className="lex-segmented-full lex-segmented-pages"
      >
        {PAGE_TARGET_PRESETS.map((preset) => (
          <label key={preset.id} className={value.preset === preset.id ? 'is-active' : undefined} title={preset.hint}>
            <input
              type="radio"
              name={`${groupId}-pages`}
              value={preset.id}
              checked={value.preset === preset.id}
              disabled={disabled}
              onChange={() => choosePreset(preset.id)}
              aria-label={`${preset.label}, ${preset.hint}`}
            />
            <span aria-hidden="true">{preset.label}<small> {preset.pages}</small></span>
          </label>
        ))}
        <label className={customActive ? 'is-active' : undefined} title="Número de páginas a elección">
          <input
            type="radio"
            name={`${groupId}-pages`}
            value="PERSONALIZADO"
            checked={customActive}
            disabled={disabled}
            onChange={chooseCustom}
            aria-label="Personalizado, número de páginas a elección"
          />
          <span aria-hidden="true">Personalizado</span>
        </label>
      </div>

      {customActive && (
        <div className="lex-page-target-custom">
          <label htmlFor={`${groupId}-custom`} className="lex-field-label">Páginas aproximadas</label>
          <input
            id={`${groupId}-custom`}
            type="number"
            inputMode="numeric"
            min={CUSTOM_PAGE_TARGET_RANGE.min}
            max={CUSTOM_PAGE_TARGET_RANGE.max}
            step={1}
            value={customText}
            disabled={disabled}
            onChange={(event) => changeCustom(event.target.value)}
            aria-invalid={customError ? true : undefined}
            aria-describedby={customError ? errorId : undefined}
            className="lex-input"
          />
          {customError && <p id={errorId} role="alert" className="lex-help" style={{ color: '#9c2f2f' }}>{customError}</p>}
        </div>
      )}

      <p id={helpId} className="lex-help">{PAGE_TARGET_HELP_TEXT}</p>
    </div>
  );
}
