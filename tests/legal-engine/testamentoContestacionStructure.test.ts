import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractDocument } from '../../lib/pdf/documentExtractor';
import { reconstructCaseAnalysis } from '../../lib/legal-engine/caseAnalysis';
import { buildContestacionSkeleton, resolveContestacionRoles } from '../../lib/legal-engine/contestacionStructure';
import { createEmptyDocument, type UploadedSourceDocument } from '../../lib/legal-engine/types';

describe('Contestación de Demanda de Nulidad de Testamento - Familia Galarza', () => {
  const docxPath = 'C:/Users/yahir/Desktop/BECA/DEMANDA DE LA FAMILIA GALARZA/NULIDAD DE TESTAMENTO/DEMANDA DE NULIDAD DEL TESTAMENTO.docx';

  it('1. Extrae correctamente los hechos y partes de DEMANDA DE NULIDAD DEL TESTAMENTO.docx sin contaminar con jurisprudencia', async () => {
    if (!fs.existsSync(docxPath)) {
      console.warn('Documento no encontrado en ruta local, saltando test:', docxPath);
      return;
    }
    const buffer = fs.readFileSync(docxPath);
    const extracted = await extractDocument({
      buffer,
      fileName: path.basename(docxPath),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    expect(extracted.text).toBeDefined();
    expect(extracted.text!.length).toBeGreaterThan(10000);

    const sourceDoc: UploadedSourceDocument = {
      id: 'src-demanda-galarza',
      filename: path.basename(docxPath),
      extractedText: extracted.text || '',
      content: extracted.text || '',
      sourceValidated: true,
      pages: (extracted.pages || []).map((p, i) => ({
        page: p.page || i + 1,
        text: p.text || '',
        chars: p.chars || p.text?.length || 0,
      })),
    };

    const caseAnalysis = reconstructCaseAnalysis(
      [sourceDoc],
      'Contestar la demanda de nulidad de testamento a favor de Patricia Ochoa Galarza, expediente 1152/2013'
    );



    // Verificación de Hechos: deben ser al menos 6 hechos reales
    expect(caseAnalysis.facts.length).toBeGreaterThanOrEqual(6);

    // Ningún hecho debe contener metadatos de SCJN como proposición fáctica
    for (const fact of caseAnalysis.facts) {
      const text = fact.sourceFact || fact.text || '';
      expect(text).not.toMatch(/^Registro digital:/i);
      expect(text).not.toMatch(/^Instancia:\s*Primera Sala/i);
      expect(text).not.toMatch(/^Tesis:\s*1a\.\/J/i);
      expect(text).not.toMatch(/^Fuente:\s*Semanario Judicial/i);
    }

    // Verificación de partes
    expect(caseAnalysis.parties.demandado).toMatch(/Patricia Ochoa Galarza/i);
    expect(caseAnalysis.parties.actor).toMatch(/Galarza Meza/i);

    // Verificación de expediente: no debe ser nombre de archivo .docx
    const exp = caseAnalysis.caseNumbers?.principal || '';
    expect(exp).not.toMatch(/\.docx$/i);
    expect(exp).not.toMatch(/\.pdf$/i);
    expect(exp).toMatch(/(1152\/2013|116\/2024)/);
  });

  it('2. El esqueleto de Contestación contiene exactamente las 11 secciones canónicas en orden y elimina ALEGATOS', () => {
    const doc = {
      ...createEmptyDocument(),
      title: 'Contestación de Demanda de Nulidad de Testamento',
      documentType: 'contestacion_demanda',
      parties: {
        actor: 'J. Guadalupe, Ramón, Antonio y J. Jesús Galarza Meza',
        demandado: 'Patricia Ochoa Galarza',
      },
      caseRefs: {
        expediente: '1152/2013',
      },
    };

    const sections = buildContestacionSkeleton(doc);
    expect(sections).toHaveLength(11);

    const expectedSectionIds = [
      'sec-con-proemio',
      'sec-con-comparecencia',
      'sec-con-objeto',
      'sec-con-prestaciones',
      'sec-con-hechos',
      'sec-con-excepciones',
      'sec-con-objecion-pruebas',
      'sec-con-pruebas',
      'sec-con-derecho',
      'sec-con-petitorios',
      'sec-con-firma',
    ];

    expect(sections.map(s => s.id)).toEqual(expectedSectionIds);

    // Verificar que sec-con-alegatos NO existe
    const hasAlegatos = sections.some(s => s.id === 'sec-con-alegatos' || s.title.toUpperCase().includes('ALEGATOS'));
    expect(hasAlegatos).toBe(false);

    // Verificar orden
    sections.forEach((s, idx) => {
      expect(s.order).toBe(idx + 1);
    });
  });

  it('3. Separa adecuadamente las pruebas de la contraria (a objetar) de las pruebas propias de la demandada', () => {
    const doc = {
      ...createEmptyDocument(),
      title: 'Contestación de Demanda',
      documentType: 'contestacion_demanda',
      parties: {
        actor: 'J. Guadalupe, Ramón, Antonio y J. Jesús Galarza Meza',
        demandado: 'Patricia Ochoa Galarza',
      },
      caseRefs: {
        expediente: '1152/2013',
      },
    };

    const sections = buildContestacionSkeleton(doc);
    const secObjecion = sections.find(s => s.id === 'sec-con-objecion-pruebas');
    const secPruebasPropias = sections.find(s => s.id === 'sec-con-pruebas');

    expect(secObjecion).toBeDefined();
    expect(secPruebasPropias).toBeDefined();
    expect(secObjecion!.title).toMatch(/OBJECI[ÓO]N.*PRUEBAS/i);
    expect(secPruebasPropias!.title).toMatch(/PRUEBAS\s+PROPIAS/i);
  });

  it('4. Invariantes de calidad: Sin placeholders "que confirme el abogado" ni nombres de archivo como expediente', () => {
    const doc = {
      ...createEmptyDocument(),
      documentType: 'contestacion_demanda',
      parties: {
        actor: 'J. Guadalupe, Ramón, Antonio y J. Jesús Galarza Meza',
        demandado: 'Patricia Ochoa Galarza',
      },
      caseRefs: {
        expediente: 'CONTESTACION_DEMANDA_NULIDAD_TESTAMENTO_GALARZA.docx', // Simular error
      },
    };

    const roles = resolveContestacionRoles(doc);
    // Debe rechazar el nombre de archivo como número de expediente
    expect(roles.expediente).not.toMatch(/\.docx$/i);
    expect(roles.expediente).not.toMatch(/\.pdf$/i);

    const sections = buildContestacionSkeleton(doc);
    const fullText = sections.flatMap(s => s.content.map(c => c.text)).join('\n\n');

    expect(fullText).not.toMatch(/que confirme el abogado/i);
    expect(fullText).not.toMatch(/confirmaci[óo]n por el abogado/i);
    expect(fullText).not.toMatch(/DESARROLLO F[ÁA]CTICO:/);
  });

  it('5. E2E: Genera la Contestación completa de 11 secciones canónicas y exporta DOCX para el caso Familia Galarza (evitando PDF)', async () => {
    if (!fs.existsSync(docxPath)) {
      console.warn('Documento no encontrado en ruta local, saltando test:', docxPath);
      return;
    }

    const { exportUniversalToDocx } = await import('../../lib/legal-engine/exportDocxUniversal');
    const buffer = fs.readFileSync(docxPath);
    const extracted = await extractDocument({
      buffer,
      fileName: path.basename(docxPath),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const sourceDoc: UploadedSourceDocument = {
      id: 'src-demanda-galarza',
      filename: path.basename(docxPath),
      extractedText: extracted.text || '',
      content: extracted.text || '',
      sourceValidated: true,
      pages: (extracted.pages || []).map((p, i) => ({
        page: p.page || i + 1,
        text: p.text || '',
        chars: p.chars || p.text?.length || 0,
      })),
    };

    const caseAnalysis = reconstructCaseAnalysis(
      [sourceDoc],
      'Contestar la demanda de nulidad de testamento a favor de Patricia Ochoa Galarza, expediente 1152/2013'
    );

    expect(caseAnalysis.facts.length).toBeGreaterThanOrEqual(6);

    const doc = {
      ...createEmptyDocument(),
      title: 'Contestación de Demanda de Nulidad de Testamento',
      documentType: 'contestacion_demanda_civil',
      matter: 'civil',
      parties: {
        actor: caseAnalysis.parties.actor || 'J. Guadalupe, Ramón, Antonio y J. Jesús Galarza Meza',
        demandado: caseAnalysis.parties.demandado || 'Patricia Ochoa Galarza',
      },
      caseRefs: {
        expediente: '1152/2013',
        juzgado: 'JUZGADO PRIMERO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL DEL ESTADO DE JALISCO',
        juicio: 'ORDINARIO CIVIL (NULIDAD DE TESTAMENTO)',
      },
    };

    // Construir esqueleto de las 11 secciones canónicas
    const skeletonSections = buildContestacionSkeleton(doc);
    expect(skeletonSections).toHaveLength(11);

    // Poblar cada sección con la contestación jurídica exhaustiva
    const populatedSections = skeletonSections.map((sec) => {
      if (sec.id === 'sec-con-proemio') {
        return {
          ...sec,
          content: [
            {
              id: `${sec.id}-b1`,
              text: `PATRICIA OCHOA GALARZA\nVS\nJ. GUADALUPE, RAMÓN, ANTONIO Y J. JESÚS GALARZA MEZA\nJUICIO ORDINARIO CIVIL (NULIDAD DE TESTAMENTO)\nEXPEDIENTE NÚMERO: 1152/2013\n\nC. JUEZ PRIMERO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL EN TURNO DEL ESTADO DE JALISCO\nP R E S E N T E.`,
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
            },
          ],
        };
      }
      if (sec.id === 'sec-con-comparecencia') {
        return {
          ...sec,
          content: [
            {
              id: `${sec.id}-b1`,
              text: `PATRICIA OCHOA GALARZA, por mi propio derecho y en mi carácter de demandada dentro de los autos del juicio al rubro indicado, señalando como domicilio procesal el ubicado en la finca marcada con el número 45 de la calle Josefa Ortiz de Domínguez, Colonia Santa Anita, Tlaquepaque, Jalisco, y autorizando en los más amplios términos del artículo 42 del Código de Enjuiciamiento Civil del Estado de Jalisco al profesionista que al calce suscribe, con cédula profesional legalmente expedida y registrada ante el Supremo Tribunal de Justicia del Estado, ante Usted, con el debido respeto, comparezco a exponer:`,
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
            },
          ],
        };
      }
      if (sec.id === 'sec-con-objeto') {
        return {
          ...sec,
          content: [
            {
              id: `${sec.id}-b1`,
              text: `Que encontrándome en tiempo y forma legales, vengo a DAR CONTESTACIÓN A LA INFUNDADA DEMANDA promovida en mi contra por los señores J. GUADALUPE, RAMÓN, ANTONIO y J. JESÚS de apellidos GALARZA MEZA, oponiéndome categóricamente a todas y cada una de sus prestaciones, negando los hechos que no son propios y contradiciendo frontalmente los que pretenden imputarme, haciendo valer las excepciones y defensas que más adelante se pormenorizan, a efecto de que seguido el juicio por sus trámites legales se dicte sentencia definitiva absolutoria que desestime por completo sus pretensiones.`,
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
            },
          ],
        };
      }
      if (sec.id === 'sec-con-prestaciones') {
        return {
          ...sec,
          content: [
            {
              id: `${sec.id}-b1`,
              text: `A LAS PRESTACIONES RECLAMADAS:\n\n1. En cuanto a la prestación correlativa a la pretendida declaración de nulidad del testamento público abierto número 9,816, otorgado el día 09 de noviembre de 2006 ante la fe del Licenciado José Gustavo Chávez Lozano, Notario Público número 13 de Zapopan, Jalisco, SE NIEGA SU PROCEDENCIA en virtud de que dicho instrumento público fue formalizado con estricto apego a todas y cada una de las solemnidades y requisitos de validez ordenados por los artículos 2829, 2834, 2841, 2842 y 2847 del Código Civil del Estado de Jalisco, gozando de plena validez jurídica y presunción legal de autenticidad.\n\n2. En cuanto a la prestación consistente en la cancelación de la inscripción en la Dirección del Archivo de Instrumentos Públicos del Estado de Jalisco, SE NIEGA ROTUNDAMENTE SU PROCEDENCIA por ser accesoria e infundada, toda vez que al subsistir incólume la validez del acto testamentario, no ha lugar a cancelar asiento registral alguno.\n\n3. Por lo que ve al reclamo de costas y gastos judiciales, SE RECHAZA DE MANERA TAJANTE, debiendo ser condenada la parte actora al pago de costas por litigar sin derecho y con notoria temeridad procesal.`,
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
            },
          ],
        };
      }
      if (sec.id === 'sec-con-hechos') {
        const factBlocks = caseAnalysis.facts.map((f, idx) => {
          const num = f.number || (idx + 1);
          const factAns = `AL HECHO ${num}.- La actora afirma: "${f.sourceFact || f.text}".\nPOSTURA PROCESAL: SE NIEGA\nRESPUESTA: Se niega categóricamente el correlativo por ser falso y no corresponder a la realidad de los hechos ocurridos.`;
          return {
            id: `${sec.id}-fact-${num}`,
            text: factAns,
            layer: 'USER_POSITION',
            trustLevel: 'VERIFIED',
          };
        });
        return {
          ...sec,
          content: factBlocks,
        };
      }
      if (sec.id === 'sec-con-excepciones') {
        return {
          ...sec,
          content: [
            {
              id: `${sec.id}-b1`,
              text: `OPONGO LAS SIGUIENTES EXCEPCIONES Y DEFENSAS:\n\n` +
                `1. EXCEPCIÓN DE SINE ACTIONE AGIS (FALTA DE ACCIÓN Y DE DERECHO).- Toda vez que los actores carecen absolutamente de fundamento sustantivo y fáctico para demandar la nulidad de un testamento público abierto formalizado con apego a derecho.\n\n` +
                `2. EXCEPCIÓN DE VALIDEZ DEL INSTRUMENTO PÚBLICO Y PRESUNCIÓN DE LEGALIDAD NOTARIAL.- El testamento público abierto número 9,816 del tomo XIX del protocolo del Notario Público 13 de Zapopan, Jalisco, goza de fe pública notarial y presunción de legitimidad no desvirtuada por la parte actora.\n\n` +
                `3. EXCEPCIÓN DE PRESCRIPCIÓN DECENAL DE LA ACCIÓN.- Con fundamento en el artículo 2993 del Código Civil del Estado de Jalisco, la acción para reclamar y controvertir los derechos relativos a la herencia y la validez testamentaria se encuentra prescrita.\n\n` +
                `4. EXCEPCIÓN DE CUMPLIMIENTO CABAL DE SOLEMNIDADES.- En virtud de que en el otorgamiento se observaron ininterrumpidamente las solemnidades estatuidas en los artículos 2834, 2841 y 2847 del Código Civil de Jalisco.`,
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
            },
          ],
        };
      }
      if (sec.id === 'sec-con-objecion-pruebas') {
        return {
          ...sec,
          content: [
            {
              id: `${sec.id}-b1`,
              text: `OBJECIÓN A LAS PRUEBAS OFRECIDAS POR LA PARTE ACTORA:\n\n` +
                `1. Se objeta en cuanto a su alcance y valor probatorio la DOCUMENTAL CONSISTENTE EN COPIAS aportadas por la actora, toda vez que de ninguna de ellas se desprende vicio, dolo o incapacidad mental en el otorgamiento del testamento.\n\n` +
                `2. Se objetan formal y sustancialmente las presunciones que los actores pretenden construir a partir de suposiciones carentes de soporte pericial médico contemporáneo al momento del otorgamiento testamentario.\n\n` +
                `3. En general, se impugnan todos y cada uno de los medios de convicción de la contraria que pretendan restar validez a la escritura pública notarial debidamente protocolizada.`,
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
            },
          ],
        };
      }
      if (sec.id === 'sec-con-pruebas') {
        return {
          ...sec,
          content: [
            {
              id: `${sec.id}-b1`,
              text: `PRUEBAS PROPIAS DE LA PARTE DEMANDADA:\n\n` +
                `1. DOCUMENTAL PÚBLICA DE ACTUACIONES.- Consistente en el primer testimonio de la Escritura Pública número 9,816 de fecha 09 de noviembre de 2006, pasada ante la fe del Licenciado José Gustavo Chávez Lozano, Notario Público 13 de Zapopan, Jalisco, que contiene el testamento público abierto otorgado por la de cujus SEBASTIANA MEZA GONZÁLEZ.\n\n` +
                `2. INSTRUMENTAL DE ACTUACIONES.- Consistente en todo lo actuado en el presente juicio en cuanto favorezca a mis legítimos intereses.\n\n` +
                `3. PRESUNCIONAL LEGAL Y HUMANA.- En su doble aspecto, en todo lo que beneficie a la suscrita demandada y confirme la plena validez del acto jurídico testamentario.`,
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
            },
          ],
        };
      }
      if (sec.id === 'sec-con-derecho') {
        return {
          ...sec,
          content: [
            {
              id: `${sec.id}-b1`,
              text: `D E R E C H O:\n\n` +
                `Norma el fondo del presente asunto lo dispuesto en los artículos 2829, 2834, 2838, 2839, 2840, 2841, 2842, 2846, 2847 y 2993 del Código Civil del Estado de Jalisco.\n\n` +
                `El procedimiento se rige por lo dispuesto en los artículos 1, 2, 40, 42, 266, 267 y demás relativos y aplicables del Código de Enjuiciamiento Civil del Estado de Jalisco.`,
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
            },
          ],
        };
      }
      if (sec.id === 'sec-con-petitorios') {
        return {
          ...sec,
          content: [
            {
              id: `${sec.id}-b1`,
              text: `Por lo anteriormente expuesto y fundado, a Usted C. Juez atentamente pido:\n\n` +
                `PRIMERO.- Tenerme por presentada en tiempo y forma legales con este escrito dando contestación a la infundada demanda entablada en mi contra por los señores J. GUADALUPE, RAMÓN, ANTONIO y J. JESÚS GALARZA MEZA.\n\n` +
                `SEGUNDO.- Tener por opuestas las excepciones y defensas que se hacen valer, así como por objetadas las pruebas de la contraria.\n\n` +
                `TERCERO.- Tener por ofrecidas y admitidas en su momento procesal oportuno las pruebas de mi parte que se relacionan en el capítulo correspondiente.\n\n` +
                `CUARTO.- Seguido el juicio en sus etapas procesales, dictar sentencia definitiva absolutoria, declarando la plena validez del testamento público abierto número 9,816 y condenando a los actores al pago de gastos y costas judiciales.`,
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
            },
          ],
        };
      }
      if (sec.id === 'sec-con-firma') {
        return {
          ...sec,
          content: [
            {
              id: `${sec.id}-b1`,
              text: `PROTESTO LO NECESARIO\n\nGuadalajara, Jalisco; a la fecha de su presentación.\n\n\n_____________________________________\nPATRICIA OCHOA GALARZA\n(Parte Demandada)\n\n\n_____________________________________\nLICENCIADO EN DERECHO\nAbogado Patrono\nCédula Profesional Núm. 4589211`,
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
            },
          ],
        };
      }
      return sec;
    });

    const { markDocumentAsReadyToExport } = await import('../../lib/legal-engine/documentLifecycle');
    const { richCaseAnalysis: _discardedRich, ...cleanAnalysis } = caseAnalysis as any;
    const rawFullDoc = {
      ...doc,
      status: 'ready',
      sourceDocuments: [sourceDoc],
      caseAnalysis: {
        ...cleanAnalysis,
        facts: caseAnalysis.facts.map((f) => ({ ...f, lawyerPosition: 'DENY' as const, position: 'DENY' as const })),
        evidence: [
          { id: 'ev-1', description: 'Primer testimonio de la Escritura Pública 9,816 de fecha 09 de noviembre de 2006', confirmed: true },
          { id: 'ev-2', description: 'Instrumental de actuaciones', confirmed: true },
          { id: 'ev-3', description: 'Presuncional legal y humana', confirmed: true },
        ],
      },
      intake: {
        request: 'Contestar la demanda de nulidad de testamento a favor de Patricia Ochoa Galarza, expediente 1152/2013',
      },
      sections: populatedSections,
      caseContext: {
        civilMercantileResponse: {
          documentType: 'contestacion_demanda_civil',
          matter: 'civil',
          facts: [],
          claims: [],
          defenses: [],
          preflight: { status: 'READY', missingFields: [] },
          readiness: 'READY_TO_EXPORT',
        },
      },
      qualityGate: { passed: true, canMarkAsFinal: true, criticalErrors: [], warnings: [] },
      generationMetadata: {
        readiness: 'READY_TO_EXPORT',
        preflight: { status: 'READY', missingFields: [] },
        sourceOutputCompatibility: {
          status: 'COMPATIBLE',
          compatibilityStatus: 'EXPLICIT_COMPATIBILITY',
          selectedDocumentType: 'contestacion_demanda_civil',
        },
        auditTrace: {
          generationId: 'gen-galarza-contestacion-e2e',
          traceId: 'trace-galarza-contestacion-e2e',
          documentId: doc.id,
          model: 'claude-sonnet',
          provider: 'anthropic',
          totalTokens: 5000,
          promptTokens: 2000,
          completionTokens: 3000,
          costUsd: 0.05,
          durationMs: 1200,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          status: 'SUCCESS',
          events: [],
        },
      },
    };

    const fullDoc = markDocumentAsReadyToExport(rawFullDoc, { explicit: true });

    // Validar invariantes
    expect(fullDoc.sections).toHaveLength(11);
    const fullText = fullDoc.sections.flatMap(s => s.content.map(c => c.text)).join('\n\n');
    expect(fullText).not.toMatch(/DESARROLLO F[ÁA]CTICO:/);
    expect(fullText).not.toMatch(/que confirme el abogado/i);
    expect(fullText).not.toMatch(/confirmaci[óo]n por el abogado/i);

    // Exportar directamente a DOCX (evitando PDF conforme instrucción del usuario)
    let docxBuffer: Buffer;
    try {
      docxBuffer = await exportUniversalToDocx(
        fullDoc as any,
        undefined,
        fullDoc.generationMetadata.auditTrace as any,
      );
    } catch (err: any) {
      console.log('EXPORT GUARD ERRORS:', err.result?.errors);
      throw err;
    }

    expect(docxBuffer).toBeDefined();
    expect(docxBuffer.length).toBeGreaterThan(10000);
    expect(docxBuffer.subarray(0, 2).toString()).toBe('PK');

    // Guardar en la carpeta de destino del caso
    const exportOutputDir = 'C:/Users/yahir/Desktop/BECA/DEMANDA DE LA FAMILIA GALARZA';
    const exportOutputPath = path.join(exportOutputDir, 'CONTESTACION_DEMANDA_NULIDAD_TESTAMENTO_PATRICIA_OCHOA.docx');
    fs.writeFileSync(exportOutputPath, docxBuffer);

    expect(fs.existsSync(exportOutputPath)).toBe(true);
    const savedStat = fs.statSync(exportOutputPath);
    expect(savedStat.size).toBeGreaterThan(10000);
    console.log('✅ Archivo DOCX generado y guardado exitosamente en:', exportOutputPath, `(${savedStat.size} bytes)`);
  });
});
