import { DocumentNode } from './types';
import { CaseAnalysis, ArgumentAxis } from './caseAnalysis';
import { UniversalLegalDocument } from './types';
import { formatCaseContextField } from './caseContext';
import type { RichCaseAnalysis } from './case-extraction/types';

/**
 * contestacionStructure.ts
 *
 * SEPARACIÓN ABSOLUTA FUENTE / ANÁLISIS / DOCUMENTO para el flujo de Contestación.
 *
 * El expediente subido es REFERENCE_ONLY: alimenta el análisis y los prompts, pero
 * JAMÁS se re-imprime como bloques del documento final. La salida se construye sobre
 * este esqueleto jurídico dedicado, cuyas secciones son GENERATED y comparten una
 * única identidad documental (_templateId = 'contestacion_demanda_*').
 *
 * Estructura canónica por materia (FASE 8):
 *   PROEMIO → COMPARECENCIA Y PERSONALIDAD → OBJETO DEL ESCRITO →
 *   CONTESTACIÓN DE HECHOS → CONTESTACIÓN DE PRESTACIONES → EXCEPCIONES Y DEFENSAS →
 *   PRUEBAS → ALEGATOS → PETITORIOS → FIRMA
 */

export interface ContestacionRoles {
  /** Parte que CONTESTA (demandado) */
  contesta: string;
  /** Parte contraparte (actor/promovente) */
  contraparte: string;
  /** Autoridad u órgano ante quien se dirige (si aplica) */
  autoridad: string;
  expediente: string;
}

type SavedParty = { role: string; name: string };

function pickName(savedParties: SavedParty[] | undefined, role: string): string {
  const hit = savedParties?.find((p) => p.role === role && p.name && p.name.trim());
  return hit ? hit.name.trim() : '';
}

const PENDIENTE_ACTOR = '[DATO PENDIENTE DE EXPEDIENTE: Nombre del actor/promovente]';
const PENDIENTE_DEMANDADO = '[DATO PENDIENTE DE EXPEDIENTE: Nombre del demandado]';

/**
 * FASE 12 — Prioridad de resolución de identidad procesal:
 *   partes confirmadas por el abogado (manual > detected)
 *     > doc.parties (detectado del expediente con confianza)
 *       > análisis estructurado del caso
 *         > [DATO PENDIENTE]
 * Nunca sustituye un rol por otro ni inventa nombres.
 */
export function resolveContestacionRoles(
  doc: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis,
  savedParties?: SavedParty[]
): ContestacionRoles {
  const contesta =
    pickName(savedParties, 'demandado') ||
    doc.parties?.demandado ||
    caseAnalysis?.parties?.demandado ||
    PENDIENTE_DEMANDADO;

  const contraparte =
    pickName(savedParties, 'actor') ||
    doc.parties?.actor ||
    caseAnalysis?.parties?.actor ||
    PENDIENTE_ACTOR;

  const autoridad =
    (caseAnalysis?.authorities && caseAnalysis.authorities[0]) ||
    '';

  const expediente =
    doc.caseRefs?.expediente ||
    caseAnalysis?.caseNumbers?.principal ||
    '[DATO PENDIENTE DE EXPEDIENTE: Número de expediente]';

  return { contesta, contraparte, autoridad, expediente };
}

function mkSection(
  templateId: string,
  id: string,
  type: DocumentNode['type'],
  title: string,
  order: number,
  seedText: string
): DocumentNode {
  return {
    id,
    type,
    title,
    order,
    isRepeatable: type === 'argument',
    isEditable: true,
    isGenerated: false,
    isManuallyEdited: false,
    variables: [],
    validationErrors: [],
    validationWarnings: [],
    content: [
      {
        id: `blk-${id}`,
        layer: 'USER_POSITION' as const,
        trustLevel: 'VERIFIED' as const,
        text: seedText,
        isManuallyEdited: false,
        style: { fontFamily: 'inherit', fontSize: '13px', textAlign: 'justify' as const, lineHeight: '1.6' },
      },
    ],
    // Identidad documental ÚNICA (FASE 10) + procedencia formal
    _templateId: templateId,
    _provenance: 'GENERATED',
  };
}

function replaceRichSeed(
  section: DocumentNode,
  text: string,
  metadata: Pick<NonNullable<DocumentNode['content']>[number], 'coverageItemIds' | 'factIds' | 'evidenceIds'> = {},
): DocumentNode {
  const first = section.content[0];
  return {
    ...section,
    content: [{
      ...first,
      text,
      ...metadata,
    }],
  };
}

/**
 * Rich-first contestación skeleton.  Only source-level propositions and
 * explicit IDs are copied into neutral seeds; legacy arrays are intentionally
 * not consulted once RichCaseAnalysis exists.
 */
function buildRichContestacionSkeleton(
  doc: UniversalLegalDocument,
  rich: RichCaseAnalysis,
  savedParties: SavedParty[] | undefined,
  templateId: string,
): DocumentNode[] {
  const roles = resolveContestacionRoles(doc, undefined, savedParties);
  const sections: DocumentNode[] = [
    mkSection(templateId, 'sec-con-proemio', 'header', 'PROEMIO', 1,
      `${roles.autoridad || '[DATO PENDIENTE DE EXPEDIENTE: Autoridad competente]'}\nEXPEDIENTE: ${roles.expediente}\nASUNTO: Contestación de demanda`),
    mkSection(templateId, 'sec-con-comparecencia', 'identity', 'COMPARECENCIA Y PERSONALIDAD', 2,
      `QUIEN CONTESTA: ${roles.contesta}\nPARTE CONTRARIA: ${roles.contraparte}\nPERSONALIDAD: [DATO PENDIENTE DE EXPEDIENTE: Personalidad y domicilio]`),
    mkSection(templateId, 'sec-con-objeto', 'argument', 'OBJETO DEL ESCRITO', 3,
      'Objeto del escrito pendiente de confirmación por el abogado.'),
    mkSection(templateId, 'sec-con-hechos', 'background', 'CONTESTACIÓN DE HECHOS', 4,
      rich.facts.length > 0
        ? 'HECHOS IDENTIFICADOS EN LA FUENTE:\n' + rich.facts.map((fact) => `• ${fact.proposition}`).join('\n') + '\nPOSTURA: pendiente de confirmación.'
        : '[DATO PENDIENTE DE EXPEDIENTE: Hechos identificados]'),
    mkSection(templateId, 'sec-con-prestaciones', 'argument', 'CONTESTACIÓN DE PRESTACIONES', 5,
      rich.claims.length > 0
        ? 'PRESTACIONES IDENTIFICADAS EN LA FUENTE:\n' + rich.claims.map((claim) => `• ${claim.requestedRelief}`).join('\n') + '\nPOSTURA: pendiente de confirmación.'
        : '[DATO PENDIENTE DE EXPEDIENTE: Prestaciones identificadas]'),
    mkSection(templateId, 'sec-con-excepciones', 'argument', 'EXCEPCIONES Y DEFENSAS', 6,
      'Contenido pendiente de instrucción expresa del abogado.'),
    mkSection(templateId, 'sec-con-pruebas', 'evidence', 'PRUEBAS', 7,
      rich.evidenceMentions.length > 0
        ? 'MENCIONES PROBATORIAS IDENTIFICADAS EN LA FUENTE:\n' + rich.evidenceMentions.map((mention) => `• ${mention.description}`).join('\n')
        : '[DATO PENDIENTE DE EXPEDIENTE: Menciones probatorias]'),
    mkSection(templateId, 'sec-con-alegatos', 'argument', 'ALEGATOS', 8,
      'Contenido pendiente de instrucción expresa del abogado.'),
    mkSection(templateId, 'sec-con-petitorios', 'petition', 'PETITORIOS', 9,
      'PETITORIOS pendientes de confirmación.'),
    mkSection(templateId, 'sec-con-firma', 'signature', 'FIRMA', 10,
      `PROTESTO LO NECESARIO.\nLUGAR Y FECHA: [DATO PENDIENTE DE EXPEDIENTE: Lugar y fecha de presentación]\n\n_________________________________________\n${roles.contesta}`),
  ];

  const factSection = sections.find((section) => section.id === 'sec-con-hechos')!;
  const claimSection = sections.find((section) => section.id === 'sec-con-prestaciones')!;
  const evidenceSection = sections.find((section) => section.id === 'sec-con-pruebas')!;
  const richFactSection = replaceRichSeed(factSection, factSection.content[0].text, {
    coverageItemIds: rich.facts.map((fact) => `cov-fact-response-${fact.id}`),
    factIds: rich.facts.map((fact) => fact.id),
  });
  const richClaimSection = replaceRichSeed(claimSection, claimSection.content[0].text, {
    coverageItemIds: rich.claims.map((claim) => `cov-claim-${claim.id}`),
  });
  const richEvidenceSection = replaceRichSeed(evidenceSection, evidenceSection.content[0].text, {
    coverageItemIds: rich.evidenceMentions.map((mention) => `cov-evidence-treatment-${mention.id}`),
    evidenceIds: rich.evidenceMentions.map((mention) => mention.id),
  });
  return sections.map((section) => section.id === factSection.id
    ? richFactSection
    : section.id === claimSection.id
      ? richClaimSection
      : section.id === evidenceSection.id
        ? richEvidenceSection
        : section);
}

/** Instrucción enfocada POR SECCIÓN (se combina con la instrucción global del abogado). */
export const CONTESTACION_SECTION_INSTRUCTIONS: Record<string, string> = {
  'sec-con-proemio':
    'Redacta SOLO el proemio: destinatario competente ([DATO PENDIENTE DE EXPEDIENTE: Autoridad competente] si no consta), número de expediente y asunto "Contestación de demanda". No agregues más contenido.',
  'sec-con-comparecencia':
    'Redacta la comparecencia: QUIEN CONTESTA ES EL DEMANDADO señalado en PARTES CONFIRMADAS. Reproduce su nombre exacto, acredita personalidad (o señala [DATO PENDIENTE DE EXPEDIENTE: Personalidad]) y señala domicilio para oír notificaciones si consta; si no, marcador pendiente. NUNCA inviertas el rol: el demandado contesta, el actor promovió. PROHIBIDO usar a la autoridad responsable, al tribunal o al juzgado como parte que contesta, y PROHIBIDO copiar fragmentos del expediente en esta sección.',
  'sec-con-objeto':
    'Párrafo breve de objeto: se contesta la demanda promovida por la parte contraparte (su nombre exacto), manifestando si se niega o rechaza en todos o en parte. Sin repetir el expediente.',
  'sec-con-hechos':
    'CONTESTACIÓN DE LOS HECHOS punto por punto. Por CADA hecho afirmado en el expediente usa EXACTAMENTE este formato:\nHECHO PRIMERO: "cita textual breve del hecho"\nPOSICIÓN PROCESAL: se admite / se niega / se desconoce / no corresponde al demandado.\nRAZÓN: fundamento procesal o fáctico breve.\nSi un hecho contiene datos REDACTADOS (asteriscos *****), consérvalos EXACTAMENTE así al citarlo: jamás los descifres ni los omitas. PROHIBIDO párrafos genéricos del tipo "La parte demandada sostiene que…" cuando dispones del hecho concreto que debes responder.',
  'sec-con-prestaciones':
    'CONTESTACIÓN DE LAS PRESTACIONES: refiere cada prestación reclamada y manifiesta expresamente si se opone o no, con la razón procesal breve. No introduzcas pretensiones nuevas.',
  'sec-con-excepciones':
    'EXCEPCIONES Y DEFENSAS: desarrolla ÚNICAMENTE las excepciones y defensas que provengan del expediente o de las aportaciones/instrucciones del abogado (permuta, prescripción, falta de acción, etc.). Cada defensa debe conectar HECHO → ARGUMENTO → FUNDAMENTO → CONSECUENCIA pedida.',
  'sec-con-pruebas':
    'PRUEBAS: ofrece únicamente pruebas derivadas del expediente o solicitadas por el abogado, con el hecho que cada una tiende a probar. NO ofrezcas pruebas inexistentes.',
  'sec-con-alegatos':
    'ALEGATOS: síntesis argumentativa final desde la posición del demandado: excepciones probadas + hechos negados + consecuencia de absolución. No introduzcas hechos nuevos ni actúes como juzgador.',
  'sec-con-petitorios':
    'PETITORIOS congruentes con la posición procesal (negar/rechazar la demanda y absolver la instancia al demandado). Numeración PRIMERO/SEGUNDO/TERCERO.',
  'sec-con-firma':
    'Cierre y firma: protesto de ley y lugar/fecha (si la fecha no consta usa [DATO PENDIENTE DE EXPEDIENTE: Fecha de presentación]), línea de firma con el nombre exacto de QUIEN CONTESTA (el demandado) y su carácter procesal. Nunca firmes con el nombre del actor ni de la autoridad.',
};

export function buildContestacionSkeleton(
  doc: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis,
  savedParties?: SavedParty[],
  templateId = doc.documentType || 'contestacion_demanda'
): DocumentNode[] {
  if (caseAnalysis?.richCaseAnalysis) {
    return buildRichContestacionSkeleton(doc, caseAnalysis.richCaseAnalysis, savedParties, templateId);
  }
  const roles = resolveContestacionRoles(doc, caseAnalysis, savedParties);

  // Fragmentos de referencia para los PROMPTS (con redacciones intactas),
  // separados de la postura: una afirmación de la demanda nunca se presenta
  // como hecho propio del demandado.
  const hechosRef = (caseAnalysis?.facts || []).map((fact) => [
    `AL HECHO ${fact.number}.- ${fact.number}. ${fact.sourceFact || fact.text}. La parte actora afirma: "${fact.sourceFact || fact.text}"`,
    `POSTURA PROCESAL: ${fact.lawyerPosition === 'ADMIT' || fact.position === 'ADMIT' ? 'SE ADMITE' : fact.lawyerPosition === 'DENY' || fact.position === 'DENY' ? 'SE NIEGA' : fact.lawyerPosition === 'PARTIAL' || fact.position === 'PARTIAL' ? 'SE ADMITE PARCIALMENTE' : fact.lawyerPosition === 'NOT_KNOWN' || fact.position === 'IGNORE_PERSONAL_KNOWLEDGE' ? 'NO SE TIENE POR CONFIRMADO' : '[REQUIERE DEFINIR POSTURA DEL ABOGADO]'}`,
    `RESPUESTA: ${fact.lawyerObservation || fact.manualResponse || (fact.lawyerPosition && fact.lawyerPosition !== 'UNDEFINED' ? fact.lawyerPosition : fact.response) || '[REQUIERE DEFINIR POSTURA DEL ABOGADO]'}`,
    `FUENTE: ${fact.sourceReference?.documentId || fact.documentId || 'fuente-no-identificada'}${fact.sourceReference?.page || fact.page ? ` · página ${fact.sourceReference?.page || fact.page}` : ''}.`,
  ].join('\n')).join('\n\n');
  const prestacionesRef = (caseAnalysis?.claimResponses || []).length
    ? (caseAnalysis?.claimResponses || []).map((claim) => `PRESTACIÓN ${claim.number}.- La parte actora reclama: "${claim.text}"\nPOSTURA: ${claim.lawyerPosition === 'ACCEPT' || claim.position === 'ACCEPT' ? 'SE ACEPTA' : claim.lawyerPosition === 'OPPOSE' || claim.position === 'OPPOSE' ? 'SE OPONE' : claim.lawyerPosition === 'PARTIAL' || claim.position === 'PARTIAL' ? 'SE ACEPTA PARCIALMENTE' : '[REQUIERE DEFINIR POSTURA DEL ABOGADO]'}\nRESPUESTA: ${claim.lawyerObservation || claim.generatedResponse || (claim.lawyerPosition && claim.lawyerPosition !== 'UNDEFINED' ? claim.lawyerPosition : claim.response) || '[REQUIERE INSTRUCCIÓN DEL ABOGADO]'}`).join('\n\n')
    : (caseAnalysis?.claims || []).map((claim, i) => `PRESTACIÓN ${i + 1}.- La parte actora reclama: "${claim}"\nPOSTURA: [REQUIERE DEFINIR POSTURA DEL ABOGADO]`).join('\n\n');

  const proemioSeed = `${roles.autoridad || '[DATO PENDIENTE DE EXPEDIENTE: Autoridad competente]'}\nEXPEDIENTE: ${roles.expediente}\nASUNTO: Contestación de demanda`;
  const comparecenciaSeed = `QUIEN CONTESTA (DEMANDADO): ${roles.contesta}\nPARTE CONTRARIA (ACTOR): ${roles.contraparte}\nPERSONALIDAD: [DATO PENDIENTE DE EXPEDIENTE: Personalidad y domicilio para oír notificaciones]`;
  const hechosSeed = `HECHOS AFIRMADOS POR LA CONTRAPARTE (responder punto por punto; conserva redacciones *****):\n${hechosRef || '[DATO PENDIENTE DE EXPEDIENTE: Hechos del expediente]'}`;
  const prestacionesSeed = `PRESTACIONES RECLAMADAS:\n${prestacionesRef || '[DATO PENDIENTE DE EXPEDIENTE: Prestaciones reclamadas]'}`;
  const pruebasSeed = `FUENTES PROBATORIAS DISPONIBLES EN EL EXPEDIENTE:\n${(caseAnalysis?.evidence || []).map((e) => `- ${e.description}`).join('\n') || '[Sin pruebas identificadas en el expediente]'}`;

  const sections: DocumentNode[] = [
    mkSection(templateId, 'sec-con-proemio', 'header', 'PROEMIO', 1, proemioSeed),
    mkSection(templateId, 'sec-con-comparecencia', 'identity', 'COMPARECENCIA Y PERSONALIDAD', 2, comparecenciaSeed),
    mkSection(templateId, 'sec-con-objeto', 'argument', 'OBJETO DEL ESCRITO', 3,
      `Se contesta la demanda promovida por ${roles.contraparte} dentro de los autos del expediente ${roles.expediente}.`),
    mkSection(templateId, 'sec-con-hechos', 'background', 'CONTESTACIÓN DE HECHOS', 4, hechosSeed),
    mkSection(templateId, 'sec-con-prestaciones', 'argument', 'CONTESTACIÓN DE PRESTACIONES', 5, prestacionesSeed),
    mkSection(templateId, 'sec-con-excepciones', 'argument', 'EXCEPCIONES Y DEFENSAS', 6,
      'EXCEPCIONES Y DEFENSAS DERIVADAS DEL EXPEDIENTE O DE LAS INSTRUCCIONES DEL ABOGADO:\nNo se identificaron elementos suficientes para formular una excepción concreta. [REQUIERE INSTRUCCIÓN DEL ABOGADO].'),
    mkSection(templateId, 'sec-con-pruebas', 'evidence', 'PRUEBAS', 7, pruebasSeed),
    mkSection(templateId, 'sec-con-alegatos', 'argument', 'ALEGATOS', 8,
      'SÍNTESIS ALEGATIVA DESDE LA POSICIÓN DEL DEMANDADO:\n[REQUIERE INSTRUCCIÓN DEL ABOGADO: confirmar teoría defensiva y consecuencia solicitada].'),
    mkSection(templateId, 'sec-con-petitorios', 'petition', 'PETITORIOS', 9, 'PETITORIOS'),
    mkSection(templateId, 'sec-con-firma', 'signature', 'FIRMA', 10,
      `PROTESTO LO NECESARIO.\nLUGAR Y FECHA: [DATO PENDIENTE DE EXPEDIENTE: Lugar y fecha de presentación]\n\n_________________________________________\n${roles.contesta}`),
  ];

  return sections;
}

const RECONVENCION_SECTION_SEEDS: Record<string, { id: string; type: DocumentNode['type']; text: string }> = {
  'OBJETO Y CONEXIDAD': { id: 'sec-reconv-objeto-conexidad', type: 'argument', text: 'OBJETO Y CONEXIDAD:\n[DATO PENDIENTE DE EXPEDIENTE: identificar la relación de conexidad y la oportunidad procesal confirmadas].' },
  'HECHOS DE LA RECONVENCIÓN': { id: 'sec-reconv-hechos', type: 'background', text: 'HECHOS DE LA RECONVENCIÓN:\n[DATO PENDIENTE DE EXPEDIENTE: hechos de la pretensión reconvencional].' },
  'PRESTACIONES RECONVENCIONALES': { id: 'sec-reconv-prestaciones', type: 'argument', text: 'PRESTACIONES RECONVENCIONALES:\n[DATO PENDIENTE DE EXPEDIENTE: prestaciones reconvencionales confirmadas].' },
  'DERECHO': { id: 'sec-reconv-derecho', type: 'legal_grounds', text: 'DERECHO:\n[DATO PENDIENTE DE EXPEDIENTE: fundamentos aportados o confirmados por el abogado].' },
  'CONTESTACIÓN DE LA RECONVENCIÓN': { id: 'sec-reconv-contestacion', type: 'background', text: 'CONTESTACIÓN DE LA RECONVENCIÓN:\n[DATO PENDIENTE DE EXPEDIENTE: hechos y prestaciones reconvencionales que requieren postura].' },
  'EXCEPCIONES Y DEFENSAS': { id: 'sec-reconv-excepciones', type: 'argument', text: 'EXCEPCIONES Y DEFENSAS:\n[REQUIERE POSTURA DEL ABOGADO: no se formula una defensa por inferencia].' },
  'EXCEPCIONES Y DEFENSAS MERCANTILES': { id: 'sec-reconv-excepciones-mercantiles', type: 'argument', text: 'EXCEPCIONES Y DEFENSAS MERCANTILES:\n[REQUIERE POSTURA DEL ABOGADO: no se formula una excepción por inferencia].' },
  'HECHOS Y RAZONES DE OPOSICIÓN': { id: 'sec-reconv-hechos-oposicion', type: 'background', text: 'HECHOS Y RAZONES DE OPOSICIÓN:\n[DATO PENDIENTE DE EXPEDIENTE: hechos y razones confirmados].' },
};

function buildResponseSection(
  templateId: string,
  title: string,
  order: number,
  doc: UniversalLegalDocument,
  type: DocumentNode['type'],
  text: string,
): DocumentNode {
  return mkSection(templateId, `sec-response-${templateId}-${order}`, type, title, order, text);
}

/**
 * Esqueleto por subfamilia de 2C. Las contestaciones ordinarias conservan el
 * constructor histórico, mientras que reconvención y excepciones reciben
 * secciones propias para no confundirse con una demanda/contestación genérica.
 */
export function buildCivilMercantileResponseSkeleton(
  doc: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis,
  templateId = doc.documentType,
): DocumentNode[] {
  if (templateId === 'contestacion_demanda_oral_civil' || templateId === 'contestacion_demanda_arrendamiento') {
    return buildContestacionSkeleton(doc, caseAnalysis, (doc as any).caseParties || [], templateId);
  }

  const template = templateId.includes('excepciones_mercantiles')
    ? [
        ['PROEMIO', 'header', 'La autoridad mercantil competente y el expediente requieren confirmación.'],
        ['COMPARECENCIA Y PERSONALIDAD', 'identity', 'La parte demandada comparece con personalidad pendiente de confirmar.'],
        ['OBJETO DEL ESCRITO', 'argument', 'Se oponen únicamente las excepciones y defensas mercantiles confirmadas por el abogado.'],
        ['EXCEPCIONES Y DEFENSAS MERCANTILES', 'argument', RECONVENCION_SECTION_SEEDS['EXCEPCIONES Y DEFENSAS MERCANTILES'].text],
        ['HECHOS Y RAZONES DE OPOSICIÓN', 'background', RECONVENCION_SECTION_SEEDS['HECHOS Y RAZONES DE OPOSICIÓN'].text],
        ['PRUEBAS', 'evidence', 'PRUEBAS:\n[DATO PENDIENTE DE EXPEDIENTE: pruebas mercantiles relacionadas].'],
        ['PETITORIOS', 'petition', 'PETITORIOS:\n[REQUIERE CONFIRMACIÓN DEL ABOGADO].'],
        ['FIRMA', 'signature', 'PROTESTO LO NECESARIO.\n[DATO PENDIENTE DE EXPEDIENTE: firma de la parte demandada].'],
      ] as const
    : templateId.startsWith('reconvencion_')
      ? [
          ['PROEMIO', 'header', 'La autoridad competente y el expediente requieren confirmación.'],
          ['COMPARECENCIA Y PERSONALIDAD', 'identity', 'La parte que reconviene comparece con personalidad pendiente de confirmar.'],
          ['OBJETO Y CONEXIDAD', 'argument', RECONVENCION_SECTION_SEEDS['OBJETO Y CONEXIDAD'].text],
          ['HECHOS DE LA RECONVENCIÓN', 'background', RECONVENCION_SECTION_SEEDS['HECHOS DE LA RECONVENCIÓN'].text],
          ['PRESTACIONES RECONVENCIONALES', 'argument', RECONVENCION_SECTION_SEEDS['PRESTACIONES RECONVENCIONALES'].text],
          ['DERECHO', 'legal_grounds', RECONVENCION_SECTION_SEEDS.DERECHO.text],
          ['PRUEBAS', 'evidence', 'PRUEBAS:\n[DATO PENDIENTE DE EXPEDIENTE: pruebas vinculadas a la reconvención].'],
          ['PETITORIOS', 'petition', 'PETITORIOS:\n[REQUIERE CONFIRMACIÓN DEL ABOGADO].'],
          ['FIRMA', 'signature', 'PROTESTO LO NECESARIO.\n[DATO PENDIENTE DE EXPEDIENTE: firma de la parte que reconviene].'],
        ] as const
      : [
          ['PROEMIO', 'header', 'La autoridad competente y el expediente requieren confirmación.'],
          ['COMPARECENCIA Y PERSONALIDAD', 'identity', 'La parte demandada reconvencional comparece con personalidad pendiente de confirmar.'],
          ['OBJETO DEL ESCRITO', 'argument', 'Se contesta únicamente la reconvención identificada en las constancias.'],
          ['CONTESTACIÓN DE LA RECONVENCIÓN', 'background', RECONVENCION_SECTION_SEEDS['CONTESTACIÓN DE LA RECONVENCIÓN'].text],
          ['EXCEPCIONES Y DEFENSAS', 'argument', RECONVENCION_SECTION_SEEDS['EXCEPCIONES Y DEFENSAS'].text],
          ['PRUEBAS', 'evidence', 'PRUEBAS:\n[DATO PENDIENTE DE EXPEDIENTE: pruebas vinculadas a la contestación de reconvención].'],
          ['ALEGATOS', 'argument', 'ALEGATOS:\n[REQUIERE POSTURA DEL ABOGADO].'],
          ['PETITORIOS', 'petition', 'PETITORIOS:\n[REQUIERE CONFIRMACIÓN DEL ABOGADO].'],
          ['FIRMA', 'signature', 'PROTESTO LO NECESARIO.\n[DATO PENDIENTE DE EXPEDIENTE: firma de la parte demandada reconvencional].'],
        ] as const;

  return template.map(([title, type, text], index) => buildResponseSection(
    templateId,
    title,
    index + 1,
    doc,
    type,
    text,
  ));
}

/** Esqueleto dedicado para actuaciones probatorias y alegatos de 2D. */
export function buildCivilMercantileEvidenceArgumentSkeleton(
  doc: UniversalLegalDocument,
  templateId = doc.documentType,
): DocumentNode[] {
  const context = doc.caseContext?.civilMercantileEvidenceArgument;
  const evidenceText = context?.evidence.length
    ? context.evidence.map((item) => `- ${item.type}: ${item.description || '[DATO PENDIENTE: descripción de la prueba]'}`).join('\n')
    : '[DATO PENDIENTE: pruebas identificadas y confirmadas por el abogado]';
  const argumentText = context?.arguments.length
    ? context.arguments.map((item) => `- ${item.title}: ${item.reasoning || '[DATO PENDIENTE: razonamiento del argumento]'}`).join('\n')
    : '[DATO PENDIENTE: argumentos sustentados y confirmados por el abogado]';
  const authority = doc.parties?.autoridadResponsable || '[DATO PENDIENTE: autoridad competente]';
  const expediente = doc.caseRefs?.expediente || '[DATO PENDIENTE: número de expediente]';
  const party = doc.parties?.actor || doc.parties?.demandado || '[DATO PENDIENTE: parte que promueve]';
  const isObjection = templateId.includes('objecion');
  const isHearing = templateId.includes('desahogo_vista');
  const isArguments = templateId.includes('alegatos');
  const title = isObjection
    ? 'Objeción de pruebas'
    : isHearing
      ? 'Desahogo de vista'
      : isArguments
        ? 'Alegatos'
        : 'Ofrecimiento de pruebas';
  const entries: Array<[string, DocumentNode['type'], string]> = isObjection
    ? [
        ['PROEMIO', 'header', `${authority}\nEXPEDIENTE: ${expediente}\nASUNTO: ${title}`],
        ['COMPARECENCIA Y PERSONALIDAD', 'identity', `${party}\nPERSONALIDAD: [DATO PENDIENTE: personalidad confirmada]`],
        ['OBJETO DE LA OBJECIÓN', 'argument', 'Se objetan únicamente los documentos y pruebas identificados, con motivos confirmados por el abogado.'],
        ['PRUEBAS OBJETADAS', 'evidence', evidenceText],
        ['MOTIVOS DE OBJECIÓN', 'argument', '[REQUIERE POSTURA DEL ABOGADO: motivos concretos de objeción]'],
        ['PETITORIOS', 'petition', '[REQUIERE CONFIRMACIÓN DEL ABOGADO: peticiones derivadas de la objeción]'],
        ['FIRMA', 'signature', 'PROTESTO LO NECESARIO.\n[DATO PENDIENTE: firma de la parte promovente]'],
      ]
    : isHearing
      ? [
          ['PROEMIO', 'header', `${authority}\nEXPEDIENTE: ${expediente}\nASUNTO: ${title}`],
          ['COMPARECENCIA Y PERSONALIDAD', 'identity', `${party}\nPERSONALIDAD: [DATO PENDIENTE: personalidad confirmada]`],
          ['OBJETO DE LA VISTA', 'argument', '[DATO PENDIENTE: acuerdo y objeto de la vista confirmados]'],
          ['MANIFESTACIONES SOBRE PRUEBAS', 'evidence', evidenceText],
          ['HECHOS RELACIONADOS', 'background', '[DATO PENDIENTE: hechos relacionados con la vista]'],
          ['PETITORIOS', 'petition', '[REQUIERE CONFIRMACIÓN DEL ABOGADO: peticiones derivadas de la vista]'],
          ['FIRMA', 'signature', 'PROTESTO LO NECESARIO.\n[DATO PENDIENTE: firma de la parte promovente]'],
        ]
      : isArguments
        ? [
            ['PROEMIO', 'header', `${authority}\nEXPEDIENTE: ${expediente}\nASUNTO: ${title}`],
            ['COMPARECENCIA Y PERSONALIDAD', 'identity', `${party}\nPERSONALIDAD: [DATO PENDIENTE: personalidad confirmada]`],
            ['ANTECEDENTES Y HECHOS PROBADOS', 'background', '[DATO PENDIENTE: hechos con respaldo verificable]'],
            ['VALORACIÓN DE PRUEBAS', 'evidence', evidenceText],
            ['ARGUMENTOS', 'argument', argumentText],
            ['PETITORIOS', 'petition', '[REQUIERE CONFIRMACIÓN DEL ABOGADO: consecuencia solicitada]'],
            ['FIRMA', 'signature', 'PROTESTO LO NECESARIO.\n[DATO PENDIENTE: firma de la parte promovente]'],
          ]
        : [
            ['PROEMIO', 'header', `${authority}\nEXPEDIENTE: ${expediente}\nASUNTO: ${title}`],
            ['COMPARECENCIA Y PERSONALIDAD', 'identity', `${party}\nPERSONALIDAD: [DATO PENDIENTE: personalidad confirmada]`],
            ['OBJETO DEL OFRECIMIENTO', 'argument', 'Se ofrecen únicamente los medios probatorios identificados y confirmados.'],
            ['PRUEBAS OFRECIDAS', 'evidence', evidenceText],
            ['HECHOS QUE SE PRETENDEN ACREDITAR', 'background', '[DATO PENDIENTE: relación expresa entre pruebas y hechos]'],
            ['PETITORIOS', 'petition', '[REQUIERE CONFIRMACIÓN DEL ABOGADO: peticiones del ofrecimiento]'],
            ['FIRMA', 'signature', 'PROTESTO LO NECESARIO.\n[DATO PENDIENTE: firma de la parte promovente]'],
          ];
  return entries.map(([sectionTitle, type, text], index) => buildResponseSection(
    templateId,
    sectionTitle,
    index + 1,
    doc,
    type,
    text,
  ));
}

/**
 * Estructura dedicada para la estrategia post-sentencia de amparo directo.
 * No comparte títulos, roles ni semillas con la contestación de demanda:
 * representa una postura frente a una sentencia, condicionada a preflight.
 */
export const REVISION_AMPARO_DIRECTO_SECTION_INSTRUCTIONS: Record<string, string> = {
  'sec-crad-asunto':
    'Redacta únicamente la identificación del asunto, tipo de escrito y expediente confirmados. No cambies el tipo documental ni conviertas la sentencia fuente en una demanda.',
  'sec-crad-comparecencia':
    'Redacta la comparecencia de la parte promovente o recurrente confirmada. Si está anonimizada, conserva [DATO ANONIMIZADO: ...] y solicita confirmación; no sustituyas el nombre con el de una autoridad o tribunal.',
  'sec-crad-sentencia':
    'Identifica exclusivamente la sentencia o ejecutoria de amparo directo que conste en las fuentes, con sus datos verificables. Si no se identifica alguna consideración, usa [DATO PENDIENTE DE EXPEDIENTE: ...].',
  'sec-crad-antecedentes':
    'Ordena solo los antecedentes procesales que tengan referencia en las fuentes. No completes fechas, actos o plazos por inferencia.',
  'sec-crad-cuestion':
    'Expón únicamente la cuestión constitucional y el interés excepcional aportados o respaldados por una referencia verificable. Si no existen, deja constancia de la necesidad de confirmación profesional.',
  'sec-crad-agravios':
    'Desarrolla agravios o argumentos únicamente desde la sentencia y los planteamientos confirmados. No inventes procedencia, normas, precedentes, plazos ni efectos.',
  'sec-crad-fundamentos':
    'Incluye solo fundamentos jurídicos que estén en las fuentes, en datos del abogado o en fuentes verificadas; no rellenes con artículos no confirmados.',
  'sec-crad-petitorios':
    'Formula peticiones congruentes con un escrito post-sentencia y condicionadas a la procedencia que determine la autoridad competente. No solicites efectos no sustentados.',
  'sec-crad-cierre':
    'Cierra con protesta, lugar y fecha pendientes si no constan, y la firma de la parte promovente o recurrente confirmada. Nunca firmes por la autoridad emisora.',
};

function revisionParty(doc: UniversalLegalDocument): string {
  return formatCaseContextField(
    doc.caseContext,
    'promovente',
    doc.parties.quejoso || doc.parties.actor || '[DATO PENDIENTE DE EXPEDIENTE: Nombre de la parte promovente o recurrente]',
  );
}

function revisionCaseNumber(doc: UniversalLegalDocument, caseAnalysis?: CaseAnalysis): string {
  return doc.caseRefs.expediente || caseAnalysis?.caseNumbers.principal || '[DATO PENDIENTE DE EXPEDIENTE: Número de expediente o amparo directo]';
}

const ORDINALS = [
  'PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO',
  'SEXTO', 'SÉPTIMO', 'OCTAVO', 'NOVENO', 'DÉCIMO',
  'DÉCIMO PRIMERO', 'DÉCIMO SEGUNDO', 'DÉCIMO TERCERO', 'DÉCIMO CUARTO', 'DÉCIMO QUINTO',
];

export function formatIndividualAgravio(axis: ArgumentAxis, index: number, caseAnalysis?: CaseAnalysis): string {
  const ord = ORDINALS[index] || `${index + 1}º`;
  const header = `AGRAVIO ${ord}. ${axis.title.toUpperCase()}`;
  const sections: string[] = [header];

  if (axis.issue) {
    sections.push(`PLANTEAMIENTO:\n${axis.issue}`);
  }
  if (axis.rules?.length) {
    sections.push(`PRECEPTOS VULNERADOS Y PARÁMETRO DE CONTROL:\n${axis.rules.join(', ')}`);
  }
  if (axis.facts?.length) {
    sections.push(`HECHOS RELEVANTES:\n${axis.facts.join('\n')}`);
  }
  if (axis.reasoning) {
    sections.push(`RAZONAMIENTO JURÍDICO:\n${axis.reasoning}`);
  }
  if (axis.counterargument && axis.rebuttal) {
    sections.push(`CONTRASTE CON EL CRITERIO RECURRIDO:\nFrente a lo sostenido de que "${axis.counterargument}", esta parte demuestra que ${axis.rebuttal}`);
  }
  if (axis.sources?.length) {
    const sourceRefs = axis.sources
      .map((s) => `[FUENTE: ${s.documentId || 'expediente'}${s.page ? `, página ${s.page}` : ''}${s.excerpt ? ` — "${s.excerpt}"` : ''}]`)
      .join('\n');
    sections.push(`SUSTENTO Y TRAZABILIDAD:\n${sourceRefs}`);
  }
  if (axis.requestedConsequence) {
    sections.push(`EFECTO Y CONSECUENCIA SOLICITADA:\n${axis.requestedConsequence}`);
  }

  return sections.join('\n\n');
}

function sourceBackedIssueText(caseAnalysis?: CaseAnalysis): string {
  const issues = caseAnalysis?.proceduralPosture?.constitutionalIssues || [];
  if (issues.length > 0) {
    const formatted = issues.map((issue, idx) => {
      const parts: string[] = [];
      const ord = issues.length > 1 ? `PLANTEAMIENTO CONSTITUCIONAL ${idx + 1}: ` : '';
      parts.push(`${ord}${issue.title.toUpperCase()}`);
      if (issue.parameter) parts.push(`PARÁMETRO CONSTITUCIONAL / CONVENCIONAL:\n${issue.parameter}`);
      if (issue.challengedAct) parts.push(`ACTO O RESOLUCIÓN MATERIA DEL PLANTEAMIENTO:\n${issue.challengedAct}`);
      if (issue.contradiction) parts.push(`CONTRADICCIÓN CON EL ORDEN SUPREMO:\n${issue.contradiction}`);
      if (issue.affectation) parts.push(`AFECTACIÓN A DERECHOS FUNDAMENTALES:\n${issue.affectation}`);
      if (issue.consequence) parts.push(`TRASCENDENCIA Y CONSECUENCIA SOLICITADA:\n${issue.consequence}`);
      if (issue.sourceDoc || issue.page || issue.excerpt) {
        const src = `[FUENTE: ${issue.sourceDoc || 'expediente'}${issue.page ? `, página ${issue.page}` : ''}${issue.excerpt ? ` — "${issue.excerpt}"` : ''}]`;
        parts.push(`TRAZABILIDAD EN AUTOS:\n${src}`);
      }
      return parts.join('\n\n');
    });
    return formatted.join('\n\n---\n\n');
  }

  // Fallback: desarrollar desde caseTheory si existe
  const theory = caseAnalysis?.caseTheory;
  if (theory?.constitutionalTheory || theory?.legalTheory) {
    const developed: string[] = [];
    if (theory.constitutionalTheory) {
      developed.push(`PLANTEAMIENTO CONSTITUCIONAL IDENTIFICADO EN LAS FUENTES:\n${theory.constitutionalTheory}`);
    }
    if (theory.legalTheory) {
      developed.push(`MARCO NORMATIVO APLICABLE:\n${theory.legalTheory}`);
    }
    if (theory.factualTheory) {
      developed.push(`CONTROVERSIA SUBYACENTE:\n${theory.factualTheory}`);
    }
    return developed.join('\n\n') + '\n\n[PENDIENTE DE REVISIÓN: confirmar la cuestión constitucional y el interés excepcional con el abogado]';
  }

  return '[DATO PENDIENTE DE EXPEDIENTE: Cuestión constitucional e interés excepcional confirmados]';
}

function sourceBackedArguments(caseAnalysis?: CaseAnalysis): string {
  // 1. Ejes argumentativos disponibles (individualizados con formato forense)
  const axes = caseAnalysis?.argumentAxes || [];
  if (axes.length > 0) {
    return axes.map((axis, i) => formatIndividualAgravio(axis, i, caseAnalysis)).join('\n\n=========================================\n\n');
  }

  // 2. Desarrollar desde caseTheory + challengedActs + rulings
  const theory = caseAnalysis?.caseTheory;
  const hasSubstance = theory?.factualTheory || theory?.legalTheory || theory?.constitutionalTheory
    || caseAnalysis?.challengedActs?.length || caseAnalysis?.rulings?.length;
  if (hasSubstance) {
    const parts: string[] = [];
    if (theory?.factualTheory) {
      parts.push(`PLANTEAMIENTO FÁCTICO:\n${theory.factualTheory}`);
    }
    if (caseAnalysis?.challengedActs?.length) {
      parts.push(`ACTOS IMPUGNADOS:\n${caseAnalysis.challengedActs.map((act) => `${act.authority}: ${act.actDescription}`).join('\n')}`);
    }
    if (theory?.constitutionalTheory) {
      parts.push(`AGRAVIO CONSTITUCIONAL IDENTIFICADO:\n${theory.constitutionalTheory}`);
    }
    if (theory?.legalTheory) {
      parts.push(`SUSTENTO NORMATIVO DEL AGRAVIO:\n${theory.legalTheory}`);
    }
    if (caseAnalysis?.rulings?.length) {
      parts.push(`RESOLUCIÓN IMPUGNADA:\n${caseAnalysis.rulings.map((r) => [r.body, r.date, r.rulingText].filter(Boolean).join(' — ')).join('\n')}`);
    }
    return `AGRAVIO PRIMERO. PLANTEAMIENTO INTEGRAL DE AGRAVIOS\n\n${parts.join('\n\n')}\n\n[REQUIERE INSTRUCCIÓN DEL ABOGADO: individualizar y confirmar cada agravio con su sustento procesal]`;
  }

  return '[REQUIERE INSTRUCCIÓN DEL ABOGADO: aportar o confirmar los agravios/argumentos con referencia verificable]';
}

export function buildVerifiedLegalGroundsText(
  doc: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis,
): string {
  const sections: string[] = [];

  // 1. Criterios jurisprudenciales verificados (con rubro, registro y texto)
  const citations = caseAnalysis?.citations || [];
  if (citations.length > 0) {
    const citsText = citations.map((c) => {
      const parts: string[] = [];
      if (c.rubro) parts.push(`RUBRO: ${c.rubro}`);
      if (c.registro) parts.push(`REGISTRO DIGITAL: ${c.registro}`);
      if (c.texto) parts.push(`TEXTO: ${c.texto}`);
      return parts.join('\n');
    }).join('\n\n');
    sections.push(`CRITERIOS JURISPRUDENCIALES VERIFICADOS:\n${citsText}`);
  }

  // 2. Parámetro constitucional y convencional
  const constTheory = caseAnalysis?.caseTheory?.constitutionalTheory;
  if (constTheory) {
    sections.push(`PARÁMETRO CONSTITUCIONAL Y CONVENCIONAL:\n${constTheory}`);
  }

  // 3. Fundamento legal y procesal verificado en las fuentes
  const legalTheory = caseAnalysis?.caseTheory?.legalTheory;
  const docBasis = doc.legalBasis || [];
  const axisRules = Array.from(new Set((caseAnalysis?.argumentAxes || []).flatMap((a) => a.rules || [])));
  const allNorms = Array.from(new Set([
    ...docBasis,
    ...(legalTheory ? [legalTheory] : []),
    ...axisRules,
  ])).filter(Boolean);

  if (allNorms.length > 0) {
    sections.push(`FUNDAMENTO LEGAL Y PROCESAL APLICABLE:\n${allNorms.map((n, i) => `${i + 1}. ${n}`).join('\n')}`);
  }

  if (sections.length === 0) {
    return '[DATO PENDIENTE DE EXPEDIENTE: Fundamentos jurídicos sustentados]';
  }

  return sections.join('\n\n');
}

export function buildRevisionAmparoDirectoSkeleton(
  doc: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis,
  templateId = doc.documentType || 'contestacion_revision_extraordinaria_amparo_directo',
): DocumentNode[] {
  const caseNumber = revisionCaseNumber(doc, caseAnalysis);
  const party = revisionParty(doc);
  const authority = doc.parties.autoridadResponsable || caseAnalysis?.authorities?.[0] || '[DATO PENDIENTE DE EXPEDIENTE: Órgano competente o autoridad emisora]';
  const resolution = caseAnalysis?.rulings?.length
    ? caseAnalysis.rulings.map((ruling) => [ruling.body, ruling.date, ruling.rulingText].filter(Boolean).join(' — ')).join('\n')
    : caseAnalysis?.challengedActs?.length
      ? caseAnalysis.challengedActs.map((act) => `${act.authority}: ${act.actDescription}`).join('\n')
      : 'La fuente identifica una sentencia o ejecutoria de amparo directo; sus consideraciones deberán verificarse directamente en las constancias.';
  const antecedents = caseAnalysis?.proceduralTimeline?.length
    ? caseAnalysis.proceduralTimeline.map((event) => `${event.date}: ${event.event} [FUENTE: ${event.sourceDocument}${event.page ? `, página ${event.page}` : ''}]`).join('\n')
    : '[DATO PENDIENTE DE EXPEDIENTE: Antecedentes procesales verificables]';
  const grounds = buildVerifiedLegalGroundsText(doc, caseAnalysis);

  return [
    mkSection(templateId, 'sec-crad-asunto', 'header', 'IDENTIFICACIÓN DEL ASUNTO', 1, `TIPO DE ESCRITO: contestación / revisión extraordinaria frente a sentencia de amparo directo\nEXPEDIENTE O AMPARO DIRECTO: ${caseNumber}\nAUTORIDAD O ÓRGANO IDENTIFICADO: ${authority}`),
    mkSection(templateId, 'sec-crad-comparecencia', 'identity', 'COMPARECENCIA Y PERSONALIDAD', 2, `${party}, en carácter de parte promovente o recurrente, comparece ante la autoridad competente.\nPERSONALIDAD: [DATO PENDIENTE DE EXPEDIENTE: Personalidad y representación]`),
    mkSection(templateId, 'sec-crad-sentencia', 'background', 'SENTENCIA DE AMPARO DIRECTO IMPUGNADA', 3, `EXPEDIENTE: ${caseNumber}\n${resolution}`),
    mkSection(templateId, 'sec-crad-antecedentes', 'background', 'ANTECEDENTES PROCESALES', 4, antecedents),
    mkSection(templateId, 'sec-crad-cuestion', 'legal_grounds', 'CUESTIÓN CONSTITUCIONAL Y/O PLANTEAMIENTO EXTRAORDINARIO', 5, sourceBackedIssueText(caseAnalysis)),
    mkSection(templateId, 'sec-crad-agravios', 'argument', 'AGRAVIOS / ARGUMENTOS', 6, sourceBackedArguments(caseAnalysis)),
    mkSection(templateId, 'sec-crad-fundamentos', 'legal_grounds', 'FUNDAMENTOS SUSTENTADOS', 7, grounds),
    mkSection(templateId, 'sec-crad-petitorios', 'petition', 'PETITORIOS', 8, `PRIMERO. Tener por presentado el presente escrito de revisión extraordinaria y por hechas valer las manifestaciones que en él se contienen.\nSEGUNDO. Admitir a trámite el recurso de revisión interpuesto contra la sentencia de amparo directo ${caseNumber}.\nTERCERO. Declarar fundados los agravios expuestos y, en consecuencia, dejar insubsistente la ejecutoria recurrida.\nCUARTO. En su caso, devolver los autos al tribunal de origen para que, purgando los vicios señalados, dicte nueva resolución conforme a los lineamientos que se establezcan.\nQUINTO. Lo demás que en derecho proceda.`),
    mkSection(templateId, 'sec-crad-cierre', 'signature', 'CIERRE Y FIRMA', 9, `PROTESTO LO NECESARIO.\nLUGAR Y FECHA: [DATO PENDIENTE DE EXPEDIENTE: Lugar y fecha de presentación]\n\n_________________________________________\n${party}`),
  ];
}

export function getRevisionAmparoDirectoSectionText(
  doc: UniversalLegalDocument,
  title: string,
  caseAnalysis?: CaseAnalysis,
): string {
  const skeleton = buildRevisionAmparoDirectoSkeleton(doc, caseAnalysis, doc.documentType);
  const exact = skeleton.find((section) => section.title === title);
  if (exact) return exact.content.map((block) => block.text).join('\n\n');

  // Búsqueda flexible por familia temática de sección
  const tKey = title.toLowerCase();
  const fuzzy = skeleton.find((s) => {
    const sKey = s.title.toLowerCase();
    if (/agravio/i.test(tKey) && /agravio/i.test(sKey)) return true;
    if (/cuesti[oó]n/i.test(tKey) && /cuesti[oó]n/i.test(sKey)) return true;
    if (/fundamento/i.test(tKey) && /fundamento/i.test(sKey)) return true;
    if (/antecedente/i.test(tKey) && /antecedente/i.test(sKey)) return true;
    if (/sentencia/i.test(tKey) && /sentencia/i.test(sKey)) return true;
    return false;
  });
  if (fuzzy) return fuzzy.content.map((block) => block.text).join('\n\n');

  return `[DATO PENDIENTE DE EXPEDIENTE: Contenido de ${title}]`;
}
