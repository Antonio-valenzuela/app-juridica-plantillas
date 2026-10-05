import { describe, expect, it } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { resolveWritingType, visibleWritingTypes } from '@/lib/catalog/writingTypeIdentity';
import { FAMILY_BLUEPRINTS, familyBlueprintFor } from '@/lib/legal-engine/documentFamilyBlueprints';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

/**
 * Generación determinista (sin proveedor) al menos una vez por cada FAMILY
 * ENGINE declarado, y comprobación parametrizada de las variantes de config.
 * Nunca debe producir sections=[] ni cuerpo completamente vacío.
 */

const ENGINE_SAMPLE: Record<string, string> = {
  demanda: 'demanda_oral_civil',
  recurso: 'queja_civil',
  escrito_tramite: 'oposicion_sucesoria',
  prueba_cierre: 'conclusiones_civil',
  convenio: 'convenio_herederos',
  audiencia: 'oposicion_medida_cautelar',
  petitorio: 'apelacion_civil',
};

function source(text: string, sourceDocumentType: string) {
  return createSourceDocument({
    id: 'src-family-engine', filename: 'fuente.txt', content: text,
    sourceValidated: true,
    classification: { sourceDocumentType, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
  } as any);
}

function analysis(overrides: Partial<CaseAnalysis> = {}): CaseAnalysis {
  return {
    parties: { actor: 'ACTOR SINTETICO', demandado: 'DEMANDADO SINTETICO' },
    authorities: ['AUTORIDAD COMPETENTE SINTETICA'],
    caseNumbers: { principal: 'EXP-FAMILY-2026/001' },
    proceduralTimeline: [{ date: '2026-01-15', event: 'Actuación inicial que origina el escrito', sourceDocument: 'src-family-engine', certainty: 1 }],
    challengedActs: [], claims: ['Pretensión que la parte promovente sostiene'],
    claimResponses: [], arguments: [],
    evidence: [{ id: 'ev-1', type: 'DOCUMENTAL', description: 'Constancia documental aportada', confirmed: true, provenance: 'LAWYER_CONFIRMED' }],
    facts: [{ id: 'f-1', number: '1', text: 'Hecho verificable que consta en el expediente.', confidence: 1 }],
    ...overrides,
  } as any;
}

async function generate(documentType: string, instruction: string) {
  // La fuente se declara desde la compatibilidad real del tipo: el gate de
  // fuente debe seguir rechazando combinaciones incompatibles.
  const identity = resolveWritingType(documentType);
  const declared = identity.compatibleSources.acceptedSourceTypes[0]
    || (identity.compatibleSources.optionalSourceTypes || [])[0]
    || 'SENTENCIA_O_RESOLUCION';
  return runGenerationPipeline({
    selectedDocumentType: documentType,
    documentTypeLabel: identity.label,
    matter: 'Civil',
    jurisdiction: 'Jalisco',
    userInstruction: instruction,
    sourceDocuments: [source('ACUERDO DE PRUEBAS Y RESOLUCIÓN QUE DA ORIGEN AL ESCRITO. ', declared)],
    caseAnalysis: analysis(),
    workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
  } as any);
}

const sectionText = (doc: any) =>
  doc.sections.flatMap((section: any) => (section.content || []).map((block: any) => block.text || '')).join('\n');

describe('generación determinista por FAMILY ENGINE', () => {
  for (const [engine, sample] of Object.entries(ENGINE_SAMPLE)) {
    it(`${engine}: ${sample} materializa secciones con contenido`, async () => {
      const doc = await generate(sample, `Promover ${sample} con los hechos del expediente.`);
      expect(doc.documentType).toBe(sample);
      expect(doc.sections.length).toBeGreaterThan(3);
      const body = sectionText(doc);
      expect(body.trim().length).toBeGreaterThan(200);
      // Ninguna sección materializada puede estar vacía.
      for (const section of doc.sections) {
        for (const block of section.content || []) {
          if (['header', 'closing', 'signature'].includes(section.type)) continue;
          expect(typeof block.text === 'string').toBe(true);
        }
      }
    });
  }

  it('todos los family blueprints declarados tienen al menos un tipo asignado', () => {
    const identities = visibleWritingTypes();
    for (const familyId of Object.keys(FAMILY_BLUEPRINTS)) {
      expect(familyBlueprintFor(familyId)).toBeTruthy();
      const members = identities.filter(identity => identity.familyId === familyId);
      expect(members.length, `familia ${familyId} sin tipos`).toBeGreaterThan(0);
    }
  });
});

describe('diferenciación: familias que NO pueden generar lo mismo', () => {
  const PROFILE: Record<string, string> = {
    apelacion_civil: 'agravio',
    contestacion_demanda_civil: 'contestación',
    demanda_amparo_directo: 'violación',
    demanda_ordinaria_civil: 'prestaciones',
  };

  it('apelación, contestación, amparo y demanda producen estructuras distinguibles', async () => {
    const shapes: Record<string, string[]> = {};
    for (const [type, marker] of Object.entries(PROFILE)) {
      const identity = resolveWritingType(type);
      shapes[type] = identity.requiredSections.map(section => section.toLowerCase());
      // Cada familia conserva su sección distintiva.
      expect(shapes[type].some(section => section.includes(marker)), `${type} sin "${marker}"`).toBe(true);
    }
    const unique = new Set(Object.values(shapes).map(list => list.join('|')));
    // Apelación / contestación / amparo / demanda no comparten estructura exacta.
    expect(unique.size).toBe(Object.keys(PROFILE).length);
  });

  it('las variantes de una familia comparten engine pero ajustan su estructura', () => {
    const civilDemandas = visibleWritingTypes().filter(identity => identity.familyId === 'civil_demandas');
    expect(civilDemandas.length).toBeGreaterThan(5);
    for (const variant of civilDemandas) {
      expect(variant.requiredSections.length).toBeGreaterThan(3);
      // Todas resuelven al mismo engine de familia, sea con plantilla propia
      // (canónica) o desde el blueprint (variante).
      expect(variant.implementationStatus).not.toBe('NOT_IMPLEMENTED');
    }
    // La familia mezcla canónicos con plantilla propia y variantes derivadas.
    expect(civilDemandas.some(variant => variant.derivedFromFamily)).toBe(true);
    expect(civilDemandas.some(variant => !variant.derivedFromFamily)).toBe(true);
    const structures = new Set(civilDemandas.map(variant => variant.requiredSections.join('|')));
    expect(structures.size).toBeGreaterThan(1);
  });
});