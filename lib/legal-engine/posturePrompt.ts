import { rolAutorOf, type RolProcesal } from './documentTemplates';

/**
 * Directiva de postura de la ampliación según el ROL PROCESAL del autor. La postura defensiva solo
 * corresponde a quien se defiende; una demanda, una apelación, una promoción o un acta no la llevan.
 */
export type PosturePromptMode = 'DEFENSIVE' | 'AFFIRMATIVE' | 'APPELLATE' | 'NON_CONTENTIOUS';

const DEFENSIVE_ROLES: readonly RolProcesal[] = ['demandado', 'apelado', 'imputado', 'defensor'];
const APPELLATE_ROLES: readonly RolProcesal[] = ['apelante', 'recurrente', 'impugnante'];
const AFFIRMATIVE_ROLES: readonly RolProcesal[] = ['actor', 'quejoso', 'promovente', 'reclamante', 'incidentista'];

export function posturePromptModeFor(rol: RolProcesal | undefined): PosturePromptMode {
  if (rol && DEFENSIVE_ROLES.includes(rol)) return 'DEFENSIVE';
  if (rol && APPELLATE_ROLES.includes(rol)) return 'APPELLATE';
  if (rol && AFFIRMATIVE_ROLES.includes(rol)) return 'AFFIRMATIVE';
  return 'NON_CONTENTIOUS';
}

/**
 * Rol del tipo. Sin plantilla canónica devuelve undefined (nunca lanza): la generación de una issue no debe
 * fallar por un tipo desconocido.
 */
function rolOf(document: { documentType?: string; documentTypeLabel?: string }): RolProcesal | undefined {
  return rolAutorOf(document.documentType, document.documentTypeLabel);
}

/** Líneas de la directiva para el documento, según su rol procesal en la plantilla. */
export function postureDirectiveLines(document: { documentType?: string; documentTypeLabel?: string }): string[] {
  // Sin plantilla conocida se conserva la directiva defensiva previa: el comportamiento anterior no cambia.
  const rol = rolOf(document);
  const mode = rol === undefined ? 'DEFENSIVE' : posturePromptModeFor(rol);
  switch (mode) {
    case 'DEFENSIVE':
      return [
        'DIRECTIVA OBLIGATORIA DE POSTURA DEFENSIVA SIN INSTRUCCIÓN DEL CLIENTE:',
        'Cuando no exista postura fáctica confirmada por el abogado:',
        'ESTÁ PERMITIDO ÚNICAMENTE: cuestionar la acreditación y suficiencia probatoria del hecho afirmado por la contraria, invocar la carga de la prueba, señalar falta de precisión o presupuestos legales, analizar el alcance probatorio y formular argumentos y excepciones jurídicas subsidiarias sostenibles.',
        'ESTÁ TERMINANTEMENTE PROHIBIDO: afirmar que un hecho es falso sin que conste en la fuente su falsedad, inventar una versión fáctica de la contraparte (contratos temporales, convenios, renuncias, faltas, notificaciones, liquidaciones o pagos no acreditados), inventar documentos inexistentes, fechas no mencionadas o acontecimientos materiales.',
      ];
    case 'APPELLATE':
      return [
        'DIRECTIVA OBLIGATORIA DE AGRAVIOS SIN INSTRUCCIÓN DEL CLIENTE:',
        'ESTÁ PERMITIDO ÚNICAMENTE: exponer el error, la incongruencia o la falta de exhaustividad de la resolución recurrida frente a constancias concretas, y el alcance de la afectación.',
        'ESTÁ TERMINANTEMENTE PROHIBIDO: afirmar que la resolución recurrida es ilegal sin fundamento verificado, inventar constancias o acontecimientos y atribuir efectos procesales a una norma no verificada.',
      ];
    case 'AFFIRMATIVE':
      return [
        'DIRECTIVA OBLIGATORIA DE POSTURA AFIRMATIVA SIN INSTRUCCIÓN DEL CLIENTE:',
        'ESTÁ PERMITIDO ÚNICAMENTE: sostener las pretensiones y hechos del autor con las constancias identificadas y señalar la prueba que los acredita.',
        'ESTÁ TERMINANTEMENTE PROHIBIDO: afirmar hechos o pruebas no contenidos en las fuentes, inventar prestaciones no solicitadas o atribuir a la contraparte actos no acreditados.',
      ];
    case 'NON_CONTENTIOUS':
      return [
        'DIRECTIVA OBLIGATORIA DE ESCRITO NO CONTENCIOSO SIN INSTRUCCIÓN DEL CLIENTE:',
        'Este escrito no es contencioso: no formules excepciones ni defensas, no atribuyas al promovente calidad de demandado ni de actor, y no expongas una postura de contradicción.',
        'ESTÁ TERMINANTEMENTE PROHIBIDO: inventar hechos, pruebas, fechas o acuerdos no contenidos en las fuentes.',
      ];
  }
}

/** Documento de respuesta (contestación, agravios de la parte defensora…): su rol es defensivo. */
export function isResponseDocument(document: { documentType?: string; documentTypeLabel?: string }): boolean {
  const rol = rolOf(document);
  return rol === undefined || posturePromptModeFor(rol) === 'DEFENSIVE';
}
