import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as POST_analyzeUpload } from '@/app/api/templates/analyze-upload/route';
import { requireAdmin } from '@/lib/security/adminAuth';

describe('Custom Templates API & Utilities', () => {
  let origEnv: string | undefined;

  beforeEach(() => {
    origEnv = process.env.ENABLE_PUBLIC_AI;
    process.env.ENABLE_PUBLIC_AI = 'true';
  });

  afterEach(() => {
    process.env.ENABLE_PUBLIC_AI = origEnv;
  });

  describe('Analyze Upload Endpoint (Server-Side)', () => {
    it('returns 400 when no file is uploaded', async () => {
      const formData = new FormData();
      const req = new NextRequest('http://localhost/api/templates/analyze-upload', {
        method: 'POST',
        body: formData,
      });

      const res = await POST_analyzeUpload(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toContain('No se recibió ningún archivo');
    });

    it('rejects files larger than 15MB with status 413', async () => {
      const formData = new FormData();
      const bigBuffer = new Uint8Array(15 * 1024 * 1024 + 100);
      const largeFile = new File([bigBuffer], 'giant.pdf', { type: 'application/pdf' });
      formData.append('file', largeFile);

      const req = new NextRequest('http://localhost/api/templates/analyze-upload', {
        method: 'POST',
        body: formData,
      });

      const res = await POST_analyzeUpload(req);
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toContain('15 MB');
    });

    it('accepts .rtf files and extracts text content', async () => {
      const formData = new FormData();
      const rtfFile = new File(['{\\rtf1\\ansi Demanda de amparo juzgado tribunal expediente considerando quejoso}'], 'documento.rtf', { type: 'application/rtf' });
      formData.append('file', rtfFile);

      const req = new NextRequest('http://localhost/api/templates/analyze-upload', {
        method: 'POST',
        body: formData,
      });

      const res = await POST_analyzeUpload(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.extractedText).toBeTruthy();
    });

    it('extracts plain text from .txt files successfully', async () => {
      const formData = new FormData();
      const txtContent = `DEMANDA DE AMPARO INDIRECTO
C. JUEZ DE DISTRITO EN TURNO EN MATERIA ADMINISTRATIVA
QUEJOSO: Juan Pérez
ASUNTO: Se promueve juicio de amparo contra actos de autoridad.
FUNDAMENTO: Artículo 107 y 108 de la Ley de Amparo.
CONSIDERANDO: Que se violan derechos humanos.
POR TANTO, A USTED C. JUEZ RESUELVE CONFORME A DERECHO.`;
      const txtFile = new File([txtContent], 'machote.txt', { type: 'text/plain' });
      formData.append('file', txtFile);

      const req = new NextRequest('http://localhost/api/templates/analyze-upload', {
        method: 'POST',
        body: formData,
      });

      const res = await POST_analyzeUpload(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.extractedText).toContain('DEMANDA DE AMPARO INDIRECTO');
      expect(json.classification.es_juridico).toBe(true);
      expect(json.analysis).toBeDefined();
      expect(json.generationEligibility).toBe('eligible');
    });

    it('returns a personal-template review without case canaries', async () => {
      const formData = new FormData();
      const txtContent = `DEMANDA CIVIL\nACTOR: PERSONA_CANARIO_78491\nDEMANDADO: PARTE_CANARIO\nEXPEDIENTE: EXP-CANARIO-9988\nDOMICILIO: DOMICILIO_CANARIO_X\nHECHOS\nSe incumplió la obligación.`;
      formData.append('file', new File([txtContent], 'plantilla-personal.txt', { type: 'text/plain' }));

      const req = new NextRequest('http://localhost/api/templates/analyze-upload', {
        method: 'POST',
        body: formData,
      });
      const res = await POST_analyzeUpload(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.templateAnalysis.structureJson.kind).toBe('personal-template');
      expect(json.templateAnalysis.parameterizedText).toContain('{{actor}}');
      expect(json.templateAnalysis.parameterizedText).not.toContain('PERSONA_CANARIO_78491');
      expect(json.templateAnalysis.parameterizedText).not.toContain('EXP-CANARIO-9988');
      expect(json.templateAnalysis.parameterizedText).not.toContain('DOMICILIO_CANARIO_X');
    });

    it('accepts scanned PDFs with needsOcr=true WITHOUT fabricating text when no OCR provider is configured', async () => {
      const formData = new FormData();
      // Dummy minimal PDF header that pdf-parse cannot extract > 50 chars from
      const pdfHeader = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 595 842]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF';
      const pdfFile = new File([pdfHeader], 'escaneado.pdf', { type: 'application/pdf' });
      formData.append('file', pdfFile);

      const req = new NextRequest('http://localhost/api/templates/analyze-upload', {
        method: 'POST',
        body: formData,
      });

      delete process.env.OCR_PROVIDER;
      const res = await POST_analyzeUpload(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      // El pipeline detecta que la fuente necesita OCR real
      expect(json.needsOcr).toBe(true);
      // Sin proveedor configurado NO se inventa contenido jurídico
      expect(json.extractedText || '').not.toContain('[EXTRACCIÓN DE PRUEBA - MODO MOCK LOCAL]');
      // Y la fuente queda SIN validar (requiere revisión manual)
      expect(json.sourceValidated).toBe(false);
      expect(json.generationEligibility).toBe('blocked');
    });

    it('uses the explicit mock OCR provider only when OCR_PROVIDER=mock (dev/CI opt-in)', async () => {
      const formData = new FormData();
      const pdfHeader = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 595 842]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF';
      const pdfFile = new File([pdfHeader], 'escaneado-mock.pdf', { type: 'application/pdf' });
      formData.append('file', pdfFile);

      const prevProvider = process.env.OCR_PROVIDER;
      process.env.OCR_PROVIDER = 'mock';
      try {
        const req = new NextRequest('http://localhost/api/templates/analyze-upload', {
          method: 'POST',
          body: formData,
        });
        const res = await POST_analyzeUpload(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);
        expect(json.needsOcr).toBe(true);
        // Con mock explícito hay texto (de prueba) pero la fuente JAMÁS se valida
        expect(json.sourceValidated).toBe(false);
      } finally {
        if (prevProvider === undefined) delete process.env.OCR_PROVIDER;
        else process.env.OCR_PROVIDER = prevProvider;
      }
    });
  });

  describe('Auth Bypass Configuration', () => {
    it('allows public AI endpoints when ENABLE_PUBLIC_AI=true', () => {
      const aiFillReq = new Request('http://localhost/api/templates/ai-fill', { method: 'POST' });
      const aiAssistReq = new Request('http://localhost/api/templates/ai-assist', { method: 'POST' });

      const fillAuth = requireAdmin(aiFillReq);
      const assistAuth = requireAdmin(aiAssistReq);

      expect(fillAuth.ok).toBe(true);
      expect(assistAuth.ok).toBe(true);
    });
  });
});
