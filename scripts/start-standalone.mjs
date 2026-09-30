import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import nextEnv from '@next/env';

const root = process.cwd();
nextEnv.loadEnvConfig(root, false);
const runtime = path.join(root, '.next', 'standalone');
const port = Number(process.env.PORT || 3200);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_RUNTIME_PORT');
await access(path.join(runtime,'server.js'));
await access(path.join(runtime,'.next','static'));
const child = spawn(process.execPath, ['--import', pathToFileURL(path.join(runtime,'scripts','desktop','local-next-lifecycle.mjs')).href, path.join(runtime,'server.js')], {
  cwd: runtime,
  env: {...process.env, NODE_ENV:'production', HOSTNAME:'127.0.0.1', PORT:String(port)},
  stdio: ['inherit','inherit','inherit','ipc'],
  windowsHide: true,
});
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  if (child.connected) child.send({type:'desktop-close'});
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
process.on('message', (message) => { if (message?.type === 'desktop-close') close(); });
child.once('error', () => { console.error('STANDALONE_START_FAILED'); process.exitCode=1; });
child.once('exit', (code) => { process.exitCode = code || 0; if (process.connected) process.disconnect(); });
