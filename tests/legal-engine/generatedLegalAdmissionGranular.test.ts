import { describe, expect, it } from 'vitest';
import { evaluateGeneratedLegalAdmission } from '@/lib/legal-engine/generatedLegalAdmission';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { hasSeedMarkers } from '@/lib/legal-engine/seedMarkers';

const document = () => createEmptyDocument({
  id: 'offline-granular', documentType: 'apelacion_civil', documentTypeLabel: 'Apelación civil',
  matter: 'civil', jurisdiction: 'local', flow: 'DOCUMENT_ANALYSIS',
});

const analyze = (input: {
  evidence?: Array<{ description: string; confirmed?: boolean }>;
  verifiedAuthorities?: any[];
  challenges?: Array<{ clientPosition?: { text: string }; requestedEffect?: { text: string } }>;
}) => ({
  evidence: input.evidence || [],
  verifiedAuthorities: input.verifiedAuthorities || [],
  richCaseAnalysis: input.challenges ? { draftingProjection: { challenges: input.challenges } } : undefined,
} as any);

const words = (value: string) => (value.match(/[\p{L}\p{N}]+/gu) || []).length;

describe('admisión granular: la unidad de admisión es la proposición, no la sección', () => {
  it('1. conserva 10 párrafos argumentativos y neutraliza sólo la proposición normativa no verificada', () => {
    const reasoning = [
      'De la resolución recurrida se advierte que no se pronunciaron los extremos_relative a la prueba documental.',
      'La parte apelante sostiene que dicha omisión afecta la plenitud de su derecho a defensa.',
      'El agravio se dirige contra la tercera consideración del fallo combatido.',
      'Esta contradicción resulta relevante porque incide en la resolución de la controversia.',
      'La valoración deberá considerar que constan actuaciones en autos que no fueron contestadas.',
      'En consecuencia, el pronunciamiento omite resolver una cuestión planteada de la controversia.',
      'Esta consideración causa agravio porque impide que la autoridad resuelva con base en autos completos.',
      'El expediente permite verificar que la cuestión fue efectivamente planteada.',
      'Por lo tanto, la resolución presenta una omisión que requiere corrección procesal.',
      'El agravio no se dirige contra el meritorio de la sentencia sino contra su integración.',
      'Conforme a lo dispuesto en el Código de Procedimientos Civiles del Estado de Jalisco, el recurso procede en el término legal.',
    ].join('\n\n');

    const result = evaluateGeneratedLegalAdmission({ text: reasoning, sectionType: 'argument', document: document() });

    const preserved = reasoning.split('\n\n').filter(paragraph => result.text.includes(paragraph.trim()));
    expect(preserved).toHaveLength(10);
    expect(result.text).not.toContain('el recurso procede en el término legal');
    expect(result.text).toContain('PENDIENTE DE DESARROLLO');
    expect(words(result.text)).toBeGreaterThan(60);
    expect(result.neutralizedCount).toBe(1);
    expect(result.admittedCount).toBeGreaterThanOrEqual(10);
    expect(result.rejectedWords).toBeLessThan(words(reasoning) / 2);
  });

  it('2. un agravio sin autoridad verificada conserva acto combatido, contradicción, razonamiento y afectación', () => {
    const agravio = [
      'AGRAVIO PRIMERO. La resolución recurrida omitió pronunciarse sobre la prueba documental presentada oportunamente por la parte apelante.',
      'De las constancias de autos se advierte que la documental fue ofrecida dentro del plazo correspondiente.',
      'La parte apelante sostiene que la autoridad no tuvo por considerar dicho medio de prueba al resolver.',
      'Existe incongruencia entre considerar la prueba en el procedimiento y omitir su valoración en la sentencia.',
      'Esta contradicción resulta relevante porque la resolución se emitió sin agotar la vía probatoria abierta.',
      'Por lo tanto, la resolución presenta una falta de exhaustividad respecto de una cuestión procesal relevante.',
    ].join('\n\n');

    const result = evaluateGeneratedLegalAdmission({ text: agravio, sectionType: 'argument', document: document() });

    expect(result.text).toContain('AGRAVIO PRIMERO');
    expect(result.text).toContain('incongruencia');
    expect(result.text).toContain('falta de exhaustividad');
    expect(result.text).toContain('constancias de autos');
    expect(result.text).not.toMatch(/\[PENDIENTE DE DESARROLLO[^\]]*candidato no admitido/);
    expect(result.fullyNeutralized).toBe(false);
  });

  it('3. una autoridad [NO VERIFICADO] no se afirma como regla y el resto del párrafo sobrevive', () => {
    const text = 'La parte apelante sostiene que existe un vicio de fondo. '
      + '[NO VERIFICADO: artículo 421 del Código de Procedimientos Civiles del Estado de Jalisco]. '
      + 'El agravio se dirige contra la interpretación que de esa disposición hizo la autoridad.';

    const result = evaluateGeneratedLegalAdmission({ text, sectionType: 'argument', document: document() });

    expect(result.text).toContain('La parte apelante sostiene que existe un vicio de fondo');
    expect(result.text).toContain('El agravio se dirige contra la interpretación');
    expect(result.text).toContain('PENDIENTE DE DESARROLLO');
    expect(result.proposals.some(proposal => proposal.kind === 'UNVERIFIED_LEGAL_PROPOSITION')).toBe(true);
  });

  it('4. una petición no soportada al final de 8 párrafos válidos no destruye el razonamiento previo', () => {
    const body = [
      'La parte apelante sostiene que la resolución combatida incurrió en incongruencia.',
      'De la resolución se advierte que no se resolvió el agravio relativo a la prueba documental.',
      'El expediente contiene la constancia de presentación oportuna de la documental.',
      'Esta omisión afecta el derecho a que la controversia se resuelva con base en autos completos.',
      'El agravio se dirige contra la consideración que omitió tal pronunciamiento.',
      'Por lo tanto, la sentencia presenta una inconsistencia interna verificable.',
      'La corrección correspondiente requiere que la autoridad emita el pronunciamiento omitido.',
      'Esta consecuencia se deriva necesariamente del estado procesal descrito.',
    ].join('\n\n');

    const result = evaluateGeneratedLegalAdmission({
      text: `${body}\n\nSe solicita condenar a la parte actora al pago de costas del juicio.`,
      sectionType: 'argument', document: document(),
    });

    const preserved = body.split('\n\n').filter(paragraph => result.text.includes(paragraph.trim()));
    expect(preserved).toHaveLength(8);
    expect(result.reasons).toContain('UNSUPPORTED_PETITION');
    expect(result.text).not.toContain('al pago de costas del juicio');
    expect(result.neutralizedCount).toBe(1);
  });

  it('5. una prueba testimonial inventada se neutraliza sin destruir la documental confirmada', () => {
    const analysis = analyze({ evidence: [{ description: 'Contrato de arrendamiento firmado el 3 de marzo de 2019', confirmed: true }] });
    const text = [
      'Se ofrece el contrato de arrendamiento firmado el 3 de marzo de 2019.',
      'Se ofrece testimonial a cargo de dos testigos de la parte actora.',
      'La parte apelante sostiene que la autoridad omitió ponderar dicha documental.',
    ].join('\n\n');

    const result = evaluateGeneratedLegalAdmission({ text, sectionType: 'evidence', document: document(), analysis });

    expect(result.reasons).toContain('UNCONFIRMED_EVIDENCE');
    expect(result.text).toContain('contrato de arrendamiento firmado el 3 de marzo de 2019');
    expect(result.text).toContain('La parte apelante sostiene que la autoridad omitió ponderar dicha documental');
    expect(result.text).not.toContain('testimonial a cargo de dos testigos');
  });

  it('6. el texto estructural y de razonamiento no exige coincidencia literal con proposition.text', () => {
    const text = [
      'Corresponde analizar la notificación de la resolución recurrida.',
      'La presente consideración se apoya en las constancias que obran en el expediente.',
      'De la resolución se advierte que la autoridad se pronunció únicamente sobre el expediente principal.',
    ].join('\n\n');

    const result = evaluateGeneratedLegalAdmission({ text, sectionType: 'argument', document: document() });

    expect(result.accepted).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.text).toBe(text);
    expect(result.proposals.map(proposal => proposal.kind)).toEqual([
      'STRUCTURAL_REASONING',
      'STRUCTURAL_REASONING',
      'FACTUAL_SOURCE',
    ]);
  });

  it('7. una afirmación normativa concreta sigue exigiendo soporte: no todo queda libre', () => {
    const text = 'El artículo 1234 del Código Civil dispone que la responsabilidad es objetiva.';

    const result = evaluateGeneratedLegalAdmission({ text, sectionType: 'argument', document: document() });

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain('UNVERIFIED_LEGAL_ASSERTION');
    expect(result.admittedCount).toBe(0);
    expect(hasSeedMarkers(result.text)).toBe(true);
  });
});
