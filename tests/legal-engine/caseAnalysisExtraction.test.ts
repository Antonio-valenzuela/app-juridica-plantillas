import { describe, expect, it } from 'vitest';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

describe('judicial procedural extraction', () => {
  it('materializes procedural events when PDF extraction splits dates from their event text', () => {
    const analysis = reconstructCaseAnalysis([{
      id: 'synthetic-resolution',
      filename: 'synthetic-resolution.pdf',
      type: 'application/pdf',
      pages: [{
        page: 4,
        chars: 130,
        text: [
          'ANTECEDENTES',
          'El 3 de enero de 2024',
          'se presentó la demanda.',
          'El 10 de febrero de 2024',
          'se dictó sentencia.',
          'La fecha de nacimiento de la parte es el 2 de mayo de 1980.',
        ].join('\n'),
      }],
      sourceValidated: true,
    }], 'Preparar recurso de revisión.');

    expect(analysis.proceduralTimeline).toHaveLength(2);
    expect(analysis.proceduralTimeline.map((event) => event.event).join(' ')).toContain('se presentó la demanda');
    expect(analysis.proceduralTimeline.map((event) => event.event).join(' ')).toContain('se dictó sentencia');
    expect(analysis.proceduralTimeline.every((event) => event.page === 4)).toBe(true);
  });

  it('retains source-page chronology for an explicitly classified amparo judgment', () => {
    const analysis = reconstructCaseAnalysis([{
      id: 'fallback-classified-resolution',
      filename: 'sentencia_amparo_directo_800_2024.pdf',
      type: 'application/pdf',
      sourceValidated: true,
      classification: { sourceDocumentType: 'SENTENCIA_AMPARO_DIRECTO' },
      pages: [{
        page: 1,
        chars: 600,
        text: [
          'SEGUNDO TRIBUNAL COLEGIADO EN MATERIA ADMINISTRATIVA DEL TERCER CIRCUITO',
          'AMPARO DIRECTO 800/2024',
          'QUEJOSO: EMPRESA DEMANDANTE S.A. DE C.V.',
          'SENTENCIA DEFINITIVA',
          'ANTECEDENTES',
          'El 3 de enero de 2024 se presentó demanda de amparo directo en el expediente AMPARO DIRECTO 800/2024.',
          'El 10 de febrero de 2024 se dictó la sentencia definitiva recurrida.',
          'El 15 de marzo de 2024 se interpuso en tiempo el presente recurso de revisión.',
        ].join('\n'),
      }],
    }], 'Interponer recurso de revisión en amparo directo fundado en omisión constitucional.', '', { includeReferenceInAnalysis: false });

    expect(analysis.caseNumbers.principal).toBe('800/2024');
    expect(analysis.proceduralTimeline.map((event) => event.date)).toEqual(expect.arrayContaining([
      '3 de enero de 2024', '10 de febrero de 2024', '15 de marzo de 2024',
    ]));
    expect(analysis.proceduralTimeline.every((event) => event.page === 1)).toBe(true);
  });

  it('does not promote an unrelated date or party allegation into a court-established fact', () => {
    const analysis = reconstructCaseAnalysis([{
      id: 'synthetic-allegation',
      filename: 'synthetic-allegation.pdf',
      type: 'application/pdf',
      content: 'La parte actora manifiesta que el pago ocurrió el 2 de mayo de 1980.',
    }], 'Preparar recurso.');

    expect(analysis.proceduralTimeline).toHaveLength(0);
    expect(analysis.richCaseAnalysis?.facts.every((fact) => fact.assertionStatus !== 'ESTABLISHED_FACT')).toBe(true);
  });

  it('preserves a legal heading with its following argument body', () => {
    const analysis = reconstructCaseAnalysis([{
      id: 'synthetic-arguments',
      filename: 'synthetic-arguments.pdf',
      type: 'application/pdf',
      content: [
        'PRIMER CONCEPTO DE VIOLACIÓN. - ESTE PRIMER CONCEPTO',
        'DE VIOLACIÓN CONSISTE EN QUE LA AUTORIDAD RESPONSABLE',
        'OMITIÓ VALORAR LA PRUEBA DOCUMENTAL OFRECIDA.',
        '',
        'SEGUNDO CONCEPTO DE VIOLACIÓN. - ESTE SEGUNDO CONCEPTO',
        'DEBE ANALIZARSE DE FORMA INDEPENDIENTE.',
      ].join('\n'),
    }], 'Preparar recurso de revisión.');

    const argumentsFound = analysis.richCaseAnalysis?.arguments || [];
    expect(argumentsFound).toHaveLength(2);
    expect(argumentsFound[0].proposition).toContain('OMITIÓ VALORAR LA PRUEBA DOCUMENTAL OFRECIDA');
    expect(argumentsFound[1].proposition).toContain('DEBE ANALIZARSE DE FORMA INDEPENDIENTE');
  });

  it('preserves wrapped arguments when PDF layout marks the page as a table', () => {
    const analysis = reconstructCaseAnalysis([{
      id: 'synthetic-table-arguments',
      filename: 'synthetic-table-arguments.pdf',
      type: 'application/pdf',
      pages: [{
        page: 1,
        chars: 300,
        text: [
          '\t',
          'PRIMER CONCEPTO DE VIOLACIÓN. - ESTE PRIMER CONCEPTO',
          'DE VIOLACIÓN CONSISTE EN QUE LA AUTORIDAD RESPONSABLE',
          'OMITIÓ VALORAR LA PRUEBA DOCUMENTAL OFRECIDA.',
          'SEGUNDO CONCEPTO DE VIOLACIÓN. - ESTE SEGUNDO CONCEPTO',
          'DEBE ANALIZARSE DE FORMA INDEPENDIENTE.',
        ].join('\n'),
      }],
    }], 'Preparar recurso de revisión.');

    const argumentsFound = analysis.richCaseAnalysis?.arguments || [];
    expect(argumentsFound).toHaveLength(2);
    expect(argumentsFound[0].proposition).toContain('OMITIÓ VALORAR LA PRUEBA DOCUMENTAL OFRECIDA');
    expect(argumentsFound[1].proposition).toContain('DEBE ANALIZARSE DE FORMA INDEPENDIENTE');
  });
});
