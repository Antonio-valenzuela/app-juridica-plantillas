import { describe, expect, it } from 'vitest';
import { buildCaseDossier, extractCity } from '@/lib/legal-engine/caseDossier';
import { detectCaseFicha } from '@/lib/legal-engine/caseFichaDetection';
import { extractProemioCompareciente, initiatesAction, normalizeCourtName, pickCourtDesignation } from '@/lib/legal-engine/partyExtraction';

/**
 * Formas reales de escritos de apertura observadas al cargar expedientes (reproducidas con datos inventados):
 * órgano con «PRESENTE» en el mismo renglón, proemio en MAYÚSCULAS, lugares falsos en el cuerpo.
 */
const source = (text: string) => ({ id: 's', name: 'f.docx', extractedText: text, pages: [{ page: 1, text }] }) as never;

describe('órgano jurisdiccional de la ficha', () => {
  it('quita «PRESENTE» y la puntuación final, también con prefijo en minúscula', () => {
    expect(normalizeCourtName('TRIBUNAL DE ARBITRAJE Y ESCALAFÓN DEL ESTADO DE JALISCO EN TURNO PRESENTE.')).toBe('TRIBUNAL DE ARBITRAJE Y ESCALAFÓN DEL ESTADO DE JALISCO EN TURNO');
    expect(normalizeCourtName('JUEZ DE LO FAMILIAR EN TURNO DEL ESTADO DE JALISCO. P R E S E N T E')).toBe('JUEZ DE LO FAMILIAR EN TURNO DEL ESTADO DE JALISCO');
    const dossier = buildCaseDossier([source('h. TRIBUNAL DE ARBITRAJE Y ESCALAFÓN DEL ESTADO DE JALISCO EN TURNO PRESENTE.\nC. MARÍA FICTICIA PÉREZ, mexicana, mayor de edad, por mi propio derecho, vengo a demandar a INSTITUCIÓN FICTICIA DE PRUEBA.')]);
    expect(dossier.court).toBe('TRIBUNAL DE ARBITRAJE Y ESCALAFÓN DEL ESTADO DE JALISCO EN TURNO');
  });

  it('nunca toma una frase suelta por órgano: prefiere el del encabezado', () => {
    expect(pickCourtDesignation(['ESTABLECIÓ QUE NEGAR EL PAGO DE LOS ALIMENTOS RETROACTIVOS', 'C. JUEZ DE LO FAMILIAR EN TURNO DEL ESTADO DE JALISCO.'])).toBe('C. JUEZ DE LO FAMILIAR EN TURNO DEL ESTADO DE JALISCO');
    expect(pickCourtDesignation(['ESTABLECIÓ QUE NEGAR EL PAGO'])).toBe('');
    const text = 'C. JUEZ DE LO FAMILIAR EN TURNO DEL ESTADO DE JALISCO.\nPRESENTE\nC. ANDREA FICTICIA SOTO, MEXICANA, MAYOR DE EDAD, POR MI PROPIO DERECHO, vengo a demandar.\nAUTORIDAD: ESTABLECIÓ QUE NEGAR EL PAGO DE LOS ALIMENTOS RETROACTIVOS QUE SE DEBEN EN VIRTUD DE LOS DEBERES DE PATERNIDAD.';
    expect(buildCaseDossier([source(text)]).court).toBe('JUEZ DE LO FAMILIAR EN TURNO DEL ESTADO DE JALISCO');
  });
});

describe('lugar de la ficha', () => {
  it.each([
    ['Zapopan, Jalisco, a 14 de octubre de 2026.', 'Zapopan, Jalisco'],
    ['LUGAR Y FECHA: GUADALAJARA, JALISCO, A 3 DE MARZO DE 2026', 'Guadalajara, Jalisco'],
    ['En la ciudad de Guadalajara, Jalisco, a veinte de septiembre de dos mil veinticinco.', 'Guadalajara, Jalisco'],
    ['SAN PEDRO TLAQUEPAQUE, JAL. A 5 DE MAYO DE 2026', 'San Pedro Tlaquepaque, Jalisco'],
    ['Ciudad de México, a 2 de enero de 2026', 'Ciudad de México'],
  ])('lee «%s»', (line, expected) => {
    const text = `ENCABEZADO DEL ESCRITO\n${'texto de relleno\n'.repeat(60)}${line}\nATENTAMENTE`;
    expect(extractCity(text)).toBe(expected);
  });

  it('no toma por lugar un domicilio, una tesis, una empresa ni nada del cuerpo', () => {
    const body = [
      'Contradicción de criterios 44/2023. Entre los sustentados por el Segundo Tribunal Colegiado, Nezahualcóyotl, Estado de México, a 12 de mayo.',
      'ES IMPORTANTE MANIFESTAR QUE LA FIRMA DEL CONTRATO SE LLEVO ACABO EN EL MUNICIPIO DE SAN PEDRO TLAQUEPAQUE, JALISCO. YA QUE 12 DE MAYO',
      'con domicilio en Calle Falsa 123, Zapopan, Jalisco, a 5 kilómetros del centro',
      'por la persona moral denominada, BBVA Bancomer, a 5 de enero',
    ];
    const filler = 'texto de relleno\n'.repeat(60);
    expect(extractCity(`${body[0]}\n${filler}fin`)).toBe('');
    expect(extractCity(`inicio\n${filler}${body[1]}\n${filler}fin`)).toBe('');
    expect(extractCity(`${body[2]}\n${filler}fin`)).toBe('');
    expect(extractCity(`${body[3]}\n${filler}fin`)).toBe('');
    expect(extractCity('Sin lugar alguno en este texto')).toBe('');
  });
});

describe('partes de un escrito de apertura', () => {
  it('reconoce el proemio en MAYÚSCULAS y con varios comparecientes («CC.»)', () => {
    expect(extractProemioCompareciente('C. ANDREA FICTICIA SOTO, MEXICANA, MAYOR DE EDAD, AL CORRIENTE EN SUS PAGOS')).toBe('ANDREA FICTICIA SOTO');
    expect(extractProemioCompareciente('CC. JOSE FICTICIO GONZALEZ Y JULIA FICTICIA IBARRA, MEXICANOS, MAYOR DE EDAD, CASADOS, POR NUESTRO PROPIO DERECHO')).toBe('JOSE FICTICIO GONZALEZ Y JULIA FICTICIA IBARRA');
    expect(extractProemioCompareciente('María Ficticia Pérez, mexicana, mayor de edad, por mi propio derecho')).toBe('María Ficticia Pérez');
  });

  it('una demanda sin verbo de apertura reconocible se reconoce por su estructura, y una contestación no', () => {
    const demanda = 'CC. JOSE FICTICIO, MEXICANO, MAYOR DE EDAD, POR MI PROPIO DERECHO\nE X P O N E R\nP R E S T A C I O N E S\nI.- La cancelación.\nH E C H O S\n1.- Uno.';
    expect(initiatesAction(demanda)).toBe(true);
    expect(initiatesAction(`${demanda}\nPor medio del presente vengo a dar contestación a la demanda.`)).toBe(false);
    expect(initiatesAction('venimos a demandar a la empresa ficticia')).toBe(true);
  });

  it('el actor de una demanda en MAYÚSCULAS llega a la ficha y «LA PERSONA MORAL» no es demandado', () => {
    const text = 'C. JUEZ DE LO CIVIL EN TURNO DEL ESTADO DE JALISCO.\nPRESENTE\nC. ANDREA FICTICIA SOTO, MEXICANA, MAYOR DE EDAD, POR MI PROPIO DERECHO, VENGO A DEMANDAR A LA PERSONA MORAL YA DESCRITA ANTERIORMENTE, POR LAS SIGUIENTES PRESTACIONES.';
    const ficha = detectCaseFicha([text]);
    expect(ficha.actor).toBe('ANDREA FICTICIA SOTO');
    expect(ficha.demandado).not.toMatch(/PERSONA MORAL/i);
    expect(buildCaseDossier([source(text)]).parties.map((party) => party.name)).toContain('ANDREA FICTICIA SOTO');
  });
});
