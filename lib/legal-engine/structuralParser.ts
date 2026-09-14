/**
 * structuralParser.ts — NIVEL 3: Parser Estructural Determinístico
 *
 * Detecta la estructura jurídica del documento SIN IA, usando reglas
 * determinísticas. Adaptativo: no inventa secciones, clasifica lo que
 * realmente existe.
 */
import type { DocumentElement, DocumentIndex } from './documentIndex';
import type { SectionType } from './types';

export type StructuralSectionKind =
  | 'encabezado'
  | 'antecedentes'
  | 'demanda'
  | 'contestacion'
  | 'resolucion'
  | 'concepto_violacion'
  | 'agravio'
  | 'argument'
  | 'consideraciones'
  | 'estudio'
  | 'resolutivos'
  | 'pruebas'
  | 'petitorios'
  | 'firmas'
  | 'cierre'
  | 'header'
  | 'unknown';

export interface DetectedSection {
  kind: StructuralSectionKind;
  sectionType: SectionType;
  title: string;
  level: number; // 1 = bloque principal, 2 = sub-bloque, 3 = sub-sub-bloque
  startOrder: number;
  endOrder: number;
  elementIndices: number[]; // índices en DocumentIndex.elements
  pageStart: number;
  pageEnd: number;
  confidence: number;
  matchedPattern?: string;
}

// ── Patrones determinísticos (prioridad en orden) ───────────────────────────

interface StructuralPattern {
  kind: StructuralSectionKind;
  sectionType: SectionType;
  level: number;
  re: RegExp;
  confidence: number;
  label: (m: RegExpMatchArray) => string;
}

const PATTERNS: StructuralPattern[] = [
  // Encabezado / tribunal
  { kind: 'encabezado', sectionType: 'header', level: 1, re: /^(H\.\s*)?(SUPREMA\s+CORTE|SEGUNDO\s+TRIBUNAL\s+COLEGIADO|PRIMER\s+TRIBUNAL|TRIBUNAL\s+COLEGIADO|JUZGADO\s+DE\s+DISTRITO|SALA\s+(?:SUPERIOR|REGIONAL)|PODER\s+JUDICIAL|JUNTA\s+(?:FEDERAL|LOCAL|ESPECIAL))[\s\S]{0,80}$/i, confidence: 96, label: () => 'ENCABEZADO' },
  // Antecedentes (RESULTANDO / ANTECEDENTES)
  { kind: 'antecedentes', sectionType: 'background', level: 1, re: /^(RESULTANDO|ANTECEDENTES|HECHOS\s+NOTORIOS|RELACI[ÓO]N\s+DE\s+HECHOS)/i, confidence: 92, label: (m) => m[1].toUpperCase() },
  { kind: 'demanda', sectionType: 'background', level: 2, re: /^(?:\d+\.\s*)?DEMANDA(?:\s+ORIGINAL)?/i, confidence: 85, label: () => 'Demanda' },
  { kind: 'contestacion', sectionType: 'argument', level: 2, re: /^(?:\d+\.\s*)?CONTESTACI[ÓO]N/i, confidence: 85, label: () => 'Contestación' },
  { kind: 'resolucion', sectionType: 'background', level: 2, re: /^(?:\d+\.\s*)?(?:RESOLUCI[ÓO]N\s+IMPUGNADA|LAUDO\s+RECLAMADO|SENTENCIA\s+RECURRIDA|EJECUTORIA\s+RECURRIDA)/i, confidence: 88, label: (m) => m[0].trim().slice(0, 80) },

  // Conceptos / Agravios — variantes con numeración jurídica
  { kind: 'concepto_violacion', sectionType: 'argument', level: 1, re: /^(?:PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO|SEXTO|S[EÉ]PTIMO|OCTAVO|NOVENO|D[EÉ]CIMO)\s+CONCEPTO\s+DE\s+VIOLACI[ÓO]N/i, confidence: 97, label: (m) => m[0].trim().slice(0, 90) },
  { kind: 'concepto_violacion', sectionType: 'argument', level: 1, re: /^CONCEPTO\s+DE\s+VIOLACI[ÓO]N\s*(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|\d+)?/i, confidence: 95, label: (m) => m[0].trim().slice(0, 90) },
  { kind: 'agravio', sectionType: 'argument', level: 1, re: /^(?:PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO|SEXTO|S[EÉ]PTIMO|OCTAVO|NOVENO|D[EÉ]CIMO)?\s*AGRAVIO\s*(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|\d+)?/i, confidence: 96, label: (m) => m[0].trim().slice(0, 90) || 'AGRAVIO' },
  { kind: 'agravio', sectionType: 'argument', level: 1, re: /^AGRAVIOS?$/i, confidence: 90, label: () => 'AGRAVIOS' },

  // Numeración clásica PRIMERO. / SEGUNDO. etc. (sin concepto/agravio explícito pero con estructura jurídica)
  { kind: 'argument', sectionType: 'argument', level: 1, re: /^(PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[EÉ]PTIMO|OCTAVO|NOVENO|D[EÉ]CIMO)(\.\s.*)?$/i, confidence: 70, label: (m) => m[0].trim().slice(0, 90) },
  // P R I M E R O espaciado
  { kind: 'argument', sectionType: 'argument', level: 1, re: /^P\s*R\s*I\s*M\s*E\s*R\s*O/i, confidence: 72, label: () => 'PRIMERO' },

  // CONSIDERANDO / CONSIDERACIONES
  { kind: 'consideraciones', sectionType: 'argument', level: 1, re: /^(CONSIDERANDO|CONSIDERACIONES|CONSIDERACI[ÓO]N)/i, confidence: 92, label: (m) => m[1].toUpperCase() },
  // ESTUDIO
  { kind: 'estudio', sectionType: 'argument', level: 1, re: /^(ESTUDIO\s+(?:DE\s+FONDO)?|AN[ÁA]LISIS\s+JUR[ÍI]DICO|ESTUDIO\s+CONSTITUCIONAL)/i, confidence: 90, label: (m) => m[1].toUpperCase() },
  // RESUELVE / RESOLUTIVOS
  { kind: 'resolutivos', sectionType: 'petition', level: 1, re: /^(RESUELVE|RESOLUTIVOS|PUNTOS\s+RESOLUTIVOS|SE\s+RESUELVE)/i, confidence: 94, label: () => 'RESOLUTIVOS' },
  { kind: 'petitorios', sectionType: 'petition', level: 1, re: /^(PUNTOS?\s+PETITORIOS?|PETITORIOS?)/i, confidence: 94, label: () => 'PUNTOS PETITORIOS' },

  // Pruebas
  { kind: 'pruebas', sectionType: 'evidence', level: 1, re: /^(PRUEBAS?|OFRECIMIENTO\s+DE\s+PRUEBAS?|INSTRUMENTAL\s+DE\s+ACTUACIONES|PRESUNCIONAL)/i, confidence: 90, label: () => 'PRUEBAS' },

  // Procedencia / Bloque de constitucionalidad / Oportunidad
  { kind: 'antecedentes', sectionType: 'legal_grounds', level: 1, re: /^(PROCEDENCIA|OPORTUNIDAD|BLOQUE\s+DE\s+CONSTITUCIONALIDAD|INTER[ÉE]S\s+EXCEPCIONAL|FUNDAMENTO\s+CONSTITUCIONAL)/i, confidence: 88, label: (m) => m[0].trim().slice(0, 80) },

  // Cierre / protesta / firma
  { kind: 'cierre', sectionType: 'closing', level: 1, re: /^(PROTESTO\s+LO\s+NECESARIO|ATENTAMENTE|LUGAR\s+Y\s+FECHA)/i, confidence: 95, label: () => 'CIERRE' },
  { kind: 'firmas', sectionType: 'signature', level: 1, re: /^(FIRMA|FIRMAS|R[ÚU]BRICA)/i, confidence: 96, label: () => 'FIRMAS' },

  // Jurisprudencia explícita como encabezado
  { kind: 'argument', sectionType: 'argument', level: 2, re: /^(JURISPRUDENCIA|TESIS\s+(?:AISLADA|DE\s+JURISPRUDENCIA)|CRITERIO\s+JURISPRUDENCIAL)/i, confidence: 80, label: (m) => m[0].trim().slice(0, 80) },
];

function detectKindForElement(el: DocumentElement): { pattern: StructuralPattern; match: RegExpMatchArray } | null {
  // Sólo headings / párrafos cortos / unknown cortos pueden ser encabezados jurídicos
  const text = el.text.trim();
  if (text.length > 180) return null;
  // Ignorar números de página y firmas puras
  if (el.type === 'page_number' || el.type === 'signature') return null;

  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) return { pattern: p, match: m };
  }
  return null;
}

export function parseLegalStructure(index: DocumentIndex): DetectedSection[] {
  const sections: DetectedSection[] = [];
  const elements = index.elements;

  let currentSection: DetectedSection | null = null;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const detected = detectKindForElement(el);

    if (detected) {
      // Cerrar sección anterior
      if (currentSection) {
        currentSection.endOrder = el.order - 1;
        currentSection.pageEnd = elements[i - 1]?.pageNumber ?? currentSection.pageStart;
        sections.push(currentSection);
      }

      const { pattern, match } = detected;
      const title = pattern.label(match).trim().slice(0, 100) || pattern.kind.toUpperCase();

      currentSection = {
        kind: pattern.kind,
        sectionType: pattern.sectionType,
        title,
        level: pattern.level,
        startOrder: el.order,
        endOrder: el.order, // se actualizará al cerrar
        elementIndices: [i],
        pageStart: el.pageNumber,
        pageEnd: el.pageNumber,
        confidence: pattern.confidence,
        matchedPattern: pattern.re.source.slice(0, 80),
      };
    } else if (currentSection) {
      // Acumular elementos dentro de la sección abierta
      currentSection.elementIndices.push(i);
      currentSection.pageEnd = el.pageNumber;
    } else {
      // Contenido antes del primer encabezado jurídico → se agrupa como preámbulo/encabezado implícito si es relevante
      // No crear sección hasta encontrar un encabezado real; se acumulará como "unknown" inicial
    }
  }

  if (currentSection) {
    // Cerrar última sección
    const lastEl = elements[elements.length - 1];
    currentSection.endOrder = lastEl?.order ?? currentSection.startOrder;
    if (elements.length > 0) currentSection.pageEnd = elements[elements.length - 1].pageNumber;
    sections.push(currentSection);
  }

  // Si no se detectó ninguna sección jurídica (documento sin encabezados reconocibles), crear una sección genérica
  if (sections.length === 0 && elements.length > 0) {
    sections.push({
      kind: 'unknown',
      sectionType: 'argument',
      title: 'CONTENIDO DEL DOCUMENTO',
      level: 1,
      startOrder: elements[0].order,
      endOrder: elements[elements.length - 1].order,
      elementIndices: elements.map((_, idx) => idx),
      pageStart: elements[0].pageNumber,
      pageEnd: elements[elements.length - 1].pageNumber,
      confidence: 50,
      matchedPattern: 'fallback-generic',
    });
  }

  // Si hay contenido previo al primer heading detectado, crear sección encabezado implícita
  if (sections.length > 0 && elements.length > 0) {
    const firstSectionOrder = sections[0].startOrder;
    const leadingIndices: number[] = [];
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].order < firstSectionOrder) leadingIndices.push(i);
    }
    // Solo crear sección líder si hay contenido significativo (>2 elementos con texto relevante)
    const significantLeading = leadingIndices.filter((idx) => {
      const el = elements[idx];
      return el.type !== 'page_number' && el.text.trim().length > 20;
    });
    if (significantLeading.length >= 2) {
      sections.unshift({
        kind: 'encabezado',
        sectionType: 'header',
        title: 'ENCABEZADO',
        level: 1,
        startOrder: elements[leadingIndices[0]].order,
        endOrder: elements[leadingIndices[leadingIndices.length - 1]].order,
        elementIndices: leadingIndices,
        pageStart: elements[leadingIndices[0]].pageNumber,
        pageEnd: elements[leadingIndices[leadingIndices.length - 1]].pageNumber,
        confidence: 75,
        matchedPattern: 'implicit-leading',
      });
    }
  }

  return sections;
}

/**
 * Totem de diagnóstico: cuántos bloques de cada tipo detectó el parser.
 */
export function summarizeParsedStructure(sections: DetectedSection[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const s of sections) acc[s.kind] = (acc[s.kind] || 0) + 1;
  return acc;
}
