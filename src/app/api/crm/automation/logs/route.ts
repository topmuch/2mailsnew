import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── GET : historique des envois automatiques ────────────────────────────────

const TYPES = ["REPORT_MORNING", "REPORT_EVENING", "COACH", "REMINDER", "TEST"] as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 200);

    const where: { type?: string } = {};
    if ((TYPES as readonly string[]).includes(type)) where.type = type;

    const logs = await db.crmSentMessage.findMany({
      where,
      orderBy: { sentAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("GET /api/crm/automation/logs", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
