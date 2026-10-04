import type { UploadedSourceDocument } from '@/lib/legal-engine/types';
function source(id: string, matter: string, body: string): UploadedSourceDocument {
  const text = `JUZGADO DE PRUEBA\nSENTENCIA DEFINITIVA\nACTORES: PERSONA ALFA\nDEMANDADOS: PERSONA BETA\nJUICIO ${matter}\nLOCALIDAD A 12 DOCE DE AGOSTO DE 2026\nVISTOS: autos\n${body}`;
  return { id, pages: [{ page: 5, chars: text.length, text }], sourceValidated: true };
}
export const civilReasoningSource = source('civil-reasons', 'CIVIL', [
  'CONSIDERANDO PRIMERO',
  'La parte actora alega que entregó el pago oportunamente.',
  'CONSTANCIA EN AUTOS: «recibo presentado sin firma de recepción».',
  'Este juzgado tiene por acreditado que existe un recibo en el expediente.',
  'Este juzgado declara procedente la acción accesoria de los actores porque fue reconocida por la contraparte.',
  'CONSIDERANDO SEGUNDO',
  'Este juzgado declara improcedente la reclamación de los actores porque no acreditaron la entrega. Se cita el artículo 10 del ordenamiento invocado.',
  'CONSIDERANDO TERCERO',
  'Se desestima la objeción de los actores relativa a la falta de transcripción; no existe obligación de transcribir los conceptos, según la tesis de rubro «TRANSCRIPCIÓN DE CONCEPTOS».',
  'TESIS CITADA: «Este tribunal declara improcedente la acción de los actores en ese precedente».',
].join('\n\n'));
export const familyReasoningSource = source('family-reasons', 'FAMILIAR', [
  'FUNDAMENTOS Y DECISIÓN',
  '1) Se condena al demandado al pago de alimentos porque consta la obligación reconocida.',
  '2) Se absuelve al demandado del pago retroactivo porque la reclamación carece de prueba.',
  '3) La actora solicita que se condene al demandado a una cantidad adicional.',
].join('\n\n'));
