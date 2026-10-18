import { documentFromPages } from './actosProcesalesSinteticos';

/**
 * Sentencia de amparo directo SINTÉTICA, en versión pública, que reproduce el DISEÑO de una ejecutoria real
 * (todo nombre, número y fecha es inventado):
 *  - encabezado con etiquetas sueltas («AMPARO DIRECTO: …», «QUEJOSO:» con el valor testado en la línea siguiente);
 *  - el órgano que dicta la ejecutoria aparece solo en prosa («Acuerdo del Segundo Tribunal Colegiado… correspondiente a la sesión…»);
 *  - la autoridad responsable aparece en una cita transcrita de la demanda de amparo;
 *  - el tercero interesado se menciona sin nombre y el Ayuntamiento demandado, con el nombre testado.
 */
export const ISSUING_COURT = 'Segundo Tribunal Colegiado en Materia de Trabajo del Tercer Circuito';
export const SOURCE_AUTHORITY = 'H. PLENO DEL TRIBUNAL DE ARBITRAJE Y ESCALAFÓN DEL ESTADO DE JALISCO';
export const MASKED_NAME = '***** ******* ********* *****';

export const SENTENCIA_DISENO_REAL_PAGES = [
  [
    '- 1 -',
    'AMPARO DIRECTO: 999/2099',
    'QUEJOSO:',
    MASKED_NAME,
    'MAGISTRADA PONENTE: MARTA SINTÉTICA OROZCO',
    'SECRETARIO: ELÍAS SINTÉTICO PRADO',
    'Zapopan, Jalisco. Acuerdo del Segundo Tribunal Colegiado en Materia de Trabajo del Tercer Circuito, correspondiente a la sesión de quince de abril de dos mil veintiséis.',
    '(1) V I S T O, para resolver el juicio de amparo directo 999/2099.',
    '(2) R E S U L T A N D O:',
    'PRIMERO. Presentación de la demanda. Mediante escrito presentado el dos de mayo de dos mil veinticuatro, la parte quejosa solicitó el amparo contra el laudo de diez de abril de dos mil veinticuatro.',
    '(3) En la demanda de amparo se señaló lo siguiente:',
    'AUTORIDADES RESPONSABLES. H. PLENO DEL TRIBUNAL DE ARBITRAJE Y ESCALAFÓN DEL ESTADO DE JALISCO, SU PRESIDENTE Y SU SECRETARIO GENERAL, COMO AUTORIDADES ORDENADORAS.',
  ].join('\n'),
  [
    '- 2 -',
    '(4) El tercero interesado no presentó alegatos ni promovió amparo adhesivo.',
    '(5) En el juicio de origen, el Ayuntamiento demandado ***** ******* ******** sostuvo que el despido fue justificado.',
    '(6) Es infundado el concepto de violación, porque la responsable sí analizó la prueba testimonial y la estimó insuficiente.',
  ].join('\n'),
  [
    '- 3 -',
    'Por lo expuesto y fundado, se resuelve:',
    'ÚNICO. La Justicia de la Unión NO AMPARA NI PROTEGE a la parte quejosa.',
    'Así lo resolvió el Tribunal Colegiado, por unanimidad, siendo ponente la Magistrada MARTA SINTÉTICA OROZCO.',
  ].join('\n'),
];

export const sentenciaDisenoReal = () => documentFromPages('pending-upload-1792000000000-0', SENTENCIA_DISENO_REAL_PAGES);
