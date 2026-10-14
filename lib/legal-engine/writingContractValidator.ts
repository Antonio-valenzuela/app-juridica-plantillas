import type { UniversalLegalDocument } from './types';
import type { CaseDossier } from './caseDossier';
import { DATE_IN_TEXT } from './caseDossier';
import { INLINE_VERIFICATION_MARKER, META_TEXT_RULES, SIGNER_ROLE_LABEL, type SignerRole, type WritingContract } from './writingContract';

/**
 * Validador posterior a la generación: comprueba el borrador contra el contrato de su tipo y la ficha del caso.
 *
 * Detecta: encabezados repetidos, firma incoherente con el rol, exceso de marcadores, fecha o lugar que no
 * constan en la ficha ni en la fuente, órganos no respaldados, texto que defiende la postura contraria,
 * meta-texto y estructura fuera del contrato. Cada hallazgo indica si puede corregirse regenerando la sección
 * o reparando el texto formal de forma determinista. Nunca relaja un gate: solo informa y habilita la
 * corrección.
 */

export type ContractFindingCode =
  | 'REPEATED_HEADING' | 'NESTED_HEADING' | 'NESTED_SIGNATURE' | 'SIGNATURE_ROLE_MISMATCH' | 'TOO_MANY_MARKERS'
  | 'DATE_NOT_IN_DOSSIER' | 'PLACE_NOT_IN_DOSSIER' | 'CLOSING_HAS_DATE' | 'ORGAN_NOT_IN_SOURCES'
  | 'OPPOSITE_STANCE' | 'META_TEXT' | 'INLINE_VERIFICATION_MARKER' | 'STRUCTURE_OUT_OF_CONTRACT' | 'EMPTY_SECTION';

export interface ContractFinding {
  code: ContractFindingCode;
  severity: 'ERROR' | 'WARNING';
  sectionId?: string;
  sectionTitle?: string;
  message: string;
  excerpt?: string;
  /** Regenerar la sección con la corrección puede resolverlo (solo secciones escritas por la IA). */
  regenerable: boolean;
  /** Reparación determinista del texto formal (no requiere proveedor). */
  repair?: 'REBUILD_SIGNATURE' | 'REBUILD_CLOSING';
}

export interface ContractValidationInput {
  contract: WritingContract;
  dossier?: CaseDossier;
  /** Texto de las fuentes (respaldo de fechas, lugares y órganos). */
  sourceText: string;
}

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const snippet = (value: string, max = 120) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value).trim();

/** Marcadores de dato pendiente que quedan en el cuerpo (los de verificación van al anexo). */
export const INLINE_DATA_MARKER = /\[\s*(?:DATO\s+PENDIENTE|REQUIERE\s+(?:POSTURA|INSTRUCCI[ÓO]N|DEFINIR|CONFIRMACI[ÓO]N)|A\s+CONFIRMAR|PENDIENTE\s*:)[^\]]*\]/gi;

export function countInlineMarkers(text: string): number {
  return (text.match(INLINE_DATA_MARKER) || []).length;
}

const STRUCTURAL = new Set(['header', 'closing', 'signature']);
const SIGNATURE_LINE = /^(?:protesto\s+lo\s+necesario|atentamente|abogad[oa]s?\s+postulantes?\b|\[?\s*firma\b)/i;
const PLACE_DATE_LINE = /^(?:lugar\s+y\s+fecha\b|en\s+(?:la\s+)?(?:ciudad\s+de\s+)?[A-ZÁÉÍÓÚÑ][\p{L} ]{2,40},\s+(?:a\s+)?\d{1,2}\s+de\s+\p{L}+)/iu;
const ORGAN_RE = /\b(?:Consejo\s+(?:de\s+la\s+Judicatura|Judicial)(?:\s+del\s+Estado\s+de\s+\p{L}+)?|(?:Primer|Segundo|Tercer|Cuarto|Quinto|Sexto|S[eé]ptimo|Octavo|Noveno|D[eé]cimo)\s+(?:Tribunal|Circuito)[\p{L} ]{0,60}|Tribunal\s+(?:Colegiado|Superior|Unitario)[\p{L} ]{3,70}|Suprema\s+Corte[\p{L} ]{3,50}|Sala\s+(?:Civil|Familiar|Penal|Regional)[\p{L} ]{0,50}|Juzgado\s+(?:Primero|Segundo|Tercero|Cuarto|Quinto|Sexto|S[eé]ptimo|Octavo|Noveno|D[eé]cimo|de)[\p{L} ]{3,70})/giu;
const PLACE_RE = /\ben\s+(?:la\s+)?[Cc]iudad\s+de\s+([A-ZÁÉÍÓÚÑ][\p{L}]+(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÑ][\p{L}]+){0,2})/gu;

function sectionText(section: { content?: Array<{ text?: string }> }): string {
  return (section.content || []).map((block) => block.text || '').join('\n');
}

const isAi = (section: { content?: Array<{ generatedBy?: string }> }) => (section.content || []).some((block) => block.generatedBy === 'AI');

/** Las otras etiquetas de rol que no corresponden a quien firma. */
function foreignRoleLabels(signer: SignerRole): string[] {
  const all: SignerRole[] = ['actor', 'demandado', 'apelante', 'apelado', 'quejoso', 'tercero_interesado'];
  return all.filter((role) => role !== signer).map((role) => SIGNER_ROLE_LABEL[role]);
}

export function validateWritingContract(doc: UniversalLegalDocument, input: ContractValidationInput): ContractFinding[] {
  const { contract, dossier, sourceText } = input;
  const findings: ContractFinding[] = [];
  const sections = doc.sections || [];
  const sourceFold = fold(`${sourceText}\n${dossier?.court || ''}\n${dossier?.resolution?.court || ''}\n${dossier?.city || ''}`);
  const allowedDates = new Set([
    ...(dossier?.resolution?.date ? [dossier.resolution.date] : []),
    ...(dossier?.notifications.map((item) => item.date) || []),
  ].map(fold));
  const titles = sections.map((section) => fold(section.title));
  const titleSet = new Set(titles);

  // 1. Encabezados repetidos entre secciones.
  const seen = new Map<string, string>();
  for (const section of sections) {
    const key = fold(section.title);
    if (seen.has(key)) {
      findings.push({ code: 'REPEATED_HEADING', severity: 'ERROR', sectionId: section.id, sectionTitle: section.title, message: `El encabezado «${section.title}» está repetido.`, regenerable: false });
    } else seen.set(key, section.id);
  }

  let markerTotal = 0;
  const markerBySection: Array<{ section: (typeof sections)[number]; count: number }> = [];

  for (const section of sections) {
    const text = sectionText(section);
    if (!text.trim()) {
      findings.push({ code: 'EMPTY_SECTION', severity: 'WARNING', sectionId: section.id, sectionTitle: section.title, message: `La sección «${section.title}» está vacía.`, regenerable: isAi(section) });
      continue;
    }
    const structural = STRUCTURAL.has(section.type);
    const regenerable = isAi(section);
    const markers = countInlineMarkers(text);
    markerTotal += markers;
    markerBySection.push({ section, count: markers });

    // 2. Encabezados, firmas y «lugar y fecha» anidados.
    if (!structural) {
      for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        const key = fold(line.replace(/[:.\s]+$/, ''));
        if (line.length <= 90 && titleSet.has(key)) {
          findings.push({ code: 'NESTED_HEADING', severity: 'ERROR', sectionId: section.id, sectionTitle: section.title, message: `La sección «${section.title}» repite el encabezado «${line}».`, excerpt: snippet(line), regenerable });
          break;
        }
      }
      for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (SIGNATURE_LINE.test(line) || (PLACE_DATE_LINE.test(line) && line.length < 160)) {
          findings.push({ code: 'NESTED_SIGNATURE', severity: 'ERROR', sectionId: section.id, sectionTitle: section.title, message: `La sección «${section.title}» contiene firma, protesto o «lugar y fecha» que corresponden al cierre.`, excerpt: snippet(line), regenerable });
          break;
        }
      }
    }

    // 3. Meta-texto y marcadores de verificación dentro del cuerpo.
    for (const rule of [...META_TEXT_RULES, ...contract.forbidden.filter((item) => !META_TEXT_RULES.includes(item) && item.id !== 'INLINE_VERIFICATION_MARKER')]) {
      const match = rule.pattern.exec(text);
      if (match) {
        findings.push({ code: 'META_TEXT', severity: 'ERROR', sectionId: section.id, sectionTitle: section.title, message: rule.message, excerpt: snippet(text.slice(Math.max(0, match.index - 30), match.index + 90)), regenerable });
        break;
      }
    }
    if (INLINE_VERIFICATION_MARKER.test(text)) {
      findings.push({ code: 'INLINE_VERIFICATION_MARKER', severity: 'ERROR', sectionId: section.id, sectionTitle: section.title, message: 'Marcador de verificación dentro del cuerpo: debe ir al anexo de revisión.', regenerable });
    }

    // 4. Postura contraria (no aplica a la síntesis literal de la sentencia ni al cierre).
    if (!structural) {
      for (const rule of contract.oppositeStance) {
        const match = rule.pattern.exec(text);
        if (match) {
          findings.push({ code: 'OPPOSITE_STANCE', severity: 'ERROR', sectionId: section.id, sectionTitle: section.title, message: `${rule.message} (el escrito lo firma la ${contract.signerLabel}).`, excerpt: snippet(text.slice(Math.max(0, match.index - 30), match.index + 90)), regenerable });
          break;
        }
      }
    }

    // 5. Fechas, lugares y órganos que no constan en la ficha ni en la fuente.
    if (section.type === 'closing') {
      if (new RegExp(DATE_IN_TEXT.source, 'i').test(text) || /\b20\d{2}\b/.test(text)) {
        findings.push({ code: 'CLOSING_HAS_DATE', severity: 'ERROR', sectionId: section.id, sectionTitle: section.title, message: 'La fecha de presentación no consta: queda en blanco en el cierre.', repair: 'REBUILD_CLOSING', regenerable: false });
      }
    } else if (section.type !== 'signature') {
      for (const match of text.matchAll(new RegExp(DATE_IN_TEXT.source, 'gi'))) {
        const date = fold(match[0]);
        if (!allowedDates.has(date) && !sourceFold.includes(date)) {
          findings.push({ code: 'DATE_NOT_IN_DOSSIER', severity: 'ERROR', sectionId: section.id, sectionTitle: section.title, message: `La fecha «${match[0]}» no consta en la ficha ni en la fuente.`, excerpt: snippet(match[0]), regenerable });
          break;
        }
      }
      for (const match of text.matchAll(PLACE_RE)) {
        const place = fold(match[1]);
        if (!sourceFold.includes(place)) {
          findings.push({ code: 'PLACE_NOT_IN_DOSSIER', severity: 'ERROR', sectionId: section.id, sectionTitle: section.title, message: `El lugar «${match[1]}» no consta en la ficha ni en la fuente.`, excerpt: snippet(match[0]), regenerable });
          break;
        }
      }
      for (const match of text.matchAll(ORGAN_RE)) {
        const organ = fold(match[0]).split(' ').slice(0, 4).join(' ');
        if (organ.length > 8 && !sourceFold.includes(organ)) {
          findings.push({ code: 'ORGAN_NOT_IN_SOURCES', severity: 'ERROR', sectionId: section.id, sectionTitle: section.title, message: `El órgano «${snippet(match[0], 80)}» no consta en las fuentes.`, excerpt: snippet(match[0], 80), regenerable });
          break;
        }
      }
    }

    // 6. Firma coherente con el rol y con la parte representada.
    if (section.type === 'signature') {
      const folded = fold(text);
      const problems: string[] = [];
      if (dossier?.representedName && !folded.includes(fold(dossier.representedName).slice(0, 40))) problems.push(`debe nombrar a ${dossier.representedName}`);
      const counterpart = dossier?.parties.filter((party) => party.name && party.name !== dossier.representedName && dossier.representedSide && party.role !== dossier.representedSide).map((party) => party.name) || [];
      for (const name of counterpart) if (folded.includes(fold(name).slice(0, 40))) { problems.push(`nombra a la contraparte (${name})`); break; }
      for (const label of foreignRoleLabels(contract.signerRole)) if (folded.includes(label)) { problems.push(`dice «${label}», pero firma la ${contract.signerLabel}`); break; }
      if (problems.length) {
        findings.push({ code: 'SIGNATURE_ROLE_MISMATCH', severity: 'ERROR', sectionId: section.id, sectionTitle: section.title, message: `La firma es incoherente con el rol: ${problems.join('; ')}.`, repair: 'REBUILD_SIGNATURE', regenerable: false });
      }
    }
  }

  // 7. Exceso de marcadores de dato pendiente.
  if (markerTotal > contract.maxInlineMarkers) {
    const worst = [...markerBySection].sort((a, b) => b.count - a.count).filter((item) => item.count >= 2);
    findings.push({
      code: 'TOO_MANY_MARKERS', severity: 'ERROR', message: `El cuerpo tiene ${markerTotal} marcadores de dato pendiente (máximo ${contract.maxInlineMarkers}).`,
      regenerable: worst.some((item) => isAi(item.section)),
    });
    for (const item of worst.filter((entry) => isAi(entry.section))) {
      findings.push({ code: 'TOO_MANY_MARKERS', severity: 'ERROR', sectionId: item.section.id, sectionTitle: item.section.title, message: `La sección «${item.section.title}» concentra ${item.count} marcadores.`, regenerable: true });
    }
  }

  // 8. Estructura estricta del contrato.
  if (contract.strictStructure) {
    const expected = contract.fixedSections.map(fold);
    const actual = titles;
    const matchesExpected = (title: string, slot: string) => title === slot || title.includes(slot) || (slot === 'contestacion a los agravios' && /^contestacion al agravio\b/.test(title));
    let cursor = 0;
    for (const title of actual) {
      const index = expected.findIndex((slot, position) => position >= cursor && matchesExpected(title, slot));
      if (index < 0) {
        findings.push({ code: 'STRUCTURE_OUT_OF_CONTRACT', severity: 'ERROR', message: `La sección «${title}» no pertenece a la estructura fija de este escrito o está fuera de orden.`, regenerable: false });
      } else cursor = index;
    }
    for (const slot of expected) {
      if (!actual.some((title) => matchesExpected(title, slot))) {
        findings.push({ code: 'STRUCTURE_OUT_OF_CONTRACT', severity: 'ERROR', message: `Falta la sección «${slot}» de la estructura fija.`, regenerable: false });
      }
    }
  }

  return findings;
}

export function contractFindingSummary(findings: readonly ContractFinding[]): Record<string, number> {
  return findings.reduce<Record<string, number>>((acc, finding) => { acc[finding.code] = (acc[finding.code] || 0) + 1; return acc; }, {});
}
