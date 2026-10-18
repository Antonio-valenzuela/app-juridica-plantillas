import nextEnv from '@next/env';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd(), false);
const directory='audit/final-pre-windows-readiness';
const output=`${directory}/real-provider-smoke.json`;
try {await access(output); throw new Error('SMOKE_ALREADY_RECORDED_DO_NOT_REPEAT');} catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;}
// Disable production telemetry writes only. Providers are real, not replaced.
if (process.env.NODE_ENV !== 'test') throw new Error('SMOKE_REQUIRES_TEST_RUNTIME_TO_AVOID_PRODUCTION_TELEMETRY_WRITES');
const {getProviderChain}=await import('../../lib/ai/providerChain');
const {defaultProviderRouter}=await import('../../lib/ai/providerRouter');
const {redactSecrets}=await import('../../lib/ai/providers/types');
const frozen=['lib/ai/providerChain.ts','lib/ai/providerRouter.ts','lib/legal-engine/qualityGate.ts','lib/legal-engine/documentCoverage.ts'];
const hashes=async()=>Object.fromEntries(await Promise.all(frozen.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const before=await hashes();
const report:Record<string,unknown>={classification:'REAL_PROVIDER_SMOKE_TEST', startedAt:new Date().toISOString(),chain:getProviderChain(),telemetry:'Production Prisma writes suppressed by existing NODE_ENV=test guard; external provider implementations unchanged',frozenBefore:before};
await mkdir(directory,{recursive:true});
// Record intention before making the single request; an interrupted run cannot repeat silently.
await writeFile(output,JSON.stringify({...report,status:'STARTED'},null,2));
try {
  const routed=await defaultProviderRouter.route({
    requestId:'sanitized-pre-windows-smoke', externalProviderOptIn:true, privateCaseContext:false,
    userMessage:'PRUEBA FICTICIA, NO ES UN EXPEDIENTE REAL. La persona A manifiesta que pagó 1200 unidades a la persona B. No se adjunta comprobante. Redacta como borrador de revisión, en español, dos párrafos breves: distingue la manifestación de un hecho acreditado e indica qué documento falta. No cites artículos ni jurisprudencia, no inventes nombres, fechas, tribunales ni pruebas.',
    taskType:'sanitized-pre-windows-smoke', maxTokens:450,
  });
  report.executionLogs=routed.executionLogs;
  report.provider=routed.result.provider; report.model=routed.result.model;
  report.success=routed.result.success;
  report.output=redactSecrets(routed.result.content);
  report.status=routed.result.success && routed.result.provider!=='local' ? 'PASS':'FAIL';
  report.limit='Connectivity and restrained synthetic drafting only; not a legal quality certification or persisted app generation.';
} catch(e) {report.status='FAIL';report.error=redactSecrets(String(e));}
report.frozenAfter=await hashes();
report.frozenUnchanged=JSON.stringify(report.frozenAfter)===JSON.stringify(before);
await writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
