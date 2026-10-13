import { createSourceDocument } from '@/lib/legal-engine/context';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

/**
 * Documentos jurídicos SINTÉTICOS para probar la identificación documental.
 * Nombres, domicilios y expedientes son inventados; no provienen de expedientes reales.
 * Reproducen las trampas típicas: escrito dirigido a "C. JUEZ…", referencias
 * "ESTE H. JUZGADO", palabras sueltas de otra materia ("junta", "patrón").
 */

export function sourceFromText(text: string, id: string): UploadedSourceDocument {
  return createSourceDocument({
    id,
    filename: `${id}.pdf`,
    name: `${id}.pdf`,
    type: 'pdf',
    fileUrl: `blob:${id}`,
    extractedText: text,
    pages: [{ page: 1, text, chars: text.length }],
    sourceValidated: true,
    fileSizeBytes: 2048,
  } as any);
}

/** Demanda civil dirigida a un juez civil, con vocabulario incidental de otras materias. */
export const DEMANDA_CIVIL_ARRENDAMIENTO = [
  'C. JUEZ TERCERO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL',
  'DEL ESTADO DE JALISCO.',
  'P R E S E N T E.',
  '',
  'ROSALBA QUINTERO MÉNDEZ, mexicana, mayor de edad, por mi propio derecho, señalando como domicilio para oír y recibir notificaciones el ubicado en la calle Ficticia número 100, ante ESTE H. JUZGADO, con el debido respeto comparezco y expongo:',
  'Que por medio del presente escrito vengo a demandar en la vía ordinaria civil a INMOBILIARIA LOS FRESNOS, S.A. DE C.V., con domicilio en Avenida Inventada 200, por el pago y cumplimiento de las siguientes:',
  '',
  'PRESTACIONES',
  'A) La rescisión del contrato de arrendamiento celebrado el 3 de marzo de 2024.',
  'B) El pago de daños y perjuicios.',
  '',
  'HECHOS',
  '1. El 3 de marzo de 2024 celebré con la demandada un contrato de arrendamiento sobre el local comercial número 4.',
  '2. En la junta de condóminos del 10 de abril de 2024 se informó que el inmueble carecía de licencia.',
  '3. La demandada dejó de cumplir el patrón de mantenimiento pactado en la cláusula quinta.',
  '',
  'DERECHO',
  'Son aplicables los artículos 1793 y 2412 del Código Civil del Estado de Jalisco y 267 del Código de Procedimientos Civiles del Estado de Jalisco.',
  '',
  'PUNTOS PETITORIOS',
  'PRIMERO. Tenerme por presentada demandando en la vía ordinaria civil.',
  '',
  'PROTESTO LO NECESARIO',
  'Guadalajara, Jalisco, a 2 de mayo de 2025.',
  '',
  'ROSALBA QUINTERO MÉNDEZ',
].join('\n');

/** Contestación del demandado: quien comparece NO es la parte actora. */
export const CONTESTACION_CIVIL_APODERADO = [
  'C. JUEZ SEGUNDO DE LO CIVIL',
  'P R E S E N T E.',
  '',
  'EXPEDIENTE: 455/2025',
  '',
  'ARMANDO VELA RÍOS, en mi carácter de apoderado legal de COMERCIALIZADORA DEL BAJÍO, S.A. DE C.V., parte demandada en el juicio ordinario civil promovido en su contra, ante ESTE H. JUZGADO comparezco para dar contestación a la demanda instaurada en contra de mi representada.',
  '',
  'CONTESTACIÓN A LOS HECHOS',
  '1. El hecho uno es falso.',
  '',
  'Fundan esta contestación los artículos del Código de Procedimientos Civiles.',
].join('\n');

/** Demanda laboral ante tribunal laboral. */
export const DEMANDA_LABORAL_TRIBUNAL = [
  'TRIBUNAL LABORAL FEDERAL DE ASUNTOS INDIVIDUALES',
  'EN EL ESTADO DE NUEVO LEÓN',
  'P R E S E N T E.',
  '',
  'JOAQUÍN ESTRADA PALMA, mexicano, mayor de edad, por mi propio derecho, ante ESTE H. TRIBUNAL comparezco y expongo:',
  'Que vengo a demandar a TRANSPORTES DEL NORTE ÁGIL, S.A. DE C.V., con domicilio en Calle Sintética 9, las siguientes prestaciones:',
  'A) La reinstalación en el puesto de chofer.',
  'B) El pago de salarios caídos, aguinaldo y prima vacacional.',
  '',
  'HECHOS',
  '1. La relación laboral inició el 5 de enero de 2020; el patrón me despidió el 30 de junio de 2025.',
  '',
  'DERECHO: artículos 48 y 50 de la Ley Federal del Trabajo.',
].join('\n');

/** Demanda de nulidad (fotoinfracción): la autoridad administrativa SÍ es parte demandada. */
export const DEMANDA_NULIDAD_FOTOINFRACCION = [
  'H. TRIBUNAL DE JUSTICIA ADMINISTRATIVA DEL ESTADO DE JALISCO',
  'P R E S E N T E.',
  '',
  'LUCÍA ARMENTA SOLÍS, mexicana, mayor de edad, por mi propio derecho, ante ESTE H. TRIBUNAL comparezco y expongo:',
  'Que vengo a demandar en contra de la SECRETARÍA DE TRANSPORTE DEL ESTADO DE JALISCO, con domicilio conocido, la nulidad de la cédula de fotoinfracción folio 000-SINT.',
  '',
  'ACTO IMPUGNADO: la multa impuesta mediante la cédula de fotoinfracción.',
  'Es aplicable la Ley de Justicia Administrativa del Estado de Jalisco.',
].join('\n');

/** Texto con una sola palabra de otra materia y sin foro: no hay base para decidir la materia. */
export const ESCRITO_SIN_SENALES = [
  'ESCRITO LIBRE',
  'Se informa que en la junta celebrada se trataron asuntos varios.',
].join('\n');

/** Demanda de amparo directo de una parte que CITA la sentencia reclamada (no es una resolución). */
export const DEMANDA_AMPARO_CITA_SENTENCIA = [
  'C. MAGISTRADOS DEL TRIBUNAL COLEGIADO EN MATERIA CIVIL DEL TERCER CIRCUITO',
  'POR CONDUCTO DE LA AUTORIDAD RESPONSABLE',
  'P R E S E N T E',
  '',
  'HUGO LARA MEZA, mexicano, por mi propio derecho, ante Ustedes comparezco y expongo:',
  'Que vengo a solicitar el amparo y protección de la Justicia Federal en contra de la sentencia definitiva dictada por la Sala, en la que el Magistrado ponente resolvió, en sus considerandos y resultandos, confirmar la condena. VISTO lo anterior la Sala resuelve...',
  'CONCEPTOS DE VIOLACIÓN',
  'PRIMERO. La sentencia viola el artículo 14 constitucional.',
].join('\n');

/** Promoción incidental de una parte que cita la sentencia del juicio. */
export const INCIDENTE_LIQUIDACION_PARTE = [
  'C. JUEZ QUINTO DE LO CIVIL',
  'P R E S E N T E',
  '',
  'EXPEDIENTE: 77/2024',
  '',
  'NORMA BELTRÁN ROJAS, en mi carácter de parte actora, ante ESTE H. JUZGADO comparezco y expongo:',
  'Que vengo a promover INCIDENTE DE LIQUIDACIÓN DE SENTENCIA, toda vez que la sentencia definitiva que resolvió el juicio, en su considerando cuarto, condenó al pago de intereses. VISTO el estado de los autos, el Juez resolvió.',
  'HECHOS',
  '1. La sentencia causó ejecutoria.',
].join('\n');
