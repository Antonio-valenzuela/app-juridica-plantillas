import { randomBytes } from 'node:crypto';
import { fork } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

export function createDesktopSession({ port = 3200, lifetimeMs = 8 * 60 * 60 * 1000, inheritedEnv = process.env } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_DESKTOP_PORT');
  if (!Number.isInteger(lifetimeMs) || lifetimeMs <= 0 || lifetimeMs > 24 * 60 * 60 * 1000) throw new Error('INVALID_DESKTOP_LIFETIME');
  const capability = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + lifetimeMs;
  return { capability, expiresAt, env: { ...inheritedEnv, LEX_RUNTIME_MODE: 'DESKTOP_LOCAL',
    LEX_DESKTOP_BIND_ADDRESS: '127.0.0.1', LEX_DESKTOP_PORT: String(port),
    LEX_DESKTOP_CAPABILITY: capability, LEX_DESKTOP_EXPIRES_AT: String(expiresAt) } };
}

export async function assertPortAvailable(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
}

/** Trusted native UI host adapter: keep capability in host memory, never in URLs. */
export async function launchDesktopLocal({ projectDir, port = 3200, development = false, onOutput = () => {}, readinessTimeoutMs = 120000 } = {}) {
  const session = createDesktopSession({ port });
  await assertPortAvailable(port);
  const worker = fork(fileURLToPath(new URL('./local-worker.mjs', import.meta.url)), [], {
    cwd: projectDir, env: session.env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
  });
  let exited = false;
  const exit = new Promise(resolve => worker.once('exit', () => { exited = true; resolve(); }));
  worker.on('message', message => {
    if (message?.type === 'output') onOutput(String(message.text).replaceAll(session.capability, '[REDACTED]'));
  });
  worker.send({ type: 'start', projectDir, port, development });
  const close = async () => { if (!exited && worker.connected) worker.send({ type: 'close' }); await exit; };
  const baseUrl = `http://127.0.0.1:${port}`;
  const started = Date.now();
  try {
    while (Date.now() - started < readinessTimeoutMs) {
      if (exited) throw new Error('DESKTOP_BACKEND_EXITED');
      try {
        const response = await fetch(`${baseUrl}/api/desktop-local/session`, {
          method: 'POST', headers: { 'x-lex-desktop-capability': session.capability }, signal: AbortSignal.timeout(5000),
        });
        if (response.status === 204) return { baseUrl, capability: session.capability, expiresAt: session.expiresAt, backendPid: worker.pid, close };
      } catch { /* Readiness connection retry only; no legal/provider operation. */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('DESKTOP_BACKEND_READINESS_TIMEOUT');
  } catch (error) { await close(); throw error; }
}
