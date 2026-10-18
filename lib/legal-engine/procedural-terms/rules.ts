import type { LegalBasisRef, ProceduralTermRule } from './types';

/**
 * Catálogo versionado de reglas de cómputo.
 *
 * Solo las reglas con `VERIFIED_OFFICIAL_TEXT` producen fechas. Los extractos se cotejaron el
 * 2026-10-13 contra los PDF oficiales de la Cámara de Diputados:
 *   - Ley de Amparo: «Última reforma publicada DOF 16-10-2025».
 *   - Ley Federal del Trabajo: «Última reforma publicada 14-05-2026».
 * Si cambia el texto oficial, actualiza el extracto, la fecha y sube `version`.
 */

export const PROCEDURAL_TERMS_ENGINE_VERSION = '1.0.0';
export const RULES_VERIFIED_AT = '2026-10-13';

const LAMP_URL = 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAmp.pdf';
const LAMP_REFORM = '2025-10-16';
const LFT_URL = 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf';
const LFT_REFORM = '2026-05-14';

const lamp = (article: string, excerpt: string): LegalBasisRef => ({ law: 'Ley de Amparo', article, excerpt, officialUrl: LAMP_URL, lawLastReformDof: LAMP_REFORM });
const lft = (article: string, excerpt: string): LegalBasisRef => ({ law: 'Ley Federal del Trabajo', article, excerpt, officialUrl: LFT_URL, lawLastReformDof: LFT_REFORM });

const LAMP_19 = lamp('19', 'Son días hábiles […] todos los del año, con excepción de los sábados y domingos, uno de enero, cinco de febrero, veintiuno de marzo, uno y cinco de mayo, catorce y dieciséis de septiembre, doce de octubre, veinte de noviembre y veinticinco de diciembre, así como aquellos en que se suspendan las labores en el órgano jurisdiccional […]');
const LAMP_22 = lamp('22', 'Los plazos se contarán por días hábiles, comenzarán a correr a partir del día siguiente al en que surta sus efectos la notificación y se incluirá en ellos el del vencimiento […] salvo en materia penal, en donde se computarán de momento a momento.');
const LAMP_31 = lamp('31', 'I. Las que correspondan a las autoridades responsables […] desde el momento en que hayan quedado legalmente hechas. […] II. Las demás, desde el día siguiente al de la notificación personal o al de la fijación y publicación de la lista […] III. Las realizadas por vía electrónica cuando se genere la constancia de la consulta realizada […]');

const LFT_715 = lft('715', 'Son días hábiles todos los del año con excepción de los sábados y domingos, los de descanso obligatorio, los festivos que señale el calendario oficial y aquéllos en que las autoridades laborales […] suspendan sus labores.');
const LFT_733 = lft('733', 'Los términos comenzarán a correr el día siguiente al en que surta efecto la notificación y se contará en ellos el día del vencimiento.');
const LFT_734 = lft('734', 'En los términos no se computarán los días en que el Tribunal deje de actuar conforme al calendario de labores aprobado por el Pleno, así como cuando por caso fortuito o de fuerza mayor no puedan llevarse a cabo actuaciones.');
const LFT_747 = lft('747', 'I. Las personales: el día y hora en que se practiquen […] II. Las demás; al día siguiente al de su publicación en el Boletín, o en la lista que se publique en los estrados del Tribunal; III. En dos días las que se realicen al buzón electrónico […]');
const LFT_74 = lft('74', 'Son días de descanso obligatorio: I. El 1o. de enero; II. El primer lunes de febrero […]; III. El tercer lunes de marzo […]; IV. El 1o. de mayo; V. El 16 de septiembre; VI. El tercer lunes de noviembre […]; VII. El 1o. de octubre de cada seis años […]; VIII. El 25 de diciembre, y IX. El que determinen las leyes federales y locales electorales […]');

const verified = (source: string) => ({ status: 'VERIFIED_OFFICIAL_TEXT' as const, verifiedAt: RULES_VERIFIED_AT, source });

const AMPARO_COMMON = { jurisdictions: ['federal', 'local'] as const, dayKind: 'HABILES' as const, includesExpiryDay: true, calendarId: 'LEY_DE_AMPARO_ART_19' as const };

export const PROCEDURAL_TERM_RULES: readonly ProceduralTermRule[] = [
  {
    id: 'AMPARO_DEMANDA_PLAZO_GENERAL',
    version: 1,
    label: 'Demanda de amparo — plazo genérico (15 días)',
    ...AMPARO_COMMON,
    jurisdictions: [...AMPARO_COMMON.jurisdictions],
    matters: ['amparo', 'civil', 'familiar', 'mercantil', 'laboral', 'administrativa'],
    procedure: 'Juicio de amparo (directo o indirecto)',
    triggeringAct: 'Notificación del acto reclamado conforme a la ley del acto, o conocimiento del acto',
    days: 15,
    effectRule: 'LEY_DEL_ACTO',
    legalBasis: [
      lamp('17', 'El plazo para presentar la demanda de amparo es de quince días, salvo: […]'),
      lamp('18', 'Los plazos […] se computarán a partir del día siguiente a aquél en que surta efectos, conforme a la ley del acto, la notificación […] o a aquella en que haya tenido conocimiento o se ostente sabedora del acto reclamado […]'),
      LAMP_19,
      LAMP_22,
    ],
    verification: verified('Ley de Amparo, texto vigente (Cámara de Diputados)'),
    articlesLastReformedDof: '2025-03-13',
    exceptionsNotCovered: [
      'Norma general autoaplicativa o extradición: 30 días desde la entrada en vigor (art. 17-I).',
      'Sentencia penal condenatoria con pena de prisión: hasta ocho años (art. 17-II).',
      'Demás excepciones del art. 17 (núcleos de población, actos de privación de libertad, etc.).',
      'Materia penal: el cómputo es de momento a momento (art. 22).',
    ],
  },
  {
    id: 'AMPARO_RECURSO_REVISION',
    version: 1,
    label: 'Recurso de revisión en amparo (10 días)',
    ...AMPARO_COMMON,
    jurisdictions: [...AMPARO_COMMON.jurisdictions],
    matters: ['amparo', 'civil', 'familiar', 'mercantil', 'laboral', 'administrativa'],
    procedure: 'Juicio de amparo',
    triggeringAct: 'Notificación de la resolución recurrida',
    days: 10,
    effectRule: 'LEY_DE_AMPARO_ART_31',
    legalBasis: [lamp('86', 'El recurso de revisión se interpondrá en el plazo de diez días por conducto del órgano jurisdiccional que haya dictado la resolución recurrida.'), LAMP_19, LAMP_22, LAMP_31],
    verification: verified('Ley de Amparo, texto vigente (Cámara de Diputados)'),
    articlesLastReformedDof: '2025-03-13',
    exceptionsNotCovered: ['Revisión adhesiva y plazos especiales de autoridades.', 'Materia penal: cómputo de momento a momento (art. 22).'],
  },
  {
    id: 'AMPARO_RECURSO_QUEJA',
    version: 1,
    label: 'Recurso de queja en amparo — regla general (5 días)',
    ...AMPARO_COMMON,
    jurisdictions: [...AMPARO_COMMON.jurisdictions],
    matters: ['amparo', 'civil', 'familiar', 'mercantil', 'laboral', 'administrativa'],
    procedure: 'Juicio de amparo',
    triggeringAct: 'Notificación de la resolución recurrida',
    days: 5,
    effectRule: 'LEY_DE_AMPARO_ART_31',
    legalBasis: [lamp('98', 'El plazo para la interposición del recurso de queja es de cinco días, con las excepciones siguientes: I. De dos días hábiles, cuando se trate de suspensión de plano o provisional; y II. En cualquier tiempo, cuando se omita tramitar la demanda de amparo.'), LAMP_19, LAMP_22, LAMP_31],
    verification: verified('Ley de Amparo, texto vigente (Cámara de Diputados)'),
    articlesLastReformedDof: '2025-03-13',
    exceptionsNotCovered: ['Suspensión de plano o provisional: 2 días (art. 98-I) — usa la regla específica.', 'Omisión de tramitar la demanda: en cualquier tiempo (art. 98-II).'],
  },
  {
    id: 'AMPARO_QUEJA_SUSPENSION_PROVISIONAL',
    version: 1,
    label: 'Queja contra suspensión de plano o provisional (2 días)',
    ...AMPARO_COMMON,
    jurisdictions: [...AMPARO_COMMON.jurisdictions],
    matters: ['amparo', 'civil', 'familiar', 'mercantil', 'laboral', 'administrativa'],
    procedure: 'Juicio de amparo — incidente de suspensión',
    triggeringAct: 'Notificación del acuerdo sobre la suspensión de plano o provisional',
    days: 2,
    effectRule: 'LEY_DE_AMPARO_ART_31',
    legalBasis: [lamp('98', 'I. De dos días hábiles, cuando se trate de suspensión de plano o provisional […]'), LAMP_19, LAMP_22, LAMP_31],
    verification: verified('Ley de Amparo, texto vigente (Cámara de Diputados)'),
    articlesLastReformedDof: '2025-03-13',
    exceptionsNotCovered: ['Materia penal: cómputo de momento a momento (art. 22).'],
  },
  {
    id: 'AMPARO_RECURSO_RECLAMACION',
    version: 1,
    label: 'Recurso de reclamación en amparo (3 días)',
    ...AMPARO_COMMON,
    jurisdictions: ['federal'],
    matters: ['amparo', 'civil', 'familiar', 'mercantil', 'laboral', 'administrativa'],
    procedure: 'Juicio de amparo ante SCJN o tribunal colegiado',
    triggeringAct: 'Notificación del acuerdo de trámite de la presidencia',
    days: 3,
    effectRule: 'LEY_DE_AMPARO_ART_31',
    legalBasis: [lamp('104', '[…] dentro del término de tres días siguientes al en que surta sus efectos la notificación de la resolución impugnada.'), LAMP_19, LAMP_22, LAMP_31],
    verification: verified('Ley de Amparo, texto vigente (Cámara de Diputados)'),
    articlesLastReformedDof: '2025-03-13',
    exceptionsNotCovered: ['Materia penal: cómputo de momento a momento (art. 22).'],
  },
  {
    id: 'LABORAL_CONTESTACION_DEMANDA',
    version: 1,
    label: 'Contestación de demanda laboral (15 días)',
    jurisdictions: ['federal', 'local'],
    matters: ['laboral'],
    procedure: 'Procedimiento ordinario laboral ante Tribunal (reforma DOF 01-05-2019)',
    triggeringAct: 'Emplazamiento con el auto admisorio y la demanda',
    days: 15,
    dayKind: 'HABILES',
    includesExpiryDay: true,
    calendarId: 'LFT_ARTS_74_715',
    effectRule: 'LFT_ART_747',
    legalBasis: [
      lft('873-A', '[…] para que produzca su contestación por escrito dentro de los quince días siguientes, ofrezca pruebas y de ser el caso reconvenga […]'),
      LFT_733,
      LFT_734,
      LFT_715,
      LFT_74,
      LFT_747,
    ],
    verification: verified('Ley Federal del Trabajo, texto vigente (Cámara de Diputados)'),
    articlesLastReformedDof: '2019-05-01',
    exceptionsNotCovered: [
      'Asuntos ante Juntas de Conciliación y Arbitraje anteriores a la reforma de 2019 (régimen transitorio).',
      'Ampliación por distancia (art. 737).',
      'Día de jornada electoral (art. 74-IX) y festivos del calendario oficial del tribunal (art. 715).',
    ],
  },
  {
    id: 'LABORAL_TERMINO_SUPLETORIO',
    version: 1,
    label: 'Acto procesal laboral sin término fijado (3 días)',
    jurisdictions: ['federal', 'local'],
    matters: ['laboral'],
    procedure: 'Procedimiento laboral',
    triggeringAct: 'Notificación del acuerdo que ordena el acto',
    days: 3,
    dayKind: 'HABILES',
    includesExpiryDay: true,
    calendarId: 'LFT_ARTS_74_715',
    effectRule: 'LFT_ART_747',
    legalBasis: [
      lft('735', 'Cuando la realización o práctica de algún acto procesal o el ejercicio de un derecho, no tengan fijado un término, éste será el de tres días hábiles.'),
      LFT_733,
      LFT_734,
      LFT_715,
      LFT_74,
      LFT_747,
    ],
    verification: verified('Ley Federal del Trabajo, texto vigente (Cámara de Diputados)'),
    articlesLastReformedDof: '2019-05-01',
    exceptionsNotCovered: ['Solo aplica si la ley o el acuerdo no fijan otro término.', 'Ampliación por distancia (art. 737).'],
  },
  {
    id: 'CIVIL_FAMILIAR_JALISCO',
    version: 1,
    label: 'Civil o familiar en Jalisco (contestación, apelación u otros)',
    jurisdictions: ['local'],
    matters: ['civil', 'familiar'],
    procedure: 'Procedimiento civil o familiar del Estado de Jalisco',
    triggeringAct: 'Según la actuación',
    days: null,
    dayKind: 'HABILES',
    includesExpiryDay: true,
    calendarId: null,
    effectRule: null,
    legalBasis: [],
    verification: {
      status: 'NOT_VERIFIED',
      source: 'Sin cotejo del texto oficial',
      note: 'El Código Nacional de Procedimientos Civiles y Familiares (DOF 07-06-2023) sustituye gradualmente a los códigos estatales según la declaratoria de cada entidad. Hay que confirmar qué código rige el asunto (fecha de inicio y declaratoria de Jalisco) antes de aplicar un plazo.',
    },
    exceptionsNotCovered: [],
  },
  {
    id: 'CIVIL_FEDERAL',
    version: 1,
    label: 'Civil federal (contestación, apelación u otros)',
    jurisdictions: ['federal'],
    matters: ['civil', 'mercantil'],
    procedure: 'Procedimiento civil federal o mercantil',
    triggeringAct: 'Según la actuación',
    days: null,
    dayKind: 'HABILES',
    includesExpiryDay: true,
    calendarId: null,
    effectRule: null,
    legalBasis: [],
    verification: {
      status: 'NOT_VERIFIED',
      source: 'Sin cotejo del texto oficial',
      note: 'Pendiente de cotejar el Código Nacional de Procedimientos Civiles y Familiares, el Código Federal de Procedimientos Civiles (régimen transitorio) y, en mercantil, el Código de Comercio.',
    },
    exceptionsNotCovered: [],
  },
];

export function findProceduralTermRule(id: string): ProceduralTermRule | undefined {
  return PROCEDURAL_TERM_RULES.find((rule) => rule.id === id);
}
