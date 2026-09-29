import { afterEach, describe, expect, it } from 'vitest';
import { getOCRProvider } from '@/lib/pdf/ocrProviders';

describe('private document OCR transport', () => {
  const previous = process.env.OCR_PROVIDER;
  afterEach(() => {
    if (previous === undefined) delete process.env.OCR_PROVIDER;
    else process.env.OCR_PROVIDER = previous;
  });

  it('does not select cloud OCR merely because credentials and provider configuration exist', () => {
    process.env.OCR_PROVIDER = 'ilovepdf';
    expect(getOCRProvider().name).not.toBe('ilovepdf');
  });
});
