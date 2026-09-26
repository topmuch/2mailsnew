import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// ─── Historique des renouvellements d'un domaine (Task 49) ───────────────────
// GET → liste HostingRenewal du domaine, la plus récente d'abord
//       (période couverte « 2026-2027 », montant FCFA, méthode, date).

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    const domain = await db.hostingDomain.findUnique({ where: { id }, select: { id: true } });
    if (!domain) return NextResponse.json({ error: "Domaine introuvable" }, { status: 404 });
    const renewals = await db.hostingRenewal.findMany({
      where: { domainId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ renewals });
  } catch {
    return NextResponse.json({ error: "Chargement impossible" }, { status: 500 });
  }
}
