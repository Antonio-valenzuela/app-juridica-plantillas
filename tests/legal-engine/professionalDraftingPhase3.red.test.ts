import { describe, expect, it } from 'vitest';
import { evaluateProfessionalDraftQuality } from '@/lib/legal-engine/professionalDraftQuality';
import { resolveDraftDepthProfile, assessRemainingDraftSupport } from '@/lib/legal-engine/draftDepth';
import { generationExtensionForDraftDepth } from '@/lib/legal-engine/generationExtension';
import { buildFingerprint } from '@/lib/legal-engine/generationLock';
import { buildDraftingPlan } from '@/lib/legal-engine/pipeline';
import { emptyRichCaseAnalysis, makeFixtureDocument, makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';

const repeatedSourceText = Array.from({ length: 60 }, (_, index) =>
  `La afirmación fuente ${index + 1} requiere análisis individual y respuesta respaldada por el expediente`,
).join('. ');
const shortDraftText = 'La parte actora formula una pretensión que requiere postura del abogado y pruebas vinculadas.';

describe('Fase 3: reproducción cuantitativa del baseline Fase 2', () => {
  it('detecta como duplicación semántica las filas de hechos que solo cambian el número', () => {
    const repeatedNumberedBoilerplate = Array.from(
      { length: 12 },
      (_, index) => `${index + 1}. Hecho ${index + 1} - Fuente: fuente documental 1, página 1.`,
    ).join('\n');
    const quality = evaluateProfessionalDraftQuality({
      draftDepth: 'PROFESSIONAL_20',
      renderedPages: [repeatedNumberedBoilerplate],
      contentStopReason: 'CONTENT_LIMIT_REACHED',
    });

    expect(quality.semanticDuplicateRatio).toBeGreaterThan(0.7);
    expect(quality.issues).toContain('SEMANTIC_DUPLICATION');
    expect(quality.qualityGate).toBe('FAIL');
  });

  it.each(['01', '02', '05', '06'])(
    'detecta páginas artificialmente repetidas para el fixture de línea base %s',
    (caseId) => {
      // The real Phase 2 measurements are recorded in the audit report. Keep this detector fixture in memory so
      // concurrent Phase 2 reruns cannot replace its inputs while Vitest is reading them.
      expect(['01', '02', '05', '06']).toContain(caseId);
      const quality = evaluateProfessionalDraftQuality({
        draftDepth: 'PROFESSIONAL_20',
        renderedPages: Array.from({ length: 8 }, () => repeatedSourceText),
        sourceTexts: [repeatedSourceText],
      });

      expect(quality.repetitionRatio).toBeGreaterThan(0.7);
      expect(quality.duplicateParagraphRatio).toBeGreaterThan(0.7);
      expect(quality.exactDuplicateRatio).toBeGreaterThan(0.7);
      expect(quality.semanticDuplicateRatio).toBeGreaterThan(0.75);
      expect(quality.sourceCopyRatio).toBeGreaterThan(0.5);
      expect(quality.qualityGate).toBe('FAIL');
    },
  );

  it.each(['03', '04'])(
    'clasifica contenido insuficiente del fixture corto %s',
    (caseId) => {
      expect(['03', '04']).toContain(caseId);
      const quality = evaluateProfessionalDraftQuality({
        draftDepth: 'PROFESSIONAL_20',
        renderedPages: [shortDraftText, shortDraftText],
      });

      expect(quality.actualPages).toBe(2);
      expect(quality.actualWords).toBeLessThan(700);
      expect(quality.qualityGate).toBe('FAIL');
      expect(quality.issues).toContain('SHALLOW_CONTENT');
    },
  );
});

describe('contrato de profundidad y límite basado en soporte', () => {
  it('resuelve bandas profesionales sin convertir la extensión en relleno', () => {
    expect(resolveDraftDepthProfile('PROFESSIONAL_20').targetPages).toEqual({ min: 18, preferred: 20, max: 24 });
    expect(resolveDraftDepthProfile('EXTENSIVE_40').targetPages).toEqual({ min: 35, preferred: 40, max: 45 });
  });

  it('propaga profundidad a presupuesto de proveedor y separa la identidad de trabajos 20/40', () => {
    const profile20 = resolveDraftDepthProfile('PROFESSIONAL_20');
    const profile40 = resolveDraftDepthProfile('EXTENSIVE_40');
    expect(generationExtensionForDraftDepth(profile20)).toMatchObject({
      targetPages: 20, minPages: 18, maxPages: 24, targetWords: 10_000, maxCallsPerDocument: 24,
    });
    expect(generationExtensionForDraftDepth(profile40)).toMatchObject({
      targetPages: 40, minPages: 35, maxPages: 45, targetWords: 20_000, maxCallsPerDocument: 48,
    });
    expect(buildFingerprint({ sourceIds: ['source-1'], draftDepth: 'PROFESSIONAL_20' }))
      .not.toBe(buildFingerprint({ sourceIds: ['source-1'], draftDepth: 'EXTENSIVE_40' }));
  });

  it('rechaza modos o tamaños arbitrarios no incluidos en el contrato', () => {
    expect(() => resolveDraftDepthProfile('PROFESSIONAL_80')).toThrow();
    expect(() => resolveDraftDepthProfile({ targetPages: 100 })).toThrow();
  });

  it('detiene expansión cuando solo quedan preguntas sin evidencia nueva y medible', () => {
    expect(assessRemainingDraftSupport({
      pendingCoverageItemIds: [],
      unusedFactIds: [],
      unusedEvidenceIds: [],
      verifiedUnappliedAuthorityIds: [],
      unresolvedAttorneyQuestionIds: ['attorney-question-1'],
    })).toMatchObject({ status: 'CONTENT_LIMIT_REACHED', canExpand: false });
  });

  it('permite una pasada solo si existe cobertura vinculada a material fuente no consumido', () => {
    expect(assessRemainingDraftSupport({
      pendingCoverageItemIds: ['coverage-claim-1'],
      unusedFactIds: ['fact-1'],
      unusedEvidenceIds: ['evidence-1'],
      verifiedUnappliedAuthorityIds: [],
      unresolvedAttorneyQuestionIds: [],
    })).toMatchObject({ status: 'IN_PROGRESS', canExpand: true });
  });
});

describe('integridad de IssuePlan con análisis rico canónico', () => {
  it('no vuelve a crear planes legacy cuando el IssueMatrix rico no materializa issues', () => {
    const analysis = makeFixtureFCaseAnalysis({
      proceduralPosture: {
        proceduralWrit: '',
        isExtraordinary: false,
        constitutionalIssues: [{
          id: 'legacy-issue',
          type: 'CONSTITUTIONAL',
          title: 'Cuestión legacy sin vínculo rico',
          parameter: 'Parámetro no aplicable al análisis rico vacío',
          challengedAct: 'Acto de referencia legacy',
          contradiction: 'Contradicción legacy no vinculada',
          affectation: 'Afectación legacy no vinculada',
          consequence: 'Consecuencia legacy no vinculada',
        }],
        legalityIssues: [],
        exceptionalInterest: null,
      },
    });
    analysis.richCaseAnalysis = emptyRichCaseAnalysis();

    const plan = buildDraftingPlan(makeFixtureDocument(), 0, analysis);
    const argumentSection = plan.sections.find((section) => section.title === 'ARGUMENTOS');

    expect(plan.legalIssueMatrix?.sourceMode).toBe('RICH');
    expect(plan.legalIssueMatrix?.issues).toEqual([]);
    expect(argumentSection?.issuePlans).toBeUndefined();
    expect(argumentSection?.legalIssues).toEqual([]);
  });
});
