import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

export const DESKTOP_MANUAL_COOKIE = 'lex_desktop_manual_cap';
type Access = { ok: true } | { ok: false; response: Response };

export function getRuntimeMode(): 'WEB' | 'DESKTOP_LOCAL' | 'INVALID' {
  const mode = process.env.LEX_RUNTIME_MODE;
  return !mode || mode === 'WEB' ? 'WEB' : mode === 'DESKTOP_LOCAL' ? mode : 'INVALID';
}

function denied(status: number, error: string): Access {
  return { ok: false, response: Response.json({ ok: false, error }, {
    status, headers: { 'Cache-Control': 'private, no-store' },
  }) };
}

/** Process configuration comes from the trusted launcher, never from HTTP input. */
export function requireDesktopLocalAccess(request: NextRequest, options: { allowCookie?: boolean } = {}): Access {
  const secret = process.env.LEX_DESKTOP_CAPABILITY ?? '';
  const port = Number(process.env.LEX_DESKTOP_PORT);
  const deadline = Number(process.env.LEX_DESKTOP_EXPIRES_AT);
  if (getRuntimeMode() !== 'DESKTOP_LOCAL' || process.env.LEX_DESKTOP_BIND_ADDRESS !== '127.0.0.1'
    || !Number.isInteger(port) || port < 1 || port > 65535
    || !Number.isFinite(deadline) || deadline <= Date.now() || !/^[a-f0-9]{64}$/.test(secret)) {
    return denied(503, 'DESKTOP_RUNTIME_UNAVAILABLE');
  }
  const url = request.nextUrl;
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)
    || Number(url.port || 80) !== port) return denied(403, 'DESKTOP_ACCESS_DENIED');
  const supplied = request.headers.get('x-lex-desktop-capability')
    ?? (options.allowCookie !== false ? request.cookies.get(DESKTOP_MANUAL_COOKIE)?.value : undefined);
  if (!supplied || !/^[a-f0-9]{64}$/.test(supplied)
    || !timingSafeEqual(Buffer.from(secret, 'hex'), Buffer.from(supplied, 'hex'))) {
    return denied(403, 'DESKTOP_ACCESS_DENIED');
  }
  return { ok: true };
}

export async function requireOperationalManualAccess(request: NextRequest): Promise<Access> {
  const mode = getRuntimeMode();
  if (mode === 'DESKTOP_LOCAL') return requireDesktopLocalAccess(request);
  if (mode === 'INVALID') return denied(503, 'RUNTIME_MODE_INVALID');
  const { requireLawyerAccess } = await import('./lawyerAuth');
  return requireLawyerAccess(request);
}
