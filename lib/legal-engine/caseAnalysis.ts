import { AnalyzedClaim, AnalyzedFact, SourceReference, UploadedSourceDocument } from './types';
import type { RichCaseAnalysis } from './case-extraction/types';
import {
  extractAnonymizedField,
  extractPartyField,
  extractAuthorityLabeled,
  extractInstitutionalAuthority,
  extractResolvingCourt,
} from './partyExtraction';
import { deduplicateLegalIssues } from './coverageMatrix';
import { extractRichCaseAnalysis, type RichExtractionOptions } from './case-extraction/orchestrator';
import { projectRichCaseAnalysis } from './case-extraction/legacyProjection';

export interface ProceduralTimelineEvent {
  date: string;
  event: string;
  sourceDocument: string;
  page?: number;
  excerpt?: string;
  certainty: number;
}

export interface ChallengedAct {
  authority: string;
  actDate?: string;
  actDescription: string;
  page?: number;
  excerpt?: string;
}

export interface ChallengedReasoning {
  id: string;
  number: string;
  topic?: string;
  rulingText: string;
  page?: number;
  sourceReference?: SourceReference;
  relatedIssueIds?: string[];
}

/**
 * Roles institucionales del trámite, separados de las partes y de las
 * autoridades citadas como fuente. Cada valor debe provenir de una captura
 * explícita o de una confirmación profesional; la ausencia permanece como
 * `undefined`.
 */
export interface ProceduralAuthorityRoles {
  sourceAuthority?: string;
  organoResolucionRecurrida?: string;
  autoridadDestinataria?: string;
  organoPresentacion?: string;
}

export interface LegalIssue {
  id: string;
  type: 'CONSTITUTIONAL' | 'LEGALITY' | 'PROCEDURAL' | 'CONVENTIONAL';
  category?: 'CONSTITUTIONAL' | 'LEGALITY' | 'PROCEDURAL' | 'CONVENTIONAL' | string;
  title: string;
  parameter: string; // Precepto constitucional / convencional o norma aplicable
  challengedAct: string;
  contradiction: string;
  affectation: string;
  consequence: string;
  sourceDoc?: string;
  page?: number;
  excerpt?: string;
  relatedFactIds?: string[];
  relatedClaimIds?: string[];
  relatedEvidenceIds?: string[];
  relatedChallengedReasoningIds?: string[];
  canonicalKey?: string;
}

export interface CaseTheory {
  factualTheory: string;
  legalTheory: string;
  constitutionalTheory: string;
  proceduralTheory: string;
  opposingTheory: string;
  vulnerabilities: string[];
  strengths: string[];
}

export interface ArgumentAxis {
  id: string;
  title: string;
  issue: string;
  facts: string[];
  rules: string[];
  reasoning: string;
  counterargument: string;
  rebuttal: string;
  requestedConsequence: string;
  sources: Array<{
    documentId?: string;
    page?: number;
    excerpt?: string;
  }>;
}

export interface CaseAnalysis {
  parties: {
    quejoso?: string;
    actor?: string;
    demandado?: string;
    autoridadResponsable?: string;
    terceroInteresado?: string;
    abogados?: string[];
  };
  authorities: string[];
  caseNumbers: {
    principal?: string;
    amparoDirecto?: string;
    amparoIndirecto?: string;
    toca?: string;
    juicioLaboral?: string;
    expedienteOrigen?: string;
  };
  proceduralTimeline: ProceduralTimelineEvent[];
  challengedActs: ChallengedAct[];
  claims: string[];
  claimResponses?: AnalyzedClaim[];
  arguments: string[];
  evidence: Array<{ id?: string; title?: string; type: string; description: string; page?: number; confirmed?: boolean; provenance?: import('./types').ProvenanceKind; sourceReference?: SourceReference }>;
  facts: AnalyzedFact[];
  rulings: Array<{ body: string; date?: string; rulingText: string; page?: number }>;
  challengedReasonings?: ChallengedReasoning[];
  citations: Array<{ rubro?: string; registro?: string; texto?: string }>;
  proceduralPosture: {
    proceduralWrit: string;
    isExtraordinary: boolean;
    constitutionalIssues: LegalIssue[];
    legalityIssues: LegalIssue[];
    exceptionalInterest: string | null;
  };
  caseTheory: CaseTheory;
  argumentAxes: ArgumentAxis[];
  missingData: string[];
  /** Campos que sí aparecen en la fuente, pero están anonimizados/redactados. */
  anonymizedData?: string[];
  /** Autoridades procesales con roles no intercambiables. */
  proceduralAuthorities?: ProceduralAuthorityRoles;
  unsupportedClaims: string[];
  legalIssues?: LegalIssue[];
  /** Canonical layered extraction; legacy fields remain a compatibility view. */
  richCaseAnalysis?: RichCaseAnalysis;
}

function extractFirstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].trim().length > 1) {
      return match[1].trim().replace(/[.;:,]*$/, '');
    }
  }
  return undefined;
}

function extractNumberedFacts(
  entries: Array<{ text: string; filename: string; documentId: string; page?: number }>,
): AnalyzedFact[] {
  const facts: AnalyzedFact[] = [];
  const dateRegex = /(?:el\s+d[ií]a\s+)?(\d{1,2}\s+de\s+[a-zñáéíóú]+\s+de\s+\d{4}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/i;

  // 1. Primero intentar extraer bajo sección "HECHOS" o "ANTECEDENTES"
  const sectionHeadingRegex = /(?:^|\n)\s*(?:HECHOS(?:\s+DE\s+LA\s+DEMANDA)?|ANTECEDENTES(?:\s+DEL\s+CASO)?)\s*[:.\-]?\s*(?:\n|$)/gim;

  for (const entry of entries) {
    const secMatches = Array.from(entry.text.matchAll(sectionHeadingRegex));
    for (let i = 0; i < secMatches.length; i++) {
      const start = (secMatches[i].index || 0) + secMatches[i][0].length;
      const trailingIndex = entry.text.slice(start).search(/\n\s*(?:PRESTACIONES|PRETENSIONES|PRUEBAS|EXCEPCIONES|DEFENSAS|DERECHO|FUNDAMENTOS|PETITORIOS|PUNTOS RESOLUTIVOS)\s*[:.\-]/i);
      const rawSection = entry.text.slice(start, trailingIndex >= 0 ? start + trailingIndex : entry.text.length).trim();
      if (!rawSection) continue;

      // Buscar si tiene items numerados (1. ..., 2. ..., PRIMERO. ..., etc.)
      const lines = rawSection.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      let currentFactNum = '';
      let currentFactText = '';

      const flushFact = () => {
        if (!currentFactText || currentFactText.length < 10) return;
        const dateMatch = currentFactText.match(dateRegex);
        facts.push({
          id: `fact-${facts.length + 1}`,
          number: currentFactNum || String(facts.length + 1),
          text: currentFactText.replace(/\s+/g, ' ').trim(),
          documentId: entry.documentId,
          page: entry.page,
          confidence: 0.9,
          sourceFact: currentFactText.trim(),
          position: 'REQUIRE_LAWYER_INPUT',
          lawyerPosition: 'UNDEFINED',
          response: '[REQUIERE DEFINIR POSTURA DEL ABOGADO]',
          support: [],
          supportingSources: [],
          sourceReference: { documentId: entry.documentId, page: entry.page, textSnippet: currentFactText.slice(0, 240) },
          provenance: 'SOURCE_EXTRACTED',
          date: dateMatch ? dateMatch[1] : undefined,
          contestedStatus: 'UNKNOWN',
          relatedEvidenceIds: [],
        });
        currentFactNum = '';
        currentFactText = '';
      };

      const itemRegex = /^(?:HECHO\s+)?([0-9]{1,3}|[IVX]{1,6}|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[EÉ]PTIMO|OCTAVO|NOVENO|D[EÉ]CIMO)\s*[.)\-:]\s*(.*)$/i;

      for (const line of lines) {
        const itemMatch = line.match(itemRegex);
        if (itemMatch) {
          flushFact();
          currentFactNum = itemMatch[1].toUpperCase();
          currentFactText = itemMatch[2] || '';
        } else if (currentFactText) {
          currentFactText += ' ' + line;
        } else if (line.length > 25) {
          // Línea sin número inicial
          currentFactNum = String(facts.length + 1);
          currentFactText = line;
        }
      }
      flushFact();
    }
  }

  // 2. Si no hubo sección "HECHOS:", buscar menciones directas tipo "HECHO 1: ..." a lo largo del texto
  if (facts.length === 0) {
    const factHeading = /(?:^|\n)\s*HECHO\s+([A-ZÁÉÍÓÚÑ0-9IVX]+)\s*[:.\-]?\s*/gim;
    entries.forEach((entry) => {
      const matches = Array.from(entry.text.matchAll(factHeading));
      matches.forEach((match, index) => {
        const start = (match.index || 0) + match[0].length;
        const nextFact = index + 1 < matches.length ? (matches[index + 1].index || entry.text.length) : entry.text.length;
        const trailingHeading = entry.text.slice(start).search(/\n\s*(?:PRESTACIONES|PRETENSIONES|PRUEBAS|EXCEPCIONES|DEFENSAS|FUNDAMENTOS|PETITORIOS)\s*[:.\-]/i);
        const sectionEnd = trailingHeading >= 0 ? start + trailingHeading : entry.text.length;
        const end = Math.min(nextFact, sectionEnd);
        const text = entry.text.slice(start, end).replace(/\s+/g, ' ').trim();
        if (!text) return;

        const dateMatch = text.match(dateRegex);

        facts.push({
          id: `fact-${facts.length + 1}`,
          number: match[1].toUpperCase(),
          text,
          documentId: entry.documentId,
          page: entry.page,
          confidence: 0.9,
          sourceFact: text,
          position: 'REQUIRE_LAWYER_INPUT',
          lawyerPosition: 'UNDEFINED',
          response: '[REQUIERE DEFINIR POSTURA DEL ABOGADO]',
          support: [],
          supportingSources: [],
          sourceReference: { documentId: entry.documentId, page: entry.page, textSnippet: text.slice(0, 240) },
          provenance: 'SOURCE_EXTRACTED',
          date: dateMatch ? dateMatch[1] : undefined,
          contestedStatus: 'UNKNOWN',
          relatedEvidenceIds: [],
        });
      });
    });
  }

  return facts;
}

function extractClaims(
  entries: Array<{ text: string; filename: string; documentId: string; page?: number }>
): { claims: string[]; claimResponses: AnalyzedClaim[] } {
  const result: AnalyzedClaim[] = [];
  const heading = /(?:^|\n)\s*(?:PRESTACIONES|PRETENSIONES|PETICIONES)\s*[:.\-]?\s*/gim;
  for (const entry of entries) {
    const matches = Array.from(entry.text.matchAll(heading));
    for (let i = 0; i < matches.length; i++) {
      const start = (matches[i].index || 0) + matches[i][0].length;
      const next = i + 1 < matches.length ? (matches[i + 1].index || entry.text.length) : entry.text.length;
      const raw = entry.text.slice(start, next)
        .split(/\n\s*(?=(?:PRUEBAS|HECHOS?|EXCEPCIONES|FUNDAMENTOS|PETITORIOS)\b)/i)[0]
        .trim();
      if (!raw) continue;
      const lines = raw.split(/\n+/).map((line) => line.replace(/^\s*(?:\d+|[IVX]+|[A-Z])\s*[.)\-:]\s*/i, '').trim()).filter(Boolean);
      const items = lines.length > 1 ? lines : [raw.replace(/\s+/g, ' ')];
      for (const text of items) {
        if (text.length < 4) continue;
        const number = String(result.length + 1);
        const sourceReference: SourceReference = {
          documentId: entry.documentId,
          page: entry.page,
          textSnippet: text.slice(0, 240),
        };
        result.push({
          id: `claim-${result.length + 1}`,
          number,
          text,
          sourceClaim: text,
          lawyerPosition: 'UNDEFINED',
          position: 'REQUIRE_LAWYER_INPUT',
          response: '[REQUIERE DEFINIR POSTURA DEL ABOGADO]',
          support: [],
          supportingSources: [],
          sourceReference,
          provenance: 'SOURCE_EXTRACTED',
        });
      }
    }
  }
  return { claims: result.map((claim) => claim.text), claimResponses: result };
}

function extractEvidenceFromSources(
  entries: Array<{ text: string; filename: string; documentId: string; page?: number }>,
  facts: AnalyzedFact[]
): Array<{
  id: string;
  type: string;
  description: string;
  page?: number;
  confirmed: boolean;
  provenance: import('./types').ProvenanceKind;
  sourceReference?: SourceReference;
  relatedFactIds?: string[];
  relatedClaimIds?: string[];
}> {
  const result: Array<{
    id: string;
    type: string;
    description: string;
    page?: number;
    confirmed: boolean;
    provenance: import('./types').ProvenanceKind;
    sourceReference?: SourceReference;
    relatedFactIds?: string[];
    relatedClaimIds?: string[];
  }> = [];

  const evidenceHeading = /(?:^|\n)\s*(?:PRUEBAS|MEDIOS DE PRUEBA|ELEMENTOS DE CONVICCI[ÓO]N)\s*[:.\-]?\s*/gim;

  for (const entry of entries) {
    const matches = Array.from(entry.text.matchAll(evidenceHeading));
    for (let i = 0; i < matches.length; i++) {
      const start = (matches[i].index || 0) + matches[i][0].length;
      const next = i + 1 < matches.length ? (matches[i + 1].index || entry.text.length) : entry.text.length;
      const raw = entry.text.slice(start, next)
        .split(/\n\s*(?=(?:HECHOS?|PRESTACIONES|EXCEPCIONES|FUNDAMENTOS|PETITORIOS|PUNTOS RESOLUTIVOS)\b)/i)[0]
        .trim();
      if (!raw) continue;

      const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      let currentItemText = '';

      const flushItem = () => {
        if (!currentItemText || currentItemText.length < 8) return;
        const evId = `evidence-${result.length + 1}`;
        let evType = 'DOCUMENTAL';
        if (/documental\s+p[uú]blica/i.test(currentItemText)) evType = 'DOCUMENTAL PÚBLICA';
        else if (/documental\s+privada/i.test(currentItemText)) evType = 'DOCUMENTAL PRIVADA';
        else if (/testimonial/i.test(currentItemText)) evType = 'TESTIMONIAL';
        else if (/pericial/i.test(currentItemText)) evType = 'PERICIAL';
        else if (/confesional/i.test(currentItemText)) evType = 'CONFESIONAL';
        else if (/presuncional/i.test(currentItemText)) evType = 'PRESUNCIONAL';
        else if (/instrumental/i.test(currentItemText)) evType = 'INSTRUMENTAL DE ACTUACIONES';
        else if (/inspecci[oó]n/i.test(currentItemText)) evType = 'INSPECCIÓN JUDICIAL';

        // Vincular a hechos si cita "hecho 1", "hecho 2", etc.
        const relatedFactIds: string[] = [];
        const factMatches = currentItemText.match(/hecho\s+([A-ZÁÉÍÓÚÑ0-9IVX]+)/gi);
        if (factMatches) {
          factMatches.forEach((fm) => {
            const numMatch = fm.match(/\s+([A-ZÁÉÍÓÚÑ0-9IVX]+)/i);
            if (numMatch) {
              const matchedFact = facts.find((f) => f.number.toUpperCase() === numMatch[1].toUpperCase());
              if (matchedFact && !relatedFactIds.includes(matchedFact.id)) {
                relatedFactIds.push(matchedFact.id);
                if (!matchedFact.relatedEvidenceIds) matchedFact.relatedEvidenceIds = [];
                if (!matchedFact.relatedEvidenceIds.includes(evId)) {
                  matchedFact.relatedEvidenceIds.push(evId);
                }
              }
            }
          });
        }

        result.push({
          id: evId,
          type: evType,
          description: currentItemText.replace(/^\s*(?:\d+|[IVX]+|[A-Z])\s*[.)\-:]\s*/i, '').trim(),
          page: entry.page,
          confirmed: true,
          provenance: 'SOURCE_EXTRACTED',
          sourceReference: {
            documentId: entry.documentId,
            page: entry.page,
            textSnippet: currentItemText.slice(0, 240),
          },
          relatedFactIds,
        });
        currentItemText = '';
      };

      for (const line of lines) {
        if (/^\s*(?:\d+|[IVX]+|[A-Z])\s*[.)\-:]\s*/i.test(line) || /^(?:LA\s+)?(?:DOCUMENTAL|TESTIMONIAL|PERICIAL|CONFESIONAL|PRESUNCIONAL|INSTRUMENTAL|INSPECCI[ÓO]N)\b/i.test(line)) {
          flushItem();
          currentItemText = line;
        } else if (currentItemText) {
          currentItemText += ' ' + line;
        }
      }
      flushItem();
    }
  }

  return result;
}

function extractChallengedReasonings(
  entries: Array<{ text: string; filename: string; documentId: string; page?: number }>
): ChallengedReasoning[] {
  const result: ChallengedReasoning[] = [];
  const regex = /(?:^|\n)\s*(?:CONSIDERANDO|CONSIDERACI[ÓO]N)\s+([A-ZÁÉÍÓÚÑ0-9IVX]+)\s*[:.\-]?\s*/gim;

  for (const entry of entries) {
    const matches = Array.from(entry.text.matchAll(regex));
    for (let i = 0; i < matches.length; i++) {
      const start = (matches[i].index || 0) + matches[i][0].length;
      const next = i + 1 < matches.length ? (matches[i + 1].index || entry.text.length) : entry.text.length;
      const raw = entry.text.slice(start, next)
        .split(/\n\s*(?=(?:RESUELVE|PUNTOS RESOLUTIVOS|RESOLUTIVOS)\b)/i)[0]
        .trim();
      if (!raw || raw.length < 15) continue;

      const num = matches[i][1].toUpperCase();
      result.push({
        id: `cr-${result.length + 1}`,
        number: num,
        topic: raw.slice(0, 100).replace(/\s+/g, ' '),
        rulingText: raw.slice(0, 800).replace(/\s+/g, ' '),
        page: entry.page,
        sourceReference: {
          documentId: entry.documentId,
          page: entry.page,
          textSnippet: raw.slice(0, 240),
        },
      });
    }
  }

  return result;
}

function extractRulingsFromSources(
  entries: Array<{ text: string; filename: string; documentId: string; page?: number }>
): Array<{ body: string; date?: string; rulingText: string; page?: number }> {
  const result: Array<{ body: string; date?: string; rulingText: string; page?: number }> = [];
  const regex = /(?:^|\n)\s*(?:RESUELVE|PUNTOS RESOLUTIVOS|RESOLUTIVOS)\s*[:.\-]?\s*/gim;

  for (const entry of entries) {
    const match = entry.text.match(regex);
    if (!match || match.index === undefined) continue;
    const raw = entry.text.slice(match.index + match[0].length).trim();
    if (!raw) continue;
    const lines = raw.split(/\n+/).map((l) => l.trim()).filter((l) => /^\s*(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|\d+)\s*[.)\-:]/i.test(l));
    lines.forEach((l) => {
      result.push({
        body: entry.filename,
        rulingText: l,
        page: entry.page,
      });
    });
  }

  return result;
}

function extractDynamicLegalIssues(params: {
  family: 'CONTESTACION' | 'AMPARO' | 'RECURSO' | 'DEMANDA' | 'OTRO';
  isRevisionAmparoDirecto: boolean;
  isExtraordinary: boolean;
  isConstitutional: boolean;
  challengedActs: ChallengedAct[];
  challengedReasonings: ChallengedReasoning[];
  claims: AnalyzedClaim[];
  facts: AnalyzedFact[];
  userInstruction: string;
  sources: UploadedSourceDocument[];
}): { constitutionalIssues: LegalIssue[]; legalityIssues: LegalIssue[] } {
  const constitutionalIssues: LegalIssue[] = [];
  const legalityIssues: LegalIssue[] = [];

  // 1. Si existen consideraciones combatidas reales de una sentencia/resolución
  if (params.challengedReasonings.length > 0) {
    params.challengedReasonings.forEach((cr, idx) => {
      const isConst = /constituc|derecho humano|tratado|convenc|garant|tutela judicial|amparo|inter[eé]s superior/i.test(cr.rulingText)
        || params.isConstitutional;

      const issueId = `issue-${isConst ? 'const' : 'leg'}-${idx + 1}`;
      const issue: LegalIssue = {
        id: issueId,
        type: isConst ? 'CONSTITUTIONAL' : /procedimiento|formalidad|notificaci|emplazam/i.test(cr.rulingText) ? 'PROCEDURAL' : 'LEGALITY',
        title: `Controversia sobre la consideración ${cr.number}: ${cr.topic?.slice(0, 70) || cr.rulingText.slice(0, 70)}`,
        parameter: isConst
          ? 'Artículos 1o, 14, 16 y 17 Constitucionales'
          : 'Disposiciones aplicables de la legislación sustantiva y procesal de la materia',
        challengedAct: cr.rulingText.slice(0, 180),
        contradiction: `La consideración ${cr.number} causa agravio al desestimar indebidamente la pretensión o prueba conducente.`,
        affectation: 'Vulneración a la esfera jurídica y a los derechos sustantivos y procesales de la parte promovente.',
        consequence: 'Revocación o modificación de la resolución impugnada.',
        sourceDoc: cr.sourceReference?.documentId,
        page: cr.page,
        excerpt: cr.rulingText.slice(0, 200),
        relatedChallengedReasoningIds: [cr.id],
      };

      if (isConst) constitutionalIssues.push(issue);
      else legalityIssues.push(issue);
    });
  } else if (params.isRevisionAmparoDirecto) {
    // Si es recurso de revisión en amparo directo, pero no se desglosaron consideraciones numeradas
    if (params.challengedActs.length > 0) {
      params.challengedActs.forEach((act, idx) => {
        constitutionalIssues.push({
          id: `issue-const-${idx + 1}`,
          type: 'CONSTITUTIONAL',
          title: `Cuestión de constitucionalidad respecto del acto emitido por ${act.authority}`,
          parameter: 'Artículos 1o, 14, 16 y 17 Constitucionales; Ley de Amparo',
          challengedAct: act.actDescription,
          contradiction: 'Omisión o indebida interpretación directa de precepto constitucional al resolver el juicio de amparo directo.',
          affectation: 'Transgresión al parámetro de regularidad constitucional.',
          consequence: 'Revocación de la sentencia recurrida y concesión del amparo protector.',
          sourceDoc: act.authority,
          page: act.page,
          excerpt: act.excerpt,
        });
      });
    }
  } else if (params.family === 'CONTESTACION') {
    // En contestación: cada pretensión genera una controversia de legalidad (procedencia de la acción/prestación)
    params.claims.forEach((claim) => {
      legalityIssues.push({
        id: `issue-claim-${claim.id}`,
        type: 'LEGALITY',
        title: `Controversia sobre la procedencia de la prestación ${claim.number}: ${claim.text.slice(0, 60)}`,
        parameter: 'Legislación sustantiva y procesal aplicable a la controversia',
        challengedAct: `Reclamo de la actora: ${claim.text}`,
        contradiction: 'Inexistencia de los supuestos normativos y fácticos constitutivos de la acción deducida.',
        affectation: 'Pretensión de imposición de una condena injustificada a la parte demandada.',
        consequence: 'Absolución total respecto de la prestación controvertida.',
        relatedClaimIds: [claim.id],
      });
    });
  } else if (params.family === 'RECURSO' || params.family === 'AMPARO') {
    // Si no hubo considerandos numerados pero hay actos impugnados concretos
    if (params.challengedActs.length > 0) {
      params.challengedActs.forEach((act, idx) => {
        const issue: LegalIssue = {
          id: `issue-act-${idx + 1}`,
          type: params.isConstitutional ? 'CONSTITUTIONAL' : 'LEGALITY',
          title: `Ilegalidad e inconformidad respecto del acto: ${act.actDescription.slice(0, 70)}`,
          parameter: params.isConstitutional ? 'Artículos 14 y 16 Constitucionales' : 'Legislación aplicable al procedimiento',
          challengedAct: act.actDescription,
          contradiction: 'Indebida fundamentación y motivación del acto impugnado.',
          affectation: 'Afectación directa a la esfera de derechos del promovente.',
          consequence: 'Dejar insubsistente el acto reclamado.',
          page: act.page,
          excerpt: act.excerpt,
        };
        if (params.isConstitutional) constitutionalIssues.push(issue);
        else legalityIssues.push(issue);
      });
    }
  }

  // Deduplicación semántica (3Q)
  return {
    constitutionalIssues: deduplicateLegalIssues(constitutionalIssues),
    legalityIssues: deduplicateLegalIssues(legalityIssues),
  };
}

function detectSourceDocumentType(fullCorpus: string): string {
  if (/sentencia|ejecutoria|resoluci[oó]n definitiva/i.test(fullCorpus)) return 'SENTENCIA_O_RESOLUCION';
  if (/contestaci[oó]n\s+de\s+(?:la\s+)?demanda/i.test(fullCorpus)) return 'CONTESTACION_DEMANDA';
  if (/demanda|prestaciones|hechos/i.test(fullCorpus)) return 'DEMANDA';
  if (/recurso|agravio/i.test(fullCorpus)) return 'RECURSO';
  return 'DOCUMENTO_JURIDICO_NO_CLASIFICADO';
}

function targetFamily(userInstruction: string, fullCorpus: string): 'CONTESTACION' | 'AMPARO' | 'RECURSO' | 'DEMANDA' | 'OTRO' {
  const target = `${userInstruction}\n${fullCorpus}`.toLowerCase();
  if (/contestaci[oó]n.*demanda|contestar\s+(?:la\s+)?demanda/.test(userInstruction.toLowerCase())) return 'CONTESTACION';
  if (/recurso|agravio/.test(userInstruction.toLowerCase())) return 'RECURSO';
  if (/amparo/.test(userInstruction.toLowerCase())) return 'AMPARO';
  if (/demanda/.test(userInstruction.toLowerCase())) return 'DEMANDA';
  if (/contestaci[oó]n/.test(target)) return 'CONTESTACION';
  return 'OTRO';
}

/**
 * Reconstruye integralmente el expediente a partir de los documentos reales cargados por el abogado
 */
export function reconstructCaseAnalysis(
  sources: UploadedSourceDocument[],
  userInstruction: string = '',
  referenceText: string = '',
  options: Pick<RichExtractionOptions, 'includeReferenceInAnalysis' | 'trace'> = {}
): CaseAnalysis {
  const combinedTexts: Array<{ text: string; filename: string; documentId: string; page?: number }> = [];

  for (const src of sources) {
    if (src.pages && src.pages.length > 0) {
      src.pages.forEach((p) => {
        combinedTexts.push({
          text: p.text || '',
          filename: src.filename || src.name || 'documento',
          documentId: src.id,
          page: p.page,
        });
      });
    } else if (src.extractedText || src.content) {
      combinedTexts.push({
        text: src.extractedText || src.content || '',
        filename: src.filename || src.name || 'documento',
        documentId: src.id,
      });
    }
  }

  if (referenceText && options.includeReferenceInAnalysis !== false) {
    combinedTexts.push({ text: referenceText, filename: 'machote_referencia', documentId: 'machote_referencia' });
  }

  const fullCorpus = combinedTexts.map((c) => c.text).join('\n\n');
  const missingData: string[] = [];
  const richCaseAnalysis = extractRichCaseAnalysis(sources, {
    referenceText,
    includeReferenceInAnalysis: options.includeReferenceInAnalysis,
    trace: options.trace,
  });

  // 1. Partes procesales reales
  // Corrección P3: extracción compartida (partyExtraction.ts) con validación de
  // candidatos — rechaza fechas ("El diecisiete de octubre…"), frases
  // preposicionales ("Ante el Instituto…") y capturas que cruzan oraciones.
  // Los labels exigen separador explícito (":" o "-"); si ningún candidato es
  // válido se prefiere [DATO PENDIENTE] antes que un nombre inventado.
  const partyPatterns = [
    /(?:quejoso|persona\s+quejosa|parte\s+quejosa|promovente|accionante)\s*[:\-]\s*([^;,\n]{2,90})/i,
    /(?:recurr(?:ente|ido))\s*[:\-]\s*([^;,\n]{2,90})/i,
    /\b(?:quejoso|actor)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)/i,
  ];
  const anonymizedParty = extractAnonymizedField(fullCorpus, partyPatterns);
  const quejoso = extractPartyField(fullCorpus, partyPatterns) || undefined;

  const actor =
    extractPartyField(fullCorpus, [
      /(?:actor|parte\s+actora|demandante)\s*[:\-]\s*([^;,\n]{2,90})/i,
    ]) || quejoso;

  const demandado = extractPartyField(fullCorpus, [
    /(?:demandado|parte\s+demandada|tercero\s+interesado)\s*[:\-]\s*([^;,\n]{2,90})/i,
    /(?:contraparte)\s*[:\-]\s*([^;,\n]{2,90})/i,
  ]);

  // AUTORIDAD: primero por label con separador OBLIGATORIO (tolerando nombres
  // institucionales envueltos en varias líneas); como último recurso, por ancla
  // institucional en mayúsculas (H. PLENO DEL TRIBUNAL…).
  const autoridadResponsable =
    extractAuthorityLabeled(fullCorpus) || extractInstitutionalAuthority(fullCorpus) || undefined;
  const organoResolucionRecurrida = extractResolvingCourt(fullCorpus);

  const terceroInteresado = extractPartyField(fullCorpus, [
    /(?:tercero\s+interesado|tercera\s+interesada)\s*[:\-]\s*([^;,\n]{2,90})/i,
  ]);

  const anonymizedData: string[] = [];
  if (anonymizedParty && !quejoso && !actor) {
    anonymizedData.push('Nombre del promovente');
  } else if (!quejoso && !actor) {
    missingData.push('Nombre de la parte quejosa / promovente');
  }
  if (!autoridadResponsable) missingData.push('Autoridad señalada como responsable');

  // 2. Expedientes y tocas
  const amparoDirecto = extractFirstMatch(fullCorpus, [
    /(?:amparo\s+directo|d\.a\.|a\.d\.)\s*[:\-]?\s*([0-9]{1,6}\s*[\/\-\.]\s*[0-9]{2,4})/i,
  ]);
  const amparoIndirecto = extractFirstMatch(fullCorpus, [
    /(?:amparo\s+indirecto|juicio\s+de\s+amparo)\s*[:\-]?\s*([0-9]{1,6}\s*[\/\-\.]\s*[0-9]{2,4})/i,
  ]);
  const toca = extractFirstMatch(fullCorpus, [
    /(?:toca|recurso\s+de\s+revisi[oó]n|revisi[oó]n|t\.r\.)\s*[:\-]?\s*([0-9]{1,6}\s*[\/\-\.]\s*[0-9]{2,4})/i,
  ]);
  const principal =
    amparoDirecto ||
    amparoIndirecto ||
    toca ||
    extractFirstMatch(fullCorpus, [
      /(?:expediente|juicio|proceso)\s*[:\-]?\s*([0-9]{1,6}\s*[\/\-\.]\s*[0-9]{2,4})/i,
      /\b(\d{1,6}\/\d{4})\b/i,
    ]);

  if (!principal) missingData.push('Número de expediente o toca principal');

  // 3. Reconstrucción de la Línea Procesal Cronológica
  const proceduralTimeline: ProceduralTimelineEvent[] = [];
  const dateRegex = /(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/gi;

  combinedTexts.forEach(({ text, filename, page }) => {
    const lines = text.split('\n');
    const timelineKeys = new Set<string>();
    lines.forEach((line, index) => {
      const current = line.trim();
      const next = lines[index + 1]?.trim() || '';
      const previous = lines[index - 1]?.trim() || '';
      const adjacentText = dateRegex.test(current)
        ? `${current} ${next}`.replace(/\s+/g, ' ').trim()
        : `${previous} ${current}`.replace(/\s+/g, ' ').trim();
      dateRegex.lastIndex = 0;
      const match = adjacentText.match(dateRegex);
      if (match && match[0]) {
        const trimmed = adjacentText;
        if (
          trimmed.length > 20 &&
          /sentencia|resoluci[oó]n|demanda|notificaci[oó]n|recurso|audiencia|auto|acuerdo|emplazamiento/i.test(trimmed)
        ) {
          const eventKey = `${match[0].toLowerCase()}|${trimmed.toLowerCase()}`;
          if (timelineKeys.has(eventKey)) return;
          timelineKeys.add(eventKey);
          proceduralTimeline.push({
            date: match[0],
            event: trimmed.slice(0, 180),
            sourceDocument: filename,
            page,
            excerpt: trimmed.slice(0, 250),
            certainty: 95,
          });
        }
      }
    });
  });

  const numberedFacts = extractNumberedFacts(combinedTexts);
  const extractedClaims = extractClaims(combinedTexts);
  const family = targetFamily(userInstruction, fullCorpus);

  // 4. Actos reclamados y resoluciones
  const challengedActs: ChallengedAct[] = [];
  combinedTexts.forEach(({ text, filename, page }) => {
    const actMatch = text.match(/(?:acto\s+reclamado|resoluci[oó]n\s+impugnada|sentencia\s+recurrida)\s*[:\-]?\s*([^.\n]{10,250})/i);
    if (actMatch && actMatch[1]) {
      challengedActs.push({
        authority: autoridadResponsable || '[DATO PENDIENTE: Autoridad Emisora]',
        actDescription: actMatch[1].trim(),
        page,
        excerpt: text.slice(0, 200),
      });
    }
  });

  // Extracción estructurada de pruebas reales, considerandos y resolutivos (3E, 3I, 3J)
  const extractedEvidence = extractEvidenceFromSources(combinedTexts, numberedFacts);
  const challengedReasonings = extractChallengedReasonings(combinedTexts);
  const extractedRulings = extractRulingsFromSources(combinedTexts);

  // 5. Determinación de la Vía Procesal y Separación Legalidad vs. Constitucionalidad (Dinámica, 3B y 3K)
  const isRevisionAmparoDirecto = family === 'RECURSO' && /revisi[oó]n.*amparo|amparo.*directo|revisi[oó]n/i.test(userInstruction);
  const isExtraordinary = isRevisionAmparoDirecto;
  const isConstitutional = family === 'AMPARO' || isRevisionAmparoDirecto;

  const dynamicIssues = extractDynamicLegalIssues({
    family,
    isRevisionAmparoDirecto,
    isExtraordinary,
    isConstitutional,
    challengedActs,
    challengedReasonings,
    claims: extractedClaims.claimResponses,
    facts: numberedFacts,
    userInstruction,
    sources,
  });
  const constitutionalIssues = dynamicIssues.constitutionalIssues;
  const legalityIssues = dynamicIssues.legalityIssues;
  const allIssues = [...constitutionalIssues, ...legalityIssues];

  // 6. Construcción de la Teoría del Caso (Sin invención)
  const caseTheory: CaseTheory = isConstitutional
    ? {
        factualTheory: `La controversia deriva de los actos procesales sustanciados dentro del expediente ${principal || '[DATO PENDIENTE: Expediente]'}, en el que la parte ${quejoso || '[PROMOVENTE]'} resiente una afectación directa en su esfera de derechos.`,
        legalTheory: `La actuación de la autoridad señalada debe contrastarse con los principios de legalidad, fundamentación, motivación y exhaustividad que rigen el acto impugnado.`,
        constitutionalTheory: `La cuestión constitucional debe sostenerse únicamente en las constancias e instrucciones verificables del expediente.`,
        proceduralTheory: isExtraordinary
          ? `El recurso extraordinario requiere acreditar una cuestión de constitucionalidad y su interés excepcional con apoyo en las fuentes.`
          : `La procedencia del medio de control debe verificarse con las constancias del expediente y la instrucción profesional.`,
        opposingTheory: `La autoridad o contraparte puede sostener la validez formal del acto; esa posición debe atribuirse solo si aparece en la fuente.`,
        vulnerabilities: missingData.length > 0 ? [`Información pendiente de integración: ${missingData.join(', ')}`] : [],
        strengths: ['Separación entre hechos de la fuente y argumentación generada'],
      }
    : {
        factualTheory: family === 'CONTESTACION'
          ? `La controversia se refiere a la demanda y prestaciones identificadas en las fuentes del expediente ${principal || '[DATO PENDIENTE: Expediente]'}. Los hechos de la contraparte se contestan por separado y no se convierten en hechos propios del demandado.`
          : `La controversia se reconstruye exclusivamente a partir de los hechos y pretensiones verificables del expediente ${principal || '[DATO PENDIENTE: Expediente]'}.`,
        legalTheory: `El desarrollo jurídico se limita a las normas, defensas e instrucciones que tengan respaldo en las fuentes o que el abogado confirme.`,
        constitutionalTheory: '',
        proceduralTheory: family === 'CONTESTACION'
          ? `La posición procesal es la contestación de la demanda desde el rol del demandado; cualquier postura no indicada queda pendiente de definición profesional.`
          : `La vía y la procedencia deben confirmarse conforme a la materia, jurisdicción y tipo documental seleccionados.`,
        opposingTheory: family === 'CONTESTACION'
          ? `La parte actora sostiene las pretensiones que aparecen en la demanda; no se agregan pretensiones ni hechos no identificados.`
          : `La teoría de la contraparte solo se incorpora cuando esté expresamente respaldada por las fuentes.`,
        vulnerabilities: missingData.length > 0 ? [`Información pendiente de integración: ${missingData.join(', ')}`] : [],
        strengths: ['Separación entre hechos de la fuente y argumentación generada'],
      };

  // 7. Construcción de Ejes Argumentativos Autónomos (Dinámico, sin axis-1 hardcodeado - 3B)
  const argumentAxes: ArgumentAxis[] = (family === 'CONTESTACION' && !isConstitutional && challengedReasonings.length === 0)
    ? []
    : allIssues.map((issue, idx) => {
    return {
      id: `axis-${idx + 1}`,
      title: `EJE ${idx + 1}: ${issue.title.toUpperCase()}`,
      issue: issue.contradiction || issue.title,
      facts: proceduralTimeline.slice(0, 3).map((e) => `${e.date}: ${e.event}`),
      rules: issue.parameter ? [issue.parameter] : ['Legislación aplicable a la materia'],
      reasoning: `Se controvierte la determinación en cuanto a ${issue.title.toLowerCase()}, dado que afecta los derechos fundamentales o procesales del promovente.`,
      counterargument: 'La autoridad u órgano emisor consideró satisfechos los extremos legales en el acto impugnado.',
      rebuttal: 'Dicho razonamiento resulta incongruente y vulnera el principio de debida motivación y legalidad.',
      requestedConsequence: issue.consequence || 'Revocar o dejar insubsistente la determinación impugnada ordenando emitir una nueva resolución apegada a derecho.',
      sources: sources.map((s) => ({ documentId: s.id, excerpt: s.filename })),
    };
  });

  const legacyAnalysis: CaseAnalysis = {
    parties: {
      quejoso,
      actor,
      demandado,
      autoridadResponsable,
      terceroInteresado,
    },
    authorities: autoridadResponsable ? [autoridadResponsable] : [],
    caseNumbers: {
      principal,
      amparoDirecto,
      amparoIndirecto,
      toca,
    },
    proceduralTimeline,
    challengedActs,
    facts: numberedFacts,
    claims: extractedClaims.claims,
    claimResponses: extractedClaims.claimResponses,
    arguments: allIssues.map((i) => i.title),
    evidence: extractedEvidence,
    rulings: extractedRulings,
    challengedReasonings,
    citations: [],
    proceduralPosture: {
      proceduralWrit: isRevisionAmparoDirecto ? 'recurso_revision_amparo_directo' : family === 'AMPARO' ? 'amparo' : family === 'RECURSO' ? 'recurso' : family === 'CONTESTACION' ? 'contestacion_demanda' : family === 'DEMANDA' ? 'demanda' : 'escrito_libre',
      isExtraordinary,
      constitutionalIssues,
      legalityIssues,
      exceptionalInterest: isExtraordinary ? (constitutionalIssues.length > 0 ? 'Fijación de criterio de interpretación constitucional respecto del derecho de tutela judicial' : null) : null,
    },
    proceduralAuthorities: {
      sourceAuthority: autoridadResponsable,
      organoResolucionRecurrida,
      // La vía declarada por el análisis no inventa una autoridad: el
      // conducto solo se completa cuando la fuente identificó el órgano que
      // dictó la resolución recurrida.
      organoPresentacion: isRevisionAmparoDirecto ? organoResolucionRecurrida : undefined,
    },
    caseTheory,
    argumentAxes,
    missingData,
    anonymizedData,
    unsupportedClaims: [],
  };

  const projection = projectRichCaseAnalysis(richCaseAnalysis, legacyAnalysis);
  if (options.trace) {
    const candidateCounts = richCaseAnalysis.candidates.reduce<Record<string, number>>((counts, candidate) => {
      counts[candidate.kind] = (counts[candidate.kind] || 0) + 1;
      return counts;
    }, {});
    options.trace.recordExtraction({
      sourceUnitCount: richCaseAnalysis.extractionStats.sourceUnitCount,
      candidateCounts,
      decisions: richCaseAnalysis.candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        kind: candidate.kind,
        decision: candidate.decision,
        reason: candidate.decisionReason,
        provenance: candidate.provenance,
      })),
      entityCounts: {
        parties: richCaseAnalysis.parties.length,
        assertions: richCaseAnalysis.assertions.length,
        claims: richCaseAnalysis.claims.length,
        facts: richCaseAnalysis.facts.length,
        documents: richCaseAnalysis.documents.length,
        evidenceMentions: richCaseAnalysis.evidenceMentions.length,
        evidenceOffers: richCaseAnalysis.evidenceOffers.length,
        arguments: richCaseAnalysis.arguments.length,
        authorities: richCaseAnalysis.authorities.length,
        dates: richCaseAnalysis.dates.length,
        amounts: richCaseAnalysis.amounts.length,
        conflicts: richCaseAnalysis.conflicts.length,
        missingData: richCaseAnalysis.missingData.length,
      },
      conflictIds: richCaseAnalysis.conflicts.map((conflict) => conflict.conflictId),
      missingDataFields: richCaseAnalysis.missingData.map((item) => item.field),
      projectionLosses: projection.losses,
    });
  }
  return {
    ...legacyAnalysis,
    ...projection.caseAnalysis,
    richCaseAnalysis,
  };
}
