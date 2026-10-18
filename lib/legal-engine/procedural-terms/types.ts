/**
 * Cómputo determinista de términos procesales — tipos.
 *
 * El motor nunca deja el cálculo final a un modelo de IA: la IA puede extraer la fecha y el tipo de
 * notificación, pero la regla (plazo, surtimiento de efectos, días inhábiles) está versionada aquí y
 * cada resultado expone su fundamento, su calendario y los datos que faltan.
 */

/** Fecha civil YYYY-MM-DD (sin zona horaria: se interpreta como fecha del órgano). */
export type IsoDate = string;

export type TermMatter = 'amparo' | 'laboral' | 'civil' | 'familiar' | 'mercantil' | 'penal' | 'administrativa';
export type TermJurisdiction = 'federal' | 'local';

export type NotificationKind =
  | 'PERSONAL'
  | 'LISTA'
  | 'BOLETIN_ESTRADOS'
  | 'ELECTRONICA_CONSULTA'
  | 'BUZON_ELECTRONICO'
  | 'OFICIO_AUTORIDAD'
  | 'CONOCIMIENTO_DEL_ACTO';

export type RecipientKind = 'PARTICULAR' | 'AUTORIDAD';

export type CalendarId = 'LEY_DE_AMPARO_ART_19' | 'LFT_ARTS_74_715';

/** Cómo se determina el día en que surte efectos la notificación. */
export type EffectRuleId = 'LEY_DE_AMPARO_ART_31' | 'LFT_ART_747' | 'LEY_DEL_ACTO';

export interface LegalBasisRef {
  law: string;
  article: string;
  /** Extracto literal del texto oficial consultado. */
  excerpt: string;
  officialUrl: string;
  /** «Última reforma publicada DOF» de la ley completa en la versión consultada. */
  lawLastReformDof: IsoDate;
}

export interface RuleVerification {
  status: 'VERIFIED_OFFICIAL_TEXT' | 'NOT_VERIFIED';
  /** Fecha en que se cotejó el texto oficial. */
  verifiedAt?: IsoDate;
  source: string;
  note?: string;
}

export interface ProceduralTermRule {
  id: string;
  /** Se incrementa cuando cambia el plazo, el fundamento o el modo de cómputo. */
  version: number;
  label: string;
  jurisdictions: TermJurisdiction[];
  matters: TermMatter[];
  procedure: string;
  triggeringAct: string;
  days: number | null;
  dayKind: 'HABILES';
  includesExpiryDay: boolean;
  calendarId: CalendarId | null;
  effectRule: EffectRuleId | null;
  legalBasis: LegalBasisRef[];
  verification: RuleVerification;
  /** Fecha DOF de la reforma más reciente de los artículos citados (para advertir sobre la versión temporal). */
  articlesLastReformedDof?: IsoDate;
  /** Supuestos que la regla NO cubre y que cambian el plazo. */
  exceptionsNotCovered: string[];
}

export interface OfficialSuspension {
  date: IsoDate;
  description: string;
  sourceUrl?: string;
}

export interface ProceduralTermInput {
  ruleId: string;
  jurisdiction?: TermJurisdiction;
  matter?: TermMatter;
  recipient?: RecipientKind;
  notification: {
    kind?: NotificationKind;
    /** Fecha en que se practicó la notificación (o la del conocimiento del acto). */
    date?: IsoDate;
    /** De dónde sale la fecha: cédula, lista, acuse, constancia electrónica… */
    dateSource?: string;
    /** Fecha en que surtió efectos, cuando el abogado ya la conoce (obligatoria si depende de la ley del acto). */
    effectDate?: IsoDate;
  };
  calendar?: {
    /** Suspensiones de labores del órgano publicadas oficialmente (acuerdos, avisos en boletín). */
    suspensions: OfficialSuspension[];
    /** El abogado confirma que revisó el calendario oficial del órgano para todo el periodo del término. */
    confirmedForPeriod: boolean;
    sourceDescription?: string;
  };
}

export type TermCertainty = 'ALTA' | 'MEDIA' | 'REQUIERE_CONFIRMAR';

export interface TermStep {
  order: number;
  description: string;
  date?: IsoDate;
}

export interface NonWorkingDay {
  date: IsoDate;
  reason: string;
}

export interface ProceduralTermResult {
  status: 'CALCULADO' | 'REQUIERE_CONFIRMAR';
  engineVersion: string;
  ruleId: string;
  ruleVersion: number | null;
  ruleLabel: string | null;
  /** Solo se entrega con regla verificada, fechas completas y calendario confirmado. */
  deadline: IsoDate | null;
  /** Fecha orientativa cuando lo único pendiente es confirmar el calendario de suspensiones. */
  provisionalDeadline: IsoDate | null;
  notificationDate: IsoDate | null;
  effectDate: IsoDate | null;
  firstDay: IsoDate | null;
  certainty: TermCertainty;
  missing: string[];
  warnings: string[];
  steps: TermStep[];
  legalBasis: LegalBasisRef[];
  calendarConsulted: {
    id: CalendarId | null;
    label: string | null;
    nonWorkingDaysInRange: NonWorkingDay[];
    suspensionsApplied: OfficialSuspension[];
    confirmedForPeriod: boolean;
    sourceDescription?: string;
  };
  officialLinks: string[];
  disclaimer: string;
}
