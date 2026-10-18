/**
 * Benchmark reproducible NVIDIA: mismos casos sintéticos, mismos criterios,
 * para cada modelo indicado. Uso (desde la raíz del repo):
 *
 *   npx tsx scripts/benchmark/nvidia-legal-bench/run.ts --dry-run
 *   npx tsx scripts/benchmark/nvidia-legal-bench/run.ts --concurrency 3 --repeats 2
 *
 * Requiere NVIDIA_API_KEY en el entorno del proceso (NO se lee de .env ni se
 * imprime). Sin credencial el script termina sin realizar llamadas.
 * El modelo se fija por proceso con NVIDIA_MODEL; no modifica .env ni la
 * configuración activa de la aplicación.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CASES, OUTPUT_SCHEMA, type BenchCase } from './cases';
import { generateNVIDIACompletion, getNvidiaModel } from '../../../lib/ai/providers/nvidia';

const MODELS = [
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
];

type Status = 'ok' | 'empty' | 'truncated' | 'invalid_json' | 'timeout' | 'rate_limited' | 'server_error' | 'error';

interface CallResult {
  model: string;
  caseId: string;
  mode: 'sequential' | 'concurrent';
  repeat: number;
  status: Status;
  latencyMs: number;
  tokensUsed: number | null;
  schemaValid: boolean;
  missingRecall: number | null;
  fabricatedTokens: string[];
  errorClass: string | null;
}

function args() {
  const argv = process.argv.slice(2);
  const get = (flag: string, fallback: number) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? Number(argv[i + 1]) : fallback;
  };
  return {
    dryRun: argv.includes('--dry-run'),
    concurrency: get('--concurrency', 3),
    repeats: get('--repeats', 1),
  };
}

function classify(error: unknown): { status: Status; errorClass: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (/Timeout de \d+ms/i.test(message)) return { status: 'timeout', errorClass: 'TIMEOUT' };
  if (/\b429\b/.test(message)) return { status: 'rate_limited', errorClass: 'HTTP_429' };
  if (/\b5\d\d\b/.test(message)) return { status: 'server_error', errorClass: 'HTTP_5XX' };
  return { status: 'error', errorClass: 'OTHER' };
}

function evaluate(testCase: BenchCase, text: string): Pick<CallResult, 'status' | 'schemaValid' | 'missingRecall' | 'fabricatedTokens'> {
  const fabricatedTokens = testCase.forbiddenTokens.filter(token => text.includes(token));
  if (!text.trim()) return { status: 'empty', schemaValid: false, missingRecall: null, fabricatedTokens };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: 'invalid_json', schemaValid: false, missingRecall: null, fabricatedTokens };
  }
  const required = (OUTPUT_SCHEMA as { required: readonly string[] }).required;
  const schemaValid = required.every(key => key in parsed)
    && typeof parsed.resumen === 'string'
    && Array.isArray(parsed.datosFaltantes);
  const flagged = Array.isArray(parsed.datosFaltantes) ? (parsed.datosFaltantes as string[]).join(' ').toLowerCase() : '';
  const hits = testCase.expectedMissing.filter(item => flagged.includes(item.toLowerCase())).length;
  const missingRecall = testCase.expectedMissing.length ? hits / testCase.expectedMissing.length : null;
  return { status: schemaValid ? 'ok' : 'invalid_json', schemaValid, missingRecall, fabricatedTokens };
}

async function runOne(model: string, testCase: BenchCase, mode: CallResult['mode'], repeat: number): Promise<CallResult> {
  process.env.NVIDIA_MODEL = model;
  const started = Date.now();
  try {
    const result = await generateNVIDIACompletion({
      prompt: testCase.prompt,
      systemPrompt: testCase.systemPrompt,
      temperature: 0,
      maxTokens: 1200,
      outputSchema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
    });
    const latencyMs = Date.now() - started;
    const evaluated = evaluate(testCase, result.text);
    const status = result.isTruncated && evaluated.status === 'ok' ? 'truncated' : evaluated.status;
    return { model, caseId: testCase.id, mode, repeat, latencyMs, tokensUsed: result.tokensUsed ?? null, errorClass: null, ...evaluated, status };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const { status, errorClass } = classify(error);
    return { model, caseId: testCase.id, mode, repeat, status, latencyMs, tokensUsed: null, schemaValid: false, missingRecall: null, fabricatedTokens: [], errorClass };
  }
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<CallResult>): Promise<CallResult[]> {
  const results: CallResult[] = [];
  let index = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      results.push(await worker(current));
    }
  });
  await Promise.all(lanes);
  return results;
}

async function main() {
  const { dryRun, concurrency, repeats } = args();
  const plan = MODELS.flatMap(model => CASES.flatMap(testCase =>
    Array.from({ length: repeats }, (_, repeat) => ({ model, testCase, repeat }))));
  if (dryRun) {
    console.log(JSON.stringify({ models: MODELS, cases: CASES.map(c => c.id), calls: plan.length, concurrency, repeats, configuredModelNow: getNvidiaModel() }, null, 2));
    return;
  }
  if (!process.env.NVIDIA_API_KEY?.trim()) {
    console.log('SIN CREDENCIAL: NVIDIA_API_KEY no está en el entorno del proceso. No se realizó ninguna llamada.');
    process.exit(2);
  }

  const sequential: CallResult[] = [];
  for (const item of plan) sequential.push(await runOne(item.model, item.testCase, 'sequential', item.repeat));

  const startedConcurrent = Date.now();
  const concurrent = await runPool(plan, concurrency, item => runOne(item.model, item.testCase, 'concurrent', item.repeat));
  const concurrentWallMs = Date.now() - startedConcurrent;

  const outDir = path.resolve('audit/benchmarks/nvidia');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(outDir, `nvidia-legal-bench-${stamp}.json`);
  writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), concurrency, repeats, concurrentWallMs, cases: CASES.map(c => c.id), results: [...sequential, ...concurrent] }, null, 2));
  console.log(`Resultados escritos en ${path.relative(process.cwd(), file)}`);
}

main().catch(error => {
  console.error('Fallo del benchmark:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
