import { createSourceDocument } from '@/lib/legal-engine/context';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

/** Actos procesales SINTÉTICOS (nombres, expedientes y juzgados inventados). */

export const DEMANDA_FAMILIAR_SINTETICA = [
  'DEMANDA DE DIVORCIO INCAUSADO',
  'C. JUEZ TERCERO DE LO FAMILIAR DEL PRIMER PARTIDO JUDICIAL',
  'MARTA ELENA SOLÍS RIVERO, por mi propio derecho, ante este H. Juzgado comparezco y expongo:',
  'Que vengo a demandar a JORGE ARTURO NAVARRETE DUEÑAS la disolución del vínculo matrimonial.',
  'PRESTACIONES',
  'A) La disolución del vínculo matrimonial.',
  'HECHOS',
  '1. Contrajimos matrimonio el 5 de mayo de 2015.',
  'PUNTOS PETITORIOS',
  'PRIMERO. Tenerme por presentada demandando.',
].join('\n');

export const CONTESTACION_SINTETICA = [
  'CONTESTACIÓN DE LA DEMANDA',
  'C. JUEZ TERCERO DE LO FAMILIAR DEL PRIMER PARTIDO JUDICIAL',
  'JORGE ARTURO NAVARRETE DUEÑAS, por mi propio derecho, comparezco y expongo:',
  'Que en tiempo y forma vengo a contestar la demanda instaurada en mi contra.',
  'CONTESTACIÓN A LOS HECHOS',
  '1. Es cierto.',
].join('\n');

export const SENTENCIA_DEFINITIVA = [
  'JUZGADO TERCERO DE LO FAMILIAR DEL PRIMER PARTIDO JUDICIAL',
  'SENTENCIA DEFINITIVA',
  'EXPEDIENTE: 1234/2025',
  'Guadalajara, Jalisco, a veinte de septiembre de dos mil veinticinco.',
  'VISTOS para resolver los autos del juicio de divorcio.',
  'RESULTANDO. Primero. Por escrito inicial la actora demandó el divorcio.',
  'CONSIDERANDO. Primero. Este juzgado es competente.',
  'SE RESUELVE:',
  'PRIMERO. Se declara disuelto el vínculo matrimonial.',
  'NOTIFÍQUESE. Así lo resolvió y firma la Jueza.',
].join('\n');

export const ACUERDO_TRAMITE = [
  'JUZGADO TERCERO DE LO FAMILIAR DEL PRIMER PARTIDO JUDICIAL',
  'EXPEDIENTE: 1234/2025',
  'Guadalajara, Jalisco, a diez de junio de dos mil veinticinco.',
  'Visto el escrito de cuenta, se tiene por presentado al demandado y agréguese a los autos para que surta sus efectos legales.',
  'NOTIFÍQUESE. Así lo acordó y firma la Jueza.',
].join('\n');

/** Auto que desecha un incidente; la materia cambia el foro y el vocabulario del juicio. */
export function autoDesechaIncidente(materia: 'civil' | 'familiar' | 'mercantil'): string {
  const foro = { civil: 'DE LO CIVIL', familiar: 'DE LO FAMILIAR', mercantil: 'DE LO MERCANTIL' }[materia];
  const juicio = {
    civil: 'JUICIO ORDINARIO CIVIL (CUMPLIMIENTO DE CONTRATO DE ARRENDAMIENTO)',
    familiar: 'JUICIO FAMILIAR (DIVORCIO INCAUSADO Y ALIMENTOS)',
    mercantil: 'JUICIO ORDINARIO MERCANTIL (CÓDIGO DE COMERCIO, PAGARÉ)',
  }[materia];
  return [
    `JUZGADO TERCERO ${foro} DEL PRIMER PARTIDO JUDICIAL DEL ESTADO DE JALISCO`,
    'EXPEDIENTE: 777/2025',
    `JUICIO: ${juicio}`,
    'Guadalajara, Jalisco, a doce de agosto de dos mil veinticinco.',
    'Visto el escrito del autorizado de la parte demandada, mediante el cual promueve incidente de nulidad de actuaciones, SE DESECHA el incidente por notoriamente improcedente.',
    'NOTIFÍQUESE. Así lo acordó y firma la Jueza, ante la Secretaria de Acuerdos.',
  ].join('\n');
}

export function documentFromPages(id: string, pagesText: string[]): UploadedSourceDocument {
  return createSourceDocument({
    id, filename: `${id}.pdf`, name: `${id}.pdf`, type: 'pdf', fileUrl: `blob:${id}`,
    extractedText: pagesText.join('\n'),
    pages: pagesText.map((text, index) => ({ page: index + 1, text, chars: text.length })),
    sourceValidated: true, fileSizeBytes: 4096, classification: { role: 'PRIMARY' },
  } as never);
}
