import { spawn } from 'node:child_process';
import { buildDesktopBackendArgs } from './backend-command.mjs';
let backend;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  if (backend && backend.exitCode === null) {
    await new Promise(resolve => {
      backend.once('exit', resolve);
      backend.send({ type: 'desktop-close' });
    });
  }
  process.exit(0);
}
process.once('disconnect', close);
process.once('SIGTERM', close);
process.once('SIGINT', close);
const timer = setTimeout(close, Math.max(0, Number(process.env.LEX_DESKTOP_EXPIRES_AT) - Date.now()));
timer.unref();
process.on('message', message => {
  if (message?.type === 'close') void close();
  if (message?.type !== 'start' || backend || closing) return;
  backend = spawn(process.execPath, buildDesktopBackendArgs(message), {
    cwd: message.projectDir, env: {...process.env,PORT:String(message.port)}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  // Buffer by line so a secret split across stream chunks is still redacted.
  for (const stream of [backend.stdout, backend.stderr]) {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      pending += chunk;
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) if (process.connected) process.send({ type: 'output', text: line.replaceAll(process.env.LEX_DESKTOP_CAPABILITY, '[REDACTED]') });
    });
  }
  backend.once('error', () => void close());
  backend.once('exit', () => void close());
});
