import { UniversalLegalDocument, DocumentNode } from './types';
import { extractIntegrityFields } from './structureBuilder';

/**
 * Extrae el texto completo de un documento UniversalLegalDocument,
 * priorizando las secciones generadas, luego las fuentes y metadatos.
 */
export function extractDocumentFullText(doc: UniversalLegalDocument): string {
  const parts: string[] = [];

  if (doc.title) {
    parts.push(doc.title);
  }

  // Si tiene secciones con contenido (documento estructurado / generado)
  if (doc.sections && doc.sections.length > 0) {
    for (const sec of doc.sections) {
      if (sec.title) parts.push(sec.title);
      if (sec.content && sec.content.length > 0) {
        for (const block of sec.content) {
          if (block.text) parts.push(block.text);
        }
      }
    }
  }

  // Si no hay suficiente texto en secciones, recurrir a fuentes o referenceText
  if (parts.join('\n').length < 50) {
    if (doc.generationMetadata && 'referenceText' in doc.generationMetadata) {
      const metadata = doc.generationMetadata as any;
      if (metadata.referenceText && typeof metadata.referenceText === 'string') {
        parts.push(metadata.referenceText);
      }
    }

    if (doc.sourceDocuments && doc.sourceDocuments.length > 0) {
      for (const src of doc.sourceDocuments) {
        if (src.extractedText) parts.push(src.extractedText);
        else if (src.content) parts.push(src.content);
        else if (src.pages) {
          for (const p of src.pages) {
            if (p.text) parts.push(p.text);
          }
        }
      }
    }
  }

  return parts.join('\n\n');
}

/**
 * Extrae campos de integridad combinando las propiedades estructuradas
 * del documento (parties, caseRefs) con el análisis de texto.
 */
export function extractDocumentIntegrityMap(doc: UniversalLegalDocument): {
  expediente?: string;
  tribunal?: string;
  fecha?: string;
  autoridad?: string;
  actor?: string;
  demandado?: string;
} {
  const fullText = extractDocumentFullText(doc);
  const textFields = extractIntegrityFields(fullText);

  return {
    expediente: doc.caseRefs?.expediente || doc.caseRefs?.amparo || textFields.expediente,
    tribunal: doc.caseRefs?.tribunal || doc.caseRefs?.juzgado || textFields.tribunal,
    fecha: textFields.fecha,
    autoridad: doc.parties?.autoridadResponsable || textFields.autoridad,
    actor: doc.parties?.actor || doc.parties?.quejoso,
    demandado: doc.parties?.demandado,
  };
}

/**
 * Compara un documento de referencia con uno generado para detectar
 * pérdida de contenido, duplicación o alteración sensible.
 */
export function compareDocumentIntegrity(
  reference: UniversalLegalDocument,
  generated: UniversalLegalDocument
): { 
  preserved: string[];
  missing: string[];
  altered: { field: string; referenceValue: string; generatedValue: string }[];
  warnings: string[];
} {
  const preserved: string[] = [];
  const missing: string[] = [];
  const altered: { field: string; referenceValue: string; generatedValue: string }[] = [];
  const warnings: string[] = [];

  const refFields = extractDocumentIntegrityMap(reference);
  const genFields = extractDocumentIntegrityMap(generated);

  // Campos críticos que deben conservarse
  const criticalFields = ['expediente', 'tribunal', 'fecha', 'autoridad', 'actor', 'demandado'] as const;

  for (const field of criticalFields) {
    const refValue = refFields[field];
    const genValue = genFields[field];

    if (refValue && genValue) {
      if (refValue.trim().toLowerCase() === genValue.trim().toLowerCase()) {
        preserved.push(field);
      } else {
        altered.push({
          field,
          referenceValue: refValue,
          generatedValue: genValue,
        });
        warnings.push(`Campo "${field}" cambió de "${refValue}" a "${genValue}"`);
      }
    } else if (refValue) {
      missing.push(field);
      warnings.push(`Campo "${field}" presente en referencia pero ausente en generado`);
    } else if (genValue) {
      preserved.push(field);
      warnings.push(`Campo "${field}" fue añadido durante la generación`);
    }
  }

  // Verificar secciones estructurales
  const refSectionTitles = reference.sections?.map(s => s.title) || [];
  const genSectionTitles = generated.sections?.map(s => s.title) || [];

  for (const title of refSectionTitles) {
    if (!genSectionTitles.includes(title)) {
      missing.push(`sección: ${title}`);
    }
  }

  for (const title of genSectionTitles) {
    if (!refSectionTitles.includes(title)) {
      preserved.push(`sección: ${title}`);
      warnings.push(`Sección nueva añadida: "${title}"`);
    }
  }

  // Verificar variables de placeholder
  const refVars = Object.values(reference.variables || {}).filter(
    (v: any) => v.isRequired === true && (!v.value || v.value === null)
  ) || [];
  const genVars = Object.values(generated.variables || {}).filter(
    (v: any) => v.isRequired === true && (!v.value || v.value === null)
  ) || [];

  if (refVars.length > genVars.length) {
    missing.push(`${refVars.length - genVars.length} variable(s) requerida(s) perdida(s)`);
  } else if (genVars.length > refVars.length) {
    warnings.push(`${genVars.length - refVars.length} variable(s) adicional(es) añadida(s)`);
  }

  return { preserved, missing, altered, warnings };
}

export function hasCriticalContentLost(
  reference: UniversalLegalDocument,
  generated: UniversalLegalDocument
): boolean {
  const { missing } = compareDocumentIntegrity(reference, generated);
  const criticalMissing = missing.filter(m => 
    m === 'expediente' || 
    m === 'tribunal' || 
    m === 'fecha' || 
    m === 'autoridad' ||
    m.includes('sección:')
  );
  return criticalMissing.length > 0;
}

/**
 * Verifica que el documento generado no haya alterado contenido sensible
 * del documento de referencia beyond lo permitido por las instrucciones del usuario.
 * Distingue explícitamente entre CAMBIO AUTORIZADO y CAMBIO NO AUTORIZADO.
 */
export function verifyNoSensitiveAlteration(
  reference: UniversalLegalDocument,
  generated: UniversalLegalDocument,
  userInstruction?: string
): { 
  safe: boolean; 
  alterations: string[]; 
  authorizedChanges: string[];
  warnings: string[] 
} {
  const { altered, warnings } = compareDocumentIntegrity(reference, generated);
  const alterations: string[] = [];
  const authorizedChanges: string[] = [];
  const instructionLower = (userInstruction || '').toLowerCase();

  for (const alt of altered) {
    let isExplicitlyAuthorized = false;
    const genValLower = alt.generatedValue.toLowerCase();

    // Verificación de autorización específica por tipo de campo
    if (alt.field === 'expediente') {
      isExplicitlyAuthorized = 
        instructionLower.includes('expediente') || 
        instructionLower.includes('amparo') || 
        instructionLower.includes('número') || 
        instructionLower.includes(genValLower);
    } else if (alt.field === 'tribunal' || alt.field === 'autoridad') {
      isExplicitlyAuthorized = 
        instructionLower.includes('tribunal') || 
        instructionLower.includes('juzgado') || 
        instructionLower.includes('juez') || 
        instructionLower.includes('sala') || 
        instructionLower.includes('autoridad') || 
        instructionLower.includes('corte') || 
        instructionLower.includes(genValLower);
    } else if (alt.field === 'fecha') {
      isExplicitlyAuthorized = 
        instructionLower.includes('fecha') || 
        instructionLower.includes('día') || 
        instructionLower.includes(genValLower);
    } else if (alt.field === 'actor' || alt.field === 'demandado') {
      isExplicitlyAuthorized = 
        instructionLower.includes(alt.field) || 
        instructionLower.includes('parte') || 
        instructionLower.includes('quejoso') || 
        instructionLower.includes('nombre') || 
        instructionLower.includes(genValLower);
    }

    if (isExplicitlyAuthorized) {
      authorizedChanges.push(`CAMBIO AUTORIZADO [${alt.field}]: ${alt.referenceValue} → ${alt.generatedValue}`);
    } else {
      alterations.push(`CAMBIO NO AUTORIZADO [${alt.field}]: ${alt.referenceValue} → ${alt.generatedValue}`);
    }
  }

  return { 
    safe: alterations.length === 0, 
    alterations, 
    authorizedChanges,
    warnings 
  };
}