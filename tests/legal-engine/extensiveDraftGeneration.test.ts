/**
 * extensiveDraftGeneration.test.ts — TDD para generación extensa de borradores
 *
 * Reproduce el bug: un documento con abundante contexto (proceduralTimeline,
 * caseTheory, arguments, citations) pero datos personales pendientes
 * produce solo placeholders en lugar de desarrollar secciones sustentadas.
 *
 * Fixture SINTÉTICO — no usa expediente real.
 */
import { describe, expect, it } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import { validateForExport } from '@/lib/legal-engine/exportGuards';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

const TARGET_ID = 'contestacion_revision_extraordinaria_amparo_directo';
const TARGET_LABEL = 'Contestación / Revisión extraordinaria ante sentencia de amparo directo';

/**
 * Fixture: expediente sintético con abundante información procesal
 * pero con nombre del quejoso anonimizado.
 */
function buildRichSyntheticSource() {
  return createSourceDocument({
    id: 'synthetic-rich-source',
    filename: 'sentencia_sintetica_amparo.pdf',
    sourceValidated: true,
    pages: [
      {
        page: 1,
        text: [
          'SENTENCIA DE AMPARO DIRECTO.',
          'AMPARO DIRECTO: 123/2025.',
          'QUEJOSO: ***** ******* ********* *****.',
          'AUTORIDAD RESPONSABLE: Junta Especial Número Cuatro de la Local de Conciliación y Arbitraje del Estado de Jalisco.',
          'Segundo Tribunal Colegiado en Materia de Trabajo del Tercer Circuito.',
          '',
          'VISTOS para resolver los autos del juicio de amparo directo 123/2025, promovido por la parte quejosa contra el laudo de fecha veinticinco de marzo de dos mil veinticinco, dictado por la Junta Especial Número Cuatro.',
        ].join('\n'),
        chars: 500,
      },
      {
        page: 2,
        text: [
          'RESULTANDO:',
          'PRIMERO. Mediante escrito presentado el quince de abril de dos mil veinticinco ante la Oficina de Correspondencia Común de los Tribunales Colegiados en Materia de Trabajo del Tercer Circuito, la parte quejosa demandó el amparo y protección de la Justicia Federal contra el laudo dictado el veinticinco de marzo de dos mil veinticinco.',
          '',
          'SEGUNDO. El Tribunal Colegiado del conocimiento admitió la demanda por auto de dieciséis de abril de dos mil veinticinco, y ordenó dar vista al Ministerio Público Federal, quien formuló pedimento.',
          '',
          'TERCERO. Se celebró la audiencia constitucional y se dictó sentencia denegatoria del amparo el doce de junio de dos mil veinticinco, determinando que el laudo reclamado es conforme a derecho.',
        ].join('\n'),
        chars: 700,
      },
      {
        page: 3,
        text: [
          'CONSIDERANDO:',
          'CUARTO. Análisis de los conceptos de violación. La parte quejosa argumentó violación al artículo 841 de la Ley Federal del Trabajo en relación con los artículos 14 y 16 constitucionales, en tanto la Junta responsable no valoró correctamente las pruebas ofrecidas.',
          '',
          'El Tribunal Colegiado determinó que la Junta responsable cumplió con su obligación de examinar los medios de prueba aportados al juicio laboral y que la valoración es conforme al principio de congruencia procesal.',
          '',
          'Sin embargo, el análisis del Tribunal presenta deficiencias en cuanto a la ponderación del derecho humano al trabajo digno consagrado en el artículo 123 constitucional y en los artículos 6 y 7 del Pacto Internacional de Derechos Económicos, Sociales y Culturales.',
          '',
          'La ejecutoria omitió confrontar la interpretación de la Junta con el criterio sostenido en la tesis 2a./J. 15/2024 de la Segunda Sala relativa a la carga dinámica de la prueba en materia laboral.',
        ].join('\n'),
        chars: 900,
      },
      {
        page: 4,
        text: [
          'QUINTO. Respecto de la indemnización constitucional, el Tribunal señaló que no procede al haberse negado el amparo, sin ponderar que la interpretación del artículo 48 de la Ley Federal del Trabajo debe armonizarse con el principio pro persona.',
          '',
          'SEXTO. No se advierte que la Junta haya transgredido principios de exhaustividad y congruencia.',
          '',
          'RESOLUTIVOS:',
          'PRIMERO. La Justicia de la Unión NO AMPARA NI PROTEGE a la parte quejosa contra el laudo de veinticinco de marzo de dos mil veinticinco dictado por la Junta Especial Número Cuatro.',
          'SEGUNDO. Notifíquese personalmente.',
        ].join('\n'),
        chars: 600,
      },
      {
        page: 5,
        text: [
          'Así lo resolvió el Segundo Tribunal Colegiado en Materia de Trabajo del Tercer Circuito, por unanimidad de votos de los magistrados integrantes.',
          '',
          'El presente documento contiene información que permite identificar el expediente laboral de origen ante la Junta Especial Número Cuatro, así como las prestaciones reclamadas que incluyen reinstalación, salarios caídos y diversas prestaciones laborales conforme a los artículos 48, 50, 79, 80 y 89 de la Ley Federal del Trabajo.',
          '',
          'La relación laboral tuvo una duración de aproximadamente ocho años, periodo durante el cual el trabajador desempeñó funciones de supervisor de producción con un salario integrado mensual.',
        ].join('\n'),
        chars: 550,
      },
    ],
  });
}

function buildRichCaseAnalysis(): Partial<CaseAnalysis> {
  return {
    parties: {
      quejoso: '', // Desconocido / anonimizado
      actor: '',
      demandado: '',
      autoridadResponsable: 'Junta Especial Número Cuatro de la Local de Conciliación y Arbitraje del Estado de Jalisco',
      terceroInteresado: '',
    },
    authorities: [
      'Segundo Tribunal Colegiado en Materia de Trabajo del Tercer Circuito',
      'Junta Especial Número Cuatro de la Local de Conciliación y Arbitraje del Estado de Jalisco',
    ],
    caseNumbers: {
      principal: '123/2025',
      amparoDirecto: '123/2025',
    },
    proceduralTimeline: [
      { date: '25/03/2025', event: 'Laudo dictado por la Junta Especial Número Cuatro', sourceDocument: 'sentencia_sintetica_amparo.pdf', page: 2, certainty: 1 },
      { date: '15/04/2025', event: 'Presentación de demanda de amparo directo', sourceDocument: 'sentencia_sintetica_amparo.pdf', page: 2, certainty: 1 },
      { date: '16/04/2025', event: 'Admisión de la demanda de amparo por el Tribunal Colegiado', sourceDocument: 'sentencia_sintetica_amparo.pdf', page: 2, certainty: 1 },
      { date: '20/05/2025', event: 'Pedimento formulado por el Ministerio Público Federal', sourceDocument: 'sentencia_sintetica_amparo.pdf', page: 2, certainty: 1 },
      { date: '12/06/2025', event: 'Sentencia denegatoria de amparo directo', sourceDocument: 'sentencia_sintetica_amparo.pdf', page: 2, certainty: 1 },
    ],
    caseTheory: {
      factualTheory: 'La Junta responsable dictó laudo absolutorio indebido. El Tribunal Colegiado negó el amparo convalidando violaciones al debido proceso y omisión probatoria.',
      legalTheory: 'Artículos 1o, 14, 16, 17 y 123 constitucionales; artículos 48, 50, 79, 80, 841 y 842 de la Ley Federal del Trabajo; artículos 6 y 7 del PIDESC.',
      constitutionalTheory: 'Fijación del alcance del principio pro persona y la carga dinámica de la prueba en la valoración de juicios laborales asimétricos.',
      proceduralTheory: 'Revisión extraordinaria ante sentencia de amparo directo laboral.',
      opposingTheory: 'El Tribunal Colegiado estimó cumplidas las formalidades y congruencia del laudo.',
      vulnerabilities: [],
      strengths: ['Inobservancia de jurisprudencia temática y tratados internacionales'],
    },
    proceduralPosture: {
      proceduralWrit: 'revisión extraordinaria',
      isExtraordinary: true,
      exceptionalInterest: 'Definir el alcance de la carga dinámica de la prueba frente a la valoración en conciencia de la Junta',
      constitutionalIssues: [
        {
          id: 'const-issue-1',
          type: 'CONSTITUTIONAL',
          title: 'Interpretación directa del artículo 123 constitucional en relación con el artículo 1o constitucional',
          parameter: 'Artículos 1o y 123 de la Constitución Política de los Estados Unidos Mexicanos y PIDESC',
          challengedAct: 'Sentencia de 12/06/2025 dictada por el Segundo Tribunal Colegiado',
          contradiction: 'El Colegiado convalidó la omisión probatoria omitiendo el mandato pro persona',
          affectation: 'Negativa indebida de indemnización constitucional y tutela judicial efectiva',
          consequence: 'Revocar la ejecutoria recurrida y conceder la protección constitucional',
          sourceDoc: 'sentencia_sintetica_amparo.pdf',
          page: 3,
          excerpt: 'deficiencias en cuanto a la ponderación del derecho humano al trabajo digno consagrado en el artículo 123 constitucional',
        },
      ],
      legalityIssues: [],
    },
    argumentAxes: [
      {
        id: 'axis-1',
        title: 'Deficiente valoración probatoria y transgresión a la carga dinámica de la prueba',
        issue: 'El Tribunal Colegiado convalidó la valoración de la Junta sin aplicar el principio de carga dinámica probatoria',
        facts: ['Laudo de 25/03/2025 no valoró debidamente los informes y testimoniales de la trabajadora'],
        rules: ['Artículo 841 Ley Federal del Trabajo', 'Artículos 14 y 16 Constitucionales'],
        reasoning: 'Conforme a la tesis 2a./J. 15/2024, en materia laboral la carga de la prueba tiene un componente dinámico que obliga a ponderar la asimetría patronal.',
        counterargument: 'La Junta resolvió en conciencia',
        rebuttal: 'Apreciar en conciencia no exime de valorar todas las pruebas rendidas',
        requestedConsequence: 'Dejar insubsistente la ejecutoria y ordenar reposición de valoración probatoria.',
        sources: [
          { documentId: 'synthetic-rich-source', page: 3, excerpt: 'La ejecutoria omitió confrontar la interpretación de la Junta con el criterio sostenido en la tesis 2a./J. 15/2024' },
        ],
      },
      {
        id: 'axis-2',
        title: 'Interpretación restrictiva del artículo 48 LFT contraria al principio pro persona',
        issue: 'Negativa de indemnización constitucional sin armonización convencional',
        facts: ['Omisión de computar salarios vencidos de forma congruente'],
        rules: ['Artículo 1o Constitucional', 'Artículo 48 Ley Federal del Trabajo', 'PIDESC'],
        reasoning: 'El artículo 1o constitucional obliga a adoptar la interpretación más favorable cuando están en riesgo medios de subsistencia del trabajador.',
        counterargument: 'Límite tasado legal',
        rebuttal: 'El límite legal no convalida interpretaciones que desconozcan la reparación integral',
        requestedConsequence: 'Reconocer la procedencia de la indemnización con interpretación pro persona.',
        sources: [
          { documentId: 'synthetic-rich-source', page: 4, excerpt: 'la interpretación del artículo 48 de la Ley Federal del Trabajo debe armonizarse con el principio pro persona' },
        ],
      },
      {
        id: 'axis-3',
        title: 'Indebida motivación sobre la jornada de trabajo extraordinaria reclamada',
        issue: 'El Colegiado omitió revisar la falta de motivación de la Junta en torno al reclamo de horas extras',
        facts: ['Jornada desempeñada de supervisor de producción superando el tope legal sin pago proporcional'],
        rules: ['Artículos 14 y 16 Constitucionales', 'Artículos 67 y 68 Ley Federal del Trabajo'],
        reasoning: 'Toda resolución jurisdiccional debe fundar y motivar cada prestación controvertida conforme al artículo 16 constitucional.',
        counterargument: 'La parte actora no aportó prueba directa de cada minuto extra',
        rebuttal: 'La patronal tiene la carga de los registros de asistencia y jornada laboral',
        requestedConsequence: 'Ordenar pronunciamiento fundado y motivado sobre la jornada extraordinaria.',
        sources: [
          { documentId: 'synthetic-rich-source', page: 5, excerpt: 'desempeñó funciones de supervisor de producción con un salario integrado mensual' },
        ],
      },
      {
        id: 'axis-4',
        title: 'Omisión de control ex officio de convencionalidad respecto al derecho al trabajo digno',
        issue: 'Falta de contraste de la ejecutoria con los artículos 6 y 7 del PIDESC',
        facts: ['Relación laboral prolongada de 8 años concluida sin justa causa acreditada'],
        rules: ['Artículos 1o y 133 Constitucionales', 'Artículos 6 y 7 del PIDESC'],
        reasoning: 'Los órganos jurisdiccionales están obligados a ejercer control difuso de convencionalidad para asegurar condiciones equitativas y satisfactorias de trabajo.',
        counterargument: 'No se formuló concepto expreso de convencionalidad en amparo',
        rebuttal: 'El control de convencionalidad es un deber ex officio de la judicatura federal',
        requestedConsequence: 'Aplicar el estándar convencional vinculante.',
        sources: [
          { documentId: 'synthetic-rich-source', page: 3, excerpt: 'deficiencias en cuanto a la ponderación del derecho humano al trabajo digno consagrado en el artículo 123 constitucional y en los artículos 6 y 7 del PIDESC' },
        ],
      },
      {
        id: 'axis-5',
        title: 'Vulneración al principio de exhaustividad y congruencia al omitir resolver prestaciones accesorias',
        issue: 'La sentencia dejó sin análisis reclamos de vacaciones, prima vacacional y aguinaldo',
        facts: ['Prestaciones devengadas durante el último año de servicios no analizadas en el laudo ni en amparo'],
        rules: ['Artículo 17 Constitucional', 'Artículo 842 Ley Federal del Trabajo'],
        reasoning: 'El derecho a la tutela judicial efectiva exige resolver todas y cada una de las pretensiones deducidas en juicio.',
        counterargument: 'Eran consecuencias dependientes de la acción principal',
        rebuttal: 'Las prestaciones autónomas devengadas no fenecen por la suerte de la acción indemnizatoria',
        requestedConsequence: 'Condenar al pago de prestaciones devengadas omitidas.',
        sources: [
          { documentId: 'synthetic-rich-source', page: 5, excerpt: 'prestaciones reclamadas que incluyen reinstalación, salarios caídos y diversas prestaciones laborales conforme a los artículos 48, 50, 79, 80 y 89' },
        ],
      },
    ],
    citations: [
      { rubro: 'Tesis 2a./J. 15/2024 — Carga dinámica de la prueba en materia laboral', texto: 'En materia laboral la carga de la prueba opera de manera dinámica cuando exista asimetría procesal.' },
    ],
    rulings: [
      { body: 'Segundo Tribunal Colegiado en Materia de Trabajo del Tercer Circuito', date: '12/06/2025', rulingText: 'LA JUSTICIA DE LA UNIÓN NO AMPARA NI PROTEGE a la parte quejosa.' },
    ],
    challengedActs: [
      { authority: 'Segundo Tribunal Colegiado en Materia de Trabajo del Tercer Circuito', actDescription: 'Sentencia denegatoria de amparo directo 123/2025 dictada el 12/06/2025' },
    ],
    facts: [],
    claims: [],
    claimResponses: [],
    evidence: [
      { id: 'ev-1', type: 'DOCUMENTAL', description: 'Copia certificada del laudo de 25/03/2025', page: 2, confirmed: true },
      { id: 'ev-2', type: 'DOCUMENTAL', description: 'Ejecutoria de amparo directo 123/2025 de 12/06/2025', page: 3, confirmed: true },
    ],
    arguments: [],
  };
}

describe('Generación extensa de borradores — QA y trazabilidad sustentable', () => {

  it('A. antecedentes desarrollados cronológica y procesalmente', async () => {
    const source = buildRichSyntheticSource();
    const analysis = buildRichCaseAnalysis();

    const doc = await runGenerationPipeline({
      sourceDocuments: [source],
      selectedDocumentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      matter: 'Laboral',
      workflow: {
        flow: 'DOCUMENT_ANALYSIS',
        analysis: analysis as any,
        selection: { mode: 'automatic' },
      } as any,
    });

    const sec = doc.sections.find(s => /antecedentes/i.test(s.title));
    expect(sec).toBeDefined();
    const text = sec!.content.map(b => b.text).join('\n\n');

    expect(text).toContain('25/03/2025');
    expect(text).toContain('15/04/2025');
    expect(text).toContain('12/06/2025');
    expect(text).toMatch(/Laudo/i);
    expect(text).toMatch(/amparo directo/i);
    expect(text.length).toBeGreaterThan(250);
  });

  it('B. cuestión constitucional desarrollada con parámetro y derechos fundamentales', async () => {
    const source = buildRichSyntheticSource();
    const analysis = buildRichCaseAnalysis();

    const doc = await runGenerationPipeline({
      sourceDocuments: [source],
      selectedDocumentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      matter: 'Laboral',
      workflow: {
        flow: 'DOCUMENT_ANALYSIS',
        analysis: analysis as any,
        selection: { mode: 'automatic' },
      } as any,
    });

    const sec = doc.sections.find(s => /cuesti[oó]n constitucional/i.test(s.title));
    expect(sec).toBeDefined();
    const text = sec!.content.map(b => b.text).join('\n\n');

    // No debe ser un placeholder ni una línea genérica
    expect(text).not.toContain('[DATO PENDIENTE DE EXPEDIENTE: Cuestión constitucional');
    expect(text).toMatch(/parámetro|derecho|constitucional/i);
    expect(text).toMatch(/123|1o|PIDESC/i);
    expect(text.length).toBeGreaterThan(300);
  });

  it('C. al menos 5 agravios individualizados cuando el fixture provea 5 problemas distintos', async () => {
    const source = buildRichSyntheticSource();
    const analysis = buildRichCaseAnalysis();

    const doc = await runGenerationPipeline({
      sourceDocuments: [source],
      selectedDocumentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      matter: 'Laboral',
      workflow: {
        flow: 'DOCUMENT_ANALYSIS',
        analysis: analysis as any,
        selection: { mode: 'automatic' },
      } as any,
    });

    const sec = doc.sections.find(s => /agravio|argumento/i.test(s.title));
    expect(sec).toBeDefined();
    const text = sec!.content.map(b => b.text).join('\n\n');

    // Debe contener individualización clara de los 5 agravios
    expect(text).toMatch(/AGRAVIO\s+PRIMERO/i);
    expect(text).toMatch(/AGRAVIO\s+SEGUNDO/i);
    expect(text).toMatch(/AGRAVIO\s+TERCERO/i);
    expect(text).toMatch(/AGRAVIO\s+CUARTO/i);
    expect(text).toMatch(/AGRAVIO\s+QUINTO/i);

    // Cada uno con sustancia diferenciada
    expect(text).toMatch(/carga dinámica|valoración probatoria/i);
    expect(text).toMatch(/pro persona|artículo 48/i);
    expect(text).toMatch(/jornada|horas extras|motivación/i);
    expect(text).toMatch(/convencionalidad|PIDESC/i);
    expect(text).toMatch(/exhaustividad|prestaciones/i);
  });

  it('D. fundamentos construidos solo desde fuentes verificables sin inventar normas', async () => {
    const source = buildRichSyntheticSource();
    const analysis = buildRichCaseAnalysis();

    const doc = await runGenerationPipeline({
      sourceDocuments: [source],
      selectedDocumentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      matter: 'Laboral',
      workflow: {
        flow: 'DOCUMENT_ANALYSIS',
        analysis: analysis as any,
        selection: { mode: 'automatic' },
      } as any,
    });

    const sec = doc.sections.find(s => /fundamento/i.test(s.title));
    expect(sec).toBeDefined();
    const text = sec!.content.map(b => b.text).join('\n\n');

    // No debe ser solo un placeholder
    expect(text).not.toBe('[DATO PENDIENTE DE EXPEDIENTE: Fundamentos jurídicos sustentados]');
    // Debe contener las normas de las fuentes verificables
    expect(text).toMatch(/Constitución|CPEUM|123|14|16|17/i);
    expect(text).toMatch(/Ley Federal del Trabajo|841|48/i);
    // Y la jurisprudencia verificada
    expect(text).toMatch(/Tesis 2a\.\/J\.\s*15\/2024/i);
    // Jamás debe inventar códigos no relacionados como Código de Comercio o Código Penal
    expect(text).not.toMatch(/Código de Comercio/i);
    expect(text).not.toMatch(/Código Penal/i);
  });

  it('E. los campos personales ausentes siguen como placeholders', async () => {
    const source = buildRichSyntheticSource();
    const analysis = buildRichCaseAnalysis();

    const doc = await runGenerationPipeline({
      sourceDocuments: [source],
      selectedDocumentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      matter: 'Laboral',
      workflow: {
        flow: 'DOCUMENT_ANALYSIS',
        analysis: analysis as any,
        selection: { mode: 'automatic' },
      } as any,
    });

    const allText = doc.sections.flatMap(s => s.content.map(b => b.text)).join('\n\n');
    expect(allText).toMatch(/\[DATO PENDIENTE[^\]]*promovente|recurrente|personalidad/i);
  });

  it('F. exportación sigue bloqueada cuando existan pendientes críticos', async () => {
    const source = buildRichSyntheticSource();
    const analysis = buildRichCaseAnalysis();

    const doc = await runGenerationPipeline({
      sourceDocuments: [source],
      selectedDocumentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      matter: 'Laboral',
      workflow: {
        flow: 'DOCUMENT_ANALYSIS',
        analysis: analysis as any,
        selection: { mode: 'automatic' },
      } as any,
    });

    const exportResult = validateForExport(doc);
    expect(exportResult.ok).toBe(false);
    expect(exportResult.errors.length).toBeGreaterThan(0);
    expect(exportResult.errors.some(e => /LIFECYCLE|EXPORT|INCOMPLETE/i.test(e))).toBe(true);
  });

  it('G. el resultado no colapsa todo el material en resúmenes genéricos', async () => {
    const source = buildRichSyntheticSource();
    const analysis = buildRichCaseAnalysis();

    const doc = await runGenerationPipeline({
      sourceDocuments: [source],
      selectedDocumentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      matter: 'Laboral',
      workflow: {
        flow: 'DOCUMENT_ANALYSIS',
        analysis: analysis as any,
        selection: { mode: 'automatic' },
      } as any,
    });

    const allText = doc.sections.flatMap(s => s.content.map(b => b.text)).join('\n\n');
    // Con 5 agravios desarrollados, antecedentes y cuestión constitucional,
    // el texto debe ser sustancialmente extenso (mínimo 3000 caracteres de borrador estructurado)
    expect(allText.length).toBeGreaterThan(3000);

    const agraviosSec = doc.sections.find(s => /agravio/i.test(s.title));
    const agraviosText = agraviosSec!.content.map(b => b.text).join('\n\n');
    expect(agraviosText.length).toBeGreaterThan(1200);
  });

  it('H. cada afirmación concreta sensible conserva trazabilidad a una fuente/context item', async () => {
    const source = buildRichSyntheticSource();
    const analysis = buildRichCaseAnalysis();

    const doc = await runGenerationPipeline({
      sourceDocuments: [source],
      selectedDocumentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      matter: 'Laboral',
      workflow: {
        flow: 'DOCUMENT_ANALYSIS',
        analysis: analysis as any,
        selection: { mode: 'automatic' },
      } as any,
    });

    const allText = doc.sections.flatMap(s => s.content.map(b => b.text)).join('\n\n');

    // Trazabilidad de antecedentes a fuente/foja
    expect(allText).toMatch(/\[FUENTE:[^\]]*sentencia_sintetica_amparo\.pdf[^\]]*\]/i);
    // Trazabilidad de citas y tesis
    expect(allText).toContain('Tesis 2a./J. 15/2024');
    // Cuestión constitucional trazable a página o extracto
    expect(allText).toMatch(/página\s*3|p\.\s*3|sentencia_sintetica_amparo/i);
  });
});
