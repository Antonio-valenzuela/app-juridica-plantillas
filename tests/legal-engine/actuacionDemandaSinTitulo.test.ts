import { describe, expect, it } from 'vitest';
import { proposeActuaciones } from '@/lib/legal-engine/actuacionProposal';
import { documentFromPages } from '../fixtures/actosProcesalesSinteticos';

/**
 * Regresión (recorrido con una demanda civil real del despacho, reproducida aquí con datos sintéticos): una demanda
 * SIN título «DEMANDA…» que abre con el rubro «C. JUEZ… PRESENTE» y se presenta con la fórmula «comparezco a entablar
 * formal demanda» se clasificaba como «escrito de parte», no se proponía la contestación y la generación quedaba
 * bloqueada sin salida.
 */
const demanda = (formula: string) => [
  'C. JUEZ EN TURNO DE PRIMERA INSTANCIA ESPECIALIZADO EN MATERIA CIVIL DEL PRIMER PARTIDO JUDICIAL.',
  'PRESENTE',
  `CC. ANA FICTICIA PÉREZ Y LUIS SINTÉTICO RAMOS, MEXICANOS, MAYORES DE EDAD, POR NUESTRO PROPIO DERECHO, CON DOMICILIO EN CALLE FALSA 123, ZAPOPAN, JALISCO, ${formula} EN CONTRA DE LA DIRECCIÓN INVENTADA DE PENSIONES, EN LA VÍA CIVIL SUMARIA, RECLAMANDO LAS SIGUIENTES:`,
  'PRESTACIONES',
  'I.- LA CANCELACIÓN DE LA HIPOTECA CONSTITUIDA EN LA ESCRITURA 123 DEL NOTARIO FICTICIO.',
  'HECHOS',
  'PRIMERO. LOS ACTORES CELEBRARON UN CONTRATO DE MUTUO CON GARANTÍA HIPOTECARIA EL 8 DE AGOSTO DE 2008.',
  'SEGUNDO. LA DEMANDADA NUNCA REQUIRIÓ EL PAGO Y LA ACCIÓN PRESCRIBIÓ.',
  'PUNTOS PETITORIOS',
  'PRIMERO. SE ADMITA LA PRESENTE DEMANDA.',
].join('\n');

describe('demanda civil sin título: la fórmula de inicio se reconoce y se propone la contestación', () => {
  for (const formula of [
    'COMPAREZCO A ENTABLAR FORMAL DEMANDA',
    'OCURRO A DEMANDAR',
    'COMPARECEMOS A ENTABLAR DEMANDA',
    'PRESENTO FORMAL DEMANDA',
    'VENGO A DEMANDAR',
  ]) {
    it(`«${formula}» → DEMANDA civil, contestación recomendada`, () => {
      const proposal = proposeActuaciones([documentFromPages('demanda-sin-titulo', [demanda(formula)])]);
      expect(proposal.detected.kind).toBe('DEMANDA');
      expect(proposal.detected.matter).toBe('CIVIL');
      expect(proposal.candidates.map((candidate) => candidate.documentType)).toContain('contestacion_demanda_civil');
      expect(proposal.recommended).toBe('contestacion_demanda_civil');
    });
  }

  it('un escrito de parte que no inicia acción sigue sin proponerse como demanda', () => {
    const escrito = [
      'C. JUEZ SEGUNDO DE LO CIVIL', 'PRESENTE',
      'ANA FICTICIA PÉREZ, POR MI PROPIO DERECHO, COMPAREZCO A SOLICITAR SE ME EXPIDAN COPIAS CERTIFICADAS DEL EXPEDIENTE 123/2025.',
      'PUNTOS PETITORIOS', 'PRIMERO. SE ME EXPIDAN LAS COPIAS SOLICITADAS.',
    ].join('\n');
    const proposal = proposeActuaciones([documentFromPages('escrito-copias', [escrito])]);
    expect(proposal.detected.kind).not.toBe('DEMANDA');
    expect(proposal.recommended).not.toBe('contestacion_demanda_civil');
  });
});

describe('demanda civil sin título: la contraparte se identifica', () => {
  it('«entablar formal demanda en contra de X» identifica a la demandada (no queda «por identificar»)', async () => {
    const { extractActionTarget } = await import('@/lib/legal-engine/partyExtraction');
    expect(extractActionTarget(demanda('COMPAREZCO A ENTABLAR FORMAL DEMANDA'))).toBe('DIRECCIÓN INVENTADA DE PENSIONES');
  });
});

describe('demanda que cita jurisprudencia: el número de una tesis no es el expediente', () => {
  it('no toma «Amparo directo N/AAAA» ni «1a./J. N/AAAA» como expediente de la demanda', async () => {
    const { detectCaseFicha } = await import('@/lib/legal-engine/caseFichaDetection');
    const texto = `${demanda('COMPAREZCO A ENTABLAR FORMAL DEMANDA')}\nSuprema Corte de Justicia de la Nación\nRegistro digital: 178668\nInstancia: Primera Sala\nTesis: 1a./J. 18/2005\nPRESCRIPCIÓN DE LA ACCIÓN HIPOTECARIA.\nContradicción de tesis 121/2004-PS. Entre las sustentadas por los Tribunales Colegiados.\nAmparo directo 3296/2004. Carlos Sotelo Salgado y otra. 10 de junio de 2004. Unanimidad de votos.`;
    expect(detectCaseFicha([texto]).expediente).toBe('');
  });

  it('conserva el expediente rotulado de un escrito que sí lo trae, aunque cite tesis', async () => {
    const { detectCaseFicha } = await import('@/lib/legal-engine/caseFichaDetection');
    const texto = `EXPEDIENTE: 1234/2025\n${demanda('VENGO A DEMANDAR')}\nTesis: 1a./J. 18/2005\nAmparo directo 3296/2004. Carlos Sotelo.`;
    expect(detectCaseFicha([texto]).expediente).toBe('1234/2025');
  });
});

describe('demanda que cita jurisprudencia de amparo en la exposición', () => {
  // Como en la demanda real, la jurisprudencia citada llega después del proemio (donde se declara la acción).
  const relleno = 'LOS HECHOS Y EL DERECHO SE EXPONEN CON DETALLE EN EL PRESENTE ESCRITO. '.repeat(50);
  const conCitas = `${demanda('COMPAREZCO A ENTABLAR FORMAL DEMANDA')}\n${relleno}\nEl Tribunal Colegiado, al resolver el juicio de amparo directo 210/1997, sostuvo que la acción prescribe. Esto se confirmó al resolver el amparo directo 485/2018, que dio origen a la tesis aislada.`;

  it('sigue siendo una demanda civil (no una demanda de amparo) y se propone la contestación', () => {
    const proposal = proposeActuaciones([documentFromPages('demanda-con-citas', [conCitas])]);
    expect(proposal.detected.kind).toBe('DEMANDA');
    expect(proposal.recommended).toBe('contestacion_demanda_civil');
  });

  it('el número de un precedente citado en prosa no es el expediente', async () => {
    const { detectCaseFicha } = await import('@/lib/legal-engine/caseFichaDetection');
    expect(detectCaseFicha([conCitas]).expediente).toBe('');
  });
});
