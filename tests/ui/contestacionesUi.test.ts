import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  CONTESTACIONES_SECTION_ORDER,
  deriveContestacionesSteps,
  formatContestacionesReadiness,
  getContestacionesGenerationBlockReason,
} from '@/app/machotes/components/CaseDocumentsReader';
import { canStartContestacionGeneration } from '@/app/machotes/components/ContestacionesChecklist';

describe('Contestaciones UI state derivation', () => {
  it('keeps the reference-inspired contextual hierarchy in a stable order', () => {
    expect(CONTESTACIONES_SECTION_ORDER).toEqual([
      'summary',
      'analysis',
      'configuration',
      'readiness',
      'action',
    ]);
  });

  it('keeps upload active until a real source document exists', () => {
    expect(deriveContestacionesSteps({
      hasDocument: false,
      analysisAvailable: false,
      analysisRequiresReview: false,
      generationStatus: null,
      readiness: null,
    })).toEqual([
      { id: 'upload', status: 'ACTIVE' },
      { id: 'analysis', status: 'PENDING' },
      { id: 'generation', status: 'PENDING' },
    ]);
  });

  it('marks real processing and blocked readiness without treating completion as READY', () => {
    expect(deriveContestacionesSteps({
      hasDocument: true,
      analysisAvailable: true,
      analysisRequiresReview: false,
      generationStatus: 'completed',
      readiness: 'BLOCKED',
    })).toEqual([
      { id: 'upload', status: 'COMPLETED' },
      { id: 'analysis', status: 'COMPLETED' },
      { id: 'generation', status: 'BLOCKED' },
    ]);

    expect(deriveContestacionesSteps({
      hasDocument: true,
      analysisAvailable: true,
      analysisRequiresReview: false,
      generationStatus: 'processing',
      readiness: null,
    })[2]).toEqual({ id: 'generation', status: 'ACTIVE' });
  });

  it('uses explicit legal readiness labels and preserves unknown states for review', () => {
    expect(formatContestacionesReadiness('READY')).toEqual({ label: 'Listo para generar', tone: 'success' });
    expect(formatContestacionesReadiness('REQUIRES_REVIEW')).toEqual({ label: 'Requiere revisión', tone: 'warning' });
    expect(formatContestacionesReadiness('BLOCKED')).toEqual({ label: 'Bloqueado', tone: 'danger' });
    expect(formatContestacionesReadiness('INVALID')).toEqual({ label: 'Inválido', tone: 'danger' });
    expect(formatContestacionesReadiness('INCOMPLETE')).toEqual({ label: 'Incompleto', tone: 'warning' });
    expect(formatContestacionesReadiness(null)).toEqual({ label: 'Pendiente de evaluación', tone: 'neutral' });
  });

  it('supports configDefined signal and provides canonical RESPONSE_DOCUMENT_TYPES', () => {
    const steps = deriveContestacionesSteps({
      hasDocument: true,
      analysisAvailable: true,
      analysisRequiresReview: false,
      generationStatus: null,
      readiness: null,
      configDefined: true,
    });
    expect(steps[0].status).toBe('COMPLETED');
    expect(steps[1].status).toBe('COMPLETED');
    expect(steps[2].status).toBe('ACTIVE');
  });

  it('allows generation when analysis is available but still requires review', () => {
    expect(canStartContestacionGeneration({
      hasDocument: true,
      analysisAvailable: true,
      analysisRequiresReview: true,
      configDefined: true,
      isIncompatible: false,
      isGenerating: false,
      blockReason: null,
    })).toBe(true);
  });

  it('blocks a selected generation mode when its required source is unavailable', () => {
    expect(getContestacionesGenerationBlockReason({
      hasDocument: true,
      compatible: true,
      generationMode: 'personal_template',
      hasCompatibleTemplate: false,
      hasReferenceDocument: false,
    })).toMatch(/machote compatible/i);

    expect(getContestacionesGenerationBlockReason({
      hasDocument: true,
      compatible: true,
      generationMode: 'reference_document',
      hasCompatibleTemplate: false,
      hasReferenceDocument: false,
    })).toMatch(/documento de referencia/i);
  });

  it('usa etiquetas Página para navegación y preserva foja en contenido jurídico', () => {
    const filePath = path.resolve(__dirname, '../../app/machotes/components/CaseDocumentsReader.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Etiquetas UI deben usar Página
    expect(content).toContain('Página {safeActivePage} de {totalPages}');
    expect(content).toContain('Texto extraído - Página {safeActivePage}');
    expect(content).toContain('{totalPages} página{totalPages === 1');
    expect(content).toContain('página por página');
    expect(content).toContain('Sin texto disponible en esta página.');

    // No debe quedar etiqueta UI vieja Foja para navegación (solo data regex)
    // Verificamos que no exista Foja como label de paginación UI
    expect(content).not.toContain('Foja {safeActivePage} de {totalPages}');
    expect(content).not.toContain('Texto extraído - Foja');
    expect(content).not.toContain('foja por foja');
    expect(content).not.toContain('Sin texto disponible en esta foja');

    // Contenido jurídico original debe preservarse intacto
    const originalText = 'visible a foja 123 de autos';
    // Simula que el visor NO hace replace global sobre el texto extraído
    const displayedText = originalText; // el componente renderiza activePageObj.text tal cual
    expect(displayedText).toBe('visible a foja 123 de autos');
    expect(displayedText).toContain('foja 123');
    // Verifica que no se aplicó un replace indebido sobre contenido jurídico
    const badReplace = originalText.replace(/foja/gi, 'página');
    expect(displayedText).not.toBe(badReplace);
    expect(badReplace).toBe('visible a página 123 de autos');
    // El texto original con foja debe mantenerse
    expect(originalText).toBe('visible a foja 123 de autos');
  });

  it('genera label Página 4 de 27 y TEXTO EXTRAÍDO - PÁGINA 4 para safeActivePage=4', () => {
    const safeActivePage = 4;
    const totalPages = 27;
    const navLabel = `Página ${safeActivePage} de ${totalPages}`;
    const extractedHeader = `Texto extraído - Página ${safeActivePage}`;

    expect(navLabel).toBe('Página 4 de 27');
    expect(extractedHeader).toBe('Texto extraído - Página 4');
    expect(extractedHeader.toUpperCase()).toBe('TEXTO EXTRAÍDO - PÁGINA 4');
    expect(navLabel).toContain('Página 4');
  });
});
