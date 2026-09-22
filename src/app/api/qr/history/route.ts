import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/qr/history
 * Historique des recherches / générations QR : 30 dernières, triées createdAt desc.
 */
export async function GET() {
  try {
    const lookups = await db.qrLookup.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const history = lookups.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
    }));

    return NextResponse.json({ history });
  } catch (error) {
    console.error("GET /api/qr/history", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
