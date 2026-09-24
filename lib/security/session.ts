import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'jr_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface SessionPrincipal {
  userId: string;
  organizationId: string;
  issuedAt: number;
  exp: number;
}

function sessionSecret(): string | null {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === 'production' ? null : 'dev-session-secret';
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(input: { userId: string; organizationId: string; now?: number }): string {
  const secret = sessionSecret();
  if (!secret) throw new Error('SESSION_SECRET_REQUIRED');
  const issuedAt = input.now ?? Date.now();
  const payload = Buffer.from(JSON.stringify({
    userId: input.userId,
    organizationId: input.organizationId,
    issuedAt,
    exp: issuedAt + SESSION_TTL_MS,
  })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string, now = Date.now()): SessionPrincipal | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const [payload, providedSignature] = token.split('.');
  if (!payload || !providedSignature) return null;
  const expectedSignature = sign(payload, secret);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<SessionPrincipal>;
    const exp = Number(parsed.exp);
    if (!parsed.userId || !parsed.organizationId || !Number.isFinite(exp) || exp <= now) return null;
    return {
      userId: String(parsed.userId),
      organizationId: String(parsed.organizationId),
      issuedAt: Number(parsed.issuedAt || 0),
      exp,
    };
  } catch {
    return null;
  }
}

export function readSessionToken(request: Request): string | null {
  const direct = request.headers.get('x-session-token')?.trim();
  if (direct) return direct;
  const cookieHeader = request.headers.get('cookie') || '';
  for (const entry of cookieHeader.split(';')) {
    const [name, ...valueParts] = entry.trim().split('=');
    if (name === SESSION_COOKIE_NAME) return valueParts.join('=') || null;
  }
  return null;
}

export function buildSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`;
}
