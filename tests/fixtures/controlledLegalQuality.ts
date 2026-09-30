import { createEmptyDocument, createDocumentNode, type UploadedSourceDocument } from '@/lib/legal-engine/types';

// Exact sanitized sources preserved from the first controlled journeys.
// These fixtures do not depend on ignored audit files or personal case paths.
const texts = {
  contestacion: 'DEMANDA CIVIL SINTÉTICA. EXPEDIENTE SYN-CIV-001. Actor: PERSONA A. Demandado: PERSONA B. HECHOS: 1. La persona A manifiesta que celebró con B un convenio de entrega de un objeto. 2. A afirma que la entrega debía realizarse el 3 de septiembre de 2026. 3. A sostiene que B no entregó el objeto. 4. A dice que le corresponde un saldo de 1200 unidades. PRESTACIONES: cumplimiento del convenio y pago del saldo alegado. PRUEBAS: copia simple del convenio. No se incorpora comprobante de entrega ni estado de cuenta. Estas afirmaciones son alegaciones, no hechos acreditados. El ejercicio no contiene resolución judicial ni legislación verificada.',
  apelacion: 'RESOLUCIÓN CIVIL SINTÉTICA. EXPEDIENTE SYN-APL-002. Recurrente: PERSONA B. Juzgado ficticio civil. Resolución fechada el 4 de septiembre de 2026: se rechaza la copia del convenio ofrecida por B porque no se estima pertinente. Punto combatido: rechazo de esa documental. Constancia del ejercicio: apartado segundo de la resolución y escrito de ofrecimiento que dice que el convenio versa sobre el objeto de la reclamación. B afirma que la resolución no explica la relación entre el documento y el objeto controvertido. No se conoce fecha de notificación. No se adjunta texto oficial de las disposiciones aplicables. No existen antecedentes suficientes para concluir oportunidad del recurso.',
  amparo: 'OFICIO ADMINISTRATIVO SINTÉTICO. OFICINA ADMINISTRATIVA FICTICIA. Dirigido a PERSONA C. Identificador SYN-AMP-003. RESOLUCIÓN: no procede recibir la solicitud de acceso al trámite presentada por C el 5 de septiembre de 2026. La oficina comunica únicamente esa negativa, sin explicar requisitos faltantes ni motivo individual. Constancias del ejercicio: texto de la petición y este oficio. C afirma que la negativa le impide obtener una respuesta sobre su petición. No consta fecha de notificación ni medios ordinarios disponibles. No se aporta fuente jurídica oficial. Los hechos descritos son un ejercicio ficticio; no se afirma procedencia de ningún medio de defensa.',
  penal: 'ACTUACIÓN PENAL SINTÉTICA. CAUSA SYN-PEN-004. Etapa: investigación complementaria. Representado ficticio: PERSONA D, imputada. Acto: resolución de un órgano de control ficticio que rechaza la incorporación de una constancia solicitada por la defensa. Hechos del ejercicio: D manifiesta que ofreció una constancia de ubicación para contrastar un dato de la investigación; la resolución dice que no resulta pertinente, sin explicación adicional. Prueba o dato disponible: texto de la solicitud y texto de la negativa. No se afirma que la ubicación haya sido acreditada ni se conoce delito imputado. Riesgos: no consta fecha de notificación, recurribilidad del acto ni norma oficial vigente. Petición confirmada para el ejercicio: revisar motivación individual y posibilidad de contradicción.',
};
export type ControlledMatter = keyof typeof texts;
export function controlledSource(matter: ControlledMatter): UploadedSourceDocument {
  const text = texts[matter];
  return { id: `synthetic-source-${matter}`, filename: matter === 'amparo' ? 'oficio-administrativo-synthetic.txt' : `${matter}-synthetic.txt`, content: text, extractedText: text, sourceValidated: true, pages: [{ page: 1, text, chars: text.length }] };
}
export function controlledDocument(matter: ControlledMatter) {
  const type = { contestacion: 'contestacion_demanda_civil', apelacion: 'apelacion_civil', amparo: 'demanda_amparo_indirecto', penal: 'apelacion_penal' }[matter];
  const doc = createEmptyDocument({ id: `controlled-${matter}`, documentType: type, documentTypeLabel: type, matter: matter === 'contestacion' || matter === 'apelacion' ? 'civil' : matter, sourceDocuments: [controlledSource(matter)], parties: matter === 'contestacion' ? { actor: 'PERSONA A', demandado: 'PERSONA B' } : {}, sections: [] });
  doc.flow = 'DOCUMENT_ANALYSIS'; // The existing factory does not copy flow.
  return doc;
}
export function defectiveArgumentDocument(matter: 'apelacion' | 'amparo' | 'penal') {
  const doc = controlledDocument(matter);
  // Minimal exact faulty blocks derived from the before-run exports.
  const title = { apelacion: 'AGRAVIOS', amparo: 'CONCEPTOS DE VIOLACIÓN', penal: 'PROEMIO E IDENTIFICACIÓN DE LA RESOLUCIÓN IMPUGNADA' }[matter];
  const text = matter === 'penal' ? '1. Se investigan hechos con apariencia del delito de imputado, cometidos en agravio de la víctima [DATO PENDIENTE: Nombre del denunciante / víctima / promovente].' : '';
  doc.sections = [createDocumentNode({ id: `defective-${matter}`, title, type: 'argument', content: [{ id: 'defective-block', text, layer: 'GENERATED_ARGUMENT', trustLevel: 'UNVERIFIED' }] })];
  return doc;
}
