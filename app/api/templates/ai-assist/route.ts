import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/security/adminAuth';
import {
  developWithAI,
  isAllowedTemplateAiSection,
  sanitizeTemplateCaseContext,
} from '@/lib/templates/aiAssist';
import { PROFESSIONAL_TEMPLATES } from '@/lib/templates/templateDefinitions';
import { collectVerifiedTemplateSources } from '@/lib/templates/verifiedSourceRepository';

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

const isRateLimited = (ip: string): boolean => {
  const now = Date.now();
  const recent = (rateLimitMap.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS
  );
  if (recent.length >= RATE_LIMIT_MAX) return true;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return false;
};

const asLimitedString = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
};

import { requireLawyerAccess } from '@/lib/security/lawyerAuth';

export async function POST(request: Request) {
  const auth = await requireLawyerAccess(request);
  if (!auth.ok) return auth.response;

  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientAddress = forwardedFor?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(clientAddress)) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.' },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const templateId = asLimitedString(body.templateId, 100);
    const sectionId = asLimitedString(body.sectionId, 100);
    const userInput = asLimitedString(body.userInput, 5_000);

    const template = PROFESSIONAL_TEMPLATES.find(
      (candidate) => candidate.id === templateId
    );
    const validSection =
      sectionId &&
      template?.sections.some((section) => section.id === sectionId) &&
      isAllowedTemplateAiSection(sectionId);

    if (!template || !sectionId || !userInput || !validSection) {
      return NextResponse.json(
        {
          error:
            'La plantilla, la sección o la instrucción no son válidas para asistencia de IA.',
        },
        { status: 400 }
      );
    }

    // Los repositorios Norma/Jurisprudencia pueden no existir en este schema
    // (instalaciones sin el módulo de indexación legal). La ausencia de fuentes
    // verificadas NO debe tumbar el endpoint: degrada a lista vacía.
    const safeFindMany = async (model: any, args: any): Promise<any[]> => {
      try {
        if (!model || typeof model.findMany !== 'function') return [];
        return await model.findMany(args);
      } catch (err) {
        console.warn('[ai-assist] Repositorio de fuentes no disponible, continuando sin él:', err instanceof Error ? err.message : err);
        return [];
      }
    };

    const [normas, jurisprudencia] = await Promise.all([
      safeFindMany((prisma as any).norma, {
        where: {
          verificationStatus: 'verified',
          lastVerifiedAt: { not: null },
          urlBase: { not: null },
          versions: { some: { text: { not: null } } },
        },
        select: {
          id: true,
          nombre: true,
          urlBase: true,
          verificationStatus: true,
          lastVerifiedAt: true,
          versions: {
            orderBy: { verifiedAt: 'desc' },
            take: 1,
            select: { text: true },
          },
        },
        take: 20,
      }),
      safeFindMany((prisma as any).jurisprudencia, {
        where: {
          verificationStatus: 'verified',
          lastVerifiedAt: { not: null },
          officialUrl: { not: null },
        },
        select: {
          id: true,
          rubro: true,
          text: true,
          officialUrl: true,
          verificationStatus: true,
          lastVerifiedAt: true,
        },
        orderBy: { lastVerifiedAt: 'desc' },
        take: 20,
      }),
    ]);

    const result = await developWithAI({
      templateId: template.id,
      sectionId,
      userInput,
      caseContext: sanitizeTemplateCaseContext(body.caseContext),
      verifiedSources: collectVerifiedTemplateSources(normas, jurisprudencia),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error en API ai-assist:', error);
    return NextResponse.json(
      { error: 'No fue posible generar la propuesta asistida.' },
      { status: 500 }
    );
  }
}
