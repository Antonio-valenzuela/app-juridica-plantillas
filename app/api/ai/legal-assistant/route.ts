import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, extractIp } from '@/lib/security/rateLimit';
import { routeLlmCompletion } from '@/lib/ai/router';
import { prisma } from '@/lib/prisma';
import { normalizeLegalDisplayText } from '@/lib/text/normalizeLegalDisplayText';
import { requireCaseAccess } from '@/lib/cases/access';
import { isDemoModeEnabled } from '@/lib/security/lawyerAuth';

export const dynamic = 'force-dynamic';

function sanitizeLogText(str: string): string {
  if (!str) return '';
  return str
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDANTED]')
    .replace(/\b\d{10,13}\b/g, '[TEL_REDACTED]');
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCaseAccess(req);
    let identity: { organizationId: string; userId: string };
    if (access.ok) {
      identity = { organizationId: access.context.organizationId, userId: access.context.userId };
    } else {
      if (!isDemoModeEnabled()) return access.response;
      identity = { organizationId: 'org-demo-legal', userId: 'user-demo-legal' };
    }

    const ip = extractIp(req);
    const rateLimitResult = checkRateLimit(ip, 30);
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { ok: false, error: 'rate_limit', friendlyMessage: 'Demasiadas solicitudes. Intente más tarde.' },
        { status: 429 }
      );
    }

    const payload = await req.json().catch(() => ({}));
    const {
      message = '',
      contextMode = 'current_document',
      contextId,
      activeDocument,
      activeCase,
      activeBulletin,
      pageContext,
      selectedSection,
    } = payload;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'invalid_message', friendlyMessage: 'El mensaje es obligatorio.' },
        { status: 400 }
      );
    }

    const cleanMessage = message.trim();
    const isMachoteQuery = /machote|documento|crear|borrador|falta|revisa|corregir|petitorio|concepto|violaci[oó]n|suspensi[oó]n/i.test(cleanMessage);

    let contextLabel = 'Sin contexto de documento';
    let issues: any[] = [];
    let consistencyProblems: string[] = [];
    let missingFields: string[] = [];
    let citations: any[] = [];
    let warnings: string[] = [];

    if (contextMode === 'current_case' && activeCase) {
      contextLabel = `Expediente activo (${activeCase.expedienteNumber || activeCase.caseId || 'Sin número'})`;
      missingFields = [];
    }

    if (contextMode === 'current_bulletin' && activeBulletin) {
      contextLabel = `Boletín activo (${activeBulletin.sourceName || activeBulletin.subscriptionId || 'Sin fuente'})`;
      missingFields = [];
    }

    // Analyze Active Document Context
    if ((contextMode === 'current_document' || isMachoteQuery) && activeDocument) {
      const docType = activeDocument.templateName || activeDocument.documentType || 'Documento jurídico';
      contextLabel = `Demanda / Borrador actual (${docType})`;

      const fields = activeDocument.fields || {};
      const previewText = activeDocument.previewText || '';
      const pendingMarkers = activeDocument.pendingMarkers || [];

      missingFields = pendingMarkers;

      // Contradiction Check (e.g. Amparo Indirecto)
      const petitoriosText = String(fields.petitorios || fields.puntos_petitorios || previewText).toLowerCase();
      const hechosText = String(fields.hechos || fields.antecedentes || '').trim();
      const actoText = String(fields.acto_reclamado || '').trim();

      const mentionsDetention = /secuestro|privaci[oó]n de libertad|detenci[oó]n|incomunicaci[oó]n|tortura|aprehensi[oó]n/i.test(petitoriosText);
      const hasFacts = hechosText.length > 20;
      const hasAct = actoText.length > 5;

      if (mentionsDetention && (!hasFacts || !hasAct)) {
        const contradictionMsg = 'Los puntos petitorios presuponen una privación de libertad, pero el documento no contiene hechos ni acto reclamado que sustenten ese supuesto.';
        consistencyProblems.push(contradictionMsg);

        issues.push({
          id: 'issue-contradiction-libertad',
          severity: 'critical',
          section: 'puntos_petitorios',
          fieldId: 'petitorios',
          title: 'Incongruencia entre hechos y puntos petitorios',
          explanation: contradictionMsg,
          currentText: fields.petitorios || 'SEGUNDO.- Conceder la suspensión provisional contra la privación de libertad...',
          suggestedText: 'SEGUNDO.- Conceder la suspensión provisional respecto de los actos reclamados descritos en el capítulo correspondiente...',
        });
      }

      if (pendingMarkers.length > 0) {
        issues.push({
          id: 'issue-pending-markers',
          severity: 'warning',
          section: 'general',
          fieldId: 'general',
          title: 'Campos pendientes de validación',
          explanation: `El documento conserva ${pendingMarkers.length} campo(s) o marcador(es) pendientes: ${pendingMarkers.join(', ')}.`,
          currentText: pendingMarkers.join(', '),
          suggestedText: 'Completar los valores indicados en el formulario.',
        });
      }
    }

    // Perform targeted RAG search filtering out SENADO_WEB and quarantined items
    if (pageContext) {
      warnings.push(`Contexto de página: ${pageContext.pageLabel || pageContext.route || 'sin etiqueta de página'}`);
    }

    if (cleanMessage.length > 5) {
      try {
        const words = cleanMessage.split(/\s+/).filter((w: string) => w.length > 3).slice(0, 4);
        if (words.length > 0) {
          const items = ((prisma as any).item ? await (prisma as any).item.findMany({
            where: {
              AND: [
                {
                  OR: words.flatMap((w: string) => [
                    { title: { contains: w, mode: 'insensitive' } },
                    { summary: { contains: w, mode: 'insensitive' } },
                  ]),
                },
                // Exclude SENADO_WEB and invalid domains
                { source: { not: 'SENADO_WEB' } },
                { source: { not: 'senado_web' } },
              ],
            },
            take: 4, }) : []);

          citations = items.map((item: any) => ({
            id: item.id,
            title: normalizeLegalDisplayText(item.title),
            fuente: normalizeLegalDisplayText(item.source || 'Fuente Oficial'),
            materia: Array.isArray(item.tema) && item.tema.length > 0 ? item.tema.join(', ') : 'Constitucional / General',
            url: item.url || null,
          }));
        }
      } catch (err) {
        console.error('[legal-assistant] RAG query failed:', err);
      }
    }

    // Synthesize structured AI Response
    let directAnswer = '';
    if ((contextMode === 'current_document' || isMachoteQuery) && activeDocument) {
      const docName = activeDocument.templateName || 'borrador actual';
      directAnswer = `Analicé tu ${docName}. ${
        consistencyProblems.length > 0
          ? `Se detectó 1 incongruencia crítica entre hechos y petitorios.`
          : missingFields.length > 0
          ? `El borrador es coherente en su estructura base, aunque cuenta con ${missingFields.length} campo(s) pendiente(s) de llenar.`
          : `El borrador se encuentra completo en sus secciones principales.`
      }`;
    } else {
      directAnswer = `He revisado tu consulta sobre la plataforma. Puedo guiarte en la redacción, análisis de jurisprudencia o revisión de plazos.`;
    }

    const responsePayload = {
      ok: true,
      contextLabel,
      answer: directAnswer,
      displayAnswer: directAnswer,
      summary: `Revisión contextual finalizada con ${issues.length} observación(es) estructurada(s).`,
      issues,
      missingFields,
      pendingFields: missingFields, // new field for pending fields
      consistencyProblems,
      citations,
      warnings: (warnings || []).filter((w: string) => {
        const lower = w.toLowerCase();
        return !lower.includes('religioso') && !lower.includes('curp');
      }),
      suggestedActions: [
        { label: 'Revisar incongruencias', type: 'review_issues' },
        { label: 'Completar campos pendientes', type: 'focus_missing' },
        { label: 'Buscar criterios aplicables SJF', type: 'search_jurisprudence' },
      ],
      technical: {
        organizationId: identity.organizationId,
        contextMode,
        issuesCount: issues.length,
      },
    };

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Error en el asistente legal.' },
      { status: 500 }
    );
  }
}
