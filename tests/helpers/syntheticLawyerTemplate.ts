import { AlignmentType, Document, Footer, Header, ImageRun, Packer, PageNumber, Paragraph, TextRun } from 'docx';

// PNG 1x1 transparente: sirve como «logotipo» del membrete sintético.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Plantilla .docx sintética (sin datos reales) con membrete, márgenes y estilos propios. */
export async function buildSyntheticLawyerTemplate(): Promise<Buffer> {
  const doc = new Document({
    creator: 'Despacho Sintético',
    title: 'Contestación Juan Pérez',
    styles: {
      default: { document: { run: { font: 'Garamond', size: 26 }, paragraph: { spacing: { line: 360 } } } },
      paragraphStyles: [
        { id: 'TituloLex', name: 'TituloLex', basedOn: 'Normal', run: { bold: true, size: 28, font: 'Garamond' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 120 } } },
        { id: 'CuerpoLex', name: 'CuerpoLex', basedOn: 'Normal', run: { size: 26, font: 'Garamond' }, paragraph: { alignment: AlignmentType.JUSTIFIED, indent: { firstLine: 709 } } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 2268, right: 1134, bottom: 1701, left: 2268 } } },
      headers: { default: new Header({ children: [
        new Paragraph({ children: [new ImageRun({ type: 'png', data: PIXEL, transformation: { width: 40, height: 40 } })] }),
        new Paragraph({ children: [new TextRun('LEX & ASOCIADOS, S.C.')] }),
        new Paragraph({ children: [new TextRun('Expediente 345/2022')] }),
      ] }) },
      footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun('Página '), new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
      children: [
        new Paragraph({ style: 'TituloLex', children: [new TextRun('ESCRITO DE CONTESTACIÓN')] }),
        new Paragraph({ style: 'CuerpoLex', children: [new TextRun('C. Juan Pérez, por mi propio derecho, comparezco ante este H. Juzgado en el expediente 345/2022 para exponer lo siguiente.')] }),
        new Paragraph({ style: 'TituloLex', children: [new TextRun('HECHOS')] }),
        new Paragraph({ style: 'CuerpoLex', children: [new TextRun('1. El 18 de agosto de 2021 Juan Pérez celebró contrato de arrendamiento por la cantidad de $85,000.00 con la demandada.')] }),
        new Paragraph({ style: 'TituloLex', children: [new TextRun('PROTESTO LO NECESARIO')] }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}
