import type { DocumentNode, UniversalLegalDocument } from '@/lib/legal-engine/types';

/**
 * Caso y «redactor de IA» SINTÉTICOS y deterministas para probar metas de extensión sin proveedor.
 *
 * El redactor no inventa: cada párrafo se construye con un hecho, una prueba o una prestación
 * del caso y una de 30 líneas de razonamiento distintas, sin citas legales. La cantidad de
 * material depende del tamaño del caso (hechos × 4 párrafos de apoyo): un caso pobre NO puede
 * sostener una meta alta sin repetir, que es lo que las pruebas verifican.
 */

export interface SyntheticCase {
  facts: string[];
  claims: string[];
  evidence: string[];
}

const SUBJECTS = ['la arrendadora', 'el administrador del inmueble', 'la representante de la actora', 'el contador de la arrendataria', 'un tercero contratista', 'la propietaria colindante', 'el encargado de mantenimiento', 'la aseguradora del local', 'el fiador solidario', 'la gerente de operaciones', 'el notario designado', 'la inmobiliaria intermediaria'];
const ACTIONS = ['recibió un aviso escrito', 'solicitó una aclaración formal', 'entregó un juego de llaves', 'emitió una factura por servicios', 'acordó una prórroga verbal', 'levantó un inventario fotográfico', 'cobró un depósito adicional', 'notificó una inconformidad', 'realizó una visita de inspección', 'canceló una reservación previa', 'propuso un calendario de pagos', 'rechazó un presupuesto de obra'];
const OBJECTS = ['sobre el local comercial número cuatro', 'respecto del almacén anexo', 'en relación con la bodega del sótano', 'por la instalación eléctrica del primer nivel', 'acerca del estacionamiento asignado', 'sobre la fachada y el anuncio luminoso', 'con motivo de la humedad del muro norte', 'por la renovación del sistema de climatización', 'a propósito del contrato de vigilancia', 'sobre el mobiliario incluido en el arrendamiento', 'respecto de la póliza de responsabilidad civil', 'por la cuota de mantenimiento condominal'];
const WHENS = ['durante la primera quincena de febrero', 'a finales de marzo', 'poco después de la firma del contrato', 'en vísperas del vencimiento de la renta', 'tras la última revisión semestral', 'a mediados de junio', 'al concluir el periodo de gracia', 'antes de la entrega formal de posesión'];

export function syntheticCase(factCount: number, evidenceCount = Math.max(1, Math.round(factCount / 2)), claimCount = Math.max(1, Math.round(factCount / 3))): SyntheticCase {
  const fact = (i: number) => `${SUBJECTS[(i * 5 + 1) % SUBJECTS.length][0].toUpperCase()}${SUBJECTS[(i * 5 + 1) % SUBJECTS.length].slice(1)} ${ACTIONS[(i * 7 + 3) % ACTIONS.length]} ${OBJECTS[(i * 11 + 2) % OBJECTS.length]} ${WHENS[(i * 3) % WHENS.length]}, sin que mediara requerimiento judicial alguno (referencia interna ${1000 + i * 17})`;
  return {
    facts: Array.from({ length: factCount }, (_, i) => fact(i)),
    claims: Array.from({ length: claimCount }, (_, i) => `El pago de las cantidades derivadas ${OBJECTS[(i * 5 + 4) % OBJECTS.length]} conforme a la cláusula ${i + 1}`),
    evidence: Array.from({ length: evidenceCount }, (_, i) => `Documental privada número ${i + 1} ${OBJECTS[(i * 3 + 1) % OBJECTS.length]}`),
  };
}

/** Demanda sintética con los hechos, prestaciones y pruebas del caso (texto fuente de la contestación). */
export function syntheticDemandText(c: SyntheticCase): string {
  return [
    'C. JUEZ TERCERO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL',
    'P R E S E N T E.',
    '',
    'ACTOR SINTETICO UNO, por mi propio derecho, ante este H. Juzgado comparezco y expongo:',
    'Que vengo a demandar en la vía ordinaria civil a DEMANDADO SINTETICO DOS, S.A. DE C.V., por las siguientes:',
    '',
    'PRESTACIONES',
    ...c.claims.map((claim, i) => `${String.fromCharCode(65 + (i % 26))}) ${claim}.`),
    '',
    'HECHOS',
    ...c.facts.map((fact, i) => `${i + 1}. ${fact}.`),
    '',
    'PRUEBAS',
    ...c.evidence.map((item, i) => `${i + 1}. ${item}.`),
    '',
    'DERECHO',
    'Son aplicables las disposiciones civiles que rigen la materia.',
    '',
    'PUNTOS PETITORIOS',
    'PRIMERO. Tenerme por presentado demandando en la vía ordinaria civil.',
    'PROTESTO LO NECESARIO',
    'Guadalajara, Jalisco, a 2 de mayo de 2025.',
  ].join('\n');
}

const REASONING: readonly string[] = [
  'este hecho debe examinarse a la luz de lo realmente pactado, sin presumir alcances que las partes no establecieron expresamente',
  'la contraparte no precisa las circunstancias de modo, tiempo y lugar que permitirían tener por demostrada su afirmación',
  'la carga de acreditar el extremo afirmado corresponde a quien lo invoca como fundamento de su pretensión',
  'las constancias que obran en el expediente no bastan por sí solas para generar la convicción que se pretende',
  'la narración carece de un nexo causal claro entre la conducta imputada y la consecuencia jurídica que se reclama',
  'conviene distinguir entre la mera afirmación unilateral y el hecho que consta en documentos de fecha cierta',
  'cualquier valoración debe atender al contexto completo de la relación entre las partes y no a fragmentos aislados',
  'la pretensión descansa en una interpretación que no se desprende del texto de los documentos exhibidos',
  'el órgano jurisdiccional deberá ponderar la congruencia entre lo narrado y lo que el oferente pretende probar',
  'resulta indispensable que cada punto fáctico se contraste con la prueba específica que supuestamente lo respalda',
  'la parte promovente omite explicar por qué su dicho sería preferible al contenido literal de lo convenido',
  'el planteamiento ignora las condiciones y modalidades que condicionan la exigibilidad de lo reclamado',
  'la secuencia cronológica expuesta presenta lagunas que impiden asignarle el efecto jurídico pretendido',
  'no se aportan elementos objetivos que permitan verificar la cuantía o el alcance de lo que se demanda',
  'el escrito inicial confunde la existencia de la relación con la procedencia de cada una de las consecuencias invocadas',
  'la lectura propuesta por la contraria desatiende el principio de buena fe que rige el cumplimiento de lo pactado',
  'cada obligación alegada exige un análisis particular de su origen, su exigibilidad y su eventual cumplimiento',
  'la defensa se reserva el derecho de controvertir cualquier documento cuya autenticidad o alcance no haya sido demostrado',
  'la afirmación carece del soporte que permitiría considerarla cierta sin el desahogo de la prueba correspondiente',
  'las manifestaciones de la actora son apreciaciones subjetivas que no sustituyen la demostración de los hechos',
  'debe examinarse si el supuesto incumplimiento tuvo la entidad suficiente para producir los efectos que se reclaman',
  'la reclamación no distingue entre conceptos distintos y los trata como un solo bloque sin justificar su acumulación',
  'cualquier consecuencia pretendida debe derivar de una obligación identificada y no de una inferencia genérica',
  'la actora no explica con claridad el fundamento de las cantidades que atribuye a este concepto',
  'el análisis de este punto exige verificar primero la existencia y los términos del acuerdo al que se alude',
  'la secuela del juicio permitirá confirmar que lo narrado no coincide con lo que reflejan los documentos',
  'la pretensión debe rechazarse en la medida en que no se acredite el presupuesto fáctico que la sustenta',
  'se advierte una discrepancia entre la fecha señalada y el momento en que debía producirse el efecto invocado',
  'la contestación de este punto no implica reconocer su veracidad ni renunciar a ninguna excepción procedente',
  'la parte demandada controvierte el planteamiento por carecer de sustento probatorio idóneo en autos',
];

const PARAGRAPH_KINDS = 4;

/** Párrafos distintos que el caso puede sostener: hechos × 4 tipos × 30 líneas de razonamiento (máx.). */
export function maxDistinctParagraphs(c: SyntheticCase): number {
  return c.facts.length * PARAGRAPH_KINDS * REASONING.length;
}

const OPENINGS: readonly (readonly string[])[] = [
  [
    'Por lo que hace al hecho',
    'En cuanto al hecho',
    'Sobre el hecho',
    'Tratándose del hecho',
    'Respecto del hecho',
    'En relación con el hecho',
    'Acerca del hecho',
    'Con referencia al hecho',
  ],
  [
    'Debe valorarse la relación entre el hecho',
    'Conviene precisar el vínculo del hecho',
    'Resulta pertinente examinar cómo se conecta el hecho',
    'Se analiza ahora la conexión probatoria del hecho',
    'Interesa determinar qué respaldo documental tiene el hecho',
    'Corresponde contrastar el hecho',
    'Es necesario confrontar el hecho',
    'Procede revisar la apoyatura del hecho',
  ],
  [
    'Por lo que toca a la pretensión',
    'En lo concerniente a la prestación',
    'Frente a la reclamación',
    'En torno a lo reclamado como',
    'A propósito de la petición consistente en',
    'Respecto del reclamo identificado como',
    'Sobre la cantidad exigida por concepto de',
    'En punto a lo solicitado respecto de',
  ],
  [
    'Desde la perspectiva procesal, el hecho',
    'En el plano adjetivo, el hecho',
    'Para efectos del procedimiento, el hecho',
    'En la secuela del juicio, el hecho',
    'Atendiendo a la etapa que guarda el asunto, el hecho',
    'En el marco de la litis, el hecho',
    'Con miras a la fijación de la controversia, el hecho',
    'En la dinámica del proceso, el hecho',
  ],
];

const CLOSINGS: readonly string[] = [
  'Nada de lo anterior implica aceptar la versión contraria.',
  'Esta observación se formula sin renunciar a ninguna defensa.',
  'La valoración definitiva corresponde al juzgador.',
  'Ello se afirma sin perjuicio de lo que arroje la instrucción.',
  'Se deja constancia de la objeción para los efectos conducentes.',
  'La postura se reserva hasta que se desahoguen los medios de convicción.',
  'No se concede valor probatorio pleno a la mera afirmación.',
  'La defensa conserva íntegras sus facultades de impugnación.',
  'Lo expuesto no constituye reconocimiento de hecho alguno.',
  'Corresponde a la actora acreditar los extremos de su dicho.',
  'Se solicita que este punto se resuelva con apego a las constancias.',
  'El señalamiento se hace con estricta observancia del principio de contradicción.',
];

function paragraphFor(c: SyntheticCase, index: number): string {
  // Enumeración sin colisiones: (tipo, hecho, razonamiento) distintos mientras index < maxDistinctParagraphs.
  // Aperturas y cierres rotan con pasos distintos para que ningún giro de 10 palabras se repita en cadena.
  const kind = index % PARAGRAPH_KINDS;
  const factIndex = Math.floor(index / PARAGRAPH_KINDS) % Math.max(1, c.facts.length);
  const reasoningIndex = Math.floor(index / (PARAGRAPH_KINDS * Math.max(1, c.facts.length)));
  const fact = c.facts[factIndex] || 'el hecho señalado';
  const reasoning = REASONING[(reasoningIndex * 7 + factIndex * 3 + kind) % REASONING.length];
  const evidence = c.evidence[factIndex % Math.max(1, c.evidence.length)] || 'la prueba ofrecida';
  const claim = c.claims[factIndex % Math.max(1, c.claims.length)] || 'la pretensión planteada';
  const opening = OPENINGS[kind][(index * 5 + factIndex) % OPENINGS[kind].length];
  const closing = CLOSINGS[(index * 7 + kind * 3 + 1) % CLOSINGS.length];
  const lower = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  switch (kind) {
    case 0: return `${opening} ${factIndex + 1}, consistente en que ${lower(fact)}, ${reasoning}. ${closing}`;
    case 1: return `${opening} ${factIndex + 1} con ${lower(evidence)}: ${reasoning}; por ello, su valor se determinará al apreciar el conjunto de las constancias. ${closing}`;
    case 2: return `${opening} ${lower(claim)}, en conexión con el hecho ${factIndex + 1}, ${reasoning}, de modo que el reclamo no puede acogerse sin sustento. ${closing}`;
    default: return `${opening} ${factIndex + 1} merece una lectura cuidadosa: ${reasoning}. ${closing}`;
  }
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Redactor simulado: escribe, por sección, hasta el presupuesto de palabras del contrato de
 * extensión o hasta agotar el material del caso, nunca repitiendo un párrafo. Cada llamada
 * continúa donde terminó la anterior para que las secciones no compartan párrafos.
 */
export function createSimulatedWriter(c: SyntheticCase, materialParagraphs = maxDistinctParagraphs(c)) {
  let cursor = 0;
  const written = new Map<string, number>();
  const available = Math.min(materialParagraphs, maxDistinctParagraphs(c));
  const calls: Array<{ sectionId: string; words: number; budget: number }> = [];
  const writer = async ({ section, doc }: { section: DocumentNode; doc: UniversalLegalDocument }): Promise<string> => {
    const extension = (doc.generationMetadata as { generationExtension?: { sectionBudgets?: Record<string, { targetWords: number }>; sectionWordTargets?: Record<string, number> } }).generationExtension;
    const budget = extension?.sectionBudgets?.[section.id]?.targetWords ?? extension?.sectionWordTargets?.[section.id] ?? 140;
    const paragraphs: string[] = [];
    // El pipeline llama al redactor una vez por tarea de la sección: el presupuesto es de la sección completa.
    let words = 0;
    const alreadyWritten = written.get(section.id) || 0;
    while (alreadyWritten + words < budget && cursor < available) {
      const paragraph = paragraphFor(c, cursor++);
      paragraphs.push(paragraph);
      words += wordCount(paragraph);
    }
    if (paragraphs.length === 0) {
      paragraphs.push(`[DATO PENDIENTE: el expediente no aporta más soporte para desarrollar «${section.title}»]`);
    }
    written.set(section.id, alreadyWritten + words);
    calls.push({ sectionId: section.id, words, budget });
    return paragraphs.join('\n\n');
  };
  const expansionProvider = async (request: { userMessage: string }) => {
    const section = request.userMessage.match(/SECCIÓN: ([^\n]+)/)?.[1] || 'sección';
    const paragraphs: string[] = [];
    let words = 0;
    while (words < 420 && cursor < available) {
      const paragraph = paragraphFor(c, cursor++);
      paragraphs.push(paragraph);
      words += wordCount(paragraph);
    }
    calls.push({ sectionId: `expansion:${section}`, words, budget: 420 });
    return {
      provider: 'nvidia', model: 'simulado-determinista', success: paragraphs.length > 0,
      content: paragraphs.join('\n\n'), latencyMs: 1, finishReason: 'stop', isTruncated: false,
      origin: 'AI_GENERATED_LEGAL_CONTENT', isLegalAiContent: true,
    } as never;
  };
  return Object.assign(writer, { calls, expansionProvider, get remaining() { return Math.max(0, available - cursor); } });
}
