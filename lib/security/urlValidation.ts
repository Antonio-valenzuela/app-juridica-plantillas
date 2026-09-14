import dns from "dns";
import { isIP } from "node:net";
import { Agent } from "undici";
import { INGEST_FETCH_MS } from "@/lib/config/timeouts";

export type UrlValidationResult =
  | { ok: true; url: string; parsed: URL }
  | { ok: false; reason: string };

const FORBIDDEN_PORTS = [
  // Base de datos
  3306,  // MySQL
  5432,  // PostgreSQL
  27017, // MongoDB
  6379,  // Redis
  
  // Servicios internos
  8080, 8081, 8443,
  9000, 9090,
  
  // Administración
  27, 23, 25, // Telnet, SMTP sin autenticación
];

const MANUAL_BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "169.254.169.254",
]);

type ResolvedAddress = { address: string; family: number };
type PinnedAgentEntry = { signature: string; agent: Agent };
const MAX_PINNED_AGENTS = 50;
const pinnedAgents = new Map<string, PinnedAgentEntry>();

export function validatePublicHttpUrl(rawUrl: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    return { ok: false, reason: "URL inválida" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, reason: "protocolo no permitido; usa http o https" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URL con credenciales no permitida" };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname) return { ok: false, reason: "host vacío" };
  if (MANUAL_BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".localhost")) {
    return { ok: false, reason: "host localhost o metadata cloud bloqueado" };
  }

  const ipVersion = isIP(hostname);
  if (ipVersion > 0 && isNonPublicIp(hostname)) {
    return { ok: false, reason: "IP privada o reservada bloqueada" };
  }

  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  if (FORBIDDEN_PORTS.includes(port)) {
    return { ok: false, reason: `puerto prohibido: ${port}` };
  }

  if (ipVersion !== 6) parsed.hostname = hostname;
  return { ok: true, url: parsed.toString(), parsed };
}

export function validateRedirectTarget(currentUrl: string, location: string | null): UrlValidationResult {
  if (!location) return { ok: false, reason: "redirect sin Location" };
  try {
    const next = new URL(location, currentUrl);
    return validatePublicHttpUrl(next.toString());
  } catch {
    return { ok: false, reason: "redirect inválido" };
  }
}

export async function validateUrlSecurity(urlString: string): Promise<{
  valid: boolean;
  error?: string;
  timeout?: number;
}> {
  try {
    const validation = validatePublicHttpUrl(urlString);
    if (!validation.ok) return { valid: false, error: validation.reason };
    await resolvePublicAddresses(validation.parsed.hostname);

    return {
      valid: true,
      timeout: parseInt(process.env.CRAWLER_TIMEOUT_MS || '30000'),
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'URL inválida',
    };
  }
}

export function normalizeUserAgent(): string {
  return 'JuridicoRadar/1.0 (Regulatoria; +https://juridico-radar.app)';
}

function parseIpv4(address: string): number[] | null {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }
  return octets;
}

function parseIpv6(address: string): number[] | null {
  let normalized = address.toLowerCase().split("%")[0];
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const ipv4 = parseIpv4(normalized.slice(lastColon + 1));
    if (!ipv4) return null;
    normalized = `${normalized.slice(0, lastColon)}:${(
      (ipv4[0] << 8) |
      ipv4[1]
    ).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }

  const compression = normalized.indexOf("::");
  if (compression !== normalized.lastIndexOf("::")) return null;
  const [leftText, rightText = ""] = compression >= 0
    ? [normalized.slice(0, compression), normalized.slice(compression + 2)]
    : [normalized, ""];
  const left = leftText ? leftText.split(":") : [];
  const right = rightText ? rightText.split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((compression < 0 && missing !== 0) || (compression >= 0 && missing < 1)) return null;

  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
  ) {
    return null;
  }

  return groups.flatMap((group) => {
    const value = Number.parseInt(group, 16);
    return [value >> 8, value & 0xff];
  });
}

function isNonPublicIpv4(octets: number[]) {
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** True unless the address is globally routable unicast Internet space. */
export function isNonPublicIp(address: string): boolean {
  const normalized = address.toLowerCase().trim().replace(/^\[|\]$/g, "");
  const family = isIP(normalized);
  if (family === 4) {
    const octets = parseIpv4(normalized);
    return !octets || isNonPublicIpv4(octets);
  }
  if (family !== 6) return true;

  const bytes = parseIpv6(normalized);
  if (!bytes) return true;

  const isMappedIpv4 = bytes.slice(0, 10).every((byte) => byte === 0)
    && bytes[10] === 0xff
    && bytes[11] === 0xff;
  if (isMappedIpv4) return isNonPublicIpv4(bytes.slice(12));

  // IPv4-compatible IPv6 is obsolete and must not bypass IPv4 filtering.
  if (bytes.slice(0, 12).every((byte) => byte === 0)) return true;

  // IPv6 global unicast is 2000::/3. Reject special-use subranges within it.
  if ((bytes[0] & 0xe0) !== 0x20) return true;
  const firstGroup = (bytes[0] << 8) | bytes[1];
  const secondGroup = (bytes[2] << 8) | bytes[3];
  if (firstGroup === 0x2001 && (secondGroup <= 0x01ff || secondGroup === 0x0db8)) return true;
  if (firstGroup === 0x2002) return true;
  if (firstGroup === 0x3fff && (secondGroup & 0xf000) === 0) return true;
  return false;
}

async function resolvePublicAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const literalFamily = isIP(normalized);
  const addresses = literalFamily
    ? [{ address: normalized, family: literalFamily }]
    : await dns.promises.lookup(normalized, { all: true, verbatim: true });

  if (addresses.length === 0) {
    throw new Error("No se pudo resolver hostname");
  }
  if (addresses.some(({ address }) => isNonPublicIp(address))) {
    throw new Error("La URL resuelve a una dirección privada o reservada");
  }

  return addresses;
}

async function getPinnedAgent(parsed: URL) {
  const addresses = await resolvePublicAddresses(parsed.hostname);
  const signature = addresses
    .map(({ address, family }) => `${family}:${address}`)
    .sort()
    .join(",");
  const key = `${parsed.protocol}//${parsed.hostname}:${parsed.port || (parsed.protocol === "https:" ? "443" : "80")}`;
  const existing = pinnedAgents.get(key);
  if (existing?.signature === signature) return existing.agent;

  if (existing) {
    pinnedAgents.delete(key);
    void existing.agent.close();
  }
  while (pinnedAgents.size >= MAX_PINNED_AGENTS) {
    const oldestKey = pinnedAgents.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldest = pinnedAgents.get(oldestKey);
    pinnedAgents.delete(oldestKey);
    if (oldest) void oldest.agent.close();
  }

  const lookupPinned = (
    _hostname: string,
    options: { all?: boolean },
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | ResolvedAddress[],
      family?: number,
    ) => void,
  ) => {
    if (options?.all) {
      callback(null, addresses);
      return;
    }
    const selected = addresses[0];
    callback(null, selected.address, selected.family);
  };

  const agent = new Agent({
    connections: 4,
    pipelining: 1,
    connect: { lookup: lookupPinned as never },
  });
  pinnedAgents.set(key, { signature, agent });
  return agent;
}

export async function fetchPinnedPublicHttpUrl(
  urlStr: string,
  init: RequestInit = {},
): Promise<Response> {
  const validation = validatePublicHttpUrl(urlStr);
  if (!validation.ok) throw new Error(`Intento SSRF bloqueado: ${validation.reason}`);

  const dispatcher = await getPinnedAgent(validation.parsed);
  return fetch(validation.url, {
    ...init,
    redirect: "manual",
    dispatcher,
  } as RequestInit & { dispatcher: Agent });
}

export async function readResponseBodyWithLimit(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`La respuesta excede el límite de ${maxBytes} bytes`);
  }

  if (!response.body) {
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > maxBytes) {
      throw new Error(`La respuesta excede el límite de ${maxBytes} bytes`);
    }
    return body;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error(`La respuesta excede el límite de ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

export async function validateUrlSafety(urlStr: string): Promise<{ safe: boolean; error?: string; ip?: string }> {
  try {
    const parsed = new URL(urlStr);
    
    // Protocol checks
    if (parsed.protocol !== "https:") {
      const isDev = process.env.NODE_ENV !== "production";
      const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      if (isDev && parsed.protocol === "http:" && isLocal) {
        // Allow in development
        return { safe: true, ip: "127.0.0.1" };
      }
      return { safe: false, error: "El protocolo debe ser HTTPS" };
    }

    const validation = validatePublicHttpUrl(urlStr);
    if (!validation.ok) return { safe: false, error: validation.reason };

    const addresses = await resolvePublicAddresses(validation.parsed.hostname);
    return { safe: true, ip: addresses[0].address };
  } catch (err: any) {
    return { safe: false, error: err.message || "URL inválida" };
  }
}

/**
 * Perform a safe fetch with SSRF mitigation.
 * Limits response size, redirects, and sets a custom timeout.
 * Uses the scoped official-source transport without changing global TLS policy.
 */
export async function safeFetch(urlStr: string, options: RequestInit = {}): Promise<Response> {
  const safety = await validateUrlSafety(urlStr);
  if (!safety.safe) {
    throw new Error(`Intento SSRF bloqueado: ${safety.error}`);
  }

  const timeoutMs = INGEST_FETCH_MS; // Use configured fetch timeout
  const maxBytes = 5 * 1024 * 1024; // 5MB limit
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentResponse = await fetchPinnedPublicHttpUrl(urlStr, {
      ...options,
      signal: controller.signal,
      redirect: "manual", // handle redirects manually to enforce validation on each step
    });

    // Enforce redirect limits (max 3)
    let redirectCount = 0;
    let currentUrl = urlStr;
    
    while ([301, 302, 307, 308].includes(currentResponse.status) && redirectCount < 3) {
      const location = currentResponse.headers.get("location");
      if (!location) break;

      // Resolve relative redirect URL
      const redirectUrl = new URL(location, currentUrl).toString();
      
      // Validate the redirected URL safety
      const redirectSafety = await validateUrlSafety(redirectUrl);
      if (!redirectSafety.safe) {
        throw new Error(`Redirección SSRF bloqueada: ${redirectSafety.error}`);
      }

      redirectCount++;
      currentUrl = redirectUrl;
      currentResponse = await fetchPinnedPublicHttpUrl(redirectUrl, {
        ...options,
        signal: controller.signal,
        redirect: "manual",
      });
    }

    if ([301, 302, 307, 308].includes(currentResponse.status)) {
      throw new Error("Demasiadas redirecciones (límite 3)");
    }

    const body = await readResponseBodyWithLimit(currentResponse, maxBytes);
    return new Response(body.byteLength > 0 ? body : null, {
      status: currentResponse.status,
      statusText: currentResponse.statusText,
      headers: currentResponse.headers,
    });
  } finally {
    clearTimeout(id);
  }
}
