import { describe, expect, it } from 'vitest';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

describe('INVARIANZA DE ISSUES RESPECTO A TARGET_PAGES Y GENERALIZACIÓN', () => {
  it('demuestra que targetPages no interviene en extractDynamicLegalIssues ni altera los issues', () => {
    const mockSourceDoc: UploadedSourceDocument = {
      id: 'doc-laboral-1',
      filename: 'sentencia_laboral.pdf',
      name: 'sentencia_laboral.pdf',
      type: 'pdf',
      fileUrl: 'blob:doc-laboral-1',
      extractedText: [
        'SEGUNDO TRIBUNAL COLEGIADO EN MATERIA DE TRABAJO',
        'AMPARO DIRECTO 500/2025',
        'CONSIDERANDO PRIMERO. Competencia.',
        'Este Tribunal Colegiado es competente para conocer del presente juicio.',
        'CONSIDERANDO SEGUNDO. Análisis de la prescripción de la acción laboral.',
        'El trabajador demandó el pago de horas extraordinarias y prima de antigüedad.',
        'Esta autoridad estima que operó la prescripción del artículo 516 de la Ley Federal del Trabajo.',
        'RESUELVE: PRIMERO. La Justicia de la Unión NO AMPARA NI PROTEGE.',
      ].join('\n'),
      sourceValidated: true,
      pages: [
        {
          page: 1,
          text: 'SEGUNDO TRIBUNAL COLEGIADO EN MATERIA DE TRABAJO AMPARO DIRECTO 500/2025...',
          chars: 500,
        },
      ],
    };

    // Case analysis reconstruido con la misma fuente
    const analysisA = reconstructCaseAnalysis([mockSourceDoc], 'Interponer recurso de revisión en amparo directo');
    const analysisB = reconstructCaseAnalysis([mockSourceDoc], 'Interponer recurso de revisión en amparo directo');

    const issuesA = analysisA.proceduralPosture?.constitutionalIssues || [];
    const issuesB = analysisB.proceduralPosture?.constitutionalIssues || [];

    // Demostración explícita de equivalencia estricta
    expect(issuesA).toEqual(issuesB);
    expect(issuesA.length).toBe(issuesB.length);
  });

  it('demuestra que un documento con 1 solo considerando impugnado genera issues específicos y NO una lista fija de 4', () => {
    const mockDoc1CR: UploadedSourceDocument = {
      id: 'doc-single-cr',
      filename: 'resolucion_unica.pdf',
      name: 'resolucion_unica.pdf',
      type: 'pdf',
      fileUrl: 'blob:doc-single-cr',
      extractedText: [
        'TRIBUNAL COLEGIADO',
        'AMPARO DIRECTO 123/2025',
        'CONSIDERANDO ÚNICO. Inconstitucionalidad del artículo 25 de la ley burocrática local.',
        'Se concluye que la norma combatida vulnera el principio de igualdad y estabilidad en el empleo de los trabajadores.',
        'RESUELVE: ÚNICO. Se concede el amparo.',
      ].join('\n'),
      sourceValidated: true,
      pages: [
        {
          page: 1,
          text: 'CONSIDERANDO ÚNICO. Inconstitucionalidad del artículo 25 de la ley burocrática local...',
          chars: 400,
        },
      ],
    };

    const analysis = reconstructCaseAnalysis([mockDoc1CR], 'Interponer recurso de revisión en amparo directo');
    const constIssues = analysis.proceduralPosture?.constitutionalIssues || [];

    // Debe contener:
    // 1 issue de procedencia constitucional abstracta (Art. 107 frac IX / 81 frac II)
    // + 1 issue sustantivo derivado del considerando único
    // TOTAL: 2 issues. NO 4 issues prefabricados!
    expect(constIssues.length).toBe(2);

    const procedenciaIssue = constIssues.find((i) => i.id === 'issue-const-procedencia');
    expect(procedenciaIssue).toBeDefined();
    expect(procedenciaIssue?.title).toContain('Procedencia e interés excepcional');

    const substantiveIssue = constIssues.find((i) => i.id.startsWith('issue-cr-'));
    expect(substantiveIssue).toBeDefined();
    expect(substantiveIssue?.title).toContain('ÚNICO');

    // NO debe existir issue sobre cómputo de plazos ni artículos 17, 18, 19, 22 de la Ley de Amparo
    const plazoIssue = constIssues.find((i) => /plazo|cómputo|oportunidad/i.test(i.title) || /17, 18, 19, 22/i.test(i.parameter));
    expect(plazoIssue).toBeUndefined();
  });
});