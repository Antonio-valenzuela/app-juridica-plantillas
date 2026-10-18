import React from 'react';
import { templateDesignNotice } from '@/lib/templates/templateDesignCopy';

/** Aviso común a todos los puntos de entrada de «Usar mi plantilla (diseño y estructura)». */
export function TemplateDesignNotice() {
  return (
    <p className="lex-field-hint" data-testid="template-design-notice" role="note">
      {templateDesignNotice()}
    </p>
  );
}
