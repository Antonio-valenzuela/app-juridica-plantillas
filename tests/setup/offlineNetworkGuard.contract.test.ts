/**
 * Contrato de la guarda offline (tests/setup/offlineNetworkGuard.ts).
 *
 * Verifica, sin tocar la red real, que:
 *  1. las credenciales de proveedores quedan neutralizadas antes de cargar módulos
 *     que leen .env (un cargador .env posterior no las repone);
 *  2. toda conexión no local se bloquea en fetch, http, https, net, tls, undici,
 *     node-fetch y en los clientes de proveedor del proyecto;
 *  3. las conexiones locales siguen funcionando;
 *  (las exclusiones de la configuración se verifican en offlineConfigExclusions.contract.test.ts:
 *   importar la configuración carga Vite, que altera fetch dentro del mismo archivo).
 *
 * Todas las URL remotas usan el TLD reservado `.invalid` (RFC 6761): aunque la
 * guarda fallara, ningún proveedor real recibiría la petición. Los aserciones
 * exigen el mensaje `[offline-guard]` para distinguir bloqueo de fallo DNS.
 */
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const GUARD = /\[offline-guard\]/;
const REMOTE = 'provider.invalid';

function requestError(make: (onError: (error: Error) => void) => void): Promise<Error> {
  return new Promise((resolve) => {
    try {
      make(resolve);
    } catch (error) {
      resolve(error as Error);
    }
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('guarda offline: credenciales', () => {
  it('neutraliza las claves de proveedores y un cargador .env posterior no las repone', async () => {
    for (const key of ['NVIDIA_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY']) {
      expect(process.env[key], key).toBe('');
    }
    expect(process.env.DATABASE_URL, 'DATABASE_URL heredada (Neon)').toBe('');
    // .env sintético en un directorio temporal: nunca se lee el .env real del repo.
    const directory = mkdtempSync(path.join(os.tmpdir(), 'lex-offline-env-'));
    writeFileSync(path.join(directory, '.env'), 'NVIDIA_API_KEY=synthetic-not-a-key\nDATABASE_URL=postgresql://synthetic@db.invalid/x\n');
    const { loadEnvConfig } = await import('@next/env');
    loadEnvConfig(directory, false, { info: () => undefined, error: () => undefined }, true);
    expect(process.env.NVIDIA_API_KEY).toBe('');
    expect(process.env.DATABASE_URL).toBe('');
  });

  it('dirige la base local a un archivo temporal del worker, nunca a la carpeta del usuario', () => {
    const databasePath = process.env.LEXPLANTILLAS_DATABASE_PATH || '';
    expect(databasePath.startsWith(os.tmpdir())).toBe(true);
  });
});

describe('guarda offline: bloqueo de red no local', () => {
  it('bloquea fetch global', async () => {
    await expect(fetch(`https://${REMOTE}/v1/models`)).rejects.toThrow(GUARD);
  });

  it('bloquea http y https', async () => {
    const httpError = await requestError((onError) => { http.get(`http://${REMOTE}/`).on('error', onError); });
    expect(httpError.message).toMatch(GUARD);
    const httpsError = await requestError((onError) => { https.get(`https://${REMOTE}/`).on('error', onError); });
    expect(httpsError.message).toMatch(GUARD);
  });

  it('bloquea net y tls directos, incluidas IP no locales', async () => {
    const failure = (make: () => net.Socket) => new Promise<Error>((resolve) => make().on('error', resolve));
    expect((await failure(() => net.connect({ host: REMOTE, port: 443 }))).message).toMatch(GUARD);
    expect((await failure(() => net.connect(443, '192.0.2.10'))).message).toMatch(GUARD);
    expect((await failure(() => tls.connect({ host: REMOTE, port: 443 }))).message).toMatch(GUARD);
  });

  it('bloquea undici y node-fetch (no usan globalThis.fetch)', async () => {
    const undici = await import('undici');
    await expect(undici.request(`https://${REMOTE}/`)).rejects.toThrow(GUARD);
    await expect(undici.fetch(`https://${REMOTE}/`)).rejects.toThrow();
    const nodeFetch = (await import('node-fetch')).default;
    await expect(nodeFetch(`https://${REMOTE}/`)).rejects.toThrow(GUARD);
  });

  it('bloquea los clientes de proveedor del proyecto aun con una clave sintética', async () => {
    vi.stubEnv('NVIDIA_API_KEY', 'synthetic-not-a-key');
    vi.stubEnv('NVIDIA_BASE_URL', `https://${REMOTE}/v1`);
    vi.stubEnv('NVIDIA_REQUEST_TIMEOUT_MS', '2000');
    const { generateNVIDIACompletion } = await import('@/lib/ai/providers/nvidia');
    const nvidiaError = await generateNVIDIACompletion({ prompt: 'prueba sintética' }).then(() => null, (error: Error) => error);
    expect(nvidiaError).toBeInstanceOf(Error);
    expect(String(nvidiaError?.message) + String((nvidiaError as { cause?: unknown })?.cause ?? '')).not.toMatch(/synthetic-not-a-key/);

    vi.stubEnv('GROQ_API_KEY', 'synthetic-not-a-key');
    vi.stubEnv('GROQ_BASE_URL', `https://${REMOTE}/openai/v1`);
    const { generateGroqCompletion } = await import('@/lib/ai/providers/groq');
    const groqError = await generateGroqCompletion({ prompt: 'prueba sintética' } as never).then(() => null, (error: Error) => error);
    expect(groqError).toBeInstanceOf(Error);
  });

  it('el fallo del proveedor se origina en la guarda (no en DNS ni en el proveedor)', async () => {
    vi.stubEnv('GROQ_API_KEY', 'synthetic-not-a-key');
    vi.stubEnv('GROQ_BASE_URL', `https://${REMOTE}/openai/v1`);
    const { generateGroqCompletion } = await import('@/lib/ai/providers/groq');
    const error = await generateGroqCompletion({ prompt: 'prueba sintética' } as never).then(() => null, (e: Error) => e);
    const chain: string[] = [];
    for (let current: unknown = error; current instanceof Error; current = (current as { cause?: unknown }).cause) chain.push(current.message);
    expect(chain.join(' | ')).toMatch(GUARD);
  });
});

describe('guarda offline: conexiones locales permitidas', () => {
  it('permite fetch a 127.0.0.1', async () => {
    const server = http.createServer((_request, response) => response.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as net.AddressInfo;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      expect(await response.text()).toBe('ok');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
