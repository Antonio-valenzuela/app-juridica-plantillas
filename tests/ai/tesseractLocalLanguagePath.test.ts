import { afterEach, describe, expect, it, vi } from 'vitest';

const { createWorker } = vi.hoisted(() => ({ createWorker: vi.fn() }));

vi.mock('tesseract.js', () => ({
  default: { createWorker },
}));

import { TesseractOCRProvider } from '@/lib/pdf/ocrProviders';

describe('Tesseract local Spanish language data', () => {
  const previousTessdataPath = process.env.TESSDATA_PATH;

  afterEach(() => {
    createWorker.mockReset();
    if (previousTessdataPath === undefined) delete process.env.TESSDATA_PATH;
    else process.env.TESSDATA_PATH = previousTessdataPath;
  });

  it('passes the configured local traineddata directory and disables gzip downloads', async () => {
    process.env.TESSDATA_PATH = `${process.cwd()}\\spa.traineddata`;
    createWorker.mockResolvedValue({
      recognize: vi.fn().mockResolvedValue({ data: { text: 'Texto local', confidence: 92 } }),
      terminate: vi.fn().mockResolvedValue(undefined),
    });

    const result = await new TesseractOCRProvider().process({
      buffer: Buffer.from('synthetic image bytes'),
      mimeType: 'image/png',
      language: 'spa',
      totalPages: 1,
    });

    expect(result.text).toBe('Texto local');
    expect(createWorker).toHaveBeenCalledWith(
      'spa',
      1,
      expect.objectContaining({
        langPath: process.cwd(),
        gzip: false,
      }),
    );
  });
});
