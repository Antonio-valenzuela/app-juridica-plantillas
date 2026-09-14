import { RenderedDocument } from './templateTypes';
import { assertLegacyRenderedDocumentExportable } from '@/lib/legal-engine/exportGuards';

const numberToOrdinal = (num: number): string => {
  const ordinals = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO', 'NOVENO', 'DÉCIMO', 'DÉCIMO PRIMERO', 'DÉCIMO SEGUNDO', 'DÉCIMO TERCERO', 'DÉCIMO CUARTO', 'DÉCIMO QUINTO', 'DÉCIMO SEXTO', 'DÉCIMO SÉPTIMO', 'DÉCIMO OCTAVO', 'DÉCIMO NOVENO', 'VIGÉSIMO'];
  return ordinals[num - 1] || `${num}º`;
};

const wrapText = (text: string, width: number = 80): string => {
  if (!text) return '';
  const regex = new RegExp(`(?![^\\n]{1,${width}}$)([^\\n]{1,${width}})\\s`, 'g');
  return text.replace(regex, '$1\n');
};

export const exportToText = (doc: RenderedDocument): string => {
  assertLegacyRenderedDocumentExportable(doc);
  let output = '';

  output += wrapText(doc.header) + '\n\n';
  output += wrapText(doc.body) + '\n\n';

  doc.sections.forEach(sec => {
    output += `${'='.repeat(80)}\n`;
    output += `${sec.title}\n`;
    output += `${'='.repeat(80)}\n\n`;

    if (Array.isArray(sec.content)) {
      sec.content.forEach((item, i) => {
        const prefix = sec.numbered ? `${numberToOrdinal(i + 1)}.— ` : "- ";
        output += wrapText(`${prefix}${item}`) + '\n\n';
      });
    } else {
      output += wrapText(sec.content) + '\n\n';
    }
  });

  output += wrapText(doc.footer) + '\n\n';

  output += `${'-'.repeat(80)}\n`;
  output += wrapText(doc.disclaimer) + '\n';
  output += wrapText(`Generado el: ${new Date(doc.generatedAt).toLocaleString('es-MX')}`) + '\n';

  return output;
};
