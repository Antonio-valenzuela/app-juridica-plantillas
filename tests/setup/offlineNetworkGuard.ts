/**
 * Guarda de red para las suites OFFLINE (vitest.offline.config.ts y
 * vitest.evidence.config.ts).
 *
 * 1. Claves de proveedores de IA fijadas a cadena vacía. No basta con borrarlas:
 *    cargadores de .env que se ejecutan después (p. ej. al importar rutas de Next)
 *    vuelven a definir las variables AUSENTES, pero no sobrescriben las existentes.
 * 2. Bloqueo de conexiones TCP/TLS a cualquier host no local. Cubre fetch, http,
 *    https y SDKs que no pasan por globalThis.fetch.
 * 3. Bloqueo explícito de fetch a hosts no locales (mensaje claro).
 *
 * Un test que necesite simular un proveedor debe usar un doble (vi.stubGlobal,
 * vi.mock); esos dobles no abren sockets y siguen funcionando.
 */
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const PROVIDER_ENV_KEYS = [
  'NVIDIA_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
];
for (const key of PROVIDER_ENV_KEYS) process.env[key] = '';

// 1b. URL heredada de Neon/Postgres: el motor de Prisma abre sockets desde código
//     nativo (fuera de node:net), así que la guarda de sockets no lo cubriría.
//     La persistencia es SQLite local; esta variable no debe existir en las pruebas.
process.env.DATABASE_URL = '';

// 1c. Base SQLite local de las pruebas: archivo temporal por worker, nunca la
//     carpeta de datos real del usuario (%LOCALAPPDATA%\LexPlantillas).
if (!process.env.LEXPLANTILLAS_DATABASE_PATH?.trim()) {
  process.env.LEXPLANTILLAS_DATABASE_PATH = path.join(
    os.tmpdir(),
    `lexplantillas-offline-${process.pid}-${process.env.VITEST_POOL_ID ?? '0'}`,
    'lexplantillas.db',
  );
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '']);

function isLocalHost(host: string | undefined): boolean {
  const value = (host || '').toLowerCase();
  return LOCAL_HOSTS.has(value) || value.endsWith('.localhost');
}

function blocked(host: string | undefined): Error {
  return new Error(`[offline-guard] Conexión de red bloqueada en la suite offline: ${host}`);
}

/** Extrae el host de los argumentos de net.connect / tls.connect / Socket#connect. */
function hostFromConnectArgs(args: unknown[]): string | undefined {
  // net.connect / http / https llaman socket.connect(normalizedArgs): un ÚNICO
  // argumento que es el arreglo [options, cb]. Sin desenvolverlo, la guarda lo
  // trataba como socket local y la conexión llegaba a DNS (hueco medido 2026-10-13).
  if (args.length >= 1 && Array.isArray(args[0])) return hostFromConnectArgs(args[0] as unknown[]);
  const [first, second] = args;
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    const options = first as { host?: string; hostname?: string; path?: string };
    if (options.path) return 'localhost';
    return options.host ?? options.hostname ?? 'localhost';
  }
  if (typeof first === 'number') return typeof second === 'string' ? second : 'localhost';
  if (typeof first === 'string' && !/^\d+$/.test(first)) return 'localhost'; // socket IPC
  return 'localhost';
}

const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(this: net.Socket, ...args: unknown[]) {
  const host = hostFromConnectArgs(args);
  if (!isLocalHost(host)) {
    // No lanzar de forma síncrona: undici/http invocan connect dentro de callbacks y
    // un throw allí queda sin manejar (la petición nunca termina). Un socket destruido
    // con error es el mismo contrato que un fallo de red real.
    const error = blocked(host);
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return (originalSocketConnect as (...a: unknown[]) => net.Socket).apply(this, args);
} as typeof net.Socket.prototype.connect;

// tls.connect abre su socket con net.Socket#connect, ya guardado arriba: el fallo
// llega como evento 'error' del socket TLS, igual que un fallo de red real.

function hostOf(input: unknown): string | undefined {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as { url?: string })?.url;
    if (!raw || !/^https?:/i.test(raw)) return undefined;
    return new URL(raw).hostname;
  } catch {
    return undefined;
  }
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const host = hostOf(input);
  if (host && !isLocalHost(host)) throw blocked(host);
  return originalFetch(input, init);
}) as typeof fetch;
