import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { describeMailError } from "@/lib/mail-diagnostics";
import { runMailSync } from "@/lib/mail-sync";

// ─── POST : synchronisation IMAP de la boîte de réception ───────────────────
// La logique vit dans src/lib/mail-sync.ts pour être partagée avec le
// scheduler (synchronisation automatique toutes les 2 minutes).
// Garanties : mails les plus récents d'abord, temps réel (moins de 48 h)
// hors quota quotidien, accumulation sans suppression, un seul processus à la fois.

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const setting = await db.setting.findFirst();
    if (!setting || !setting.imapHost || !setting.imapUser || !setting.imapPass) {
      return NextResponse.json(
        {
          error:
            "IMAP non configuré — renseignez les serveurs dans la configuration de la boîte mail",
        },
        { status: 400 }
      );
    }

    const result = await runMailSync();
    return NextResponse.json({
      imported: result.imported,
      backfilled: result.backfilled,
      total: result.total,
      limit: result.limit,
      importedToday: result.importedToday,
      limitReached: result.limitReached,
      message: result.message,
    });
  } catch (error) {
    console.error("POST /api/mails/sync", error);
    // Message clair en français : cause exacte (identifiants, hôte, port bloqué…)
    return NextResponse.json(
      { error: describeMailError("IMAP", error) },
      { status: 502 }
    );
  }
}
