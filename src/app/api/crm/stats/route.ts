import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ensurePlatformsSeeded } from "@/lib/crm-api";

// ─── Statistiques CRM unifié (dashboard) ────────────────────────────────────
// GET /api/crm/stats
// → compteurs globaux + par plateforme + activité récente + répartition.
// Réponse additive : tous les champs historiques sont conservés.

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    await ensurePlatformsSeeded();

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [
      platforms,
      itemsByStatus,
      itemsByPlatform,
      scansToday,
      activitiesToday,
      activationsToday,
      recentActivity,
      lastEvents,
      // Données par plateforme (dashboard unifié)
      statusesPerPlatform,
      newItemsPerPlatform,
      activityPerPlatformToday,
    ] = await Promise.all([
      db.crmPlatform.findMany({ orderBy: { name: "asc" } }),
      db.crmItem.groupBy({ by: ["status"], _count: { _all: true } }),
      db.crmItem.groupBy({ by: ["platformId"], _count: { _all: true } }),
      db.crmActivity.count({ where: { action: "SCAN", timestamp: { gte: dayStart } } }),
      db.crmActivity.count({ where: { timestamp: { gte: dayStart } } }),
      db.crmActivity.count({ where: { action: "ACTIVATION", timestamp: { gte: dayStart } } }),
      db.crmActivity.findMany({ orderBy: { timestamp: "desc" }, take: 25 }),
      db.crmActivity.findMany({
        where: { action: { in: ["ACTIVATION", "LOST", "FOUND"] } },
        orderBy: { timestamp: "desc" },
        take: 8,
      }),
      db.crmItem.groupBy({ by: ["platformId", "status"], _count: { _all: true } }),
      db.crmItem.groupBy({ by: ["platformId"], where: { createdAt: { gte: dayStart } }, _count: { _all: true } }),
      db.crmActivity.groupBy({ by: ["platform"], where: { timestamp: { gte: dayStart } }, _count: { _all: true } }),
    ]);

    const platformMap = new Map(platforms.map((p) => [p.id, p]));
    const itemCounts = new Map(itemsByPlatform.map((r) => [r.platformId, r._count._all]));
    const newItemsCounts = new Map(newItemsPerPlatform.map((r) => [r.platformId, r._count._all]));
    const activityCountsToday = new Map(activityPerPlatformToday.map((r) => [r.platform, r._count._all]));

    // Statuts détaillés par plateforme
    const statusMapPerPlatform = new Map<string, Record<string, number>>();
    for (const row of statusesPerPlatform) {
      const entry = statusMapPerPlatform.get(row.platformId) ?? {};
      entry[row.status] = row._count._all;
      statusMapPerPlatform.set(row.platformId, entry);
    }

    // ─── Stats par plateforme (activations / scans / retrouvés / revenu) ────
    const platformStats = platforms.map((p) => {
      const statuses = statusMapPerPlatform.get(p.id) ?? {};
      const newItemsToday = newItemsCounts.get(p.id) ?? 0;
      const found = statuses.FOUND ?? 0;
      const lost = statuses.LOST ?? 0;
      return {
        id: p.id,
        name: p.name,
        label: p.label,
        isActive: p.isActive,
        lastSyncAt: p.lastSyncAt,
        items: itemCounts.get(p.id) ?? 0,
        activationsToday: 0, // calculé ci-dessous depuis les activités
        scansToday: 0, // calculé ci-dessous depuis les activités
        newItemsToday, // ≈ packs vendus aujourd'hui
        found,
        lost,
        successRate: found + lost > 0 ? Math.round((found / (found + lost)) * 100) : null,
        estimatedPackPrice: p.estimatedPackPrice,
        estimatedRevenue: newItemsToday * p.estimatedPackPrice,
        activitiesToday: activityCountsToday.get(p.name) ?? 0,
      };
    });

    // Activations / scans du jour par plateforme (depuis les ActivityLog)
    const [activationsByPlatform, scansByPlatform] = await Promise.all([
      db.crmActivity.groupBy({ by: ["platform"], where: { action: "ACTIVATION", timestamp: { gte: dayStart } }, _count: { _all: true } }),
      db.crmActivity.groupBy({ by: ["platform"], where: { action: "SCAN", timestamp: { gte: dayStart } }, _count: { _all: true } }),
    ]);
    const actMap = new Map(activationsByPlatform.map((r) => [r.platform, r._count._all]));
    const scanMap = new Map(scansByPlatform.map((r) => [r.platform, r._count._all]));
    for (const s of platformStats) {
      s.activationsToday = actMap.get(s.name) ?? 0;
      s.scansToday = scanMap.get(s.name) ?? 0;
    }

    // ─── Répartition QRTAGS / QRBAGS / VERIFSCAN (camembert) ────────────────
    const pieData = platformStats.map((s) => ({ name: s.name, label: s.label || s.name, value: s.activitiesToday }));

    const totalFound = itemsByStatus.find((r) => r.status === "FOUND")?._count._all ?? 0;
    const totalLost = itemsByStatus.find((r) => r.status === "LOST")?._count._all ?? 0;

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
        activationsToday,
        found: totalFound,
        lost: totalLost,
        successRate: totalFound + totalLost > 0 ? Math.round((totalFound / (totalFound + totalLost)) * 100) : null,
        estimatedRevenue: platformStats.reduce((acc, s) => acc + s.estimatedRevenue, 0),
        newItemsToday: platformStats.reduce((acc, s) => acc + s.newItemsToday, 0),
      },
      platformStats,
      pieData,
      recentActivity,
      lastEvents,
    });
  } catch (error) {
    console.error("GET /api/crm/stats", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
