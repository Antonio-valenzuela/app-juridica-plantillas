import { documentFromPages } from './actosProcesalesSinteticos';

/**
 * Expediente SINTÉTICO de segunda instancia: la sentencia apelada y el escrito de agravios del contrario.
 * Todos los nombres, expedientes, órganos, fechas y artículos son inventados.
 *
 * Quien apela es la parte ACTORA (Laura Mendoza Ficticia); la parte demandada (Constructora Los Olivos
 * Ficticia, S.A. de C.V.) es la parte apelada: es quien contesta los agravios.
 */
export const SENTENCIA_APELADA = [
  'JUZGADO QUINTO EN MATERIA CIVIL DEL PRIMER PARTIDO JUDICIAL',
  'SENTENCIA DEFINITIVA',
  'EXPEDIENTE: 5521/2024',
  'ACTORA: LAURA MENDOZA FICTICIA.',
  'DEMANDADA: CONSTRUCTORA LOS OLIVOS FICTICIA, S.A. DE C.V.',
  'ZAPOPAN, JALISCO A 24 DE AGOSTO DE 2026',
  'VISTOS los autos para dictar sentencia definitiva en el juicio ordinario civil sobre cumplimiento de contrato de compraventa.',
  'RESULTANDO. Primero. La actora demandó la entrega del inmueble y el pago de daños y perjuicios.',
  'RESULTANDO. Segundo. La demandada opuso la excepción de pago y exhibió el recibo de liquidación de fecha 12 de enero de 2024.',
  'CONSIDERANDO. Primero. Este juzgado es competente.',
  'CONSIDERANDO. Segundo. La actora no acreditó el incumplimiento alegado; la demandada probó el pago con el recibo de liquidación.',
  'CONSIDERANDO. Tercero. Los daños y perjuicios son accesorios y siguen la suerte de la acción principal.',
  'SE RESUELVE:',
  'PRIMERO. Se absuelve a la demandada de todas las prestaciones reclamadas.',
  'SEGUNDO. Notifíquese.',
].join('\n');

export const NOTIFICACION_SENTENCIA = [
  'CONSTANCIA DE NOTIFICACIÓN',
  'La sentencia definitiva fue notificada a la parte actora el 25 de agosto de 2026.',
].join('\n');

export const APELACION_CONTRARIA = [
  'RECURSO DE APELACIÓN',
  'C. JUEZ QUINTO EN MATERIA CIVIL DEL PRIMER PARTIDO JUDICIAL',
  'EXPEDIENTE: 5521/2024',
  'LAURA MENDOZA FICTICIA, por mi propio derecho, parte actora en el juicio citado, comparezco y expongo:',
  'Que vengo a interponer recurso de apelación contra la sentencia definitiva de fecha 24 de agosto de 2026, notificada el 25 de agosto de 2026.',
  'AGRAVIOS',
  'AGRAVIO PRIMERO. La sentencia no valoró el recibo de liquidación exhibido por la demandada, pues este fue objetado por la actora y no se perfeccionó su autenticidad.',
  'AGRAVIO SEGUNDO. La sentencia omitió analizar la prueba pericial en materia de grafoscopía ofrecida por la actora, lo que vulnera el principio de exhaustividad.',
  'AGRAVIO TERCERO. La sentencia condenó a la actora a pagar costas sin que se actualizara alguno de los supuestos legales para hacerlo.',
  'PUNTOS PETITORIOS',
  'PRIMERO. Tener por interpuesto el recurso de apelación.',
  'SEGUNDO. Revocar la sentencia recurrida.',
].join('\n');

/** Sentencia y apelación contraria en un solo PDF (como llega al abogado de la parte apelada). */
export const expedienteApelacion = () => documentFromPages('expediente-apelacion', [
  SENTENCIA_APELADA,
  NOTIFICACION_SENTENCIA,
  APELACION_CONTRARIA,
]);

/** Solo la sentencia: falta el escrito de agravios. */
export const soloSentenciaApelada = () => documentFromPages('solo-sentencia', [SENTENCIA_APELADA, NOTIFICACION_SENTENCIA]);
