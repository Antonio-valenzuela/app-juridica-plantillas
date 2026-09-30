import { it, expect } from 'vitest';
import nextEnv from '@next/env';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { controlledSource, controlledDocument, type ControlledMatter } from '@/tests/fixtures/controlledLegalQuality';
import { auditLegalArgumentStructure } from '@/lib/legal-engine/legalArgumentContract';
import { createDocumentNode } from '@/lib/legal-engine/types';

// Explicit opt-in; excluded from ordinary deterministic verification.
it.skipIf(process.env.LEGAL_QUALITY_LIVE_SMOKE !== 'true')('one sanitized legal-contract smoke per type with unchanged router', async () => {
  nextEnv.loadEnvConfig(process.cwd(), false);
  const { defaultProviderRouter } = await import('@/lib/ai/providerRouter');
  const { getProviderChain } = await import('@/lib/ai/providerChain');
  const { redactSecrets } = await import('@/lib/ai/providers/types');
  const dir = 'audit/final-pre-windows-readiness/legal-quality-causal/live-smoke';
  await mkdir(dir, { recursive: true });
  for (const id of ['contestacion', 'apelacion', 'amparo', 'penal'] as ControlledMatter[]) {
    const output = `${dir}/${id}.json`;
    const source = controlledSource(id);
    const journey = JSON.parse(await readFile(`audit/final-pre-windows-readiness/controlled-cases/${id}/journey.json`, 'utf8'));
    const report: Record<string, unknown> = { case: id, classification: 'SANITIZED_RAW_PROVIDER_LEGAL_CONTRACT_SMOKE_NOT_PIPELINE_CERTIFICATION', startedAt: new Date().toISOString(), chain: getProviderChain(), status: 'STARTED' };
    // Exclusive intention record prevents an interrupted call from being repeated.
    await writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx' });
    if (!process.env.GROQ_API_KEY && !process.env.NVIDIA_API_KEY && !process.env.GEMINI_API_KEY) {
      report.status = 'SKIPPED_NO_CREDENTIALS';
    } else try {
      const labels = id === 'amparo' ? 'ACTO RECLAMADO; RAZONAMIENTO DE LA AUTORIDAD; NORMA; HECHO/CONSTANCIA; CONTRADICCIÓN JURÍDICA; AFECTACIÓN; EFECTO'
        : id === 'contestacion' ? 'HECHO DE LA ACTORA; POSTURA; FUNDAMENTO FÁCTICO; PRUEBA; RIESGO'
        : 'RESOLUCIÓN COMBATIDA; CONSIDERACIÓN ESPECÍFICA; ERROR ATRIBUIDO; NORMA/CUESTIÓN JURÍDICA; CONSTANCIA DEL EXPEDIENTE; RAZONAMIENTO; PERJUICIO/TRASCENDENCIA; EFECTO QUE SE SOLICITA';
      const routed = await defaultProviderRouter.route({ requestId: `sanitized-legal-contract-${id}`, externalProviderOptIn: true, privateCaseContext: false,
        userMessage: `Ejercicio ficticio sanitizado, no expediente real. ${source.extractedText}\nInstrucción del abogado: ${journey.CASE_ANALYSIS ? ({contestacion:'Admitir celebración del convenio; negar saldo probado, no afirmar pago.',apelacion:'Cuestionar falta de explicación individual de pertinencia; pedir nueva decisión motivada sobre admisión.',amparo:'Cuestionar negativa sin motivo individual; pedir recibir y resolver petición.',penal:'Revisar motivación individual y posibilidad de contradicción, sin confirmar recurribilidad.'}[id]) : ''}\nRedacta una unidad con estos rótulos literales, cada uno en línea propia seguido de dos puntos: ${labels}. La constancia y el razonamiento de autoridad deben citar literalmente la fuente. No inventes normas, pruebas, delitos, notificación, procedencia ni plazos. Lo desconocido debe decir [DATO PENDIENTE: descripción]. No certifiques el escrito. Máximo 500 palabras.`,
        taskType: `sanitized-legal-contract-${id}`, maxTokens: 900 });
      report.provider = routed.result.provider; report.model = routed.result.model; report.executionLogs = routed.executionLogs;
      report.successfulLegalAI = routed.result.success && routed.result.provider !== 'local';
      report.output = redactSecrets(routed.result.content);
      const doc = controlledDocument(id);
      doc.sections = [createDocumentNode({ id: 'smoke-unit', title: id === 'amparo' ? 'CONCEPTOS DE VIOLACIÓN' : id === 'contestacion' ? 'CONTESTACIÓN DE HECHOS' : 'AGRAVIOS', type: 'argument', content: [{ id: 'smoke-output', text: String(report.output), layer: 'GENERATED_ARGUMENT', trustLevel: 'UNVERIFIED' }] })];
      report.findings = auditLegalArgumentStructure(doc);
      report.status = 'REVIEW_REQUIRED_NOT_CERTIFIED';
      report.limit = 'Raw provider response, not materialized app output. No official authority verified, no coverage credited, no FINAL. Contestacion audit here detects synthetic placeholders only, not completeness of each factual response.';
    } catch (error) { report.status = 'PROVIDER_ERROR'; report.error = redactSecrets(String(error)); }
    report.completedAt = new Date().toISOString();
    await writeFile(output, JSON.stringify(report, null, 2));
    console.log(`SANITIZED_LEGAL_SMOKE ${id} ${report.status} ${report.provider || 'NONE'}`);
  }
  expect(process.env.NODE_ENV).toBe('test');
}, 240000);
