import { documentFromPages } from './actosProcesalesSinteticos';

/**
 * Sentencia de amparo directo SINTÉTICA, en versión pública, con el formato exacto que entrega el extractor de PDF
 * en un expediente real: etiqueta y valor en renglones distintos, partes testadas («*****»), párrafos numerados
 * «(38)», marcas de página «- 22 -», sellos de firma electrónica partidos en varias líneas EN MEDIO de las frases y
 * volcados de bytes hexadecimales. Todo nombre, número y fecha es inventado.
 */
export const PONENTE = 'LUIS FICTICIO ÁVALOS';
export const SECRETARIO = 'AARÓN FICTICIO SILVA';
export const SECRETARIA = 'JOCELÍN FICTICIA VILLALOBOS';
export const PRESIDENTA = 'DULCE FICTICIA ARIAS';

/** Sello de firma electrónica tal como queda en el texto extraído (varias líneas, con tabuladores). */
export const selloPdf = (n: number) => [
  SECRETARIO.replace('Á', 'A'),
  `\t706a6620636a66330000000000000000000083f${n}`,
  '\t20/10/28 13:41:15',
  'PJF',
  '',
  '- Versión',
  '',
  'Pública',
].join('\n');

export const BYTES = 'b5 ac 60 8f 31 34 2c 3f 7a d6 63 16 89 d8 03 8b 4c 21 9e 77 10 c3 5d e8 a4 0b 6f 92 31 7e d0 55 18 c9 a2 3b';

export const SENTENCIA_VERSION_PUBLICA = [
  [
    '- 1 -', '\t', 'AMPARO DIRECTO:', '800/2024', 'QUEJOSO:', '***** ******* ********* *****',
    'MAGISTRADO PONENTE:', PONENTE, 'SECRETARIA:', SECRETARIA,
    'Zapopan, Jalisco. Acuerdo del Tribunal Colegiado en Materia de Trabajo del Tercer Circuito, correspondiente a la sesión de quince de abril de dos mil veintiséis.',
    '(1) V I S T O, para resolver el juicio de amparo directo 800/2024.',
    '(2) R E S U L T A N D O:',
    'PRIMERO. Presentación de la demanda. Mediante escrito presentado el dos de mayo de dos mil veinticuatro, la parte quejosa solicitó el amparo contra el laudo de diez de abril de dos mil veinticuatro, dictado por el Pleno del Tribunal de Arbitraje y Escalafón del Estado de Jalisco en el juicio laboral 120/2022.',
    '(3) El trabajador reclamó la reinstalación, el pago de salarios caídos y el de horas extras, por un despido que calificó de injustificado.',
  ].join('\n'),
  [
    '- 22 -',
    '(37) La parte quejosa sostiene que la responsable no valoró la prueba testimonial ofrecida para acreditar el despido.',
    '(38) Es infundado el concepto de violación, porque la responsable sí analizó la prueba testimonial y la estimó insuficiente frente a la',
    selloPdf(5),
    'documental de la demandada, conforme a los artículos 38, fracción I, y 39 de la Ley Orgánica del Poder Judicial de la Federación abrogada.',
    '(39) En cuanto a las horas extras, el laudo se apoyó en la jornada que consta en el contrato individual de trabajo.',
    '(40) Por lo expuesto, no existe violación a los derechos de la parte quejosa.',
  ].join('\n'),
  [
    '- 23 -',
    'Por lo expuesto y fundado, se resuelve:',
    'PRIMERO. La Justicia de la Unión no ampara ni protege a la parte quejosa, contra el laudo reclamado.',
    'SEGUNDO. Notifíquese.',
    `Así lo resolvió el Tribunal Colegiado, por unanimidad, siendo ponente el Magistrado ${PONENTE}, quien firma electrónicamente con el Secretario de Acuerdos ${SECRETARIO}.`,
    `MAGISTRADA PRESIDENTE: ${PRESIDENTA}`,
    `MAGISTRADO PONENTE: ${PONENTE}`,
    `EL SECRETARIO DE ACUERDOS: LICENCIADO ${SECRETARIO}`,
    selloPdf(6),
    BYTES,
    BYTES,
    BYTES,
  ].join('\n'),
];

/** El id interno que asigna la interfaz al cargar un archivo («pending-upload-…») nunca debe llegar a un escrito. */
export const sentenciaVersionPublica = () => documentFromPages('pending-upload-1791991502775-0', SENTENCIA_VERSION_PUBLICA);
