import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { runManualTest } from "@/lib/crm-automation";

// ─── POST : test manuel des automatisations (admin) ──────────────────────────
// Envoi immédiat du contenu réel avec des clés -TEST-<timestamp> : un test ne
// consomme jamais le rappel / l'envoi automatique réel du jour.

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const kind = typeof body?.kind === "string" ? body.kind : "";
    if (!kind) return NextResponse.json({ error: "Type de test manquant" }, { status: 400 });

    const result = await runManualTest(kind, new Date());
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "Échec du test" }, { status: 200 });
    }
    return NextResponse.json({ ok: true, preview: result.preview });
  } catch (error) {
    console.error("POST /api/crm/automation/test", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
