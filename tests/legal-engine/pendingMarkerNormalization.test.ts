import { describe, expect, it } from 'vitest';
import { normalizeUnresolvedFieldMarkers, extractUnresolvedFieldMarkers } from '@/lib/legal-engine/pendingFields';
import { evaluateGeneratedLegalAdmission } from '@/lib/legal-engine/generatedLegalAdmission';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import { createEmptyDocument } from '@/lib/legal-engine/types';

const sourceMissing = 'DATO NO LOCALIZADO EN LOS DOCUMENTOS PROPORCIONADOS';
const verificationRequired = 'DATO PENDIENTE DE VERIFICACIÓN';

describe('canonical pending markers preserve cause and remain fail-closed', () => {
  it('normalizes the manual phrases and bracket variants with deterministic cause codes', () => {
    const normalized = normalizeUnresolvedFieldMarkers(
      `${sourceMissing}. [${sourceMissing}] [${sourceMissing}: fecha]. ${verificationRequired}. [${verificationRequired}] [${verificationRequired}: vigencia]`,
    );
    expect(normalized).toContain('[PENDIENTE:');
    expect(normalized).toContain('[NO VERIFICADO:');
    expect(extractUnresolvedFieldMarkers(normalized).map(marker => marker.cause)).toContain('SOURCE_NOT_FOUND');
    expect(extractUnresolvedFieldMarkers(normalized).map(marker => marker.cause)).toContain('VERIFICATION_REQUIRED');
    expect(normalizeUnresolvedFieldMarkers('[NO VERIFICADO: artículo 17 de la Constitución]'))
      .toContain('[NO VERIFICADO: artículo 17 de la Constitución]');
  });

  it('normalizes source markers before admission without deleting their content', () => {
    const document = createEmptyDocument({ id: 'offline-pending', documentType: 'escrito_libre', documentTypeLabel: 'Escrito libre', matter: 'civil', jurisdiction: 'local', flow: 'NEW_WRITING' });
    const admission = evaluateGeneratedLegalAdmission({ text: sourceMissing, sectionType: 'background', document });
    expect(JSON.stringify(admission)).toContain('[PENDIENTE:');
    expect(JSON.stringify(admission)).toContain('SOURCE_NOT_FOUND');
  });

  it('keeps scorecard pending metrics and FINAL blocked for both marker causes', () => {
    const document = createEmptyDocument({ id: 'offline-scorecard', documentType: 'escrito_libre', documentTypeLabel: 'Escrito libre', matter: 'civil', jurisdiction: 'local', flow: 'NEW_WRITING' });
    document.sections = [{ id: 'facts', type: 'background', title: 'HECHOS', content: [{ text: `${sourceMissing}. ${verificationRequired}.` }] }] as any;
    const scorecard = runQualityGateCheck(document);
    expect(scorecard.metrics.pendingFieldsCount).toBeGreaterThanOrEqual(2);
    expect(scorecard.canMarkAsFinal).toBe(false);
    expect(scorecard.warnings.some(warning => /SOURCE_NOT_FOUND/.test(warning.message))).toBe(true);
    expect(scorecard.warnings.some(warning => /VERIFICATION_REQUIRED/.test(warning.message))).toBe(true);
  });
});
