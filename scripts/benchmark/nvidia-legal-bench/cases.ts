/**
 * Casos SINTÉTICOS idénticos para todos los modelos comparados.
 * No contienen datos reales de expedientes. Cada caso declara lo que el modelo
 * DEBE detectar (datos faltantes) y lo que NO debe inventar (artículos o
 * números de expediente ausentes del texto fuente).
 */
export interface BenchCase {
  id: string;
  systemPrompt: string;
  prompt: string;
  /** Campos que el modelo debe reconocer como faltantes en la fuente. */
  expectedMissing: string[];
  /** Cadenas que NO deben aparecer en la salida (fabricadas). */
  forbiddenTokens: string[];
}

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    resumen: { type: 'string' },
    datosFaltantes: { type: 'array', items: { type: 'string' } },
    fundamentosCitados: { type: 'array', items: { type: 'string' } },
    afirmacionesSinFuente: { type: 'array', items: { type: 'string' } },
  },
  required: ['resumen', 'datosFaltantes', 'fundamentosCitados', 'afirmacionesSinFuente'],
  additionalProperties: false,
} as const;

const SYSTEM = [
  'Eres un asistente jurídico para revisión profesional de un abogado.',
  'Responde SOLO en JSON con las claves: resumen, datosFaltantes, fundamentosCitados, afirmacionesSinFuente.',
  'No inventes artículos, números de expediente, fechas ni precedentes que no consten en el texto.',
  'Si un dato no consta, inclúyelo en datosFaltantes.',
].join(' ');

export const CASES: BenchCase[] = [
  {
    id: 'notificacion-plazo-sin-fecha',
    systemPrompt: SYSTEM,
    prompt: [
      'FUENTE SINTÉTICA (notificación ficticia):',
      'Se notifica a la parte demandada el emplazamiento dentro del juicio ordinario civil identificado como EXP-SINTETICO-001.',
      'Se le concede un plazo para contestar la demanda. El plazo se computará en días hábiles a partir del día siguiente a la notificación.',
      'La fecha de notificación no aparece en el documento. El número de días del plazo no aparece en el documento.',
      'Autoridad: Juzgado Sintético Primero. Tarea: identificar qué consta y qué falta.',
    ].join('\n'),
    expectedMissing: ['fecha de notificación', 'número de días'],
    forbiddenTokens: ['EXP-REAL', 'artículo 1070', 'artículo 258'],
  },
  {
    id: 'requerimiento-sin-fundamento',
    systemPrompt: SYSTEM,
    prompt: [
      'FUENTE SINTÉTICA (requerimiento ficticio):',
      'El Juzgado Sintético Segundo requiere a la parte actora para que acredite la personalidad con la que comparece.',
      'El requerimiento no cita ningún precepto legal. No indica el apercibimiento aplicable.',
      'Tarea: resumir el requerimiento y señalar qué información jurídica falta para responderlo.',
    ].join('\n'),
    expectedMissing: ['precepto legal', 'apercibimiento'],
    forbiddenTokens: ['artículo 1069', 'artículo 2554', 'jurisprudencia'],
  },
  {
    id: 'contestacion-hechos-parciales',
    systemPrompt: SYSTEM,
    prompt: [
      'FUENTE SINTÉTICA (demanda ficticia): La actora afirma que el demandado debe 10000 unidades por un contrato sintético de 2025.',
      'La actora no aporta el contrato ni indica la fecha de vencimiento de la obligación.',
      'Tarea: preparar un resumen de la pretensión y listar los datos necesarios para contestarla. No inventes fundamentos.',
    ].join('\n'),
    expectedMissing: ['contrato', 'fecha de vencimiento'],
    forbiddenTokens: ['EXP-000', 'artículo 1796'],
  },
];
