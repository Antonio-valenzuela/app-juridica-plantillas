import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initialWritingStepForMissingEssential } from '@/app/machotes/initialWritingsFocus';
import { analyzeWritingRequest } from '@/lib/legal-engine/writingIntake';

const pageSource = fs.readFileSync(path.resolve(process.cwd(), 'app/machotes/page.tsx'), 'utf8');

describe('Escritos Iniciales — datos esenciales antes del consentimiento (QA-F1)', () => {
  it('valida datos esenciales antes de pedir consentimiento externo', () => {
    const start = pageSource.indexOf('const handleRunPipeline');
    expect(start).toBeGreaterThanOrEqual(0);
    const blockedAt = pageSource.indexOf('Faltan datos esenciales para generar', start);
    const consentAt = pageSource.indexOf('requestExternalProviderConsent()', start);
    expect(blockedAt).toBeGreaterThan(start);
    expect(consentAt).toBeGreaterThan(start);
    expect(blockedAt).toBeLessThan(consentAt);
  });

  it('señala y abre el paso faltante en el asistente', () => {
    expect(pageSource).toContain('data-testid="initial-missing-step"');
    expect(pageSource).toContain('setInitialStep(step)');
    expect(initialWritingStepForMissingEssential(['objetivo o pretensión'])).toBe(4);
    expect(initialWritingStepForMissingEssential(['tipo de escrito'])).toBe(1);
    expect(initialWritingStepForMissingEssential(['materia o asunto', 'objetivo o pretensión'])).toBe(1);
  });

  it('el intake real bloquea sin objetivo/pretensión y lo reporta como dato esencial', () => {
    const intake = analyzeWritingRequest('Redactar Demanda ordinaria civil. Materia: Civil.');
    expect(intake.readiness.status).toBe('BLOCKED');
    expect(intake.readiness.missingEssential).toContain('objetivo o pretensión');
  });
});
