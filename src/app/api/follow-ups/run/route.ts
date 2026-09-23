import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { runAutomaticFollowups } from "@/lib/crm-followups";

// ─── Déclencheur manuel des relances automatiques (admin) ────────────────────
// POST /api/follow-ups/run → force la vérification (ignore la garde quotidienne
// pour permettre le test ; l'idempotence par tâche reste garantie).

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
    }
    const result = await runAutomaticFollowups(new Date(), true);
    return NextResponse.json({
      ok: true,
      created: result.created,
      checked: result.checked,
      message: result.created.length
        ? `${result.created.length} tâche(s) de relance créée(s)`
        : "Aucune nouvelle relance nécessaire",
    });
  } catch (err) {
    console.error("[follow-ups/run]", err);
    return NextResponse.json({ error: "Exécution impossible" }, { status: 500 });
  }
}
