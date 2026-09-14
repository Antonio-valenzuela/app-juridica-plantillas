import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Header, Footer, PageNumber } from 'docx';
import { RenderedDocument } from './templateTypes';
import { normalizeLegalDocumentText } from '@/lib/text/normalizeLegalDisplayText';
import { assertLegacyRenderedDocumentExportable } from '@/lib/legal-engine/exportGuards';

const numberToOrdinal = (num: number): string => {
  const ordinals = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO', 'NOVENO', 'DÉCIMO', 'DÉCIMO PRIMERO', 'DÉCIMO SEGUNDO', 'DÉCIMO TERCERO', 'DÉCIMO CUARTO', 'DÉCIMO QUINTO', 'DÉCIMO SEXTO', 'DÉCIMO SÉPTIMO', 'DÉCIMO OCTAVO', 'DÉCIMO NOVENO', 'VIGÉSIMO'];
  return ordinals[num - 1] || `${num}º`;
};

export const exportToDocx = async (docData: RenderedDocument): Promise<Buffer> => {
  assertLegacyRenderedDocumentExportable(docData);
  const children: Paragraph[] = [];

  const headerLines = normalizeLegalDocumentText(docData.header).split('\n').filter(l => l.trim().length > 0);
  headerLines.forEach((line) => {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: normalizeLegalDocumentText(line), font: "Arial", size: 24, bold: true })]
      })
    );
  });

  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));

  const bodyLines = normalizeLegalDocumentText(docData.body).split('\n').filter(l => l.trim().length > 0);
  bodyLines.forEach(line => {
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: normalizeLegalDocumentText(line), font: "Arial", size: 24 })],
        spacing: { after: 200 }
      })
    );
  });

  docData.sections.forEach(sec => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: normalizeLegalDocumentText(sec.title), font: "Arial", size: 28, bold: true })],
        spacing: { before: 400, after: 200 }
      })
    );

    if (Array.isArray(sec.content)) {
      sec.content.forEach((item, i) => {
        const prefix = sec.numbered ? `${numberToOrdinal(i + 1)}.— ` : "- ";
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [
                new TextRun({ text: prefix, font: "Arial", size: 24, bold: sec.numbered }),
                new TextRun({ text: normalizeLegalDocumentText(item), font: "Arial", size: 24 })
            ],
            spacing: { after: 200 }
          })
        );
      });
    } else {
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: normalizeLegalDocumentText(sec.content), font: "Arial", size: 24 })],
          spacing: { after: 200 }
        })
      );
    }
  });

  const footerLines = normalizeLegalDocumentText(docData.footer).split('\n').map(l => l.trim());
  footerLines.forEach(line => {
    if (line === '') {
        children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    } else {
        children.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: normalizeLegalDocumentText(line), font: "Arial", size: 24 })],
            })
        );
    }
  });

  children.push(
      new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: normalizeLegalDocumentText(docData.disclaimer), font: "Arial", size: 16, italics: true })],
          spacing: { before: 400 }
      })
  );

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1417,
            bottom: 1417,
            left: 1701,
            right: 1134,
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: docData.expediente ? `Expediente: ${normalizeLegalDocumentText(docData.expediente)}` : '',
                  font: "Arial",
                  size: 20
                })
              ]
            })
          ]
        })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  children: [
                    `Generado el: ${new Date(docData.generatedAt).toLocaleDateString('es-MX')} - Página `,
                    PageNumber.CURRENT,
                    ' de ',
                    PageNumber.TOTAL_PAGES,
                  ],
                  font: "Arial",
                  size: 20
                })
              ]
            })
          ]
        })
      },
      children: children
    }]
  });

  return await Packer.toBuffer(doc);
};
