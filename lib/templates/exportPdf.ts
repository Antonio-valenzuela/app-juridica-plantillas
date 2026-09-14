import { RenderedDocument } from './templateTypes';
import { assertLegacyRenderedDocumentExportable } from '@/lib/legal-engine/exportGuards';

const numberToOrdinal = (num: number): string => {
  const ordinals = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO', 'NOVENO', 'DÉCIMO', 'DÉCIMO PRIMERO', 'DÉCIMO SEGUNDO', 'DÉCIMO TERCERO', 'DÉCIMO CUARTO', 'DÉCIMO QUINTO', 'DÉCIMO SEXTO', 'DÉCIMO SÉPTIMO', 'DÉCIMO OCTAVO', 'DÉCIMO NOVENO', 'VIGÉSIMO'];
  return ordinals[num - 1] || `${num}º`;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const printText = (value: string): string => escapeHtml(value).replace(/\r?\n/g, '<br>');

export const generatePrintHtml = (doc: RenderedDocument): string => {
  assertLegacyRenderedDocumentExportable(doc);
  let html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(doc.title)}</title>
      <style>
        @page {
          size: letter;
          margin: 2.5cm 2cm 2.5cm 3cm;
        }
        body {
          font-family: Arial, sans-serif;
          font-size: 12pt;
          line-height: 1.5;
          color: #000;
          background: #fff;
        }
        .header-text {
          text-align: right;
          font-weight: bold;
          margin-bottom: 20px;
        }
        .body-text {
          text-align: justify;
          margin-bottom: 20px;
        }
        .section-title {
          text-align: center;
          font-weight: bold;
          font-size: 14pt;
          margin-top: 30px;
          margin-bottom: 15px;
        }
        .section-content {
          text-align: justify;
          margin-bottom: 15px;
        }
        .footer-text {
          text-align: center;
          margin-top: 40px;
          white-space: pre-wrap;
        }
        .generated-at {
          margin-top: 24px;
          font-size: 9pt;
          text-align: center;
        }
        .disclaimer {
          margin-top: 50px;
          font-style: italic;
          font-size: 10pt;
          text-align: justify;
          border-top: 1px solid #000;
          padding-top: 10px;
        }
        .page-break {
          page-break-before: always;
        }
      </style>
    </head>
    <body onload="window.print()">
  `;

  html += `<div class="header-text">${printText(doc.header)}</div>`;
  html += `<div class="body-text">${printText(doc.body)}</div>`;

  doc.sections.forEach(sec => {
    html += `<div class="section-title">${escapeHtml(sec.title)}</div>`;

    if (Array.isArray(sec.content)) {
      sec.content.forEach((item, i) => {
        const prefix = sec.numbered ? `<strong>${numberToOrdinal(i + 1)}.—</strong> ` : "- ";
        html += `<div class="section-content">${prefix}${printText(item)}</div>`;
      });
    } else {
      html += `<div class="section-content">${printText(sec.content)}</div>`;
    }
  });

  html += `<div class="footer-text">${printText(doc.footer)}</div>`;
  html += `<div class="generated-at">Generado el ${escapeHtml(
    new Date(doc.generatedAt).toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City',
    })
  )}</div>`;
  html += `<div class="disclaimer">${printText(doc.disclaimer)}</div>`;

  html += `
    </body>
    </html>
  `;

  return html;
};
