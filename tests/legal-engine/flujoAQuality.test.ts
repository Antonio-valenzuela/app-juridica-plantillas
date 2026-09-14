import { describe, expect, it } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';

const source = createSourceDocument({
  id: 'demanda-civil-quality',
  filename: 'demanda-civil.txt',
  sourceValidated: true,
  pages: [{
    page: 2,
    text: [
      'ACTOR: María López. DEMANDADO: Servicios del Centro, S.A.',
      'EXPEDIENTE: CIV-12/2026.',
      'HECHO PRIMERO: La parte actora celebró el contrato el 3 de enero de 2026.',
      'HECHO SEGUNDO: La demandada recibió el pago inicial.',
      'HECHO TERCERO: Se actualizó el incumplimiento.',
      'HECHO CUARTO: Se formuló requerimiento extrajudicial.',
      'PRESTACIONES: El cumplimiento del contrato y el pago de daños acreditables.',
      'PRUEBAS: Contrato y comprobantes de pago.',
    ].join('\n'),
    chars: 500,
  }],
});

describe('Flujo A — calidad jurídica de contestación', () => {
  it('construye identidad y análisis civil sin fabricar amparo ni recurso', () => {
    const analysis = reconstructCaseAnalysis([source], 'Generar contestación civil de demanda');
    expect(analysis.facts).toHaveLength(4);
    expect(analysis.facts.every((fact) => fact.position === 'REQUIRE_LAWYER_INPUT')).toBe(true);
    expect(analysis.facts.map((fact) => fact.sourceFact)).toEqual([
      'La parte actora celebró el contrato el 3 de enero de 2026.',
      'La demandada recibió el pago inicial.',
      'Se actualizó el incumplimiento.',
      'Se formuló requerimiento extrajudicial.',
    ]);
    expect(analysis.claims).toEqual(['El cumplimiento del contrato y el pago de daños acreditables.']);
    expect(analysis.proceduralPosture.proceduralWrit).toBe('contestacion_demanda');
    expect(analysis.argumentAxes).toEqual([]);
    expect(analysis.caseTheory.constitutionalTheory).toBe('');
  });

  it('fallback contesta cada hecho sin convertirlo en hecho propio y evita mezcla procesal', async () => {
    const previousKey = process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    try {
      const doc = await runGenerationPipeline({
        sourceDocuments: [source],
        documentTypeLabel: 'Contestación de Demanda Civil',
        matter: 'Civil',
        jurisdiction: 'Local',
        userInstruction: 'Contestar la demanda civil punto por punto.',
      });
      const text = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');
      const factsSection = doc.sections.find((section) => section.title === 'CONTESTACIÓN DE HECHOS');
      expect(factsSection?.content[0]?.text).toContain('AL HECHO PRIMERO');
      expect(factsSection?.content[0]?.text).toContain('REQUIERE DEFINIR POSTURA DEL ABOGADO');
      expect(factsSection?.content[0]?.text).not.toMatch(/^PRIMERO\./m);
      expect(text).not.toMatch(/acto reclamado|conceptos de violación|agravios|sentencia recurrida|declaratoria de inconstitucionalidad/i);
      expect(doc.proceduralIdentity).toMatchObject({
        matter: 'Civil',
        targetDocument: 'contestacion_demanda_civil',
        representedParty: 'demandado',
      });
      expect((doc as any).qualityGate.metrics.factsTotal).toBe(4);
      expect((doc as any).qualityGate.metrics.factsWithResponse).toBe(4);
      expect((doc as any).qualityGate.metrics.claimsTotal).toBe(1);
      expect((doc as any).qualityGate.metrics.claimsWithResponse).toBe(1);
    } finally {
      if (previousKey === undefined) delete process.env.NVIDIA_API_KEY;
      else process.env.NVIDIA_API_KEY = previousKey;
    }
  });
});
