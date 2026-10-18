import { createSourceDocument } from '@/lib/legal-engine/context';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

/**
 * Fixtures 100 % SINTÉTICOS para la Fase 2 (compatibilidad de actuaciones).
 * Nombres, expedientes y juzgados son inventados.
 */

export const AUTO_FAMILIAR_DESECHA_INCIDENTE = [
  'JUZGADO TERCERO DE LO FAMILIAR DEL PRIMER PARTIDO JUDICIAL DEL ESTADO DE JALISCO',
  'EXPEDIENTE: 1234/2025',
  'JUICIO: DIVORCIO INCAUSADO Y ALIMENTOS',
  'ACTORA: MARTA ELENA SOLÍS RIVERO',
  'DEMANDADO: JORGE ARTURO NAVARRETE DUEÑAS',
  '',
  'Guadalajara, Jalisco, a doce de agosto de dos mil veinticinco.',
  '',
  'Visto el escrito presentado por el Licenciado ÁNGEL RUIZ TREJO, autorizado de la parte demandada, mediante el cual promueve incidente de nulidad de actuaciones, con fundamento en los artículos 271 y 272 del Código de Procedimientos Civiles del Estado de Jalisco, SE DESECHA el incidente planteado por notoriamente improcedente, toda vez que la parte promovente consintió expresamente la actuación que pretende anular.',
  '',
  'Asimismo, al no existir diligencia pendiente de desahogo, SE CITA A LAS PARTES PARA OÍR SENTENCIA DEFINITIVA, la cual se dictará dentro del plazo legal.',
  '',
  'NOTIFÍQUESE PERSONALMENTE. Así lo acordó y firma la Jueza, ante la Secretaria de Acuerdos que autoriza y da fe.',
  'LA JUEZA                                      LA SECRETARIA DE ACUERDOS',
].join('\n');

const FILLER = [
  'JUZGADO TERCERO DE LO FAMILIAR',
  'EXPEDIENTE: 1234/2025',
  'CONSTANCIA SECRETARIAL. Se hace constar que obran agregadas a los autos las actuaciones del periodo, sin que exista promoción pendiente de acuerdo.',
].join('\n');

/** PDF sintético de 44 páginas: la página 1 es el auto; el resto, constancias de trámite. */
export function autoFamiliarLargo(id = 'auto-familiar-sintetico', pageCount = 44): UploadedSourceDocument {
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const text = index === 0 ? AUTO_FAMILIAR_DESECHA_INCIDENTE : `${FILLER}\nFoja ${index + 1}.`;
    return { page: index + 1, text, chars: text.length };
  });
  const full = pages.map((page) => page.text).join('\n');
  return createSourceDocument({
    id, filename: `${id}.pdf`, name: `${id}.pdf`, type: 'pdf', fileUrl: `blob:${id}`,
    extractedText: full, pages, sourceValidated: true, fileSizeBytes: 4096,
    classification: { role: 'PRIMARY' },
  } as never);
}
