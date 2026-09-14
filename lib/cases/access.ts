import { prisma } from '@/lib/prisma';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';

export interface CaseAccessContext {
  organizationId: string;
  userId: string;
  role: string;
}

interface CaseAccessEnvironment {
  NODE_ENV?: string;
  LEGAL_CASES_USER_EMAIL?: string;
  LEGAL_CASES_ORG_SLUG?: string;
}

export const getCaseAccessIdentity = (
  environment: CaseAccessEnvironment = process.env
): { email: string; orgSlug: string } => {
  const isProduction = environment.NODE_ENV === 'production';
  const email =
    environment.LEGAL_CASES_USER_EMAIL?.trim().toLowerCase() ||
    (isProduction ? '' : 'demo@juridico-radar.local');
  const orgSlug =
    environment.LEGAL_CASES_ORG_SLUG?.trim().toLowerCase() ||
    (isProduction ? '' : 'demo-legal');

  if (!email || !orgSlug) {
    throw new Error(
      'Configura LEGAL_CASES_USER_EMAIL y LEGAL_CASES_ORG_SLUG para habilitar expedientes.'
    );
  }
  return { email, orgSlug };
};

export const buildMatterTenantWhere = (
  id: string,
  context: CaseAccessContext
) => ({
  id,
  organizationId: context.organizationId,
});

export const scopedChildWhere = (id: string, matterId: string) => ({
  id,
  matterId,
});

export const requireCaseAccess = async (
  request: Request
): Promise<
  | { ok: true; context: CaseAccessContext }
  | { ok: false; response: Response }
> => {
  const lawyerAuth = await requireLawyerAccess(request);
  if (!lawyerAuth.ok) return lawyerAuth;

  return {
    ok: true,
    context: {
      organizationId: lawyerAuth.context.organizationId,
      userId: lawyerAuth.context.userId,
      role: lawyerAuth.context.role,
    },
  };
};
