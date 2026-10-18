import 'server-only';
import { NextRequest } from 'next/server';
import { desktopDraftRepository } from '@/lib/workspace/desktopDraftRepository';
import { DesktopProfileRepository } from '@/lib/workspace/desktopProfileRepository';
import { requireLawyerAccess, type LawyerAccessContext } from './lawyerAuth';

export interface ExecutionOwner {
  organizationId?: string;
  userId?: string;
  desktopOwnerId?: string;
}
export type ExecutionContext = (LawyerAccessContext & { kind: 'WEB'; desktopOwnerId?: undefined })
  | { kind: 'DESKTOP_LOCAL'; desktopOwnerId: string; lawyerId: string; organizationId?: undefined; userId?: undefined };
export async function requireWorkspaceExecutionAccess(request: NextRequest, configured = false): Promise<
  { ok: true; context: ExecutionContext } | { ok: false; response: Response }> {
  const local = desktopDraftRepository(request);
  if (!local) {
    const access = await requireLawyerAccess(request);
    return access.ok ? { ok: true, context: { ...access.context, kind: 'WEB' } } : access;
  }
  if (!local.ok) return local;
  try {
    const owner = await new DesktopProfileRepository().load();
    if (configured && !owner.profile.lawyerName.trim()) return { ok: false, response: Response.json({ ok: false,
      errorCode: 'DESKTOP_PROFILE_CONFIGURATION_REQUIRED', message: 'Configura el nombre del abogado en Configuración antes de generar.' }, { status: 422 }) };
    return { ok: true, context: { kind: 'DESKTOP_LOCAL', desktopOwnerId: owner.ownerId, lawyerId: owner.ownerId } };
  } catch {
    return { ok: false, response: Response.json({ ok: false, errorCode: 'DESKTOP_IDENTITY_UNAVAILABLE' }, { status: 503 }) };
  }
}
export function executionOwnerKey(owner: ExecutionOwner): string {
  return owner.desktopOwnerId ? `desktop:${owner.desktopOwnerId}` : `${owner.organizationId}:${owner.userId}`;
}
export function ownsExecution(record: ExecutionOwner, owner: ExecutionOwner): boolean {
  return owner.desktopOwnerId ? record.desktopOwnerId === owner.desktopOwnerId
    : !record.desktopOwnerId && record.organizationId === owner.organizationId && record.userId === owner.userId;
}
