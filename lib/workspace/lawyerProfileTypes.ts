export interface LawyerProfile {
  lawyerId: string;
  lawyerName: string;
  firmName?: string;
  preferredTone: 'formal_academico' | 'combativo_tecnico' | 'directo_conciso' | 'jurisprudencial';
  preferredStructure: string[];
  preferredSectionOrdering: string[];
  recurringFormulas: string[];
  openingPatterns: string[];
  closingPatterns: string[];
  argumentPatterns: string[];
  citationStyle: 'completo_con_registro' | 'sintetico' | 'pie_de_pagina' | 'transcripcion_marcada';
  legalTerminology: string[];
  preferredDefenses: string[];
  preferredWayToContestFacts: string[];
  preferredWayToContestBenefits: string[];
  preferredWayToAttackEvidence: string[];
  preferredWayToDevelopConstitutionalArguments: string[];
  preferredWayToWritePetition: string[];
  averageSectionLength: 'breve' | 'medio' | 'extenso';
  preferredDocumentLength: 'conciso' | 'estandar' | 'extenso_exhaustivo';
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_LAWYER_PROFILE: LawyerProfile = {
  lawyerId: 'lawyer-default',
  lawyerName: 'Abogado Titular',
  firmName: 'Despacho Jurídico Radar',
  preferredTone: 'combativo_tecnico',
  preferredStructure: ['ENCABEZADO', 'PROEMIO', 'ANTECEDENTES', 'HECHOS', 'AGRAVIOS', 'PRUEBAS', 'PETITORIOS', 'FIRMA'],
  preferredSectionOrdering: ['header', 'identity', 'background', 'facts', 'legal_grounds', 'argument', 'evidence', 'petition', 'closing', 'signature'],
  recurringFormulas: [
    'Comparezco respetuosamente para exponer:',
    'Causa agravio a esta parte la resolución recurrida, toda vez que...',
    'De las constancias que integran el presente expediente se advierte...',
    'Por lo anteriormente expuesto y fundado, a esa H. Autoridad atentamente solicito:'
  ],
  openingPatterns: ['Con el debido respeto comparezco para manifestar:', 'Por propio derecho y en representación de...'],
  closingPatterns: ['PROTESTO LO NECESARIO.', 'Lugar y fecha: En la fecha de su presentación.'],
  argumentPatterns: [
    'PRIMERO. Violación al debido proceso y tutela judicial efectiva.',
    'SEGUNDO. Indebida valoración probatoria e incongruencia del laudo/sentencia.',
    'TERCERO. Inaplicación de la jurisprudencia aplicable.'
  ],
  citationStyle: 'completo_con_registro',
  legalTerminology: ['laudo impugnado', 'ejecutoria de amparo', 'suplencia de la queja', 'principio de exhaustividad', 'defensa en juicio'],
  preferredDefenses: ['Falta de acción y derecho', 'Prescripción', 'Oscuridad de la demanda', 'Cosa juzgada'],
  preferredWayToContestFacts: ['El hecho que se contesta es falso toda vez que...', 'Se niega lisa y llanamente por no corresponder a la realidad...'],
  preferredWayToContestBenefits: ['Es procedente la absolución del pago reclamado por...', 'La prestación resulta improcedente toda vez que...'],
  preferredWayToAttackEvidence: ['Se objeta en cuanto a su alcance y valor probatorio...', 'La documental exhibida no acredita la pretensión...'],
  preferredWayToDevelopConstitutionalArguments: ['De conformidad con los artículos 14 y 17 de la Constitución Federal...'],
  preferredWayToWritePetition: ['PRIMERO. Tenerme por presentado...', 'SEGUNDO. Declarar fundados los agravios...'],
  averageSectionLength: 'extenso',
  preferredDocumentLength: 'extenso_exhaustivo'
};
