import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {launchDesktopLocal,assertPortAvailable} from '../desktop/local-launcher.mjs';
const session=await launchDesktopLocal({projectDir:process.cwd(),port:3200,development:false});
const report={classification:'MOCKED_INFRASTRUCTURE_TEST',startedAt:new Date().toISOString(),command:'npm run test:e2e',status:'FAIL'};
let output='';
try {
  const child=spawn('powershell.exe',['-NoProfile','-Command','npm run test:e2e'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output+=String(b);});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  report.exitCode=code;report.status=code===0?'PASS':'FAIL';
  report.scope='Existing Playwright mocked endpoints only. Not visual inspection, database proof or real provider generation.';
  process.exitCode=code||0;
}finally {
  await session.close();await assertPortAvailable(3200);report.shutdownPortClosed=true;
  await writeFile('audit/final-pre-windows-readiness/standalone-e2e.log',output);
  await writeFile('audit/final-pre-windows-readiness/standalone-e2e.json',JSON.stringify(report,null,2));
  console.log(output);console.log(JSON.stringify(report,null,2));
}
