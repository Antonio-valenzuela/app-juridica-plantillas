import type {
  AnalyzedFact,
  CaseWorkflow,
  CaseWorkflowSelection,
  GenerationReadiness,
  GenerationReadinessStatus,
  LawyerFactPosition,
  ProvenanceKind,
  WritingIntake,
  WritingIntakeField,
} from './types';
import { chooseGenerationSource } from './caseWorkflow';

const EMPTY_SOURCES = [] as WritingIntake['sourceDocuments'];

function clean(value: string | undefined): string | undefined {
  const result = value?.replace(/\s+/g, ' ').trim();
  return result || undefined;
}

function capture(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = clean(match?.[1]);
    if (value && value.length > 1) return value.replace(/[.,;]+$/, '').trim();
  }
  return undefined;
}

function extractLawyerFacts(request: string): AnalyzedFact[] {
  const facts: AnalyzedFact[] = [];
  const sentences = request
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => clean(sentence))
    .filter((sentence): sentence is string => Boolean(sentence));

  for (const sentence of sentences) {
    if (facts.length >= 20) break;
    if (/^(?:quiero|necesito|hazme|hacer|preparar|redactar|elaborar|solicito\s+que\s+se\s+redacte)\b/i.test(sentence)) continue;
    if (/\b(?:demanda|escrito|documento)\b/i.test(sentence) && !/\b(?:hecho|ocurri|sucedi|exist|solicita|entreg|recibi|pag|incumpl|requer)/i.test(sentence)) continue;
    if (!/\b(?:la|el|una|un|se|exist|ocurri|sucedi|mi|mis)\b/i.test(sentence)) continue;
    facts.push({
      id: `writing-fact-${facts.length + 1}`,
      number: String(facts.length + 1),
      text: sentence,
      sourceFact: sentence,
      confidence: 0.7,
      lawyerPosition: 'UNDEFINED' as LawyerFactPosition,
      position: 'UNDEFINED',
      response: '[REQUIERE DEFINIR POSTURA DEL ABOGADO]',
      support: [],
      supportingSources: [],
      sourceReference: { documentId: 'lawyer-input', textSnippet: sentence.slice(0, 240) },
      provenance: 'LAWYER_INPUT' as ProvenanceKind,
    });
  }
  return facts;
}

function buildReadiness(intake: Pick<WritingIntake, 'documentType' | 'matter' | 'objective' | 'representedParty' | 'counterparty' | 'facts'>): GenerationReadiness {
  const missingEssential: string[] = [];
  const pending: string[] = [];
  if (!intake.documentType || intake.documentType === 'escrito_libre') missingEssential.push('tipo de escrito');
  if (!intake.matter || intake.matter === 'general') missingEssential.push('materia o asunto');
  if (!intake.objective) missingEssential.push('objetivo o pretensión');
  if (intake.documentType === 'demanda' && !intake.representedParty) pending.push('parte representada');
  if (intake.documentType === 'demanda' && !intake.counterparty) pending.push('contraparte o demandado');
  if (intake.facts.length === 0) pending.push('hechos iniciales');
  const status: GenerationReadinessStatus = missingEssential.length > 0
    ? 'BLOCKED'
    : pending.length > 0 ? 'READY_WITH_PENDING' : 'READY';
  return { status, missingEssential, pending };
}

export function assessWritingReadiness(intake: WritingIntake): GenerationReadiness {
  const readiness = buildReadiness(intake);
  return readiness;
}

export function getDynamicIntakeFields(intake: WritingIntake): WritingIntakeField[] {
  const fields: WritingIntakeField[] = [
    { id: 'matter', label: 'Materia o asunto', type: 'text', required: true, relevant: true, value: intake.matter },
    { id: 'documentType', label: 'Tipo de escrito', type: 'text', required: true, relevant: true, value: intake.documentTypeLabel },
    { id: 'representedParty', label: 'Parte representada', type: 'text', required: intake.documentType === 'demanda', relevant: true, value: intake.representedParty, reason: 'Define quién promueve y firma.' },
    { id: 'counterparty', label: 'Contraparte', type: 'text', required: intake.documentType === 'demanda', relevant: true, value: intake.counterparty, reason: 'Define contra quién se dirige la pretensión.' },
    { id: 'objective', label: 'Objetivo o pretensión', type: 'textarea', required: true, relevant: true, value: intake.objective },
    { id: 'caseNumber', label: 'Número de expediente', type: 'text', required: false, relevant: false, value: intake.caseNumber },
  ];
  if (intake.matter === 'familiar' || /custodia|alimento|divorcio/i.test(intake.request)) {
    fields.push({ id: 'authority', label: 'Juzgado o autoridad competente', type: 'text', required: false, relevant: true, value: intake.authority, reason: 'Es relevante para el escrito familiar, pero no se inventa.' });
    fields.push({ id: 'requestedRelief', label: 'Medida o prestación solicitada', type: 'textarea', required: false, relevant: true, value: intake.requestedRelief });
  }
  return fields;
}

export function analyzeWritingRequest(request: string): WritingIntake {
  const normalized = request.toLowerCase();
  const isCustody = /guarda\s+y\s+custodia|custodia/i.test(normalized);
  const isDemand = /\bdemanda\b|demandar/i.test(normalized);
  const matter = isCustody ? 'familiar' : /amparo|constitucional/i.test(normalized) ? 'constitucional' : /laboral/i.test(normalized) ? 'laboral' : /civil/i.test(normalized) ? 'civil' : /mercantil/i.test(normalized) ? 'mercantil' : 'general';
  const documentType = isDemand ? 'demanda' : /promoci[oó]n|escrito/i.test(normalized) ? 'promocion' : 'escrito_libre';
  const documentTypeLabel = isCustody ? 'Demanda de guarda y custodia' : documentType === 'demanda' ? 'Demanda Inicial' : 'Escrito Libre';
  const objective = capture(request, [
    /\b(?:objetivo\s+y\s+pretensiones|objetivo|pretensiones)\s*[:\-]\s*([^.!?\n]+)/i,
    /\b(?:para|con el objeto de|a fin de)\s+([^.!?\n]+)/i,
    /\b(?:solicita(?:r)?|pretende)\s+([^.!?\n]+)/i,
  ]);
  const representedParty = capture(request, [
    /\b(?:parte\s+promovente|promovente|actor|parte\s+representada)\s*[:\-]\s*([^,.!?\n]+)/i,
    /\b(?:por|para)\s+(?:la parte|el señor|la señora)?\s*([A-ZÁÉÍÓÚÑ][^,.!?\n]{2,70})/,
    /\b(?:mi cliente|parte representada)\s*[:\-]\s*([^,.!?\n]+)/i,
  ]);
  const counterparty = capture(request, [
    /\b(?:contraparte|demandado|autoridad)\s*[:\-]\s*([^,.!?\n]+)/i,
    /\b(?:contra|frente a|en contra de)\s+(?!acto\b)([^,.!?\n]+)/i,
    /\b(?:demandando a|demandado)\s*[:\-]?\s*([^,.!?\n]+)/i,
  ]);
  const requestedRelief = objective;
  const facts = extractLawyerFacts(request);
  const base = {
    flow: 'NEW_WRITING' as const,
    sourceDocuments: EMPTY_SOURCES,
    request: request.trim(),
    matter,
    documentType,
    documentTypeLabel,
    jurisdiction: clean(capture(request, [/jurisdicci[oó]n\s*[:\-]\s*([^,.!?\n]+)/i])),
    representedParty,
    counterparty,
    authority: clean(capture(request, [/\b(?:juzgado|autoridad)\s*[:\-]\s*([^,.!?\n]+)/i])),
    objective,
    requestedRelief,
    caseNumber: clean(capture(request, [/\b(?:expediente|exp)\s*[:\-]\s*([^,.!?\n]+)/i])),
    facts,
    evidence: (() => {
      const value = capture(request, [/\bpruebas\s+confirmadas\s*[:\-]\s*([^.!?\n]+)/i]);
      return value ? [{ id: 'writing-evidence-1', type: 'PRUEBA APORTADA POR EL ABOGADO', description: value, confirmed: true, provenance: 'LAWYER_CONFIRMED' as ProvenanceKind }] : [];
    })(),
    fields: [] as WritingIntakeField[],
    pending: [] as string[],
    readiness: { status: 'BLOCKED' as const, missingEssential: [], pending: [] },
  };
  const readiness = buildReadiness(base);
  return { ...base, fields: getDynamicIntakeFields({ ...base, readiness, fields: [] }), pending: [...readiness.missingEssential, ...readiness.pending], readiness };
}

export function buildWritingWorkflow(
  intake: WritingIntake,
  selection: CaseWorkflowSelection = { mode: 'automatic' },
): CaseWorkflow {
  const normalizedSelection = chooseGenerationSource(selection);
  const analysis = {
    parties: { actor: intake.representedParty, demandado: intake.counterparty, autoridadResponsable: intake.authority },
    authorities: intake.authority ? [intake.authority] : [],
    caseNumbers: { principal: intake.caseNumber },
    proceduralTimeline: [],
    challengedActs: [],
    claims: intake.requestedRelief ? [intake.requestedRelief] : [],
    claimResponses: [],
    arguments: [],
    evidence: intake.evidence.filter((item) => item.confirmed).map((item) => ({ ...item, type: item.type || 'PRUEBA POR DEFINIR' })),
    facts: intake.facts,
    rulings: [],
    citations: [],
    proceduralPosture: { proceduralWrit: intake.documentType, isExtraordinary: false, constitutionalIssues: [], legalityIssues: [], exceptionalInterest: null },
    caseTheory: { factualTheory: '', legalTheory: '', constitutionalTheory: '', proceduralTheory: '', opposingTheory: '', vulnerabilities: [], strengths: [] },
    argumentAxes: [],
    missingData: intake.pending,
    unsupportedClaims: [],
  };
  return {
    sourceDocuments: [],
    analysis,
    selection: normalizedSelection,
    flow: 'NEW_WRITING',
    intake,
    readiness: intake.readiness,
    updatedAt: new Date().toISOString(),
  };
}
