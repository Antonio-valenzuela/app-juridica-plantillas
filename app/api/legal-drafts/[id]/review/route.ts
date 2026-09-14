import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCaseAccess } from '@/lib/cases/access';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await requireCaseAccess(request);
    if (!access.ok) return access.response;
    const identity = { organizationId: access.context.organizationId, userId: access.context.userId };

    const draft = await prisma.legalDraft.findFirst({
      where: { id, organizationId: identity.organizationId },
    });

    if (!draft) {
      return NextResponse.json({ ok: false, error: 'Borrador no encontrado.' }, { status: 404 });
    }

    const formData = (draft.formData as Record<string, any>) || {};
    const text = draft.renderedText || '';
    const pendingMarkers = (draft.pendingMarkers as string[]) || [];

    const issues: any[] = [];
    const consistencyProblems: string[] = [];

    // Contradiction Check (e.g. Amparo Indirecto)
    const petitorios = String(formData.petitorios || formData.puntos_petitorios || text).toLowerCase();
    const hechos = String(formData.hechos || formData.antecedentes || '').trim();
    const actoReclamado = String(formData.acto_reclamado || '').trim();

    const mentionsDetention = /secuestro|privación de libertad|detención|incomunicación|tortura|aprehensión/i.test(petitorios);
    const hasFacts = hechos.length > 20;
    const hasAct = actoReclamado.length > 5;

    if (mentionsDetention && (!hasFacts || !hasAct)) {
      const msg = 'Los puntos petitorios presuponen una privación de libertad, pero el documento no contiene hechos ni acto reclamado que sustenten ese supuesto.';
      consistencyProblems.push(msg);
      issues.push({
        id: 'issue-contradiction-libertad',
        severity: 'critical',
        section: 'puntos_petitorios',
        title: 'Incongruencia entre hechos y puntos petitorios',
        explanation: msg,
        currentText: formData.petitorios || 'SEGUNDO.- Conceder la suspensión provisional contra la privación de libertad...',
        suggestedText: 'SEGUNDO.- Conceder la suspensión provisional respecto de los actos reclamados descritos en el capítulo correspondiente...',
      });
    }

    // Pending markers
    if (pendingMarkers.length > 0) {
      issues.push({
        id: 'issue-pending-markers',
        severity: 'warning',
        section: 'general',
        title: 'Campos jurídicos pendientes de validar',
        explanation: `Existen ${pendingMarkers.length} campo(s) o marcador(es) pendientes: ${pendingMarkers.join(', ')}`,
        currentText: pendingMarkers.join(', '),
        suggestedText: 'Completar los valores indicados en el formulario.',
      });
    }

    return NextResponse.json({
      ok: true,
      draftId: draft.id,
      summary: `Revisión completada para el borrador "${draft.title}". Se identificaron ${issues.length} observación(es).`,
      issues,
      consistencyProblems,
      pendingMarkers,
      reviewedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Error en la revisión del borrador.' },
      { status: 500 }
    );
  }
}
