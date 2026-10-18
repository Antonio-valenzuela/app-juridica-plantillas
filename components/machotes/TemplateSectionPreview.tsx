'use client';

import React, { useMemo } from 'react';
import { buildTemplateSectionPreview, type SectionKindOverrides } from '@/lib/templates/templatePreview';
import type { TemplateSectionKind } from '@/lib/templates/sectionKind';

interface TemplateSectionPreviewProps {
  templateText: string;
  overrides: SectionKindOverrides;
  onChange: (overrides: SectionKindOverrides) => void;
  disabled?: boolean;
}

const OPTIONS: Array<{ value: TemplateSectionKind; label: string }> = [
  { value: 'FORMULA', label: 'Conservar como fórmula' },
  { value: 'SUSTANTIVA', label: 'Reescribir con mi caso' },
];

/** Vista previa previa a generar: el abogado ve y cambia qué se conserva y qué se reescribe. */
export function TemplateSectionPreview({ templateText, overrides, onChange, disabled = false }: TemplateSectionPreviewProps) {
  const rows = useMemo(() => buildTemplateSectionPreview(templateText, overrides), [templateText, overrides]);
  if (rows.length === 0) return null;

  const change = (key: string, autoKind: TemplateSectionKind, kind: TemplateSectionKind) => {
    const next = { ...overrides };
    if (kind === autoKind) delete next[key];
    else next[key] = kind;
    onChange(next);
  };

  return (
    <fieldset className="lex-fieldset" data-testid="template-section-preview" disabled={disabled}>
      <legend>Secciones de tu plantilla</legend>
      <ul className="lex-template-sections">
        {rows.map((row) => (
          <li key={row.key || row.title}>
            <span className="lex-template-section-title">{row.title}</span>
            <select
              aria-label={`Tratamiento de ${row.title}`}
              value={row.kind}
              onChange={(event) => change(row.key, row.autoKind, event.target.value as TemplateSectionKind)}
              className="lex-select"
            >
              {OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {row.overridden && <small> (cambiado por ti)</small>}
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
