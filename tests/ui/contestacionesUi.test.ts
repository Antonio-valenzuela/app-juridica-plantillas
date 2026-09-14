import { describe, expect, it } from 'vitest';
import {
  CONTESTACIONES_SECTION_ORDER,
  deriveContestacionesSteps,
  formatContestacionesReadiness,
} from '@/app/machotes/components/CaseDocumentsReader';

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
});
