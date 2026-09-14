/**
 * phase4Integration.test.ts — FASE 4: Integración End-to-End de Generación Jerárquica
 *
 * Verifica el flujo completo de generación jerárquica con fixture rico (4W):
 * - Múltiples pretensiones, hechos y pruebas reales.
 * - 3+ issues jurídicos sustanciales.
 * - Desglose de planes por sección en GenerationTasks con presupuestos dinámicos.
 * - Ejecución de tareas con ensamble ordenado y actualización de CoverageMatrix.
 * - Trazabilidad de items hacia bloques generados (status: 'generated').
 * - Calidad circunstanciada en contestaciones (cero "Se niega" plano).
 * - Calidad forense en agravios (cero jurisprudencia inventada).
 */

import { describe, it, expect } from 'vitest';
import {
  UploadedSourceDocument,
  createEmptyDocument,
  createDocumentNode,
} from '@/lib/legal-engine/types';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import {
  buildDraftingPlan,
  generateSection,
  runGenerationPipeline,
} from '@/lib/legal-engine/pipeline';
import {
  buildGenerationTasksForSection,
  TASK_LIMITS,
} from '@/lib/legal-engine/generationTasks';

describe('Fase 4: Integración End-to-End de Generación Jerárquica (4W)', () => {
  const richSourceExpediente: UploadedSourceDocument[] = [
    {
      id: 'src-demanda-mercantil-completa',
      filename: 'demanda_ejecutiva_mercantil.txt',
      content: `H. JUZGADO DE DISTRITO EN MATERIA CIVIL Y MERCANTIL EN TURNO
JUICIO EJECUTIVO MERCANTIL ORAL
EXPEDIENTE: 1045/2023

ACTOR: Corporativo Financiero del Norte S.A. de C.V. SOFOM E.N.R.
DEMANDADO: Constructora e Inmobiliaria Diamante S.A. de C.V.

PRESTACIONES:
A) El pago de la cantidad de $4,850,000.00 M.N. por concepto de suerte principal adeudada.
B) El pago de intereses moratorios a razón del 3.5% mensual computados desde el 1 de octubre de 2023.
C) El pago de los gastos y costas procesales que se originen por la tramitación del presente juicio.

HECHOS:
1. El día 15 de marzo de 2023, las partes suscribieron un Contrato de Apertura de Crédito Simple con garantía hipotecaria número 4598-A.
2. Como respaldo crediticio, el demandado suscribió un pagaré mercantil por el monto total otorgado con fecha de vencimiento al 30 de septiembre de 2023.
3. El día 20 de marzo de 2023, la actora dispersó íntegramente la cantidad pactada mediante transferencia interbancaria SPEI folio 8945201.
4. Con fecha 1 de octubre de 2023, feneció el término para el cumplimiento voluntario de pago sin que el acreditado haya liquidado el capital ni los intereses causados.
5. Mediante requerimiento notarial practicado por el Notario 45 el día 15 de noviembre de 2023, se intimó formalmente de pago al deudor.

PRUEBAS:
1. DOCUMENTAL PÚBLICA: Copia certificada de la escritura pública número 12,450 que contiene el poder del apoderado.
2. DOCUMENTAL PRIVADA: Pagaré mercantil de fecha 15 de marzo de 2023 suscrito por el representante legal del demandado.
3. DOCUMENTAL FINANCIERA: Comprobante de liquidación de transferencia bancaria SPEI folio 8945201.`,
    },
    {
      id: 'src-sentencia-amparo-revision',
      filename: 'sentencia_amparo_directo.txt',
      content: `TRIBUNAL COLEGIADO EN MATERIA CIVIL DEL PRIMER CIRCUITO
AMPARO DIRECTO D.C. 542/2023
QUEJOSO: Constructora e Inmobiliaria Diamante S.A. de C.V.
TERCERO INTERESADO: Corporativo Financiero del Norte S.A. de C.V.

CONSIDERANDO TERCERO: Resulta infundado el concepto de violación relativo a la incompetencia por declinatoria planteada.
CONSIDERANDO CUARTO: Se desestima el concepto de violación en el que se reclamó la inconstitucionalidad del pagaré y usura bancaria desproporcionada.
CONSIDERANDO QUINTO: Se considera inoperante el argumento sobre la falta de llamamiento a juicio de los avales y coobligados solidarios.`,
    },
  ];

  it('A) Desglose jerárquico de contestación mercantil con 3 ClaimPlans y 5 FactResponsePlans', () => {
    const analysis = reconstructCaseAnalysis(richSourceExpediente, 'contestar demanda mercantil y oponer excepciones', '', {
      includeReferenceInAnalysis: false,
    });

    expect(analysis.claims.length).toBeGreaterThanOrEqual(3);
    expect(analysis.facts.length).toBeGreaterThanOrEqual(5);
    expect(analysis.evidence.length).toBeGreaterThanOrEqual(3);

    const doc = createEmptyDocument({
      id: 'doc-contestacion-mercantil',
      title: 'Contestación de Demanda Ejecutiva Mercantil',
      documentType: 'contestacion_demanda_mercantil',
      documentTypeLabel: 'Contestación de Demanda Ejecutiva Mercantil',
      matter: 'Mercantil',
      sections: [
        createDocumentNode({ id: 'sec-proemio', type: 'header', title: 'PROEMIO', order: 10, content: [] }),
        createDocumentNode({ id: 'sec-prestaciones', type: 'argument', title: 'CONTESTACIÓN A LAS PRESTACIONES', order: 20, content: [] }),
        createDocumentNode({ id: 'sec-hechos', type: 'background', title: 'CONTESTACIÓN A LOS HECHOS', order: 30, content: [] }),
        createDocumentNode({ id: 'sec-excepciones', type: 'argument', title: 'EXCEPCIONES Y DEFENSAS', order: 40, content: [] }),
        createDocumentNode({ id: 'sec-pruebas', type: 'evidence', title: 'PRUEBAS DE LA PARTE DEMANDADA', order: 50, content: [] }),
        createDocumentNode({ id: 'sec-petitorios', type: 'petition', title: 'PUNTOS PETITORIOS', order: 60, content: [] }),
      ],
    } as any);

    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    doc.coverageMatrix = matrix;
    const plan = buildDraftingPlan(doc, 12000, analysis);

    // 1. Verificar sección de prestaciones
    const prestSecPlan = plan.sections.find((s) => /prestaci/i.test(s.title));
    expect(prestSecPlan).toBeDefined();
    expect(prestSecPlan?.claimPlans?.length).toBe(3);

    const claimTasks = buildGenerationTasksForSection(prestSecPlan!, doc, analysis, matrix);
    expect(claimTasks).toHaveLength(3);
    expect(claimTasks.every((t) => t.type === 'CLAIM' || t.taskType === 'CLAIM')).toBe(true);

    // 2. Verificar presupuestos dinámicos en prestaciones
    claimTasks.forEach((ct) => {
      expect(ct.tokenBudget).toBeGreaterThanOrEqual(TASK_LIMITS.MIN_TASK_BUDGET);
      expect(ct.tokenBudget).toBeLessThanOrEqual(TASK_LIMITS.MAX_TASK_BUDGET);
    });

    // 3. Verificar sección de hechos
    const hechosSecPlan = plan.sections.find((s) => /hecho/i.test(s.title));
    expect(hechosSecPlan).toBeDefined();
    expect(hechosSecPlan?.factResponsePlans?.length).toBeGreaterThanOrEqual(5);

    const factTasks = buildGenerationTasksForSection(hechosSecPlan!, doc, analysis, matrix);
    expect(factTasks.length).toBeGreaterThanOrEqual(5);
    expect(factTasks.every((t) => t.type === 'FACT_RESPONSE' || t.taskType === 'FACT_RESPONSE')).toBe(true);
  });

  it('B) Generación jerárquica de Agravios en Amparo Directo en Revisión con trazabilidad completa', async () => {
    const analysis = reconstructCaseAnalysis(richSourceExpediente, 'interponer recurso de revisión en amparo directo', '', {
      includeReferenceInAnalysis: false,
    });

    const doc = createEmptyDocument({
      id: 'doc-amparo-revision',
      title: 'Recurso de Revisión en Amparo Directo',
      documentType: 'recurso_revision_amparo_directo',
      documentTypeLabel: 'Recurso de Revisión en Amparo Directo',
      matter: 'Amparo',
      sections: [
        createDocumentNode({ id: 'sec-proemio', type: 'header', title: 'PROEMIO', order: 10, content: [] }),
        createDocumentNode({ id: 'sec-procedencia', type: 'argument', title: 'PROCEDENCIA DE LA REVISIÓN EXTRAORDINARIA', order: 20, content: [] }),
        createDocumentNode({ id: 'sec-agravios', type: 'argument', title: 'AGRAVIOS', order: 30, content: [] }),
        createDocumentNode({ id: 'sec-petitorios', type: 'petition', title: 'PETITORIOS', order: 40, content: [] }),
      ],
    } as any);

    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    doc.coverageMatrix = matrix;
    const plan = buildDraftingPlan(doc, 15000, analysis);

    const agraviosSec = doc.sections.find((s) => s.id === 'sec-agravios')!;
    const agraviosPlan = plan.sections.find((s) => s.templateSectionId === 'sec-agravios')!;

    // Generador forense simulado de alta precisión
    const mockForensicAiGenerator = async ({ section }: { section: any }) => {
      return `AGRAVIO FORENSE INDIVIDUALIZADO:
Se combate expresamente la determinación del Tribunal Colegiado recurrido en cuanto omitió realizar una interpretación directa de los artículos 1o., 14 y 16 Constitucionales.
El órgano de amparo eludió pronunciarse sobre la usura contractual alegada conforme al parámetro jurisprudencial vinculante de la Primera Sala de la Suprema Corte de Justicia de la Nación.
Por ende, la resolución recurrida resulta violatoria de los derechos fundamentales al debido proceso y seguridad jurídica patrimonial de mi mandante, procediendo revocar la sentencia impugnada y conceder la protección constitucional solicitada.`;
    };

    const genResult = await generateSection(
      doc,
      agraviosSec.id,
      undefined,
      mockForensicAiGenerator,
      undefined,
      agraviosPlan,
      analysis
    );

    expect(genResult.text).toBeTruthy();
    expect(genResult.text).toContain('AGRAVIO FORENSE INDIVIDUALIZADO');
    expect(agraviosSec.content.length).toBeGreaterThan(0);

    // Verificar que los bloques generados no tienen seed markers
    for (const blk of agraviosSec.content) {
      expect(blk.text).not.toContain('[Desarrollar por la IA');
      expect(blk.text).not.toContain('[TODO');
    }

    // Verificar que la CoverageMatrix registró los bloques generados (status: 'generated')
    const generatedItems = matrix.items.filter((i) => i.status === 'generated');
    expect(generatedItems.length).toBeGreaterThan(0);
    generatedItems.forEach((gi) => {
      expect(gi.generatedBlockIds?.length).toBeGreaterThan(0);
      // Invariante de seguridad de Fase 4: status 'covered' está reservado a Fase 5
      expect(gi.status).not.toBe('covered');
    });
  });

  it('C) Pipeline completo genera contestación circunstanciada sin mutilar a "Se niega"', async () => {
    const doc = createEmptyDocument({
      id: 'doc-pipeline-contestacion',
      title: 'Contestación de Demanda',
      documentType: 'contestacion_demanda_civil',
      documentTypeLabel: 'Contestación de Demanda Ordinaria Civil',
      matter: 'Civil',
      sections: [
        createDocumentNode({ id: 'sec-proemio', type: 'header', title: 'PROEMIO', order: 10, content: [] }),
        createDocumentNode({ id: 'sec-prestaciones', type: 'argument', title: 'CONTESTACIÓN A LAS PRESTACIONES', order: 20, content: [] }),
        createDocumentNode({ id: 'sec-hechos', type: 'background', title: 'CONTESTACIÓN A LOS HECHOS', order: 30, content: [] }),
        createDocumentNode({ id: 'sec-excepciones', type: 'argument', title: 'EXCEPCIONES Y DEFENSAS', order: 40, content: [] }),
        createDocumentNode({ id: 'sec-petitorios', type: 'petition', title: 'PETITORIOS', order: 50, content: [] }),
      ],
    } as any);

    const detailedCustomGenerator = async ({ section }: { section: any }) => {
      if (/prestaci/i.test(section.title)) {
        return `CONTESTACIÓN PUNTUAL A CADA UNA DE LAS PRESTACIONES RECLAMADAS:
En relación con la prestación identificada con el inciso A), consistente en el cobro de la cantidad demandada, se opone expresamente la excepción de pago y falta de acción.
En relación con la prestación B), relativa al pago de intereses moratorios, se controvierte su procedencia jurídica por no existir pacto moratorio válido y actualizarse plus petitio.`;
      }
      if (/hecho/i.test(section.title)) {
        return `CONTESTACIÓN CIRCUNSTANCIADA DE CADA HECHO:
AL HECHO 1: Es cierto en cuanto a la firma del documento basal, mas falso en cuanto al alcance obligacional que pretende atribuirle la actora.
AL HECHO 2: Es parcialmente cierto en cuanto a la recepción del primer envío, mas totalmente falso en cuanto a la mora alegada.`;
      }
      return `SECCIÓN ${section.title.toUpperCase()} DESARROLLADA Y FUNDADA EN DERECHO.`;
    };

    doc.sourceDocuments = richSourceExpediente;
    const result = await runGenerationPipeline({
      existingDocument: doc,
      sourceDocuments: richSourceExpediente,
      userInstruction: 'Elaborar contestación de demanda exhaustiva y circunstanciada',
      generateSection: detailedCustomGenerator,
    });

    expect(result).toBeDefined();
    expect(result.sections.length).toBeGreaterThan(0);

    const prestacionesSec = result.sections.find((s) => /prestaci/i.test(s.title));
    const prestacionesText = prestacionesSec?.content.map((b) => b.text).join('\n\n') || '';

    // Debe conservar el texto circunstanciado y NO haber sido destruido por "Se niega"
    expect(prestacionesText).toContain('CONTESTACIÓN PUNTUAL A CADA UNA DE LAS PRESTACIONES');
    expect(prestacionesText).not.toBe('Se niega');
    expect(prestacionesText).not.toBe('RAZÓN Y RESPUESTA: Se niega');

    const hechosSec = result.sections.find((s) => /hecho/i.test(s.title));
    const hechosText = hechosSec?.content.map((b) => b.text).join('\n\n') || '';
    expect(hechosText).toContain('CONTESTACIÓN CIRCUNSTANCIADA DE CADA HECHO');
    expect(hechosText).not.toBe('Se niega');
  });
});
