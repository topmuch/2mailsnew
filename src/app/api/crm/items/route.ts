import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── Liste des items CRM (cache local qrtags.pro / qrbags.com) ──────────────
// GET /api/crm/items?platform=QRBAGS&status=LOST&type=BAGAGE&q=hajj

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const platform = sp.get("platform")?.toUpperCase();
    const status = sp.get("status")?.toUpperCase();
    const type = sp.get("type")?.toUpperCase();
    const q = sp.get("q")?.trim();

    const where: Record<string, unknown> = {};
    if (platform && ["QRTAGS", "QRBAGS"].includes(platform)) {
      where.platform = { name: platform };
    }
    if (status && status !== "TOUS") {
      where.status = status;
    }
    if (type && ["TAG", "BAGAGE"].includes(type)) {
      where.type = type;
    }
    if (q) {
      where.OR = [
        { code: { contains: q } },
        { externalId: { contains: q } },
        { ownerName: { contains: q } },
        { ownerPhone: { contains: q } },
      ];
    }

    const items = await db.crmItem.findMany({
      where,
      include: {
        platform: { select: { name: true, label: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 500,
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/crm/items", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
