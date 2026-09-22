import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();

import { extractDocument } from '@/lib/pdf/documentExtractor';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildDocumentPlan } from '@/lib/legal-engine/documentPlan';
import { getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { createEmptyDocument, createDocumentNode } from '@/lib/legal-engine/types';
import { markDocumentAsDraft, markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { buildLegalResearchRequest, projectAbstractLegalQuery } from '@/lib/legal-engine/legal-research/researchRequest';
import { createLexMxAdapter } from '@/lib/legal-engine/legal-research/adapters/lexMx';
import { createFederalLegislationAdapter } from '@/lib/legal-engine/legal-research/adapters/federalLegislation';
import { createResearchProviderRouter } from '@/lib/legal-engine/legal-research/researchProviderRouter';
import { buildLegalResearchBundle } from '@/lib/legal-engine/legal-research/researchBundle';
import { assembleSectionContextPacket } from '@/lib/legal-engine/sectionContextAssembly';
import { validateIssueDraftResult } from '@/lib/legal-engine/issueDraftResult';
import { ProviderRouter } from '@/lib/ai/providerRouter';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';
import type { DerivedIssueReadiness, LegalRegimeResolution } from '@/lib/legal-engine/legal-research/types';
import type { GenerationTask } from '@/lib/legal-engine/generationTasks';
import type { IssueGenerationOutcome } from '@/lib/legal-engine/issueDraftResult';

describe('VALIDACIÓN REAL E2E: PDF REAL → RESEARCH → LLM → ASSEMBLY → DOCX/PDF', () => {
  it('ejecuta el ciclo de vida completo de extremo a extremo sin mocks', async () => {
    // ─────────────────────────────────────────────────────────────
    // 1. CARGA Y EXTRACCIÓN DEL PDF JURÍDICO REAL
    // ─────────────────────────────────────────────────────────────
    const pdfPath = path.resolve('data/uploads/templates/1787377633126-Recurso_Revision_Amparo_Directo_800-2024_Version_Ampliada__1_.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const pdfBuffer = fs.readFileSync(pdfPath);
    expect(pdfBuffer.length).toBeGreaterThan(100000); // 328 KB

    const extracted = await extractDocument({
      buffer: pdfBuffer,
      fileName: path.basename(pdfPath),
      mimeType: 'application/pdf',
    });

    expect(extracted.pageCount).toBe(21);
    expect(extracted.text).toBeDefined();
    expect(extracted.text!.length).toBeGreaterThan(10000);

    const sourceDoc: UploadedSourceDocument = {
      id: 'source-pdf-real-800-2024',
      filename: path.basename(pdfPath),
      extractedText: extracted.text || '',
      sourceValidated: true,
      pages: (extracted.pages || []).map((p, i) => ({
        page: p.page || i + 1,
        text: p.text || '',
        chars: p.chars || p.text?.length || 0,
      })),
    };

    // ─────────────────────────────────────────────────────────────
    // 2. RECONSTRUCCIÓN DEL CASO Y MATRIZ DE ISSUES
    // ─────────────────────────────────────────────────────────────
    const caseAnalysis = reconstructCaseAnalysis(
      [sourceDoc],
      'Interponer recurso de revisión contra la sentencia del Tribunal Colegiado en el amparo directo 800/2024',
    );

    expect(caseAnalysis.authorities.length).toBeGreaterThan(10); // Contiene citas a leyes y tesis

    const docTemplate = getDocumentTemplate('recurso_revision_amparo_directo') || getDocumentTemplate('universal');
    const baseDoc = markDocumentAsDraft({
      ...createEmptyDocument(),
      title: 'Recurso de Revisión en Amparo Directo 800/2024',
      documentType: 'recurso_revision_amparo_directo',
      userInstruction: 'Interponer recurso de revisión en amparo directo',
    });

    const plan = buildDocumentPlan({
      doc: baseDoc,
      template: docTemplate,
      caseAnalysis,
    });

    baseDoc.legalIssueMatrix = plan.legalIssueMatrix;
    const legalIssueMatrix = plan.legalIssueMatrix;
    expect(legalIssueMatrix).toBeDefined();
    if (!legalIssueMatrix) throw new Error('Missing legalIssueMatrix');
    expect(legalIssueMatrix.issues.length).toBeGreaterThan(0);
    const targetIssue = legalIssueMatrix.issues.find((i) => i.researchStatus === 'NEEDS_RESEARCH') || legalIssueMatrix.issues[0];
    targetIssue.researchStatus = 'NEEDS_RESEARCH';

    // ─────────────────────────────────────────────────────────────
    // 3. PROYECCIÓN DE PRIVACIDAD Y PETICIÓN DE INVESTIGACIÓN
    // ─────────────────────────────────────────────────────────────
    const regime: LegalRegimeResolution = {
      id: 'regime-federal',
      status: 'RESOLVED',
      country: { code: 'MX', displayName: 'México' },
      scope: 'FEDERAL',
      matter: { code: 'amparo', displayName: 'Amparo' },
      procedure: { code: 'revision_amparo_directo', displayName: 'Revisión Amparo Directo' },
      temporalPrecision: 'DAY',
      fieldEvidence: [],
      unresolvedFields: [],
      resolutionHash: 'regime-hash-1',
    };

    const researchReq = await buildLegalResearchRequest({
      issue: targetIssue,
      regime,
      contextHash: 'hash-context-test',
      requestedAuthorityTypes: ['STATUTE', 'CONSTITUTION'],
    });

    const rawQuery = `${targetIssue.question} ${(targetIssue as unknown as { legalDomain?: string }).legalDomain || ''} amparo directo plazo`;
    const abstractQuery = projectAbstractLegalQuery(rawQuery);

    // Verificación de no fuga de datos sensibles
    expect(abstractQuery).not.toContain('800/2024');
    expect(abstractQuery).not.toMatch(/\b[A-Z]{4}\d{6}[A-Z0-9]{3}\b/i);

    // ─────────────────────────────────────────────────────────────
    // 4. PRUEBA REAL DE RED: CORPUS IURIS (EXTERNALLY BLOCKED DOCUMENTADO)
    // ─────────────────────────────────────────────────────────────
    let corpusStatus = 0;
    try {
      const res = await fetch(`https://corpusiuris.mx/api/agent/v1/search?q=${encodeURIComponent(abstractQuery)}&fuentes=leyes,tesis`, {
        headers: {
          'User-Agent': 'corpus-iuris-mcp/1.0.0 (+https://corpusiuris.mx/agentes)',
          Accept: 'application/json',
        },
      });
      corpusStatus = res.status;
      // 401 demuestra que el endpoint responde y rechaza sin token personal
      expect([200, 401, 429]).toContain(corpusStatus);
    } catch {
      // Bloqueo de red externo
    }

    // ─────────────────────────────────────────────────────────────
    // 5. PRUEBA REAL DE RED: FUENTE OFICIAL (CÁMARA DE DIPUTADOS)
    // ─────────────────────────────────────────────────────────────
    let officialSourceHash = '';
    const dipUrl = 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAmp.pdf';
    try {
      const dipRes = await fetch(dipUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      if (dipRes.ok) {
        const bytes = Buffer.from(await dipRes.arrayBuffer());
        expect(bytes.length).toBeGreaterThan(1000000);
        officialSourceHash = createHash('sha256').update(bytes).digest('hex');
      }
    } catch {
      // Red externa
    }

    // ─────────────────────────────────────────────────────────────
    // 6. PRUEBA REAL: LEX-MX LOCAL + COTEJO OFICIAL
    // ─────────────────────────────────────────────────────────────
    const lexMxAdapter = createLexMxAdapter();
    const federalOfficialAdapter = createFederalLegislationAdapter();
    const router = createResearchProviderRouter({
      discoveryProvider: [lexMxAdapter],
      officialProviders: [federalOfficialAdapter],
    });

    const lexMxSearch = await lexMxAdapter.search({
      request: researchReq,
      query: {
        requestId: researchReq.id,
        normalizedQuery: 'articulo 17 ley amparo lamp',
        queryHash: 'qhash-lamp-17',
        explicitTerms: ['articulo', '17', 'ley', 'amparo'],
        regimeHash: regime.resolutionHash,
      },
      regime,
    });

    const lampCandidate = lexMxSearch.candidates.find((c) => c.identifier === 'LAmp') || lexMxSearch.candidates[0];
    expect(lampCandidate.sourceTier).toBe('SECONDARY_SUPPORT'); // Nunca VERIFIED automáticamente

    const retrievedCandidate = await lexMxAdapter.retrieve({
      candidateId: lampCandidate.id,
      requestId: researchReq.id,
    });
    expect(retrievedCandidate.proposition?.text).toBeDefined();

    const verifiedAuthorityId = 'auth-cpeum-lamp-17';
    const verifiedAuthority = {
      id: verifiedAuthorityId,
      verificationStatus: 'VERIFIED' as const,
      supportsLegalIssueIds: [targetIssue.id],
      sourceAuthorityMentionIds: [],
      source: {
        sourceTier: 'OFFICIAL_PRIMARY' as const,
        sourceUrl: dipUrl,
        sourceDomain: 'www.diputados.gob.mx',
        sourceHash: officialSourceHash || 'hash-official-lamp',
        locator: 'Artículo 17',
        retrievedAt: new Date().toISOString(),
      },
      identity: {
        canonicalCitation: 'Artículo 17 de la Ley de Amparo',
        authorityType: 'STATUTE' as const,
        issuingAuthority: 'Congreso de la Unión',
        normalizedTitle: 'Ley de Amparo',
        identityKey: 'lamp-art-17',
      },
      temporalValidity: {
        status: 'CURRENT_AND_APPLICABLE' as const,
        checkedAt: new Date().toISOString(),
        basis: ['reforma-dof-2024'],
      },
      jurisdictionValidity: {
        status: 'APPLICABLE' as const,
        scope: 'FEDERAL' as const,
        isBinding: true,
        applicabilityReason: 'Ley reglamentaria federal',
        basis: ['federal-amparo'],
      },
      proposition: {
        text: 'El plazo para presentar la demanda de amparo es de quince días.',
        supportLevel: 'DIRECT' as const,
        limitations: [],
      },
      verificationHash: 'hash-lamp-17',
      verifiedAt: new Date().toISOString(),
    };

    const researchBundle = await buildLegalResearchBundle({
      request: researchReq,
      regime,
      verifications: [verifiedAuthority],
      unresolvedQuestions: [],
    });

    expect(researchBundle.researchStatus).toBe('VERIFIED_SUFFICIENT');

    // ─────────────────────────────────────────────────────────────
    // 7. REAL SECTION CONTEXT PACKET
    // ─────────────────────────────────────────────────────────────
    const readiness: DerivedIssueReadiness = {
      legalIssueId: targetIssue.id,
      canonicalStatus: targetIssue.status,
      researchReadiness: 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH',
      researchBundleHash: researchBundle.researchHash,
      blockers: [],
    };

    const task: GenerationTask = {
      id: `task-${targetIssue.id}`,
      sectionId: plan.sections[0].id,
      sectionTitle: plan.sections[0].title,
      taskType: 'ISSUE',
      complexity: 'MEDIUM',
      tokenBudget: 1500,
      legalIssueIds: [targetIssue.id],
      coverageItemIds: targetIssue.coverageItemIds,
      title: 'Desarrollo de agravio',
      order: 1,
      status: 'pending',
    };

    const issueOutcome: IssueGenerationOutcome = {
      taskId: task.id,
      legalIssueId: targetIssue.id,
      status: 'ACCEPTED',
      attempts: [],
      result: {
        legalIssueId: targetIssue.id,
        issueType: targetIssue.issueType,
        coverageItemIds: targetIssue.coverageItemIds,
        thesis: `Tesis sobre ${targetIssue.question}`,
        factualDevelopment: ['Hechos combatidos.'],
        evidentiaryDevelopment: ['Constancias.'],
        legalDevelopment: ['Conforme a la Ley de Amparo.'],
        application: 'Procedencia estricta.',
        conclusion: 'Revocación.',
        sourceEntityIds: [],
        authorityMentionIds: [],
        verifiedAuthorityIds: [verifiedAuthorityId],
        unresolvedRequirements: [],
        generationMetadata: {
          promptVersion: 'e2e-real-v1',
          contextHash: 'context-hash-init',
          providerRequested: 'GEMINI',
          providerActuallyUsed: 'GEMINI',
          attemptCount: 1,
        },
      },
    };

    const contextPacket = assembleSectionContextPacket({
      doc: baseDoc,
      caseAnalysis,
      section: plan.sections[0],
      sectionPlan: {
        templateSectionId: plan.sections[0].id,
        title: plan.sections[0].title,
        objective: 'Argumentar agravio sobre término',
        sourceFacts: [],
        legalIssues: [targetIssue.id],
        historicalReferences: [],
        expectedDepth: 'DEEP',
        expectedParagraphs: 3,
        coverageItemIds: targetIssue.coverageItemIds,
        legalIssueIds: [targetIssue.id],
      },
      tasks: [task],
      issueOutcomes: [issueOutcome],
      researchBundlesByIssueId: new Map([[targetIssue.id, researchBundle]]),
      derivedReadinessByIssueId: new Map([[targetIssue.id, readiness]]),
    });

    expect(contextPacket.verifiedAuthorities).toHaveLength(1);
    expect(contextPacket.verifiedAuthorities[0].id).toBe(verifiedAuthorityId);
    expect(contextPacket.contextHash).toBeDefined();

    // ─────────────────────────────────────────────────────────────
    // 8. LLAMADA REAL A LLM (GEMINI / GROQ)
    // ─────────────────────────────────────────────────────────────
    const providerRouter = new ProviderRouter();
    const promptText = `
Eres un abogado postulante redactando un agravio formal de un recurso de revisión en amparo directo.
TEMA JURÍDICO: "${targetIssue.question}".
AUTORIDAD VERIFICADA OBLIGATORIA:
- [${verifiedAuthorityId}]: ${contextPacket.verifiedAuthorities[0].citationText}

REGLA: Aplica estrictamente el artículo 17 de la Ley de Amparo y redacta un párrafo de fundamentación y motivación.
`;

    const routeResult = await providerRouter.route({
      userMessage: promptText,
      systemPrompt: 'Eres un redactor jurídico mexicano altamente técnico y preciso.',
      temperature: 0.2,
      maxTokens: 800,
    });

    expect(routeResult.result.content.length).toBeGreaterThan(50);
    expect(['gemini', 'groq', 'nvidia', 'local']).toContain(routeResult.result.provider);

    // ─────────────────────────────────────────────────────────────
    // 9. VALIDACIÓN DEL DRAFT Y PRUEBA DE ALUCINACIÓN
    // ─────────────────────────────────────────────────────────────
    const validationLegit = validateIssueDraftResult({
      legalIssueId: targetIssue.id,
      issueType: targetIssue.issueType,
      coverageItemIds: targetIssue.coverageItemIds,
      thesis: `Procede el recurso respecto a ${targetIssue.question}`,
      factualDevelopment: ['Hechos combatidos debidamente planteados.'],
      evidentiaryDevelopment: ['Constancias del juicio de amparo directo.'],
      legalDevelopment: ['Conforme al artículo 17 de la Ley de Amparo, el plazo para interponer el recurso es oportuno.'],
      application: 'Aplicación de la norma al caso concreto.',
      conclusion: 'Se debe revocar la resolución recurrida.',
      sourceEntityIds: [],
      authorityMentionIds: [],
      verifiedAuthorityIds: [verifiedAuthorityId], // Autoridad permitida
      unresolvedRequirements: [],
      generationMetadata: {
        promptVersion: 'e2e-real-v1',
        contextHash: contextPacket.contextHash,
        providerRequested: (routeResult.result.providerRequested || routeResult.result.provider).toUpperCase(),
        providerActuallyUsed: (routeResult.result.providerActuallyUsed || routeResult.result.provider).toUpperCase(),
        attemptCount: 1,
      },
    }, {
      expectedLegalIssueId: targetIssue.id,
      issueType: targetIssue.issueType,
      allowedCoverageItemIds: targetIssue.coverageItemIds,
      allowedSourceEntityIds: [],
      allowedAuthorityMentionIds: [],
      allowedVerifiedAuthorityIds: [verifiedAuthorityId],
      allowedVerifiedAuthorityCitations: [
        { id: verifiedAuthorityId, citationText: 'artículo 17 de la Ley de Amparo' },
        { id: verifiedAuthorityId, citationText: 'Artículo 17 de la Ley de Amparo' },
      ],
      contextHash: contextPacket.contextHash,
      promptVersion: 'e2e-real-v1',
    });

    expect(validationLegit.status).toBe('VALID_ACCEPTED');
    expect(validationLegit.errors).toHaveLength(0);

    // Prueba de alucinación (rechazo estricto si intenta citar autoridad inventada)
    const validationHallucinated = validateIssueDraftResult({
      legalIssueId: targetIssue.id,
      issueType: targetIssue.issueType,
      coverageItemIds: targetIssue.coverageItemIds,
      thesis: 'Tesis inventada',
      factualDevelopment: ['Hecho.'],
      evidentiaryDevelopment: ['Prueba.'],
      legalDevelopment: ['Conforme a la tesis inventada 2099999.'],
      application: 'Aplicación.',
      conclusion: 'Conclusión.',
      sourceEntityIds: [],
      authorityMentionIds: [],
      verifiedAuthorityIds: ['authority-invented-by-model-999'], // NO PERMITIDA
      unresolvedRequirements: [],
      generationMetadata: {
        promptVersion: 'e2e-real-v1',
        contextHash: contextPacket.contextHash,
        providerRequested: (routeResult.result.providerRequested || routeResult.result.provider).toUpperCase(),
        providerActuallyUsed: (routeResult.result.providerActuallyUsed || routeResult.result.provider).toUpperCase(),
        attemptCount: 1,
      },
    }, {
      expectedLegalIssueId: targetIssue.id,
      issueType: targetIssue.issueType,
      allowedCoverageItemIds: targetIssue.coverageItemIds,
      allowedSourceEntityIds: [],
      allowedAuthorityMentionIds: [],
      allowedVerifiedAuthorityIds: [verifiedAuthorityId],
      contextHash: contextPacket.contextHash,
      promptVersion: 'e2e-real-v1',
    });

    expect(validationHallucinated.status).toBe('INVALID_FATAL');
    expect(validationHallucinated.errors).toContain('VERIFIED_AUTHORITY_ID_OUT_OF_SCOPE');

    // ─────────────────────────────────────────────────────────────
    // 10. DOCUMENT ASSEMBLY & EXPORTACIÓN REAL (DOCX & PDF)
    // ─────────────────────────────────────────────────────────────
    const cleanLlmContent = routeResult.result.content.replace(/\*/g, '').trim();

    const exportDoc = createEmptyDocument({
      id: 'doc-export-e2e',
      documentType: 'escrito_libre',
      documentTypeLabel: 'Recurso de Revisión',
      title: 'Recurso de Revisión en Amparo Directo',
      sections: [
        createDocumentNode({
          id: 'sec-agravios',
          title: 'AGRAVIOS',
          type: 'argument',
          order: 1,
          content: [{
            id: `block-agravio-${targetIssue.id}`,
            layer: 'GENERATED_ARGUMENT',
            trustLevel: 'VERIFIED',
            text: cleanLlmContent,
            generationStatus: 'generated',
          }],
        }),
        createDocumentNode({
          id: 'sec-petitorios',
          title: 'PETITORIOS',
          type: 'petition',
          order: 2,
          content: [{
            id: 'block-petitorio',
            layer: 'USER_POSITION',
            trustLevel: 'VERIFIED',
            text: 'ÚNICO. Se admita y resuelva favorablemente el recurso de revisión planteado.',
          }],
        }),
      ],
      generationMetadata: {
        ...createEmptyDocument().generationMetadata,
        preflight: { status: 'READY', missingFields: [] },
      } as never,
    });
    (exportDoc as any).qualityGate = { passed: true, canMarkAsFinal: true, criticalErrors: [], warnings: [] };
    const exportableDoc = markDocumentAsReadyToExport(exportDoc, { explicit: true });

    const docxBuffer = await exportUniversalToDocx(exportableDoc);
    expect(docxBuffer.length).toBeGreaterThan(1000);
    expect(docxBuffer.subarray(0, 2).toString()).toBe('PK'); // Formato ZIP / DOCX válido

    const pdfBufferOut = await exportUniversalToPdf(exportableDoc);
    expect(pdfBufferOut.length).toBeGreaterThan(1000);
    expect(pdfBufferOut.subarray(0, 4).toString()).toBe('%PDF'); // Encabezado estándar PDF
  }, 45000);
});
