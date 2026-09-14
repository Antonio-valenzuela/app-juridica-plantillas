import { describe, expect, it } from 'vitest';
import { rankTemplateCandidates } from '@/lib/templates/templateCompatibility';

describe('compatibilidad de plantillas personales', () => {
  it('prioriza la materia y tipo compatibles sin ocultar las demás', () => {
    const templates = [
      { name: 'Amparo general', category: 'Amparo' },
      { name: 'Demanda familiar de alimentos', category: 'Familiar' },
      { name: 'Demanda civil ordinaria', category: 'Civil' },
    ];

    expect(rankTemplateCandidates(templates, 'familiar', 'demanda').map((item) => item.name)).toEqual([
      'Demanda familiar de alimentos',
      'Demanda civil ordinaria',
      'Amparo general',
    ]);
  });
});
