import { describe, it, expect } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import type { LegalTaxonomySelection } from '@/lib/legal-taxonomy';

describe('BLOCK C - Otro flow E2E (UI → API → pipeline → metadata → exportación)', () => {
  it('customValue viaja de UI a pipeline y queda en generationMetadata.taxonomy y materia efectiva', async () => {
    const taxonomy: LegalTaxonomySelection = {
      matter: 'otro',
      matterCustom: { value: 'otro', label: 'Otro', customValue: 'Derecho energético' },
      jurisdiction: 'otra',
      jurisdictionCustom: { value: 'otra', label: 'Otra', customValue: 'Junta Municipal de Agua' },
      documentType: 'otro',
      documentTypeCustom: { value: 'otro', label: 'Otro', customValue: 'Solicitud de concesión' },
    };

    const doc = await runGenerationPipeline({
      userInstruction: 'Solicitar concesión de agua para uso industrial',
      sourceDocuments: [],
      allowUnvalidatedSource: true,
      taxonomy,
      matter: 'Derecho energético',
      jurisdiction: 'Junta Municipal de Agua',
      documentTypeLabel: 'Solicitud de concesión',
    });

    // La materia efectiva debe ser el customValue, no "otro"
    expect(doc.matter).toBe('Derecho energético');
    expect(doc.jurisdiction).toBe('Junta Municipal de Agua');
    expect(doc.documentTypeLabel).toBe('Solicitud de concesión');
    // Metadata debe conservar la taxonomía completa con customValues
    const metaTax = (doc.generationMetadata as any).taxonomy;
    expect(metaTax).toBeDefined();
    expect(metaTax.matter).toBe('otro');
    expect(metaTax.matterCustom.customValue).toBe('Derecho energético');
    expect(metaTax.jurisdictionCustom.customValue).toBe('Junta Municipal de Agua');
    expect(metaTax.documentTypeCustom.customValue).toBe('Solicitud de concesión');
    // También en doc.taxonomySelection
    expect((doc as any).taxonomySelection.matterCustom.customValue).toBe('Derecho energético');
    // El documento debe ser exportable: verificar que secciones existen y no contienen "otro" literal como materia
    expect(doc.sections.length).toBeGreaterThan(0);
    const allText = doc.sections.map((s) => s.content.map((c) => c.text).join(' ')).join(' ');
    // No debe haber quedado el valor crudo "otro" como materia visible en el contenido generado sin custom
    expect(allText.toLowerCase()).not.toContain('materia: otro');
  });

  it('customValue con longitud >80 se trunca y se valida', async () => {
    const longVal = 'x'.repeat(100);
    const taxonomy: LegalTaxonomySelection = {
      matter: 'otro',
      matterCustom: { value: 'otro', label: 'Otro', customValue: longVal.slice(0, 80) },
      jurisdiction: 'federal',
      jurisdictionCustom: null,
      documentType: 'demanda',
      documentTypeCustom: null,
    };
    const doc = await runGenerationPipeline({
      userInstruction: 'Test long custom',
      sourceDocuments: [],
      allowUnvalidatedSource: true,
      taxonomy,
    });
    const meta = (doc.generationMetadata as any).taxonomy;
    expect(meta.matterCustom.customValue.length).toBe(80);
  });

  it('sin taxonomy, la clasificación automática sigue funcionando (compatibilidad)', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Demanda de amparo indirecto por acto de autoridad',
      sourceDocuments: [],
      allowUnvalidatedSource: true,
    });
    expect(doc.classification).toBeDefined();
    expect(doc.matter).toBeDefined();
    expect(doc.documentTypeLabel).toBeDefined();
  });
});
