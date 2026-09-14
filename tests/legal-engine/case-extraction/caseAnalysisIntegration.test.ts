import { describe, expect, it } from 'vitest';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

function sourceWithClaimsFactsAndEvidence(): UploadedSourceDocument {
  const text = [
    'ACTOR: Ana López',
    'DEMANDADO: Luis Pérez',
    'HECHOS',
    '1. El 3 de enero celebramos contrato.',
    'PRESTACIONES: cumplimiento del contrato y pago de daños y perjuicios',
    'PRUEBAS: contrato, recibos',
  ].join('\n');
  return { id: 'src-a', filename: 'demanda.txt', type: 'txt', extractedText: text, pages: [{ page: 1, text, chars: text.length }], sourceValidated: true };
}

function sourceWithOnlyAllegations(): UploadedSourceDocument {
  const text = 'ACTOR: Ana López\nLa actora afirma que el demandado incumplió.';
  return { id: 'src-allegation', filename: 'alegacion.txt', type: 'txt', extractedText: text, pages: [{ page: 1, text, chars: text.length }], sourceValidated: true };
}

describe('reconstructCaseAnalysis rich extraction integration', () => {
  it('returns a non-empty rich analysis and safe legacy projection', () => {
    const analysis = reconstructCaseAnalysis([sourceWithClaimsFactsAndEvidence()], 'Analizar expediente', '', { includeReferenceInAnalysis: false });

    expect(analysis.richCaseAnalysis?.claims.length).toBeGreaterThanOrEqual(2);
    expect(analysis.richCaseAnalysis?.evidenceMentions.length).toBeGreaterThan(0);
    expect(analysis.claimResponses?.length).toBe(analysis.richCaseAnalysis?.claims.length);
  });

  it('keeps existing procedural fields and does not add legal posture', () => {
    const analysis = reconstructCaseAnalysis([sourceWithOnlyAllegations()], 'Analizar expediente', '', { includeReferenceInAnalysis: false });

    expect(analysis.richCaseAnalysis?.clientPosition.status).toBe('UNKNOWN');
    expect(analysis.facts.every((fact) => fact.position === 'REQUIRE_LAWYER_INPUT')).toBe(true);
  });
});
