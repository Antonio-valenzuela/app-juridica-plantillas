export const WORD_ACCOUNTING_COUNTERS = [
  'plannedWords',
  'providerGeneratedWords',
  'providerGeneratedChars',
  'validatedWords',
  'rejectedWords',
  'dedupRemovedWords',
  'materializedWords',
  'admittedWords',
  'assembledWords',
  'exportedWords',
] as const;

type WordCounter = typeof WORD_ACCOUNTING_COUNTERS[number];
type LossStage = 'provider-validation' | 'semantic-review' | 'deduplication' | 'block-admission' | 'assembly' | 'export';

interface LossEvent {
  lossId?: unknown;
  stage?: unknown;
  reason?: unknown;
  words?: unknown;
}

interface AccountingInput extends Partial<Record<WordCounter, unknown>> {
  sectionId?: unknown;
  accountingSchemaVersion?: unknown;
  losses?: unknown;
}

interface TransitionSpec {
  from: Exclude<WordCounter, 'plannedWords' | 'providerGeneratedChars' | 'rejectedWords' | 'dedupRemovedWords'>;
  to: Exclude<WordCounter, 'plannedWords' | 'providerGeneratedChars' | 'rejectedWords' | 'dedupRemovedWords'>;
  lossStages: LossStage[];
}

const TRANSITIONS: TransitionSpec[] = [
  { from: 'providerGeneratedWords', to: 'validatedWords', lossStages: ['provider-validation'] },
  { from: 'validatedWords', to: 'materializedWords', lossStages: ['semantic-review', 'deduplication'] },
  { from: 'materializedWords', to: 'admittedWords', lossStages: ['block-admission'] },
  { from: 'admittedWords', to: 'assembledWords', lossStages: ['assembly'] },
  { from: 'assembledWords', to: 'exportedWords', lossStages: ['export'] },
];

const LOSS_STAGES = new Set<LossStage>([
  'provider-validation', 'semantic-review', 'deduplication', 'block-admission', 'assembly', 'export',
]);

export interface WordAccountingTransitionResult {
  from: string;
  to: string;
  fromWords: number | null;
  toWords: number | null;
  netLossWords: number | null;
  reasonWords: number;
  residualWords: number | null;
  reasonCode: 'RECONCILED' | 'UNEXPLAINED_WORD_RESIDUE' | 'MISSING_STAGE_COUNTER';
  reasonCodes: string[];
}

export interface WordAccountingReconciliation {
  sectionId: string;
  accountingSchemaVersion: number | null;
  consistent: boolean;
  missingCounters: string[];
  errors: string[];
  uniqueLossWords: number;
  transitions: WordAccountingTransitionResult[];
}

/**
 * Reconciles each adjacent count from unique, reason-coded loss events.
 * Legacy losses without IDs are intentionally not counted: their uniqueness
 * cannot be proven, so the resulting difference stays visible as residue.
 */
export function reconcileSectionWordAccounting(input: AccountingInput): WordAccountingReconciliation {
  const sectionId = typeof input.sectionId === 'string' ? input.sectionId : 'NO_ATRIBUIBLE';
  const missingCounters = WORD_ACCOUNTING_COUNTERS.filter((counter) => (
    typeof input[counter] !== 'number' || !Number.isFinite(input[counter]) || (input[counter] as number) < 0
  ));
  const errors: string[] = [];
  const seenLossIds = new Set<string>();
  const lossEvents: Array<LossEvent & { lossId: string; stage: LossStage; words: number; reason: string }> = [];

  for (const rawLoss of Array.isArray(input.losses) ? input.losses : []) {
    if (!rawLoss || typeof rawLoss !== 'object') {
      errors.push('INVALID_LOSS_EVENT');
      continue;
    }
    const loss = rawLoss as LossEvent;
    if (typeof loss.lossId !== 'string' || !loss.lossId.trim()) {
      errors.push('MISSING_LOSS_ID');
      continue;
    }
    if (seenLossIds.has(loss.lossId)) {
      errors.push(`DUPLICATE_LOSS_ID:${loss.lossId}`);
      continue;
    }
    seenLossIds.add(loss.lossId);
    if (typeof loss.stage !== 'string' || !LOSS_STAGES.has(loss.stage as LossStage)) {
      errors.push(`INVALID_LOSS_STAGE:${loss.lossId}`);
      continue;
    }
    if (typeof loss.reason !== 'string' || !loss.reason.trim()) {
      errors.push(`MISSING_LOSS_REASON:${loss.lossId}`);
      continue;
    }
    if (typeof loss.words !== 'number' || !Number.isInteger(loss.words) || loss.words <= 0) {
      errors.push(`INVALID_LOSS_WORDS:${loss.lossId}`);
      continue;
    }
    lossEvents.push({ ...loss, lossId: loss.lossId, stage: loss.stage as LossStage, words: loss.words, reason: loss.reason });
  }

  const transitions = TRANSITIONS.map((spec): WordAccountingTransitionResult => {
    const fromValue = input[spec.from];
    const toValue = input[spec.to];
    if (typeof fromValue !== 'number' || !Number.isFinite(fromValue) || fromValue < 0
      || typeof toValue !== 'number' || !Number.isFinite(toValue) || toValue < 0) {
      return {
        from: spec.from,
        to: spec.to,
        fromWords: typeof fromValue === 'number' && Number.isFinite(fromValue) ? fromValue : null,
        toWords: typeof toValue === 'number' && Number.isFinite(toValue) ? toValue : null,
        netLossWords: null,
        reasonWords: 0,
        residualWords: null,
        reasonCode: 'MISSING_STAGE_COUNTER',
        reasonCodes: ['MISSING_STAGE_COUNTER'],
      };
    }
    const netLossWords = fromValue - toValue;
    const matched = lossEvents.filter((loss) => spec.lossStages.includes(loss.stage));
    const reasonWords = matched.reduce((total, loss) => total + loss.words, 0);
    const residualWords = netLossWords - reasonWords;
    const reasonCodes = matched.map((loss) => loss.reason);
    if (residualWords !== 0) reasonCodes.push('UNEXPLAINED_WORD_RESIDUE');
    return {
      from: spec.from,
      to: spec.to,
      fromWords: fromValue,
      toWords: toValue,
      netLossWords,
      reasonWords,
      residualWords,
      reasonCode: residualWords === 0 ? 'RECONCILED' : 'UNEXPLAINED_WORD_RESIDUE',
      reasonCodes,
    };
  });

  const uniqueLossWords = lossEvents.reduce((total, loss) => total + loss.words, 0);
  const consistent = missingCounters.length === 0
    && errors.length === 0
    && transitions.every((transition) => transition.reasonCode === 'RECONCILED');
  return {
    sectionId,
    accountingSchemaVersion: typeof input.accountingSchemaVersion === 'number' ? input.accountingSchemaVersion : null,
    consistent,
    missingCounters,
    errors,
    uniqueLossWords,
    transitions,
  };
}
