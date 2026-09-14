import type { PipelineInput } from '@/lib/legal-engine/pipeline';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

export function syntheticContestacionInput(): PipelineInput {
  const facts: CaseAnalysis['facts'] = ['La notificación se practicó en el domicilio señalado.', 'La parte actora recibió la comunicación procesal.', 'El pago documentado fue realizado en la fecha acreditada.', 'La autoridad incorporó la constancia correspondiente al expediente.'].map((text, index) => ({
    id: `synthetic-fact-${index + 1}`,
    number: String(index + 1),
    text,
    sourceFact: text,
    confidence: 1,
    position: index === 0 ? 'ADMIT' : index === 1 ? 'DENY' : 'PARTIAL',
    lawyerPosition: index === 0 ? 'ADMIT' : index === 1 ? 'DENY' : 'PARTIAL',
    lawyerObservation: `Postura confirmada para el hecho ${index + 1}.`,
    response: `Respuesta confirmada para el hecho ${index + 1}.`,
    support: [`synthetic-evidence-${(index % 3) + 1}`],
    relatedEvidenceIds: [`synthetic-evidence-${(index % 3) + 1}`],
    provenance: 'LAWYER_CONFIRMED',
  }));
  const claimResponses: NonNullable<CaseAnalysis['claimResponses']> = [
    { id: 'synthetic-claim-1', number: '1', text: 'El pago de la prestación principal.', position: 'OPPOSE', lawyerPosition: 'OPPOSE', lawyerObservation: 'Se controvierte por falta de acreditación suficiente.', support: ['synthetic-evidence-1'] },
    { id: 'synthetic-claim-2', number: '2', text: 'El reconocimiento de los accesorios reclamados.', position: 'PARTIAL', lawyerPosition: 'PARTIAL', lawyerObservation: 'Se admite únicamente lo que resulte demostrado.', support: ['synthetic-evidence-2'] },
  ];
  const evidence = [
    { id: 'synthetic-evidence-1', title: 'Constancia de notificación', type: 'documental', description: 'Documento sintético de notificación.', confirmed: true },
    { id: 'synthetic-evidence-2', title: 'Comprobante de pago', type: 'documental', description: 'Documento sintético de pago.', confirmed: true },
    { id: 'synthetic-evidence-3', title: 'Registro de expediente', type: 'documental', description: 'Documento sintético de registro.', confirmed: true },
  ];
  const analysis: CaseAnalysis = {
    parties: { actor: 'PARTE ACTORA SINTÉTICA', demandado: 'PARTE DEMANDADA SINTÉTICA' },
    authorities: [],
    caseNumbers: { principal: 'SYN-001/2026' },
    proceduralTimeline: [],
    challengedActs: [],
    claims: claimResponses.map((claim) => claim.text),
    claimResponses,
    arguments: [],
    evidence: evidence.map(({ id, title, type, description, confirmed }) => ({ id, title, type, description, confirmed })),
    facts,
    rulings: [],
    citations: [],
    proceduralPosture: {
      proceduralWrit: 'contestacion_demanda',
      isExtraordinary: false,
      constitutionalIssues: [],
      legalityIssues: [],
      exceptionalInterest: null,
    },
    caseTheory: { factualTheory: '', legalTheory: '', constitutionalTheory: '', proceduralTheory: '', opposingTheory: '', vulnerabilities: [], strengths: [] },
    argumentAxes: [],
    missingData: [],
    unsupportedClaims: [],
    legalIssues: [],
  };

  return {
    selectedDocumentType: 'contestacion_demanda_civil',
    documentTypeLabel: 'Contestación de demanda civil',
    matter: 'civil',
    jurisdiction: 'federal',
    userInstruction: 'Preparar contestación sintética para verificar trazabilidad.',
    flow: 'NEW_WRITING',
    sourceDocuments: [],
    workflow: {
      flow: 'NEW_WRITING',
      analysis,
      selection: { mode: 'automatic' },
      sourceDocuments: [],
      updatedAt: '2026-09-07T00:00:00.000Z',
    },
  };
}
