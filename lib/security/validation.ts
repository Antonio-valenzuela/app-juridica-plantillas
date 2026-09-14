export function validateString(value: any, minLength: number = 1): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < minLength) return null;
  return trimmed;
}

export function validateNumber(value: any, min?: number, max?: number): number | null {
  const num = Number(value);
  if (isNaN(num)) return null;
  if (min !== undefined && num < min) return null;
  if (max !== undefined && num > max) return null;
  return num;
}
