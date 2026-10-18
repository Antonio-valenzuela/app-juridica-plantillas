import { fork, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createDesktopSession, assertPortAvailable, launchDesktopLocal } from '../desktop/local-launcher.mjs';

const port = 3200;
await assertPortAvailable(port);
const logs = [];
const launcherMode=process.argv.includes('--launcher');
const owned=launcherMode?await launchDesktopLocal({projectDir:process.cwd(),port,development:false,onOutput:line=>logs.push(line)}):null;
const session = owned || createDesktopSession({port});
const report = {startedAt:new Date().toISOString(), status:'FAIL', command:launcherMode?'production launcher → standalone':'node scripts/start-standalone.mjs'};
const child = owned?null:fork('scripts/start-standalone.mjs', [], {
  cwd:process.cwd(), env:{...session.env, PORT:String(port), DEMO_MODE_ENABLED:'false'},
  stdio:['ignore','pipe','pipe','ipc'], windowsHide:true,
});
if(child)for (const stream of [child.stdout, child.stderr]) stream.on('data', b => logs.push(String(b).replaceAll(session.capability,'[REDACTED]')));
const exited = child?new Promise(resolve => child.once('exit', resolve)):null;
const base = `http://127.0.0.1:${port}`;
try {
  let response;
  for (let i=0;i<120;i++) {
    if (child && child.exitCode !== null) throw new Error('STANDALONE_EARLY_EXIT');
    try {response = await fetch(`${base}/machotes`, {signal:AbortSignal.timeout(2000)}); if(response.status===200) break;} catch {}
    await new Promise(resolve => setTimeout(resolve,250));
  }
  assert.equal(response?.status,200);
  const html = await response.text();
  report.appStatus=200;
  const assets = [...new Set([...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map(match=>match[1]))];
  assert.ok(assets.length>0);
  report.assets=[];
  for (const asset of assets) {
    const reply = await fetch(new URL(asset.replaceAll('&amp;','&'),base));
    assert.equal(reply.status,200); report.assets.push({asset,status:reply.status,bytes:(await reply.arrayBuffer()).byteLength});
  }
  report.listener=execFileSync('netstat',['-ano','-p','tcp'],{encoding:'utf8'}).split(/\r?\n/).filter(line=>/:3200\s/.test(line)&&/LISTENING/.test(line));
  assert.ok(report.listener.length>0);
  assert.ok(report.listener.every(line=>/127\.0\.0\.1:3200/.test(line)));
  const headers={'x-lex-desktop-capability':session.capability};
  const metadata=await fetch(`${base}/api/operational-manual`,{headers});
  report.metadataStatus=metadata.status; assert.equal(metadata.status,200);
  const {manifest}=await metadata.json();
  report.manifest={version:manifest.version,pageCount:manifest.pageCount,fragmentCount:manifest.fragmentCount};
  assert.deepEqual(report.manifest,{version:'1.0',pageCount:212,fragmentCount:6860});
  const pdf=await fetch(`${base}/api/operational-manual/original`,{headers});
  report.pdfStatus=pdf.status; assert.equal(pdf.status,200);
  report.pdfSha256=createHash('sha256').update(Buffer.from(await pdf.arrayBuffer())).digest('hex');
  assert.equal(report.pdfSha256,'b3910bb8a0b44bd1a38d3fe9edbd32984ade48b6b66c7bf62b01db3e79348f25');
  report.status='PASS';
} catch(error) {report.error=error.message;process.exitCode=1;}
finally {
  if(child && child.exitCode===null && child.connected) child.send({type:'desktop-close'});
  await Promise.race([owned?owned.close():exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('STANDALONE_SHUTDOWN_TIMEOUT')),15000).unref())]);
  await assertPortAvailable(port); report.shutdownPortClosed=true;
  const dir='audit/final-pre-windows-readiness'; await mkdir(dir,{recursive:true});
  const name=launcherMode?'standalone-launcher-runtime':'standalone-runtime';
  await writeFile(`${dir}/${name}.json`,JSON.stringify(report,null,2));
  await writeFile(`${dir}/${name}.log`,logs.join(''));
  console.log(JSON.stringify(report,null,2));
}
