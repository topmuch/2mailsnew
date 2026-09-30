import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── Flux d'activité CRM (temps quasi réel via polling) ─────────────────────
// GET /api/crm/activity?limit=50&platform=QRBAGS&action=LOST

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const limitParam = Number(sp.get("limit"));
    const limit = Number.isInteger(limitParam) && limitParam > 0 && limitParam <= 200 ? limitParam : 50;
    const platform = sp.get("platform")?.toUpperCase();
    const action = sp.get("action")?.toUpperCase();

    const where: Record<string, unknown> = {};
    if (platform && ["QRTAGS", "QRBAGS", "VERIFSCAN"].includes(platform)) where.platform = platform;
    if (action) where.action = action;

    const activities = await db.crmActivity.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    const itemIds = activities.map((a) => a.itemId).filter((x): x is string => Boolean(x));
    const items = itemIds.length
      ? await db.crmItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, code: true, externalId: true, status: true, type: true },
        })
      : [];
    const itemMap = new Map(items.map((i) => [i.id, i]));

    return NextResponse.json(
      activities.map((a) => ({
        id: a.id,
        platform: a.platform,
        action: a.action,
        details: a.details,
        timestamp: a.timestamp,
        item: a.itemId ? itemMap.get(a.itemId) ?? null : null,
      }))
    );
  } catch (error) {
    console.error("GET /api/crm/activity", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
