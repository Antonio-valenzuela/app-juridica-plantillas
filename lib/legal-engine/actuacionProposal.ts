import { canGenerateDocumentDraft } from '@/lib/catalog/legalCatalog';
import { isUnreadablePageText } from './extractionCoverage';
import { deriveProvisionalAppealConfirmation, extractAppealResolutionReview, isCivilFamilyAppeal, resolveAppealGeneration, selectAppealSources } from './case-extraction/appealResolutionReview';
import { classifyMatter } from './matterClassification';
import { describeAct, proceduralActsOf, RESOLUTION_KINDS, type ProceduralAct, type ProceduralActKind } from './proceduralActs';
import { evaluateSourceOutputCompatibility, inferSourceOutputType } from './sourceOutputCompatibility';
import type { UploadedSourceDocument } from './types';

/**
 * Propuesta de actuación a partir del documento oficial cargado.
 *
 * No bloquea por tipo desconocido: ofrece las vías posibles, su motivo y los datos que el abogado debe
 * confirmar (manual operativo, págs. 154–158: procedimientos para contestaciones, promociones, recursos,
 * incidentes, amparo y escritos de trámite). Nunca afirma que un recurso procede: lo presenta como
 * «posible» con las verificaciones previas. Solo propone tipos generables y compatibles con la fuente.
 */

export type ActuacionStatus = 'CORRESPONDE' | 'POSIBLE';
export type ActuacionFamily = 'CONTESTACION' | 'RECURSO' | 'AMPARO' | 'PROMOCION' | 'INCIDENTE' | 'LIBRE';

export interface ActuacionCandidate {
  documentType: string;
  label: string;
  family: ActuacionFamily;
  status: ActuacionStatus;
  rationale: string;
  toConfirm: string[];
}

export interface ExtractionQuality {
  totalPages: number;
  pagesWithText: number;
  unreadablePages: number[];
  ocrUsed: boolean;
  complete: boolean;
  notice?: string;
}

export interface ActuacionProposal {
  detected: {
    kind: ProceduralActKind;
    label: string;
    matter: string;
    confidence: number;
    evidence?: string;
    pages?: { start: number; end: number };
    otherActs: Array<{ kind: ProceduralActKind; label: string; start: number; end: number }>;
  };
  candidates: ActuacionCandidate[];
  /** Actuación propuesta para preseleccionar; null si el abogado debe elegir. */
  recommended: string | null;
  /** Debe confirmarse antes de generar (procedencia no evidente o tipo incierto). */
  requiresConfirmation: boolean;
  extraction: ExtractionQuality;
}

const LABELS: Record<string, string> = {
  contestacion_demanda_civil: 'Contestación de demanda civil',
  contestacion_demanda_mercantil: 'Contestación de demanda mercantil',
  contestacion_demanda_laboral: 'Contestación de demanda laboral',
  contestacion_divorcio: 'Contestación de demanda de divorcio',
  contestacion_alimentos: 'Contestación de demanda de alimentos',
  contestacion_guarda_custodia: 'Contestación de demanda de guarda y custodia',
  contestacion_nulidad_administrativa: 'Contestación de demanda de nulidad administrativa',
  contestacion_nulidad_fiscal: 'Contestación de demanda de nulidad fiscal',
  contestacion_demanda_agraria: 'Contestación de demanda agraria',
  contestacion_reconvencion_civil: 'Contestación a la reconvención (civil)',
  contestacion_reconvencion_mercantil: 'Contestación a la reconvención (mercantil)',
  contestacion_reconvencion_laboral: 'Contestación a la reconvención (laboral)',
  replica: 'Réplica',
  apelacion_civil: 'Recurso de apelación (civil)',
  apelacion_familiar: 'Recurso de apelación (familiar)',
  apelacion_mercantil: 'Recurso de apelación (mercantil)',
  apelacion_penal: 'Recurso de apelación (penal)',
  revocacion_civil: 'Recurso de revocación (civil / familiar)',
  revocacion_mercantil: 'Recurso de revocación (mercantil)',
  queja_civil: 'Recurso de queja (civil)',
  demanda_amparo_directo: 'Demanda de amparo directo',
  demanda_amparo_indirecto: 'Demanda de amparo indirecto',
  recurso_revision_amparo: 'Recurso de revisión en amparo indirecto',
  recurso_revision_amparo_directo: 'Recurso de revisión en amparo directo',
  recurso_queja_amparo: 'Recurso de queja en amparo',
  recurso_revision_fiscal: 'Recurso de revisión fiscal',
  desahogo_vista_civil: 'Desahogo de vista',
  desahogo_prevencion: 'Desahogo de prevención',
  desahogo_prevencion_laboral: 'Desahogo de prevención (laboral)',
  promocion_simple: 'Promoción (cumplimiento de requerimiento o petición de trámite)',
  incidente_procesal: 'Incidente procesal / de nulidad',
  alegatos_amparo: 'Alegatos en amparo',
  redaccion_libre: 'Redacción libre con instrucción directa',
};

const FAMILY: Array<[RegExp, ActuacionFamily]> = [
  [/^contestacion_/, 'CONTESTACION'],
  [/amparo/, 'AMPARO'],
  [/^(apelacion_|revocacion_|queja_|recurso_)/, 'RECURSO'],
  [/^(desahogo_|promocion_)/, 'PROMOCION'],
  [/^incidente_/, 'INCIDENTE'],
];
const familyOf = (type: string): ActuacionFamily => FAMILY.find(([pattern]) => pattern.test(type))?.[1] ?? 'LIBRE';

/** Verificaciones previas del manual por familia (págs. 154–158). */
const CONFIRMATIONS: Record<ActuacionFamily, string[]> = {
  CONTESTACION: ['Fecha del emplazamiento y plazo para contestar', 'Postura sobre cada hecho y prestación (admitir, negar o controvertir)', 'Excepciones y defensas que se opondrán'],
  RECURSO: ['Fecha de la resolución y de su notificación', 'Plazo para interponer (Cómputo de Términos)', 'Que el recurso proceda contra esta resolución conforme al código aplicable', 'Legitimación de quien recurre y autoridad ante quien se interpone'],
  AMPARO: ['Acto reclamado y autoridad responsable', 'Tercero interesado', 'Oportunidad: fecha de notificación o conocimiento y plazo', 'Definitividad: que no proceda un recurso ordinario previo'],
  PROMOCION: ['Qué se solicita exactamente y el antecedente indispensable', 'Plazo concedido en el acuerdo, si lo hay'],
  INCIDENTE: ['Cuestión incidental concreta', 'Momento procesal y vía incidental', 'Pruebas necesarias'],
  LIBRE: ['Instrucción directa: qué debe contener el escrito'],
};

function candidate(documentType: string, status: ActuacionStatus, rationale: string, extra: string[] = []): ActuacionCandidate {
  const family = familyOf(documentType);
  return { documentType, label: LABELS[documentType] ?? documentType, family, status, rationale, toConfirm: [...extra, ...CONFIRMATIONS[family]] };
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Acto que orienta la actuación: la resolución más reciente si la hay; si no, la demanda u otro escrito. */
function controllingAct(acts: ProceduralAct[]): ProceduralAct | null {
  const resolutions = acts.filter((act) => RESOLUTION_KINDS.includes(act.kind));
  if (resolutions.length) return resolutions[resolutions.length - 1];
  return acts.find((act) => act.kind === 'DEMANDA') ?? acts.find((act) => act.kind !== 'CONSTANCIA_O_ANEXO' && act.kind !== 'DESCONOCIDO') ?? acts[0] ?? null;
}

function contestacionFor(matter: string, text: string): ActuacionCandidate[] {
  const t = fold(text);
  switch (matter) {
    case 'LABORAL': return [candidate('contestacion_demanda_laboral', 'CORRESPONDE', 'El documento es una demanda laboral: corresponde contestarla.')];
    case 'MERCANTIL': return [candidate('contestacion_demanda_mercantil', 'CORRESPONDE', 'El documento es una demanda mercantil: corresponde contestarla.')];
    case 'ADMINISTRATIVA': return [candidate('contestacion_nulidad_administrativa', 'CORRESPONDE', 'El documento es una demanda de nulidad administrativa.')];
    case 'FISCAL': return [candidate('contestacion_nulidad_fiscal', 'CORRESPONDE', 'El documento es una demanda de nulidad fiscal.')];
    case 'AGRARIA': return [candidate('contestacion_demanda_agraria', 'CORRESPONDE', 'El documento es una demanda agraria.')];
    case 'FAMILIAR': {
      const specific: ActuacionCandidate[] = [];
      if (/divorcio/.test(t)) specific.push(candidate('contestacion_divorcio', 'CORRESPONDE', 'La demanda familiar versa sobre divorcio.'));
      if (/alimentos|pension alimenticia/.test(t)) specific.push(candidate('contestacion_alimentos', specific.length ? 'POSIBLE' : 'CORRESPONDE', 'La demanda incluye pretensiones de alimentos.'));
      if (/guarda|custodia/.test(t)) specific.push(candidate('contestacion_guarda_custodia', specific.length ? 'POSIBLE' : 'CORRESPONDE', 'La demanda incluye guarda y custodia.'));
      return specific.length ? specific : [candidate('contestacion_demanda_civil', 'POSIBLE', 'Demanda familiar sin subtipo claro: contestación con estructura civil, a confirmar.')];
    }
    default: return [candidate('contestacion_demanda_civil', 'CORRESPONDE', 'El documento es una demanda civil: corresponde contestarla.')];
  }
}

function recursosAgainstResolution(act: ProceduralAct, matter: string, sourceType: string, text: string): ActuacionCandidate[] {
  const t = fold(text);
  const apelacion = matter === 'FAMILIAR' ? 'apelacion_familiar' : matter === 'MERCANTIL' ? 'apelacion_mercantil' : matter === 'PENAL' ? 'apelacion_penal' : 'apelacion_civil';
  const revocacion = matter === 'MERCANTIL' ? 'revocacion_mercantil' : 'revocacion_civil';
  const amparoIndirecto = candidate('demanda_amparo_indirecto', 'POSIBLE', 'Solo si el acto es de imposible reparación o ya se agotaron los recursos ordinarios.');
  // Autos y acuerdos dictados DENTRO del juicio de amparo: sus medios son los de la Ley de Amparo, no los del
  // juicio ordinario (apelación, revocación).
  const insideAmparo = act.kind !== 'SENTENCIA_AMPARO' && /\b(?:juicio\s+de\s+amparo|amparo\s+indirecto)\b/.test(t) && /\bjuzgado\s+\S+\s+de\s+distrito\b/.test(t);
  if (insideAmparo && (act.kind === 'ACUERDO_TRAMITE' || act.kind === 'AUTO_INTERLOCUTORIO')) {
    return [
      candidate('recurso_queja_amparo', 'POSIBLE', 'Acuerdo o auto del juicio de amparo (p. ej. sobre la suspensión provisional o el trámite): la vía usual es la queja.'),
      candidate('recurso_revision_amparo', 'POSIBLE', 'Si se trata de la interlocutoria que resuelve la suspensión definitiva o de otra resolución revisable.'),
    ];
  }
  switch (act.kind) {
    case 'SENTENCIA_AMPARO': {
      const directo = sourceType === 'SENTENCIA_AMPARO_DIRECTO' || /amparo directo|tribunal colegiado/.test(t);
      return directo
        ? [candidate('recurso_revision_amparo_directo', 'POSIBLE', 'Sentencia de amparo directo: la revisión solo procede de forma excepcional (cuestiones de constitucionalidad).', ['Que subsista una cuestión de constitucionalidad de importancia y trascendencia'])]
        : [candidate('recurso_revision_amparo', 'POSIBLE', 'Sentencia de amparo indirecto: es impugnable mediante revisión.'), candidate('recurso_queja_amparo', 'POSIBLE', 'Si lo impugnado es un acuerdo sobre suspensión o trámite del juicio de amparo.')];
    }
    case 'LAUDO':
      return [candidate('demanda_amparo_directo', 'POSIBLE', 'Un laudo o sentencia laboral definitiva se impugna por amparo directo.')];
    case 'SENTENCIA_DEFINITIVA':
      if (matter === 'LABORAL') return [candidate('demanda_amparo_directo', 'POSIBLE', 'La sentencia laboral definitiva se impugna por amparo directo.')];
      if (matter === 'ADMINISTRATIVA' || matter === 'FISCAL') return [candidate('demanda_amparo_directo', 'POSIBLE', 'La sentencia de nulidad definitiva puede impugnarse por amparo directo.'), candidate('recurso_revision_fiscal', 'POSIBLE', 'Solo si quien recurre es la autoridad demandada.')];
      return [
        candidate(apelacion, 'POSIBLE', 'Sentencia definitiva de primera instancia: la vía ordinaria suele ser la apelación.', ['Que la sentencia sea apelable (cuantía, tipo de juicio y código aplicable: local o Código Nacional de Procedimientos Civiles y Familiares)']),
        candidate('demanda_amparo_directo', 'POSIBLE', 'Si la sentencia ya no admite recurso ordinario (p. ej. es de segunda instancia).'),
      ];
    case 'AUTO_INTERLOCUTORIO':
      return [
        candidate(apelacion, 'POSIBLE', act.decidesIncident ? 'Auto que resuelve un incidente: puede ser apelable según el código aplicable.' : 'Auto con efectos procesales: verificar si admite apelación.', ['Si el auto es apelable o solo admite revocación conforme al código aplicable']),
        candidate(revocacion, 'POSIBLE', 'Si el auto no admite apelación, la vía usual es la revocación ante el mismo juez.'),
        amparoIndirecto,
      ];
    case 'ACUERDO_TRAMITE': {
      const out: ActuacionCandidate[] = [];
      if (/se da vista|dese vista|vista a la (?:parte|contraria)|para que manifieste/.test(t)) out.push(candidate('desahogo_vista_civil', 'CORRESPONDE', 'El acuerdo da vista a la parte para manifestar lo que a su derecho convenga.'));
      if (/se previene|\bprevencion\b/.test(t)) out.push(candidate(matter === 'LABORAL' ? 'desahogo_prevencion_laboral' : 'desahogo_prevencion', out.length ? 'POSIBLE' : 'CORRESPONDE', 'El acuerdo contiene una prevención que debe desahogarse.'));
      if (/se requiere|requierase|requerimiento/.test(t)) out.push(candidate('promocion_simple', out.length ? 'POSIBLE' : 'CORRESPONDE', 'El acuerdo formula un requerimiento que debe cumplirse por promoción.'));
      out.push(candidate(revocacion, 'POSIBLE', 'Si se pretende impugnar el acuerdo de trámite, la vía usual es la revocación.'));
      if (!out.some((item) => item.documentType === 'promocion_simple')) out.push(candidate('promocion_simple', 'POSIBLE', 'Promoción de trámite relacionada con el acuerdo.'));
      return out;
    }
    default:
      return [];
  }
}

export { isUnreadablePageText };

function extractionQuality(sources: UploadedSourceDocument[]): ExtractionQuality {
  const pages = sources.flatMap((source) => source.pages ?? []);
  const unreadable = pages.filter((page) => isUnreadablePageText(page.text)).map((page) => page.page);
  const totalPages = pages.length || sources.length;
  const ocrUsed = sources.some((source) => source.sourceQuality?.ocrUsed === true);
  const complete = unreadable.length === 0 && sources.every((source) => source.sourceQualityStatus !== 'NEEDS_SOURCE_REVIEW');
  const notice = complete ? undefined
    : unreadable.length
      ? `No se pudo leer texto en ${unreadable.length} de ${totalPages} páginas (${unreadable.slice(0, 12).join(', ')}${unreadable.length > 12 ? '…' : ''}). El borrador no se presentará como basado en el documento completo; aplica el reconocimiento de texto local o revisa esas páginas.`
      : 'La calidad de extracción requiere revisión: el borrador no se presentará como basado en el documento completo.';
  return { totalPages, pagesWithText: totalPages - unreadable.length, unreadablePages: unreadable, ocrUsed, complete, ...(notice ? { notice } : {}) };
}

function isGenerableAndCompatible(documentType: string, sources: UploadedSourceDocument[]): boolean {
  if (documentType === 'redaccion_libre') return true;
  if (!canGenerateDocumentDraft(documentType)) return false;
  try {
    // Apelaciones civil/familiar: el servidor evalúa contra la resolución a impugnar, no contra todo el PDF.
    let evaluated = sources;
    if (isCivilFamilyAppeal(documentType)) {
      const review = extractAppealResolutionReview(sources);
      const selected = resolveAppealGeneration(review, deriveProvisionalAppealConfirmation(review, {})).selected;
      if (selected) evaluated = selectAppealSources(sources, selected);
    }
    const result = evaluateSourceOutputCompatibility({ selectedDocumentType: documentType, sourceDocuments: evaluated });
    // Misma condición con la que el pipeline rechaza en el flujo de análisis de documento (NEEDS_SOURCE_REVIEW):
    // no se ofrece una vía que fallaría al generar.
    return !(result.status === 'NEEDS_INPUT' && result.code === 'SOURCE_TYPE_UNKNOWN');
  } catch {
    return false;
  }
}

export function proposeActuaciones(sources: UploadedSourceDocument[]): ActuacionProposal {
  const acts = sources.flatMap((source) => proceduralActsOf(source));
  // Escaneos con OCR ruidoso: la segmentación por encabezado puede no ver la resolución que sí detecta la revisión
  // de apelación (encabezados «AUTO:» / «SENTENCIA»). Se reconcilian para que ambas vean el mismo acto.
  {
    const review = extractAppealResolutionReview(sources);
    for (const resolution of review.resolutions) {
      if (acts.some((act) => RESOLUTION_KINDS.includes(act.kind) && act.startPage === resolution.startPage)) continue;
      const rangePages = sources.flatMap((source) => (source.pages ?? []).filter((page) => page.page >= resolution.startPage && page.page <= resolution.endPage)).map((page) => ({ page: page.page, text: page.text, chars: page.chars ?? page.text.length }));
      const text = rangePages.map((page) => page.text).join('\n');
      const matter = classifyMatter(text).matter;
      acts.push({ kind: resolution.type === 'AUTO' ? 'AUTO_INTERLOCUTORIO' : 'SENTENCIA_DEFINITIVA', startPage: resolution.startPage, endPage: resolution.endPage, pages: rangePages, matter, confidence: 0.8, evidence: 'resolución detectada por encabezado (OCR)' } as ProceduralAct);
    }
  }
  acts.sort((a, b) => a.startPage - b.startPage);
  const act = controllingAct(acts);
  const fullText = sources.map((source) => source.extractedText || source.content || (source.pages ?? []).map((page) => page.text).join('\n')).join('\n');
  const actText = act ? act.pages.map((page) => page.text).join('\n') : fullText;
  const matter = (act?.matter && act.matter !== 'NO_IDENTIFICADA' ? act.matter : classifyMatter(fullText).matter) || 'NO_IDENTIFICADA';
  const sourceType = String(inferSourceOutputType(sources));
  const kind: ProceduralActKind = act?.kind ?? 'DESCONOCIDO';

  let proposed: ActuacionCandidate[] = [];
  if (kind === 'DEMANDA') proposed = contestacionFor(matter, actText);
  else if (kind === 'CONTESTACION') {
    const reconvencion = /(?:^|\n)\s*(?:demanda\s+)?reconvencion(?:al)?\b|\bvengo\s+a\s+reconvenir\b|\bdemanda\s+reconvencional\b/.test(fold(actText));
    const reconvencionType = matter === 'MERCANTIL' ? 'contestacion_reconvencion_mercantil' : matter === 'LABORAL' ? 'contestacion_reconvencion_laboral' : 'contestacion_reconvencion_civil';
    proposed = [
      ...(reconvencion ? [candidate(reconvencionType, 'CORRESPONDE', 'La contestación incluye una reconvención: corresponde contestarla.', ['Fecha de notificación de la reconvención y plazo para contestarla'])] : []),
      candidate('replica', 'POSIBLE', 'Réplica a la contestación, si el procedimiento aplicable la prevé.'),
      candidate('desahogo_vista_civil', 'POSIBLE', 'Desahogo de la vista con la contestación, si el juzgado la dio.'),
    ];
  }
  else proposed = recursosAgainstResolution(act ?? ({ kind } as ProceduralAct), matter, sourceType, actText);

  // Vías generales siempre disponibles para que ningún documento quede sin salida.
  const general = [
    candidate('promocion_simple', 'POSIBLE', 'Promoción de trámite relacionada con el documento.'),
    candidate('incidente_procesal', 'POSIBLE', 'Si existe una cuestión incidental o una nulidad de actuaciones que plantear.'),
    candidate('redaccion_libre', 'POSIBLE', 'Escrito con instrucción directa del abogado.'),
  ];
  const seen = new Set<string>();
  const candidates = [...proposed, ...general]
    .filter((item) => !seen.has(item.documentType) && seen.add(item.documentType))
    .filter((item) => isGenerableAndCompatible(item.documentType, sources));

  // Solo se preselecciona una vía derivada del acto detectado; las vías generales nunca se preseleccionan.
  const first = candidates[0] ?? null;
  const confident = Boolean(act && act.confidence >= 0.75);
  const recommended = first && proposed.some((item) => item.documentType === first.documentType) ? first.documentType : null;
  const extraction = extractionQuality(sources);
  // Con páginas sin leer la actuación tampoco se da por segura: el abogado confirma conociendo el límite.
  const requiresConfirmation = !(first && first.status === 'CORRESPONDE' && confident && extraction.complete);

  return {
    detected: {
      kind,
      label: kind === 'DESCONOCIDO' ? 'documento no clasificado' : describeAct(kind),
      matter,
      confidence: act?.confidence ?? 0,
      ...(act?.evidence ? { evidence: act.evidence } : {}),
      ...(act ? { pages: { start: act.startPage, end: act.endPage } } : {}),
      otherActs: acts.filter((item) => item !== act && item.kind !== 'CONSTANCIA_O_ANEXO').map((item) => ({ kind: item.kind, label: describeAct(item.kind), start: item.startPage, end: item.endPage })),
    },
    candidates,
    recommended,
    requiresConfirmation,
    extraction,
  };
}
