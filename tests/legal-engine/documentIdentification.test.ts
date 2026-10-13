import { describe, expect, it } from 'vitest';
import { detectCaseFicha } from '@/lib/legal-engine/caseFichaDetection';
import { classifyMatter } from '@/lib/legal-engine/matterClassification';
import {
  extractAddressedCourt,
  extractPartyField,
  initiatesAction,
  isJurisdictionalDesignation,
  isValidProceduralPartyName,
} from '@/lib/legal-engine/partyExtraction';
import { extractParties } from '@/lib/legal-engine/case-extraction/parties';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildSourceGrounding } from '@/lib/legal-engine/sourceGrounding';
import { SYNTHETIC_DEMANDS, demandToText } from '../helpers/syntheticDemandPdf';
import { evaluateSourceOutputCompatibility, inferSourceMatterForDocuments, inferSourceOutputType } from '@/lib/legal-engine/sourceOutputCompatibility';
import {
  CONTESTACION_CIVIL_APODERADO,
  DEMANDA_CIVIL_ARRENDAMIENTO,
  DEMANDA_LABORAL_TRIBUNAL,
  DEMANDA_NULIDAD_FOTOINFRACCION,
  ESCRITO_SIN_SENALES,
  DEMANDA_AMPARO_CITA_SENTENCIA,
  INCIDENTE_LIQUIDACION_PARTE,
  sourceFromText,
} from '../helpers/syntheticCaseDocuments';

const COURT_OR_DEICTIC = /\b(?:JUEZ|JUZGADO|TRIBUNAL|MAGISTRAD|ESTE\s+H)\b/i;

describe('Identificación documental — órgano jurisdiccional ≠ partes procesales', () => {
  it.each([
    'C. JUEZ NOVENO DE LO CIVIL',
    'Juez Primero de lo Familiar',
    'H. Tribunal Colegiado en Materia Civil',
    'ESTE H. JUZGADO',
    'ESTE H',
    'Magistrada Presidenta de la Sala',
    'Secretario de Acuerdos',
    'Su Señoría',
    'la parte actora',
    'NO PROBÓ SU ACCIÓN COMO ES POSIBLE',
    'reinstalación',
    'P R E S E N T E',
    // Ruido de OCR en escaneos: cifras sueltas y frases que empiezan con adverbios.
    'Ahora 2 B',
    'Me bien. la parte demandada RAMIRO SOTO',
    'Foja 12 vuelta',
  ])('rechaza «%s» como nombre de parte', (value) => {
    expect(isValidProceduralPartyName(value)).toBe(false);
  });

  it.each([
    'María Fernanda López Ruiz',
    'Grupo Industrial Orión, S.A. de C.V.',
    'SECRETARÍA DE TRANSPORTE DEL ESTADO DE JALISCO',
    'Instituto Mexicano del Seguro Social',
    'Salazar Pérez Ramón',
    'Constructora 2000, S.A. de C.V.',
  ])('acepta «%s» como nombre de parte', (value) => {
    expect(isValidProceduralPartyName(value)).toBe(true);
  });

  it('distingue cargos judiciales de autoridades administrativas que sí pueden ser parte', () => {
    expect(isJurisdictionalDesignation('C. JUEZ NOVENO DE LO CIVIL')).toBe(true);
    expect(isJurisdictionalDesignation('SECRETARÍA DE MOVILIDAD')).toBe(false);
  });

  it('las etiquetas de parte no aceptan al juzgado ni referencias deícticas', () => {
    const corpus = 'ACTOR: C. JUEZ PRIMERO DE LO FAMILIAR\nACTOR: Daniela Ortiz Medina\nDEMANDADO: ESTE H. TRIBUNAL\nDEMANDADO: Rogelio Salas Ibarra';
    expect(extractPartyField(corpus, [/(?:actor)\s*[:\-]\s*([^;,\n]{2,90})/i])).toBe('Daniela Ortiz Medina');
    expect(extractPartyField(corpus, [/(?:demandado)\s*[:\-]\s*([^;,\n]{2,90})/i])).toBe('Rogelio Salas Ibarra');
    const parties = extractParties([
      { rawText: 'ACTOR: C. JUEZ NOVENO DE LO CIVIL', provenance: [] },
      { rawText: 'DEMANDADO: ESTE H', provenance: [] },
      { rawText: 'AUTORIDAD: JUZGADO NOVENO DE LO CIVIL', provenance: [] },
    ] as any).parties;
    expect(parties.map((party) => party.role)).toEqual(['AUTORIDAD']);
  });
});

describe('Ficha del expediente con documentos sintéticos', () => {
  it('demanda civil: el destinatario va a autoridad; actor y demandado salen del proemio y la acción', () => {
    const ficha = detectCaseFicha([DEMANDA_CIVIL_ARRENDAMIENTO]);
    expect(ficha.actor).toBe('ROSALBA QUINTERO MÉNDEZ');
    expect(ficha.demandado).toContain('INMOBILIARIA LOS FRESNOS');
    expect(ficha.autoridad).toContain('JUEZ TERCERO DE LO CIVIL');
    expect(ficha.materia).toBe('Civil');
    expect(ficha.tipo).toBe('Demanda');
    expect(ficha.actor).not.toMatch(COURT_OR_DEICTIC);
    expect(ficha.demandado).not.toMatch(COURT_OR_DEICTIC);
  });

  it('contestación: quien comparece no se rotula como actor y el juez tampoco', () => {
    expect(initiatesAction(CONTESTACION_CIVIL_APODERADO)).toBe(false);
    const ficha = detectCaseFicha([CONTESTACION_CIVIL_APODERADO]);
    expect(ficha.actor).toBe('');
    // Comparece el apoderado: la parte demandada es su representada.
    expect(ficha.demandado).toBe('COMERCIALIZADORA DEL BAJÍO');
    expect(ficha.autoridad).toContain('JUEZ SEGUNDO DE LO CIVIL');
    expect(ficha.materia).toBe('Civil');
    expect(ficha.tipo).toBe('Contestación de Demanda');
  });

  it('demanda laboral ante tribunal laboral: materia Laboral por foro + legislación + contenido', () => {
    const ficha = detectCaseFicha([DEMANDA_LABORAL_TRIBUNAL]);
    expect(ficha.materia).toBe('Laboral');
    expect(ficha.actor).toBe('JOAQUÍN ESTRADA PALMA');
    expect(ficha.demandado).toContain('TRANSPORTES DEL NORTE');
  });

  it('nulidad administrativa: la autoridad administrativa es demandada; el tribunal no', () => {
    const ficha = detectCaseFicha([DEMANDA_NULIDAD_FOTOINFRACCION]);
    expect(ficha.materia).toBe('Administrativa');
    expect(ficha.demandado).toBe('SECRETARÍA DE TRANSPORTE DEL ESTADO DE JALISCO');
    expect(ficha.autoridad).toContain('TRIBUNAL DE JUSTICIA ADMINISTRATIVA');
    expect(ficha.actor).toBe('LUCÍA ARMENTA SOLÍS');
  });

  it('sin señales suficientes la materia queda por confirmar (no se supone Amparo ni Civil)', () => {
    const ficha = detectCaseFicha([ESCRITO_SIN_SENALES]);
    expect(ficha.materia).toBe('Por confirmar');
    expect(ficha.tipo).toBe('Por confirmar');
    expect(ficha.actor).toBe('');
  });
});

describe('Clasificación de materia por combinación de señales', () => {
  it('una palabra aislada ("junta", "patrón") no convierte en laboral un escrito dirigido a un juez civil', () => {
    const result = classifyMatter(DEMANDA_CIVIL_ARRENDAMIENTO);
    expect(result.matter).toBe('CIVIL');
    expect(result.evidence.some((item) => item.startsWith('foro'))).toBe(true);
  });

  it('el foro domina al vocabulario incidental de otra materia', () => {
    const civilWithLaborWords = `C. JUEZ CUARTO DE LO CIVIL\nPRESENTE\n${'El trabajador del edificio, el patrón de pagos, la reinstalación del portón y el aguinaldo del conserje se mencionan como contexto.'}`;
    expect(classifyMatter(civilWithLaborWords).matter).toBe('CIVIL');
  });

  it('el amparo es una vía: un amparo contra un laudo conserva la materia laboral', () => {
    const amparoLaboral = 'TRIBUNAL COLEGIADO EN MATERIA DE TRABAJO\nAMPARO DIRECTO 10/2025\nQUEJOSO: Persona Sintética\nEl laudo dictado en el juicio laboral condenó a la reinstalación del trabajador.';
    expect(classifyMatter(amparoLaboral).matter).toBe('LABORAL');
    const amparoSinMateria = 'JUZGADO PRIMERO DE DISTRITO\nJUICIO DE AMPARO INDIRECTO 22/2025\nQUEJOSO: Persona Sintética\nACTO RECLAMADO: la orden sintética.';
    expect(classifyMatter(amparoSinMateria).matter).toBe('AMPARO');
  });

  it('señales insuficientes o empatadas → NO_IDENTIFICADA', () => {
    expect(classifyMatter(ESCRITO_SIN_SENALES).matter).toBe('NO_IDENTIFICADA');
    expect(classifyMatter('').matter).toBe('NO_IDENTIFICADA');
  });
});

describe('Motor: misma identificación que la ficha', () => {
  it('demanda civil → partes correctas y materia CIVIL en el grounding', () => {
    const source = sourceFromText(DEMANDA_CIVIL_ARRENDAMIENTO, 'sint-civil');
    const analysis = reconstructCaseAnalysis([source], 'Contestar la demanda');
    expect(analysis.parties.actor).toBe('ROSALBA QUINTERO MÉNDEZ');
    expect(analysis.parties.demandado).toContain('INMOBILIARIA LOS FRESNOS');
    expect(buildSourceGrounding(source).container.matter).toBe('CIVIL');
  });

  it('contestación → el motor no inventa actor a partir del apoderado ni del juez', () => {
    const source = sourceFromText(CONTESTACION_CIVIL_APODERADO, 'sint-contestacion');
    const analysis = reconstructCaseAnalysis([source], 'Analizar');
    expect(analysis.parties.actor || '').not.toMatch(/ARMANDO|JUEZ/i);
    expect(analysis.parties.demandado || '').not.toMatch(COURT_OR_DEICTIC);
  });

  it('extrae el órgano destinatario con su continuación envuelta', () => {
    expect(extractAddressedCourt(DEMANDA_CIVIL_ARRENDAMIENTO)).toBe('JUEZ TERCERO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL DEL ESTADO DE JALISCO');
  });
});

describe('Familia documental: un escrito de parte que cita una resolución no es una resolución', () => {
  it('demanda de amparo que cita la sentencia reclamada → DEMANDA_AMPARO_DIRECTO, no SENTENCIA', () => {
    const doc = sourceFromText(DEMANDA_AMPARO_CITA_SENTENCIA, 'sint-amparo');
    expect(inferSourceOutputType([doc])).toBe('DEMANDA_AMPARO_DIRECTO');
  });

  it('incidente de parte → no clasificado (lo confirma el abogado) y no bloquea la contestación', () => {
    const doc = sourceFromText(INCIDENTE_LIQUIDACION_PARTE, 'sint-incidente');
    const type = inferSourceOutputType([doc]);
    expect(type).not.toMatch(/^SENTENCIA/);
    expect(type).toBe('DOCUMENTO_JURIDICO_NO_CLASIFICADO');
    expect(inferSourceMatterForDocuments([doc])).toBe('CIVIL');
    expect(() => evaluateSourceOutputCompatibility({ selectedDocumentType: 'contestacion_demanda_civil', sourceDocuments: [doc] })).not.toThrow();
  });

  it('una contestación no se toma por demanda: no se ofrece «contestar la contestación»', () => {
    const doc = sourceFromText(CONTESTACION_CIVIL_APODERADO, 'sint-contestacion-tipo');
    expect(inferSourceOutputType([doc])).toBe('CONTESTACION_DEMANDA');
  });

  it('las demandas sintéticas habilitan exactamente la contestación de su materia', () => {
    const civil = sourceFromText(DEMANDA_CIVIL_ARRENDAMIENTO, 'sint-civil-compat');
    const laboral = sourceFromText(DEMANDA_LABORAL_TRIBUNAL, 'sint-laboral-compat');
    expect(() => evaluateSourceOutputCompatibility({ selectedDocumentType: 'contestacion_demanda_civil', sourceDocuments: [civil] })).not.toThrow();
    expect(() => evaluateSourceOutputCompatibility({ selectedDocumentType: 'contestacion_demanda_laboral', sourceDocuments: [laboral] })).not.toThrow();
    expect(() => evaluateSourceOutputCompatibility({ selectedDocumentType: 'contestacion_demanda_laboral', sourceDocuments: [civil] })).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
  });
});

describe('Demandas sintéticas multipágina de distintas materias', () => {
  it.each(SYNTHETIC_DEMANDS.map((demand) => [demand.id, demand] as const))('%s: ficha con partes, órgano y materia correctos', (_id, demand) => {
    const ficha = detectCaseFicha([demandToText(demand)]);
    expect(ficha.actor).toContain(demand.actor);
    expect(ficha.demandado).toContain(demand.demandado);
    expect(ficha.autoridad).toContain(demand.court);
    expect(ficha.materia.toUpperCase()).toBe(demand.matter);
    expect(ficha.expediente).toBe(demand.expediente);
    expect(`${ficha.actor} ${ficha.demandado}`).not.toMatch(COURT_OR_DEICTIC);
  });

  it.each(SYNTHETIC_DEMANDS.map((demand) => [demand.id, demand] as const))('%s: la fuente habilita su contestación', (_id, demand) => {
    const doc = sourceFromText(demandToText(demand), demand.id);
    expect(inferSourceMatterForDocuments([doc])).toBe(demand.matter);
    expect(() => evaluateSourceOutputCompatibility({ selectedDocumentType: demand.contestacionType, sourceDocuments: [doc] })).not.toThrow();
  });
});
