import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { testImapConnection, testSmtpConnection } from "@/lib/mail-diagnostics";

/**
 * POST /api/mail-settings/test
 * Teste en direct les connexions IMAP (réception) et SMTP (envoi) enregistrées
 * dans les paramètres et renvoie un diagnostic détaillé par protocole.
 * Réservé à l'administrateur.
 */
export async function POST(_request: NextRequest) {
  try {
    const user = await getAuthUser(_request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Accès réservé à l'administrateur" }, { status: 403 });
    }

    const setting = await db.setting.findFirst();

    const [imap, smtp] = await Promise.all([
      testImapConnection({
        host: setting?.imapHost ?? "",
        port: setting?.imapPort ?? 993,
        user: setting?.imapUser ?? "",
        pass: setting?.imapPass ?? "",
      }),
      testSmtpConnection({
        host: setting?.smtpHost ?? "",
        port: setting?.smtpPort ?? 587,
        user: setting?.smtpUser ?? "",
        pass: setting?.smtpPass ?? "",
        secure: setting?.smtpSecure ?? false,
      }),
    ]);

    return NextResponse.json({ imap, smtp });
  } catch (error) {
    console.error("POST /api/mail-settings/test", error);
    return NextResponse.json({ error: "Erreur serveur lors du test" }, { status: 500 });
  }
}
