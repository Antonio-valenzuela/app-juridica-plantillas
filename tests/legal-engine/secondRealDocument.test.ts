import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractDocument } from '@/lib/pdf/documentExtractor';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

describe('VALIDACIÓN SEGUNDO DOCUMENTO REAL: 0129000036717288006AST.PDF', () => {
  it('procesa el segundo documento real de 27 páginas y demuestra generalidad sin sobreajuste al caso de plazos', async () => {
    const pdfPath = path.resolve('data/uploads/templates/1787377598439-0129000036717288006AST.PDF');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const buffer = fs.readFileSync(pdfPath);
    const extracted = await extractDocument({
      buffer,
      fileName: '0129000036717288006AST.PDF',
      mimeType: 'application/pdf',
    });

    // 1. Verificación de metadatos del PDF fuente
    expect(extracted.pageCount).toBe(27);
    expect(extracted.text?.length).toBeGreaterThan(50000);
    expect(extracted.text).toMatch(/Segundo\s+Tribunal\s+Colegiado\s+en\s+Materia\s+de\s+Trabajo\s+del\s+Tercer\s+Circuito/i);

    const sourceDoc: UploadedSourceDocument = {
      id: 'source-doc-2-real',
      filename: '0129000036717288006AST.PDF',
      extractedText: extracted.text || '',
      sourceValidated: true,
      pages: (extracted.pages || []).map((p, i) => ({
        page: p.page || i + 1,
        text: p.text || '',
        chars: p.chars || p.text?.length || 0,
      })),
    };

    // 2. Reconstrucción de Case Analysis como contestación de demanda / defensa sustantiva
    const caseAnalysis = reconstructCaseAnalysis(
      [sourceDoc],
      'Contestar la demanda laboral y oponer excepciones',
    );

    const constIssues = caseAnalysis.proceduralPosture?.constitutionalIssues || [];
    const legIssues = caseAnalysis.proceduralPosture?.legalityIssues || [];

    console.log('[DOC2_ANALYSIS]', {
      // documentType: caseAnalysis.documentType, // CaseAnalysis no tiene documentType
      factsCount: caseAnalysis.facts?.length,
      authoritiesCount: caseAnalysis.authorities?.length,
      constitutionalIssuesCount: constIssues.length,
      legalityIssuesCount: legIssues.length,
      sampleIssue: legIssues[0]?.title,
    });

    // 3. Verificaciones de generalidad y no-sobreajuste:
    // A. El segundo documento tiene hechos procesales extraídos
    expect(caseAnalysis.facts?.length).toBeGreaterThan(0);

    // B. Las autoridades son reales del documento (magistrados, tribunal laboral, etc.)
    expect(caseAnalysis.authorities?.length).toBeGreaterThan(0);

    // C. NO genera issues sobre el cómputo de 10 días para revisión en amparo directo
    const plazo10DiasIssue = [...constIssues, ...legIssues].find(
      (i) => /cómputo.*10\s*días|plazo.*10\s*días/i.test(i.title) || /cómputo.*10\s*días/i.test(i.parameter)
    );
    expect(plazo10DiasIssue).toBeUndefined();

    // D. NO genera issues sobre el artículo 17 de la Ley de Amparo
    const art17LampIssue = [...constIssues, ...legIssues].find(
      (i) => /artículo\s+17\s+de\s+la\s+ley\s+de\s+amparo/i.test(i.parameter)
    );
    expect(art17LampIssue).toBeUndefined();

    // E. NO inyecta procedencia de amparo directo en revisión (porque no es una revisión)
    const procedenciaRevisionIssue = constIssues.find(
      (i) => /procedencia.*amparo directo en revisión/i.test(i.title)
    );
    expect(procedenciaRevisionIssue).toBeUndefined();
  });
});
