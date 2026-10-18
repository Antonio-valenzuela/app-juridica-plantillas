import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

function decisionSource(id: string, title: string, body: string): UploadedSourceDocument {
  const text = `JUZGADO DE PRUEBA\nSENTENCIA DEFINITIVA\nACTORES: PERSONA ALFA\nDEMANDADOS: PERSONA BETA\nJUICIO ${title}\nLOCALIDAD A 12 DOCE DE AGOSTO DE 2026\nVISTOS: autos\n${body}`;
  return { id, pages: [{ page: 5, chars: text.length, text }], sourceValidated: true };
}

export const eightConsideringsCivil = decisionSource('impact-civil', 'CIVIL', [
  'CONSIDERANDO PRIMERO',
  'Este juzgado determina que no se acreditó la entrega del bien reclamado.',
  'CONSIDERANDO SEGUNDO',
  'Este juzgado concluye que la prueba documental carece de alcance probatorio para demostrar la recepción.',
  'CONSIDERANDO TERCERO',
  'Este juzgado estima que no se probó la fecha de cumplimiento de la obligación.',
  'CONSIDERANDO CUARTO',
  'Este juzgado determina que el testimonio es insuficiente para demostrar la entrega.',
  'CONSIDERANDO QUINTO',
  'Este juzgado concluye que el supuesto invocado resulta inaplicable a los hechos examinados.',
  'CONSIDERANDO SEXTO',
  'Este juzgado desestima la reclamación de intereses porque la parte actora no demostró el incumplimiento.',
  'CONSIDERANDO SÉPTIMO',
  'Este juzgado considera que es competente para conocer del asunto.',
  'CONSIDERANDO OCTAVO',
  'Este juzgado reconoce que la parte actora sí acreditó la fecha de presentación de su escrito.',
  'TESIS CITADA: «Este tribunal declara improcedente la acción de los actores en ese precedente».',
  'RESOLUTIVOS',
  'PRIMERO. Se declara improcedente la acción intentada por la parte actora.',
].join('\n\n'));

export const familyMixedDecision = decisionSource('impact-family', 'FAMILIAR', [
  'FUNDAMENTOS Y DECISIÓN',
  '1. Se condena a la demandada al pago de alimentos porque se acreditó la obligación principal.',
  '2. Se absuelve a la demandada del pago retroactivo porque no se acreditó ese concepto.',
  'RESUELVE',
  'ÚNICO. Se condena a la demandada al pago de alimentos.',
].join('\n\n'));

export const defendantBeneficialDecision = decisionSource('impact-defendant', 'CIVIL', [
  'CONSIDERANDO PRIMERO',
  'Este juzgado determina que la parte actora no acreditó la entrega del bien reclamado.',
  'RESOLUTIVOS',
  'PRIMERO. Se declara improcedente la acción intentada por la parte actora.',
].join('\n\n'));
