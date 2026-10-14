import { ACUERDO_TRAMITE, autoDesechaIncidente, CONTESTACION_SINTETICA, DEMANDA_FAMILIAR_SINTETICA, documentFromPages, SENTENCIA_DEFINITIVA } from './actosProcesalesSinteticos';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

/**
 * Matriz de documentos oficiales SINTÉTICOS (nombres, expedientes y órganos inventados) para probar que
 * Contestaciones y recursos orienta la actuación para cualquier tipo de documento.
 */
export const DEMANDA_CIVIL = [
  'DEMANDA EN LA VÍA ORDINARIA CIVIL',
  'C. JUEZ SEGUNDO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL',
  'ROBERTO ANAYA FICTICIO, por mi propio derecho, ante este H. Juzgado comparezco y expongo:',
  'Que vengo a demandar en la vía ordinaria civil a INMOBILIARIA SINTÉTICA, S.A. DE C.V. el cumplimiento del contrato de compraventa.',
  'PRESTACIONES',
  'A) El cumplimiento del contrato de compraventa de fecha 3 de marzo de 2024.',
  'B) El pago de daños y perjuicios.',
  'HECHOS',
  '1. El 3 de marzo de 2024 celebramos contrato de compraventa del inmueble.',
  '2. La demandada no entregó el inmueble en la fecha pactada.',
  'DERECHO. Son aplicables las disposiciones del Código Civil.',
  'PUNTOS PETITORIOS',
  'PRIMERO. Tenerme por presentado demandando.',
].join('\n');

export const DEMANDA_LABORAL = [
  'DEMANDA LABORAL',
  'C. JUEZ DEL TRIBUNAL LABORAL FICTICIO',
  'LUCÍA PÉREZ INVENTADA, por mi propio derecho, comparezco y expongo:',
  'Que vengo a demandar a COMERCIALIZADORA FICTICIA, S.A. DE C.V. por despido injustificado.',
  'PRESTACIONES',
  'A) La indemnización constitucional.',
  'B) Los salarios caídos.',
  'HECHOS',
  '1. Ingresé a laborar el 1 de enero de 2020 como trabajadora.',
  '2. El 15 de julio de 2025 fui despedida sin causa justificada.',
  'PUNTOS PETITORIOS',
  'PRIMERO. Tenerme por presentada demandando.',
].join('\n');

export const DEMANDA_MERCANTIL = [
  'DEMANDA EN LA VÍA EJECUTIVA MERCANTIL',
  'C. JUEZ PRIMERO DE LO MERCANTIL',
  'CRÉDITOS SINTÉTICOS, S.A. DE C.V., por conducto de su apoderado, comparezco y expongo:',
  'Que vengo a demandar en la vía ejecutiva mercantil a MARIO FICTICIO el pago de un pagaré.',
  'PRESTACIONES',
  'A) El pago de la suerte principal amparada en el pagaré.',
  'HECHOS',
  '1. El demandado suscribió un pagaré con vencimiento el 10 de enero de 2025, conforme al Código de Comercio.',
  'PUNTOS PETITORIOS',
  'PRIMERO. Despachar auto de exequendo.',
].join('\n');

export const ACUERDO_VISTA = [
  'JUZGADO SEGUNDO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL',
  'EXPEDIENTE: 321/2025',
  'Guadalajara, Jalisco, a cinco de septiembre de dos mil veinticinco.',
  'Visto el escrito de cuenta de la parte actora, se tiene por ofrecida la prueba pericial y con el mismo se da vista a la parte demandada para que dentro del término de tres días manifieste lo que a su derecho convenga.',
  'NOTIFÍQUESE. Así lo acordó y firma el Juez.',
].join('\n');

export const ACUERDO_REQUERIMIENTO = [
  'JUZGADO SEGUNDO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL',
  'EXPEDIENTE: 321/2025',
  'Guadalajara, Jalisco, a ocho de septiembre de dos mil veinticinco.',
  'Visto el estado de los autos, se requiere a la parte demandada para que dentro del término de cinco días exhiba el original del contrato, apercibida que de no hacerlo se le impondrá una multa.',
  'NOTIFÍQUESE. Así lo acordó y firma el Juez.',
].join('\n');

export const SENTENCIA_AMPARO_INDIRECTO = [
  'JUZGADO QUINTO DE DISTRITO EN MATERIA CIVIL FICTICIO',
  'JUICIO DE AMPARO INDIRECTO 555/2025',
  'QUEJOSO: ANDRÉS FICTICIO',
  'SENTENCIA',
  'VISTOS para resolver los autos del juicio de amparo indirecto promovido contra actos del Juez Segundo de lo Civil.',
  'RESULTANDO. Primero. Por escrito presentado se solicitó el amparo y protección de la Justicia Federal.',
  'CONSIDERANDO. Primero. Este Juzgado de Distrito es competente.',
  'R E S U E L V E:',
  'ÚNICO. La Justicia de la Unión no ampara ni protege al quejoso.',
  'NOTIFÍQUESE.',
].join('\n');

export const CONTESTACION_CON_RECONVENCION = [
  CONTESTACION_SINTETICA,
  'RECONVENCIÓN',
  'Asimismo, vengo a reconvenir a la actora el pago de una pensión compensatoria.',
].join('\n');

/** Prevención que menciona la «demanda»: la palabra no debe convertir el acuerdo en una demanda. */
export const ACUERDO_PREVENCION = [
  'JUZGADO PRIMERO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL',
  'EXPEDIENTE: 77/2025',
  'Guadalajara, Jalisco, a doce de septiembre de dos mil veinticinco.',
  'Visto el escrito inicial de demanda presentado por ROBERTO ANAYA FICTICIO, se previene a la parte actora para que dentro del término de cinco días aclare los hechos segundo y tercero, apercibida que de no hacerlo se desechará la demanda.',
  'NOTIFÍQUESE. Así lo acordó y firma el Juez.',
].join('\n');

export const SENTENCIA_AMPARO_DIRECTO = [
  'TERCER TRIBUNAL COLEGIADO EN MATERIA CIVIL DEL TERCER CIRCUITO FICTICIO',
  'AMPARO DIRECTO 800/2025',
  'QUEJOSA: INMOBILIARIA SINTÉTICA, S.A. DE C.V.',
  'EJECUTORIA',
  'VISTOS para resolver los autos del juicio de amparo directo promovido contra la sentencia de segunda instancia.',
  'RESULTANDO. Primero. Por escrito presentado se solicitó el amparo y protección de la Justicia Federal.',
  'CONSIDERANDO. Primero. Este Tribunal Colegiado es competente.',
  'R E S U E L V E:',
  'ÚNICO. La Justicia de la Unión no ampara ni protege a la quejosa.',
  'NOTIFÍQUESE.',
].join('\n');

export const DEMANDA_ALIMENTOS = [
  'DEMANDA DE ALIMENTOS',
  'C. JUEZ CUARTO DE LO FAMILIAR DEL PRIMER PARTIDO JUDICIAL',
  'MARTA FICTICIA RUIZ, por mi propio derecho y en representación de mi menor hijo, comparezco y expongo:',
  'Que vengo a demandar a JULIO INVENTADO SOTO el pago de una pensión alimenticia.',
  'PRESTACIONES',
  'A) El pago de una pensión alimenticia definitiva.',
  'HECHOS',
  '1. El demandado dejó de aportar para los alimentos de nuestro hijo desde enero de 2025.',
  'PUNTOS PETITORIOS',
  'PRIMERO. Fijar una pensión alimenticia provisional.',
].join('\n');

export const CONTESTACION_MERCANTIL_CON_RECONVENCION = [
  'CONTESTACIÓN DE LA DEMANDA',
  'C. JUEZ PRIMERO DE LO MERCANTIL',
  'MARIO FICTICIO, por mi propio derecho, comparezco y expongo:',
  'Que en tiempo y forma vengo a contestar la demanda en la vía ejecutiva mercantil instaurada en mi contra por CRÉDITOS SINTÉTICOS, S.A. DE C.V.',
  'CONTESTACIÓN A LOS HECHOS',
  '1. Es falso que haya suscrito el pagaré en los términos que se indican.',
  'RECONVENCIÓN',
  'Asimismo, vengo a reconvenir a la actora la nulidad del pagaré conforme al Código de Comercio.',
].join('\n');

/** Auto de un Juzgado de Distrito dentro del juicio de amparo: lo impugnable es por queja (o revisión), no apelación. */
export const AUTO_AMPARO_SUSPENSION = [
  'JUZGADO QUINTO DE DISTRITO EN MATERIA CIVIL FICTICIO',
  'JUICIO DE AMPARO INDIRECTO 555/2025',
  'QUEJOSO: ANDRÉS FICTICIO',
  'Guadalajara, Jalisco, a dos de octubre de dos mil veinticinco.',
  'Vista la demanda de amparo, con fundamento en las constancias, se niega la suspensión provisional solicitada por el quejoso respecto del acto reclamado.',
  'NOTIFÍQUESE. Así lo proveyó y firma el Juez Quinto de Distrito.',
].join('\n');

export const ACUERDO_MERCANTIL_REQUERIMIENTO = [
  'JUZGADO PRIMERO DE LO MERCANTIL DEL PRIMER PARTIDO JUDICIAL',
  'EXPEDIENTE: 901/2025',
  'Guadalajara, Jalisco, a quince de septiembre de dos mil veinticinco.',
  'Visto el estado de los autos del juicio ejecutivo mercantil, se requiere a la parte actora para que dentro del término de tres días exhiba el original del pagaré base de la acción, apercibida que de no hacerlo se le impondrá una multa.',
  'NOTIFÍQUESE. Así lo acordó y firma el Juez.',
].join('\n');

export const DOCUMENTO_AMBIGUO = [
  'Por medio del presente se hace constar la recepción de documentos sintéticos.',
  'Sin más por el momento, quedo a sus órdenes.',
].join('\n');

export interface OfficialDocumentCase {
  id: string;
  description: string;
  source: UploadedSourceDocument;
}

export const OFFICIAL_DOCUMENT_MATRIX: OfficialDocumentCase[] = [
  { id: 'demanda-civil', description: 'demanda civil', source: documentFromPages('demanda-civil', [DEMANDA_CIVIL]) },
  { id: 'demanda-divorcio', description: 'demanda familiar de divorcio', source: documentFromPages('demanda-divorcio', [DEMANDA_FAMILIAR_SINTETICA]) },
  { id: 'demanda-laboral', description: 'demanda laboral', source: documentFromPages('demanda-laboral', [DEMANDA_LABORAL]) },
  { id: 'demanda-mercantil', description: 'demanda mercantil', source: documentFromPages('demanda-mercantil', [DEMANDA_MERCANTIL]) },
  { id: 'sentencia-familiar', description: 'sentencia definitiva familiar', source: documentFromPages('sentencia-familiar', [SENTENCIA_DEFINITIVA]) },
  { id: 'auto-civil', description: 'auto que desecha incidente (civil)', source: documentFromPages('auto-civil', [autoDesechaIncidente('civil')]) },
  { id: 'auto-familiar', description: 'auto que desecha incidente (familiar)', source: documentFromPages('auto-familiar', [autoDesechaIncidente('familiar')]) },
  { id: 'auto-mercantil', description: 'auto que desecha incidente (mercantil)', source: documentFromPages('auto-mercantil', [autoDesechaIncidente('mercantil')]) },
  { id: 'acuerdo-tramite', description: 'acuerdo de trámite', source: documentFromPages('acuerdo-tramite', [ACUERDO_TRAMITE]) },
  { id: 'acuerdo-vista', description: 'acuerdo que da vista', source: documentFromPages('acuerdo-vista', [ACUERDO_VISTA]) },
  { id: 'acuerdo-requerimiento', description: 'acuerdo con requerimiento', source: documentFromPages('acuerdo-requerimiento', [ACUERDO_REQUERIMIENTO]) },
  { id: 'sentencia-amparo-indirecto', description: 'sentencia de amparo indirecto', source: documentFromPages('sentencia-amparo-indirecto', [SENTENCIA_AMPARO_INDIRECTO]) },
  { id: 'contestacion-reconvencion', description: 'contestación con reconvención', source: documentFromPages('contestacion-reconvencion', [CONTESTACION_CON_RECONVENCION]) },
  { id: 'expediente-multiacto', description: 'expediente: demanda + sentencia', source: documentFromPages('expediente-multiacto', [DEMANDA_FAMILIAR_SINTETICA, 'Constancia de notificación.', SENTENCIA_DEFINITIVA]) },
  { id: 'acuerdo-prevencion', description: 'prevención que menciona la demanda', source: documentFromPages('acuerdo-prevencion', [ACUERDO_PREVENCION]) },
  { id: 'sentencia-amparo-directo', description: 'ejecutoria de amparo directo', source: documentFromPages('sentencia-amparo-directo', [SENTENCIA_AMPARO_DIRECTO]) },
  { id: 'demanda-alimentos', description: 'demanda familiar de alimentos', source: documentFromPages('demanda-alimentos', [DEMANDA_ALIMENTOS]) },
  { id: 'contestacion-reconvencion-mercantil', description: 'contestación mercantil con reconvención', source: documentFromPages('contestacion-reconvencion-mercantil', [CONTESTACION_MERCANTIL_CON_RECONVENCION]) },
  { id: 'escaneado-paginas-breves', description: 'expediente con una hoja breve legible', source: documentFromPages('escaneado-paginas-breves', [DEMANDA_CIVIL, 'NOTIFÍQUESE.']) },
  { id: 'auto-amparo-suspension', description: 'auto en amparo indirecto (suspensión)', source: documentFromPages('auto-amparo-suspension', [AUTO_AMPARO_SUSPENSION]) },
  { id: 'acuerdo-mercantil-requerimiento', description: 'acuerdo mercantil con requerimiento', source: documentFromPages('acuerdo-mercantil-requerimiento', [ACUERDO_MERCANTIL_REQUERIMIENTO]) },
  { id: 'ambiguo', description: 'documento no clasificable', source: documentFromPages('ambiguo', [DOCUMENTO_AMBIGUO]) },
  { id: 'escaneado-parcial', description: 'PDF con páginas sin texto (escaneo)', source: documentFromPages('escaneado-parcial', [DEMANDA_CIVIL, '', '   ']) },
];
