import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ensurePlatformsSeeded } from "@/lib/crm-api";

// ─── Statistiques CRM unifié (dashboard) ────────────────────────────────────
// GET /api/crm/stats → compteurs par plateforme/statut + activité récente

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    await ensurePlatformsSeeded();

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [platforms, itemsByStatus, itemsByPlatform, scansToday, activitiesToday, recentActivity, lastEvents] =
      await Promise.all([
        db.crmPlatform.findMany({ orderBy: { name: "asc" } }),
        db.crmItem.groupBy({ by: ["status"], _count: { _all: true } }),
        db.crmItem.groupBy({ by: ["platformId"], _count: { _all: true } }),
        db.crmActivity.count({ where: { action: "SCAN", timestamp: { gte: dayStart } } }),
        db.crmActivity.count({ where: { timestamp: { gte: dayStart } } }),
        db.crmActivity.findMany({ orderBy: { timestamp: "desc" }, take: 25 }),
        db.crmActivity.findMany({
          where: { action: { in: ["ACTIVATION", "LOST", "FOUND"] } },
          orderBy: { timestamp: "desc" },
          take: 8,
        }),
      ]);

    const platformMap = new Map(platforms.map((p) => [p.id, p]));
    const itemCounts = new Map(itemsByPlatform.map((r) => [r.platformId, r._count._all]));

    return NextResponse.json({
      platforms: platforms.map((p) => ({
        id: p.id,
        name: p.name,
        label: p.label,
        apiUrl: p.apiUrl,
        isActive: p.isActive,
        lastSyncAt: p.lastSyncAt,
        itemCount: itemCounts.get(p.id) ?? 0,
        hasApiKey: Boolean(p.apiKey),
      })),
      byStatus: Object.fromEntries(itemsByStatus.map((r) => [r.status, r._count._all])),
      totals: {
        items: itemsByStatus.reduce((acc, r) => acc + r._count._all, 0),
        scansToday,
        activitiesToday,
      },
      recentActivity,
      lastEvents,
    });
  } catch (error) {
    console.error("GET /api/crm/stats", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
