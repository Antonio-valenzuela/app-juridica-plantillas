export interface TemplateCandidateForContext {
  category?: string;
  matterId?: string;
  name: string;
}

function normalize(value: string | undefined): string {
  return (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Orders the existing personal-template collection for the current matter and
 * document type. It never removes a template: an explicit lawyer choice can
 * still use a less-specific template after the compatible candidates.
 */
export function rankTemplateCandidates<T extends TemplateCandidateForContext>(
  templates: T[],
  matter?: string,
  documentType?: string
): T[] {
  const matterKey = normalize(matter);
  const typeKey = normalize(documentType);
  return templates
    .map((template, index) => {
      const category = normalize(template.category || template.matterId);
      const name = normalize(template.name);
      let score = 0;
      if (matterKey && category && (category.includes(matterKey) || matterKey.includes(category))) score += 4;
      if (typeKey && name.includes(typeKey)) score += 3;
      if (typeKey.includes('demanda') && /demanda|promocion|escrito/.test(name)) score += 1;
      if (typeKey.includes('contest') && /contestacion|recurso/.test(name)) score += 1;
      return { template, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ template }) => template);
}
