import { describe, expect, it } from 'vitest';
import { deduplicateNewContent, paragraphSimilarity } from '@/lib/legal-engine/generationExtension';

describe('DEDUPLICACIÓN SEMÁNTICA DE CONTENIDO FORENSE (deduplicateNewContent)', () => {
  it('Caso A: Mismo párrafo exacto o con variación trivial de puntuación/espacios es detectado y eliminado', () => {
    const existingText = [
      'El Tribunal Colegiado de Circuito incurrió en una indebida motivación al declarar inoperantes los conceptos de violación.',
      'Dicha determinación conculca de manera flagrante los artículos 14 y 17 de la Constitución Política de los Estados Unidos Mexicanos.',
    ].join('\n\n');

    // Párrafo con variación mínima de espacios y mayúsculas/acentos
    const incomingText = 'Dicha determinacion conculca de manera flagrante los articulos 14 y 17 de la Constitucion Politica de los Estados Unidos Mexicanos.';

    const result = deduplicateNewContent(existingText, incomingText);

    expect(result.removedParagraphs).toBe(1);
    expect(result.isDuplicate).toBe(true);
    expect(result.cleanText).toBe('');
  });

  it('Caso B: Párrafo semánticamente cuasi-idéntico (>75% similitud de 3-shingles) es eliminado', () => {
    const existingText = 'La notificación por lista practicada por el actuario adscrito al juzgado de distrito no satisface los estándares constitucionales de certidumbre procesal y tutela judicial efectiva previstos en el artículo 17 de la Constitución General de la República.';

    // Cuasi-idéntico con alteración menor de una palabra ("satisface" -> "cumple") en un párrafo forense
    const incomingText = 'La notificación por lista practicada por el actuario adscrito al juzgado de distrito no cumple los estándares constitucionales de certidumbre procesal y tutela judicial efectiva previstos en el artículo 17 de la Constitución General de la República.';

    const sim = paragraphSimilarity(existingText, incomingText);
    expect(sim).toBeGreaterThanOrEqual(0.75);

    const result = deduplicateNewContent(existingText, incomingText);
    expect(result.removedParagraphs).toBe(1);
    expect(result.isDuplicate).toBe(true);
    expect(result.cleanText).toBe('');
  });

  it('Caso C: Misma cita jurisprudencial pero diferente subsunción jurídica es CONSERVADO (no falso positivo)', () => {
    const authorityCitation = 'Tesis: 2a./J. 48/2016 (10a.), Semanario Judicial de la Federación, Décima Época, Registro digital: 2011580, de rubro: AMPARO DIRECTO EN REVISIÓN. LA OMISIÓN DE ESTUDIO DEL TRIBUNAL COLEGIADO JUSTIFICA LA PROCEDENCIA.';

    const existingText = [
      authorityCitation,
      'En el presente caso, la citada jurisprudencia resulta plenamente aplicable en favor del promovente porque el órgano de control constitucional omitió pronunciarse sobre el planteamiento formulado en el segundo concepto de violación relativo a la estabilidad en el empleo del trabajador de confianza.',
      'Dicha omisión genera indefensión absoluta y trasciende al resultado del fallo en contravención al principio de exhaustividad.',
    ].join(' ');

    const incomingText = [
      authorityCitation,
      'Asimismo, la Segunda Sala ha dejado establecido que esta misma tesis vincula a la Suprema Corte a reasumir jurisdicción plena cuando la omisión verse sobre derechos fundamentales sustantivos, debiendo fijar el alcance interpretativo de la norma constitucional controvertida sin devolver los autos al Colegiado.',
      'Por lo tanto, este Alto Tribunal debe entrar al análisis de fondo del precepto legal impugnado y revocar la sentencia recurrida.',
    ].join(' ');

    const result = deduplicateNewContent(existingText, incomingText);

    expect(result.removedParagraphs).toBe(0);
    expect(result.isDuplicate).toBe(false);
    expect(result.cleanText.length).toBeGreaterThan(150);
    expect(result.cleanText).toContain('Asimismo, la Segunda Sala ha dejado establecido');
  });

  it('Caso D: Misma frase legal introductoria ("Por lo expuesto y fundado...") pero diferente argumento es CONSERVADO', () => {
    const existingText = 'Por lo expuesto y fundado, a este H. Tribunal atentamente pido se sirva tener por acreditada la existencia de violaciones procesales graves durante la sustanciación de la audiencia constitucional.';

    const incomingText = 'Por lo expuesto y fundado, a este H. Tribunal atentamente pido se sirva revocar la resolución recurrida y ordenar la reposición inmediata del procedimiento laboral a efecto de desahogar la prueba pericial médica omitida.';

    const result = deduplicateNewContent(existingText, incomingText);

    expect(result.removedParagraphs).toBe(0);
    expect(result.isDuplicate).toBe(false);
    expect(result.cleanText).toContain('revocar la resolución recurrida y ordenar la reposición');
  });
});
