import nextEnv from '@next/env';
import { PrismaClient } from '@prisma/client';
import {writeFile} from 'node:fs/promises';
nextEnv.loadEnvConfig(process.cwd(),false);
const report={checkedAt:new Date().toISOString(),operation:'SELECT 1 only; no case/identity/demo writes',databaseConfigured:Boolean(process.env.DATABASE_URL),lawyerIdentityConfigured:Boolean(process.env.LEGAL_CASES_USER_EMAIL&&process.env.LEGAL_CASES_ORG_SLUG),demoEnabled:process.env.DEMO_MODE_ENABLED==='true'};
try {const url=new URL(process.env.DATABASE_URL);report.remoteDependency=!['localhost','127.0.0.1','::1'].includes(url.hostname);}catch{report.remoteDependency='INVALID_OR_MISSING_CONFIG';}
const prisma=new PrismaClient({log:[]});
try {await prisma.$queryRawUnsafe('SELECT 1 AS available');report.connectivity='PASS';}
catch(e){
  report.connectivity='FAIL';report.errorCode=e.code||'DATABASE_CONNECTION_ERROR';report.errorType=e.name;
  let message=String(e.message);
  for(const key of ['DATABASE_URL','DIRECT_URL'])if(process.env[key])message=message.replaceAll(process.env[key],'[REDACTED_DATABASE_URL]');
  report.redactedError=message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[REDACTED_DATABASE_URL]').slice(0,1200);
}
finally {await prisma.$disconnect();await writeFile('audit/final-pre-windows-readiness/persistence-readonly-probe.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
