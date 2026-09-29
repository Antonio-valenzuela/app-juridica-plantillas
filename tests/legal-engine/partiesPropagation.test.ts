import { describe, it, expect } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildContestacionSkeleton, resolveContestacionRoles } from '@/lib/legal-engine/contestacionStructure';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { assembleLegalDraft } from '@/lib/legal-engine/documentAssembly';
import { validateForExport } from '@/lib/legal-engine/exportGuards';

const SAMPLE_DEMAND_TEXT = `
h. TRIBUNAL DE ARBITRAJE Y ESCALAFÓN DEL ESTADO DE JALISCO EN TURNO PRESENTE.

                 C. PERSONA FICTICIA PRUEBA, mexicana, mayor de edad, soltera, señalando como domicilio procesal uno simulado y autorizando a la persona asesora jurídica de prueba, con el debido respeto comparezco a:

E X P O N E R

    POR MEDIO DEL PRESENTE ESCRITO VENGO A DEMANDAR FORMALMENTE EN CONTRA DE LA INSTITUCIÓN PÚBLICA DE PRUEBA Y/O REPRESENTANTES LEGALES O APODERADOS DE LA FUENTE DE TRABAJO, ASI COMO A SU DIRECCIÓN GENERAL EN TURNO. Se señala un domicilio institucional simulado.

CAPITULO DE HECHOS
1.- La fecha de ingreso se identifica como FECHA SIMULADA A.
2.- La fecha de terminación se identifica como FECHA SIMULADA B.

A T E N T A M E N T E:
Guadalajara, Jalisco a la fecha de su presentación 2025

_____________________________________
PERSONA FICTICIA PRUEBA
`;

describe('Parties Extraction and Propagation to Formal Sections (RED -> FIX -> GREEN)', () => {
  it('extracts actor and demandado from demand text into caseAnalysis.parties', () => {
    const sourceDoc = createSourceDocument({
      id: 'test-demand-parties',
      filename: 'demanda.docx',
      name: 'demanda.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extractedText: SAMPLE_DEMAND_TEXT,
      sourceValidated: true,
      sourceQualityStatus: 'READY',
    });

    const analysis = reconstructCaseAnalysis([sourceDoc]);

    expect(analysis.parties.actor).toBeDefined();
    expect(analysis.parties.actor).toContain('PERSONA FICTICIA PRUEBA');

    expect(analysis.parties.demandado).toBeDefined();
    expect(analysis.parties.demandado).toContain('INSTITUCIÓN PÚBLICA DE PRUEBA');

    expect(analysis.parties.autoridadResponsable).toBeDefined();
    expect(analysis.parties.autoridadResponsable).toContain('TRIBUNAL DE ARBITRAJE Y ESCALAFÓN');
  });

  it('propagates known parties and marks only genuinely missing formal fields', () => {
    const sourceDoc = createSourceDocument({
      id: 'test-demand-parties',
      filename: 'demanda.docx',
      name: 'demanda.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extractedText: SAMPLE_DEMAND_TEXT,
      sourceValidated: true,
      sourceQualityStatus: 'READY',
    });

    const analysis = reconstructCaseAnalysis([sourceDoc]);
    const doc = createEmptyDocument({
      id: 'test-doc-parties',
      title: 'Contestación de Demanda',
      documentType: 'contestacion_demanda_laboral',
      documentTypeLabel: 'Contestación de Demanda Laboral',
      matter: 'laboral',
      sections: [],
    });

    // Pipeline assigns parties
    doc.parties = {
      actor: analysis.parties.actor,
      demandado: analysis.parties.demandado,
      autoridadResponsable: analysis.parties.autoridadResponsable,
      quejoso: analysis.parties.quejoso,
      terceroInteresado: analysis.parties.terceroInteresado,
    };
    doc.caseAnalysis = analysis;

    const roles = resolveContestacionRoles(doc, analysis);
    expect(roles.contesta).toContain('INSTITUCIÓN PÚBLICA DE PRUEBA');
    expect(roles.contraparte).toContain('PERSONA FICTICIA PRUEBA');
    expect(roles.autoridad).toContain('TRIBUNAL DE ARBITRAJE Y ESCALAFÓN');
    expect(roles.expediente).toBe('[DATO PENDIENTE DE EXPEDIENTE: Número de expediente]');

    const sections = buildContestacionSkeleton(doc, analysis, undefined, 'contestacion_demanda_laboral');

    const proemio = sections.find((s) => s.id === 'sec-con-proemio');
    const comparecencia = sections.find((s) => s.id === 'sec-con-comparecencia');
    const objeto = sections.find((s) => s.id === 'sec-con-objeto');
    const petitorios = sections.find((s) => s.id === 'sec-con-petitorios');
    const firma = sections.find((s) => s.id === 'sec-con-firma');

    expect(proemio).toBeDefined();
    expect(comparecencia).toBeDefined();
    expect(objeto).toBeDefined();
    expect(petitorios).toBeDefined();
    expect(firma).toBeDefined();

    const proemioText = proemio!.content[0].text;
    expect(proemioText).not.toContain('[DATO PENDIENTE DE EXPEDIENTE: Autoridad competente]');
    expect(proemioText).toContain('TRIBUNAL DE ARBITRAJE Y ESCALAFÓN');
    expect(proemioText).toContain('[DATO PENDIENTE DE EXPEDIENTE: Número de expediente]');

    const comparecenciaText = comparecencia!.content[0].text;
    expect(comparecenciaText).not.toContain('[DATO PENDIENTE DE EXPEDIENTE: Nombre de la parte demandada]');
    expect(comparecenciaText).not.toContain('[DATO PENDIENTE DE EXPEDIENTE: Nombre del trabajador actor]');
    expect(comparecenciaText).toContain('INSTITUCIÓN PÚBLICA DE PRUEBA');
    expect(comparecenciaText).toContain('PERSONA FICTICIA PRUEBA');
    expect(comparecenciaText).toContain('[DATO PENDIENTE DE EXPEDIENTE: Representante autorizado]');
    expect(comparecenciaText).toContain('[DATO PENDIENTE DE EXPEDIENTE: Acreditación de personalidad]');
    expect(comparecenciaText).toContain('[DATO PENDIENTE DE EXPEDIENTE: Domicilio procesal de la demandada]');
    expect(comparecenciaText).not.toContain('personalidad que se tiene debidamente acreditada');
    expect(comparecenciaText).not.toContain('domicilio procesal el que consta en el expediente');

    const firmaText = firma!.content[0].text;
    expect(firmaText).toContain('INSTITUCIÓN PÚBLICA DE PRUEBA');
    expect(firmaText).not.toContain('[DATO PENDIENTE DE EXPEDIENTE');
  });

  it('formal blocks are admitted into document assembly without UNRESOLVED_BLOCK_EXCLUDED', () => {
    const sourceDoc = createSourceDocument({
      id: 'test-demand-parties',
      filename: 'demanda.docx',
      name: 'demanda.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extractedText: SAMPLE_DEMAND_TEXT,
      sourceValidated: true,
      sourceQualityStatus: 'READY',
    });

    const analysis = reconstructCaseAnalysis([sourceDoc]);
    const doc = createEmptyDocument({
      id: 'test-doc-assembly',
      title: 'Contestación de Demanda',
      documentType: 'contestacion_demanda_laboral',
      documentTypeLabel: 'Contestación de Demanda Laboral',
      matter: 'laboral',
      sections: [],
    });

    doc.parties = {
      actor: analysis.parties.actor,
      demandado: analysis.parties.demandado,
      autoridadResponsable: analysis.parties.autoridadResponsable,
    };
    doc.caseAnalysis = analysis;

    const sections = buildContestacionSkeleton(doc, analysis, undefined, 'contestacion_demanda_laboral');
    doc.sections = sections;

    sections.find((section) => section.id === 'sec-con-objeto')!.content[0]!.text +=
      '\nALCANCE DE LA POSTURA: [REQUIERE INSTRUCCIÓN DEL ABOGADO: alcance de la contestación].';
    expect(validateForExport(doc).errors.join('\n')).toContain('UNRESOLVED_FACTUAL_DEPENDENCY');

    const documentPlan = {
      planSource: 'CANONICAL_GENERATED' as const,
      templateId: doc.documentType,
      sections,
    };

    const assembly = assembleLegalDraft({
      document: doc,
      documentPlan,
      candidateSections: sections,
      candidateBlocks: sections.map((s) => ({
        sectionId: s.id,
        block: s.content[0],
      })),
      generationTasks: [],
    });

    const assembledSectionIds = assembly.sections.map((s) => s.sectionId);
    expect(assembledSectionIds).toContain('sec-con-proemio');
    expect(assembledSectionIds).toContain('sec-con-comparecencia');
    expect(assembledSectionIds).toContain('sec-con-objeto');
    expect(assembledSectionIds).toContain('sec-con-petitorios');
    expect(assembledSectionIds).toContain('sec-con-firma');

    for (const formalId of ['sec-con-proemio', 'sec-con-comparecencia', 'sec-con-objeto']) {
      expect(assembly.sections.find((section) => section.sectionId === formalId)?.blocks.length).toBeGreaterThan(0);
    }

    // A secondary formal field requires review, but must not erase its section.
    const unresolvedFindings = assembly.findings.filter(
      (f) => (f.code === 'UNRESOLVED_BLOCK_EXCLUDED' || (f as any).ruleId === 'UNRESOLVED_BLOCK_EXCLUDED') &&
        ['sec-con-proemio', 'sec-con-comparecencia', 'sec-con-objeto', 'sec-con-petitorios', 'sec-con-firma'].some((id) => f.sectionIds?.includes(id))
    );
    expect(unresolvedFindings).toHaveLength(0);

    const formalReviewFindings = assembly.findings.filter((finding) => finding.code === 'FORMAL_BLOCK_RETAINED_FOR_REVIEW');
    for (const formalId of ['sec-con-proemio', 'sec-con-comparecencia', 'sec-con-objeto']) {
      expect(formalReviewFindings.filter((finding) => finding.sectionIds?.includes(formalId))).toHaveLength(1);
    }

    // Verify all formal sections have admitted blocks (not dropped)
    for (const formalId of ['sec-con-proemio', 'sec-con-comparecencia', 'sec-con-objeto', 'sec-con-petitorios', 'sec-con-firma']) {
      const sec = assembly.sections.find((s) => s.sectionId === formalId);
      expect(sec, `Section ${formalId} must exist`).toBeDefined();
      expect(sec!.blocks.length, `Section ${formalId} must have admitted blocks`).toBeGreaterThan(0);
    }
  });
});
