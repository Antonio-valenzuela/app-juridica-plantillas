import { DocumentVariable, DocumentParties, CaseReferences } from './types';

export const STANDARD_VARIABLES = [
  'EXPEDIENTE',
  'QUEJOSO',
  'DEMANDADO',
  'AUTORIDAD',
  'FECHA_SENTENCIA',
  'FECHA_NOTIFICACION',
  'TRIBUNAL',
  'MAGISTRADO',
  'DOMICILIO_PROCESAL',
  'ABOGADO',
  'CEDULA',
  'LUGAR_FECHA',
  'TERCERO_INTERESADO'
];

export function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{([A-Z_]+)\}\}/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map(m => m.replace(/[{}]/g, ''))));
}

export function buildVariableMap(
  parties: DocumentParties,
  caseRefs: CaseReferences,
  extraValues: Record<string, string> = {}
): Record<string, DocumentVariable> {
  const variables: Record<string, DocumentVariable> = {};
  
  const mapping: Record<string, string | undefined> = {
    'EXPEDIENTE': caseRefs.expediente || caseRefs.amparo || caseRefs.toca,
    'QUEJOSO': parties.quejoso || parties.actor,
    'DEMANDADO': parties.demandado,
    'AUTORIDAD': parties.autoridadResponsable,
    'TRIBUNAL': caseRefs.tribunal || caseRefs.juzgado,
    'TERCERO_INTERESADO': parties.terceroInteresado,
    ...extraValues
  };
  
  STANDARD_VARIABLES.forEach(name => {
    variables[name] = {
      id: crypto.randomUUID(),
      name,
      value: mapping[name] || null,
      description: `Variable de documento: ${name}`,
      isRequired: true
    };
  });
  
  Object.entries(extraValues).forEach(([key, val]) => {
    if (!variables[key]) {
      variables[key] = {
        id: crypto.randomUUID(),
        name: key,
        value: val,
        description: `Variable adicional: ${key}`,
        isRequired: false
      };
    }
  });
  
  return variables;
}

export function resolveText(text: string, variables: Record<string, DocumentVariable>): string {
  if (!text) return '';
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (match, varName) => {
    const variable = variables[varName];
    if (variable && variable.value) {
      return variable.value;
    }
    return `[DATO PENDIENTE: ${varName}]`;
  });
}

export function countVariableStatus(variables: Record<string, DocumentVariable>): { resolved: number, pending: number } {
  let resolved = 0;
  let pending = 0;
  
  Object.values(variables).forEach(v => {
    if (v.value) resolved++;
    else pending++;
  });
  
  return { resolved, pending };
}
