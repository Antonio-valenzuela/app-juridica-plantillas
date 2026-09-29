import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as POST_analyzeUpload } from '@/app/api/templates/analyze-upload/route';
import { createSyntheticScannedPdfBuffer } from './helpers/syntheticFixtures';

beforeAll(() => {
  for (const key of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) {
    delete process.env[key];
  }
  process.env.DEMO_MODE_ENABLED = 'true';
  process.env.OCR_PROVIDER = 'none';
});

async function uploadScannedPdf(buffer: Buffer) {
  const formData = new FormData();
  formData.append('file', new File([new Uint8Array(buffer)], 'synthetic-scan.pdf', { type: 'application/pdf' }));
  const response = await POST_analyzeUpload(new NextRequest('http://localhost/api/templates/analyze-upload', {
    method: 'POST',
    body: formData,
  }));
  return { status: response.status, body: await response.json() };
}

describe('Flow A - PDF escaneado sin OCR configurado', () => {
  it('mantiene la fuente bloqueada y no fabrica texto legal', async () => {
    const scan = await createSyntheticScannedPdfBuffer();
    const result = await uploadScannedPdf(scan);

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.needsOcr === true || result.body.sourceValidated === false).toBe(true);
    expect(result.body.sourceValidated).toBe(false);
    expect(result.body.extractedText.length).toBeLessThan(150);
  });
});
