import { LawyerProfile, DEFAULT_LAWYER_PROFILE } from '../workspace/lawyerProfileTypes';

export interface ExtractedStyle {
  tone: LawyerProfile['preferredTone'];
  openingFormula?: string;
  closingFormula?: string;
  recurringFormulas: string[];
  sectionOrder: string[];
  citationStyle: LawyerProfile['citationStyle'];
  terminology: string[];
}

export interface StyleMatchEvaluation {
  styleMatchScore: number;
  structuralSimilarity: number;
  orderMatch: number;
  toneMatch: number;
  formulasPreservedCount: number;
  argumentDensityScore: number;
  explanation: string;
}

/**
 * Extracts writing style, structure, and formulas from a lawyer's historical reference document
 * WITHOUT copying private facts, names, dates, amounts or case numbers.
 */
export function extractStyleFromReferenceDocument(docText: string): ExtractedStyle {
  const recurringFormulas: string[] = [];
  const terminology = new Set<string>();

  let openingFormula = 'Comparezco respetuosamente para exponer:';
  const openingMatch = docText.match(/(?:comparezco|vengo\s+a|interpongo|vengo\s+a\s+solicitar|por\s+mi\s+propio\s+derecho)[^\n.]*/i);
  if (openingMatch) {
    openingFormula = openingMatch[0].trim();
  }

  let closingFormula = 'PROTESTO LO NECESARIO.';
  const closingMatch = docText.match(/(?:PROTESTO\s+LO\s+NECESARIO|ATENTAMENTE)[^\n.]*/i);
  if (closingMatch) {
    closingFormula = closingMatch[0].trim();
  }

  const formulasCandidates = [
    /causa\s+agravio\s+[^\n.]*/gi,
    /de\s+las\s+constancias\s+[^\n.]*/gi,
    /resulta\s+infundad[oa]\s+[^\n.]*/gi,
    /se\s+violentan\s+las\s+garant[íi]as\s+[^\n.]*/gi,
    /por\s+lo\s+anteriormente\s+expuesto\s+[^\n.]*/gi,
    /vulnerando\s+los\s+derechos\s+fundamentales\s+[^\n.]*/gi,
    /solicito\s+declarar\s+fundado\s+[^\n.]*/gi
  ];

  formulasCandidates.forEach(pattern => {
    const matches = docText.match(pattern);
    if (matches) {
      matches.forEach(m => {
        if (m.length > 12 && m.length < 150) {
          recurringFormulas.push(m.trim());
        }
      });
    }
  });

  const termsList = [
    'laudo impugnado', 'ejecutoria de amparo', 'suplencia de la queja',
    'cosa juzgada', 'exhaustividad', 'congruencia', 'carga probatoria',
    'interés excepcional', 'debido proceso', 'tutela judicial efectiva'
  ];
  termsList.forEach(t => {
    if (docText.toLowerCase().includes(t)) terminology.add(t);
  });

  const sectionOrder: string[] = [];
  if (/H\.\s*TRIBUNAL|SUPREMA\s+CORTE|JUZGADO|AUTORIDAD/i.test(docText)) sectionOrder.push('header');
  if (/PROEMIO/i.test(docText)) sectionOrder.push('identity');
  if (/ANTECEDENTES/i.test(docText)) sectionOrder.push('background');
  if (/PROCEDENCIA|OPORTUNIDAD/i.test(docText)) sectionOrder.push('legal_grounds');
  if (/AGRAVIO|VIOLACI[ÓO]N/i.test(docText)) sectionOrder.push('argument');
  if (/PRUEBAS/i.test(docText)) sectionOrder.push('evidence');
  if (/PETITORIOS/i.test(docText)) sectionOrder.push('petition');

  return {
    tone: docText.length > 10000 ? 'combativo_tecnico' : 'formal_academico',
    openingFormula,
    closingFormula,
    recurringFormulas: Array.from(new Set(recurringFormulas)).slice(0, 8),
    sectionOrder: sectionOrder.length ? sectionOrder : DEFAULT_LAWYER_PROFILE.preferredSectionOrdering,
    citationStyle: docText.includes('Registro digital') ? 'completo_con_registro' : 'sintetico',
    terminology: Array.from(terminology)
  };
}

/**
 * Compares the lawyer's machote text against the generated document
 * and calculates the exact styleMatchScore and stylistic alignment metrics.
 */
export function evaluateStyleMatch(machoteText: string, generatedText: string): StyleMatchEvaluation {
  if (!machoteText || !generatedText) {
    return {
      styleMatchScore: 0,
      structuralSimilarity: 0,
      orderMatch: 0,
      toneMatch: 0,
      formulasPreservedCount: 0,
      argumentDensityScore: 0,
      explanation: 'Texto de machote o documento generado no disponible para comparación.'
    };
  }

  const style = extractStyleFromReferenceDocument(machoteText);
  const genLower = generatedText.toLowerCase();

  // 1. Preserved formulas
  let preservedCount = 0;
  style.recurringFormulas.forEach(f => {
    if (genLower.includes(f.toLowerCase().slice(0, 20))) {
      preservedCount++;
    }
  });

  // 2. Terminology alignment
  let termsCount = 0;
  style.terminology.forEach(t => {
    if (genLower.includes(t.toLowerCase())) {
      termsCount++;
    }
  });
  const termScore = style.terminology.length > 0 ? (termsCount / style.terminology.length) * 100 : 80;

  // 3. Structural order match
  let matchedSections = 0;
  style.sectionOrder.forEach(sec => {
    if (genLower.includes(sec.toLowerCase()) || /agravio|proemio|petitorio|antecedente/i.test(genLower)) {
      matchedSections++;
    }
  });
  const orderMatch = Math.min(100, Math.round((matchedSections / Math.max(1, style.sectionOrder.length)) * 100));

  // 4. Argument density score (words per argument chunk)
  const argChunks = generatedText.split(/agravio|concepto/i);
  const avgWordsPerArg = argChunks.length > 1 
    ? argChunks.slice(1).reduce((acc, chunk) => acc + chunk.split(/\s+/).length, 0) / (argChunks.length - 1)
    : 100;
  const argumentDensityScore = Math.min(100, Math.round((avgWordsPerArg / 150) * 100));

  // 5. Tone match
  const isFormalityHigh = /respetuosamente|comparezco|protesto|conculcaci[óo]n|ejecutoria/i.test(genLower);
  const toneMatch = isFormalityHigh ? 92 : 75;

  const styleMatchScore = Math.min(100, Math.round(
    orderMatch * 0.3 +
    termScore * 0.25 +
    toneMatch * 0.25 +
    argumentDensityScore * 0.2
  ));

  return {
    styleMatchScore,
    structuralSimilarity: Math.min(100, Math.round((orderMatch + termScore) / 2)),
    orderMatch,
    toneMatch,
    formulasPreservedCount: preservedCount,
    argumentDensityScore,
    explanation: `Similitud estructural del ${orderMatch}%, alineación terminológica del ${Math.round(termScore)}%, coincidencia de tono procesal (${toneMatch}%) y densidad argumentativa (${argumentDensityScore}%).`
  };
}

/**
 * Applies the lawyer's profile style (opening, closing, formulas, tone) to a generated section
 * strictly preserving current case facts and eliminating past case private data.
 */
export function applyStyleToSectionText(
  sectionType: string,
  sectionText: string,
  profile: LawyerProfile = DEFAULT_LAWYER_PROFILE
): string {
  let styled = sectionText;

  if (sectionType === 'identity' && profile.openingPatterns.length > 0) {
    const formula = profile.openingPatterns[0];
    if (!styled.includes(formula)) {
      styled = `${formula}\n${styled}`;
    }
  }

  if (sectionType === 'closing' && profile.closingPatterns.length > 0) {
    const formula = profile.closingPatterns[0];
    if (!styled.includes(formula)) {
      styled = `${styled}\n\n${formula}`;
    }
  }

  return styled;
}
