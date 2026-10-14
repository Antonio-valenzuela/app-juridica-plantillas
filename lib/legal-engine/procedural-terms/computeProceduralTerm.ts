import { addDays, CALENDAR_LABELS, parseIsoDate, StatutoryCalendar, toIsoDate } from './calendars';
import { findProceduralTermRule, PROCEDURAL_TERMS_ENGINE_VERSION } from './rules';
import type { NonWorkingDay, ProceduralTermInput, ProceduralTermResult, ProceduralTermRule, TermStep } from './types';

export const PROCEDURAL_TERM_DISCLAIMER =
  'Cálculo determinista de apoyo. El abogado debe confirmar la fecha y forma en que surtió efectos la notificación, el calendario oficial del órgano y cualquier circunstancia excepcional (habilitación de días, ampliación por distancia, suspensiones posteriores) antes de usar la fecha.';

const NOTIFICATION_LABELS: Record<string, string> = {
  PERSONAL: 'notificación personal',
  LISTA: 'notificación por lista',
  BOLETIN_ESTRADOS: 'publicación en boletín o estrados',
  ELECTRONICA_CONSULTA: 'notificación electrónica (constancia de consulta)',
  BUZON_ELECTRONICO: 'notificación al buzón electrónico',
  OFICIO_AUTORIDAD: 'oficio a autoridad',
  CONOCIMIENTO_DEL_ACTO: 'conocimiento del acto',
};

const formatLong = (iso: string) => new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parseIsoDate(iso));

interface EffectResolution {
  effect: Date | null;
  description?: string;
  /** El surtimiento se resolvió con un criterio de cómputo (no con el texto literal). */
  interpretive: boolean;
  missing: string[];
  warnings: string[];
}

function resolveEffect(rule: ProceduralTermRule, input: ProceduralTermInput, notification: Date, calendar: StatutoryCalendar): EffectResolution {
  const { kind, effectDate } = input.notification;
  const warnings: string[] = [];
  if (effectDate) {
    const effect = parseIsoDate(effectDate);
    if (effect < notification) return { effect: null, interpretive: false, missing: ['La fecha de surtimiento no puede ser anterior a la de notificación.'], warnings };
    return { effect, description: 'Fecha de surtimiento de efectos indicada por el abogado.', interpretive: false, missing: [], warnings };
  }
  if (!kind) return { effect: null, interpretive: false, missing: ['Tipo de notificación (personal, lista, boletín, electrónica…).'], warnings };

  switch (rule.effectRule) {
    case 'LEY_DEL_ACTO':
      if (kind === 'CONOCIMIENTO_DEL_ACTO') {
        return { effect: notification, description: 'Art. 18 LA: el plazo corre a partir del día siguiente a aquel en que se tuvo conocimiento del acto.', interpretive: false, missing: [], warnings };
      }
      return {
        effect: null,
        interpretive: false,
        missing: ['Fecha en que surtió efectos la notificación conforme a la ley del acto (art. 18 de la Ley de Amparo): indícala en «Fecha de surtimiento».'],
        warnings,
      };
    case 'LEY_DE_AMPARO_ART_31': {
      if (!input.recipient) return { effect: null, interpretive: false, missing: ['Quién recibe la notificación: particular o autoridad (art. 31 LA).'], warnings };
      if (input.recipient === 'AUTORIDAD') {
        warnings.push('Si el oficio se envió por correo, surte efectos en la fecha del acuse de recibo (art. 31-I LA): verifica esa fecha.');
        return { effect: notification, description: 'Art. 31-I LA: para la autoridad surte efectos desde que quedó legalmente hecha.', interpretive: false, missing: [], warnings };
      }
      if (kind === 'ELECTRONICA_CONSULTA') {
        return { effect: notification, description: 'Art. 31-III LA: surte efectos cuando se genera la constancia de consulta.', interpretive: false, missing: [], warnings };
      }
      if (kind === 'PERSONAL' || kind === 'LISTA') {
        const effect = calendar.nextWorkingDay(notification);
        return {
          effect,
          description: 'Art. 31-II LA: surte efectos desde el día siguiente al de la notificación; se tomó el día hábil siguiente (criterio de cómputo a confirmar).',
          interpretive: !calendar.isWorkingDay(addDays(notification, 1)),
          missing: [],
          warnings,
        };
      }
      return { effect: null, interpretive: false, missing: [`La ${NOTIFICATION_LABELS[kind]} no está prevista en el art. 31 LA: indica la fecha de surtimiento.`], warnings };
    }
    case 'LFT_ART_747':
      if (kind === 'PERSONAL') {
        return { effect: notification, description: 'Art. 747-I LFT: la notificación personal surte efectos el día y hora en que se practica.', interpretive: false, missing: [], warnings };
      }
      if (kind === 'ELECTRONICA_CONSULTA') {
        return { effect: notification, description: 'Art. 747-IV LFT: surte efectos cuando se genera la constancia de consulta.', interpretive: false, missing: [], warnings };
      }
      if (kind === 'BOLETIN_ESTRADOS' || kind === 'LISTA') {
        const effect = calendar.nextWorkingDay(notification);
        return {
          effect,
          description: 'Art. 747-II LFT: surte efectos al día siguiente al de su publicación; se tomó el día hábil siguiente (criterio de cómputo a confirmar).',
          interpretive: !calendar.isWorkingDay(addDays(notification, 1)),
          missing: [],
          warnings,
        };
      }
      if (kind === 'BUZON_ELECTRONICO') {
        return { effect: null, interpretive: false, missing: ['Art. 747-III LFT («en dos días»): indica la fecha en que surtió efectos la notificación al buzón.'], warnings };
      }
      return { effect: null, interpretive: false, missing: [`La ${NOTIFICATION_LABELS[kind]} no está prevista en el art. 747 LFT: indica la fecha de surtimiento.`], warnings };
    default:
      return { effect: null, interpretive: false, missing: ['La regla no define cómo surte efectos la notificación.'], warnings };
  }
}

function emptyResult(input: ProceduralTermInput, rule: ProceduralTermRule | undefined, missing: string[], warnings: string[] = []): ProceduralTermResult {
  return {
    status: 'REQUIERE_CONFIRMAR',
    engineVersion: PROCEDURAL_TERMS_ENGINE_VERSION,
    ruleId: input.ruleId,
    ruleVersion: rule?.version ?? null,
    ruleLabel: rule?.label ?? null,
    deadline: null,
    provisionalDeadline: null,
    notificationDate: input.notification.date ?? null,
    effectDate: null,
    firstDay: null,
    certainty: 'REQUIERE_CONFIRMAR',
    missing,
    warnings,
    steps: [],
    legalBasis: rule?.legalBasis ?? [],
    calendarConsulted: { id: rule?.calendarId ?? null, label: rule?.calendarId ? CALENDAR_LABELS[rule.calendarId] : null, nonWorkingDaysInRange: [], suspensionsApplied: [], confirmedForPeriod: Boolean(input.calendar?.confirmedForPeriod) },
    officialLinks: [...new Set((rule?.legalBasis ?? []).map((item) => item.officialUrl))],
    disclaimer: PROCEDURAL_TERM_DISCLAIMER,
  };
}

/** Calcula un término procesal con una regla verificada; si falta un dato esencial, no inventa la fecha. */
export function computeProceduralTerm(input: ProceduralTermInput): ProceduralTermResult {
  const rule = findProceduralTermRule(input.ruleId);
  if (!rule) return emptyResult(input, undefined, [`Regla de cómputo desconocida: «${input.ruleId}».`]);

  if (rule.verification.status !== 'VERIFIED_OFFICIAL_TEXT' || !rule.days || !rule.calendarId || !rule.effectRule) {
    return emptyResult(input, rule, [rule.verification.note || 'La regla no está cotejada con el texto oficial vigente; no se calcula una fecha.']);
  }

  const missing: string[] = [];
  if (!input.jurisdiction) missing.push('Jurisdicción (federal o local).');
  else if (!rule.jurisdictions.includes(input.jurisdiction)) missing.push(`La regla «${rule.label}» no aplica a la jurisdicción ${input.jurisdiction}.`);
  if (!input.matter) missing.push('Materia del asunto.');
  else if (input.matter === 'penal') missing.push('En materia penal los plazos se computan de momento a momento (art. 22 LA): este motor no los calcula.');
  else if (!rule.matters.includes(input.matter)) missing.push(`La regla «${rule.label}» no aplica a la materia ${input.matter}.`);
  if (!input.notification.date) missing.push('Fecha de la notificación (o del conocimiento del acto) y su fuente.');
  if (missing.length) return emptyResult(input, rule, missing);

  let notification: Date;
  try {
    notification = parseIsoDate(input.notification.date!);
    if (input.notification.effectDate) parseIsoDate(input.notification.effectDate);
    (input.calendar?.suspensions ?? []).forEach((item) => parseIsoDate(item.date));
  } catch (error) {
    return emptyResult(input, rule, [error instanceof Error ? error.message : 'Fecha inválida.']);
  }

  const calendar = new StatutoryCalendar(rule.calendarId, input.calendar?.suspensions ?? []);
  const warnings: string[] = [...rule.exceptionsNotCovered.map((item) => `No cubierto por esta regla: ${item}`)];
  if (rule.articlesLastReformedDof && input.notification.date! < rule.articlesLastReformedDof) {
    warnings.unshift(`La notificación es anterior a la última reforma de los artículos citados (DOF ${rule.articlesLastReformedDof}): confirma la versión de la ley aplicable al asunto.`);
  }
  const notificationReason = calendar.nonWorkingReason(notification);
  if (notificationReason && input.notification.kind !== 'CONOCIMIENTO_DEL_ACTO') {
    warnings.unshift(`La fecha de notificación cae en día inhábil (${notificationReason}): verifica su validez y la fecha en que debe tenerse por hecha.`);
  }
  if (rule.calendarId === 'LFT_ARTS_74_715') {
    warnings.push('Agrega como suspensiones los festivos del calendario oficial del tribunal y, en su caso, el día de jornada electoral (arts. 74-IX y 715 LFT).');
  }

  const effect = resolveEffect(rule, input, notification, calendar);
  warnings.push(...effect.warnings);
  if (!effect.effect) return emptyResult(input, rule, effect.missing, warnings);

  const steps: TermStep[] = [];
  const kindLabel = input.notification.kind ? NOTIFICATION_LABELS[input.notification.kind] : 'notificación';
  steps.push({ order: 1, date: toIsoDate(notification), description: `Fecha de ${kindLabel}${input.notification.dateSource ? ` (fuente: ${input.notification.dateSource})` : ''}: ${formatLong(toIsoDate(notification))}.` });
  steps.push({ order: 2, date: toIsoDate(effect.effect), description: `Surte efectos: ${formatLong(toIsoDate(effect.effect))}. ${effect.description ?? ''}`.trim() });

  const firstDay = calendar.nextWorkingDay(effect.effect);
  steps.push({ order: 3, date: toIsoDate(firstDay), description: `El término corre a partir del día hábil siguiente al surtimiento: día 1 = ${formatLong(toIsoDate(firstDay))}.` });

  let current = firstDay;
  for (let counted = 1; counted < rule.days; counted += 1) current = calendar.nextWorkingDay(current);
  const deadline = toIsoDate(current);

  const nonWorkingDaysInRange: NonWorkingDay[] = [];
  for (let day = addDays(notification, 1); day <= current; day = addDays(day, 1)) {
    const reason = calendar.nonWorkingReason(day);
    if (reason && reason !== 'Sábado' && reason !== 'Domingo') nonWorkingDaysInRange.push({ date: toIsoDate(day), reason });
  }
  const skippedLabel = nonWorkingDaysInRange.length ? ` Se descontaron además de sábados y domingos: ${nonWorkingDaysInRange.map((item) => `${item.date} (${item.reason})`).join('; ')}.` : ' Solo se descontaron sábados y domingos.';
  steps.push({ order: 4, date: deadline, description: `Se cuentan ${rule.days} días hábiles, incluido el del vencimiento.${skippedLabel}` });
  steps.push({ order: 5, date: deadline, description: `Vence: ${formatLong(deadline)}.` });

  const suspensionsApplied = calendar.appliedSuspensions(notification, current);
  const confirmed = Boolean(input.calendar?.confirmedForPeriod);
  const base = {
    engineVersion: PROCEDURAL_TERMS_ENGINE_VERSION,
    ruleId: rule.id,
    ruleVersion: rule.version,
    ruleLabel: rule.label,
    notificationDate: toIsoDate(notification),
    effectDate: toIsoDate(effect.effect),
    firstDay: toIsoDate(firstDay),
    warnings,
    steps,
    legalBasis: rule.legalBasis,
    calendarConsulted: {
      id: rule.calendarId,
      label: CALENDAR_LABELS[rule.calendarId],
      nonWorkingDaysInRange,
      suspensionsApplied,
      confirmedForPeriod: confirmed,
      sourceDescription: input.calendar?.sourceDescription,
    },
    officialLinks: [...new Set(rule.legalBasis.map((item) => item.officialUrl))],
    disclaimer: PROCEDURAL_TERM_DISCLAIMER,
  };

  if (!confirmed) {
    return {
      ...base,
      status: 'REQUIERE_CONFIRMAR',
      deadline: null,
      provisionalDeadline: deadline,
      certainty: 'REQUIERE_CONFIRMAR',
      missing: [`Confirmar el calendario oficial de suspensiones de labores del órgano del ${toIsoDate(notification)} al ${deadline}: una suspensión no capturada mueve la fecha.`],
    };
  }
  return { ...base, status: 'CALCULADO', deadline, provisionalDeadline: null, certainty: effect.interpretive ? 'MEDIA' : 'ALTA', missing: [] };
}
