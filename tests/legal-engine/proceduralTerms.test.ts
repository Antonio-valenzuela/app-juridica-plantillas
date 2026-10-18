import { describe, expect, it } from 'vitest';
import { computeProceduralTerm, PROCEDURAL_TERM_RULES, StatutoryCalendar, type OfficialSuspension, type ProceduralTermInput } from '@/lib/legal-engine/procedural-terms';

/** Calendarios sintéticos: las suspensiones son inventadas para la prueba, nunca datos de un órgano real. */
const confirmed = (suspensions: OfficialSuspension[] = []) => ({ suspensions, confirmedForPeriod: true, sourceDescription: 'Calendario sintético de prueba' });

const amparo = (overrides: Partial<ProceduralTermInput> & { notification: ProceduralTermInput['notification'] }): ProceduralTermInput => ({
  ruleId: 'AMPARO_RECURSO_REVISION', jurisdiction: 'federal', matter: 'civil', recipient: 'PARTICULAR', calendar: confirmed(), ...overrides,
});

describe('cómputo de términos — calendarios legales', () => {
  it('Ley de Amparo art. 19: fechas fijas inhábiles', () => {
    const calendar = new StatutoryCalendar('LEY_DE_AMPARO_ART_19');
    for (const date of ['2026-02-05', '2026-03-21', '2026-05-05', '2026-09-14', '2026-10-12', '2026-11-20']) {
      expect(calendar.nonWorkingReason(new Date(`${date}T12:00:00Z`)), date).toMatch(/art\. 19 LA/);
    }
    expect(calendar.isWorkingDay(new Date('2026-10-13T12:00:00Z'))).toBe(true);
  });

  it('LFT art. 74: lunes conmemorativos móviles y 1o. de octubre sexenal', () => {
    const calendar = new StatutoryCalendar('LFT_ARTS_74_715');
    expect(calendar.nonWorkingReason(new Date('2026-02-02T12:00:00Z'))).toMatch(/74-II/);
    expect(calendar.nonWorkingReason(new Date('2026-03-16T12:00:00Z'))).toMatch(/74-III/);
    expect(calendar.nonWorkingReason(new Date('2026-11-16T12:00:00Z'))).toMatch(/74-VI/);
    // El 20 de noviembre y el 5 de febrero no son inhábiles por sí mismos en la LFT.
    expect(calendar.isWorkingDay(new Date('2026-11-20T12:00:00Z'))).toBe(true);
    expect(calendar.isWorkingDay(new Date('2026-02-05T12:00:00Z'))).toBe(true);
    expect(calendar.nonWorkingReason(new Date('2030-10-01T12:00:00Z'))).toMatch(/74-VII/);
    expect(calendar.isWorkingDay(new Date('2026-10-01T12:00:00Z'))).toBe(true);
  });
});

describe('cómputo de términos — reglas verificadas', () => {
  it('notificación personal en viernes con lunes inhábil: surte el martes y corre desde el miércoles', () => {
    const result = computeProceduralTerm(amparo({ notification: { kind: 'PERSONAL', date: '2026-10-09', dateSource: 'cédula sintética' } }));
    expect(result.status).toBe('CALCULADO');
    expect(result.effectDate).toBe('2026-10-13');
    expect(result.firstDay).toBe('2026-10-14');
    expect(result.deadline).toBe('2026-10-27');
    expect(result.certainty).toBe('MEDIA'); // el surtimiento al día hábil siguiente es criterio de cómputo
    expect(result.steps.map((step) => step.description).join(' ')).toMatch(/cédula sintética/);
    expect(result.legalBasis.map((item) => item.article)).toEqual(expect.arrayContaining(['86', '19', '22', '31']));
  });

  it('feriado dentro del plazo: se descuenta el 20 de noviembre (autoridad, surte el mismo día)', () => {
    const result = computeProceduralTerm(amparo({ ruleId: 'AMPARO_RECURSO_QUEJA', recipient: 'AUTORIDAD', notification: { kind: 'OFICIO_AUTORIDAD', date: '2026-11-17' } }));
    expect(result.effectDate).toBe('2026-11-17');
    expect(result.deadline).toBe('2026-11-25');
    expect(result.certainty).toBe('ALTA');
    expect(result.calendarConsulted.nonWorkingDaysInRange).toEqual([{ date: '2026-11-20', reason: expect.stringMatching(/Veinte de noviembre/) }]);
  });

  it('suspensión oficial de labores: recorre el vencimiento y queda registrada', () => {
    const result = computeProceduralTerm(amparo({
      ruleId: 'AMPARO_RECURSO_QUEJA', recipient: 'AUTORIDAD', notification: { kind: 'OFICIO_AUTORIDAD', date: '2026-11-17' },
      calendar: confirmed([{ date: '2026-11-23', description: 'Suspensión sintética de prueba' }]),
    }));
    expect(result.deadline).toBe('2026-11-26');
    expect(result.calendarConsulted.suspensionsApplied).toHaveLength(1);
  });

  it('sin calendario de suspensiones confirmado: solo fecha provisional', () => {
    const result = computeProceduralTerm(amparo({ notification: { kind: 'PERSONAL', date: '2026-10-09' }, calendar: { suspensions: [], confirmedForPeriod: false } }));
    expect(result.status).toBe('REQUIERE_CONFIRMAR');
    expect(result.deadline).toBeNull();
    expect(result.provisionalDeadline).toBe('2026-10-27');
    expect(result.missing.join(' ')).toMatch(/calendario oficial de suspensiones/);
  });

  it('materias distintas, mismas fechas: amparo y laboral no comparten calendario', () => {
    const labor = computeProceduralTerm({
      ruleId: 'LABORAL_CONTESTACION_DEMANDA', jurisdiction: 'local', matter: 'laboral',
      notification: { kind: 'PERSONAL', date: '2026-11-09' }, calendar: confirmed(),
    });
    // LFT: inhábil el tercer lunes de noviembre (16), hábil el 20.
    expect(labor.effectDate).toBe('2026-11-09');
    expect(labor.deadline).toBe('2026-12-01');
    expect(labor.calendarConsulted.nonWorkingDaysInRange.map((item) => item.date)).toEqual(['2026-11-16']);

    const amparoSameDates = computeProceduralTerm(amparo({ ruleId: 'AMPARO_DEMANDA_PLAZO_GENERAL', notification: { kind: 'PERSONAL', date: '2026-11-09', effectDate: '2026-11-09' } }));
    // Ley de Amparo: hábil el 16, inhábil el 20.
    expect(amparoSameDates.calendarConsulted.nonWorkingDaysInRange.map((item) => item.date)).toEqual(['2026-11-20']);
    expect(amparoSameDates.deadline).toBe('2026-12-01');
  });

  it('publicación en boletín laboral en viernes: surte efectos el lunes hábil', () => {
    const result = computeProceduralTerm({
      ruleId: 'LABORAL_TERMINO_SUPLETORIO', jurisdiction: 'federal', matter: 'laboral',
      notification: { kind: 'BOLETIN_ESTRADOS', date: '2026-10-09' }, calendar: confirmed(),
    });
    expect(result.effectDate).toBe('2026-10-12'); // el 12 de octubre es hábil en la LFT
    expect(result.firstDay).toBe('2026-10-13');
    expect(result.deadline).toBe('2026-10-15');
    expect(result.certainty).toBe('MEDIA');
  });

  it('notificación fechada en fin de semana: advierte y no la trata como hábil', () => {
    const result = computeProceduralTerm(amparo({ recipient: 'AUTORIDAD', notification: { kind: 'OFICIO_AUTORIDAD', date: '2026-10-10' } }));
    expect(result.warnings[0]).toMatch(/día inhábil \(Sábado\)/);
    expect(result.firstDay).toBe('2026-10-13');
  });

  it('demanda de amparo: exige la fecha de surtimiento conforme a la ley del acto; con conocimiento del acto, calcula', () => {
    const missing = computeProceduralTerm(amparo({ ruleId: 'AMPARO_DEMANDA_PLAZO_GENERAL', notification: { kind: 'PERSONAL', date: '2026-10-05' } }));
    expect(missing.deadline).toBeNull();
    expect(missing.provisionalDeadline).toBeNull();
    expect(missing.missing.join(' ')).toMatch(/ley del acto/);

    const knowledge = computeProceduralTerm(amparo({ ruleId: 'AMPARO_DEMANDA_PLAZO_GENERAL', notification: { kind: 'CONOCIMIENTO_DEL_ACTO', date: '2026-10-05' } }));
    expect(knowledge.firstDay).toBe('2026-10-06');
    expect(knowledge.deadline).toBe('2026-10-27'); // 15 hábiles descontando el 12 de octubre
    expect(knowledge.warnings.join(' ')).toMatch(/autoaplicativa/);
  });

  it('versión temporal: advierte si la notificación es anterior a la última reforma de los artículos', () => {
    const result = computeProceduralTerm(amparo({ notification: { kind: 'PERSONAL', date: '2024-06-03' } }));
    expect(result.warnings[0]).toMatch(/anterior a la última reforma/);
  });
});

describe('cómputo de términos — no inventa la fecha límite', () => {
  it('fecha faltante', () => {
    const result = computeProceduralTerm(amparo({ notification: { kind: 'PERSONAL' } }));
    expect(result).toMatchObject({ status: 'REQUIERE_CONFIRMAR', deadline: null, provisionalDeadline: null });
    expect(result.missing).toEqual(['Fecha de la notificación (o del conocimiento del acto) y su fuente.']);
  });

  it('jurisdicción y materia faltantes o incompatibles', () => {
    expect(computeProceduralTerm({ ruleId: 'AMPARO_RECURSO_REVISION', notification: { kind: 'PERSONAL', date: '2026-10-09' } }).missing).toHaveLength(2);
    expect(computeProceduralTerm({ ruleId: 'LABORAL_CONTESTACION_DEMANDA', jurisdiction: 'local', matter: 'civil', notification: { kind: 'PERSONAL', date: '2026-10-09' } }).missing[0]).toMatch(/no aplica a la materia civil/);
    expect(computeProceduralTerm(amparo({ matter: 'penal', notification: { kind: 'PERSONAL', date: '2026-10-09' } })).missing[0]).toMatch(/momento a momento/);
  });

  it('regla civil/familiar de Jalisco sin cotejar: explica el Código Nacional y no calcula', () => {
    const result = computeProceduralTerm({ ruleId: 'CIVIL_FAMILIAR_JALISCO', jurisdiction: 'local', matter: 'familiar', notification: { kind: 'PERSONAL', date: '2026-10-09' }, calendar: confirmed() });
    expect(result.deadline).toBeNull();
    expect(result.provisionalDeadline).toBeNull();
    expect(result.missing[0]).toMatch(/Código Nacional de Procedimientos Civiles y Familiares/);
  });

  it('buzón electrónico laboral («en dos días») exige la fecha de surtimiento', () => {
    const result = computeProceduralTerm({ ruleId: 'LABORAL_TERMINO_SUPLETORIO', jurisdiction: 'federal', matter: 'laboral', notification: { kind: 'BUZON_ELECTRONICO', date: '2026-10-09' }, calendar: confirmed() });
    expect(result.deadline).toBeNull();
    expect(result.missing[0]).toMatch(/747-III/);
  });

  it('regla desconocida y fechas inválidas', () => {
    expect(computeProceduralTerm({ ruleId: 'NO_EXISTE', notification: {} }).missing[0]).toMatch(/desconocida/);
    expect(computeProceduralTerm(amparo({ notification: { kind: 'PERSONAL', date: '2026-02-30' } })).missing[0]).toMatch(/inexistente/);
  });

  it('toda regla que calcula está cotejada con texto oficial y fundamento enlazado', () => {
    for (const rule of PROCEDURAL_TERM_RULES) {
      if (rule.verification.status !== 'VERIFIED_OFFICIAL_TEXT') {
        expect(rule.days, rule.id).toBeNull();
        continue;
      }
      expect(rule.days, rule.id).toBeGreaterThan(0);
      expect(rule.legalBasis.length, rule.id).toBeGreaterThan(0);
      for (const basis of rule.legalBasis) {
        expect(basis.officialUrl, rule.id).toMatch(/^https:\/\/www\.diputados\.gob\.mx\/LeyesBiblio\/pdf\//);
        expect(basis.excerpt.length, rule.id).toBeGreaterThan(20);
      }
    }
  });
});
