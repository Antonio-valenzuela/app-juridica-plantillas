import type { UniversalLegalDocument, ValidationIssue } from './types';
import { isTramiteGeneralDocumentType } from './caseContext';

export interface GenerationRequestContract {
  documentType: string;
  instruction: string;
  requests: Array<{ text: string; start: number; end: number; origin: 'USER_INSTRUCTION' | 'CONFIRMED_INTAKE' }>;
  applicant?: string;
  capacity?: string;
  destination?: string;
}

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const isRequestLedWriting = (type?: string) => type === 'escrito_libre' || isTramiteGeneralDocumentType(type);

/** Only current explicit instructions/confirmed intake govern relief, never historical source claims. */
export function buildGenerationRequestContract(doc: UniversalLegalDocument, instruction: string): GenerationRequestContract | undefined {
  if (!isRequestLedWriting(doc.documentType)) return undefined;
  const requests: GenerationRequestContract['requests'] = [];
  const explicit = /\b(?:petitorios?|petici[oó]n(?:\s+concreta)?|solicitud)\s*:\s*([^.;\n]+)/gi;
  for (const match of instruction.matchAll(explicit)) {
    const text = match[1].trim();
    const start = match.index! + match[0].indexOf(match[1]);
    if (text) requests.push({ text, start, end: start + match[1].length, origin: 'USER_INSTRUCTION' });
  }
  if (!requests.length && doc.intake?.requestedRelief?.trim()) {
    requests.push({ text: doc.intake.requestedRelief.trim(), start: 0, end: 0, origin: 'CONFIRMED_INTAKE' });
  }
  // A plain affirmative request is usable verbatim; no conversion into invented remedies.
  if (!requests.length) {
    const match = instruction.match(/(?:^|[.;\n])\s*((?:solicito|solicitamos|t[eé]ngase|tener por)\b[^.;\n]+)/i);
    if (match) {
      const start = instruction.indexOf(match[1], match.index);
      requests.push({ text: match[1].trim(), start, end: start + match[1].length, origin: 'USER_INSTRUCTION' });
    }
  }
  const applicant = doc.parties.actor || doc.parties.quejoso
    || (doc.caseContext?.fields.promovente?.status === 'CONFIRMED' ? doc.caseContext.fields.promovente.value : undefined);
  const confirmedCapacity = doc.caseContext?.civil?.personality;
  let capacity = confirmedCapacity?.status === 'CONFIRMED' ? confirmedCapacity.value : undefined;
  if (!capacity && applicant) {
    // Capacity is tied to this confirmed person, not to another person mentioned in the file.
    const clauses = instruction.split(/[.;\n]/).filter(clause => normalize(clause).includes(normalize(applicant)));
    const capacities = clauses.flatMap(clause => {
      const own = clause.match(/\bpor (?:su |mi )?propio derecho\b/i);
      const named = clause.match(/\bpersonalidad\s*:\s*([^;\n]+)/i);
      return own ? [own[0]] : named ? [named[1].trim()] : [];
    });
    if (new Set(capacities.map(normalize)).size === 1) capacity = capacities[0];
  }
  const destination = doc.parties.autoridadDestinataria
    || instruction.match(/\bdestinatario\s*(?::\s*|\s+)([^.;\n]+)/i)?.[1].trim();
  return { documentType: doc.documentType!, instruction, requests, applicant, capacity, destination };
}

export function renderRequestLedSection(doc: UniversalLegalDocument, type: string, title: string): string | undefined {
  const contract = doc.generationMetadata.requestContract;
  if (!contract || !isRequestLedWriting(doc.documentType)) return undefined;
  const requests = contract.requests.map(request => request.text).join('; ')
    || '[DATO PENDIENTE: solicitud concreta confirmada por el abogado]';
  if (type === 'identity') return `${contract.applicant || '[DATO PENDIENTE: Nombre del promovente]'}, ${contract.capacity || '[DATO PENDIENTE: personalidad confirmada]'}, ante Usted comparezco y expongo:`;
  if (type === 'header') return `${contract.destination || '[DATO PENDIENTE: Autoridad destinataria]'}\nEXPEDIENTE: ${doc.caseRefs.expediente || '[DATO PENDIENTE: expediente]'}\nPRESENTE.`;
  if (type === 'petition') {
    if (/expuesto|objeto|principal/i.test(title)) return `OBJETO DEL ESCRITO\n\nLa solicitud de esta promoción se limita a: ${requests}.`;
    return `PUNTOS PETITORIOS\n\nPRIMERO. Tener por presentado el presente escrito.\nSEGUNDO. ${requests}.`;
  }
  return undefined;
}

/** Additional fail-closed structural check; does not certify substantive facts or authorities. */
export function validateGenerationRequestContract(doc: UniversalLegalDocument): ValidationIssue[] {
  const contract = doc.generationMetadata.requestContract;
  if (!contract || !isRequestLedWriting(doc.documentType)) return [];
  const errors: ValidationIssue[] = [];
  const add = (checkId: string, message: string, sectionId?: string) => errors.push({ checkId, message, sectionId });
  const identity = normalize(doc.sections.filter(section => section.type === 'identity').flatMap(section => section.content.map(block => block.text)).join('\n'));
  if (contract.applicant && !identity.includes(normalize(contract.applicant))) add('REQUEST_CONTRACT_FORMAL_NAME_LOST', 'El proemio perdió el nombre confirmado.');
  if (contract.capacity && !identity.includes(normalize(contract.capacity))) add('REQUEST_CONTRACT_FORMAL_CAPACITY_LOST', 'El proemio perdió la personalidad explícita.');
  if (!contract.requests.length) add('REQUEST_CONTRACT_RELIEF_MISSING', 'Falta solicitud concreta: no se presume una pretensión.');
  // A prohibition inside the current request cannot authorize the prohibited
  // remedy. Preserve preceding affirmative relief and remove negative tails.
  const relief = normalize(contract.requests.map(request => request.text).join('\n'))
    .replace(/\b(?:sin|no)\b[^.;\n]*/g, '');
  const remedyPatterns = [
    /medio de defensa|interponer (?:un |el )?(?:recurso|demanda)/,
    /resolucion favorable|sentencia favorable|fundadas las pretensiones/,
    /revoca\w*/, /modifica\w*/, /absol\w*/, /conden\w*/, /declar\w* (?:la )?procedencia/,
  ];
  for (const section of doc.sections) {
    const text = normalize(section.content.map(block => block.text).join('\n'));
    for (const pattern of remedyPatterns) {
      if (pattern.test(relief)) continue;
      // Inspect affirmative clauses, not explicit denials/research warnings.
      const clauses = text.split(/[.;\n]|\bpero\b|\bsin embargo\b/).filter(clause => !/\b(?:no|sin|ningun|ninguna)\b/.test(clause) && !/\[.*pendiente/.test(clause));
      if (clauses.some(clause => pattern.test(clause))) {
        add('REQUEST_CONTRACT_UNREQUESTED_RELIEF', 'Se agregó un resultado o medio de defensa no contenido en la solicitud actual.', section.id);
        break;
      }
    }
    if (section.type === 'petition' && contract.requests.some(request => !text.includes(normalize(request.text)))) {
      add('REQUEST_CONTRACT_RELIEF_LOST', 'La sección de petición no conserva la solicitud actual.', section.id);
    }
  }
  return errors;
}
