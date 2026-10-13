/**
 * optInSections.ts — secciones que el motor solo materializa a petición.
 *
 * Una única fuente de verdad para el pipeline (que las filtra del plan salvo
 * petición expresa) y para la identidad del tipo (que no puede declararlas
 * como OBLIGATORIAS: exigir lo que el motor omite a propósito generaría un
 * falso "sección faltante").
 *
 * Regla vigente: en una contestación, ALEGATOS solo se incluye si el usuario
 * lo pide (instrucción, etiqueta o machote que los mencione).
 */
import { isContestacionType } from './documentTemplates';

export function isOptInSection(documentType: string | undefined, documentTypeLabel: string | undefined, sectionTitle: string): boolean {
  return isContestacionType(documentType, documentTypeLabel) && /alegato/i.test(sectionTitle);
}
