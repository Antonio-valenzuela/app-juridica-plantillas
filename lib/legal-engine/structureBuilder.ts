import { ClassificationResult, DocumentNode, SectionType, createDocumentNode } from './types';
import { hasSeedMarkers, stripSeedMarkers } from './seedMarkers';

interface SectionTemplate {
  type: SectionType;
  title: string;
  isRepeatable?: boolean;
}

const DOCUMENT_STRUCTURES: Record<string, SectionTemplate[]> = {
  recurso_revision_amparo_directo: [
    { type: 'header', title: 'H. SEGUNDO TRIBUNAL COLEGIADO EN MATERIA DE TRABAJO DEL TERCER CIRCUITO' },
    { type: 'identity', title: 'PROEMIO E IDENTIFICACIÓN DEL RECURRENTE' },
    { type: 'legal_grounds', title: 'OPORTUNIDAD PROCESAL DEL RECURSO DE REVISIÓN' },
    { type: 'legal_grounds', title: 'INTERÉS EXCEPCIONAL' },
    { type: 'background', title: 'OBJETO DE LA IMPUGNACIÓN Y SENTENCIA DE AMPARO RECURRIDA' },
    { type: 'background', title: 'ANTECEDENTES PROCESALES DEL JUICIO LABORAL DE ORIGEN' },
    { type: 'background', title: 'ANTECEDENTE DEL PRIMER JUICIO DE AMPARO DIRECTO' },
    { type: 'background', title: 'CUMPLIMIENTO DE LA EJECUTORIA ANTERIOR Y NUEVO LAUDO' },
    { type: 'background', title: 'EJECUTORIA RECURRIDA EN EL AMPARO DIRECTO' },
    { type: 'legal_grounds', title: 'PROCEDENCIA DEL RECURSO DE REVISIÓN EN AMPARO DIRECTO' },
    { type: 'argument', title: 'BLOQUE DE CONSTITUCIONALIDAD' },
    { type: 'argument', title: 'VIOLACIÓN AL DEBIDO PROCESO Y TUTELA JUDICIAL EFECTIVA' },
    { type: 'argument', title: 'AGRAVIO PRIMERO', isRepeatable: true },
    { type: 'argument', title: 'SEGUNDO AGRAVIO: Desatención a la suplencia de la queja y al principio de cosa juzgada', isRepeatable: true },
    { type: 'argument', title: 'TERCER AGRAVIO: Inaplicación del control difuso de constitucionalidad y convencionalidad', isRepeatable: true },
    { type: 'argument', title: 'CUARTO AGRAVIO: Violación al principio de progresividad y derechos adquiridos', isRepeatable: true },
    { type: 'argument', title: 'QUINTO AGRAVIO: Indebida distribución de la carga probatoria en el juicio laboral', isRepeatable: true },
    { type: 'argument', title: 'CONCLUSIONES JURÍDICAS Y EFECTOS DE LA REVISIÓN' },
    { type: 'evidence', title: 'PRUEBAS E INSTRUMENTAL DE ACTUACIONES' },
    { type: 'petition', title: 'PETITORIOS' },
    { type: 'closing', title: 'PROTESTO DE LEY Y LUGAR DE PRESENTACIÓN' },
    { type: 'signature', title: 'FIRMA Y REPRESENTACIÓN' }
  ],
  contestacion_demanda_laboral: [
    { type: 'header', title: 'Encabezado y Rubro' },
    { type: 'identity', title: 'Proemio e Identidad' },
    { type: 'background', title: 'Contestación a los Hechos' },
    { type: 'argument', title: 'Excepciones y Defensas' },
    { type: 'argument', title: 'Objeción de Pruebas' },
    { type: 'evidence', title: 'Ofrecimiento de Pruebas' },
    { type: 'petition', title: 'Puntos Petitorios' },
    { type: 'closing', title: 'Lugar y Fecha' },
    { type: 'signature', title: 'Firma' },
    { type: 'annex', title: 'Anexos' }
  ],
  demanda_amparo_indirecto: [
    { type: 'header', title: 'Encabezado y Rubro' },
    { type: 'identity', title: 'Proemio e Identidad' },
    { type: 'background', title: 'Antecedentes del Acto Reclamado' },
    { type: 'facts', title: 'Acto Reclamado y Autoridades' },
    { type: 'legal_grounds', title: 'Preceptos Constitucionales Violados' },
    { type: 'argument', title: 'Concepto de Violación', isRepeatable: true },
    { type: 'evidence', title: 'Pruebas' },
    { type: 'petition', title: 'Puntos Petitorios' },
    { type: 'closing', title: 'Lugar y Fecha' },
    { type: 'signature', title: 'Firma' }
  ],
  escrito_agravios: [
    { type: 'header', title: 'Encabezado y Rubro' },
    { type: 'identity', title: 'Proemio e Identidad' },
    { type: 'background', title: 'Resolución Impugnada' },
    { type: 'legal_grounds', title: 'Procedencia' },
    { type: 'argument', title: 'Agravio', isRepeatable: true },
    { type: 'evidence', title: 'Pruebas (Supervenientes)' },
    { type: 'petition', title: 'Puntos Petitorios' },
    { type: 'closing', title: 'Lugar y Fecha' },
    { type: 'signature', title: 'Firma' }
  ]
};

const GENERIC_STRUCTURE: SectionTemplate[] = [
  { type: 'header', title: 'Encabezado y Rubro' },
  { type: 'identity', title: 'Proemio e Identidad' },
  { type: 'background', title: 'Antecedentes' },
  { type: 'facts', title: 'Hechos' },
  { type: 'argument', title: 'Consideraciones Legales / Argumentos', isRepeatable: true },
  { type: 'evidence', title: 'Pruebas' },
  { type: 'petition', title: 'Puntos Petitorios' },
  { type: 'closing', title: 'Lugar y Fecha' },
  { type: 'signature', title: 'Firma' }
];

export function buildStructure(classification: ClassificationResult): DocumentNode[] {
  const structure = DOCUMENT_STRUCTURES[classification.documentType] || GENERIC_STRUCTURE;
  
  return structure.map((template, index) => 
    createDocumentNode({
      id: `sec-${index + 1}`,
      type: template.type,
      title: template.title,
      order: index * 10,
      isRepeatable: template.isRepeatable,
      content: [],
    })
  );
}

/**
 * Dynamically parses a lawyer's reference machote text to extract its deep hierarchical structure tree.
 * Identifies headers, chapters, sub-headings, agravios, petitorios, closing and signature nodes.
 */
export function extractMachoteStructure(machoteText: string, classification?: ClassificationResult): DocumentNode[] {
  if (!machoteText || machoteText.trim().length < 100) {
    // Si no hay texto suficiente, usar estructura basada en clasificación si está disponible
    if (classification && classification.documentType) {
      return buildStructure(classification);
    }
    // Fallback genérico sin asumir tipo de documento específico
    return buildStructure({ documentType: 'escrito_libre', documentTypeLabel: 'Escrito Libre', matter: 'general', jurisdiction: 'general', proceduralStage: 'cualquiera' } as ClassificationResult);
  }

  const lines = machoteText.split('\n').map(l => l.trim()).filter(Boolean);
  const nodes: DocumentNode[] = [];
  let currentOrder = 0;
  let bodyLines: string[] = [];

  const attachBodyToLastNode = () => {
    const body = bodyLines.join('\n\n').trim();
    bodyLines = [];
    if (!body || nodes.length === 0) return;
    const hasSeed = hasSeedMarkers(body);
    const cleanedText = hasSeed ? stripSeedMarkers(body) : body;
    nodes[nodes.length - 1].content = [{
      id: `blk-machote-${nodes.length}`,
      layer: 'USER_POSITION' as const,
      trustLevel: 'VERIFIED' as const,
      text: cleanedText,
      isManuallyEdited: false,
      generationRequirement: hasSeed ? ('AI_REQUIRED' as const) : undefined,
      generationStatus: hasSeed ? ('pending' as const) : undefined,
    }];
  };

  const isHeadingLine = (line: string) => {
    if (line.length > 120) return false;
    if (/^(H\.|SEGUNDO|PRIMER|TRIBUNAL|SUPREMA|JUZGADO|SALA)/i.test(line) && line.length < 90) return true;
    if (/^(PROEMIO|HECHO|HECHOS|ANTECEDENTES|OPORTUNIDAD|PROCEDENCIA|AGRAVIO|CONCEPTO|PRESTACION|PRUEBAS|PETITORIOS|PROTESTO|FIRMA)/i.test(line)) return true;
    if (/^(PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|SÉPTIMO|OCTAVO|NOVENO|DÉCIMO)\b/i.test(line) && line.length < 100) return true;
    if (/^[A-ZÁÉÍÓÚÑ0-9\s\.\-:\(\)]{5,80}$/.test(line) && !line.endsWith('.')) return true;
    return false;
  };

  lines.forEach((line) => {
    if (isHeadingLine(line)) {
      attachBodyToLastNode();
      const inlineSeparator = line.indexOf(':');
      const inlineHeading = inlineSeparator > 0 && /^(?:HECHOS?|ANTECEDENTES?|FUNDAMENTO|DERECHO|PRUEBAS?|PRESTACIONES?|PETITORIOS?|PUNTOS|AGRAVIOS?|CONCEPTOS?)/i.test(line.slice(0, inlineSeparator).trim());
      const headingTitle = inlineHeading ? line.slice(0, inlineSeparator).trim() : line;
      const inlineBody = inlineHeading ? line.slice(inlineSeparator + 1).trim() : '';
      let nodeType: SectionType = 'custom';
      if (/tribunal|juzgado|header|rubro/i.test(headingTitle)) nodeType = 'header';
      else if (/proemio|comparezco|identidad/i.test(headingTitle)) nodeType = 'identity';
      else if (/antecedentes|hechos|juicio|laudo/i.test(headingTitle)) nodeType = 'background';
      else if (/oportunidad|procedencia|fundamento/i.test(headingTitle)) nodeType = 'legal_grounds';
      else if (/agravio|concepto|constitucion|violacion/i.test(headingTitle)) nodeType = 'argument';
      else if (/prueba|instrumental/i.test(headingTitle)) nodeType = 'evidence';
      else if (/petitorio|puntos/i.test(headingTitle)) nodeType = 'petition';
      else if (/protesto|lugar|fecha/i.test(headingTitle)) nodeType = 'closing';
      else if (/firma|promovente/i.test(headingTitle)) nodeType = 'signature';

      // Evitar títulos consecutivos idénticos
      if (nodes.length === 0 || nodes[nodes.length - 1].title !== headingTitle) {
        currentOrder += 10;
        nodes.push(
          createDocumentNode({
            id: `sec-machote-${nodes.length + 1}`,
            type: nodeType,
            title: headingTitle,
            order: currentOrder,
            isRepeatable: nodeType === 'argument',
            content: [],
          })
        );
      }
      if (inlineBody) bodyLines.push(inlineBody);
    } else {
      bodyLines.push(line);
    }
  });
  attachBodyToLastNode();

  // Ya NO hacer fallback automático a un expediente histórico basándose solo en la cantidad de secciones.
  // La clasificación disponible ya se utilizó arriba. Si.nodes.length es pequeño, es un documento pequeño,
  // no necesariamente inválido. Retornar lo extraído o la estructura genérica.
  if (nodes.length > 0) {
    return nodes;
  }

  // Si no se detectaron secciones por el parser, usar clasificación si está disponible
  if (classification && classification.documentType) {
    return buildStructure(classification);
  }

  return buildStructure({ documentType: 'escrito_libre', documentTypeLabel: 'Escrito Libre', matter: 'general', jurisdiction: 'general', proceduralStage: 'cualquiera' } as ClassificationResult);
}

/**
 * Extrae campos de integridad críticos del texto del machote.
 * Estos campos deben conservarse y no generarse arbitrariamente.
 * 
 * Los campos extraídos pueden usarse para validar que el documento generado
 * conserve la misma información critical.
 * 
 * Campos extraídos:
 * - expediente: número de expediente capturado de la fuente
 * - tribunal: nombre del tribunal o juez
 * - fecha: fecha del juicio o sentencia
 * - autoridad: autoridad a la que se dirige el documento
 */
export function extractIntegrityFields(machoteText: string): { expediente?: string; tribunal?: string; fecha?: string; autoridad?: string } {
  const result: { expediente?: string; tribunal?: string; fecha?: string; autoridad?: string } = {};
  if (!machoteText) return result;

  // Patrones de expediente: Prioridad a palabras clave (Expediente, Amparo, Toca, Juicio)
  const explicitExpMatch = machoteText.match(/(?:(?:EXPEDIENTE|EXP\.|JUICIO(?:\s+DE\s+AMPARO)?|AMPARO\s+(?:DIRECTO|INDIRECTO)|TOCA|CAUSA)[\s\:\#N°n°.-]*\s*)([A-Z0-9\-\.\/]+\/\d{2,4}(?:-[A-Z0-9]+)?)/i);
  if (explicitExpMatch) {
    result.expediente = explicitExpMatch[1].trim();
  } else {
    // Si no hay palabra clave, buscar formato numérico N/AAAA evitando fechas DD/MM/AAAA
    const standaloneExpMatch = machoteText.match(/(?<!\d[\/\-\.])\b(\d{1,6}\/\d{2,4}(?:-[A-Z0-9]+)?)\b(?!\s*[\/\-\.]\s*\d)/);
    if (standaloneExpMatch) {
      result.expediente = standaloneExpMatch[1].trim();
    }
  }

  // Patrones de tribunal / órgano jurisdiccional
  const tribunalMatch = machoteText.match(/(?:AL?\s+)?((?:H\.\s+)?(?:SEGUNDO\s+|PRIMER\s+|TERCER\s+|CUARTO\s+|QUINTO\s+|SEXTO\s+|S[EÉ]PTIMO\s+|OCTAVO\s+|NOVENO\s+|D[EÉ]CIMO\s+)?(?:TRIBUNAL|JUZGADO|SALA|SUPREMA\s+CORTE|JUNTA\s+FEDERAL|JUNTA\s+LOCAL|JUNTA\s+ESPECIAL)[^\n]{3,120})/i);
  if (tribunalMatch) {
    result.tribunal = tribunalMatch[1].trim();
  }

  // Patrones de fecha
  const fechaMatch = machoteText.match(/(?:\b\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}\b)|(?:\b\d{1,2}\/\d{1,2}\/\d{4}\b)/i);
  if (fechaMatch) {
    result.fecha = fechaMatch[0].trim();
  }

  // Patrones de autoridad
  const autoridadMatch = machoteText.match(/(?:AUTORIDAD\s+RESPONSABLE|AUTORIDAD|ANTE\s+LA|ANTE\s+EL|A\s+LA\s+AUTORIDAD|A\s+CARGO\s+DE)[\s\:\-]+([A-ZÁÉÍÓÚÑ][^\n]{3,100})/i);
  if (autoridadMatch) {
    result.autoridad = autoridadMatch[1].trim();
  }

  return result;
}

export function addRepeatableSection(sections: DocumentNode[], templateId: string): DocumentNode[] {
  const templateSection = sections.find(s => s.id === templateId && s.isRepeatable);
  if (!templateSection) return sections;
  
  const newSection = createDocumentNode({
    id: `sec-repeat-${Date.now()}`,
    type: templateSection.type,
    title: `${templateSection.title} (Adicional)`,
    order: templateSection.order + 5,
    isRepeatable: true,
    content: [],
  });
  
  const result = [...sections];
  const insertIndex = result.findIndex(s => s.id === templateId) + 1;
  result.splice(insertIndex, 0, newSection);
  
  return result.map((s, i) => ({ ...s, order: i * 10 }));
}

export function removeSection(sections: DocumentNode[], sectionId: string): DocumentNode[] {
  return sections.filter(s => s.id !== sectionId).map((s, i) => ({ ...s, order: i * 10 }));
}

export function moveSection(sections: DocumentNode[], sectionId: string, direction: 'up' | 'down'): DocumentNode[] {
  const index = sections.findIndex(s => s.id === sectionId);
  if (index === -1) return sections;
  if (direction === 'up' && index === 0) return sections;
  if (direction === 'down' && index === sections.length - 1) return sections;
  
  const result = [...sections];
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  
  const temp = result[index];
  result[index] = result[swapIndex];
  result[swapIndex] = temp;
  
  return result.map((s, i) => ({ ...s, order: i * 10 }));
}

export function getKnownDocumentTypes(): string[] {
  return Object.keys(DOCUMENT_STRUCTURES);
}
