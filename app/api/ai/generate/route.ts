import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, extractIp } from "@/lib/security/rateLimit";
import { runDeepReviewMode, runFastMode } from "@/lib/ai/orchestrator";
import { requireCaseAccess } from "@/lib/cases/access";
import { isDemoModeEnabled } from "@/lib/security/lawyerAuth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const access = await requireCaseAccess(req);
    let identity: { organizationId: string; userId: string };
    if (access.ok) {
      identity = { organizationId: access.context.organizationId, userId: access.context.userId };
    } else {
      if (!isDemoModeEnabled()) return access.response;
      identity = { organizationId: "org-demo-legal", userId: "user-demo-legal" };
    }

    const ip = extractIp(req);
    const rateLimitResult = checkRateLimit(ip, 30);
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { ok: false, error: "rate_limit", friendlyMessage: "Demasiadas solicitudes. Por favor intente más tarde." },
        { status: 429 }
      );
    }

    const payload = await req.json().catch(() => ({}));
    const {
      message = "",
      mode = "fast",
      taskType = "general",
      contextMode = "none",
      activeDocument,
      activeCase,
      activeBulletin,
      retrievedSources = [],
    } = payload;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { ok: false, error: "invalid_message", friendlyMessage: "El mensaje es obligatorio." },
        { status: 400 }
      );
    }

    const legalContext = {
      ...(activeDocument || {}),
      ...(activeCase ? { activeCase } : {}),
      ...(activeBulletin ? { activeBulletin } : {}),
      ...(payload.pageContext ? { pageContext: payload.pageContext } : {}),
    };

    if (mode === "deep") {
      const deepResult = await runDeepReviewMode({
        userMessage: message,
        mode: "deep",
        taskType,
        legalContext,
        retrievedSources,
      });

      return NextResponse.json({
        ok: true,
        mode: "deep",
        data: deepResult,
        technical: {
          organizationId: identity.organizationId,
          userId: identity.userId,
        },
      });
    }

    const fastResult = await runFastMode({
      userMessage: message,
      mode: "fast",
      taskType,
      legalContext,
      retrievedSources,
    });

    return NextResponse.json({
      ok: true,
      mode: "fast",
      data: fastResult,
      technical: {
        organizationId: identity.organizationId,
        userId: identity.userId,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Error al procesar la solicitud de IA." },
      { status: 500 }
    );
  }
}
