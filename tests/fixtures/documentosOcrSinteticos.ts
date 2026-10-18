/**
 * Documentos SINTÉTICOS no vistos antes, con defectos típicos de escaneo/OCR:
 * saltos de línea rotos, mayúsculas, abreviaturas («H.», «C.», «Lic.», «Mtro.»),
 * guiones de separación y fragmentos tipo «ESTE H.». Nombres, expedientes y
 * juzgados son inventados.
 */

export interface OcrFixture {
  id: string;
  text: string;
  expected: {
    matter: string;
    actor?: string;
    demandado?: string;
    /** Nombres que NUNCA deben aparecer como actor/demandado. */
    notParties: string[];
    court?: RegExp;
  };
}

/** Demanda civil: el juez es el destinatario (C. JUEZ…), no una parte. */
export const DEMANDA_CIVIL_OCR: OcrFixture = {
  id: 'demanda-civil-ocr',
  text: [
    'C. JUEZ  CUARTO  DE  LO  CIVIL  DEL',
    'PRIMER  PARTIDO  JUDICIAL  EN  EL  ESTADO',
    'DE  JALISCO.',
    'P R E S E N T E.',
    '',
    'LIC. ORLANDO MEDINA SAAVEDRA, en mi carácter de apoderado legal de',
    'CONSTRUCTORA LOMA ALTA, S.A. DE C.V., personalidad que acredito con el',
    'testimonio notarial que anexo, señalando domicilio para oír y recibir',
    'notificaciones en la calle Imaginaria 45, Colonia Centro, ante ESTE H.',
    'JUZGADO, con el debido respeto comparezco y expongo:',
    '',
    'Que por medio del presente escrito vengo a demandar en la vía ordinaria civil a',
    'DISTRIBUIDORA PINARES DEL SUR, S.A. DE C.V., por el cumplimiento del contrato de',
    'compraventa de fecha 14 de febrero de 2024 y el pago de daños y perjuicios.',
    '',
    'PRESTACIONES',
    'A) El cumplimiento forzoso del contrato de compraventa.',
    'B) El pago de la pena convencional pactada.',
    '',
    'HECHOS',
    '1. El 14 de febrero de 2024 las partes celebraron contrato de compraventa.',
    '2. El trabajador de la bodega recibió la mercancía sin objeción alguna.',
    '3. La demandada no entregó el total pactado.',
    '',
    'DERECHO',
    'Son aplicables los artículos 1793 y 2248 del Código Civil del Estado de Jalisco.',
    'PUNTOS PETITORIOS',
    'PRIMERO. Tenerme por presentado demandando en la vía ordinaria civil.',
    'PROTESTO LO NECESARIO',
    'Guadalajara, Jalisco, a 3 de marzo de 2025.',
  ].join('\n'),
  expected: {
    matter: 'CIVIL',
    actor: 'CONSTRUCTORA LOMA ALTA',
    demandado: 'DISTRIBUIDORA PINARES DEL SUR',
    notParties: ['ESTE H.', 'JUEZ', 'JUZGADO', 'ORLANDO MEDINA'],
    court: /cuarto.*civil/i,
  },
};

/** Auto familiar con juez, secretaria y autorizado: ninguno es parte. */
export const AUTO_FAMILIAR_OCR: OcrFixture = {
  id: 'auto-familiar-ocr',
  text: [
    'JUZGADO  SEGUNDO  DE  LO  FAMILIAR',
    'DEL  PRIMER  PARTIDO  JUDICIAL',
    'EXPEDIENTE: 880/2025',
    'JUICIO: ALIMENTOS',
    'ACTOR: CAMILA REGINA TORRES BELMONTE',
    'DEMANDADO: ISMAEL OSVALDO CAMPOS FERRER',
    '',
    'Guadalajara, Jalisco, a cinco de julio de dos mil veinticinco.',
    '',
    'Visto el escrito del Lic. TOMÁS ARELLANO PRIETO, autorizado',
    'del demandado, se tiene por presentado y SE DESECHA el incidente por improce-',
    'dente. Notifíquese. Así lo acordó y firma la JUEZA LIC. PATRICIA VEGA LOZANO,',
    'ante la SECRETARIA DE ACUERDOS LIC. NORMA ELIZONDO PAREDES, quien autoriza y da fe.',
  ].join('\n'),
  expected: {
    matter: 'FAMILIAR',
    actor: 'CAMILA REGINA TORRES BELMONTE',
    demandado: 'ISMAEL OSVALDO CAMPOS FERRER',
    notParties: ['PATRICIA VEGA', 'NORMA ELIZONDO', 'TOMÁS ARELLANO', 'JUEZA', 'SECRETARIA', 'ESTE H.'],
    court: /segundo.*familiar/i,
  },
};

/** Contestación de un apoderado: quien comparece NO es la actora; el juez tampoco. */
export const CONTESTACION_CIVIL_OCR: OcrFixture = {
  id: 'contestacion-civil-ocr',
  text: [
    'EXPEDIENTE 1021/2025',
    'C. JUEZ  SEXTO  DE  LO  CIVIL',
    'P R E S E N T E.',
    '',
    'MTRO. HUGO ANTONIO RIVADENEIRA, apoderado de DISTRIBUIDORA PINARES DEL SUR,',
    'S.A. DE C.V., parte demandada en el juicio ordinario civil promovido por CONSTRUCTORA',
    'LOMA ALTA, S.A. DE C.V., ante ESTE H. JUZGADO comparezco y expongo:',
    '',
    'Que en tiempo y forma vengo a dar contestación a la demanda instaurada en contra de mi',
    'representada.',
    'CONTESTACIÓN A LOS HECHOS',
    '1. Se niega por no ser un hecho propio.',
  ].join('\n'),
  expected: {
    matter: 'CIVIL',
    actor: 'CONSTRUCTORA LOMA ALTA',
    demandado: 'DISTRIBUIDORA PINARES DEL SUR',
    notParties: ['ESTE H.', 'HUGO ANTONIO', 'JUEZ SEXTO'],
  },
};

/** Demanda laboral genuina: el vocabulario laboral SÍ corresponde. */
export const DEMANDA_LABORAL_OCR: OcrFixture = {
  id: 'demanda-laboral-ocr',
  text: [
    'JUICIO  ORDINARIO  LABORAL',
    'C. JUEZ  LABORAL  DEL  PRIMER  PARTIDO  JUDICIAL',
    'P R E S E N T E.',
    '',
    'ROSARIO ELENA MUÑOZ ALCÁNTAR, por mi propio derecho, ante ESTE H. TRIBUNAL comparezco y expongo:',
    'Que vengo a demandar a SERVICIOS INTEGRALES DEL OCCIDENTE, S.A. DE C.V., por despido injustificado.',
    'PRESTACIONES',
    'A) La reinstalación en el puesto de trabajador administrativo.',
    'B) El pago de salarios vencidos y prestaciones de la Ley Federal del Trabajo.',
    'HECHOS',
    '1. Ingresé a laborar para la demandada el 1 de enero de 2020 con contrato individual de trabajo.',
    '2. El 15 de junio de 2025 fui despedida sin causa justificada.',
    'DERECHO',
    'Ley Federal del Trabajo, artículos 47 y 48.',
    'PUNTOS PETITORIOS',
    'PRIMERO. Tenerme por presentada demandando.',
  ].join('\n'),
  expected: {
    matter: 'LABORAL',
    actor: 'ROSARIO ELENA MUÑOZ ALCÁNTAR',
    demandado: 'SERVICIOS INTEGRALES DEL OCCIDENTE',
    notParties: ['ESTE H.', 'JUEZ LABORAL'],
  },
};

export const OCR_FIXTURES: readonly OcrFixture[] = [DEMANDA_CIVIL_OCR, AUTO_FAMILIAR_OCR, CONTESTACION_CIVIL_OCR, DEMANDA_LABORAL_OCR];
