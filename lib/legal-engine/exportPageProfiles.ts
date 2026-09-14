export type PageProfileSource =
  | 'DOCUMENT_METADATA'
  | 'SERVER_OPTION'
  | 'COMPATIBILITY_DEFAULT';

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DocxPageProfile {
  id: string;
  unit: 'twip';
  width: number;
  height: number;
  margins: PageMargins;
  source: PageProfileSource;
}

export interface PdfPageProfile {
  id: string;
  unit: 'pt';
  width: number;
  height: number;
  margins: PageMargins;
  source: PageProfileSource;
}

export interface PageProfileResolutionInput {
  serverOption?: unknown;
  documentMetadata?: unknown;
}

type PageProfileUnit = DocxPageProfile['unit'] | PdfPageProfile['unit'];
type ServerPageProfileCandidate = {
  id: string;
  unit: PageProfileUnit;
  width: number;
  height: number;
  margins: PageMargins;
};

export type PageProfileResolutionErrorCode =
  | 'INVALID_RESOLUTION_INPUT'
  | 'DOCUMENT_METADATA_NOT_AUTHORIZED'
  | 'UNSAFE_PAGE_PROFILE';

export class PageProfileResolutionError extends Error {
  constructor(
    readonly code: PageProfileResolutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PageProfileResolutionError';
  }
}

const DOCX_COMPATIBILITY_DEFAULT: ServerPageProfileCandidate = {
  id: 'docx-letter-compatibility-default',
  unit: 'twip',
  // The current DOCX renderer leaves width/height implicit, so these values
  // make Word's existing Letter default explicit without changing its layout.
  width: 12240,
  height: 15840,
  margins: { top: 1440, right: 1440, bottom: 1440, left: 1728 },
};

const PDF_COMPATIBILITY_DEFAULT: ServerPageProfileCandidate = {
  id: 'pdf-letter-compatibility-default',
  unit: 'pt',
  width: 612,
  height: 792,
  margins: { top: 72, right: 72, bottom: 72, left: 72 },
};

const PROFILE_KEYS = ['id', 'unit', 'width', 'height', 'margins'] as const;
const MARGIN_KEYS = ['top', 'right', 'bottom', 'left'] as const;
const MAX_DOCX_TWIPS = 100_000;
const MAX_PDF_POINTS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(code: PageProfileResolutionErrorCode, message: string): never {
  throw new PageProfileResolutionError(code, message);
}

function readResolutionInput(input: unknown): unknown {
  if (input === undefined) return undefined;
  if (!isRecord(input)) {
    fail('INVALID_RESOLUTION_INPUT', 'Page profile overrides must use the server-option envelope.');
  }

  const unknownKeys = Object.keys(input).filter(
    (key) => key !== 'serverOption' && key !== 'documentMetadata',
  );
  if (unknownKeys.length > 0) {
    fail(
      'INVALID_RESOLUTION_INPUT',
      `Unsupported page profile input keys: ${unknownKeys.join(', ')}.`,
    );
  }

  if (input.documentMetadata !== undefined) {
    fail(
      'DOCUMENT_METADATA_NOT_AUTHORIZED',
      'Document metadata is not an approved page-profile source in the current architecture.',
    );
  }

  return input.serverOption;
}

function validateKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknownKeys = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknownKeys.length > 0) {
    fail(
      'UNSAFE_PAGE_PROFILE',
      `${label} contains unsupported keys: ${unknownKeys.join(', ')}.`,
    );
  }
}

function validateNumber(
  value: unknown,
  label: string,
  options: { integer?: boolean; min: number; max: number },
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('UNSAFE_PAGE_PROFILE', `${label} must be a finite number.`);
  }
  if (options.integer && !Number.isInteger(value)) {
    fail('UNSAFE_PAGE_PROFILE', `${label} must be an integer for twip units.`);
  }
  if (value < options.min || value > options.max) {
    fail('UNSAFE_PAGE_PROFILE', `${label} is outside the safe range.`);
  }
  return value;
}

function validateCandidate(
  candidate: unknown,
  expectedUnit: PageProfileUnit,
): ServerPageProfileCandidate {
  if (!isRecord(candidate)) {
    fail('UNSAFE_PAGE_PROFILE', 'The server page profile option must be an object.');
  }
  validateKeys(candidate, PROFILE_KEYS, 'The server page profile option');

  if (typeof candidate.id !== 'string' || candidate.id.length === 0 || candidate.id.length > 100) {
    fail('UNSAFE_PAGE_PROFILE', 'Page profile id must be a non-empty string of at most 100 characters.');
  }
  if (candidate.id.trim() !== candidate.id || /[\u0000-\u001F\u007F]/.test(candidate.id)) {
    fail('UNSAFE_PAGE_PROFILE', 'Page profile id must not contain surrounding whitespace or control characters.');
  }
  if (candidate.unit !== expectedUnit) {
    fail('UNSAFE_PAGE_PROFILE', `Page profile unit must be ${expectedUnit}.`);
  }

  const maxDimension = expectedUnit === 'twip' ? MAX_DOCX_TWIPS : MAX_PDF_POINTS;
  const integer = expectedUnit === 'twip';
  const width = validateNumber(candidate.width, 'Page profile width', { integer, min: 1, max: maxDimension });
  const height = validateNumber(candidate.height, 'Page profile height', { integer, min: 1, max: maxDimension });

  if (!isRecord(candidate.margins)) {
    fail('UNSAFE_PAGE_PROFILE', 'Page profile margins must be an object.');
  }
  validateKeys(candidate.margins, MARGIN_KEYS, 'Page profile margins');
  const margins: PageMargins = {
    top: validateNumber(candidate.margins.top, 'Top margin', { integer, min: 0, max: maxDimension }),
    right: validateNumber(candidate.margins.right, 'Right margin', { integer, min: 0, max: maxDimension }),
    bottom: validateNumber(candidate.margins.bottom, 'Bottom margin', { integer, min: 0, max: maxDimension }),
    left: validateNumber(candidate.margins.left, 'Left margin', { integer, min: 0, max: maxDimension }),
  };

  if (margins.left + margins.right >= width || margins.top + margins.bottom >= height) {
    fail('UNSAFE_PAGE_PROFILE', 'Page profile margins must leave a positive content area.');
  }

  return {
    id: candidate.id,
    unit: expectedUnit,
    width,
    height,
    margins,
  };
}

function withSource<T extends ServerPageProfileCandidate>(
  candidate: T,
  source: PageProfileSource,
): T & { source: PageProfileSource } {
  return {
    ...candidate,
    margins: { ...candidate.margins },
    source,
  };
}

export function resolveDocxPageProfile(input?: unknown): DocxPageProfile {
  const serverOption = readResolutionInput(input);
  const candidate = serverOption === undefined
    ? DOCX_COMPATIBILITY_DEFAULT
    : validateCandidate(serverOption, 'twip');
  return withSource(candidate, serverOption === undefined ? 'COMPATIBILITY_DEFAULT' : 'SERVER_OPTION') as DocxPageProfile;
}

export function resolvePdfPageProfile(input?: unknown): PdfPageProfile {
  const serverOption = readResolutionInput(input);
  const candidate = serverOption === undefined
    ? PDF_COMPATIBILITY_DEFAULT
    : validateCandidate(serverOption, 'pt');
  return withSource(candidate, serverOption === undefined ? 'COMPATIBILITY_DEFAULT' : 'SERVER_OPTION') as PdfPageProfile;
}
